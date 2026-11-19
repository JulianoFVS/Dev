#!/usr/bin/env node
/**
 * Build do desktop.
 *
 * 1. gera `desktop/config.json` (URL + chave anônima do Supabase);
 * 2. roda `next build` com `output: 'standalone'`, num ambiente que só tem
 *    o que o aplicativo precisa (nenhum segredo do servidor do site);
 * 3. copia `public/` e `.next/static/` para dentro do standalone, como o
 *    próprio Next exige para o servidor autocontido funcionar;
 * 4. confere que nenhum arquivo `.env*` e nenhum segredo foi parar na pasta
 *    que vai para o instalador (scripts/desktop-verificar.mjs) — e falha se foi.
 *
 * Uso: npm run desktop:build
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ambienteDoBuild,
  exigirPacoteLimpo,
  pastasDoPacote,
  removerArquivosDeAmbiente,
} from './desktop-verificar.mjs';

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

console.log('2/4 next build (standalone), com o ambiente saneado…');
const { env, neutralizadas } = ambienteDoBuild({ raiz });
console.log(`    ${Object.keys(env).length} variáveis passam para o build; o resto do seu ambiente fica de fora.`);
if (neutralizadas.length) {
  console.log(`    presentes nos .env* da raiz e NÃO carregadas: ${neutralizadas.join(', ')}`);
}
// Direto pelo Node, sem npx nem shell: o ambiente chega ao Next exatamente
// como foi montado acima.
const build = spawnSync(process.execPath, [path.join(raiz, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
  cwd: raiz,
  stdio: 'inherit',
  env,
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error('O build standalone não apareceu em .next/standalone/server.js.');
  process.exit(1);
}

console.log('3/4 copiando public/ e .next/static para o standalone…');
copiar(path.join(raiz, 'public'), path.join(standalone, 'public'));
copiar(path.join(raiz, '.next', 'static'), path.join(standalone, '.next', 'static'));
const removidos = removerArquivosDeAmbiente(standalone);
if (removidos.length) {
  console.log(`    cópias de arquivo de ambiente retiradas do standalone: ${removidos.join(', ')}`);
}

console.log('4/4 conferindo que nenhum segredo entrou no pacote…');
try {
  const { cabecalho, texto } = exigirPacoteLimpo(pastasDoPacote(raiz), { raiz });
  console.log(`    ${cabecalho}`);
  console.log(texto);
  console.log('    nenhum arquivo de ambiente e nenhum segredo encontrado.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

console.log('');
console.log('Pronto. Gerar o instalador:');
console.log('  npm run desktop:win      → .exe NSIS x64     (rodar no Windows ou CI)');
console.log('  npm run desktop:mac      → .dmg + .zip (arm64 e x64)');
console.log('  npm run desktop:linux    → AppImage + .deb   (rodar no Linux)');
console.log('');
console.log('O instalador sai em dist-desktop/ (Ortus-Setup-<versão>.exe).');
console.log('Sem ORTUS_ASSINATURA definido ele sai SEM assinatura digital — veja desktop/README.md.');
