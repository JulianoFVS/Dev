#!/usr/bin/env node
/**
 * Baixa o Chromium que o Puppeteer vai usar dentro do .exe.
 *
 * O instalador precisa levar o navegador: a máquina da clínica não pode
 * depender de download em runtime. O Electron aponta
 * PUPPETEER_EXECUTABLE_PATH para o binário desta pasta.
 *
 * Uso:
 *   node scripts/desktop-chromium.mjs                    # plataforma desta máquina
 *   node scripts/desktop-chromium.mjs --plataforma=win64 # alvo específico
 *   node scripts/desktop-chromium.mjs --atual            # idem (compatibilidade)
 *
 * Para empacotar Windows a partir do macOS, rode com --plataforma=win64.
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
const argumento = process.argv.find((a) => a.startsWith('--plataforma='));
const plataforma = argumento ? argumento.split('=')[1] : process.argv.includes('--atual') ? plataformaAtual() : plataformaAtual();

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

/**
 * No macOS o executável em Contents/MacOS é um launcher de ~50 KB e o peso
 * real está em Contents/Frameworks. Nas outras plataformas o binário é grande.
 * A extração truncada do Puppeteer produce um .app sem Frameworks.
 */
function binarioValido(caminho) {
  try {
    if (caminho.includes('.app/Contents/MacOS/')) {
      const frameworks = path.join(caminho, '..', '..', 'Frameworks');
      return fs.existsSync(frameworks) && fs.readdirSync(frameworks).length > 0;
    }
    return fs.statSync(caminho).size > 1_000_000;
  } catch {
    return false;
  }
}

function acharZip(pasta, profundidade = 0) {
  if (profundidade > 5) return null;
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isFile() && entrada.name.endsWith('.zip')) return caminho;
    if (entrada.isDirectory()) {
      const achado = acharZip(caminho, profundidade + 1);
      if (achado) return achado;
    }
  }
  return null;
}

/**
 * O extrator do Puppeteer às vezes termina "com sucesso" mas deixa o app
 * incompleto (sem Frameworks / binário de 50 KB). Nesse caso extraímos o zip
 * com a ferramenta do sistema, que é confiável.
 */
function reExtrair(zip) {
  const alvo = path.join(destino, '_extraido');
  fs.mkdirSync(alvo, { recursive: true });
  console.log(`Extração incompleta detectada — refazendo com a ferramenta do sistema…`);
  const ferramenta =
    process.platform === 'darwin' ? ['ditto', ['-x', '-k', zip, alvo]]
    : process.platform === 'win32' ? ['tar', ['-xf', zip, '-C', alvo]]
    : ['unzip', ['-q', '-o', zip, '-d', alvo]];
  const resultado = spawnSync(ferramenta[0], ferramenta[1], { stdio: 'inherit' });
  if (resultado.status !== 0) console.error(`Falha ao extrair com ${ferramenta[0]}.`);
}

const NOMES = [
  'chrome.exe',
  'chrome',
  'chrome-headless-shell.exe',
  'chrome-headless-shell',
  'Google Chrome for Testing',
  'Chromium',
];

let binario = procurar(destino, NOMES);

if (!binario || !binarioValido(binario)) {
  const zip = acharZip(destino);
  if (zip) {
    reExtrair(zip);
    binario = procurar(destino, NOMES);
  }
}

if (!binario || !binarioValido(binario)) {
  console.error(
    'Chromium inválido: não encontrei um executável íntegro em build/chromium.',
    binario ? `(encontrado: ${binario})` : '',
  );
  process.exit(1);
}

// O .zip já não é necessário (economiza ~200 MB no pacote).
for (const arquivo of fs.readdirSync(destino)) {
  if (arquivo.endsWith('.zip')) fs.rmSync(path.join(destino, arquivo), { force: true });
}
(function apagarZips(pasta, profundidade = 0) {
  if (profundidade > 4) return;
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isFile() && entrada.name.endsWith('.zip')) fs.rmSync(caminho, { force: true });
    else if (entrada.isDirectory()) apagarZips(caminho, profundidade + 1);
  }
})(destino);

console.log('');
// Remove a extração truncada do Puppeteer (o navegador bom está em _extraido).
const pastaPuppeteer = path.join(destino, 'chrome');
if (binario.includes('_extraido') && fs.existsSync(pastaPuppeteer)) {
  fs.rmSync(pastaPuppeteer, { recursive: true, force: true });
}

console.log(`Chromium pronto: ${binario}`);
const peso = binario.includes('.app/Contents/MacOS/')
  ? fs.statSync(path.join(binario, '..', '..')).size
  : fs.statSync(binario).size;
console.log(`Peso do navegador: ${(peso / 1e6).toFixed(0)} MB.`);
console.log('Este caminho é resolvido em runtime por desktop/lib/whatsapp.cjs.');
