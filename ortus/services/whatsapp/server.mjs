import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const RAIZ = path.dirname(fileURLToPath(import.meta.url));

carregarEnvLocal();

const PASTA_SESSAO = process.env.WHATSAPP_DATA_DIR || path.join(RAIZ, '.wwebjs_auth');
const SEGREDO = process.env.WHATSAPP_GATEWAY_SECRET || '';
// Railway, Render e afins informam a porta em PORT e exigem ouvir em todas as interfaces.
const PORTA = Number(process.env.WHATSAPP_GATEWAY_PORT || process.env.PORT || 3920);
const HOST = process.env.WHATSAPP_GATEWAY_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AGENDADOR_ATIVO = Boolean(SUPABASE_URL && SUPABASE_CHAVE);
const FUSO = 'America/Sao_Paulo';
const CORPO_MAXIMO = 64_000;
const CORPO_MAXIMO_MIDIA = 6_000_000;

if (!SEGREDO) {
  console.error('Defina WHATSAPP_GATEWAY_SECRET (no .env.local ou nas variáveis do servidor) antes de subir o WhatsApp.');
  process.exit(1);
}
if (!AGENDADOR_ATIVO) {
  console.warn('Sem NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY: mensagens automáticas e agendadas ficam desligadas.');
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

// ---------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------

function criarSessao(clinicaId) {
  const sessao = {
    status: 'iniciando',
    qr: null,
    numero: null,
    nome: null,
    erro: null,
    vistos: new Set(),
    mensagens: new Map(),
    conversas: [],
    conversasEm: 0,
    diario: {},
    client: null,
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

  client.on('ready', () => {
    sessao.status = 'conectado';
    sessao.qr = null;
    sessao.erro = null;
    sessao.numero = client.info?.wid?.user || null;
    sessao.nome = client.info?.pushname || null;
    console.log(`[${clinicaId}] conectado como ${sessao.numero}`);
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

  client.initialize().catch((err) => {
    sessao.status = 'falha';
    sessao.erro = err instanceof Error ? err.message : 'Falha ao abrir o WhatsApp.';
  });

  return sessao;
}

function guardarMensagem(sessao, msg) {
  const id = msg.id?._serialized || `${msg.timestamp}:${msg.from}:${msg.body}`;
  if (sessao.vistos.has(id)) return;
  sessao.vistos.add(id);
  const chatId = msg.fromMe ? msg.to : msg.from;
  if (!chatId) return;
  const lista = sessao.mensagens.get(chatId) || [];
  lista.push({
    id,
    chatId,
    deMim: !!msg.fromMe,
    texto: msg.body || '',
    tipo: msg.type || 'chat',
    temMidia: !!msg.hasMedia,
    arquivo: msg._data?.filename || null,
    em: (msg.timestamp || Math.floor(Date.now() / 1000)) * 1000,
    ack: typeof msg.ack === 'number' ? msg.ack : null,
  });
  lista.sort((a, b) => a.em - b.em);
  if (lista.length > 120) lista.splice(0, lista.length - 120);
  sessao.mensagens.set(chatId, lista);
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

async function listarConversas(sessao) {
  if (sessao.status !== 'conectado') return [];
  const agora = Date.now();
  if (agora - sessao.conversasEm < 6000 && sessao.conversas.length) return sessao.conversas;
  const chats = await sessao.client.getChats();
  sessao.conversas = chats
    .filter((chat) => chat.id?._serialized !== 'status@broadcast')
    .slice(0, 80)
    .map((chat) => ({
      id: chat.id._serialized,
      nome: chat.name || chat.id.user,
      telefone: chat.id.server === 'c.us' ? chat.id.user : null,
      grupo: !!chat.isGroup,
      ultima: chat.lastMessage?.body || (chat.lastMessage?.hasMedia ? 'Mídia' : ''),
      ultimaDeMim: !!chat.lastMessage?.fromMe,
      em: (chat.timestamp || 0) * 1000,
      naoLidas: chat.unreadCount || 0,
    }));
  sessao.conversasEm = agora;
  return sessao.conversas;
}

async function listarMensagens(sessao, chatId, marcarLida) {
  if (sessao.status !== 'conectado') return [];
  const chat = await sessao.client.getChatById(chatId);
  const msgs = await chat.fetchMessages({ limit: 60 });
  for (const msg of msgs) guardarMensagem(sessao, msg);
  if (marcarLida && chat.unreadCount > 0) {
    await chat.sendSeen().catch(() => {});
    const item = sessao.conversas.find((c) => c.id === chatId);
    if (item) item.naoLidas = 0;
  }
  return sessao.mensagens.get(chatId) || [];
}

async function baixarMidia(sessao, mensagemId) {
  exigirConectado(sessao);
  const msg = await sessao.client.getMessageById(mensagemId);
  if (!msg || !msg.hasMedia) throw erroHttp(404, 'Mídia não encontrada.');
  const midia = await msg.downloadMedia();
  if (!midia) throw erroHttp(410, 'A mídia não está mais disponível no celular.');
  return { mimetype: midia.mimetype, data: midia.data, nome: midia.filename || null };
}

async function resolverChat(sessao, telefone) {
  exigirConectado(sessao);
  const digitos = digitosTelefone(telefone);
  if (!digitos) throw erroHttp(400, 'Telefone inválido.');
  const wid = await sessao.client.getNumberId(digitos);
  if (!wid) throw erroHttp(404, 'Este número não tem WhatsApp.');
  return wid._serialized;
}

async function enviar(sessao, { chatId, telefone, texto, arquivo }) {
  exigirConectado(sessao);
  const destino = chatValido(chatId) ? chatId : await resolverChat(sessao, telefone);
  const corpo = String(texto || '').trim();
  if (corpo.length > 4000) throw erroHttp(400, 'A mensagem passa de 4000 caracteres.');

  let msg;
  if (arquivo && typeof arquivo === 'object') {
    const { mimetype, data, nome } = arquivo;
    if (typeof mimetype !== 'string' || typeof data !== 'string' || !data) throw erroHttp(400, 'Arquivo inválido.');
    const midia = new MessageMedia(mimetype, data, typeof nome === 'string' ? nome.slice(0, 120) : undefined);
    msg = await sessao.client.sendMessage(destino, midia, corpo ? { caption: corpo } : {});
  } else {
    if (!corpo) throw erroHttp(400, 'Escreva uma mensagem.');
    msg = await sessao.client.sendMessage(destino, corpo);
  }
  guardarMensagem(sessao, msg);
  sessao.conversasEm = 0;
  return { ok: true, chatId: destino };
}

// ---------------------------------------------------------------------
// Supabase (service role) para o agendador
// ---------------------------------------------------------------------

async function db(caminho, { method = 'GET', body, prefer } = {}) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    method,
    headers: {
      apikey: SUPABASE_CHAVE,
      Authorization: `Bearer ${SUPABASE_CHAVE}`,
      'content-type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await resposta.text();
  if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

async function dbTodos(caminho) {
  const linhas = [];
  for (let inicio = 0; inicio < 20_000; inicio += 1000) {
    const sep = caminho.includes('?') ? '&' : '?';
    const pagina = await db(`${caminho}${sep}limit=1000&offset=${inicio}`);
    linhas.push(...(pagina || []));
    if (!pagina || pagina.length < 1000) break;
  }
  return linhas;
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

function umPaciente(valor) {
  return Array.isArray(valor) ? valor[0] || null : valor || null;
}

// ---------------------------------------------------------------------
// Agendador
// ---------------------------------------------------------------------

async function enviarAutomatico(sessao, telefone, texto) {
  // Intervalo entre envios automáticos para o número não ser marcado como spam.
  await espera(4000 + Math.random() * 5000);
  const chatId = await resolverChat(sessao, telefone);
  const msg = await sessao.client.sendMessage(chatId, texto);
  guardarMensagem(sessao, msg);
  sessao.conversasEm = 0;
}

async function reservarEnvio(clinicaId, chave, dados) {
  const linhas = await db('whatsapp_envios?on_conflict=clinica_id,chave', {
    method: 'POST',
    body: { clinica_id: Number(clinicaId), chave, status: 'enviando', ...dados },
    prefer: 'resolution=ignore-duplicates,return=representation',
  });
  return linhas?.[0] || null;
}

async function concluirEnvio(id, erro) {
  await db(`whatsapp_envios?id=eq.${id}`, {
    method: 'PATCH',
    body: erro ? { status: 'falha', erro: String(erro).slice(0, 500) } : { status: 'enviada', erro: null },
  });
}

async function dispararAutomacao(sessao, clinicaId, chave, tipo, paciente, texto) {
  const telefone = paciente?.telefone;
  if (!telefone || !digitosTelefone(telefone)) return false;
  const reserva = await reservarEnvio(clinicaId, chave, {
    tipo,
    paciente_id: paciente.id || null,
    nome: paciente.nome || null,
    telefone,
    texto,
  });
  if (!reserva) return false;
  try {
    await enviarAutomatico(sessao, telefone, texto);
    await concluirEnvio(reserva.id, null);
    return true;
  } catch (err) {
    await concluirEnvio(reserva.id, err instanceof Error ? err.message : 'Falha ao enviar.');
    return false;
  }
}

async function processarAgendadas(sessao, clinicaId, clinica) {
  const agora = new Date().toISOString();
  const fila = await db(
    `whatsapp_agendadas?clinica_id=eq.${clinicaId}&status=eq.pendente&enviar_em=lte.${encodeURIComponent(agora)}&order=enviar_em.asc&limit=20&select=id,nome,telefone,texto`,
  );
  for (const item of fila || []) {
    if (sessao.status !== 'conectado') return;
    const reservada = await db(`whatsapp_agendadas?id=eq.${item.id}&status=eq.pendente`, {
      method: 'PATCH',
      body: { status: 'enviando' },
      prefer: 'return=representation',
    });
    if (!reservada?.length) continue;
    const texto = aplicarVariaveis(item.texto, {
      paciente_nome: primeiroNome(item.nome),
      clinica_nome: clinica.nome || '',
      clinica_telefone: clinica.telefone || '',
    });
    try {
      await enviarAutomatico(sessao, item.telefone, texto);
      await db(`whatsapp_agendadas?id=eq.${item.id}`, {
        method: 'PATCH',
        body: { status: 'enviada', enviada_em: new Date().toISOString(), erro: null },
      });
    } catch (err) {
      await db(`whatsapp_agendadas?id=eq.${item.id}`, {
        method: 'PATCH',
        body: { status: 'falha', erro: (err instanceof Error ? err.message : 'Falha ao enviar.').slice(0, 500) },
      });
    }
  }
}

const SELECT_AGENDAMENTO = 'id,data_hora,procedimento,created_at,pacientes(id,nome,telefone)';

function ctxAgendamento(ag, clinica) {
  const paciente = umPaciente(ag.pacientes);
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
  const lista = await db(
    `agendamentos?clinica_id=eq.${clinicaId}&status=eq.agendado&created_at=gte.${encodeURIComponent(limite)}&data_hora=gt.${encodeURIComponent(agora)}&order=created_at.asc&limit=30&select=${SELECT_AGENDAMENTO}`,
  );
  for (const ag of lista || []) {
    if (sessao.status !== 'conectado') return;
    await dispararAutomacao(sessao, clinicaId, `confirmacao:${ag.id}`, 'confirmacao', umPaciente(ag.pacientes), aplicarVariaveis(regra.texto, ctxAgendamento(ag, clinica)));
  }
}

async function automacaoLembrete(sessao, clinicaId, clinica, cfg) {
  const regra = cfg.lembrete;
  if (!regra?.ativo || !regra.texto) return;
  const horas = Math.min(Math.max(Number(regra.horasAntes) || 24, 1), 72);
  const de = new Date(Date.now() + 30 * 60_000).toISOString();
  const ate = new Date(Date.now() + horas * 3600_000).toISOString();
  const lista = await db(
    `agendamentos?clinica_id=eq.${clinicaId}&status=eq.agendado&data_hora=gt.${encodeURIComponent(de)}&data_hora=lte.${encodeURIComponent(ate)}&order=data_hora.asc&limit=60&select=${SELECT_AGENDAMENTO}`,
  );
  if (!lista?.length) return;
  const jaLembrados = await db(
    `lembretes_agenda?canal=eq.whatsapp&agendamento_id=in.(${lista.map((ag) => ag.id).join(',')})&select=agendamento_id`,
  );
  const lembrados = new Set((jaLembrados || []).map((l) => String(l.agendamento_id)));
  const confirmacaoLigada = !!(cfg.confirmacao?.ativo && cfg.confirmacao?.desde);

  for (const ag of lista) {
    if (sessao.status !== 'conectado') return;
    if (lembrados.has(String(ag.id))) continue;
    // Agendado já dentro da janela do lembrete: a confirmação acabou de avisar.
    if (confirmacaoLigada && ag.created_at && new Date(ag.created_at).getTime() > new Date(ag.data_hora).getTime() - horas * 3600_000) continue;
    const enviado = await dispararAutomacao(sessao, clinicaId, `lembrete:${ag.id}`, 'lembrete', umPaciente(ag.pacientes), aplicarVariaveis(regra.texto, ctxAgendamento(ag, clinica)));
    if (enviado) {
      await db('lembretes_agenda?on_conflict=agendamento_id,canal', {
        method: 'POST',
        body: { agendamento_id: ag.id, clinica_id: Number(clinicaId), canal: 'whatsapp', enviado_em: new Date().toISOString() },
        prefer: 'resolution=merge-duplicates',
      }).catch(() => {});
    }
  }
}

async function automacaoPosConsulta(sessao, clinicaId, clinica, cfg) {
  const regra = cfg.pos_consulta;
  if (!regra?.ativo || !regra.texto || !regra.desde) return;
  const horas = Math.min(Math.max(Number(regra.horasDepois) || 2, 1), 72);
  const ate = new Date(Date.now() - horas * 3600_000);
  const de = new Date(Math.max(new Date(regra.desde).getTime(), ate.getTime() - 48 * 3600_000));
  if (de >= ate) return;
  const lista = await db(
    `agendamentos?clinica_id=eq.${clinicaId}&status=in.(concluido,fiado)&data_hora=gte.${encodeURIComponent(de.toISOString())}&data_hora=lte.${encodeURIComponent(ate.toISOString())}&order=data_hora.asc&limit=40&select=${SELECT_AGENDAMENTO}`,
  );
  for (const ag of lista || []) {
    if (sessao.status !== 'conectado') return;
    await dispararAutomacao(sessao, clinicaId, `pos_consulta:${ag.id}`, 'pos_consulta', umPaciente(ag.pacientes), aplicarVariaveis(regra.texto, ctxAgendamento(ag, clinica)));
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

  const pacientes = await dbTodos(
    `pacientes?clinica_id=eq.${clinicaId}&data_nascimento=not.is.null&telefone=not.is.null&select=id,nome,telefone,data_nascimento&order=id.asc`,
  );
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

  const agendamentos = await dbTodos(
    `agendamentos?clinica_id=eq.${clinicaId}&status=in.(agendado,concluido,fiado)&data_hora=gte.${encodeURIComponent(inicio.toISOString())}&paciente_id=not.is.null&select=id,paciente_id,data_hora,status&order=id.asc`,
  );
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

  const enviados = await dbTodos(`whatsapp_envios?clinica_id=eq.${clinicaId}&tipo=eq.retorno&select=chave`);
  const jaFeitos = new Set(enviados.map((e) => e.chave));
  const pendentes = candidatos
    .filter((ag) => !jaFeitos.has(`retorno:${ag.paciente_id}:${ag.id}`))
    .slice(0, limiteDia);
  if (!pendentes.length) {
    sessao.diario.retorno = hoje.dia;
    return;
  }

  const pacientes = await db(
    `pacientes?id=in.(${pendentes.map((ag) => ag.paciente_id).join(',')})&telefone=not.is.null&select=id,nome,telefone`,
  );
  const mapa = new Map((pacientes || []).map((p) => [p.id, p]));
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
  const [clinicas, config] = await Promise.all([
    db(`clinicas?id=eq.${clinicaId}&select=nome,telefone`),
    db(`configuracoes_clinica?clinica_id=eq.${clinicaId}&chave=eq.whatsapp_automacoes&select=valor`),
  ]);
  const clinica = clinicas?.[0] || {};
  await processarAgendadas(sessao, clinicaId, clinica);

  const cfg = config?.[0]?.valor;
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
      return responder(res, 200, sessao ? await listarConversas(sessao) : []);
    }
    if (req.method === 'GET' && acao === 'mensagens') {
      const chatId = url.searchParams.get('chat') || '';
      if (!chatValido(chatId)) throw erroHttp(400, 'Conversa inválida.');
      return responder(res, 200, sessao ? await listarMensagens(sessao, chatId, url.searchParams.get('lida') === '1') : []);
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
    responder(res, status, { erro: err instanceof Error ? err.message : 'Falha no WhatsApp.' });
  }
});

servidor.listen(PORTA, HOST, () => {
  console.log(`WhatsApp Ortus em http://${HOST}:${PORTA}`);
  restaurarSessoesSalvas();
  setInterval(() => { void rodarAgendador(); }, 60_000);
});
