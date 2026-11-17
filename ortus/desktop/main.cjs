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
const fs = require('node:fs');
const path = require('node:path');

const env = require('./lib/env.cjs');
const caminhos = require('./lib/caminhos.cjs');
const log = require('./lib/log.cjs');
const segredos = require('./lib/segredos.cjs');
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

/** Só um Ortus aberto por máquina (evita duas cópias mexendo no mesmo SQLite). */
if (!app.requestSingleInstanceLock()) {
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
  encerrando: false,
  pronto: false,
};

// ---------------------------------------------------------------- configuração
function obterConfig() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (envUrl && envKey) return { url: envUrl.replace(/\/$/, ''), anonKey: envKey };

  const candidatos = [
    path.join(__dirname, 'config.json'),
    path.join(process.resourcesPath || '', 'config.json'),
  ];
  for (const arquivo of candidatos) {
    try {
      const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      if (bruto.supabaseUrl && bruto.supabaseAnonKey) {
        return { url: String(bruto.supabaseUrl).replace(/\/$/, ''), anonKey: String(bruto.supabaseAnonKey) };
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
    webPreferences: {
      // A janela conversa só com o Next local; nenhuma API do Node no renderer.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  janela.once('ready-to-show', () => janela.show());
  janela.on('closed', () => {
    estado.janela = null;
  });

  // Links externos abrem no navegador, nunca dentro do app.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!estado.portas.next) return;
    const esperado = `http://127.0.0.1:${estado.portas.next}`;
    if (!url.startsWith(esperado)) {
      evento.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

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
  const portaDb = await portaLivre();
  estado.portas.db = portaDb;
  estado.apiDados = criarApiDados({
    banco: estado.banco,
    segredo: estado.segredos.db,
    estadoSync: () => (estado.sync ? estado.sync.estado() : { estado: 'iniciando' }),
    sincronizarAgora: () => (estado.sync ? estado.sync.sincronizarAgora() : Promise.resolve({})),
    lerSessao,
    salvarSessao,
    bootstrap: () => (estado.sync ? estado.sync.bootstrap() : Promise.resolve({ ok: false })),
  });
  await estado.apiDados.ouvir(portaDb);
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
      ORTUS_ARQUIVOS_DIR: arquivos,
      WHATSAPP_GATEWAY_URL: `http://127.0.0.1:${portaWhats}`,
      WHATSAPP_GATEWAY_SECRET: estado.segredos.whatsapp,
      NEXT_PUBLIC_SUPABASE_URL: config.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
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

app.whenReady().then(() => {
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
