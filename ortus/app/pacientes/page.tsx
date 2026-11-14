'use client';
import { useState, useEffect, useRef, useMemo, cloneElement, type ReactElement, type PointerEvent as ReactPointerEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, LayoutGrid, List as ListIcon, Phone, ChevronRight, Filter, AlertCircle, Calendar, X, Smile, ArrowUpDown, Check, ArrowDownUp, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePatientActionModal } from '@/components/PatientActionModal';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import CustomSelect from '@/components/ui/CustomSelect';
import Aviso from '@/components/ui/Aviso';
import ModalPedidoProtese from '@/components/proteses/ModalPedidoProtese';
import SegmentedControl from '@/components/ui/SegmentedControl';
import MenuPontos from '@/components/ui/MenuPontos';
import PatientContactButtons from '@/components/PatientContactButtons';
import { buildDocumentoContexto } from '@/lib/documentVariables';

/** Lê o cache do sessionStorage de forma síncrona para o useState inicial */
function readPacientesCache(clinicId: string | null): any[] {
  if (!clinicId || typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem('ortus:pacientes-lista');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { clinicId: string; items: any[] };
    if (parsed.clinicId === clinicId && Array.isArray(parsed.items)) return parsed.items;
  } catch { /* ignore */ }
  return [];
}

function DicaAcao({ label, children }: { label: string; children: ReactElement<{ onPointerDown?: (e: ReactPointerEvent) => void }> }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setVisivel(true)} onMouseLeave={() => setVisivel(false)}>
      {cloneElement(children, {
        onPointerDown: (e: ReactPointerEvent) => {
          setVisivel(false);
          children.props.onPointerDown?.(e);
        },
      })}
      {visivel && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white">
          {label}
        </span>
      )}
    </span>
  );
}

function iniciaisDe(nome: string) {
  const partes = String(nome || '').trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
}

function telefoneFormatado(telefone?: string | null) {
  const tel = String(telefone || '').replace(/\D/g, '');
  if (!tel) return 'Sem telefone';
  if (tel.length >= 11) return `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7, 11)}`;
  if (tel.length >= 10) return `(${tel.slice(0, 2)}) ${tel.slice(2, 6)}-${tel.slice(6, 10)}`;
  return telefone || 'Sem telefone';
}

/** Data da última consulta já realizada (ignora agendamentos futuros). */
function ultimaVisita(p: any): string {
  const ags = (p.agendamentos || []) as Array<{ data_hora?: string }>;
  const agora = Date.now();
  let ultima: number | null = null;
  for (const ag of ags) {
    const t = ag?.data_hora ? new Date(ag.data_hora).getTime() : NaN;
    if (Number.isNaN(t) || t > agora) continue;
    if (ultima === null || t > ultima) ultima = t;
  }
  if (ultima === null) return 'Sem consultas';
  const data = new Date(ultima);
  if (data.toDateString() === new Date().toDateString()) {
    return `Hoje, ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const chipBase = 'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors';
const card = 'rounded-xl bg-white';

export default function Pacientes() {
  const { activeClinicId, loading: clinicLoading, clinics } = useClinica();

  // Inicializa com cache instantâneo — sem esperar useEffect
  const cachedRef = useRef(readPacientesCache(activeClinicId));
  const [pacientes, setPacientes] = useState<any[]>(cachedRef.current);
  const [clinicas, setClinicas] = useState<any[]>([]);
  // Só mostra loading se não tem nada em cache
  const [loading, setLoading] = useState(cachedRef.current.length === 0);
  const [visualizacao, setVisualizacao] = useState('lista');
  const [busca, setBusca] = useState('');

  // Filtros
  const [filtroClinica, setFiltroClinica] = useState(() =>
    activeClinicId ? (activeClinicId === 'all' ? 'todas' : activeClinicId) : 'todas'
  );
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroDebito, setFiltroDebito] = useState(false);
  const [filtroSemConsulta, setFiltroSemConsulta] = useState<number | null>(null);
  const [filtroProcedimento, setFiltroProcedimento] = useState('');
  const [showFiltros, setShowFiltros] = useState(false);
  const [ordenacao, setOrdenacao] = useState<{ campo: 'nome' | 'plano' | 'status'; dir: 'asc' | 'desc' }>({ campo: 'nome', dir: 'asc' });
  const [quantidadeVisivel, setQuantidadeVisivel] = useState(24);

  const router = useRouter();
  const { openQuickCapture } = usePatientActionModal();
  const [protese, setProtese] = useState<{ id: string; nome: string; clinica_id?: string | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function abrirProtese(p: { id: string | number; nome: string; clinica_id?: string | null }) {
    setProtese({ id: String(p.id), nome: p.nome, clinica_id: p.clinica_id ?? null });
  }

  // Sincroniza filtro de clínica com contexto global
  useEffect(() => {
      if (activeClinicId) setFiltroClinica(activeClinicId === 'all' ? 'todas' : activeClinicId);
  }, [activeClinicId]);

  useEffect(() => {
      const filtro = new URLSearchParams(window.location.search).get('filtro');
      if (filtro === 'debito') { setFiltroDebito(true); setShowFiltros(true); }
      if (filtro === 'sem30') { setFiltroSemConsulta(30); setShowFiltros(true); }
  }, []);

  const lastClinicRef = useRef<string | null>(null);
  const jaCarregou = useRef(cachedRef.current.length > 0);

  useEffect(() => {
      // clinicLoading=true → ainda aguardando; =false → pronto
      if (clinicLoading || !activeClinicId) return;
      if (lastClinicRef.current === activeClinicId && jaCarregou.current) return;
      const silent = jaCarregou.current;
      lastClinicRef.current = activeClinicId;
      carregarDados({ silent });
  }, [clinicLoading, activeClinicId]);

  // Atualiza a lista quando um paciente é criado/alterado em outro lugar (ex.: Quick Capture)
  useEffect(() => {
      function handle() { carregarDados({ silent: true }); }
      window.addEventListener('ortus:paciente-changed', handle);
      return () => window.removeEventListener('ortus:paciente-changed', handle);
  }, []);

  async function carregarDados(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);

    // 1. Usar clínicas já carregadas pelo ClinicaContext (sem fetch redundante)
    const listaClinicas = clinics.length > 0 ? clinics : await fetchUserClinicas();
    setClinicas(listaClinicas as any[]);
    const idsPermitidos = listaClinicas.map((c) => c.id);

    // 2. Carregar Pacientes restritos às clínicas do usuário
    let pacientesQuery = supabase
        .from('pacientes')
        .select('*, agendamentos(data_hora, status), clinicas(nome), planos(nome, tipo), paciente_tratamentos(procedimento, status), paciente_anamneses(id), paciente_documentos(id)')
        .order('created_at', { ascending: false });
    if (idsPermitidos.length > 0) {
        // Inclui pacientes da clinica OU sem clinica vinculada (null)
        const idsStr = idsPermitidos.join(',');
        pacientesQuery = pacientesQuery.or(`clinica_id.in.(${idsStr}),clinica_id.is.null`);
    } else {
        // Nenhuma clínica disponível para esse usuário
        setLoading(false); return;
    }
    const { data } = await pacientesQuery;

    if (data) {
        const formatados = data.map((p: any) => {
            const agendamentos = p.agendamentos || [];
            agendamentos.sort((a: any, b: any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
            const ultimo = agendamentos[0];
            const status = ultimo ? (new Date(ultimo.data_hora) > new Date() ? 'agendado' : 'ativo') : 'novo';
            return { ...p, status, nome_clinica: p.clinicas?.nome };
        });
        setPacientes(formatados);
        try {
          sessionStorage.setItem(
            'ortus:pacientes-lista',
            JSON.stringify({ clinicId: activeClinicId, items: formatados }),
          );
        } catch {
          /* ignore */
        }
    }
    setLoading(false);
    jaCarregou.current = true;
  }

  function novoPaciente() {
      // Quick Capture: abre o modal de cadastro rápido. Se houver filtro de clínica ativo,
      // pré-seleciona-o para o INSERT. Após cadastrar, a UI desliza para o Hub de Ações.
      openQuickCapture(filtroClinica !== 'todas' ? filtroClinica : null);
  }

  function planoDe(p: any) {
      if (!p.planos) return 'Particular';
      return p.planos.tipo === 'particular' ? 'Particular' : (p.planos.nome || 'Particular');
  }

  function alternarOrdem(campo: 'nome' | 'plano' | 'status') {
      setOrdenacao((atual) => atual.campo === campo
          ? { campo, dir: atual.dir === 'asc' ? 'desc' : 'asc' }
          : { campo, dir: 'asc' });
  }

  const filtrosAtivos = filtroStatus !== 'todos' || filtroDebito || filtroSemConsulta !== null || filtroProcedimento || filtroClinica !== (activeClinicId === 'all' ? 'todas' : activeClinicId || 'todas');

  const filtrados = useMemo(() => pacientes.filter((p: any) => {
      const bateBusca = !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.telefone || '').includes(busca) || (p.cpf || '').replace(/\D/g, '').includes(busca.replace(/\D/g, ''));
      const bateClinica = filtroClinica === 'todas' ? true : p.clinica_id == filtroClinica;
      if (!bateBusca || !bateClinica) return false;

      // Status
      if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;

      // Débito
      const temDebito = (p.agendamentos || []).some((a: any) => a.status === 'fiado');
      if (filtroDebito && !temDebito) return false;

      // Sem consulta há X dias
      if (filtroSemConsulta !== null) {
          const ags = (p.agendamentos || []).filter((a: any) => a.status === 'concluido');
          if (ags.length === 0) {
              // Nunca teve consulta — inclui
          } else {
              ags.sort((a: any, b: any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
              const dias = Math.floor((Date.now() - new Date(ags[0].data_hora).getTime()) / 86400000);
              if (dias < filtroSemConsulta) return false;
          }
      }

      // Procedimento pendente
      if (filtroProcedimento) {
          const trts = p.paciente_tratamentos || p.ficha_medica?.tratamentos || [];
          const match = trts.some((t: any) => t.procedimento?.toLowerCase().includes(filtroProcedimento.toLowerCase()) && t.status !== 'concluido');
          if (!match) return false;
      }

      return true;
  }).sort((a: any, b: any) => {
      const valor = (p: any) => ordenacao.campo === 'plano' ? planoDe(p) : ordenacao.campo === 'status' ? (p.status || '') : (p.nome || '');
      const cmp = String(valor(a)).localeCompare(String(valor(b)), 'pt-BR', { sensitivity: 'base' });
      return ordenacao.dir === 'asc' ? cmp : -cmp;
  }), [pacientes, busca, filtroClinica, filtroStatus, filtroDebito, filtroSemConsulta, filtroProcedimento, ordenacao]);

  // Toda mudança de busca/filtro/ordem volta para a primeira página da lista
  useEffect(() => {
    setQuantidadeVisivel(24);
  }, [busca, filtroClinica, filtroStatus, filtroDebito, filtroSemConsulta, filtroProcedimento, ordenacao]);

  const visiveis = filtrados.slice(0, quantidadeVisivel);
  const restantes = Math.max(0, filtrados.length - visiveis.length);

  const clinicaAtivaId = !activeClinicId || activeClinicId === 'all' ? 'todas' : String(activeClinicId);
  const clinicaDivergente = filtroClinica !== clinicaAtivaId;

  function limparFiltros() {
      setFiltroStatus('todos'); setFiltroDebito(false); setFiltroSemConsulta(null); setFiltroProcedimento('');
  }

  function stopRowClick(e: React.MouseEvent) {
      e.stopPropagation();
  }

  const acoesDoPaciente = (p: any) => [
    { id: 'ficha', label: 'Abrir ficha', onClick: () => router.push(`/pacientes/${p.id}`) },
    {
      id: 'agenda',
      label: 'Agendar consulta',
      onClick: () => window.dispatchEvent(new CustomEvent('ortus:novo-agendamento', { detail: { pacienteId: String(p.id), pacienteNome: p.nome, clinicaId: p.clinica_id ? String(p.clinica_id) : undefined } })),
    },
    { id: 'protese', label: 'Nova prótese', onClick: () => abrirProtese(p) },
    { id: 'whatsapp', label: 'Enviar WhatsApp', onClick: () => router.push(`/whatsapp?telefone=${encodeURIComponent(String(p.telefone || '').replace(/\D/g, ''))}`) },
  ];

  const chipStatus: { valor: string; rotulo: string }[] = [
    { valor: 'todos', rotulo: 'Todos' },
    { valor: 'ativo', rotulo: 'Ativos' },
    { valor: 'agendado', rotulo: 'Agendados' },
    { valor: 'novo', rotulo: 'Novos' },
  ];

  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <Aviso mensagem={aviso} />
      <ModalPedidoProtese
        open={!!protese}
        onClose={() => setProtese(null)}
        clinicId={protese?.clinica_id ? String(protese.clinica_id) : (!activeClinicId || activeClinicId === 'all' ? null : String(activeClinicId))}
        pacienteInicial={protese}
        onAviso={(_tipo, mensagem) => {
          setAviso(mensagem);
          window.setTimeout(() => setAviso(null), 2400);
        }}
        onSaved={() => setProtese(null)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Pacientes</h1>
            <p className="mt-1 text-sm text-neutral-500 sm:text-base">
              {filtrados.length} {filtrados.length === 1 ? 'paciente' : 'pacientes'}
              {busca || filtrosAtivos ? ' encontrados' : ' na base'}
            </p>
          </div>
          <button
            onClick={novoPaciente}
            className="hidden h-10 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:inline-flex"
          >
            <Plus size={16} /> Novo paciente
          </button>
      </div>

      {/* Busca em destaque + chips de filtro */}
      <div className={`${card} border border-neutral-200 p-3 sm:p-4`}>
          <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/>
              <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  placeholder="Buscar por nome, CPF ou telefone…"
                  className="h-12 w-full rounded-xl border border-neutral-200 bg-[#f7f7f5] pl-11 pr-11 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white sm:h-11 sm:text-sm"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  aria-label="Limpar busca"
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <X size={16} />
                </button>
              )}
          </div>

          <div className="mt-3 flex items-center gap-1.5">
              <div className="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chipStatus.map((chip) => {
                  const ativo = filtroStatus === chip.valor;
                  return (
                    <button
                        key={chip.valor}
                        type="button"
                        onClick={() => setFiltroStatus(chip.valor)}
                        aria-pressed={ativo}
                        className={`${chipBase} ${ativo ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600'}`}
                    >
                        {chip.rotulo}
                    </button>
                  );
              })}
              <button
                  type="button"
                  onClick={() => setFiltroDebito((atual) => !atual)}
                  aria-pressed={filtroDebito}
                  className={`${chipBase} ${filtroDebito ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-neutral-200 bg-white text-neutral-600'}`}
              >
                  <AlertCircle size={14} className={filtroDebito ? 'text-red-500' : 'text-neutral-400'} /> Com débito
              </button>
              {filtroSemConsulta !== null && (
                  <span className={`${chipBase} border border-neutral-200 bg-[#f3f4f1] text-neutral-700`}>
                      {filtroSemConsulta} dias sem consulta
                      <button type="button" onClick={() => setFiltroSemConsulta(null)} aria-label="Remover filtro de período"><X size={13} /></button>
                  </span>
              )}
              {filtroProcedimento && (
                  <span className={`${chipBase} border border-neutral-200 bg-[#f3f4f1] text-neutral-700`}>
                      {filtroProcedimento}
                      <button type="button" onClick={() => setFiltroProcedimento('')} aria-label="Remover filtro de procedimento"><X size={13} /></button>
                  </span>
              )}
              </div>
              <button
                  type="button"
                  onClick={() => setShowFiltros(true)}
                  className={`${chipBase} shrink-0 border ${showFiltros || filtrosAtivos ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}
              >
                  <Filter size={14} /> Filtros
                  {filtrosAtivos && <span className="h-1.5 w-1.5 rounded-full bg-[#c8f053]" />}
              </button>
          </div>
      </div>

      {/* Gaveta de filtros: bottom sheet no celular, painel inline no desktop */}
      {showFiltros && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center md:static md:z-auto md:block">
              <button type="button" aria-label="Fechar filtros" onClick={() => setShowFiltros(false)} className="absolute inset-0 bg-black/30 md:hidden" />
              <div className="relative max-h-[85dvh] w-full overflow-y-auto rounded-t-[1.5rem] border border-neutral-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl md:max-h-none md:overflow-visible md:rounded-xl md:p-4 md:shadow-none">
                  <div className="mb-3 flex items-center justify-between md:hidden">
                      <h2 className="text-base font-semibold text-neutral-900">Filtros</h2>
                      <button type="button" onClick={() => setShowFiltros(false)} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
                          <X size={18} />
                      </button>
                  </div>
                  <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_8.5rem_11.5rem_minmax(0,1fr)]">
                      <div className="min-w-0">
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Clínica</label>
                          <CustomSelect value={filtroClinica} onChange={setFiltroClinica} options={[{value:'todas',label:'Todas as clínicas'}, ...clinicas.map((c:any) => ({value:String(c.id),label:c.nome}))]} size="md"/>
                      </div>
                      <div className="min-w-0">
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Status</label>
                          <CustomSelect value={filtroStatus} onChange={setFiltroStatus} options={[{value:'todos',label:'Todos'},{value:'ativo',label:'Ativo'},{value:'agendado',label:'Agendado'},{value:'novo',label:'Novo'}]} size="md"/>
                      </div>
                      <div className="min-w-0">
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Sem consulta há</label>
                          <CustomSelect value={String(filtroSemConsulta ?? '')} onChange={v => setFiltroSemConsulta(v ? Number(v) : null)} options={[{value:'',label:'Qualquer período'},{value:'30',label:'30 dias'},{value:'60',label:'60 dias'},{value:'90',label:'90 dias'},{value:'180',label:'6 meses'},{value:'365',label:'1 ano'}]} size="md"/>
                      </div>
                      <div className="min-w-0">
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Procedimento pendente</label>
                          <input placeholder="Ex: canal" value={filtroProcedimento} onChange={e => setFiltroProcedimento(e.target.value)} className="h-11 w-full rounded-md border border-neutral-200 bg-white px-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 sm:h-10 sm:text-sm"/>
                      </div>
                      <div className="flex items-center gap-2">
                          <button
                              type="button"
                              onClick={() => setFiltroDebito((atual) => !atual)}
                              aria-pressed={filtroDebito}
                              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors sm:h-10 ${filtroDebito ? 'border-red-200 bg-red-50 text-neutral-900' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                          >
                              <span className={`flex h-4 w-4 items-center justify-center rounded-md border ${filtroDebito ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
                                  {filtroDebito && <Check size={11} strokeWidth={3} />}
                              </span>
                              <AlertCircle size={15} className="text-red-500" />
                              Com débito
                          </button>
                      </div>
                  </div>
                  <div className="mt-4 flex gap-2 md:hidden">
                      <button
                          type="button"
                          onClick={() => { limparFiltros(); setFiltroClinica(clinicaAtivaId); }}
                          disabled={!filtrosAtivos}
                          className="h-11 flex-1 rounded-md border border-neutral-200 text-sm font-medium text-neutral-700 disabled:opacity-40"
                      >
                          Limpar
                      </button>
                      <button
                          type="button"
                          onClick={() => setShowFiltros(false)}
                          className="h-11 flex-[1.6] rounded-md bg-neutral-900 text-sm font-medium text-white"
                      >
                          Ver {filtrados.length} resultado{filtrados.length === 1 ? '' : 's'}
                      </button>
                  </div>
                  <div className="mt-3 hidden md:block">
                      {filtrosAtivos && (
                          <button onClick={() => { limparFiltros(); setFiltroClinica(clinicaAtivaId); }} className="inline-flex h-10 shrink-0 items-center gap-1 px-1 text-sm font-medium text-neutral-500 hover:text-neutral-900"><X size={14}/> Limpar filtros</button>
                      )}
                  </div>
              </div>
          </div>
      )}

      {clinicaDivergente && (
          <p className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-600">
              O filtro está em outra unidade.
          </p>
      )}

      {/* Barra de contagem + ordenação */}
      {!loading || jaCarregou.current ? (
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-neutral-500">
            {filtrados.length === 0 ? 'Nenhum resultado' : `${visiveis.length} de ${filtrados.length} paciente${filtrados.length === 1 ? '' : 's'}`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <div className="md:hidden">
              <CustomSelect
                value={`${ordenacao.campo}:${ordenacao.dir}`}
                onChange={(v) => {
                  const [campo, dir] = v.split(':') as ['nome' | 'plano' | 'status', 'asc' | 'desc'];
                  setOrdenacao({ campo, dir });
                }}
                options={[
                  { value: 'nome:asc', label: 'Nome A-Z' },
                  { value: 'nome:desc', label: 'Nome Z-A' },
                  { value: 'plano:asc', label: 'Plano' },
                  { value: 'status:asc', label: 'Status' },
                ]}
                size="sm"
              />
            </div>
            <div className="hidden md:block">
              <SegmentedControl
                  value={(visualizacao === 'cards' ? 'cards' : 'lista') as 'lista' | 'cards'}
                  onChange={(v) => setVisualizacao(v)}
                  className="w-fit shrink-0"
                  options={[
                      { value: 'lista', label: <ListIcon size={18} />, ariaLabel: 'Lista' },
                      { value: 'cards', label: <LayoutGrid size={18} />, ariaLabel: 'Grade' },
                  ]}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Conteúdo */}
      {loading && !jaCarregou.current ? (
        <div className="space-y-2 md:space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`${card} flex items-center gap-3 border border-neutral-200 p-3.5 md:border-0 md:border-b md:border-black/5 md:rounded-none`}>
              <div className="h-11 w-11 animate-pulse rounded-full bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-36 animate-pulse rounded-lg bg-neutral-100" />
                <div className="h-3 w-24 animate-pulse rounded-lg bg-neutral-50" />
              </div>
              <div className="h-5 w-14 animate-pulse rounded-full bg-neutral-100" />
            </div>
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className={`${card} border border-neutral-200 px-6 py-10 text-center`}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
            <UserRound size={22} />
          </span>
          <h2 className="mt-3 text-base font-semibold text-neutral-900">
            {busca || filtrosAtivos ? 'Nenhum paciente com esses filtros' : 'Nenhum paciente cadastrado'}
          </h2>
          <p className="mx-auto mt-1 max-w-xs text-sm text-neutral-500">
            {busca || filtrosAtivos
              ? 'Tente outro termo de busca ou limpe os filtros aplicados.'
              : 'Cadastre o primeiro paciente para começar a organizar a agenda e o laboratório.'}
          </p>
          <div className="mx-auto mt-4 flex max-w-xs flex-col gap-2">
            {busca || filtrosAtivos ? (
              <button
                type="button"
                onClick={() => { setBusca(''); limparFiltros(); setFiltroClinica(clinicaAtivaId); }}
                className="h-11 rounded-md border border-neutral-200 bg-white text-sm font-medium text-neutral-800"
              >
                Limpar busca e filtros
              </button>
            ) : null}
            <button
              type="button"
              onClick={novoPaciente}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white"
            >
              <Plus size={16} /> Novo paciente
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* MOBILE — cartões */}
          <ul className="space-y-2 md:hidden">
            {visiveis.map((p: any) => {
              const statusRotulo = p.status === 'ativo' ? 'Ativo' : p.status === 'agendado' ? 'Agendado' : 'Novo';
              const statusClasse = p.status === 'ativo' ? 'bg-emerald-50 text-emerald-700' : p.status === 'agendado' ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-600';
              return (
                <li key={p.id} className={`${card} overflow-hidden border border-neutral-200`}>
                  <button
                    type="button"
                    onClick={() => router.push(`/pacientes/${p.id}`)}
                    className="flex w-full min-w-0 items-center gap-3 p-3.5 text-left transition-colors active:bg-[#f8f8f6]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f5f5f7] text-xs font-semibold text-[#6e6e73]">
                      {p.foto_url ? <img src={p.foto_url} alt="" className="h-full w-full object-cover" /> : iniciaisDe(p.nome)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-neutral-900">{p.nome}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-neutral-500">
                        <Phone size={13} className="shrink-0" />
                        <span className="truncate">{telefoneFormatado(p.telefone)}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClasse}`}>{statusRotulo}</span>
                        <span className="max-w-[9rem] truncate rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">{planoDe(p)}</span>
                        <span className="truncate text-[11px] text-neutral-400">Última consulta: {ultimaVisita(p)}</span>
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-2 border-t border-black/[0.05] px-2.5 py-1.5" onClick={stopRowClick}>
                    <span className="flex items-center gap-1">
                      <PatientContactButtons
                        variant="icons"
                        channels={['whatsapp']}
                        telefone={p.telefone}
                        email={p.email}
                        clinicaId={p.clinica_id}
                        evento="pos_consulta"
                        contexto={buildDocumentoContexto({
                          paciente_nome: p.nome?.split(' ')[0],
                          clinica_nome: p.nome_clinica,
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('ortus:novo-agendamento', { detail: { pacienteId: String(p.id), pacienteNome: p.nome, clinicaId: p.clinica_id ? String(p.clinica_id) : undefined } }))}
                        aria-label="Agendar consulta"
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-500 active:bg-neutral-100"
                      >
                        <Calendar size={18} />
                      </button>
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => router.push(`/pacientes/${p.id}`)}
                        className="inline-flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-neutral-700 active:bg-neutral-100"
                      >
                        Abrir ficha
                        <ChevronRight size={16} className="text-neutral-300" />
                      </button>
                      <MenuPontos itens={acoesDoPaciente(p)} tamanho={18} className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-500 active:bg-neutral-100" />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* DESKTOP — lista ou grade (como antes, com cabeçalho ordenável) */}
          <div className="hidden md:block">
            {visualizacao === 'lista' ? (
              <div className={`${card} overflow-hidden border border-neutral-200`}>
                <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 md:px-5">
                  <h2 className="flex items-center gap-1.5 text-base font-semibold text-neutral-900">
                    Lista
                    <AlertCircle size={14} className="text-neutral-300" />
                  </h2>
                </div>
                <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)_9.5rem] items-center gap-3 px-5 pb-2 pt-2 text-xs font-medium text-neutral-400">
                  {(['nome', 'plano', 'status'] as const).map((campo) => (
                    <button key={campo} type="button" onClick={() => alternarOrdem(campo)} className="inline-flex items-center gap-1 capitalize text-left hover:text-neutral-900">
                      {campo}
                      <ArrowUpDown size={12} className={ordenacao.campo === campo ? 'text-neutral-900' : 'text-neutral-300'} />
                    </button>
                  ))}
                  <span className="text-right">Ações</span>
                </div>
                <ul>
                  {visiveis.map((p: any) => (
                    <li key={p.id}>
                      <div
                        onClick={() => router.push(`/pacientes/${p.id}`)}
                        className="grid cursor-pointer grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)_9.5rem] items-center gap-3 border-t border-black/[0.05] px-5 py-3 transition-colors hover:bg-[#f8f8f6]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f5f5f7] text-[11px] font-semibold text-[#6e6e73]">{p.foto_url ? <img src={p.foto_url} alt="" className="h-full w-full object-cover" /> : iniciaisDe(p.nome)}</span>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-medium text-[#1d1d1f]">{p.nome}</p>
                            <p className="truncate text-[12px] text-[#aeaeb2]">{telefoneFormatado(p.telefone)} · Últ. {ultimaVisita(p)}</p>
                          </div>
                        </div>
                        <span className="truncate text-sm font-medium text-neutral-800">{planoDe(p)}</span>
                        <span className="truncate text-sm capitalize text-neutral-800">{p.status}</span>
                        <div className="flex items-center justify-end gap-1" onClick={stopRowClick}>
                          <PatientContactButtons
                            variant="icons"
                            channels={['whatsapp']}
                            telefone={p.telefone}
                            email={p.email}
                            clinicaId={p.clinica_id}
                            evento="pos_consulta"
                            contexto={buildDocumentoContexto({
                              paciente_nome: p.nome?.split(' ')[0],
                              clinica_nome: p.nome_clinica,
                            })}
                          />
                          <DicaAcao label="Agendar consulta"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('ortus:novo-agendamento', { detail: { pacienteId: String(p.id), pacienteNome: p.nome, clinicaId: p.clinica_id ? String(p.clinica_id) : undefined } }))} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"><Calendar size={15}/></button></DicaAcao>
                          <DicaAcao label="Nova prótese"><button type="button" onClick={() => abrirProtese(p)} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"><Smile size={15}/></button></DicaAcao>
                          <ChevronRight size={16} className="text-neutral-300" />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visiveis.map((p: any) => (
                  <div key={p.id} onClick={() => router.push(`/pacientes/${p.id}`)} className={`${card} cursor-pointer border border-neutral-200 p-5 transition-colors hover:bg-[#f8f8f6]`}>
                      <div className="mb-4 flex items-center gap-3">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-100 text-sm font-semibold text-neutral-900">{p.foto_url ? <img src={p.foto_url} alt="" className="h-full w-full object-cover" /> : iniciaisDe(p.nome)}</span>
                          <div className="min-w-0 flex-1">
                              <h3 className="truncate text-base font-semibold text-neutral-900">{p.nome}</h3>
                              <p className="truncate text-xs font-medium text-neutral-500">{p.nome_clinica || 'Sem clínica'}</p>
                          </div>
                          <div className="flex items-center gap-1" onClick={stopRowClick}>
                              <PatientContactButtons variant="icons" channels={['whatsapp']} telefone={p.telefone} email={p.email} clinicaId={p.clinica_id} evento="pos_consulta" contexto={buildDocumentoContexto({ paciente_nome: p.nome?.split(' ')[0], clinica_nome: p.nome_clinica })} />
                              <DicaAcao label="Agendar consulta"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('ortus:novo-agendamento', { detail: { pacienteId: String(p.id), pacienteNome: p.nome, clinicaId: p.clinica_id ? String(p.clinica_id) : undefined } }))} className="rounded-full p-2 text-neutral-500 hover:bg-white hover:text-neutral-900"><Calendar size={16}/></button></DicaAcao>
                              <DicaAcao label="Nova prótese"><button type="button" onClick={() => abrirProtese(p)} className="rounded-full p-2 text-neutral-500 hover:bg-white hover:text-neutral-900"><Smile size={16}/></button></DicaAcao>
                          </div>
                      </div>
                      <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-neutral-600"><Phone size={14}/> {telefoneFormatado(p.telefone)}</div>
                          <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">{planoDe(p)}</span>
                              <span className="rounded-md border border-neutral-200 px-2 py-0.5 text-xs font-medium capitalize text-neutral-600">{p.status}</span>
                              <span className="text-xs text-neutral-400">Últ. consulta: {ultimaVisita(p)}</span>
                          </div>
                      </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Carregar mais */}
          {restantes > 0 && (
            <div className="flex flex-col items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setQuantidadeVisivel((q) => q + 24)}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white text-sm font-medium text-neutral-800 hover:bg-neutral-50 md:w-auto md:px-6"
              >
                <ArrowDownUp size={15} /> Carregar mais ({restantes})
              </button>
              <p className="text-xs text-neutral-400">Mostrando {visiveis.length} de {filtrados.length}</p>
            </div>
          )}
        </>
      )}

      {/* Ação principal fixa no celular */}
      <button
        type="button"
        onClick={novoPaciente}
        className="fixed bottom-[calc(5.4rem_+_env(safe-area-inset-bottom))] right-4 z-[105] inline-flex h-12 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] active:scale-[0.98] lg:hidden"
      >
        <Plus size={18} /> Novo paciente
      </button>
      <div className="h-14 lg:hidden" aria-hidden />
    </div>
  );
}
