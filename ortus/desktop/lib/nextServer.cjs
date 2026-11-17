'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const log = require('./log.cjs');

/**
 * Sobe o servidor Next local, só em 127.0.0.1.
 *
 *  - desenvolvimento: usa o Next CLI de node_modules (hot reload).
 *  - produção: usa o build `standalone` que vai dentro do .exe e roda no
 *    próprio binário do Electron (ELECTRON_RUN_AS_NODE), então a máquina da
 *    clínica não precisa ter Node instalado.
 *
 * A janela e o WhatsApp nunca falam com a Vercel: todos os `/api/*` rodam
 * aqui dentro.
 */

function esperarHttp(porta, { timeoutMs = 120_000, intervaloMs = 300, caminho = '/' } = {}) {
  const inicio = Date.now();
  return new Promise((resolve, reject) => {
    const tentar = () => {
      const req = http.get({ host: '127.0.0.1', port: porta, path: caminho, timeout: 2_000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('timeout', () => {
        req.destroy();
        tentar();
      });
      req.on('error', () => {
        if (Date.now() - inicio > timeoutMs) {
          reject(new Error(`O servidor local não respondeu em ${Math.round(timeoutMs / 1000)}s.`));
          return;
        }
        setTimeout(tentar, intervaloMs);
      });
    };
    tentar();
  });
}

function caminhoNextProducao(recursos) {
  const base = path.join(recursos, 'app');
  const candidatos = [path.join(base, 'server.js'), path.join(base, '.next', 'standalone', 'server.js')];
  for (const candidato of candidatos) {
    if (fs.existsSync(candidato)) return candidato;
  }
  throw new Error(`Build standalone do Next não encontrado em ${base}.`);
}

/**
 * @param {object} ctx
 * @param {import('electron').App} ctx.app
 * @param {number} ctx.porta
 * @param {Record<string,string>} ctx.env  variáveis extras para o Next
 * @param {boolean} ctx.desenvolvimento
 */
function criarServidorNext(ctx) {
  const pacote = require(path.join(ctx.raiz, 'package.json'));
  const env = {
    ...process.env,
    ...ctx.env,
    NODE_ENV: ctx.desenvolvimento ? 'development' : 'production',
    PORT: String(ctx.porta),
    HOSTNAME: '127.0.0.1',
    NEXT_TELEMETRY_DISABLED: '1',
  };

  let filho = null;

  function iniciar() {
    if (ctx.desenvolvimento) {
      const cli = path.join(ctx.raiz, 'node_modules', 'next', 'dist', 'bin', 'next');
      filho = spawn(process.env.npm_node_execpath || 'node', [cli, 'dev', '-p', String(ctx.porta), '-H', '127.0.0.1'], {
        cwd: ctx.raiz,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } else {
      const servidor = caminhoNextProducao(ctx.recursos);
      const diretorio = path.dirname(servidor);
      filho = spawn(process.execPath, [servidor], {
        cwd: diretorio,
        env: { ...env, ELECTRON_RUN_AS_NODE: '1', ORTUS_DESKTOP_BUILD: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    }

    filho.stdout.on('data', (dado) => log.info(`next: ${String(dado).trimEnd()}`));
    filho.stderr.on('data', (dado) => log.aviso(`next: ${String(dado).trimEnd()}`));
    filho.on('exit', (codigo, sinal) => {
      log.aviso(`next: saiu (código ${codigo}, sinal ${sinal})`);
      filho = null;
    });
    filho.on('error', (err) => log.erro('next: falha ao iniciar', err));

    log.info(`next: iniciando em http://127.0.0.1:${ctx.porta} (v${pacote.version}, ${ctx.desenvolvimento ? 'dev' : 'produção'})`);
    return esperarHttp(ctx.porta, { timeoutMs: ctx.desenvolvimento ? 180_000 : 90_000 });
  }

  async function parar() {
    if (!filho) return;
    const alvo = filho;
    filho = null;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(alvo.pid), '/f', '/t'], { windowsHide: true });
      } else {
        alvo.kill('SIGTERM');
        setTimeout(() => {
          try {
            alvo.kill('SIGKILL');
          } catch {
            /* já morreu */
          }
        }, 3_000);
      }
    } catch (err) {
      log.aviso('next: falha ao encerrar', err);
    }
  }

  return { iniciar, parar };
}

module.exports = { criarServidorNext, esperarHttp };
