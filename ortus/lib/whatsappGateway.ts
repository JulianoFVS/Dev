import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const URL_BASE = (process.env.WHATSAPP_GATEWAY_URL || 'http://127.0.0.1:3920').replace(/\/$/, '');
const ARQUIVO_SEGREDO = path.join(process.cwd(), 'services', 'whatsapp', '.gateway-secret');

let subida: Promise<void> | null = null;
let processo: ChildProcess | null = null;
let falhaLocal = '';

function segredoAtual() {
  const doAmbiente = process.env.WHATSAPP_GATEWAY_SECRET || '';
  if (doAmbiente) return doAmbiente;
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

function gatewayEhLocal() {
  if (process.env.VERCEL || process.env.ORTUS_DESKTOP === '1') return false;
  try {
    const host = new URL(URL_BASE).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
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

/**
 * No site rodando em Node, o WhatsApp sobe junto com a primeira tela.
 * A clínica não executa comando. No aplicativo, o Electron já subiu o
 * serviço. Na Vercel o processo não fica vivo, então não tentamos aqui.
 */
function garantirSegredoLocal() {
  const atual = segredoAtual();
  if (atual) return atual;
  if (!gatewayEhLocal()) return '';
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

async function garantirWhatsappLocal() {
  const segredo = garantirSegredoLocal();
  if (!segredo || !gatewayEhLocal()) return;
  const porta = Number(new URL(URL_BASE).port || 3920);
  if (await saude(porta)) return;
  if (!subida) {
    subida = subirWhatsappLocal(porta).finally(() => {
      subida = null;
    });
  }
  await subida;
}

async function subirWhatsappLocal(porta: number) {
  const pasta = path.join(process.cwd(), 'services', 'whatsapp');
  const arquivo = path.join(pasta, 'server.mjs');
  if (!fs.existsSync(arquivo)) return;
  if (processo && processo.exitCode === null && !processo.killed) {
    /* o processo anterior ainda está abrindo */
  } else {
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
  falhaLocal = '';
  const anotar = (pedaco: Buffer) => {
    const texto = pedaco.toString('utf8').trim();
    if (texto) falhaLocal = texto.slice(-400);
  };
  filho.stdout?.on('data', anotar);
  filho.stderr?.on('data', anotar);
  filho.on('exit', (codigo) => {
    if (codigo) falhaLocal = falhaLocal || `O WhatsApp encerrou (código ${codigo}).`;
  });
  filho.unref();
  }
  const limite = Date.now() + 20_000;
  while (Date.now() < limite) {
    if (await saude(porta)) {
      falhaLocal = '';
      return;
    }
    if (!processo || processo.exitCode !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

export function whatsappGatewayConfigurado() {
  return Boolean(gatewayEhLocal() ? garantirSegredoLocal() : segredoAtual());
}

export async function chamarWhatsappGateway(caminho: string, init?: { method?: string; body?: unknown }) {
  await garantirWhatsappLocal();
  const segredo = segredoAtual();
  if (!segredo) {
    return { ok: false as const, status: 503, dados: { erro: 'Gateway do WhatsApp não configurado.' } };
  }
  try {
    const resposta = await fetch(`${URL_BASE}${caminho}`, {
      method: init?.method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-ortus-whatsapp-secret': segredo,
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
    const dados = await resposta.json().catch(() => ({}));
    return { ok: resposta.ok, status: resposta.status, dados };
  } catch {
    return {
      ok: false as const,
      status: 503,
      dados: { erro: falhaLocal || 'O WhatsApp ainda está abrindo. Tente de novo em alguns segundos.' },
    };
  }
}
