#!/usr/bin/env node
/**
 * Build do desktop.
 *
 * 1. gera `desktop/config.json` (URL + chave anônima do Supabase);
 * 2. roda `next build` com `output: 'standalone'`;
 * 3. copia `public/` e `.next/static/` para dentro do standalone, como o
 *    próprio Next exige para o servidor autocontido funcionar;
 * 4. deixa tudo pronto para o `electron-builder`.
 *
 * Uso: npm run desktop:build
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const standalone = path.join(raiz, '.next', 'standalone');

function copiar(origem, destino) {
  if (!fs.existsSync(origem)) return;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.cpSync(origem, destino, { recursive: true, force: true });
}

console.log('1/4 gerando desktop/config.json…');
const config = spawnSync(process.execPath, [path.join(raiz, 'scripts', 'desktop-config.mjs')], {
  stdio: 'inherit',
  cwd: raiz,
});
if (config.status !== 0) process.exit(config.status ?? 1);

console.log('2/4 next build (standalone)…');
const build = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'build'],
  {
    cwd: raiz,
    stdio: 'inherit',
    env: { ...process.env, ORTUS_DESKTOP_BUILD: '1', NEXT_PUBLIC_WHATSAPP_ATIVO: '1' },
  },
);
if (build.status !== 0) process.exit(build.status ?? 1);

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error('O build standalone não apareceu em .next/standalone/server.js.');
  process.exit(1);
}

console.log('3/4 copiando public/ e .next/static para o standalone…');
copiar(path.join(raiz, 'public'), path.join(standalone, 'public'));
copiar(path.join(raiz, '.next', 'static'), path.join(standalone, '.next', 'static'));

console.log('4/4 pronto.');
console.log('');
console.log('Gerar o instalador Windows (rodar no Windows ou CI):');
console.log('  npm run desktop:instalar');
console.log('');
console.log('O instalador sai em dist-desktop/ (Ortus Setup <versão>.exe).');
