'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

/**
 * Hook do electron-builder executado depois de montar o .app e ANTES de
 * gerar o DMG.
 *
 * No macOS, um app sem assinatura é encerrado pelo sistema na abertura —
 * mesmo sem Gatekeeper. Sem conta Apple Developer, a solução é assinatura
 * ad-hoc ("-"), que basta para uso interno na clínica.
 *
 * Para distribuir fora, troque por um Developer ID:
 *   CSC_LINK=.../cert.p12 CSC_KEY_PASSWORD=... npm run desktop:mac
 * e configure a notarização.
 */
module.exports = async function afterPack(context) {
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
