'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import { User, Phone, Edit, ArrowLeft, Save, Loader2, FileText, Clock, Trash2, Calendar, Pill, AlertTriangle, Stethoscope, X, Check, Building2, Printer, MessageCircle, Smile, Plus, Eraser, CheckCircle, ClipboardList, FolderOpen, AlertCircle, Upload, Download, Image as ImageIcon, DollarSign, Settings } from 'lucide-react';
import Link from 'next/link';
import { carregarModelos, type ModeloAnamnese } from '@/lib/anamnese';

// =============== ODONTOGRAMA ===============
type Face = 'top' | 'right' | 'bottom' | 'left' | 'center';
type FaceStatus = 'higido' | 'carie' | 'restaurado' | 'tratado';
type ToothCondition = 'normal' | 'ausente' | 'coroa' | 'implante' | 'extracao';
interface ToothState { faces: Partial<Record<Face, FaceStatus>>; cond: ToothCondition }

const FACE_COLORS: Record<FaceStatus, string> = {
  higido: '#ffffff',
  carie: '#ef4444',
  restaurado: '#3b82f6',
  tratado: '#10b981',
};

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

const QUADRANTES = {
  sup: [
    [18,17,16,15,14,13,12,11],
    [21,22,23,24,25,26,27,28],
  ],
  inf: [
    [48,47,46,45,44,43,42,41],
    [31,32,33,34,35,36,37,38],
  ],
};

// Formas anatomicas detalhadas (canonico: coroa y=0..52, raiz y=52..98)
const SHAPES: Record<string, { crown: string; roots: string[]; details: string[]; rootSeparator?: string }> = {
  incisor: {
    crown: 'M 21,52 C 19,42 19,28 20,18 C 21,10 24,5 30,3 C 36,5 39,10 40,18 C 41,28 41,42 39,52 Z',
    roots: ['M 24,52 C 21,68 21,82 24,92 C 27,96 33,96 36,92 C 39,82 39,68 36,52 Z'],
    details: [
      'M 23,8 C 26,6 28,5 30,5 C 32,5 34,6 37,8',
      'M 25,15 C 25,30 25,42 25,49',
      'M 35,15 C 35,30 35,42 35,49',
      'M 30,7 L 30,52',
    ],
  },
  canine: {
    crown: 'M 17,52 C 16,42 16,28 18,18 C 20,10 24,4 30,2 C 36,4 40,10 42,18 C 44,28 44,42 43,52 Z',
    roots: ['M 21,52 C 16,68 16,86 22,94 C 28,98 32,98 38,94 C 44,86 44,68 39,52 Z'],
    details: [
      'M 22,14 C 25,6 27,3 30,2 C 33,3 35,6 38,14',
      'M 30,2 L 30,30',
      'M 24,20 L 24,50',
      'M 36,20 L 36,50',
    ],
  },
  premolar: {
    crown: 'M 14,52 C 13,40 13,26 15,18 C 17,10 20,5 23,3 C 26,5 28,8 30,10 C 32,8 34,5 37,3 C 40,5 43,10 45,18 C 47,26 47,40 46,52 Z',
    roots: ['M 19,52 C 14,68 14,86 22,94 C 28,98 32,98 38,94 C 46,86 46,68 41,52 Z'],
    details: [
      'M 30,10 L 30,32',
      'M 18,18 L 18,50',
      'M 42,18 L 42,50',
      'M 22,24 L 38,24',
      'M 23,4 C 25,7 28,9 30,10',
      'M 37,4 C 35,7 32,9 30,10',
    ],
  },
  molar: {
    crown: 'M 6,52 C 5,38 5,22 8,14 C 11,8 14,4 17,3 C 20,5 22,9 24,10 C 26,10 28,8 30,6 C 32,8 34,10 36,10 C 38,9 40,5 43,3 C 46,4 49,8 52,14 C 55,22 55,38 54,52 Z',
    roots: ['M 12,52 C 8,68 8,86 14,94 C 19,97 24,97 27,94 C 30,86 30,68 26,52 Z', 'M 34,52 C 30,68 30,86 33,94 C 36,97 41,97 46,94 C 52,86 52,68 48,52 Z'],
    details: [
      'M 30,7 L 30,46',
      'M 12,24 L 48,24',
      'M 12,42 L 48,42',
      'M 20,12 L 20,46',
      'M 40,12 L 40,46',
      'M 17,4 C 19,7 22,9 24,10',
      'M 43,4 C 41,7 38,9 36,10',
    ],
  },
};

const FACE_RECTS: Record<Face, [number, number, number, number]> = {
  top:    [0, 0, 60, 16],
  left:   [0, 16, 20, 22],
  center: [20, 16, 20, 22],
  right:  [40, 16, 20, 22],
  bottom: [0, 38, 60, 14],
};

const FACE_LABELS: Record<Face, string> = { top: 'Vestibular', left: 'Mesial', center: 'Oclusal', right: 'Distal', bottom: 'Lingual' };

function tipoDoDente(num: number): keyof typeof SHAPES {
  const ld = num % 10;
  if (ld <= 2) return 'incisor';
  if (ld === 3) return 'canine';
  if (ld <= 5) return 'premolar';
  return 'molar';
}

function Tooth({ num, state, ferramenta, onApply, isUpper }: { num: number; state: ToothState; ferramenta: string; onApply: (face: Face | null) => void; isUpper: boolean }) {
  const [hoverFace, setHoverFace] = useState<Face | null>(null);
  const fc = (f: Face) => FACE_COLORS[(state.faces[f] || 'higido') as FaceStatus];
  const cond = state.cond;
  const tipo = tipoDoDente(num);
  const shape = SHAPES[tipo];
  const clipId = `clip-${num}`;
  const shadeId = `shade-${num}`;
  const enamelId = `enamel-${num}`;
  const isAusente = cond === 'ausente';
  const isCoroa = cond === 'coroa';
  const tool = TOOLS.find(t => t.key === ferramenta);
  const previewColor = tool?.tipo === 'face' ? tool.color : null;
  const numLabel = <span className="text-[11px] font-extrabold text-slate-600 tabular-nums">{num}</span>;

  return (
    <div className="flex flex-col items-center select-none group relative">
      {isUpper && <div className="mb-1">{numLabel}</div>}
      <div className="relative">
        <svg viewBox="0 0 60 100" width="44" height="74" className={`${isAusente ? 'opacity-25' : ''} drop-shadow-sm transition-all group-hover:drop-shadow-lg group-hover:scale-110`} style={{ transform: isUpper ? 'scaleY(-1)' : 'none', transformOrigin: 'center' }}>
          <defs>
            <clipPath id={clipId}><path d={shape.crown}/></clipPath>
            <radialGradient id={enamelId} cx="50%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ffffff"/>
              <stop offset="70%" stopColor="#fafbfc"/>
              <stop offset="100%" stopColor="#e2e8f0"/>
            </radialGradient>
            <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff"/>
              <stop offset="60%" stopColor="#f8fafc"/>
              <stop offset="100%" stopColor="#cbd5e1"/>
            </linearGradient>
          </defs>

          {/* Raízes com sombreamento */}
          {shape.roots.map((r, i) => (
            <g key={i}>
              <path d={r} fill={`url(#${shadeId})`} stroke="#475569" strokeWidth="0.9" strokeLinejoin="round" strokeLinecap="round"/>
              <path d={r} fill="none" stroke="#94a3b8" strokeWidth="0.4" strokeOpacity="0.5" transform="translate(1.2,0)"/>
            </g>
          ))}

          {/* Coroa fundo com gradiente esmalte */}
          <path d={shape.crown} fill={`url(#${enamelId})`} stroke="#475569" strokeWidth="1.1" strokeLinejoin="round"/>

          {/* faces coloridas */}
          <g clipPath={`url(#${clipId})`}>
            {(Object.keys(FACE_RECTS) as Face[]).map(f => {
              const [x, y, w, h] = FACE_RECTS[f];
              const isHover = hoverFace === f;
              const baseFill = fc(f);
              const fill = isHover && previewColor ? previewColor : baseFill;
              const opacity = baseFill === '#ffffff' && !isHover ? 0 : 1;
              return (
                <rect key={f} x={x} y={y} width={w} height={h} fill={fill} fillOpacity={opacity}
                  onClick={(e) => { e.stopPropagation(); onApply(f); }}
                  onMouseEnter={() => setHoverFace(f)}
                  onMouseLeave={() => setHoverFace(null)}
                  className="cursor-pointer transition-opacity"/>
              );
            })}
          </g>

          {/* Detalhes anatômicos (cúspides, sulcos) */}
          <g clipPath={`url(#${clipId})`} stroke="#475569" strokeWidth="0.55" strokeOpacity="0.55" fill="none" strokeLinecap="round" style={{pointerEvents:'none'}}>
            {shape.details.map((d, i) => <path key={i} d={d}/>)}
          </g>

          {/* Sombra interna na borda da coroa para profundidade */}
          <path d={shape.crown} fill="none" stroke="#94a3b8" strokeWidth="0.5" strokeOpacity="0.6" strokeLinejoin="round" transform="translate(0.8,0.8)" clipPath={`url(#${clipId})`} style={{pointerEvents:'none'}}/>

          {/* Contorno final da coroa */}
          <path d={shape.crown} fill="none" stroke={isCoroa ? '#f59e0b' : '#334155'} strokeWidth={isCoroa ? '2.4' : '1.1'} strokeLinejoin="round" style={{pointerEvents:'none'}}/>

          {cond === 'extracao' && <g stroke="#dc2626" strokeWidth="3.2" strokeLinecap="round" style={{pointerEvents:'none'}}><line x1="10" y1="6" x2="50" y2="48"/><line x1="50" y1="6" x2="10" y2="48"/></g>}
          {cond === 'implante' && (
            <g style={{pointerEvents:'none'}}>
              <path d="M 22,54 L 22,92 Q 30,97 38,92 L 38,54 Z" fill="#0ea5e9" stroke="#0369a1" strokeWidth="0.7"/>
              <line x1="20" y1="62" x2="40" y2="62" stroke="white" strokeWidth="1.3"/>
              <line x1="20" y1="70" x2="40" y2="70" stroke="white" strokeWidth="1.3"/>
              <line x1="20" y1="78" x2="40" y2="78" stroke="white" strokeWidth="1.3"/>
              <line x1="22" y1="86" x2="38" y2="86" stroke="white" strokeWidth="1.3"/>
            </g>
          )}
        </svg>
        {/* Tooltip ao hover */}
        {hoverFace && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-md whitespace-nowrap pointer-events-none z-10 shadow-lg">
            #{num} · {FACE_LABELS[hoverFace]}
          </div>
        )}
      </div>
      {!isUpper && <div className="mt-1">{numLabel}</div>}
    </div>
  );
}

export default function PacienteDetalhe() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  const [abaAtiva, setAbaAtiva] = useState('dados'); 
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
  const [savingOdo, setSavingOdo] = useState(false);
  const [modalTrat, setModalTrat] = useState(false);
  const [tratEdit, setTratEdit] = useState<any>({ id: null, dente: '', procedimento: '', data: new Date().toISOString().split('T')[0], status: 'concluido', valor: '', observacoes: '' });

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
      const { data: listaClinicas } = await supabase.from('clinicas').select('*');
      if (listaClinicas) setClinicas(listaClinicas);

      const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
      if (data) {
          setForm(data);
          const fm = data.ficha_medica || {};
          setFicha(fm);
          setOdontograma(fm.odontograma || {});
          setTratamentos(fm.tratamentos || []);
          setAnamnesesAnteriores(fm.anamneses || []);
          setDocumentos(fm.documentos || []);
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
      alert('Dados salvos com sucesso!');
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
          } else return prev;
          return { ...prev, [numDente]: novo };
      });
  }

  function limparDente(numDente: number) {
      setOdontograma(prev => { const n = {...prev}; delete n[numDente]; return n; });
  }

  async function salvarOdontograma() {
      setSavingOdo(true);
      const fichaMerged = { ...ficha, odontograma, tratamentos };
      const { error } = await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
      setFicha(fichaMerged);
      setSavingOdo(false);
      if (error) alert('Erro ao salvar: ' + error.message);
  }

  function abrirNovoTratamento() {
      setTratEdit({ id: null, dente: '', procedimento: '', data: new Date().toISOString().split('T')[0], status: 'concluido', valor: '', observacoes: '' });
      setModalTrat(true);
  }

  async function salvarTratamento() {
      if (!tratEdit.procedimento) return alert('Informe o procedimento');
      let novaLista;
      if (tratEdit.id) {
          novaLista = tratamentos.map(t => t.id === tratEdit.id ? tratEdit : t);
      } else {
          novaLista = [...tratamentos, { ...tratEdit, id: Date.now().toString(), criado_em: new Date().toISOString() }];
      }
      setTratamentos(novaLista);
      const fichaMerged = { ...ficha, odontograma, tratamentos: novaLista };
      const { error } = await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
      setFicha(fichaMerged);
      if (error) return alert('Erro: ' + error.message);
      setModalTrat(false);
  }

  async function excluirTratamento(tid: string) {
      if (!confirm('Excluir este tratamento?')) return;
      const novaLista = tratamentos.filter(t => t.id !== tid);
      setTratamentos(novaLista);
      const fichaMerged = { ...ficha, odontograma, tratamentos: novaLista };
      await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
      setFicha(fichaMerged);
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
                <button onClick={() => setModalDoc(true)} className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-black transition-colors flex items-center gap-2 shadow-lg"><Printer size={16}/> Documentos</button>
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
                                <div className="flex gap-2">
                                    <button onClick={() => { if(confirm('Limpar todo o odontograma?')) setOdontograma({}); }} className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1.5"><Eraser size={14}/> Limpar Tudo</button>
                                    <button onClick={salvarOdontograma} disabled={savingOdo} className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 shadow-sm disabled:opacity-50">{savingOdo ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar Odontograma</button>
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
                                        ? 'Clique em uma face do dente'
                                        : 'Clique em qualquer face para alternar a condição do dente'}
                                </div>
                            </div>

                            {/* Arcadas */}
                            <div className="space-y-2 overflow-x-auto bg-white rounded-2xl p-4 border border-slate-100">
                                {/* Superior */}
                                <div>
                                    <div className="text-[10px] uppercase font-black text-slate-400 mb-2 tracking-wider text-center">Arcada Superior</div>
                                    <div className="flex gap-0.5 justify-center items-end">
                                        {QUADRANTES.sup[0].map(n => <Tooth key={n} num={n} isUpper={true} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                        <div className="w-0.5 self-stretch bg-slate-300/60 mx-1.5"></div>
                                        {QUADRANTES.sup[1].map(n => <Tooth key={n} num={n} isUpper={true} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                    </div>
                                </div>
                                {/* linha de oclusão */}
                                <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent my-1"></div>
                                {/* Inferior */}
                                <div>
                                    <div className="flex gap-0.5 justify-center items-start">
                                        {QUADRANTES.inf[0].map(n => <Tooth key={n} num={n} isUpper={false} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                        <div className="w-0.5 self-stretch bg-slate-300/60 mx-1.5"></div>
                                        {QUADRANTES.inf[1].map(n => <Tooth key={n} num={n} isUpper={false} state={odontograma[n] || { faces: {}, cond: 'normal' }} ferramenta={ferramenta} onApply={(f) => aplicarFerramenta(n, f)} />)}
                                    </div>
                                    <div className="text-[10px] uppercase font-black text-slate-400 mt-2 tracking-wider text-center">Arcada Inferior</div>
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
                        </div>
                    </div>
                )}

                {abaAtiva === 'documentos' && (
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><FolderOpen size={20} className="text-amber-500"/> Documentos & Imagens</h3>
                            <label className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm transition-all ${uploadingDoc ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                {uploadingDoc ? <><Loader2 size={14} className="animate-spin"/> Enviando...</> : <><Upload size={14}/> Enviar Arquivo</>}
                                <input type="file" className="hidden" onChange={uploadDocumento} disabled={uploadingDoc} accept="image/*,application/pdf,.doc,.docx,.txt"/>
                            </label>
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
                    </div>
                    <div className="flex gap-2 justify-end mt-5">
                        <button onClick={() => setModalTrat(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancelar</button>
                        <button onClick={salvarTratamento} className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-sm flex items-center gap-2"><Save size={14}/> Salvar</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}