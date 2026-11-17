/**
 * Repositório local (SQLite do desktop), via API de dados do Electron.
 *
 * Esta é a implementação "offline-first": as conversas e o agendador leem e
 * gravam no banco da própria clínica, sem Supabase e sem service role.
 *
 * Contrato consumido pelo server.mjs — igual ao de repositorioNuvem.mjs:
 *   mensagens:     salvarMensagem, listarMensagens, listarConversas
 *   agendador:     clinica, configAutomacoes, agendadasPendentes,
 *                  reservarAgendada, concluirAgendada, reservarEnvio,
 *                  concluirEnvio, agendamentosParaConfirmacao,
 *                  agendamentosParaLembrete, agendamentosParaPosConsulta,
 *                  agendamentosParaRetorno, lembretesEnviados, marcarLembrete,
 *                  pacientesParaAniversario, pacientesPorIds, chavesDeEnvio
 */

import { dbLocalConfigurado, localConsultar, localGravar, localSaude } from './dbLocal.mjs';

const PAGINA = 1000;
const LIMITE_PAGINACAO = 20_000;
const LIMITE_HISTORICO = 1000;
const CACHE_PACIENTES_MS = 60_000;

/** Tipos do whatsapp-web.js em que `hasMedia` é verdadeiro. */
const TIPOS_MIDIA = new Set(['image', 'video', 'audio', 'ptt', 'document', 'sticker']);

/** @type {Map<number, { em: number, mapa: Map<string, { id: string, nome: string }> }>} */
const cachePacientes = new Map();

/** clinica_id nas tabelas locais é INTEGER; ids de clínica são numéricos. */
function idClinica(clinicaId) {
  const numero = Number(String(clinicaId ?? '').trim());
  return Number.isFinite(numero) && numero > 0 ? Math.trunc(numero) : null;
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** JSON de configuração: a API já devolve objeto, mas dado sincronizado pode vir string. */
function comoObjeto(valor) {
  if (valor && typeof valor === 'object') return valor;
  if (typeof valor === 'string' && valor.trim()) {
    try {
      const convertido = JSON.parse(valor);
      return convertido && typeof convertido === 'object' ? convertido : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** DDD + últimos 8 dígitos (mesma regra de lib/whatsappTelefone.ts). */
function chaveTelefone(telefone) {
  let digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length >= 12 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length < 10) return null;
  return `${digitos.slice(0, 2)}${digitos.slice(-8)}`;
}

function telefoneDoChat(chatId) {
  const textoChat = String(chatId || '');
  if (!/@(c\.us|s\.whatsapp\.net)$/.test(textoChat)) return null;
  const digitos = textoChat.split('@')[0].replace(/\D/g, '');
  return digitos || null;
}

function usuarioDoChat(chatId) {
  const textoChat = String(chatId || '');
  return textoChat.split('@')[0] || textoChat;
}

function telefoneLegivel(telefone) {
  let digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length >= 12 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return String(telefone || '');
}

function ehMidia(tipo) {
  return TIPOS_MIDIA.has(String(tipo || ''));
}

function nomeArquivo(caminho) {
  const partes = String(caminho || '').split(/[\\/]/);
  return partes[partes.length - 1] || null;
}

/** Linha de whatsapp_mensagens → formato que a tela app/whatsapp/ espera. */
function mensagemDaApi(linha) {
  return {
    id: linha.wwebjs_id || String(linha.id),
    chatId: linha.chat_id,
    deMim: !!linha.de_mim,
    texto: linha.texto || '',
    tipo: linha.tipo || 'chat',
    temMidia: Boolean(linha.midia_tipo) || ehMidia(linha.tipo),
    arquivo: linha.midia_caminho ? nomeArquivo(linha.midia_caminho) : null,
    em: Date.parse(linha.em || '') || 0,
    ack: typeof linha.ack === 'number' ? linha.ack : null,
  };
}

async function consultarTudo(tabela, filtros, ordem) {
  const linhas = [];
  for (let offset = 0; offset < LIMITE_PAGINACAO; offset += PAGINA) {
    const pagina = await localConsultar(tabela, { filtros, ordem, limite: PAGINA, offset });
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return linhas;
}

/** Mapa telefone → paciente (id/nome) para casar conversa e agendamento. */
async function mapaPacientes(clinica) {
  const guardado = cachePacientes.get(clinica);
  if (guardado && Date.now() - guardado.em < CACHE_PACIENTES_MS) return guardado.mapa;

  const mapa = new Map();
  const linhas = await consultarTudo(
    'pacientes',
    [
      { col: 'clinica_id', op: 'eq', valor: clinica },
      { col: 'telefone', op: 'notnull' },
    ],
    [{ col: 'id', asc: true }],
  );
  for (const paciente of linhas) {
    const chave = chaveTelefone(paciente.telefone);
    if (chave && !mapa.has(chave)) mapa.set(chave, { id: paciente.id, nome: paciente.nome });
  }
  cachePacientes.set(clinica, { em: Date.now(), mapa });
  return mapa;
}

async function mapaPacientesPorIds(ids) {
  const mapa = new Map();
  const unicos = [...new Set((ids || []).filter(Boolean).map(String))];
  for (let i = 0; i < unicos.length; i += 500) {
    const pedaco = unicos.slice(i, i + 500);
    // Sem filtro de clínica: o agendamento já é da clínica certa e o espelho
    // local pode ter o paciente vinculado a outra unidade da mesma rede.
    const linhas = await localConsultar('pacientes', {
      filtros: [{ col: 'id', op: 'in', valor: pedaco }],
      ordem: [{ col: 'id', asc: true }],
      limite: pedaco.length,
    });
    for (const paciente of linhas) mapa.set(String(paciente.id), paciente);
  }
  return mapa;
}

/** Junta os agendamentos com o paciente (o SQLite não tem join HTTP). */
async function comPaciente(linhas) {
  const mapa = await mapaPacientesPorIds(linhas.map((linha) => linha.paciente_id));
  return linhas.map((linha) => ({ ...linha, paciente: mapa.get(String(linha.paciente_id)) || null }));
}

// ---------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------

/**
 * Grava/atualiza uma mensagem do WhatsApp. A verdade é o SQLite; o Map em
 * memória do server.mjs é só cache. O id local (uuid) é desconhecido aqui,
 * então procuramos por `wwebjs_id` + `clinica_id`: existe → update, não → insert.
 *
 * @param {string} clinicaId
 * @param {{ id: string, chatId: string, deMim: boolean, texto: string, tipo: string,
 *           temMidia: boolean, em: number, ack: number|null, contatoNome: string|null,
 *           contatoTelefone: string|null, midiaTipo: string|null }} mensagem
 */
async function salvarMensagem(clinicaId, mensagem) {
  if (!dbLocalConfigurado()) return null;
  const clinica = idClinica(clinicaId);
  if (clinica == null || !mensagem?.id || !mensagem.chatId) return null;

  const dados = {
    clinica_id: clinica,
    chat_id: mensagem.chatId,
    wwebjs_id: mensagem.id,
    texto: mensagem.texto ?? '',
    tipo: mensagem.tipo || 'chat',
    de_mim: !!mensagem.deMim,
    em: new Date(Number(mensagem.em) || Date.now()).toISOString(),
    ack: typeof mensagem.ack === 'number' ? mensagem.ack : null,
    contato_nome: mensagem.contatoNome || null,
    contato_telefone: mensagem.contatoTelefone || null,
    midia_tipo: mensagem.midiaTipo || null,
    // Mídia pesada fica em arquivo; o banco só guarda o caminho (ainda não usado).
    midia_caminho: null,
  };

  const existentes = await localConsultar('whatsapp_mensagens', {
    filtros: [
      { col: 'clinica_id', op: 'eq', valor: clinica },
      { col: 'wwebjs_id', op: 'eq', valor: mensagem.id },
    ],
    limite: 1,
  });

  const atual = existentes[0];
  if (atual) {
    // A mídia pesada fica em arquivo (fora deste processo): preserva o caminho
    // se algum outro ponto do sistema já o tiver gravado.
    dados.midia_caminho = atual.midia_caminho ?? null;
    // Reabrir uma conversa devolve as mesmas mensagens: não vale regravar (nem
    // criar entrada nova na fila de sincronização) o que não mudou.
    const mudou = ['chat_id', 'texto', 'tipo', 'de_mim', 'em', 'ack', 'contato_nome', 'contato_telefone', 'midia_tipo']
      .some((coluna) => (atual[coluna] ?? null) !== (dados[coluna] ?? null));
    if (!mudou) return atual;
    return localGravar({ tabela: 'whatsapp_mensagens', op: 'update', id: atual.id, dados });
  }
  return localGravar({ tabela: 'whatsapp_mensagens', op: 'insert', dados });
}

async function listarMensagens(clinicaId, chatId, limite = 120) {
  if (!dbLocalConfigurado()) return [];
  const clinica = idClinica(clinicaId);
  if (clinica == null || !chatId) return [];

  const linhas = await localConsultar('whatsapp_mensagens', {
    filtros: [
      { col: 'clinica_id', op: 'eq', valor: clinica },
      { col: 'chat_id', op: 'eq', valor: chatId },
    ],
    ordem: [{ col: 'em', asc: false }],
    limite: Math.max(1, Math.min(Number(limite) || 120, LIMITE_HISTORICO)),
  });
  return linhas.reverse().map(mensagemDaApi);
}

async function listarConversas(clinicaId) {
  if (!dbLocalConfigurado()) return [];
  const clinica = idClinica(clinicaId);
  if (clinica == null) return [];

  const linhas = await localConsultar('whatsapp_mensagens', {
    filtros: [{ col: 'clinica_id', op: 'eq', valor: clinica }],
    ordem: [{ col: 'em', asc: false }],
    limite: LIMITE_HISTORICO,
  });

  // A primeira ocorrência de cada chat_id já é a última mensagem (ordem desc).
  const porChat = new Map();
  for (const linha of linhas) {
    if (!linha.chat_id) continue;
    const em = Date.parse(linha.em || '') || 0;
    const atual = porChat.get(linha.chat_id);
    if (!atual) {
      porChat.set(linha.chat_id, { ultima: linha, em, nome: texto(linha.contato_nome), telefone: texto(linha.contato_telefone) });
      continue;
    }
    if (!atual.nome) atual.nome = texto(linha.contato_nome);
    if (!atual.telefone) atual.telefone = texto(linha.contato_telefone);
    if (em > atual.em) {
      atual.ultima = linha;
      atual.em = em;
    }
  }
  if (!porChat.size) return [];

  const pacientes = await mapaPacientes(clinica);
  const conversas = [];
  for (const [chatId, dados] of porChat) {
    const telefone = dados.telefone || telefoneDoChat(chatId);
    const paciente = telefone ? pacientes.get(chaveTelefone(telefone) || '') || null : null;
    conversas.push({
      id: chatId,
      nome: dados.nome || (telefone ? telefoneLegivel(telefone) : usuarioDoChat(chatId)),
      telefone,
      grupo: String(chatId).endsWith('@g.us'),
      ultima: dados.ultima.texto || (ehMidia(dados.ultima.tipo) ? 'Mídia' : ''),
      ultimaDeMim: !!dados.ultima.de_mim,
      em: dados.em,
      naoLidas: 0,
      paciente: paciente ? { id: paciente.id, nome: paciente.nome } : null,
    });
  }
  return conversas.sort((a, b) => b.em - a.em);
}

// ---------------------------------------------------------------------
// Agendador
// ---------------------------------------------------------------------

/**
 * Nome/telefone da clínica. O SQLite não tem a tabela `clinicas`; o nome que
 * a clínica preencheu em Configurações fica em `configuracoes_clinica`
 * (chave `preferencias`). Sem isso, o server cai no nome do perfil do WhatsApp.
 */
async function clinica(clinicaId) {
  if (!dbLocalConfigurado()) return {};
  const id = idClinica(clinicaId);
  if (id == null) return {};
  const linhas = await localConsultar('configuracoes_clinica', {
    filtros: [
      { col: 'clinica_id', op: 'eq', valor: id },
      { col: 'chave', op: 'eq', valor: 'preferencias' },
    ],
    limite: 1,
  });
  const prefs = comoObjeto(linhas[0]?.valor) || {};
  return {
    nome: texto(prefs.nome_clinica),
    telefone: texto(prefs.telefone) || texto(prefs.telefone_clinica),
  };
}

async function configAutomacoes(clinicaId) {
  if (!dbLocalConfigurado()) return null;
  const id = idClinica(clinicaId);
  if (id == null) return null;
  const linhas = await localConsultar('configuracoes_clinica', {
    filtros: [
      { col: 'clinica_id', op: 'eq', valor: id },
      { col: 'chave', op: 'eq', valor: 'whatsapp_automacoes' },
    ],
    limite: 1,
  });
  return comoObjeto(linhas[0]?.valor);
}

async function agendadasPendentes(clinicaId, agoraISO, limite = 20) {
  if (!dbLocalConfigurado()) return [];
  const clinicaIdNumero = idClinica(clinicaId);
  if (clinicaIdNumero == null) return [];
  return localConsultar('whatsapp_agendadas', {
    filtros: [
      { col: 'clinica_id', op: 'eq', valor: clinicaIdNumero },
      { col: 'status', op: 'eq', valor: 'pendente' },
      { col: 'enviar_em', op: 'lte', valor: agoraISO },
    ],
    ordem: [{ col: 'enviar_em', asc: true }],
    limite: Math.max(1, Number(limite) || 20),
  });
}

/** Equivalente local do update condicional (`status = pendente`). */
async function reservarAgendada(id) {
  if (!dbLocalConfigurado() || id == null) return false;
  const linhas = await localConsultar('whatsapp_agendadas', {
    filtros: [{ col: 'id', op: 'eq', valor: id }],
    limite: 1,
  });
  if (linhas[0]?.status !== 'pendente') return false;
  await localGravar({ tabela: 'whatsapp_agendadas', op: 'update', id, dados: { status: 'enviando' } });
  return true;
}

async function concluirAgendada(id, erro) {
  if (!dbLocalConfigurado() || id == null) return;
  const dados = erro
    ? { status: 'falha', erro: String(erro).slice(0, 500) }
    : { status: 'enviada', enviada_em: new Date().toISOString(), erro: null };
  await localGravar({ tabela: 'whatsapp_agendadas', op: 'update', id, dados });
}

/**
 * Reserva o envio de uma automação. O Postgres garante unicidade em
 * (clinica_id, chave); aqui a checagem é feita antes do insert — o agendador
 * roda em série (rodarAgendador é single-flight), então não há corrida.
 */
async function reservarEnvio(clinicaId, chave, dados) {
  if (!dbLocalConfigurado()) return null;
  const clinicaIdNumero = idClinica(clinicaId);
  if (clinicaIdNumero == null || !chave) return null;

  const existentes = await localConsultar('whatsapp_envios', {
    filtros: [
      { col: 'clinica_id', op: 'eq', valor: clinicaIdNumero },
      { col: 'chave', op: 'eq', valor: chave },
    ],
    limite: 1,
  });
  if (existentes.length) return null;

  const linha = await localGravar({
    tabela: 'whatsapp_envios',
    op: 'insert',
    dados: { clinica_id: clinicaIdNumero, chave, status: 'enviando', ...dados },
  });
  return linha ? { id: linha.id } : null;
}

async function concluirEnvio(id, erro) {
  if (!dbLocalConfigurado() || id == null) return;
  await localGravar({
    tabela: 'whatsapp_envios',
    op: 'update',
    id,
    dados: {
      status: erro ? 'falha' : 'enviada',
      erro: erro ? String(erro).slice(0, 500) : null,
    },
  });
}

async function agendamentosParaConfirmacao(clinicaId, desdeISO, ateISO, limite = 30) {
  if (!dbLocalConfigurado()) return [];
  const clinicaIdNumero = idClinica(clinicaId);
  if (clinicaIdNumero == null) return [];
  const linhas = await localConsultar('agendamentos', {
    filtros: [
      { col: 'clinica_id', op: 'eq', valor: clinicaIdNumero },
      { col: 'status', op: 'eq', valor: 'agendado' },
      { col: 'created_at', op: 'gte', valor: desdeISO },
      { col: 'data_hora', op: 'gt', valor: ateISO },
    ],
    ordem: [{ col: 'created_at', asc: true }],
    limite: Math.max(1, Number(limite) || 30),
  });
  return comPaciente(linhas);
}

async function agendamentosParaLembrete(clinicaId, deISO, ateISO, limite = 60) {
  if (!dbLocalConfigurado()) return [];
  const clinicaIdNumero = idClinica(clinicaId);
  if (clinicaIdNumero == null) return [];
  const linhas = await localConsultar('agendamentos', {
    filtros: [
      { col: 'clinica_id', op: 'eq', valor: clinicaIdNumero },
      { col: 'status', op: 'eq', valor: 'agendado' },
      { col: 'data_hora', op: 'gt', valor: deISO },
      { col: 'data_hora', op: 'lte', valor: ateISO },
    ],
    ordem: [{ col: 'data_hora', asc: true }],
    limite: Math.max(1, Number(limite) || 60),
  });
  return comPaciente(linhas);
}

async function agendamentosParaPosConsulta(clinicaId, deISO, ateISO, limite = 40) {
  if (!dbLocalConfigurado()) return [];
  const clinicaIdNumero = idClinica(clinicaId);
  if (clinicaIdNumero == null) return [];
  const linhas = await localConsultar('agendamentos', {
    filtros: [
      { col: 'clinica_id', op: 'eq', valor: clinicaIdNumero },
      { col: 'status', op: 'in', valor: ['concluido', 'fiado'] },
      { col: 'data_hora', op: 'gte', valor: deISO },
      { col: 'data_hora', op: 'lte', valor: ateISO },
    ],
    ordem: [{ col: 'data_hora', asc: true }],
    limite: Math.max(1, Number(limite) || 40),
  });
  return comPaciente(linhas);
}

async function agendamentosParaRetorno(clinicaId, inicioISO) {
  if (!dbLocalConfigurado()) return [];
  const clinicaIdNumero = idClinica(clinicaId);
  if (clinicaIdNumero == null) return [];
  return consultarTudo(
    'agendamentos',
    [
      { col: 'clinica_id', op: 'eq', valor: clinicaIdNumero },
      { col: 'status', op: 'in', valor: ['agendado', 'concluido', 'fiado'] },
      { col: 'data_hora', op: 'gte', valor: inicioISO },
      { col: 'paciente_id', op: 'notnull' },
    ],
    [{ col: 'id', asc: true }],
  );
}

/**
 * Agendamentos que já têm envio de lembrete registrado. O SQLite não tem a
 * tabela `lembretes_agenda`, então usamos a própria reserva de whatsapp_envios
 * (chave `lembrete:<id>`), que é gravada antes do envio.
 */
async function lembretesEnviados(clinicaId, agendamentoIds) {
  const clinicaIdNumero = idClinica(clinicaId);
  const ids = [...new Set((agendamentoIds || []).filter(Boolean).map(String))];
  if (!dbLocalConfigurado() || clinicaIdNumero == null || !ids.length) return new Set();

  const vistos = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const chaves = ids.slice(i, i + 500).map((id) => `lembrete:${id}`);
    const linhas = await localConsultar('whatsapp_envios', {
      filtros: [
        { col: 'clinica_id', op: 'eq', valor: clinicaIdNumero },
        { col: 'chave', op: 'in', valor: chaves },
      ],
      limite: chaves.length,
    });
    for (const linha of linhas) {
      const chave = String(linha.chave || '');
      if (chave.startsWith('lembrete:')) vistos.add(chave.slice('lembrete:'.length));
    }
  }
  return vistos;
}

/**
 * A tabela `lembretes_agenda` não existe no SQLite: quem impede o reenvio é a
 * reserva em `whatsapp_envios`, feita antes de cada disparo. Nada a fazer.
 */
async function marcarLembrete() {
  return;
}

async function pacientesParaAniversario(clinicaId) {
  if (!dbLocalConfigurado()) return [];
  const clinicaIdNumero = idClinica(clinicaId);
  if (clinicaIdNumero == null) return [];
  return consultarTudo(
    'pacientes',
    [
      { col: 'clinica_id', op: 'eq', valor: clinicaIdNumero },
      { col: 'data_nascimento', op: 'notnull' },
      { col: 'telefone', op: 'notnull' },
    ],
    [{ col: 'id', asc: true }],
  );
}

async function pacientesPorIds(clinicaId, ids) {
  if (!dbLocalConfigurado()) return [];
  const clinicaIdNumero = idClinica(clinicaId);
  if (clinicaIdNumero == null || !ids?.length) return [];
  const mapa = await mapaPacientesPorIds(ids);
  return [...mapa.values()].filter((paciente) => paciente.telefone);
}

async function chavesDeEnvio(clinicaId, tipo) {
  if (!dbLocalConfigurado()) return new Set();
  const clinicaIdNumero = idClinica(clinicaId);
  if (clinicaIdNumero == null || !tipo) return new Set();
  const linhas = await consultarTudo(
    'whatsapp_envios',
    [
      { col: 'clinica_id', op: 'eq', valor: clinicaIdNumero },
      { col: 'tipo', op: 'eq', valor: tipo },
    ],
    [{ col: 'id', asc: true }],
  );
  return new Set(linhas.map((linha) => String(linha.chave)));
}

export function criarRepositorioLocal() {
  const configurado = dbLocalConfigurado();
  return {
    modalidade: 'local',
    configurado,
    agendadorAtivo: configurado,
    verificar: () => localSaude(),
    clinica,
    configAutomacoes,
    salvarMensagem,
    listarMensagens,
    listarConversas,
    agendadasPendentes,
    reservarAgendada,
    concluirAgendada,
    reservarEnvio,
    concluirEnvio,
    agendamentosParaConfirmacao,
    agendamentosParaLembrete,
    agendamentosParaPosConsulta,
    agendamentosParaRetorno,
    lembretesEnviados,
    marcarLembrete,
    pacientesParaAniversario,
    pacientesPorIds,
    chavesDeEnvio,
  };
}
