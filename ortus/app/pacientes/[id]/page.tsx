'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { User, Phone, Edit, ArrowLeft, Save, Loader2, FileText, Clock, Trash2, Calendar, CalendarPlus, Pill, AlertTriangle, Stethoscope, X, Check, Building2, Printer, Smile, Plus, Eraser, CheckCircle, ClipboardList, FolderOpen, AlertCircle, Upload, Download, Image as ImageIcon, DollarSign, Settings, Sparkles, Camera, Bell, ArrowLeftRight, ShieldCheck, Zap, Link2, Copy } from 'lucide-react';
import Link from 'next/link';
import { carregarModelos, formatarRespostaAnamnese, respostaInicial, type ModeloAnamnese, type RespostaAnamnese, type RespostaSimNaoTexto } from '@/lib/anamnese';
// teeth-data lib no longer needed — using PNG images from /assets/dentes/
import { fetchUserClinicas } from '@/lib/clinicScoped';
import { registrarAudit } from '@/lib/auditLog';
import TabEvolucao from './TabEvolucao';
import CustomSelect from '@/components/ui/CustomSelect';
import TagInput from '@/components/ui/TagInput';
import Modal from '@/components/ui/Modal';
import { MEDICAMENTOS_CATALOGO } from '@/lib/medicamentosCatalogo';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarPaciente, isMenorDeIdade } from '@/lib/pacienteValidation';
import { carregarConfig } from '@/lib/configClinica';
import { buildDocumentoContexto, aplicarVariaveisDocumento } from '@/lib/documentVariables';
import { printDocument, printQaBlock, printSignatureBlock, printTable, escapePrintHtml } from '@/lib/printDocument';
import PatientContactButtons from '@/components/PatientContactButtons';
import { carregarTaxasAtivas, receberAgendamento } from '@/lib/recebimentoAgendamento';
import { criarDebitoManual, listarDebitosPaciente, listarOpcoesMarcarNaoPago, marcarAgendamentoNaoPago, receberDebito } from '@/lib/debitosPaciente';
import { calcularValorLiquido, type TaxaMaquininha } from '@/lib/configDefaults';
import { registrarComissaoTratamentoFinalizado } from '@/lib/comissao';
import { carregarProntuario } from '@/lib/fichaPaciente';
import { criarAnamnese, atualizarAnamnese, excluirAnamnese as excluirAnamneseDb, gerarLinkAnamnesePaciente } from '@/lib/db/anamneses';
import { criarDocumento, excluirDocumento as excluirDocumentoDb } from '@/lib/db/documentos';
import { salvarFichaClinica } from '@/lib/db/fichaClinica';
import { atualizarTratamento, criarTratamento, excluirTratamento as excluirTratamentoDb } from '@/lib/db/tratamentos';
import type { TratamentoPaciente } from '@/lib/db/types';

// =============== ODONTOGRAMA - Padrão Codental (Vista Lateral + Oclusal) ===============
type Face = 'V' | 'M' | 'D' | 'L' | 'O'; // Vestibular, Mesial, Distal, Lingual/Palatal, Oclusal/Incisal
type FaceStatus = 'higido' | 'carie' | 'restaurado' | 'tratado';
type ToothCondition = 'normal' | 'ausente' | 'coroa' | 'implante' | 'extracao';
interface ToothState { faces: Partial<Record<Face, FaceStatus>>; cond: ToothCondition }

const FACE_COLORS: Record<FaceStatus, string> = {
  higido: '#ffffff',
  carie: '#ef4444',
  restaurado: '#3b82f6',
  tratado: '#10b981',
};

const FACE_LABELS: Record<Face, string> = { V: 'Vestibular', M: 'Mesial', D: 'Distal', L: 'Lingual/Palatal', O: 'Oclusal/Incisal' };

const TOOLS: { key: string; label: string; color: string; tipo: 'face' | 'cond' }[] = [
  { key: 'higido',      label: 'Hígido',      color: '#ffffff', tipo: 'face' },
  { key: 'carie',       label: 'Cárie',       color: '#ef4444', tipo: 'face' },
  { key: 'restaurado',  label: 'Restauração', color: '#3b82f6', tipo: 'face' },
  { key: 'tratado',     label: 'Tratado',     color: '#10b981', tipo: 'face' },
  { key: 'coroa',       label: 'Coroa',       color: '#f59e0b', tipo: 'cond' },
  { key: 'implante',    label: 'Implante',    color: '#0ea5e9', tipo: 'cond' },
  { key: 'extracao',    label: 'Extração',    color: '#dc2626', tipo: 'cond' },
  { key: 'ausente',     label: 'Ausente',     color: '#94a3b8', tipo: 'cond' },
];

const PATIENT_NAV_SECTIONS = [
  { key: 'dados', label: 'Dados', icon: User },
  { key: 'anamnese', label: 'Anamnese', icon: FileText },
  { key: 'tratamentos', label: 'Tratamentos e Evoluções', icon: Smile },
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

export default function PacienteDetalhe() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get('tab') || 'dados';
  const initialTab = rawTab === 'evolucao' ? 'tratamentos' : rawTab;
  const [loading, setLoading] = useState(true);
  const { showAlert, showConfirm } = useCustomAlert();
  
  const [abaAtiva, setAbaAtiva] = useState(initialTab);
  const [subAbaTratamentos, setSubAbaTratamentos] = useState<'tratamentos' | 'evolucoes'>(rawTab === 'evolucao' ? 'evolucoes' : 'tratamentos');
  const [anamnesePreview, setAnamnesePreview] = useState<any>(null);
  const odontogramaFromServer = useRef(true);
  const fichaFromServer = useRef(true);

  // Revalida quando o Action Hub registrar tratamento in-place neste paciente
  useEffect(() => {
      function handle(event: Event) {
          const detail = (event as CustomEvent<{ pacienteId?: string | number }>).detail;
          if (!detail || String(detail.pacienteId) === String(id)) {
              carregar();
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
  
  const [form, setForm] = useState<any>({});
  const [ficha, setFicha] = useState<any>({}); 
  const [historico, setHistorico] = useState<any[]>([]);
  const [evolucoes, setEvolucoes] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [planos, setPlanos] = useState<any[]>([]);

  // Odontograma + Tratamentos
  const [odontograma, setOdontograma] = useState<Record<string, ToothState>>({});
  const [tratamentos, setTratamentos] = useState<any[]>([]);
  const [ferramenta, setFerramenta] = useState<string>('carie');
  const [tipoArcada, setTipoArcada] = useState<'permanente' | 'leite'>('permanente');
  const [savingOdo, setSavingOdo] = useState(false);
  const [visaoOdonto, setVisaoOdonto] = useState<'anatomica' | 'esquematica' | 'livre'>('anatomica');
  const [textoOdontogramaLivre, setTextoOdontogramaLivre] = useState('');
  const [modalTrat, setModalTrat] = useState(false);
  const [salvandoTrat, setSalvandoTrat] = useState(false);
  const [tratEdit, setTratEdit] = useState<any>({ id: null, dente: '', procedimento: '', data: new Date().toISOString().split('T')[0], status: 'concluido', valor: '', observacoes: '', agendarNaAgenda: false, horaAgendamento: '09:00', pagamentoPendente: false });
  const [odontogramaZoom, setOdontogramaZoom] = useState(1);
  const [odontogramaPan, setOdontogramaPan] = useState({ x: 0, y: 0 });
  const odontogramaSurfaceRef = useRef<HTMLDivElement | null>(null);
  const odontogramaPanSession = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 });

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
      { key: 'bioestimulador', label: 'Bioestimulador',    color: '#10b981', unidadePadrao: 'mL', ring: 'ring-emerald-300' },
      { key: 'fios',           label: 'Fios de PDO',       color: '#f59e0b', unidadePadrao: 'un', ring: 'ring-amber-300' },
      { key: 'peeling',        label: 'Peeling / Skinbooster', color: '#8b5cf6', unidadePadrao: 'mL', ring: 'ring-violet-300' },
      { key: 'outro',          label: 'Outro',             color: '#64748b', unidadePadrao: '',   ring: 'ring-slate-300' },
  ];
  const HOF_RETORNO: Record<string, { meses: number; label: string }> = {
      toxina: { meses: 5, label: '4-6 meses' }, preenchimento: { meses: 14, label: '12-18 meses' },
      bioestimulador: { meses: 18, label: '18-24 meses' }, fios: { meses: 12, label: '12 meses' },
      peeling: { meses: 2, label: '1-3 meses' },
  };
  const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const ODONTO_ZOOM_RANGE = { min: 0.85, max: 1.4 } as const;
  const HOF_ZOOM_RANGE = { min: 0.9, max: 1.5 } as const;
  const PAN_LIMIT_FACTOR = 160;
  const getPanLimit = (zoom: number) => (zoom - 1) * PAN_LIMIT_FACTOR;
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

  useEffect(() => { if(id) carregar(); }, [id]);

  useEffect(() => {
      if (!form.clinica_id) { setPlanos([]); return; }
      supabase.from('planos').select('id, nome, tipo').eq('clinica_id', form.clinica_id).eq('ativo', true).order('nome')
          .then(({ data }) => setPlanos(data || []));
  }, [form.clinica_id]);

  const menorDeIdade = isMenorDeIdade(form.data_nascimento);

  async function carregar() {
      setLoading(true);
      odontogramaFromServer.current = true;
      fichaFromServer.current = true;
      const listaClinicas = await fetchUserClinicas();
      setClinicas(listaClinicas);

      const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
      if (data) {
          setForm(data);
          const prontuario = await carregarProntuario(String(id));
          const fm = normalizarFichaMedica({ ...(data.ficha_medica || {}), ...prontuario.fichaClinica });
          setFicha(fm);
          odontogramaFromServer.current = true;
          fichaFromServer.current = true;
          setOdontograma((prontuario.fichaClinica.odontograma || {}) as Record<string, ToothState>);
          setTratamentos(prontuario.tratamentos);
          setTextoOdontogramaLivre(prontuario.fichaClinica.texto_livre || '');
          setMarcacoesHof((prontuario.fichaClinica.marcacoes_hof || []) as HofMarcacao[]);
          setHofFotos((prontuario.fichaClinica.hof_fotos || []) as HofFoto[]);
          setAnamnesesAnteriores(prontuario.anamneses);
          setDocumentos(prontuario.documentos);
          setEvolucoes(prontuario.evolucoes);
          
          // Carregar planos da clínica do paciente
          if (data.clinica_id) {
              const { data: planosData } = await supabase.from('planos').select('id, nome').eq('clinica_id', data.clinica_id).eq('ativo', true).order('nome');
              if (planosData) setPlanos(planosData);
              carregarConfig(data.clinica_id, 'modelos_documentos', 'ortus_modelos_documentos', []).then((d: any) => {
                  if (Array.isArray(d)) setModelosDocumentos(d);
              });
          }
          
          registrarAudit({ acao: 'visualizou', entidade: 'paciente', entidade_id: String(id) });
      }
      const { data: hist } = await supabase.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false });
      const historicoFiltrado = (hist || []).filter((h: any) => h.tipo_registro !== 'debito_manual' && h.observacoes !== 'Débito manual');
      setHistorico(historicoFiltrado);
      const debitosLista = await listarDebitosPaciente(id);
      setDebitos(debitosLista);

      setModelosAnamnese(carregarModelos());
      setLoading(false);
  }

  async function salvarTudo() {
      const erro = validarPaciente(form);
      if (erro) { await showAlert(erro, { type: 'warning' }); return; }
      const fichaParaSalvar = { ...ficha };
      LEGACY_CONDICOES.forEach((k) => delete fichaParaSalvar[k]);
      const fichaAtualizada = await salvarFichaClinica(String(id), { odontograma, marcacoes_hof: marcacoesHof }, fichaParaSalvar);
      const payload = { ...form, plano_id: form.plano_id || null, ficha_medica: { ...fichaParaSalvar, ...fichaAtualizada } };
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
          odontograma,
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
      const tool = TOOLS.find(t => t.key === ferramenta);
      if (!tool) return;
      setOdontograma(prev => {
          const atual: ToothState = prev[numDente] || { faces: {}, cond: 'normal' };
          let novo: ToothState;
          if (tool.tipo === 'face' && face) {
              const next = { ...atual.faces } as any;
              if (atual.faces[face] === ferramenta || ferramenta === 'higido') delete next[face];
              else next[face] = ferramenta as FaceStatus;
              novo = { ...atual, faces: next };
          } else if (tool.tipo === 'cond') {
              novo = { ...atual, cond: atual.cond === ferramenta ? 'normal' : ferramenta as ToothCondition };
          } else if (tool.tipo === 'face') {
              // Sem face específica (clique direto no dente via lib): aplica/remove em TODAS faces
              const isAlready = Object.values(atual.faces).every(v => v === ferramenta) && Object.keys(atual.faces).length > 0;
              if (isAlready || ferramenta === 'higido') {
                  novo = { ...atual, faces: {} };
              } else {
                  novo = { ...atual, faces: { V: ferramenta as FaceStatus, M: ferramenta as FaceStatus, D: ferramenta as FaceStatus, L: ferramenta as FaceStatus, O: ferramenta as FaceStatus } };
              }
          } else return prev;
          return { ...prev, [numDente]: novo };
      });
  }

  function limparDente(numDente: number) {
      setOdontograma(prev => { const n = {...prev}; delete n[numDente]; return n; });
  }

  async function salvarOdontograma() {
      setSavingOdo(true);
      try {
          const fichaAtualizada = await salvarFichaClinica(String(id), { odontograma, texto_livre: textoOdontogramaLivre, marcacoes_hof: marcacoesHof }, ficha);
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
          const merged = { ...fichaAtual, ...payload };
          const { error } = await supabase.from('pacientes').update({
              ficha_medica: merged,
              anamnese: anamneseTexto,
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
  }, [odontograma, textoOdontogramaLivre, loading]);

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

  function updateOdontogramaZoom(value: number) {
      const normalized = Number(clampValue(value, ODONTO_ZOOM_RANGE.min, ODONTO_ZOOM_RANGE.max).toFixed(2));
      setOdontogramaZoom(normalized);
      if (normalized === 1) setOdontogramaPan({ x: 0, y: 0 });
  }

  function nudgeOdontogramaZoom(delta: number) {
      updateOdontogramaZoom(odontogramaZoom + delta);
  }

  function resetOdontogramaView() {
      odontogramaPanSession.current.active = false;
      setOdontogramaPan({ x: 0, y: 0 });
      updateOdontogramaZoom(1);
  }

  function handleOdontoPanStart(e: PointerEvent<HTMLDivElement>) {
      if (odontogramaZoom <= 1) return;
      odontogramaPanSession.current.active = true;
      odontogramaPanSession.current.lastX = e.clientX;
      odontogramaPanSession.current.lastY = e.clientY;
      e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handleOdontoPanMove(e: PointerEvent<HTMLDivElement>) {
      if (!odontogramaPanSession.current.active) return;
      const dx = e.clientX - odontogramaPanSession.current.lastX;
      const dy = e.clientY - odontogramaPanSession.current.lastY;
      if (dx === 0 && dy === 0) return;
      odontogramaPanSession.current.lastX = e.clientX;
      odontogramaPanSession.current.lastY = e.clientY;
      const limit = getPanLimit(odontogramaZoom);
      setOdontogramaPan(prev => ({
          x: clampValue(prev.x + dx, -limit, limit),
          y: clampValue(prev.y + dy, -limit, limit),
      }));
  }

  function handleOdontoPanEnd(e: PointerEvent<HTMLDivElement>) {
      if (!odontogramaPanSession.current.active) return;
      odontogramaPanSession.current.active = false;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  function abrirNovoTratamento() {
      setTratEdit({ id: null, dente: '', procedimento: '', data: new Date().toISOString().split('T')[0], status: 'concluido', valor: '', observacoes: '', agendarNaAgenda: false, horaAgendamento: '09:00', pagamentoPendente: false });
      setModalTrat(true);
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

          setModalTrat(false);
          const msg = agendado
              ? 'Tratamento salvo e consulta marcada na agenda!'
              : debitoCriado
                  ? 'Tratamento salvo e débito registrado na aba Débitos.'
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
          const { data: urlData } = supabase.storage.from('arquivos_ortus').getPublicUrl(caminhoArquivo);
          const nova: HofFoto = { id: Date.now().toString(), sessao: hofSessaoAtiva, angulo, dataUrl: urlData.publicUrl, storagePath: caminhoArquivo, criado_em: new Date().toISOString() };
          const novasFotos = [...hofFotos, nova];
          setHofFotos(novasFotos);
          try {
              const fichaAtualizada = await salvarFichaClinica(String(id), { marcacoes_hof: marcacoesHof, hof_fotos: novasFotos }, ficha);
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
          const fichaAtualizada = await salvarFichaClinica(String(id), { marcacoes_hof: marcacoesHof, hof_fotos: novasFotos }, ficha);
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

  async function salvarHof() {
      setSavingHof(true);
      try {
          const fichaAtualizada = await salvarFichaClinica(String(id), { marcacoes_hof: marcacoesHof, hof_fotos: hofFotos }, ficha);
          setFicha({ ...ficha, ...fichaAtualizada });
          showAlert('Mapa facial salvo com sucesso!', { type: 'success' });
      } catch (error: any) {
          showAlert('Erro ao salvar HOF: ' + error.message, { type: 'error' });
      }
      setSavingHof(false);
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
          { x: 50, y: 72, tipo: 'toxina', texto: 'Mentual (queixo)', dosagem: '4', produto: '' },
      ]},
      { nome: 'Preenchimento Labial', pontos: [
          { x: 46, y: 63, tipo: 'preenchimento', texto: 'Lábio superior (arco do cupido E)', dosagem: '0.3', produto: '' },
          { x: 54, y: 63, tipo: 'preenchimento', texto: 'Lábio superior (arco do cupido D)', dosagem: '0.3', produto: '' },
          { x: 50, y: 66, tipo: 'preenchimento', texto: 'Lábio inferior (corpo central)', dosagem: '0.4', produto: '' },
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
  }

  async function gerarLinkAnamnesePaciente() {
      if (!anamneseAtual.modelo_id) {
          await showAlert('Selecione um modelo de anamnese.', { type: 'warning' });
          return;
      }
      setGerandoLinkAnamnese(true);
      try {
          const link = await gerarLinkAnamnesePaciente(String(id), anamneseAtual.modelo_id, form.clinica_id);
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
          autoPrint: true,
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

          const { data: urlData } = supabase.storage.from('arquivos_ortus').getPublicUrl(caminhoArquivo);
          const salvo = await criarDocumento(String(id), {
              nome: file.name,
              tipo: file.type,
              storage_path: caminhoArquivo,
              meta: { isImg, isPdf, dataUrl: urlData.publicUrl, tamanho: blob.size },
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

  function baixarDocumento(d: any) {
      const a = document.createElement('a');
      a.href = d.dataUrl;
      a.download = d.nome;
      a.target = '_blank';
      a.click();
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
          autoPrint: true,
      });
  }

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Carregando Prontuário...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-6 animate-in slide-in-from-right-4 duration-500">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4">
                <Link href="/pacientes" className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"><ArrowLeft size={20}/></Link>
                <div>
                    <h1 className="text-2xl font-black text-slate-800">{form.nome}</h1>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide flex items-center gap-2"><User size={12}/> Prontuário Digital</p>
                </div>
            </div>
            <div className="flex gap-2 flex-wrap">
                {form.nome && <button onClick={handleExportarDados} className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-100 transition-colors flex items-center gap-1.5" title="Exportar prontuário (LGPD)"><Download size={14}/> LGPD</button>}
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
        <Modal open={modalDoc} onClose={() => setModalDoc(false)} maxWidth="2xl" hideCloseButton panelClassName="bg-white rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh]">
                <div className="p-8 animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Printer size={20}/> Emitir Documento</h3>
                        <button onClick={() => setModalDoc(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20}/></button>
                    </div>
                    
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                        <button onClick={() => { setTipoDoc('receita'); setModeloDocId(''); }} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${tipoDoc === 'receita' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Receita</button>
                        <button onClick={() => { setTipoDoc('atestado'); setModeloDocId(''); }} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${tipoDoc === 'atestado' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Atestado</button>
                        <button onClick={() => { setTipoDoc('contrato'); setModeloDocId(''); }} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${tipoDoc === 'contrato' ? 'bg-white shadow text-purple-600' : 'text-slate-500 hover:text-slate-700'}`}>Contrato</button>
                    </div>

                    {tipoDoc === 'contrato' && modelosDocumentos.filter(m => m.tipo === 'contrato').length > 0 && (
                        <div className="mb-4">
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Modelo de contrato</label>
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
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Modelo</label>
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
                        <label className="text-xs font-bold text-slate-400 uppercase flex justify-between">
                            <span>Conteúdo (Editável)</span>
                            <span className="text-blue-500 cursor-pointer hover:underline" onClick={() => setTextoDoc('')}>Limpar Texto</span>
                        </label>
                        <textarea 
                            value={textoDoc} 
                            onChange={(e) => setTextoDoc(e.target.value)} 
                            className="w-full h-64 p-5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium resize-none leading-relaxed shadow-inner"
                        ></textarea>
                        <p className="text-xs text-slate-400 text-right">O cabeçalho e rodapé da clínica serão adicionados na impressão.</p>
                    </div>

                    <button onClick={imprimirDocumento} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black transition-all shadow-lg mt-6 flex justify-center items-center gap-2 active:scale-95">
                        <Printer size={20}/> Imprimir PDF
                    </button>
                </div>
        </Modal>

        <Modal open={!!modalReceber} onClose={() => setModalReceber(null)} maxWidth="md" hideCloseButton panelClassName="bg-white rounded-3xl shadow-2xl overflow-hidden">
                <div className="p-6 animate-in zoom-in-95">
                    <h3 className="text-lg font-black text-slate-800 mb-1">Registrar recebimento</h3>
                    <p className="text-sm text-slate-500 mb-4">{modalReceber?.procedimento}</p>
                    <p className="text-2xl font-black text-emerald-700 mb-4">R$ {(Number(modalReceber?.valor_final ?? modalReceber?.valor) || 0).toFixed(2)}</p>
                    {taxasRecebimento.length > 0 && (
                        <div className="mb-4">
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Forma de pagamento</label>
                            <CustomSelect
                                value={taxaRecebimento}
                                onChange={setTaxaRecebimento}
                                options={[{ value: '', label: 'Sem taxa' }, ...taxasRecebimento.map(t => ({ value: t.id, label: `${t.nome} (${t.taxa_percentual}%)` }))]}
                                size="lg"
                            />
                            {taxaRecebimento && (() => {
                                const taxa = taxasRecebimento.find(t => t.id === taxaRecebimento);
                                const bruto = Number(modalReceber?.valor_final ?? modalReceber?.valor) || 0;
                                if (!taxa) return null;
                                return (
                                    <p className="text-xs text-emerald-700 mt-2 font-bold">
                                        Líquido: R$ {calcularValorLiquido(bruto, taxa.taxa_percentual).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                );
                            })()}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button onClick={() => setModalReceber(null)} disabled={recebendo} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
                        <button onClick={confirmarRecebimento} disabled={recebendo} className="flex-1 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center gap-2">
                            {recebendo ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} Confirmar
                        </button>
                    </div>
                </div>
        </Modal>

        {/* Navegação rápida mobile */}
        <div className="lg:hidden sticky top-16 z-30 pb-4 bg-white/95 backdrop-blur border-b border-slate-100">
            <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none]">
                {PATIENT_NAV_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const active = abaAtiva === section.key;
                    return (
                        <button
                            type="button"
                            key={section.key}
                            onClick={() => setAbaAtiva(section.key)}
                            className={`touch-target snap-start flex-none min-w-[120px] rounded-2xl border px-3 py-3 text-left text-xs font-black transition-all ${active ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                        >
                            <div className="flex items-center gap-2">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                    <Icon size={16} />
                                </div>
                                <span className="text-sm">{section.label}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="hidden lg:block lg:col-span-1 space-y-2">
                {PATIENT_NAV_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const active = abaAtiva === section.key;
                    const badge =
                        section.key === 'documentos' && documentos.length > 0 ? documentos.length
                        : section.key === 'tratamentos' && evolucoes.length > 0 ? evolucoes.length
                        : section.key === 'debitos' && debitos.length > 0 ? debitos.length
                        : section.key === 'hof' && marcacoesHof.length > 0 ? marcacoesHof.length
                        : null;
                    const badgeClass =
                        section.key === 'debitos' ? 'bg-rose-500 text-white animate-pulse'
                        : section.key === 'tratamentos' ? 'bg-teal-100 text-teal-600'
                        : section.key === 'hof' ? 'bg-purple-100 text-purple-600'
                        : 'bg-slate-200 text-slate-600';
                    return (
                        <button
                            key={section.key}
                            type="button"
                            onClick={() => setAbaAtiva(section.key)}
                            className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${active ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}`}
                        >
                            <Icon size={20}/> {section.label}
                            {badge != null && (
                                <span className={`ml-auto text-[10px] font-black px-1.5 py-0.5 rounded ${badgeClass}`}>{badge}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="lg:col-span-3">
                {abaAtiva === 'dados' && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><User size={20} className="text-blue-500"/> Informações do Paciente</h3>
                            <div className="flex gap-2">
                                {modoEdicao ? (
                                    <>
                                        <button onClick={() => { setModoEdicao(false); carregar(); }} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                                        <button onClick={salvarTudo} className="px-5 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 transition-all active:scale-95"><Save size={16}/> Salvar</button>
                                    </>
                                ) : (
                                    <button onClick={() => setModoEdicao(true)} className="px-5 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"><Edit size={16}/> Editar</button>
                                )}
                            </div>
                        </div>
                        
                        {/* Dados Básicos */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-2 md:col-span-1">
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Clínica</label>
                                <CustomSelect disabled={!modoEdicao} value={form.clinica_id || ''} onChange={v => setForm({...form, clinica_id: v})} options={[{value:'',label:'Sem Clínica Definida'}, ...clinicas.map((c:any) => ({value:String(c.id),label:c.nome}))]} size="lg"/>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label>
                                <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none font-bold text-slate-700 ${modoEdicao ? 'bg-white border-blue-300 ring-2 ring-blue-100' : 'bg-slate-50 border-slate-200'}`} value={form.nome || ''} onChange={e => setForm({...form, nome: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Sexo <span className="text-red-500">*</span></label>
                                <CustomSelect disabled={!modoEdicao} value={form.sexo || ''} onChange={v => setForm({...form, sexo: v})} options={[{value:'',label:'Selecione...'},{value:'masculino',label:'Masculino'},{value:'feminino',label:'Feminino'},{value:'outro',label:'Outro'},{value:'nao_informar',label:'Prefiro não informar'}]} size="lg"/>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data Nascimento</label>
                                <input type="date" disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.data_nascimento || ''} onChange={e => setForm({...form, data_nascimento: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">CPF</label>
                                <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.cpf || ''} onChange={e => setForm({...form, cpf: e.target.value})} placeholder="000.000.000-00" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Telefone / WhatsApp</label>
                                <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.telefone || ''} onChange={e => setForm({...form, telefone: e.target.value})} placeholder="(00) 00000-0000" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email</label>
                                <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
                            </div>
                        </div>

                        {/* Plano/Convênio */}
                        <div className="mt-6 pt-6 border-t border-slate-100">
                            <h4 className="text-sm font-black text-slate-700 mb-3">Plano / Convênio</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Plano de Saúde</label>
                                    <CustomSelect 
                                        disabled={!modoEdicao} 
                                        value={form.plano_id || ''} 
                                        onChange={v => setForm({...form, plano_id: v || null})} 
                                        options={[{value:'', label:'Particular (sem convênio)'}, ...planos.map((p:any) => ({value:String(p.id), label:p.nome}))]} 
                                        size="lg"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Endereço Completo com ViaCEP */}
                        <div className="mt-6 pt-6 border-t border-slate-100">
                            <h4 className="text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
                                Endereço <span className="text-red-500 text-xs">*</span>
                                {modoEdicao && (
                                    <button 
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
                                        className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                                    >
                                        Buscar CEP
                                    </button>
                                )}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">CEP</label>
                                    <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.cep || ''} onChange={e => setForm({...form, cep: e.target.value})} placeholder="00000-000" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Rua / Avenida</label>
                                    <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.rua || ''} onChange={e => setForm({...form, rua: e.target.value})} />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Número</label>
                                    <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.numero || ''} onChange={e => setForm({...form, numero: e.target.value})} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Complemento</label>
                                    <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.complemento || ''} onChange={e => setForm({...form, complemento: e.target.value})} placeholder="Apto, Bloco, Sala..." />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Bairro</label>
                                    <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.bairro || ''} onChange={e => setForm({...form, bairro: e.target.value})} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                <div className="md:col-span-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Cidade</label>
                                    <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.cidade || ''} onChange={e => setForm({...form, cidade: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">UF</label>
                                    <CustomSelect disabled={!modoEdicao} value={form.uf || ''} onChange={v => setForm({...form, uf: v})} options={[{value:'',label:'Selecione...'}, ...['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => ({value:uf,label:uf}))]} size="lg"/>
                                </div>
                            </div>
                            {/* Campo endereco antigo (legado) - apenas visualização */}
                            {form.endereco && !form.rua && (
                                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                    <p className="text-xs text-amber-700 font-bold">Endereço legado (antigo formato):</p>
                                    <p className="text-sm text-amber-800">{form.endereco}</p>
                                </div>
                            )}
                        </div>

                        {/* Responsável (para menores) */}
                        <div className="mt-6 pt-6 border-t border-slate-100">
                            <h4 className="text-sm font-black text-slate-700 mb-3">
                                Responsável {menorDeIdade && <span className="text-red-500 text-xs">* (obrigatório — menor de 18 anos)</span>}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome do Responsável</label>
                                    <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.responsavel_nome || ''} onChange={e => setForm({...form, responsavel_nome: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Parentesco</label>
                                    <CustomSelect disabled={!modoEdicao} value={form.responsavel_parentesco || ''} onChange={v => setForm({...form, responsavel_parentesco: v})} options={[{value:'',label:'Selecione...'},{value:'pai',label:'Pai'},{value:'mae',label:'Mãe'},{value:'tutor',label:'Tutor'},{value:'avo',label:'Avô/Avó'},{value:'outro',label:'Outro'}]} size="lg"/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Telefone do Responsável</label>
                                    <input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.responsavel_telefone || ''} onChange={e => setForm({...form, responsavel_telefone: e.target.value})} placeholder="(00) 00000-0000" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {abaAtiva === 'anamnese' && (
                    <div className="space-y-6 animate-in fade-in">
                        {/* NOVA ANAMNESE - MODELO */}
                        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                    <ClipboardList size={20} className="text-blue-500"/>
                                    {anamneseAtual.id ? 'Editar Anamnese' : 'Nova Anamnese'}
                                </h3>
                                <Link href="/configuracoes?aba=anamnese" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1.5"><Settings size={14}/> Criar/Editar Modelos</Link>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                                <div className="md:col-span-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Modelo</label>
                                    <CustomSelect value={anamneseAtual.modelo_id} onChange={v => selecionarModeloAnamnese(v)} options={modelosAnamnese.map(m => ({value:m.id,label:m.nome}))} placeholder="Selecione..." size="md"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block flex items-center gap-1"><Calendar size={11}/> Data</label>
                                    <input type="date" value={anamneseAtual.data} onChange={e => setAnamneseAtual({...anamneseAtual, data: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Preenchido por</label>
                                    <div className="flex bg-slate-100 p-1 rounded-lg">
                                        <button onClick={() => { setAnamneseAtual({...anamneseAtual, preenchido_por: 'profissional'}); setLinkAnamnesePaciente(null); }} className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${anamneseAtual.preenchido_por === 'profissional' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}>Profissional</button>
                                        <button onClick={() => setAnamneseAtual({...anamneseAtual, preenchido_por: 'paciente'})} className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${anamneseAtual.preenchido_por === 'paciente' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}>Paciente</button>
                                    </div>
                                </div>
                            </div>

                            {anamneseAtual.preenchido_por === 'paciente' && anamneseAtual.modelo_id && !anamneseAtual.id ? (
                                <div className="border-t border-slate-100 pt-5 space-y-4">
                                    <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl">
                                        <p className="text-sm font-bold text-purple-800 flex items-center gap-2"><Link2 size={16}/> Modo paciente</p>
                                        <p className="text-xs text-purple-700 mt-1">Gere um link seguro e temporário para o paciente preencher este formulário no celular ou computador.</p>
                                    </div>
                                    {linkAnamnesePaciente ? (
                                        <div className="space-y-3">
                                            <div className="flex gap-2">
                                                <input readOnly value={linkAnamnesePaciente.url} className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600"/>
                                                <button onClick={copiarLinkAnamnese} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shrink-0"><Copy size={14}/> Copiar</button>
                                            </div>
                                            <p className="text-[11px] text-slate-500 font-semibold">Válido até {formatarDataAnamnese(linkAnamnesePaciente.expires_at)}</p>
                                        </div>
                                    ) : (
                                        <button onClick={gerarLinkAnamnesePaciente} disabled={gerandoLinkAnamnese} className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                                            {gerandoLinkAnamnese ? <Loader2 size={14} className="animate-spin"/> : <Link2 size={14}/>} Gerar link para paciente
                                        </button>
                                    )}
                                </div>
                            ) : anamneseAtual.modelo_id ? (() => {
                                const modelo = modelosAnamnese.find(m => m.id === anamneseAtual.modelo_id);
                                if (!modelo) return null;
                                return (
                                    <div className="space-y-4 border-t border-slate-100 pt-5">
                                        {modelo.perguntas.map((p, i) => (
                                            <div key={p.id} className="space-y-1.5">
                                                <label className="text-sm font-bold text-slate-700 flex items-start gap-2">
                                                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-black flex-none">{i+1}</span>
                                                    <span className="pt-0.5">{p.label}</span>
                                                </label>
                                                <div className="ml-8">
                                                    {p.tipo === 'texto' && (
                                                        <textarea value={anamneseAtual.respostas[p.id] || ''} onChange={e => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: e.target.value}})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" rows={2} placeholder="Resposta..."/>
                                                    )}
                                                    {p.tipo === 'sim_nao' && (
                                                        <div className="flex gap-2">
                                                            {['Sim','Não'].map(opt => (
                                                                <button key={opt} onClick={() => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: opt}})} className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${anamneseAtual.respostas[p.id] === opt ? (opt === 'Sim' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-emerald-50 border-emerald-300 text-emerald-700') : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>{opt}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {p.tipo === 'sim_nao_texto' && (() => {
                                                        const atual = (anamneseAtual.respostas[p.id] as RespostaSimNaoTexto) || { sim_nao: '', texto: '' };
                                                        return (
                                                            <div className="space-y-2">
                                                                <div className="flex gap-2">
                                                                    {['Sim','Não'].map(opt => (
                                                                        <button key={opt} onClick={() => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: { ...atual, sim_nao: opt, texto: opt === 'Não' ? '' : atual.texto }}})} className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${atual.sim_nao === opt ? (opt === 'Sim' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-emerald-50 border-emerald-300 text-emerald-700') : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>{opt}</button>
                                                                    ))}
                                                                </div>
                                                                {atual.sim_nao === 'Sim' && (
                                                                    <textarea value={atual.texto || ''} onChange={e => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: { ...atual, texto: e.target.value }}})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" rows={2} placeholder="Especifique..."/>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                    {p.tipo === 'multipla' && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {(p.opcoes || []).map(opt => (
                                                                <button key={opt} onClick={() => setAnamneseAtual({...anamneseAtual, respostas: {...anamneseAtual.respostas, [p.id]: opt}})} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${anamneseAtual.respostas[p.id] === opt ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>{opt}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
                                            <button onClick={salvarAnamnese} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-sm flex items-center gap-2"><Save size={14}/> {anamneseAtual.id ? 'Atualizar Anamnese' : 'Salvar Anamnese'}</button>
                                            <button onClick={() => emitirAnamnese()} className="px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-black flex items-center gap-2"><Printer size={14}/> Emitir / Imprimir</button>
                                            <button onClick={() => { setAnamneseAtual({ id: null, modelo_id: '', data: new Date().toISOString().split('T')[0], preenchido_por: 'profissional', respostas: {} }); setLinkAnamnesePaciente(null); }} className="px-4 py-2.5 text-slate-500 font-bold rounded-xl text-sm hover:bg-slate-100">Limpar</button>
                                        </div>
                                    </div>
                                );
                            })() : (
                                <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl text-sm">
                                    Selecione um modelo de anamnese acima para começar.
                                </div>
                            )}
                        </div>

                        {/* ANAMNESES SALVAS */}
                        {anamnesesAnteriores.length > 0 && (
                            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><FileText size={20} className="text-emerald-500"/> Anamneses Salvas ({anamnesesAnteriores.length})</h3>
                                <div className="space-y-2">
                                    {[...anamnesesAnteriores].sort((a,b) => (b.data||'').localeCompare(a.data||'')).map(a => (
                                        <div
                                            key={a.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setAnamnesePreview(a)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAnamnesePreview(a); } }}
                                            className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl transition-colors cursor-pointer"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center"><ClipboardList size={18}/></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-sm text-slate-800 truncate">{a.modelo_nome}</div>
                                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-slate-500 font-semibold mt-0.5">
                                                    <span className="flex items-center gap-1"><Calendar size={11}/> {a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '—'}</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-black ${a.preenchido_por === 'paciente' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{a.preenchido_por === 'paciente' ? 'paciente' : 'profissional'}</span>
                                                    {a.criado_em && <span>Criado: {formatarDataAnamnese(a.criado_em)}</span>}
                                                    {a.atualizado_em && a.atualizado_em !== a.criado_em && <span>Atualizado: {formatarDataAnamnese(a.atualizado_em)}</span>}
                                                </div>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); editarAnamnese(a); }} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Editar"><Edit size={14}/></button>
                                            <button onClick={(e) => { e.stopPropagation(); emitirAnamnese(a); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Emitir"><Printer size={14}/></button>
                                            <button onClick={(e) => { e.stopPropagation(); excluirAnamnese(a.id); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* FICHA MÉDICA (mantida) */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Stethoscope size={20} className="text-pink-500"/> Ficha Médica Rápida</h3>
                            <p className="text-xs text-slate-400 mb-3">Digite condições relevantes e pressione Enter para adicionar.</p>
                            <TagInput
                                value={getCondicoesFromFicha(ficha)}
                                onChange={updateCondicoes}
                                placeholder="Ex: Diabetes, Hipertensão..."
                            />
                        </div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Pill size={20} className="text-purple-500"/> Medicamentos em Uso</h3>
                            <TagInput
                                value={getMedicamentosFromFicha(ficha)}
                                onChange={updateMedicamentos}
                                suggestions={MEDICAMENTOS_CATALOGO}
                                placeholder="Digite o medicamento e pressione Enter..."
                            />
                        </div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle size={20} className="text-amber-500"/> Observações Clínicas</h3>
                            <textarea value={form.anamnese || ''} onChange={e => setForm({...form, anamnese: e.target.value})} className="w-full p-4 bg-yellow-50 border border-yellow-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-300 h-40 resize-none text-slate-700" placeholder="Histórico detalhado, queixas principais e evolução..." />
                        </div>
                    </div>
                )}

                {abaAtiva === 'tratamentos' && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="flex bg-slate-100 border border-slate-200 rounded-xl p-1 w-fit">
                            <button
                                type="button"
                                onClick={() => setSubAbaTratamentos('tratamentos')}
                                className={`px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${subAbaTratamentos === 'tratamentos' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Tratamentos
                            </button>
                            <button
                                type="button"
                                onClick={() => setSubAbaTratamentos('evolucoes')}
                                className={`px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${subAbaTratamentos === 'evolucoes' ? 'bg-white text-teal-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Evoluções
                            </button>
                        </div>

                        {subAbaTratamentos === 'evolucoes' ? (
                            <TabEvolucao id={id as string} form={form} ficha={ficha} setFicha={setFicha} evolucoes={evolucoes} setEvolucoes={setEvolucoes}/>
                        ) : (
                        <>
                        {/* ODONTOGRAMA */}
                        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Smile size={20} className="text-blue-500"/> Odontograma</h3>
                                <div className="flex gap-2 flex-wrap">
                                    <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                                        {(['anatomica', 'esquematica', 'livre'] as const).map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setVisaoOdonto(v)}
                                                className={`px-4 py-2 text-xs font-bold rounded-md min-h-[44px] transition-all ${visaoOdonto === v ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                {v === 'anatomica' ? 'Anatômica' : v === 'esquematica' ? 'Esquemática' : 'Texto Livre'}
                                            </button>
                                        ))}
                                    </div>
                                    {visaoOdonto !== 'livre' && (
                                        <button
                                            onClick={async () => {
                                                if (await showConfirm('Limpar todo o odontograma?', { title: 'Limpar', type: 'warning', confirmLabel: 'Limpar' })) setOdontograma({});
                                            }}
                                            className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"
                                        >
                                            <Eraser size={14}/> Limpar
                                        </button>
                                    )}
                                    <button onClick={imprimirOrcamento} className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"><Printer size={14}/> PDF</button>
                                    {savingOdo && <span className="text-xs text-slate-400 font-semibold flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Salvando...</span>}
                                </div>
                            </div>

                            {visaoOdonto === 'livre' ? (
                                <div className="mt-2">
                                    <textarea
                                        value={textoOdontogramaLivre}
                                        onChange={e => setTextoOdontogramaLivre(e.target.value)}
                                        className="w-full min-h-[400px] p-4 text-base text-slate-700 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-y leading-relaxed font-medium"
                                        placeholder="Digite livremente as observações e o plano de tratamento do paciente..."
                                    />
                                    <p className="text-[10px] text-slate-400 mt-2">Este texto será salvo junto ao odontograma e pode ser impresso via o botão PDF.</p>
                                </div>
                            ) : (
                            <>
                            {/* Tabs Permanente/Leite */}
                            <div className="mb-4 p-4 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-slate-200">
                                <div className="flex justify-end">
                                    <div className="flex bg-white border border-slate-200 rounded-lg p-0.5">
                                        <button onClick={() => setTipoArcada('permanente')} className={`px-4 py-2 text-xs font-bold rounded-md min-h-[44px] transition-all ${tipoArcada === 'permanente' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}>Dentes Permanentes</button>
                                        <button onClick={() => setTipoArcada('leite')} className={`px-4 py-2 text-xs font-bold rounded-md min-h-[44px] transition-all ${tipoArcada === 'leite' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}>Dentes de Leite</button>
                                    </div>
                                </div>
                            </div>

                            {/* Toolbar de ferramentas */}
                            <div className="flex flex-wrap gap-2 mb-6 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                {TOOLS.map(t => (
                                    <button
                                        key={t.key}
                                        onClick={() => setFerramenta(t.key)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border min-h-[48px] transition-all ${ferramenta === t.key ? 'border-slate-800 ring-2 ring-slate-300 bg-white shadow' : 'border-slate-200 bg-white hover:border-slate-400'}`}
                                    >
                                        <span className="w-4 h-4 rounded border border-slate-300" style={{ background: t.color }}></span>
                                        <span>{t.label}</span>
                                        {t.tipo === 'cond' && <span className="text-[9px] uppercase text-slate-400">dente</span>}
                                    </button>
                                ))}
                                <div className="ml-auto text-[10px] text-slate-500 font-semibold flex items-center px-2">
                                    {TOOLS.find(t => t.key === ferramenta)?.tipo === 'face'
                                        ? 'Clique em uma face na vista oclusal'
                                        : 'Clique em qualquer face para alternar a condição do dente'}
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Zoom e Navegação</div>
                                <div className="flex flex-1 flex-wrap items-center gap-2">
                                    <button onClick={() => nudgeOdontogramaZoom(-0.1)} className="px-3 py-2 rounded-lg border border-slate-200 min-h-[44px] text-sm font-bold text-slate-600 hover:border-slate-400" aria-label="Diminuir zoom do odontograma">−</button>
                                    <input
                                        type="range"
                                        min={ODONTO_ZOOM_RANGE.min}
                                        max={ODONTO_ZOOM_RANGE.max}
                                        step="0.05"
                                        value={odontogramaZoom}
                                        onChange={(e) => updateOdontogramaZoom(parseFloat(e.target.value))}
                                        aria-label="Controle de zoom do odontograma"
                                        className="flex-1 accent-blue-600"
                                    />
                                    <button onClick={() => nudgeOdontogramaZoom(0.1)} className="px-3 py-2 rounded-lg border border-slate-200 min-h-[44px] text-sm font-bold text-slate-600 hover:border-slate-400" aria-label="Aumentar zoom do odontograma">+</button>
                                    <button onClick={resetOdontogramaView} className="px-4 py-2 rounded-lg min-h-[44px] text-sm font-semibold bg-white border border-slate-200 text-slate-600 hover:border-slate-400">Centralizar</button>
                                </div>
                                <span className="text-xs font-bold text-slate-500">{Math.round(odontogramaZoom * 100)}%</span>
                            </div>

                            {/* Arcadas - dente lib + face-grid + número, em colunas alinhadas */}
                            <div className="relative w-full bg-white rounded-2xl p-4 border border-slate-200">
                                <div className="flex justify-center">
                                    <div className="overflow-auto custom-scrollbar">
                                        {(() => {
                                            const isEsq = visaoOdonto === 'esquematica';
                                            const quad = tipoArcada === 'permanente' ? QUAD_PERM : QUAD_LEITE;
                                            return (
                                                <div
                                                    ref={odontogramaSurfaceRef}
                                                    className="inline-flex flex-col items-center min-w-max select-none transition-transform"
                                                    style={{
                                                        transform: `translate3d(${odontogramaPan.x}px, ${odontogramaPan.y}px, 0) scale(${odontogramaZoom})`,
                                                        transformOrigin: 'center center',
                                                        touchAction: odontogramaZoom > 1 ? 'none' : 'pan-x pan-y',
                                                    }}
                                                    onPointerDown={handleOdontoPanStart}
                                                    onPointerMove={handleOdontoPanMove}
                                                    onPointerUp={handleOdontoPanEnd}
                                                    onPointerLeave={handleOdontoPanEnd}
                                                    onPointerCancel={handleOdontoPanEnd}
                                                >
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

                            {/* Resumo de dentes alterados */}
                            <div className="mt-6 pt-4 border-t border-slate-100">
                                <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">Dentes com Marcações ({Object.keys(odontograma).length})</div>
                                <div className="flex flex-wrap gap-2">
                                    {Object.keys(odontograma).length === 0 && <span className="text-xs text-slate-400">Nenhum.</span>}
                                    {Object.entries(odontograma).map(([num, st]) => {
                                        const facesList = Object.entries(st.faces || {}).map(([f,v]) => `${f}:${v}`).join(', ');
                                        const condTxt = st.cond !== 'normal' ? st.cond : '';
                                        return (
                                            <div key={num} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold">
                                                <span className="text-blue-600">#{num}</span>
                                                {condTxt && <span className="text-amber-600 uppercase">{condTxt}</span>}
                                                {facesList && <span className="text-slate-500 normal-case">{facesList}</span>}
                                                <button onClick={() => limparDente(parseInt(num))} className="text-rose-400 hover:text-rose-600 ml-1"><X size={12}/></button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            </>
                            )}
                        </div>

                        {/* TRATAMENTOS REALIZADOS */}
                        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-5">
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><CheckCircle size={20} className="text-emerald-500"/> Tratamentos Realizados</h3>
                                <button onClick={abrirNovoTratamento} className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"><Plus size={14}/> Novo Tratamento</button>
                            </div>

                            {tratamentos.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl text-sm">Nenhum tratamento registrado ainda.</div>
                            ) : (
                                <div className="space-y-2">
                                    {[...tratamentos].sort((a,b) => (b.data||'').localeCompare(a.data||'')).map((t:any) => (
                                        <div key={t.id} className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm ${t.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' : t.status === 'andamento' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{t.dente || '-'}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-slate-800 truncate">{t.procedimento}</span>
                                                    <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded ${t.status === 'concluido' ? 'bg-emerald-200 text-emerald-800' : t.status === 'andamento' ? 'bg-amber-200 text-amber-800' : 'bg-blue-200 text-blue-800'}`}>{t.status}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[11px] text-slate-500 font-semibold">
                                                    <span className="flex items-center gap-1"><Calendar size={11}/> {t.data ? new Date(t.data).toLocaleDateString('pt-BR') : '-'}</span>
                                                    {t.valor && <span className="text-emerald-600">R$ {parseFloat(t.valor).toFixed(2)}</span>}
                                                    {t.observacoes && <span className="italic truncate">"{t.observacoes}"</span>}
                                                </div>
                                            </div>
                                            <button onClick={() => { setTratEdit(t); setModalTrat(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={14}/></button>
                                            <button onClick={() => excluirTratamento(t.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Valor Total do Orçamento */}
                            {tratamentos.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 text-sm text-slate-500 font-semibold">
                                        <DollarSign size={16} className="text-emerald-500"/>
                                        <span>{tratamentos.length} tratamento{tratamentos.length !== 1 ? 's' : ''} registrado{tratamentos.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-slate-400 uppercase">Valor Total:</span>
                                        <span className="text-xl font-black text-emerald-600">{formatarMoeda(valorTotalOrcamento)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        </>
                        )}
                    </div>
                )}

                {abaAtiva === 'documentos' && (
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><FolderOpen size={20} className="text-amber-500"/> Documentos & Imagens</h3>
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => setModalDoc(true)} className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 bg-slate-800 text-white hover:bg-black transition-colors shadow-sm"><Printer size={14}/> Emitir Documento</button>
                                <label className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm transition-all ${uploadingDoc ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                    {uploadingDoc ? <><Loader2 size={14} className="animate-spin"/> Enviando...</> : <><Upload size={14}/> Enviar Arquivo</>}
                                    <input type="file" className="hidden" onChange={uploadDocumento} disabled={uploadingDoc} accept="image/*,application/pdf,.doc,.docx,.txt"/>
                                </label>
                            </div>
                        </div>

                        {documentos.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
                                <FolderOpen className="mx-auto mb-2 text-slate-300" size={36}/>
                                <p className="text-sm">Nenhum documento enviado ainda.</p>
                                <p className="text-xs mt-1">Aceitos: imagens, PDF, DOC. Máx 10MB por arquivo.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {[...documentos].sort((a,b) => (b.criado_em||'').localeCompare(a.criado_em||'')).map(d => (
                                    <div key={d.id} className="group relative bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all">
                                        {d.isImg ? (
                                            <a href={d.dataUrl} target="_blank" rel="noopener" className="block">
                                                <img src={d.dataUrl} alt={d.nome} className="w-full h-32 object-cover bg-white"/>
                                            </a>
                                        ) : d.isPdf ? (
                                            <a href={d.dataUrl} target="_blank" rel="noopener" className="block relative h-32 bg-white overflow-hidden">
                                                <embed src={`${d.dataUrl}#toolbar=0&navpanes=0`} type="application/pdf" className="w-full h-full pointer-events-none scale-[1.02] origin-top" title={d.nome} />
                                            </a>
                                        ) : (
                                            <a href={d.dataUrl} target="_blank" rel="noopener" className="flex items-center justify-center h-32 bg-gradient-to-br from-slate-100 to-slate-200">
                                                <FileText className="text-slate-400" size={42}/>
                                            </a>
                                        )}
                                        <div className="p-3">
                                            <div className="text-xs font-bold text-slate-700 truncate" title={d.nome}>{d.nome}</div>
                                            <div className="text-[10px] text-slate-400 font-semibold">{(d.tamanho/1024).toFixed(0)} KB · {new Date(d.criado_em).toLocaleDateString('pt-BR')}</div>
                                        </div>
                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => baixarDocumento(d)} className="p-1.5 bg-white/95 hover:bg-blue-600 hover:text-white text-slate-600 rounded-lg shadow" title="Baixar"><Download size={12}/></button>
                                            <button onClick={() => excluirDocumento(d.id)} className="p-1.5 bg-white/95 hover:bg-rose-600 hover:text-white text-slate-600 rounded-lg shadow" title="Excluir"><Trash2 size={12}/></button>
                                        </div>
                                        {d.isImg && <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-black uppercase rounded">Imagem</span>}
                                        {d.isPdf && <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-black uppercase rounded">PDF</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {abaAtiva === 'debitos' && (
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><AlertCircle size={20} className="text-rose-500"/> Débitos / Fiados</h3>
                            <div className="flex items-center gap-3">
                            {debitos.length > 0 && (
                                <div className="text-right">
                                    <div className="text-[10px] uppercase font-bold text-slate-400">Total em aberto</div>
                                    <div className="text-2xl font-black text-rose-600">R$ {debitos.reduce((s,d) => s + (d.valor || 0), 0).toFixed(2)}</div>
                                </div>
                            )}
                            <button type="button" onClick={abrirModalDebitoManual} className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold text-xs hover:bg-rose-700 flex items-center gap-1.5"><Plus size={14}/> Adicionar débito</button>
                            </div>
                        </div>

                        {debitos.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-emerald-200 rounded-2xl bg-emerald-50/30">
                                <CheckCircle className="mx-auto mb-2 text-emerald-300" size={36}/>
                                <p className="text-sm font-bold text-emerald-700">Nenhum débito em aberto.</p>
                                <p className="text-xs mt-1 text-slate-500">Atendimentos finalizados como "fiado" aparecerão aqui.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {debitos.map(d => (
                                    <div key={d.id} className="flex items-center gap-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl hover:bg-rose-100/60 transition-colors">
                                        <div className="w-12 h-12 rounded-xl bg-rose-500 text-white flex items-center justify-center"><DollarSign size={22}/></div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-slate-800">{d.descricao || d.procedimento}</div>
                                            <div className="flex items-center gap-3 text-xs text-slate-500 font-semibold mt-1">
                                                {d.data_hora && (
                                                    <>
                                                        <span className="flex items-center gap-1"><Calendar size={11}/> {new Date(d.data_hora).toLocaleDateString('pt-BR')}</span>
                                                        <span className="flex items-center gap-1"><Clock size={11}/> {new Date(d.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
                                                    </>
                                                )}
                                                {d.created_at && !d.data_hora && (
                                                    <span className="flex items-center gap-1"><Calendar size={11}/> {new Date(d.created_at).toLocaleDateString('pt-BR')}</span>
                                                )}
                                                {d.profissionais?.nome && <span className="flex items-center gap-1"><User size={11}/> {d.profissionais.nome}</span>}
                                                <span className="text-[10px] uppercase font-black text-rose-500">{d.origem === 'manual' ? 'Manual' : 'Atendimento'}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] uppercase font-bold text-rose-500">Em aberto</div>
                                            <div className="text-xl font-black text-rose-700">R$ {(d.valor || 0).toFixed(2)}</div>
                                        </div>
                                        <button onClick={() => marcarComoPago(d.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 shadow-sm flex items-center gap-1.5"><CheckCircle size={14}/> Marcar Pago</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {abaAtiva === 'hof' && (
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        {/* Preload face images for instant render */}
                        <link rel="preload" as="image" href="/hof/imagem_feminina.png" />
                        <link rel="preload" as="image" href="/hof/imagem_masculina.png" />
                        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Sparkles size={20} className="text-purple-500"/> Harmonização Orofacial (HOF)</h3>
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => setModalProtocolo(true)} className="px-4 py-2 text-sm font-semibold rounded-lg min-h-[44px] bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 flex items-center gap-1.5"><Zap size={16}/> Protocolos</button>
                                <button onClick={gerarTermoConsentimentoHof} className="px-4 py-2 text-sm font-semibold rounded-lg min-h-[44px] bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1.5"><ShieldCheck size={16}/> Consentimento</button>
                                <button onClick={imprimirMapaHof} className="px-4 py-2 text-sm font-semibold rounded-lg min-h-[44px] bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-1.5"><Printer size={16}/> Imprimir</button>
                                <button onClick={async () => { if(marcacoesHof.length && await showConfirm('Limpar todas as marcações?', { title: 'Limpar', type: 'warning', confirmLabel: 'Limpar' })) setMarcacoesHof([]); }} className="px-4 py-2 text-sm font-semibold rounded-lg min-h-[44px] bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1.5"><Eraser size={16}/> Limpar</button>
                                <button onClick={salvarHof} disabled={savingHof} className="px-5 py-2 text-sm font-bold rounded-lg min-h-[44px] bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1.5 shadow-sm disabled:opacity-50">{savingHof ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Salvar</button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-full p-1">
                                {(['visualizar','alterar'] as const).map(modo => (
                                    <button
                                        key={modo}
                                        onClick={() => {
                                            setHofModo(modo);
                                            if (modo === 'visualizar') setHofPopover({ x: 0, y: 0, open: false });
                                        }}
                                        className={`px-4 py-2 text-xs font-black rounded-full min-h-[44px] transition-all ${hofModo === modo ? 'bg-white text-purple-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
                                        aria-pressed={hofModo === modo}
                                    >
                                        {modo === 'visualizar' ? 'Visualizar' : 'Alterar'}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-slate-500 font-semibold">
                                Modo "Visualizar" bloqueia novos pontos para evitar toques acidentais.
                            </p>
                        </div>

                        {/* Alertas de retorno */}
                        {hofAlertas.length > 0 && (
                            <div className="mb-5 space-y-2">
                                {hofAlertas.map(a => {
                                    const vencido = a.diasRestantes <= 0;
                                    const proximo = a.diasRestantes > 0 && a.diasRestantes <= 30;
                                    return (
                                        <div key={a.tipo} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-bold ${vencido ? 'bg-rose-50 border-rose-200 text-rose-700' : proximo ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                            <Bell size={16} className={vencido ? 'text-rose-500' : proximo ? 'text-amber-500' : 'text-emerald-500'}/>
                                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: a.cor }}/>
                                            <span className="flex-1">
                                                <b>{a.label}</b>
                                                {vencido
                                                    ? <> — <span className="text-rose-600">Reaplicação vencida há {Math.abs(a.diasRestantes)} dias!</span></>
                                                    : proximo
                                                        ? <> — Reaplicação em <span className="text-amber-600">{a.diasRestantes} dias</span></>
                                                        : <> — Próxima reaplicação em {a.diasRestantes} dias ({a.vencimento.toLocaleDateString('pt-BR')})</>
                                                }
                                            </span>
                                            <span className="text-[10px] font-semibold opacity-60">Última: {new Date(a.ultimaSessao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Sessão ativa */}
                        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Sessão:</span>
                            <input type="date" value={hofSessaoAtiva} onChange={e => setHofSessaoAtiva(e.target.value)} className="p-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500 bg-white"/>
                            <span className="text-[10px] text-slate-400 font-semibold">Novas marcações serão vinculadas a esta sessão.</span>
                        </div>

                        {/* Toolbar de procedimentos + Toggle Gênero */}
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            {HOF_TIPOS.map(t => (
                                <button key={t.key} onClick={() => setHofTipoAtivo(t.key)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border min-h-[48px] transition-all ${hofTipoAtivo === t.key ? 'border-slate-800 ring-2 ring-slate-300 bg-white shadow' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
                                    <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" style={{ background: t.color }}/>
                                    <span>{t.label}</span>
                                </button>
                            ))}
                            <div className="ml-auto flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                                <button onClick={() => setFaceHofAtiva('feminina')} className={`px-4 py-2 text-[11px] font-bold rounded-md min-h-[44px] transition-all ${faceHofAtiva === 'feminina' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>♀ Feminino</button>
                                <button onClick={() => setFaceHofAtiva('masculina')} className={`px-4 py-2 text-[11px] font-bold rounded-md min-h-[44px] transition-all ${faceHofAtiva === 'masculina' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>♂ Masculino</button>
                            </div>
                        </div>

                        <p className="text-xs text-slate-500 font-semibold mb-4">Selecione o tipo de procedimento acima e clique no rosto para marcar. Hover nos pontos para detalhes.</p>

                        {/* Canvas Facial */}
                        <div className="flex justify-center">
                            <div
                                ref={hofSurfaceRef}
                                className={`relative max-w-md w-full select-none rounded-2xl overflow-hidden border-2 border-slate-200 bg-cover bg-center bg-no-repeat transition-all duration-300 ${hofModo === 'alterar' ? 'cursor-crosshair' : 'cursor-default'}`}
                                style={{
                                    aspectRatio: '3/4',
                                    backgroundImage: faceHofAtiva === 'feminina'
                                        ? "url('/hof/imagem_feminina.png')"
                                        : "url('/hof/imagem_masculina.png')",
                                    touchAction: 'manipulation',
                                }}
                                onClick={hofModo === 'alterar' ? handleFaceClick : undefined}
                            >
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
                                        <div className="bg-white border border-slate-200 rounded-xl shadow-2xl p-3 w-64 animate-in zoom-in-95">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: hofTipoInfo(hofTipoAtivo).color }}/>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: hofTipoInfo(hofTipoAtivo).color }}>{hofTipoInfo(hofTipoAtivo).label}</span>
                                                </div>
                                                <button onClick={() => setHofPopover({x:0,y:0,open:false})} className="p-0.5 hover:bg-slate-100 rounded text-slate-400"><X size={12}/></button>
                                            </div>
                                            <textarea value={hofTexto} onChange={e => setHofTexto(e.target.value)} autoFocus placeholder="Observação do procedimento..." className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 h-14 resize-none"/>
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Dosagem ({hofTipoInfo(hofTipoAtivo).unidadePadrao || '-'})</label>
                                                    <input type="text" value={hofDosagem} onChange={e => setHofDosagem(e.target.value)} placeholder="Ex: 10" className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500"/>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Produto/Marca</label>
                                                    <input type="text" value={hofProduto} onChange={e => setHofProduto(e.target.value)} placeholder="Ex: Botox" className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500"/>
                                                </div>
                                            </div>
                                            <button onClick={salvarMarcacaoHof} disabled={!hofTexto.trim()} className="mt-2 w-full py-2 text-xs font-bold rounded-lg text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-sm" style={{ background: hofTipoInfo(hofTipoAtivo).color }}><Plus size={12}/> Salvar Marcação</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Legenda */}
                        <div className="flex flex-wrap gap-3 mt-4 justify-center">
                            {HOF_TIPOS.map(t => {
                                const count = marcacoesHof.filter(m => m.tipo === t.key).length;
                                if (!count) return null;
                                return <span key={t.key} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><span className="w-3 h-3 rounded-full border border-slate-300" style={{ background: t.color }}/>{t.label} ({count})</span>;
                            })}
                        </div>

                        {/* Fotos da Sessão Ativa */}
                        <div className="mt-6 pt-4 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5"><Camera size={12}/> Fotos da Sessão ({hofFotos.filter(f => f.sessao === hofSessaoAtiva).length})</div>
                                <div className="flex gap-2">
                                    {['Frontal', 'Perfil E', 'Perfil D', '45° E', '45° D'].map(angulo => (
                                        <label key={angulo} className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg cursor-pointer flex items-center gap-1 transition-all ${enviandoFoto === angulo ? 'bg-purple-200 text-purple-500 cursor-wait' : enviandoFoto ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100'}`}>
                                            {enviandoFoto === angulo ? <><Loader2 size={10} className="animate-spin"/> Enviando...</> : <><Camera size={10}/> {angulo}</>}
                                            <input type="file" accept="image/*" className="hidden" disabled={!!enviandoFoto} onChange={e => uploadHofFoto(e, angulo)}/>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {hofFotos.filter(f => f.sessao === hofSessaoAtiva).length > 0 && (
                                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                                    {hofFotos.filter(f => f.sessao === hofSessaoAtiva).map(f => (
                                        <div key={f.id} className="relative group/foto rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-[3/4]">
                                            <img src={f.dataUrl} alt={f.angulo} className="w-full h-full object-cover"/>
                                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                                <span className="text-[9px] font-bold text-white uppercase">{f.angulo}</span>
                                            </div>
                                            <button onClick={() => excluirHofFoto(f.id)} className="absolute top-1 right-1 hidden group-hover/foto:flex w-5 h-5 bg-rose-500 text-white rounded-full items-center justify-center shadow hover:bg-rose-600"><X size={10}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Before/After Comparação */}
                        {hofSessoes.length >= 2 && (
                            <div className="mt-6 pt-4 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5"><ArrowLeftRight size={12}/> Comparação Before / After</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-500">Antes:</span>
                                        <CustomSelect value={hofCompararSessoes?.[0] || ''} onChange={v => setHofCompararSessoes([v, hofCompararSessoes?.[1] || hofSessoes[0]])} options={hofSessoes.map(s => ({value:s,label:new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')}))} placeholder="Selecione" size="sm"/>
                                    </div>
                                    <ArrowLeftRight size={14} className="text-slate-300"/>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-500">Depois:</span>
                                        <CustomSelect value={hofCompararSessoes?.[1] || ''} onChange={v => setHofCompararSessoes([hofCompararSessoes?.[0] || hofSessoes[hofSessoes.length - 1], v])} options={hofSessoes.map(s => ({value:s,label:new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')}))} placeholder="Selecione" size="sm"/>
                                    </div>
                                </div>
                                {hofCompararSessoes?.[0] && hofCompararSessoes?.[1] && (() => {
                                    const fotosAntes = hofFotos.filter(f => f.sessao === hofCompararSessoes![0]);
                                    const fotosDepois = hofFotos.filter(f => f.sessao === hofCompararSessoes![1]);
                                    const angulos = Array.from(new Set([...fotosAntes.map(f => f.angulo), ...fotosDepois.map(f => f.angulo)]));
                                    if (!angulos.length) return <p className="text-xs text-slate-400 italic">Nenhuma foto encontrada nestas sessões. Adicione fotos para comparar.</p>;
                                    return (
                                        <div className="space-y-3">
                                            {angulos.map(ang => {
                                                const antes = fotosAntes.find(f => f.angulo === ang);
                                                const depois = fotosDepois.find(f => f.angulo === ang);
                                                return (
                                                    <div key={ang} className="border border-slate-200 rounded-xl overflow-hidden">
                                                        <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">{ang}</div>
                                                        <div className="grid grid-cols-2 gap-px bg-slate-200">
                                                            <div className="bg-white relative aspect-[3/4]">
                                                                <div className="absolute top-2 left-2 text-[9px] font-bold bg-slate-800/70 text-white px-2 py-0.5 rounded z-10">ANTES</div>
                                                                {antes ? <img src={antes.dataUrl} alt="Antes" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Camera size={24}/></div>}
                                                            </div>
                                                            <div className="bg-white relative aspect-[3/4]">
                                                                <div className="absolute top-2 left-2 text-[9px] font-bold bg-purple-600/80 text-white px-2 py-0.5 rounded z-10">DEPOIS</div>
                                                                {depois ? <img src={depois.dataUrl} alt="Depois" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Camera size={24}/></div>}
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
                            <div className="mt-6 pt-4 border-t border-slate-100">
                                <div className="text-[10px] uppercase font-bold text-slate-400 mb-3">Histórico de Sessões ({hofSessoes.length})</div>
                                <div className="space-y-4">
                                    {hofSessoes.map(sessao => {
                                        const itens = marcacoesHof.filter(m => (m.sessao || m.data) === sessao);
                                        const fotosSessao = hofFotos.filter(f => f.sessao === sessao);
                                        const totalDoseToxina = itens.filter(m => m.tipo === 'toxina' && m.dosagem).reduce((s, m) => s + (parseFloat(m.dosagem) || 0), 0);
                                        return (
                                            <div key={sessao} className="border border-slate-200 rounded-xl overflow-hidden">
                                                <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-200">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar size={14} className="text-purple-500"/>
                                                        <span className="text-sm font-black text-slate-700">{new Date(sessao + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                                                        {itens.length > 0 && <span>{itens.length} ponto{itens.length > 1 ? 's' : ''}</span>}
                                                        {fotosSessao.length > 0 && <span className="text-purple-500">{fotosSessao.length} foto{fotosSessao.length > 1 ? 's' : ''}</span>}
                                                        {totalDoseToxina > 0 && <span className="text-red-500">Toxina: {totalDoseToxina}U</span>}
                                                    </div>
                                                </div>
                                                {/* Fotos da sessão */}
                                                {fotosSessao.length > 0 && (
                                                    <div className="flex gap-2 p-3 bg-slate-50/50 border-b border-slate-100 overflow-x-auto">
                                                        {fotosSessao.map(f => (
                                                            <div key={f.id} className="w-16 h-20 rounded-lg overflow-hidden border border-slate-200 shrink-0 relative group/ft">
                                                                <img src={f.dataUrl} alt={f.angulo} className="w-full h-full object-cover"/>
                                                                <div className="absolute bottom-0 inset-x-0 bg-black/50 text-[7px] text-white font-bold text-center py-0.5">{f.angulo}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {itens.length > 0 && (
                                                <div className="divide-y divide-slate-100">
                                                    {itens.map((m, i) => {
                                                        const ti = hofTipoInfo(m.tipo);
                                                        return (
                                                            <div key={m.id} className="flex items-start gap-3 px-4 py-2.5 group/item hover:bg-slate-50/50">
                                                                <div className="w-5 h-5 rounded-full border-2 border-white shadow shrink-0 mt-0.5" style={{ background: ti.color }}/>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: ti.color + '18', color: ti.color }}>{ti.label}</span>
                                                                        <span className="text-sm font-bold text-slate-700">{m.texto}</span>
                                                                    </div>
                                                                    {(m.dosagem || m.produto) && (
                                                                        <div className="flex gap-3 mt-0.5 text-[10px] text-slate-400 font-semibold">
                                                                            {m.dosagem && <span>Dose: {m.dosagem} {m.unidade}</span>}
                                                                            {m.produto && <span>Produto: {m.produto}</span>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <button onClick={() => excluirMarcacaoHof(m.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0"><Trash2 size={13}/></button>
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
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Clock size={20} className="text-blue-500"/> Histórico de Atendimentos</h3>
                        {historico.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">Nenhum atendimento registrado.</div>
                        ) : (
                            <div className="relative border-l-2 border-blue-100 ml-4 space-y-8 pb-4">
                                {historico.map((h: any) => {
                                    const valor = Number(h.valor_final ?? h.valor ?? 0);
                                    const emDebito = h.status === 'fiado';
                                    return (
                                        <div key={h.id} className="ml-8 relative">
                                            <div className={`absolute -left-[41px] top-1 w-6 h-6 rounded-full border-4 border-white shadow-sm ${emDebito ? 'bg-rose-500' : 'bg-blue-500'}`}></div>
                                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60">
                                                <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                                                    <span className="font-bold text-slate-800 text-lg">{h.procedimento}</span>
                                                    <div className="flex items-center gap-2">
                                                        {valor > 0 && <span className="text-sm font-black text-slate-700">R$ {valor.toFixed(2)}</span>}
                                                        {emDebito && <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-rose-100 text-rose-700 border border-rose-200">Em débito</span>}
                                                        <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-slate-200 text-slate-500 uppercase">{h.status}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-bold mb-3">
                                                    <span className="flex items-center gap-1"><Calendar size={14}/> {new Date(h.data_hora).toLocaleDateString('pt-BR')}</span>
                                                    <span className="flex items-center gap-1"><Clock size={14}/> {new Date(h.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    <span className="flex items-center gap-1"><User size={14}/> {h.profissionais?.nome || 'Dr(a).'}</span>
                                                    {h.status === 'concluido' && h.data_pagamento && (
                                                        <span className="text-emerald-600 flex items-center gap-1">
                                                            <CheckCircle size={12}/>
                                                            Pago em {new Date(h.data_pagamento).toLocaleDateString('pt-BR')}
                                                            {h.valor_liquido != null && ` · líq. R$ ${Number(h.valor_liquido).toFixed(2)}`}
                                                        </span>
                                                    )}
                                                    {h.status === 'concluido' && !h.data_pagamento && h.valor_liquido != null && (
                                                        <span className="text-emerald-600">Pago · líq. R$ {Number(h.valor_liquido).toFixed(2)}</span>
                                                    )}
                                                </div>
                                                {h.observacoes && <p className="text-sm text-slate-600 bg-white p-3 rounded-xl border border-slate-100 italic">&quot;{h.observacoes}&quot;</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* MODAL TRATAMENTO */}
        <Modal open={modalTrat} onClose={() => setModalTrat(false)} maxWidth="lg" hideCloseButton panelClassName="bg-white rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh]">
                <div className="p-6 animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Smile size={20} className="text-emerald-500"/> {tratEdit.id ? 'Editar' : 'Novo'} Tratamento</h3>
                        <button onClick={() => setModalTrat(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18}/></button>
                    </div>
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Dente</label>
                                <input placeholder="Ex: 16" value={tratEdit.dente} onChange={e => setTratEdit({...tratEdit, dente: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Data</label>
                                <input type="date" value={tratEdit.data} onChange={e => setTratEdit({...tratEdit, data: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"/>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Procedimento</label>
                            <input placeholder="Ex: Restauração em resina" value={tratEdit.procedimento} onChange={e => setTratEdit({...tratEdit, procedimento: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"/>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Status</label>
                                <CustomSelect value={tratEdit.status} onChange={v => setTratEdit({...tratEdit, status: v})} options={[{value:'planejado',label:'Planejado'},{value:'andamento',label:'Em Andamento'},{value:'concluido',label:'Concluído'}]}/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Valor (R$)</label>
                                <input type="number" step="0.01" value={tratEdit.valor} onChange={e => setTratEdit({...tratEdit, valor: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"/>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Observações</label>
                            <textarea value={tratEdit.observacoes} onChange={e => setTratEdit({...tratEdit, observacoes: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none" />
                        </div>
                        {/* Agendar na Agenda */}
                        <div className={`p-3 rounded-xl border transition-all ${tratEdit.agendarNaAgenda ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${tratEdit.agendarNaAgenda ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300'}`}>
                                    {tratEdit.agendarNaAgenda && <Check size={14}/>}
                                </div>
                                <input type="checkbox" className="hidden" checked={tratEdit.agendarNaAgenda || false} onChange={e => setTratEdit({...tratEdit, agendarNaAgenda: e.target.checked})} />
                                <div className="flex items-center gap-2">
                                    <CalendarPlus size={16} className={tratEdit.agendarNaAgenda ? 'text-blue-600' : 'text-slate-400'}/>
                                    <span className={`text-sm font-bold ${tratEdit.agendarNaAgenda ? 'text-blue-700' : 'text-slate-600'}`}>Agendar consulta na Agenda</span>
                                </div>
                            </label>
                            {tratEdit.agendarNaAgenda && (
                                <div className="mt-3 ml-8">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Horário da Consulta</label>
                                    <input type="time" value={tratEdit.horaAgendamento || '09:00'} onChange={e => setTratEdit({...tratEdit, horaAgendamento: e.target.value})} className="w-full max-w-[160px] p-2.5 border border-blue-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 bg-white"/>
                                    <p className="text-[10px] text-blue-500 mt-1.5 font-semibold">A consulta será criada na data acima ({tratEdit.data ? new Date(tratEdit.data + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}) às {tratEdit.horaAgendamento || '09:00'}.</p>
                                </div>
                            )}
                        </div>
                        {/* Pagamento pendente */}
                        {parseFloat(tratEdit.valor) > 0 && (
                        <div className={`p-3 rounded-xl border transition-all ${tratEdit.pagamentoPendente ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${tratEdit.pagamentoPendente ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-slate-300'}`}>
                                    {tratEdit.pagamentoPendente && <Check size={14}/>}
                                </div>
                                <input type="checkbox" className="hidden" checked={tratEdit.pagamentoPendente || false} onChange={e => setTratEdit({...tratEdit, pagamentoPendente: e.target.checked})} />
                                <div className="flex items-center gap-2">
                                    <DollarSign size={16} className={tratEdit.pagamentoPendente ? 'text-rose-600' : 'text-slate-400'}/>
                                    <span className={`text-sm font-bold ${tratEdit.pagamentoPendente ? 'text-rose-700' : 'text-slate-600'}`}>Registrar como pagamento pendente (fiado)</span>
                                </div>
                            </label>
                            {tratEdit.pagamentoPendente && (
                                <p className="text-[10px] text-rose-600 mt-2 ml-8 font-semibold">O valor aparecerá na aba Débitos até ser recebido.</p>
                            )}
                        </div>
                        )}
                    </div>
                    <div className="flex gap-2 justify-end mt-5">
                        <button onClick={() => setModalTrat(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancelar</button>
                        <button onClick={salvarTratamento} disabled={salvandoTrat} className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"><Save size={14}/> {salvandoTrat ? 'Salvando...' : (tratEdit.agendarNaAgenda ? 'Salvar e Agendar' : 'Salvar')}</button>
                    </div>
                </div>
        </Modal>

        {/* MODAL PROTOCOLOS HOF */}
        <Modal open={modalProtocolo} onClose={() => setModalProtocolo(false)} maxWidth="lg" hideCloseButton panelClassName="bg-white rounded-3xl shadow-2xl overflow-y-auto max-h-[80vh]">
                <div className="p-6 animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Zap size={20} className="text-amber-500"/> Protocolos Pré-definidos</h3>
                        <button onClick={() => setModalProtocolo(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18}/></button>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold mb-4">Selecione um protocolo para aplicar automaticamente os pontos no mapa facial da sessão ativa. Você poderá editar as doses e produtos depois.</p>
                    <div className="space-y-3">
                        {HOF_PROTOCOLOS.map((proto, idx) => {
                            const tipos = Array.from(new Set(proto.pontos.map(p => p.tipo)));
                            return (
                                <button key={idx} onClick={() => aplicarProtocolo(idx)} className="w-full text-left p-4 border border-slate-200 rounded-2xl hover:border-purple-300 hover:bg-purple-50/30 transition-all group">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-1">
                                                {tipos.map(t => <span key={t} className="w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ background: hofTipoInfo(t).color }}/>)}
                                            </div>
                                            <span className="font-bold text-slate-800 group-hover:text-purple-700">{proto.nome}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400">{proto.pontos.length} pontos</span>
                                    </div>
                                    <div className="flex gap-3 mt-2 text-[10px] text-slate-500 font-semibold">
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

        <Modal open={!!anamnesePreview} onClose={() => setAnamnesePreview(null)} maxWidth="2xl">
            {anamnesePreview && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="text-lg font-black text-slate-800 pr-8">{anamnesePreview.modelo_nome}</h3>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500 font-semibold">
                            <span className="flex items-center gap-1"><Calendar size={12}/> {anamnesePreview.data ? new Date(anamnesePreview.data).toLocaleDateString('pt-BR') : '—'}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-black ${anamnesePreview.preenchido_por === 'paciente' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {anamnesePreview.preenchido_por === 'paciente' ? 'paciente' : 'profissional'}
                            </span>
                            {anamnesePreview.criado_em && <span>Criado: {formatarDataAnamnese(anamnesePreview.criado_em)}</span>}
                            {anamnesePreview.atualizado_em && anamnesePreview.atualizado_em !== anamnesePreview.criado_em && <span>Atualizado: {formatarDataAnamnese(anamnesePreview.atualizado_em)}</span>}
                        </div>
                    </div>
                    <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                        {(anamnesePreview.perguntas_snapshot || []).map((p: { id: string; label: string }, i: number) => (
                            <div key={p.id} className="space-y-1">
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">{i + 1}. {p.label}</p>
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-xl p-3">
                                    {formatarRespostaAnamnese(anamnesePreview.respostas?.[p.id])}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                        <button onClick={() => { editarAnamnese(anamnesePreview); }} className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-bold text-sm hover:bg-amber-100 flex items-center gap-2"><Edit size={14}/> Editar</button>
                        <button onClick={() => emitirAnamnese(anamnesePreview)} className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-black flex items-center gap-2"><Printer size={14}/> Imprimir</button>
                        <button onClick={() => setAnamnesePreview(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Fechar</button>
                    </div>
                </div>
            )}
        </Modal>

        <Modal open={modalDebitoManual} onClose={() => setModalDebitoManual(false)} maxWidth="md" hideCloseButton panelClassName="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b bg-rose-50">
                <h3 className="font-black text-slate-800">Adicionar débito</h3>
                <p className="text-xs text-slate-500 mt-1">Descrição livre e/ou marque atendimentos e tratamentos como não pagos.</p>
            </div>
            <div className="p-5 space-y-4">
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Descrição</label>
                    <input value={formDebito.descricao} onChange={(e) => setFormDebito({ ...formDebito, descricao: e.target.value })} className="w-full p-3 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-rose-200" placeholder="Ex.: Restauração, Consulta, Material..." />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Valor (R$)</label>
                    <input type="number" min="0" step="0.01" value={formDebito.valor} onChange={(e) => setFormDebito({ ...formDebito, valor: e.target.value })} className="w-full p-3 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-rose-200" />
                </div>
                {(debitoOpcoes.agendamentos.length > 0 || debitoOpcoes.tratamentos.length > 0) && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Marcar como não pago</p>
                        {debitoOpcoes.agendamentos.length > 0 && (
                            <div className="space-y-1.5 max-h-52 overflow-y-auto border border-slate-100 rounded-xl p-2">
                                <p className="text-xs font-bold text-slate-500 sticky top-0 bg-white py-1">Agendamentos ({debitoOpcoes.agendamentos.length})</p>
                                {debitoOpcoes.agendamentos.map((a) => (
                                    <label key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50 cursor-pointer hover:border-rose-200">
                                        <input
                                            type="checkbox"
                                            checked={formDebito.agendamentosMarcados.includes(a.id)}
                                            onChange={(e) => setFormDebito((prev) => ({
                                                ...prev,
                                                agendamentosMarcados: e.target.checked
                                                    ? [...prev.agendamentosMarcados, a.id]
                                                    : prev.agendamentosMarcados.filter((id) => id !== a.id),
                                            }))}
                                            className="rounded text-rose-600"
                                        />
                                        <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{a.procedimento}</span>
                                        <span className="text-[10px] font-bold text-slate-400">R$ {Number(a.valor_final ?? a.valor ?? 0).toFixed(2)}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {debitoOpcoes.tratamentos.length > 0 && (
                            <div className="space-y-1.5 max-h-52 overflow-y-auto border border-slate-100 rounded-xl p-2">
                                <p className="text-xs font-bold text-slate-500 sticky top-0 bg-white py-1">Tratamentos ({debitoOpcoes.tratamentos.length})</p>
                                {debitoOpcoes.tratamentos.map((t) => (
                                    <label key={t.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50 cursor-pointer hover:border-rose-200">
                                        <input
                                            type="checkbox"
                                            checked={formDebito.tratamentosMarcados.includes(String(t.id))}
                                            onChange={(e) => setFormDebito((prev) => ({
                                                ...prev,
                                                tratamentosMarcados: e.target.checked
                                                    ? [...prev.tratamentosMarcados, String(t.id)]
                                                    : prev.tratamentosMarcados.filter((id) => id !== String(t.id)),
                                            }))}
                                            className="rounded text-rose-600"
                                        />
                                        <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{t.procedimento}</span>
                                        <span className="text-[10px] font-bold text-slate-400">R$ {Number(t.valor ?? 0).toFixed(2)}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
                <button type="button" onClick={() => setModalDebitoManual(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Cancelar</button>
                <button type="button" onClick={salvarDebitoManual} disabled={salvandoDebito} className="px-5 py-2 bg-rose-600 text-white rounded-xl font-bold flex items-center gap-2 disabled:opacity-50">
                    {salvandoDebito && <Loader2 size={16} className="animate-spin"/>} Salvar débito
                </button>
            </div>
        </Modal>
    </div>
  );
}