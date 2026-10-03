export type MarcacaoPreview = {
  x: number;
  y: number;
  tipo: string;
  dosagem?: string;
};

type ModoPreview = 'volume' | 'afinar' | 'elevar' | 'suavizar';

type EfeitoPreview = {
  px: number;
  py: number;
  raioPx: number;
  forca: number;
  modo: ModoPreview;
};

function doseNumero(dose?: string) {
  if (!dose) return null;
  const n = parseFloat(String(dose).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function limitar(valor: number, min: number, max: number) {
  return Math.min(max, Math.max(min, valor));
}

/** Intensidade ilustrativa. Não representa o resultado clínico. */
export function efeitoDaMarcacao(marca: MarcacaoPreview, largura: number): EfeitoPreview {
  const n = doseNumero(marca.dosagem);
  const lateralBaixa = marca.y > 58 && marca.y < 82 && (marca.x < 38 || marca.x > 62);
  let modo: ModoPreview = 'suavizar';
  let raio = 0.08;
  let forca = 0.35;

  if (marca.tipo === 'preenchimento') {
    const t = n == null ? 0.6 : limitar(n / 1, 0.35, 1);
    modo = 'volume';
    raio = 0.14 + t * 0.05;
    forca = 0.9 + t * 0.8;
  } else if (marca.tipo === 'bioestimulador') {
    const t = n == null ? 0.45 : limitar(n / 2, 0.3, 1);
    modo = 'volume';
    raio = 0.15;
    forca = 0.55 + t * 0.45;
  } else if (marca.tipo === 'toxina' && lateralBaixa) {
    const t = n == null ? 0.5 : limitar(n / 25, 0.3, 1);
    modo = 'afinar';
    raio = 0.16;
    forca = 0.55 + t * 0.7;
  } else if (marca.tipo === 'toxina') {
    const t = n == null ? 0.5 : limitar(n / 20, 0.3, 1);
    modo = 'suavizar';
    raio = 0.12;
    forca = 0.85 + t * 0.35;
  } else if (marca.tipo === 'fios') {
    const t = n == null ? 0.55 : limitar(n / 4, 0.35, 1);
    modo = 'elevar';
    raio = 0.14;
    forca = 0.4 + t * 0.35;
  } else if (marca.tipo === 'peeling') {
    modo = 'suavizar';
    raio = 0.12;
    forca = 0.55;
  }

  return {
    px: (marca.x / 100) * largura,
    py: 0,
    raioPx: raio * largura,
    forca,
    modo,
  };
}

export function prepararEfeitos(marcas: MarcacaoPreview[], largura: number, altura: number): EfeitoPreview[] {
  return marcas.map((marca) => {
    const efeito = efeitoDaMarcacao(marca, largura);
    efeito.py = (marca.y / 100) * altura;
    return efeito;
  });
}

export function amostraDepois(x: number, y: number, efeitos: EfeitoPreview[], largura: number) {
  let ox = 0;
  let oy = 0;
  let suave = 0;
  const meio = largura * 0.5;

  for (const efeito of efeitos) {
    const dx = x - efeito.px;
    const dy = y - efeito.py;
    const dist = Math.hypot(dx, dy);
    if (dist >= efeito.raioPx) continue;
    const queda = (1 - dist / efeito.raioPx) ** 2;
    const empurrao = efeito.forca * queda;
    const limite = efeito.raioPx * 0.46;

    if (efeito.modo === 'volume') {
      ox -= limitar(dx * empurrao, -limite, limite);
      oy -= limitar(dy * empurrao, -limite, limite);
    } else if (efeito.modo === 'afinar') {
      ox += limitar((x - meio) * empurrao * 0.55, -limite, limite);
    } else if (efeito.modo === 'elevar') {
      oy += limitar(efeito.raioPx * empurrao * 0.55, 0, limite);
      ox += limitar((efeito.px - x) * empurrao * 0.2, -limite, limite);
    } else {
      ox += limitar(dx * empurrao * 1.15, -limite * 0.75, limite * 0.75);
      oy += limitar(dy * empurrao * 1.15, -limite * 0.75, limite * 0.75);
      suave = Math.max(suave, queda);
    }
  }

  return { x: x + ox, y: y + oy, suave };
}
