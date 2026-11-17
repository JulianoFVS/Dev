import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const URL_BASE = (process.env.WHATSAPP_GATEWAY_URL || 'http://127.0.0.1:3920').replace(/\/$/, '');
const SEGREDO = process.env.WHATSAPP_GATEWAY_SECRET || '';

let subida: Promise<void> | null = null;

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
async function garantirWhatsappLocal() {
  if (!SEGREDO || !gatewayEhLocal()) return;
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
  const filho = spawn(process.execPath, [arquivo], {
    cwd: pasta,
    env: {
      ...process.env,
      WHATSAPP_GATEWAY_HOST: '127.0.0.1',
      WHATSAPP_GATEWAY_PORT: String(porta),
      WHATSAPP_GATEWAY_SECRET: SEGREDO,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  filho.unref();
  const limite = Date.now() + 20_000;
  while (Date.now() < limite) {
    if (await saude(porta)) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

export function whatsappGatewayConfigurado() {
  return Boolean(SEGREDO);
}

export async function chamarWhatsappGateway(caminho: string, init?: { method?: string; body?: unknown }) {
  await garantirWhatsappLocal();
  if (!SEGREDO) {
    return { ok: false as const, status: 503, dados: { erro: 'Gateway do WhatsApp não configurado.' } };
  }
  try {
    const resposta = await fetch(`${URL_BASE}${caminho}`, {
      method: init?.method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-ortus-whatsapp-secret': SEGREDO,
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
      dados: { erro: 'O WhatsApp não abriu. Feche o Ortus e abra de novo.' },
    };
  }
}
