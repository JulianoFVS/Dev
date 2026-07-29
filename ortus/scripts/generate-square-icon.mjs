/**
 * Gera favicon quadrado recortando o escudo (parte superior) da logo.
 * Uso: node scripts/generate-square-icon.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'logo.png');

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

const base512 = await sharp(cropped)
  .trim({ threshold: 20 })
  .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png({ compressionLevel: 9 })
  .toBuffer();

const base32 = await sharp(base512).resize(32, 32).png().toBuffer();

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

console.log('\nConcluído — favicon quadrado (escudo) gerado.');
