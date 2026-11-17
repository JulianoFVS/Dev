'use strict';

const fs = require('node:fs');
const path = require('node:path');
const caminhos = require('./caminhos.cjs');

/**
 * Log simples, em arquivo + console. O processo principal não tem Terminal
 * na máquina da clínica, então tudo que importa vai para
 * userData/logs/ortus.log (rotacionado em 2 MB, mantendo 1 backup).
 */

let arquivo = null;
let tamanho = 0;
const LIMITE = 2 * 1024 * 1024;

function abrir(app) {
  arquivo = path.join(caminhos.logs(app), 'ortus.log');
  try {
    tamanho = fs.statSync(arquivo).size;
  } catch {
    tamanho = 0;
  }
}

function rotacionar() {
  try {
    const backup = `${arquivo}.1`;
    if (fs.existsSync(arquivo)) {
      if (fs.existsSync(backup)) fs.unlinkSync(backup);
      fs.renameSync(arquivo, backup);
    }
    tamanho = 0;
  } catch {
    /* se falhar, seguimos escrevendo no mesmo arquivo */
  }
}

function escrever(nivel, args) {
  const texto = args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');

  const linha = `${new Date().toISOString()} [${nivel}] ${texto}`;
  if (nivel === 'erro') console.error(linha);
  else console.log(linha);

  if (!arquivo) return;
  try {
    if (tamanho > LIMITE) rotacionar();
    fs.appendFileSync(arquivo, `${linha}\n`);
    tamanho += Buffer.byteLength(linha) + 1;
  } catch {
    /* nunca deixar o log derrubar o app */
  }
}

const log = {
  abrir,
  info: (...args) => escrever('info', args),
  aviso: (...args) => escrever('aviso', args),
  erro: (...args) => escrever('erro', args),
};

module.exports = log;
