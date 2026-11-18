'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * Hook do electron-builder executado depois de montar a pasta do aplicativo
 * e ANTES de gerar o instalador (.exe, DMG, AppImage).
 *
 * 1. Em qualquer sistema: varre a pasta final atrás de arquivo `.env*` e de
 *    segredo (scripts/desktop-verificar.mjs). É a última barreira — depois
 *    daqui o conteúdo é comprimido dentro do instalador e ninguém mais olha.
 *    Achou alguma coisa, o build para.
 *
 * 2. No macOS: assina. Um app sem assinatura é encerrado pelo sistema na
 *    abertura — mesmo sem Gatekeeper. Sem conta Apple Developer, a solução é
 *    assinatura ad-hoc ("-"), que basta para uso interno na clínica.
 *    Para distribuir fora, troque por um Developer ID:
 *      CSC_LINK=.../cert.p12 CSC_KEY_PASSWORD=... npm run desktop:mac
 *    e configure a notarização.
 */
module.exports = async function afterPack(context) {
  const verificador = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'desktop-verificar.mjs')).href);
  // Lança erro (e derruba o build) se houver arquivo de ambiente ou segredo.
  const { cabecalho } = verificador.exigirPacoteLimpo([context.appOutDir]);
  console.log(`  • ${cabecalho}: nada encontrado em ${path.basename(context.appOutDir)}`);

  if (context.electronPlatformName !== 'darwin') return;

  const nomeApp = `${context.packager.appInfo.productFilename}.app`;
  const caminhoApp = path.join(context.appOutDir, nomeApp);

  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', caminhoApp], { stdio: 'inherit' });
    execFileSync('codesign', ['--verify', '--deep', '--verbose=1', caminhoApp], { stdio: 'inherit' });
    console.log(`assinatura ad-hoc aplicada: ${nomeApp}`);
  } catch (err) {
    // Falhar aqui é melhor do que gerar um DMG que não abre.
    throw new Error(`Não foi possível assinar ${nomeApp}: ${err instanceof Error ? err.message : err}`);
  }
};
