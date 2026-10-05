export type MarcacaoPreview = {
  x: number;
  y: number;
  tipo: string;
  dosagem?: string;
};

type ModoPreview = 'volume' | 'afinar' | 'elevar' | 'suavizar';
type EixoPreview = 'radial' | 'labio' | 'lateral' | 'vertical';
type CortePreview = 'acima' | 'abaixo' | 'nenhum';
type ZonaPreview =
  | 'labio-sup'
  | 'labio-inf'
  | 'nariz'
  | 'olheira'
  | 'malar'
  | 'nasogeniano'
  | 'mento'
  | 'papada'
  | 'mandibula'
  | 'testa'
  | 'glabela'
  | 'periocular'
  | 'masseter'
  | 'geral';

type EfeitoPreview = {
  px: number;
  py: number;
  raioX: number;
  raioY: number;
  forca: number;
  modo: ModoPreview;
  eixo: EixoPreview;
  corte: CortePreview;
  viesY: number;
  teto: number;
};

function doseNumero(dose?: string) {
  if (!dose) return null;
  const n = parseFloat(String(dose).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function limitar(valor: number, min: number, max: number) {
  return Math.min(max, Math.max(min, valor));
}

/** 1 na dose de referência. Sobe devagar depois disso, para 2 ml não virar o dobro de 1 ml. */
function curva(dose: number | null, cheio: number) {
  if (dose == null) return 0.72;
  return limitar(Math.pow(dose / cheio, 0.65), 0.16, 1.4);
}

function zonaDoPonto(x: number, y: number): ZonaPreview {
  const noMeio = x >= 42 && x <= 58;
  if (y >= 65 && y <= 75.5 && x >= 38 && x <= 62) return y < 69.5 ? 'labio-sup' : 'labio-inf';
  if (y >= 80 && x >= 36 && x <= 64) return 'papada';
  if (y >= 70 && y < 82 && x >= 40 && x <= 60) return 'mento';
  if (y >= 56 && y <= 78 && (x < 36 || x > 64)) return 'masseter';
  if (y >= 60 && y <= 76 && (x < 42 || x > 58)) return 'mandibula';
  if (y >= 53 && y <= 66 && ((x >= 34 && x < 44) || (x > 56 && x <= 66))) return 'nasogeniano';
  if (y >= 42 && y <= 58 && noMeio) return 'nariz';
  if (y >= 41 && y <= 50 && ((x >= 37 && x <= 46) || (x >= 54 && x <= 63))) return 'olheira';
  if (y >= 43 && y <= 58 && (x <= 40 || x >= 60)) return 'malar';
  if (y >= 34 && y <= 46 && (x < 38 || x > 62)) return 'periocular';
  if (y >= 27 && y <= 38 && x >= 40 && x <= 60) return 'glabela';
  if (y < 33) return 'testa';
  return 'geral';
}

function zonaDoTipo(tipo: string, x: number, y: number): ZonaPreview {
  if (tipo === 'labial') return y < 69.5 ? 'labio-sup' : 'labio-inf';
  if (tipo === 'rino') return 'nariz';
  if (tipo === 'olheira') return 'olheira';
  if (tipo === 'mento') return 'mento';
  if (tipo === 'mandibula') return 'mandibula';
  if (tipo === 'papada') return 'papada';
  return zonaDoPonto(x, y);
}

function perfil(zona: ZonaPreview, largura: number, altura: number) {
  const w = largura;
  const h = altura;
  if (zona === 'labio-sup') {
    return { raioX: w * 0.14, raioY: h * 0.038, forca: 1.05, modo: 'volume' as const, eixo: 'labio' as const, corte: 'acima' as const, viesY: 0.16, teto: h * 0.022 };
  }
  if (zona === 'labio-inf') {
    return { raioX: w * 0.15, raioY: h * 0.042, forca: 1, modo: 'volume' as const, eixo: 'labio' as const, corte: 'abaixo' as const, viesY: -0.12, teto: h * 0.022 };
  }
  if (zona === 'nariz') {
    return { raioX: w * 0.034, raioY: h * 0.055, forca: 0.95, modo: 'volume' as const, eixo: 'vertical' as const, corte: 'nenhum' as const, viesY: 0, teto: h * 0.012 };
  }
  if (zona === 'olheira') {
    return { raioX: w * 0.06, raioY: h * 0.028, forca: 1.25, modo: 'volume' as const, eixo: 'vertical' as const, corte: 'nenhum' as const, viesY: 0.04, teto: h * 0.009 };
  }
  if (zona === 'malar') {
    return { raioX: w * 0.11, raioY: h * 0.065, forca: 0.82, modo: 'volume' as const, eixo: 'lateral' as const, corte: 'nenhum' as const, viesY: 0, teto: h * 0.016 };
  }
  if (zona === 'nasogeniano') {
    return { raioX: w * 0.042, raioY: h * 0.078, forca: 0.7, modo: 'volume' as const, eixo: 'vertical' as const, corte: 'nenhum' as const, viesY: 0, teto: h * 0.012 };
  }
  if (zona === 'mento') {
    return { raioX: w * 0.055, raioY: h * 0.045, forca: 0.9, modo: 'volume' as const, eixo: 'vertical' as const, corte: 'nenhum' as const, viesY: -0.08, teto: h * 0.016 };
  }
  if (zona === 'mandibula') {
    return { raioX: w * 0.09, raioY: h * 0.032, forca: 0.75, modo: 'volume' as const, eixo: 'lateral' as const, corte: 'nenhum' as const, viesY: 0, teto: h * 0.012 };
  }
  if (zona === 'papada') {
    return { raioX: w * 0.13, raioY: h * 0.06, forca: 0.9, modo: 'afinar' as const, eixo: 'lateral' as const, corte: 'nenhum' as const, viesY: 0.06, teto: h * 0.016 };
  }
  if (zona === 'masseter') {
    return { raioX: w * 0.13, raioY: h * 0.085, forca: 0.85, modo: 'afinar' as const, eixo: 'lateral' as const, corte: 'nenhum' as const, viesY: 0, teto: h * 0.018 };
  }
  return { raioX: w * 0.08, raioY: h * 0.06, forca: 0.55, modo: 'volume' as const, eixo: 'radial' as const, corte: 'nenhum' as const, viesY: 0, teto: h * 0.012 };
}

function efeitoBase(marca: MarcacaoPreview, largura: number, altura: number, parcial: ReturnType<typeof perfil>, doseCheia: number, escala = 1): EfeitoPreview {
  const t = curva(doseNumero(marca.dosagem), doseCheia);
  return {
    px: (marca.x / 100) * largura,
    py: (marca.y / 100) * altura,
    raioX: Math.max(8, parcial.raioX),
    raioY: Math.max(8, parcial.raioY),
    forca: parcial.forca * t * escala,
    modo: parcial.modo,
    eixo: parcial.eixo,
    corte: parcial.corte,
    viesY: parcial.viesY,
    teto: parcial.teto,
  };
}

function suave(marca: MarcacaoPreview, largura: number, altura: number, raio: number, forca: number, viesY = 0): EfeitoPreview {
  return {
    px: (marca.x / 100) * largura,
    py: (marca.y / 100) * altura,
    raioX: Math.max(8, largura * raio),
    raioY: Math.max(8, altura * raio * 0.85),
    forca,
    modo: 'suavizar',
    eixo: 'radial',
    corte: 'nenhum',
    viesY,
    teto: altura * 0.008,
  };
}

/** Ilustração. A dose muda a intensidade; não é o resultado clínico. */
export function efeitoDaMarcacao(marca: MarcacaoPreview, largura: number, altura: number): EfeitoPreview {
  const zona = zonaDoTipo(marca.tipo, marca.x, marca.y);
  const n = doseNumero(marca.dosagem);

  if (marca.tipo === 'labial' || (marca.tipo === 'preenchimento' && (zona === 'labio-sup' || zona === 'labio-inf'))) {
    return efeitoBase(marca, largura, altura, perfil(zona === 'labio-inf' ? 'labio-inf' : 'labio-sup', largura, altura), 1);
  }
  if (marca.tipo === 'preenchimento' || marca.tipo === 'rino' || marca.tipo === 'olheira' || marca.tipo === 'mento' || marca.tipo === 'mandibula') {
    const cheio = zona === 'nariz' ? 0.45 : zona === 'olheira' ? 0.3 : zona === 'mento' ? 1.5 : zona === 'nasogeniano' ? 0.6 : 1;
    return efeitoBase(marca, largura, altura, perfil(zona, largura, altura), cheio);
  }
  if (marca.tipo === 'bioestimulador') {
    return efeitoBase(marca, largura, altura, perfil(zona === 'geral' ? 'malar' : zona, largura, altura), 1.5, 0.42);
  }
  if (marca.tipo === 'papada') {
    return efeitoBase(marca, largura, altura, perfil('papada', largura, altura), 3);
  }
  if (marca.tipo === 'toxina' && (zona === 'labio-sup' || zona === 'labio-inf')) {
    const t = curva(n, 4);
    return {
      px: (marca.x / 100) * largura,
      py: (marca.y / 100) * altura,
      raioX: largura * 0.09,
      raioY: altura * 0.035,
      forca: 0.38 * t,
      modo: 'elevar',
      eixo: 'labio',
      corte: zona === 'labio-inf' ? 'abaixo' : 'acima',
      viesY: zona === 'labio-inf' ? -0.2 : 0.15,
      teto: altura * 0.01,
    };
  }
  if (marca.tipo === 'toxina' && zona === 'masseter') {
    return efeitoBase(marca, largura, altura, perfil('masseter', largura, altura), 25);
  }
  if (marca.tipo === 'toxina' && zona === 'testa') {
    const t = curva(n, 12);
    return suave(marca, largura, altura, 0.11, 0.55 + t * 0.35, 0.07);
  }
  if (marca.tipo === 'toxina') {
    const t = curva(n, 8);
    return suave(marca, largura, altura, zona === 'periocular' ? 0.07 : 0.09, 0.5 + t * 0.35);
  }
  if (marca.tipo === 'fios') {
    const t = curva(n, 4);
    return {
      px: (marca.x / 100) * largura,
      py: (marca.y / 100) * altura,
      raioX: largura * 0.1,
      raioY: altura * 0.09,
      forca: 0.34 * t,
      modo: 'elevar',
      eixo: 'vertical',
      corte: 'nenhum',
      viesY: 0,
      teto: altura * 0.016,
    };
  }
  if (marca.tipo === 'skinbooster') {
    return suave(marca, largura, altura, 0.14, 0.45, 0.03);
  }
  if (marca.tipo === 'microagulhamento' || marca.tipo === 'peeling') {
    return suave(marca, largura, altura, marca.tipo === 'peeling' ? 0.1 : 0.12, 0.62);
  }

  return suave(marca, largura, altura, 0.08, 0.4);
}

export function prepararEfeitos(marcas: MarcacaoPreview[], largura: number, altura: number): EfeitoPreview[] {
  return marcas.map((marca) => efeitoDaMarcacao(marca, largura, altura));
}

export function amostraDepois(x: number, y: number, efeitos: EfeitoPreview[], largura: number, altura: number) {
  let ox = 0;
  let oy = 0;
  let suavePeso = 0;
  const meio = largura * 0.5;

  for (const efeito of efeitos) {
    if (efeito.corte === 'acima' && y > efeito.py + efeito.raioY * 0.42) continue;
    if (efeito.corte === 'abaixo' && y < efeito.py - efeito.raioY * 0.42) continue;

    const dx = x - efeito.px;
    const dy = y - efeito.py;
    const u = Math.hypot(dx / efeito.raioX, dy / efeito.raioY);
    if (u >= 1) continue;
    const queda = (1 - u) ** 2;
    const k = efeito.forca * queda;
    let ex = 0;
    let ey = 0;

    if (efeito.modo === 'volume') {
      if (efeito.eixo === 'labio') {
        ex = -dx * k * 0.28;
        ey = -dy * k * 2.2 + efeito.viesY * k * efeito.raioY;
      } else if (efeito.eixo === 'lateral') {
        const lado = efeito.px < meio ? -1 : 1;
        ex = lado * k * efeito.raioX * 0.2 - dx * k * 0.35;
        ey = -dy * k * 0.28;
      } else if (efeito.eixo === 'vertical') {
        ex = -dx * k * 0.28;
        ey = -dy * k * 1.15 + efeito.viesY * k * efeito.raioY;
      } else {
        ex = -dx * k * 0.5;
        ey = -dy * k * 0.5;
      }
    } else if (efeito.modo === 'afinar') {
      const lado = x < meio ? -1 : 1;
      ex = lado * k * efeito.raioX * 0.16;
      ey = efeito.viesY * k * efeito.raioY;
    } else if (efeito.modo === 'elevar') {
      ey = k * efeito.raioY * (efeito.corte === 'abaixo' ? -0.42 : 0.42);
      ex = (efeito.px - x) * k * 0.1;
    } else {
      ex = dx * k * 0.18;
      ey = dy * k * 0.18 + efeito.viesY * k * efeito.raioY;
      suavePeso = Math.max(suavePeso, queda * Math.min(1, efeito.forca));
    }

    ox += limitar(ex, -efeito.teto, efeito.teto);
    oy += limitar(ey, -efeito.teto, efeito.teto);
  }

  return {
    x: x + limitar(ox, -largura * 0.045, largura * 0.045),
    y: y + limitar(oy, -altura * 0.04, altura * 0.04),
    suave: suavePeso,
  };
}
