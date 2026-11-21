'use strict';
// Migra CPF/e-mail existentes sem imprimir valores pessoais.
// Necessita 006 aplicada e as MESMAS chaves do Render. Não grava dados em arquivos.
require('dotenv').config();
const { Client } = require('pg');
const { validarChaves, criptografar, descriptografar, indiceBusca, normalizar } = require('../services/protecaoDadosPessoais');

function criarCliente() {
  if (process.env.RENDER_DB_URL) {
    const url = new URL(process.env.RENDER_DB_URL);
    // TLS certificado verificado; não desativar rejectUnauthorized.
    url.searchParams.delete('sslmode');
    return new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: true } });
  }
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
}

async function main() {
  validarChaves();
  const client = criarCliente();
  await client.connect();
  try {
    await client.query('BEGIN');
    // Bloqueia cadastros e edição de perfil durante esta migração curta.
    await client.query('LOCK TABLE candidato IN SHARE ROW EXCLUSIVE MODE');
    const resultado = await client.query(
      'SELECT id_candidato, cpf, email, cpf_cifrado, email_cifrado, cpf_indice, email_indice FROM candidato ORDER BY id_candidato'
    );
    let alterados = 0;
    for (const c of resultado.rows) {
      if (c.cpf_cifrado && c.email_cifrado && c.cpf_indice && c.email_indice) {
        // Reexecutar sem a chave correta deve falhar, nunca apagar dados.
        const cpf = descriptografar('cpf', c.cpf_cifrado);
        const email = descriptografar('email', c.email_cifrado);
        if (indiceBusca('cpf', cpf) !== c.cpf_indice.trim() || indiceBusca('email', email) !== c.email_indice.trim()) {
          throw new Error('Uma conta existente usa chaves incompatíveis. Migração cancelada.');
        }
        continue;
      }
      if (!c.cpf || !c.email) throw new Error('Há uma conta sem dados originais; migração cancelada.');
      const cpf = normalizar('cpf', c.cpf.trim());
      const email = normalizar('email', c.email);
      await client.query(
        `UPDATE candidato SET cpf_cifrado=$1, email_cifrado=$2, cpf_indice=$3, email_indice=$4
         WHERE id_candidato=$5`,
        [criptografar('cpf', cpf), criptografar('email', email),
          indiceBusca('cpf', cpf), indiceBusca('email', email), c.id_candidato]
      );
      alterados++;
    }
    await client.query('COMMIT');
    console.log(`Migração concluída: ${alterados} registros atualizados; ${resultado.rowCount} registros conferidos.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('Migração não concluída:', error.message);
  process.exitCode = 1;
});
