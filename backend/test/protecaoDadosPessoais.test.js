'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const anteriorEnc = process.env.DATA_ENCRYPTION_KEY;
const anteriorBusca = process.env.DATA_LOOKUP_KEY;
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.DATA_LOOKUP_KEY = randomBytes(32).toString('base64');
after(() => {
  if (anteriorEnc === undefined) delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY = anteriorEnc;
  if (anteriorBusca === undefined) delete process.env.DATA_LOOKUP_KEY;
  else process.env.DATA_LOOKUP_KEY = anteriorBusca;
});
const { validarChaves, criptografar, descriptografar, indiceBusca } = require('../src/services/protecaoDadosPessoais');
test('as chaves têm 32 bytes e são distintas', () => assert.doesNotThrow(validarChaves));
test('criptografa CPF e email e recupera conteúdo original', () => {
  for (const [campo, valor] of [['cpf', '123.456.789-09'], ['email', '  EXEMPLO@TESTE.COM  ']]) {
    const a = criptografar(campo, valor);
    const b = criptografar(campo, valor);
    assert.notEqual(a, b);
    assert.equal(descriptografar(campo, a), campo === 'cpf' ? '12345678909' : 'exemplo@teste.com');
    assert.equal(indiceBusca(campo, valor), indiceBusca(campo, valor));
    assert.ok(!a.includes(valor));
  }
});
test('os índices são determinísticos e específicos por tipo de dado', () => {
  assert.equal(indiceBusca('email', 'Foo@Example.com'), indiceBusca('email', 'foo@example.com'));
  assert.notEqual(indiceBusca('cpf', '12345678909'), indiceBusca('email', '12345678909'));
});
test('detecta adulteração e troca de campo', () => {
  const original = criptografar('email', 'foo@example.com');
  assert.throws(() => descriptografar('cpf', original));
  const p = original.split('.');
  p[2] = p[2][0] === 'A' ? 'B' + p[2].slice(1) : 'A' + p[2].slice(1);
  assert.throws(() => descriptografar('email', p.join('.')));
});
