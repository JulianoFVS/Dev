/**
 * Compara a landing renderizada com a arte de referência.
 *
 *   node scripts/compare-landing.mjs <referencia> <captura>
 *
 * Ambas as imagens são normalizadas para 1024x682 (o tamanho da referência) e
 * o script imprime a caixa de alguns elementos-chave, para conferir proporção
 * e posição sem depender de medição a olho.
 */
import sharp from 'sharp';

const W = 1024;
const H = 682;

const isWhite = (r, g, b) => r > 246 && g > 246 && b > 246;
const isBrandBlue = (r, g, b) => b > 190 && r < 110 && g > 90 && g < 190;

async function load(file) {
  const { data } = await sharp(file).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

function box(data, predicate, region) {
  const { x0 = 0, y0 = 0, x1 = W, y1 = H } = region ?? {};
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * W + x) * 3;
      if (!predicate(data[o], data[o + 1], data[o + 2])) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const fmt = (b) => (b ? `x=${b.x} y=${b.y} ${b.w}x${b.h}` : '(não encontrado)');

/**
 * Maior sequência horizontal de branco puro numa linha. Serve para as pílulas
 * (navbar, barra de marcas), cujo fundo em volta é quase branco e por isso
 * atrapalharia uma busca por caixa envolvente.
 */
function longestWhiteRun(data, y) {
  let best = null;
  let start = -1;
  for (let x = 0; x <= W; x++) {
    const o = (y * W + x) * 3;
    const white = x < W && Math.min(data[o], data[o + 1], data[o + 2]) >= 250;
    if (white && start < 0) start = x;
    if (!white && start >= 0) {
      if (!best || x - start > best.w) best = { x: start, y, w: x - start, h: 1 };
      start = -1;
    }
  }
  return best;
}

const ALVOS = [
  ['pílula da navbar', (d) => longestWhiteRun(d, 35)],
  ['logotipo "ortus"', (d) => box(d, isBrandBlue, { y0: 80, y1: 240 })],
  ['botões', (d) => box(d, isBrandBlue, { y0: 285, y1: 340, x0: 150, x1: 874 })],
  ['barra de marcas', (d) => longestWhiteRun(d, 641)],
];

const [, , refFile, shotFile] = process.argv;
if (!refFile || !shotFile) {
  console.error('uso: node scripts/compare-landing.mjs <referencia> <captura>');
  process.exit(1);
}

const ref = await load(refFile);
const shot = await load(shotFile);

console.log(`${'elemento'.padEnd(20)} ${'referência'.padEnd(26)} captura`);
for (const [nome, medir] of ALVOS) {
  console.log(`${nome.padEnd(20)} ${fmt(medir(ref)).padEnd(26)} ${fmt(medir(shot))}`);
}
