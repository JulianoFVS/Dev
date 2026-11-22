'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { dados as tabelas, usuarioDaSessao } from '@/lib/local/consulta';
import { useParams, useSearchParams } from 'next/navigation';
import { User, Edit, ArrowLeft, Save, Loader2, FileText, Clock, Trash2, Calendar, CalendarPlus, X, Check, Printer, Smile, Plus, Eraser, CheckCircle, ClipboardList, FolderOpen, Upload, Download, DollarSign, Settings, Sparkles, Camera, ShieldCheck, Zap, Link2, Copy, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, List, ArrowUpDown, Search, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { carregarModelos, carregarModelosAsync, formatarRespostaAnamnese, respostaInicial, type ModeloAnamnese, type RespostaAnamnese, type RespostaSimNaoTexto } from '@/lib/anamnese';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import { useClinica } from '@/app/context/ClinicaContext';
import { registrarAudit } from '@/lib/auditLog';
import { fraseDeErro } from '@/lib/fraseDeErro';
import TabEvolucao from './TabEvolucao';
import EsqueletoFicha from './loading';
import CustomSelect from '@/components/ui/CustomSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import TagInput from '@/components/ui/TagInput';
import Modal from '@/components/ui/Modal';
import Switch from '@/components/ui/Switch';
import MenuPontos from '@/components/ui/MenuPontos';
import { MEDICAMENTOS_CATALOGO } from '@/lib/medicamentosCatalogo';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarPaciente, isMenorDeIdade } from '@/lib/pacienteValidation';
import { cpfValido, mascaraCep, mascaraCpf, mascaraNumero, mascaraTelefone, variantesCpf } from '@/lib/mascaras';
import { prepararFotoPaciente } from '@/lib/prepararFotoPaciente';
import { apagarArquivosClinica, baixarArquivoClinica, enviarArquivoClinica, enviarFotoPaciente, extrairCaminhoArquivo } from '@/lib/armazenamento';
import { tipoPorExtensao } from '@/lib/assinaturaArquivo';
import { origemDoDocumento, tipoSeguroParaServir, vistaDoDocumento, type VistaDocumento } from '@/lib/caminhosArquivo';
import { guardarFotoPaciente, useFotoPaciente } from '@/hooks/useFotoPaciente';
import CampoData from '@/components/ui/CampoData';
import HofPreviewRosto from '@/components/clinico/HofPreviewRosto';
import { carregarConfig } from '@/lib/configClinica';
import { buildDocumentoContexto, aplicarVariaveisDocumento } from '@/lib/documentVariables';
import { printDocument, printQaBlock, printSignatureBlock, printTable, escapePrintHtml } from '@/lib/printDocument';
import PatientContactButtons from '@/components/PatientContactButtons';
import { carregarTaxasAtivas, type ParteRecebimento } from '@/lib/recebimentoAgendamento';
import { criarDebitoManual, listarDebitosPaciente, listarOpcoesMarcarNaoPago, marcarAgendamentoNaoPago, receberDebito, type DebitoPaciente } from '@/lib/debitosPaciente';
import { calcularValorLiquido, normalizarTaxasMaquininha, TAXAS_MAQUININHA_PADRAO, type TaxaMaquininha } from '@/lib/configDefaults';
import { registrarComissaoDebitoRecebido, registrarComissaoTratamentoFinalizado } from '@/lib/comissao';
import { carregarProntuario } from '@/lib/fichaPaciente';
import { criarAnamnese, listarAnamneses, atualizarAnamnese, excluirAnamnese as excluirAnamneseDb, gerarLinkAnamnesePaciente as gerarLinkAnamnesePacienteApi } from '@/lib/db/anamneses';
import { criarDocumento, listarDocumentos, excluirDocumento as excluirDocumentoDb } from '@/lib/db/documentos';
import { carregarFichaClinica, salvarFichaClinica } from '@/lib/db/fichaClinica';
import { listarEvolucoes } from '@/lib/db/evolucoes';
import ModalNovoAgendamento from '@/components/agenda/ModalNovoAgendamento';
import { atualizarTratamento, criarTratamento, listarTratamentos, excluirTratamento as excluirTratamentoDb } from '@/lib/db/tratamentos';
import OrcamentosDoPaciente from '@/components/orcamentos/OrcamentosDoPaciente';
import { legacyJsonToProntuario, type ProntuarioPaciente, type TratamentoPaciente } from '@/lib/db/types';
import { atualizar, inserir, listar, modoDados } from '@/lib/local/cliente';
import { FACE_COLORS, FACE_LABELS, ODONTO_TOOLS } from '@/lib/odontogram/constants';
import type { LegacyToothState, OdontoFace, OdontoFaceStatus, OdontoToothStatus } from '@/lib/odontogram/types';
import {
    aplicarTratamentoNoSnapshot,
    listarMarcacoesOdontograma,
    mesclarObservacaoOdontograma,
    parseDentesCampo,
    sugestaoUnica,
} from '@/lib/odontogram/marcacoes';
import { FDI_MISSING_IN_3D } from '@/lib/odontogram/meshToFdi';
import { selectLegacyOdontogram, useOdontogramStore } from '@/store/useOdontogramStore';
import dynamic from 'next/dynamic';

// three.js + drei só entram no bundle quando a vista 3D é aberta
const OdontogramaContainer = dynamic(() => import('@/components/OdontogramaContainer'), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[240px] w-full animate-pulse rounded-xl bg-[#f4f6f8]" />
  ),
});

// =============== ODONTOGRAMA - Padrão Codental (Vista Lateral + Oclusal) ===============
type Face = OdontoFace;
type FaceStatus = OdontoFaceStatus;
type ToothCondition = OdontoToothStatus;
interface ToothState { faces: Partial<Record<Face, FaceStatus>>; cond: ToothCondition }

const TOOLS = ODONTO_TOOLS;

const campoLabel = 'mb-1.5 block text-xs font-medium text-neutral-500';

function campoClass(editing: boolean) {
  return `box-border h-10 max-h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 disabled:cursor-default ${
    editing ? 'focus:border-neutral-900' : ''
  }`;
}

function semConexao(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// Alvo de toque: 40px no celular, tamanho de antes a partir de sm.
const botaoFecharModal = '-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:mr-0 sm:h-8 sm:w-8';
const botaoIconeLinha = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-auto sm:w-auto sm:p-1.5';

const ROTULO_STATUS_TRATAMENTO: Record<string, string> = {
  planejado: 'Planejado',
  andamento: 'Em andamento',
  concluido: 'Concluído',
};

/** Quem rola a ficha de fato. No celular é a casca de /pacientes; no computador a ficha cabe na tela e ninguém rola. */
function rolagemDaPagina(el: HTMLElement | null): HTMLElement | null {
  for (let no = el?.parentElement ?? null; no; no = no.parentElement) {
    const { overflowY } = getComputedStyle(no);
    if ((overflowY === 'auto' || overflowY === 'scroll') && no.scrollHeight > no.clientHeight) return no;
  }
  return null;
}

const PATIENT_NAV_SECTIONS = [
  { key: 'dados', label: 'Dados', icon: User },
  { key: 'anamnese', label: 'Anamnese', icon: FileText },
  { key: 'odontograma', label: 'Odontograma', icon: Smile },
  { key: 'tratamentos', label: 'Tratamentos', icon: ClipboardList },
  { key: 'documentos', label: 'Documentos', icon: FolderOpen },
  { key: 'debitos', label: 'Débitos', icon: DollarSign },
  { key: 'hof', label: 'HOF', icon: Sparkles },
  { key: 'historico', label: 'Histórico', icon: Clock },
];

type FormaRecebimento = 'credito_visa' | 'credito_elo' | 'debito_visa' | 'debito_elo' | 'pix' | 'dinheiro';

const FORMAS_RECEBIMENTO: { value: FormaRecebimento; label: string }[] = [
  { value: 'credito_visa', label: 'Crédito Visa/Master' },
  { value: 'credito_elo', label: 'Crédito Elo/outros' },
  { value: 'debito_visa', label: 'Débito Visa/Master' },
  { value: 'debito_elo', label: 'Débito Elo/outros' },
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
];

function formaEhCredito(forma: string) {
  return forma === 'credito_visa' || forma === 'credito_elo';
}

function taxaDaForma(taxas: TaxaMaquininha[], forma: string, parcelas: number): TaxaMaquininha | undefined {
  if (forma === 'dinheiro') return undefined;
  const fontes = [taxas, TAXAS_MAQUININHA_PADRAO];
  if (forma === 'pix') {
    return fontes.map((lista) => lista.find((t) => t.tipo === 'pix')).find(Boolean);
  }
  const bandeira = forma.endsWith('_visa') ? 'Visa/Master' : 'Elo';
  if (forma.startsWith('debito')) {
    return fontes.map((lista) => (
      lista.find((t) => t.tipo === 'debito' && t.bandeira === bandeira)
      || (forma === 'debito_elo' ? lista.find((t) => t.tipo === 'debito' && t.bandeira !== 'Visa/Master') : undefined)
    )).find(Boolean);
  }
  return fontes.map((lista) => {
    const daBandeira = lista.filter((t) => t.bandeira === bandeira && t.parcela != null);
    const opcoes = daBandeira.length
      ? daBandeira
      : forma === 'credito_elo'
        ? lista.filter((t) => t.parcela != null && t.bandeira !== 'Visa/Master' && t.tipo !== 'pix' && t.tipo !== 'debito')
        : [];
    return opcoes.find((t) => t.parcela === parcelas) || opcoes.find((t) => t.parcela === 1);
  }).find(Boolean);
}

const LEGACY_CONDICOES = [
  'Diabetes', 'Hipertensão', 'Cardiopatia', 'Asma/Bronquite',
  'Alergia Antibiótico', 'Alergia Anestésico', 'Gestante', 'Fumante', 'Uso de Anticoagulante',
];

function getCondicoesFromFicha(ficha: Record<string, unknown>): string[] {
  if (Array.isArray(ficha.condicoes)) return ficha.condicoes as string[];
  return LEGACY_CONDICOES.filter((k) => Boolean(ficha[k]));
}

function documentoEhImagem(d: { isImg?: boolean; tipo?: string; nome?: string }) {
  if (documentoEhPdf(d)) return false;
  if (d?.isImg) return true;
  if (String(d?.tipo || '').startsWith('image/') && !String(d?.tipo || '').includes('svg')) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(String(d?.nome || ''));
}

function documentoEhPdf(d: { isPdf?: boolean; tipo?: string; nome?: string }) {
  if (d?.isPdf) return true;
  if (d?.tipo === 'application/pdf') return true;
  return /\.pdf$/i.test(String(d?.nome || ''));
}

const EXTENSOES_DOCUMENTO = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx', 'txt']);
const EXTENSOES_BLOQUEADAS = new Set(['bat', 'cmd', 'com', 'exe', 'msi', 'dll', 'scr', 'ps1', 'vbs', 'js', 'jse', 'jar', 'sh', 'bash', 'apk', 'html', 'htm', 'svg', 'hta', 'reg', 'iso', 'zip', 'rar', '7z', 'gz', 'php', 'py']);
// O mesmo limite de lib/caminhosArquivo.ts (regraDoCaminho), conferido de novo no servidor.
const TAMANHO_MAX_DOCUMENTO = 10 * 1024 * 1024;

function validarArquivoDocumento(file: File): string | null {
  const partes = file.name.toLowerCase().split('.').filter(Boolean);
  if (partes.length < 2) return 'Envie JPG, PNG, WEBP, GIF, PDF, DOC ou TXT.';
  const extensao = partes[partes.length - 1];
  if (EXTENSOES_BLOQUEADAS.has(extensao) || partes.slice(0, -1).some((parte) => EXTENSOES_BLOQUEADAS.has(parte))) {
    return 'Esse tipo de arquivo não pode ser enviado.';
  }
  if (!EXTENSOES_DOCUMENTO.has(extensao)) return 'Envie JPG, PNG, WEBP, GIF, PDF, DOC ou TXT.';
  const mime = file.type.toLowerCase();
  if (mime && /html|javascript|x-msdownload|x-sh|x-bat|x-executable|x-dosexec|svg/.test(mime)) {
    return 'Esse tipo de arquivo não pode ser enviado.';
  }
  if (file.size <= 0) return 'O arquivo está vazio.';
  if (file.size > TAMANHO_MAX_DOCUMENTO) return 'Arquivo muito grande. O limite é 10 MB.';
  return null;
}

function gruposDeFaces(faces: Array<{ face: OdontoFace; status: OdontoFaceStatus }>) {
  const mapa = new Map<string, string[]>();
  const rotulo: Record<string, string> = { carie: 'cárie', restaurado: 'restauração', tratado: 'tratado', higido: 'hígido' };
  for (const face of faces) {
    const status = rotulo[face.status] || face.status;
    const nome = FACE_LABELS[face.face] || face.face;
    mapa.set(status, [...(mapa.get(status) || []), nome]);
  }
  return [...mapa.entries()];
}

/** Faces agrupadas por situação, com o nome da face no dente certo (palatal/lingual, oclusal/incisal). */
function facesPorStatus(num: number, faces: Array<{ face: OdontoFace; status: OdontoFaceStatus }>) {
  const ordem: OdontoFaceStatus[] = ['carie', 'restaurado', 'tratado'];
  const rotulos: Record<string, string> = { carie: 'Cárie', restaurado: 'Restauração', tratado: 'Tratado' };
  const ordemFaces: OdontoFace[] = ['V', 'M', 'O', 'D', 'L'];
  return ordem
    .map((status) => ({
      status,
      rotulo: rotulos[status],
      nomes: ordemFaces.filter((f) => faces.some((x) => x.face === f && x.status === status)).map((f) => nomeDaFace(f, num)),
    }))
    .filter((g) => g.nomes.length > 0);
}

function textoMarcacao(cond: string, faces: Array<{ face: OdontoFace; status: OdontoFaceStatus }>) {
  const nomeCond = cond && cond !== 'normal' ? (ODONTO_TOOLS.find((tool) => tool.key === cond)?.label || cond) : '';
  const facesTexto = gruposDeFaces(faces).map(([status, nomes]) => `${nomes.join(', ')} · ${status}`).join(' · ');
  return [nomeCond, facesTexto].filter(Boolean).join(' · ') || 'Marcado';
}

function getMedicamentosFromFicha(ficha: Record<string, unknown>): string[] {
  if (Array.isArray(ficha.medicamentos)) return ficha.medicamentos as string[];
  if (typeof ficha.medicamentos === 'string' && ficha.medicamentos.trim()) {
    return ficha.medicamentos.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizarFichaMedica(ficha: Record<string, unknown>): Record<string, unknown> {
  return {
    ...ficha,
    condicoes: getCondicoesFromFicha(ficha),
    medicamentos: getMedicamentosFromFicha(ficha),
  };
}

const QUAD_PERM = {
  sup: [[18,17,16,15,14,13,12,11], [21,22,23,24,25,26,27,28]],
  inf: [[48,47,46,45,44,43,42,41], [31,32,33,34,35,36,37,38]],
};
const QUAD_LEITE = {
  sup: [[55,54,53,52,51], [61,62,63,64,65]],
  inf: [[85,84,83,82,81], [71,72,73,74,75]],
};

// =============== ODONTOGRAMA — PNG 3D + Oclusal 2D ===============
// Cada dente usa imagem PNG realista + quadrado clássico de 5 faces

/** Returns the PNG src path for a given FDI tooth number. */
function toothPngSrc(num: number): string {
  const decade = Math.floor(num / 10);
  const arch = (decade === 1 || decade === 2 || decade === 5 || decade === 6) ? 'sup' : 'inf';
  return `/assets/dentes/dentadura-${arch}-${num}.png`;
}

// OCLUSAL: quadrado com X diagonal + quadrado central = 5 zonas trapezoidais/quadrada
// Todos os dentes têm o mesmo tamanho de quadrado (igual a referência)
const OCC_BOX = {
  outer: { x: 14, y: 14, w: 32, h: 32 },   // quadrado externo
  inner: { x: 24, y: 24, w: 12, h: 12 },   // quadrado central (zona Oclusal)
};

// Calcula os 5 polígonos do quadrado dividido em X
function getOcclusalZones() {
  const o = OCC_BOX.outer;
  const i = OCC_BOX.inner;
  // 4 cantos externos
  const TL = `${o.x},${o.y}`;
  const TR = `${o.x + o.w},${o.y}`;
  const BR = `${o.x + o.w},${o.y + o.h}`;
  const BL = `${o.x},${o.y + o.h}`;
  // 4 cantos internos (do quadrado central)
  const cTL = `${i.x},${i.y}`;
  const cTR = `${i.x + i.w},${i.y}`;
  const cBR = `${i.x + i.w},${i.y + i.h}`;
  const cBL = `${i.x},${i.y + i.h}`;
  return {
    V: `M ${TL} L ${TR} L ${cTR} L ${cTL} Z`,    // trapézio superior (Vestibular)
    D: `M ${TR} L ${BR} L ${cBR} L ${cTR} Z`,    // trapézio direito (Distal)
    L: `M ${BR} L ${BL} L ${cBL} L ${cBR} Z`,    // trapézio inferior (Lingual)
    M: `M ${BL} L ${TL} L ${cTL} L ${cBL} Z`,    // trapézio esquerdo (Mesial)
    O: `M ${cTL} L ${cTR} L ${cBR} L ${cBL} Z`,  // quadrado central (Oclusal)
  };
}

const OCC_ZONES = getOcclusalZones();

// Traço do quadrado das faces: contorno médio e divisões claras, para as cores das marcações aparecerem mais que a grade.
const STROKE = '#94a3b8';        // slate-400 (contorno)
const LINHA_FACE = '#cbd5e1';    // slate-300 (divisões internas)

const IMG_W = 52;
const IMG_H = 76;

// Vista lateral - imagem PNG realista com sinalização visual por condição
function ToothLateral({ num, state }: { num: number; state: ToothState; isUpper: boolean }) {
  const cond = state.cond;
  const isExtracao = cond === 'extracao';
  const isAusente = cond === 'ausente';
  const isCoroa = cond === 'coroa';
  const isImplante = cond === 'implante';
  const hasTratado = cond === 'normal' && Object.values(state.faces).some(v => v === 'tratado');

  // CSS filter — unified drop-shadow glow per condition
  let imgFilter: string | undefined;
  let imgOpacity = 1;

  if (isExtracao) {
    imgFilter = 'drop-shadow(0 0 6px #dc2626)';
    imgOpacity = 0.5;
  } else if (isAusente) {
    imgFilter = 'grayscale(1)';
    imgOpacity = 0.3;
  } else if (isCoroa) {
    imgFilter = 'drop-shadow(0 0 6px #f59e0b)';
  } else if (isImplante) {
    imgFilter = 'drop-shadow(0 0 6px #06b6d4)';
  } else if (hasTratado) {
    imgFilter = 'drop-shadow(0 0 6px #a855f7)';
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: IMG_W, height: IMG_H }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={toothPngSrc(num)}
        alt={`Dente ${num}`}
        draggable={false}
        width={IMG_W}
        height={IMG_H}
        className="w-full h-full object-contain pointer-events-none select-none mix-blend-multiply"
        style={{
          opacity: imgOpacity,
          filter: imgFilter,
        }}
      />
      {/* Extração ONLY: X vermelho sobreposto */}
      {isExtracao && (
        <svg className="absolute inset-0 pointer-events-none" width={IMG_W} height={IMG_H} viewBox={`0 0 ${IMG_W} ${IMG_H}`}>
          <g stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round">
            <line x1={10} y1={10} x2={IMG_W - 10} y2={IMG_H - 10} />
            <line x1={IMG_W - 10} y1={10} x2={10} y2={IMG_H - 10} />
          </g>
        </svg>
      )}
    </div>
  );
}

// Vista oclusal - quadrado dividido em X com 5 zonas (igual à referência)
function ToothOcclusal({ num, state, ferramenta, onApply, amplo }: { num: number; state: ToothState; ferramenta: string; onApply: (face: Face) => void; amplo?: boolean }) {
  const [hoverFace, setHoverFace] = useState<Face | null>(null);
  const cond = state.cond;
  const isAusente = cond === 'ausente';
  const tool = TOOLS.find(t => t.key === ferramenta);
  const previewColor = tool?.tipo === 'face' ? tool.color : null;
  const corContorno = cond === 'coroa' ? '#f59e0b' : cond === 'implante' ? '#0ea5e9' : STROKE;

  const o = OCC_BOX.outer;
  const i = OCC_BOX.inner;

  return (
    <div className="relative">
      {/* Tela de toque: recorta a margem do desenho, e o quadrado passa de 26px para 47px sem alargar o dente. */}
      <svg viewBox={amplo ? '11 11 38 38' : '0 0 60 60'} width={amplo ? 56 : 48} height={amplo ? 56 : 48} className={`${isAusente ? 'opacity-40' : ''} block`}>
        <rect x={o.x} y={o.y} width={o.w} height={o.h} rx="4" ry="4" fill="#ffffff"/>

        {/* 5 zonas clicáveis (4 trapézios + quadrado central) */}
        {(['V','D','L','M','O'] as Face[]).map(f => {
          const status = state.faces[f];
          const baseFill = status ? FACE_COLORS[status] : 'transparent';
          const isHover = hoverFace === f;
          const fill = isHover && previewColor ? previewColor : baseFill;
          const opacity = (baseFill === 'transparent' && !isHover) ? 0 : isHover && !status ? 0.45 : 0.92;
          return (
            <path key={f} d={OCC_ZONES[f]} fill={fill} fillOpacity={opacity}
              onClick={(e) => { e.stopPropagation(); onApply(f); }}
              onMouseEnter={() => setHoverFace(f)}
              onMouseLeave={() => setHoverFace(null)}
              className="cursor-pointer transition-opacity"/>
          );
        })}

        {/* Divisões: X dos cantos até o quadrado central */}
        <g stroke={LINHA_FACE} strokeWidth="0.8" fill="none" strokeLinecap="round" style={{pointerEvents:'none'}}>
          <line x1={o.x} y1={o.y} x2={i.x} y2={i.y}/>
          <line x1={o.x + o.w} y1={o.y} x2={i.x + i.w} y2={i.y}/>
          <line x1={o.x + o.w} y1={o.y + o.h} x2={i.x + i.w} y2={i.y + i.h}/>
          <line x1={o.x} y1={o.y + o.h} x2={i.x} y2={i.y + i.h}/>
          <rect x={i.x} y={i.y} width={i.w} height={i.h} rx="1"/>
        </g>

        {/* Contorno por cima das cores: coroa em âmbar, implante em azul, ausente tracejado. */}
        <rect x={o.x} y={o.y} width={o.w} height={o.h} rx="4" ry="4" fill="none" stroke={corContorno}
          strokeWidth={cond === 'coroa' || cond === 'implante' ? 1.8 : 1} strokeDasharray={isAusente ? '3 2' : undefined} style={{pointerEvents:'none'}}/>

        {cond === 'extracao' && <g stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" style={{pointerEvents:'none'}}><line x1={o.x+2} y1={o.y+2} x2={o.x+o.w-2} y2={o.y+o.h-2}/><line x1={o.x+o.w-2} y1={o.y+2} x2={o.x+2} y2={o.y+o.h-2}/></g>}
      </svg>
      {hoverFace && (
        <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white">
          #{num} · {nomeDaFace(hoverFace, num)}
        </div>
      )}
    </div>
  );
}

/** Número do dente; em destaque quando o dente tem alguma marcação, para achar rápido o que já foi anotado. */
function NumeroDente({ num, marcado }: { num: number; marcado: boolean }) {
  return (
    <div className={`rounded-full px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums ${marcado ? 'bg-neutral-900 text-white' : 'text-neutral-500'}`}>
      {num}
    </div>
  );
}

function Tooth({ num, state, ferramenta, onApply, isUpper, esquematico, toque, aoTocar }: { num: number; state: ToothState; ferramenta: string; onApply: (face: Face | null) => void; isUpper: boolean; esquematico?: boolean; toque?: boolean; aoTocar?: () => void }) {
  const marcado = state.cond !== 'normal' || Object.keys(state.faces).length > 0;
  const lateral = !esquematico && <ToothLateral num={num} state={state} isUpper={isUpper} />;
  const conteudo = isUpper ? (
    <>
      {lateral && <>{lateral}<div className="h-1"/></>}
      <ToothOcclusal num={num} state={state} ferramenta={ferramenta} onApply={(f) => onApply(f)} amplo/>
      <div className="mt-1"><NumeroDente num={num} marcado={marcado} /></div>
    </>
  ) : (
    <>
      <div className="mb-1"><NumeroDente num={num} marcado={marcado} /></div>
      <ToothOcclusal num={num} state={state} ferramenta={ferramenta} onApply={(f) => onApply(f)} amplo/>
      {lateral && <><div className="h-1"/>{lateral}</>}
    </>
  );
  // Celular: o dente inteiro é o alvo do toque e abre o painel do dente; as faces pequenas não recebem toque.
  if (aoTocar) {
    return (
      <button
        type="button"
        onClick={aoTocar}
        aria-label={`Dente ${num}, ${nomeDoDente(num)}`}
        className="flex w-[56px] shrink-0 select-none flex-col items-center rounded-lg py-0.5 transition-colors active:bg-neutral-100 [&_path]:pointer-events-none"
      >
        {conteudo}
      </button>
    );
  }
  return <div className="flex flex-col items-center select-none w-[56px] shrink-0">{conteudo}</div>;
}

const NOMES_PERMANENTE = ['', 'incisivo central', 'incisivo lateral', 'canino', '1º pré-molar', '2º pré-molar', '1º molar', '2º molar', '3º molar'];
const NOMES_DECIDUO = ['', 'incisivo central', 'incisivo lateral', 'canino', '1º molar', '2º molar'];

/** Nome do dente pela numeração FDI (ex.: 16 → "1º molar superior direito"). */
function nomeDoDente(num: number): string {
  const quadrante = Math.floor(num / 10);
  const posicao = num % 10;
  const deciduo = quadrante >= 5;
  const q = deciduo ? quadrante - 4 : quadrante;
  const nome = (deciduo ? NOMES_DECIDUO : NOMES_PERMANENTE)[posicao] || 'dente';
  const arcada = q === 1 || q === 2 ? 'superior' : 'inferior';
  const lado = q === 1 || q === 4 ? 'direito' : 'esquerdo';
  return `${nome} ${arcada} ${lado}${deciduo ? ' (de leite)' : ''}`;
}

/** Nome da face no dente certo: palatal em cima, lingual embaixo; incisal nos dentes da frente. */
function nomeDaFace(face: Face, num: number): string {
  const superior = [1, 2, 5, 6].includes(Math.floor(num / 10));
  if (face === 'L') return superior ? 'Palatal' : 'Lingual';
  if (face === 'O') return num % 10 <= 3 ? 'Incisal' : 'Oclusal';
  return FACE_LABELS[face];
}

const FERRAMENTAS_FACE = ODONTO_TOOLS.filter((t) => t.tipo === 'face');
const FERRAMENTAS_DENTE = ODONTO_TOOLS.filter((t) => t.tipo === 'cond');
// Centro de cada zona no desenho de 60×60, para a letra da face.
const CENTRO_FACE: Record<Face, [number, number]> = { V: [30, 18.6], D: [41.4, 30], L: [30, 41.4], M: [18.6, 30], O: [30, 30] };

/**
 * Painel do dente (celular). Mesma lógica do desktop — escolhe a ferramenta, toca na face —, só que com o dente
 * grande: faces de dedo, nome de cada face, condições do dente inteiro e setas para seguir para o próximo dente.
 */
function PainelDente({ num, sequencia, state, ferramenta, onFerramenta, onFace, onTodasFaces, onCondicao, onLimpar, onTratar, onTrocar, onFechar }: {
  num: number; sequencia: number[]; state: ToothState; ferramenta: string;
  onFerramenta: (key: string) => void; onFace: (face: Face) => void; onTodasFaces: () => void; onCondicao: (key: string) => void;
  onLimpar: () => void; onTratar: () => void; onTrocar: (num: number) => void; onFechar: () => void;
}) {
  const indice = sequencia.indexOf(num);
  const anterior = indice > 0 ? sequencia[indice - 1] : null;
  const proximo = indice >= 0 && indice < sequencia.length - 1 ? sequencia[indice + 1] : null;
  const ferramentaFace = FERRAMENTAS_FACE.find((t) => t.key === ferramenta) ?? FERRAMENTAS_FACE[1];
  const o = OCC_BOX.outer;
  const i = OCC_BOX.inner;
  const cond = state.cond;
  const facesMarcadas = (['V', 'M', 'O', 'D', 'L'] as Face[]).filter((f) => state.faces[f]);
  const temMarcacao = facesMarcadas.length > 0 || cond !== 'normal';
  const [ultimaFace, setUltimaFace] = useState<Face | null>(null);
  useEffect(() => setUltimaFace(null), [num]);

  const setaClasse = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 disabled:opacity-30';
  return (
    <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-200" aria-hidden />
      <div className="flex items-center gap-2">
        <button type="button" className={setaClasse} disabled={anterior === null} onClick={() => anterior !== null && onTrocar(anterior)} aria-label={anterior !== null ? `Dente anterior, ${anterior}` : 'Sem dente anterior'}>
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-base font-semibold tabular-nums text-neutral-900">Dente {num}</div>
          <div className="truncate text-xs text-neutral-500">{nomeDoDente(num)}</div>
        </div>
        <button type="button" className={setaClasse} disabled={proximo === null} onClick={() => proximo !== null && onTrocar(proximo)} aria-label={proximo !== null ? `Próximo dente, ${proximo}` : 'Sem próximo dente'}>
          <ChevronRight size={18} />
        </button>
        <button type="button" onClick={onFechar} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      {/* Dente grande: cada face com o nome por perto. Vestibular em cima, como na arcada. */}
      <div className="mt-3 flex items-center justify-center gap-3">
        <div className="relative flex h-[clamp(96px,20dvh,136px)] w-[52px] shrink-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={toothPngSrc(num)} alt="" draggable={false} className="h-full w-full select-none object-contain mix-blend-multiply" style={{ opacity: cond === 'ausente' ? 0.3 : cond === 'extracao' ? 0.5 : 1, filter: cond === 'ausente' ? 'grayscale(1)' : undefined }} />
        </div>
        <div className="grid shrink-0 grid-cols-[1.25rem_auto_1.25rem] grid-rows-[1.25rem_auto_1.25rem] items-center justify-items-center text-[11px] font-medium text-neutral-500">
          <span className="col-start-2 row-start-1">{nomeDaFace('V', num)}</span>
          <span className="col-start-1 row-start-2 [writing-mode:vertical-rl] rotate-180">{nomeDaFace('M', num)}</span>
          <svg viewBox="11 11 38 38" className={`col-start-2 row-start-2 block size-[clamp(120px,24dvh,168px)] touch-manipulation ${cond === 'ausente' ? 'opacity-40' : ''}`}>
            <rect x={o.x} y={o.y} width={o.w} height={o.h} rx="2.5" ry="2.5" fill="white" />
            {(['V', 'D', 'L', 'M', 'O'] as Face[]).map((f) => {
              const status = state.faces[f];
              return (
                <path key={f} d={OCC_ZONES[f]} fill={status ? FACE_COLORS[status] : 'transparent'} fillOpacity={status ? 0.9 : 1}
                  onClick={() => { onFace(f); setUltimaFace(f); }}
                  className="cursor-pointer active:opacity-70" aria-label={nomeDaFace(f, num)} role="button" />
              );
            })}
            <g stroke={LINHA_FACE} strokeWidth="0.45" fill="none" strokeLinecap="round" pointerEvents="none">
              <line x1={o.x} y1={o.y} x2={i.x} y2={i.y} />
              <line x1={o.x + o.w} y1={o.y} x2={i.x + i.w} y2={i.y} />
              <line x1={o.x + o.w} y1={o.y + o.h} x2={i.x + i.w} y2={i.y + i.h} />
              <line x1={o.x} y1={o.y + o.h} x2={i.x} y2={i.y + i.h} />
              <rect x={i.x} y={i.y} width={i.w} height={i.h} rx="0.6" />
            </g>
            <rect x={o.x} y={o.y} width={o.w} height={o.h} rx="2.5" ry="2.5" fill="none" pointerEvents="none"
              stroke={cond === 'coroa' ? '#f59e0b' : cond === 'implante' ? '#0ea5e9' : STROKE} strokeWidth={cond === 'coroa' || cond === 'implante' ? 1.1 : 0.6}
              strokeDasharray={cond === 'ausente' ? '1.6 1' : undefined} />
            {(['V', 'D', 'L', 'M', 'O'] as Face[]).map((f) => {
              const status = state.faces[f];
              return (
                <text key={f} x={CENTRO_FACE[f][0]} y={CENTRO_FACE[f][1]} textAnchor="middle" dominantBaseline="central" fontSize="3.6" fontWeight="600"
                  fill={status && status !== 'higido' ? '#fff' : '#94a3b8'} pointerEvents="none">
                  {f === 'O' && num % 10 <= 3 ? 'I' : f === 'L' && [1, 2, 5, 6].includes(Math.floor(num / 10)) ? 'P' : f}
                </text>
              );
            })}
            {cond === 'extracao' && (
              <g stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" pointerEvents="none">
                <line x1={o.x + 1} y1={o.y + 1} x2={o.x + o.w - 1} y2={o.y + o.h - 1} />
                <line x1={o.x + o.w - 1} y1={o.y + 1} x2={o.x + 1} y2={o.y + o.h - 1} />
              </g>
            )}
          </svg>
          <span className="col-start-3 row-start-2 [writing-mode:vertical-rl]">{nomeDaFace('D', num)}</span>
          <span className="col-start-2 row-start-3">{nomeDaFace('L', num)}</span>
        </div>
      </div>

      {/* O que está marcado neste dente (e o retorno do último toque). */}
      <div className="mt-2 flex min-h-[1.75rem] flex-wrap items-center justify-center gap-1.5" aria-live="polite">
        {!temMarcacao && <span className="text-xs text-neutral-400">{ultimaFace ? `${nomeDaFace(ultimaFace, num)} limpa.` : 'Sem marcação. Toque numa face para marcar.'}</span>}
        {cond !== 'normal' && (
          <span className="rounded-md bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">{ODONTO_TOOLS.find((t) => t.key === cond)?.label}</span>
        )}
        {facesMarcadas.map((f) => (
          <span key={f} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${ultimaFace === f ? 'bg-neutral-200 text-neutral-900' : 'bg-neutral-100 text-neutral-700'}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: FACE_COLORS[state.faces[f]!], boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
            {nomeDaFace(f, num)}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-neutral-900">Marcar nas faces</span>
        <button type="button" onClick={onTodasFaces} className="-mr-2 px-2 py-1 text-xs font-medium text-neutral-600 underline-offset-2 hover:underline">
          {ferramentaFace.key === 'higido' ? 'Limpar todas as faces' : `${ferramentaFace.label} em todas`}
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {FERRAMENTAS_FACE.map((t) => (
          // Cor como faixa embaixo (não bolinha ao lado): sobra largura para "Restauração" inteiro em 320px.
          <button key={t.key} type="button" aria-pressed={ferramentaFace.key === t.key} onClick={() => onFerramenta(t.key)}
            className={`inline-flex h-10 min-w-0 items-center justify-center overflow-hidden rounded-md border px-0.5 text-[11px] font-medium tracking-tight ${ferramentaFace.key === t.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}
            style={{ boxShadow: `inset 0 -3px 0 ${t.key === 'higido' ? '#e5e5e5' : t.color}` }}>
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 text-xs font-semibold text-neutral-900">Dente inteiro</div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {FERRAMENTAS_DENTE.map((t) => {
          const ativo = cond === t.key;
          return (
            <button key={t.key} type="button" aria-pressed={ativo} onClick={() => onCondicao(t.key)}
              className={`inline-flex h-10 min-w-0 items-center justify-center gap-0.5 overflow-hidden rounded-md border px-0.5 text-[11px] font-medium tracking-tight ${ativo ? 'text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}
              style={ativo ? { background: t.color, borderColor: t.color } : { boxShadow: `inset 0 -3px 0 ${t.color}` }}>
              {ativo && <Check size={12} className="shrink-0" />}
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <button type="button" onClick={onLimpar} disabled={!temMarcacao} aria-label={`Limpar dente ${num}`}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 disabled:opacity-30">
          <Eraser size={16} />
        </button>
        <button type="button" onClick={onTratar} disabled={!temMarcacao}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-800 disabled:opacity-40">
          <Plus size={14} /> Tratar
        </button>
        <button type="button" onClick={proximo !== null ? () => onTrocar(proximo) : onFechar}
          className="inline-flex h-11 items-center justify-center gap-1 rounded-lg bg-neutral-900 text-sm font-medium text-white">
          {proximo !== null ? <>Próximo <ChevronRight size={15} /></> : 'Concluir'}
        </button>
      </div>
    </div>
  );
}

/** Lê dados básicos do paciente do cache da lista (sessionStorage) para pintar a casca instantaneamente. */
function readPacienteCache(id: string): any | null {
  if (!id || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem('ortus:pacientes-lista');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items: any[] };
    return (parsed.items || []).find((p) => String(p.id) === String(id)) || null;
  } catch { return null; }
}

export default function PacienteDetalhe() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? (params.id[0] ?? '') : '';
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get('tab') || 'dados';
  const initialTab = rawTab === 'evolucao' ? 'tratamentos' : rawTab;
  const { clinics: clinicasContexto } = useClinica();
  // Bootstrap síncrono: se já temos o paciente em cache (veio da lista), pinta a casca já
  const pacienteCache = useRef(readPacienteCache(id));
  const [loading, setLoading] = useState(pacienteCache.current === null);
  const { showAlert, showConfirm } = useCustomAlert();
  
  const [abaAtiva, setAbaAtiva] = useState(initialTab === 'evolucao' ? 'tratamentos' : initialTab);
  const [anamnesePreview, setAnamnesePreview] = useState<any>(null);
  const [modalAnamnese, setModalAnamnese] = useState(false);
  const [visualDocs, setVisualDocs] = useState<'bloco' | 'lista'>('bloco');
  const [ordemDocs, setOrdemDocs] = useState<{ campo: 'nome' | 'data' | 'tamanho'; dir: 'asc' | 'desc' }>({ campo: 'data', dir: 'desc' });
  const [docAberto, setDocAberto] = useState<{ nome: string; url: string; isImg: boolean; isPdf: boolean } | null>(null);
  const [historicoSel, setHistoricoSel] = useState<string | null>(null);
  const [buscaHistorico, setBuscaHistorico] = useState('');
  useEffect(() => {
      if (!historicoSel) return;
      document.getElementById(`linha-${historicoSel}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [historicoSel]);

  // ===== Celular: a página rola inteira e a faixa de abas fica presa no topo =====
  const raizRef = useRef<HTMLDivElement | null>(null);
  const cabecalhoRef = useRef<HTMLDivElement | null>(null);
  const abasRef = useRef<HTMLElement | null>(null);
  const abaJaCentralizada = useRef(false);
  const jaTrocouDeAba = useRef(false);

  // A faixa de abas rola de lado: ao abrir (inclusive por ?tab=) e ao trocar, a aba ativa fica à vista.
  // `loading` entra nas dependências porque a faixa só existe depois que o esqueleto sai.
  useEffect(() => {
      const faixa = abasRef.current;
      const ativa = faixa?.querySelector<HTMLElement>('[aria-current="true"]');
      if (!faixa || !ativa) return;
      // Mexe só no scrollLeft da faixa: scrollIntoView rolaria a página junto.
      const centro = ativa.getBoundingClientRect().left - faixa.getBoundingClientRect().left + faixa.scrollLeft - (faixa.clientWidth - ativa.offsetWidth) / 2;
      faixa.scrollTo({ left: Math.max(0, centro), behavior: abaJaCentralizada.current ? 'smooth' : 'auto' });
      abaJaCentralizada.current = true;
  }, [abaAtiva, loading]);

  // Na chegada a ficha abre do topo. Nas trocas de aba com a página rolada, recua só até a faixa de abas,
  // para o conteúdo novo começar do início sem esconder as abas.
  useEffect(() => {
      const rolagem = rolagemDaPagina(raizRef.current);
      const limite = jaTrocouDeAba.current ? (cabecalhoRef.current?.offsetHeight ?? 0) : 0;
      jaTrocouDeAba.current = true;
      if (rolagem && rolagem.scrollTop > limite) rolagem.scrollTop = limite;
  }, [abaAtiva]);

  // Abaixo de 1024px a ficha é usada com o dedo: o odontograma não encolhe para caber, rola de lado na própria caixa.
  const [telaToque, setTelaToque] = useState(false);
  useEffect(() => {
      const consulta = window.matchMedia('(max-width: 1023px)');
      const aplicar = () => setTelaToque(consulta.matches);
      aplicar();
      consulta.addEventListener('change', aplicar);
      return () => consulta.removeEventListener('change', aplicar);
  }, []);

  // Celular (abaixo de 640px): as faces na arcada ficam pequenas para o dedo; tocar no dente abre o painel do dente.
  const [telaCelular, setTelaCelular] = useState(false);
  useEffect(() => {
      const consulta = window.matchMedia('(max-width: 639px)');
      const aplicar = () => setTelaCelular(consulta.matches);
      aplicar();
      consulta.addEventListener('change', aplicar);
      return () => consulta.removeEventListener('change', aplicar);
  }, []);
  const [denteAberto, setDenteAberto] = useState<number | null>(null);
  useEffect(() => { if (!telaCelular) setDenteAberto(null); }, [telaCelular]);

  const previewsDocumento = useRef<string[]>([]);
  const odontogramaFromServer = useRef(true);
  const fichaFromServer = useRef(true);
  const prontuarioIdCarregado = useRef<string | null>(null);

  // Revalida quando o Action Hub registrar tratamento in-place neste paciente
  useEffect(() => {
      function handle(event: Event) {
          const detail = (event as CustomEvent<{ pacienteId?: string | number }>).detail;
          if (!detail || String(detail.pacienteId) === String(id)) {
              carregar({ silent: true });
          }
      }
      window.addEventListener('ortus:tratamento-changed', handle as EventListener);
      return () => window.removeEventListener('ortus:tratamento-changed', handle as EventListener);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); 
  const [modoEdicao, setModoEdicao] = useState(false); 
  const [modalDoc, setModalDoc] = useState(false); 
  const [tipoDoc, setTipoDoc] = useState<'receita' | 'atestado' | 'contrato'>('receita'); 
  const [textoDoc, setTextoDoc] = useState('');
  const [modelosDocumentos, setModelosDocumentos] = useState<{ id: string; tipo: string; nome: string; conteudo: string }[]>([]);
  const [modeloDocId, setModeloDocId] = useState('');

  const [modalReceber, setModalReceber] = useState<any>(null);
  const [modalDebitoManual, setModalDebitoManual] = useState(false);
  const [formDebito, setFormDebito] = useState({ descricao: '', valor: '', agendamentosMarcados: [] as number[], tratamentosMarcados: [] as string[] });
  const [debitoOpcoes, setDebitoOpcoes] = useState<{ agendamentos: any[]; tratamentos: any[] }>({ agendamentos: [], tratamentos: [] });
  const [salvandoDebito, setSalvandoDebito] = useState(false);
  const [partesPagamento, setPartesPagamento] = useState<Array<{ key: string; forma: FormaRecebimento; parcelas: number; valor: string }>>([]);
  const [taxasRecebimento, setTaxasRecebimento] = useState<TaxaMaquininha[]>([]);
  const [repassarTaxas, setRepassarTaxas] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  
  const [form, setForm] = useState<any>(() => pacienteCache.current || {});
  const [ficha, setFicha] = useState<any>({}); 
  const [historico, setHistorico] = useState<any[]>([]);
  const [evolucoes, setEvolucoes] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [planos, setPlanos] = useState<any[]>([]);

  // Odontograma + Tratamentos (estado unificado via Zustand — 2D + 3D)
  const teeth = useOdontogramStore((s) => s.teeth);
  const ferramenta = useOdontogramStore((s) => s.activeTool);
  const setFerramenta = useOdontogramStore((s) => s.setActiveTool);
  const loadOdontogramFromLegacy = useOdontogramStore((s) => s.loadFromLegacy);
  const getOdontogramLegacySnapshot = useOdontogramStore((s) => s.getLegacySnapshot);
  const applyOdontogramTool = useOdontogramStore((s) => s.applyTool);
  const resetOdontogramTooth = useOdontogramStore((s) => s.resetTooth);
  const resetOdontogramAll = useOdontogramStore((s) => s.resetAll);
  const setOdontogramToothStatus = useOdontogramStore((s) => s.setToothStatus);
  const normalizeOdontogramStorage = useOdontogramStore((s) => s.normalizeStorage);
  const odontograma = useMemo(() => selectLegacyOdontogram(teeth), [teeth]);
  const [tratamentos, setTratamentos] = useState<any[]>([]);
  const [tipoArcada, setTipoArcada] = useState<'permanente' | 'leite'>('permanente');
  const [savingOdo, setSavingOdo] = useState(false);
  const [visaoOdonto, setVisaoOdonto] = useState<'anatomica' | 'esquematica' | 'livre'>('anatomica');
  const [textoOdontogramaLivre, setTextoOdontogramaLivre] = useState('');
  const [modalTrat, setModalTrat] = useState(false);
  const [salvandoTrat, setSalvandoTrat] = useState(false);
  const [tratEdit, setTratEdit] = useState<any>({ id: null, dente: '', procedimento: '', data: new Date().toISOString().split('T')[0], status: 'concluido', valor: '', observacoes: '', agendarNaAgenda: false, horaAgendamento: '09:00', pagamentoPendente: false, dentesSelecionados: [] as string[], atualizarOdontograma: false });
  const marcacoesOdonto = useMemo(() => listarMarcacoesOdontograma(odontograma), [odontograma]);
  const marcacoesPendentes = useMemo(() => marcacoesOdonto.filter((m) => m.precisaTratamento), [marcacoesOdonto]);
  const [mostrar3D, setMostrar3D] = useState(false);
  const [odontoLargura, setOdontoLargura] = useState(0);
  // Altura livre para a arcada no desktop (a aba ocupa a tela inteira e não rola): da caixa até o fim da aba,
  // menos o espaço reservado à lista de marcações. 0 = sem limite (telas menores rolam a página).
  const [odontoAlturaLivre, setOdontoAlturaLivre] = useState(0);
  const odontoObserverRef = useRef<ResizeObserver | null>(null);
  const odontoCaixaRef = useRef<HTMLDivElement | null>(null);
  const medirOdonto = useCallback((el: HTMLDivElement | null) => {
    odontoCaixaRef.current = el;
    odontoObserverRef.current?.disconnect();
    odontoObserverRef.current = null;
    if (!el) return;
    const raiz = el.closest<HTMLElement>('[data-odonto-raiz]');
    const medir = () => {
      const estilo = getComputedStyle(el);
      setOdontoLargura(el.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight));
      if (!raiz || !window.matchMedia('(min-width: 1024px)').matches) { setOdontoAlturaLivre(0); return; }
      // Cartão de Marcações: título + umas três linhas à vista; o resto rola dentro dele.
      const RESERVA_LISTA = 210;
      const livre = raiz.getBoundingClientRect().bottom - el.getBoundingClientRect().top - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom) - RESERVA_LISTA;
      setOdontoAlturaLivre(Math.max(0, Math.round(livre)));
    };
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    if (raiz) observer.observe(raiz);
    odontoObserverRef.current = observer;
  }, []);

  // Tela de toque: a arcada rola de lado e abre centrada na linha média, com os incisivos à vista.
  // `loading` entra nas dependências porque a caixa só existe depois que o esqueleto sai.
  useEffect(() => {
    const caixa = odontoCaixaRef.current;
    if (!telaToque || !caixa) return;
    caixa.scrollLeft = Math.max(0, (caixa.scrollWidth - caixa.clientWidth) / 2);
  }, [telaToque, abaAtiva, tipoArcada, visaoOdonto, loading]);

  // ANAMNESE
  const [modelosAnamnese, setModelosAnamnese] = useState<ModeloAnamnese[]>([]);
  const [anamneseAtual, setAnamneseAtual] = useState<any>({
      id: null, modelo_id: '', data: new Date().toISOString().split('T')[0],
      preenchido_por: 'profissional', respostas: {} as Record<string, RespostaAnamnese>,
  });
  const [anamnesesAnteriores, setAnamnesesAnteriores] = useState<any[]>([]);
  const [linkAnamnesePaciente, setLinkAnamnesePaciente] = useState<{ url: string; expires_at: string } | null>(null);
  const [gerandoLinkAnamnese, setGerandoLinkAnamnese] = useState(false);

  // DOCUMENTOS
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [registrosDebito, setRegistrosDebito] = useState<any[]>([]);
  useEffect(() => {
      let vivo = true;
      // Offline os arquivos não estão acessíveis: evita uma enxurrada de downloads que vão falhar.
      if (semConexao()) return;
      const pendentes = documentos.filter((d) => (documentoEhImagem(d) || documentoEhPdf(d)) && !d.previewVista);
      if (!pendentes.length) return;
      (async () => {
          const porId = new Map<string, { url?: string; vista: VistaDocumento }>();
          await Promise.all(pendentes.map(async (d) => {
              try {
                  const blob = await blobDoDocumento(d);
                  if (!vivo) return;
                  // A miniatura segue o tipo do Blob montado aqui; o isPdf/isImg da linha só decide se vale tentar.
                  const vista = vistaDoDocumento(blob.type);
                  if (vista === 'baixar') {
                      porId.set(String(d.id), { vista });
                      return;
                  }
                  const url = URL.createObjectURL(blob);
                  previewsDocumento.current.push(url);
                  porId.set(String(d.id), { url, vista });
              } catch {
                  porId.set(String(d.id), { vista: 'baixar' });
              }
          }));
          if (!vivo || porId.size === 0) return;
          setDocumentos((atual) => atual.map((d) => {
              const previa = porId.get(String(d.id));
              return previa ? { ...d, previewUrl: previa.url, previewVista: previa.vista } : d;
          }));
      })();
      return () => { vivo = false; };
      // blobDoDocumento é declaração no corpo do componente
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentos]);
  useEffect(() => () => {
      previewsDocumento.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // HARMONIZAÇÃO OROFACIAL (HOF)
  type HofMarcacao = { id:string; x:number; y:number; texto:string; data:string; tipo:string; dosagem:string; unidade:string; produto:string; sessao:string };
  const HOF_TIPOS = [
      { key: 'toxina',         label: 'Toxina Botulínica', color: '#ef4444', unidadePadrao: 'U',  ring: 'ring-red-300' },
      { key: 'preenchimento',  label: 'Preenchimento',     color: '#3b82f6', unidadePadrao: 'mL', ring: 'ring-blue-300' },
      { key: 'labial',         label: 'Preenchimento labial', color: '#db2777', unidadePadrao: 'mL', ring: 'ring-pink-300' },
      { key: 'rino',           label: 'Rinomodelação',     color: '#0891b2', unidadePadrao: 'mL', ring: 'ring-cyan-300' },
      { key: 'olheira',        label: 'Olheiras',          color: '#4f46e5', unidadePadrao: 'mL', ring: 'ring-indigo-300' },
      { key: 'mento',          label: 'Mentoplastia',      color: '#92400e', unidadePadrao: 'mL', ring: 'ring-amber-300' },
      { key: 'mandibula',      label: 'Contorno mandibular', color: '#ca8a04', unidadePadrao: 'mL', ring: 'ring-yellow-300' },
      { key: 'papada',         label: 'Lipo de papada',    color: '#ea580c', unidadePadrao: 'mL', ring: 'ring-orange-300' },
      { key: 'bioestimulador', label: 'Bioestimulador',    color: '#10b981', unidadePadrao: 'mL', ring: 'ring-emerald-300' },
      { key: 'fios',           label: 'Fios de PDO',       color: '#f59e0b', unidadePadrao: 'un', ring: 'ring-amber-300' },
      { key: 'skinbooster',    label: 'Skinbooster',       color: '#0f766e', unidadePadrao: 'mL', ring: 'ring-teal-300' },
      { key: 'peeling',        label: 'Peeling',           color: '#8b5cf6', unidadePadrao: 'mL', ring: 'ring-violet-300' },
      { key: 'microagulhamento', label: 'Microagulhamento', color: '#c026d3', unidadePadrao: 'sess', ring: 'ring-fuchsia-300' },
      { key: 'outro',          label: 'Outro',             color: '#64748b', unidadePadrao: '',   ring: 'ring-slate-300' },
  ];
  const HOF_RETORNO: Record<string, { meses: number; label: string }> = {
      toxina: { meses: 5, label: '4-6 meses' }, preenchimento: { meses: 14, label: '12-18 meses' },
      labial: { meses: 12, label: '9-12 meses' }, rino: { meses: 12, label: '12 meses' },
      olheira: { meses: 12, label: '12 meses' }, mento: { meses: 14, label: '12-18 meses' },
      mandibula: { meses: 14, label: '12-18 meses' }, papada: { meses: 24, label: 'sessões' },
      bioestimulador: { meses: 18, label: '18-24 meses' }, fios: { meses: 12, label: '12 meses' },
      skinbooster: { meses: 6, label: '4-6 meses' }, peeling: { meses: 2, label: '1-3 meses' },
      microagulhamento: { meses: 4, label: '3-6 meses' },
  };
  type HofFoto = { id: string; sessao: string; angulo: string; dataUrl: string; storagePath?: string; criado_em: string };
  const [marcacoesHof, setMarcacoesHof] = useState<HofMarcacao[]>([]);
  const [hofFotos, setHofFotos] = useState<HofFoto[]>([]);
  const [hofPopover, setHofPopover] = useState<{x:number; y:number; open:boolean}>({x:0, y:0, open:false});
  const [hofTipoAtivo, setHofTipoAtivo] = useState('toxina');
  const [hofTexto, setHofTexto] = useState('');
  const [hofDosagem, setHofDosagem] = useState('');
  const [hofProduto, setHofProduto] = useState('');
  const [hofSessaoAtiva, setHofSessaoAtiva] = useState(new Date().toISOString().split('T')[0]);
  const [faceHofAtiva, setFaceHofAtiva] = useState<'feminina' | 'masculina'>('feminina');
  const [savingHof, setSavingHof] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState<string | null>(null);
  const [hofModo, setHofModo] = useState<'visualizar' | 'alterar'>('visualizar');
  const [hofVista, setHofVista] = useState<'mapa' | 'demo' | 'frontal'>('mapa');
  const [agendaHof, setAgendaHof] = useState<{ procedimento: string; observacoes: string; data?: string } | null>(null);
  const hofSurfaceRef = useRef<HTMLDivElement | null>(null);
  // objectURLs de foto de HOF criados nesta aba a partir do arquivo; só eles entram na impressão.
  const urlsHofDaSessao = useRef(new Set<string>());
  function urlHofDaSessao(blob: Blob) {
      const url = URL.createObjectURL(blob);
      urlsHofDaSessao.current.add(url);
      return url;
  }

  async function comprimirImagem(file: File, maxDim = 1200, qualidade = 0.8): Promise<Blob> {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
              const img = new Image();
              img.onload = () => {
                  let { width, height } = img;
                  if (width > maxDim || height > maxDim) {
                      const ratio = Math.min(maxDim / width, maxDim / height);
                      width = Math.round(width * ratio);
                      height = Math.round(height * ratio);
                  }
                  const canvas = document.createElement('canvas');
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d')!;
                  ctx.drawImage(img, 0, 0, width, height);
                  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao comprimir')), 'image/jpeg', qualidade);
              };
              img.onerror = () => reject(new Error('Falha ao carregar imagem'));
              img.src = reader.result as string;
          };
          reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
          reader.readAsDataURL(file);
      });
  }

  // DEBITOS
  const [debitos, setDebitos] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    // Silencioso se já carregamos esse id OU se a casca já foi pintada via cache da lista
    const jaTemDados = prontuarioIdCarregado.current === id || pacienteCache.current !== null;
    carregar({ silent: jaTemDados });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => { useOdontogramStore.getState().resetAll(); };
  }, [id]);

  useEffect(() => {
    normalizeOdontogramStorage();
  }, [normalizeOdontogramStorage]);

  useEffect(() => {
      if (!form.clinica_id) { setPlanos([]); return; }
      let ativo = true;
      (async () => {
          const modo = await modoDados();
          if (modo === 'local') {
              // Planos/convênios não fazem parte do espelho local: mantém ao menos o convênio vinculado.
              if (ativo) setPlanos(form.plano_id ? [{ id: String(form.plano_id), nome: 'Convênio' }] : []);
              return;
          }
          tabelas.from('planos').select('id, nome, tipo').eq('clinica_id', form.clinica_id).eq('ativo', true).order('nome')
              .then(({ data }) => { if (ativo) setPlanos(data || []); });
      })();
      return () => { ativo = false; };
  }, [form.clinica_id, form.plano_id]);

  const menorDeIdade = isMenorDeIdade(form.data_nascimento);
  const [responsavelAberto, setResponsavelAberto] = useState(true);
  const [cpfEncontrado, setCpfEncontrado] = useState<{ id: string; nome: string } | null>(null);
  const [enviandoFotoPerfil, setEnviandoFotoPerfil] = useState(false);
  const fotoPaciente = useFotoPaciente(id, form.foto_url);

  async function buscarPacientePorCpf(cpf: string) {
      if (!cpfValido(cpf)) { setCpfEncontrado(null); return; }
      try {
          const modo = await modoDados();
          let encontrados: Array<{ id: string | number; nome?: string | null }> = [];
          if (modo === 'local') {
              encontrados = await listar<{ id: string | number; nome?: string | null }>('pacientes', {
                  filtros: [{ col: 'cpf', op: 'in', valor: variantesCpf(cpf) }],
                  limite: 5,
              });
          } else {
              const { data } = await tabelas.from('pacientes').select('id, nome, cpf').in('cpf', variantesCpf(cpf)).limit(5);
              encontrados = (data || []) as Array<{ id: string | number; nome?: string | null }>;
          }
          const outro = encontrados.find((p) => String(p.id) !== String(id));
          setCpfEncontrado(outro ? { id: String(outro.id), nome: outro.nome || 'Paciente' } : null);
      } catch {
          setCpfEncontrado(null);
      }
  }

  async function trocarFotoPaciente(arquivo?: File) {
      if (!arquivo) return;
      const modo = await modoDados();
      if (modo === 'local' && semConexao()) {
          await showAlert('Sem internet: a foto de perfil não pode ser enviada agora. Os demais dados da ficha continuam disponíveis offline.', { type: 'warning' });
          return;
      }
      setEnviandoFotoPerfil(true);
      try {
          const blob = await prepararFotoPaciente(arquivo);
          // A foto fica privada: foto_url guarda o caminho interno com a versão, e a tela lê pela rota autenticada.
          const fotoUrl = await enviarFotoPaciente(String(id), blob);
          if (modo === 'local') {
              await atualizar('pacientes', String(id), { foto_url: fotoUrl });
          } else {
              const { error: updErr } = await tabelas.from('pacientes').update({ foto_url: fotoUrl }).eq('id', id);
              if (updErr) throw updErr;
          }
          guardarFotoPaciente(String(id), fotoUrl, blob);
          setForm((atual: any) => ({ ...atual, foto_url: fotoUrl }));
      } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : '';
          await showAlert(
              modo === 'local'
                  ? 'Não foi possível enviar a foto de perfil. O envio precisa de internet; o restante da ficha permanece salvo localmente.'
                  : mensagem || 'Não foi possível salvar a foto.',
              { type: 'error' },
          );
      } finally {
          setEnviandoFotoPerfil(false);
      }
  }

  function caminhoBucket(url?: string | null, storagePath?: string | null) {
      return extrairCaminhoArquivo(url, storagePath);
  }

  function fotosHofParaSalvar(fotos: HofFoto[]) {
      return fotos.map((f) => ({
          id: f.id,
          sessao: f.sessao,
          angulo: f.angulo,
          storagePath: caminhoBucket(f.dataUrl, f.storagePath) || undefined,
          criado_em: f.criado_em,
      }));
  }

  async function hidratarHofFotos(fotos: HofFoto[]) {
      return Promise.all(fotos.map(async (f) => {
          const path = caminhoBucket(f.dataUrl, f.storagePath);
          // dataUrl que veio do banco nunca vale como imagem: a foto sai só do arquivo, pela rota autenticada.
          if (!path) return { ...f, dataUrl: '' };
          try {
              const data = await baixarArquivoClinica(path);
              return { ...f, storagePath: path, dataUrl: urlHofDaSessao(data) };
          } catch {
              return { ...f, storagePath: path, dataUrl: '' };
          }
      }));
  }

  // ===== Compatibilidade nuvem x banco local =====
  async function mapaProfissionais(ids: number[]): Promise<Map<number, string>> {
      const mapa = new Map<number, string>();
      const unicos = Array.from(new Set(ids.filter((valor) => Number.isFinite(valor) && valor !== 0)));
      if (!unicos.length) return mapa;
      try {
          const lista = await listar<{ id: number; nome: string }>('profissionais', {
              filtros: [{ col: 'id', op: 'in', valor: unicos }],
          });
          for (const profissional of lista) mapa.set(Number(profissional.id), String(profissional.nome || ''));
      } catch {
          /* tabela de referência ainda não sincronizada */
      }
      return mapa;
  }

  async function carregarPacienteCompat(): Promise<{ data: Record<string, unknown> | null }> {
      const modo = await modoDados();
      if (modo === 'local') {
          const linhas = await listar<Record<string, unknown>>('pacientes', {
              filtros: [{ col: 'id', op: 'eq', valor: String(id) }],
              limite: 1,
          });
          return { data: linhas[0] ?? null };
      }
      const { data } = await tabelas.from('pacientes').select('*').eq('id', id).single();
      return { data: (data as Record<string, unknown> | null) ?? null };
  }

  async function carregarHistoricoCompat(): Promise<Record<string, unknown>[]> {
      const modo = await modoDados();
      if (modo === 'local') {
          const historico = await listar<Record<string, unknown>>('agendamentos', {
              filtros: [{ col: 'paciente_id', op: 'eq', valor: String(id) }],
              ordem: [{ col: 'data_hora', asc: false }],
          });
          const nomes = await mapaProfissionais(historico.map((linha) => Number(linha.profissional_id)));
          return historico.map((linha) => {
              const nome = nomes.get(Number(linha.profissional_id));
              return nome ? { ...linha, profissionais: { nome } } : linha;
          });
      }
      const { data } = await tabelas.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false });
      return (data || []) as Record<string, unknown>[];
  }

  async function carregarRegistrosDebitoCompat(): Promise<Record<string, unknown>[]> {
      const modo = await modoDados();
      if (modo === 'local') {
          return listar<Record<string, unknown>>('paciente_debitos', {
              filtros: [{ col: 'paciente_id', op: 'eq', valor: String(id) }],
          });
      }
      const { data } = await tabelas.from('paciente_debitos').select('*').eq('paciente_id', id);
      return (data || []) as Record<string, unknown>[];
  }

  async function listarDebitosCompat(pacienteId: string): Promise<DebitoPaciente[]> {
      const modo = await modoDados();
      if (modo === 'local') {
          const [manuais, fiados] = await Promise.all([
              listar<Record<string, unknown>>('paciente_debitos', {
                  filtros: [
                      { col: 'paciente_id', op: 'eq', valor: pacienteId },
                      { col: 'status', op: 'eq', valor: 'pendente' },
                  ],
                  ordem: [{ col: 'created_at', asc: false }],
              }),
              listar<Record<string, unknown>>('agendamentos', {
                  filtros: [
                      { col: 'paciente_id', op: 'eq', valor: pacienteId },
                      { col: 'status', op: 'eq', valor: 'fiado' },
                  ],
                  ordem: [{ col: 'data_hora', asc: false }],
              }),
          ]);
          const itens: DebitoPaciente[] = [];
          for (const d of manuais) {
              itens.push({
                  id: d.id as string | number,
                  origem: 'manual',
                  descricao: String(d.descricao || ''),
                  valor: Number(d.valor) || 0,
                  status: d.status === 'pago' ? 'pago' : 'pendente',
                  data_pagamento: (d.data_pagamento as string) || null,
                  created_at: (d.created_at as string) || null,
                  agendamento_id: typeof d.agendamento_id === 'number' ? d.agendamento_id : null,
                  tratamento_id: d.tratamento_id == null ? null : String(d.tratamento_id),
              });
          }
          const nomesProfissionais = await mapaProfissionais(fiados.map((linha) => Number(linha.profissional_id)));
          for (const a of fiados) {
              if (a.tipo_registro === 'debito_manual' || a.observacoes === 'Débito manual') continue;
              const agendamentoId = typeof a.id === 'number' ? a.id : Number(a.id);
              if (itens.some((i) => i.origem === 'agendamento' && i.agendamento_id === agendamentoId)) continue;
              const nomeProfissional = nomesProfissionais.get(Number(a.profissional_id));
              itens.push({
                  id: `ag_${agendamentoId}`,
                  origem: 'agendamento',
                  descricao: String(a.procedimento || 'Atendimento'),
                  valor: Number(a.valor_final ?? a.valor) || 0,
                  status: 'pendente',
                  agendamento_id: agendamentoId,
                  profissionais: nomeProfissional ? { nome: nomeProfissional } : null,
                  data_hora: (a.data_hora as string) || null,
                  created_at: (a.data_hora as string) || null,
              });
          }
          return itens;
      }
      return listarDebitosPaciente(pacienteId);
  }

  async function listarOpcoesDebitoCompat(pacienteId: string): Promise<{ agendamentos: Record<string, unknown>[]; tratamentos: Record<string, unknown>[] }> {
      const modo = await modoDados();
      if (modo === 'local') {
          const [ags, trats] = await Promise.all([
              listar<Record<string, unknown>>('agendamentos', {
                  filtros: [
                      { col: 'paciente_id', op: 'eq', valor: pacienteId },
                      { col: 'status', op: 'neq', valor: 'fiado' },
                      { col: 'status', op: 'neq', valor: 'cancelado' },
                  ],
                  ordem: [{ col: 'data_hora', asc: false }],
              }),
              listar<Record<string, unknown>>('paciente_tratamentos', {
                  filtros: [
                      { col: 'paciente_id', op: 'eq', valor: pacienteId },
                      { col: 'status', op: 'in', valor: ['concluido', 'andamento'] },
                  ],
                  ordem: [{ col: 'data', asc: false }],
              }),
          ]);
          const agendamentos = ags.filter((a) => (
              (a.tipo_registro == null || a.tipo_registro === 'agenda')
              && a.observacoes !== 'Débito manual'
          ));
          const tratamentos = trats.map((t) => ({
              id: String(t.id),
              procedimento: String(t.procedimento || ''),
              valor: Number(t.valor) || 0,
              data: (t.data as string) || null,
              status: String(t.status || ''),
          }));
          return { agendamentos, tratamentos };
      }
      return listarOpcoesMarcarNaoPago(pacienteId);
  }

  async function criarDebitoManualCompat(input: {
      paciente_id: string | number;
      clinica_id: string | number;
      descricao: string;
      valor: number;
      agendamento_id?: number | null;
      tratamento_id?: string | null;
  }): Promise<Record<string, unknown>> {
      const modo = await modoDados();
      if (modo === 'local') {
          return inserir<Record<string, unknown>>('paciente_debitos', {
              paciente_id: input.paciente_id,
              clinica_id: input.clinica_id,
              descricao: input.descricao.trim(),
              valor: input.valor,
              agendamento_id: input.agendamento_id || null,
              tratamento_id: input.tratamento_id || null,
              status: 'pendente',
          });
      }
      return criarDebitoManual(input);
  }

  async function marcarAgendamentoNaoPagoCompat(agendamentoId: number): Promise<void> {
      const modo = await modoDados();
      if (modo === 'local') {
          const salvo = await atualizar('agendamentos', agendamentoId, { status: 'fiado' });
          if (!salvo) throw new Error('Agendamento não encontrado no banco local.');
          return;
      }
      await marcarAgendamentoNaoPago(agendamentoId);
  }

  async function receberDebitoCompat(
      debito: DebitoPaciente & { clinica_id?: string | number },
      taxaId?: string,
      taxas?: TaxaMaquininha[],
      partes?: ParteRecebimento[],
  ): Promise<{ valorLiquido: number; comissaoLancamentos: number }> {
      const modo = await modoDados();
      if (modo === 'local') {
          if (debito.origem === 'manual') {
              const salvo = await atualizar('paciente_debitos', debito.id, { status: 'pago', data_pagamento: new Date().toISOString() });
              if (!salvo) throw new Error('Débito não encontrado no banco local.');
              return { valorLiquido: debito.valor, comissaoLancamentos: 0 };
          }
          const agendamentoId = debito.agendamento_id ?? (
              typeof debito.id === 'string' && debito.id.startsWith('ag_') ? Number(debito.id.slice(3)) : Number(debito.id)
          );
          const salvo = await atualizar('agendamentos', agendamentoId, {
              status: 'concluido',
              data_pagamento: new Date().toISOString(),
          });
          if (!salvo) throw new Error('Agendamento não encontrado no banco local.');
          // Igual ao "Tratamento finalizado": com internet, a comissão do recebimento também é lançada no aplicativo.
          let comissaoLancamentos = 0;
          if (!semConexao() && debito.clinica_id) {
              const linha = salvo as Record<string, unknown>;
              comissaoLancamentos = (await registrarComissaoDebitoRecebido({
                  id: agendamentoId,
                  clinica_id: debito.clinica_id,
                  profissional_id: (linha.profissional_id as number | null | undefined) ?? debito.profissional_id ?? null,
                  paciente_id: String(id),
                  procedimento: debito.descricao,
                  valor_final: debito.valor,
              }, debito.valor)).lancamentos;
          }
          return { valorLiquido: debito.valor, comissaoLancamentos };
      }
      return receberDebito(debito, taxaId, taxas, partes);
  }

  async function lerConfigLocal<T>(clinicaId: string | number, chave: string, padrao: T): Promise<T> {
      try {
          const linhas = await listar<{ valor?: T | null }>('configuracoes_clinica', {
              filtros: [
                  { col: 'clinica_id', op: 'eq', valor: Number(clinicaId) },
                  { col: 'chave', op: 'eq', valor: chave },
              ],
              limite: 1,
          });
          const valor = linhas[0]?.valor;
          return valor === undefined || valor === null ? padrao : valor;
      } catch {
          return padrao;
      }
  }

  async function carregarProntuarioCompat(): Promise<ProntuarioPaciente> {
      const modo = await modoDados();
      if (modo === 'local') {
          const [fichaClinica, tratamentosLista, anamneses, documentosLista, evolucoesLista] = await Promise.all([
              carregarFichaClinica(String(id)),
              listarTratamentos(String(id)),
              listarAnamneses(String(id)),
              listarDocumentos(String(id)),
              listarEvolucoes(String(id)),
          ]);
          const temRelacional =
              tratamentosLista.length + anamneses.length + documentosLista.length + evolucoesLista.length > 0;
          if (temRelacional) {
              return {
                  fichaClinica,
                  tratamentos: tratamentosLista,
                  anamneses,
                  documentos: documentosLista,
                  evolucoes: evolucoesLista,
              };
          }

          // Mesmo fallback do modo nuvem: dados antigos que só existem no JSON da ficha.
          const linhas = await listar<{ ficha_medica?: Record<string, unknown> | null }>('pacientes', {
              filtros: [{ col: 'id', op: 'eq', valor: String(id) }],
              limite: 1,
          });
          const legado = legacyJsonToProntuario(linhas[0]?.ficha_medica ?? null);
          return { ...legado, fichaClinica: { ...legado.fichaClinica, ...fichaClinica } };
      }
      return carregarProntuario(String(id));
  }

  async function carregar(opts?: { silent?: boolean }) {
      if (!opts?.silent) setLoading(true);
      odontogramaFromServer.current = true;
      fichaFromServer.current = true;

      try {
          const modo = await modoDados();
          const clinicasPromise = clinicasContexto.length > 0
              ? Promise.resolve(clinicasContexto)
              : modo === 'local'
                  ? (async (): Promise<Array<{ id: string | number; nome: string }>> => {
                      try {
                          const locais = await listar<{ id: string | number; nome: string }>('clinicas', {
                              ordem: [{ col: 'nome', asc: true }],
                          });
                          return locais;
                      } catch {
                          return [];
                      }
                  })()
                  : fetchUserClinicas();

          // Todas as buscas independentes disparam em paralelo — sem cadeia sequencial
          const [listaClinicas, pacienteRes, prontuario, historicoBruto, debitosLista, registrosDebito] = await Promise.all([
              clinicasPromise,
              carregarPacienteCompat(),
              carregarProntuarioCompat(),
              carregarHistoricoCompat(),
              listarDebitosCompat(String(id)),
              carregarRegistrosDebitoCompat(),
          ]);

          setClinicas(listaClinicas);
          const data = pacienteRes.data;

          if (data) {
              const fm = normalizarFichaMedica({ ...((data.ficha_medica as Record<string, unknown>) || {}), ...prontuario.fichaClinica });
              setFicha(fm);
              setForm({
                  ...data,
                  anamnese: typeof fm.anamnese === 'string' ? fm.anamnese : '',
              });
              odontogramaFromServer.current = true;
              fichaFromServer.current = true;
              loadOdontogramFromLegacy((prontuario.fichaClinica.odontograma || {}) as Record<string, LegacyToothState>);
              setTratamentos(prontuario.tratamentos);
              setTextoOdontogramaLivre(prontuario.fichaClinica.texto_livre || '');
              setMarcacoesHof((prontuario.fichaClinica.marcacoes_hof || []) as HofMarcacao[]);
              const fotosHof = (prontuario.fichaClinica.hof_fotos || []) as HofFoto[];
              setHofFotos(modo === 'local' && semConexao()
                  ? fotosHof.map((foto) => ({ ...foto, dataUrl: '' }))
                  : await hidratarHofFotos(fotosHof));
              setAnamnesesAnteriores(prontuario.anamneses);
              // O meta da linha entra no objeto (lib/db/documentos): prévia só vale se for montada nesta aba.
              setDocumentos(prontuario.documentos.map((d) => ({ ...d, previewUrl: undefined, previewVista: undefined })));
              setEvolucoes(prontuario.evolucoes);

              // Planos + modelos de documentos da clínica — não bloqueiam o restante da tela
              if (data.clinica_id) {
                  if (modo === 'local') {
                      // A tabela de planos não faz parte do espelho local; mantém o convênio vinculado.
                      setPlanos(data.plano_id ? [{ id: String(data.plano_id), nome: 'Convênio' }] : []);
                      lerConfigLocal<{ id: string; tipo: string; nome: string; conteudo: string }[]>(
                          String(data.clinica_id),
                          'modelos_documentos',
                          [],
                      ).then((modelos) => {
                          if (Array.isArray(modelos)) setModelosDocumentos(modelos);
                      });
                      if (listaClinicas.length === 0) {
                          setClinicas([{ id: data.clinica_id as string | number, nome: `Clínica ${String(data.clinica_id)}` }]);
                      }
                  } else {
                      tabelas.from('planos').select('id, nome').eq('clinica_id', data.clinica_id).eq('ativo', true).order('nome')
                          .then(({ data: planosData }) => { if (planosData) setPlanos(planosData); });
                      carregarConfig(data.clinica_id as number | string, 'modelos_documentos', 'ortus_modelos_documentos', []).then((d: any) => {
                          if (Array.isArray(d)) setModelosDocumentos(d);
                      });
                  }
              }

              registrarAudit({ acao: 'visualizou', entidade: 'paciente', entidade_id: String(id) });
          }

          const historicoFiltrado = historicoBruto.filter((h) => h.tipo_registro !== 'debito_manual' && h.observacoes !== 'Débito manual');
          setHistorico(historicoFiltrado);
          setDebitos(debitosLista);
          setRegistrosDebito(registrosDebito);

          // Modelos de anamnese da clínica do paciente, lidos do banco: a cópia do navegador pode ser
          // de outra pessoa ou de outra unidade. Sem resposta, fica a cópia local (modelos padrão).
          const clinicaDoPaciente = (data as { clinica_id?: string | number | null } | null)?.clinica_id ?? null;
          setModelosAnamnese(carregarModelos());
          if (clinicaDoPaciente) {
              carregarModelosAsync(clinicaDoPaciente).then(setModelosAnamnese).catch(() => undefined);
          }
          prontuarioIdCarregado.current = String(id);
      } catch (erro) {
          setLoading(false);
          const mensagem = erro instanceof Error ? erro.message : 'Falha ao consultar os dados.';
          await showAlert('Não foi possível carregar a ficha do paciente. ' + mensagem, { type: 'error' });
      } finally {
          setLoading(false);
      }
  }

  function cancelarEdicao() {
      setModoEdicao(false);
      carregar();
  }

  async function salvarTudo() {
      const erro = validarPaciente(form);
      if (erro) { await showAlert(erro, { type: 'warning' }); return; }
      try {
          const fichaParaSalvar = { ...ficha };
          LEGACY_CONDICOES.forEach((k) => delete fichaParaSalvar[k]);
          const fichaAtualizada = await salvarFichaClinica(String(id), { odontograma: getOdontogramLegacySnapshot(), marcacoes_hof: marcacoesHof }, fichaParaSalvar);
          const { anamnese: _anamnese, ...formSemAnamnese } = form;
          const payload = {
              ...formSemAnamnese,
              plano_id: form.plano_id || null,
              ficha_medica: { ...fichaParaSalvar, ...fichaAtualizada, anamnese: form.anamnese || '' },
          };
          const modo = await modoDados();
          if (modo === 'local') {
              const salvo = await atualizar('pacientes', String(id), payload);
              if (!salvo) throw new Error('Paciente não encontrado no banco local.');
          } else {
              const { error } = await tabelas.from('pacientes').update(payload).eq('id', id);
              if (error) { await showAlert('Erro ao salvar: ' + error.message, { type: 'error' }); return; }
          }
          setFicha({ ...ficha, ...fichaAtualizada });
          setModoEdicao(false);
          registrarAudit({ acao: 'editou', entidade: 'paciente', entidade_id: String(id) });
          showAlert('Dados salvos com sucesso!', { type: 'success' });
      } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : 'Falha ao salvar os dados.';
          await showAlert('Erro ao salvar: ' + mensagem, { type: 'error' });
      }
  }

  function handleExportarDados() {
      const dados = {
          exportado_em: new Date().toISOString(),
          finalidade: 'Portabilidade de dados conforme LGPD (Lei 13.709/2018)',
          paciente: {
              nome: form.nome,
              cpf: form.cpf,
              telefone: form.telefone,
              email: form.email,
              data_nascimento: form.data_nascimento,
              endereco: form.endereco,
              observacoes: form.observacoes,
          },
          anamneses: anamnesesAnteriores,
          odontograma: getOdontogramLegacySnapshot(),
          tratamentos,
          marcacoes_hof: marcacoesHof,
          documentos: documentos.map(d => ({ id: d.id, nome: d.nome, tipo: d.tipo, criado_em: d.criado_em })),
      };
      const json = JSON.stringify(dados, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const nomeArquivo = (form.nome || 'paciente').replace(/\s+/g, '_').toLowerCase();
      a.href = url;
      a.download = `prontuario_paciente_${nomeArquivo}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      registrarAudit({ acao: 'exportou', entidade: 'paciente', entidade_id: String(id), detalhes: { tipo: 'lgpd_portabilidade' } });
      showAlert('Os dados foram exportados em formato estruturado conforme a LGPD.', { type: 'success' });
  }

  // ===== Odontograma helpers =====
  function aplicarFerramenta(numDente: number, face: Face | null) {
      applyOdontogramTool(numDente, face);
  }

  function limparDente(numDente: number) {
      resetOdontogramTooth(numDente);
  }

  /** Celular: abre o painel do dente. As faces pedem uma ferramenta de face; se a ativa for de dente inteiro, volta para Cárie. */
  function abrirDente(numDente: number) {
      if (ODONTO_TOOLS.find((t) => t.key === ferramenta)?.tipo !== 'face') setFerramenta('carie');
      setDenteAberto(numDente);
  }

  function alternarCondicaoDente(numDente: number, condicao: string) {
      const atual = odontograma[numDente]?.cond ?? 'normal';
      setOdontogramToothStatus(numDente, (atual === condicao ? 'normal' : condicao) as OdontoToothStatus);
  }

  async function salvarOdontograma() {
      setSavingOdo(true);
      try {
          const fichaAtualizada = await salvarFichaClinica(String(id), { odontograma: getOdontogramLegacySnapshot(), texto_livre: textoOdontogramaLivre, marcacoes_hof: marcacoesHof }, ficha);
          setFicha({ ...ficha, ...fichaAtualizada });
      } catch (error: any) {
          showAlert('Erro ao salvar: ' + error.message, { type: 'error' });
      }
      setSavingOdo(false);
  }

  const salvarFichaMedicaRapida = useCallback(async (fichaData: Record<string, unknown>, anamneseTexto: string) => {
      try {
          const payload = { ...fichaData };
          LEGACY_CONDICOES.forEach((k) => delete payload[k]);
          const fichaAtual = normalizarFichaMedica(form.ficha_medica || {});
          const merged = { ...fichaAtual, ...payload, anamnese: anamneseTexto };
          const modo = await modoDados();
          if (modo === 'local') {
              const salvo = await atualizar('pacientes', String(id), { ficha_medica: merged });
              if (!salvo) throw new Error('Paciente não encontrado no banco local.');
          } else {
              const { error } = await tabelas.from('pacientes').update({
                  ficha_medica: merged,
              }).eq('id', id);
              if (error) throw error;
          }
      } catch (error) {
          const mensagem = error instanceof Error ? error.message : 'Falha ao salvar.';
          showAlert('Erro ao salvar ficha médica: ' + mensagem, { type: 'error' });
      }
  }, [id, showAlert, form.ficha_medica]);

  // Autosave odontograma (debounce 800ms)
  useEffect(() => {
      if (loading) return;
      if (odontogramaFromServer.current) {
          odontogramaFromServer.current = false;
          return;
      }
      const timer = setTimeout(() => { salvarOdontograma(); }, 800);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teeth, textoOdontogramaLivre, loading]);

  // Autosave ficha médica rápida (debounce 800ms)
  useEffect(() => {
      if (loading) return;
      if (fichaFromServer.current) {
          fichaFromServer.current = false;
          return;
      }
      const timer = setTimeout(() => { salvarFichaMedicaRapida(ficha, form.anamnese || ''); }, 800);
      return () => clearTimeout(timer);
  }, [ficha, form.anamnese, loading, salvarFichaMedicaRapida]);

  function abrirNovoTratamento(dentesPref?: number[]) {
      const base = dentesPref?.length
          ? marcacoesOdonto.filter((m) => dentesPref.includes(m.num))
          : (marcacoesPendentes.length ? marcacoesPendentes : []);
      const selecionados = base.map((m) => String(m.num));
      const temPlano = selecionados.length > 0;
      setTratEdit({
          id: null,
          dente: selecionados.join(', '),
          procedimento: sugestaoUnica(base),
          data: new Date().toISOString().split('T')[0],
          status: temPlano ? 'planejado' : 'concluido',
          valor: '',
          observacoes: mesclarObservacaoOdontograma('', base),
          agendarNaAgenda: false,
          horaAgendamento: '09:00',
          pagamentoPendente: false,
          dentesSelecionados: selecionados,
          atualizarOdontograma: base.some((m) => m.precisaTratamento),
      });
      setModalTrat(true);
  }

  function toggleDenteTratamento(num: string) {
      const atual: string[] = tratEdit.dentesSelecionados?.length
          ? tratEdit.dentesSelecionados
          : parseDentesCampo(tratEdit.dente).map(String);
      const next = atual.includes(num) ? atual.filter((n) => n !== num) : [...atual, num].sort((a, b) => Number(a) - Number(b));
      const selecionadas = marcacoesOdonto.filter((m) => next.includes(String(m.num)));
      setTratEdit({
          ...tratEdit,
          dentesSelecionados: next,
          dente: next.join(', '),
          observacoes: mesclarObservacaoOdontograma(tratEdit.observacoes, selecionadas),
          procedimento: tratEdit.procedimento || sugestaoUnica(selecionadas),
          atualizarOdontograma: selecionadas.some((m) => m.precisaTratamento),
      });
  }

  async function salvarTratamento() {
      if (!tratEdit.procedimento) { await showAlert('Informe o procedimento', { type: 'warning' }); return; }
      if (salvandoTrat) return;
      setSalvandoTrat(true);
      try {
          const modo = await modoDados();
          const { agendarNaAgenda, horaAgendamento, pagamentoPendente, ...tratSemAgenda } = tratEdit;
          // Status antes desta gravação: a comissão de "tratamento finalizado" sai só quando ele passa a concluído.
          const statusAnterior = tratSemAgenda.id
              ? tratamentos.find((t) => String(t.id) === String(tratSemAgenda.id))?.status ?? null
              : null;
          let salvo: TratamentoPaciente;
          if (tratSemAgenda.id) {
              salvo = await atualizarTratamento(String(tratSemAgenda.id), {
                  procedimento: tratSemAgenda.procedimento,
                  dente: tratSemAgenda.dente || null,
                  valor: parseFloat(tratSemAgenda.valor) || 0,
                  status: tratSemAgenda.status,
                  data: tratSemAgenda.data || null,
                  observacoes: tratSemAgenda.observacoes || null,
              });
              setTratamentos(tratamentos.map(t => t.id === salvo.id ? salvo : t));
          } else {
              salvo = await criarTratamento(String(id), form.clinica_id, {
                  procedimento: tratSemAgenda.procedimento,
                  dente: tratSemAgenda.dente || null,
                  valor: parseFloat(tratSemAgenda.valor) || 0,
                  status: tratSemAgenda.status,
                  data: tratSemAgenda.data || null,
                  observacoes: tratSemAgenda.observacoes || null,
              });
              setTratamentos([...tratamentos, salvo]);
          }

          // Comissões vivem apenas na nuvem. Offline o tratamento é salvo localmente e sincronizado.
          const registrarComissao = modo !== 'local' || !semConexao();
          const passouAConcluido = tratSemAgenda.status === 'concluido' && statusAnterior !== 'concluido';
          if (registrarComissao && passouAConcluido && form.clinica_id) {
              const user = await usuarioDaSessao();
              let profId: string | number | null = null;
              if (user) {
                  const { data: prof } = await tabelas.from('profissionais').select('id').eq('user_id', user.id).maybeSingle();
                  profId = prof?.id ?? null;
              }
              await registrarComissaoTratamentoFinalizado({
                  clinicaId: form.clinica_id,
                  profissionalId: profId,
                  pacienteId: String(id),
                  procedimento: tratSemAgenda.procedimento,
                  valor: parseFloat(tratSemAgenda.valor) || 0,
              });
          }

          let agendado = false;
          let debitoCriado = false;
          if (pagamentoPendente && parseFloat(tratSemAgenda.valor) > 0 && form.clinica_id) {
              try {
                  const valor = parseFloat(tratSemAgenda.valor) || 0;
                  await criarDebitoManualCompat({
                      paciente_id: id,
                      clinica_id: form.clinica_id,
                      descricao: tratSemAgenda.procedimento,
                      valor,
                      tratamento_id: salvo.id ? String(salvo.id) : null,
                  });
                  const debitosLista = await listarDebitosCompat(id);
                  setDebitos(debitosLista);
                  debitoCriado = true;
              } catch (e) {
                  const mensagem = e instanceof Error ? e.message : String(e);
                  showAlert('Tratamento salvo, mas erro ao registrar débito: ' + mensagem, { type: 'warning' });
              }
          }

          if (agendarNaAgenda && tratEdit.data) {
              try {
                  let clinicaId: string | null = form.clinica_id ? String(form.clinica_id) : null;
                  if (!clinicaId && clinicas.length > 0) clinicaId = String(clinicas[0].id);
                  if (!clinicaId) throw new Error('Paciente sem clínica vinculada.');
                  const dataHoraISO = new Date(`${tratEdit.data}T${horaAgendamento || '09:00'}:00`).toISOString();
                  const payload: Record<string, unknown> = {
                      paciente_id: id,
                      clinica_id: clinicaId,
                      data_hora: dataHoraISO,
                      procedimento: `Tratamento: ${tratEdit.procedimento}`,
                      valor: parseFloat(tratEdit.valor) || 0,
                      valor_final: parseFloat(tratEdit.valor) || 0,
                      status: 'agendado',
                      observacoes: tratEdit.observacoes || '',
                  };
                  if (modo === 'local') {
                      await inserir('agendamentos', payload);
                  } else {
                      const { data: { session } } = await supabase.auth.getSession();
                      const userId = session?.user?.id;
                      let profId: string | null = null;
                      if (userId) {
                          const { data: prof } = await tabelas.from('profissionais').select('id').eq('user_id', userId).maybeSingle();
                          profId = prof?.id || null;
                      }
                      if (profId) payload.profissional_id = profId;
                      const { error: agErr } = await tabelas.from('agendamentos').insert([payload]);
                      if (agErr) throw agErr;
                  }
                  agendado = true;
              } catch (e) {
                  const mensagem = e instanceof Error ? e.message : String(e);
                  showAlert('Tratamento salvo, mas erro ao agendar: ' + mensagem, { type: 'warning' });
              }
          }

          if (tratSemAgenda.status === 'concluido' && tratEdit.atualizarOdontograma) {
              const dentes = parseDentesCampo(tratSemAgenda.dente);
              const { next, changed } = aplicarTratamentoNoSnapshot(getOdontogramLegacySnapshot(), dentes);
              if (changed) loadOdontogramFromLegacy(next);
          }

          setModalTrat(false);
          const msg = agendado
              ? 'Tratamento salvo e consulta marcada na agenda!'
              : debitoCriado
                  ? 'Tratamento salvo e débito registrado na aba Débitos.'
                  : tratEdit.atualizarOdontograma && tratSemAgenda.status === 'concluido'
                      ? 'Tratamento salvo e odontograma atualizado (cáries → tratado).'
                      : 'Tratamento salvo com sucesso!';
          showAlert(msg, { type: 'success' });
      } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : 'Falha ao salvar.';
          await showAlert('Erro ao salvar tratamento: ' + mensagem, { type: 'error' });
      } finally {
          setSalvandoTrat(false);
      }
  }

  async function excluirTratamento(tid: string) {
      if (!(await showConfirm('Excluir este tratamento?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      try {
          await excluirTratamentoDb(tid);
          setTratamentos(tratamentos.filter(t => t.id !== tid));
      } catch (e: any) {
          await showAlert('Erro ao excluir: ' + (e.message || e), { type: 'error' });
      }
  }

  // ===== HOF helpers =====
  function hofTipoInfo(key: string) { return HOF_TIPOS.find(t => t.key === key) || HOF_TIPOS[HOF_TIPOS.length - 1]; }

  function handleFaceClick(e: MouseEvent<HTMLDivElement>) {
      if (hofModo !== 'alterar') return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setHofPopover({ x, y, open: true });
      setHofTexto('');
      setHofDosagem('');
      setHofProduto('');
  }

  function salvarMarcacaoHof() {
      if (!hofTexto.trim()) return;
      const tipoInfo = hofTipoInfo(hofTipoAtivo);
      const nova: HofMarcacao = {
          id: Date.now().toString(), x: hofPopover.x, y: hofPopover.y,
          texto: hofTexto.trim(), data: new Date().toISOString().split('T')[0],
          tipo: hofTipoAtivo, dosagem: hofDosagem.trim(), unidade: tipoInfo.unidadePadrao,
          produto: hofProduto.trim(), sessao: hofSessaoAtiva,
      };
      setMarcacoesHof(prev => [...prev, nova]);
      setHofPopover({ x: 0, y: 0, open: false });
      setHofTexto(''); setHofDosagem(''); setHofProduto('');
  }

  function excluirMarcacaoHof(mid: string) {
      setMarcacoesHof(prev => prev.filter(m => m.id !== mid));
  }

  const hofSessoes = Array.from(new Set([...marcacoesHof.map(m => m.sessao || m.data), ...hofFotos.map(f => f.sessao)])).sort().reverse();

  async function uploadHofFoto(e: any, angulo: string) {
      const file: File = e.target.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const modo = await modoDados();
      if (modo === 'local' && semConexao()) {
          await showAlert('Sem internet: a foto não pode ser enviada agora. As marcações e observações do HOF continuam sendo salvas no banco local.', { type: 'warning' });
          e.target.value = '';
          return;
      }
      setEnviandoFoto(angulo);
      try {
          const blobComprimido = await comprimirImagem(file);
          const caminhoArquivo = `pacientes/${id}/hof/${Date.now()}_${angulo.replace(/[°\s]/g, '')}.jpg`;
          try {
              await enviarArquivoClinica(caminhoArquivo, blobComprimido, { contentType: 'image/jpeg' });
          } catch (uploadErr: any) {
              console.error('[HOF Upload] Erro ao enviar:', uploadErr);
              showAlert(
                  modo === 'local'
                      ? 'Não foi possível enviar a foto. O envio precisa de internet; as demais informações do HOF continuam salvas localmente.'
                      : 'Erro ao enviar foto: ' + (uploadErr?.message || uploadErr),
                  { type: 'error' },
              );
              setEnviandoFoto(null); e.target.value = ''; return;
          }
          const nova: HofFoto = { id: Date.now().toString(), sessao: hofSessaoAtiva, angulo, dataUrl: urlHofDaSessao(blobComprimido), storagePath: caminhoArquivo, criado_em: new Date().toISOString() };
          const novasFotos = [...hofFotos, nova];
          setHofFotos(novasFotos);
          try {
              const fichaAtualizada = await salvarFichaClinica(String(id), { marcacoes_hof: marcacoesHof, hof_fotos: fotosHofParaSalvar(novasFotos) }, ficha);
              setFicha({ ...ficha, ...fichaAtualizada });
          } catch (updateErr: any) {
              console.error('[HOF Update] Erro Supabase:', updateErr);
              const msg = updateErr?.message || String(updateErr);
              if (msg.includes('row-level security') || msg.includes('security policy')) {
                  showAlert('Erro de permissão: Verifique as políticas RLS da tabela de pacientes no Supabase.', { type: 'error', title: 'Permissão Negada' });
              } else {
                  showAlert('Erro ao salvar foto no prontuário: ' + msg, { type: 'error' });
              }
              setEnviandoFoto(null); return;
          }
      } catch (err: any) {
          console.error('[HOF] Erro inesperado:', err);
          const msg = err?.message || String(err);
          if (msg.includes('row-level security') || msg.includes('security policy')) {
              showAlert('Erro de permissão: Verifique as configurações de segurança (RLS) no Supabase.', { type: 'error', title: 'Permissão Negada' });
          } else {
              showAlert('Erro ao processar foto: ' + msg, { type: 'error' });
          }
      }
      setEnviandoFoto(null);
      e.target.value = '';
  }

  async function excluirHofFoto(fid: string) {
      const foto = hofFotos.find(f => f.id === fid);
      const modo = await modoDados();
      if (foto?.storagePath) {
          if (modo === 'local') {
              try {
                  await apagarArquivosClinica([foto.storagePath]);
              } catch {
                  /* sem internet: o registro local sai agora e o arquivo remoto pode ser removido depois */
              }
          } else {
              // Na nuvem, se o servidor recusar (modo de consulta, sem permissão, sem conexão), a foto
              // fica onde está e a pessoa fica sabendo; nada de rejeição solta.
              try {
                  await apagarArquivosClinica([foto.storagePath]);
              } catch (e) {
                  showAlert(fraseDeErro(e, 'Não foi possível excluir a foto agora. Tente de novo.'), { type: 'error' });
                  return;
              }
          }
      }
      const novasFotos = hofFotos.filter(f => f.id !== fid);
      setHofFotos(novasFotos);
      try {
          const fichaAtualizada = await salvarFichaClinica(String(id), { marcacoes_hof: marcacoesHof, hof_fotos: fotosHofParaSalvar(novasFotos) }, ficha);
          setFicha({ ...ficha, ...fichaAtualizada });
      } catch (e) {
          showAlert(fraseDeErro(e, 'Não foi possível excluir a foto agora. Tente de novo.'), { type: 'error' });
      }
  }

  function calcularAlertasHof() {
      const hoje = new Date();
      const alertas: { tipo: string; label: string; cor: string; ultimaSessao: string; vencimento: Date; diasRestantes: number }[] = [];
      const tiposUsados = Array.from(new Set(marcacoesHof.map(m => m.tipo)));
      tiposUsados.forEach(tipo => {
          const retorno = HOF_RETORNO[tipo];
          if (!retorno) return;
          const sessoesTipo = marcacoesHof.filter(m => m.tipo === tipo).map(m => m.sessao || m.data).sort().reverse();
          if (!sessoesTipo.length) return;
          const ultimaSessao = sessoesTipo[0];
          const vencimento = new Date(ultimaSessao + 'T12:00:00');
          vencimento.setMonth(vencimento.getMonth() + retorno.meses);
          const diasRestantes = Math.ceil((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          const tipoInfo = hofTipoInfo(tipo);
          alertas.push({ tipo, label: tipoInfo.label, cor: tipoInfo.color, ultimaSessao, vencimento, diasRestantes });
      });
      return alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
  }
  const hofAlertas = calcularAlertasHof();

  function resumoHofParaAgenda(marcas: HofMarcacao[]) {
      const labels = Array.from(new Set(marcas.map((m) => m.tipo))).map((tipo) => hofTipoInfo(tipo).label);
      const procedimento = labels.length === 1 ? labels[0] : 'Harmonização orofacial';
      const linhas = marcas.map((m) => {
          const info = hofTipoInfo(m.tipo);
          const dose = m.dosagem ? ` ${m.dosagem}${info.unidadePadrao ? ` ${info.unidadePadrao}` : ''}` : '';
          const produto = m.produto ? ` · ${m.produto}` : '';
          return `${info.label}${dose}${produto}${m.texto ? ` — ${m.texto}` : ''}`;
      });
      const sessao = hofSessaoAtiva
          ? new Date(hofSessaoAtiva + 'T12:00:00').toLocaleDateString('pt-BR')
          : '';
      return {
          procedimento,
          observacoes: [`Demonstração HOF${sessao ? ` · sessão ${sessao}` : ''}`, ...linhas].join('\n'),
          data: hofSessaoAtiva,
      };
  }

  async function salvarHof() {
      setSavingHof(true);
      try {
          const fichaAtualizada = await salvarFichaClinica(String(id), { marcacoes_hof: marcacoesHof, hof_fotos: fotosHofParaSalvar(hofFotos) }, ficha);
          setFicha({ ...ficha, ...fichaAtualizada });
          const daSessao = marcacoesHof.filter((m) => (m.sessao || m.data) === hofSessaoAtiva);
          const marcas = daSessao.length ? daSessao : marcacoesHof;
          setSavingHof(false);
          if (!marcas.length) {
              showAlert('Procedimento HOF salvo.', { type: 'success' });
              return;
          }
          const agendar = await showConfirm(
              'O procedimento foi salvo como demonstração. Quer agendar agora, sem sair desta tela?',
              { title: 'Agendar procedimento?', type: 'success', confirmLabel: 'Agendar', cancelLabel: 'Agora não' },
          );
          if (!agendar) return;
          setAgendaHof(resumoHofParaAgenda(marcas));
      } catch (error: any) {
          showAlert('Erro ao salvar HOF: ' + error.message, { type: 'error' });
          setSavingHof(false);
      }
  }

  // ===== HOF Protocol Templates =====
  const HOF_PROTOCOLOS = [
      { nome: 'Full Face Toxina', pontos: [
          { x: 50, y: 24, tipo: 'toxina', texto: 'Frontal (região central)', dosagem: '6', produto: '' },
          { x: 38, y: 26, tipo: 'toxina', texto: 'Frontal (lateral esquerda)', dosagem: '4', produto: '' },
          { x: 62, y: 26, tipo: 'toxina', texto: 'Frontal (lateral direita)', dosagem: '4', produto: '' },
          { x: 50, y: 39, tipo: 'toxina', texto: 'Glabela (prócero)', dosagem: '6', produto: '' },
          { x: 44, y: 37, tipo: 'toxina', texto: 'Glabela (corrugador E)', dosagem: '6', produto: '' },
          { x: 56, y: 37, tipo: 'toxina', texto: 'Glabela (corrugador D)', dosagem: '6', produto: '' },
          { x: 24, y: 44, tipo: 'toxina', texto: 'Periorbital esquerdo (pés de galinha)', dosagem: '8', produto: '' },
          { x: 76, y: 44, tipo: 'toxina', texto: 'Periorbital direito (pés de galinha)', dosagem: '8', produto: '' },
      ]},
      { nome: 'Preenchimento Labial (1 mL)', pontos: [
          { x: 46, y: 67.5, tipo: 'labial', texto: 'Lábio superior (arco do cupido E)', dosagem: '0.3', produto: '' },
          { x: 54, y: 67.5, tipo: 'labial', texto: 'Lábio superior (arco do cupido D)', dosagem: '0.3', produto: '' },
          { x: 50, y: 71.5, tipo: 'labial', texto: 'Lábio inferior (corpo central)', dosagem: '0.4', produto: '' },
      ]},
      { nome: 'Lip Flip', pontos: [
          { x: 46, y: 67, tipo: 'toxina', texto: 'Orbicular superior E', dosagem: '2', produto: '' },
          { x: 54, y: 67, tipo: 'toxina', texto: 'Orbicular superior D', dosagem: '2', produto: '' },
      ]},
      { nome: 'Preenchimento Malar', pontos: [
          { x: 30, y: 51, tipo: 'preenchimento', texto: 'Malar esquerdo (ponto de luz)', dosagem: '0.5', produto: '' },
          { x: 70, y: 51, tipo: 'preenchimento', texto: 'Malar direito (ponto de luz)', dosagem: '0.5', produto: '' },
      ]},
      { nome: 'Bigode Chinês (Nasogeniano)', pontos: [
          { x: 41, y: 63, tipo: 'preenchimento', texto: 'Sulco nasolabial esquerdo', dosagem: '0.5', produto: '' },
          { x: 59, y: 63, tipo: 'preenchimento', texto: 'Sulco nasolabial direito', dosagem: '0.5', produto: '' },
      ]},
      { nome: 'Olheiras', pontos: [
          { x: 38, y: 47, tipo: 'olheira', texto: 'Sulco lacrimal esquerdo', dosagem: '0.3', produto: '' },
          { x: 62, y: 47, tipo: 'olheira', texto: 'Sulco lacrimal direito', dosagem: '0.3', produto: '' },
      ]},
      { nome: 'Rinomodelação', pontos: [
          { x: 50, y: 49, tipo: 'rino', texto: 'Dorso nasal', dosagem: '0.2', produto: '' },
          { x: 50, y: 57, tipo: 'rino', texto: 'Ponta nasal', dosagem: '0.1', produto: '' },
      ]},
      { nome: 'Mento e Mandíbula', pontos: [
          { x: 50, y: 81, tipo: 'mento', texto: 'Pogônio (projeção do mento)', dosagem: '1', produto: '' },
          { x: 26, y: 76, tipo: 'mandibula', texto: 'Ângulo e corpo mandibular E', dosagem: '1', produto: '' },
          { x: 74, y: 76, tipo: 'mandibula', texto: 'Ângulo e corpo mandibular D', dosagem: '1', produto: '' },
      ]},
      { nome: 'Masseter (bruxismo / afinamento)', pontos: [
          { x: 22, y: 70, tipo: 'toxina', texto: 'Masseter esquerdo', dosagem: '25', produto: '' },
          { x: 78, y: 70, tipo: 'toxina', texto: 'Masseter direito', dosagem: '25', produto: '' },
      ]},
      { nome: 'Lipo de Papada', pontos: [
          { x: 50, y: 89, tipo: 'papada', texto: 'Região submentual', dosagem: '2', produto: '' },
      ]},
      { nome: 'Bioestimulação Full Face', pontos: [
          { x: 18, y: 34, tipo: 'bioestimulador', texto: 'Região temporal esquerda', dosagem: '1', produto: '' },
          { x: 82, y: 34, tipo: 'bioestimulador', texto: 'Região temporal direita', dosagem: '1', produto: '' },
          { x: 30, y: 52, tipo: 'bioestimulador', texto: 'Malar esquerdo', dosagem: '1', produto: '' },
          { x: 70, y: 52, tipo: 'bioestimulador', texto: 'Malar direito', dosagem: '1', produto: '' },
          { x: 26, y: 74, tipo: 'bioestimulador', texto: 'Mandibular esquerdo', dosagem: '1', produto: '' },
          { x: 74, y: 74, tipo: 'bioestimulador', texto: 'Mandibular direito', dosagem: '1', produto: '' },
      ]},
      { nome: 'Fios de PDO – Terço Inferior', pontos: [
          { x: 28, y: 63, tipo: 'fios', texto: 'Fio sustentação malar/jowl E', dosagem: '3', produto: '' },
          { x: 72, y: 63, tipo: 'fios', texto: 'Fio sustentação malar/jowl D', dosagem: '3', produto: '' },
          { x: 26, y: 73, tipo: 'fios', texto: 'Fio contorno mandibular E', dosagem: '2', produto: '' },
          { x: 74, y: 73, tipo: 'fios', texto: 'Fio contorno mandibular D', dosagem: '2', produto: '' },
      ]},
      { nome: 'Skinbooster Full Face', pontos: [
          { x: 32, y: 55, tipo: 'skinbooster', texto: 'Hemiface esquerda', dosagem: '1', produto: '' },
          { x: 68, y: 55, tipo: 'skinbooster', texto: 'Hemiface direita', dosagem: '1', produto: '' },
      ]},
  ];
  const [modalProtocolo, setModalProtocolo] = useState(false);
  const [modalConsentimento, setModalConsentimento] = useState(false);
  const [consentimentoAceito, setConsentimentoAceito] = useState(false);

  function aplicarProtocolo(idx: number) {
      const proto = HOF_PROTOCOLOS[idx];
      const novas: HofMarcacao[] = proto.pontos.map((p, i) => {
          const tipoInfo = hofTipoInfo(p.tipo);
          return {
              id: (Date.now() + i).toString(), x: p.x, y: p.y,
              texto: p.texto, data: new Date().toISOString().split('T')[0],
              tipo: p.tipo, dosagem: p.dosagem, unidade: tipoInfo.unidadePadrao,
              produto: p.produto, sessao: hofSessaoAtiva,
          };
      });
      setMarcacoesHof(prev => [...prev, ...novas]);
      setModalProtocolo(false);
  }

  function imprimirMapaHof() {
      const svgRosto = `<svg viewBox="0 0 300 400" style="width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="fg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#e2e8f0" stop-opacity="0.3"/><stop offset="100%" stop-color="#cbd5e1" stop-opacity="0.15"/></linearGradient></defs>
          <ellipse cx="150" cy="195" rx="105" ry="140" fill="url(#fg)" stroke="#94a3b8" stroke-width="1.5"/>
          <ellipse cx="44" cy="185" rx="12" ry="24" fill="none" stroke="#94a3b8" stroke-width="1.2"/>
          <ellipse cx="256" cy="185" rx="12" ry="24" fill="none" stroke="#94a3b8" stroke-width="1.2"/>
          <path d="M95 145 Q115 135 135 143" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M165 143 Q185 135 205 145" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/>
          <ellipse cx="115" cy="165" rx="18" ry="10" fill="none" stroke="#94a3b8" stroke-width="1.3"/>
          <circle cx="115" cy="165" r="4" fill="#94a3b8"/>
          <ellipse cx="185" cy="165" rx="18" ry="10" fill="none" stroke="#94a3b8" stroke-width="1.3"/>
          <circle cx="185" cy="165" r="4" fill="#94a3b8"/>
          <path d="M150 175 L150 215 M140 222 Q150 230 160 222" fill="none" stroke="#94a3b8" stroke-width="1.3" stroke-linecap="round"/>
          <path d="M120 260 Q135 250 150 252 Q165 250 180 260" fill="none" stroke="#94a3b8" stroke-width="1.3" stroke-linecap="round"/>
          <path d="M120 260 Q150 278 180 260" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round"/>
          ${marcacoesHof.map(m => {
              const ti = hofTipoInfo(m.tipo);
              return `<circle cx="${escapePrintHtml(Number(m.x) * 3)}" cy="${escapePrintHtml(Number(m.y) * 4)}" r="6" fill="${escapePrintHtml(ti.color)}" stroke="white" stroke-width="2"/>`;
          }).join('')}
      </svg>`;

      const rows = marcacoesHof.map((m) => {
          const ti = hofTipoInfo(m.tipo);
          return [
              `<span class="ortus-dot" style="background:${escapePrintHtml(ti.color)}"></span>`,
              `<strong style="color:${escapePrintHtml(ti.color)}">${escapePrintHtml(ti.label)}</strong>`,
              escapePrintHtml(m.texto),
              escapePrintHtml(m.dosagem ? `${m.dosagem} ${m.unidade}` : '—'),
              escapePrintHtml(m.produto || '—'),
              escapePrintHtml(new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')),
          ];
      });

      const legend = HOF_TIPOS.filter(t => marcacoesHof.some(m => m.tipo === t.key)).map(t =>
          `<span class="ortus-legend-item"><span class="ortus-dot" style="background:${escapePrintHtml(t.color)}"></span>${escapePrintHtml(t.label)}</span>`
      ).join('');

      // A janela de impressão herda a origem do Ortus: só entra foto cujo objectURL foi criado nesta aba.
      const fotosImpressao = hofFotos.filter((f) => urlsHofDaSessao.current.has(f.dataUrl));
      const fotosHtml = fotosImpressao.length > 0 ? `
          <div class="page-break"></div>
          <div class="ortus-section-title">Registro Fotográfico</div>
          <div class="ortus-photo-grid">
              ${fotosImpressao.map(f => `<div class="ortus-photo-card">
                  <img src="${escapePrintHtml(f.dataUrl)}" alt="${escapePrintHtml(f.angulo)}"/>
                  <div class="ortus-photo-cap">${escapePrintHtml(f.angulo)} — ${escapePrintHtml(new Date(f.sessao + 'T12:00:00').toLocaleDateString('pt-BR'))}</div>
              </div>`).join('')}
          </div>` : '';

      printDocument({
          title: 'Mapa de Harmonização Orofacial',
          accentColor: '#9333ea',
          clinicSubtitle: 'Harmonização Orofacial (HOF)',
          toolbarLabel: `HOF — ${form.nome}`,
          meta: [
              { label: 'Paciente', value: form.nome || '—' },
              { label: 'CPF', value: form.cpf || '—' },
              { label: 'Telefone', value: form.telefone || '—' },
              { label: 'Email', value: form.email || '—' },
          ],
          bodyHtml: `
            <div class="ortus-section-title">Mapa Facial</div>
            <div class="ortus-face-map">${svgRosto}</div>
            <div class="ortus-legend">${legend}</div>
            <div class="ortus-section-title">Detalhamento dos Procedimentos</div>
            ${printTable(['', 'Tipo', 'Procedimento', 'Dose', 'Produto', 'Data'], rows)}
            ${fotosHtml}
          `,
          footerNote: 'Documento clínico — uso interno. Gerado pelo Sistema ORTUS.',
      });
  }

  function gerarTermoConsentimentoHof() {
      const tiposUsados = Array.from(new Set(marcacoesHof.map(m => m.tipo))).map(t => hofTipoInfo(t));
      const listaProcedimentos = tiposUsados.map(t => `<li><strong style="color:${t.color}">${escapePrintHtml(t.label)}</strong></li>`).join('');
      const produtosUsados = Array.from(new Set(marcacoesHof.filter(m => m.produto).map(m => m.produto)));
      const listaProdutos = produtosUsados.length
          ? produtosUsados.map(p => `<li>${escapePrintHtml(p)}</li>`).join('')
          : '<li><em>A definir no momento do procedimento</em></li>';

      printDocument({
          title: 'Termo de Consentimento Livre e Esclarecido',
          accentColor: '#9333ea',
          clinicSubtitle: 'Harmonização Orofacial (HOF)',
          toolbarLabel: `Consentimento HOF — ${form.nome}`,
          meta: [
              { label: 'Paciente', value: form.nome || '—' },
              { label: 'CPF', value: form.cpf || '—' },
          ],
          bodyHtml: `
            <div class="ortus-prose">
              <p>Eu, <strong>${escapePrintHtml(form.nome || '___________________')}</strong>, portador(a) do CPF <strong>${escapePrintHtml(form.cpf || '_______________')}</strong>, declaro que fui devidamente informado(a) sobre os procedimentos de <strong>Harmonização Orofacial</strong> descritos abaixo e que, após ter sido esclarecido(a) sobre os benefícios, riscos e alternativas, <strong>CONSINTO</strong> de livre e espontânea vontade com a realização dos mesmos.</p>
              <p><strong>1. Procedimentos Autorizados</strong></p>
              <ul>${listaProcedimentos}</ul>
              <p><strong>2. Produtos / Materiais</strong></p>
              <ul>${listaProdutos}</ul>
              <p><strong>3. Riscos e Efeitos Colaterais</strong></p>
              <p>Fui informado(a) de que os procedimentos estéticos injetáveis podem causar efeitos colaterais, tais como: dor local, edema, equimose (hematomas), eritema, assimetria temporária, nódulos palpáveis, reações alérgicas, infecção, necrose tecidual, migração do produto, e em casos raros, comprometimento vascular. Compreendo que os resultados podem variar de pessoa para pessoa e que o resultado final pode não corresponder exatamente às minhas expectativas.</p>
              <p><strong>4. Cuidados Pós-procedimento</strong></p>
              <p>Comprometo-me a seguir as orientações pós-procedimento fornecidas pelo profissional, incluindo mas não limitado a: evitar exercícios físicos intensos nas primeiras 24-48h, não massagear a região tratada (salvo orientação contrária), evitar exposição solar intensa, e comparecer aos retornos agendados.</p>
              <p><strong>5. Direito à Revogação</strong></p>
              <p>Estou ciente de que posso revogar este consentimento a qualquer momento antes da realização do procedimento, sem qualquer prejuízo ao meu atendimento.</p>
              <p><strong>6. Autorização de Imagens</strong></p>
              <p>( &nbsp; ) Autorizo &nbsp;&nbsp; ( &nbsp; ) Não autorizo &nbsp;&nbsp; o uso de fotografias clínicas para fins de documentação, acompanhamento e publicações científicas, resguardada minha identidade.</p>
            </div>
            ${printSignatureBlock(['Assinatura do(a) Paciente', 'Assinatura do(a) Profissional — CRO: ___________'])}
          `,
          footerNote: 'Via do Profissional · Documento gerado pelo Sistema ORTUS.',
      });
  }

  const valorTotalOrcamento = tratamentos.reduce((acc: number, t: any) => acc + (parseFloat(t.valor) || 0), 0);

  function formatarMoeda(v: number) {
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function imprimirOrcamento() {
      let secaoDiagnostico = '';
      if (visaoOdonto === 'livre' && textoOdontogramaLivre.trim()) {
          secaoDiagnostico = `
            <div class="ortus-section-title">Planejamento (Texto Livre)</div>
            <div class="ortus-prose">${escapePrintHtml(textoOdontogramaLivre)}</div>`;
      } else {
          const dentesAlterados = Object.entries(odontograma).filter(([, st]) =>
              st.cond !== 'normal' || Object.values(st.faces || {}).some(v => v && v !== 'higido')
          );
          if (dentesAlterados.length > 0) {
              const rows = dentesAlterados.map(([num, st]) => {
                  const detalhes: string[] = [];
                  if (st.cond !== 'normal') {
                      const condLabel = TOOLS.find(t => t.key === st.cond)?.label || st.cond;
                      const condColor = TOOLS.find(t => t.key === st.cond)?.color || '#64748b';
                      detalhes.push(`<span class="ortus-legend-item"><span class="ortus-dot" style="background:${condColor}"></span>${escapePrintHtml(condLabel)}</span>`);
                  }
                  Object.entries(st.faces || {}).forEach(([f, v]) => {
                      if (v && v !== 'higido') {
                          const fLabel = FACE_LABELS[f as Face] || f;
                          const fColor = FACE_COLORS[v as FaceStatus] || '#64748b';
                          const vLabel = TOOLS.find(t => t.key === v)?.label || v;
                          detalhes.push(`<span class="ortus-legend-item"><span class="ortus-dot" style="background:${fColor}"></span>${escapePrintHtml(vLabel)} — ${escapePrintHtml(fLabel)}</span>`);
                      }
                  });
                  return [`<strong>${escapePrintHtml(num)}</strong>`, detalhes.join(' ')];
              });
              secaoDiagnostico = `<div class="ortus-section-title">Diagnóstico — Estado dos Dentes</div>${printTable(['Dente', 'Condição / Faces'], rows)}`;
          } else {
              secaoDiagnostico = `<div class="ortus-section-title">Diagnóstico — Estado dos Dentes</div><p><em>Nenhuma marcação registrada no odontograma.</em></p>`;
          }
      }

      let secaoTratamentos = '';
      if (tratamentos.length > 0) {
          const rows = tratamentos.map((t: any) => {
              const val = parseFloat(t.valor) || 0;
              const statusCls = t.status === 'concluido' ? 'concluido' : t.status === 'andamento' ? 'andamento' : 'planejado';
              return [
                  escapePrintHtml(t.dente || '—'),
                  escapePrintHtml(t.procedimento),
                  `<span class="ortus-status ${statusCls}">${escapePrintHtml(t.status)}</span>`,
                  `<strong>${escapePrintHtml(formatarMoeda(val))}</strong>`,
              ];
          });
          secaoTratamentos = `
            <div class="ortus-section-title">Tratamentos Propostos</div>
            ${printTable(['Dente', 'Procedimento', 'Status', 'Valor'], rows, { numCols: [3] })}
            <table class="ortus-table"><tbody><tr class="ortus-total-row">
              <td colspan="3" class="num">Valor Total</td>
              <td class="num">${escapePrintHtml(formatarMoeda(valorTotalOrcamento))}</td>
            </tr></tbody></table>`;
      } else {
          secaoTratamentos = `<div class="ortus-section-title">Tratamentos Propostos</div><p><em>Nenhum tratamento registrado.</em></p>`;
      }

      printDocument({
          title: 'Ficha Clínica e Orçamento',
          accentColor: '#2563eb',
          toolbarLabel: `Orçamento — ${form.nome}`,
          meta: [
              { label: 'Paciente', value: form.nome || '—' },
              { label: 'CPF', value: form.cpf || '—' },
              { label: 'Telefone', value: form.telefone || '—' },
              { label: 'Email', value: form.email || '—' },
          ],
          kpis: tratamentos.length > 0 ? [{ label: 'Valor Total', value: formatarMoeda(valorTotalOrcamento), variant: 'entrada' }] : undefined,
          bodyHtml: secaoDiagnostico + secaoTratamentos,
          footerNote: 'Este documento não possui valor fiscal. Gerado pelo Sistema ORTUS.',
      });
  }

  // ===== ANAMNESE helpers =====
  function formatarDataAnamnese(iso?: string | null) {
      if (!iso) return '—';
      return new Date(iso).toLocaleString('pt-BR');
  }

  function selecionarModeloAnamnese(modelo_id: string) {
      const m = modelosAnamnese.find(x => x.id === modelo_id);
      const respostasIniciais: Record<string, RespostaAnamnese> = {};
      m?.perguntas.forEach(p => { respostasIniciais[p.id] = respostaInicial(p.tipo); });
      setLinkAnamnesePaciente(null);
      setAnamneseAtual((prev: any) => ({
          ...prev,
          modelo_id,
          data: prev.data || new Date().toISOString().split('T')[0],
          respostas: prev.id ? respostasIniciais : respostasIniciais,
      }));
  }

  function editarAnamnese(a: any) {
      setAnamnesePreview(null);
      setLinkAnamnesePaciente(null);
      setAnamneseAtual({
          id: a.id,
          modelo_id: a.modelo_id,
          data: a.data || new Date().toISOString().split('T')[0],
          preenchido_por: a.preenchido_por || 'profissional',
          respostas: { ...(a.respostas || {}) },
      });
      setModalAnamnese(true);
  }

  function abrirNovaAnamnese() {
      setLinkAnamnesePaciente(null);
      setAnamneseAtual({ id: null, modelo_id: '', data: new Date().toISOString().split('T')[0], preenchido_por: 'profissional', respostas: {} });
      setModalAnamnese(true);
  }

  async function salvarAnamnese() {
      if (!anamneseAtual.modelo_id) { await showAlert('Selecione um modelo de anamnese.', { type: 'warning' }); return; }
      const modelo = modelosAnamnese.find(m => m.id === anamneseAtual.modelo_id);
      if (!modelo) { await showAlert('Modelo não encontrado.', { type: 'error' }); return; }
      const payload = {
          modelo_id: anamneseAtual.modelo_id,
          modelo_nome: modelo.nome,
          data: anamneseAtual.data,
          preenchido_por: anamneseAtual.preenchido_por,
          respostas: anamneseAtual.respostas,
          perguntas_snapshot: modelo.perguntas,
      };
      try {
          if (anamneseAtual.id) {
              const atualizada = await atualizarAnamnese(anamneseAtual.id, payload);
              setAnamnesesAnteriores(anamnesesAnteriores.map(a => a.id === atualizada.id ? atualizada : a));
              showAlert('Anamnese atualizada com sucesso!', { type: 'success' });
          } else {
              const salva = await criarAnamnese(String(id), payload);
              setAnamnesesAnteriores([salva, ...anamnesesAnteriores]);
              showAlert('Anamnese salva com sucesso!', { type: 'success' });
          }
      } catch (error: any) {
          await showAlert('Erro: ' + error.message, { type: 'error' });
          return;
      }
      setAnamneseAtual({ id: null, modelo_id: '', data: new Date().toISOString().split('T')[0], preenchido_por: 'profissional', respostas: {} });
      setModalAnamnese(false);
  }

  async function gerarLinkAnamnesePaciente() {
      if (!anamneseAtual.modelo_id) {
          await showAlert('Selecione um modelo de anamnese.', { type: 'warning' });
          return;
      }
      const modo = await modoDados();
      if (modo === 'local' && semConexao()) {
          await showAlert('Gerar o link de anamnese precisa de internet. A anamnese pode ser preenchida e salva normalmente offline; o link pode ser gerado quando a conexão voltar.', { type: 'warning' });
          return;
      }
      setGerandoLinkAnamnese(true);
      try {
          const link = await gerarLinkAnamnesePacienteApi(String(id), anamneseAtual.modelo_id, form.clinica_id);
          setLinkAnamnesePaciente(link);
      } catch (error) {
          const mensagem = error instanceof Error ? error.message : String(error);
          await showAlert(
              modo === 'local'
                  ? 'Não foi possível gerar o link de anamnese. Essa ação precisa de internet; a anamnese salva continua disponível offline.'
                  : 'Erro: ' + mensagem,
              { type: 'error' },
          );
      }
      setGerandoLinkAnamnese(false);
  }

  async function copiarLinkAnamnese() {
      if (!linkAnamnesePaciente?.url) return;
      try {
          await navigator.clipboard.writeText(linkAnamnesePaciente.url);
          showAlert('Link copiado!', { type: 'success' });
      } catch {
          showAlert('Não foi possível copiar. Selecione e copie manualmente.', { type: 'warning' });
      }
  }

  function emitirAnamnese(anamnese?: any) {
      const a = anamnese || (() => {
          if (!anamneseAtual.modelo_id) { showAlert('Selecione e preencha uma anamnese antes de emitir.', { type: 'warning' }); return null; }
          const modelo = modelosAnamnese.find(m => m.id === anamneseAtual.modelo_id);
          return modelo ? { ...anamneseAtual, modelo_nome: modelo.nome, perguntas_snapshot: modelo.perguntas } : null;
      })();
      if (!a) return;
      const dataFmt = new Date(a.data).toLocaleDateString('pt-BR');
      const linhas = (a.perguntas_snapshot || []).map((p: any) =>
          printQaBlock(p.label, formatarRespostaAnamnese(a.respostas?.[p.id]))
      ).join('');
      const assinatura = a.preenchido_por === 'paciente' ? 'Assinatura do Paciente' : 'Assinatura do Profissional';

      printDocument({
          title: 'Ficha de Anamnese',
          accentColor: '#1e40af',
          toolbarLabel: `Anamnese — ${form.nome}`,
          meta: [
              { label: 'Paciente', value: (form.nome || '').toUpperCase() },
              { label: 'CPF', value: form.cpf || '—' },
              { label: 'Data', value: dataFmt },
              { label: 'Modelo', value: a.modelo_nome || '—' },
              { label: 'Preenchido por', value: a.preenchido_por === 'paciente' ? 'Paciente' : 'Profissional' },
          ],
          bodyHtml: linhas + printSignatureBlock([assinatura]),
      });
  }

  async function excluirAnamnese(aid: string) {
      if (!(await showConfirm('Excluir esta anamnese?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      try {
          await excluirAnamneseDb(aid);
          setAnamnesesAnteriores(anamnesesAnteriores.filter(a => a.id !== aid));
      } catch (e: any) {
          await showAlert('Erro ao excluir: ' + (e.message || e), { type: 'error' });
      }
  }

  // ===== DOCUMENTOS helpers =====
  async function uploadDocumento(e: any) {
      const file: File = e.target.files?.[0];
      if (!file) return;
      const rejeicao = validarArquivoDocumento(file);
      if (rejeicao) { showAlert(rejeicao, { type: 'warning' }); e.target.value = ''; return; }
      const modo = await modoDados();
      if (modo === 'local' && semConexao()) {
          await showAlert('Sem internet: não é possível anexar arquivos agora. O documento não foi enviado; o restante da ficha continua funcionando offline.', { type: 'warning' });
          e.target.value = '';
          return;
      }
      setUploadingDoc(true);
      try {
          const isImg = documentoEhImagem({ tipo: file.type, nome: file.name });
          const isPdf = documentoEhPdf({ tipo: file.type, nome: file.name });
          const ext = file.name.split('.').pop() || 'bin';
          const timestamp = Date.now();
          let blob: Blob = file;
          let contentType = tipoPorExtensao(file.name) || file.type;
          let finalExt = ext;

          if (isImg) {
              blob = await comprimirImagem(file);
              contentType = 'image/jpeg';
              finalExt = 'jpg';
          }

          const caminhoArquivo = `pacientes/${id}/documentos/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 60)}.${finalExt}`;
          try {
              await enviarArquivoClinica(caminhoArquivo, blob, { contentType });
          } catch (uploadErr) {
              const mensagem = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
              showAlert(
                  modo === 'local'
                      ? 'Não foi possível anexar o arquivo. O envio de documentos precisa de internet; o restante da ficha continua funcionando offline.'
                      : 'Erro ao enviar: ' + mensagem,
                  { type: 'error' },
              );
              setUploadingDoc(false); e.target.value = ''; return;
          }

          const salvo = await criarDocumento(String(id), {
              nome: file.name,
              tipo: file.type,
              storage_path: caminhoArquivo,
              meta: { isImg, isPdf, tamanho: blob.size },
          });
          // Prévia com o tipo da lista segura, não com o que o navegador declarou para o arquivo escolhido.
          const previewVista = vistaDoDocumento(contentType);
          const previewUrl = previewVista !== 'baixar' ? URL.createObjectURL(new Blob([blob], { type: contentType })) : undefined;
          if (previewUrl) previewsDocumento.current.push(previewUrl);
          setDocumentos([...documentos, { ...salvo, isImg, isPdf, previewUrl, previewVista }]);
      } catch (err) {
          const mensagem = err instanceof Error ? err.message : String(err);
          showAlert('Erro ao processar arquivo: ' + mensagem, { type: 'error' });
      }
      setUploadingDoc(false);
      e.target.value = '';
  }

  async function excluirDocumento(did: string) {
      if (!(await showConfirm('Excluir este documento?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      const doc = documentos.find(d => d.id === did);
      const modo = await modoDados();
      try {
          const { storage_path } = await excluirDocumentoDb(did);
          const path = storage_path || doc?.storagePath;
          if (path) {
              if (modo === 'local') {
                  try {
                      await apagarArquivosClinica([path]);
                  } catch {
                      /* sem internet: o registro local sai agora e o arquivo remoto pode ser removido depois */
                  }
              } else {
                  await apagarArquivosClinica([path]);
              }
          }
          if (doc?.previewUrl) URL.revokeObjectURL(doc.previewUrl);
          setDocumentos(documentos.filter(d => d.id !== did));
      } catch (e) {
          const mensagem = e instanceof Error ? e.message : String(e);
          await showAlert('Erro ao excluir: ' + mensagem, { type: 'error' });
      }
  }

  /**
   * Arquivo do documento com tipo decidido aqui. A linha do banco é gravada por
   * qualquer membro: o tipo nunca vem dela nem da resposta, e nada é buscado por
   * URL livre (um data:text/html virando Blob rodaria script na origem do Ortus).
   */
  async function blobDoDocumento(d: any): Promise<Blob> {
      const origem = origemDoDocumento(d);
      if (origem && 'caminho' in origem) {
          const recebido = await baixarArquivoClinica(origem.caminho);
          return new Blob([recebido], { type: tipoSeguroParaServir(origem.caminho, recebido.type) || 'application/octet-stream' });
      }
      if (origem) return new Blob([origem.imagem.bytes], { type: origem.imagem.tipo });
      throw new Error('Arquivo indisponível.');
  }

  async function abrirDocumento(d: any) {
      try {
          const blob = await blobDoDocumento(d);
          const vista = vistaDoDocumento(blob.type);
          const url = URL.createObjectURL(blob);
          setDocAberto((atual) => {
              if (atual?.url) URL.revokeObjectURL(atual.url);
              return { nome: d.nome || 'Arquivo', url, isImg: vista === 'imagem', isPdf: vista === 'pdf' };
          });
      } catch (e) {
          const mensagem = e instanceof Error ? e.message : '';
          await showAlert(
              semConexao()
                  ? 'Sem internet: este arquivo não está disponível offline. Ele será aberto quando a conexão voltar.'
                  : mensagem || 'Não foi possível abrir o arquivo.',
              { type: 'error' },
          );
      }
  }

  function fecharDocumento() {
      setDocAberto((atual) => {
          if (atual?.url) URL.revokeObjectURL(atual.url);
          return null;
      });
  }

  async function baixarDocumento(d: any) {
      try {
          const blob = await blobDoDocumento(d);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = d.nome || 'arquivo';
          a.click();
          URL.revokeObjectURL(url);
      } catch (e) {
          const mensagem = e instanceof Error ? e.message : '';
          await showAlert(
              semConexao()
                  ? 'Sem internet: este arquivo não está disponível offline. O download pode ser feito quando a conexão voltar.'
                  : mensagem || 'Não foi possível baixar o arquivo.',
              { type: 'error' },
          );
      }
  }

  function alternarOrdemDocs(campo: 'nome' | 'data' | 'tamanho') {
      setOrdemDocs((atual) => atual.campo === campo ? { campo, dir: atual.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' });
  }

  function documentosOrdenados() {
      return [...documentos].sort((a, b) => {
          const valor = (d: any) => ordemDocs.campo === 'nome' ? (d.nome || '') : ordemDocs.campo === 'tamanho' ? Number(d.tamanho || 0) : (d.criado_em || '');
          const cmp = typeof valor(a) === 'number' ? valor(a) - valor(b) : String(valor(a)).localeCompare(String(valor(b)), 'pt-BR', { sensitivity: 'base' });
          return ordemDocs.dir === 'asc' ? cmp : -cmp;
      });
  }

  async function abrirModalReceber(debito: any) {
      const modo = await modoDados();
      let taxas: TaxaMaquininha[] = [];
      if (form.clinica_id) {
          if (modo === 'local') {
              const salvas = await lerConfigLocal<TaxaMaquininha[]>(String(form.clinica_id), 'taxas_maquininha', TAXAS_MAQUININHA_PADRAO);
              taxas = normalizarTaxasMaquininha(salvas).filter((taxa) => taxa.ativo);
          } else {
              taxas = await carregarTaxasAtivas(form.clinica_id);
          }
      }
      const bruto = Number(debito?.valor_final ?? debito?.valor) || 0;
      setTaxasRecebimento(taxas);
      setRepassarTaxas(false);
      setPartesPagamento([{ key: '1', forma: 'pix', parcelas: 1, valor: bruto ? bruto.toFixed(2) : '' }]);
      setModalReceber(debito);
  }

  function atualizarPartePagamento(key: string, patch: Partial<{ forma: FormaRecebimento; parcelas: number; valor: string }>) {
      setPartesPagamento((atual) => atual.map((parte) => {
          if (parte.key !== key) return parte;
          const proxima = { ...parte, ...patch };
          if (patch.forma && !formaEhCredito(patch.forma)) proxima.parcelas = 1;
          return proxima;
      }));
  }

  function adicionarPartePagamento() {
      if (partesPagamento.length >= 5) return;
      const bruto = Number(modalReceber?.valor_final ?? modalReceber?.valor) || 0;
      const usado = partesPagamento.reduce((soma, parte) => soma + (parseFloat(parte.valor.replace(',', '.')) || 0), 0);
      const falta = Math.max(0, bruto - usado);
      setPartesPagamento((atual) => [...atual, { key: String(Date.now()), forma: 'dinheiro', parcelas: 1, valor: falta ? falta.toFixed(2) : '' }]);
  }

  async function confirmarRecebimento() {
      if (!modalReceber) return;
      const bruto = Number(modalReceber.valor_final ?? modalReceber.valor) || 0;
      const partesBase = partesPagamento.map((parte) => ({
          ...parte,
          base: parseFloat(parte.valor.replace(',', '.')) || 0,
          taxa: taxaDaForma(taxasRecebimento, parte.forma, parte.parcelas),
      })).filter((parte) => parte.base > 0);
      const partes: ParteRecebimento[] = partesBase.map((parte) => {
          const percentual = parte.taxa?.taxa_percentual || 0;
          const valor = repassarTaxas && percentual > 0 && percentual < 100
              ? Math.round((parte.base / (1 - percentual / 100)) * 100) / 100
              : parte.base;
          return { taxaId: parte.taxa?.id, valor };
      });
      const soma = partesBase.reduce((total, parte) => total + parte.base, 0);
      if (bruto > 0 && Math.abs(soma - bruto) > 0.009) {
          showAlert(`A soma das formas (R$ ${soma.toFixed(2)}) precisa fechar o total de R$ ${bruto.toFixed(2)}.`, { type: 'warning' });
          return;
      }
      setRecebendo(true);
      try {
          const { comissaoLancamentos } = await receberDebitoCompat(
              { ...modalReceber, clinica_id: form.clinica_id },
              partes[0]?.taxaId,
              taxasRecebimento,
              partes,
          );
          const agId = modalReceber.agendamento_id ?? modalReceber.id;
          setDebitos((prev) => prev.filter((d) => d.id !== modalReceber.id));
          setRegistrosDebito((prev) => prev.map((d) => String(d.id) === String(modalReceber.id) ? { ...d, status: 'pago', data_pagamento: new Date().toISOString() } : d));
          if (modalReceber.origem === 'agendamento' || modalReceber.agendamento_id) {
              const pagoEm = new Date().toISOString();
              setHistorico((prev) => prev.map((h) => h.id === agId ? { ...h, status: 'concluido', data_pagamento: pagoEm } : h));
          }
          setModalReceber(null);
          const msgComissao = comissaoLancamentos > 0 ? ` Comissão registrada (${comissaoLancamentos} regra(s)).` : '';
          showAlert(`Pagamento registrado.${msgComissao}`, { type: 'success' });
      } catch (e) {
          // Modo de consulta e "já recebido" têm frase própria; o resto vira frase fixa.
          showAlert(fraseDeErro(e, 'Não foi possível registrar o pagamento. Confira a conexão e tente de novo.'), { type: 'error' });
      } finally {
          setRecebendo(false);
      }
  }

  // ===== DEBITOS helpers =====
  async function marcarComoPago(debitoId: string | number) {
      const debito = debitos.find((d) => d.id === debitoId);
      if (debito) { abrirModalReceber(debito); return; }
  }

  async function abrirModalDebitoManual() {
      try {
          const opcoes = await listarOpcoesDebitoCompat(id);
          setDebitoOpcoes(opcoes);
          setFormDebito({ descricao: '', valor: '', agendamentosMarcados: [], tratamentosMarcados: [] });
          setModalDebitoManual(true);
      } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : String(erro);
          await showAlert('Não foi possível carregar os itens para marcar como não pagos. ' + mensagem, { type: 'error' });
      }
  }

  async function salvarDebitoManual() {
      const descricao = formDebito.descricao.trim();
      const valor = parseFloat(formDebito.valor) || 0;
      const temMarcacoes = formDebito.agendamentosMarcados.length > 0 || formDebito.tratamentosMarcados.length > 0;
      if (!descricao && !temMarcacoes) return showAlert('Informe a descrição ou selecione itens para marcar como não pagos.', { type: 'warning' });
      if (descricao && valor <= 0 && !temMarcacoes) return showAlert('Informe um valor maior que zero.', { type: 'warning' });
      if (!form.clinica_id) return showAlert('Paciente sem clínica vinculada.', { type: 'warning' });

      setSalvandoDebito(true);
      try {
          if (descricao && valor > 0) {
              await criarDebitoManualCompat({
                  paciente_id: id,
                  clinica_id: form.clinica_id,
                  descricao,
                  valor,
              });
          }
          for (const agId of formDebito.agendamentosMarcados) {
              await marcarAgendamentoNaoPagoCompat(agId);
          }
          for (const trId of formDebito.tratamentosMarcados) {
              const tr = debitoOpcoes.tratamentos.find((t) => String(t.id) === String(trId));
              if (!tr) continue;
              await criarDebitoManualCompat({
                  paciente_id: id,
                  clinica_id: form.clinica_id,
                  descricao: tr.procedimento || 'Tratamento',
                  valor: Number(tr.valor) || 0,
                  tratamento_id: String(tr.id),
              });
          }
          const debitosLista = await listarDebitosCompat(id);
          setDebitos(debitosLista);
          setRegistrosDebito(await carregarRegistrosDebitoCompat());
          const hist = await carregarHistoricoCompat();
          setHistorico(hist.filter((h) => h.tipo_registro !== 'debito_manual' && h.observacoes !== 'Débito manual'));
          setModalDebitoManual(false);
          setFormDebito({ descricao: '', valor: '', agendamentosMarcados: [], tratamentosMarcados: [] });
          showAlert('Débito registrado com sucesso.', { type: 'success' });
      } catch (error) {
          const mensagem = error instanceof Error ? error.message : 'Erro ao salvar débito.';
          showAlert(mensagem, { type: 'error' });
      } finally {
          setSalvandoDebito(false);
      }
  }

  function updateCondicoes(condicoes: string[]) {
      setFicha((prev: Record<string, unknown>) => ({ ...prev, condicoes }));
  }

  function updateMedicamentos(medicamentos: string[]) {
      setFicha((prev: Record<string, unknown>) => ({ ...prev, medicamentos }));
  }

  function buildCtxDocumento() {
      const clinica = clinicas.find((c: any) => String(c.id) === String(form.clinica_id));
      const plano = planos.find((p: any) => p.id === form.plano_id);
      return buildDocumentoContexto({
          paciente_nome: form.nome,
          paciente_cpf: form.cpf,
          paciente_telefone: form.telefone,
          paciente_email: form.email,
          paciente_endereco: [form.rua, form.numero, form.bairro, form.cidade, form.uf].filter(Boolean).join(', '),
          responsavel_nome: form.responsavel_nome,
          plano_nome: plano?.nome,
          clinica_nome: clinica?.nome,
          clinica_cnpj: clinica?.cnpj,
          clinica_telefone: clinica?.telefone,
          clinica_endereco: [clinica?.rua, clinica?.numero, clinica?.cidade, clinica?.uf].filter(Boolean).join(', '),
      });
  }

  // LÓGICA INTELIGENTE DE MODELOS
  useEffect(() => {
      if (!modalDoc) return;

      const ctx = buildCtxDocumento();

      const modelosTipo = modelosDocumentos.filter((m) => m.tipo === tipoDoc);
      if (modelosTipo.length > 0) {
          const modelo = modelosTipo.find((m) => m.id === modeloDocId) || modelosTipo[0];
          if (modelo && !modeloDocId) setModeloDocId(modelo.id);
          if (modelo) {
              setTextoDoc(aplicarVariaveisDocumento(modelo.conteudo, ctx));
              return;
          }
      }

      if (tipoDoc === 'contrato') {
          setTextoDoc('Nenhum modelo de contrato cadastrado. Vá em Configurações → Contratos & Docs.');
          return;
      }

      const dataHoje = new Date().toLocaleDateString('pt-BR');
      
      if (tipoDoc === 'receita') {
          setTextoDoc(
              'USO ORAL:\n\n' +
              '1. Amoxicilina 500mg ----------------------- 1 caixa\n' +
              '   Tomar 1 comprimido de 8 em 8 horas por 7 dias.\n\n' +
              '2. Dipirona Sódica 500mg ------------------ 1 caixa\n' +
              '   Tomar 1 comprimido em caso de dor ou febre (6/6h).'
          );
      } else {
          setTextoDoc(
              `Atesto para os devidos fins que o(a) Sr(a) ${form.nome.toUpperCase()}, \n` +
              `inscrito(a) no CPF sob nº ${form.cpf || '___.___.___-__'}, esteve sob meus cuidados profissionais nesta data (${dataHoje}).\n\n` +
              'Necessita de _____ (________________) dias de repouso por motivo de tratamento odontológico.\n\n' +
              'CID: K08.8 (Outras afecções especificadas dos dentes e das estruturas de suporte).'
          );
      }
  }, [tipoDoc, modalDoc, form, modelosDocumentos, modeloDocId, clinicas, planos]);

  function imprimirDocumento() {
      const tituloDoc = tipoDoc === 'receita' ? 'Receituário' : tipoDoc === 'contrato' ? 'Contrato' : 'Atestado Odontológico';
      printDocument({
          title: tituloDoc,
          accentColor: '#0f172a',
          toolbarLabel: `${tituloDoc} — ${form.nome}`,
          meta: [
              { label: 'Paciente', value: form.nome || '—' },
              { label: 'CPF', value: form.cpf || '—' },
              { label: 'Tipo', value: tituloDoc },
          ],
          bodyHtml: `<div class="ortus-prose ortus-prose-serif">${escapePrintHtml(textoDoc)}</div>${printSignatureBlock(['Assinatura e Carimbo do Profissional'])}`,
      });
  }

  // Só bloqueia com skeleton se não há NADA em cache (acesso direto/link, sem passar pela lista)
  if (loading && prontuarioIdCarregado.current !== id && !pacienteCache.current) {
    return <EsqueletoFicha />;
  }

  // Alertas clínicos no topo do celular. Antes de o prontuário responder, vale a ficha que veio no cache da lista.
  const alertasPaciente = getCondicoesFromFicha(Object.keys(ficha).length > 0 ? ficha : (form.ficha_medica || {}));
  const modeloAnamneseAtual = modelosAnamnese.find((m) => m.id === anamneseAtual.modelo_id);
  const anamnesePorLink = anamneseAtual.preenchido_por === 'paciente' && !!anamneseAtual.modelo_id && !anamneseAtual.id;

  return (
    // Celular: a ficha cresce com o conteúdo (grow + shrink-0) e quem rola é a casca de /pacientes.
    // Computador: cabe na tela (flex-1 + min-h-0) e rola por dentro.
    <div ref={raizRef} className="flex w-full shrink-0 grow flex-col overflow-x-clip bg-white font-poppins lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        {/* Celular (abaixo de md): nome inteiro na primeira linha, alertas e ações embaixo. A partir de md volta a ser uma linha só. */}
        <div ref={cabecalhoRef} className="flex shrink-0 flex-col gap-2 border-b border-black/10 px-3 py-2.5 sm:px-4 md:flex-row md:items-center md:justify-between md:gap-3">
            <div className="flex min-w-0 items-center gap-2.5 md:flex-1">
                <Link href="/pacientes" aria-label="Voltar para pacientes" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-[#f8f8f6] text-neutral-600 transition-colors hover:bg-white sm:h-8 sm:w-8"><ArrowLeft size={16}/></Link>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
                    {fotoPaciente ? <img src={fotoPaciente} alt="" className="h-full w-full object-cover" /> : (form.nome || 'P').trim().split(/\s+/).slice(0, 2).map((parte: string) => parte[0] || '').join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                    <h1 className="break-words text-lg font-semibold leading-snug text-neutral-900 md:truncate md:leading-7">{form.nome}</h1>
                    <p className="text-[11px] font-medium text-neutral-400">Prontuário digital</p>
                </div>
            </div>
            {alertasPaciente.length > 0 && (
                <p className="relative flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 md:hidden">
                    <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
                    <span className="min-w-0 break-words"><span className="sr-only">Condições da ficha médica: </span>{alertasPaciente.join(' · ')}</span>
                </p>
            )}
            <div className="flex shrink-0 items-center justify-end gap-1.5">
                {form.telefone && <span className="mr-auto min-w-0 break-words text-sm font-medium tabular-nums text-neutral-700 md:hidden">{form.telefone}</span>}
                {form.nome && <button onClick={handleExportarDados} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-black/10 bg-white text-xs font-medium text-neutral-700 hover:bg-neutral-50 max-sm:w-10 sm:h-8 sm:px-3" title="Exportar prontuário (LGPD)" aria-label="Exportar prontuário (LGPD)"><Download size={14}/> <span className="max-sm:hidden">LGPD</span></button>}
                <PatientContactButtons
                    variant="buttons"
                    className="shrink-0"
                    telefone={form.telefone}
                    email={form.email}
                    nome={form.nome}
                    pacienteId={id}
                    clinicaId={form.clinica_id}
                    evento="pos_consulta"
                    contexto={buildCtxDocumento()}
                />
            </div>
        </div>

        {/* MODAL DE DOCUMENTOS */}
        {/* max-sm:max-h-[92dvh] nos modais: no celular a altura acompanha a barra do navegador, e o topo do modal não sai da tela. */}
        <Modal open={modalDoc} onClose={() => setModalDoc(false)} maxWidth="2xl" hideCloseButton panelClassName="flex h-[32rem] max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]">
                <div className="flex h-full min-h-0 flex-col p-5">
                    <div className="mb-4 flex shrink-0 items-center justify-between">
                        <h3 className="text-base font-semibold text-neutral-900">Emitir documento</h3>
                        <button type="button" onClick={() => setModalDoc(false)} className={botaoFecharModal} aria-label="Fechar"><X size={16}/></button>
                    </div>

                    <SegmentedControl
                        value={tipoDoc}
                        onChange={(tipo) => { setTipoDoc(tipo); setModeloDocId(''); }}
                        className="mb-4 w-full shrink-0"
                        options={[
                            { value: 'receita', label: 'Receita' },
                            { value: 'atestado', label: 'Atestado' },
                            { value: 'contrato', label: 'Contrato' },
                        ]}
                    />

                    <div className="mb-3 shrink-0">
                        <label className={campoLabel}>Modelo</label>
                        <CustomSelect
                            value={modeloDocId}
                            onChange={v => {
                                setModeloDocId(v);
                                const modelo = modelosDocumentos.find(m => m.id === v);
                                if (modelo) setTextoDoc(aplicarVariaveisDocumento(modelo.conteudo, buildCtxDocumento()));
                            }}
                            options={modelosDocumentos.filter(m => m.tipo === tipoDoc).map(m => ({ value: m.id, label: m.nome }))}
                            placeholder="Nenhum modelo"
                            size="lg"
                            menuPortal
                        />
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="mb-1.5 flex shrink-0 items-center justify-between">
                            <label className="text-xs font-medium text-neutral-500">Conteúdo</label>
                            <button type="button" onClick={() => setTextoDoc('')} className="alvo-toque text-xs font-medium text-neutral-500 hover:text-neutral-900">Limpar</button>
                        </div>
                        <textarea
                            value={textoDoc}
                            onChange={(e) => setTextoDoc(e.target.value)}
                            className="min-h-0 w-full flex-1 resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm leading-relaxed text-neutral-900 outline-none focus:border-neutral-900 max-sm:text-base"
                        />
                        <p className="mt-1.5 shrink-0 text-right text-xs text-neutral-400">O cabeçalho e o rodapé da clínica entram na impressão.</p>
                    </div>

                    <div className="mt-3 flex shrink-0 justify-end">
                        <button type="button" onClick={imprimirDocumento} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-9">
                            <Printer size={14}/> Imprimir
                        </button>
                    </div>
                </div>
        </Modal>

        <Modal open={!!modalReceber} onClose={() => setModalReceber(null)} maxWidth="xl" hideCloseButton panelClassName="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]">
                <div className="shrink-0 px-5 pt-5">
                    <h3 className="text-base font-semibold text-neutral-900">Registrar recebimento</h3>
                    <p className="mt-1 break-words text-sm text-neutral-500">{modalReceber?.descricao || modalReceber?.procedimento}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-1">
                    {(() => {
                        const bruto = Number(modalReceber?.valor_final ?? modalReceber?.valor) || 0;
                        const linhas = partesPagamento.map((parte) => {
                            const base = parseFloat(parte.valor.replace(',', '.')) || 0;
                            const taxa = taxaDaForma(taxasRecebimento, parte.forma, parte.parcelas);
                            const percentual = taxa?.taxa_percentual || 0;
                            const cobrado = repassarTaxas && percentual > 0 && percentual < 100 ? base / (1 - percentual / 100) : base;
                            const liquidoParte = repassarTaxas ? base : (taxa ? calcularValorLiquido(base, percentual) : base);
                            return { base, cobrado, liquidoParte };
                        });
                        const soma = linhas.reduce((total, linha) => total + linha.base, 0);
                        const liquido = linhas.reduce((total, linha) => total + linha.liquidoParte, 0);
                        const cobrado = linhas.reduce((total, linha) => total + linha.cobrado, 0);
                        const diferenca = bruto - soma;
                        return (
                            <>
                                <p className="mb-4 mt-2 text-base font-semibold text-neutral-900">R$ {bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <div className="space-y-2">
                                    <div className="mb-1 flex items-center justify-between gap-3">
                                        <span className="text-xs font-medium text-neutral-500">Formas de pagamento</span>
                                        <Switch checked={repassarTaxas} onChange={setRepassarTaxas} className="text-xs font-medium text-neutral-500 max-sm:min-h-[40px]">
                                            Repassar taxas
                                        </Switch>
                                    </div>
                                    {partesPagamento.map((parte) => {
                                        const credito = formaEhCredito(parte.forma);
                                        const parcelasOpcoes = Array.from({ length: 12 }, (_, i) => {
                                            const n = i + 1;
                                            const taxa = taxaDaForma(taxasRecebimento, parte.forma, n);
                                            const rotulo = taxa ? `${n}x · ${taxa.taxa_percentual.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%` : `${n}x`;
                                            return { value: String(n), label: rotulo };
                                        });
                                        return (
                                        <div key={parte.key} className={`grid items-center gap-2 ${credito ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_8.5rem_7rem_auto]' : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7rem_auto]'}`}>
                                            <div className="col-span-3 min-w-0 sm:col-span-1">
                                                <CustomSelect
                                                    value={parte.forma}
                                                    onChange={(valor) => atualizarPartePagamento(parte.key, { forma: valor as FormaRecebimento })}
                                                    options={FORMAS_RECEBIMENTO}
                                                    size="lg"
                                                    menuPortal
                                                />
                                            </div>
                                            {credito && (
                                                <CustomSelect
                                                    value={String(parte.parcelas || 1)}
                                                    onChange={(valor) => atualizarPartePagamento(parte.key, { parcelas: Number(valor) || 1 })}
                                                    options={parcelasOpcoes}
                                                    size="lg"
                                                    menuPortal
                                                />
                                            )}
                                            <input
                                                inputMode="decimal"
                                                value={parte.valor}
                                                onChange={(evento) => atualizarPartePagamento(parte.key, { valor: evento.target.value })}
                                                className={`h-10 min-w-0 rounded-md border border-neutral-200 px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 ${credito ? '' : 'col-span-2 sm:col-span-1'}`}
                                                placeholder="0,00"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setPartesPagamento((atual) => atual.length > 1 ? atual.filter((item) => item.key !== parte.key) : atual)}
                                                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 disabled:text-neutral-300 sm:h-9 sm:w-9"
                                                disabled={partesPagamento.length < 2}
                                                aria-label="Remover forma"
                                            >
                                                <X size={16} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                        );
                                    })}
                                    {partesPagamento.length < 5 && (
                                        <button type="button" onClick={adicionarPartePagamento} className="inline-flex h-10 items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 sm:h-8">
                                            <Plus size={12} /> Adicionar forma
                                        </button>
                                    )}
                                    <p className="text-xs font-medium text-neutral-600">
                                        Líquido: R$ {liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        {repassarTaxas && cobrado > soma + 0.009 && (
                                            <span className="ml-2 text-neutral-500">Paciente paga R$ {cobrado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        )}
                                        {Math.abs(diferenca) > 0.009 && (
                                            <span className="ml-2 text-amber-700">{diferenca > 0 ? `Falta R$ ${diferenca.toFixed(2)}` : `Sobra R$ ${Math.abs(diferenca).toFixed(2)}`}</span>
                                        )}
                                    </p>
                                </div>
                            </>
                        );
                    })()}
                </div>
                <div className="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-3">
                        <button type="button" onClick={() => setModalReceber(null)} disabled={recebendo} className="h-10 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 sm:h-9">Cancelar</button>
                        <button type="button" onClick={confirmarRecebimento} disabled={recebendo} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-9">
                            {recebendo ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>} Confirmar
                        </button>
                </div>
        </Modal>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* Celular: faixa que rola de lado e fica presa no topo enquanto a página rola. Computador: coluna fixa à esquerda. */}
            <nav ref={abasRef} aria-label="Seções do prontuário" className="sticky top-0 z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-black/10 bg-white px-2 py-2 [scrollbar-width:none] lg:static lg:z-auto lg:w-56 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r [&::-webkit-scrollbar]:hidden">
                {PATIENT_NAV_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const active = abaAtiva === section.key;
                    const badge =
                        section.key === 'documentos' && documentos.length > 0 ? documentos.length
                        : section.key === 'tratamentos' && evolucoes.length > 0 ? evolucoes.length
                        : section.key === 'debitos' && debitos.length > 0 ? debitos.length
                        : section.key === 'hof' && marcacoesHof.length > 0 ? marcacoesHof.length
                        : null;
                    return (
                        <button
                            key={section.key}
                            type="button"
                            aria-current={active ? 'true' : undefined}
                            onClick={() => setAbaAtiva(section.key)}
                            className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-left text-sm leading-snug lg:h-auto lg:w-full lg:gap-2.5 lg:py-2.5 ${active ? 'bg-neutral-900 font-medium text-white' : 'font-medium text-neutral-600 hover:bg-[#f3f4f1]'}`}
                        >
                            <Icon size={16} className="shrink-0" />
                            <span className="whitespace-nowrap lg:min-w-0 lg:flex-1 lg:whitespace-normal">{section.label}</span>
                            {badge != null && (
                                <span className={`text-[11px] font-medium tabular-nums ${active ? 'text-white/70' : 'text-neutral-400'}`}>{badge}</span>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* A rolagem por dentro (min-h-0 + overflow) só vale no computador; no celular o conteúdo tem a altura que precisar.
                `isolate` mantém marcadores e dicas com z-index abaixo da faixa de abas presa no topo. */}
            <div className={abaAtiva === 'dados' || abaAtiva === 'anamnese' || abaAtiva === 'odontograma' ? 'isolate flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden' : 'isolate min-w-0 flex-1 px-3 pb-4 pt-3 sm:px-5 sm:pt-4 lg:min-h-0 lg:overflow-y-auto'}>
                {abaAtiva === 'dados' && (
                    <div className="flex flex-col px-3 pb-4 pt-3 sm:px-5 sm:pt-4 lg:h-full lg:min-h-0 lg:overflow-y-auto">
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-neutral-900">Informações do paciente</h3>
                            <div className="flex gap-1.5">
                                {modoEdicao ? (
                                    // Abaixo de lg, Cancelar e Salvar ficam na barra presa ao pé da aba (fim deste bloco).
                                    <>
                                        <button onClick={cancelarEdicao} className="h-8 rounded-md px-2.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50 max-lg:hidden">Cancelar</button>
                                        <button onClick={salvarTudo} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800 max-lg:hidden"><Save size={14}/> Salvar</button>
                                    </>
                                ) : (
                                    <button onClick={() => setModoEdicao(true)} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 sm:h-8 sm:px-2.5"><Edit size={14}/> Editar</button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-5">
                            <section>
                                <h4 className="mb-2 text-sm font-semibold text-neutral-900">Identificação</h4>
                                {/* Celular: foto centrada e campos em uma coluna de largura total (com items-start a grade encolhia até o conteúdo). */}
                                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                                <label className="group relative h-28 w-28 shrink-0 cursor-pointer sm:h-36 sm:w-36">
                                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const arquivo = e.target.files?.[0]; e.target.value = ''; trocarFotoPaciente(arquivo); }} />
                                    <span className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 text-2xl font-semibold text-neutral-700 sm:h-36 sm:w-36">
                                        {fotoPaciente ? <img src={fotoPaciente} alt="" className="h-full w-full object-cover" /> : (form.nome || 'P').trim().split(/\s+/).slice(0, 2).map((parte: string) => parte[0] || '').join('').toUpperCase()}
                                    </span>
                                    <span className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white ring-2 ring-white sm:bottom-1.5 sm:right-1.5 sm:h-7 sm:w-7 sm:rounded-md sm:ring-0">
                                        {enviandoFotoPerfil ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                                    </span>
                                </label>
                                <div className="grid w-full min-w-0 flex-1 grid-cols-1 gap-x-3 gap-y-2.5 sm:w-auto sm:grid-cols-2 lg:grid-cols-4">
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Nome completo</span>
                                        <input disabled={!modoEdicao} className={campoClass(modoEdicao)} value={form.nome || ''} onChange={e => setForm({...form, nome: e.target.value})} />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Sexo <span className="text-red-500">*</span></span>
                                        <CustomSelect disabled={!modoEdicao} value={form.sexo || ''} onChange={v => setForm({...form, sexo: v})} options={[{value:'',label:'Selecione...'},{value:'masculino',label:'Masculino'},{value:'feminino',label:'Feminino'},{value:'outro',label:'Outro'},{value:'nao_informar',label:'Prefiro não informar'}]} size="sm"/>
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Nascimento</span>
                                        <CampoData disabled={!modoEdicao} value={form.data_nascimento || ''} onChange={v => setForm({...form, data_nascimento: v})} />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>CPF</span>
                                        <input disabled={!modoEdicao} inputMode="numeric" className={campoClass(modoEdicao)} value={form.cpf || ''} onChange={e => { const cpf = mascaraCpf(e.target.value); setForm({...form, cpf}); if (cpfValido(cpf)) buscarPacientePorCpf(cpf); else setCpfEncontrado(null); }} placeholder="000.000.000.00" />
                                        {cpfEncontrado && <span className="mt-1 block text-[11px] font-medium text-amber-700">CPF já cadastrado: {cpfEncontrado.nome}</span>}
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>WhatsApp</span>
                                        <input disabled={!modoEdicao} inputMode="numeric" className={campoClass(modoEdicao)} value={form.telefone || ''} onChange={e => setForm({...form, telefone: mascaraTelefone(e.target.value)})} placeholder="(00)9 0000-0000" />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>E-mail</span>
                                        <input disabled={!modoEdicao} className={campoClass(modoEdicao)} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Clínica</span>
                                        <CustomSelect disabled={!modoEdicao} value={form.clinica_id || ''} onChange={v => setForm({...form, clinica_id: v})} options={[{value:'',label:'Sem clínica definida'}, ...clinicas.map((c:any) => ({value:String(c.id),label:c.nome}))]} size="sm"/>
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Plano / convênio</span>
                                        <CustomSelect disabled={!modoEdicao} value={form.plano_id || ''} onChange={v => setForm({...form, plano_id: v || null})} options={[{value:'', label:'Particular (sem convênio)'}, ...planos.map((p:any) => ({value:String(p.id), label:p.nome}))]} size="sm"/>
                                    </label>
                                </div>
                                </div>
                            </section>

                            <section className="border-t border-black/5 pt-4">
                                <h4 className="mb-3 text-sm font-semibold text-neutral-900">Endereço</h4>
                                <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
                                    <label className="min-w-0">
                                        <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-neutral-500">
                                            <span>CEP <span className="text-red-500">*</span></span>
                                            {modoEdicao && (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        if (semConexao()) {
                                                            await showAlert('Buscar o CEP precisa de internet. Preencha o endereço manualmente; os dados da ficha continuam disponíveis offline.', { type: 'warning' });
                                                            return;
                                                        }
                                                        const cep = form.cep?.replace(/\D/g, '');
                                                        if (cep?.length === 8) {
                                                            try {
                                                                const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                                                                const data = await res.json();
                                                                if (!data.erro) {
                                                                    setForm({
                                                                        ...form,
                                                                        rua: data.logradouro || form.rua,
                                                                        bairro: data.bairro || form.bairro,
                                                                        cidade: data.localidade || form.cidade,
                                                                        uf: data.uf || form.uf
                                                                    });
                                                                }
                                                            } catch {
                                                                await showAlert('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.', { type: 'warning' });
                                                            }
                                                        }
                                                    }}
                                                    className="alvo-toque font-medium text-neutral-900 hover:underline"
                                                >
                                                    Buscar
                                                </button>
                                            )}
                                        </span>
                                        <input disabled={!modoEdicao} inputMode="numeric" className={campoClass(modoEdicao)} value={form.cep || ''} onChange={e => setForm({...form, cep: mascaraCep(e.target.value)})} placeholder="00000-000" />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Rua / avenida</span>
                                        <input disabled={!modoEdicao} className={campoClass(modoEdicao)} value={form.rua || ''} onChange={e => setForm({...form, rua: e.target.value})} />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Número</span>
                                        <input disabled={!modoEdicao} inputMode="numeric" className={campoClass(modoEdicao)} value={form.numero || ''} onChange={e => setForm({...form, numero: mascaraNumero(e.target.value)})} />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Complemento</span>
                                        <input disabled={!modoEdicao} className={campoClass(modoEdicao)} value={form.complemento || ''} onChange={e => setForm({...form, complemento: e.target.value})} placeholder="Apto, bloco, sala" />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Bairro</span>
                                        <input disabled={!modoEdicao} className={campoClass(modoEdicao)} value={form.bairro || ''} onChange={e => setForm({...form, bairro: e.target.value})} />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Cidade</span>
                                        <input disabled={!modoEdicao} className={campoClass(modoEdicao)} value={form.cidade || ''} onChange={e => setForm({...form, cidade: e.target.value})} />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>UF</span>
                                        <CustomSelect disabled={!modoEdicao} value={form.uf || ''} onChange={v => setForm({...form, uf: v})} options={[{value:'',label:'Selecione...'}, ...['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => ({value:uf,label:uf}))]} size="sm"/>
                                    </label>
                                </div>
                            </section>

                            <section className="border-t border-neutral-200 pt-4">
                                <button type="button" onClick={() => setResponsavelAberto((aberto) => !aberto)} aria-expanded={responsavelAberto} className="alvo-toque mb-2 flex items-center gap-1.5 text-left text-sm font-semibold text-neutral-900">
                                    <ChevronDown size={16} className={`transition-transform ${responsavelAberto ? '' : '-rotate-90'}`} />
                                    Responsável
                                    {menorDeIdade && <span className="text-xs font-medium text-red-500">obrigatório para menor de 18 anos</span>}
                                </button>
                                {responsavelAberto && <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Nome</span>
                                        <input disabled={!modoEdicao} className={campoClass(modoEdicao)} value={form.responsavel_nome || ''} onChange={e => setForm({...form, responsavel_nome: e.target.value})} />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Parentesco</span>
                                        <CustomSelect disabled={!modoEdicao} value={form.responsavel_parentesco || ''} onChange={v => setForm({...form, responsavel_parentesco: v})} options={[{value:'',label:'Selecione...'},{value:'pai',label:'Pai'},{value:'mae',label:'Mãe'},{value:'tutor',label:'Tutor'},{value:'avo',label:'Avô/Avó'},{value:'outro',label:'Outro'}]} size="sm"/>
                                    </label>
                                    <label className="min-w-0">
                                        <span className={campoLabel}>Telefone</span>
                                        <input disabled={!modoEdicao} inputMode="numeric" className={campoClass(modoEdicao)} value={form.responsavel_telefone || ''} onChange={e => setForm({...form, responsavel_telefone: mascaraTelefone(e.target.value)})} placeholder="(00)9 0000-0000" />
                                    </label>
                                </div>}
                            </section>
                        </div>
                        {form.endereco && !form.rua && (
                            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Endereço antigo: {form.endereco}</p>
                        )}
                        {/* Celular e tablet: o formulário é longo e a página rola inteira, então salvar fica preso ao pé da tela, logo acima da barra de navegação. */}
                        {modoEdicao && (
                            <div className="sticky bottom-0 z-10 -mx-3 -mb-4 mt-4 flex gap-2 border-t border-neutral-200 bg-white px-3 py-2.5 sm:-mx-5 sm:justify-end sm:px-5 lg:hidden">
                                <button type="button" onClick={cancelarEdicao} className="h-11 flex-1 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:h-10 sm:flex-none">Cancelar</button>
                                <button type="button" onClick={salvarTudo} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:h-10 sm:flex-none"><Save size={16}/> Salvar</button>
                            </div>
                        )}
                    </div>
                )}

                {abaAtiva === 'anamnese' && (
                    <div className="flex flex-col px-3 pb-4 pt-3 sm:px-5 sm:pt-4 lg:h-full lg:min-h-0 lg:overflow-hidden">
                        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-neutral-900">Anamnese</h3>
                            <div className="flex items-center gap-2">
                                <Link href="/configuracoes?aba=anamnese" className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 sm:h-8"><Settings size={14}/> Modelos</Link>
                                <button type="button" onClick={abrirNovaAnamnese} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 sm:h-8 sm:px-2.5"><Plus size={14}/> Nova anamnese</button>
                            </div>
                        </div>

                        {/* Cabeçalho e ações ficam parados; só as perguntas rolam. */}
                        <Modal open={modalAnamnese} onClose={() => setModalAnamnese(false)} maxWidth="3xl" hideCloseButton panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]">
                            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-4 pt-5">
                                <h3 className="text-base font-semibold text-neutral-900">
                                    {anamneseAtual.id ? 'Editar anamnese' : 'Nova anamnese'}
                                </h3>
                                <button type="button" onClick={() => setModalAnamnese(false)} className={botaoFecharModal} aria-label="Fechar"><X size={16}/></button>
                            </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div>
                                    <label className={campoLabel}>Modelo</label>
                                    <CustomSelect value={anamneseAtual.modelo_id} onChange={v => selecionarModeloAnamnese(v)} options={modelosAnamnese.map(m => ({value:m.id,label:m.nome}))} placeholder="Selecione..." size="md"/>
                                </div>
                                <div>
                                    <label className={campoLabel}>Data</label>
                                    <CampoData value={anamneseAtual.data} onChange={v => setAnamneseAtual({...anamneseAtual, data: v})} />
                                </div>
                                <div>
                                    <label className={campoLabel}>Preenchido por</label>
                                    <SegmentedControl
                                        value={anamneseAtual.preenchido_por === 'paciente' ? 'paciente' : 'profissional'}
                                        onChange={(modo) => {
                                            setAnamneseAtual({ ...anamneseAtual, preenchido_por: modo });
                                            if (modo === 'profissional') setLinkAnamnesePaciente(null);
                                        }}
                                        size="sm"
                                        className="max-sm:h-10"
                                        options={[
                                            { value: 'profissional', label: 'Profissional' },
                                            { value: 'paciente', label: 'Paciente' },
                                        ]}
                                    />
                                </div>
                            </div>

                            {anamnesePorLink ? (
                                <div className="space-y-3 border-t border-neutral-200 pt-4">
                                    <p className="text-sm font-medium text-neutral-800">Link para o paciente preencher no celular.</p>
                                    {linkAnamnesePaciente ? (
                                        <div className="space-y-2">
                                            <div className="flex gap-2">
                                                <input readOnly value={linkAnamnesePaciente.url} className="h-10 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 font-mono text-xs text-neutral-700"/>
                                                <button type="button" onClick={copiarLinkAnamnese} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Copy size={14}/> Copiar</button>
                                            </div>
                                            <p className="text-xs text-neutral-500">Válido até {formatarDataAnamnese(linkAnamnesePaciente.expires_at)}</p>
                                        </div>
                                    ) : (
                                        <button type="button" onClick={gerarLinkAnamnesePaciente} disabled={gerandoLinkAnamnese} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 sm:h-9">
                                            {gerandoLinkAnamnese ? <Loader2 size={14} className="animate-spin"/> : <Link2 size={14}/>} Gerar link
                                        </button>
                                    )}
                                </div>
                            ) : anamneseAtual.modelo_id ? (() => {
                                const modelo = modelosAnamnese.find(m => m.id === anamneseAtual.modelo_id);
                                if (!modelo) return null;
                                return (
                                    <div className="space-y-4 border-t border-neutral-200 pt-4">
                                        {modelo.perguntas.map((p, i) => (
                                            <div key={p.id} className="space-y-1.5">
                                                <label className="flex items-start gap-2 text-sm font-medium text-neutral-800">
                                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[11px] font-medium text-neutral-600">{i+1}</span>
                                                    <span>{p.label}</span>
                                                </label>
                                                <div className="ml-7">
                                                    {p.tipo === 'texto' && (
                                                        <textarea value={anamneseAtual.respostas[p.id] || ''} onChange={e => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: e.target.value}})} className="w-full resize-none rounded-md border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900 max-sm:text-base" rows={2} placeholder="Resposta"/>
                                                    )}
                                                    {p.tipo === 'sim_nao' && (
                                                        <div className="flex h-10 w-fit overflow-hidden rounded-md border border-neutral-200 bg-white sm:h-8">
                                                            {['Sim','Não'].map(opt => (
                                                                <button key={opt} type="button" onClick={() => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: opt}})} className={`h-full border-r border-neutral-200 px-4 text-xs font-medium last:border-r-0 sm:px-3 ${anamneseAtual.respostas[p.id] === opt ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>{opt}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {p.tipo === 'sim_nao_texto' && (() => {
                                                        const atual = (anamneseAtual.respostas[p.id] as RespostaSimNaoTexto) || { sim_nao: '', texto: '' };
                                                        return (
                                                            <div className="space-y-2">
                                                                <div className="flex h-10 w-fit overflow-hidden rounded-md border border-neutral-200 bg-white sm:h-8">
                                                                    {['Sim','Não'].map(opt => (
                                                                        <button key={opt} type="button" onClick={() => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: { ...atual, sim_nao: opt, texto: opt === 'Não' ? '' : atual.texto }}})} className={`h-full border-r border-neutral-200 px-4 text-xs font-medium last:border-r-0 sm:px-3 ${atual.sim_nao === opt ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>{opt}</button>
                                                                    ))}
                                                                </div>
                                                                {atual.sim_nao === 'Sim' && (
                                                                    <textarea value={atual.texto || ''} onChange={e => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: { ...atual, texto: e.target.value }}})} className="w-full resize-none rounded-md border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900 max-sm:text-base" rows={2} placeholder="Especifique"/>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                    {p.tipo === 'multipla' && (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {(p.opcoes || []).map(opt => (
                                                                <button key={opt} type="button" onClick={() => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: opt}})} className={`h-10 rounded-md border px-3 text-xs font-medium sm:h-8 sm:px-2.5 ${anamneseAtual.respostas[p.id] === opt ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>{opt}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })() : (
                                <p className="border-t border-neutral-200 py-6 text-center text-sm text-neutral-400">
                                    Selecione um modelo de anamnese acima para começar.
                                </p>
                            )}
                        </div>
                            {!anamnesePorLink && modeloAnamneseAtual && (
                                <div className="flex shrink-0 flex-wrap gap-2 border-t border-neutral-200 px-5 py-4">
                                    <button type="button" onClick={salvarAnamnese} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-9"><Save size={14}/> {anamneseAtual.id ? 'Atualizar' : 'Salvar'}</button>
                                    <button type="button" onClick={() => emitirAnamnese()} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:h-9"><Printer size={14}/> Imprimir</button>
                                    <button type="button" onClick={() => { setAnamneseAtual({ id: null, modelo_id: '', data: new Date().toISOString().split('T')[0], preenchido_por: 'profissional', respostas: {} }); setLinkAnamnesePaciente(null); }} className="h-10 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 sm:h-9">Limpar</button>
                                </div>
                            )}
                        </Modal>

                        <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:shrink lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)]">
                        {/* A lista só rola por dentro no computador; no celular a página já rola, e uma caixa com rolagem própria atrapalharia. */}
                        <section className="flex flex-col rounded-xl border border-neutral-200 p-3 md:col-span-2 lg:col-span-1 lg:min-h-0 lg:overflow-hidden">
                            <h3 className="mb-2 shrink-0 text-base font-semibold text-neutral-900">Anamneses salvas ({anamnesesAnteriores.length})</h3>
                            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                            {anamnesesAnteriores.length === 0 ? (
                                <p className="py-6 text-sm text-neutral-400">Nenhuma anamnese salva.</p>
                            ) : (
                                <div>
                                    {[...anamnesesAnteriores].sort((a,b) => (b.data||'').localeCompare(a.data||'')).map(a => (
                                        <div
                                            key={a.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setAnamnesePreview(a)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAnamnesePreview(a); } }}
                                            className="flex cursor-pointer flex-wrap items-center gap-x-3 border-b border-neutral-100 py-2.5 sm:flex-nowrap"
                                        >
                                            {/* Celular: nome e datas na largura toda; as três ações descem para uma linha própria, com 40px cada. */}
                                            <div className="min-w-0 flex-1 basis-full sm:basis-0">
                                                <div className="break-words text-sm font-medium text-neutral-900 sm:truncate">{a.modelo_nome}</div>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                                                    <span>{a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '—'}</span>
                                                    <span>{a.preenchido_por === 'paciente' ? 'Paciente' : 'Profissional'}</span>
                                                    {a.criado_em && <span>Criado {formatarDataAnamnese(a.criado_em)}</span>}
                                                    {a.atualizado_em && a.atualizado_em !== a.criado_em && <span>Atualizado {formatarDataAnamnese(a.atualizado_em)}</span>}
                                                </div>
                                            </div>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); editarAnamnese(a); }} className={`${botaoIconeLinha} ml-auto hover:text-neutral-900 sm:ml-0`} aria-label="Editar"><Edit size={14}/></button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); emitirAnamnese(a); }} className={`${botaoIconeLinha} hover:text-neutral-900`} aria-label="Imprimir"><Printer size={14}/></button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); excluirAnamnese(a.id); }} className={`${botaoIconeLinha} hover:text-rose-600`} aria-label="Excluir"><Trash2 size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            </div>
                        </section>
                            <section className="flex flex-col rounded-xl border border-neutral-200 p-3 lg:min-h-0 lg:overflow-y-auto">
                                <h3 className="text-base font-semibold text-neutral-900">Ficha médica</h3>
                                <p className="mb-2 h-4 text-xs text-neutral-500">Digite a condição e pressione Enter.</p>
                                <TagInput
                                    value={getCondicoesFromFicha(ficha)}
                                    onChange={updateCondicoes}
                                    suggestions={LEGACY_CONDICOES}
                                    placeholder="Ex: Diabetes, Hipertensão..."
                                />
                            </section>
                            <section className="flex flex-col rounded-xl border border-neutral-200 p-3 lg:min-h-0 lg:overflow-y-auto">
                                <h3 className="text-base font-semibold text-neutral-900">Medicamentos em uso</h3>
                                <p className="mb-2 h-4 text-xs text-neutral-500">Digite o medicamento e pressione Enter.</p>
                                <TagInput
                                    value={getMedicamentosFromFicha(ficha)}
                                    onChange={updateMedicamentos}
                                    suggestions={MEDICAMENTOS_CATALOGO}
                                    placeholder="Ex: Dipirona, Amoxicilina..."
                                />
                            </section>
                        </div>
                        <section className="mt-3 flex h-44 shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 p-3">
                            <h3 className="mb-2 shrink-0 text-base font-semibold text-neutral-900">Observações clínicas</h3>
                            <textarea value={form.anamnese || ''} onChange={e => setForm({...form, anamnese: e.target.value})} className="min-h-0 w-full flex-1 resize-none overflow-y-auto rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 max-sm:text-base" placeholder="Histórico, queixas e evolução" />
                        </section>
                    </div>
                )}

                {abaAtiva === 'tratamentos' && (
                    <div className="animate-in fade-in space-y-4">
                            <TabEvolucao id={id as string} form={form} ficha={ficha} setFicha={setFicha} evolucoes={evolucoes} setEvolucoes={setEvolucoes}/>
                        <div className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-base font-semibold text-neutral-900">Tratamentos realizados</h3>
                                <button type="button" onClick={() => abrirNovoTratamento()} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 sm:h-8 sm:px-2.5"><Plus size={14}/> Novo</button>
                            </div>

                            {tratamentos.length === 0 ? (
                                <div className="py-6 text-center text-sm text-neutral-400">
                                    Nenhum tratamento registrado ainda.
                                    {marcacoesPendentes.length > 0 && (
                                        <p className="mt-2 text-xs text-neutral-600">
                                            Há {marcacoesPendentes.length} dente{marcacoesPendentes.length === 1 ? '' : 's'} marcado{marcacoesPendentes.length === 1 ? '' : 's'} no odontograma
                                            {' '}({marcacoesPendentes.map((m) => `#${m.num}`).join(', ')}).{' '}
                                            <button type="button" onClick={() => abrirNovoTratamento()} className="alvo-toque inline-block font-semibold text-neutral-900 underline underline-offset-2">
                                                Incluir no novo tratamento
                                            </button>
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {[...tratamentos].sort((a,b) => (b.data||'').localeCompare(a.data||'')).map((t:any) => (
                                        // Celular: cartão empilhado. Procedimento e observação quebram em vez de cortar, e o valor ganha destaque.
                                        <div key={t.id} className="flex items-start gap-3 border-b border-neutral-100 py-2.5 sm:items-center">
                                            <div title={t.dente || undefined} className="h-8 min-w-[2rem] max-w-[5.5rem] shrink-0 truncate rounded-md border border-neutral-200 px-1.5 text-center text-xs font-medium leading-[1.875rem] text-neutral-800">{t.dente || '—'}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:gap-2">
                                                    <span className="min-w-0 break-words text-sm font-medium text-neutral-900 sm:truncate">{t.procedimento}</span>
                                                    <span className="text-[11px] font-medium text-neutral-500">{ROTULO_STATUS_TRATAMENTO[t.status] || t.status}</span>
                                                </div>
                                                <div className="flex min-w-0 flex-wrap items-center gap-x-3 text-[11px] text-neutral-500 sm:flex-nowrap">
                                                    <span className="flex shrink-0 items-center gap-1"><Calendar size={11}/> {t.data ? new Date(t.data).toLocaleDateString('pt-BR') : '-'}</span>
                                                    {t.valor && <span className="shrink-0 text-xs font-semibold text-neutral-900 sm:text-[11px] sm:font-medium sm:text-neutral-700">{formatarMoeda(parseFloat(t.valor) || 0)}</span>}
                                                    {t.observacoes && <span className="min-w-0 basis-full break-words italic sm:basis-auto sm:truncate">&quot;{t.observacoes}&quot;</span>}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center sm:gap-3">
                                                <button type="button" onClick={() => { setTratEdit(t); setModalTrat(true); }} className={`${botaoIconeLinha} hover:text-neutral-900`} aria-label="Editar tratamento"><Edit size={14}/></button>
                                                <button type="button" onClick={() => excluirTratamento(t.id)} className={`${botaoIconeLinha} hover:text-red-600`} aria-label="Excluir tratamento"><Trash2 size={14}/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Valor Total do Orçamento */}
                            {tratamentos.length > 0 && (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-3">
                                    <span className="text-xs font-medium text-neutral-500">{tratamentos.length} registrado{tratamentos.length !== 1 ? 's' : ''}</span>
                                    <span className="text-sm font-semibold text-neutral-900">{formatarMoeda(valorTotalOrcamento)}</span>
                                </div>
                            )}
                        </div>

                        <OrcamentosDoPaciente
                            pacienteId={id}
                            pacienteNome={form.nome || 'Paciente'}
                            clinicaId={form.clinica_id ? Number(form.clinica_id) : null}
                            clinicaNome={clinicasContexto.find((c) => String(c.id) === String(form.clinica_id))?.nome ?? null}
                            onMudou={() => { void listarTratamentos(id).then(setTratamentos).catch(() => undefined); }}
                        />

                    </div>
                )}

                {abaAtiva === 'odontograma' && (
                    <div data-odonto-raiz className="flex flex-col px-3 pb-4 pt-3 sm:px-5 sm:pt-4 lg:h-full lg:min-h-0 lg:overflow-hidden">
                        <div className="mb-3 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap">
                            <div className="min-w-0">
                                <h3 className="text-base font-semibold text-neutral-900">Odontograma</h3>
                                <p className="mt-0.5 truncate text-xs text-neutral-500">
                                    {marcacoesOdonto.length === 0
                                        ? 'Nenhum dente marcado'
                                        : `${marcacoesOdonto.length} ${marcacoesOdonto.length === 1 ? 'dente marcado' : 'dentes marcados'}${marcacoesPendentes.length > 0 ? ` · ${marcacoesPendentes.length} para tratar` : ''}`}
                                </p>
                            </div>
                            <SegmentedControl
                                value={visaoOdonto}
                                onChange={setVisaoOdonto}
                                size="sm"
                                className="col-span-2 row-start-2 w-full max-sm:h-10 sm:order-1 sm:ml-auto sm:w-fit"
                                options={[
                                    { value: 'anatomica', label: 'Anatômica' },
                                    { value: 'esquematica', label: 'Esquemática' },
                                    { value: 'livre', label: 'Texto livre' },
                                ]}
                            />
                            <div className="flex items-center justify-end gap-1.5 sm:order-2 sm:gap-2">
                                {savingOdo && <span className="flex items-center gap-1 text-xs font-medium text-neutral-400"><Loader2 size={12} className="animate-spin"/> <span className="max-sm:hidden">Salvando</span></span>}
                                <button type="button" onClick={imprimirOrcamento} aria-label="PDF" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white text-xs font-medium text-neutral-700 hover:bg-neutral-50 max-sm:w-10 sm:h-8 sm:px-2.5"><Printer size={14}/> <span className="max-sm:hidden">PDF</span></button>
                                <button
                                    type="button"
                                    aria-label="Limpar odontograma"
                                    onClick={async () => {
                                        if (await showConfirm('Limpar todo o odontograma?', { title: 'Limpar', type: 'warning', confirmLabel: 'Limpar' })) resetOdontogramAll();
                                    }}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white text-xs font-medium text-neutral-700 hover:bg-neutral-50 max-sm:w-10 sm:h-8 sm:px-2.5"
                                >
                                    <Eraser size={14}/> <span className="max-sm:hidden">Limpar</span>
                                </button>
                            </div>
                        </div>

                            {visaoOdonto === 'livre' ? (
                                <div className="flex min-h-0 flex-1 flex-col">
                                    <textarea
                                        value={textoOdontogramaLivre}
                                        onChange={e => setTextoOdontogramaLivre(e.target.value)}
                                        className="min-h-[16rem] w-full flex-1 resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm leading-relaxed text-neutral-900 outline-none focus:border-neutral-900 max-sm:text-base"
                                        placeholder="Observações e plano de tratamento"
                                    />
                                    <p className="mt-2 shrink-0 text-xs text-neutral-400">Salvo junto ao odontograma e incluído no PDF.</p>
                                </div>
                            ) : (
                            <>
                            {/* Ferramentas em faixa própria, fora da caixa da arcada, todas à vista sem rolar de lado.
                                Celular: arcada + Vista 3D numa linha e as 8 ferramentas em grade 4×2. Do sm em diante, uma faixa que quebra se precisar. */}
                            <div className="mb-2 flex shrink-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
                                <div className="flex items-center gap-1.5 sm:contents">
                                    <div className="min-w-0 flex-1 sm:w-36 sm:flex-none sm:shrink-0">
                                        <CustomSelect
                                            value={tipoArcada}
                                            onChange={(v) => setTipoArcada(v as 'permanente' | 'leite')}
                                            options={[{ value: 'permanente', label: 'Permanentes' }, { value: 'leite', label: 'De leite' }]}
                                            size="xs"
                                            triggerClassName="max-sm:h-10"
                                        />
                                    </div>
                                    {!mostrar3D && (
                                        <button
                                            type="button"
                                            onClick={() => setMostrar3D(true)}
                                            className="inline-flex h-10 shrink-0 items-center rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 sm:order-last sm:h-8 sm:px-2.5"
                                        >
                                            Vista 3D
                                        </button>
                                    )}
                                </div>
                                {/* No celular as ferramentas ficam no painel do dente, junto das faces. */}
                                <p className="text-xs text-neutral-500 sm:hidden">Toque num dente para marcar.</p>
                                <div className="hidden sm:contents">
                                    {TOOLS.map(t => (
                                        <button
                                            key={t.key}
                                            type="button"
                                            aria-pressed={ferramenta === t.key}
                                            onClick={() => setFerramenta(t.key)}
                                            className={`inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-md border px-1 text-[11px] font-medium tracking-tight sm:h-8 sm:tracking-normal sm:shrink-0 sm:justify-start sm:gap-1.5 sm:px-2.5 sm:text-xs ${ferramenta === t.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                                        >
                                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
                                            <span className="truncate">{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={`shrink-0 ${mostrar3D ? 'grid grid-cols-1 items-stretch gap-2 lg:min-h-0 lg:flex-1 lg:shrink lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:overflow-hidden' : ''}`}>
                            {/* A arcada se ajusta à caixa: inteira (2 fileiras) quando os dentes ficam com tamanho bom de usar,
                                senão um quadrante por fileira (4 fileiras de 8). Só em tela muito estreita sobra rolar de lado, dentro desta caixa.
                                Sem justify-center quando rola, senão a metade esquerda ficaria fora do alcance; o mx-auto do filho centra. */}
                            <div ref={medirOdonto} className={`flex min-h-0 min-w-0 rounded-xl border border-neutral-200 bg-white px-1 py-2 sm:py-3 ${telaToque ? 'overflow-x-auto overflow-y-hidden overscroll-x-contain' : 'items-center justify-center overflow-hidden'}`}>
                                {(() => {
                                    const isEsq = visaoOdonto === 'esquematica';
                                    const quad = tipoArcada === 'permanente' ? QUAD_PERM : QUAD_LEITE;
                                    const larguraDente = 56;
                                    const larguraQuadrante = quad.sup[0].length * larguraDente;
                                    const larguraArcada = larguraQuadrante * 2 + 20;
                                    // Alturas em tamanho real (zoom 1): imagem lateral + quadrado oclusal + número, por fileira.
                                    const alturaFileira = (isEsq ? 0 : IMG_H + 4) + 56 + 20;
                                    const alturaArcada = alturaFileira * 2 + 25;
                                    const alturaQuadrantes = alturaFileira * 4 + 2 * 20 + 25;
                                    const disponivel = Math.max(0, odontoLargura - 8);
                                    // Desktop: pode crescer um pouco além do tamanho real, até a altura livre. As imagens são pequenas, então o teto é baixo.
                                    const ZOOM_MAX = telaToque ? 1 : 1.15;
                                    const tetoAltura = (altura: number) => (odontoAlturaLivre > 0 ? odontoAlturaLivre / altura : Infinity);
                                    const zoomInteira = disponivel ? Math.min(ZOOM_MAX, disponivel / larguraArcada, tetoAltura(alturaArcada)) : 0.72;
                                    const zoomQuadrante = disponivel ? Math.min(ZOOM_MAX, disponivel / larguraQuadrante, tetoAltura(alturaQuadrantes)) : 0.72;
                                    // Toque pede alvo maior: abaixo de 0,7 a arcada inteira vira quadrantes; abaixo de 0,62 os quadrantes rolam de lado.
                                    const MIN_INTEIRA = telaToque ? 0.7 : 0.6;
                                    const MIN_QUADRANTE = 0.62;
                                    const porQuadrante = disponivel > 0 && zoomInteira < MIN_INTEIRA && zoomQuadrante > zoomInteira;
                                    const zoom = porQuadrante ? Math.max(zoomQuadrante, telaToque ? MIN_QUADRANTE : 0) : zoomInteira;
                                    const dentes = (lista: number[], isUpper: boolean) => lista.map(n => <Tooth key={n} num={n} isUpper={isUpper} esquematico={isEsq} toque={telaToque} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} aoTocar={telaCelular ? () => abrirDente(n) : undefined} />);
                                    const alinharSup = isEsq ? 'items-center' : 'items-end';
                                    const alinharInf = isEsq ? 'items-center' : 'items-start';
                                    return (
                                        <div className={telaToque ? 'mx-auto shrink-0' : 'origin-center'} style={{ zoom }}>
                                            {porQuadrante ? (
                                                <div className="inline-flex min-w-max select-none flex-col items-center">
                                                    <div className={`flex justify-center ${alinharSup}`}>{dentes(quad.sup[0], true)}</div>
                                                    <div className="my-2 w-full border-t-2 border-dashed border-neutral-300" />
                                                    <div className={`flex justify-center ${alinharSup}`}>{dentes(quad.sup[1], true)}</div>
                                                    <div className="my-3 h-px w-full bg-neutral-400" />
                                                    <div className={`flex justify-center ${alinharInf}`}>{dentes(quad.inf[0], false)}</div>
                                                    <div className="my-2 w-full border-t-2 border-dashed border-neutral-300" />
                                                    <div className={`flex justify-center ${alinharInf}`}>{dentes(quad.inf[1], false)}</div>
                                                </div>
                                            ) : (
                                                <div className="inline-flex min-w-max select-none flex-col items-center">
                                                    <div className={`flex justify-center ${alinharSup}`}>
                                                        {dentes(quad.sup[0], true)}
                                                        <div className="mx-2 w-1 self-stretch border-l-2 border-dashed border-neutral-300"></div>
                                                        {dentes(quad.sup[1], true)}
                                                    </div>
                                                    <div className="my-3 h-px w-full bg-gradient-to-r from-transparent via-neutral-400 to-transparent"></div>
                                                    <div className={`flex justify-center ${alinharInf}`}>
                                                        {dentes(quad.inf[0], false)}
                                                        <div className="mx-2 w-1 self-stretch border-l-2 border-dashed border-neutral-300"></div>
                                                        {dentes(quad.inf[1], false)}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                            {/* Só rola de lado quando nem um quadrante (dentes de 56px no zoom mínimo de 0,62) cabe na caixa. */}
                            {telaToque && odontoLargura > 0 && odontoLargura - 8 < (tipoArcada === 'permanente' ? QUAD_PERM : QUAD_LEITE).sup[0].length * 56 * 0.62 && (
                                <p className="mt-1.5 text-[11px] text-neutral-400">Arraste para o lado para ver os outros dentes.</p>
                            )}

                            {/* Celular: painel do dente. Acima da barra de navegação do app (z-110). */}
                            <Modal open={telaCelular && denteAberto !== null} onClose={() => setDenteAberto(null)} zIndex={120} maxWidth="md" hideCloseButton
                                className="!p-0 sm:!p-4" panelClassName="rounded-t-2xl sm:rounded-2xl shadow-xl [:where(&)]:max-h-[95dvh]">
                                {denteAberto !== null && (() => {
                                    const quad = tipoArcada === 'permanente' ? QUAD_PERM : QUAD_LEITE;
                                    const sequencia = [...quad.sup[0], ...quad.sup[1], ...quad.inf[0], ...quad.inf[1]];
                                    const n = denteAberto;
                                    return (
                                        <PainelDente
                                            num={n}
                                            sequencia={sequencia}
                                            state={odontograma[n] || { faces: {}, cond: 'normal' }}
                                            ferramenta={ferramenta}
                                            onFerramenta={setFerramenta}
                                            onFace={(f) => aplicarFerramenta(n, f)}
                                            onTodasFaces={() => aplicarFerramenta(n, null)}
                                            onCondicao={(c) => alternarCondicaoDente(n, c)}
                                            onLimpar={() => limparDente(n)}
                                            onTratar={() => { setDenteAberto(null); abrirNovoTratamento([n]); }}
                                            onTrocar={setDenteAberto}
                                            onFechar={() => setDenteAberto(null)}
                                        />
                                    );
                                })()}
                            </Modal>

                            {mostrar3D && (
                                <div className="flex h-[22rem] min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-[#f8f8f6] p-2 lg:h-auto">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-neutral-500">Vista 3D</span>
                                        <button
                                            type="button"
                                            onClick={() => setMostrar3D(false)}
                                            className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 sm:h-8 sm:px-2.5"
                                        >
                                            Fechar
                                        </button>
                                    </div>
                                    <div className="min-h-0 flex-1">
                                        <OdontogramaContainer />
                                    </div>
                                    {FDI_MISSING_IN_3D.length > 0 && (
                                        <p className="mt-2 text-[10px] text-neutral-400">
                                            Sem modelo 3D: {FDI_MISSING_IN_3D.join(', ')}.
                                        </p>
                                    )}
                                </div>
                            )}
                            </div>

                            {/* Marcações no mesmo cartão das outras abas (Tratamentos realizados): título, ação principal à direita, vazio centrado. */}
                            <section className="mt-3 flex shrink-0 flex-col rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 lg:min-h-0 lg:flex-1 lg:shrink lg:overflow-hidden">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <h3 className="text-base font-semibold text-neutral-900">Marcações</h3>
                                    {marcacoesPendentes.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => abrirNovoTratamento()}
                                            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 sm:h-8 sm:px-2.5"
                                        >
                                            <Plus size={14} /> Tratar marcações
                                        </button>
                                    )}
                                </div>
                                {marcacoesOdonto.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-neutral-400">Nenhuma marcação. {telaCelular ? 'Toque num dente' : 'Escolha uma ferramenta e clique numa face'} para marcar.</p>
                                ) : (
                                    <ul className="-mx-3 grid content-start sm:-mx-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:overflow-y-auto">
                                        {marcacoesOdonto.map((m) => (
                                            <li key={m.num} className="flex items-center gap-2 border-t border-neutral-100 px-3 py-2 sm:px-4 lg:odd:border-r">
                                                <button
                                                    type="button"
                                                    onClick={() => (telaCelular ? abrirDente(m.num) : abrirNovoTratamento([m.num]))}
                                                    className="min-w-0 flex-1 rounded-md text-left"
                                                    title={telaCelular ? 'Abrir o dente' : 'Abrir tratamento deste dente'}
                                                >
                                                    <span className="flex items-baseline gap-1.5">
                                                        <span className="text-sm font-semibold tabular-nums text-neutral-900">{m.num}</span>
                                                        <span className="truncate text-xs text-neutral-500">{nomeDoDente(m.num)}</span>
                                                        {m.precisaTratamento && (
                                                            <span className="ml-auto shrink-0 text-[11px] font-medium text-amber-700">Para tratar</span>
                                                        )}
                                                    </span>
                                                    <span className="mt-1 flex flex-wrap gap-1">
                                                        {m.cond !== 'normal' && (
                                                            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-1.5 py-0.5 text-[11px] font-medium text-white">
                                                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ODONTO_TOOLS.find((t) => t.key === m.cond)?.color }} />
                                                                {ODONTO_TOOLS.find((t) => t.key === m.cond)?.label || m.cond}
                                                            </span>
                                                        )}
                                                        {facesPorStatus(m.num, m.faces).map(({ status, rotulo, nomes }) => (
                                                            <span key={status} className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700">
                                                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: FACE_COLORS[status], boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
                                                                {rotulo} · {nomes.join(', ')}
                                                            </span>
                                                        ))}
                                                    </span>
                                                </button>
                                                <button type="button" onClick={() => limparDente(m.num)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50 hover:text-rose-600 sm:h-8 sm:w-8" aria-label={`Limpar dente ${m.num}`}><X size={14}/></button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                            </>
                            )}
                    </div>
                )}

                {abaAtiva === 'documentos' && (
                    <div>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-neutral-900">Documentos</h3>
                            <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
                                <SegmentedControl
                                    value={visualDocs}
                                    onChange={setVisualDocs}
                                    size="sm"
                                    className="w-fit shrink-0 max-sm:h-10 max-sm:w-24"
                                    options={[
                                        { value: 'bloco', label: <LayoutGrid size={14} />, ariaLabel: 'Blocos' },
                                        { value: 'lista', label: <List size={14} />, ariaLabel: 'Lista' },
                                    ]}
                                />
                                <button type="button" onClick={() => setModalDoc(true)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 max-sm:flex-1 sm:h-8"><Printer size={14}/> Emitir</button>
                                <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800 max-sm:flex-1 sm:h-8 ${uploadingDoc ? 'pointer-events-none opacity-50' : ''}`}>
                                    {uploadingDoc ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>} Enviar
                                    <input type="file" className="hidden" onChange={uploadDocumento} disabled={uploadingDoc} accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp,image/gif,application/pdf"/>
                                </label>
                            </div>
                        </div>

                        {documentos.length === 0 ? (
                            <p className="py-8 text-center text-sm text-neutral-400">Nenhum documento. JPG, PNG, WEBP, GIF, PDF, DOC ou TXT, até 10 MB.</p>
                        ) : (
                            <div>
                                {/* Celular: as três ordenações viram uma linha de botões de 40px; data e tamanho descem para baixo do nome. */}
                                <div className="flex items-center gap-4 pb-1 text-xs font-medium text-neutral-400 sm:grid sm:grid-cols-[minmax(0,1.6fr)_7rem_6rem_5.5rem] sm:gap-3 sm:pb-2">
                                    {([['nome', 'Nome'], ['data', 'Data'], ['tamanho', 'Tamanho']] as const).map(([campo, rotulo]) => (
                                        <button key={campo} type="button" onClick={() => alternarOrdemDocs(campo)} className="inline-flex min-h-[40px] items-center gap-1 text-left hover:text-neutral-900 sm:min-h-0">
                                            {rotulo}
                                            <ArrowUpDown size={12} className={ordemDocs.campo === campo ? 'text-neutral-900' : 'text-neutral-300'} />
                                        </button>
                                    ))}
                                    <span className="hidden text-right sm:block">Ações</span>
                                </div>
                                {visualDocs === 'lista' ? (
                                    <div>
                                        {documentosOrdenados().map(d => (
                                            <div key={d.id} className="flex items-center gap-2 border-t border-neutral-100 py-1.5 sm:grid sm:grid-cols-[minmax(0,1.6fr)_7rem_6rem_5.5rem] sm:gap-3 sm:py-2.5">
                                                <button type="button" onClick={() => abrirDocumento(d)} className="min-h-[40px] min-w-0 flex-1 text-left text-sm font-medium text-neutral-900 hover:underline sm:min-h-0 sm:truncate">
                                                    <span className="block break-words sm:inline">{d.nome}</span>
                                                    <span className="block text-xs font-normal text-neutral-500 sm:hidden">{d.criado_em ? new Date(d.criado_em).toLocaleDateString('pt-BR') : '—'}{d.tamanho ? ` · ${(d.tamanho / 1024).toFixed(0)} KB` : ''}</span>
                                                </button>
                                                <span className="hidden text-xs text-neutral-500 sm:block">{d.criado_em ? new Date(d.criado_em).toLocaleDateString('pt-BR') : '—'}</span>
                                                <span className="hidden text-xs text-neutral-500 sm:block">{d.tamanho ? `${(d.tamanho / 1024).toFixed(0)} KB` : '—'}</span>
                                                <div className="flex shrink-0 justify-end">
                                                    <button type="button" onClick={() => baixarDocumento(d)} className={`${botaoIconeLinha} hover:text-neutral-900`} aria-label="Baixar"><Download size={14}/></button>
                                                    <button type="button" onClick={() => excluirDocumento(d.id)} className={`${botaoIconeLinha} hover:text-rose-600`} aria-label="Excluir"><Trash2 size={14}/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                        {documentosOrdenados().map(d => (
                                            <div key={d.id} className="overflow-hidden rounded-xl border border-neutral-200">
                                                <button type="button" onClick={() => abrirDocumento(d)} className="relative flex h-32 w-full flex-col items-center justify-center gap-2 overflow-hidden bg-neutral-50 text-neutral-500">
                                                    {d.previewUrl && d.previewVista === 'imagem' ? (
                                                        <img src={d.previewUrl} alt="" className="h-full w-full object-cover" />
                                                    ) : d.previewUrl && d.previewVista === 'pdf' ? (
                                                        <iframe src={`${d.previewUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`} title="" scrolling="no" className="pointer-events-none absolute left-0 top-0 h-48 w-[calc(100%+20px)] border-0 bg-white" />
                                                    ) : !semConexao() && (documentoEhImagem(d) || documentoEhPdf(d)) && !d.previewVista ? (
                                                        <span className="absolute inset-0 animate-pulse bg-neutral-100" />
                                                    ) : (
                                                        <>
                                                            <FileText size={28} />
                                                            <span className="text-xs font-medium">Arquivo</span>
                                                        </>
                                                    )}
                                                </button>
                                                <div className="flex items-center gap-1 border-t border-neutral-100 py-1 pl-2.5 pr-1 sm:gap-2 sm:px-3 sm:py-2">
                                                    <button type="button" onClick={() => abrirDocumento(d)} className="min-h-[40px] min-w-0 flex-1 text-left text-xs font-medium text-neutral-800 sm:min-h-0 sm:truncate"><span className="break-words max-sm:line-clamp-2">{d.nome}</span></button>
                                                    {/* Celular: baixar e excluir vão para um menu. Dois ícones de 40px ao lado do nome não cabem num cartão de meia tela. */}
                                                    <MenuPontos
                                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 sm:hidden"
                                                        itens={[
                                                            { id: 'baixar', label: 'Baixar', onClick: () => { void baixarDocumento(d); } },
                                                            { id: 'excluir', label: 'Excluir', perigo: true, onClick: () => { void excluirDocumento(d.id); } },
                                                        ]}
                                                    />
                                                    <button type="button" onClick={() => baixarDocumento(d)} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 max-sm:hidden" aria-label="Baixar"><Download size={13}/></button>
                                                    <button type="button" onClick={() => excluirDocumento(d.id)} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-rose-600 max-sm:hidden" aria-label="Excluir"><Trash2 size={13}/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {abaAtiva === 'debitos' && (
                    <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-neutral-900">Débitos</h3>
                                <p className="mt-1 text-sm text-neutral-500">
                                    {debitos.length === 0 ? 'Nada em aberto' : `${debitos.length} em aberto · ${formatarMoeda(debitos.reduce((s, d) => s + (d.valor || 0), 0))}`}
                                </p>
                            </div>
                            <button type="button" onClick={abrirModalDebitoManual} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 sm:h-8 sm:px-2.5"><Plus size={14}/> Adicionar</button>
                        </div>

                        {debitos.length === 0 ? (
                            <p className="py-8 text-center text-sm text-neutral-400">Nenhum débito em aberto.</p>
                        ) : (
                            // Celular: um cartão por débito, com a descrição inteira em cima e valor + Receber embaixo. A partir de sm volta a ser uma lista de linhas.
                            <div className="space-y-2 sm:space-y-0 sm:overflow-hidden sm:rounded-xl sm:border sm:border-neutral-200">
                                {debitos.map(d => (
                                    <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-neutral-200 p-3 sm:flex-nowrap sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-neutral-100 sm:px-3 sm:py-2.5 sm:last:border-b-0">
                                        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                                            <div className="break-words text-sm font-medium text-neutral-900 sm:truncate">{d.descricao || d.procedimento}</div>
                                            <p className="mt-0.5 text-xs text-neutral-500">
                                                {d.data_hora ? new Date(d.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '—'}
                                                {d.profissionais?.nome ? ` · ${d.profissionais.nome}` : ''}
                                                {' · '}{d.origem === 'manual' ? 'Manual' : 'Atendimento'}
                                            </p>
                                        </div>
                                        <p className="mr-auto shrink-0 text-base font-semibold text-neutral-900 sm:mr-0 sm:text-sm">{formatarMoeda(d.valor || 0)}</p>
                                        <button type="button" onClick={() => marcarComoPago(d.id)} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 sm:h-8 sm:px-2.5"><CheckCircle size={13}/> Receber</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {abaAtiva === 'hof' && (
                    <div>
                        <link
                            rel="preload"
                            as="image"
                            href={faceHofAtiva === 'feminina' ? '/hof/imagem_feminina.png' : '/hof/imagem_masculina.png'}
                        />
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-neutral-900">Harmonização</h3>
                            <button type="button" aria-label="Limpar marcações" onClick={async () => { if(marcacoesHof.length && await showConfirm('Limpar todas as marcações?', { title: 'Limpar', type: 'warning', confirmLabel: 'Limpar' })) setMarcacoesHof([]); }} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white text-xs font-medium text-neutral-700 hover:bg-neutral-50 max-sm:w-10 sm:h-8 sm:px-2.5"><Eraser size={14}/> <span className="max-sm:hidden">Limpar</span></button>
                        </div>
                        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                        <div className="min-w-0">
                        <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                            <SegmentedControl
                                value={faceHofAtiva}
                                onChange={setFaceHofAtiva}
                                size="sm"
                                className="w-full max-sm:h-10 sm:w-auto"
                                options={[
                                    { value: 'feminina', label: 'Feminino' },
                                    { value: 'masculina', label: 'Masculino' },
                                ]}
                            />
                            <SegmentedControl
                                value={hofModo}
                                onChange={(modo) => { setHofModo(modo); if (modo === 'visualizar') setHofPopover({ x: 0, y: 0, open: false }); }}
                                size="sm"
                                className="w-full max-sm:h-10 sm:w-auto"
                                options={[
                                    { value: 'visualizar', label: 'Visualizar' },
                                    { value: 'alterar', label: 'Alterar' },
                                ]}
                            />
                            <SegmentedControl
                                value={hofVista}
                                onChange={(vista) => { setHofVista(vista); if (vista !== 'mapa') setHofPopover({ x: 0, y: 0, open: false }); }}
                                size="sm"
                                className="col-span-2 w-full max-sm:h-10 sm:w-auto"
                                options={[
                                    { value: 'mapa', label: 'Mapa' },
                                    { value: 'demo', label: 'Demonstração' },
                                    { value: 'frontal', label: 'Frontal' },
                                ]}
                            />
                        </div>
                        {/* Celular e tablet: a sessão vem antes do mapa, porque cada ponto marcado entra na sessão escolhida aqui. No computador ela fica na coluna ao lado. */}
                        <div className="mb-3 sm:w-40 lg:hidden">
                            <label className={campoLabel}>Sessão</label>
                            <CampoData value={hofSessaoAtiva} onChange={setHofSessaoAtiva} />
                        </div>
                        <p className="mb-3 text-xs text-neutral-400">{hofVista === 'demo' ? 'Ilustração na foto fixa, para demonstrar. Não é o resultado clínico.' : hofVista === 'frontal' ? 'Ilustração na foto frontal desta sessão. Não é o resultado clínico.' : hofModo === 'alterar' ? `${telaToque ? 'Toque' : 'Clique'} no rosto para marcar.` : 'Visualizar não cria pontos novos.'}</p>

                        {hofVista === 'mapa' && hofModo === 'alterar' && (
                            <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:hidden [&::-webkit-scrollbar]:hidden">
                                {HOF_TIPOS.map(t => (
                                    <button key={t.key} type="button" aria-pressed={hofTipoAtivo === t.key} onClick={() => setHofTipoAtivo(t.key)} className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium sm:h-8 sm:px-2.5 ${hofTipoAtivo === t.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}>
                                        <span className="h-2.5 w-2.5 rounded-sm border border-black/10" style={{ background: t.color }}/>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-center">
                            <div
                                ref={hofSurfaceRef}
                                className={`relative w-full max-w-lg select-none lg:max-w-[min(32rem,51vh)] overflow-hidden rounded-xl border border-neutral-200 bg-[#f3f4f1] bg-cover bg-center bg-no-repeat ${hofVista === 'mapa' && hofModo === 'alterar' ? 'cursor-crosshair' : 'cursor-default'}`}
                                style={{
                                    aspectRatio: '3/4',
                                    backgroundImage: hofVista === 'mapa'
                                        ? (faceHofAtiva === 'feminina' ? "url('/hof/imagem_feminina.png')" : "url('/hof/imagem_masculina.png')")
                                        : undefined,
                                    touchAction: 'manipulation',
                                }}
                                onClick={hofVista === 'mapa' && hofModo === 'alterar' ? handleFaceClick : undefined}
                            >
                                {hofVista !== 'mapa' && (
                                    hofVista === 'frontal' && !hofFotos.some((f) => f.sessao === hofSessaoAtiva && f.angulo === 'Frontal' && f.dataUrl) ? (
                                        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                                            <p className="text-sm font-medium text-neutral-800">Envie a foto frontal desta sessão.</p>
                                            <p className="text-xs text-neutral-500">A ilustração usa essa foto. Não é o resultado clínico.</p>
                                            <label className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white sm:h-8 ${enviandoFoto ? 'pointer-events-none opacity-50' : ''}`}>
                                                <Camera size={12}/> Enviar frontal
                                                <input type="file" accept="image/*" className="hidden" disabled={!!enviandoFoto} onChange={(e) => uploadHofFoto(e, 'Frontal')} />
                                            </label>
                                        </div>
                                    ) : (
                                        <HofPreviewRosto
                                            src={hofVista === 'demo'
                                                ? (faceHofAtiva === 'feminina' ? '/hof/imagem_feminina.png' : '/hof/imagem_masculina.png')
                                                : (hofFotos.filter((f) => f.sessao === hofSessaoAtiva && f.angulo === 'Frontal' && f.dataUrl).slice(-1)[0]?.dataUrl || '')}
                                            marks={marcacoesHof.map((m) => ({ x: m.x, y: m.y, tipo: m.tipo, dosagem: m.dosagem }))}
                                            referencia={faceHofAtiva}
                                        />
                                    )
                                )}
                                {hofVista === 'mapa' && (<>
                                {/* Labels anatômicos sobre a imagem */}
                                <span className="pointer-events-none absolute left-1/2 top-[22%] -translate-x-1/2 text-[10px] font-medium text-white/85" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4)' }}>Testa</span>
                                <span className="pointer-events-none absolute left-[7%] top-[34%] origin-center -rotate-90 text-[10px] font-medium text-white/85" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4)' }}>Temporal</span>
                                <span className="pointer-events-none absolute right-[7%] top-[34%] origin-center rotate-90 text-[10px] font-medium text-white/85" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4)' }}>Temporal</span>
                                <span className="pointer-events-none absolute left-1/2 top-[81%] -translate-x-1/2 text-[10px] font-medium text-white/85" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4)' }}>Mento</span>

                                {/* Marcações renderizadas com cor do tipo */}
                                {marcacoesHof.map(m => {
                                    const ti = hofTipoInfo(m.tipo);
                                    return (
                                    <div key={m.id} className="absolute group" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%, -50%)' }}>
                                        <div className={`h-4 w-4 cursor-pointer rounded-full border-2 border-white/90 ring-2 ring-offset-1 transition-transform hover:scale-150 ${ti.ring}`} style={{ background: ti.color, boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }}/>
                                        {/* Tooltip */}
                                        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block pointer-events-none">
                                            <div className="w-max max-w-[15rem] rounded-md bg-neutral-900 px-3 py-2.5 text-[11px] text-white">
                                                <div className="mb-1 flex items-center gap-1.5">
                                                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ti.color }}/>
                                                    <span className="text-[11px] font-medium text-white">{ti.label}</span>
                                                </div>
                                                <div className="whitespace-normal leading-snug">{m.texto}</div>
                                                {(m.dosagem || m.produto) && (
                                                    <div className="mt-1 flex flex-wrap gap-x-3 border-t border-white/15 pt-1 text-[11px] text-white/70">
                                                        {m.dosagem && <span>Dose: <span className="font-medium text-white">{m.dosagem} {m.unidade}</span></span>}
                                                        {m.produto && <span>Produto: <span className="font-medium text-white">{m.produto}</span></span>}
                                                    </div>
                                                )}
                                                <div className="mt-1 text-[11px] text-white/50">{new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                                                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-neutral-900"/>
                                            </div>
                                        </div>
                                        <button onClick={(ev) => { ev.stopPropagation(); excluirMarcacaoHof(m.id); }} className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white transition-colors hover:bg-rose-600 group-hover:flex" title="Excluir"><X size={10}/></button>
                                    </div>
                                    );
                                })}

                                {/* Popover de inserção expandido */}
                                {/* --hof-pop é a altura da caixa mais a folga: no celular os campos têm 40px e a caixa fica mais alta (264px contra 232px). */}
                                {hofPopover.open && (
                                    <div
                                        className="absolute z-40 [--hof-pop:232px] max-sm:[--hof-pop:264px]"
                                        style={hofPopover.y > 45
                                            ? { left: `clamp(136px, ${hofPopover.x}%, calc(100% - 136px))`, top: `clamp(var(--hof-pop), ${hofPopover.y}%, calc(100% - 8px))`, transform: 'translate(-50%, calc(-100% - 10px))' }
                                            : { left: `clamp(136px, ${hofPopover.x}%, calc(100% - 136px))`, top: `clamp(8px, ${hofPopover.y}%, calc(100% - var(--hof-pop)))`, transform: 'translate(-50%, 10px)' }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <div className="w-64 rounded-xl border border-neutral-200 bg-white p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: hofTipoInfo(hofTipoAtivo).color }}/>
                                                    <span className="text-xs font-medium text-neutral-800">{hofTipoInfo(hofTipoAtivo).label}</span>
                                                </div>
                                                <button type="button" onClick={() => setHofPopover({x:0,y:0,open:false})} aria-label="Fechar" className="-my-2 -mr-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:m-0 sm:h-auto sm:w-auto sm:p-0.5"><X size={12}/></button>
                                            </div>
                                            <textarea value={hofTexto} onChange={e => setHofTexto(e.target.value)} autoFocus placeholder="Observação do procedimento..." className="h-16 w-full resize-none rounded-md border border-neutral-200 p-2 text-xs outline-none focus:border-neutral-900 max-sm:text-base sm:h-14"/>
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className={campoLabel}>Dosagem ({hofTipoInfo(hofTipoAtivo).unidadePadrao || '-'})</label>
                                                    <input type="text" value={hofDosagem} onChange={e => setHofDosagem(e.target.value)} placeholder={({ U: 'Ex: 20', mL: 'Ex: 1', un: 'Ex: 4', sess: 'Ex: 1' } as Record<string, string>)[hofTipoInfo(hofTipoAtivo).unidadePadrao] || 'Ex: 1'} className="h-10 w-full rounded-md border border-neutral-200 px-2 text-xs outline-none focus:border-neutral-900 sm:h-8"/>
                                                </div>
                                                <div>
                                                    <label className={campoLabel}>Produto</label>
                                                    <input type="text" value={hofProduto} onChange={e => setHofProduto(e.target.value)} placeholder="Ex: Botox" className="h-10 w-full rounded-md border border-neutral-200 px-2 text-xs outline-none focus:border-neutral-900 sm:h-8"/>
                                                </div>
                                            </div>
                                            <button type="button" onClick={salvarMarcacaoHof} disabled={!hofTexto.trim()} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-neutral-900 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-8"><Plus size={12}/> Salvar</button>
                                        </div>
                                    </div>
                                )}
                                </>)}
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap justify-center gap-4">
                            {HOF_TIPOS.map(t => {
                                const count = marcacoesHof.filter(m => m.tipo === t.key).length;
                                if (!count) return null;
                                return <span key={t.key} className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }}/>{t.label} ({count})</span>;
                            })}
                        </div>

                        </div>
                        <aside className="flex min-w-0 flex-col lg:min-h-[28rem]">
                            <h4 className="mb-2 hidden text-sm font-semibold text-neutral-900 lg:block">Procedimentos</h4>
                            <div className="hidden flex-wrap gap-1.5 lg:flex">
                                {HOF_TIPOS.map(t => (
                                    <button key={t.key} type="button" onClick={() => setHofTipoAtivo(t.key)} className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${hofTipoAtivo === t.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                                        <span className="h-2.5 w-2.5 rounded-sm border border-black/10" style={{ background: t.color }}/>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <div className="border-t border-neutral-200 pt-3 lg:mt-4">
                                <h4 className="mb-2 text-sm font-semibold text-neutral-900">Aplicação atual</h4>
                                {hofAlertas.length === 0 ? <p className="text-xs text-neutral-400">Nenhuma reaplicação prevista.</p> : hofAlertas.map(alerta => (
                                    <div key={alerta.tipo} className="flex items-start justify-between gap-3 border-b border-neutral-100 py-2 text-sm text-neutral-800">
                                        <span className="flex min-w-0 items-start gap-2"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: alerta.cor }}/><span>{alerta.label} — {alerta.diasRestantes <= 0 ? 'reaplicação vencida' : `próxima em ${alerta.diasRestantes} dias (${alerta.vencimento.toLocaleDateString('pt-BR')})`}</span></span>
                                        <span className="shrink-0 text-xs text-neutral-400">Última {new Date(alerta.ultimaSessao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3 lg:mt-auto">
                                {/* Abaixo de lg o campo Sessão fica acima do mapa. */}
                                <div className="hidden w-40 lg:block"><label className={campoLabel}>Sessão</label><CampoData value={hofSessaoAtiva} onChange={setHofSessaoAtiva} /></div>
                                <button type="button" onClick={() => setModalProtocolo(true)} className="inline-flex h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 max-sm:flex-1 max-sm:border max-sm:border-neutral-200 sm:h-8"><Zap size={12}/> Protocolos</button>
                                <button type="button" onClick={gerarTermoConsentimentoHof} className="inline-flex h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 max-sm:flex-1 max-sm:border max-sm:border-neutral-200 sm:h-8"><ShieldCheck size={12}/> Termo</button>
                                <button type="button" onClick={imprimirMapaHof} className="inline-flex h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 max-sm:flex-1 max-sm:border max-sm:border-neutral-200 sm:h-8"><Printer size={12}/> PDF</button>
                                <button type="button" onClick={salvarHof} disabled={savingHof} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 max-sm:w-full sm:ml-auto sm:h-8 sm:text-xs">{savingHof ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} {savingHof ? 'Salvando...' : 'Salvar procedimento HOF'}</button>
                            </div>
                        </aside>
                        </div>

                        {/* Fotos da Sessão Ativa */}
                        <div className="mt-6 border-t border-neutral-200 pt-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-sm font-semibold text-neutral-900">Fotos da sessão ({hofFotos.filter(f => f.sessao === hofSessaoAtiva).length})</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {['Frontal', 'Perfil E', 'Perfil D', '45° E', '45° D'].map(angulo => (
                                        <label key={angulo} className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 sm:h-8 sm:px-2.5 ${enviandoFoto === angulo ? 'cursor-wait opacity-60' : enviandoFoto ? 'cursor-not-allowed opacity-40' : ''}`}>
                                            {enviandoFoto === angulo ? <><Loader2 size={12} className="animate-spin"/> Enviando...</> : <><Camera size={12}/> {angulo}</>}
                                            <input type="file" accept="image/*" className="hidden" disabled={!!enviandoFoto} onChange={e => uploadHofFoto(e, angulo)}/>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {hofFotos.filter(f => f.sessao === hofSessaoAtiva).length > 0 && (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                                    {hofFotos.filter(f => f.sessao === hofSessaoAtiva).map(f => (
                                        <div key={f.id} className="group/foto relative aspect-[3/4] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                                            <img src={f.dataUrl} alt={f.angulo} className="h-full w-full object-cover"/>
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                                <span className="text-[11px] font-medium text-white">{f.angulo}</span>
                                            </div>
                                            <button type="button" onClick={() => excluirHofFoto(f.id)} className="absolute right-1.5 top-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900/80 text-white hover:bg-rose-600 sm:hidden sm:h-6 sm:w-6 sm:group-hover/foto:flex" aria-label="Excluir foto"><X size={12}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Histórico por Sessões */}
                        {hofSessoes.length > 0 && (
                            <div className="mt-6 border-t border-neutral-200 pt-4">
                                <h4 className="mb-3 text-sm font-semibold text-neutral-900">Histórico de sessões ({hofSessoes.length})</h4>
                                <div className="space-y-4">
                                    {hofSessoes.map(sessao => {
                                        const itens = marcacoesHof.filter(m => (m.sessao || m.data) === sessao);
                                        const fotosSessao = hofFotos.filter(f => f.sessao === sessao);
                                        const totalDoseToxina = itens.filter(m => m.tipo === 'toxina' && m.dosagem).reduce((s, m) => s + (parseFloat(m.dosagem) || 0), 0);
                                        return (
                                            <div key={sessao} className="overflow-hidden rounded-xl border border-neutral-200">
                                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-neutral-200 bg-[#f8f8f6] px-3 py-2.5 sm:px-4">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <Calendar size={14} className="shrink-0 text-neutral-600"/>
                                                        <span className="truncate text-sm font-semibold text-neutral-900">{new Date(sessao + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-neutral-500">
                                                        {itens.length > 0 && <span>{itens.length} ponto{itens.length > 1 ? 's' : ''}</span>}
                                                        {fotosSessao.length > 0 && <span className="text-neutral-600">{fotosSessao.length} foto{fotosSessao.length > 1 ? 's' : ''}</span>}
                                                        {totalDoseToxina > 0 && <span className="text-red-500">Toxina: {totalDoseToxina}U</span>}
                                                    </div>
                                                </div>
                                                {/* Fotos da sessão */}
                                                {fotosSessao.length > 0 && (
                                                    <div className="flex gap-2 overflow-x-auto border-b border-neutral-100 p-3">
                                                        {fotosSessao.map(f => (
                                                            <div key={f.id} className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md border border-neutral-200">
                                                                <img src={f.dataUrl} alt={f.angulo} className="h-full w-full object-cover"/>
                                                                <div className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-center text-[10px] font-medium text-white">{f.angulo}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {itens.length > 0 && (
                                                <div className="divide-y divide-neutral-100">
                                                    {itens.map((m) => {
                                                        const ti = hofTipoInfo(m.tipo);
                                                        return (
                                                            <div key={m.id} className="group/item flex items-start gap-3 px-3 py-2.5 hover:bg-neutral-50 sm:px-4">
                                                                <span className="mt-1 h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ background: ti.color }}/>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                                        <span className="text-xs font-medium text-neutral-500">{ti.label}</span>
                                                                        <span className="break-words text-sm font-medium text-neutral-900">{m.texto}</span>
                                                                    </div>
                                                                    {(m.dosagem || m.produto) && (
                                                                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-neutral-500">
                                                                            {m.dosagem && <span>Dose: {m.dosagem} {m.unidade}</span>}
                                                                            {m.produto && <span>Produto: {m.produto}</span>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <button type="button" onClick={() => excluirMarcacaoHof(m.id)} className="-my-1 -mr-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-opacity hover:bg-neutral-100 hover:text-rose-600 sm:m-0 sm:h-auto sm:w-auto sm:p-1.5 sm:opacity-0 sm:group-hover/item:opacity-100" aria-label="Excluir ponto"><Trash2 size={14}/></button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {abaAtiva === 'historico' && (() => {
                    const termo = buscaHistorico.trim().toLowerCase();
                    const lista = historico.filter((h: any) => !termo || String(h.procedimento || '').toLowerCase().includes(termo));
                    const rotuloStatus = (status: string) => status === 'fiado' ? 'Em débito' : status === 'concluido' ? 'Concluído' : status === 'agendado' ? 'Agendado' : status === 'cancelado' ? 'Cancelado' : (status || 'Registrado');
                    const formatarQuando = (valor: string) => new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const formatarQuandoCurto = (valor: string) => new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const marcos: Array<{ id: string; ref: string; ancora?: string; quando: string; titulo: string; detalhe: string; valor?: number }> = [];
                    historico.forEach((h: any) => {
                        const valor = Number(h.valor_final ?? h.valor ?? 0);
                        const nome = h.procedimento || 'Atendimento';
                        marcos.push({
                            id: `ag-${h.id}`,
                            ref: String(h.id),
                            ancora: String(h.id),
                            quando: h.data_hora,
                            titulo: nome,
                            detalhe: `${h.profissionais?.nome || 'Profissional'} · ${rotuloStatus(h.status)}${h.observacoes ? ` · ${h.observacoes}` : ''}`,
                            valor,
                        });
                        const inicio = new Date(h.data_hora).getTime();
                        const pago = h.data_pagamento ? new Date(h.data_pagamento).getTime() : 0;
                        const debitoPosterior = pago > 0 && pago - inicio > 2 * 60 * 1000;
                        if (valor > 0 && (h.status === 'fiado' || debitoPosterior)) {
                            marcos.push({ id: `add-${h.id}`, ref: String(h.id), quando: h.data_hora, titulo: 'Foi adicionado um débito', detalhe: `${nome} · ${formatarMoeda(valor)}`, valor });
                        }
                        if (valor > 0 && debitoPosterior) {
                            marcos.push({ id: `out-${h.id}`, ref: String(h.id), quando: h.data_pagamento, titulo: 'Foi retirado um débito', detalhe: nome, valor });
                        }
                    });
                    registrosDebito.forEach((d: any) => {
                        if (d.agendamento_id) return;
                        const valor = Number(d.valor) || 0;
                        const nome = d.descricao || 'Débito manual';
                        if (d.created_at) marcos.push({ id: `man-add-${d.id}`, ref: `deb-${d.id}`, quando: d.created_at, titulo: 'Foi adicionado um débito', detalhe: `${nome}${valor ? ` · ${formatarMoeda(valor)}` : ''}`, valor });
                        if (d.status === 'pago' && d.data_pagamento) marcos.push({ id: `man-out-${d.id}`, ref: `deb-${d.id}`, quando: d.data_pagamento, titulo: 'Foi retirado um débito', detalhe: nome, valor });
                    });
                    marcos.sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || '')));
                    return (
                    <div>
                        <div className="relative mb-4">
                            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                            <input
                                value={buscaHistorico}
                                onChange={(evento) => setBuscaHistorico(evento.target.value)}
                                placeholder="Buscar procedimento"
                                className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                            />
                        </div>
                        <div className="grid min-h-0 items-start gap-4 lg:grid-cols-[2fr_3fr]">
                        <div className="min-w-0">
                            <h3 className="mb-3 text-base font-semibold text-neutral-900">Histórico</h3>
                            {lista.length === 0 ? (
                                <p className="py-8 text-center text-sm text-neutral-400">{historico.length === 0 ? 'Nenhum atendimento registrado.' : 'Nenhum procedimento encontrado.'}</p>
                            ) : (
                                // Celular: um cartão por atendimento, já com data, profissional, situação e valor. A partir de sm volta a ser o índice de uma linha.
                                <div className="space-y-2 sm:space-y-0 sm:overflow-hidden sm:rounded-xl sm:border sm:border-neutral-200">
                                    {lista.map((h: any, indice: number) => {
                                        const ativo = String(historicoSel) === String(h.id);
                                        const valor = Number(h.valor_final ?? h.valor ?? 0);
                                        return (
                                            <button key={h.id} type="button" onClick={() => setHistoricoSel(ativo ? null : String(h.id))} className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left sm:items-center sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-neutral-100 sm:last:border-b-0 ${ativo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50'}`}>
                                                <span className={`w-5 shrink-0 text-xs font-semibold tabular-nums max-sm:leading-5 ${ativo ? 'text-white/70' : 'text-neutral-400'}`}>{indice + 1}</span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block break-words text-sm font-medium sm:truncate">{h.procedimento || 'Atendimento'}</span>
                                                    <span className={`mt-0.5 block text-xs sm:hidden ${ativo ? 'text-white/70' : 'text-neutral-500'}`}>
                                                        {h.data_hora ? formatarQuandoCurto(h.data_hora) : '—'} · {h.profissionais?.nome || 'Profissional'} · {rotuloStatus(h.status)}
                                                    </span>
                                                </span>
                                                {valor > 0 && <span className="shrink-0 text-sm font-semibold sm:hidden">{formatarMoeda(valor)}</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="mb-3 text-base font-semibold text-neutral-900">Linha do tempo</h3>
                            {marcos.length === 0 ? (
                                <p className="py-8 text-center text-sm text-neutral-400">Nenhum evento registrado.</p>
                            ) : (
                                // A caixa com rolagem própria só existe no computador; no celular a linha do tempo segue a rolagem da página.
                                <div className="relative pl-4 lg:max-h-[32rem] lg:overflow-y-auto">
                                    <div className="absolute bottom-2 left-[7px] top-2 w-px bg-neutral-200" />
                                    {marcos.map((marco) => {
                                        const ativo = !!historicoSel && marco.ref === String(historicoSel);
                                        return (
                                            <div key={marco.id} id={marco.ancora ? `linha-${marco.ancora}` : undefined} className="relative pb-4 pl-5">
                                                <span className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${ativo ? 'bg-neutral-900' : 'bg-neutral-300'}`} />
                                                <div className={`rounded-xl border px-4 py-3 ${ativo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white'}`}>
                                                    <div className="flex items-baseline justify-between gap-3">
                                                        <span className="text-sm font-semibold">{marco.titulo}</span>
                                                        {marco.valor ? <span className="shrink-0 text-sm font-semibold">{formatarMoeda(marco.valor)}</span> : null}
                                                    </div>
                                                    <p className={`mt-1 text-xs ${ativo ? 'text-white/70' : 'text-neutral-500'}`}>{marco.quando ? formatarQuando(marco.quando) : ''}</p>
                                                    <p className={`mt-1 text-xs ${ativo ? 'text-white/90' : 'text-neutral-700'}`}>{marco.detalhe}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        </div>
                    </div>
                    );
                })()}

            </div>
        </div>

        {/* MODAL TRATAMENTO */}
        {/* Título e botões ficam parados; só os campos rolam. `relative` no miolo faz os checkboxes sr-only rolarem junto com ele. */}
        <Modal open={modalTrat} onClose={() => setModalTrat(false)} maxWidth="lg" hideCloseButton panelClassName="flex max-h-[90vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]">
                    <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-5">
                        <h3 className="text-base font-semibold text-neutral-900">{tratEdit.id ? 'Editar' : 'Novo'} tratamento</h3>
                        <button type="button" onClick={() => setModalTrat(false)} className={botaoFecharModal} aria-label="Fechar"><X size={16}/></button>
                    </div>
                    <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-1">
                        {!tratEdit.id && marcacoesOdonto.length > 0 && (
                            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                                <p className="border-b border-neutral-100 px-3 py-2 text-xs font-medium text-neutral-500">Do odontograma</p>
                                {/* No celular o miolo do modal já rola: a lista não ganha uma segunda rolagem. */}
                                <div className="sm:max-h-44 sm:overflow-y-auto">
                                    {marcacoesOdonto.map((m) => {
                                        const ativo = (tratEdit.dentesSelecionados || parseDentesCampo(tratEdit.dente).map(String)).includes(String(m.num));
                                        return (
                                            <button
                                                key={m.num}
                                                type="button"
                                                onClick={() => toggleDenteTratamento(String(m.num))}
                                                aria-pressed={ativo}
                                                className={`flex w-full items-center gap-3 border-b border-neutral-100 px-3 py-2.5 text-left last:border-b-0 sm:py-2 ${ativo ? 'bg-neutral-900 text-white' : 'bg-white hover:bg-neutral-50'}`}
                                            >
                                                <span className="w-10 shrink-0 text-sm font-semibold">#{m.num}</span>
                                                <span className={`min-w-0 flex-1 break-words text-xs font-medium sm:truncate ${ativo ? 'text-white/75' : 'text-neutral-500'}`}>{textoMarcacao(m.cond, m.faces)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <label className="relative flex cursor-pointer items-start gap-2 border-t border-neutral-100 px-3 py-2.5">
                                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${tratEdit.atualizarOdontograma ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
                                        {tratEdit.atualizarOdontograma && <Check size={11} strokeWidth={3} />}
                                    </span>
                                    <input type="checkbox" className="sr-only" checked={!!tratEdit.atualizarOdontograma} onChange={(e) => setTratEdit({ ...tratEdit, atualizarOdontograma: e.target.checked })} />
                                    <span className="text-xs text-neutral-600">Ao concluir, marcar cáries desses dentes como tratado no odontograma</span>
                                </label>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={campoLabel}>Dente</label>
                                <input placeholder="16, 26" value={tratEdit.dente} onChange={e => setTratEdit({...tratEdit, dente: e.target.value, dentesSelecionados: parseDentesCampo(e.target.value).map(String)})} className={campoClass(true)}/>
                            </div>
                            <div>
                                <label className={campoLabel}>Data</label>
                                <CampoData value={tratEdit.data} onChange={v => setTratEdit({...tratEdit, data: v})} />
                            </div>
                        </div>
                        <div>
                            <label className={campoLabel}>Procedimento</label>
                            <input placeholder="Restauração em resina" value={tratEdit.procedimento} onChange={e => setTratEdit({...tratEdit, procedimento: e.target.value})} className={campoClass(true)}/>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={campoLabel}>Status</label>
                                <CustomSelect value={tratEdit.status} onChange={v => setTratEdit({...tratEdit, status: v})} options={[{value:'planejado',label:'Planejado'},{value:'andamento',label:'Em Andamento'},{value:'concluido',label:'Concluído'}]}/>
                            </div>
                            <div>
                                <label className={campoLabel}>Valor (R$)</label>
                                <input type="number" step="0.01" value={tratEdit.valor} onChange={e => setTratEdit({...tratEdit, valor: e.target.value})} className={campoClass(true)}/>
                            </div>
                        </div>
                        <div>
                            <label className={campoLabel}>Observações</label>
                            <textarea value={tratEdit.observacoes} onChange={e => setTratEdit({...tratEdit, observacoes: e.target.value})} className="h-20 w-full resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 max-sm:text-base" />
                        </div>
                        {/* Agendar na Agenda — o respiro fica no label, para a caixa inteira (44px) ser o alvo do toque. */}
                        <div className={`rounded-md border ${tratEdit.agendarNaAgenda ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white'}`}>
                            <label className="flex cursor-pointer items-center gap-3 p-3">
                                <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${tratEdit.agendarNaAgenda ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
                                    {tratEdit.agendarNaAgenda && <Check size={14}/>}
                                </div>
                                <input type="checkbox" className="hidden" checked={tratEdit.agendarNaAgenda || false} onChange={e => setTratEdit({...tratEdit, agendarNaAgenda: e.target.checked})} />
                                <div className="flex items-center gap-2">
                                    <CalendarPlus size={16} className="text-neutral-500"/>
                                    <span className="text-sm font-medium text-neutral-800">Agendar consulta na agenda</span>
                                </div>
                            </label>
                            {tratEdit.agendarNaAgenda && (
                                <div className="pb-3 pl-11 pr-3">
                                    <label className={campoLabel}>Horário</label>
                                    <input type="time" value={tratEdit.horaAgendamento || '09:00'} onChange={e => setTratEdit({...tratEdit, horaAgendamento: e.target.value})} className="box-border h-10 w-full max-w-[160px] rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"/>
                                    <p className="mt-1.5 text-xs text-neutral-500">Consulta em {tratEdit.data ? new Date(tratEdit.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'} às {tratEdit.horaAgendamento || '09:00'}.</p>
                                </div>
                            )}
                        </div>
                        {/* Pagamento pendente */}
                        {parseFloat(tratEdit.valor) > 0 && (
                        <div className={`rounded-md border ${tratEdit.pagamentoPendente ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white'}`}>
                            <label className="flex cursor-pointer items-center gap-3 p-3">
                                <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${tratEdit.pagamentoPendente ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
                                    {tratEdit.pagamentoPendente && <Check size={14}/>}
                                </div>
                                <input type="checkbox" className="hidden" checked={tratEdit.pagamentoPendente || false} onChange={e => setTratEdit({...tratEdit, pagamentoPendente: e.target.checked})} />
                                <span className="text-sm font-medium text-neutral-800">Pagamento pendente</span>
                            </label>
                            {tratEdit.pagamentoPendente && (
                                <p className="-mt-1 pb-3 pl-11 pr-3 text-xs text-neutral-500">O valor fica na aba Débitos até ser recebido.</p>
                            )}
                        </div>
                        )}
                    </div>
                    <div className="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-4">
                        <button type="button" onClick={() => setModalTrat(false)} className="h-10 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 sm:h-9">Cancelar</button>
                        <button type="button" onClick={salvarTratamento} disabled={salvandoTrat} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 sm:h-9"><Save size={14}/> {salvandoTrat ? 'Salvando...' : 'Salvar'}</button>
                    </div>
        </Modal>

        {/* MODAL PROTOCOLOS HOF */}
        <Modal open={modalProtocolo} onClose={() => setModalProtocolo(false)} maxWidth="lg" hideCloseButton panelClassName="flex max-h-[80vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]">
                    <div className="shrink-0 px-5 pb-4 pt-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-neutral-900">Protocolos</h3>
                        <button type="button" onClick={() => setModalProtocolo(false)} className={botaoFecharModal} aria-label="Fechar"><X size={16}/></button>
                    </div>
                    <p className="text-xs text-neutral-500">Aplica os pontos na sessão ativa. Doses e produtos continuam editáveis.</p>
                    </div>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5">
                        {HOF_PROTOCOLOS.map((proto, idx) => {
                            const tipos = Array.from(new Set(proto.pontos.map(p => p.tipo)));
                            return (
                                <button key={idx} type="button" onClick={() => aplicarProtocolo(idx)} className="group w-full rounded-md border border-neutral-200 p-3 text-left hover:bg-neutral-50">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <div className="flex shrink-0 -space-x-1">
                                                {tipos.map(t => <span key={t} className="w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ background: hofTipoInfo(t).color }}/>)}
                                            </div>
                                            <span className="min-w-0 break-words text-sm font-medium text-neutral-900">{proto.nome}</span>
                                        </div>
                                        <span className="shrink-0 text-xs text-neutral-400">{proto.pontos.length} pontos</span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-neutral-500">
                                        {tipos.map(t => {
                                            const ti = hofTipoInfo(t);
                                            const pontosT = proto.pontos.filter(p => p.tipo === t);
                                            const dose = pontosT.reduce((s, p) => s + (parseFloat(p.dosagem) || 0), 0);
                                            return <span key={t} style={{ color: ti.color }}>{ti.label}: {dose}{ti.unidadePadrao}</span>;
                                        })}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
        </Modal>

        {/* Fecha pelo X do cabeçalho, igual aos outros modais da ficha (o X padrão do componente tem 32px e cor slate). */}
        <Modal open={!!anamnesePreview} onClose={() => setAnamnesePreview(null)} maxWidth="2xl" hideCloseButton panelClassName="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]">
            {anamnesePreview && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 p-5">
                        <div className="min-w-0">
                        <h3 className="break-words text-base font-semibold text-neutral-900">{anamnesePreview.modelo_nome}</h3>
                        <p className="mt-1 text-xs text-neutral-500">
                            {anamnesePreview.data ? new Date(anamnesePreview.data).toLocaleDateString('pt-BR') : '—'}
                            {' · '}
                            {anamnesePreview.preenchido_por === 'paciente' ? 'Paciente' : 'Profissional'}
                            {anamnesePreview.criado_em ? ` · Criado ${formatarDataAnamnese(anamnesePreview.criado_em)}` : ''}
                        </p>
                        </div>
                        <button type="button" onClick={() => setAnamnesePreview(null)} className={`${botaoFecharModal} -mt-1.5`} aria-label="Fechar"><X size={16}/></button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 sm:max-h-[60vh]">
                        {(anamnesePreview.perguntas_snapshot || []).map((p: { id: string; label: string }, i: number) => (
                            <div key={p.id}>
                                <p className="text-xs font-medium text-neutral-500">{i + 1}. {p.label}</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
                                    {formatarRespostaAnamnese(anamnesePreview.respostas?.[p.id])}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="flex shrink-0 justify-end gap-2 border-t border-neutral-200 p-4">
                        <button type="button" onClick={() => setAnamnesePreview(null)} className="h-10 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 sm:h-9">Fechar</button>
                        <button type="button" onClick={() => { editarAnamnese(anamnesePreview); }} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:h-9"><Edit size={14}/> Editar</button>
                        <button type="button" onClick={() => emitirAnamnese(anamnesePreview)} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-9"><Printer size={14}/> Imprimir</button>
                    </div>
                </div>
            )}
        </Modal>

        <Modal open={modalDebitoManual} onClose={() => setModalDebitoManual(false)} maxWidth="md" hideCloseButton panelClassName="flex max-h-[90vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]">
            <div className="shrink-0 border-b border-neutral-200 p-5">
                <h3 className="text-base font-semibold text-neutral-900">Adicionar débito</h3>
                <p className="mt-1 text-xs text-neutral-500">Descrição livre, ou marque atendimentos e tratamentos como não pagos.</p>
            </div>
            <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                <div>
                    <label className={campoLabel}>Descrição</label>
                    <input value={formDebito.descricao} onChange={(e) => setFormDebito({ ...formDebito, descricao: e.target.value })} className={campoClass(true)} placeholder="Restauração, consulta, material" />
                </div>
                <div>
                    <label className={campoLabel}>Valor (R$)</label>
                    <input type="number" min="0" step="0.01" value={formDebito.valor} onChange={(e) => setFormDebito({ ...formDebito, valor: e.target.value })} className={campoClass(true)} />
                </div>
                {(debitoOpcoes.agendamentos.length > 0 || debitoOpcoes.tratamentos.length > 0) && (
                    <div className="space-y-3 border-t border-neutral-200 pt-3">
                        <p className="text-xs font-medium text-neutral-500">Marcar como não pago</p>
                        {debitoOpcoes.agendamentos.length > 0 && (
                            <div className="space-y-1.5 rounded-md border border-neutral-200 p-2 sm:max-h-52 sm:overflow-y-auto">
                                <p className="bg-white py-1 text-xs font-medium text-neutral-500 sm:sticky sm:top-0">Agendamentos ({debitoOpcoes.agendamentos.length})</p>
                                {debitoOpcoes.agendamentos.map((a) => (
                                    <label key={a.id} className="relative flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md border border-neutral-100 px-2 py-1.5 hover:bg-neutral-50 sm:min-h-0">
                                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${formDebito.agendamentosMarcados.includes(a.id) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
                                            {formDebito.agendamentosMarcados.includes(a.id) && <Check size={11} strokeWidth={3} />}
                                        </span>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={formDebito.agendamentosMarcados.includes(a.id)}
                                            onChange={(e) => setFormDebito((prev) => ({
                                                ...prev,
                                                agendamentosMarcados: e.target.checked
                                                    ? [...prev.agendamentosMarcados, a.id]
                                                    : prev.agendamentosMarcados.filter((id) => id !== a.id),
                                            }))}
                                        />
                                        <span className="min-w-0 flex-1 break-words text-xs font-medium text-neutral-800 sm:truncate">{a.procedimento}</span>
                                        <span className="shrink-0 text-[11px] text-neutral-400">{formatarMoeda(Number(a.valor_final ?? a.valor ?? 0))}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {debitoOpcoes.tratamentos.length > 0 && (
                            <div className="space-y-1.5 rounded-md border border-neutral-200 p-2 sm:max-h-52 sm:overflow-y-auto">
                                <p className="bg-white py-1 text-xs font-medium text-neutral-500 sm:sticky sm:top-0">Tratamentos ({debitoOpcoes.tratamentos.length})</p>
                                {debitoOpcoes.tratamentos.map((t) => (
                                    <label key={t.id} className="relative flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md border border-neutral-100 px-2 py-1.5 hover:bg-neutral-50 sm:min-h-0">
                                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${formDebito.tratamentosMarcados.includes(String(t.id)) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
                                            {formDebito.tratamentosMarcados.includes(String(t.id)) && <Check size={11} strokeWidth={3} />}
                                        </span>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={formDebito.tratamentosMarcados.includes(String(t.id))}
                                            onChange={(e) => setFormDebito((prev) => ({
                                                ...prev,
                                                tratamentosMarcados: e.target.checked
                                                    ? [...prev.tratamentosMarcados, String(t.id)]
                                                    : prev.tratamentosMarcados.filter((id) => id !== String(t.id)),
                                            }))}
                                        />
                                        <span className="min-w-0 flex-1 break-words text-xs font-medium text-neutral-800 sm:truncate">{t.procedimento}</span>
                                        <span className="shrink-0 text-[11px] text-neutral-400">{formatarMoeda(Number(t.valor ?? 0))}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-neutral-200 p-4">
                <button type="button" onClick={() => setModalDebitoManual(false)} className="h-10 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 sm:h-9">Cancelar</button>
                <button type="button" onClick={salvarDebitoManual} disabled={salvandoDebito} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 sm:h-9">
                    {salvandoDebito && <Loader2 size={14} className="animate-spin"/>} Salvar
                </button>
            </div>
        </Modal>
        <ModalNovoAgendamento
            open={!!agendaHof}
            onClose={() => setAgendaHof(null)}
            pacienteId={String(id)}
            pacienteNome={form.nome || ''}
            clinicaId={form.clinica_id ? String(form.clinica_id) : ''}
            procedimento={agendaHof?.procedimento || ''}
            observacoes={agendaHof?.observacoes || ''}
            data={agendaHof?.data}
            onSaved={() => showAlert('Agendamento salvo na agenda.', { type: 'success' })}
        />
        <Modal open={!!docAberto} onClose={fecharDocumento} maxWidth="4xl" hideCloseButton panelClassName="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
                <h3 className="min-w-0 truncate text-base font-semibold text-neutral-900">{docAberto?.nome}</h3>
                <button type="button" onClick={fecharDocumento} className={botaoFecharModal} aria-label="Fechar"><X size={16}/></button>
            </div>
            <div className="max-h-[75vh] min-h-0 overflow-auto bg-neutral-50 p-3">
                {docAberto?.isImg ? (
                    <img src={docAberto.url} alt={docAberto.nome} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md" />
                ) : docAberto?.isPdf ? (
                    <iframe title={docAberto.nome} src={docAberto.url} className="h-[70vh] w-full rounded-md bg-white" />
                ) : docAberto ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-sm text-neutral-600">
                        <FileText size={28} />
                        <p>Este arquivo abre pelo download, sem sair do sistema.</p>
                        <a href={docAberto.url} download={docAberto.nome} className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white sm:h-9">Baixar</a>
                    </div>
                ) : null}
            </div>
        </Modal>

    </div>
  );
}