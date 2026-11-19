#!/usr/bin/env node
/**
 * Teste do motor de sincronização contra uma nuvem de mentira.
 *
 * Sobe, em 127.0.0.1, um servidor que responde como o PostgREST do Supabase
 * no que o sincronizador usa (leitura paginada com filtro e ordem, upsert
 * pela chave primária devolvendo a linha, exclusão que deixa túmulo, carimbo
 * `updated_at` dado pelo servidor) e roda o motor de verdade
 * (desktop/lib/sync.cjs) sobre bancos SQLite de verdade, um por "máquina".
 *
 * Cobre o que não dá para conferir só lendo o código: cópia inicial com
 * muitas linhas de mesmo carimbo, reenvio depois de queda de rede sem
 * duplicar, conflito entre dois computadores com as duas versões guardadas,
 * exclusão compartilhada, coluna que a nuvem tem e o espelho não, e banco
 * local antigo ganhando coluna nova.
 *
 * Não fala com a internet nem com o Supabase real.
 *
 * Uso: node scripts/desktop-sync-teste.mjs   (roda junto do npm run desktop:teste)
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const Database = require('better-sqlite3');
const { criarBanco } = require(path.join(raiz, 'desktop', 'lib', 'sqlite.cjs'));
const { criarSync } = require(path.join(raiz, 'desktop', 'lib', 'sync.cjs'));
const { TABELAS, ORDEM_SYNC, sqlCriacao } = require(path.join(raiz, 'desktop', 'lib', 'esquema.cjs'));

const CHAVE_PUBLICA = 'chave-publica-de-teste';
const JWT_USUARIO = 'jwt-do-usuario-de-teste';
const CLINICA = 17;
// O que o gatilho de modo de consulta responde (migration 20261124_assinaturas).
const RECUSA_CONSULTA = {
  status: 402,
  code: 'PT402',
  hint: 'assinatura_bloqueada',
  message: 'Assinatura suspensa: o sistema está em modo de consulta. Os dados continuam disponíveis para leitura; para voltar a gravar, regularize o pagamento em Assinatura.',
};

const resultados = [];
const check = (nome, ok, detalhe = '') => resultados.push({ nome, ok: Boolean(ok), detalhe: String(detalhe ?? '') });
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// O motor escreve no log a cada falha esperada (rede caída, item recusado).
// Guardamos para mostrar só se algum teste falhar.
const logCapturado = [];
const consoleOriginal = { log: console.log, error: console.error };
console.log = (...args) => logCapturado.push(args.join(' '));
console.error = (...args) => logCapturado.push(args.join(' '));

// --------------------------------------------------------------------- nuvem
/** Carimbo em microssegundos, nos dois formatos que circulam (…Z e …+00:00). */
function micros(texto) {
  const m = String(texto).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) return NaN;
  return Date.parse(`${m[1]}${m[3]}`) * 1000 + Number((m[2] || '').padEnd(6, '0'));
}

/** Como o Postgres escreve um timestamptz em UTC: sem zeros à direita na fração. */
function textoDeMicros(us) {
  const base = new Date(Math.floor(us / 1000)).toISOString().slice(0, 19);
  const fracao = String(us % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return `${base}${fracao ? `.${fracao}` : ''}+00:00`;
}

const COLUNAS_DE_TEMPO = new Set(['updated_at', 'excluido_em', 'created_at']);

function criarNuvem() {
  /** @type {Map<string, Map<string, Record<string, unknown>>>} */
  const tabelas = new Map([...ORDEM_SYNC, 'sync_exclusoes'].map((nome) => [nome, new Map()]));
  /** Colunas que cada tabela tem na nuvem (o espelho, mais o que o teste acrescentar). */
  const colunas = new Map(ORDEM_SYNC.map((nome) => [nome, new Set(Object.keys(TABELAS[nome].colunas))]));
  let relogio = 0;
  let seqExclusao = 0;

  const nuvem = {
    tabelas,
    colunas,
    foraDoAr: false,
    perderRespostaDoProximoEnvio: false,
    /**
     * (tabela, linha, metodo) => recusa da escrita: `true` é a RLS (403,
     * 42501); um objeto `{ status, code, message }` responde exatamente isso.
     */
    recusar: () => false,
    pedidos: [],
    credenciaisErradas: 0,
    url: '',

    agora() {
      relogio = Math.max(relogio + 1, Date.now() * 1000);
      return textoDeMicros(relogio);
    },
    linhas(tabela) {
      return [...tabelas.get(tabela).values()];
    },
    obter(tabela, id) {
      return tabelas.get(tabela).get(String(id)) || null;
    },
    /** Grava direto, como outro sistema gravaria (site, outra máquina). */
    semear(tabela, linha, carimbo) {
      const completa = { ...linha, updated_at: carimbo || nuvem.agora() };
      tabelas.get(tabela).set(String(completa.id), completa);
      return completa;
    },
    pedidosDe(tabela) {
      return nuvem.pedidos.filter((p) => p.tabela === tabela);
    },
  };

  function comparar(coluna, a, b) {
    if (COLUNAS_DE_TEMPO.has(coluna)) return micros(a) - micros(b);
    const [x, y] = [Number(a), Number(b)];
    if (Number.isFinite(x) && Number.isFinite(y) && String(a).trim() !== '' && String(b).trim() !== '') return x - y;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }

  function condicao(coluna, expressao) {
    const ponto = expressao.indexOf('.');
    const op = expressao.slice(0, ponto);
    const valor = expressao.slice(ponto + 1);
    return (linha) => {
      if (linha[coluna] === null || linha[coluna] === undefined) return false;
      const c = comparar(coluna, linha[coluna], valor);
      if (op === 'eq') return c === 0;
      if (op === 'gt') return c > 0;
      if (op === 'gte') return c >= 0;
      if (op === 'lt') return c < 0;
      if (op === 'lte') return c <= 0;
      throw Object.assign(new Error(`operador ${op} fora do teste`), { status: 400 });
    };
  }

  function separar(texto) {
    const partes = [];
    let atual = '';
    let nivel = 0;
    for (const ch of texto) {
      if (ch === '(') nivel += 1;
      if (ch === ')') nivel -= 1;
      if (ch === ',' && nivel === 0) {
        partes.push(atual);
        atual = '';
      } else {
        atual += ch;
      }
    }
    if (atual) partes.push(atual);
    return partes;
  }

  /** `(a.gt.X,and(a.eq.X,b.gt.Y))` — a mesma gramática do PostgREST. */
  function grupo(texto, juncao) {
    const itens = separar(texto.replace(/^\(/, '').replace(/\)$/, '')).map((item) => {
      const m = item.match(/^(and|or)(\(.*\))$/s);
      if (m) return grupo(m[2], m[1]);
      const ponto = item.indexOf('.');
      return condicao(item.slice(0, ponto), item.slice(ponto + 1));
    });
    return (linha) => (juncao === 'and' ? itens.every((f) => f(linha)) : itens.some((f) => f(linha)));
  }

  function responder(res, status, corpo) {
    const texto = corpo === undefined ? '' : JSON.stringify(corpo);
    res.writeHead(status, { 'content-type': 'application/json', date: new Date().toUTCString() });
    res.end(texto);
  }

  /** Responde a recusa configurada pelo teste, no formato de erro do PostgREST. */
  function recusou(res, tabela, linha, metodo) {
    const recusa = nuvem.recusar(tabela, linha, metodo);
    if (!recusa) return false;
    const { status, ...corpo } = recusa === true ? { status: 403, code: '42501', message: 'recusado pela RLS' } : recusa;
    responder(res, status, { details: null, hint: null, ...corpo });
    return true;
  }

  const servidor = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (p) => partes.push(p));
    req.on('end', () => {
      try {
        if (nuvem.foraDoAr) {
          req.socket.destroy();
          return;
        }
        const url = new URL(req.url, nuvem.url);
        const tabela = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, ''));
        nuvem.pedidos.push({ metodo: req.method, tabela, busca: url.search });

        // Só a chave pública e o JWT do usuário chegam aqui.
        if (req.headers.apikey !== CHAVE_PUBLICA || req.headers.authorization !== `Bearer ${JWT_USUARIO}`) {
          nuvem.credenciaisErradas += 1;
          return responder(res, 401, { message: 'credencial inesperada' });
        }
        const dados = tabelas.get(tabela);
        if (!dados) return responder(res, 404, { code: 'PGRST205', message: `tabela ${tabela} não existe` });

        if (req.method === 'GET') {
          const filtros = [];
          for (const [chave, valor] of url.searchParams) {
            if (['select', 'order', 'limit', 'offset'].includes(chave)) continue;
            filtros.push(chave === 'or' ? grupo(valor, 'or') : condicao(chave, valor));
          }
          const ordem = (url.searchParams.get('order') || '').split(',').filter(Boolean).map((item) => item.split('.')[0]);
          const limite = Number(url.searchParams.get('limit') || 1000);
          const linhas = [...dados.values()]
            .filter((linha) => filtros.every((f) => f(linha)))
            .sort((a, b) => {
              for (const coluna of ordem) {
                const c = comparar(coluna, a[coluna], b[coluna]);
                if (c !== 0) return c;
              }
              return 0;
            })
            .slice(0, limite);
          return responder(res, 200, linhas);
        }

        if (req.method === 'POST') {
          const corpo = JSON.parse(Buffer.concat(partes).toString('utf8') || '[]');
          const devolvidas = [];
          for (const linha of Array.isArray(corpo) ? corpo : [corpo]) {
            const conhecidas = colunas.get(tabela);
            const estranha = Object.keys(linha).find((coluna) => !conhecidas.has(coluna));
            if (estranha) return responder(res, 400, { code: 'PGRST204', message: `coluna ${estranha} não existe em ${tabela}` });
            if (recusou(res, tabela, linha, 'POST')) return undefined;
            // merge-duplicates: só as colunas enviadas mudam; o gatilho carimba.
            const gravada = { ...(dados.get(String(linha.id)) || {}), ...linha, updated_at: nuvem.agora() };
            dados.set(String(linha.id), gravada);
            devolvidas.push(gravada);
          }
          if (nuvem.perderRespostaDoProximoEnvio) {
            nuvem.perderRespostaDoProximoEnvio = false;
            req.socket.destroy();
            return;
          }
          return responder(res, 201, devolvidas);
        }

        if (req.method === 'DELETE') {
          const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
          if (recusou(res, tabela, dados.get(String(id)) || { id }, 'DELETE')) return undefined;
          if (dados.delete(String(id))) {
            seqExclusao += 1;
            tabelas.get('sync_exclusoes').set(String(seqExclusao), {
              id: seqExclusao,
              tabela,
              linha_id: String(id),
              clinica_id: CLINICA,
              excluido_em: nuvem.agora(),
            });
          }
          res.writeHead(204);
          res.end();
          return;
        }
        responder(res, 405, { message: 'método fora do teste' });
      } catch (err) {
        responder(res, Number(err.status) || 500, { message: err instanceof Error ? err.message : String(err) });
      }
    });
  });

  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      nuvem.url = `http://127.0.0.1:${servidor.address().port}`;
      nuvem.fechar = () => new Promise((fim) => {
        servidor.closeAllConnections?.();
        servidor.close(() => fim());
      });
      resolve(nuvem);
    });
  });
}

// ------------------------------------------------------------------ máquinas
const pastas = [];
function novaPasta(nome) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), `ortus-sync-${nome}-`));
  pastas.push(pasta);
  return pasta;
}

function criarMaquina(nuvem, nome, arquivo) {
  const banco = criarBanco(arquivo || path.join(novaPasta(nome), 'ortus.db'), { instalacaoId: `maquina-${nome}` });
  let sessao = {
    access_token: JWT_USUARIO,
    refresh_token: 'renovacao-de-teste',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-4000-8000-000000000001', email: 'teste@clinica.test' },
  };
  const sync = criarSync({
    banco,
    obterConfig: () => ({ url: nuvem.url, anonKey: CHAVE_PUBLICA }),
    obterSessao: () => sessao,
    definirSessao: (nova) => {
      sessao = nova;
    },
    aoMudarEstado: () => {},
  });
  return { nome, banco, sync, ciclo: () => sync.sincronizarAgora() };
}

function uuid(n) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function paciente(n, extra = {}) {
  return { id: uuid(n), nome: `Paciente ${n}`, telefone: '82900000000', clinica_id: CLINICA, ficha_medica: {}, ...extra };
}

const pendentes = (maquina) => maquina.banco.contarOutbox();
const conflitos = (maquina) => maquina.banco.listarConflitos();

// ------------------------------------------------------------------- cenários
async function cenarioCopiaInicial(nuvem) {
  // 1.203 pacientes com EXATAMENTE o mesmo carimbo: é o que a migration que
  // criou `updated_at` com DEFAULT now() deixou em toda linha que já existia.
  const mesmoCarimbo = nuvem.agora();
  for (let i = 1; i <= 1203; i += 1) nuvem.semear('pacientes', paciente(i), mesmoCarimbo);
  for (let i = 2001; i <= 2010; i += 1) nuvem.semear('pacientes', paciente(i));

  const a = criarMaquina(nuvem, 'a');
  nuvem.pedidos.length = 0;
  const estado = await Promise.race([a.ciclo(), esperar(20_000).then(() => ({ estado: 'TRAVOU' }))]);
  check('cópia inicial termina com 1.203 linhas de mesmo carimbo', estado.estado === 'sincronizado', estado.estado);
  check('cópia inicial traz todas as linhas', a.banco.contar('pacientes') === 1213, a.banco.contar('pacientes'));
  check('cópia inicial não fica em laço', nuvem.pedidosDe('pacientes').length <= 4, `${nuvem.pedidosDe('pacientes').length} pedidos`);

  nuvem.pedidos.length = 0;
  await a.ciclo();
  const ocioso = nuvem.pedidosDe('pacientes');
  check('ciclo sem novidade pede a tabela uma vez só', ocioso.length === 1, `${ocioso.length} pedidos`);
  check('ciclo sem novidade não baixa de novo o que já tem', decodeURIComponent(ocioso[0]?.busca || '').includes('and(updated_at.eq.'), ocioso[0]?.busca);

  // Banco vindo de uma versão anterior: só o carimbo guardado, sem a chave.
  const b = criarMaquina(nuvem, 'b');
  b.banco.definirMeta('bootstrap_completo', '1');
  b.banco.definirCursor('pacientes', mesmoCarimbo);
  await b.ciclo();
  check('cursor antigo (só o carimbo) não perde linha de mesmo carimbo', b.banco.contar('pacientes') === 1213, b.banco.contar('pacientes'));
  return { a, b };
}

async function cenarioSemInternet(nuvem, a) {
  nuvem.foraDoAr = true;
  const novo = a.banco.gravar('pacientes', 'insert', { nome: 'Criado sem internet', clinica_id: CLINICA, telefone: '82911110000' });
  const agendamento = a.banco.gravar('agendamentos', 'insert', {
    paciente_id: novo.id,
    clinica_id: CLINICA,
    data_hora: '2026-12-01T12:00:00.000Z',
    procedimento: 'Avaliação',
  });
  a.banco.gravar('pacientes', 'update', { telefone: '82922220000' }, novo.id);
  a.banco.gravar('pacientes', 'update', { telefone: '82933330000' }, novo.id);
  const antes = pendentes(a);
  const offline = await a.ciclo();
  check('sem internet o indicador mostra offline', offline.estado === 'offline', offline.estado);
  check('sem internet nada sai da fila', pendentes(a) === antes && antes === 4, `${antes} → ${pendentes(a)}`);

  nuvem.foraDoAr = false;
  const online = await a.ciclo();
  check('com a rede de volta a fila esvazia', pendentes(a) === 0 && online.estado === 'sincronizado', `${pendentes(a)} ${online.estado}`);
  check('paciente criado offline chega uma vez só', nuvem.linhas('pacientes').filter((l) => l.nome === 'Criado sem internet').length === 1);
  check('a nuvem recebe o último estado', nuvem.obter('pacientes', novo.id)?.telefone === '82933330000', nuvem.obter('pacientes', novo.id)?.telefone);
  check('agendamento sobe com o id criado aqui (negativo)', Number(agendamento.id) < 0 && Boolean(nuvem.obter('agendamentos', agendamento.id)), agendamento.id);
  check('o carimbo local passa a ser o do servidor', a.banco.obter('pacientes', novo.id)?.updated_at === new Date(micros(nuvem.obter('pacientes', novo.id).updated_at) / 1000).toISOString());

  // A nuvem grava, mas a resposta se perde (queda de rede no meio do envio).
  const perdido = a.banco.gravar('pacientes', 'insert', { nome: 'Resposta perdida', clinica_id: CLINICA });
  nuvem.perderRespostaDoProximoEnvio = true;
  await a.ciclo();
  check('resposta perdida: a escrita continua na fila', pendentes(a) === 1, pendentes(a));
  check('resposta perdida: a nuvem já tinha gravado', Boolean(nuvem.obter('pacientes', perdido.id)));
  // A pessoa edita de novo antes do reenvio.
  a.banco.gravar('pacientes', 'update', { telefone: '82944440000' }, perdido.id);
  const semConflito = conflitos(a).length;
  await a.ciclo();
  check('reenvio não duplica a linha', nuvem.linhas('pacientes').filter((l) => l.nome === 'Resposta perdida').length === 1);
  check('reenvio não é tratado como conflito', conflitos(a).length === semConflito, conflitos(a).length);
  check('reenvio leva a edição mais nova', nuvem.obter('pacientes', perdido.id)?.telefone === '82944440000' && pendentes(a) === 0);
  return { novo, agendamento };
}

async function cenarioConflito(nuvem, a, b) {
  await b.ciclo();
  const alvo = uuid(2001);

  // 1) A edita primeiro (sem rede); B edita depois e envia: a nuvem é mais nova.
  a.banco.gravar('pacientes', 'update', { nome: 'Nome dado em A' }, alvo);
  await esperar(25);
  b.banco.gravar('pacientes', 'update', { telefone: '82955550000' }, alvo);
  await b.ciclo();
  check('B envia a edição dele', nuvem.obter('pacientes', alvo)?.telefone === '82955550000');

  const antes = conflitos(a).length;
  await a.ciclo();
  const [conflito] = conflitos(a).filter((c) => c.linha_id === alvo);
  check('conflito aparece no computador que volta à rede', conflitos(a).length === antes + 1 && Boolean(conflito), conflitos(a).length);
  check('conflito guarda a versão daqui', conflito?.versao_local?.nome === 'Nome dado em A', conflito?.versao_local?.nome);
  check('conflito guarda a versão da nuvem', conflito?.versao_remota?.telefone === '82955550000', conflito?.versao_remota?.telefone);
  check('vence o carimbo mais novo (a nuvem)', conflito?.escolhido === 'remoto', conflito?.escolhido);
  check('a nuvem não foi sobrescrita em silêncio', nuvem.obter('pacientes', alvo)?.nome === 'Paciente 2001' && nuvem.obter('pacientes', alvo)?.telefone === '82955550000');
  check('a edição que perdeu sai da fila (está guardada no conflito)', pendentes(a) === 0, pendentes(a));

  // A pessoa decide ficar com a versão do próprio computador.
  a.banco.resolverConflito(conflito.id, 'local');
  await a.ciclo();
  check('"manter este computador" sobe para a nuvem', nuvem.obter('pacientes', alvo)?.nome === 'Nome dado em A', nuvem.obter('pacientes', alvo)?.nome);
  check('resolver não gera conflito novo', conflitos(a).length === antes, conflitos(a).length);
  await b.ciclo();
  check('a decisão chega ao outro computador', b.banco.obter('pacientes', alvo)?.nome === 'Nome dado em A', b.banco.obter('pacientes', alvo)?.nome);

  // 2) B envia primeiro; A edita depois, sem ter recebido: a edição daqui é mais nova.
  const outro = uuid(2002);
  b.banco.gravar('pacientes', 'update', { telefone: '82966660000' }, outro);
  await b.ciclo();
  await esperar(25);
  a.banco.gravar('pacientes', 'update', { nome: 'Editado depois em A' }, outro);
  await a.ciclo();
  const [segundo] = conflitos(a).filter((c) => c.linha_id === outro);
  check('edição local mais nova vence, mas o conflito aparece', segundo?.escolhido === 'local', segundo?.escolhido);
  check('a versão da nuvem que perdeu fica guardada', segundo?.versao_remota?.telefone === '82966660000', segundo?.versao_remota?.telefone);
  check('a versão daqui sobe', nuvem.obter('pacientes', outro)?.nome === 'Editado depois em A');

  // A pessoa decide ficar com a versão da nuvem, que já tinha sido sobrescrita.
  a.banco.resolverConflito(segundo.id, 'remoto');
  await a.ciclo();
  check('"manter a nuvem" devolve a versão dela à nuvem', nuvem.obter('pacientes', outro)?.telefone === '82966660000' && nuvem.obter('pacientes', outro)?.nome === 'Paciente 2002', JSON.stringify(nuvem.obter('pacientes', outro)));
  check('depois de resolver não sobra conflito nem fila', conflitos(a).length === antes && pendentes(a) === 0, `${conflitos(a).length} ${pendentes(a)}`);

  // 3) Editar a mesma linha duas vezes seguidas não é conflito consigo mesmo.
  const terceiro = uuid(2003);
  a.banco.gravar('pacientes', 'update', { telefone: '82977770001' }, terceiro);
  await a.ciclo();
  a.banco.gravar('pacientes', 'update', { telefone: '82977770002' }, terceiro);
  await a.ciclo();
  await a.ciclo();
  check('edições seguidas do mesmo computador não viram conflito', conflitos(a).length === antes, conflitos(a).length);
  check('a nuvem fica com a última edição', nuvem.obter('pacientes', terceiro)?.telefone === '82977770002');
}

async function cenarioExclusao(nuvem, a, b) {
  await a.ciclo();
  await b.ciclo();
  const antes = conflitos(a).length;

  // Exclusão comum: some nos dois, sem pedir decisão a ninguém.
  const comum = uuid(2004);
  b.banco.gravar('pacientes', 'delete', {}, comum);
  await b.ciclo();
  await a.ciclo();
  check('exclusão feita em B chega a A', a.banco.obter('pacientes', comum) === null && nuvem.obter('pacientes', comum) === null);
  check('exclusão comum não vira conflito', conflitos(a).length === antes, conflitos(a).length);
  await a.ciclo();
  check('linha excluída não volta para a nuvem', nuvem.obter('pacientes', comum) === null);

  // A editou (sem rede) e, depois, B excluiu: a exclusão é mais nova.
  const disputado = uuid(2005);
  a.banco.gravar('pacientes', 'update', { nome: 'Editado antes da exclusão' }, disputado);
  await esperar(25);
  b.banco.gravar('pacientes', 'delete', {}, disputado);
  await b.ciclo();
  await a.ciclo();
  const [conflito] = conflitos(a).filter((c) => c.linha_id === disputado);
  check('exclusão mais nova vence a edição antiga', a.banco.obter('pacientes', disputado) === null);
  check('a edição que a exclusão apagou fica guardada', conflito?.versao_local?.nome === 'Editado antes da exclusão' && conflito?.versao_remota === null, JSON.stringify(conflito?.versao_local?.nome));
  a.banco.resolverConflito(conflito.id, 'local');
  check('"manter este computador" devolve o registro na hora', a.banco.obter('pacientes', disputado)?.nome === 'Editado antes da exclusão');
  await a.ciclo();
  check('o registro recuperado volta para a nuvem', nuvem.obter('pacientes', disputado)?.nome === 'Editado antes da exclusão');
  await b.ciclo();
  check('e reaparece no outro computador', b.banco.obter('pacientes', disputado)?.nome === 'Editado antes da exclusão');
}

async function cenarioRecusa(nuvem, a) {
  const antes = conflitos(a).length;
  const escritas = () => nuvem.pedidos.filter((p) => p.metodo !== 'GET').length;

  // 1) RLS ou gatilho da nuvem (403, 42501): recusa definitiva já na primeira resposta.
  nuvem.recusar = (tabela, linha) => tabela === 'tarefas' && linha.titulo === 'recusada pela nuvem';
  const recusada = a.banco.gravar('tarefas', 'insert', { clinica_id: CLINICA, titulo: 'recusada pela nuvem' });
  // Mesma tabela, criada depois: na ordem de envio fica atrás do item recusado.
  const aceita = a.banco.gravar('tarefas', 'insert', { clinica_id: CLINICA, titulo: 'atrás do item recusado' });
  nuvem.pedidos.length = 0;
  const estado = await a.ciclo();
  const envios = nuvem.pedidos.filter((p) => p.metodo === 'POST' && p.tabela === 'tarefas').length;
  check('item recusado não trava o envio dos demais', Boolean(nuvem.obter('tarefas', aceita.id)));
  check('item recusado é tentado uma vez só', envios === 2, `${envios} envios (1 recusado + 1 aceito)`);
  const [porPermissao] = conflitos(a).filter((c) => c.linha_id === recusada.id);
  check(
    'permissão negada (403) vira conflito recusado na primeira resposta',
    porPermissao?.resolucao === 'recusado' && porPermissao?.motivo === 'permissao' && pendentes(a) === 0 && estado.conflitos === antes + 1,
    `${porPermissao?.resolucao} ${porPermissao?.motivo} fila=${pendentes(a)}`,
  );
  check(
    'a versão recusada fica guardada e a linha daqui não é apagada',
    porPermissao?.versao_local?.titulo === 'recusada pela nuvem' && a.banco.obter('tarefas', recusada.id)?.titulo === 'recusada pela nuvem',
  );
  nuvem.pedidos.length = 0;
  await a.ciclo();
  await a.ciclo();
  check('sem laço: a escrita recusada não é reenviada sozinha', escritas() === 0, `${escritas()} escritas`);
  a.banco.resolverConflito(porPermissao.id, 'remoto');
  check('desistir do item recusado tira a linha daqui', a.banco.obter('tarefas', recusada.id) === null && conflitos(a).length === antes);
  nuvem.recusar = () => false;
  await a.ciclo();

  // 2) Modo de consulta (402, PT402): toda gravação da clínica é recusada; a leitura continua.
  const alvo = uuid(2006);
  nuvem.recusar = () => RECUSA_CONSULTA;
  a.banco.gravar('pacientes', 'update', { telefone: '82988880000' }, alvo);
  a.banco.gravar('tarefas', 'delete', {}, aceita.id);
  const deFora = nuvem.semear('pacientes', paciente(3001, { nome: 'Criado no site durante a suspensão' }));
  nuvem.pedidos.length = 0;
  await a.ciclo();
  const recusadas = conflitos(a).filter((c) => c.resolucao === 'recusado' && c.motivo === 'consulta');
  check('modo de consulta: edição e exclusão viram conflito recusado na hora', recusadas.length === 2 && pendentes(a) === 0, `${recusadas.length} conflitos, fila=${pendentes(a)}`);
  check('modo de consulta: a nuvem continua como estava', nuvem.obter('pacientes', alvo)?.telefone !== '82988880000' && Boolean(nuvem.obter('tarefas', aceita.id)));
  check('modo de consulta: nada é apagado neste computador', a.banco.obter('pacientes', alvo)?.telefone === '82988880000');
  check('modo de consulta: a leitura continua (o que entrou na nuvem desce)', a.banco.obter('pacientes', deFora.id)?.nome === 'Criado no site durante a suspensão');
  const escritasNaSuspensao = escritas();
  await a.ciclo();
  await a.ciclo();
  check('modo de consulta: sem laço de tentativas', escritas() === escritasNaSuspensao, `${escritasNaSuspensao} → ${escritas()} escritas`);

  // Assinatura regularizada: a pessoa decide cada recusa.
  nuvem.recusar = () => false;
  const edicao = recusadas.find((c) => c.tabela === 'pacientes');
  const exclusao = recusadas.find((c) => c.tabela === 'tarefas');
  a.banco.resolverConflito(edicao.id, 'local');
  a.banco.resolverConflito(exclusao.id, 'remoto');
  await a.ciclo();
  check('regularizado: "tentar enviar de novo" sobe a edição', nuvem.obter('pacientes', alvo)?.telefone === '82988880000', nuvem.obter('pacientes', alvo)?.telefone);
  check('regularizado: "descartar" a exclusão recusada traz o registro de volta da nuvem', a.banco.obter('tarefas', aceita.id)?.titulo === 'atrás do item recusado');
  check('regularizado: nenhum conflito novo', conflitos(a).length === antes, conflitos(a).length);

  // 3) Constraint, coluna ou tabela que a nuvem não tem: 12 ciclos antes de virar conflito.
  nuvem.recusar = (tabela, linha) => (tabela === 'tarefas' && linha.titulo === 'duplicada' ? { status: 409, code: '23505', message: 'duplicate key' } : false);
  const duplicada = a.banco.gravar('tarefas', 'insert', { clinica_id: CLINICA, titulo: 'duplicada' });
  await a.ciclo();
  check('constraint (409) continua na fila depois da primeira recusa', pendentes(a) === 1, pendentes(a));
  for (let i = 0; i < 12; i += 1) await a.ciclo();
  const [rejeitada] = conflitos(a).filter((c) => c.linha_id === duplicada.id);
  check('depois de 12 ciclos vira conflito recusado (motivo "rejeitado")', rejeitada?.resolucao === 'recusado' && rejeitada?.motivo === 'rejeitado' && pendentes(a) === 0, `${rejeitada?.resolucao} ${rejeitada?.motivo} fila=${pendentes(a)}`);
  a.banco.resolverConflito(rejeitada.id, 'remoto');
  nuvem.recusar = () => false;
  await a.ciclo();
}

async function cenarioColunas(nuvem) {
  // A nuvem tem uma coluna que o espelho deste programa ainda não conhece.
  nuvem.colunas.get('profissionais_clinicas').add('coluna_do_futuro');
  nuvem.semear('profissionais_clinicas', { id: 501, profissional_id: 9, clinica_id: CLINICA, permissao: 'admin', convidado: false, coluna_do_futuro: 'x' });
  nuvem.semear('profissionais_clinicas', { id: 502, profissional_id: 10, clinica_id: CLINICA, permissao: 'funcionario', convidado: true, coluna_do_futuro: 'y' });

  // Banco criado por uma versão anterior: sem `convidado`, já com as linhas e
  // com o cursor no fim (o pull incremental não as traria de novo).
  const arquivo = path.join(novaPasta('antigo'), 'ortus.db');
  const antigo = new Database(arquivo);
  const semConvidado = sqlCriacao('profissionais_clinicas').replace(', "convidado" INTEGER', '');
  antigo.exec(semConvidado);
  antigo.exec('CREATE TABLE sync_cursor (tabela TEXT PRIMARY KEY, cursor TEXT)');
  antigo.exec('CREATE TABLE sync_meta (chave TEXT PRIMARY KEY, valor TEXT)');
  // Lista de conflitos de antes da coluna `motivo`, com um conflito pendente.
  antigo.exec(`CREATE TABLE sync_conflitos (id INTEGER PRIMARY KEY AUTOINCREMENT, tabela TEXT NOT NULL, linha_id TEXT NOT NULL,
    clinica_id TEXT, versao_local TEXT, versao_remota TEXT, escolhido TEXT NOT NULL, resolucao TEXT NOT NULL DEFAULT 'auto',
    detectado_em TEXT NOT NULL, resolvido_em TEXT)`);
  antigo.prepare("INSERT INTO sync_conflitos (tabela, linha_id, versao_local, versao_remota, escolhido, resolucao, detectado_em) VALUES ('tarefas', '-1', ?, 'null', 'local', 'recusado', '2026-11-01T00:00:00.000Z')")
    .run(JSON.stringify({ id: -1, titulo: 'recusada numa versão anterior' }));
  antigo.prepare('INSERT INTO profissionais_clinicas (id, profissional_id, clinica_id, permissao, updated_at) VALUES (?, ?, ?, ?, ?)').run(501, 9, CLINICA, 'admin', '2026-11-01T00:00:00.000Z');
  antigo.prepare('INSERT INTO profissionais_clinicas (id, profissional_id, clinica_id, permissao, updated_at) VALUES (?, ?, ?, ?, ?)').run(502, 10, CLINICA, 'funcionario', '2026-11-01T00:00:00.000Z');
  antigo.prepare('INSERT INTO sync_cursor (tabela, cursor) VALUES (?, ?)').run('profissionais_clinicas', '2099-01-01T00:00:00+00:00');
  antigo.prepare('INSERT INTO sync_meta (chave, valor) VALUES (?, ?)').run('bootstrap_completo', '1');
  const antes = antigo.prepare('PRAGMA table_info("profissionais_clinicas")').all().map((c) => c.name);
  antigo.close();
  check('banco antigo de teste não tem a coluna', !antes.includes('convidado'), antes.join(','));

  const c = criarMaquina(nuvem, 'c', arquivo);
  const depois = c.banco.bruto.prepare('PRAGMA table_info("profissionais_clinicas")').all().map((col) => col.name);
  check('banco antigo ganha a coluna convidado ao abrir', depois.includes('convidado'), depois.join(','));
  check('linhas antigas continuam lá', c.banco.contar('profissionais_clinicas') === 2);
  const colunasConflito = c.banco.bruto.prepare('PRAGMA table_info("sync_conflitos")').all().map((col) => col.name);
  check('banco antigo ganha o motivo da recusa nos conflitos', colunasConflito.includes('motivo'), colunasConflito.join(','));
  check('conflito de antes continua na lista (sem motivo)', c.banco.listarConflitos().some((x) => x.linha_id === '-1' && x.motivo === null && x.versao_local?.titulo === 'recusada numa versão anterior'));
  check('a posição da tabela é zerada para baixar de novo', c.banco.obterPosicao('profissionais_clinicas') === null);
  const estado = await c.ciclo();
  check('pull com coluna desconhecida da nuvem não quebra', estado.estado === 'sincronizado', `${estado.estado} ${estado.ultimoErro || ''}`);
  check('convidado desce para as linhas que já existiam', c.banco.obter('profissionais_clinicas', 502)?.convidado === true && c.banco.obter('profissionais_clinicas', 501)?.convidado === false, JSON.stringify(c.banco.obter('profissionais_clinicas', 502)));
  check('coluna desconhecida não entra no espelho', !('coluna_do_futuro' in (c.banco.obter('profissionais_clinicas', 501) || {})));

  // Edição local numa linha que tem coluna desconhecida: o envio não a apaga na nuvem.
  c.banco.gravar('profissionais_clinicas', 'update', { permissao: 'admin' }, 501);
  const fim = await c.ciclo();
  check('envio de linha com coluna desconhecida é aceito', fim.estado === 'sincronizado' && pendentes(c) === 0, `${fim.estado} ${fim.ultimoErro || ''}`);
  check('a coluna desconhecida continua intacta na nuvem', nuvem.obter('profissionais_clinicas', 501)?.coluna_do_futuro === 'x');
  return c;
}

// ---------------------------------------------------------------------- roda
const maquinas = [];
const nuvem = await criarNuvem();
let falhaGeral = null;
try {
  const { a, b } = await cenarioCopiaInicial(nuvem);
  maquinas.push(a, b);
  await cenarioSemInternet(nuvem, a);
  await cenarioConflito(nuvem, a, b);
  await cenarioExclusao(nuvem, a, b);
  await cenarioRecusa(nuvem, a);
  maquinas.push(await cenarioColunas(nuvem));
  check('toda chamada à nuvem levou só a chave pública e o JWT do usuário', nuvem.credenciaisErradas === 0 && nuvem.pedidos.length > 0, nuvem.credenciaisErradas);
} catch (err) {
  falhaGeral = err;
} finally {
  for (const maquina of maquinas) {
    try {
      maquina.banco.fechar();
    } catch {
      /* já fechado */
    }
  }
  await nuvem.fechar();
  for (const pasta of pastas) {
    try {
      fs.rmSync(pasta, { recursive: true, force: true });
    } catch {
      /* arquivo ainda em uso no Windows: a pasta temporária fica para o sistema limpar */
    }
  }
}

console.log = consoleOriginal.log;
console.error = consoleOriginal.error;

console.log('\n=== SINCRONIZAÇÃO (nuvem de mentira) ===');
let falhas = 0;
for (const r of resultados) {
  if (!r.ok) falhas += 1;
  console.log(`${r.ok ? 'OK  ' : 'FALHA'} ${r.nome}${r.detalhe && !r.ok ? `  → ${r.detalhe}` : ''}`);
}
if (falhaGeral) {
  falhas += 1;
  console.log(`FALHA o teste parou no meio: ${falhaGeral instanceof Error ? falhaGeral.stack : falhaGeral}`);
}
if (falhas) {
  console.log('\n--- log do motor ---');
  console.log(logCapturado.slice(-60).join('\n'));
}
console.log(`\n${resultados.length - (falhaGeral ? falhas - 1 : falhas)}/${resultados.length} verificações OK`);
process.exit(falhas ? 1 : 0);
