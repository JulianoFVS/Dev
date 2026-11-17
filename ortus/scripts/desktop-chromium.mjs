#!/usr/bin/env node
/**
 * Baixa o Chromium que o Puppeteer vai usar dentro do .exe.
 *
 * O instalador precisa levar o navegador: a máquina da clínica não pode
 * depender de download em runtime. O Electron aponta
 * PUPPETEER_EXECUTABLE_PATH para o binário desta pasta.
 *
 * Uso:
 *   node scripts/desktop-chromium.mjs            # win64 (alvo do instalador)
 *   node scripts/desktop-chromium.mjs --atual    # plataforma desta máquina (dev)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destino = path.join(raiz, 'build', 'chromium');
const cli = path.join(raiz, 'services', 'whatsapp', 'node_modules', '.bin', process.platform === 'win32' ? 'puppeteer.cmd' : 'puppeteer');

if (!fs.existsSync(cli)) {
  console.error('Puppeteer não encontrado. Rode antes: npm --prefix services/whatsapp ci');
  process.exit(1);
}

fs.mkdirSync(destino, { recursive: true });

// A CLI do Puppeteer usa nomes curtos: mac, mac_arm, win32, win64, linux.
function plataformaAtual() {
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'win32' : 'win64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac_arm' : 'mac';
  return 'linux';
}
const plataforma = process.argv.includes('--atual') ? plataformaAtual() : 'win64';

console.log(`Baixando Chrome ${plataforma} para build/chromium…`);
const resultado = spawnSync(cli, ['browsers', 'install', 'chrome@stable', '--platform', plataforma, '--path', destino], {
  stdio: 'inherit',
  cwd: raiz,
});

if (resultado.status !== 0) {
  console.error('Falha ao baixar o Chromium.');
  process.exit(resultado.status ?? 1);
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

/** Procura o executável em qualquer profundidade (o layout varia por versão). */
function procurar(pasta, nomes, profundidade = 0) {
  if (profundidade > 6) return null;
  let entradas = [];
  try {
    entradas = fs.readdirSync(pasta, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entrada of entradas) {
    if (entrada.isFile() && nomes.includes(entrada.name)) return path.join(pasta, entrada.name);
  }
  for (const entrada of entradas) {
    if (!entrada.isDirectory()) continue;
    const achado = procurar(path.join(pasta, entrada.name), nomes, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

const binario = procurar(destino, [
  'chrome.exe',
  'chrome',
  'chrome-headless-shell.exe',
  'chrome-headless-shell',
  'Google Chrome for Testing',
  'Chromium',
]);
console.log('');
console.log(binario ? `Chromium pronto: ${binario}` : 'Aviso: não localizei o executável dentro de build/chromium.');
console.log('Este caminho será resolvido em runtime por desktop/lib/whatsapp.cjs.');
