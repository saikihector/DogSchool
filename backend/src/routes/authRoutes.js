const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const pool = require('../db/pool');

const router = express.Router();

const limitarTentativasLogin = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Limite de 5 tentativas
    standardHeaders: true, // Retorna informações de limite de taxa nos cabeçalhos `RateLimit-*`
    legacyHeaders: false, // Desativa os cabeçalhos `X-RateLimit-*`
    message: 'Muitas tentativas de login. Por favor, tente novamente mais tarde.'
});

// Verifica os dígitos do CPF sem depender apenas da validação do navegador.
function cpfValido(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let tamanho = 9; tamanho <= 10; tamanho++) {
        let soma = 0;
        for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
        if (((soma * 10) % 11) % 10 !== Number(cpf[tamanho])) return false;
    }
    return true;
}

const limitarCadastros = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { mensagem: 'Muitos cadastros. Tente novamente mais tarde.' },
});

router.post('/register', limitarCadastros, async (req, res, next) => {
    const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const cpf = typeof req.body?.cpf === 'string' ? req.body.cpf.replace(/\D/g, '') : '';
    const senha = req.body?.senha;

    if (!nome || nome.length > 255) {
        return res.status(400).json({ campo: 'nome', mensagem: 'Informe um nome válido.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
        return res.status(400).json({ campo: 'email', mensagem: 'Informe um e-mail válido.' });
    }
    if (!cpfValido(cpf)) {
        return res.status(400).json({ campo: 'cpf', mensagem: 'CPF inválido.' });
    }
    if (typeof senha !== 'string' || senha.length < 8 || Buffer.byteLength(senha, 'utf8') > 72) {
        return res.status(400).json({ campo: 'senha', mensagem: 'Use uma senha de pelo menos 8 caracteres (máximo de 72 bytes).' });
    }
    if (req.body?.termosAceitos !== true) {
        return res.status(400).json({ mensagem: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.' });
    }

    try {
        const senhaHash = await bcrypt.hash(senha, 12);
        await pool.query(
            `INSERT INTO candidato (nome_completo, email, cpf, senha_hash)
             VALUES ($1, $2, $3, $4)`,
            [nome, email, cpf, senhaHash]
        );
        return res.status(201).json({ mensagem: 'Cadastro realizado com sucesso! Faça login.' });
    } catch (error) {
        if (error.code === '23505') {
            const campo = error.constraint?.includes('cpf') ? 'cpf'
                : error.constraint?.includes('email') ? 'email' : null;
            return res.status(409).json({
                campo,
                mensagem: campo === 'cpf' ? 'Este CPF já está cadastrado!'
                    : campo === 'email' ? 'Este e-mail já está cadastrado!'
                    : 'Já existe um cadastro com esses dados.',
            });
        }
        return next(error);
    }
});

router.post('/login', limitarTentativasLogin, async (req, res, next) => {
    try {
        const cpf = typeof req.body?.cpf === 'string'
          ? req.body.cpf.replace(/[^0-9]/g, '')
          : '';
        const senha = req.body?.senha;
        

        if (!/^\d{11}$/.test(cpf) || typeof senha !== 'string' || senha.length === 0) {
            return res.status(400).json({ mensagem: 'CPF ou senha inválidos' });
        }

        const consulta = await pool.query(
            `SELECT id_candidato, nome_completo, senha_hash
            FROM candidato
            WHERE cpf = $1`,
            [cpf]
        );

        const candidato = consulta.rows[0];

        if (!candidato || !(await bcrypt.compare(senha, candidato.senha_hash))) {
            return res.status(401).json({ mensagem: 'CPF ou senha inválidos' });
        }

        await new Promise((resolve, reject) => {
            req.session.regenerate((error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        req.session.candidato = {
            id: candidato.id_candidato,
            nome: candidato.nome_completo
        };

        await new Promise((resolve, reject) => {
            req.session.save((error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        return res.json({
            usuario: {
                id: candidato.id_candidato,
                nome: candidato.nome_completo
            },
        });
    } catch (error) {
        next(error);
    }
});

// Mantem a sessao publica minima (id/nome), sem expor CPF/email ao cache visual.
router.get('/me', (req, res) => {
    if (!req.session?.candidato) {
        return res.status(401).json({ mensagem: 'Não autorizado' });
    }
    return res.json({ usuario: req.session.candidato });
});

// Dados completos do perfil: somente do candidato autenticado.
router.get('/profile', async (req, res, next) => {
    if (!req.session?.candidato) {
        return res.status(401).json({ mensagem: 'Não autorizado' });
    }
    try {
        const consulta = await pool.query(
            `SELECT id_candidato, nome_completo, cpf, email
             FROM candidato WHERE id_candidato = $1`,
            [req.session.candidato.id]
        );
        if (!consulta.rowCount) {
            return res.status(401).json({ mensagem: 'Usuário não encontrado.' });
        }
        const c = consulta.rows[0];
        return res.json({ usuario: {
            id: c.id_candidato,
            nome: c.nome_completo,
            cpf: c.cpf.trim(),
            email: c.email,
        }});
    } catch (error) {
        return next(error);
    }
});

// Atualiza o perfil de verdade no banco (não somente no localStorage).
router.patch('/profile', async (req, res, next) => {
    if (!req.session?.candidato) {
        return res.status(401).json({ mensagem: 'Não autorizado' });
    }

    const nome = typeof req.body?.nome === 'string'
        ? req.body.nome.trim().replace(/\s+/g, ' ') : '';
    const email = typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase() : '';
    if (nome.length < 3 || nome.length > 255) {
        return res.status(400).json({ campo: 'nome', mensagem: 'Informe um nome válido.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
        return res.status(400).json({ campo: 'email', mensagem: 'Informe um e-mail válido.' });
    }

    try {
        const consulta = await pool.query(
            `UPDATE candidato SET nome_completo = $1, email = $2
             WHERE id_candidato = $3
             RETURNING id_candidato, nome_completo, cpf, email`,
            [nome, email, req.session.candidato.id]
        );
        if (!consulta.rowCount) {
            return res.status(401).json({ mensagem: 'Usuário não encontrado.' });
        }
        const c = consulta.rows[0];
        req.session.candidato.nome = c.nome_completo;
        await new Promise((resolve, reject) => {
            req.session.save(error => error ? reject(error) : resolve());
        });
        return res.json({ usuario: {
            id: c.id_candidato,
            nome: c.nome_completo,
            cpf: c.cpf.trim(),
            email: c.email,
        }});
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ campo: 'email', mensagem: 'Este e-mail já está cadastrado.' });
        }
        return next(error);
    }
});

router.post('/logout', (req, res, next) => {
    req.session.destroy((error) => {
        if (error) return next(error);

        res.clearCookie('portal.sid', {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.COOKIE_SECURE
                ? process.env.COOKIE_SECURE === 'true'
                : process.env.NODE_ENV === 'production',
            path: '/',
        });

        return res.status(204).end();
    });
});

module.exports = router;
