'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { timingSafeEqual } = require('node:crypto');
const { TABELAS, ORDEM_SYNC } = require('./esquema.cjs');
const { hostLocalValido } = require('./origemLocal.cjs');
const log = require('./log.cjs');

/**
 * API de dados local.
 *
 * O SQLite pertence ao processo principal do Electron. Quem precisa dos dados
 * — o Next local e o servidor do WhatsApp — fala com esta API em
 * 127.0.0.1, autenticada por um segredo gerado na instalação.
 *
 * Por que HTTP em vez de abrir o arquivo .db em cada processo: um módulo
 * nativo compilado para o ABI do Electron não carrega em outro Node, e uma
 * única conexão escritora evita "database is locked" e divergência de cache.
 */

const LIMITE_CORPO = 12 * 1024 * 1024; // lotes de bootstrap

function igualSeguro(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on('data', (pedaco) => {
      total += pedaco.length;
      if (total > LIMITE_CORPO) {
        reject(Object.assign(new Error('Corpo grande demais.'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(pedaco);
    });
    req.on('end', () => {
      if (!partes.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function responder(res, status, dados) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(corpo),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(corpo);
}

/**
 * @param {object} ctx
 * @param {object} ctx.banco        instância de criarBanco()
 * @param {string} ctx.segredo
 * @param {() => object} ctx.estadoSync  snapshot do motor de sincronização
 * @param {() => Promise<any>} ctx.sincronizarAgora
 * @param {(dados: object) => void} ctx.salvarSessao
 * @param {() => object|null} ctx.lerSessao
 * @param {() => Promise<object>} ctx.bootstrap
 */
function criarApiDados(ctx) {
  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      // Navegador nunca fala com esta API: quem chama é o Next/WhatsApp locais.
      if (req.headers.origin) {
        responder(res, 403, { erro: 'Origem não permitida.' });
        return;
      }
      // DNS rebinding: uma página externa chegaria aqui com o nome do domínio
      // dela no `Host`. Os processos locais sempre usam 127.0.0.1:<porta>.
      if (!hostLocalValido(req.headers.host, servidor.address()?.port)) {
        responder(res, 403, { erro: 'Endereço não permitido.' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/saude') {
        responder(res, 200, { ok: true, versao: 1 });
        return;
      }

      if (!igualSeguro(req.headers['x-ortus-db-secret'], ctx.segredo)) {
        responder(res, 401, { erro: 'Segredo inválido.' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/esquema') {
        responder(res, 200, { tabelas: TABELAS, ordem: ORDEM_SYNC });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/estatisticas') {
        responder(res, 200, ctx.banco.estatisticas());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/consulta') {
        const corpo = await lerCorpo(req);
        const dados = ctx.banco.consultar(corpo.tabela, {
          filtros: corpo.filtros || [],
          ordem: corpo.ordem || [],
          limite: corpo.limite,
          offset: corpo.offset,
        });
        responder(res, 200, { dados });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/contar') {
        const corpo = await lerCorpo(req);
        responder(res, 200, { total: ctx.banco.contar(corpo.tabela, { filtros: corpo.filtros || [] }) });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/gravar') {
        const corpo = await lerCorpo(req);
        const linha = ctx.banco.gravar(corpo.tabela, corpo.op || 'insert', corpo.dados || {}, corpo.id);
        responder(res, 200, { dados: linha });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/lote') {
        const corpo = await lerCorpo(req);
        const operacoes = Array.isArray(corpo.operacoes) ? corpo.operacoes : [];
        const resultados = [];
        for (const operacao of operacoes) {
          resultados.push(ctx.banco.gravar(operacao.tabela, operacao.op || 'insert', operacao.dados || {}, operacao.id));
        }
        responder(res, 200, { dados: resultados });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/sync/estado') {
        responder(res, 200, ctx.estadoSync());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/sync/agora') {
        responder(res, 200, await ctx.sincronizarAgora());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/sync/conflitos') {
        responder(res, 200, { dados: ctx.banco.listarConflitos() });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/sync/resolver') {
        const corpo = await lerCorpo(req);
        ctx.banco.resolverConflito(corpo.id, corpo.escolha === 'remoto' ? 'remoto' : 'local');
        responder(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/bootstrap') {
        responder(res, 200, await ctx.bootstrap());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/sessao') {
        responder(res, 200, { dados: ctx.lerSessao() });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/sessao') {
        const corpo = await lerCorpo(req);
        ctx.salvarSessao(corpo.dados || null);
        responder(res, 200, { ok: true });
        return;
      }

      responder(res, 404, { erro: 'Rota não encontrada.' });
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 500;
      if (status >= 500) log.erro('api-dados', err);
      responder(res, status, { erro: err instanceof Error ? err.message : 'Falha na API de dados.' });
    }
  });

  servidor.headersTimeout = 30_000;
  servidor.requestTimeout = 120_000;

  return {
    servidor,
    // Sempre em 127.0.0.1. `porta` 0 deixa o sistema escolher uma livre.
    ouvir: (porta) => new Promise((resolve, reject) => {
      servidor.once('error', reject);
      servidor.listen(porta, '127.0.0.1', () => {
        servidor.off('error', reject);
        servidor.on('error', (err) => log.erro('api-dados: erro do servidor', err));
        resolve(servidor.address().port);
      });
    }),
    fechar: () => new Promise((resolve) => {
      servidor.close(() => resolve());
      setTimeout(resolve, 2_000);
    }),
  };
}

module.exports = { criarApiDados, igualSeguro, lerCorpo, responder, LIMITE_CORPO, crypto };
