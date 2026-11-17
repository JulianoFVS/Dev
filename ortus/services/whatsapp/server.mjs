import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarRepositorio } from './lib/repositorio.mjs';

const require = createRequire(import.meta.url);
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const RAIZ = path.dirname(fileURLToPath(import.meta.url));

carregarEnvLocal();

// SQLite da clínica (desktop) ou Supabase com service role (nuvem). Escolhido
// por ORTUS_LOCAL_DB, que o Electron injeta no processo filho.
const repositorio = criarRepositorio();
const AGENDADOR_ATIVO = repositorio.agendadorAtivo;

const PASTA_SESSAO = process.env.WHATSAPP_DATA_DIR || path.join(RAIZ, '.wwebjs_auth');
const SEGREDO = process.env.WHATSAPP_GATEWAY_SECRET || '';
// Railway, Render e afins informam a porta em PORT e exigem ouvir em todas as interfaces.
const PORTA = Number(process.env.WHATSAPP_GATEWAY_PORT || process.env.PORT || 3920);
const HOST = process.env.WHATSAPP_GATEWAY_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
// O sandbox do editor aponta o cache do Puppeteer para um Chrome incompleto.
if ((process.env.PUPPETEER_CACHE_DIR || '').includes('cursor-sandbox-cache')) {
  delete process.env.PUPPETEER_CACHE_DIR;
}
const CHROME_EXPLICITO = process.env.PUPPETEER_EXECUTABLE_PATH || '';
const CHROME = CHROME_EXPLICITO && !CHROME_EXPLICITO.includes('cursor-sandbox-cache') && existsSync(CHROME_EXPLICITO)
  ? CHROME_EXPLICITO
  : undefined;
const FUSO = 'America/Sao_Paulo';
const CORPO_MAXIMO = 64_000;
const CORPO_MAXIMO_MIDIA = 6_000_000;

if (!SEGREDO) {
  console.error('Defina WHATSAPP_GATEWAY_SECRET (no .env.local ou nas variáveis do servidor) antes de subir o WhatsApp.');
  process.exit(1);
}
if (!AGENDADOR_ATIVO) {
  if (repositorio.modalidade === 'local') {
    console.warn('ORTUS_LOCAL_DB=1 sem ORTUS_DB_URL e ORTUS_DB_SEGREDO: mensagens automáticas e agendadas ficam desligadas.');
  } else {
    console.warn('Sem NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY: mensagens automáticas e agendadas ficam desligadas.');
  }
}

/** @type {Map<string, any>} */
const sessoes = new Map();

function carregarEnvLocal() {
  const arquivo = path.resolve(RAIZ, '../../.env.local');
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
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
  }
}

function erroHttp(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

function espera(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clinicaValida(id) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

function segredoOk(recebido) {
  const a = Buffer.from(String(recebido || ''));
  const b = Buffer.from(SEGREDO);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function digitosTelefone(telefone) {
  let digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (!digitos.startsWith('55') && (digitos.length === 10 || digitos.length === 11)) digitos = `55${digitos}`;
  if (digitos.length < 12 || digitos.length > 15) return null;
  return digitos;
}

function chatValido(id) {
  return /^[\d-]+@(c\.us|g\.us|lid|s\.whatsapp\.net)$/.test(String(id || ''));
}

function mensagemValida(id) {
  return /^[\w@.:-]{6,200}$/.test(String(id || ''));
}

/** Telefone do contato a partir do id do chat (`5511...@c.us`). */
function telefoneDoChat(chatId) {
  const texto = String(chatId || '');
  if (!/@(c\.us|s\.whatsapp\.net)$/.test(texto)) return null;
  const digitos = texto.split('@')[0].replace(/\D/g, '');
  return digitos || null;
}

/** Nome do contato que o WhatsApp Web traz no payload da mensagem. */
function nomeDoContato(msg) {
  if (!msg) return null;
  const candidatos = [msg._data?.notifyName, msg.notifyName, msg._data?.senderName, msg.contact?.name, msg.contact?.pushname];
  for (const valor of candidatos) {
    if (typeof valor === 'string' && valor.trim()) return valor.trim().slice(0, 120);
  }
  return null;
}

function valorId(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor;
  return typeof valor._serialized === 'string' ? valor._serialized : null;
}

function normalizarChatId(id) {
  const texto = valorId(id) || '';
  return texto.endsWith('@s.whatsapp.net') ? texto.replace('@s.whatsapp.net', '@c.us') : texto;
}

// ---------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------

function criarSessao(clinicaId) {
  const sessao = {
    clinicaId,
    status: 'iniciando',
    qr: null,
    numero: null,
    nome: null,
    erro: null,
    vistos: new Set(),
    mensagens: new Map(),
    conversas: [],
    conversasEm: 0,
    lids: new Map(),
    diario: {},
    client: null,
    // Fila de gravação no banco: mantém a ordem e não perde mensagem quando o
    // WhatsApp entrega várias de uma vez.
    gravacao: Promise.resolve(),
  };

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: clinicaId, dataPath: PASTA_SESSAO }),
    puppeteer: {
      headless: true,
      executablePath: CHROME,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  });
  sessao.client = client;

  client.on('qr', async (qr) => {
    sessao.status = 'qr';
    sessao.erro = null;
    try {
      sessao.qr = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
    } catch (err) {
      sessao.erro = err instanceof Error ? err.message : 'Falha ao gerar o QR.';
    }
  });

  client.on('authenticated', () => {
    if (sessao.status !== 'conectado') sessao.status = 'iniciando';
    sessao.qr = null;
  });

  function marcarConectado(numero, nome) {
    if (sessao.status === 'conectado') return;
    sessao.status = 'conectado';
    sessao.qr = null;
    sessao.erro = null;
    if (numero) sessao.numero = numero;
    if (nome) sessao.nome = nome;
    console.log(`[${clinicaId}] conectado como ${sessao.numero}`);
  }

  client.on('ready', () => {
    void garantirOuvintes(sessao);
    marcarConectado(client.info?.wid?.user || null, client.info?.pushname || null);
  });

  client.on('auth_failure', () => {
    sessao.status = 'falha';
    sessao.qr = null;
    sessao.erro = 'Não foi possível autenticar. Gere o QR de novo.';
  });

  client.on('disconnected', (motivo) => {
    sessao.status = 'desconectado';
    sessao.qr = null;
    sessao.numero = null;
    sessao.erro = motivo === 'LOGOUT' ? 'A sessão foi encerrada no celular.' : 'O WhatsApp desconectou.';
  });

  client.on('message', (msg) => {
    guardarMensagem(sessao, msg);
    sessao.conversasEm = 0;
  });
  client.on('message_create', (msg) => {
    if (msg.fromMe) {
      guardarMensagem(sessao, msg);
      sessao.conversasEm = 0;
    }
  });

  console.log(`[${clinicaId}] abrindo navegador`);
  client.initialize().catch((err) => {
    sessao.status = 'falha';
    sessao.erro = err instanceof Error ? err.message : 'Falha ao abrir o WhatsApp.';
    console.error(`[${clinicaId}] ${sessao.erro}`);
  });

  // O WhatsApp às vezes termina a sincronização antes do evento ready.
  const vigia = setInterval(async () => {
    if (sessao.status !== 'iniciando') {
      clearInterval(vigia);
      return;
    }
    try {
      const pagina = sessao.client?.pupPage;
      if (!pagina) return;
      const info = await pagina.evaluate(() => {
        const Socket = window.require?.('WAWebSocketModel')?.Socket;
        if (!Socket?.hasSynced || typeof window.WWebJS === 'undefined') return null;
        const me = window.require('WAWebUserPrefsMeUser');
        const pn = me.getMaybeMePnUser?.() || me.getMaybeMeLidUser?.();
        return { numero: pn?.user || null };
      });
      if (!info) return;
      await garantirOuvintes(sessao);
      marcarConectado(info.numero, null);
      clearInterval(vigia);
    } catch {
      // A página ainda está abrindo.
    }
  }, 2000);
  setTimeout(() => clearInterval(vigia), 120000);
  observarNovas(sessao);

  return sessao;
}

async function garantirOuvintes(sessao) {
  if (!sessao.client?.attachEventListeners) return;
  if (!sessao.ouvintes) {
    sessao.ouvintes = true;
    try {
      await sessao.client.attachEventListeners();
    } catch {
      sessao.ouvintes = false;
    }
  }
  await instalarHook(sessao);
}

function textoErro(err) {
  return err instanceof Error ? err.message : String(err);
}

function erroDePagina(err) {
  return /detached Frame|Execution context was destroyed|Session closed|Target closed|Protocol error|Cannot find context|main frame too early/i.test(textoErro(err));
}

async function paginaViva(page) {
  if (!page || page.isClosed?.()) return false;
  for (let i = 0; i < 2; i++) {
    try {
      await page.evaluate(() => true);
      return true;
    } catch (err) {
      if (!erroDePagina(err) || i === 1) return false;
      await espera(300);
    }
  }
  return false;
}

async function religarPaginaAgora(sessao, forcar) {
  if (!forcar && sessao.religarEm && Date.now() - sessao.religarEm < 4000) return false;
  sessao.religarEm = Date.now();
  const client = sessao.client;
  const browser = client?.pupBrowser;
  if (!browser) return false;
  let pages = [];
  try {
    pages = await browser.pages();
  } catch {
    return false;
  }
  const pagina = pages.find((p) => !p.isClosed() && /web\.whatsapp\.com/.test(p.url() || ''));
  if (!pagina) return false;
  client.pupPage = pagina;
  sessao.hook = false;
  sessao.ouvintes = false;
  try {
    const pronta = await pagina.evaluate(() => typeof window.WWebJS !== 'undefined' && typeof window.WWebJS.getChat === 'function');
    if (!pronta) await client.inject();
  } catch (err) {
    console.error(`[${sessao.clinicaId}] página:`, textoErro(err));
    return false;
  }
  await garantirOuvintes(sessao);
  console.log(`[${sessao.clinicaId}] página do WhatsApp recuperada`);
  return true;
}

function religarPagina(sessao, forcar) {
  if (!sessao.religando) {
    sessao.religando = religarPaginaAgora(sessao, forcar).finally(() => {
      sessao.religando = null;
    });
  }
  return sessao.religando;
}

async function garantirPagina(sessao) {
  if (await paginaViva(sessao.client?.pupPage)) return;
  const ok = await religarPagina(sessao, true);
  if (!ok) throw erroHttp(503, 'O WhatsApp atualizou a tela. Tente enviar de novo.');
}

async function lerNaPagina(sessao, fn) {
  try {
    await garantirPagina(sessao);
    return await fn();
  } catch (err) {
    if (!erroDePagina(err)) throw err;
    sessao.hook = false;
    if (!(await religarPagina(sessao, true))) throw err;
    return await fn();
  }
}

async function instalarHook(sessao) {
  if (!sessao.client?.pupPage) return;
  if (sessao.hook) {
    const segue = await sessao.client.pupPage.evaluate(() => !!window.__ortusHook).catch(() => false);
    if (segue) return;
    sessao.hook = false;
  }
  const instalado = await sessao.client.pupPage.evaluate(() => {
    if (window.__ortusHook) return true;
    if (typeof window.WWebJS === 'undefined' || typeof window.require !== 'function') return false;
    let Msg;
    try {
      Msg = window.require('WAWebCollections').Msg;
    } catch {
      return false;
    }
    if (!Msg?.on) return false;
    window.__ortusHook = true;
    window.__ortusFila = [];
    const serial = (valor) => {
      if (!valor) return null;
      if (typeof valor === 'string') return valor;
      return typeof valor._serialized === 'string' ? valor._serialized : null;
    };
    const enxugar = (msg) => {
      if (!msg || !msg.id || msg.isNotification) return null;
      const remote = serial(msg.id.remote);
      if (!remote || remote === 'status@broadcast') return null;
      const deMim = !!msg.id.fromMe;
      const bruto = typeof msg.id.id === 'string' ? msg.id.id : '';
      const ident = typeof msg.id._serialized === 'string' && msg.id._serialized
        ? msg.id._serialized
        : (bruto ? `${deMim ? 'true' : 'false'}_${remote}_${bruto}` : null);
      if (!ident) return null;
      const tipo = msg.type || 'chat';
      const corpo = (typeof msg.body === 'string' && msg.body) || (typeof msg.caption === 'string' && msg.caption) || '';
      return {
        id: { fromMe: deMim, remote, id: bruto || null, _serialized: ident },
        fromMe: deMim,
        from: serial(msg.from),
        to: serial(msg.to),
        chatId: remote,
        body: corpo,
        type: tipo,
        timestamp: msg.t || 0,
        ack: typeof msg.ack === 'number' ? msg.ack : null,
        hasMedia: ['image', 'video', 'audio', 'ptt', 'document', 'sticker'].includes(tipo) || !!msg.directPath,
        mimetype: typeof msg.mimetype === 'string' ? msg.mimetype : null,
        filename: typeof msg.filename === 'string' ? msg.filename : null,
        notifyName: typeof msg.notifyName === 'string' ? msg.notifyName : null,
      };
    };
    const guardar = (msg) => {
      if (!msg || msg.isNotification) return;
      const recente = msg.isNewMsg || (msg.t && Date.now() / 1000 - msg.t < 120);
      if (!recente) return;
      const modelo = enxugar(msg);
      if (!modelo?.id) return;
      window.__ortusFila.push(modelo);
      if (window.__ortusFila.length > 300) window.__ortusFila.splice(0, window.__ortusFila.length - 300);
    };
    Msg.on('add', guardar);
    Msg.on('change:ack', (msg) => {
      if (!msg || msg.isNotification) return;
      const modelo = enxugar(msg);
      if (modelo?.id) window.__ortusFila.push(modelo);
    });
    return true;
  }).catch(() => false);
  if (instalado) sessao.hook = true;
}

function observarNovas(sessao) {
  if (sessao.observador) return;
  sessao.observador = setInterval(() => {
    void drenarNovas(sessao);
  }, 1000);
}

async function drenarNovas(sessao) {
  if (sessao.status !== 'conectado' || !sessao.client?.pupPage || sessao.drenando) return;
  sessao.drenando = true;
  try {
    if (!(await paginaViva(sessao.client.pupPage))) {
      await religarPagina(sessao, false);
      return;
    }
    await instalarHook(sessao);
    const novas = await sessao.client.pupPage.evaluate(() => {
      const fila = Array.isArray(window.__ortusFila) ? window.__ortusFila.splice(0) : [];
      return fila;
    });
    if (novas?.length) {
      for (const msg of novas) guardarMensagem(sessao, msg);
    }
  } catch (err) {
    if (erroDePagina(err)) {
      sessao.hook = false;
      await religarPagina(sessao, false);
    }
  } finally {
    sessao.drenando = false;
  }
}

function guardarMensagem(sessao, msg) {
  const dados = descreverMensagem(msg);
  if (!dados) return;
  if (!String(dados.id).startsWith('local-')) {
    for (const listaSalva of sessao.mensagens.values()) {
      const eco = listaSalva.findIndex((item) => String(item.id).startsWith('local-') && item.deMim === dados.deMim && item.texto === dados.texto && Math.abs(item.em - dados.em) < 60000);
      if (eco >= 0) {
        sessao.vistos.delete(listaSalva[eco].id);
        listaSalva.splice(eco, 1);
      }
    }
  }
  const lista = sessao.mensagens.get(dados.chatId) || [];
  if (sessao.vistos.has(dados.id)) {
    let noLugarCerto = false;
    for (const [chave, listaSalva] of sessao.mensagens) {
      const indice = listaSalva.findIndex((item) => item.id === dados.id);
      if (indice < 0) continue;
      const item = listaSalva[indice];
      if (typeof dados.ack === 'number' && (item.ack ?? -1) < dados.ack) item.ack = dados.ack;
      if (!item.autor && dados.contatoNome) item.autor = dados.contatoNome;
      if (chave === dados.chatId) {
        item.deMim = dados.deMim;
        noLugarCerto = true;
        continue;
      }
      listaSalva.splice(indice, 1);
      item.chatId = dados.chatId;
      item.deMim = dados.deMim;
      if (!lista.some((outro) => outro.id === dados.id)) lista.push(item);
    }
    if (noLugarCerto || lista.some((item) => item.id === dados.id)) {
      lista.sort((a, b) => a.em - b.em);
      sessao.mensagens.set(dados.chatId, lista);
      return;
    }
  }
  sessao.vistos.add(dados.id);
  lista.push({
    id: dados.id,
    chatId: dados.chatId,
    deMim: dados.deMim,
    texto: dados.texto,
    tipo: dados.tipo,
    temMidia: dados.temMidia,
    arquivo: dados.arquivo,
    em: dados.em,
    ack: dados.ack,
    autor: dados.contatoNome || null,
  });
  lista.sort((a, b) => a.em - b.em);
  if (lista.length > 120) lista.splice(0, lista.length - 120);
  sessao.mensagens.set(dados.chatId, lista);
  espelharMensagem(sessao, dados);
  // O Map acima é só o cache da tela; a verdade (quando há banco local) é o SQLite.
  if (!String(dados.id).startsWith('local-')) persistirMensagem(sessao, dados);
}

function espelharMensagem(sessao, dados) {
  const relacionados = idsRelacionados(sessao, dados.chatId).filter((id) => id !== dados.chatId);
  for (const id of relacionados) {
    const lista = sessao.mensagens.get(id) || [];
    if (lista.some((item) => item.id === dados.id)) continue;
    lista.push({ ...dados, chatId: id, autor: dados.contatoNome || null });
    lista.sort((a, b) => a.em - b.em);
    if (lista.length > 120) lista.splice(0, lista.length - 120);
    sessao.mensagens.set(id, lista);
  }
}

function idsRelacionados(sessao, chatId) {
  const ids = new Set([chatId].filter(Boolean));
  const direto = sessao.lids?.get(chatId);
  if (direto) ids.add(direto);
  if (sessao.lids) {
    for (const [lid, pn] of sessao.lids) {
      if (pn === chatId) ids.add(lid);
    }
  }
  return [...ids];
}

/**
 * Normaliza a mensagem do whatsapp-web.js para o que a tela usa e para as
 * colunas de `whatsapp_mensagens`.
 */
function idDaMensagem(msg) {
  if (!msg) return null;
  const idObj = msg.id && typeof msg.id === 'object' ? msg.id : null;
  if (typeof idObj?._serialized === 'string') return idObj._serialized;
  if (typeof msg.id === 'string') return msg.id;
  const remote = typeof idObj?.remote === 'string' ? idObj.remote : idObj?.remote?._serialized;
  if (remote && idObj?.id) return `${idObj.fromMe ? 'true' : 'false'}_${remote}_${idObj.id}`;
  return null;
}

function descreverMensagem(msg) {
  if (!msg) return null;
  const idObj = msg.id && typeof msg.id === 'object' ? msg.id : null;
  const id = idDaMensagem(msg);
  if (!id) return null;
  const deMim = !!(msg.fromMe ?? idObj?.fromMe);
  const remoto = normalizarChatId(typeof msg.chatId === 'string' ? msg.chatId : (typeof idObj?.remote === 'string' ? idObj.remote : idObj?.remote?._serialized));
  const chatId = chatValido(remoto) ? remoto : normalizarChatId(valorId(deMim ? msg.to : msg.from));
  if (!chatId || chatId === 'status@broadcast') return null;
  const segundos = Number(msg.timestamp || msg.t || 0);
  const em = segundos > 1e12 ? segundos : (segundos || Math.floor(Date.now() / 1000)) * 1000;
  const mimetype = typeof msg._data?.mimetype === 'string' ? msg._data.mimetype : (typeof msg.mimetype === 'string' ? msg.mimetype : null);
  return {
    id,
    chatId,
    deMim,
    texto: msg.body || msg.caption || '',
    tipo: msg.type || 'chat',
    temMidia: !!(msg.hasMedia || msg.directPath),
    arquivo: msg._data?.filename || msg.filename || null,
    em,
    ack: typeof msg.ack === 'number' ? msg.ack : null,
    contatoNome: (typeof msg.notifyName === 'string' && msg.notifyName.trim()) ? msg.notifyName.trim().slice(0, 120) : nomeDoContato(msg),
    contatoTelefone: telefoneDoChat(chatId),
    midiaTipo: mimetype,
  };
}

function persistirMensagem(sessao, dados) {
  sessao.gravacao = sessao.gravacao
    .then(() => repositorio.salvarMensagem(sessao.clinicaId, dados))
    .catch((err) => {
      console.error(`[${sessao.clinicaId}] mensagem não gravada:`, err instanceof Error ? err.message : err);
    });
}

function resumo(sessao) {
  return {
    status: sessao?.status || 'desconectado',
    qr: sessao?.status === 'qr' ? sessao.qr : null,
    numero: sessao?.numero || null,
    nome: sessao?.nome || null,
    erro: sessao?.erro || null,
    agendador: AGENDADOR_ATIVO,
  };
}

function iniciar(clinicaId) {
  const atual = sessoes.get(clinicaId);
  if (atual && (atual.status === 'conectado' || atual.status === 'qr' || atual.status === 'iniciando')) {
    return resumo(atual);
  }
  if (atual?.client) {
    atual.client.destroy().catch(() => {});
  }
  const sessao = criarSessao(clinicaId);
  sessoes.set(clinicaId, sessao);
  return resumo(sessao);
}

async function encerrar(clinicaId) {
  const sessao = sessoes.get(clinicaId);
  sessoes.delete(clinicaId);
  if (sessao) {
    if (sessao.observador) clearInterval(sessao.observador);
    try { await sessao.client.logout(); } catch { /* sessão já caída */ }
    try { await sessao.client.destroy(); } catch { /* navegador já fechado */ }
  }
  return resumo(undefined);
}

function restaurarSessoesSalvas() {
  if (!existsSync(PASTA_SESSAO)) return;
  for (const entrada of readdirSync(PASTA_SESSAO, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith('session-')) continue;
    const clinicaId = entrada.name.slice('session-'.length);
    if (!clinicaValida(clinicaId)) continue;
    console.log(`[${clinicaId}] restaurando sessão salva`);
    iniciar(clinicaId);
  }
}

// ---------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------

function exigirConectado(sessao) {
  if (!sessao || sessao.status !== 'conectado') throw erroHttp(409, 'WhatsApp desconectado.');
}

async function lerConversas(client) {
  return client.pupPage.evaluate(async () => {
    const serial = (valor) => {
      if (!valor) return null;
      if (typeof valor === 'string') return valor;
      return typeof valor._serialized === 'string' ? valor._serialized : null;
    };
    const rotulo = {
      image: 'Foto', video: 'Vídeo', audio: 'Áudio', ptt: 'Áudio', document: 'Documento',
      sticker: 'Figurinha', location: 'Localização', vcard: 'Contato', call_log: 'Ligação',
    };
    const lista = window.require('WAWebCollections').Chat.getModelsArray();
    const saida = [];
    for (const chat of lista) {
      const id = serial(chat?.id);
      if (!id || id === 'status@broadcast') continue;
      const msgs = chat.msgs?.getModelsArray?.() || [];
      const ultima = [...msgs].reverse().find((m) => m && m.id && !m.isNotification) || null;
      const tipo = ultima?.type || '';
      const texto = (typeof ultima?.body === 'string' && ultima.body)
        || (typeof ultima?.caption === 'string' && ultima.caption)
        || rotulo[tipo]
        || '';
      const servidor = chat.id?.server || id.split('@')[1];
      saida.push({
        id,
        nome: chat.formattedTitle || chat.name || chat.id?.user || id.split('@')[0],
        telefone: servidor === 'c.us' ? chat.id.user : null,
        grupo: servidor === 'g.us' || !!chat.groupMetadata,
        ultima: texto,
        ultimaDeMim: !!ultima?.id?.fromMe,
        em: (chat.t || ultima?.t || 0) * 1000,
        naoLidas: chat.unreadCount || 0,
      });
    }
    saida.sort((a, b) => b.em - a.em);
    return saida.slice(0, 80);
  });
}

async function telefoneDoLid(sessao, lid) {
  const guardado = sessao.lids?.get(lid);
  if (guardado) return guardado;
  try {
    const pares = await sessao.client.getContactLidAndPhone([lid]);
    const pn = normalizarChatId(pares?.[0]?.pn);
    if (pn.endsWith('@c.us')) {
      sessao.lids?.set(lid, pn);
      return pn;
    }
  } catch {
    // O contato ainda não tem o telefone resolvido.
  }
  return null;
}

async function completarTelefones(sessao, conversas) {
  const faltam = conversas.filter((c) => String(c.id).endsWith('@lid') && !c.telefone && !sessao.lids.has(c.id));
  if (faltam.length) {
    try {
      const pares = await sessao.client.getContactLidAndPhone(faltam.map((c) => c.id));
      for (const par of pares || []) {
        const pn = normalizarChatId(par?.pn);
        if (par?.lid) sessao.lids.set(par.lid, pn.endsWith('@c.us') ? pn : '');
      }
    } catch {
      // A lista abre mesmo sem o telefone.
    }
  }
  return conversas.map((c) => {
    if (c.telefone || !String(c.id).endsWith('@lid')) return c;
    const pn = sessao.lids.get(c.id);
    const fone = pn ? telefoneDoChat(pn) : null;
    return fone ? { ...c, telefone: fone } : c;
  });
}

async function listarConversas(clinicaId, sessao) {
  // Sem WhatsApp conectado a lista vem do SQLite (histórico local da clínica).
  if (!sessao || sessao.status !== 'conectado') return repositorio.listarConversas(clinicaId);
  const agora = Date.now();
  if (agora - sessao.conversasEm < 6000 && sessao.conversas.length) return sessao.conversas;
  try {
    const lidas = await lerNaPagina(sessao, () => lerConversas(sessao.client));
    sessao.conversas = await completarTelefones(sessao, lidas);
    sessao.conversasEm = agora;
    return sessao.conversas;
  } catch (err) {
    const doBanco = await repositorio.listarConversas(clinicaId);
    if (doBanco.length) return doBanco;
    if (sessao.conversas.length) return sessao.conversas;
    throw err;
  }
}

async function buscarMensagens(client, chatId) {
  return client.pupPage.evaluate(async (id) => {
    const serial = (valor) => {
      if (!valor) return null;
      if (typeof valor === 'string') return valor;
      return typeof valor._serialized === 'string' ? valor._serialized : null;
    };
    const enxugar = (msg) => {
      if (!msg || !msg.id || msg.isNotification) return null;
      const remote = serial(msg.id.remote);
      if (!remote || remote === 'status@broadcast') return null;
      const deMim = !!msg.id.fromMe;
      const bruto = typeof msg.id.id === 'string' ? msg.id.id : '';
      const ident = typeof msg.id._serialized === 'string' && msg.id._serialized
        ? msg.id._serialized
        : (bruto ? `${deMim ? 'true' : 'false'}_${remote}_${bruto}` : null);
      if (!ident) return null;
      const tipo = msg.type || 'chat';
      const corpo = (typeof msg.body === 'string' && msg.body) || (typeof msg.caption === 'string' && msg.caption) || '';
      return {
        id: { fromMe: deMim, remote, id: bruto || null, _serialized: ident },
        fromMe: deMim,
        from: serial(msg.from),
        to: serial(msg.to),
        chatId: remote,
        body: corpo,
        type: tipo,
        timestamp: msg.t || 0,
        ack: typeof msg.ack === 'number' ? msg.ack : null,
        hasMedia: ['image', 'video', 'audio', 'ptt', 'document', 'sticker'].includes(tipo) || !!msg.directPath,
        mimetype: typeof msg.mimetype === 'string' ? msg.mimetype : null,
        filename: typeof msg.filename === 'string' ? msg.filename : null,
        notifyName: typeof msg.notifyName === 'string' ? msg.notifyName : null,
      };
    };
    const filtro = (m) => m && m.id && !m.isNotification;
    const chat = await window.WWebJS.getChat(id, { getAsModel: false });
    let msgs = chat?.msgs?.getModelsArray ? chat.msgs.getModelsArray().filter(filtro) : [];
    if (chat && msgs.length < 80) {
      try {
        const anteriores = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
        if (anteriores?.length) msgs = [...anteriores.filter(filtro), ...msgs];
      } catch {
        // Fica com as mensagens que já estão abertas.
      }
    }
    try {
      const todas = window.require('WAWebCollections').Msg.getModelsArray();
      for (const m of todas) {
        if (!filtro(m)) continue;
        if (serial(m.id?.remote) === id) msgs.push(m);
      }
    } catch {
      // A coleção geral ainda não está pronta.
    }
    const vistos = new Set();
    const unicos = [];
    for (const m of msgs) {
      const remote = serial(m.id?.remote);
      const bruto = typeof m.id?.id === 'string' ? m.id.id : '';
      const chave = remote && bruto ? `${m.id.fromMe ? '1' : '0'}_${remote}_${bruto}` : '';
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      unicos.push(m);
    }
    unicos.sort((a, b) => (a.t || 0) - (b.t || 0));
    const saida = [];
    for (const m of unicos.slice(-80)) {
      const item = enxugar(m);
      if (item && (item.chatId === id || item.from === id || item.to === id)) saida.push(item);
    }
    return saida;
  }, chatId);
}

function juntarMensagens(sessao, ...ids) {
  const vistos = new Set();
  const juntas = [];
  for (const id of ids) {
    for (const msg of sessao.mensagens.get(id) || []) {
      if (!msg?.id || vistos.has(msg.id)) continue;
      vistos.add(msg.id);
      juntas.push(msg);
    }
  }
  juntas.sort((a, b) => a.em - b.em);
  return juntas;
}

async function listarMensagens(clinicaId, sessao, chatId, marcarLida) {
  if (!sessao || sessao.status !== 'conectado') {
    return repositorio.listarMensagens(clinicaId, chatId, 120);
  }
  const destino = await destinoEnvio(sessao, chatId, '').catch(() => chatId);
  const ids = [...new Set([...idsRelacionados(sessao, chatId), ...idsRelacionados(sessao, destino)])];
  for (const id of ids) {
    try {
      const msgs = await lerNaPagina(sessao, () => buscarMensagens(sessao.client, id));
      for (const msg of msgs) guardarMensagem(sessao, msg);
      if (marcarLida) await sessao.client.sendSeen(id).catch(() => {});
    } catch (err) {
      console.error(`[${clinicaId}] histórico:`, err instanceof Error ? err.message : err);
    }
  }
  if (marcarLida) {
    const item = sessao.conversas.find((c) => ids.includes(c.id));
    if (item) item.naoLidas = 0;
  }
  const lista = juntarMensagens(sessao, ...ids);
  if (lista.length) {
    for (const id of ids) sessao.mensagens.set(id, lista);
    return lista;
  }
  return repositorio.listarMensagens(clinicaId, chatId, 120);
}

async function baixarMidia(sessao, mensagemId) {
  exigirConectado(sessao);
  const msg = await sessao.client.getMessageById(mensagemId);
  if (!msg || !msg.hasMedia) throw erroHttp(404, 'Mídia não encontrada.');
  const midia = await msg.downloadMedia();
  if (!midia) throw erroHttp(410, 'A mídia não está mais disponível no celular.');
  return { mimetype: midia.mimetype, data: midia.data, nome: midia.filename || null };
}

async function destinoEnvio(sessao, chatId, telefone) {
  const id = normalizarChatId(chatId);
  if (id.endsWith('@c.us') || id.endsWith('@g.us')) return id;
  if (id.endsWith('@lid')) {
    const pn = await telefoneDoLid(sessao, id);
    if (pn) return pn;
    const digitos = digitosTelefone(telefone);
    if (digitos) return `${digitos}@c.us`;
    return id;
  }
  const digitos = digitosTelefone(telefone);
  if (!digitos) throw erroHttp(400, 'Conversa inválida.');
  const wid = await sessao.client.getNumberId(digitos);
  if (!wid?._serialized) throw erroHttp(404, 'Este número não tem WhatsApp.');
  const serial = normalizarChatId(wid._serialized);
  if (!serial.endsWith('@lid')) return serial;
  const pn = await telefoneDoLid(sessao, serial);
  if (pn) {
    sessao.lids?.set(serial, pn);
    return pn;
  }
  return `${digitos}@c.us`;
}

async function resolverChat(sessao, telefone) {
  exigirConectado(sessao);
  return destinoEnvio(sessao, '', telefone);
}

async function confirmarEnvio(client, destino, conteudo, opcoes) {
  try {
    return await client.sendMessage(destino, conteudo, { sendSeen: false, ...opcoes }) || null;
  } catch (err) {
    const textoErro = err instanceof Error ? err.message : String(err);
    // O WhatsApp já entregou a mensagem e só falhou ao devolver o identificador.
    if (/reading ['"]id['"]/.test(textoErro)) return null;
    throw err;
  }
}

function textoJaNaConversa(lista, corpo) {
  const agora = Date.now();
  return lista.some((item) => item.deMim && item.texto === corpo && agora - item.em < 20000);
}

async function enviar(sessao, { chatId, telefone, texto, arquivo }) {
  exigirConectado(sessao);
  await garantirPagina(sessao);
  const origem = chatValido(chatId) ? chatId : '';
  const destino = await destinoEnvio(sessao, origem, telefone);
  const corpo = String(texto || '').trim();
  if (corpo.length > 4000) throw erroHttp(400, 'A mensagem passa de 4000 caracteres.');

  const mandar = () => {
    if (arquivo && typeof arquivo === 'object') {
      const { mimetype, data, nome } = arquivo;
      if (typeof mimetype !== 'string' || typeof data !== 'string' || !data) throw erroHttp(400, 'Arquivo inválido.');
      const midia = new MessageMedia(mimetype, data, typeof nome === 'string' ? nome.slice(0, 120) : undefined);
      return confirmarEnvio(sessao.client, destino, midia, corpo ? { caption: corpo } : {});
    }
    if (!corpo) throw erroHttp(400, 'Escreva uma mensagem.');
    return confirmarEnvio(sessao.client, destino, corpo, {});
  };

  let msg;
  try {
    msg = await mandar();
  } catch (err) {
    if (!erroDePagina(err)) throw err;
    sessao.hook = false;
    await garantirPagina(sessao);
    const recentes = corpo ? await buscarMensagens(sessao.client, destino).catch(() => []) : [];
    for (const item of recentes) guardarMensagem(sessao, item);
    const jaFoi = corpo && textoJaNaConversa(
      juntarMensagens(sessao, ...idsRelacionados(sessao, origem || destino), ...idsRelacionados(sessao, destino)),
      corpo,
    );
    if (!jaFoi) msg = await mandar();
  }
  if (msg) guardarMensagem(sessao, msg);
  if (!msg) await espera(800);
  const ids = [...new Set([origem, destino].filter(Boolean))];
  for (const id of ids) {
    try {
      const recentes = await buscarMensagens(sessao.client, id);
      for (const item of recentes) guardarMensagem(sessao, item);
    } catch {
      // A conversa aberta ainda mostra o que já estava em cache.
    }
  }
  const lista = juntarMensagens(sessao, ...idsRelacionados(sessao, origem || destino), ...idsRelacionados(sessao, destino));
  if (!msg && corpo && !textoJaNaConversa(lista, corpo)) {
    guardarMensagem(sessao, {
      id: `local-${Date.now()}`,
      fromMe: true,
      to: origem || destino,
      body: corpo,
      timestamp: Math.floor(Date.now() / 1000),
      type: 'chat',
      ack: 0,
    });
  }
  sessao.conversasEm = 0;
  return { ok: true, chatId: origem || destino };
}

// ---------------------------------------------------------------------
// Horários (sempre no fuso de Brasília)
// ---------------------------------------------------------------------

function agoraSP(data = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(data).map((p) => [p.type, p.value]),
  );
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    ano: Number(partes.year),
    mes: partes.month,
    diaMes: partes.day,
    hm: `${partes.hour}:${partes.minute}`,
  };
}

function dataConsulta(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
}

function horaConsulta(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
}

function dentroDaJanela(janela) {
  const hm = agoraSP().hm;
  const inicio = janela?.inicio || '08:00';
  const fim = janela?.fim || '20:00';
  return hm >= inicio && hm < fim;
}

const ROTULOS = {
  'nome do paciente': 'paciente_nome',
  'nome da clínica': 'clinica_nome',
  'telefone da clínica': 'clinica_telefone',
  'data da consulta': 'data_consulta',
  'hora da consulta': 'hora_consulta',
};

function aplicarVariaveis(texto, ctx) {
  return String(texto || '')
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (inteiro, chave) => (ctx[chave.toLowerCase()] ?? inteiro))
    .replace(/【\s*([^】]+?)\s*】/g, (inteiro, rotulo) => {
      const chave = ROTULOS[rotulo.toLowerCase()];
      return chave && ctx[chave] != null ? ctx[chave] : inteiro;
    });
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

// ---------------------------------------------------------------------
// Agendador
// ---------------------------------------------------------------------

async function enviarAutomatico(sessao, telefone, texto) {
  // Intervalo entre envios automáticos para o número não ser marcado como spam.
  await espera(4000 + Math.random() * 5000);
  await garantirPagina(sessao);
  const chatId = await resolverChat(sessao, telefone);
  const msg = await confirmarEnvio(sessao.client, chatId, texto, {});
  guardarMensagem(sessao, msg);
  sessao.conversasEm = 0;
}

async function dispararAutomacao(sessao, clinicaId, chave, tipo, paciente, texto) {
  const telefone = paciente?.telefone;
  if (!telefone || !digitosTelefone(telefone)) return false;
  const reserva = await repositorio.reservarEnvio(clinicaId, chave, {
    tipo,
    paciente_id: paciente.id || null,
    nome: paciente.nome || null,
    telefone,
    texto,
  });
  if (!reserva) return false;
  try {
    await enviarAutomatico(sessao, telefone, texto);
    await repositorio.concluirEnvio(reserva.id, null);
    return true;
  } catch (err) {
    await repositorio.concluirEnvio(reserva.id, err instanceof Error ? err.message : 'Falha ao enviar.');
    return false;
  }
}

async function processarAgendadas(sessao, clinicaId, clinica) {
  const fila = await repositorio.agendadasPendentes(clinicaId, new Date().toISOString(), 20);
  for (const item of fila) {
    if (sessao.status !== 'conectado') return;
    if (!(await repositorio.reservarAgendada(item.id))) continue;
    const texto = aplicarVariaveis(item.texto, {
      paciente_nome: primeiroNome(item.nome),
      clinica_nome: clinica.nome || '',
      clinica_telefone: clinica.telefone || '',
    });
    try {
      await enviarAutomatico(sessao, item.telefone, texto);
      await repositorio.concluirAgendada(item.id, null);
    } catch (err) {
      await repositorio.concluirAgendada(item.id, err instanceof Error ? err.message : 'Falha ao enviar.');
    }
  }
}

function ctxAgendamento(ag, clinica) {
  const paciente = ag.paciente || null;
  return {
    paciente_nome: primeiroNome(paciente?.nome),
    clinica_nome: clinica.nome || '',
    clinica_telefone: clinica.telefone || '',
    data_consulta: dataConsulta(ag.data_hora),
    hora_consulta: horaConsulta(ag.data_hora),
    procedimento: ag.procedimento || '',
  };
}

async function automacaoConfirmacao(sessao, clinicaId, clinica, cfg) {
  const regra = cfg.confirmacao;
  if (!regra?.ativo || !regra.texto || !regra.desde) return;
  const limite = new Date(Math.max(new Date(regra.desde).getTime(), Date.now() - 48 * 3600_000)).toISOString();
  const agora = new Date().toISOString();
  const lista = await repositorio.agendamentosParaConfirmacao(clinicaId, limite, agora, 30);
  for (const ag of lista) {
    if (sessao.status !== 'conectado') return;
    await dispararAutomacao(sessao, clinicaId, `confirmacao:${ag.id}`, 'confirmacao', ag.paciente, aplicarVariaveis(regra.texto, ctxAgendamento(ag, clinica)));
  }
}

async function automacaoLembrete(sessao, clinicaId, clinica, cfg) {
  const regra = cfg.lembrete;
  if (!regra?.ativo || !regra.texto) return;
  const horas = Math.min(Math.max(Number(regra.horasAntes) || 24, 1), 72);
  const de = new Date(Date.now() + 30 * 60_000).toISOString();
  const ate = new Date(Date.now() + horas * 3600_000).toISOString();
  const lista = await repositorio.agendamentosParaLembrete(clinicaId, de, ate, 60);
  if (!lista.length) return;
  const lembrados = await repositorio.lembretesEnviados(clinicaId, lista.map((ag) => ag.id));
  const confirmacaoLigada = !!(cfg.confirmacao?.ativo && cfg.confirmacao?.desde);

  for (const ag of lista) {
    if (sessao.status !== 'conectado') return;
    if (lembrados.has(String(ag.id))) continue;
    // Agendado já dentro da janela do lembrete: a confirmação acabou de avisar.
    if (confirmacaoLigada && ag.created_at && new Date(ag.created_at).getTime() > new Date(ag.data_hora).getTime() - horas * 3600_000) continue;
    const enviado = await dispararAutomacao(sessao, clinicaId, `lembrete:${ag.id}`, 'lembrete', ag.paciente, aplicarVariaveis(regra.texto, ctxAgendamento(ag, clinica)));
    if (enviado) await repositorio.marcarLembrete(clinicaId, ag.id);
  }
}

async function automacaoPosConsulta(sessao, clinicaId, clinica, cfg) {
  const regra = cfg.pos_consulta;
  if (!regra?.ativo || !regra.texto || !regra.desde) return;
  const horas = Math.min(Math.max(Number(regra.horasDepois) || 2, 1), 72);
  const ate = new Date(Date.now() - horas * 3600_000);
  const de = new Date(Math.max(new Date(regra.desde).getTime(), ate.getTime() - 48 * 3600_000));
  if (de >= ate) return;
  const lista = await repositorio.agendamentosParaPosConsulta(clinicaId, de.toISOString(), ate.toISOString(), 40);
  for (const ag of lista) {
    if (sessao.status !== 'conectado') return;
    await dispararAutomacao(sessao, clinicaId, `pos_consulta:${ag.id}`, 'pos_consulta', ag.paciente, aplicarVariaveis(regra.texto, ctxAgendamento(ag, clinica)));
  }
}

function anoBissexto(ano) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

async function automacaoAniversario(sessao, clinicaId, clinica, cfg) {
  const regra = cfg.aniversario;
  if (!regra?.ativo || !regra.texto) return;
  const hoje = agoraSP();
  if (hoje.hm < (regra.hora || '09:00')) return;
  if (sessao.diario.aniversario === hoje.dia) return;

  const pacientes = await repositorio.pacientesParaAniversario(clinicaId);
  const alvo = `${hoje.mes}-${hoje.diaMes}`;
  const incluir29 = alvo === '02-28' && !anoBissexto(hoje.ano);
  for (const paciente of pacientes) {
    if (sessao.status !== 'conectado') return;
    const md = String(paciente.data_nascimento).slice(5, 10);
    if (md !== alvo && !(incluir29 && md === '02-29')) continue;
    const texto = aplicarVariaveis(regra.texto, {
      paciente_nome: primeiroNome(paciente.nome),
      clinica_nome: clinica.nome || '',
      clinica_telefone: clinica.telefone || '',
    });
    await dispararAutomacao(sessao, clinicaId, `aniversario:${paciente.id}:${hoje.ano}`, 'aniversario', paciente, texto);
  }
  sessao.diario.aniversario = hoje.dia;
}

async function automacaoRetorno(sessao, clinicaId, clinica, cfg) {
  const regra = cfg.retorno;
  if (!regra?.ativo || !regra.texto) return;
  const hoje = agoraSP();
  if (sessao.diario.retorno === hoje.dia) return;

  const meses = Math.min(Math.max(Number(regra.meses) || 6, 1), 36);
  const limiteDia = Math.min(Math.max(Number(regra.limiteDia) || 20, 1), 100);
  const corte = new Date();
  corte.setMonth(corte.getMonth() - meses);
  const inicio = new Date(corte);
  inicio.setMonth(inicio.getMonth() - 12);

  const agendamentos = await repositorio.agendamentosParaRetorno(clinicaId, inicio.toISOString());
  const porPaciente = new Map();
  for (const ag of agendamentos) {
    const atual = porPaciente.get(ag.paciente_id);
    if (!atual || new Date(ag.data_hora) > new Date(atual.data_hora)) porPaciente.set(ag.paciente_id, ag);
  }
  const candidatos = [...porPaciente.values()].filter(
    (ag) => ag.status !== 'agendado' && new Date(ag.data_hora) <= corte,
  );
  if (!candidatos.length) {
    sessao.diario.retorno = hoje.dia;
    return;
  }

  const jaFeitos = await repositorio.chavesDeEnvio(clinicaId, 'retorno');
  const pendentes = candidatos
    .filter((ag) => !jaFeitos.has(`retorno:${ag.paciente_id}:${ag.id}`))
    .slice(0, limiteDia);
  if (!pendentes.length) {
    sessao.diario.retorno = hoje.dia;
    return;
  }

  const pacientes = await repositorio.pacientesPorIds(clinicaId, pendentes.map((ag) => ag.paciente_id));
  const mapa = new Map(pacientes.map((p) => [p.id, p]));
  for (const ag of pendentes) {
    if (sessao.status !== 'conectado') return;
    const paciente = mapa.get(ag.paciente_id);
    if (!paciente) continue;
    const texto = aplicarVariaveis(regra.texto, {
      paciente_nome: primeiroNome(paciente.nome),
      clinica_nome: clinica.nome || '',
      clinica_telefone: clinica.telefone || '',
    });
    await dispararAutomacao(sessao, clinicaId, `retorno:${ag.paciente_id}:${ag.id}`, 'retorno', paciente, texto);
  }
  sessao.diario.retorno = hoje.dia;
}

async function processarClinica(clinicaId, sessao) {
  const [dadosClinica, cfg] = await Promise.all([
    repositorio.clinica(clinicaId),
    repositorio.configAutomacoes(clinicaId),
  ]);
  // Offline não existe a tabela `clinicas`: cai no nome/telefone do próprio
  // WhatsApp conectado para as variáveis {{clinica_nome}}/{{clinica_telefone}}.
  const clinica = {
    nome: dadosClinica?.nome || sessao.nome || '',
    telefone: dadosClinica?.telefone || sessao.numero || '',
  };
  await processarAgendadas(sessao, clinicaId, clinica);

  if (!cfg || typeof cfg !== 'object' || !dentroDaJanela(cfg.janela)) return;
  const etapas = [automacaoConfirmacao, automacaoLembrete, automacaoPosConsulta, automacaoAniversario, automacaoRetorno];
  for (const etapa of etapas) {
    if (sessao.status !== 'conectado') return;
    try {
      await etapa(sessao, clinicaId, clinica, cfg);
    } catch (err) {
      console.error(`[${clinicaId}] ${etapa.name}:`, err instanceof Error ? err.message : err);
    }
  }
}

let agendadorRodando = false;

async function rodarAgendador() {
  if (!AGENDADOR_ATIVO || agendadorRodando) return;
  agendadorRodando = true;
  try {
    for (const [clinicaId, sessao] of sessoes) {
      if (sessao.status !== 'conectado' || !/^\d+$/.test(clinicaId)) continue;
      try {
        await processarClinica(clinicaId, sessao);
      } catch (err) {
        console.error(`[${clinicaId}] agendador:`, err instanceof Error ? err.message : err);
      }
    }
  } finally {
    agendadorRodando = false;
  }
}

// ---------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------

function lerCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (pedaco) => {
      tamanho += pedaco.length;
      if (tamanho > limite) {
        reject(erroHttp(413, 'Arquivo grande demais.'));
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
        reject(erroHttp(400, 'JSON inválido.'));
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
  });
  res.end(corpo);
}

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}`);
    if (req.method === 'GET' && url.pathname === '/saude') {
      responder(res, 200, { ok: true });
      return;
    }
    if (!segredoOk(req.headers['x-ortus-whatsapp-secret'])) {
      responder(res, 401, { erro: 'Segredo inválido.' });
      return;
    }

    const partes = url.pathname.split('/').filter(Boolean);
    if (partes[0] !== 'sessoes' || !clinicaValida(partes[1] || '')) {
      responder(res, 404, { erro: 'Rota não encontrada.' });
      return;
    }
    const clinicaId = partes[1];
    const acao = partes[2] || '';
    const sessao = sessoes.get(clinicaId);

    if (req.method === 'POST' && acao === 'iniciar') return responder(res, 200, iniciar(clinicaId));
    if (req.method === 'GET' && !acao) return responder(res, 200, resumo(sessao));
    if (req.method === 'DELETE' && !acao) return responder(res, 200, await encerrar(clinicaId));

    if (req.method === 'GET' && acao === 'conversas') {
      return responder(res, 200, await listarConversas(clinicaId, sessao));
    }
    if (req.method === 'GET' && acao === 'mensagens') {
      const chatId = url.searchParams.get('chat') || '';
      if (!chatValido(chatId)) throw erroHttp(400, 'Conversa inválida.');
      return responder(res, 200, await listarMensagens(clinicaId, sessao, chatId, url.searchParams.get('lida') === '1'));
    }
    if (req.method === 'GET' && acao === 'midia') {
      const mensagemId = url.searchParams.get('msg') || '';
      if (!mensagemValida(mensagemId)) throw erroHttp(400, 'Mensagem inválida.');
      return responder(res, 200, await baixarMidia(sessao, mensagemId));
    }
    if (req.method === 'GET' && acao === 'resolver') {
      return responder(res, 200, { chatId: await resolverChat(sessao, url.searchParams.get('telefone') || '') });
    }
    if (req.method === 'POST' && acao === 'enviar') {
      const corpo = await lerCorpo(req, CORPO_MAXIMO_MIDIA);
      if (!corpo.arquivo && JSON.stringify(corpo).length > CORPO_MAXIMO) throw erroHttp(413, 'Mensagem grande demais.');
      return responder(res, 200, await enviar(sessao, corpo));
    }

    responder(res, 404, { erro: 'Rota não encontrada.' });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 500;
    const mensagem = textoErro(err);
    responder(res, status, {
      erro: erroDePagina(err) ? 'O WhatsApp atualizou a tela. Tente enviar de novo.' : (mensagem || 'Falha no WhatsApp.'),
    });
  }
});

servidor.listen(PORTA, HOST, () => {
  console.log(`WhatsApp Ortus em http://${HOST}:${PORTA}`);
  if (AGENDADOR_ATIVO) {
    void repositorio.verificar().catch((err) => {
      console.warn(`Banco ${repositorio.modalidade === 'local' ? 'local' : 'da nuvem'} indisponível:`, err instanceof Error ? err.message : err);
    });
  }
  restaurarSessoesSalvas();
  setInterval(() => { void rodarAgendador(); }, 60_000);
});
