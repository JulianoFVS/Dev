#!/usr/bin/env node
/**
 * Teste das rotas locais (`/api/local/*`) com o código de verdade.
 *
 * Carrega os próprios arquivos `route.ts` e chama as funções `GET`/`POST`/
 * `DELETE` com requisições montadas à mão, ligadas a uma API de dados e a um
 * SQLite de verdade (desktop/lib/dbApi.cjs e sqlite.cjs). Só o servidor HTTP
 * do Next fica de fora.
 *
 * O que prova:
 *  - a janela do aplicativo (Host certo + segredo da execução) é atendida,
 *    inclusive sem token do Supabase — é o caso do login offline;
 *  - site aberto no navegador da máquina, DNS rebinding, iframe externo e
 *    programa sem o segredo recebem 403 em TODAS as rotas e não alteram nada;
 *  - corpo que não é JSON (text/plain, formulário) recebe 415;
 *  - o mesmo vale pela rede: as rotas atrás de um servidor HTTP de verdade em
 *    127.0.0.1, e a API de dados do processo principal;
 *  - fora do aplicativo (site) as rotas continuam respondendo 404.
 *
 * Precisa de um Node que rode TypeScript direto (22.18 ou mais novo). Em Node
 * mais antigo o teste avisa e não roda.
 *
 * Uso: node scripts/desktop-rotas-teste.mjs   (roda junto do npm run desktop:teste)
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import nodeModule, { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (!process.features?.typescript || typeof nodeModule.registerHooks !== 'function') {
  console.log('\n=== ROTAS LOCAIS ===');
  console.log(`PULADO: o Node ${process.version} não roda TypeScript direto. Use o Node 22.18 ou mais novo para este teste.`);
  process.exit(0);
}

const require = createRequire(import.meta.url);
const { criarBanco } = require(path.join(raiz, 'desktop', 'lib', 'sqlite.cjs'));
const { criarApiDados } = require(path.join(raiz, 'desktop', 'lib', 'dbApi.cjs'));

// O alias `@/` do projeto e o pacote `server-only` (que só existe dentro do Next).
const EXTENSOES = ['', '.ts', '.tsx', '.cjs', '.mjs', '.js'];
nodeModule.registerHooks({
  resolve(especificador, contexto, proximo) {
    if (especificador === 'server-only') {
      return { url: 'data:text/javascript,export {};', shortCircuit: true };
    }
    // O pacote do Next não declara `exports`: fora do empacotador o Node pede a extensão.
    if (especificador === 'next/server') {
      return { url: pathToFileURL(path.join(raiz, 'node_modules', 'next', 'server.js')).href, shortCircuit: true };
    }
    if (especificador.startsWith('@/')) {
      const base = path.join(raiz, especificador.slice(2));
      for (const extensao of EXTENSOES) {
        const candidato = base + extensao;
        if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) {
          return { url: pathToFileURL(candidato).href, shortCircuit: true };
        }
      }
    }
    return proximo(especificador, contexto);
  },
});

const resultados = [];
const check = (nome, ok, detalhe = '') => resultados.push({ nome, ok: Boolean(ok), detalhe: String(detalhe ?? '') });

// ------------------------------------------------------------ pilha local
const PORTA_NEXT = 45678; // a porta em que o Next local "estaria" escutando
const SEGREDO_JANELA = 'a1'.repeat(32);
const SEGREDO_DADOS = 'b2'.repeat(32);
const USUARIO = '00000000-0000-4000-8000-0000000000aa';
const EMAIL = 'recepcao@clinica.test';
const SENHA = 'senha-de-teste-123';

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ortus-rotas-'));
const banco = criarBanco(path.join(pasta, 'ortus.db'), { instalacaoId: 'teste-rotas' });
let sessaoGuardada = null;
const api = criarApiDados({
  banco,
  segredo: SEGREDO_DADOS,
  estadoSync: () => ({ estado: 'sincronizado', pendentes: banco.contarOutbox(), conflitos: 0, ultimoEnvioOk: null, ultimaTentativa: null, ultimoErro: null, online: true, bootstrap: true }),
  sincronizarAgora: async () => ({ estado: 'sincronizado', pendentes: 0, conflitos: 0 }),
  lerSessao: () => sessaoGuardada,
  salvarSessao: (dados) => {
    sessaoGuardada = dados;
  },
  bootstrap: async () => ({ ok: true, linhas: 0 }),
});
const portaDados = await api.ouvir(0);

// Como no aplicativo: sem chave de servidor (o registro de falhas fica só no log).
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
// Como o processo principal entrega a configuração ao Next local.
Object.assign(process.env, {
  ORTUS_DESKTOP: '1',
  ORTUS_DB_URL: `http://127.0.0.1:${portaDados}`,
  ORTUS_DB_SEGREDO: SEGREDO_DADOS,
  ORTUS_JANELA_SEGREDO: SEGREDO_JANELA,
  ORTUS_LOCAL_PORTA: String(PORTA_NEXT),
});

const rota = (caminho) => import(pathToFileURL(path.join(raiz, 'app', 'api', 'local', caminho, 'route.ts')).href);
const rotas = {
  status: await rota('status'),
  db: await rota('db'),
  sessao: await rota('sessao'),
  restaurar: await rota('sessao/restaurar'),
  entrar: await rota('entrar'),
  sync: await rota('sync'),
  conflitos: await rota('conflitos'),
  bootstrap: await rota('bootstrap'),
};

// ------------------------------------------------------------ quem chama
const ORIGEM_APP = `http://127.0.0.1:${PORTA_NEXT}`;

/**
 * A janela do aplicativo: Host local e o segredo que o processo principal
 * injeta. `extra` troca qualquer cabeçalho; valor vazio tira o cabeçalho.
 */
function janela(metodo, caminho, corpo, extra = {}) {
  const headers = { host: `127.0.0.1:${PORTA_NEXT}`, 'x-ortus-janela': SEGREDO_JANELA, 'sec-fetch-site': 'same-origin' };
  if (metodo !== 'GET') headers.origin = ORIGEM_APP;
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  Object.assign(headers, extra);
  for (const [nome, valor] of Object.entries(headers)) if (valor === '') delete headers[nome];
  let body;
  if (corpo !== undefined) {
    // Texto sem Content-Type ganharia "text/plain" do próprio Request; bytes não ganham nada.
    body = headers['content-type'] ? JSON.stringify(corpo) : new TextEncoder().encode(JSON.stringify(corpo));
  }
  return new Request(`${ORIGEM_APP}${caminho}`, { method: metodo, headers, body });
}

/** Página de outro site aberta no navegador da mesma máquina (requisição "simples", sem preflight). */
function siteExterno(metodo, caminho, corpo) {
  const headers = { host: `127.0.0.1:${PORTA_NEXT}`, 'sec-fetch-site': 'cross-site' };
  if (metodo !== 'GET') {
    headers.origin = 'https://site-qualquer.example';
    headers['content-type'] = 'text/plain;charset=UTF-8';
  }
  return new Request(`${ORIGEM_APP}${caminho}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
}

/** DNS rebinding: a página do atacante vira "mesma origem", mas o Host é o domínio dele. */
function rebinding(metodo, caminho, corpo) {
  const headers = { host: `atacante.example:${PORTA_NEXT}`, 'sec-fetch-site': 'same-origin' };
  if (metodo !== 'GET') {
    headers.origin = `http://atacante.example:${PORTA_NEXT}`;
    headers['content-type'] = 'application/json';
  }
  return new Request(`http://atacante.example:${PORTA_NEXT}${caminho}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
}

/** Outro programa da máquina (curl, script): Host certo, sem o segredo. */
function outroPrograma(metodo, caminho, corpo) {
  const headers = { host: `127.0.0.1:${PORTA_NEXT}` };
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  return new Request(`${ORIGEM_APP}${caminho}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
}

/** Conteúdo externo embutido na janela (vídeo, mapa): mesmo com o segredo, a origem é de fora. */
function iframeExterno(metodo, caminho, corpo) {
  return janela(metodo, caminho, corpo, { origin: 'https://video.example', 'sec-fetch-site': 'cross-site' });
}

const b64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
const jwtDeMentira = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })}.assinatura-de-teste`;

const pacienteNovo = { tabela: 'pacientes', op: 'insert', dados: { nome: 'Paciente das Rotas', clinica_id: 17, telefone: '82900001111' } };

// ------------------------------------------------------------ pela rede
/** Requisição HTTP de verdade (o `Host` sai sozinho, a não ser que o teste troque). */
function pedirHttp(porta, { metodo = 'GET', caminho = '/', cabecalhos = {}, corpo } = {}) {
  return new Promise((resolve, reject) => {
    const pedido = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: metodo, headers: cabecalhos }, (res) => {
      const partes = [];
      res.on('data', (parte) => partes.push(parte));
      res.on('end', () => resolve({ status: res.statusCode, texto: Buffer.concat(partes).toString('utf8') }));
    });
    pedido.on('error', reject);
    if (corpo !== undefined) pedido.write(corpo);
    pedido.end();
  });
}

/**
 * As rotas atrás de um servidor HTTP em 127.0.0.1, no lugar do Next: cada
 * requisição vira o `Request` que o Next entregaria, com os cabeçalhos que
 * chegaram pela rede.
 */
function servirRotas(mapa) {
  const servidor = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (parte) => partes.push(parte));
    req.on('end', async () => {
      try {
        const caminho = new URL(req.url || '/', 'http://127.0.0.1').pathname;
        const tratar = mapa[caminho]?.[req.method || 'GET'];
        if (!tratar) {
          res.writeHead(404);
          res.end();
          return;
        }
        const headers = new Headers();
        for (const [nome, valor] of Object.entries(req.headers)) {
          if (valor !== undefined) headers.set(nome, Array.isArray(valor) ? valor.join(', ') : valor);
        }
        const body = partes.length ? Buffer.concat(partes) : undefined;
        const resposta = await tratar(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body }));
        res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
        res.end(Buffer.from(await resposta.arrayBuffer()));
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
  });
  return new Promise((resolve) => servidor.listen(0, '127.0.0.1', () => resolve(servidor)));
}

let falhaGeral = null;
try {
  // --- a janela é atendida ------------------------------------------------
  let r = await rotas.status.GET(janela('GET', '/api/local/status'));
  check('janela: /status responde desktop', r.status === 200 && (await r.json()).desktop === true, r.status);

  r = await rotas.restaurar.GET(janela('GET', '/api/local/sessao/restaurar'));
  check('janela sem login: /sessao/restaurar diz que não há sessão', r.status === 401, r.status);

  // Login online: a tela guarda a sessão e a senha (para o verificador offline).
  const token = jwtDeMentira(USUARIO);
  r = await rotas.sessao.POST(janela('POST', '/api/local/sessao', {
    dados: { access_token: token, refresh_token: 'renovacao-de-teste', user: { id: USUARIO, email: EMAIL } },
    senha: SENHA,
  }));
  check('janela: grava a sessão depois do login', r.status === 200 && sessaoGuardada?.access_token === token, r.status);
  check('a senha não é guardada, só o verificador', Boolean(sessaoGuardada?.verificador?.hash) && !JSON.stringify(sessaoGuardada).includes(SENHA));

  r = await rotas.restaurar.GET(janela('GET', '/api/local/sessao/restaurar'));
  check('janela: /sessao/restaurar devolve a sessão', r.status === 200 && (await r.json()).access_token === token, r.status);

  // Sem token do Supabase (venceu e a máquina está sem internet): continua valendo.
  r = await rotas.db.POST(janela('POST', '/api/local/db', pacienteNovo));
  const criado = (await r.json()).dados;
  check('janela sem token (offline): grava no banco local', r.status === 200 && typeof criado?.id === 'string', r.status);

  r = await rotas.db.POST(janela('POST', '/api/local/db', { tabela: 'pacientes', op: 'update', id: criado.id, dados: { telefone: '82900002222' } }, { authorization: `Bearer ${token}` }));
  const atualizado = (await r.json()).dados;
  check('janela com token: atualiza', r.status === 200 && atualizado?.telefone === '82900002222', r.status);
  check('a atualização devolve a linha inteira (id e nome preservados)', atualizado?.id === criado.id && atualizado?.nome === 'Paciente das Rotas', JSON.stringify({ id: atualizado?.id, nome: atualizado?.nome }));

  r = await rotas.db.POST(janela('POST', '/api/local/db', { tabela: 'pacientes', op: 'select', filtros: [{ col: 'clinica_id', op: 'eq', valor: 17 }] }));
  check('janela: consulta', r.status === 200 && (await r.json()).dados.length === 1, r.status);

  r = await rotas.db.POST(janela('POST', '/api/local/db', pacienteNovo, { authorization: `Bearer ${jwtDeMentira('00000000-0000-4000-8000-0000000000bb')}` }));
  check('janela com token de OUTRO usuário é recusada', r.status === 401, r.status);

  r = await rotas.sync.GET(janela('GET', '/api/local/sync'));
  check('janela: /sync devolve o estado', r.status === 200 && (await r.json()).estado === 'sincronizado', r.status);
  r = await rotas.conflitos.GET(janela('GET', '/api/local/conflitos'));
  check('janela: /conflitos lista', r.status === 200 && Array.isArray((await r.json()).dados), r.status);

  // Login offline: senha conferida com o verificador.
  r = await rotas.entrar.POST(janela('POST', '/api/local/entrar', { email: EMAIL, senha: SENHA }));
  check('login offline com a senha certa entra', r.status === 200 && (await r.json()).access_token === token, r.status);
  r = await rotas.entrar.POST(janela('POST', '/api/local/entrar', { email: EMAIL, senha: 'senha-errada' }));
  check('login offline com a senha errada é recusado', r.status === 401, r.status);

  // --- quem não é a janela não passa --------------------------------------
  const linhasAntes = banco.contar('pacientes');
  const filaAntes = banco.contarOutbox();
  const intrusos = { 'site externo': siteExterno, 'DNS rebinding': rebinding, 'outro programa': outroPrograma, 'iframe externo na janela': iframeExterno };
  const tentativas = [
    ['GET /status', (quem) => rotas.status.GET(quem('GET', '/api/local/status'))],
    ['GET /sessao', (quem) => rotas.sessao.GET(quem('GET', '/api/local/sessao'))],
    ['GET /sessao/restaurar (tokens)', (quem) => rotas.restaurar.GET(quem('GET', '/api/local/sessao/restaurar'))],
    ['POST /sessao (trocar a sessão)', (quem) => rotas.sessao.POST(quem('POST', '/api/local/sessao', { dados: { access_token: 'do-atacante', user: { id: 'x' } } }))],
    ['DELETE /sessao (deslogar)', (quem) => rotas.sessao.DELETE(quem('DELETE', '/api/local/sessao'))],
    ['POST /entrar', (quem) => rotas.entrar.POST(quem('POST', '/api/local/entrar', { email: EMAIL, senha: SENHA }))],
    ['POST /db (gravar)', (quem) => rotas.db.POST(quem('POST', '/api/local/db', pacienteNovo))],
    ['POST /db (apagar tudo)', (quem) => rotas.db.POST(quem('POST', '/api/local/db', { tabela: 'pacientes', op: 'delete', filtros: [] }))],
    ['GET /db', (quem) => rotas.db.GET(quem('GET', '/api/local/db'))],
    ['GET /sync', (quem) => rotas.sync.GET(quem('GET', '/api/local/sync'))],
    ['POST /sync', (quem) => rotas.sync.POST(quem('POST', '/api/local/sync'))],
    ['GET /conflitos', (quem) => rotas.conflitos.GET(quem('GET', '/api/local/conflitos'))],
    ['POST /conflitos', (quem) => rotas.conflitos.POST(quem('POST', '/api/local/conflitos', { id: 1, escolha: 'remoto' }))],
    ['GET /bootstrap', (quem) => rotas.bootstrap.GET(quem('GET', '/api/local/bootstrap'))],
    ['POST /bootstrap', (quem) => rotas.bootstrap.POST(quem('POST', '/api/local/bootstrap'))],
  ];
  for (const [quemNome, quem] of Object.entries(intrusos)) {
    const passou = [];
    for (const [nome, tentar] of tentativas) {
      const resposta = await tentar(quem);
      if (resposta.status !== 403) passou.push(`${nome}=${resposta.status}`);
    }
    check(`${quemNome}: 403 nas ${tentativas.length} rotas locais`, passou.length === 0, passou.join(', '));
  }
  check('nenhuma tentativa de fora alterou o banco', banco.contar('pacientes') === linhasAntes && banco.contarOutbox() === filaAntes, `${banco.contar('pacientes')} linhas`);
  check('nenhuma tentativa de fora trocou ou apagou a sessão', sessaoGuardada?.access_token === token);

  // Segredo errado, quase certo e de tamanho diferente.
  for (const [nome, valor] of [['errado', 'c3'.repeat(32)], ['com um caractere a menos', SEGREDO_JANELA.slice(0, -1)], ['vazio', '']]) {
    r = await rotas.db.POST(janela('POST', '/api/local/db', pacienteNovo, { 'x-ortus-janela': valor }));
    check(`segredo ${nome} é recusado`, r.status === 403, r.status);
  }

  // Sem o segredo configurado no servidor, nada passa (falha fechada).
  delete process.env.ORTUS_JANELA_SEGREDO;
  r = await rotas.status.GET(janela('GET', '/api/local/status'));
  check('servidor sem segredo configurado recusa todo mundo', r.status === 403, r.status);
  process.env.ORTUS_JANELA_SEGREDO = SEGREDO_JANELA;

  // --- corpo que não é JSON -----------------------------------------------
  // A janela manda sempre application/json. Formulário e text/plain são o que
  // outra página consegue mandar sem preflight: param antes de o corpo ser lido.
  const comCorpo = [
    ['POST /db', (extra) => rotas.db.POST(janela('POST', '/api/local/db', pacienteNovo, extra))],
    ['POST /sessao', (extra) => rotas.sessao.POST(janela('POST', '/api/local/sessao', { dados: { access_token: 'trocada', user: { id: USUARIO } } }, extra))],
    ['POST /entrar', (extra) => rotas.entrar.POST(janela('POST', '/api/local/entrar', { email: EMAIL, senha: SENHA }, extra))],
    ['POST /conflitos', (extra) => rotas.conflitos.POST(janela('POST', '/api/local/conflitos', { id: 1, escolha: 'remoto' }, extra))],
  ];
  for (const tipo of ['text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', '']) {
    const passou = [];
    for (const [nome, tentar] of comCorpo) {
      const resposta = await tentar({ 'content-type': tipo });
      if (resposta.status !== 415) passou.push(`${nome}=${resposta.status}`);
    }
    check(`janela com Content-Type ${tipo ? `"${tipo}"` : 'ausente'}: 415 nas ${comCorpo.length} rotas que leem corpo`, passou.length === 0, passou.join(', '));
  }
  check('corpo que não é JSON não alterou o banco nem a sessão', banco.contar('pacientes') === linhasAntes && sessaoGuardada?.access_token === token);
  r = await rotas.db.POST(janela('POST', '/api/local/db', { tabela: 'pacientes', op: 'count' }, { 'content-type': 'application/json; charset=utf-8' }));
  check('application/json com charset passa', r.status === 200 && (await r.json()).total === linhasAntes, r.status);

  // --- erro interno não vai cru para a tela --------------------------------
  const consoleErro = console.error;
  const registrados = [];
  console.error = (...args) => registrados.push(args.join(' '));
  try {
    r = await rotas.db.POST(janela('POST', '/api/local/db', { tabela: 'tabela_que_nao_existe', op: 'select' }));
  } finally {
    console.error = consoleErro;
  }
  const erroInterno = await r.json();
  check('erro do banco local volta como frase fixa', r.status === 500 && !/tabela_que_nao_existe|sincronizada/i.test(JSON.stringify(erroInterno)), JSON.stringify(erroInterno));
  check('o detalhe do erro fica no log do programa', registrados.some((linha) => linha.includes('api/local/db') && linha.includes('tabela_que_nao_existe')), registrados.join(' | ').slice(0, 200));

  // --- pela rede, de verdade ----------------------------------------------
  const servidorRotas = await servirRotas({
    '/api/local/status': rotas.status,
    '/api/local/db': rotas.db,
    '/api/local/sessao': rotas.sessao,
    '/api/local/sessao/restaurar': rotas.restaurar,
    '/api/local/entrar': rotas.entrar,
  });
  const portaRotas = servidorRotas.address().port;
  process.env.ORTUS_LOCAL_PORTA = String(portaRotas);
  try {
    const origemReal = `http://127.0.0.1:${portaRotas}`;
    const daJanela = { 'x-ortus-janela': SEGREDO_JANELA, 'sec-fetch-site': 'same-origin' };
    const contar = JSON.stringify({ tabela: 'pacientes', op: 'count' });
    const comoJanela = (extra = {}) => ({ ...daJanela, origin: origemReal, 'content-type': 'application/json', ...extra });

    let h = await pedirHttp(portaRotas, { metodo: 'POST', caminho: '/api/local/db', cabecalhos: comoJanela(), corpo: contar });
    check('HTTP: a janela (Host da porta certa + segredo) é atendida', h.status === 200 && JSON.parse(h.texto).total === linhasAntes, `${h.status} ${h.texto.slice(0, 80)}`);
    h = await pedirHttp(portaRotas, { caminho: '/api/local/sessao/restaurar', cabecalhos: daJanela });
    check('HTTP: a janela recebe a sessão para reabrir', h.status === 200 && JSON.parse(h.texto).refresh_token === 'renovacao-de-teste', h.status);

    h = await pedirHttp(portaRotas, { caminho: '/api/local/sessao/restaurar' });
    check('HTTP: sem o cabeçalho, 403 e nada de refresh_token', h.status === 403 && !h.texto.includes('renovacao-de-teste') && !h.texto.includes('refresh_token'), `${h.status} ${h.texto.slice(0, 80)}`);
    h = await pedirHttp(portaRotas, { metodo: 'POST', caminho: '/api/local/db', cabecalhos: { 'content-type': 'application/json' }, corpo: JSON.stringify(pacienteNovo) });
    check('HTTP: sem o cabeçalho não grava (403)', h.status === 403, h.status);
    h = await pedirHttp(portaRotas, { caminho: '/api/local/sessao/restaurar', cabecalhos: { ...daJanela, host: `atacante.example:${portaRotas}` } });
    check('HTTP: Host trocado (DNS rebinding), mesmo com o segredo: 403', h.status === 403 && !h.texto.includes('renovacao-de-teste'), h.status);
    h = await pedirHttp(portaRotas, { caminho: '/api/local/sessao/restaurar', cabecalhos: { ...daJanela, host: `127.0.0.1:${portaRotas + 1}` } });
    check('HTTP: Host com outra porta: 403', h.status === 403, h.status);
    h = await pedirHttp(portaRotas, { metodo: 'POST', caminho: '/api/local/db', cabecalhos: comoJanela({ origin: 'https://site-qualquer.example', 'sec-fetch-site': 'cross-site' }), corpo: contar });
    check('HTTP: Origin de outro site, mesmo com o segredo: 403', h.status === 403, h.status);
    h = await pedirHttp(portaRotas, { metodo: 'POST', caminho: '/api/local/db', cabecalhos: comoJanela({ origin: 'https://site-qualquer.example', 'sec-fetch-site': '' }), corpo: contar });
    check('HTTP: Origin de outro site sem Sec-Fetch-Site: 403', h.status === 403, h.status);
    h = await pedirHttp(portaRotas, { metodo: 'POST', caminho: '/api/local/db', cabecalhos: comoJanela({ 'content-type': 'text/plain;charset=UTF-8' }), corpo: JSON.stringify(pacienteNovo) });
    check('HTTP: text/plain, mesmo da janela: 415', h.status === 415, h.status);
    h = await pedirHttp(portaRotas, { metodo: 'POST', caminho: '/api/local/entrar', cabecalhos: { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://site-qualquer.example' }, corpo: JSON.stringify({ email: EMAIL, senha: SENHA }) });
    check('HTTP: login offline pedido por outro site (text/plain): 403 sem token', h.status === 403 && !h.texto.includes('access_token'), h.status);
    check('HTTP: nenhuma chamada de fora alterou o banco', banco.contar('pacientes') === linhasAntes, banco.contar('pacientes'));
  } finally {
    process.env.ORTUS_LOCAL_PORTA = String(PORTA_NEXT);
    await new Promise((resolve) => servidorRotas.close(() => resolve()));
  }

  // API de dados do processo principal: só os processos locais, com o segredo dela.
  const comSegredo = { 'x-ortus-db-secret': SEGREDO_DADOS };
  let d = await pedirHttp(portaDados, { caminho: '/estatisticas', cabecalhos: comSegredo });
  check('API de dados: Next local com o segredo é atendido', d.status === 200, d.status);
  d = await pedirHttp(portaDados, { caminho: '/estatisticas' });
  check('API de dados: sem o segredo, 401', d.status === 401, d.status);
  d = await pedirHttp(portaDados, { caminho: '/estatisticas', cabecalhos: { ...comSegredo, host: `atacante.example:${portaDados}` } });
  check('API de dados: Host trocado (DNS rebinding), 403', d.status === 403, d.status);
  d = await pedirHttp(portaDados, { caminho: '/estatisticas', cabecalhos: { ...comSegredo, origin: 'https://site-qualquer.example' } });
  check('API de dados: qualquer Origin (navegador), 403', d.status === 403, d.status);

  // --- logout e site ------------------------------------------------------
  r = await rotas.sessao.DELETE(janela('DELETE', '/api/local/sessao'));
  check('janela: logout apaga a sessão local', r.status === 200 && sessaoGuardada === null, r.status);

  delete process.env.ORTUS_DESKTOP;
  r = await rotas.status.GET(siteExterno('GET', '/api/local/status'));
  check('no site (fora do aplicativo) /status responde desktop: false', r.status === 200 && (await r.json()).desktop === false, r.status);
  r = await rotas.db.POST(janela('POST', '/api/local/db', pacienteNovo));
  check('no site as rotas locais continuam 404', r.status === 404, r.status);
  process.env.ORTUS_DESKTOP = '1';
} catch (err) {
  falhaGeral = err;
} finally {
  await api.fechar();
  try {
    banco.fechar();
    fs.rmSync(pasta, { recursive: true, force: true });
  } catch {
    /* pasta temporária: o sistema limpa */
  }
}

console.log('\n=== ROTAS LOCAIS (código de verdade, sem o servidor HTTP do Next) ===');
let falhas = 0;
for (const r of resultados) {
  if (!r.ok) falhas += 1;
  console.log(`${r.ok ? 'OK  ' : 'FALHA'} ${r.nome}${r.detalhe && !r.ok ? `  → ${r.detalhe}` : ''}`);
}
if (falhaGeral) console.log(`FALHA o teste parou no meio: ${falhaGeral instanceof Error ? falhaGeral.stack : falhaGeral}`);
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações OK`);
process.exit(falhas || falhaGeral ? 1 : 0);
