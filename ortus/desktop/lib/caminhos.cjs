'use strict';

const path = require('node:path');
const fs = require('node:fs');

/**
 * Todos os dados do programa vivem em `app.getPath('userData')` para
 * sobreviverem a atualização do .exe:
 *
 *   ortus.db              banco local (SQLite)
 *   arquivos/             fotos, documentos e mídia do WhatsApp
 *   wwebjs/<clinica_id>/  sessão LocalAuth por clínica
 *   segredos.json         segredos internos gerados na instalação
 *   sessao.json           sessão do Supabase em cache (login offline)
 *   logs/                 log rotativo do processo principal
 */

let raizCache = null;

function raiz(app) {
  if (raizCache) return raizCache;
  raizCache = app.getPath('userData');
  return raizCache;
}

function caminho(app, ...partes) {
  return path.join(raiz(app), ...partes);
}

function garantirPasta(destino) {
  fs.mkdirSync(destino, { recursive: true });
  return destino;
}

const caminhos = {
  raiz,
  caminho,
  banco: (app) => caminho(app, 'ortus.db'),
  arquivos: (app) => garantirPasta(caminho(app, 'arquivos')),
  wwebjs: (app, clinicaId) => garantirPasta(caminho(app, 'wwebjs', String(clinicaId))),
  wwebjsRaiz: (app) => garantirPasta(caminho(app, 'wwebjs')),
  segredos: (app) => caminho(app, 'segredos.json'),
  sessao: (app) => caminho(app, 'sessao.json'),
  logs: (app) => garantirPasta(caminho(app, 'logs')),
  garantirPasta,
};

module.exports = caminhos;
