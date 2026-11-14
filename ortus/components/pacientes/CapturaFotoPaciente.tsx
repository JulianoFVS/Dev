'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RefreshCw,
  ScanFace,
  X,
  XCircle,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import {
  analisarFotoPaciente,
  analisarImagemEstatica,
  calcularCaixaRosto,
  medirMetricasImagem,
  type AnaliseFoto,
  type CaixaRosto,
  type DimensoesMidia,
  type FonteImagem,
  type ResultadoFaceLandmarker,
  type VerificacaoFoto,
} from '@/lib/analiseFotoPaciente';
import type { FaceLandmarker, FaceLandmarkerOptions } from '@mediapipe/tasks-vision';

type CapturaFotoPacienteProps = {
  open: boolean;
  onClose: () => void;
  onConfirmar: (blob: Blob) => Promise<void> | void;
  titulo?: string;
};

type Fase = 'iniciando' | 'ao-vivo' | 'revisao' | 'sem-camera';
type OrigemRevisao = 'camera' | 'arquivo';
type StatusModelo = 'carregando' | 'pronto' | 'indisponivel';
type TomAnalise = 'neutro' | 'ok' | 'aviso' | 'erro';

const INTERVALO_ANALISE_MS = 160;
const TEMPO_LIMITE_MODELO_MS = 20000;
const URL_WASM = '/mediapipe/wasm';
const CAMINHO_MODELO = '/mediapipe/face_landmarker.task';

const BORDA_OVAL: Record<TomAnalise, string> = {
  neutro: 'border-white/70',
  ok: 'border-emerald-400 ring-4 ring-emerald-400/25',
  aviso: 'border-amber-400 ring-4 ring-amber-400/25',
  erro: 'border-rose-500 ring-4 ring-rose-500/25',
};

const CORES_STATUS: Record<TomAnalise, string> = {
  neutro: 'bg-neutral-900/75 text-white',
  ok: 'bg-emerald-500 text-white',
  aviso: 'bg-amber-400 text-amber-950',
  erro: 'bg-rose-500 text-white',
};

const ROTULO_TOM: Record<TomAnalise, string> = {
  neutro: 'Ajuste o enquadramento',
  ok: 'Tudo pronto',
  aviso: 'Quase lá',
  erro: 'Ajuste necessário',
};

const TEXTO_TOM: Record<TomAnalise, string> = {
  neutro: 'text-neutral-900',
  ok: 'text-emerald-700',
  aviso: 'text-amber-800',
  erro: 'text-rose-700',
};

const PONTO_TOM: Record<TomAnalise, string> = {
  neutro: 'bg-neutral-400',
  ok: 'bg-emerald-500',
  aviso: 'bg-amber-500',
  erro: 'bg-rose-500',
};

function tomDaAnalise(analise: AnaliseFoto | null): TomAnalise {
  if (!analise) return 'neutro';
  if (analise.verificacoes.some((item) => item.status === 'erro')) return 'erro';
  if (analise.verificacoes.some((item) => item.status === 'aviso')) return 'aviso';
  return 'ok';
}

function resumoPendencias(analise: AnaliseFoto): string {
  const erros = analise.verificacoes.filter((item) => item.status === 'erro');
  if (erros.length === 1) return erros[0]?.mensagem ?? 'Ajuste o que está em vermelho.';
  return `${erros.length} ajustes pendentes antes de confirmar.`;
}

function expandirCaixa(caixa: CaixaRosto, folga: number): CaixaRosto {
  const extraX = caixa.largura * folga;
  const extraY = caixa.altura * folga;
  return {
    x: Math.max(0, caixa.x - extraX),
    y: Math.max(0, caixa.y - extraY),
    largura: caixa.largura + extraX * 2,
    altura: caixa.altura + extraY * 2,
  };
}

function IconeVerificacao({ status }: { status: VerificacaoFoto['status'] }) {
  if (status === 'ok') {
    return <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />;
  }
  if (status === 'aviso') {
    return <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />;
  }
  return <XCircle size={15} className="mt-0.5 shrink-0 text-rose-600" aria-hidden />;
}

function ListaVerificacoes({ analise }: { analise: AnaliseFoto }) {
  return (
    <ul className="space-y-1" aria-label="Verificações da foto">
      {analise.verificacoes.map((item) => (
        <li
          key={item.id}
          className={`flex items-start gap-2 rounded-md px-2 py-1 text-[13px] leading-snug ${
            item.status === 'erro'
              ? 'bg-rose-50 font-medium text-rose-700'
              : item.status === 'aviso'
                ? 'bg-amber-50 text-amber-800'
                : 'text-neutral-600'
          }`}
        >
          <IconeVerificacao status={item.status} />
          <span>{item.mensagem}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CapturaFotoPaciente({
  open,
  onClose,
  onConfirmar,
  titulo,
}: CapturaFotoPacienteProps) {
  const [fase, setFase] = useState<Fase>('iniciando');
  const [modeloStatus, setModeloStatus] = useState<StatusModelo>('carregando');
  const [analise, setAnalise] = useState<AnaliseFoto | null>(null);
  const [analiseRevisao, setAnaliseRevisao] = useState<AnaliseFoto | null>(null);
  const [origemRevisao, setOrigemRevisao] = useState<OrigemRevisao>('camera');
  const [blobPendente, setBlobPendente] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [mensagemCamera, setMensagemCamera] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const ultimoAnalisadoRef = useRef(0);
  const timestampRef = useRef(0);
  const assinaturaRef = useRef('');
  const previewRef = useRef<string | null>(null);
  const falhaDeteccaoRef = useRef(false);
  const fechadoRef = useRef(true);
  const sessaoRef = useRef(0);
  const cameraSessaoRef = useRef(0);
  const faseRef = useRef<Fase>('iniciando');
  const modeloStatusRef = useRef<StatusModelo>('carregando');

  const definirFase = useCallback((nova: Fase) => {
    faseRef.current = nova;
    setFase(nova);
  }, []);

  const definirModeloStatus = useCallback((novo: StatusModelo) => {
    modeloStatusRef.current = novo;
    setModeloStatus(novo);
  }, []);

  const definirPreview = useCallback((url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  }, []);

  const publicarAnalise = useCallback((nova: AnaliseFoto) => {    const assinatura = `${nova.aprovada}|${nova.rostoDetectado}|${nova.instrucaoPrincipal}|${nova.verificacoes
      .map((item) => `${item.id}:${item.status}:${item.mensagem}`)
      .join('|')}`;
    if (assinatura === assinaturaRef.current) return;
    assinaturaRef.current = assinatura;
    setAnalise(nova);
  }, []);

  const pararCamera = useCallback(() => {
    cameraSessaoRef.current += 1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        // Alguns navegadores lançam ao pausar um vídeo já desligado; não é crítico.
      }
      video.srcObject = null;
    }
  }, []);

  const iniciarCamera = useCallback(async () => {
    pararCamera();
    const sessao = cameraSessaoRef.current;
    const ativa = () => cameraSessaoRef.current === sessao && !fechadoRef.current;

    if (!ativa()) return;
    definirFase('iniciando');
    setMensagem(null);
    setMensagemCamera(null);
    setAnalise(null);
    assinaturaRef.current = '';

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMensagemCamera(
        'Seu navegador não permite abrir a câmera. Você pode enviar uma foto da galeria.',
      );
      definirFase('sem-camera');
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!ativa()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      let video = videoRef.current;
      // O Modal só monta o conteúdo depois de abrir; se a permissão da câmera
      // resolver muito rápido, esperamos alguns frames pelo <video>.
      for (let tentativa = 0; tentativa < 30 && !video; tentativa += 1) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        if (!ativa()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video = videoRef.current;
      }
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setMensagemCamera(
          'Não conseguimos exibir a câmera. Você pode enviar uma foto da galeria.',
        );
        definirFase('sem-camera');
        return;
      }

      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // O atributo muted + playsInline costuma bastar; se falhar, os metadados
        // ainda chegam e o usuário pode tocar na tela para iniciar.
      }

      if (video.readyState < 1) {
        await new Promise<void>((resolve) => {
          const aoCarregar = () => {
            video.removeEventListener('loadedmetadata', aoCarregar);
            resolve();
          };
          video.addEventListener('loadedmetadata', aoCarregar);
          window.setTimeout(() => {
            video.removeEventListener('loadedmetadata', aoCarregar);
            resolve();
          }, 4000);
        });
      }

      if (!ativa() || streamRef.current !== stream) return;
      if (!video.videoWidth || !video.videoHeight) {
        throw new Error('A câmera não entregou imagem. Tente novamente.');
      }
      definirFase('ao-vivo');
    } catch (erro) {
      stream?.getTracks().forEach((track) => track.stop());
      if (stream && streamRef.current === stream) streamRef.current = null;
      if (!ativa()) return;

      const nome =
        typeof DOMException !== 'undefined' && erro instanceof DOMException ? erro.name : '';
      if (nome === 'NotAllowedError' || nome === 'SecurityError') {
        setMensagemCamera(
          'Não conseguimos usar a câmera. Você pode enviar uma foto da galeria.',
        );
      } else if (
        nome === 'NotFoundError' ||
        nome === 'DevicesNotFoundError' ||
        nome === 'OverconstrainedError'
      ) {
        setMensagemCamera(
          'Não encontramos uma câmera disponível. Você pode enviar uma foto da galeria.',
        );
      } else {
        setMensagemCamera(
          erro instanceof Error && erro.message
            ? erro.message
            : 'Não conseguimos abrir a câmera. Você pode enviar uma foto da galeria.',
        );
      }
      definirFase('sem-camera');
    }
  }, [definirFase, pararCamera]);

  const carregarModelo = useCallback(async () => {
    const sessao = sessaoRef.current;
    const ativa = () => sessaoRef.current === sessao && !fechadoRef.current;

    definirModeloStatus('carregando');
    const limite = window.setTimeout(() => {
      if (ativa() && modeloStatusRef.current === 'carregando') {
        definirModeloStatus('indisponivel');
      }
    }, TEMPO_LIMITE_MODELO_MS);

    try {
      const { FilesetResolver, FaceLandmarker: CriadorLandmarker } = await import(
        '@mediapipe/tasks-vision'
      );
      const fileset = await FilesetResolver.forVisionTasks(URL_WASM);
      const opcoes: FaceLandmarkerOptions = {
        baseOptions: { modelAssetPath: CAMINHO_MODELO, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };

      let landmarker: FaceLandmarker;
      try {
        landmarker = await CriadorLandmarker.createFromOptions(fileset, opcoes);
      } catch (erroGpu) {
        console.warn('A análise facial não iniciou com GPU; tentando novamente com CPU.', erroGpu);
        landmarker = await CriadorLandmarker.createFromOptions(fileset, {
          ...opcoes,
          baseOptions: { ...opcoes.baseOptions, delegate: 'CPU' },
        });
      }

      if (!ativa()) {
        landmarker.close();
        return;
      }

      const anterior = landmarkerRef.current;
      landmarkerRef.current = landmarker;
      if (anterior && anterior !== landmarker) {
        try {
          anterior.close();
        } catch {
          // Ignora: o modelo antigo pode já ter sido encerrado.
        }
      }
      definirModeloStatus('pronto');
    } catch (erro) {
      console.warn(
        'Não foi possível carregar a análise facial do MediaPipe; a captura segue disponível.',
        erro,
      );
      if (ativa()) definirModeloStatus('indisponivel');
    } finally {
      window.clearTimeout(limite);
    }
  }, [definirModeloStatus]);

  useEffect(() => {
    if (!open) return;

    const sessao = sessaoRef.current + 1;
    sessaoRef.current = sessao;
    fechadoRef.current = false;

    setMensagem(null);
    setMensagemCamera(null);
    setAnalise(null);
    setAnaliseRevisao(null);
    setBlobPendente(null);
    setOrigemRevisao('camera');
    setProcessando(false);
    setEnviando(false);
    definirPreview(null);
    assinaturaRef.current = '';
    falhaDeteccaoRef.current = false;
    ultimoAnalisadoRef.current = 0;
    definirFase('iniciando');
    definirModeloStatus('carregando');

    void iniciarCamera();
    void carregarModelo();

    return () => {
      if (sessaoRef.current === sessao) sessaoRef.current = sessao + 1;
      fechadoRef.current = true;
      pararCamera();
      const landmarker = landmarkerRef.current;
      landmarkerRef.current = null;
      if (landmarker) {
        try {
          landmarker.close();
        } catch (erro) {
          console.warn('Não foi possível encerrar a análise facial.', erro);
        }
      }
      definirFase('iniciando');
      setAnalise(null);
      setAnaliseRevisao(null);
      setBlobPendente(null);
      setMensagem(null);
      setMensagemCamera(null);
      setEnviando(false);
      setProcessando(false);
      setOrigemRevisao('camera');
      definirPreview(null);
    };
  }, [
    open,
    carregarModelo,
    definirFase,
    definirModeloStatus,
    definirPreview,
    iniciarCamera,
    pararCamera,
  ]);

  /** Timestamp monotônico exigido pelo MediaPipe (detectForVideo). */
  const proximoTimestamp = useCallback(() => {
    const agora = Math.max(performance.now(), timestampRef.current + 1);
    timestampRef.current = agora;
    return agora;
  }, []);

  const analisarFonte = useCallback(
    (fonte: FonteImagem, dimensoes: DimensoesMidia): AnaliseFoto => {
      const landmarker = landmarkerRef.current;
      if (!landmarker) return analisarImagemEstatica(fonte);

      try {
        const resultado: ResultadoFaceLandmarker = landmarker.detectForVideo(
          fonte,
          proximoTimestamp(),
        );
        const caixa = calcularCaixaRosto(resultado.faceLandmarks?.[0]);
        const metricas = medirMetricasImagem(
          fonte,
          dimensoes,
          caixa ? expandirCaixa(caixa, 0.06) : null,
        );
        return analisarFotoPaciente({ resultado, dimensoes, metricas });
      } catch (erro) {
        if (!falhaDeteccaoRef.current) {
          falhaDeteccaoRef.current = true;
          console.warn('Falha ao analisar a imagem com o MediaPipe; usando o fallback.', erro);
        }
        return analisarImagemEstatica(fonte);
      }
    },
    [proximoTimestamp],
  );

  const rodarAnalise = useCallback(() => {
    rafRef.current = requestAnimationFrame(rodarAnalise);
    if (fechadoRef.current || faseRef.current !== 'ao-vivo') return;
    if (modeloStatusRef.current === 'carregando') return;

    const agora = proximoTimestamp();
    if (agora - ultimoAnalisadoRef.current < INTERVALO_ANALISE_MS) return;
    ultimoAnalisadoRef.current = agora;

    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    const dimensoes: DimensoesMidia = { largura: video.videoWidth, altura: video.videoHeight };
    const landmarker = landmarkerRef.current;

    if (!landmarker) {
      publicarAnalise(analisarImagemEstatica(video));
      return;
    }

    let resultado: ResultadoFaceLandmarker | null = null;
    try {
      resultado = landmarker.detectForVideo(video, agora);
    } catch (erro) {
      if (!falhaDeteccaoRef.current) {
        falhaDeteccaoRef.current = true;
        console.warn('Falha ao analisar o vídeo da câmera.', erro);
      }
      return;
    }

    const caixa = calcularCaixaRosto(resultado.faceLandmarks?.[0]);
    const metricas = medirMetricasImagem(
      video,
      dimensoes,
      caixa ? expandirCaixa(caixa, 0.06) : null,
    );
    publicarAnalise(analisarFotoPaciente({ resultado, dimensoes, metricas }));
  }, [proximoTimestamp, publicarAnalise]);

  useEffect(() => {
    if (!open || fase !== 'ao-vivo') return;
    rafRef.current = requestAnimationFrame(rodarAnalise);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, fase, rodarAnalise]);

  const confirmar = useCallback(
    async (blob: Blob) => {
      if (fechadoRef.current) return;
      setEnviando(true);
      setMensagem(null);
      try {
        await onConfirmar(blob);
        onClose();
      } catch (erro) {
        setMensagem(
          erro instanceof Error && erro.message
            ? erro.message
            : 'Não foi possível salvar a foto. Tente novamente.',
        );
      } finally {
        setEnviando(false);
      }
    },
    [onClose, onConfirmar],
  );

  const tirarFoto = useCallback(async () => {
    if (processando || enviando || !analise?.aprovada) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setMensagem('A câmera ainda está iniciando. Aguarde um instante.');
      return;
    }

    setProcessando(true);
    setMensagem(null);
    const dimensoes: DimensoesMidia = { largura: video.videoWidth, altura: video.videoHeight };

    try {
      const canvas = document.createElement('canvas');
      canvas.width = dimensoes.largura;
      canvas.height = dimensoes.altura;
      const contexto = canvas.getContext('2d');
      if (!contexto) throw new Error('Não foi possível capturar a imagem da câmera.');
      contexto.drawImage(video, 0, 0, dimensoes.largura, dimensoes.altura);

      // A mesma análise roda novamente sobre a imagem congelada, para garantir
      // que o frame salvo (e não só a prévia ao vivo) está dentro do padrão.
      const analiseFinal = analisarFonte(canvas, dimensoes);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (gerado) => (gerado ? resolve(gerado) : reject(new Error('Não foi possível gerar a foto.'))),
          'image/jpeg',
          0.92,
        );
      });
      if (fechadoRef.current) return;

      definirPreview(URL.createObjectURL(blob));
      setBlobPendente(blob);
      setAnaliseRevisao(analiseFinal);
      setOrigemRevisao('camera');

      if (analiseFinal.aprovada) {
        await confirmar(blob);
      } else {
        pararCamera();
        definirFase('revisao');
        setMensagem('A foto saiu diferente do esperado. Confira as orientações e tente de novo.');
      }
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : 'Não foi possível tirar a foto.');
    } finally {
      setProcessando(false);
    }
  }, [analise, analisarFonte, confirmar, definirFase, definirPreview, enviando, pararCamera, processando]);

  const selecionarArquivo = useCallback(
    async (evento: ChangeEvent<HTMLInputElement>) => {
      const arquivo = evento.target.files?.[0];
      evento.target.value = '';
      if (!arquivo) return;

      setProcessando(true);
      setMensagem(null);
      let bitmap: ImageBitmap | null = null;

      try {
        bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
        if (fechadoRef.current) return;
        const analiseArquivo = analisarImagemEstatica(bitmap);

        pararCamera();
        definirPreview(URL.createObjectURL(arquivo));
        setBlobPendente(arquivo);
        setAnaliseRevisao(analiseArquivo);
        setOrigemRevisao('arquivo');
        definirFase('revisao');
      } catch (erro) {
        setMensagem(
          erro instanceof Error && erro.message
            ? erro.message
            : 'Não foi possível ler essa foto. Tente outra imagem.',
        );
      } finally {
        bitmap?.close();
        setProcessando(false);
      }
    },
    [definirFase, definirPreview, pararCamera],
  );

  const tentarNovamente = useCallback(() => {
    setMensagem(null);
    if (origemRevisao === 'arquivo') {
      arquivoRef.current?.click();
      return;
    }
    setAnaliseRevisao(null);
    setBlobPendente(null);
    assinaturaRef.current = '';
    definirPreview(null);
    void iniciarCamera();
  }, [definirPreview, iniciarCamera, origemRevisao]);

  const fecharModal = useCallback(() => {
    if (enviando) return;
    onClose();
  }, [enviando, onClose]);

  const emRevisao = fase === 'revisao';
  const analiseVisivel = emRevisao ? analiseRevisao : analise;
  const tom = tomDaAnalise(analiseVisivel);
  const carregandoModelo = modeloStatus === 'carregando';
  const modeloIndisponivel = modeloStatus === 'indisponivel';
  const cameraAoVivo = fase === 'ao-vivo';
  const emPreparo =
    fase === 'iniciando' || (cameraAoVivo && carregandoModelo && !analiseVisivel);
  const podeTirarFoto =
    cameraAoVivo && !processando && !enviando && !carregandoModelo && !!analise?.aprovada;
  const podeUsarFoto =
    emRevisao && !processando && !enviando && !!blobPendente && !!analiseRevisao?.aprovada;

  const instrucao = emRevisao
    ? (analiseRevisao?.instrucaoPrincipal ??
      (analiseRevisao?.aprovada ? 'Foto aprovada. Toque em “Usar esta foto”.' : 'Confira a foto.'))
    : fase === 'iniciando'
      ? 'Preparando a câmera…'
      : fase === 'sem-camera'
        ? 'Câmera indisponível'
        : carregandoModelo && !analise
          ? 'Preparando a análise facial…'
          : (analise?.instrucaoPrincipal ??
            (analise?.aprovada ? 'Tudo certo! Toque em “Tirar foto”.' : 'Procurando o rosto…'));

  const iconeTom =
    tom === 'ok' ? (
      <CheckCircle2 size={14} aria-hidden />
    ) : tom === 'aviso' ? (
      <AlertTriangle size={14} aria-hidden />
    ) : tom === 'erro' ? (
      <XCircle size={14} aria-hidden />
    ) : (
      <ScanFace size={14} aria-hidden />
    );

  return (
    <Modal
      open={open}
      onClose={fecharModal}
      zIndex={100}
      maxWidth="3xl"
      hideCloseButton
      closeOnBackdrop={!enviando}
      closeOnEscape={!enviando}
      className="!p-0 sm:!p-4"
      panelClassName="!max-h-[100dvh] overflow-hidden border-0 bg-white shadow-2xl sm:!max-h-[90vh] sm:rounded-2xl sm:border sm:border-neutral-200"
    >
      <div className="flex h-[100dvh] max-h-[100dvh] flex-col bg-white sm:h-auto sm:max-h-[88vh]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
              aria-hidden
            >
              <ScanFace size={19} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-neutral-900">
                {titulo || 'Foto do paciente'}
              </h2>
              <p className="truncate text-[11px] font-medium text-neutral-400">
                Enquadre o rosto no círculo · olhos abertos · de frente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fecharModal}
            disabled={enviando}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Fechar captura de foto"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="relative flex min-h-[14rem] flex-1 items-center justify-center overflow-hidden bg-neutral-950 lg:min-h-[28rem]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label="Imagem ao vivo da câmera"
              className={`absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity duration-200 ${
                cameraAoVivo ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {emRevisao && previewUrl && (
              <>
                <img
                  src={previewUrl}
                  alt="Pré-visualização da foto selecionada"
                  className="absolute inset-0 h-full w-full bg-neutral-950 object-contain"
                />
                <span className="absolute left-3 top-3 z-10 rounded-full bg-neutral-900/80 px-2.5 py-1 text-[11px] font-medium text-white">
                  {origemRevisao === 'arquivo' ? 'Arquivo selecionado' : 'Foto capturada'}
                </span>
              </>
            )}

            {cameraAoVivo && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`relative h-[80%] w-[74%] max-w-[20rem] rounded-[50%] border-4 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)] transition-colors duration-300 ${BORDA_OVAL[tom]}`}
                />
                <div className="absolute inset-x-0 top-3 flex justify-center">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${CORES_STATUS[tom]}`}
                  >
                    {iconeTom}
                    {ROTULO_TOM[tom]}
                  </span>
                </div>
              </div>
            )}

            {fase === 'iniciando' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950/85 px-6 text-center text-white">
                <Loader2 size={22} className="animate-spin text-emerald-400" />
                <p className="text-sm font-medium">Preparando a câmera…</p>
                <p className="max-w-[17rem] text-xs text-white/60">
                  Na primeira vez pode levar alguns segundos.
                </p>
              </div>
            )}

            {fase === 'sem-camera' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center text-white">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <CameraOff size={26} aria-hidden />
                </span>
                <p className="max-w-xs text-sm font-medium leading-relaxed">
                  {mensagemCamera ?? 'Não conseguimos abrir a câmera.'}
                </p>
                <button
                  type="button"
                  onClick={() => arquivoRef.current?.click()}
                  disabled={processando || enviando}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ImagePlus size={16} aria-hidden />
                  Enviar uma foto
                </button>
              </div>
            )}

            {enviando && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-neutral-950/70 text-white">
                <Loader2 size={24} className="animate-spin" />
                <p className="text-sm font-medium">Salvando foto…</p>
              </div>
            )}
          </section>

          <section className="flex min-h-0 max-h-[40dvh] shrink-0 flex-col border-t border-black/10 bg-[#f8f8f6] lg:max-h-none lg:border-l lg:border-t-0">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 lg:px-5 lg:py-4">
              <div className="mx-auto flex w-full max-w-md flex-col gap-3 lg:max-w-none">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    <span className={`h-2 w-2 rounded-full ${PONTO_TOM[tom]}`} aria-hidden />
                    {ROTULO_TOM[tom]}
                  </div>
                  <p
                    aria-live="polite"
                    className={`mt-1 text-lg font-semibold leading-snug ${TEXTO_TOM[tom]}`}
                  >
                    {instrucao}
                  </p>
                  {emRevisao && analiseRevisao && (
                    <p className="mt-1 text-xs text-neutral-500">
                      {analiseRevisao.aprovada
                        ? 'Esta foto atende ao padrão. Você pode confirmar.'
                        : resumoPendencias(analiseRevisao)}
                    </p>
                  )}
                  {!emRevisao && modeloIndisponivel && fase === 'ao-vivo' && (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-medium leading-snug text-amber-800">
                      A análise facial não carregou neste aparelho. Você ainda pode tirar a foto ou
                      enviar uma da galeria.
                    </p>
                  )}
                </div>

                {emPreparo && (
                  <div className="space-y-1.5" aria-hidden>
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        className="h-7 animate-pulse rounded-md bg-neutral-200/80"
                        style={{ animationDelay: `${item * 90}ms` }}
                      />
                    ))}
                  </div>
                )}

                {analiseVisivel && (!carregandoModelo || emRevisao) && (
                  <ListaVerificacoes analise={analiseVisivel} />
                )}

                {emRevisao && origemRevisao === 'arquivo' && (
                  <p className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[11px] leading-snug text-neutral-500">
                    A checagem facial não roda em fotos da galeria. Confira se o rosto está nítido,
                    de frente e centralizado no círculo.
                  </p>
                )}

                {mensagem && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium leading-snug text-rose-700"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                    {mensagem}
                  </p>
                )}

                {emRevisao && analiseRevisao && !analiseRevisao.aprovada && (
                  <p className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-[12px] leading-snug text-neutral-600">
                    Corrija o que está em vermelho para liberar a confirmação.
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-black/5 bg-white px-4 py-3 lg:bg-[#f8f8f6]">
              <div className="mx-auto flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-end lg:max-w-none">
                {emRevisao ? (
                  <>
                    <button
                      type="button"
                      onClick={tentarNovamente}
                      disabled={processando || enviando}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                    >
                      <RefreshCw size={16} aria-hidden />
                      {origemRevisao === 'arquivo' ? 'Escolher outra' : 'Tirar outra'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (blobPendente && analiseRevisao?.aprovada) {
                          void confirmar(blobPendente);
                        }
                      }}
                      disabled={!podeUsarFoto}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 sm:flex-none"
                    >
                      {enviando ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden />
                      ) : (
                        <CheckCircle2 size={16} aria-hidden />
                      )}
                      {enviando ? 'Salvando…' : 'Usar esta foto'}
                    </button>
                  </>
                ) : fase === 'sem-camera' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void iniciarCamera();
                      }}
                      disabled={processando || enviando}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                    >
                      <RefreshCw size={16} aria-hidden />
                      Tentar novamente
                    </button>
                    <button
                      type="button"
                      onClick={() => arquivoRef.current?.click()}
                      disabled={processando || enviando}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                    >
                      <ImagePlus size={16} aria-hidden />
                      Enviar uma foto
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => arquivoRef.current?.click()}
                      disabled={processando || enviando}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                    >
                      <ImagePlus size={16} aria-hidden />
                      Enviar uma foto
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void tirarFoto();
                      }}
                      disabled={!podeTirarFoto}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 sm:flex-none"
                      aria-label="Tirar foto e enviar"
                    >
                      {processando || enviando ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden />
                      ) : (
                        <Camera size={16} aria-hidden />
                      )}
                      {enviando
                        ? 'Salvando…'
                        : processando
                          ? 'Processando…'
                          : carregandoModelo
                            ? 'Preparando…'
                            : 'Tirar foto'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>

        <input
          ref={arquivoRef}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          onChange={(evento) => {
            void selecionarArquivo(evento);
          }}
          aria-label="Enviar uma foto da galeria"
          tabIndex={-1}
        />
      </div>
    </Modal>
  );
}
