/**
 * Gera os assets da landing page a partir dos JPEGs originais da identidade.
 *
 *   npm run landing:assets
 *
 * Saídas em public/landing/:
 *   pessoas.png         — equipe com o fundo preto convertido em transparência
 *   ortus-wordmark.png  — logotipo "ortus" em azul sobre fundo transparente
 *   ortus-mark.png      — o glifo "o" isolado, para o badge da navbar
 *
 * As fontes são JPEG (sem canal alpha), por isso o recorte é feito aqui e não
 * em runtime: o fundo preto é removido por flood fill a partir das bordas, o
 * que preserva cabelos escuros no interior da silhueta.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SOURCES = {
  pessoas: process.env.ORTUS_SRC_PESSOAS,
  logo: process.env.ORTUS_SRC_LOGO,
};

const OUT_DIR = path.join(process.cwd(), 'public', 'landing');

/** Azul da marca (mesmo tom do logotipo original). */
const BRAND = { r: 20, g: 122, b: 255 };

const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * "Brancura" de um pixel. Serve para separar o texto branco do azul da marca:
 * a luminância do azul é alta (~107) por causa do canal B, mas o canal mínimo
 * fica baixo (~20), enquanto no branco todos os canais são altos.
 */
const whiteness = (r, g, b) => Math.min(r, g, b);

/**
 * Marca como fundo todo pixel escuro conectado às bordas da imagem.
 * Retorna um Uint8Array de alpha (0 = fundo, 255 = objeto).
 */
function keyOutBackground(data, width, height, channels, threshold) {
  const total = width * height;
  const alpha = new Uint8Array(total).fill(255);
  const stack = [];

  const isDark = (i) => {
    const o = i * channels;
    return luminance(data[o], data[o + 1], data[o + 2]) <= threshold;
  };

  const push = (i) => {
    if (alpha[i] === 0 || !isDark(i)) return;
    alpha[i] = 0;
    stack.push(i);
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }

  return alpha;
}

/** Erode o alpha em `radius` pixels para cortar a franja escura do JPEG. */
function erodeAlpha(alpha, width, height, radius) {
  let current = alpha;
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8Array(current);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (current[i] === 0) continue;
        const transparentNeighbour =
          (x > 0 && current[i - 1] === 0) ||
          (x < width - 1 && current[i + 1] === 0) ||
          (y > 0 && current[i - width] === 0) ||
          (y < height - 1 && current[i + width] === 0);
        if (transparentNeighbour) next[i] = 0;
      }
    }
    current = next;
  }
  return current;
}

function boundingBox(alpha, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function buildPessoas(source) {
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const keyed = keyOutBackground(data, width, height, channels, 30);
  const trimmed = erodeAlpha(keyed, width, height, 2);

  // Suaviza apenas o alpha: desfocar o RGB puxaria o preto do fundo para a
  // silhueta e criaria uma franja escura sobre o fundo claro da landing.
  // `toColourspace('b-w')` é obrigatório — sem ele o sharp devolve o raw
  // promovido a 3 canais e o alpha sai desalinhado.
  const softAlpha = await sharp(Buffer.from(trimmed), { raw: { width, height, channels: 1 } })
    .blur(0.6)
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  if (softAlpha.length !== width * height) {
    throw new Error(`alpha inesperado: ${softAlpha.length} != ${width * height}`);
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const src = i * channels;
    const dst = i * 4;
    rgba[dst] = data[src];
    rgba[dst + 1] = data[src + 1];
    rgba[dst + 2] = data[src + 2];
    rgba[dst + 3] = softAlpha[i];
  }

  const box = boundingBox(trimmed, width, height);
  const out = path.join(OUT_DIR, 'pessoas.png');

  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract(box)
    .png({ compressionLevel: 9 })
    .toFile(out);

  const opaque = trimmed.reduce((acc, a) => acc + (a > 8 ? 1 : 0), 0);
  console.log(
    `pessoas.png  ${box.width}x${box.height}  (recorte em ${box.left},${box.top})  ` +
      `${((opaque / (width * height)) * 100).toFixed(1)}% opaco`,
  );
  return box;
}

/** Perfil de colunas com pixels claros, usado para isolar o glifo "o". */
function whiteColumnProfile(data, width, height, channels, threshold) {
  const profile = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels;
      if (whiteness(data[o], data[o + 1], data[o + 2]) >= threshold) profile[x]++;
    }
  }
  return profile;
}

async function buildWordmark(source) {
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // A arte tem margem branca em volta do quadrado azul de cantos arredondados.
  // Um flood fill a partir das bordas marca tudo que não é azul e está ligado
  // ao exterior; o texto branco fica preservado porque o azul o circunda.
  const isBlue = (i) => {
    const o = i * channels;
    return data[o + 2] > 110 && data[o + 2] - data[o] > 45;
  };
  const outside = new Uint8Array(width * height);
  {
    const stack = [];
    const push = (i) => {
      if (outside[i] || isBlue(i)) return;
      outside[i] = 1;
      stack.push(i);
    };
    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width);
      push(y * width + width - 1);
    }
    while (stack.length) {
      const i = stack.pop();
      const x = i % width;
      const y = (i - x) / width;
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
  }

  // Afasta a borda da chapa alguns pixels para descartar o rim anti-serrilhado.
  const plateMask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) plateMask[i] = outside[i] ? 0 : 255;
  const plateInner = erodeAlpha(plateMask, width, height, 5);
  const plate = boundingBox(plateInner, width, height);
  console.log(`  chapa azul: ${plate.width}x${plate.height} em ${plate.left},${plate.top}`);

  // Dentro da chapa, o alpha vira a "brancura" do pixel.
  const LOW = 70;
  const HIGH = 190;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (!plateInner[i]) continue;
    const o = i * channels;
    const w = whiteness(data[o], data[o + 1], data[o + 2]);
    const t = Math.min(1, Math.max(0, (w - LOW) / (HIGH - LOW)));
    alpha[i] = Math.round(t * 255);
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const dst = i * 4;
    rgba[dst] = BRAND.r;
    rgba[dst + 1] = BRAND.g;
    rgba[dst + 2] = BRAND.b;
    rgba[dst + 3] = alpha[i];
  }

  const box = boundingBox(alpha, width, height);
  const wordmark = path.join(OUT_DIR, 'ortus-wordmark.png');
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract(box)
    .png({ compressionLevel: 9 })
    .toFile(wordmark);
  console.log(`ortus-wordmark.png  ${box.width}x${box.height}`);

  // Badge da navbar: isola o glifo "o". Um perfil de colunas não serve porque
  // a haste do "r" encosta no "o". O contorno do "o" é fechado, então seu
  // interior é a única região transparente que o flood fill de fora não
  // alcança: acha-se esse buraco e reconstrói-se o anel em volta dele.
  const solid = (i) => alpha[i] > 128;
  const reached = new Uint8Array(width * height);
  {
    const stack = [];
    const push = (i) => {
      if (reached[i] || solid(i)) return;
      reached[i] = 1;
      stack.push(i);
    };
    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width);
      push(y * width + width - 1);
    }
    while (stack.length) {
      const i = stack.pop();
      const x = i % width;
      const y = (i - x) / width;
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
  }

  const counter = new Uint8Array(width * height);
  for (let y = box.top; y < box.top + box.height; y++) {
    for (let x = box.left; x < box.left + box.width; x++) {
      const i = y * width + x;
      if (!solid(i) && !reached[i]) counter[i] = 255;
    }
  }
  const hole = boundingBox(counter, width, height);

  // Espessura do traço: da borda esquerda do miolo até o fim do anel.
  const midY = Math.round(hole.top + hole.height / 2);
  let stroke = 0;
  while (stroke < box.width && solid(midY * width + hole.left - 1 - stroke)) stroke++;

  const size = hole.width + stroke * 2;
  const markBox = {
    left: Math.max(0, hole.left - stroke),
    top: Math.max(0, Math.round(hole.top + hole.height / 2 - size / 2)),
    width: size,
    height: size,
  };
  const start = markBox.left;
  const end = markBox.left + size;

  const mark = path.join(OUT_DIR, 'ortus-mark.png');
  await sharp(source).extract(markBox).png({ compressionLevel: 9 }).toFile(mark);
  console.log(`ortus-mark.png  ${markBox.width}x${markBox.height}  (glifo "o" em x=${start}..${end})`);

  // Azul exato da chapa, para casar o CSS com a arte.
  const cx = plate.left + Math.round(plate.width * 0.06);
  const cy = plate.top + Math.round(plate.height * 0.06);
  const o = (cy * width + cx) * channels;
  const hex = (n) => n.toString(16).padStart(2, '0');
  console.log(`  azul da marca: #${hex(data[o])}${hex(data[o + 1])}${hex(data[o + 2])}`);
}

async function main() {
  const missing = Object.entries(SOURCES).filter(([, v]) => !v || !fs.existsSync(v));
  if (missing.length) {
    console.error('Fontes ausentes. Defina as variáveis de ambiente:');
    console.error('  ORTUS_SRC_PESSOAS=<jpeg da equipe>');
    console.error('  ORTUS_SRC_LOGO=<jpeg do logotipo>');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await buildPessoas(SOURCES.pessoas);
  await buildWordmark(SOURCES.logo);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
