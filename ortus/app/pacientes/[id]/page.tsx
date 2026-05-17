'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { User, Phone, Edit, ArrowLeft, Save, Loader2, FileText, Clock, Trash2, Calendar, CalendarPlus, Pill, AlertTriangle, Stethoscope, X, Check, Building2, Printer, MessageCircle, Smile, Plus, Eraser, CheckCircle, ClipboardList, FolderOpen, AlertCircle, Upload, Download, Image as ImageIcon, DollarSign, Settings } from 'lucide-react';
import Link from 'next/link';
import { carregarModelos, type ModeloAnamnese } from '@/lib/anamnese';
// teeth-data lib no longer needed — using PNG images from /assets/dentes/
import { fetchUserClinicas } from '@/lib/clinicScoped';
import { registrarAudit } from '@/lib/auditLog';

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
  const initialTab = searchParams?.get('tab') || 'dados';
  const [loading, setLoading] = useState(true);
  
  const [abaAtiva, setAbaAtiva] = useState(initialTab);

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
  const [tipoDoc, setTipoDoc] = useState('receita'); 
  const [textoDoc, setTextoDoc] = useState('');
  
  const [form, setForm] = useState<any>({});
  const [ficha, setFicha] = useState<any>({}); 
  const [historico, setHistorico] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);

  // Odontograma + Tratamentos
  const [odontograma, setOdontograma] = useState<Record<string, ToothState>>({});
  const [tratamentos, setTratamentos] = useState<any[]>([]);
  const [ferramenta, setFerramenta] = useState<string>('carie');
  const [tipoArcada, setTipoArcada] = useState<'permanente' | 'leite'>('permanente');
  const [savingOdo, setSavingOdo] = useState(false);
  const [visaoOdonto, setVisaoOdonto] = useState<'anatomica' | 'esquematica' | 'livre'>('anatomica');
  const [textoOdontogramaLivre, setTextoOdontogramaLivre] = useState('');
  const [modalTrat, setModalTrat] = useState(false);
  const [tratEdit, setTratEdit] = useState<any>({ id: null, dente: '', procedimento: '', data: new Date().toISOString().split('T')[0], status: 'concluido', valor: '', observacoes: '', agendarNaAgenda: false, horaAgendamento: '09:00' });

  // ANAMNESE
  const [modelosAnamnese, setModelosAnamnese] = useState<ModeloAnamnese[]>([]);
  const [anamneseAtual, setAnamneseAtual] = useState<any>({
      modelo_id: '', data: new Date().toISOString().split('T')[0],
      preenchido_por: 'profissional', respostas: {} as Record<string, string>,
  });
  const [anamnesesAnteriores, setAnamnesesAnteriores] = useState<any[]>([]);

  // DOCUMENTOS
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // DEBITOS
  const [debitos, setDebitos] = useState<any[]>([]);

  useEffect(() => { if(id) carregar(); }, [id]);

  async function carregar() {
      setLoading(true);
      const listaClinicas = await fetchUserClinicas();
      setClinicas(listaClinicas);

      const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
      if (data) {
          setForm(data);
          const fm = data.ficha_medica || {};
          setFicha(fm);
          setOdontograma(fm.odontograma || {});
          setTratamentos(fm.tratamentos || []);
          setTextoOdontogramaLivre(fm.texto_livre || '');
          setAnamnesesAnteriores(fm.anamneses || []);
          setDocumentos(fm.documentos || []);
          registrarAudit({ acao: 'visualizou', entidade: 'paciente', entidade_id: String(id) });
      }
      const { data: hist } = await supabase.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false });
      setHistorico(hist || []);
      setDebitos((hist || []).filter((h: any) => h.status === 'fiado'));

      setModelosAnamnese(carregarModelos());
      setLoading(false);
  }

  async function salvarTudo() {
      const fichaMerged = { ...ficha, odontograma, tratamentos };
      const payload = { ...form, ficha_medica: fichaMerged };
      await supabase.from('pacientes').update(payload).eq('id', id);
      setFicha(fichaMerged);
      setModoEdicao(false);
      registrarAudit({ acao: 'editou', entidade: 'paciente', entidade_id: String(id) });
      alert('Dados salvos com sucesso!');
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
      alert('Os dados foram exportados em formato estruturado conforme a LGPD.');
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
      const fichaMerged = { ...ficha, odontograma, tratamentos, texto_livre: textoOdontogramaLivre };
      const { error } = await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
      setFicha(fichaMerged);
      setSavingOdo(false);
      if (error) alert('Erro ao salvar: ' + error.message);
  }

  function abrirNovoTratamento() {
      setTratEdit({ id: null, dente: '', procedimento: '', data: new Date().toISOString().split('T')[0], status: 'concluido', valor: '', observacoes: '', agendarNaAgenda: false, horaAgendamento: '09:00' });
      setModalTrat(true);
  }

  async function salvarTratamento() {
      if (!tratEdit.procedimento) return alert('Informe o procedimento');
      const { agendarNaAgenda, horaAgendamento, ...tratSemAgenda } = tratEdit;
      let novaLista;
      if (tratSemAgenda.id) {
          novaLista = tratamentos.map(t => t.id === tratSemAgenda.id ? tratSemAgenda : t);
      } else {
          novaLista = [...tratamentos, { ...tratSemAgenda, id: Date.now().toString(), criado_em: new Date().toISOString() }];
      }
      setTratamentos(novaLista);
      const fichaMerged = { ...ficha, odontograma, tratamentos: novaLista };
      const { error } = await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
      setFicha(fichaMerged);
      if (error) return alert('Erro: ' + error.message);

      // Agendar na agenda se solicitado
      let agendado = false;
      if (agendarNaAgenda && tratEdit.data) {
          try {
              const { data: { session } } = await supabase.auth.getSession();
              const userId = session?.user?.id;
              let profId: string | null = null;
              let clinicaId: string | null = null;
              if (userId) {
                  const { data: prof } = await supabase.from('profissionais').select('id').eq('user_id', userId).maybeSingle();
                  profId = prof?.id || null;
              }
              if (clinicas.length > 0) clinicaId = String(clinicas[0].id);
              const dataHoraISO = new Date(`${tratEdit.data}T${horaAgendamento || '09:00'}:00`).toISOString();
              const payload: any = {
                  paciente_id: id,
                  data_hora: dataHoraISO,
                  procedimento: `Tratamento: ${tratEdit.procedimento}`,
                  valor: parseFloat(tratEdit.valor) || 0,
                  valor_final: parseFloat(tratEdit.valor) || 0,
                  status: 'agendado',
                  observacoes: tratEdit.observacoes || '',
              };
              if (profId) payload.profissional_id = profId;
              if (clinicaId) payload.clinica_id = clinicaId;
              const { error: agErr } = await supabase.from('agendamentos').insert([payload]);
              if (agErr) throw agErr;
              agendado = true;
          } catch (e: any) {
              alert('Tratamento salvo, mas erro ao agendar: ' + (e.message || e));
          }
      }

      setModalTrat(false);
      alert(agendado ? 'Tratamento salvo e consulta marcada na agenda!' : 'Tratamento salvo com sucesso!');
  }

  async function excluirTratamento(tid: string) {
      if (!confirm('Excluir este tratamento?')) return;
      const novaLista = tratamentos.filter(t => t.id !== tid);
      setTratamentos(novaLista);
      const fichaMerged = { ...ficha, odontograma, tratamentos: novaLista };
      await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
      setFicha(fichaMerged);
  }

  const valorTotalOrcamento = tratamentos.reduce((acc: number, t: any) => acc + (parseFloat(t.valor) || 0), 0);

  function formatarMoeda(v: number) {
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function imprimirOrcamento() {
      const dataHoje = new Date().toLocaleDateString('pt-BR');
      const horaGeracao = new Date().toLocaleString('pt-BR');

      // --- Seção 1: Diagnóstico Odontograma ---
      let secaoDiagnostico = '';
      if (visaoOdonto === 'livre' && textoOdontogramaLivre.trim()) {
          secaoDiagnostico = `
              <div class="mb-8">
                  <h2 class="text-sm font-bold uppercase tracking-wider text-slate-500 border-b-2 border-blue-600 pb-2 mb-4">Planejamento (Texto Livre)</h2>
                  <div class="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">${textoOdontogramaLivre}</div>
              </div>`;
      } else {
          const dentesAlterados = Object.entries(odontograma).filter(([, st]) => {
              return st.cond !== 'normal' || Object.values(st.faces || {}).some(v => v && v !== 'higido');
          });
          if (dentesAlterados.length > 0) {
              const linhasDiag = dentesAlterados.map(([num, st]) => {
                  const detalhes: string[] = [];
                  if (st.cond !== 'normal') {
                      const condLabel = TOOLS.find(t => t.key === st.cond)?.label || st.cond;
                      const condColor = TOOLS.find(t => t.key === st.cond)?.color || '#64748b';
                      detalhes.push(`<span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${condColor}"></span>${condLabel}</span>`);
                  }
                  Object.entries(st.faces || {}).forEach(([f, v]) => {
                      if (v && v !== 'higido') {
                          const fLabel = FACE_LABELS[f as Face] || f;
                          const fColor = FACE_COLORS[v as FaceStatus] || '#64748b';
                          const vLabel = TOOLS.find(t => t.key === v)?.label || v;
                          detalhes.push(`<span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block border border-slate-300" style="background:${fColor}"></span>${vLabel} — ${fLabel}</span>`);
                      }
                  });
                  return `<tr class="border-b border-slate-100"><td class="py-2 pr-4 font-bold text-blue-700 text-center w-20">${num}</td><td class="py-2 text-slate-600"><div class="flex flex-wrap gap-x-4 gap-y-1">${detalhes.join('')}</div></td></tr>`;
              }).join('');
              secaoDiagnostico = `
              <div class="mb-8">
                  <h2 class="text-sm font-bold uppercase tracking-wider text-slate-500 border-b-2 border-blue-600 pb-2 mb-4">Diagnóstico — Estado dos Dentes</h2>
                  <table class="w-full text-sm"><thead><tr class="bg-slate-50 text-left"><th class="py-2 px-3 font-bold text-slate-500 text-center w-20">Dente</th><th class="py-2 px-3 font-bold text-slate-500">Condição / Faces</th></tr></thead><tbody>${linhasDiag}</tbody></table>
              </div>`;
          } else {
              secaoDiagnostico = `<div class="mb-8"><h2 class="text-sm font-bold uppercase tracking-wider text-slate-500 border-b-2 border-blue-600 pb-2 mb-4">Diagnóstico — Estado dos Dentes</h2><p class="text-sm text-slate-400 italic">Nenhuma marcação registrada no odontograma.</p></div>`;
          }
      }

      // --- Seção 2: Tratamentos e Valores ---
      let secaoTratamentos = '';
      if (tratamentos.length > 0) {
          const linhasTrat = tratamentos.map((t: any) => {
              const val = parseFloat(t.valor) || 0;
              const statusClass = t.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' : t.status === 'andamento' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
              return `<tr class="border-b border-slate-100"><td class="py-2.5 px-3 font-bold text-blue-700 text-center">${t.dente || '-'}</td><td class="py-2.5 px-3 font-medium text-slate-700">${t.procedimento}</td><td class="py-2.5 px-3 text-center"><span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded ${statusClass}">${t.status}</span></td><td class="py-2.5 px-3 text-right font-bold text-slate-800">${formatarMoeda(val)}</td></tr>`;
          }).join('');
          secaoTratamentos = `
          <div class="mb-8">
              <h2 class="text-sm font-bold uppercase tracking-wider text-slate-500 border-b-2 border-emerald-600 pb-2 mb-4">Tratamentos Propostos</h2>
              <table class="w-full text-sm">
                  <thead><tr class="bg-slate-50"><th class="py-2 px-3 font-bold text-slate-500 text-center w-20">Dente</th><th class="py-2 px-3 font-bold text-slate-500 text-left">Procedimento</th><th class="py-2 px-3 font-bold text-slate-500 text-center w-28">Status</th><th class="py-2 px-3 font-bold text-slate-500 text-right w-32">Valor</th></tr></thead>
                  <tbody>${linhasTrat}</tbody>
                  <tfoot><tr class="bg-emerald-50 border-t-2 border-emerald-200"><td colspan="3" class="py-3 px-3 text-right font-bold text-slate-600 uppercase text-xs tracking-wider">Valor Total</td><td class="py-3 px-3 text-right font-black text-emerald-700 text-lg">${formatarMoeda(valorTotalOrcamento)}</td></tr></tfoot>
              </table>
          </div>`;
      } else {
          secaoTratamentos = `<div class="mb-8"><h2 class="text-sm font-bold uppercase tracking-wider text-slate-500 border-b-2 border-emerald-600 pb-2 mb-4">Tratamentos Propostos</h2><p class="text-sm text-slate-400 italic">Nenhum tratamento registrado.</p></div>`;
      }

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Orçamento — ${form.nome || 'Paciente'}</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <style>
        @media print {
            body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .a4-sheet { box-shadow: none !important; margin: 0 !important; padding: 10mm !important; max-width: 100% !important; min-height: auto !important; }
        }
        @page { size: A4; margin: 10mm; }
    </style>
</head>
<body class="bg-slate-200 min-h-screen">
    <!-- Barra de controle -->
    <div class="no-print sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200 shadow-sm">
        <div class="max-w-[210mm] mx-auto flex items-center justify-between px-6 py-3">
            <span class="text-sm font-bold text-slate-600">Pré-visualização do Documento</span>
            <div class="flex items-center gap-3">
                <button onclick="window.print()" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Imprimir / Salvar como PDF
                </button>
                <button onclick="window.close()" class="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Fechar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        </div>
    </div>

    <!-- Folha A4 -->
    <div class="a4-sheet max-w-[210mm] min-h-[297mm] bg-white mx-auto my-8 p-12 shadow-2xl rounded-sm relative">
        <!-- Cabeçalho -->
        <div class="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-8">
            <div>
                <h1 class="text-2xl font-black text-slate-800 tracking-tight">ORTUS</h1>
                <p class="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-0.5">Ficha Clínica e Orçamento</p>
            </div>
            <div class="text-right">
                <div class="text-xs text-slate-500 font-semibold">Data: <span class="text-slate-800 font-bold">${dataHoje}</span></div>
            </div>
        </div>

        <!-- Dados do Paciente -->
        <div class="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-8 grid grid-cols-2 gap-4">
            <div><span class="text-[10px] uppercase font-bold text-slate-400 block">Paciente</span><span class="text-sm font-bold text-slate-800">${form.nome || '-'}</span></div>
            <div><span class="text-[10px] uppercase font-bold text-slate-400 block">CPF</span><span class="text-sm font-bold text-slate-800">${form.cpf || '-'}</span></div>
            <div><span class="text-[10px] uppercase font-bold text-slate-400 block">Telefone</span><span class="text-sm font-bold text-slate-800">${form.telefone || '-'}</span></div>
            <div><span class="text-[10px] uppercase font-bold text-slate-400 block">Email</span><span class="text-sm font-bold text-slate-800">${form.email || '-'}</span></div>
        </div>

        ${secaoDiagnostico}
        ${secaoTratamentos}

        <!-- Rodapé -->
        <div class="absolute bottom-12 left-12 right-12 border-t border-slate-200 pt-4 flex justify-between items-center text-[10px] text-slate-400">
            <span>Documento gerado pelo sistema ORTUS em ${horaGeracao}</span>
            <span class="font-bold">Este documento não possui valor fiscal.</span>
        </div>
    </div>
</body>
</html>`;

      const win = window.open('', '_blank');
      if (win) {
          win.document.write(html);
          win.document.close();
      }
  }

  function enviarOrcamentoWhatsapp() {
      if (!form.telefone) return alert('Paciente sem telefone cadastrado.');
      const linhas = tratamentos.map((t: any) => {
          const val = parseFloat(t.valor) || 0;
          return `▸ Dente ${t.dente || '-'}: ${t.procedimento} — ${formatarMoeda(val)}`;
      }).join('\n');
      const msg = `*Orçamento Odontológico* 🦷\nPaciente: *${form.nome}*\n\n${linhas || 'Sem tratamentos.'}\n\n*Total: ${formatarMoeda(valorTotalOrcamento)}*\n\n_Gerado pelo ORTUS_`;
      const numero = form.telefone.replace(/\D/g, '');
      window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  // ===== ANAMNESE helpers =====
  function selecionarModeloAnamnese(modelo_id: string) {
      const m = modelosAnamnese.find(x => x.id === modelo_id);
      const respostasIniciais: Record<string, string> = {};
      m?.perguntas.forEach(p => respostasIniciais[p.id] = '');
      setAnamneseAtual({ modelo_id, data: new Date().toISOString().split('T')[0], preenchido_por: 'profissional', respostas: respostasIniciais });
  }

  async function salvarAnamnese() {
      if (!anamneseAtual.modelo_id) return alert('Selecione um modelo de anamnese.');
      const modelo = modelosAnamnese.find(m => m.id === anamneseAtual.modelo_id);
      if (!modelo) return alert('Modelo não encontrado.');
      const nova = {
          id: Date.now().toString(),
          modelo_id: anamneseAtual.modelo_id,
          modelo_nome: modelo.nome,
          data: anamneseAtual.data,
          preenchido_por: anamneseAtual.preenchido_por,
          respostas: anamneseAtual.respostas,
          perguntas_snapshot: modelo.perguntas,
          criado_em: new Date().toISOString(),
      };
      const novaLista = [...anamnesesAnteriores, nova];
      const fichaMerged = { ...ficha, odontograma, tratamentos, anamneses: novaLista };
      const { error } = await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
      if (error) return alert('Erro: ' + error.message);
      setAnamnesesAnteriores(novaLista);
      setFicha(fichaMerged);
      setAnamneseAtual({ modelo_id: '', data: new Date().toISOString().split('T')[0], preenchido_por: 'profissional', respostas: {} });
      alert('Anamnese salva com sucesso!');
  }

  function emitirAnamnese(anamnese?: any) {
      const a = anamnese || (() => {
          if (!anamneseAtual.modelo_id) { alert('Selecione e preencha uma anamnese antes de emitir.'); return null; }
          const modelo = modelosAnamnese.find(m => m.id === anamneseAtual.modelo_id);
          return modelo ? { ...anamneseAtual, modelo_nome: modelo.nome, perguntas_snapshot: modelo.perguntas } : null;
      })();
      if (!a) return;
      const janela = window.open('', '', 'width=800,height=600');
      const dataFmt = new Date(a.data).toLocaleDateString('pt-BR');
      const linhas = (a.perguntas_snapshot || []).map((p: any) => {
          const r = (a.respostas && a.respostas[p.id]) || '___________';
          return `<div class="q"><strong>${p.label}</strong><div class="r">${r}</div></div>`;
      }).join('');
      const html = `
        <html><head><title>Anamnese</title><style>
          body { font-family: 'Times New Roman', serif; padding: 50px; color: #000; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 1px solid #000; padding-bottom: 12px; }
          .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; }
          .titulo { text-align: center; font-size: 18px; font-weight: bold; margin: 24px 0; text-transform: uppercase; }
          .meta { display: flex; gap: 24px; margin-bottom: 24px; font-size: 13px; }
          .meta span { font-weight: bold; }
          .q { margin-bottom: 16px; font-size: 14px; }
          .q strong { display: block; margin-bottom: 4px; }
          .r { border-bottom: 1px dotted #999; padding: 4px 0; min-height: 18px; }
          .assinatura { margin-top: 60px; text-align: center; }
          .linha { border-top: 1px solid #000; width: 320px; margin: 0 auto 8px auto; }
          @media print { .no-print { display: none; } }
        </style></head><body>
          <div class="header"><h1>ORTUS CLINIC</h1></div>
          <div class="titulo">FICHA DE ANAMNESE</div>
          <div class="meta">
            <div><span>Paciente:</span> ${(form.nome || '').toUpperCase()}</div>
            <div><span>CPF:</span> ${form.cpf || '___'}</div>
            <div><span>Data:</span> ${dataFmt}</div>
            <div><span>Modelo:</span> ${a.modelo_nome || ''}</div>
            <div><span>Preenchido por:</span> ${a.preenchido_por === 'paciente' ? 'Paciente' : 'Profissional'}</div>
          </div>
          ${linhas}
          <div class="assinatura"><div class="linha"></div><p>Assinatura do ${a.preenchido_por === 'paciente' ? 'Paciente' : 'Profissional'}</p></div>
          <script>window.onload = function(){ window.print(); }</script>
        </body></html>`;
      janela?.document.write(html);
      janela?.document.close();
  }

  async function excluirAnamnese(aid: string) {
      if (!confirm('Excluir esta anamnese?')) return;
      const novaLista = anamnesesAnteriores.filter(a => a.id !== aid);
      const fichaMerged = { ...ficha, odontograma, tratamentos, anamneses: novaLista };
      await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
      setAnamnesesAnteriores(novaLista);
      setFicha(fichaMerged);
  }

  // ===== DOCUMENTOS helpers =====
  async function uploadDocumento(e: any) {
      const file: File = e.target.files?.[0];
      if (!file) return;
      const MAX = 3 * 1024 * 1024; // 3MB
      if (file.size > MAX) { alert('Arquivo muito grande (máx. 3MB).'); e.target.value = ''; return; }
      setUploadingDoc(true);
      const reader = new FileReader();
      reader.onload = async () => {
          const dataUrl = reader.result as string;
          const isImg = file.type.startsWith('image/');
          const novo = { id: Date.now().toString(), nome: file.name, tipo: file.type, isImg, dataUrl, tamanho: file.size, criado_em: new Date().toISOString() };
          const novaLista = [...documentos, novo];
          const fichaMerged = { ...ficha, odontograma, tratamentos, documentos: novaLista };
          const { error } = await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
          if (error) { alert('Erro: ' + error.message); setUploadingDoc(false); return; }
          setDocumentos(novaLista);
          setFicha(fichaMerged);
          setUploadingDoc(false);
          e.target.value = '';
      };
      reader.readAsDataURL(file);
  }

  async function excluirDocumento(did: string) {
      if (!confirm('Excluir este documento?')) return;
      const novaLista = documentos.filter(d => d.id !== did);
      const fichaMerged = { ...ficha, odontograma, tratamentos, documentos: novaLista };
      await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
      setDocumentos(novaLista);
      setFicha(fichaMerged);
  }

  function baixarDocumento(d: any) {
      const a = document.createElement('a');
      a.href = d.dataUrl;
      a.download = d.nome;
      a.click();
  }

  // ===== DEBITOS helpers =====
  async function marcarComoPago(agId: string) {
      if (!confirm('Marcar este atendimento como pago?')) return;
      const { error } = await supabase.from('agendamentos').update({ status: 'concluido' }).eq('id', agId);
      if (error) return alert('Erro: ' + error.message);
      const novaLista = debitos.filter(d => d.id !== agId);
      setDebitos(novaLista);
      const histAtt = historico.map(h => h.id === agId ? { ...h, status: 'concluido' } : h);
      setHistorico(histAtt);
  }

  const toggleCheck = (campo: string) => {
      setFicha((prev: any) => ({ ...prev, [campo]: !prev[campo] }));
  };

  async function excluir() {
      if(!confirm('Cuidado: Isso apagará o paciente e todo o histórico. Continuar?')) return;
      await supabase.from('agendamentos').delete().eq('paciente_id', id);
      await supabase.from('pacientes').delete().eq('id', id);
      router.push('/pacientes');
  }

  function abrirWhatsapp() {
      if (!form.telefone) return alert('Paciente sem telefone cadastrado.');
      const numero = form.telefone.replace(/\D/g, '');
      window.open(`https://wa.me/55${numero}`, '_blank');
  }

  // LÓGICA INTELIGENTE DE MODELOS
  useEffect(() => {
      if (!modalDoc) return; // Só roda se o modal abrir

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
          // Atestado Automático
          setTextoDoc(
              `Atesto para os devidos fins que o(a) Sr(a) ${form.nome.toUpperCase()}, \n` +
              `inscrito(a) no CPF sob nº ${form.cpf || '___.___.___-__'}, esteve sob meus cuidados profissionais nesta data (${dataHoje}).\n\n` +
              'Necessita de _____ (________________) dias de repouso por motivo de tratamento odontológico.\n\n' +
              'CID: K08.8 (Outras afecções especificadas dos dentes e das estruturas de suporte).'
          );
      }
  }, [tipoDoc, modalDoc, form]);

  function imprimirDocumento() {
      const janela = window.open('', '', 'width=800,height=600');
      const dataHoje = new Date().toLocaleDateString('pt-BR');
      
      const conteudo = `
        <html>
          <head>
            <title>Impressão</title>
            <style>
              body { font-family: 'Times New Roman', serif; padding: 50px; color: #000; max-width: 800px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 60px; border-bottom: 1px solid #000; padding-bottom: 20px; }
              .header h1 { margin: 0; font-size: 28px; text-transform: uppercase; letter-spacing: 2px; }
              .header p { margin: 5px 0; font-size: 14px; color: #444; }
              .titulo { text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 50px; text-transform: uppercase; text-decoration: underline; }
              .conteudo { font-size: 18px; line-height: 2.0; margin-bottom: 80px; text-align: justify; white-space: pre-wrap; }
              .assinatura { margin-top: 100px; text-align: center; page-break-inside: avoid; }
              .linha { border-top: 1px solid #000; width: 350px; margin: 0 auto 10px auto; }
              .footer { position: fixed; bottom: 30px; width: 100%; text-align: center; font-size: 11px; color: #888; left: 0; }
              @media print { .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>ORTUS CLINIC</h1>
              <p>Odontologia Integrada • Dr(a). Especialista</p>
            </div>

            <div class="titulo">${tipoDoc === 'receita' ? 'RECEITUÁRIO' : 'ATESTADO ODONTOLÓGICO'}</div>

            <div class="conteudo">${textoDoc}</div>

            <div class="assinatura">
              <div class="linha"></div>
              <p>Assinatura e Carimbo do Profissional</p>
            </div>

            <div class="footer">
              Emitido em ${dataHoje} • Documento gerado eletronicamente pelo Sistema ORTUS
            </div>
            <script>
                window.onload = function() { window.print(); }
            </script>
          </body>
        </html>
      `;
      
      janela?.document.write(conteudo);
      janela?.document.close();
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
                <button onClick={abrirWhatsapp} className="px-4 py-2 bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 transition-colors flex items-center gap-2 shadow-lg shadow-green-200"><MessageCircle size={16}/> WhatsApp</button>
                {modoEdicao ? (
                    <>
                        <button onClick={() => setModoEdicao(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                        <button onClick={salvarTudo} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 transition-all active:scale-95"><Save size={18}/> Salvar</button>
                    </>
                ) : (
                    <button onClick={() => setModoEdicao(true)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"><Edit size={18}/> Editar</button>
                )}
            </div>
        </div>

        {/* MODAL DE DOCUMENTOS */}
        {modalDoc && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Printer size={20}/> Emitir Documento</h3>
                        <button onClick={() => setModalDoc(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20}/></button>
                    </div>
                    
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                        <button onClick={() => setTipoDoc('receita')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${tipoDoc === 'receita' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Receita Médica</button>
                        <button onClick={() => setTipoDoc('atestado')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${tipoDoc === 'atestado' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Atestado de Comparecimento</button>
                    </div>

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
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-2">
                <button onClick={() => setAbaAtiva('dados')} className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${abaAtiva === 'dados' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}`}><User size={20}/> Dados Pessoais</button>
                <button onClick={() => setAbaAtiva('anamnese')} className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${abaAtiva === 'anamnese' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}`}><FileText size={20}/> Anamnese</button>
                <button onClick={() => setAbaAtiva('tratamentos')} className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${abaAtiva === 'tratamentos' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}`}><Smile size={20}/> Tratamentos</button>
                <button onClick={() => setAbaAtiva('documentos')} className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${abaAtiva === 'documentos' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}`}>
                    <FolderOpen size={20}/> Documentos
                    {documentos.length > 0 && <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{documentos.length}</span>}
                </button>
                <button onClick={() => setAbaAtiva('debitos')} className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${abaAtiva === 'debitos' ? 'bg-white shadow-sm border border-rose-200 text-rose-700' : 'text-slate-500 hover:bg-white/50'}`}>
                    <DollarSign size={20}/> Débitos
                    {debitos.length > 0 && <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-500 text-white animate-pulse">{debitos.length}</span>}
                </button>
                <button onClick={() => setAbaAtiva('historico')} className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${abaAtiva === 'historico' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}`}><Clock size={20}/> Histórico</button>
            </div>

            <div className="lg:col-span-3">
                {abaAtiva === 'dados' && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><User size={20} className="text-blue-500"/> Informações do Paciente</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-2 md:col-span-1"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Clínica</label><div className="relative"><Building2 className="absolute left-3 top-3 text-slate-400" size={18}/><select disabled={!modoEdicao} className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none font-bold text-slate-700 appearance-none ${modoEdicao ? 'bg-white border-blue-300 ring-2 ring-blue-100 cursor-pointer' : 'bg-slate-50 border-slate-200'}`} value={form.clinica_id || ''} onChange={e => setForm({...form, clinica_id: e.target.value})}><option value="">Sem Clínica Definida</option>{clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none font-bold text-slate-700 ${modoEdicao ? 'bg-white border-blue-300 ring-2 ring-blue-100' : 'bg-slate-50 border-slate-200'}`} value={form.nome || ''} onChange={e => setForm({...form, nome: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">CPF</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.cpf || ''} onChange={e => setForm({...form, cpf: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Telefone</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.telefone || ''} onChange={e => setForm({...form, telefone: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data Nascimento</label><input type="date" disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.data_nascimento || ''} onChange={e => setForm({...form, data_nascimento: e.target.value})} /></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} /></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Endereço</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.endereco || ''} onChange={e => setForm({...form, endereco: e.target.value})} /></div>
                        </div>
                    </div>
                )}

                {abaAtiva === 'anamnese' && (
                    <div className="space-y-6 animate-in fade-in">
                        {/* NOVA ANAMNESE - MODELO */}
                        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><ClipboardList size={20} className="text-blue-500"/> Nova Anamnese</h3>
                                <Link href="/configuracoes?aba=anamnese" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1.5"><Settings size={14}/> Criar/Editar Modelos</Link>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                                <div className="md:col-span-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Modelo</label>
                                    <select value={anamneseAtual.modelo_id} onChange={e => selecionarModeloAnamnese(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                                        <option value="">Selecione...</option>
                                        {modelosAnamnese.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block flex items-center gap-1"><Calendar size={11}/> Data</label>
                                    <input type="date" value={anamneseAtual.data} onChange={e => setAnamneseAtual({...anamneseAtual, data: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Preenchido por</label>
                                    <div className="flex bg-slate-100 p-1 rounded-lg">
                                        <button onClick={() => setAnamneseAtual({...anamneseAtual, preenchido_por: 'profissional'})} className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${anamneseAtual.preenchido_por === 'profissional' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}>Profissional</button>
                                        <button onClick={() => setAnamneseAtual({...anamneseAtual, preenchido_por: 'paciente'})} className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${anamneseAtual.preenchido_por === 'paciente' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}>Paciente</button>
                                    </div>
                                </div>
                            </div>

                            {anamneseAtual.modelo_id ? (() => {
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
                                            <button onClick={salvarAnamnese} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-sm flex items-center gap-2"><Save size={14}/> Salvar Anamnese</button>
                                            <button onClick={() => emitirAnamnese()} className="px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-black flex items-center gap-2"><Printer size={14}/> Emitir / Imprimir</button>
                                            <button onClick={() => setAnamneseAtual({ modelo_id: '', data: new Date().toISOString().split('T')[0], preenchido_por: 'profissional', respostas: {} })} className="px-4 py-2.5 text-slate-500 font-bold rounded-xl text-sm hover:bg-slate-100">Limpar</button>
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
                                        <div key={a.id} className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl transition-colors">
                                            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center"><ClipboardList size={18}/></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-sm text-slate-800 truncate">{a.modelo_nome}</div>
                                                <div className="flex items-center gap-3 text-[11px] text-slate-500 font-semibold">
                                                    <span className="flex items-center gap-1"><Calendar size={11}/> {new Date(a.data).toLocaleDateString('pt-BR')}</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-black ${a.preenchido_por === 'paciente' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{a.preenchido_por}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => emitirAnamnese(a)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Emitir"><Printer size={14}/></button>
                                            <button onClick={() => excluirAnamnese(a.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* FICHA MÉDICA (mantida) */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"><h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Stethoscope size={20} className="text-pink-500"/> Ficha Médica Rápida</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-4">{['Diabetes', 'Hipertensão', 'Cardiopatia', 'Asma/Bronquite', 'Alergia Antibiótico', 'Alergia Anestésico', 'Gestante', 'Fumante', 'Uso de Anticoagulante'].map(item => (<label key={item} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${ficha[item] ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100 hover:border-slate-300'} ${!modoEdicao && 'pointer-events-none opacity-80'}`}><div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${ficha[item] ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-slate-300'}`}>{ficha[item] && <Check size={14}/>}</div><input type="checkbox" className="hidden" checked={ficha[item] || false} onChange={() => toggleCheck(item)} disabled={!modoEdicao}/><span className={`text-sm font-bold ${ficha[item] ? 'text-red-700' : 'text-slate-600'}`}>{item}</span></label>))}</div></div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"><h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Pill size={20} className="text-purple-500"/> Medicamentos em Uso</h3><textarea disabled={!modoEdicao} value={ficha.medicamentos || ''} onChange={e => setFicha({...ficha, medicamentos: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-200 h-24 resize-none" placeholder="Liste os medicamentos contínuos..." /></div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"><h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle size={20} className="text-amber-500"/> Observações Clínicas</h3><textarea disabled={!modoEdicao} value={form.anamnese || ''} onChange={e => setForm({...form, anamnese: e.target.value})} className="w-full p-4 bg-yellow-50 border border-yellow-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-300 h-40 resize-none text-slate-700" placeholder="Histórico detalhado, queixas principais e evolução..." /></div>
                    </div>
                )}

                {abaAtiva === 'tratamentos' && (
                    <div className="space-y-6 animate-in fade-in">
                        {/* ODONTOGRAMA */}
                        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Smile size={20} className="text-blue-500"/> Odontograma</h3>
                                <div className="flex gap-2 flex-wrap">
                                    <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                                        {(['anatomica', 'esquematica', 'livre'] as const).map(v => (
                                            <button key={v} onClick={() => setVisaoOdonto(v)} className={`px-2.5 py-1.5 text-[10px] font-bold rounded-md transition-all ${visaoOdonto === v ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                                                {v === 'anatomica' ? 'Anatômica' : v === 'esquematica' ? 'Esquemática' : 'Texto Livre'}
                                            </button>
                                        ))}
                                    </div>
                                    {visaoOdonto !== 'livre' && <button onClick={() => { if(confirm('Limpar todo o odontograma?')) setOdontograma({}); }} className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1.5"><Eraser size={14}/> Limpar</button>}
                                    <button onClick={imprimirOrcamento} className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1.5"><Printer size={14}/> PDF</button>
                                    <button onClick={enviarOrcamentoWhatsapp} className="px-3 py-2 text-xs font-bold rounded-lg bg-green-500 text-white hover:bg-green-600 flex items-center gap-1.5 shadow-sm"><MessageCircle size={14}/> WhatsApp</button>
                                    <button onClick={salvarOdontograma} disabled={savingOdo} className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 shadow-sm disabled:opacity-50">{savingOdo ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar</button>
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
                            {/* Legenda + Tabs Permanente/Leite */}
                            <div className="mb-4 p-3 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-slate-200">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Legendas:</span>
                                        {TOOLS.filter(t => t.tipo === 'face').map(t => (
                                            <span key={t.key} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-bold text-slate-700">
                                                <span className="w-3 h-3 rounded border border-slate-400" style={{ background: t.color }}></span>
                                                {t.label}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex bg-white border border-slate-200 rounded-lg p-0.5">
                                        <button onClick={() => setTipoArcada('permanente')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${tipoArcada === 'permanente' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}>Dentes Permanentes</button>
                                        <button onClick={() => setTipoArcada('leite')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${tipoArcada === 'leite' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}>Dentes de Leite</button>
                                    </div>
                                </div>
                            </div>

                            {/* Toolbar de ferramentas */}
                            <div className="flex flex-wrap gap-2 mb-6 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                {TOOLS.map(t => (
                                    <button key={t.key} onClick={() => setFerramenta(t.key)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${ferramenta === t.key ? 'border-slate-800 ring-2 ring-slate-300 bg-white shadow' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
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

                            {/* Arcadas - dente lib + face-grid + número, em colunas alinhadas */}
                            <div className="w-full bg-white rounded-2xl p-4 border border-slate-200 overflow-x-hidden flex justify-center">
                                {(() => {
                                    const isEsq = visaoOdonto === 'esquematica';
                                    const quad = tipoArcada === 'permanente' ? QUAD_PERM : QUAD_LEITE;
                                    return (
                                        <div className="inline-flex flex-col items-center">
                                            {/* Superior */}
                                            <div className={`flex justify-center ${isEsq ? 'items-center' : 'items-end'}`}>
                                                {quad.sup[0].map(n => <Tooth key={n} num={n} isUpper={true} esquematico={isEsq} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                                <div className="w-1 self-stretch border-l-2 border-dashed border-slate-300 mx-2"></div>
                                                {quad.sup[1].map(n => <Tooth key={n} num={n} isUpper={true} esquematico={isEsq} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                            </div>
                                            {/* linha média */}
                                            <div className="h-px bg-gradient-to-r from-transparent via-slate-400 to-transparent my-3"></div>
                                            {/* Inferior */}
                                            <div className={`flex justify-center ${isEsq ? 'items-center' : 'items-start'}`}>
                                                {quad.inf[0].map(n => <Tooth key={n} num={n} isUpper={false} esquematico={isEsq} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                                <div className="w-1 self-stretch border-l-2 border-dashed border-slate-300 mx-2"></div>
                                                {quad.inf[1].map(n => <Tooth key={n} num={n} isUpper={false} esquematico={isEsq} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                            </div>
                                        </div>
                                    );
                                })()}
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
                    </div>
                )}

                {abaAtiva === 'documentos' && (
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><FolderOpen size={20} className="text-amber-500"/> Documentos & Imagens</h3>
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => setModalDoc(true)} className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 bg-slate-800 text-white hover:bg-black transition-colors shadow-sm"><Printer size={14}/> Emitir Receita/Atestado</button>
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
                                <p className="text-xs mt-1">Aceitos: imagens, PDF, DOC. Máx 3MB por arquivo.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {[...documentos].sort((a,b) => (b.criado_em||'').localeCompare(a.criado_em||'')).map(d => (
                                    <div key={d.id} className="group relative bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all">
                                        {d.isImg ? (
                                            <a href={d.dataUrl} target="_blank" rel="noopener" className="block">
                                                <img src={d.dataUrl} alt={d.nome} className="w-full h-32 object-cover bg-white"/>
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
                            {debitos.length > 0 && (
                                <div className="text-right">
                                    <div className="text-[10px] uppercase font-bold text-slate-400">Total em aberto</div>
                                    <div className="text-2xl font-black text-rose-600">R$ {debitos.reduce((s,d) => s + (d.valor_final || d.valor || 0), 0).toFixed(2)}</div>
                                </div>
                            )}
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
                                            <div className="font-bold text-slate-800">{d.procedimento}</div>
                                            <div className="flex items-center gap-3 text-xs text-slate-500 font-semibold mt-1">
                                                <span className="flex items-center gap-1"><Calendar size={11}/> {new Date(d.data_hora).toLocaleDateString('pt-BR')}</span>
                                                <span className="flex items-center gap-1"><Clock size={11}/> {new Date(d.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
                                                {d.profissionais?.nome && <span className="flex items-center gap-1"><User size={11}/> {d.profissionais.nome}</span>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] uppercase font-bold text-rose-500">Em aberto</div>
                                            <div className="text-xl font-black text-rose-700">R$ {(d.valor_final || d.valor || 0).toFixed(2)}</div>
                                        </div>
                                        <button onClick={() => marcarComoPago(d.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 shadow-sm flex items-center gap-1.5"><CheckCircle size={14}/> Marcar Pago</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {abaAtiva === 'historico' && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in"><h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Clock size={20} className="text-blue-500"/> Histórico de Atendimentos</h3>{historico.length === 0 ? (<div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">Nenhum atendimento registrado.</div>) : (<div className="relative border-l-2 border-blue-100 ml-4 space-y-8 pb-4">{historico.map((h: any) => (<div key={h.id} className="ml-8 relative"><div className="absolute -left-[41px] top-1 w-6 h-6 rounded-full border-4 border-white bg-blue-500 shadow-sm"></div><div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60"><div className="flex justify-between items-start mb-2"><span className="font-bold text-slate-800 text-lg">{h.procedimento}</span><span className="text-xs font-bold bg-white px-2 py-1 rounded border border-slate-200 text-slate-500 uppercase">{h.status}</span></div><div className="flex items-center gap-4 text-xs text-slate-500 font-bold mb-3"><span className="flex items-center gap-1"><Calendar size={14}/> {new Date(h.data_hora).toLocaleDateString('pt-BR')}</span><span className="flex items-center gap-1"><Clock size={14}/> {new Date(h.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span><span className="flex items-center gap-1"><User size={14}/> {h.profissionais?.nome || 'Dr(a).'}</span></div>{h.observacoes && <p className="text-sm text-slate-600 bg-white p-3 rounded-xl border border-slate-100 italic">"{h.observacoes}"</p>}</div></div>))}</div>)}</div>
                )}
            </div>
        </div>

        {/* MODAL TRATAMENTO */}
        {modalTrat && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 animate-in zoom-in-95">
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
                                <select value={tratEdit.status} onChange={e => setTratEdit({...tratEdit, status: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="planejado">Planejado</option>
                                    <option value="andamento">Em Andamento</option>
                                    <option value="concluido">Concluído</option>
                                </select>
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
                    </div>
                    <div className="flex gap-2 justify-end mt-5">
                        <button onClick={() => setModalTrat(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancelar</button>
                        <button onClick={salvarTratamento} className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-sm flex items-center gap-2"><Save size={14}/> {tratEdit.agendarNaAgenda ? 'Salvar e Agendar' : 'Salvar'}</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}