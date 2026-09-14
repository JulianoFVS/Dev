/**
 * Gera favicon e ícones do app: glifo "O" branco sobre fundo escuro (legível na aba).
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
/** neutral-950 — mesmo tom do painel de login */
const BG = { r: 10, g: 10, b: 10, alpha: 1 };

if (!fs.existsSync(src)) {
  console.error('Arquivo não encontrado:', src);
  process.exit(1);
}

function markSvgBranco() {
  let svg = fs.readFileSync(src, 'utf8');
  svg = svg.replace(/fill="[^"]*"/gi, 'fill="#ffffff"');
  svg = svg.replace(/fill:rgb\([^)]+\)/gi, 'fill:#ffffff');
  return Buffer.from(svg);
}

async function buildIcon(size) {
  const pad = Math.round(size * 0.14);
  const inner = size - pad * 2;
  const markSize = Math.round(inner * 0.72);

  const mark = await sharp(markSvgBranco())
    .resize(markSize, markSize, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();

  const radius = Math.round(size * 0.22);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`,
  );

  const plate = await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer();

  return sharp(plate)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9, force: true })
    .toBuffer();
}

const base512 = await buildIcon(512);
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

console.log('\nConcluído — favicon Ortus (O branco em fundo escuro arredondado).');
