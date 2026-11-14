/**
 * Análise da foto do paciente.
 *
 * Este módulo concentra as regras (em PT-BR) que guiam a captura da foto de
 * perfil: enquadramento, centralização, olhos abertos, pose, boca, iluminação,
 * nitidez e resolução. A função principal é pura: recebe o resultado do
 * FaceLandmarker do MediaPipe + as dimensões da mídia + métricas de qualidade e
 * devolve uma lista tipada de verificações. Os utilitários de canvas existem
 * apenas para o cliente e alimentam o fallback sem modelo.
 */

export type StatusFoto = 'ok' | 'aviso' | 'erro';

export type VerificacaoFoto = {
  id: string;
  status: StatusFoto;
  mensagem: string;
};

export type AnaliseFoto = {
  aprovada: boolean;
  verificacoes: VerificacaoFoto[];
  instrucaoPrincipal: string | null;
  rostoDetectado: boolean;
};

/** Ponto normalizado (0..1) devolvido pelo MediaPipe. */
export type PontoRosto = { x: number; y: number; z?: number };

export type CategoriaBlendshape = { categoryName?: string; score: number };

export type BlendshapeRosto = { categories?: CategoriaBlendshape[] };

export type MatrizRosto = { data?: number[] };

/**
 * Estrutura mínima do resultado do FaceLandmarker usada aqui. Tipar de forma
 * estrutural evita acoplar o módulo ao pacote do MediaPipe (que é carregado
 * dinamicamente no navegador).
 */
export type ResultadoFaceLandmarker = {
  faceLandmarks?: PontoRosto[][] | null;
  faceBlendshapes?: BlendshapeRosto[] | null;
  facialTransformationMatrixes?: MatrizRosto[] | null;
};

export type DimensoesMidia = { largura: number; altura: number };

/** Caixa normalizada (0..1) do rosto. x/y representam o canto superior esquerdo. */
export type CaixaRosto = { x: number; y: number; largura: number; altura: number };

export type MetricasImagem = {
  /** Luminância média (0..1). */
  luminanciaMedia: number;
  /** Desvio padrão da luminância (0..1). */
  luminanciaDesvio: number;
  /** Proporção de pixels muito escuros. */
  proporcaoEscura: number;
  /** Proporção de pixels estourados (quase brancos). */
  proporcaoEstourada: number;
  /** Variância do laplaciano (quanto maior, mais nítida). */
  nitidez: number;
  largura: number;
  altura: number;
};

export type EntradaAnaliseFoto = {
  resultado: ResultadoFaceLandmarker | null;
  dimensoes: DimensoesMidia;
  metricas?: MetricasImagem | null;
};

/** Mídia que o fallback estático consegue desenhar em um canvas. */
export type FonteImagem = ImageBitmap | HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

const INDICES = {
  nariz: 1,
  glabela: 168,
  testa: 10,
  queixo: 152,
  labioSuperior: 13,
  labioInferior: 14,
  olhoA: { cantoExterno: 33, cantoInterno: 133, superior: 159, inferior: 145 },
  olhoB: { cantoExterno: 263, cantoInterno: 362, superior: 386, inferior: 374 },
} as const;

const LIMITES = {
  larguraRostoMinima: 0.18,
  larguraRostoAviso: 0.23,
  larguraRostoMaxima: 0.68,
  larguraRostoAvisoMaxima: 0.6,
  margemBorda: 0.02,
  testaMinima: 0.05,
  testaAviso: 0.09,
  queixoMaximo: 0.95,
  queixoAviso: 0.91,
  desvioCentroErro: 0.12,
  desvioCentroAviso: 0.07,
  piscadaErro: 0.55,
  piscadaAviso: 0.4,
  aberturaOlhoErro: 0.14,
  aberturaOlhoAviso: 0.18,
  yawErro: 0.17,
  yawAviso: 0.11,
  rollErro: 9,
  rollAviso: 5.5,
  bocaErro: 0.5,
  bocaAviso: 0.3,
  bocaGeometriaErro: 0.12,
  bocaGeometriaAviso: 0.075,
  resolucaoMinima: 480,
  resolucaoCritica: 240,
  luminanciaEscuraErro: 0.2,
  luminanciaEscuraAviso: 0.3,
  escurosErro: 0.5,
  escurosAviso: 0.3,
  luminanciaClaraErro: 0.95,
  luminanciaClaraAviso: 0.88,
  estouradosErro: 0.3,
  estouradosAviso: 0.15,
  sombraAviso: 0.34,
  nitidezAviso: 30,
} as const;

/** Lado do canvas reduzido usado para medir luz e nitidez. */
const LADO_ANALISE = 128;

function pontoValido(ponto: PontoRosto | undefined): ponto is PontoRosto {
  return !!ponto && Number.isFinite(ponto.x) && Number.isFinite(ponto.y);
}

function distancia(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroOlho(
  landmarks: PontoRosto[],
  olho: (typeof INDICES)['olhoA'] | (typeof INDICES)['olhoB'],
): { x: number; y: number } | null {
  const externo = landmarks[olho.cantoExterno];
  const interno = landmarks[olho.cantoInterno];
  const superior = landmarks[olho.superior];
  const inferior = landmarks[olho.inferior];
  if (!pontoValido(externo) || !pontoValido(interno) || !pontoValido(superior) || !pontoValido(inferior)) {
    return null;
  }
  return {
    x: (externo.x + interno.x + superior.x + inferior.x) / 4,
    y: (externo.y + interno.y + superior.y + inferior.y) / 4,
  };
}

function razaoAberturaOlho(
  landmarks: PontoRosto[],
  olho: (typeof INDICES)['olhoA'] | (typeof INDICES)['olhoB'],
): number | null {
  const externo = landmarks[olho.cantoExterno];
  const interno = landmarks[olho.cantoInterno];
  const superior = landmarks[olho.superior];
  const inferior = landmarks[olho.inferior];
  if (!pontoValido(externo) || !pontoValido(interno) || !pontoValido(superior) || !pontoValido(inferior)) {
    return null;
  }
  const horizontal = distancia(externo, interno);
  if (!(horizontal > 0)) return null;
  return distancia(superior, inferior) / horizontal;
}

/** Caixa delimitadora do rosto em coordenadas normalizadas. */
export function calcularCaixaRosto(landmarks: PontoRosto[] | null | undefined): CaixaRosto | null {
  if (!landmarks || landmarks.length < 300) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const ponto of landmarks) {
    if (!pontoValido(ponto)) continue;
    if (ponto.x < minX) minX = ponto.x;
    if (ponto.y < minY) minY = ponto.y;
    if (ponto.x > maxX) maxX = ponto.x;
    if (ponto.y > maxY) maxY = ponto.y;
  }

  const largura = maxX - minX;
  const altura = maxY - minY;
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura <= 0 || altura <= 0) return null;

  return { x: minX, y: minY, largura, altura };
}

function obterBlendshape(resultado: ResultadoFaceLandmarker | null, nome: string): number | null {
  const categorias = resultado?.faceBlendshapes?.[0]?.categories;
  if (!categorias) return null;
  const categoria = categorias.find((item) => item.categoryName === nome);
  if (!categoria || !Number.isFinite(categoria.score)) return null;
  return categoria.score;
}

function estimarPose(landmarks: PontoRosto[]): { yaw: number; roll: number } | null {
  const olhoA = centroOlho(landmarks, INDICES.olhoA);
  const olhoB = centroOlho(landmarks, INDICES.olhoB);
  const glabela = landmarks[INDICES.glabela];
  const nariz = landmarks[INDICES.nariz];
  if (!olhoA || !olhoB || !pontoValido(glabela) || !pontoValido(nariz)) return null;

  const dx = olhoB.x - olhoA.x;
  const dy = olhoB.y - olhoA.y;
  const distanciaOlhos = Math.hypot(dx, dy);
  if (!(distanciaOlhos > 0)) return null;

  const roll = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  // O nariz se desloca lateralmente em relação à glabela quando a cabeça gira.
  // Normalizar pela distância entre os olhos mantém a medida independente do zoom.
  const yaw = Math.abs((nariz.x - glabela.x) / distanciaOlhos);

  return { yaw, roll };
}

function verificarEnquadramento(landmarks: PontoRosto[], caixa: CaixaRosto): VerificacaoFoto {
  const testa = landmarks[INDICES.testa];
  const queixo = landmarks[INDICES.queixo];
  const testaY = pontoValido(testa) ? testa.y : caixa.y;
  const queixoY = pontoValido(queixo) ? queixo.y : caixa.y + caixa.altura;

  const cortando =
    testaY < LIMITES.testaMinima ||
    queixoY > LIMITES.queixoMaximo ||
    caixa.x < LIMITES.margemBorda ||
    caixa.x + caixa.largura > 1 - LIMITES.margemBorda;

  if (caixa.largura < LIMITES.larguraRostoMinima) {
    return { id: 'enquadramento', status: 'erro', mensagem: 'Aproxime-se um pouco.' };
  }
  if (caixa.largura > LIMITES.larguraRostoMaxima || cortando) {
    return { id: 'enquadramento', status: 'erro', mensagem: 'Afaste-se um pouco.' };
  }
  if (caixa.largura < LIMITES.larguraRostoAviso) {
    return { id: 'enquadramento', status: 'aviso', mensagem: 'Aproxime-se um pouco.' };
  }
  if (
    caixa.largura > LIMITES.larguraRostoAvisoMaxima ||
    testaY < LIMITES.testaAviso ||
    queixoY > LIMITES.queixoAviso
  ) {
    return { id: 'enquadramento', status: 'aviso', mensagem: 'Afaste-se um pouco.' };
  }
  return { id: 'enquadramento', status: 'ok', mensagem: 'Enquadramento ideal.' };
}

function verificarCentralizacao(caixa: CaixaRosto): VerificacaoFoto {
  const centroX = caixa.x + caixa.largura / 2;
  const centroY = caixa.y + caixa.altura / 2;
  const desvio = Math.max(Math.abs(centroX - 0.5), Math.abs(centroY - 0.5));

  if (desvio > LIMITES.desvioCentroErro) {
    return { id: 'centralizacao', status: 'erro', mensagem: 'Centralize o rosto.' };
  }
  if (desvio > LIMITES.desvioCentroAviso) {
    return { id: 'centralizacao', status: 'aviso', mensagem: 'Centralize o rosto.' };
  }
  return { id: 'centralizacao', status: 'ok', mensagem: 'Rosto centralizado.' };
}

function verificarOlhos(
  landmarks: PontoRosto[],
  resultado: ResultadoFaceLandmarker | null,
): VerificacaoFoto {
  const piscadaEsquerda = obterBlendshape(resultado, 'eyeBlinkLeft');
  const piscadaDireita = obterBlendshape(resultado, 'eyeBlinkRight');
  const piscada =
    piscadaEsquerda !== null && piscadaDireita !== null
      ? Math.max(piscadaEsquerda, piscadaDireita)
      : (piscadaEsquerda ?? piscadaDireita);

  const aberturaA = razaoAberturaOlho(landmarks, INDICES.olhoA);
  const aberturaB = razaoAberturaOlho(landmarks, INDICES.olhoB);
  const abertura =
    aberturaA !== null && aberturaB !== null ? (aberturaA + aberturaB) / 2 : (aberturaA ?? aberturaB);

  const fechadoPorErro =
    (piscada !== null && piscada >= LIMITES.piscadaErro) ||
    (abertura !== null && abertura < LIMITES.aberturaOlhoErro);
  const fechadoPorAviso =
    (piscada !== null && piscada >= LIMITES.piscadaAviso) ||
    (abertura !== null && abertura < LIMITES.aberturaOlhoAviso);

  if (fechadoPorErro) return { id: 'olhos', status: 'erro', mensagem: 'Abra os olhos.' };
  if (fechadoPorAviso) return { id: 'olhos', status: 'aviso', mensagem: 'Abra os olhos.' };
  return { id: 'olhos', status: 'ok', mensagem: 'Olhos abertos.' };
}

function verificarPose(landmarks: PontoRosto[]): VerificacaoFoto[] {
  const pose = estimarPose(landmarks);
  if (!pose) return [];

  const frente: VerificacaoFoto =
    pose.yaw > LIMITES.yawErro
      ? { id: 'postura-frente', status: 'erro', mensagem: 'Olhe de frente para a câmera.' }
      : pose.yaw > LIMITES.yawAviso
        ? { id: 'postura-frente', status: 'aviso', mensagem: 'Olhe de frente para a câmera.' }
        : { id: 'postura-frente', status: 'ok', mensagem: 'Cabeça de frente.' };

  const reta: VerificacaoFoto =
    pose.roll > LIMITES.rollErro
      ? { id: 'postura-reta', status: 'erro', mensagem: 'Mantenha a cabeça reta.' }
      : pose.roll > LIMITES.rollAviso
        ? { id: 'postura-reta', status: 'aviso', mensagem: 'Mantenha a cabeça reta.' }
        : { id: 'postura-reta', status: 'ok', mensagem: 'Cabeça reta.' };

  return [frente, reta];
}

function verificarBoca(
  landmarks: PontoRosto[],
  resultado: ResultadoFaceLandmarker | null,
): VerificacaoFoto {
  const jawOpen = obterBlendshape(resultado, 'jawOpen');

  const testa = landmarks[INDICES.testa];
  const queixo = landmarks[INDICES.queixo];
  const labioSuperior = landmarks[INDICES.labioSuperior];
  const labioInferior = landmarks[INDICES.labioInferior];

  let aberturaGeometrica: number | null = null;
  if (pontoValido(testa) && pontoValido(queixo) && pontoValido(labioSuperior) && pontoValido(labioInferior)) {
    const alturaRosto = distancia(testa, queixo);
    if (alturaRosto > 0) aberturaGeometrica = distancia(labioSuperior, labioInferior) / alturaRosto;
  }

  const abertaErro =
    (jawOpen !== null && jawOpen >= LIMITES.bocaErro) ||
    (aberturaGeometrica !== null && aberturaGeometrica > LIMITES.bocaGeometriaErro);
  const abertaAviso =
    (jawOpen !== null && jawOpen >= LIMITES.bocaAviso) ||
    (aberturaGeometrica !== null && aberturaGeometrica > LIMITES.bocaGeometriaAviso);

  if (abertaErro) return { id: 'boca', status: 'erro', mensagem: 'Feche a boca e relaxe o rosto.' };
  if (abertaAviso) return { id: 'boca', status: 'aviso', mensagem: 'Feche a boca e relaxe o rosto.' };
  return { id: 'boca', status: 'ok', mensagem: 'Boca fechada.' };
}

function verificarResolucao(dimensoes: DimensoesMidia): VerificacaoFoto {
  const menorLado = Math.min(dimensoes.largura, dimensoes.altura);
  if (menorLado < LIMITES.resolucaoCritica) {
    return { id: 'resolucao', status: 'erro', mensagem: 'Use uma câmera com mais resolução.' };
  }
  if (menorLado < LIMITES.resolucaoMinima) {
    return { id: 'resolucao', status: 'aviso', mensagem: 'Use uma câmera com mais resolução.' };
  }
  return { id: 'resolucao', status: 'ok', mensagem: 'Resolução boa.' };
}

function verificarIluminacao(
  metricas: MetricasImagem,
  modo: 'camera' | 'imagem',
): VerificacaoFoto {
  const escuroErro =
    metricas.luminanciaMedia < LIMITES.luminanciaEscuraErro ||
    metricas.proporcaoEscura > LIMITES.escurosErro;
  const claroErro =
    metricas.proporcaoEstourada > LIMITES.estouradosErro ||
    metricas.luminanciaMedia > LIMITES.luminanciaClaraErro;
  const escuroAviso =
    metricas.luminanciaMedia < LIMITES.luminanciaEscuraAviso ||
    metricas.proporcaoEscura > LIMITES.escurosAviso;
  const claroAviso =
    metricas.proporcaoEstourada > LIMITES.estouradosAviso ||
    metricas.luminanciaMedia > LIMITES.luminanciaClaraAviso;
  const bloqueante = modo === 'camera';

  if (escuroErro) {
    return { id: 'iluminacao', status: bloqueante ? 'erro' : 'aviso', mensagem: 'Melhore a iluminação.' };
  }
  if (claroErro) {
    return { id: 'iluminacao', status: bloqueante ? 'erro' : 'aviso', mensagem: 'Tem luz demais no rosto.' };
  }
  if (escuroAviso) {
    return { id: 'iluminacao', status: 'aviso', mensagem: 'Melhore a iluminação.' };
  }
  if (claroAviso) {
    return { id: 'iluminacao', status: 'aviso', mensagem: 'Tem luz demais no rosto.' };
  }
  if (metricas.luminanciaDesvio > LIMITES.sombraAviso) {
    return {
      id: 'iluminacao',
      status: 'aviso',
      mensagem: 'Tem sombra no rosto. Fique de frente para a luz.',
    };
  }
  return { id: 'iluminacao', status: 'ok', mensagem: 'Iluminação boa.' };
}

function verificarNitidez(metricas: MetricasImagem): VerificacaoFoto {
  if (metricas.nitidez < LIMITES.nitidezAviso) {
    return { id: 'nitidez', status: 'aviso', mensagem: 'Segure o celular firme e limpe a lente.' };
  }
  return { id: 'nitidez', status: 'ok', mensagem: 'Foto nítida.' };
}

function verificacoesDeQualidade(
  dimensoes: DimensoesMidia,
  metricas: MetricasImagem | null,
  modo: 'camera' | 'imagem',
): VerificacaoFoto[] {
  const verificacoes: VerificacaoFoto[] = [];
  if (metricas) {
    verificacoes.push(verificarIluminacao(metricas, modo));
    verificacoes.push(verificarNitidez(metricas));
  }
  verificacoes.push(verificarResolucao(dimensoes));
  return verificacoes;
}

function montarAnalise(verificacoes: VerificacaoFoto[], rostoDetectado: boolean): AnaliseFoto {
  const erro = verificacoes.find((item) => item.status === 'erro');
  const aviso = verificacoes.find((item) => item.status === 'aviso');
  return {
    aprovada: !erro,
    verificacoes,
    instrucaoPrincipal: erro?.mensagem ?? aviso?.mensagem ?? null,
    rostoDetectado,
  };
}

/**
 * Função principal: analisa um frame ao vivo (ou a foto já capturada) a partir
 * do resultado do MediaPipe. Sempre devolve as verificações de qualidade que
 * não dependem do modelo (luz, nitidez e resolução).
 */
export function analisarFotoPaciente({
  resultado,
  dimensoes,
  metricas = null,
}: EntradaAnaliseFoto): AnaliseFoto {
  const dimensoesValidas: DimensoesMidia = {
    largura: Number.isFinite(dimensoes?.largura) ? Math.max(0, dimensoes.largura) : 0,
    altura: Number.isFinite(dimensoes?.altura) ? Math.max(0, dimensoes.altura) : 0,
  };
  const qualidade = verificacoesDeQualidade(dimensoesValidas, metricas, 'camera');

  const rostos = (resultado?.faceLandmarks ?? [])
    .map((landmarks) => ({ landmarks, caixa: calcularCaixaRosto(landmarks) }))
    .filter(
      (item): item is { landmarks: PontoRosto[]; caixa: CaixaRosto } => item.caixa !== null,
    );

  if (rostos.length === 0) {
    return montarAnalise(
      [{ id: 'rosto', status: 'erro', mensagem: 'Posicione o rosto dentro do círculo.' }, ...qualidade],
      false,
    );
  }

  if (rostos.length > 1) {
    return montarAnalise(
      [{ id: 'pessoas', status: 'erro', mensagem: 'Só uma pessoa na foto.' }, ...qualidade],
      true,
    );
  }

  const [{ landmarks, caixa }] = rostos;

  const verificacoes: VerificacaoFoto[] = [
    { id: 'rosto', status: 'ok', mensagem: 'Rosto detectado.' },
    verificarEnquadramento(landmarks, caixa),
    verificarCentralizacao(caixa),
    verificarOlhos(landmarks, resultado),
    ...verificarPose(landmarks),
    verificarBoca(landmarks, resultado),
    ...qualidade,
  ];

  return montarAnalise(verificacoes, true);
}

let canvasAnalise: HTMLCanvasElement | null = null;
let contextoAnalise: CanvasRenderingContext2D | null = null;
const cinzasAnalise = new Float32Array(LADO_ANALISE * LADO_ANALISE);

function obterContextoAnalise(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!canvasAnalise) {
    canvasAnalise = document.createElement('canvas');
    canvasAnalise.width = LADO_ANALISE;
    canvasAnalise.height = LADO_ANALISE;
    contextoAnalise = canvasAnalise.getContext('2d', { willReadFrequently: true });
  }
  return contextoAnalise;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Mede luminância, contraste e nitidez em um canvas reduzido (128x128).
 * Aceita uma região normalizada (por exemplo, a caixa do rosto) para que a
 * análise reflita a pessoa e não o fundo.
 */
export function medirMetricasImagem(
  fonte: FonteImagem,
  dimensoes: DimensoesMidia,
  regiao?: CaixaRosto | null,
): MetricasImagem | null {
  if (!dimensoes || !(dimensoes.largura > 0) || !(dimensoes.altura > 0)) return null;
  const contexto = obterContextoAnalise();
  if (!contexto) return null;

  try {
    let area = { x: 0, y: 0, largura: 1, altura: 1 };
    if (regiao && Number.isFinite(regiao.x) && Number.isFinite(regiao.y)) {
      const x = limitar(regiao.x, 0, 1);
      const y = limitar(regiao.y, 0, 1);
      area = {
        x,
        y,
        largura: limitar(regiao.largura, 0, 1 - x),
        altura: limitar(regiao.altura, 0, 1 - y),
      };
    }

    const origemX = area.x * dimensoes.largura;
    const origemY = area.y * dimensoes.altura;
    const larguraOrigem = Math.max(1, Math.min(dimensoes.largura - origemX, area.largura * dimensoes.largura));
    const alturaOrigem = Math.max(1, Math.min(dimensoes.altura - origemY, area.altura * dimensoes.altura));

    contexto.setTransform(1, 0, 0, 1, 0, 0);
    contexto.clearRect(0, 0, LADO_ANALISE, LADO_ANALISE);
    contexto.drawImage(
      fonte,
      origemX,
      origemY,
      larguraOrigem,
      alturaOrigem,
      0,
      0,
      LADO_ANALISE,
      LADO_ANALISE,
    );

    const { data } = contexto.getImageData(0, 0, LADO_ANALISE, LADO_ANALISE);
    const total = LADO_ANALISE * LADO_ANALISE;

    let somaLuminancia = 0;
    let somaQuadradosLuminancia = 0;
    let escuros = 0;
    let estourados = 0;

    for (let indice = 0, pixel = 0; pixel < total; indice += 4, pixel += 1) {
      const luminancia = 0.2126 * data[indice] + 0.7152 * data[indice + 1] + 0.0722 * data[indice + 2];
      cinzasAnalise[pixel] = luminancia;
      somaLuminancia += luminancia;
      somaQuadradosLuminancia += luminancia * luminancia;
      if (luminancia < 30) escuros += 1;
      if (luminancia > 245) estourados += 1;
    }

    const media = somaLuminancia / total;
    const variancia = Math.max(0, somaQuadradosLuminancia / total - media * media);
    const desvio = Math.sqrt(variancia);

    let somaLap = 0;
    let somaQuadradosLap = 0;
    let contagemLap = 0;
    for (let y = 1; y < LADO_ANALISE - 1; y += 1) {
      for (let x = 1; x < LADO_ANALISE - 1; x += 1) {
        const indice = y * LADO_ANALISE + x;
        const lap =
          4 * cinzasAnalise[indice] -
          cinzasAnalise[indice - 1] -
          cinzasAnalise[indice + 1] -
          cinzasAnalise[indice - LADO_ANALISE] -
          cinzasAnalise[indice + LADO_ANALISE];
        somaLap += lap;
        somaQuadradosLap += lap * lap;
        contagemLap += 1;
      }
    }

    const mediaLap = contagemLap > 0 ? somaLap / contagemLap : 0;
    const nitidez =
      contagemLap > 0 ? Math.max(0, somaQuadradosLap / contagemLap - mediaLap * mediaLap) : 0;

    return {
      luminanciaMedia: media / 255,
      luminanciaDesvio: desvio / 255,
      proporcaoEscura: escuros / total,
      proporcaoEstourada: estourados / total,
      nitidez,
      largura: dimensoes.largura,
      altura: dimensoes.altura,
    };
  } catch {
    return null;
  }
}

function dimensoesDaFonte(fonte: FonteImagem): DimensoesMidia | null {
  if (typeof HTMLVideoElement !== 'undefined' && fonte instanceof HTMLVideoElement) {
    return fonte.videoWidth > 0 && fonte.videoHeight > 0
      ? { largura: fonte.videoWidth, altura: fonte.videoHeight }
      : null;
  }
  if (typeof HTMLImageElement !== 'undefined' && fonte instanceof HTMLImageElement) {
    return fonte.naturalWidth > 0 && fonte.naturalHeight > 0
      ? { largura: fonte.naturalWidth, altura: fonte.naturalHeight }
      : null;
  }
  return fonte.width > 0 && fonte.height > 0 ? { largura: fonte.width, altura: fonte.height } : null;
}

/**
 * Fallback quando o MediaPipe não está disponível: avalia apenas o que é
 * possível sem modelo (iluminação, nitidez e resolução). Os problemas de luz e
 * nitidez são avisos, para nunca impedir o envio de uma foto da galeria.
 */
export function analisarImagemEstatica(bitmap: FonteImagem): AnaliseFoto {
  const dimensoes = dimensoesDaFonte(bitmap);
  if (!dimensoes) {
    return {
      aprovada: false,
      rostoDetectado: false,
      instrucaoPrincipal: 'Não foi possível ler essa foto. Tente outra imagem.',
      verificacoes: [
        {
          id: 'imagem',
          status: 'erro',
          mensagem: 'Não foi possível ler essa foto. Tente outra imagem.',
        },
      ],
    };
  }

  const metricas = medirMetricasImagem(bitmap, dimensoes);
  return montarAnalise(verificacoesDeQualidade(dimensoes, metricas, 'imagem'), false);
}
