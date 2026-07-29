/**
 * Gera favicon quadrado (escudo) com fundo transparente.
 * Uso: node scripts/generate-square-icon.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'logo.png');

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function removerFundoClaro(inputBuffer, limiar = 245) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (r >= limiar && g >= limiar && b >= limiar) {
      px[i + 3] = 0;
    }
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } });
}

const meta = await sharp(src).metadata();
const { width = 0, height = 0 } = meta;
console.log(`Logo: ${width}x${height}`);

const cropSize = Math.round(Math.min(width, height) * 0.46);
const left = Math.round((width - cropSize) / 2);
const top = Math.round(height * 0.06);

const cropped = await sharp(src)
  .extract({ left, top, width: cropSize, height: cropSize })
  .png()
  .toBuffer();

const trimmed = await sharp(cropped).trim({ threshold: 20 }).png().toBuffer();
const semFundo = await removerFundoClaro(trimmed);

const base512 = await semFundo
  .resize(512, 512, { fit: 'contain', background: TRANSPARENT })
  .png({ compressionLevel: 9, force: true })
  .toBuffer();

const base32 = await sharp(base512).resize(32, 32).png({ force: true }).toBuffer();

const outputs512 = [
  path.join(root, 'public', 'icon-square.png'),
  path.join(root, 'public', 'favicon.png'),
  path.join(root, 'public', 'apple-icon.png'),
  path.join(root, 'app', 'icon.png'),
  path.join(root, 'app', 'apple-icon.png'),
];

for (const out of outputs512) {
  fs.writeFileSync(out, base512);
  console.log('✓', path.relative(root, out));
}

fs.writeFileSync(path.join(root, 'public', 'favicon-32.png'), base32);
console.log('✓ public/favicon-32.png');

console.log('\nConcluído — favicon com fundo transparente.');
