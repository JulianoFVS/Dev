'use strict';

const electron = require('electron');
const { app, BrowserWindow, Menu, dialog, shell } = electron;

// Se ELECTRON_RUN_AS_NODE estiver definido no ambiente (comum em terminais de
// CI/IDE), o binário do Electron roda como Node puro e não existe `app`.
// Sem este aviso o erro que aparece é "Cannot read properties of undefined".
if (!app || typeof electron !== 'object') {
  console.error(
    'Ortus Desktop precisa rodar como Electron.\n' +
      'A variável ELECTRON_RUN_AS_NODE está definida neste ambiente — rode com:\n' +
      '  env -u ELECTRON_RUN_AS_NODE npm run desktop',
  );
  process.exit(1);
}
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const env = require('./lib/env.cjs');
const caminhos = require('./lib/caminhos.cjs');
const log = require('./lib/log.cjs');
const segredos = require('./lib/segredos.cjs');
const { chaveDeServidor } = require('./lib/chavePublica.cjs');
const { cabecalhosDaJanela, urlEhLocal } = require('./lib/origemLocal.cjs');
const { portaLivre } = require('./lib/porta.cjs');
const { criarBanco } = require('./lib/sqlite.cjs');
const { criarApiDados } = require('./lib/dbApi.cjs');
const { criarSync } = require('./lib/sync.cjs');
const { criarServidorNext } = require('./lib/nextServer.cjs');
const { criarServicoWhatsapp } = require('./lib/whatsapp.cjs');

/**
 * Ponto de entrada do Ortus Desktop.
 *
 * Sobe, nesta ordem: SQLite → API de dados → sincronizador → WhatsApp →
 * servidor Next local → janela. Tudo em 127.0.0.1 e nenhuma porta fixa.
 */

// Em dev o .env.local é a fonte dos valores públicos do Supabase.
if (!app.isPackaged) env.carregar();

const DESENVOLVIMENTO = !app.isPackaged;
const VERSAO = require(path.join(__dirname, '..', 'package.json')).version;

// Em desenvolvimento usamos uma pasta separada para não misturar com os
// dados reais de uma instalação.
if (DESENVOLVIMENTO) {
  app.setPath('userData', path.join(app.getPath('appData'), 'OrtusDesktopDev'));
}
app.setName('Ortus');

/**
 * Só um Ortus aberto por máquina (evita duas cópias mexendo no mesmo SQLite).
 * `app.quit()` não interrompe este arquivo: a segunda cópia ainda chegaria ao
 * `whenReady`, por isso a inicialização confere esta constante.
 */
const INSTANCIA_UNICA = app.requestSingleInstanceLock();
if (!INSTANCIA_UNICA) {
  app.quit();
}

const estado = {
  janela: null,
  banco: null,
  apiDados: null,
  sync: null,
  next: null,
  whatsapp: null,
  portas: { db: 0, whatsapp: 0, next: 0 },
  segredos: null,
  // Segredo da prova de janela: nasce a cada execução e nunca vai para o disco.
  segredoJanela: '',
  encerrando: false,
  pronto: false,
};

// ---------------------------------------------------------------- configuração
function obterConfig() {
  const aceitar = (url, anonKey, origem) => {
    // O aplicativo nunca roda com chave de servidor, venha de onde vier.
    if (chaveDeServidor(anonKey)) {
      log.erro(`config: a chave do Supabase em ${origem} é de servidor (service role) e foi recusada`);
      return null;
    }
    return { url: String(url).replace(/\/$/, ''), anonKey: String(anonKey) };
  };

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (envUrl && envKey) {
    const doAmbiente = aceitar(envUrl, envKey, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
    if (doAmbiente) return doAmbiente;
  }

  const candidatos = [
    path.join(__dirname, 'config.json'),
    path.join(process.resourcesPath || '', 'config.json'),
  ];
  for (const arquivo of candidatos) {
    try {
      const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      if (bruto.supabaseUrl && bruto.supabaseAnonKey) {
        const doArquivo = aceitar(bruto.supabaseUrl, bruto.supabaseAnonKey, 'config.json');
        if (doArquivo) return doArquivo;
      }
    } catch {
      /* tenta o próximo */
    }
  }
  return { url: '', anonKey: '' };
}

// ------------------------------------------------------------------- sessão
function lerSessao() {
  try {
    return JSON.parse(fs.readFileSync(caminhos.sessao(app), 'utf8'));
  } catch {
    return null;
  }
}

function salvarSessao(dados) {
  const arquivo = caminhos.sessao(app);
  try {
    if (dados == null) {
      if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
      return;
    }
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), { mode: 0o600 });
  } catch (err) {
    log.aviso('sessao: falha ao gravar', err);
  }
}

// -------------------------------------------------------------------- janela
/**
 * Onde o app abre.
 *
 * Nunca na landing page (marketing não faz sentido dentro do instalador).
 * Sem sessão em cache → tela de login. Com sessão (mesmo vencida, para o modo
 * offline continuar abrindo) → direto no dashboard.
 */
function urlInicial() {
  const sessao = lerSessao();
  const caminho = sessao?.access_token ? '/dashboard' : '/login';
  return `http://127.0.0.1:${estado.portas.next}${caminho}`;
}

/**
 * Nenhuma API do Node no renderer, sem preload: a janela conversa só com o
 * Next local, por HTTP. As janelas filhas (impressão) herdam o mesmo.
 */
const PREFERENCIAS_WEB = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webviewTag: false,
  spellcheck: false,
};

/** O endereço é do próprio aplicativo (servidor local, na porta desta execução)? */
function ehInterna(url) {
  return urlEhLocal(url, estado.portas.next);
}

/** Abre no programa padrão do sistema — só esquemas que não executam nada local. */
function abrirFora(url) {
  if (/^(https?|mailto):/i.test(String(url || ''))) void shell.openExternal(url);
}

/**
 * O Electron concede toda permissão pedida (câmera, microfone, localização…).
 * As páginas do aplicativo continuam com todas; conteúdo de fora embutido na
 * janela (vídeo de tutorial) só ganha tela cheia.
 */
const PERMISSOES_DE_FORA = new Set(['fullscreen']);

function permissaoAceita(permissao, endereco) {
  const origem = String(endereco || '');
  if (ehInterna(origem) || (DESENVOLVIMENTO && origem.startsWith('devtools://'))) return true;
  return PERMISSOES_DE_FORA.has(permissao);
}

/**
 * Prova de origem: toda requisição que o próprio aplicativo faz ao Next local
 * sai com o segredo desta execução. O valor vive só neste processo e no
 * servidor local; o JavaScript da página não lê cabeçalho de requisição.
 *
 * O cabeçalho é retirado de tudo que vai para outro endereço (inclusive depois
 * de um redirecionamento) e não é posto em requisição iniciada por conteúdo
 * externo embutido na janela.
 */
function protegerSessao(sessao) {
  sessao.webRequest.onBeforeSendHeaders((detalhes, continuar) => {
    try {
      const cabecalhos = cabecalhosDaJanela({
        url: detalhes.url,
        // Ausente quando o pedido é do próprio navegador (loadURL, recarregar).
        iniciador: detalhes.initiatorOrigin,
        cabecalhos: detalhes.requestHeaders,
        porta: estado.portas.next,
        segredo: estado.segredoJanela,
      });
      continuar(cabecalhos ? { requestHeaders: cabecalhos } : {});
    } catch (err) {
      // Nunca deixar a requisição sem resposta: a janela ficaria em branco.
      log.aviso('janela: falha ao preparar a requisição', err);
      continuar({});
    }
  });
  sessao.setPermissionRequestHandler((_conteudo, permissao, decidir, detalhes) => {
    decidir(permissaoAceita(permissao, detalhes?.requestingUrl));
  });
  sessao.setPermissionCheckHandler((_conteudo, permissao, origem) => permissaoAceita(permissao, origem));
}

/**
 * Regras de navegação de qualquer conteúdo web do programa (janela principal
 * e janelas filhas): nada sai do endereço local por dentro do aplicativo.
 */
function protegerConteudo(conteudo) {
  const barrarSaida = (evento, urlLegado, _noLugar, quadroPrincipalLegado) => {
    if (!estado.portas.next) return;
    const url = evento.url || urlLegado || '';
    const quadroPrincipal = evento.isMainFrame ?? quadroPrincipalLegado;
    // Conteúdo embutido (vídeo de tutorial) segue as regras do próprio quadro.
    if (quadroPrincipal === false) return;
    if (ehInterna(url)) return;
    evento.preventDefault();
    abrirFora(url);
  };
  conteudo.on('will-navigate', barrarSaida);
  conteudo.on('will-redirect', barrarSaida);
  conteudo.on('will-attach-webview', (evento) => evento.preventDefault());

  conteudo.setWindowOpenHandler(({ url, referrer }) => {
    const pedinte = String(referrer?.url || '');
    const pedidoDoAplicativo = !pedinte || ehInterna(pedinte);
    // Janela em branco é a impressão (lib/printDocument.ts escreve o documento
    // nela). Endereço do próprio app abre aqui dentro: o navegador de fora não
    // tem a prova de janela e seria recusado pelo servidor local.
    if (pedidoDoAplicativo && (url === '' || url === 'about:blank' || ehInterna(url))) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: { ...PREFERENCIAS_WEB },
        },
      };
    }
    abrirFora(url);
    return { action: 'deny' };
  });
}

/**
 * Confere, uma vez por execução, se o servidor local aceitou a prova de janela.
 * Sem ela as rotas locais recusam a tela e o programa cairia, em silêncio, no
 * modo "site" (sem banco local e sem sincronização).
 */
function conferirProvaDeJanela(janela) {
  janela.webContents.once('did-finish-load', () => {
    janela.webContents
      .executeJavaScript(
        "fetch('/api/local/status',{cache:'no-store'}).then(function(r){return r.status}).catch(function(){return 0})",
      )
      .then((status) => {
        if (status === 200) {
          log.info('janela: prova de origem aceita pelo servidor local');
        } else if (status === 403) {
          log.erro('janela: o servidor local recusou a janela (HTTP 403); banco local e sincronização ficam inacessíveis');
          dialog.showErrorBox(
            'Ortus',
            'O servidor local não reconheceu esta janela, então o banco local e a sincronização ficaram desligados.\n\n' +
              'Feche o Ortus e abra de novo. Se o aviso voltar, envie o arquivo de log (menu Ajuda > Abrir pasta de dados > logs).',
          );
        } else {
          log.aviso(`janela: não foi possível conferir a prova de origem (HTTP ${status})`);
        }
      })
      .catch((err) => log.aviso('janela: não foi possível conferir a prova de origem', err));
  });
}

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f3f4f1',
    title: 'Ortus',
    autoHideMenuBar: true,
    webPreferences: { ...PREFERENCIAS_WEB },
  });

  janela.once('ready-to-show', () => janela.show());
  janela.on('closed', () => {
    estado.janela = null;
  });

  // Navegação e abertura de janelas: ver `protegerConteudo`, aplicado a todo
  // conteúdo web no evento `web-contents-created`.
  protegerSessao(janela.webContents.session);
  conferirProvaDeJanela(janela);

  const url = urlInicial();
  log.info(`janela: abrindo ${url}`);
  janela.loadURL(url);
  return janela;
}

function montarMenu() {
  const template = [
    {
      label: 'Ortus',
      submenu: [
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => estado.janela?.reload() },
        { type: 'separator' },
        { label: 'Sair', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        ...(DESENVOLVIMENTO ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: `Versão ${VERSAO}`,
          enabled: false,
        },
        {
          label: 'Abrir pasta de dados',
          click: () => shell.openPath(caminhos.raiz(app)),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------------- ciclo
async function iniciarTudo() {
  log.abrir(app);
  log.info(`Ortus Desktop ${VERSAO} iniciando (${DESENVOLVIMENTO ? 'dev' : 'produção'})`);
  log.info('dados em', caminhos.raiz(app));

  estado.segredos = segredos.ler(app);
  estado.segredoJanela = crypto.randomBytes(32).toString('hex');

  const config = obterConfig();
  if (!config.url || !config.anonKey) {
    log.erro('config: Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL / ..._ANON_KEY)');
    dialog.showErrorBox(
      'Configuração ausente',
      'Este instalador não veio com a configuração do Supabase. Gere o build com desktop/config.json preenchido.',
    );
    app.quit();
    return;
  }

  // 1) banco local
  estado.banco = criarBanco(caminhos.banco(app), { instalacaoId: estado.segredos.instalacaoId });
  log.info('sqlite: aberto', caminhos.banco(app));

  // 2) API de dados local
  estado.apiDados = criarApiDados({
    banco: estado.banco,
    segredo: estado.segredos.db,
    estadoSync: () => (estado.sync ? estado.sync.estado() : { estado: 'iniciando' }),
    sincronizarAgora: () => (estado.sync ? estado.sync.sincronizarAgora() : Promise.resolve({})),
    lerSessao,
    salvarSessao,
    bootstrap: () => (estado.sync ? estado.sync.bootstrap() : Promise.resolve({ ok: false })),
  });
  // Porta 0: o sistema escolhe uma livre no próprio `listen`, sem intervalo
  // entre sortear a porta e ocupá-la.
  const portaDb = await estado.apiDados.ouvir(0);
  estado.portas.db = portaDb;
  log.info(`api-dados: http://127.0.0.1:${portaDb}`);

  // 3) motor de sincronização
  estado.sync = criarSync({
    banco: estado.banco,
    obterConfig: () => config,
    obterSessao: lerSessao,
    definirSessao: salvarSessao,
    aoMudarEstado: (novo) => {
      if (estado.janela && !estado.janela.isDestroyed()) {
        estado.janela.webContents.send('ortus:sync', novo);
      }
    },
  });

  // 4) WhatsApp local (não bloqueia a janela se falhar)
  const portaWhats = await portaLivre();
  estado.portas.whatsapp = portaWhats;
  const pastaSessoes = caminhos.wwebjsRaiz(app);
  estado.whatsapp = criarServicoWhatsapp({
    app,
    porta: portaWhats,
    segredo: estado.segredos.whatsapp,
    pastaSessoes,
    recursos: process.resourcesPath || __dirname,
    raiz: path.join(__dirname, '..'),
    desenvolvimento: DESENVOLVIMENTO,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: config.url,
      // Sem service role: o agendador fala com a API de dados local.
      ORTUS_DB_URL: `http://127.0.0.1:${portaDb}`,
      ORTUS_DB_SEGREDO: estado.segredos.db,
    },
  });
  void estado.whatsapp.iniciar();

  // 5) servidor Next local
  const portaNext = await portaLivre();
  estado.portas.next = portaNext;
  const arquivos = caminhos.arquivos(app);
  estado.next = criarServidorNext({
    app,
    porta: portaNext,
    desenvolvimento: DESENVOLVIMENTO,
    raiz: path.join(__dirname, '..'),
    recursos: process.resourcesPath || __dirname,
    env: {
      ORTUS_DESKTOP: '1',
      ORTUS_VERSAO: VERSAO,
      ORTUS_DB_URL: `http://127.0.0.1:${portaDb}`,
      ORTUS_DB_SEGREDO: estado.segredos.db,
      // Prova de janela: o Next local só atende quem trouxer este segredo,
      // com `Host` nesta porta (lib/local/janela.ts).
      ORTUS_JANELA_SEGREDO: estado.segredoJanela,
      ORTUS_LOCAL_PORTA: String(portaNext),
      ORTUS_ARQUIVOS_DIR: arquivos,
      WHATSAPP_GATEWAY_URL: `http://127.0.0.1:${portaWhats}`,
      WHATSAPP_GATEWAY_SECRET: estado.segredos.whatsapp,
      NEXT_PUBLIC_SUPABASE_URL: config.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
      NEXT_PUBLIC_WHATSAPP_ATIVO: '1',
      WHATSAPP_CONFIGURADO: '1',
    },
  });

  try {
    await estado.next.iniciar();
  } catch (err) {
    log.erro('next: não subiu', err);
    dialog.showErrorBox('Falha ao iniciar', `O servidor local não respondeu.\n\n${err instanceof Error ? err.message : err}`);
    app.quit();
    return;
  }

  // 6) janela
  montarMenu();
  estado.janela = criarJanela();
  estado.sync.iniciar();
  estado.pronto = true;
  log.info(`tudo pronto: next=${portaNext} db=${portaDb} whatsapp=${portaWhats}`);
}

// ------------------------------------------------------------------ encerrar
async function encerrarTudo(motivo) {
  if (estado.encerrando) return;
  estado.encerrando = true;
  log.info('encerrando:', motivo);

  try {
    if (estado.sync) estado.sync.parar();
  } catch {
    /* ignora */
  }
  try {
    if (estado.whatsapp) estado.whatsapp.parar();
  } catch {
    /* ignora */
  }
  try {
    if (estado.next) await estado.next.parar();
  } catch {
    /* ignora */
  }
  try {
    if (estado.apiDados) await estado.apiDados.fechar();
  } catch {
    /* ignora */
  }
  try {
    if (estado.banco) estado.banco.fechar();
  } catch {
    /* ignora */
  }
  log.info('encerrado');
}

// -------------------------------------------------------------------- eventos
app.on('second-instance', () => {
  if (estado.janela) {
    if (estado.janela.isMinimized()) estado.janela.restore();
    estado.janela.focus();
  }
});

// Vale para a janela principal e para qualquer janela filha (impressão).
app.on('web-contents-created', (_evento, conteudo) => {
  protegerConteudo(conteudo);
});

app.whenReady().then(() => {
  if (!INSTANCIA_UNICA) return;
  iniciarTudo().catch((err) => {
    log.erro('inicialização falhou', err);
    dialog.showErrorBox('Ortus', `Não foi possível iniciar.\n\n${err instanceof Error ? err.message : err}`);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (evento) => {
  if (estado.encerrando) return;
  evento.preventDefault();
  void encerrarTudo('before-quit').finally(() => {
    estado.encerrando = true;
    app.exit(0);
  });
});

process.on('uncaughtException', (err) => log.erro('uncaughtException', err));
process.on('unhandledRejection', (err) => log.erro('unhandledRejection', err));

module.exports = { obterConfig, lerSessao, salvarSessao };
