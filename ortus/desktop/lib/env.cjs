'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Em desenvolvimento o Electron não carrega `.env.local` sozinho (quem faz
 * isso é o Next). Lemos o arquivo se ele existir e só preenchemos o que ainda
 * não veio do ambiente — em produção não existe `.env.local`, então isto é
 * inofensivo.
 */
function carregar(raiz = path.join(__dirname, '..', '..')) {
  const arquivo = path.join(raiz, '.env.local');
  if (!fs.existsSync(arquivo)) return 0;

  let aplicadas = 0;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) continue;
    const igual = texto.indexOf('=');
    if (igual <= 0) continue;
    const chave = texto.slice(0, igual).trim();
    if (!/^[A-Z0-9_]+$/.test(chave) || process.env[chave]) continue;
    let valor = texto.slice(igual + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    process.env[chave] = valor;
    aplicadas += 1;
  }
  return aplicadas;
}

module.exports = { carregar };
