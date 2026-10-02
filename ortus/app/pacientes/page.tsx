'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, LayoutGrid, List as ListIcon, Phone, ChevronRight, Filter, AlertCircle, Calendar, X, Smile, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePatientActionModal } from '@/components/PatientActionModal';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import CustomSelect from '@/components/ui/CustomSelect';
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

  const router = useRouter();
  const { openQuickCapture } = usePatientActionModal();

  // Sincroniza filtro de clínica com contexto global
  useEffect(() => {
      if (activeClinicId) setFiltroClinica(activeClinicId === 'all' ? 'todas' : activeClinicId);
  }, [activeClinicId]);

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

  const filtrados = pacientes.filter((p: any) => {
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
  });

  const clinicaAtivaId = !activeClinicId || activeClinicId === 'all' ? 'todas' : String(activeClinicId);
  const clinicaDivergente = filtroClinica !== clinicaAtivaId;

  function limparFiltros() {
      setFiltroStatus('todos'); setFiltroDebito(false); setFiltroSemConsulta(null); setFiltroProcedimento('');
  }

  function stopRowClick(e: React.MouseEvent) {
      e.stopPropagation();
  }

  const card = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';

  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Pacientes</h1>
            <p className="mt-1 text-sm text-neutral-500 sm:text-base">{filtrados.length} {filtrados.length === 1 ? 'paciente' : 'pacientes'}</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
              <button onClick={novoPaciente} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:flex-none"><Plus size={16}/> Novo paciente</button>
          </div>
      </div>

      <div className={`${card} flex flex-col gap-2 p-3 sm:p-4`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/>
                  <input type="text" placeholder="Buscar nome, CPF ou telefone…" className="h-10 w-full rounded-full border border-black/10 bg-[#f8f8f6] py-2 pl-10 pr-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>

              <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => setShowFiltros(!showFiltros)} className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${showFiltros || filtrosAtivos ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/10 text-neutral-700 hover:bg-neutral-50'}`}>
                  <Filter size={15}/> Filtros
                  {filtrosAtivos && <span className="h-1.5 w-1.5 rounded-full bg-[#c8f053]"></span>}
              </button>

              <div className="flex rounded-full border border-black/10 bg-[#f3f4f1] p-0.5">
                  <button onClick={() => setVisualizacao('lista')} className={`rounded-full p-2 ${visualizacao === 'lista' ? 'bg-neutral-900 text-white' : 'text-neutral-500'}`}><ListIcon size={18}/></button>
                  <button onClick={() => setVisualizacao('cards')} className={`rounded-full p-2 ${visualizacao === 'cards' ? 'bg-neutral-900 text-white' : 'text-neutral-500'}`}><LayoutGrid size={18}/></button>
              </div>
              </div>
          </div>

          {showFiltros && (
              <div className="grid grid-cols-1 items-end gap-3 border-t border-black/5 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400">Clínica</label>
                      <CustomSelect pill value={filtroClinica} onChange={setFiltroClinica} options={[{value:'todas',label:'Todas as clínicas'}, ...clinicas.map((c:any) => ({value:String(c.id),label:c.nome}))]} size="sm"/>
                  </div>
                  <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400">Status</label>
                      <CustomSelect pill value={filtroStatus} onChange={setFiltroStatus} options={[{value:'todos',label:'Todos'},{value:'ativo',label:'Ativo'},{value:'agendado',label:'Agendado'},{value:'novo',label:'Novo'}]} size="sm"/>
                  </div>
                  <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400">Sem consulta há</label>
                      <CustomSelect pill value={String(filtroSemConsulta ?? '')} onChange={v => setFiltroSemConsulta(v ? Number(v) : null)} options={[{value:'',label:'Qualquer período'},{value:'30',label:'30 dias'},{value:'60',label:'60 dias'},{value:'90',label:'90 dias'},{value:'180',label:'6 meses'},{value:'365',label:'1 ano'}]} size="sm"/>
                  </div>
                  <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400">Procedimento pendente</label>
                      <input placeholder="Ex: canal" value={filtroProcedimento} onChange={e => setFiltroProcedimento(e.target.value)} className="h-10 w-full rounded-full border border-black/10 bg-[#f8f8f6] px-4 text-sm outline-none focus:border-neutral-400"/>
                  </div>
                  <label className="inline-flex h-10 items-center gap-2 rounded-full border border-black/10 bg-[#f8f8f6] px-4 text-sm font-medium text-neutral-700">
                      <input type="checkbox" checked={filtroDebito} onChange={e => setFiltroDebito(e.target.checked)} className="rounded accent-neutral-900"/>
                      <AlertCircle size={14} className="text-neutral-700"/> Com débito
                  </label>
                  {clinicaDivergente && (
                      <p className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                          A clínica deste filtro não é a unidade ativa no menu lateral.
                      </p>
                  )}
                  {filtrosAtivos && (
                      <button onClick={() => { limparFiltros(); setFiltroClinica(clinicaAtivaId); }} className="inline-flex h-10 items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900"><X size={14}/> Limpar filtros</button>
                  )}
              </div>
          )}
      </div>

      {/* Sem spinner bloqueante — skeletons inline se não há dados ainda */}
      {loading && !jaCarregou.current ? (
        <div className={`${card} overflow-hidden`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-black/5 px-4 py-3 last:border-0 md:px-5">
              <div className="h-9 w-9 animate-pulse rounded-full bg-neutral-100 sm:h-10 sm:w-10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-36 animate-pulse rounded-lg bg-neutral-100" />
                <div className="h-3 w-24 animate-pulse rounded-lg bg-neutral-50" />
              </div>
              <div className="h-5 w-14 animate-pulse rounded-full bg-neutral-100" />
            </div>
          ))}
        </div>
      ) : visualizacao === 'lista' ? (
        <div className={`${card} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 md:px-5">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-neutral-900">
              Lista
              <AlertCircle size={14} className="text-neutral-300" />
            </h2>
          </div>
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)_9.5rem] items-center gap-3 px-5 pb-2 pt-2 text-xs font-medium text-neutral-400 md:grid">
            {(['nome', 'plano', 'status'] as const).map((campo) => (
              <button key={campo} type="button" onClick={() => alternarOrdem(campo)} className="inline-flex items-center gap-1 capitalize text-left hover:text-neutral-900">
                {campo}
                <ArrowUpDown size={12} className={ordenacao.campo === campo ? 'text-neutral-900' : 'text-neutral-300'} />
              </button>
            ))}
            <span className="text-right">Ações</span>
          </div>
          <ul>
            {filtrados.map((p: any) => {
              const partes = String(p.nome || '').trim().split(/\s+/);
              const iniciais = ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
              const tel = (p.telefone || '').replace(/\D/g, '');
              const telFmt = tel.length >= 11 ? `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7, 11)}` : (p.telefone || 'Sem telefone');
              const plano = p.planos ? (p.planos.tipo === 'particular' ? 'Particular' : p.planos.nome) : 'Particular';
              return (
                <li key={p.id}>
                  <div
                    onClick={() => router.push(`/pacientes/${p.id}`)}
                    className="grid cursor-pointer grid-cols-1 items-center gap-2 border-t border-black/[0.05] px-4 py-3 transition-colors hover:bg-[#f8f8f6] md:grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)_9.5rem] md:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-[11px] font-semibold text-[#6e6e73]">{iniciais}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-[#1d1d1f]">{p.nome}</p>
                        <p className="truncate text-[12px] text-[#aeaeb2]">Paciente · {telFmt}</p>
                      </div>
                    </div>
                    <span className="pl-12 text-sm font-medium text-neutral-800 md:pl-0">{plano}</span>
                    <span className="hidden text-sm capitalize text-neutral-800 md:block">{p.status}</span>
                    <div className="hidden items-center justify-end gap-1 md:flex" onClick={stopRowClick}>
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
                      <button type="button" onClick={() => router.push(`/agenda?paciente=${p.id}`)} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" title="Agendar consulta"><Calendar size={15}/></button>
                      <button type="button" onClick={() => router.push(`/proteses?paciente=${p.id}`)} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" title="Nova prótese"><Smile size={15}/></button>
                      <ChevronRight size={16} className="text-neutral-300" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
       ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtrados.map((p: any) => {
            const partes = String(p.nome || '').trim().split(/\s+/);
            const iniciais = ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
            return (
            <div key={p.id} onClick={() => router.push(`/pacientes/${p.id}`)} className={`${card} cursor-pointer p-4 transition-colors hover:bg-[#f8f8f6] sm:p-5`}>
                <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#c8f053] text-sm font-semibold text-neutral-900">{iniciais}</span>
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-neutral-900">{p.nome}</h3>
                        <p className="truncate text-xs font-medium text-neutral-500">{p.nome_clinica || 'Sem clínica'}</p>
                    </div>
                    <div className="flex items-center gap-1" onClick={stopRowClick}>
                        <PatientContactButtons variant="icons" channels={['whatsapp']} telefone={p.telefone} email={p.email} clinicaId={p.clinica_id} evento="pos_consulta" contexto={buildDocumentoContexto({ paciente_nome: p.nome?.split(' ')[0], clinica_nome: p.nome_clinica })} />
                        <button type="button" onClick={() => router.push(`/agenda?paciente=${p.id}`)} className="rounded-full p-2 text-neutral-500 hover:bg-white hover:text-neutral-900" title="Agendar"><Calendar size={16}/></button>
                        <button type="button" onClick={() => router.push(`/proteses?paciente=${p.id}`)} className="rounded-full p-2 text-neutral-500 hover:bg-white hover:text-neutral-900" title="Nova prótese"><Smile size={16}/></button>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-neutral-600"><Phone size={14}/> {p.telefone || 'Sem telefone'}</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-neutral-700">{planoDe(p)}</span>
                        <span className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-neutral-600">{p.status}</span>
                    </div>
                </div>
            </div>
            );
        })}</div>
       )}
    </div>
  );
}