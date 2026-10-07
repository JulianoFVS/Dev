/**
 * Ilustração do "depois" para HOF. Não é resultado clínico.
 *
 * As marcações são feitas no rosto de referência (feminino/masculino) em % da caixa 3:4.
 * A boca é detectada na foto e serve de régua: largura média da boca ≈ 50 mm.
 * Com isso as doses viram milímetros de alteração e os pontos são levados para o rosto da foto.
 */

export type MarcacaoPreview = {
  x: number;
  y: number;
  tipo: string;
  dosagem?: string;
};

export type Referencia = 'feminina' | 'masculina';

type Imagem = { data: Uint8ClampedArray; width: number; height: number };

export type Boca = {
  cx: number;
  cy: number;
  largura: number;
  alturaSup: number;
  alturaInf: number;
};

type Zona =
  | 'labio-sup'
  | 'labio-inf'
  | 'nariz'
  | 'olheira'
  | 'periocular'
  | 'glabela'
  | 'testa'
  | 'temporal'
  | 'malar'
  | 'nasogeniano'
  | 'marionete'
  | 'mento'
  | 'papada'
  | 'masseter'
  | 'mandibula'
  | 'geral';

type Campo = { cx: number; cy: number; su: number; sv: number; ang: number; vx: number; vy: number };
type TipoTom = 'linhas' | 'sombra' | 'textura' | 'brilho' | 'tom';
type Tom = { cx: number; cy: number; su: number; sv: number; ang: number; tipo: TipoTom; a: number };

/** Boca dos rostos de referência, em fração da largura/altura da caixa 3:4. */
const REF: Record<Referencia, { cx: number; cy: number; largura: number; alturaSup: number; alturaInf: number }> = {
  feminina: { cx: 0.502, cy: 0.689, largura: 0.225, alturaSup: 0.03, alturaInf: 0.042 },
  masculina: { cx: 0.501, cy: 0.698, largura: 0.223, alturaSup: 0.028, alturaInf: 0.036 },
};

const LARGURA_BOCA_MM = 50;

function limitar(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function doseNumero(dose?: string) {
  if (!dose) return null;
  const n = parseFloat(String(dose).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 1 na dose típica; satura acima disso (2× a dose não dobra o efeito). */
function intensidade(dose: number | null, tipica: number) {
  const d = dose ?? tipica;
  return Math.min(1.6, (1 - Math.exp(-d / tipica)) / (1 - Math.exp(-1)));
}

/** Zonas no rosto de referência (% da caixa). */
export function zonaDoPonto(x: number, y: number): Zona {
  const lateral = Math.abs(x - 50);
  if (y >= 65.5 && y <= 74 && x >= 37 && x <= 64) return y < 69.2 ? 'labio-sup' : 'labio-inf';
  if (y >= 44 && y <= 60.5 && lateral <= 7.5) return 'nariz';
  if (y >= 44.5 && y <= 50 && lateral >= 6 && lateral <= 20) return 'olheira';
  if (y >= 38 && y <= 48 && lateral > 20) return 'periocular';
  if (y >= 32 && y < 41.5 && lateral <= 9) return 'glabela';
  if (y >= 26 && y < 42 && lateral >= 28) return 'temporal';
  if (y < 34) return 'testa';
  if (y >= 59 && y <= 69 && lateral >= 5.5 && lateral <= 15) return 'nasogeniano';
  if (y >= 72 && y <= 80 && lateral >= 8 && lateral <= 17) return 'marionete';
  if (y >= 86 && lateral <= 15) return 'papada';
  if (y >= 74 && lateral < 10) return 'mento';
  if (y >= 60 && y <= 79 && lateral >= 20) return 'masseter';
  if (y >= 70 && lateral >= 10) return 'mandibula';
  if (y >= 46 && y <= 59 && lateral >= 13) return 'malar';
  return 'geral';
}

function zonaDaMarcacao(m: MarcacaoPreview): Zona {
  const z = zonaDoPonto(m.x, m.y);
  if (m.tipo === 'labial') return m.y < 69.2 ? 'labio-sup' : 'labio-inf';
  if (m.tipo === 'rino') return 'nariz';
  if (m.tipo === 'olheira') return 'olheira';
  if (m.tipo === 'mento') return 'mento';
  if (m.tipo === 'papada') return 'papada';
  if (m.tipo === 'mandibula') return z === 'mento' ? 'mento' : 'mandibula';
  return z;
}

function lum(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function pontuacaoLabio(r: number, g: number, b: number) {
  return (r - g) - 2 * (g - b);
}

/** Encontra a boca pela cor do vermelhão. Retorna null se não achar algo plausível. */
export function detectarBoca(img: Imagem): Boca | null {
  const { data, width: w, height: h } = img;
  const x0 = Math.round(w * 0.3);
  const x1 = Math.round(w * 0.7);
  const y0 = Math.round(h * 0.52);
  const y1 = Math.round(h * 0.88);
  const amostras: number[] = [];
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * w + x) * 4;
      amostras.push(pontuacaoLabio(data[i], data[i + 1], data[i + 2]));
    }
  }
  if (!amostras.length) return null;
  amostras.sort((a, b) => a - b);
  const pele = amostras[Math.floor(amostras.length / 2)];
  const limiar = pele + 22;
  const ehLabio = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return r > 60 && pontuacaoLabio(r, g, b) > limiar;
  };

  const cx0 = Math.round(w * 0.42);
  const cx1 = Math.round(w * 0.58);
  const linhas: boolean[] = [];
  for (let y = y0; y < y1; y++) {
    let n = 0;
    for (let x = cx0; x < cx1; x++) if (ehLabio(x, y)) n++;
    linhas.push(n / (cx1 - cx0) > 0.35);
  }

  const esperado = h * 0.69 - y0;
  let melhor: [number, number] | null = null;
  let melhorNota = -Infinity;
  let ini = -1;
  let vazio = 0;
  for (let i = 0; i <= linhas.length; i++) {
    const on = i < linhas.length && linhas[i];
    if (on) {
      if (ini < 0) ini = i;
      vazio = 0;
    } else if (ini >= 0) {
      vazio++;
      if (vazio > Math.max(2, Math.round(h * 0.004)) || i === linhas.length) {
        const fim = i - vazio;
        const alt = fim - ini + 1;
        const nota = alt - Math.abs((ini + fim) / 2 - esperado) * 0.35;
        if (alt >= h * 0.018 && alt <= h * 0.13 && nota > melhorNota) {
          melhorNota = nota;
          melhor = [ini, fim];
        }
        ini = -1;
        vazio = 0;
      }
    }
  }
  if (!melhor) return null;
  const topo = y0 + melhor[0];
  const base = y0 + melhor[1];

  const faixa = Math.max(2, Math.round(w * 0.02));
  const meio = Math.round(w * 0.5);
  let estomio = Math.round((topo + base) / 2);
  let menor = Infinity;
  for (let y = topo + Math.round((base - topo) * 0.2); y <= base - Math.round((base - topo) * 0.2); y++) {
    let soma = 0;
    for (let x = meio - faixa; x <= meio + faixa; x++) {
      const i = (y * w + x) * 4;
      soma += lum(data[i], data[i + 1], data[i + 2]);
    }
    if (soma < menor) {
      menor = soma;
      estomio = y;
    }
  }

  const altura = base - topo + 1;
  const colunaTem = (x: number) => {
    let n = 0;
    for (let y = topo; y <= base; y++) if (ehLabio(x, y)) n++;
    return n / altura > 0.22;
  };
  let esq = meio;
  let falhas = 0;
  for (let x = meio; x > w * 0.2; x--) {
    if (colunaTem(x)) {
      esq = x;
      falhas = 0;
    } else if (++falhas > 3) break;
  }
  let dir = meio;
  falhas = 0;
  for (let x = meio; x < w * 0.8; x++) {
    if (colunaTem(x)) {
      dir = x;
      falhas = 0;
    } else if (++falhas > 3) break;
  }
  const largura = dir - esq;
  const alturaSup = estomio - topo;
  const alturaInf = base - estomio;
  if (largura < w * 0.12 || largura > w * 0.5) return null;
  if (alturaSup < h * 0.006 || alturaInf < h * 0.008) return null;
  return { cx: (esq + dir) / 2, cy: estomio, largura, alturaSup, alturaInf };
}

function bocaPadrao(ref: Referencia, w: number, h: number): Boca {
  const r = REF[ref];
  return { cx: r.cx * w, cy: r.cy * h, largura: r.largura * w, alturaSup: r.alturaSup * h, alturaInf: r.alturaInf * h };
}

type Plano = {
  boca: Boca;
  ganhoSup: number;
  ganhoInf: number;
  campos: Campo[];
  tons: Tom[];
};

function ganhoLabio(ml: number) {
  return 0.5 * (1 - Math.exp(-ml / 0.65));
}

function montarPlano(marcas: MarcacaoPreview[], img: Imagem, ref: Referencia): Plano {
  const w = img.width;
  const h = img.height;
  const boca = detectarBoca(img) ?? bocaPadrao(ref, w, h);
  const r = REF[ref];
  const escala = boca.largura / (r.largura * w);
  const px = boca.largura / LARGURA_BOCA_MM;
  const paraFoto = (x: number, y: number) => ({
    x: boca.cx + ((x / 100) * w - r.cx * w) * escala,
    y: boca.cy + ((y / 100) * h - r.cy * h) * escala,
  });

  let mlSup = 0;
  let mlInf = 0;
  let flip = 0;
  const campos: Campo[] = [];
  const tons: Tom[] = [];

  const campo = (x: number, y: number, su: number, sv: number, vx: number, vy: number, ang = 0) =>
    campos.push({ cx: x, cy: y, su: su * px, sv: sv * px, ang, vx: vx * px, vy: vy * px });
  const tom = (x: number, y: number, su: number, sv: number, tipo: TipoTom, a: number, ang = 0) => {
    if (a > 0.003) tons.push({ cx: x, cy: y, su: su * px, sv: sv * px, ang, tipo, a });
  };

  for (const m of marcas) {
    const zona = zonaDaMarcacao(m);
    const dose = doseNumero(m.dosagem);
    const p = paraFoto(m.x, m.y);
    const lado = p.x < boca.cx ? -1 : 1;
    const ehVolume = ['preenchimento', 'labial', 'rino', 'olheira', 'mento', 'mandibula'].includes(m.tipo);

    if (ehVolume && (zona === 'labio-sup' || zona === 'labio-inf')) {
      const ml = dose ?? 0.5;
      if (Math.abs(m.y - 69.2) < 0.9) {
        mlSup += ml * 0.4;
        mlInf += ml * 0.6;
      } else if (zona === 'labio-sup') mlSup += ml;
      else mlInf += ml;
      continue;
    }

    if (ehVolume || m.tipo === 'bioestimulador') {
      const bio = m.tipo === 'bioestimulador';
      const k = bio ? 0.4 : 1;
      if (zona === 'malar' || (bio && zona === 'geral')) {
        const f = intensidade(dose, bio ? 1 : 0.5) * k;
        campo(p.x, p.y, 9, 7, lado * 1.1 * f, -0.7 * f);
        tom(p.x, p.y - 2 * px, 7, 5, 'brilho', 0.035 * f);
        tom(p.x, p.y + 8 * px, 10, 6, 'sombra', 0.3 * f);
      } else if (zona === 'temporal') {
        const f = intensidade(dose, bio ? 1 : 0.5) * k;
        campo(p.x, p.y, 8, 10, lado * 0.9 * f, 0);
        tom(p.x, p.y, 8, 10, 'sombra', 0.4 * f);
      } else if (zona === 'nasogeniano') {
        const f = intensidade(dose, bio ? 1 : 0.5) * k;
        tom(p.x, p.y, 3, 8.5, 'sombra', Math.min(0.85, 0.72 * f), lado * 0.32);
        tom(p.x, p.y, 3, 8, 'brilho', 0.015 * f, lado * 0.32);
      } else if (zona === 'marionete') {
        const f = intensidade(dose, 0.5) * k;
        tom(p.x, p.y, 3, 7, 'sombra', Math.min(0.85, 0.68 * f), lado * 0.2);
      } else if (zona === 'olheira') {
        const f = intensidade(dose, 0.3) * k;
        tom(p.x, p.y, 8, 2.6, 'sombra', Math.min(0.85, 0.75 * f), -lado * 0.2);
        tom(p.x, p.y, 8, 3, 'brilho', 0.02 * f, -lado * 0.2);
        campo(p.x, p.y, 7, 3, 0, -0.2 * f);
      } else if (zona === 'nariz') {
        const f = intensidade(dose, 0.3) * k;
        if (m.y > 54) {
          campo(p.x, p.y, 3.5, 3.5, 0, -0.8 * f);
          tom(p.x, p.y - 1.5 * px, 2.5, 2.5, 'brilho', 0.03 * f);
        } else {
          tom(p.x, p.y, 1.8, 9, 'brilho', 0.045 * f);
          tom(p.x, p.y, 3, 9, 'sombra', 0.25 * f);
        }
      } else if (zona === 'mento' || zona === 'papada') {
        const f = intensidade(dose, 1) * k;
        campo(p.x, p.y, 9, 7, 0, 1.5 * f);
        tom(p.x, p.y - 1 * px, 6, 5, 'brilho', 0.03 * f);
      } else if (zona === 'mandibula' || zona === 'masseter') {
        const f = intensidade(dose, 1) * k;
        campo(p.x, p.y, 9, 7, lado * 1.2 * f, 0.6 * f);
        tom(p.x, p.y, 8, 4, 'brilho', 0.025 * f);
      } else if (zona === 'glabela' || zona === 'periocular') {
        const f = intensidade(dose, 0.3) * k;
        tom(p.x, p.y, 6, 6, 'sombra', 0.45 * f);
      } else if (zona === 'testa') {
        const f = intensidade(dose, 1) * k;
        tom(p.x, p.y, 18, 10, 'sombra', 0.4 * f);
        tom(p.x, p.y, 16, 9, 'brilho', 0.02 * f);
      } else {
        const f = intensidade(dose, 0.5) * k;
        tom(p.x, p.y, 8, 8, 'sombra', 0.3 * f);
        tom(p.x, p.y, 7, 7, 'brilho', 0.025 * f);
      }
      if (bio) tom(p.x, p.y, 16, 16, 'textura', 0.22 * intensidade(dose, 1));
      continue;
    }

    if (m.tipo === 'toxina') {
      if (zona === 'labio-sup' || zona === 'labio-inf') {
        flip += 0.08 * intensidade(dose, 4);
      } else if (zona === 'testa') {
        const f = intensidade(dose, 8);
        tom(p.x, p.y, 22, 9, 'linhas', Math.min(0.92, 0.85 * f));
        tom(p.x, p.y, 20, 9, 'textura', 0.15 * f);
      } else if (zona === 'glabela') {
        tom(p.x, p.y, 8, 7, 'linhas', Math.min(0.92, 0.9 * intensidade(dose, 5)));
      } else if (zona === 'periocular') {
        const f = intensidade(dose, 6);
        tom(p.x, p.y, 9, 9, 'linhas', Math.min(0.9, 0.85 * f));
        campo(p.x - lado * 3 * px, p.y - 12 * px, 8, 6, 0, -0.7 * f);
      } else if (zona === 'masseter' || zona === 'mandibula') {
        const f = intensidade(dose, 25);
        campo(p.x, p.y, 13, 17, -lado * 3.2 * f, 0);
      } else if (zona === 'mento') {
        const f = intensidade(dose, 4);
        tom(p.x, p.y, 9, 7, 'linhas', 0.6 * f);
        tom(p.x, p.y, 9, 7, 'textura', 0.3 * f);
      } else if (zona === 'marionete') {
        campo(p.x, p.y, 5, 5, 0, -0.6 * intensidade(dose, 4));
      } else if (zona === 'nariz') {
        tom(p.x, p.y, 6, 5, 'linhas', 0.7 * intensidade(dose, 4));
      } else if (zona === 'papada') {
        const f = intensidade(dose, 10);
        campo(p.x, p.y, 14, 8, 0, -0.8 * f);
        tom(p.x, p.y, 14, 8, 'linhas', 0.5 * f);
      } else {
        tom(p.x, p.y, 8, 8, 'linhas', 0.5 * intensidade(dose, 4));
      }
      continue;
    }

    if (m.tipo === 'fios') {
      const f = intensidade(dose, 2.5);
      campo(p.x, p.y, 12, 12, lado * 1.0 * f, -2.2 * f);
      tom(p.x, p.y + 6 * px, 9, 7, 'sombra', 0.25 * f);
      continue;
    }

    if (m.tipo === 'papada') {
      const f = intensidade(dose, 2);
      campo(p.x, p.y, 16, 9, 0, -2 * f);
      continue;
    }

    if (m.tipo === 'skinbooster') {
      const f = intensidade(dose, 1);
      tom(p.x, p.y, 22, 22, 'textura', Math.min(0.6, 0.4 * f));
      tom(p.x, p.y, 22, 22, 'brilho', 0.025 * f);
      tom(p.x, p.y, 14, 14, 'sombra', 0.2 * f);
      continue;
    }

    if (m.tipo === 'peeling') {
      const f = intensidade(dose, 1);
      tom(p.x, p.y, 30, 30, 'tom', Math.min(0.7, 0.5 * f));
      tom(p.x, p.y, 30, 30, 'textura', 0.3 * f);
      tom(p.x, p.y, 30, 30, 'brilho', 0.02 * f);
      continue;
    }

    if (m.tipo === 'microagulhamento') {
      const f = intensidade(dose, 1.5);
      tom(p.x, p.y, 24, 24, 'textura', Math.min(0.65, 0.5 * f));
      tom(p.x, p.y, 24, 24, 'tom', 0.15 * f);
      continue;
    }

    tom(p.x, p.y, 10, 10, 'textura', 0.15);
  }

  return {
    boca,
    ganhoSup: Math.min(0.55, ganhoLabio(mlSup) + flip),
    ganhoInf: Math.min(0.55, ganhoLabio(mlInf)),
    campos,
    tons,
  };
}

function perfilBoca(x: number, boca: Boca) {
  const t = Math.abs(x - boca.cx) / (boca.largura * 0.51);
  return t >= 1 ? 0 : (1 - t * t) ** 1.2;
}

function pesoGauss(x: number, y: number, e: { cx: number; cy: number; su: number; sv: number; ang: number }) {
  const dx = x - e.cx;
  const dy = y - e.cy;
  if (Math.abs(dx) > 3 * Math.max(e.su, e.sv) || Math.abs(dy) > 3 * Math.max(e.su, e.sv)) return 0;
  const c = Math.cos(e.ang);
  const s = Math.sin(e.ang);
  const u = (dx * c + dy * s) / e.su;
  const v = (-dx * s + dy * c) / e.sv;
  const q = u * u + v * v;
  return q > 9 ? 0 : Math.exp(-0.5 * q);
}

function origemLabio(x: number, y: number, plano: Plano) {
  const { boca } = plano;
  const wx = perfilBoca(x, boca);
  if (wx <= 0) return y;
  const v = y - boca.cy;
  if (v < 0) {
    const g = plano.ganhoSup * wx;
    if (g <= 0) return y;
    const h0 = boca.alturaSup;
    const h1 = h0 * (1 + g);
    if (-v <= h1) return boca.cy + v * (h0 / h1);
    const s = (-v - h1) / (2.2 * h0);
    return s < 1 ? y + (h1 - h0) * (1 - s) ** 2 : y;
  }
  const g = plano.ganhoInf * wx;
  if (g <= 0) return y;
  const h0 = boca.alturaInf;
  const h1 = h0 * (1 + g);
  if (v <= h1) return boca.cy + v * (h0 / h1);
  const s = (v - h1) / (1.8 * h0);
  return s < 1 ? y - (h1 - h0) * (1 - s) ** 2 : y;
}

function amostrar(data: Uint8ClampedArray, w: number, h: number, x: number, y: number, saida: Float32Array, o: number) {
  const xc = limitar(x, 0, w - 1.001);
  const yc = limitar(y, 0, h - 1.001);
  const x0 = Math.floor(xc);
  const y0 = Math.floor(yc);
  const fx = xc - x0;
  const fy = yc - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + w * 4;
  const i11 = i01 + 4;
  for (let c = 0; c < 3; c++) {
    const a = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
    const b = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
    saida[o + c] = a * (1 - fy) + b * fy;
  }
}

function desfocar(src: Float32Array, w: number, h: number, raio: number) {
  const r = Math.max(1, Math.round(raio));
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const passada = (de: Float32Array, para: Float32Array, horizontal: boolean) => {
    const n = horizontal ? w : h;
    const linhas = horizontal ? h : w;
    const passo = horizontal ? 3 : w * 3;
    for (let l = 0; l < linhas; l++) {
      const base = horizontal ? l * w * 3 : l * 3;
      for (let c = 0; c < 3; c++) {
        let soma = 0;
        for (let k = -r; k <= r; k++) soma += de[base + limitar(k, 0, n - 1) * passo + c];
        for (let i = 0; i < n; i++) {
          para[base + i * passo + c] = soma / (2 * r + 1);
          const sai = limitar(i - r, 0, n - 1);
          const entra = limitar(i + r + 1, 0, n - 1);
          soma += de[base + entra * passo + c] - de[base + sai * passo + c];
        }
      }
    }
  };
  passada(src, tmp, true);
  passada(tmp, out, false);
  passada(out, tmp, true);
  passada(tmp, out, false);
  return out;
}

/** Gera o "depois". `origem` é a foto já desenhada no tamanho do canvas. */
export function renderizarDepois(origem: ImageData, marcas: MarcacaoPreview[], ref: Referencia = 'feminina'): ImageData {
  const w = origem.width;
  const h = origem.height;
  const src = origem.data;
  const plano = montarPlano(marcas, origem, ref);
  const warp = new Float32Array(w * h * 3);
  const temLabio = plano.ganhoSup > 0 || plano.ganhoInf > 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx = x;
      let sy = temLabio ? origemLabio(x, y, plano) : y;
      for (const c of plano.campos) {
        const peso = pesoGauss(x, y, c);
        if (peso > 0) {
          sx -= c.vx * peso;
          sy -= c.vy * peso;
        }
      }
      amostrar(src, w, h, sx, sy, warp, (y * w + x) * 3);
    }
  }

  const px = plano.boca.largura / LARGURA_BOCA_MM;
  const precisaMedio = plano.tons.some((t) => t.tipo === 'linhas' || t.tipo === 'textura');
  const precisaLargo = plano.tons.some((t) => t.tipo === 'sombra' || t.tipo === 'tom');
  const medio = precisaMedio ? desfocar(warp, w, h, 1.4 * px) : null;
  const largo = precisaLargo ? desfocar(warp, w, h, 3.2 * px) : null;
  const { boca } = plano;
  const h1Sup = boca.alturaSup * (1 + plano.ganhoSup);
  const h1Inf = boca.alturaInf * (1 + plano.ganhoInf);

  const saida = new ImageData(w, h);
  const out = saida.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      let r = warp[o];
      let g = warp[o + 1];
      let b = warp[o + 2];

      for (const t of plano.tons) {
        const peso = pesoGauss(x, y, t);
        if (peso <= 0.01) continue;
        const k0 = t.a * peso;
        const l = lum(r, g, b);
        if (t.tipo === 'brilho') {
          r *= 1 + k0;
          g *= 1 + k0;
          b *= 1 + k0;
        } else if ((t.tipo === 'linhas' || t.tipo === 'textura') && medio) {
          const mr = medio[o];
          const mg = medio[o + 1];
          const mb = medio[o + 2];
          const lm = lum(mr, mg, mb);
          const borda = limitar((45 - Math.abs(l - lm)) / 15, 0, 1);
          const escuro = limitar((lm - l) / 6, 0, 1);
          const k = t.tipo === 'linhas' ? k0 * (0.35 + 0.65 * escuro) * borda : k0 * borda;
          r += (mr - r) * k;
          g += (mg - g) * k;
          b += (mb - b) * k;
        } else if (t.tipo === 'sombra' && largo) {
          const mr = largo[o];
          const mg = largo[o + 1];
          const mb = largo[o + 2];
          const lm = lum(mr, mg, mb);
          const borda = limitar((60 - Math.abs(l - lm)) / 20, 0, 1);
          const k = k0 * limitar((lm - l) / 5, 0, 1) * borda;
          r += (mr - r) * k;
          g += (mg - g) * k;
          b += (mb - b) * k;
        } else if (t.tipo === 'tom' && largo) {
          const mr = largo[o];
          const mg = largo[o + 1];
          const mb = largo[o + 2];
          const lm = lum(mr, mg, mb);
          const borda = limitar((60 - Math.abs(l - lm)) / 20, 0, 1);
          const k = k0 * borda;
          r += ((mr - lm) - (r - l)) * k;
          g += ((mg - lm) - (g - l)) * k;
          b += ((mb - lm) - (b - l)) * k;
        }
      }

      if (temLabio) {
        const wx = perfilBoca(x, boca);
        const v = y - boca.cy;
        if (wx > 0 && v > -h1Sup && v < h1Inf) {
          const ganho = v < 0 ? plano.ganhoSup : plano.ganhoInf;
          const t = v < 0 ? -v / h1Sup : v / h1Inf;
          const forca = ganho * wx * Math.sin(Math.PI * limitar(t, 0, 1));
          if (forca > 0 && pontuacaoLabio(r, g, b) > 20) {
            const l = lum(r, g, b);
            const sat = 1 + 0.14 * forca;
            const luz = 1 + 0.07 * forca;
            r = (l + (r - l) * sat) * luz;
            g = (l + (g - l) * sat) * luz;
            b = (l + (b - l) * sat) * luz;
          }
        }
      }

      const d = (y * w + x) * 4;
      out[d] = limitar(r, 0, 255);
      out[d + 1] = limitar(g, 0, 255);
      out[d + 2] = limitar(b, 0, 255);
      out[d + 3] = 255;
    }
  }
  return saida;
}
