'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const caminhos = require('./caminhos.cjs');
const log = require('./log.cjs');

/**
 * Segredos internos do programa, gerados na primeira execução e guardados em
 * `userData/segredos.json` (fora do .exe, fora do repositório).
 *
 *  - `db`       protege a API de dados local (Electron ⇄ Next).
 *  - `whatsapp` protege o gateway do WWebJS (Next ⇄ servidor do WhatsApp).
 *
 * Nenhum deles vai para o renderer nem para a rede da clínica: seguem só por
 * variável de ambiente para os processos filhos (Next local e WhatsApp).
 *
 * O segredo da prova de janela não mora aqui: ele nasce a cada execução, em
 * `main.cjs`, e nunca é gravado em disco.
 */

let cache = null;

/** 32 bytes aleatórios, em hexadecimal (64 caracteres). */
function gerar() {
  return crypto.randomBytes(32).toString('hex');
}

/** Só aceita o formato que `gerar()` produz; qualquer outra coisa é trocada. */
function valido(segredo) {
  return /^[0-9a-f]{64}$/.test(String(segredo || ''));
}

function ler(app) {
  if (cache) return cache;
  const arquivo = caminhos.segredos(app);
  try {
    const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    cache = {
      db: String(bruto.db || ''),
      whatsapp: String(bruto.whatsapp || ''),
      instalacaoId: String(bruto.instalacaoId || ''),
    };
  } catch {
    cache = { db: '', whatsapp: '', instalacaoId: '' };
  }

  let mudou = false;
  if (!valido(cache.db)) {
    cache.db = gerar();
    mudou = true;
  }
  if (!valido(cache.whatsapp)) {
    cache.whatsapp = gerar();
    mudou = true;
  }
  if (!cache.instalacaoId) {
    cache.instalacaoId = crypto.randomUUID();
    mudou = true;
  }

  if (mudou) gravar(app, cache);
  return cache;
}

function gravar(app, dados) {
  const arquivo = caminhos.segredos(app);
  const temporario = `${arquivo}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(dados, null, 2), { mode: 0o600 });
  fs.renameSync(temporario, arquivo);
  try {
    fs.chmodSync(arquivo, 0o600);
  } catch {
    /* Windows não usa permissão POSIX */
  }
  cache = dados;
  log.info('segredos: gravados em', arquivo);
}

/** Regenera os segredos (usado pelo menu "Reconectar" quando algo fica preso). */
function regenerar(app) {
  const dados = { db: gerar(), whatsapp: gerar(), instalacaoId: cache?.instalacaoId || crypto.randomUUID() };
  gravar(app, dados);
  return dados;
}

module.exports = { ler, regenerar, gravar };
