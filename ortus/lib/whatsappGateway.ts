import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { registrarFalha } from '@/lib/registro';

/**
 * Ponte entre o site e o serviço do WhatsApp (services/whatsapp/server.mjs).
 *
 * O whatsapp-web.js abre um navegador e guarda a sessão em disco: precisa de um
 * processo que fica ligado, coisa que função serverless não é. Por isso o modo
 * é explícito:
 *
 *   aplicativo    o Ortus de computador sobe o serviço e entrega endereço e
 *                 segredo a este servidor (ORTUS_DESKTOP=1).
 *   servidor      processo sempre ligado (uma VM), informado por
 *                 WHATSAPP_GATEWAY_URL e WHATSAPP_GATEWAY_SECRET.
 *   filho         este servidor sobe o serviço como processo filho. Vale em
 *                 desenvolvimento; em produção só com WHATSAPP_GATEWAY_AUTOSTART=1.
 *   indisponivel  nenhum dos três. A rota diz isso e a tela explica, em vez de
 *                 oferecer um Conectar que nunca funcionaria.
 *
 * Regra de saída: stack, caminho de arquivo, saída de processo e nome de
 * variável nunca saem daqui para o navegador. O detalhe vai para o registro de
 * falhas e quem chama recebe uma frase fixa.
 */

const PRODUCAO = process.env.NODE_ENV === 'production';
const URL_INFORMADA = (process.env.WHATSAPP_GATEWAY_URL || '').trim();
const URL_BASE = (URL_INFORMADA || 'http://127.0.0.1:3920').replace(/\/$/, '');
const ARQUIVO_SEGREDO = path.join(process.cwd(), 'services', 'whatsapp', '.gateway-secret');

export type ModoWhatsapp = 'aplicativo' | 'servidor' | 'indisponivel';
type ModoInterno = ModoWhatsapp | 'filho';

export type MotivoFalha =
  | 'nao_configurado'
  | 'nao_instalado'
  | 'abrindo'
  | 'parou'
  | 'recusou'
  | 'demorou'
  | 'servico';

/** As únicas frases que este arquivo devolve quando o serviço não atende. */
export const AVISOS_WHATSAPP = {
  nao_configurado: 'O WhatsApp não está configurado neste servidor.',
  nao_instalado: 'O serviço do WhatsApp não está instalado neste servidor.',
  abrindo: 'O WhatsApp ainda está abrindo. Tente de novo em alguns segundos.',
  parou: 'O serviço do WhatsApp parou. Avise o suporte.',
  parou_no_aplicativo: 'O WhatsApp deste computador parou. Feche o Ortus e abra de novo.',
  recusou: 'O serviço do WhatsApp recusou este servidor. Avise o suporte.',
  demorou: 'O WhatsApp demorou para responder. Tente de novo.',
  servico: 'O WhatsApp não conseguiu concluir agora. Tente de novo.',
} as const;

/**
 * Frases que o serviço escreve para a tela (erroHttp e estado da sessão em
 * services/whatsapp/server.mjs). Qualquer outro texto vindo de lá é detalhe
 * técnico: fica no registro e a tela recebe um aviso fixo. Vale também para um
 * serviço de versão antiga, que ainda devolvia a mensagem crua do navegador.
 */
const FRASES_DO_SERVICO = new Set([
  'O WhatsApp atualizou a tela. Tente enviar de novo.',
  'WhatsApp desconectado.',
  'Mídia não encontrada.',
  'A mídia não está mais disponível no celular.',
  'Conversa inválida.',
  'Mensagem inválida.',
  'Este número não tem WhatsApp.',
  'A mensagem passa de 4000 caracteres.',
  'Escreva uma mensagem.',
  'Arquivo inválido.',
  'Arquivo grande demais.',
  'Mensagem grande demais.',
  'Não foi possível autenticar. Gere o QR de novo.',
  'A sessão foi encerrada no celular.',
  'O WhatsApp desconectou.',
  'Não foi possível gerar o QR. Tente de novo.',
  'Não foi possível abrir o WhatsApp. Tente de novo; se continuar, avise o suporte.',
  'Clínica não encontrada.',
  'Este servidor chegou ao limite de clínicas com o WhatsApp ligado. Avise o suporte.',
]);

/** Devolve o texto só quando ele é uma das frases escritas para a tela. */
export function fraseDoServico(texto: unknown): string | null {
  return typeof texto === 'string' && FRASES_DO_SERVICO.has(texto) ? texto : null;
}

function enderecoLocal() {
  try {
    const host = new URL(URL_BASE).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

function modoInterno(): ModoInterno {
  const segredoNoAmbiente = Boolean(process.env.WHATSAPP_GATEWAY_SECRET);
  // No aplicativo quem sobe o serviço é o Electron, que informa as duas variáveis.
  if (process.env.ORTUS_DESKTOP === '1') {
    return URL_INFORMADA && segredoNoAmbiente ? 'aplicativo' : 'indisponivel';
  }
  // Na Vercel o processo não fica vivo, então daqui não se sobe nada.
  const sobeDaqui = !process.env.VERCEL
    && enderecoLocal()
    && (!PRODUCAO || process.env.WHATSAPP_GATEWAY_AUTOSTART === '1');
  if (sobeDaqui) return 'filho';
  return URL_INFORMADA && segredoNoAmbiente ? 'servidor' : 'indisponivel';
}

let avisouSemServico = false;

/** Onde o WhatsApp roda, do ponto de vista de quem usa a tela. */
export function modoWhatsapp(): ModoWhatsapp {
  const modo = modoInterno();
  if (modo === 'indisponivel' && !avisouSemServico) {
    avisouSemServico = true;
    console.warn(
      'WhatsApp indisponível neste servidor: informe WHATSAPP_GATEWAY_URL e WHATSAPP_GATEWAY_SECRET de um processo sempre ligado, '
      + 'ou esconda a aba com NEXT_PUBLIC_WHATSAPP_ATIVO=0.',
    );
  }
  return modo === 'filho' ? 'servidor' : modo;
}

export function whatsappGatewayConfigurado() {
  return modoInterno() !== 'indisponivel';
}

const ultimoRegistro = new Map<string, number>();

/** A tela consulta o estado a cada poucos segundos: a mesma falha entra no registro uma vez a cada dez minutos. */
function anotar(chave: string, detalhe: string) {
  const agora = Date.now();
  if (agora - (ultimoRegistro.get(chave) ?? 0) < 600_000) return;
  ultimoRegistro.set(chave, agora);
  void registrarFalha({ origem: 'whatsapp/gateway', extra: { motivo: chave } }, new Error(detalhe));
}

type Subida = MotivoFalha | null;

let subida: Promise<Subida> | null = null;
let processo: ChildProcess | null = null;
let encerrado: Promise<void> | null = null;
let falhaDoFilho: MotivoFalha | null = null;
let esperarAte = 0;
let semRespostaDesde = 0;

function segredoAtual() {
  const doAmbiente = process.env.WHATSAPP_GATEWAY_SECRET || '';
  // Fora do modo filho o serviço foi ligado por outro processo: o segredo é o
  // que o ambiente informa, e um arquivo antigo aqui não vale nada para ele.
  if (doAmbiente || modoInterno() !== 'filho') return doAmbiente;
  try {
    if (fs.existsSync(ARQUIVO_SEGREDO)) {
      const salvo = fs.readFileSync(ARQUIVO_SEGREDO, 'utf8').trim();
      if (salvo) {
        process.env.WHATSAPP_GATEWAY_SECRET = salvo;
        return salvo;
      }
    }
  } catch {
    /* o arquivo pode não existir ainda */
  }
  return '';
}

function saude(porta: number) {
  return new Promise<boolean>((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: porta, path: '/saude', timeout: 1_000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function pausa(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** No modo filho o segredo nasce aqui e vai para o processo pelo ambiente. */
function garantirSegredoLocal() {
  const atual = segredoAtual();
  if (atual) return atual;
  if (modoInterno() !== 'filho') return '';
  const novo = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(ARQUIVO_SEGREDO), { recursive: true });
    fs.writeFileSync(ARQUIVO_SEGREDO, novo, { mode: 0o600 });
  } catch {
    /* segue só na memória desta execução */
  }
  process.env.WHATSAPP_GATEWAY_SECRET = novo;
  return novo;
}

function processoVivo() {
  return Boolean(processo && processo.exitCode === null && processo.signalCode === null && !processo.killed);
}

/** O que interessa da saída de um processo que caiu: da linha do erro em diante. */
function resumoDaSaida(saida: string) {
  // O Node colore o stack; os códigos de cor só sujam o registro.
  const linhas = saida.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
  const erro = linhas.findIndex((linha) => /^[A-Za-z]*Error\b/.test(linha));
  return (erro >= 0 ? linhas.slice(erro) : linhas.slice(-4)).join(' | ') || 'sem saída';
}

function ligarFilho(arquivo: string, pasta: string, porta: number) {
  const ambiente: NodeJS.ProcessEnv = {
    ...process.env,
    WHATSAPP_GATEWAY_HOST: '127.0.0.1',
    WHATSAPP_GATEWAY_PORT: String(porta),
    WHATSAPP_GATEWAY_SECRET: segredoAtual(),
  };
  delete ambiente.PORT;
  const filho = spawn(process.execPath, [arquivo], {
    cwd: pasta,
    env: ambiente,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  processo = filho;
  falhaDoFilho = null;
  // Cauda da saída do processo: só entra no registro de falhas, nunca numa resposta.
  let saida = '';
  const guardar = (pedaco: Buffer) => {
    saida = (saida + pedaco.toString('utf8')).slice(-4000);
  };
  filho.stdout?.on('data', guardar);
  filho.stderr?.on('data', guardar);
  encerrado = new Promise<void>((resolve) => {
    let avisado = false;
    const aoEncerrar = (descricao: string) => {
      if (avisado) return;
      avisado = true;
      if (processo === filho) processo = null;
      falhaDoFilho = /MODULE_NOT_FOUND|Cannot find (module|package)/.test(saida) ? 'nao_instalado' : 'parou';
      // A tela consulta a cada poucos segundos e cada tentativa abre um processo: espera antes da próxima.
      esperarAte = Date.now() + 30_000;
      anotar(`filho:${falhaDoFilho}`, `Serviço do WhatsApp encerrou (${descricao}): ${resumoDaSaida(saida)}`);
      resolve();
    };
    // Sem ouvinte de `error`, um processo que nem chega a abrir derruba o servidor inteiro.
    filho.once('error', (erro) => aoEncerrar(`não abriu: ${erro.message}`));
    // `close` vem depois de a saída de erro chegar inteira; `exit` viria antes dela.
    filho.once('close', (codigo, sinal) => aoEncerrar(`código ${codigo ?? 'nenhum'}, sinal ${sinal ?? 'nenhum'}`));
  });
  filho.unref();
}

async function subirWhatsappLocal(porta: number): Promise<Subida> {
  const pasta = path.join(process.cwd(), 'services', 'whatsapp');
  const arquivo = path.join(pasta, 'server.mjs');
  if (!fs.existsSync(arquivo)) {
    anotar('filho:nao_instalado', 'O arquivo do serviço do WhatsApp (services/whatsapp/server.mjs) não existe na pasta deste servidor.');
    return 'nao_instalado';
  }
  if (!processoVivo()) {
    try {
      ligarFilho(arquivo, pasta, porta);
    } catch (erro) {
      anotar('filho:parou', `Serviço do WhatsApp não abriu: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`);
      return 'parou';
    }
  }
  const limite = Date.now() + 20_000;
  while (Date.now() < limite) {
    if (await saude(porta)) return null;
    if (!processoVivo()) {
      await Promise.race([encerrado ?? Promise.resolve(), pausa(1_000)]);
      return falhaDoFilho || 'parou';
    }
    await pausa(400);
  }
  return 'abrindo';
}

async function garantirWhatsappLocal(): Promise<Subida> {
  if (!garantirSegredoLocal()) return 'nao_configurado';
  const porta = Number(new URL(URL_BASE).port || 3920);
  if (await saude(porta)) return null;
  if (!subida) {
    if (!processoVivo() && Date.now() < esperarAte) return falhaDoFilho || 'parou';
    subida = subirWhatsappLocal(porta).finally(() => {
      subida = null;
    });
  }
  return subida;
}

export type RespostaGateway =
  | { ok: true; status: number; dados: unknown }
  | { ok: false; status: number; dados: { erro: string }; motivo: MotivoFalha };

function falha(status: number, motivo: MotivoFalha, erro: string = AVISOS_WHATSAPP[motivo]): RespostaGateway {
  return { ok: false, status, dados: { erro }, motivo };
}

/** O serviço não respondeu: conexão recusada, endereço que não resolve ou tempo esgotado. */
function semResposta(modo: ModoInterno, erro: unknown): RespostaGateway {
  const nome = erro instanceof Error ? erro.name : '';
  if (nome === 'TimeoutError' || nome === 'AbortError') {
    anotar('demorou', 'O serviço do WhatsApp não respondeu dentro do tempo limite.');
    return falha(504, 'demorou');
  }
  const causa = erro instanceof Error && erro.cause && typeof erro.cause === 'object'
    ? (erro.cause as { code?: unknown }).code
    : null;
  anotar(
    `sem_resposta:${modo}`,
    `Serviço do WhatsApp sem resposta (modo ${modo}, ${typeof causa === 'string' ? causa : 'falha de rede'}).`
    + (modo === 'servidor' && PRODUCAO ? ' Em produção o site não sobe o serviço: confira o processo que deveria estar ligado.' : ''),
  );
  const agora = Date.now();
  if (!semRespostaDesde) semRespostaDesde = agora;
  // Um reinício leva alguns segundos; no aplicativo o serviço sobe junto com o programa.
  const tolerancia = modo === 'aplicativo' ? 90_000 : 20_000;
  if (agora - semRespostaDesde < tolerancia) return falha(503, 'abrindo');
  return falha(503, 'parou', modo === 'aplicativo' ? AVISOS_WHATSAPP.parou_no_aplicativo : AVISOS_WHATSAPP.parou);
}

/**
 * Chama o serviço do WhatsApp. Quando ele não atende, `dados.erro` é sempre uma
 * frase fixa (AVISOS_WHATSAPP) ou uma das frases que o próprio serviço escreve
 * para a tela; o texto técnico fica no registro de falhas.
 */
export async function chamarWhatsappGateway(
  caminho: string,
  init?: { method?: string; body?: unknown; tempoLimiteMs?: number },
): Promise<RespostaGateway> {
  const modo = modoInterno();
  if (modo === 'indisponivel') return falha(503, 'nao_configurado');
  if (modo === 'filho') {
    const impedimento = await garantirWhatsappLocal();
    if (impedimento) return falha(503, impedimento);
  }
  const segredo = segredoAtual();
  if (!segredo) return falha(503, 'nao_configurado');

  let resposta: Response;
  try {
    resposta = await fetch(`${URL_BASE}${caminho}`, {
      method: init?.method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-ortus-whatsapp-secret': segredo,
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: init?.tempoLimiteMs ? AbortSignal.timeout(init.tempoLimiteMs) : undefined,
    });
  } catch (erro) {
    return semResposta(modo, erro);
  }
  semRespostaDesde = 0;

  const dados: unknown = await resposta.json().catch(() => null);
  if (resposta.ok) return { ok: true, status: resposta.status, dados: dados ?? {} };

  const texto = dados && typeof dados === 'object' ? (dados as { erro?: unknown }).erro : null;
  const frase = fraseDoServico(texto);
  if (frase) return falha(resposta.status, 'servico', frase);
  if (resposta.status === 401 || resposta.status === 403) {
    anotar('recusou', `O serviço do WhatsApp recusou o segredo deste servidor (HTTP ${resposta.status}).`);
    return falha(502, 'recusou');
  }
  // O caminho vai sem a consulta: nela viajam telefone e id de conversa.
  const rota = caminho.split('?')[0];
  anotar(
    `servico:${resposta.status}:${rota.split('/')[3] || 'estado'}`,
    `O serviço do WhatsApp respondeu HTTP ${resposta.status} em ${rota}: ${typeof texto === 'string' ? texto : 'sem texto'}`,
  );
  return falha(resposta.status >= 500 ? 502 : resposta.status, 'servico');
}
