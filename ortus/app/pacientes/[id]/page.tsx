'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { User, Phone, Edit, ArrowLeft, Save, Loader2, FileText, Clock, Trash2, Calendar, CalendarPlus, Pill, AlertTriangle, Stethoscope, X, Check, Building2, Printer, Smile, Plus, Eraser, CheckCircle, ClipboardList, FolderOpen, AlertCircle, Upload, Download, Image as ImageIcon, DollarSign, Settings, Sparkles, Camera, Bell, ArrowLeftRight, ShieldCheck, Zap, Link2, Copy, ChevronDown, LayoutGrid, List, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { carregarModelos, formatarRespostaAnamnese, respostaInicial, type ModeloAnamnese, type RespostaAnamnese, type RespostaSimNaoTexto } from '@/lib/anamnese';
// teeth-data lib no longer needed — using PNG images from /assets/dentes/
import { fetchUserClinicas } from '@/lib/clinicScoped';
import { useClinica } from '@/app/context/ClinicaContext';
import { registrarAudit } from '@/lib/auditLog';
import TabEvolucao from './TabEvolucao';
import CustomSelect from '@/components/ui/CustomSelect';
import TagInput from '@/components/ui/TagInput';
import Modal from '@/components/ui/Modal';
import { MEDICAMENTOS_CATALOGO } from '@/lib/medicamentosCatalogo';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarPaciente, isMenorDeIdade } from '@/lib/pacienteValidation';
import { cpfValido, mascaraCep, mascaraCpf, mascaraNumero, mascaraTelefone, variantesCpf } from '@/lib/mascaras';
import { prepararFotoPaciente } from '@/lib/prepararFotoPaciente';
import CampoData from '@/components/ui/CampoData';
import HofPreviewRosto from '@/components/clinico/HofPreviewRosto';
import { carregarConfig } from '@/lib/configClinica';
import { buildDocumentoContexto, aplicarVariaveisDocumento } from '@/lib/documentVariables';
import { printDocument, printQaBlock, printSignatureBlock, printTable, escapePrintHtml } from '@/lib/printDocument';
import PatientContactButtons from '@/components/PatientContactButtons';
import { carregarTaxasAtivas, receberAgendamento } from '@/lib/recebimentoAgendamento';
import { criarDebitoManual, listarDebitosPaciente, listarOpcoesMarcarNaoPago, marcarAgendamentoNaoPago, receberDebito } from '@/lib/debitosPaciente';
import { calcularValorLiquido, type TaxaMaquininha } from '@/lib/configDefaults';
import { registrarComissaoTratamentoFinalizado } from '@/lib/comissao';
import { carregarProntuario } from '@/lib/fichaPaciente';
import { criarAnamnese, atualizarAnamnese, excluirAnamnese as excluirAnamneseDb, gerarLinkAnamnesePaciente as gerarLinkAnamnesePacienteApi } from '@/lib/db/anamneses';
import { criarDocumento, excluirDocumento as excluirDocumentoDb } from '@/lib/db/documentos';
import { salvarFichaClinica } from '@/lib/db/fichaClinica';
import ModalNovoAgendamento from '@/components/agenda/ModalNovoAgendamento';
import { atualizarTratamento, criarTratamento, excluirTratamento as excluirTratamentoDb } from '@/lib/db/tratamentos';
import type { TratamentoPaciente } from '@/lib/db/types';
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

const prontuarioPanel = '';

const campoLabel = 'mb-1.5 block text-xs font-medium text-neutral-500';

function campoClass(editing: boolean) {
  return `box-border h-10 max-h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 disabled:cursor-default ${
    editing ? 'focus:border-neutral-900' : ''
  }`;
}

const PATIENT_NAV_SECTIONS = [
  { key: 'dados', label: 'Dados', icon: User },
  { key: 'anamnese', label: 'Anamnese', icon: FileText },
  { key: 'tratamentos', label: 'Odontograma e Tratamentos', icon: Smile },
  { key: 'documentos', label: 'Documentos', icon: FolderOpen },
  { key: 'debitos', label: 'Débitos', icon: DollarSign },
  { key: 'hof', label: 'HOF', icon: Sparkles },
  { key: 'historico', label: 'Histórico', icon: Clock },
];

const LEGACY_CONDICOES = [
  'Diabetes', 'Hipertensão', 'Cardiopatia', 'Asma/Bronquite',
  'Alergia Antibiótico', 'Alergia Anestésico', 'Gestante', 'Fumante', 'Uso de Anticoagulante',
];

function getCondicoesFromFicha(ficha: Record<string, unknown>): string[] {
  if (Array.isArray(ficha.condicoes)) return ficha.condicoes as string[];
  return LEGACY_CONDICOES.filter((k) => Boolean(ficha[k]));
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

const STROKE = '#475569';        // slate-600 (cor do traço)

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
function ToothOcclusal({ num, state, ferramenta, onApply }: { num: number; state: ToothState; ferramenta: string; onApply: (face: Face) => void }) {
  const [hoverFace, setHoverFace] = useState<Face | null>(null);
  const cond = state.cond;
  const isAusente = cond === 'ausente';
  const isCoroa = cond === 'coroa';
  const tool = TOOLS.find(t => t.key === ferramenta);
  const previewColor = tool?.tipo === 'face' ? tool.color : null;

  const o = OCC_BOX.outer;
  const i = OCC_BOX.inner;

  return (
    <div className="relative">
      <svg viewBox="0 0 60 60" width="48" height="48" className={`${isAusente ? 'opacity-25' : ''} block`}>
        {/* Quadrado externo */}
        <rect x={o.x} y={o.y} width={o.w} height={o.h} rx="3" ry="3" fill="transparent" stroke={isCoroa ? '#f59e0b' : STROKE} strokeWidth="1" strokeLinejoin="round"/>

        {/* 5 zonas clicáveis (4 trapézios + quadrado central) */}
        {(['V','D','L','M','O'] as Face[]).map(f => {
          const status = state.faces[f];
          const baseFill = status ? FACE_COLORS[status] : 'transparent';
          const isHover = hoverFace === f;
          const fill = isHover && previewColor ? previewColor : baseFill;
          const opacity = (baseFill === 'transparent' && !isHover) ? 0 : 0.85;
          return (
            <path key={f} d={OCC_ZONES[f]} fill={fill} fillOpacity={opacity}
              onClick={(e) => { e.stopPropagation(); onApply(f); }}
              onMouseEnter={() => setHoverFace(f)}
              onMouseLeave={() => setHoverFace(null)}
              className="cursor-pointer transition-opacity"/>
          );
        })}

        {/* Linhas do X (diagonais dos cantos externos para os cantos internos) */}
        <g stroke={STROKE} strokeWidth="0.8" fill="none" strokeLinecap="round" style={{pointerEvents:'none'}}>
          <line x1={o.x} y1={o.y} x2={i.x} y2={i.y}/>
          <line x1={o.x + o.w} y1={o.y} x2={i.x + i.w} y2={i.y}/>
          <line x1={o.x + o.w} y1={o.y + o.h} x2={i.x + i.w} y2={i.y + i.h}/>
          <line x1={o.x} y1={o.y + o.h} x2={i.x} y2={i.y + i.h}/>
        </g>

        {/* Quadrado central (Oclusal) */}
        <rect x={i.x} y={i.y} width={i.w} height={i.h} fill="none" stroke={STROKE} strokeWidth="0.8" style={{pointerEvents:'none'}}/>

        {cond === 'extracao' && <g stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" style={{pointerEvents:'none'}}><line x1={o.x+1} y1={o.y+1} x2={o.x+o.w-1} y2={o.y+o.h-1}/><line x1={o.x+o.w-1} y1={o.y+1} x2={o.x+1} y2={o.y+o.h-1}/></g>}
      </svg>
      {hoverFace && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-900 text-white text-[10px] font-bold rounded whitespace-nowrap pointer-events-none z-20 shadow-lg">
          #{num} · {FACE_LABELS[hoverFace]}
        </div>
      )}
    </div>
  );
}

function Tooth({ num, state, ferramenta, onApply, isUpper, esquematico }: { num: number; state: ToothState; ferramenta: string; onApply: (face: Face | null) => void; isUpper: boolean; esquematico?: boolean }) {
  return (
    <div className="flex flex-col items-center select-none w-[56px] shrink-0">
      {isUpper ? (
        <>
          {!esquematico && <><ToothLateral num={num} state={state} isUpper={true}/><div className="h-1"/></>}
          <ToothOcclusal num={num} state={state} ferramenta={ferramenta} onApply={(f) => onApply(f)}/>
          <div className="text-[10px] font-extrabold text-slate-600 tabular-nums mt-1">{num}</div>
        </>
      ) : (
        <>
          <div className="text-[10px] font-extrabold text-slate-600 tabular-nums mb-1">{num}</div>
          <ToothOcclusal num={num} state={state} ferramenta={ferramenta} onApply={(f) => onApply(f)}/>
          {!esquematico && <><div className="h-1"/><ToothLateral num={num} state={state} isUpper={false}/></>}
        </>
      )}
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get('tab') || 'dados';
  const initialTab = rawTab === 'evolucao' ? 'tratamentos' : rawTab;
  const { clinics: clinicasContexto } = useClinica();
  // Bootstrap síncrono: se já temos o paciente em cache (veio da lista), pinta a casca já
  const pacienteCache = useRef(readPacienteCache(id));
  const [loading, setLoading] = useState(pacienteCache.current === null);
  const { showAlert, showConfirm } = useCustomAlert();
  
  const [abaAtiva, setAbaAtiva] = useState(initialTab);
  const [subAbaTratamentos, setSubAbaTratamentos] = useState<'tratamentos' | 'evolucoes'>(rawTab === 'evolucao' ? 'evolucoes' : 'tratamentos');
  const [anamnesePreview, setAnamnesePreview] = useState<any>(null);
  const [modalAnamnese, setModalAnamnese] = useState(false);
  const [visualDocs, setVisualDocs] = useState<'bloco' | 'lista'>('bloco');
  const [ordemDocs, setOrdemDocs] = useState<{ campo: 'nome' | 'data' | 'tamanho'; dir: 'asc' | 'desc' }>({ campo: 'data', dir: 'desc' });
  const [docAberto, setDocAberto] = useState<{ nome: string; url: string; isImg: boolean; isPdf: boolean } | null>(null);
  const [historicoSel, setHistoricoSel] = useState<string | null>(null);
  useEffect(() => {
      if (!historicoSel) return;
      document.getElementById(`hist-${historicoSel}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [historicoSel]);
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
  const [taxaRecebimento, setTaxaRecebimento] = useState('');
  const [taxasRecebimento, setTaxasRecebimento] = useState<TaxaMaquininha[]>([]);
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
  const [hofCompararSessoes, setHofCompararSessoes] = useState<[string, string] | null>(null);
  const [savingHof, setSavingHof] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState<string | null>(null);
  const [hofModo, setHofModo] = useState<'visualizar' | 'alterar'>('visualizar');
  const [hofVista, setHofVista] = useState<'mapa' | 'demo' | 'frontal'>('mapa');
  const [agendaHof, setAgendaHof] = useState<{ procedimento: string; observacoes: string; data?: string } | null>(null);
  const hofSurfaceRef = useRef<HTMLDivElement | null>(null);

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
      supabase.from('planos').select('id, nome, tipo').eq('clinica_id', form.clinica_id).eq('ativo', true).order('nome')
          .then(({ data }) => setPlanos(data || []));
  }, [form.clinica_id]);

  const menorDeIdade = isMenorDeIdade(form.data_nascimento);
  const [responsavelAberto, setResponsavelAberto] = useState(true);
  const [cpfEncontrado, setCpfEncontrado] = useState<{ id: string; nome: string } | null>(null);
  const [enviandoFotoPerfil, setEnviandoFotoPerfil] = useState(false);

  async function buscarPacientePorCpf(cpf: string) {
      if (!cpfValido(cpf)) { setCpfEncontrado(null); return; }
      const { data } = await supabase.from('pacientes').select('id, nome, cpf').in('cpf', variantesCpf(cpf)).limit(5);
      const outro = (data || []).find((p) => String(p.id) !== String(id));
      setCpfEncontrado(outro ? { id: String(outro.id), nome: outro.nome || 'Paciente' } : null);
  }

  async function trocarFotoPaciente(arquivo?: File) {
      if (!arquivo) return;
      setEnviandoFotoPerfil(true);
      try {
          const blob = await prepararFotoPaciente(arquivo);
          const caminho = `pacientes/${id}/avatar.jpg`;
          const { error: uploadErr } = await supabase.storage.from('arquivos_ortus').upload(caminho, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
          if (uploadErr) throw uploadErr;
          const { data: urlData } = supabase.storage.from('arquivos_ortus').getPublicUrl(caminho);
          const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;
          const { error: updErr } = await supabase.from('pacientes').update({ foto_url: publicUrl }).eq('id', id);
          if (updErr) throw updErr;
          setForm((atual: any) => ({ ...atual, foto_url: publicUrl }));
      } catch (erro: any) {
          showAlert(erro?.message || 'Não foi possível salvar a foto.', { type: 'error' });
      } finally {
          setEnviandoFotoPerfil(false);
      }
  }

  function caminhoBucket(url?: string | null, storagePath?: string | null) {
      if (storagePath) return storagePath;
      if (!url || url.startsWith('blob:')) return null;
      const marca = '/arquivos_ortus/';
      const i = url.indexOf(marca);
      if (i < 0) return null;
      return decodeURIComponent(url.slice(i + marca.length).split('?')[0]);
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
          if (!path) return { ...f, dataUrl: f.dataUrl?.startsWith('blob:') ? f.dataUrl : '' };
          const { data, error } = await supabase.storage.from('arquivos_ortus').download(path);
          if (error || !data) return { ...f, storagePath: path, dataUrl: '' };
          return { ...f, storagePath: path, dataUrl: URL.createObjectURL(data) };
      }));
  }

  async function carregar(opts?: { silent?: boolean }) {
      if (!opts?.silent) setLoading(true);
      odontogramaFromServer.current = true;
      fichaFromServer.current = true;

      // Todas as buscas independentes disparam em paralelo — sem cadeia sequencial
      const [listaClinicas, pacienteRes, prontuario, histRes, debitosLista] = await Promise.all([
          clinicasContexto.length > 0 ? Promise.resolve(clinicasContexto) : fetchUserClinicas(),
          supabase.from('pacientes').select('*').eq('id', id).single(),
          carregarProntuario(String(id)),
          supabase.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false }),
          listarDebitosPaciente(id),
      ]);

      setClinicas(listaClinicas as any[]);
      const data = pacienteRes.data;

      if (data) {
          const fm = normalizarFichaMedica({ ...(data.ficha_medica || {}), ...prontuario.fichaClinica });
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
          setHofFotos(await hidratarHofFotos((prontuario.fichaClinica.hof_fotos || []) as HofFoto[]));
          setAnamnesesAnteriores(prontuario.anamneses);
          setDocumentos(prontuario.documentos);
          setEvolucoes(prontuario.evolucoes);

          // Planos + modelos de documentos da clínica — não bloqueiam o restante da tela
          if (data.clinica_id) {
              supabase.from('planos').select('id, nome').eq('clinica_id', data.clinica_id).eq('ativo', true).order('nome')
                  .then(({ data: planosData }) => { if (planosData) setPlanos(planosData); });
              carregarConfig(data.clinica_id, 'modelos_documentos', 'ortus_modelos_documentos', []).then((d: any) => {
                  if (Array.isArray(d)) setModelosDocumentos(d);
              });
          }

          registrarAudit({ acao: 'visualizou', entidade: 'paciente', entidade_id: String(id) });
      }

      const historicoFiltrado = (histRes.data || []).filter((h: any) => h.tipo_registro !== 'debito_manual' && h.observacoes !== 'Débito manual');
      setHistorico(historicoFiltrado);
      setDebitos(debitosLista);

      setModelosAnamnese(carregarModelos());
      prontuarioIdCarregado.current = String(id);
      setLoading(false);
  }

  async function salvarTudo() {
      const erro = validarPaciente(form);
      if (erro) { await showAlert(erro, { type: 'warning' }); return; }
      const fichaParaSalvar = { ...ficha };
      LEGACY_CONDICOES.forEach((k) => delete fichaParaSalvar[k]);
      const fichaAtualizada = await salvarFichaClinica(String(id), { odontograma: getOdontogramLegacySnapshot(), marcacoes_hof: marcacoesHof }, fichaParaSalvar);
      const { anamnese: _anamnese, ...formSemAnamnese } = form;
      const payload = {
          ...formSemAnamnese,
          plano_id: form.plano_id || null,
          ficha_medica: { ...fichaParaSalvar, ...fichaAtualizada, anamnese: form.anamnese || '' },
      };
      const { error } = await supabase.from('pacientes').update(payload).eq('id', id);
      if (error) { await showAlert('Erro ao salvar: ' + error.message, { type: 'error' }); return; }
      setFicha({ ...ficha, ...fichaAtualizada });
      setModoEdicao(false);
      registrarAudit({ acao: 'editou', entidade: 'paciente', entidade_id: String(id) });
      showAlert('Dados salvos com sucesso!', { type: 'success' });
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
          const { error } = await supabase.from('pacientes').update({
              ficha_medica: merged,
          }).eq('id', id);
          if (error) throw error;
      } catch (error: any) {
          showAlert('Erro ao salvar ficha médica: ' + error.message, { type: 'error' });
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
          const { agendarNaAgenda, horaAgendamento, pagamentoPendente, ...tratSemAgenda } = tratEdit;
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

          if (tratSemAgenda.status === 'concluido' && form.clinica_id) {
              const { data: { user } } = await supabase.auth.getUser();
              let profId: string | number | null = null;
              if (user) {
                  const { data: prof } = await supabase.from('profissionais').select('id').eq('user_id', user.id).maybeSingle();
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
                  await criarDebitoManual({
                      paciente_id: id,
                      clinica_id: form.clinica_id,
                      descricao: tratSemAgenda.procedimento,
                      valor,
                      tratamento_id: salvo.id ? String(salvo.id) : null,
                  });
                  const debitosLista = await listarDebitosPaciente(id);
                  setDebitos(debitosLista);
                  debitoCriado = true;
              } catch (e: any) {
                  showAlert('Tratamento salvo, mas erro ao registrar débito: ' + (e.message || e), { type: 'warning' });
              }
          }

          if (agendarNaAgenda && tratEdit.data) {
              try {
                  const { data: { session } } = await supabase.auth.getSession();
                  const userId = session?.user?.id;
                  let profId: string | null = null;
                  let clinicaId: string | null = form.clinica_id ? String(form.clinica_id) : null;
                  if (userId) {
                      const { data: prof } = await supabase.from('profissionais').select('id').eq('user_id', userId).maybeSingle();
                      profId = prof?.id || null;
                  }
                  if (!clinicaId && clinicas.length > 0) clinicaId = String(clinicas[0].id);
                  if (!clinicaId) throw new Error('Paciente sem clínica vinculada.');
                  const dataHoraISO = new Date(`${tratEdit.data}T${horaAgendamento || '09:00'}:00`).toISOString();
                  const payload: any = {
                      paciente_id: id,
                      clinica_id: clinicaId,
                      data_hora: dataHoraISO,
                      procedimento: `Tratamento: ${tratEdit.procedimento}`,
                      valor: parseFloat(tratEdit.valor) || 0,
                      valor_final: parseFloat(tratEdit.valor) || 0,
                      status: 'agendado',
                      observacoes: tratEdit.observacoes || '',
                  };
                  if (profId) payload.profissional_id = profId;
                  const { error: agErr } = await supabase.from('agendamentos').insert([payload]);
                  if (agErr) throw agErr;
                  agendado = true;
              } catch (e: any) {
                  showAlert('Tratamento salvo, mas erro ao agendar: ' + (e.message || e), { type: 'warning' });
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
      setEnviandoFoto(angulo);
      try {
          const blobComprimido = await comprimirImagem(file);
          const caminhoArquivo = `pacientes/${id}/hof/${Date.now()}_${angulo.replace(/[°\s]/g, '')}.jpg`;
          const { error: uploadErr } = await supabase.storage.from('arquivos_ortus').upload(caminhoArquivo, blobComprimido, { contentType: 'image/jpeg' });
          if (uploadErr) {
              console.error('[HOF Upload] Erro Supabase Storage:', uploadErr);
              if (uploadErr.message?.includes('row-level security') || uploadErr.message?.includes('security policy')) {
                  showAlert('Erro de permissão: Verifique as configurações de segurança (RLS) do bucket de fotos HOF no Supabase.', { type: 'error', title: 'Permissão Negada' });
              } else {
                  showAlert('Erro ao enviar foto: ' + uploadErr.message, { type: 'error' });
              }
              setEnviandoFoto(null); return;
          }
          const nova: HofFoto = { id: Date.now().toString(), sessao: hofSessaoAtiva, angulo, dataUrl: URL.createObjectURL(blobComprimido), storagePath: caminhoArquivo, criado_em: new Date().toISOString() };
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
      if (foto?.storagePath) {
          await supabase.storage.from('arquivos_ortus').remove([foto.storagePath]);
      }
      const novasFotos = hofFotos.filter(f => f.id !== fid);
      setHofFotos(novasFotos);
      try {
          const fichaAtualizada = await salvarFichaClinica(String(id), { marcacoes_hof: marcacoesHof, hof_fotos: fotosHofParaSalvar(novasFotos) }, ficha);
          setFicha({ ...ficha, ...fichaAtualizada });
      } catch (e: any) {
          showAlert('Erro ao excluir foto: ' + (e.message || e), { type: 'error' });
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
      { nome: 'Full Face Toxina (Feminino)', pontos: [
          { x: 50, y: 22, tipo: 'toxina', texto: 'Frontal (região central)', dosagem: '10', produto: '' },
          { x: 38, y: 26, tipo: 'toxina', texto: 'Frontal (lateral esquerda)', dosagem: '5', produto: '' },
          { x: 62, y: 26, tipo: 'toxina', texto: 'Frontal (lateral direita)', dosagem: '5', produto: '' },
          { x: 44, y: 33, tipo: 'toxina', texto: 'Glabela (procerus)', dosagem: '5', produto: '' },
          { x: 48, y: 31, tipo: 'toxina', texto: 'Glabela (corrugador E)', dosagem: '5', produto: '' },
          { x: 56, y: 31, tipo: 'toxina', texto: 'Glabela (corrugador D)', dosagem: '5', produto: '' },
          { x: 32, y: 39, tipo: 'toxina', texto: 'Periorbital esquerdo (pés de galinha)', dosagem: '6', produto: '' },
          { x: 68, y: 39, tipo: 'toxina', texto: 'Periorbital direito (pés de galinha)', dosagem: '6', produto: '' },
          { x: 50, y: 79, tipo: 'toxina', texto: 'Mentual (queixo)', dosagem: '4', produto: '' },
      ]},
      { nome: 'Preenchimento Labial', pontos: [
          { x: 46, y: 67.5, tipo: 'labial', texto: 'Lábio superior (arco do cupido E)', dosagem: '0.3', produto: '' },
          { x: 54, y: 67.5, tipo: 'labial', texto: 'Lábio superior (arco do cupido D)', dosagem: '0.3', produto: '' },
          { x: 50, y: 72, tipo: 'labial', texto: 'Lábio inferior (corpo central)', dosagem: '0.4', produto: '' },
      ]},
      { nome: 'Preenchimento Malar', pontos: [
          { x: 34, y: 47, tipo: 'preenchimento', texto: 'Malar esquerdo (ponto de luz)', dosagem: '0.5', produto: '' },
          { x: 66, y: 47, tipo: 'preenchimento', texto: 'Malar direito (ponto de luz)', dosagem: '0.5', produto: '' },
      ]},
      { nome: 'Bigode Chinês (Nasogeniano)', pontos: [
          { x: 40, y: 58, tipo: 'preenchimento', texto: 'Sulco nasolabial esquerdo', dosagem: '0.5', produto: '' },
          { x: 60, y: 58, tipo: 'preenchimento', texto: 'Sulco nasolabial direito', dosagem: '0.5', produto: '' },
      ]},
      { nome: 'Bioestimulação Full Face', pontos: [
          { x: 34, y: 35, tipo: 'bioestimulador', texto: 'Região temporal esquerda', dosagem: '1', produto: '' },
          { x: 66, y: 35, tipo: 'bioestimulador', texto: 'Região temporal direita', dosagem: '1', produto: '' },
          { x: 34, y: 47, tipo: 'bioestimulador', texto: 'Malar esquerdo', dosagem: '1', produto: '' },
          { x: 66, y: 47, tipo: 'bioestimulador', texto: 'Malar direito', dosagem: '1', produto: '' },
          { x: 38, y: 60, tipo: 'bioestimulador', texto: 'Mandibular esquerdo', dosagem: '1', produto: '' },
          { x: 62, y: 60, tipo: 'bioestimulador', texto: 'Mandibular direito', dosagem: '1', produto: '' },
      ]},
      { nome: 'Fios de PDO – Terço Inferior', pontos: [
          { x: 36, y: 55, tipo: 'fios', texto: 'Fio sustentação mandibular E', dosagem: '3', produto: '' },
          { x: 64, y: 55, tipo: 'fios', texto: 'Fio sustentação mandibular D', dosagem: '3', produto: '' },
          { x: 36, y: 60, tipo: 'fios', texto: 'Fio contorno jawline E', dosagem: '2', produto: '' },
          { x: 64, y: 60, tipo: 'fios', texto: 'Fio contorno jawline D', dosagem: '2', produto: '' },
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
              return `<circle cx="${m.x * 3}" cy="${m.y * 4}" r="6" fill="${ti.color}" stroke="white" stroke-width="2"/>`;
          }).join('')}
      </svg>`;

      const rows = marcacoesHof.map((m) => {
          const ti = hofTipoInfo(m.tipo);
          return [
              `<span class="ortus-dot" style="background:${ti.color}"></span>`,
              `<strong style="color:${ti.color}">${escapePrintHtml(ti.label)}</strong>`,
              escapePrintHtml(m.texto),
              escapePrintHtml(m.dosagem ? `${m.dosagem} ${m.unidade}` : '—'),
              escapePrintHtml(m.produto || '—'),
              escapePrintHtml(new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')),
          ];
      });

      const legend = HOF_TIPOS.filter(t => marcacoesHof.some(m => m.tipo === t.key)).map(t =>
          `<span class="ortus-legend-item"><span class="ortus-dot" style="background:${t.color}"></span>${escapePrintHtml(t.label)}</span>`
      ).join('');

      const fotosHtml = hofFotos.length > 0 ? `
          <div class="page-break"></div>
          <div class="ortus-section-title">Registro Fotográfico</div>
          <div class="ortus-photo-grid">
              ${hofFotos.map(f => `<div class="ortus-photo-card">
                  <img src="${f.dataUrl}" alt="${escapePrintHtml(f.angulo)}"/>
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
      setGerandoLinkAnamnese(true);
      try {
          const link = await gerarLinkAnamnesePacienteApi(String(id), anamneseAtual.modelo_id, form.clinica_id);
          setLinkAnamnesePaciente(link);
      } catch (error: any) {
          await showAlert('Erro: ' + error.message, { type: 'error' });
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
      const MAX = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX) { showAlert('Arquivo muito grande (máx. 10MB).', { type: 'warning' }); e.target.value = ''; return; }
      setUploadingDoc(true);
      try {
          const isImg = file.type.startsWith('image/');
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          const ext = file.name.split('.').pop() || 'bin';
          const timestamp = Date.now();
          let blob: Blob = file;
          let contentType = file.type || 'application/octet-stream';
          let finalExt = ext;

          if (isImg) {
              blob = await comprimirImagem(file);
              contentType = 'image/jpeg';
              finalExt = 'jpg';
          }

          const caminhoArquivo = `pacientes/${id}/documentos/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 60)}.${finalExt}`;
          const { error: uploadErr } = await supabase.storage.from('arquivos_ortus').upload(caminhoArquivo, blob, { contentType });
          if (uploadErr) { showAlert('Erro ao enviar: ' + uploadErr.message, { type: 'error' }); setUploadingDoc(false); e.target.value = ''; return; }

          const salvo = await criarDocumento(String(id), {
              nome: file.name,
              tipo: file.type,
              storage_path: caminhoArquivo,
              meta: { isImg, isPdf, tamanho: blob.size },
          });
          setDocumentos([...documentos, salvo]);
      } catch (err: any) {
          showAlert('Erro ao processar arquivo: ' + (err?.message || err), { type: 'error' });
      }
      setUploadingDoc(false);
      e.target.value = '';
  }

  async function excluirDocumento(did: string) {
      if (!(await showConfirm('Excluir este documento?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      const doc = documentos.find(d => d.id === did);
      try {
          const { storage_path } = await excluirDocumentoDb(did);
          const path = storage_path || doc?.storagePath;
          if (path) await supabase.storage.from('arquivos_ortus').remove([path]);
          setDocumentos(documentos.filter(d => d.id !== did));
      } catch (e: any) {
          await showAlert('Erro ao excluir: ' + (e.message || e), { type: 'error' });
      }
  }

  async function blobDoDocumento(d: any) {
      const path = d.storagePath || d.storage_path;
      if (path) {
          const { data, error } = await supabase.storage.from('arquivos_ortus').download(path);
          if (!error && data) return data;
      }
      if (d.dataUrl && !String(d.dataUrl).startsWith('blob:')) {
          const resposta = await fetch(d.dataUrl);
          if (resposta.ok) return await resposta.blob();
      }
      throw new Error('Arquivo indisponível');
  }

  async function abrirDocumento(d: any) {
      try {
          const blob = await blobDoDocumento(d);
          const url = URL.createObjectURL(blob);
          setDocAberto((atual) => {
              if (atual?.url) URL.revokeObjectURL(atual.url);
              return { nome: d.nome || 'Arquivo', url, isImg: !!d.isImg, isPdf: !!d.isPdf };
          });
      } catch (e: any) {
          await showAlert(e?.message || 'Não foi possível abrir o arquivo.', { type: 'error' });
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
      } catch (e: any) {
          await showAlert(e?.message || 'Não foi possível baixar o arquivo.', { type: 'error' });
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
      const taxas = form.clinica_id ? await carregarTaxasAtivas(form.clinica_id) : [];
      setTaxasRecebimento(taxas);
      setTaxaRecebimento(taxas[0]?.id || '');
      setModalReceber(debito);
  }

  async function confirmarRecebimento() {
      if (!modalReceber) return;
      setRecebendo(true);
      try {
          const { comissaoLancamentos } = await receberDebito(
              { ...modalReceber, clinica_id: form.clinica_id },
              taxaRecebimento || undefined,
              taxasRecebimento,
          );
          const agId = modalReceber.agendamento_id ?? modalReceber.id;
          setDebitos((prev) => prev.filter((d) => d.id !== modalReceber.id));
          if (modalReceber.origem === 'agendamento' || modalReceber.agendamento_id) {
              const pagoEm = new Date().toISOString();
              setHistorico((prev) => prev.map((h) => h.id === agId ? { ...h, status: 'concluido', data_pagamento: pagoEm } : h));
          }
          setModalReceber(null);
          const msgComissao = comissaoLancamentos > 0 ? ` Comissão registrada (${comissaoLancamentos} regra(s)).` : '';
          showAlert(`Pagamento registrado.${msgComissao}`, { type: 'success' });
      } catch (e: any) {
          showAlert('Erro ao registrar: ' + (e.message || e), { type: 'error' });
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
      const opcoes = await listarOpcoesMarcarNaoPago(id);
      setDebitoOpcoes(opcoes);
      setFormDebito({ descricao: '', valor: '', agendamentosMarcados: [], tratamentosMarcados: [] });
      setModalDebitoManual(true);
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
              await criarDebitoManual({
                  paciente_id: id,
                  clinica_id: form.clinica_id,
                  descricao,
                  valor,
              });
          }
          for (const agId of formDebito.agendamentosMarcados) {
              await marcarAgendamentoNaoPago(agId);
          }
          for (const trId of formDebito.tratamentosMarcados) {
              const tr = debitoOpcoes.tratamentos.find((t) => String(t.id) === String(trId));
              if (!tr) continue;
              await criarDebitoManual({
                  paciente_id: id,
                  clinica_id: form.clinica_id,
                  descricao: tr.procedimento || 'Tratamento',
                  valor: Number(tr.valor) || 0,
                  tratamento_id: String(tr.id),
              });
          }
          const debitosLista = await listarDebitosPaciente(id);
          setDebitos(debitosLista);
          const { data: hist } = await supabase.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false });
          setHistorico((hist || []).filter((h: any) => h.tipo_registro !== 'debito_manual' && h.observacoes !== 'Débito manual'));
          setModalDebitoManual(false);
          setFormDebito({ descricao: '', valor: '', agendamentosMarcados: [], tratamentosMarcados: [] });
          showAlert('Débito registrado com sucesso.', { type: 'success' });
      } catch (error: any) {
          showAlert(error.message || 'Erro ao salvar débito.', { type: 'error' });
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

  async function excluir() {
      if(!(await showConfirm('Cuidado: Isso apagará o paciente e todo o histórico. Continuar?', { title: 'Excluir Paciente', type: 'error', confirmLabel: 'Excluir' }))) return;
      await supabase.from('agendamentos').delete().eq('paciente_id', id);
      await supabase.from('pacientes').delete().eq('id', id);
      router.push('/pacientes');
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
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
        <div className="h-14 shrink-0 border-b border-black/10 bg-[#f8f8f6]" />
        <div className="flex min-h-0 flex-1">
          <div className="w-[12.75rem] shrink-0 border-r border-black/10 sm:w-56" />
          <div className="min-w-0 flex-1 bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white font-poppins">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
                <Link href="/pacientes" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 bg-[#f8f8f6] text-neutral-600 transition-colors hover:bg-white"><ArrowLeft size={16}/></Link>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
                    {form.foto_url ? <img src={form.foto_url} alt="" className="h-full w-full object-cover" /> : (form.nome || 'P').trim().split(/\s+/).slice(0, 2).map((parte: string) => parte[0] || '').join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold text-neutral-900">{form.nome}</h1>
                    <p className="text-[11px] font-medium text-neutral-400">Prontuário digital</p>
                </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {form.nome && <button onClick={handleExportarDados} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50" title="Exportar prontuário (LGPD)"><Download size={14}/> LGPD</button>}
                <PatientContactButtons
                    variant="buttons"
                    telefone={form.telefone}
                    email={form.email}
                    clinicaId={form.clinica_id}
                    evento="pos_consulta"
                    contexto={buildCtxDocumento()}
                />
            </div>
        </div>

        {/* MODAL DE DOCUMENTOS */}
        <Modal open={modalDoc} onClose={() => setModalDoc(false)} maxWidth="2xl" hideCloseButton panelClassName="max-h-[85vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white">
                <div className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-neutral-900">Emitir documento</h3>
                        <button type="button" onClick={() => setModalDoc(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={16}/></button>
                    </div>
                    
                    <div className="mb-4 flex h-10 overflow-hidden rounded-md border border-neutral-200 bg-white">
                        <button type="button" onClick={() => { setTipoDoc('receita'); setModeloDocId(''); }} className={`flex-1 text-xs font-medium ${tipoDoc === 'receita' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>Receita</button>
                        <button type="button" onClick={() => { setTipoDoc('atestado'); setModeloDocId(''); }} className={`flex-1 border-l border-neutral-200 text-xs font-medium ${tipoDoc === 'atestado' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>Atestado</button>
                        <button type="button" onClick={() => { setTipoDoc('contrato'); setModeloDocId(''); }} className={`flex-1 border-l border-neutral-200 text-xs font-medium ${tipoDoc === 'contrato' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>Contrato</button>
                    </div>

                    {tipoDoc === 'contrato' && modelosDocumentos.filter(m => m.tipo === 'contrato').length > 0 && (
                        <div className="mb-4">
                            <label className={campoLabel}>Modelo de contrato</label>
                            <CustomSelect
                                value={modeloDocId}
                                onChange={v => {
                                    setModeloDocId(v);
                                    const modelo = modelosDocumentos.find(m => m.id === v);
                                    if (modelo) setTextoDoc(aplicarVariaveisDocumento(modelo.conteudo, buildCtxDocumento()));
                                }}
                                options={modelosDocumentos.filter(m => m.tipo === 'contrato').map(m => ({ value: m.id, label: m.nome }))}
                                size="lg"
                            />
                        </div>
                    )}

                    {(tipoDoc === 'receita' || tipoDoc === 'atestado') && modelosDocumentos.filter(m => m.tipo === tipoDoc).length > 0 && (
                        <div className="mb-4">
                            <label className={campoLabel}>Modelo</label>
                            <CustomSelect
                                value={modeloDocId}
                                onChange={v => {
                                    setModeloDocId(v);
                                    const modelo = modelosDocumentos.find(m => m.id === v);
                                    if (modelo) setTextoDoc(aplicarVariaveisDocumento(modelo.conteudo, buildCtxDocumento()));
                                }}
                                options={modelosDocumentos.filter(m => m.tipo === tipoDoc).map(m => ({ value: m.id, label: m.nome }))}
                                size="lg"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className={campoLabel}>Conteúdo</label>
                            <button type="button" onClick={() => setTextoDoc('')} className="text-xs font-medium text-neutral-500 hover:text-neutral-900">Limpar</button>
                        </div>
                        <textarea 
                            value={textoDoc} 
                            onChange={(e) => setTextoDoc(e.target.value)} 
                            className="h-64 w-full resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm leading-relaxed text-neutral-900 outline-none focus:border-neutral-900"
                        ></textarea>
                        <p className="text-right text-xs text-neutral-400">O cabeçalho e o rodapé da clínica entram na impressão.</p>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <button type="button" onClick={imprimirDocumento} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800">
                            <Printer size={14}/> Imprimir
                        </button>
                    </div>
                </div>
        </Modal>

        <Modal open={!!modalReceber} onClose={() => setModalReceber(null)} maxWidth="md" hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="p-5">
                    <h3 className="text-base font-semibold text-neutral-900">Registrar recebimento</h3>
                    <p className="mt-1 text-sm text-neutral-500">{modalReceber?.procedimento}</p>
                    <p className="mb-4 mt-2 text-base font-semibold text-neutral-900">R$ {(Number(modalReceber?.valor_final ?? modalReceber?.valor) || 0).toFixed(2)}</p>
                    {taxasRecebimento.length > 0 && (
                        <div className="mb-4">
                            <label className={campoLabel}>Forma de pagamento</label>
                            <CustomSelect
                                value={taxaRecebimento}
                                onChange={setTaxaRecebimento}
                                options={[{ value: '', label: 'Sem taxa' }, ...taxasRecebimento.map(t => ({ value: t.id, label: `${t.nome} (${t.taxa_percentual}%)` }))]}
                                size="lg"
                                menuPortal
                            />
                            {taxaRecebimento && (() => {
                                const taxa = taxasRecebimento.find(t => t.id === taxaRecebimento);
                                const bruto = Number(modalReceber?.valor_final ?? modalReceber?.valor) || 0;
                                if (!taxa) return null;
                                return (
                                    <p className="mt-2 text-xs font-medium text-neutral-600">
                                        Líquido: R$ {calcularValorLiquido(bruto, taxa.taxa_percentual).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                );
                            })()}
                        </div>
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                        <button type="button" onClick={() => setModalReceber(null)} disabled={recebendo} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50">Cancelar</button>
                        <button type="button" onClick={confirmarRecebimento} disabled={recebendo} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800">
                            {recebendo ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>} Confirmar
                        </button>
                    </div>
                </div>
        </Modal>

        <div className="flex min-h-0 flex-1">
            <nav aria-label="Seções do prontuário" className="flex w-[12.75rem] shrink-0 flex-col border-r border-black/10 px-2 py-2 sm:w-56">
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
                            onClick={() => setAbaAtiva(section.key)}
                            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm leading-snug ${active ? 'bg-neutral-900 font-medium text-white' : 'font-medium text-neutral-600 hover:bg-[#f3f4f1]'}`}
                        >
                            <Icon size={16} className="shrink-0" />
                            <span className="min-w-0 flex-1">{section.label}</span>
                            {badge != null && (
                                <span className={`text-[11px] font-medium tabular-nums ${active ? 'text-white/70' : 'text-neutral-400'}`}>{badge}</span>
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className={abaAtiva === 'dados' || abaAtiva === 'anamnese' ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4'}>
                {abaAtiva === 'dados' && (
                    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-3">
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-neutral-900">Informações do paciente</h3>
                            <div className="flex gap-1.5">
                                {modoEdicao ? (
                                    <>
                                        <button onClick={() => { setModoEdicao(false); carregar(); }} className="h-8 rounded-full px-3 text-xs font-medium text-neutral-500 hover:bg-neutral-50">Cancelar</button>
                                        <button onClick={salvarTudo} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 text-xs font-medium text-white hover:bg-neutral-800"><Save size={14}/> Salvar</button>
                                    </>
                                ) : (
                                    <button onClick={() => setModoEdicao(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Edit size={14}/> Editar</button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-5">
                            <section>
                                <h4 className="mb-2 text-sm font-semibold text-neutral-900">Identificação</h4>
                                <div className="flex items-start gap-4">
                                <label className="group relative h-36 w-36 shrink-0 cursor-pointer">
                                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const arquivo = e.target.files?.[0]; e.target.value = ''; trocarFotoPaciente(arquivo); }} />
                                    <span className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 text-2xl font-semibold text-neutral-700">
                                        {form.foto_url ? <img src={form.foto_url} alt="" className="h-full w-full object-cover" /> : (form.nome || 'P').trim().split(/\s+/).slice(0, 2).map((parte: string) => parte[0] || '').join('').toUpperCase()}
                                    </span>
                                    <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white">
                                        {enviandoFotoPerfil ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                                    </span>
                                </label>
                                <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4">
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
                                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4">
                                    <label className="min-w-0">
                                        <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-neutral-500">
                                            <span>CEP <span className="text-red-500">*</span></span>
                                            {modoEdicao && (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
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
                                                            } catch (e) { console.error('Erro ViaCEP:', e); }
                                                        }
                                                    }}
                                                    className="font-medium text-neutral-900 hover:underline"
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
                                <button type="button" onClick={() => setResponsavelAberto((aberto) => !aberto)} className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                                    <ChevronDown size={16} className={`transition-transform ${responsavelAberto ? '' : '-rotate-90'}`} />
                                    Responsável
                                    {menorDeIdade && <span className="text-xs font-medium text-red-500">obrigatório para menor de 18 anos</span>}
                                </button>
                                {responsavelAberto && <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4">
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
                    </div>
                )}

                {abaAtiva === 'anamnese' && (
                    <div className="flex h-full min-h-0 flex-col overflow-hidden px-5 py-4">
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-neutral-900">Anamnese</h3>
                            <div className="flex items-center gap-2">
                                <Link href="/configuracoes?aba=anamnese" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"><Settings size={14}/> Modelos</Link>
                                <button type="button" onClick={abrirNovaAnamnese} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800"><Plus size={14}/> Nova anamnese</button>
                            </div>
                        </div>

                        <Modal open={modalAnamnese} onClose={() => setModalAnamnese(false)} maxWidth="3xl" hideCloseButton panelClassName="max-h-[85vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white">
                        <div className="p-5">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h3 className="text-base font-semibold text-neutral-900">
                                    {anamneseAtual.id ? 'Editar anamnese' : 'Nova anamnese'}
                                </h3>
                                <button type="button" onClick={() => setModalAnamnese(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={16}/></button>
                            </div>

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
                                    <div className="flex h-10 overflow-hidden rounded-md border border-neutral-200 bg-white">
                                        <button type="button" onClick={() => { setAnamneseAtual({...anamneseAtual, preenchido_por: 'profissional'}); setLinkAnamnesePaciente(null); }} className={`flex-1 text-xs font-medium ${anamneseAtual.preenchido_por === 'profissional' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Profissional</button>
                                        <button type="button" onClick={() => setAnamneseAtual({...anamneseAtual, preenchido_por: 'paciente'})} className={`flex-1 border-l border-neutral-200 text-xs font-medium ${anamneseAtual.preenchido_por === 'paciente' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Paciente</button>
                                    </div>
                                </div>
                            </div>

                            {anamneseAtual.preenchido_por === 'paciente' && anamneseAtual.modelo_id && !anamneseAtual.id ? (
                                <div className="space-y-3 border-t border-neutral-200 pt-4">
                                    <p className="text-sm font-medium text-neutral-800">Link para o paciente preencher no celular.</p>
                                    {linkAnamnesePaciente ? (
                                        <div className="space-y-2">
                                            <div className="flex gap-2">
                                                <input readOnly value={linkAnamnesePaciente.url} className="h-10 flex-1 rounded-md border border-neutral-200 bg-white px-3 font-mono text-xs text-neutral-700"/>
                                                <button type="button" onClick={copiarLinkAnamnese} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Copy size={14}/> Copiar</button>
                                            </div>
                                            <p className="text-xs text-neutral-500">Válido até {formatarDataAnamnese(linkAnamnesePaciente.expires_at)}</p>
                                        </div>
                                    ) : (
                                        <button type="button" onClick={gerarLinkAnamnesePaciente} disabled={gerandoLinkAnamnese} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
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
                                                        <textarea value={anamneseAtual.respostas[p.id] || ''} onChange={e => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: e.target.value}})} className="w-full resize-none rounded-md border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900" rows={2} placeholder="Resposta"/>
                                                    )}
                                                    {p.tipo === 'sim_nao' && (
                                                        <div className="flex h-8 w-fit overflow-hidden rounded-md border border-neutral-200 bg-white">
                                                            {['Sim','Não'].map(opt => (
                                                                <button key={opt} type="button" onClick={() => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: opt}})} className={`h-8 border-r border-neutral-200 px-3 text-xs font-medium last:border-r-0 ${anamneseAtual.respostas[p.id] === opt ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>{opt}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {p.tipo === 'sim_nao_texto' && (() => {
                                                        const atual = (anamneseAtual.respostas[p.id] as RespostaSimNaoTexto) || { sim_nao: '', texto: '' };
                                                        return (
                                                            <div className="space-y-2">
                                                                <div className="flex h-8 w-fit overflow-hidden rounded-md border border-neutral-200 bg-white">
                                                                    {['Sim','Não'].map(opt => (
                                                                        <button key={opt} type="button" onClick={() => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: { ...atual, sim_nao: opt, texto: opt === 'Não' ? '' : atual.texto }}})} className={`h-8 border-r border-neutral-200 px-3 text-xs font-medium last:border-r-0 ${atual.sim_nao === opt ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>{opt}</button>
                                                                    ))}
                                                                </div>
                                                                {atual.sim_nao === 'Sim' && (
                                                                    <textarea value={atual.texto || ''} onChange={e => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: { ...atual, texto: e.target.value }}})} className="w-full resize-none rounded-md border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900" rows={2} placeholder="Especifique"/>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                    {p.tipo === 'multipla' && (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {(p.opcoes || []).map(opt => (
                                                                <button key={opt} type="button" onClick={() => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: opt}})} className={`h-8 rounded-md border px-2.5 text-xs font-medium ${anamneseAtual.respostas[p.id] === opt ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>{opt}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
                                            <button type="button" onClick={salvarAnamnese} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Save size={14}/> {anamneseAtual.id ? 'Atualizar' : 'Salvar'}</button>
                                            <button type="button" onClick={() => emitirAnamnese()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"><Printer size={14}/> Imprimir</button>
                                            <button type="button" onClick={() => { setAnamneseAtual({ id: null, modelo_id: '', data: new Date().toISOString().split('T')[0], preenchido_por: 'profissional', respostas: {} }); setLinkAnamnesePaciente(null); }} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50">Limpar</button>
                                        </div>
                                    </div>
                                );
                            })() : (
                                <p className="border-t border-neutral-200 py-6 text-center text-sm text-neutral-400">
                                    Selecione um modelo de anamnese acima para começar.
                                </p>
                            )}
                        </div>
                        </Modal>

                        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)]">
                        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 p-3">
                            <h3 className="mb-2 shrink-0 text-base font-semibold text-neutral-900">Anamneses salvas ({anamnesesAnteriores.length})</h3>
                            <div className="min-h-0 flex-1 overflow-y-auto">
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
                                            className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 py-2.5"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium text-neutral-900">{a.modelo_nome}</div>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                                                    <span>{a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '—'}</span>
                                                    <span>{a.preenchido_por === 'paciente' ? 'Paciente' : 'Profissional'}</span>
                                                    {a.criado_em && <span>Criado {formatarDataAnamnese(a.criado_em)}</span>}
                                                    {a.atualizado_em && a.atualizado_em !== a.criado_em && <span>Atualizado {formatarDataAnamnese(a.atualizado_em)}</span>}
                                                </div>
                                            </div>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); editarAnamnese(a); }} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Editar"><Edit size={14}/></button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); emitirAnamnese(a); }} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Imprimir"><Printer size={14}/></button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); excluirAnamnese(a.id); }} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-rose-600" aria-label="Excluir"><Trash2 size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            </div>
                        </section>
                            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 p-3">
                                <h3 className="text-base font-semibold text-neutral-900">Ficha médica</h3>
                                <p className="mb-2 text-xs text-neutral-500">Digite a condição e pressione Enter.</p>
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                    <TagInput
                                        value={getCondicoesFromFicha(ficha)}
                                        onChange={updateCondicoes}
                                        placeholder="Ex: Diabetes, Hipertensão..."
                                    />
                                </div>
                            </section>
                            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 p-3">
                                <h3 className="mb-2 text-base font-semibold text-neutral-900">Medicamentos em uso</h3>
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                    <TagInput
                                        value={getMedicamentosFromFicha(ficha)}
                                        onChange={updateMedicamentos}
                                        suggestions={MEDICAMENTOS_CATALOGO}
                                        placeholder="Digite o medicamento e pressione Enter..."
                                    />
                                </div>
                            </section>
                        </div>
                        <section className="mt-3 flex h-44 shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 p-3">
                            <h3 className="mb-2 shrink-0 text-base font-semibold text-neutral-900">Observações clínicas</h3>
                            <textarea value={form.anamnese || ''} onChange={e => setForm({...form, anamnese: e.target.value})} className="min-h-0 w-full flex-1 resize-none overflow-y-auto rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-neutral-900" placeholder="Histórico, queixas e evolução" />
                        </section>
                    </div>
                )}

                {abaAtiva === 'tratamentos' && (
                    <div className="animate-in fade-in space-y-4">
                        <div className="flex items-end gap-6 border-b border-neutral-200">
                            <button type="button" onClick={() => setSubAbaTratamentos('tratamentos')} className={`-mb-px border-b-2 pb-2 text-sm font-medium ${subAbaTratamentos === 'tratamentos' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>Odontograma</button>
                            <button type="button" onClick={() => setSubAbaTratamentos('evolucoes')} className={`-mb-px border-b-2 pb-2 text-sm font-medium ${subAbaTratamentos === 'evolucoes' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>Tratamentos</button>
                        </div>

                        {subAbaTratamentos === 'evolucoes' ? (
                            <div className="space-y-4">
                            <TabEvolucao id={id as string} form={form} ficha={ficha} setFicha={setFicha} evolucoes={evolucoes} setEvolucoes={setEvolucoes}/>
                        {/* TRATAMENTOS REALIZADOS */}
                        <div className="border-t border-neutral-200 pt-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-base font-semibold text-neutral-900">Tratamentos realizados</h3>
                                <button type="button" onClick={() => abrirNovoTratamento()} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800"><Plus size={14}/> Novo</button>
                            </div>

                            {tratamentos.length === 0 ? (
                                <div className="py-6 text-center text-sm text-neutral-400">
                                    Nenhum tratamento registrado ainda.
                                    {marcacoesPendentes.length > 0 && (
                                        <p className="mt-2 text-xs text-neutral-600">
                                            Há {marcacoesPendentes.length} dente{marcacoesPendentes.length === 1 ? '' : 's'} marcado{marcacoesPendentes.length === 1 ? '' : 's'} no odontograma
                                            {' '}({marcacoesPendentes.map((m) => `#${m.num}`).join(', ')}).{' '}
                                            <button type="button" onClick={() => abrirNovoTratamento()} className="font-semibold text-neutral-900 underline underline-offset-2">
                                                Incluir no novo tratamento
                                            </button>
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {[...tratamentos].sort((a,b) => (b.data||'').localeCompare(a.data||'')).map((t:any) => (
                                        <div key={t.id} className="flex items-center gap-3 border-b border-neutral-100 py-2.5">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-xs font-medium text-neutral-800">{t.dente || '—'}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="truncate text-sm font-medium text-neutral-900">{t.procedimento}</span>
                                                    <span className="text-[11px] font-medium text-neutral-500">{t.status}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                                                    <span className="flex items-center gap-1"><Calendar size={11}/> {t.data ? new Date(t.data).toLocaleDateString('pt-BR') : '-'}</span>
                                                    {t.valor && <span className="text-emerald-600">R$ {parseFloat(t.valor).toFixed(2)}</span>}
                                                    {t.observacoes && <span className="italic truncate">"{t.observacoes}"</span>}
                                                </div>
                                            </div>
                                            <button onClick={() => { setTratEdit(t); setModalTrat(true); }} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"><Edit size={14}/></button>
                                            <button onClick={() => excluirTratamento(t.id)} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600"><Trash2 size={14}/></button>
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

                            </div>
                        ) : (
                        <>
                        {/* ODONTOGRAMA */}
                        <div className={prontuarioPanel}>
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-base font-semibold text-neutral-900">Odontograma</h3>
                                <div className="flex items-end gap-5">
                                    {(['anatomica', 'esquematica', 'livre'] as const).map(v => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => setVisaoOdonto(v)}
                                            className={`border-b-2 pb-1 text-sm font-medium ${visaoOdonto === v ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
                                        >
                                            {v === 'anatomica' ? 'Anatômica' : v === 'esquematica' ? 'Esquemática' : 'Texto livre'}
                                        </button>
                                    ))}
                                </div>
                                {savingOdo && <span className="flex items-center gap-1 text-xs font-medium text-neutral-400"><Loader2 size={12} className="animate-spin"/> Salvando</span>}
                            </div>

                            {visaoOdonto === 'livre' ? (
                                <div className="mt-2">
                                    <textarea
                                        value={textoOdontogramaLivre}
                                        onChange={e => setTextoOdontogramaLivre(e.target.value)}
                                        className="min-h-[280px] w-full resize-y rounded-md border border-neutral-200 bg-white p-3 text-sm leading-relaxed text-neutral-900 outline-none focus:border-neutral-900"
                                        placeholder="Observações e plano de tratamento"
                                    />
                                    <p className="mt-2 text-xs text-neutral-400">Salvo junto ao odontograma e incluído no PDF.</p>
                                </div>
                            ) : (
                            <>
                            <div className="mb-3 flex items-center gap-2">
                                <div className="w-40 shrink-0">
                                    <CustomSelect
                                        value={tipoArcada}
                                        onChange={(v) => setTipoArcada(v as 'permanente' | 'leite')}
                                        options={[{ value: 'permanente', label: 'Permanentes' }, { value: 'leite', label: 'De leite' }]}
                                        size="sm"
                                    />
                                </div>
                                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                                    {TOOLS.map(t => (
                                        <button
                                            key={t.key}
                                            type="button"
                                            onClick={() => setFerramenta(t.key)}
                                            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${ferramenta === t.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                                        >
                                            <span className="h-2.5 w-2.5 rounded-sm border border-black/10" style={{ background: t.color }}></span>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                                <button type="button" onClick={imprimirOrcamento} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-50"><Printer size={13}/> PDF</button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (await showConfirm('Limpar todo o odontograma?', { title: 'Limpar', type: 'warning', confirmLabel: 'Limpar' })) resetOdontogramAll();
                                    }}
                                    className="ml-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-neutral-900 bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800"
                                >
                                    <Eraser size={13}/> Limpar
                                </button>
                            </div>

                            <div className={mostrar3D ? 'grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]' : ''}>
                            <div className="min-w-0 overflow-x-auto rounded-2xl border border-black/10 bg-white p-3 sm:p-5">
                                <div className="flex w-max min-w-full justify-center">
                                    <div>
                                        {(() => {
                                            const isEsq = visaoOdonto === 'esquematica';
                                            const quad = tipoArcada === 'permanente' ? QUAD_PERM : QUAD_LEITE;
                                            return (
                                                <div className="inline-flex flex-col items-center min-w-max select-none">
                                                    <div className={`flex justify-center ${isEsq ? 'items-center' : 'items-end'}`}>
                                                        {quad.sup[0].map(n => <Tooth key={n} num={n} isUpper={true} esquematico={isEsq} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                                        <div className="w-1 self-stretch border-l-2 border-dashed border-slate-300 mx-2"></div>
                                                        {quad.sup[1].map(n => <Tooth key={n} num={n} isUpper={true} esquematico={isEsq} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                                    </div>
                                                    <div className="h-px bg-gradient-to-r from-transparent via-slate-400 to-transparent my-3"></div>
                                                    <div className={`flex justify-center ${isEsq ? 'items-center' : 'items-start'}`}>
                                                        {quad.inf[0].map(n => <Tooth key={n} num={n} isUpper={false} esquematico={isEsq} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                                        <div className="w-1 self-stretch border-l-2 border-dashed border-slate-300 mx-2"></div>
                                                        {quad.inf[1].map(n => <Tooth key={n} num={n} isUpper={false} esquematico={isEsq} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {mostrar3D && (
                                <div className="flex h-[min(52vh,480px)] min-h-[280px] min-w-0 flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#f8f8f6] p-2 sm:p-3 lg:h-full">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Vista 3D</span>
                                        <button
                                            type="button"
                                            onClick={() => setMostrar3D(false)}
                                            className="inline-flex h-8 items-center justify-center rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700"
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

                            {!mostrar3D && (
                                <div className="mt-3">
                                    <button
                                        type="button"
                                        onClick={() => setMostrar3D(true)}
                                        className="inline-flex h-8 items-center justify-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white"
                                    >
                                        Abrir vista 3D
                                    </button>
                                </div>
                            )}

                            {/* Resumo de dentes alterados */}
                            <div className="mt-6 border-t border-black/5 pt-4">
                                <div className="mb-2 flex flex-wrap items-center gap-3">
                                    {marcacoesPendentes.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => abrirNovoTratamento()}
                                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800"
                                        >
                                            <Plus size={12} /> Tratar marcações
                                        </button>
                                    )}
                                    <div className="text-xs font-medium text-neutral-500">
                                        {marcacoesOdonto.length} marcações
                                        {marcacoesPendentes.length > 0 && (
                                            <span className="ml-1.5 text-amber-700">· {marcacoesPendentes.length} para tratar</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {marcacoesOdonto.length === 0 && <span className="text-xs text-neutral-400">Nenhum.</span>}
                                    {marcacoesOdonto.map((m) => (
                                        <div key={m.num} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${m.precisaTratamento ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-white'}`}>
                                            <button
                                                type="button"
                                                onClick={() => abrirNovoTratamento([m.num])}
                                                className="min-w-0 text-left"
                                                title="Abrir tratamento deste dente"
                                            >
                                                <span className="text-neutral-900">#{m.num}</span>
                                                <span className="ml-1 font-medium text-neutral-500">{m.resumo}</span>
                                            </button>
                                            <button type="button" onClick={() => limparDente(m.num)} className="text-rose-400 hover:text-rose-600" aria-label={`Limpar dente ${m.num}`}><X size={12}/></button>
                                        </div>
                                    ))}
                                </div>
                                {marcacoesPendentes.length > 0 && (
                                    <p className="mt-2 text-[11px] text-neutral-500">Clique em um dente para abrir o tratamento só dele, ou em Tratar marcações para incluir todos.</p>
                                )}
                            </div>
                            </>
                            )}
                        </div>

                        </>
                        )}
                    </div>
                )}

                {abaAtiva === 'documentos' && (
                    <div>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-neutral-900">Documentos</h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex h-8 overflow-hidden rounded-md border border-neutral-200 bg-white">
                                    <button type="button" onClick={() => setVisualDocs('bloco')} className={`inline-flex h-8 w-8 items-center justify-center ${visualDocs === 'bloco' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-50'}`} aria-label="Blocos"><LayoutGrid size={14}/></button>
                                    <button type="button" onClick={() => setVisualDocs('lista')} className={`inline-flex h-8 w-8 items-center justify-center border-l border-neutral-200 ${visualDocs === 'lista' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-50'}`} aria-label="Lista"><List size={14}/></button>
                                </div>
                                <button type="button" onClick={() => setModalDoc(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Printer size={14}/> Emitir</button>
                                <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800 ${uploadingDoc ? 'pointer-events-none opacity-50' : ''}`}>
                                    {uploadingDoc ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>} Enviar
                                    <input type="file" className="hidden" onChange={uploadDocumento} disabled={uploadingDoc} accept="image/*,application/pdf,.doc,.docx,.txt"/>
                                </label>
                            </div>
                        </div>

                        {documentos.length === 0 ? (
                            <p className="py-8 text-center text-sm text-neutral-400">Nenhum documento. Imagens, PDF e DOC, até 10 MB.</p>
                        ) : (
                            <div>
                                <div className="grid grid-cols-[minmax(0,1.6fr)_7rem_6rem_5.5rem] items-center gap-3 pb-2 text-xs font-medium text-neutral-400">
                                    {([['nome', 'Nome'], ['data', 'Data'], ['tamanho', 'Tamanho']] as const).map(([campo, rotulo]) => (
                                        <button key={campo} type="button" onClick={() => alternarOrdemDocs(campo)} className="inline-flex items-center gap-1 text-left hover:text-neutral-900">
                                            {rotulo}
                                            <ArrowUpDown size={12} className={ordemDocs.campo === campo ? 'text-neutral-900' : 'text-neutral-300'} />
                                        </button>
                                    ))}
                                    <span className="text-right">Ações</span>
                                </div>
                                {visualDocs === 'lista' ? (
                                    <div>
                                        {documentosOrdenados().map(d => (
                                            <div key={d.id} className="grid grid-cols-[minmax(0,1.6fr)_7rem_6rem_5.5rem] items-center gap-3 border-t border-neutral-100 py-2.5">
                                                <button type="button" onClick={() => abrirDocumento(d)} className="min-w-0 truncate text-left text-sm font-medium text-neutral-900 hover:underline">{d.nome}</button>
                                                <span className="text-xs text-neutral-500">{d.criado_em ? new Date(d.criado_em).toLocaleDateString('pt-BR') : '—'}</span>
                                                <span className="text-xs text-neutral-500">{d.tamanho ? `${(d.tamanho / 1024).toFixed(0)} KB` : '—'}</span>
                                                <div className="flex justify-end">
                                                    <button type="button" onClick={() => baixarDocumento(d)} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Baixar"><Download size={14}/></button>
                                                    <button type="button" onClick={() => excluirDocumento(d.id)} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-rose-600" aria-label="Excluir"><Trash2 size={14}/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                        {documentosOrdenados().map(d => (
                                            <div key={d.id} className="overflow-hidden rounded-xl border border-neutral-200">
                                                <button type="button" onClick={() => abrirDocumento(d)} className="flex h-32 w-full flex-col items-center justify-center gap-2 bg-neutral-50 text-neutral-500">
                                                    <FileText size={28} />
                                                    <span className="text-xs font-medium">{d.isImg ? 'Imagem' : d.isPdf ? 'PDF' : 'Arquivo'}</span>
                                                </button>
                                                <div className="flex items-center gap-2 border-t border-neutral-100 px-3 py-2">
                                                    <button type="button" onClick={() => abrirDocumento(d)} className="min-w-0 flex-1 truncate text-left text-xs font-medium text-neutral-800">{d.nome}</button>
                                                    <button type="button" onClick={() => baixarDocumento(d)} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Baixar"><Download size={13}/></button>
                                                    <button type="button" onClick={() => excluirDocumento(d.id)} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-rose-600" aria-label="Excluir"><Trash2 size={13}/></button>
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
                        <div className="mb-4 flex items-end justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-neutral-900">Débitos</h3>
                                <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
                                    R$ {debitos.reduce((s,d) => s + (d.valor || 0), 0).toFixed(2)}
                                </p>
                                <p className="text-xs font-medium text-neutral-500">{debitos.length === 0 ? 'Nada em aberto' : `${debitos.length} em aberto`}</p>
                            </div>
                            <button type="button" onClick={abrirModalDebitoManual} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Plus size={14}/> Adicionar</button>
                        </div>

                        {debitos.length === 0 ? (
                            <p className="py-8 text-center text-sm text-neutral-400">Nenhum débito em aberto.</p>
                        ) : (
                            <div className="grid gap-3">
                                {debitos.map(d => (
                                    <div key={d.id} className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-semibold text-neutral-900">{d.descricao || d.procedimento}</div>
                                            <p className="mt-1 text-xs text-neutral-500">
                                                {d.data_hora ? new Date(d.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '—'}
                                                {d.profissionais?.nome ? ` · ${d.profissionais.nome}` : ''}
                                            </p>
                                            <span className="mt-2 inline-flex h-6 items-center rounded-md bg-neutral-100 px-2 text-[11px] font-medium text-neutral-700">{d.origem === 'manual' ? 'Manual' : 'Atendimento'}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Em aberto</p>
                                            <p className="text-lg font-semibold text-neutral-900">R$ {(d.valor || 0).toFixed(2)}</p>
                                        </div>
                                        <button type="button" onClick={() => marcarComoPago(d.id)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800"><CheckCircle size={13}/> Receber</button>
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
                        <h3 className="mb-3 text-base font-semibold text-neutral-900">Harmonização</h3>
                        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                        <div>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <div className="flex h-8 overflow-hidden rounded-md border border-neutral-200 bg-white">
                                <button type="button" onClick={() => setFaceHofAtiva('feminina')} className={`h-8 px-3 text-xs font-medium ${faceHofAtiva === 'feminina' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Feminino</button>
                                <button type="button" onClick={() => setFaceHofAtiva('masculina')} className={`h-8 border-l border-neutral-200 px-3 text-xs font-medium ${faceHofAtiva === 'masculina' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Masculino</button>
                            </div>
                            <button type="button" onClick={async () => { if(marcacoesHof.length && await showConfirm('Limpar todas as marcações?', { title: 'Limpar', type: 'warning', confirmLabel: 'Limpar' })) setMarcacoesHof([]); }} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-900 bg-neutral-50 px-3 text-xs font-medium text-neutral-900 hover:bg-neutral-100"><Eraser size={12}/> Limpar</button>
                            <div className="flex h-8 overflow-hidden rounded-md border border-neutral-200 bg-white">
                                {(['visualizar','alterar'] as const).map(modo => (
                                    <button key={modo} type="button" onClick={() => { setHofModo(modo); if (modo === 'visualizar') setHofPopover({ x: 0, y: 0, open: false }); }} className={`h-8 border-r border-neutral-200 px-3 text-xs font-medium last:border-r-0 ${hofModo === modo ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`} aria-pressed={hofModo === modo}>{modo === 'visualizar' ? 'Visualizar' : 'Alterar'}</button>
                                ))}
                            </div>
                            <div className="flex h-8 overflow-hidden rounded-md border border-neutral-200 bg-white">
                                {(['mapa', 'demo', 'frontal'] as const).map((vista) => (
                                    <button key={vista} type="button" onClick={() => { setHofVista(vista); if (vista !== 'mapa') setHofPopover({ x: 0, y: 0, open: false }); }} className={`h-8 border-r border-neutral-200 px-3 text-xs font-medium last:border-r-0 ${hofVista === vista ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{vista === 'mapa' ? 'Mapa' : vista === 'demo' ? 'Demonstração' : 'Frontal'}</button>
                                ))}
                            </div>
                        </div>
                        <p className="mb-3 text-xs text-neutral-400">{hofVista === 'demo' ? 'Ilustração na foto fixa, para demonstrar. Não é o resultado clínico.' : hofVista === 'frontal' ? 'Ilustração na foto frontal desta sessão. Não é o resultado clínico.' : hofModo === 'alterar' ? 'Clique no rosto para marcar.' : 'Visualizar não cria pontos novos.'}</p>

                        {/* Canvas Facial */}
                        <div className="flex justify-center">
                            <div
                                ref={hofSurfaceRef}
                                className={`relative max-h-[68vh] w-full max-w-lg select-none overflow-hidden rounded-xl border border-neutral-200 bg-[#f3f4f1] bg-cover bg-center bg-no-repeat ${hofVista === 'mapa' && hofModo === 'alterar' ? 'cursor-crosshair' : 'cursor-default'}`}
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
                                            <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white ${enviandoFoto ? 'pointer-events-none opacity-50' : ''}`}>
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
                                        />
                                    )
                                )}
                                {hofVista === 'mapa' && (<>
                                {/* Labels anatômicos sobre a imagem */}
                                <span className="absolute top-[10%] left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[0.2em] text-white/80 pointer-events-none" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4)' }}>Testa</span>
                                <span className="absolute top-[38%] left-[8%] text-[8px] font-black uppercase tracking-[0.15em] text-white/80 pointer-events-none -rotate-90 origin-center" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4)' }}>Temporal</span>
                                <span className="absolute top-[38%] right-[8%] text-[8px] font-black uppercase tracking-[0.15em] text-white/80 pointer-events-none rotate-90 origin-center" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4)' }}>Temporal</span>
                                <span className="absolute bottom-[8%] left-1/2 -translate-x-1/2 text-[8px] font-black uppercase tracking-[0.2em] text-white/80 pointer-events-none" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.4)' }}>Mento</span>

                                {/* Marcações renderizadas com cor do tipo */}
                                {marcacoesHof.map(m => {
                                    const ti = hofTipoInfo(m.tipo);
                                    return (
                                    <div key={m.id} className="absolute group" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%, -50%)' }}>
                                        <div className={`w-4 h-4 rounded-full border-2 border-white/90 shadow-lg cursor-pointer ring-2 ring-offset-1 transition-transform hover:scale-150 ${ti.ring}`} style={{ background: ti.color, boxShadow: `0 0 6px ${ti.color}88, 0 2px 8px rgba(0,0,0,0.3)` }}/>
                                        {/* Tooltip */}
                                        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block pointer-events-none">
                                            <div className="bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-xl max-w-[250px]">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ti.color }}/>
                                                    <span className="font-bold text-[10px] uppercase tracking-wider" style={{ color: ti.color }}>{ti.label}</span>
                                                </div>
                                                <div className="whitespace-normal leading-snug">{m.texto}</div>
                                                {(m.dosagem || m.produto) && (
                                                    <div className="mt-1 pt-1 border-t border-slate-600 flex flex-wrap gap-x-3 text-[10px] text-slate-300">
                                                        {m.dosagem && <span>Dose: <b className="text-white">{m.dosagem} {m.unidade}</b></span>}
                                                        {m.produto && <span>Produto: <b className="text-white">{m.produto}</b></span>}
                                                    </div>
                                                )}
                                                <div className="mt-1 text-[9px] text-slate-400">{new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"/>
                                            </div>
                                        </div>
                                        <button onClick={(ev) => { ev.stopPropagation(); excluirMarcacaoHof(m.id); }} className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 bg-rose-500 text-white rounded-full items-center justify-center shadow-md hover:bg-rose-600 transition-colors" title="Excluir"><X size={10}/></button>
                                    </div>
                                    );
                                })}

                                {/* Popover de inserção expandido */}
                                {hofPopover.open && (
                                    <div className="absolute z-40" style={{ left: `${Math.min(Math.max(hofPopover.x, 20), 80)}%`, top: `${Math.min(Math.max(hofPopover.y, 5), 65)}%`, transform: 'translate(-50%, 8px)' }} onClick={e => e.stopPropagation()}>
                                        <div className="w-64 rounded-xl border border-neutral-200 bg-white p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: hofTipoInfo(hofTipoAtivo).color }}/>
                                                    <span className="text-xs font-medium text-neutral-800">{hofTipoInfo(hofTipoAtivo).label}</span>
                                                </div>
                                                <button type="button" onClick={() => setHofPopover({x:0,y:0,open:false})} className="rounded-md p-0.5 text-neutral-400 hover:bg-neutral-100"><X size={12}/></button>
                                            </div>
                                            <textarea value={hofTexto} onChange={e => setHofTexto(e.target.value)} autoFocus placeholder="Observação do procedimento..." className="h-14 w-full resize-none rounded-md border border-neutral-200 p-2 text-xs outline-none focus:border-neutral-900"/>
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className={campoLabel}>Dosagem ({hofTipoInfo(hofTipoAtivo).unidadePadrao || '-'})</label>
                                                    <input type="text" value={hofDosagem} onChange={e => setHofDosagem(e.target.value)} placeholder="Ex: 10" className="h-8 w-full rounded-md border border-neutral-200 px-2 text-xs outline-none focus:border-neutral-900"/>
                                                </div>
                                                <div>
                                                    <label className={campoLabel}>Produto</label>
                                                    <input type="text" value={hofProduto} onChange={e => setHofProduto(e.target.value)} placeholder="Ex: Botox" className="h-8 w-full rounded-md border border-neutral-200 px-2 text-xs outline-none focus:border-neutral-900"/>
                                                </div>
                                            </div>
                                            <button type="button" onClick={salvarMarcacaoHof} disabled={!hofTexto.trim()} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-neutral-900 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40"><Plus size={12}/> Salvar</button>
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
                        <aside className="flex min-h-[28rem] flex-col">
                            <h4 className="mb-2 text-sm font-semibold text-neutral-900">Procedimentos</h4>
                            <div className="flex flex-wrap gap-1.5">
                                {HOF_TIPOS.map(t => (
                                    <button key={t.key} type="button" onClick={() => setHofTipoAtivo(t.key)} className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${hofTipoAtivo === t.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                                        <span className="h-2.5 w-2.5 rounded-sm border border-black/10" style={{ background: t.color }}/>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 border-t border-neutral-200 pt-3">
                                <h4 className="mb-2 text-sm font-semibold text-neutral-900">Aplicação atual</h4>
                                {hofAlertas.length === 0 ? <p className="text-xs text-neutral-400">Nenhuma reaplicação prevista.</p> : hofAlertas.map(alerta => (
                                    <div key={alerta.tipo} className="flex items-start justify-between gap-3 border-b border-neutral-100 py-2 text-sm text-neutral-800">
                                        <span className="flex min-w-0 items-start gap-2"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: alerta.cor }}/><span>{alerta.label} — {alerta.diasRestantes <= 0 ? 'reaplicação vencida' : `próxima em ${alerta.diasRestantes} dias (${alerta.vencimento.toLocaleDateString('pt-BR')})`}</span></span>
                                        <span className="shrink-0 text-xs text-neutral-400">Última {new Date(alerta.ultimaSessao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-auto flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
                                <div className="w-40"><label className={campoLabel}>Sessão</label><CampoData value={hofSessaoAtiva} onChange={setHofSessaoAtiva} /></div>
                                <button type="button" onClick={() => setModalProtocolo(true)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50"><Zap size={12}/> Protocolos</button>
                                <button type="button" onClick={gerarTermoConsentimentoHof} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50"><ShieldCheck size={12}/> Termo</button>
                                <button type="button" onClick={imprimirMapaHof} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50"><Printer size={12}/> PDF</button>
                                <button type="button" onClick={salvarHof} disabled={savingHof} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">{savingHof ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} {savingHof ? 'Salvando...' : 'Salvar procedimento HOF'}</button>
                            </div>
                        </aside>
                        </div>

                        {/* Fotos da Sessão Ativa */}
                        <div className="mt-6 pt-4 border-t border-neutral-100">
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-[10px] font-medium text-neutral-400 flex items-center gap-1.5"><Camera size={12}/> Fotos da Sessão ({hofFotos.filter(f => f.sessao === hofSessaoAtiva).length})</div>
                                <div className="flex gap-2">
                                    {['Frontal', 'Perfil E', 'Perfil D', '45° E', '45° D'].map(angulo => (
                                        <label key={angulo} className={`flex cursor-pointer items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 ${enviandoFoto === angulo ? 'cursor-wait opacity-60' : enviandoFoto ? 'cursor-not-allowed opacity-40' : ''}`}>
                                            {enviandoFoto === angulo ? <><Loader2 size={10} className="animate-spin"/> Enviando...</> : <><Camera size={10}/> {angulo}</>}
                                            <input type="file" accept="image/*" className="hidden" disabled={!!enviandoFoto} onChange={e => uploadHofFoto(e, angulo)}/>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {hofFotos.filter(f => f.sessao === hofSessaoAtiva).length > 0 && (
                                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                                    {hofFotos.filter(f => f.sessao === hofSessaoAtiva).map(f => (
                                        <div key={f.id} className="relative group/foto rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 aspect-[3/4]">
                                            <img src={f.dataUrl} alt={f.angulo} className="w-full h-full object-cover"/>
                                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                                <span className="text-[9px] font-medium text-white uppercase">{f.angulo}</span>
                                            </div>
                                            <button onClick={() => excluirHofFoto(f.id)} className="absolute top-1 right-1 hidden group-hover/foto:flex w-5 h-5 bg-rose-500 text-white rounded-full items-center justify-center shadow hover:bg-rose-600"><X size={10}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Before/After Comparação */}
                        {hofSessoes.length >= 2 && (
                            <div className="mt-6 pt-4 border-t border-neutral-100">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-[10px] font-medium text-neutral-400 flex items-center gap-1.5"><ArrowLeftRight size={12}/> Comparação Before / After</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-medium text-neutral-500">Antes:</span>
                                        <CustomSelect value={hofCompararSessoes?.[0] || ''} onChange={v => setHofCompararSessoes([v, hofCompararSessoes?.[1] || hofSessoes[0]])} options={hofSessoes.map(s => ({value:s,label:new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')}))} placeholder="Selecione" size="sm"/>
                                    </div>
                                    <ArrowLeftRight size={14} className="text-neutral-300"/>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-medium text-neutral-500">Depois:</span>
                                        <CustomSelect value={hofCompararSessoes?.[1] || ''} onChange={v => setHofCompararSessoes([hofCompararSessoes?.[0] || hofSessoes[hofSessoes.length - 1], v])} options={hofSessoes.map(s => ({value:s,label:new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')}))} placeholder="Selecione" size="sm"/>
                                    </div>
                                </div>
                                {hofCompararSessoes?.[0] && hofCompararSessoes?.[1] && (() => {
                                    const fotosAntes = hofFotos.filter(f => f.sessao === hofCompararSessoes![0]);
                                    const fotosDepois = hofFotos.filter(f => f.sessao === hofCompararSessoes![1]);
                                    const angulos = Array.from(new Set([...fotosAntes.map(f => f.angulo), ...fotosDepois.map(f => f.angulo)]));
                                    if (!angulos.length) return <p className="text-xs text-neutral-400 italic">Nenhuma foto encontrada nestas sessões. Adicione fotos para comparar.</p>;
                                    return (
                                        <div className="space-y-3">
                                            {angulos.map(ang => {
                                                const antes = fotosAntes.find(f => f.angulo === ang);
                                                const depois = fotosDepois.find(f => f.angulo === ang);
                                                return (
                                                    <div key={ang} className="border border-neutral-200 rounded-xl overflow-hidden">
                                                        <div className="bg-neutral-50 px-3 py-1.5 border-b border-neutral-200 text-[10px] font-medium text-neutral-500 uppercase">{ang}</div>
                                                        <div className="grid grid-cols-2 gap-px bg-slate-200">
                                                            <div className="bg-white relative aspect-[3/4]">
                                                                <div className="absolute top-2 left-2 text-[9px] font-medium bg-neutral-900/70 text-white px-2 py-0.5 rounded z-10">ANTES</div>
                                                                {antes ? <img src={antes.dataUrl} alt="Antes" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-neutral-300"><Camera size={24}/></div>}
                                                            </div>
                                                            <div className="bg-white relative aspect-[3/4]">
                                                                <div className="absolute top-2 left-2 text-[9px] font-medium bg-neutral-900/80 text-white px-2 py-0.5 rounded z-10">DEPOIS</div>
                                                                {depois ? <img src={depois.dataUrl} alt="Depois" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-neutral-300"><Camera size={24}/></div>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Histórico por Sessões */}
                        {hofSessoes.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-neutral-100">
                                <div className="text-[10px] font-medium text-neutral-400 mb-3">Histórico de Sessões ({hofSessoes.length})</div>
                                <div className="space-y-4">
                                    {hofSessoes.map(sessao => {
                                        const itens = marcacoesHof.filter(m => (m.sessao || m.data) === sessao);
                                        const fotosSessao = hofFotos.filter(f => f.sessao === sessao);
                                        const totalDoseToxina = itens.filter(m => m.tipo === 'toxina' && m.dosagem).reduce((s, m) => s + (parseFloat(m.dosagem) || 0), 0);
                                        return (
                                            <div key={sessao} className="border border-neutral-200 rounded-xl overflow-hidden">
                                                <div className="bg-neutral-50 px-4 py-2.5 flex items-center justify-between border-b border-neutral-200">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar size={14} className="text-neutral-600"/>
                                                        <span className="text-sm font-semibold text-neutral-800">{new Date(sessao + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] font-medium text-neutral-500">
                                                        {itens.length > 0 && <span>{itens.length} ponto{itens.length > 1 ? 's' : ''}</span>}
                                                        {fotosSessao.length > 0 && <span className="text-neutral-600">{fotosSessao.length} foto{fotosSessao.length > 1 ? 's' : ''}</span>}
                                                        {totalDoseToxina > 0 && <span className="text-red-500">Toxina: {totalDoseToxina}U</span>}
                                                    </div>
                                                </div>
                                                {/* Fotos da sessão */}
                                                {fotosSessao.length > 0 && (
                                                    <div className="flex gap-2 p-3 bg-neutral-50 border-b border-neutral-100 overflow-x-auto">
                                                        {fotosSessao.map(f => (
                                                            <div key={f.id} className="w-16 h-20 rounded-lg overflow-hidden border border-neutral-200 shrink-0 relative group/ft">
                                                                <img src={f.dataUrl} alt={f.angulo} className="w-full h-full object-cover"/>
                                                                <div className="absolute bottom-0 inset-x-0 bg-black/50 text-[7px] text-white font-medium text-center py-0.5">{f.angulo}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {itens.length > 0 && (
                                                <div className="divide-y divide-slate-100">
                                                    {itens.map((m, i) => {
                                                        const ti = hofTipoInfo(m.tipo);
                                                        return (
                                                            <div key={m.id} className="flex items-start gap-3 px-4 py-2.5 group/item hover:bg-neutral-50">
                                                                <div className="w-5 h-5 rounded-full border-2 border-white shadow shrink-0 mt-0.5" style={{ background: ti.color }}/>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded" style={{ background: ti.color + '18', color: ti.color }}>{ti.label}</span>
                                                                        <span className="text-sm font-medium text-neutral-800">{m.texto}</span>
                                                                    </div>
                                                                    {(m.dosagem || m.produto) && (
                                                                        <div className="flex gap-3 mt-0.5 text-[10px] text-neutral-400 font-semibold">
                                                                            {m.dosagem && <span>Dose: {m.dosagem} {m.unidade}</span>}
                                                                            {m.produto && <span>Produto: {m.produto}</span>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <button onClick={() => excluirMarcacaoHof(m.id)} className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0"><Trash2 size={13}/></button>
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

                {abaAtiva === 'historico' && (
                    <div className="grid min-h-0 gap-6 lg:grid-cols-2">
                        <div className="min-w-0">
                            <h3 className="mb-3 text-base font-semibold text-neutral-900">Histórico</h3>
                            {historico.length === 0 ? (
                                <p className="py-8 text-center text-sm text-neutral-400">Nenhum atendimento registrado.</p>
                            ) : (
                                <div className="overflow-hidden rounded-xl border border-neutral-200">
                                    {historico.map((h: any) => {
                                        const valor = Number(h.valor_final ?? h.valor ?? 0);
                                        const emDebito = h.status === 'fiado';
                                        const ativo = String(historicoSel || historico[0]?.id) === String(h.id);
                                        return (
                                            <button key={h.id} type="button" onClick={() => setHistoricoSel(String(h.id))} className={`block w-full border-b border-neutral-100 px-4 py-3 text-left last:border-b-0 ${ativo ? 'bg-neutral-900 text-white' : 'bg-white hover:bg-neutral-50'}`}>
                                                <div className="flex items-baseline justify-between gap-3">
                                                    <span className="truncate text-sm font-semibold">{h.procedimento}</span>
                                                    {valor > 0 && <span className="shrink-0 text-sm font-semibold">R$ {valor.toFixed(2)}</span>}
                                                </div>
                                                <p className={`mt-1 text-xs ${ativo ? 'text-white/70' : 'text-neutral-500'}`}>
                                                    {new Date(h.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    {` · ${h.profissionais?.nome || 'Profissional'}`}
                                                </p>
                                                <span className={`mt-2 inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium ${ativo ? 'bg-white/15 text-white' : emDebito ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{emDebito ? 'Em débito' : h.status}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="mb-3 text-base font-semibold text-neutral-900">Linha do tempo</h3>
                            {historico.length === 0 ? (
                                <p className="py-8 text-center text-sm text-neutral-400">Selecione um atendimento.</p>
                            ) : (
                                <div className="relative max-h-[32rem] overflow-y-auto pl-4">
                                    <div className="absolute bottom-2 left-[7px] top-2 w-px bg-neutral-200" />
                                    {historico.map((h: any) => {
                                        const valor = Number(h.valor_final ?? h.valor ?? 0);
                                        const emDebito = h.status === 'fiado';
                                        const ativo = String(historicoSel || historico[0]?.id) === String(h.id);
                                        return (
                                            <div key={h.id} id={`hist-${h.id}`} className="relative pb-5 pl-5">
                                                <span className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${ativo ? 'bg-neutral-900' : 'bg-neutral-300'}`} />
                                                <div className={`rounded-xl border px-4 py-3 ${ativo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white'}`}>
                                                    <div className="flex items-baseline justify-between gap-3">
                                                        <span className="text-sm font-semibold">{h.procedimento}</span>
                                                        {valor > 0 && <span className="text-sm font-semibold">R$ {valor.toFixed(2)}</span>}
                                                    </div>
                                                    <p className={`mt-1 text-xs ${ativo ? 'text-white/70' : 'text-neutral-500'}`}>
                                                        {new Date(h.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        {` · ${h.profissionais?.nome || 'Profissional'}`}
                                                    </p>
                                                    <p className={`mt-2 text-xs font-medium ${ativo ? 'text-white' : 'text-neutral-700'}`}>{emDebito ? 'Em débito' : h.status}{h.status === 'concluido' && h.data_pagamento ? ` · pago em ${new Date(h.data_pagamento).toLocaleDateString('pt-BR')}` : ''}{h.valor_liquido != null && h.status === 'concluido' ? ` · líq. R$ ${Number(h.valor_liquido).toFixed(2)}` : ''}</p>
                                                    {h.observacoes && <p className={`mt-2 text-sm ${ativo ? 'text-white/90' : 'text-neutral-800'}`}>{h.observacoes}</p>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>

        {/* MODAL TRATAMENTO */}
        <Modal open={modalTrat} onClose={() => setModalTrat(false)} maxWidth="lg" hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-neutral-900">{tratEdit.id ? 'Editar' : 'Novo'} tratamento</h3>
                        <button type="button" onClick={() => setModalTrat(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={16}/></button>
                    </div>
                    <div className="space-y-3">
                        {!tratEdit.id && marcacoesOdonto.length > 0 && (
                            <div className="rounded-2xl border border-black/5 bg-[#f8f8f6] p-3">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Do odontograma</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {marcacoesOdonto.map((m) => {
                                        const ativo = (tratEdit.dentesSelecionados || parseDentesCampo(tratEdit.dente).map(String)).includes(String(m.num));
                                        return (
                                            <button
                                                key={m.num}
                                                type="button"
                                                onClick={() => toggleDenteTratamento(String(m.num))}
                                                className={`rounded-md px-2.5 py-1 text-left text-xs font-medium ${
                                                    ativo ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                                                }`}
                                            >
                                                #{m.num}
                                                <span className={`ml-1 font-medium ${ativo ? 'text-white/70' : 'text-neutral-400'}`}>{m.resumo}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <label className="mt-3 flex cursor-pointer items-start gap-2">
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
                            <textarea value={tratEdit.observacoes} onChange={e => setTratEdit({...tratEdit, observacoes: e.target.value})} className="h-20 w-full resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-neutral-900" />
                        </div>
                        {/* Agendar na Agenda */}
                        <div className={`rounded-md border p-3 ${tratEdit.agendarNaAgenda ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white'}`}>
                            <label className="flex items-center gap-3 cursor-pointer">
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
                                <div className="mt-3 ml-8">
                                    <label className={campoLabel}>Horário</label>
                                    <input type="time" value={tratEdit.horaAgendamento || '09:00'} onChange={e => setTratEdit({...tratEdit, horaAgendamento: e.target.value})} className="box-border h-10 w-full max-w-[160px] rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"/>
                                    <p className="mt-1.5 text-xs text-neutral-500">Consulta em {tratEdit.data ? new Date(tratEdit.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'} às {tratEdit.horaAgendamento || '09:00'}.</p>
                                </div>
                            )}
                        </div>
                        {/* Pagamento pendente */}
                        {parseFloat(tratEdit.valor) > 0 && (
                        <div className={`rounded-md border p-3 ${tratEdit.pagamentoPendente ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white'}`}>
                            <label className="flex cursor-pointer items-center gap-3">
                                <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${tratEdit.pagamentoPendente ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
                                    {tratEdit.pagamentoPendente && <Check size={14}/>}
                                </div>
                                <input type="checkbox" className="hidden" checked={tratEdit.pagamentoPendente || false} onChange={e => setTratEdit({...tratEdit, pagamentoPendente: e.target.checked})} />
                                <span className="text-sm font-medium text-neutral-800">Pagamento pendente</span>
                            </label>
                            {tratEdit.pagamentoPendente && (
                                <p className="ml-8 mt-2 text-xs text-neutral-500">O valor fica na aba Débitos até ser recebido.</p>
                            )}
                        </div>
                        )}
                    </div>
                    <div className="flex gap-2 justify-end mt-5">
                        <button onClick={() => setModalTrat(false)} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50">Cancelar</button>
                        <button onClick={salvarTratamento} disabled={salvandoTrat} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"><Save size={14}/> {salvandoTrat ? 'Salvando...' : 'Salvar'}</button>
                    </div>
                </div>
        </Modal>

        {/* MODAL PROTOCOLOS HOF */}
        <Modal open={modalProtocolo} onClose={() => setModalProtocolo(false)} maxWidth="lg" hideCloseButton panelClassName="max-h-[80vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white">
                <div className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-neutral-900">Protocolos</h3>
                        <button type="button" onClick={() => setModalProtocolo(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={16}/></button>
                    </div>
                    <p className="mb-4 text-xs text-neutral-500">Aplica os pontos na sessão ativa. Doses e produtos continuam editáveis.</p>
                    <div className="space-y-3">
                        {HOF_PROTOCOLOS.map((proto, idx) => {
                            const tipos = Array.from(new Set(proto.pontos.map(p => p.tipo)));
                            return (
                                <button key={idx} type="button" onClick={() => aplicarProtocolo(idx)} className="group w-full rounded-md border border-neutral-200 p-3 text-left hover:bg-neutral-50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-1">
                                                {tipos.map(t => <span key={t} className="w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ background: hofTipoInfo(t).color }}/>)}
                                            </div>
                                            <span className="text-sm font-medium text-neutral-900">{proto.nome}</span>
                                        </div>
                                        <span className="text-xs text-neutral-400">{proto.pontos.length} pontos</span>
                                    </div>
                                    <div className="mt-2 flex gap-3 text-[11px] text-neutral-500">
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
                </div>
        </Modal>

        <Modal open={!!anamnesePreview} onClose={() => setAnamnesePreview(null)} maxWidth="2xl" panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {anamnesePreview && (
                <div>
                    <div className="border-b border-neutral-200 p-5">
                        <h3 className="pr-8 text-base font-semibold text-neutral-900">{anamnesePreview.modelo_nome}</h3>
                        <p className="mt-1 text-xs text-neutral-500">
                            {anamnesePreview.data ? new Date(anamnesePreview.data).toLocaleDateString('pt-BR') : '—'}
                            {' · '}
                            {anamnesePreview.preenchido_por === 'paciente' ? 'Paciente' : 'Profissional'}
                            {anamnesePreview.criado_em ? ` · Criado ${formatarDataAnamnese(anamnesePreview.criado_em)}` : ''}
                        </p>
                    </div>
                    <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
                        {(anamnesePreview.perguntas_snapshot || []).map((p: { id: string; label: string }, i: number) => (
                            <div key={p.id}>
                                <p className="text-xs font-medium text-neutral-500">{i + 1}. {p.label}</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
                                    {formatarRespostaAnamnese(anamnesePreview.respostas?.[p.id])}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-neutral-200 p-4">
                        <button type="button" onClick={() => setAnamnesePreview(null)} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50">Fechar</button>
                        <button type="button" onClick={() => { editarAnamnese(anamnesePreview); }} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"><Edit size={14}/> Editar</button>
                        <button type="button" onClick={() => emitirAnamnese(anamnesePreview)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Printer size={14}/> Imprimir</button>
                    </div>
                </div>
            )}
        </Modal>

        <Modal open={modalDebitoManual} onClose={() => setModalDebitoManual(false)} maxWidth="md" hideCloseButton panelClassName="max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 p-5">
                <h3 className="text-base font-semibold text-neutral-900">Adicionar débito</h3>
                <p className="mt-1 text-xs text-neutral-500">Descrição livre, ou marque atendimentos e tratamentos como não pagos.</p>
            </div>
            <div className="space-y-3 p-5">
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
                            <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border border-neutral-200 p-2">
                                <p className="sticky top-0 bg-white py-1 text-xs font-medium text-neutral-500">Agendamentos ({debitoOpcoes.agendamentos.length})</p>
                                {debitoOpcoes.agendamentos.map((a) => (
                                    <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-100 px-2 py-1.5 hover:bg-neutral-50">
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
                                        <span className="flex-1 truncate text-xs font-medium text-neutral-800">{a.procedimento}</span>
                                        <span className="text-[11px] text-neutral-400">R$ {Number(a.valor_final ?? a.valor ?? 0).toFixed(2)}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {debitoOpcoes.tratamentos.length > 0 && (
                            <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border border-neutral-200 p-2">
                                <p className="sticky top-0 bg-white py-1 text-xs font-medium text-neutral-500">Tratamentos ({debitoOpcoes.tratamentos.length})</p>
                                {debitoOpcoes.tratamentos.map((t) => (
                                    <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-100 px-2 py-1.5 hover:bg-neutral-50">
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
                                        <span className="flex-1 truncate text-xs font-medium text-neutral-800">{t.procedimento}</span>
                                        <span className="text-[11px] text-neutral-400">R$ {Number(t.valor ?? 0).toFixed(2)}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-200 p-4">
                <button type="button" onClick={() => setModalDebitoManual(false)} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50">Cancelar</button>
                <button type="button" onClick={salvarDebitoManual} disabled={salvandoDebito} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
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
        <Modal open={!!docAberto} onClose={fecharDocumento} maxWidth="4xl" hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
                <h3 className="min-w-0 truncate text-base font-semibold text-neutral-900">{docAberto?.nome}</h3>
                <button type="button" onClick={fecharDocumento} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={16}/></button>
            </div>
            <div className="max-h-[75vh] overflow-auto bg-neutral-50 p-3">
                {docAberto?.isImg ? (
                    <img src={docAberto.url} alt={docAberto.nome} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md" />
                ) : docAberto?.isPdf ? (
                    <iframe title={docAberto.nome} src={docAberto.url} className="h-[70vh] w-full rounded-md bg-white" />
                ) : docAberto ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-sm text-neutral-600">
                        <FileText size={28} />
                        <p>Este arquivo abre pelo download, sem sair do sistema.</p>
                        <a href={docAberto.url} download={docAberto.nome} className="inline-flex h-9 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white">Baixar</a>
                    </div>
                ) : null}
            </div>
        </Modal>

    </div>
  );
}