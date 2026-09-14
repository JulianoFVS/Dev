/**
 * Gera favicon e ícones do app a partir do glifo "O" (ortus-mark.svg).
 * Uso: npm run icons:generate
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'landing', 'ortus-mark.svg');

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

if (!fs.existsSync(src)) {
  console.error('Arquivo não encontrado:', src);
  process.exit(1);
}

const base512 = await sharp(src)
  .resize(512, 512, { fit: 'contain', background: TRANSPARENT })
  .png({ compressionLevel: 9, force: true })
  .toBuffer();

const base32 = await sharp(base512).resize(32, 32).png({ force: true }).toBuffer();
const base16 = await sharp(base512).resize(16, 16).png({ force: true }).toBuffer();

const outputs512 = [
  path.join(root, 'public', 'icon-square.png'),
  path.join(root, 'public', 'favicon.png'),
  path.join(root, 'public', 'apple-icon.png'),
  path.join(root, 'app', 'icon.png'),
  path.join(root, 'app', 'apple-icon.png'),
];

for (const out of outputs512) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, base512);
  console.log('✓', path.relative(root, out));
}

fs.writeFileSync(path.join(root, 'public', 'favicon-32.png'), base32);
console.log('✓ public/favicon-32.png');

fs.writeFileSync(path.join(root, 'public', 'favicon-16.png'), base16);
console.log('✓ public/favicon-16.png');

console.log('\nConcluído — favicon Ortus (glifo O) com fundo transparente.');
