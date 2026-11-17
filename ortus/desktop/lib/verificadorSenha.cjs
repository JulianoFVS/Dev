'use strict';

const { scryptSync, randomBytes, timingSafeEqual } = require('node:crypto');

const PARAMS = { N: 16384, r: 8, p: 1 };
const TAMANHO = 32;

function emailDe(email) {
  return String(email || '').trim().toLowerCase();
}

function criarVerificadorSenha(email, senha) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(senha), salt, TAMANHO, PARAMS).toString('hex');
  return { email: emailDe(email), salt, hash };
}

function conferirVerificadorSenha(verificador, email, senha) {
  if (!verificador?.salt || !verificador.hash) return false;
  if (verificador.email !== emailDe(email)) return false;
  const calculado = scryptSync(String(senha), verificador.salt, TAMANHO, PARAMS);
  let salvo;
  try {
    salvo = Buffer.from(verificador.hash, 'hex');
  } catch {
    return false;
  }
  if (salvo.length !== calculado.length) return false;
  return timingSafeEqual(salvo, calculado);
}

module.exports = { criarVerificadorSenha, conferirVerificadorSenha };
