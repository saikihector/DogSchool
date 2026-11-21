// Recuperação de senha por link de uso único (sem revelar se o e-mail existe).
// Token de 256 bits: somente SHA-256 fica no PostgreSQL.
const express = require('express');
const bcrypt = require('bcryptjs');
const { randomBytes, createHash } = require('node:crypto');
const { rateLimit } = require('express-rate-limit');
const pool = require('../db/pool');
const { enviarRecuperacao } = require('../services/emailRecuperacao');

const router = express.Router();
const respostaGenerica = 'Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.';
const soEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const limitarPedidos = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { mensagem: 'Muitas solicitações. Tente novamente mais tarde.' },
});
const limitarRedefinicoes = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { mensagem: 'Muitas tentativas. Tente novamente mais tarde.' },
});
function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

router.post('/forgot-password', limitarPedidos, async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!soEmail.test(email) || email.length > 255) {
    return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
  }

  try {
    const result = await pool.query('SELECT id_candidato FROM candidato WHERE email = $1', [email]);
    const candidato = result.rows[0];
    if (!candidato) return res.json({ mensagem: respostaGenerica });

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    // Limite por conta: no máximo um novo link por minuto.
    // Esse UPSERT também invalida o link anterior quando um novo é emitido.
    const salvo = await pool.query(`
      INSERT INTO recuperacao_senha (id_candidato, token_hash, expira_em, criado_em)
      VALUES ($1, $2, NOW() + INTERVAL '15 minutes', NOW())
      ON CONFLICT (id_candidato) DO UPDATE
        SET token_hash = EXCLUDED.token_hash,
            expira_em = EXCLUDED.expira_em,
            criado_em = EXCLUDED.criado_em
      WHERE recuperacao_senha.criado_em <= NOW() - INTERVAL '60 seconds'
      RETURNING id_candidato
    `, [candidato.id_candidato, tokenHash]);

    if (salvo.rowCount) {
      try {
        const base = process.env.PUBLIC_BASE_URL || 'http://localhost:8080';
        const url = new URL('/redefinir-senha.html', base);
        url.searchParams.set('token', token);
        await enviarRecuperacao(email, url.toString());
      } catch (erro) {
        // Retira o token criado, para não deixar um link válido que não foi enviado.
        await pool.query(
          'DELETE FROM recuperacao_senha WHERE id_candidato = $1 AND token_hash = $2',
          [candidato.id_candidato, tokenHash]
        );
        console.error('Não foi possível enviar e-mail de recuperação:', erro.message);
        // Resposta genérica evita descobrir se um e-mail pertence a uma conta.
      }
    }
    return res.json({ mensagem: respostaGenerica });
  } catch (error) {
    return next(error);
  }
});

router.post('/reset-password', limitarRedefinicoes, async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const token = req.body?.token;
  const senha = req.body?.senha;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return res.status(400).json({ mensagem: 'Link inválido ou expirado.' });
  }
  if (typeof senha !== 'string' || senha.length < 8 || Buffer.byteLength(senha, 'utf8') > 72) {
    return res.status(400).json({ mensagem: 'A nova senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.' });
  }

  const client = await pool.connect();
  try {
    // Hash antes da transação para evitar bloquear a linha durante o bcrypt.
    const novoHash = await bcrypt.hash(senha, 12);
    await client.query('BEGIN');
    const encontrado = await client.query(`
      SELECT id_candidato FROM recuperacao_senha
      WHERE token_hash = $1 AND expira_em > NOW()
      FOR UPDATE
    `, [hashToken(token)]);
    if (!encontrado.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ mensagem: 'Link inválido ou expirado. Solicite outro.' });
    }
    const id = encontrado.rows[0].id_candidato;
    await client.query('UPDATE candidato SET senha_hash = $1 WHERE id_candidato = $2', [novoHash, id]);
    await client.query('DELETE FROM recuperacao_senha WHERE id_candidato = $1', [id]);
    // Derruba sessões antigas para que o acesso exija a senha nova.
    await client.query(`DELETE FROM "session" WHERE sess->'candidato'->>'id' = $1`, [String(id)]);
    await client.query('COMMIT');
    return res.json({ mensagem: 'Senha atualizada. Faça login com a nova senha.' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
