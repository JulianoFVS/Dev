'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const log = require('./log.cjs');

/**
 * Sobe o servidor do WhatsApp (whatsapp-web.js) como filho do Electron,
 * sempre em 127.0.0.1.
 *
 * - O Chromium do Puppeteer vai empacotado e é apontado por
 *   PUPPETEER_EXECUTABLE_PATH, então a máquina da clínica não baixa nada.
 * - A sessão LocalAuth fica em userData/wwebjs (uma pasta por clínica) e
 *   sobrevive à atualização do programa.
 * - Fechar o programa NÃO desloga: só mata o processo. O logout de verdade
 *   só acontece quando o usuário escolhe "Desconectar" na tela.
 */

function requisitar(porta, caminho, { metodo = 'GET', segredo, timeoutMs = 8_000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: porta,
        path: caminho,
        method: metodo,
        timeout: timeoutMs,
        headers: segredo ? { 'x-ortus-whatsapp-secret': segredo } : {},
      },
      (res) => {
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (pedaco) => {
          corpo += pedaco;
        });
        res.on('end', () => {
          let dados = {};
          try {
            dados = corpo ? JSON.parse(corpo) : {};
          } catch {
            dados = { bruto: corpo };
          }
          resolve({ status: res.statusCode || 0, dados });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('Tempo esgotado ao falar com o WhatsApp.'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function esperarSaude(porta, timeoutMs = 60_000) {
  const inicio = Date.now();
  for (;;) {
    try {
      const { status } = await requisitar(porta, '/saude', { timeoutMs: 2_000 });
      if (status === 200) return true;
    } catch {
      /* ainda subindo */
    }
    if (Date.now() - inicio > timeoutMs) throw new Error('O serviço do WhatsApp não respondeu.');
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

/**
 * @param {object} ctx
 * @param {import('electron').App} ctx.app
 * @param {number} ctx.porta
 * @param {string} ctx.segredo
 * @param {string} ctx.pastaSessoes
 * @param {string} ctx.recursos
 * @param {string} ctx.raiz
 * @param {boolean} ctx.desenvolvimento
 * @param {Record<string,string>} ctx.env
 */
function criarServicoWhatsapp(ctx) {
  let filho = null;
  let parado = false;
  let tentativas = 0;

  function script() {
    const dev = path.join(ctx.raiz, 'services', 'whatsapp', 'server.mjs');
    if (ctx.desenvolvimento && fs.existsSync(dev)) return { arquivo: dev, cwd: path.dirname(dev) };
    const prod = path.join(ctx.recursos, 'whatsapp', 'server.mjs');
    if (fs.existsSync(prod)) return { arquivo: prod, cwd: path.dirname(prod) };
    return { arquivo: dev, cwd: path.dirname(dev) };
  }


/** Nome de executável de Chromium/Chrome Headless em qualquer plataforma. */
function ehExecutavelChrome(nome) {
  const alvo = nome.toLowerCase();
  return (
    alvo === 'chrome.exe' ||
    alvo === 'chrome' ||
    alvo === 'chrome-headless-shell.exe' ||
    alvo === 'chrome-headless-shell' ||
    alvo === 'google chrome for testing' ||
    alvo === 'chromium'
  );
}

  /** O layout do download varia por versão; procura o executável na árvore. */
  function procurarExecutavel(pasta, profundidade = 0) {
    if (profundidade > 6) return null;
    let entradas = [];
    try {
      entradas = fs.readdirSync(pasta, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entrada of entradas) {
      if (entrada.isFile() && ehExecutavelChrome(entrada.name)) {
        return path.join(pasta, entrada.name);
      }
    }
    for (const entrada of entradas) {
      if (!entrada.isDirectory()) continue;
      const achado = procurarExecutavel(path.join(pasta, entrada.name), profundidade + 1);
      if (achado) return achado;
    }
    return null;
  }

  function chromium() {
    // 1) caminho explícito; 2) Chromium empacotado; 3) build local (dev)
    const doAmbiente = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (doAmbiente && fs.existsSync(doAmbiente)) return doAmbiente;
    const empacotado = procurarExecutavel(path.join(ctx.recursos, 'chromium'));
    if (empacotado) return empacotado;
    if (ctx.desenvolvimento) return procurarExecutavel(path.join(ctx.raiz, 'build', 'chromium'));
    return null;
  }

  function iniciar() {
    const { arquivo, cwd } = script();
    if (!fs.existsSync(arquivo)) {
      log.aviso('whatsapp: server.mjs não encontrado, aba fica indisponível');
      return Promise.resolve(false);
    }

    const binario = chromium();
    if (binario) log.info('whatsapp: Chromium empacotado em', binario);
    else log.aviso('whatsapp: Chromium empacotado não encontrado; o Puppeteer tentará o cache local');

    const env = {
      ...process.env,
      ...ctx.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      WHATSAPP_GATEWAY_PORT: String(ctx.porta),
      WHATSAPP_GATEWAY_HOST: '127.0.0.1',
      WHATSAPP_GATEWAY_SECRET: ctx.segredo,
      WHATSAPP_DATA_DIR: ctx.pastaSessoes,
      ORTUS_LOCAL_DB: '1',
      ...(binario ? { PUPPETEER_EXECUTABLE_PATH: binario } : {}),
    };
    delete env.PORT; // evita o server.mjs achar que está em PaaS

    filho = spawn(process.execPath, [arquivo], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    filho.stdout.on('data', (dado) => log.info(`whatsapp: ${String(dado).trimEnd()}`));
    filho.stderr.on('data', (dado) => log.aviso(`whatsapp: ${String(dado).trimEnd()}`));
    filho.on('exit', (codigo) => {
      log.aviso(`whatsapp: saiu (código ${codigo})`);
      filho = null;
      if (parado || tentativas >= 4) return;
      tentativas += 1;
      setTimeout(() => {
        if (!parado) iniciar();
      }, 2000);
    });
    filho.on('error', (err) => log.erro('whatsapp: falha ao iniciar', err));

    log.info(`whatsapp: iniciando em http://127.0.0.1:${ctx.porta}`);
    return esperarSaude(ctx.porta).then(() => {
      tentativas = 0;
      return true;
    }).catch((err) => {
      log.erro('whatsapp: não subiu', err);
      return false;
    });
  }

  /** Encerra o processo sem deslogar (a sessão fica no disco). */
  function parar() {
    parado = true;
    if (!filho) return;
    const alvo = filho;
    filho = null;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(alvo.pid), '/f', '/t'], { windowsHide: true });
      } else {
        alvo.kill('SIGTERM');
      }
    } catch (err) {
      log.aviso('whatsapp: falha ao encerrar', err);
    }
  }

  /** Logout de verdade: pede ao servidor para destruir a sessão LocalAuth. */
  async function desconectar(clinicaId) {
    try {
      const { status } = await requisitar(ctx.porta, `/sessoes/${encodeURIComponent(clinicaId)}`, {
        metodo: 'DELETE',
        segredo: ctx.segredo,
      });
      return status >= 200 && status < 300;
    } catch (err) {
      log.aviso('whatsapp: falha ao desconectar', err);
      return false;
    }
  }

  async function estaDePé() {
    if (!filho) return false;
    try {
      const { status } = await requisitar(ctx.porta, '/saude', { timeoutMs: 2_000 });
      return status === 200;
    } catch {
      return false;
    }
  }

  return { iniciar, parar, desconectar, estaDePé };
}

module.exports = { criarServicoWhatsapp, requisitar };
