'use strict';

// AES-256-GCM para confidencialidade/autenticidade e HMAC-SHA-256 para buscas exatas.
// As duas chaves têm de ser diferentes e nunca devem ser salvas no repositório.
const { randomBytes, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } = require('node:crypto');

function obterChave(nome) {
  const valor = process.env[nome];
  if (!valor || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) {
    throw new Error(`Variável ${nome} ausente ou inválida: exige 32 bytes em Base64.`);
  }
  const chave = Buffer.from(valor, 'base64');
  if (chave.length !== 32 || chave.toString('base64') !== valor) {
    throw new Error(`Variável ${nome} não contém uma chave Base64 válida de 32 bytes.`);
  }
  return chave;
}

function validarChaves() {
  const criptografia = obterChave('DATA_ENCRYPTION_KEY');
  const busca = obterChave('DATA_LOOKUP_KEY');
  if (timingSafeEqual(criptografia, busca)) {
    throw new Error('DATA_ENCRYPTION_KEY e DATA_LOOKUP_KEY devem ser diferentes.');
  }
}

function normalizar(tipo, valor) {
  if (typeof valor !== 'string') throw new TypeError('O dado precisa ser uma string.');
  if (tipo === 'cpf') {
    const cpf = valor.replace(/\D/g, '');
    if (!/^\d{11}$/.test(cpf)) throw new Error('CPF inválido para proteção.');
    return cpf;
  }
  if (tipo === 'email') {
    const email = valor.trim().toLowerCase();
    if (!email || email.length > 255) throw new Error('E-mail inválido para proteção.');
    return email;
  }
  throw new Error('Campo não suportado.');
}

function criptografar(tipo, valor) {
  const texto = normalizar(tipo, valor);
  const chave = obterChave('DATA_ENCRYPTION_KEY');
  const iv = randomBytes(12); // nonce aleatório de 96 bits para GCM
  const cipher = createCipheriv('aes-256-gcm', chave, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(`dogschool:v1:${tipo}`, 'utf8'));
  const conteudo = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${conteudo.toString('base64url')}`;
}

function descriptografar(tipo, valor) {
  if (typeof valor !== 'string') throw new TypeError('Valor criptografado inválido.');
  const partes = valor.split('.');
  if (partes.length !== 4 || partes[0] !== 'v1') throw new Error('Formato criptografado não suportado.');
  const iv = Buffer.from(partes[1], 'base64url');
  const tag = Buffer.from(partes[2], 'base64url');
  const conteudo = Buffer.from(partes[3], 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || !partes.slice(1).every(s => /^[A-Za-z0-9_-]+$/.test(s))) {
    throw new Error('Formato criptografado inválido.');
  }
  const decipher = createDecipheriv('aes-256-gcm', obterChave('DATA_ENCRYPTION_KEY'), iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(`dogschool:v1:${tipo}`, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(conteudo), decipher.final()]).toString('utf8');
}

function indiceBusca(tipo, valor) {
  return createHmac('sha256', obterChave('DATA_LOOKUP_KEY'))
    .update(`dogschool:v1:${tipo}:`, 'utf8')
    .update(normalizar(tipo, valor), 'utf8')
    .digest('hex');
}

module.exports = { validarChaves, normalizar, criptografar, descriptografar, indiceBusca };
