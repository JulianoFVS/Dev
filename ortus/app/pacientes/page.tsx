'use client';
import { useState, useEffect, useRef, cloneElement, type ReactElement, type PointerEvent as ReactPointerEvent } from 'react';
import { dados as tabelas } from '@/lib/local/consulta';
import { Search, Plus, LayoutGrid, List as ListIcon, Phone, ChevronRight, Filter, AlertCircle, Calendar, X, Smile, ArrowUpDown, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePatientActionModal } from '@/components/PatientActionModal';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import { listar, modoDados } from '@/lib/local/cliente';
import CustomSelect from '@/components/ui/CustomSelect';
import Aviso from '@/components/ui/Aviso';
import ModalPedidoProtese from '@/components/proteses/ModalPedidoProtese';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Modal from '@/components/ui/Modal';
import PatientContactButtons from '@/components/PatientContactButtons';
import FotoPaciente from '@/components/FotoPaciente';
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

type AgendamentoResumo = {
  id: number | string;
  paciente_id: string;
  data_hora: string;
  status: string;
};

type TratamentoResumo = {
  id: string;
  paciente_id: string;
  procedimento: string;
  status: string;
};

type ClinicaResumo = { id: string | number; nome: string };

/** Busca linhas de uma tabela para vários pacientes, em lotes aceitos pela API local. */
async function listarPorPacientes<T>(tabela: string, ids: string[], ordem: string): Promise<T[]> {
  const resultado: T[] = [];
  for (let inicio = 0; inicio < ids.length; inicio += 800) {
    const lote = ids.slice(inicio, inicio + 800);
    const linhas = await listar<T>(tabela, {
      filtros: [{ col: 'paciente_id', op: 'in', valor: lote }],
      ordem: [{ col: ordem, asc: false }],
    });
    resultado.push(...linhas);
  }
  return resultado;
}

function DicaAcao({ label, children }: { label: string; children: ReactElement<{ onPointerDown?: (e: ReactPointerEvent) => void }> }) {
  const [visivel, setVisivel] = useState(false);
  return (
    // Em tela de toque o navegador simula o "mouse em cima" depois do toque e a dica ficava presa na tela.
    <span className="relative inline-flex" onMouseEnter={() => setVisivel(window.matchMedia('(hover: hover)').matches)} onMouseLeave={() => setVisivel(false)}>
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

export default function Pacientes() {
  const { activeClinicId, activeClinic, loading: clinicLoading, clinics } = useClinica();

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
  const [folhaFiltros, setFolhaFiltros] = useState(false);
  const [ordenacao, setOrdenacao] = useState<{ campo: 'nome' | 'plano' | 'status'; dir: 'asc' | 'desc' }>({ campo: 'nome', dir: 'asc' });

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
      let cancelado = false;
      (async () => {
          const modo = await modoDados();
          if (cancelado) return;

          if (modo === 'local') {
              // Offline o ClinicaContext pode não resolver a clínica ativa; o SQLite local
              // ainda tem os pacientes e as clínicas de referência para montar a tela.
              const chave = activeClinicId || 'local';
              if (lastClinicRef.current === chave && jaCarregou.current) return;
              const silent = jaCarregou.current;
              lastClinicRef.current = chave;
              carregarDados({ silent });
              return;
          }

          // clinicLoading=true → ainda aguardando; =false → pronto
          if (clinicLoading || !activeClinicId) return;
          if (lastClinicRef.current === activeClinicId && jaCarregou.current) return;
          const silent = jaCarregou.current;
          lastClinicRef.current = activeClinicId;
          carregarDados({ silent });
      })();
      return () => { cancelado = true; };
  }, [clinicLoading, activeClinicId]);

  // Atualiza a lista quando um paciente é criado/alterado em outro lugar (ex.: Quick Capture)
  useEffect(() => {
      function handle() { carregarDados({ silent: true }); }
      window.addEventListener('ortus:paciente-changed', handle);
      return () => window.removeEventListener('ortus:paciente-changed', handle);
  }, []);

  async function carregarPacientesLocal(clinicasAtuais: ClinicaResumo[], idsPermitidos: Array<string | number>) {
    const pacientesBase = await listar<Record<string, unknown>>('pacientes', {
      ordem: [{ col: 'created_at', asc: false }],
    });

    const permitidos = idsPermitidos.length > 0
      ? pacientesBase.filter((p) => p.clinica_id == null || idsPermitidos.some((clinicaId) => String(clinicaId) === String(p.clinica_id)))
      : pacientesBase;

    let clinicasParaFiltro = clinicasAtuais;
    if (clinicasParaFiltro.length === 0) {
      // Tenta a tabela de referência local (quando o espelho já a sincronizou).
      try {
        const clinicasLocais = await listar<ClinicaResumo>('clinicas', { ordem: [{ col: 'nome', asc: true }] });
        if (clinicasLocais.length > 0) {
          clinicasParaFiltro = clinicasLocais.map((clinica) => ({ id: clinica.id, nome: clinica.nome }));
          setClinicas(clinicasParaFiltro);
        }
      } catch {
        /* referência ainda não disponível: segue com os ids locais */
      }
    }
    if (clinicasParaFiltro.length === 0) {
      const idsVistos = new Set<string>();
      clinicasParaFiltro = [];
      for (const paciente of pacientesBase) {
        if (paciente.clinica_id == null) continue;
        const chave = String(paciente.clinica_id);
        if (idsVistos.has(chave)) continue;
        idsVistos.add(chave);
        clinicasParaFiltro.push({ id: paciente.clinica_id as string | number, nome: `Clínica ${chave}` });
      }
      setClinicas(clinicasParaFiltro);
    }

    const idsPacientes = permitidos.map((p) => String(p.id));
    const [agendamentos, tratamentos] = await Promise.all([
      listarPorPacientes<AgendamentoResumo>('agendamentos', idsPacientes, 'data_hora'),
      listarPorPacientes<TratamentoResumo>('paciente_tratamentos', idsPacientes, 'data'),
    ]);

    const agendamentosPorPaciente = new Map<string, AgendamentoResumo[]>();
    for (const agendamento of agendamentos) {
      const chave = String(agendamento.paciente_id);
      const lista = agendamentosPorPaciente.get(chave) || [];
      lista.push(agendamento);
      agendamentosPorPaciente.set(chave, lista);
    }
    for (const lista of agendamentosPorPaciente.values()) {
      lista.sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
    }

    const tratamentosPorPaciente = new Map<string, TratamentoResumo[]>();
    for (const tratamento of tratamentos) {
      const chave = String(tratamento.paciente_id);
      const lista = tratamentosPorPaciente.get(chave) || [];
      lista.push(tratamento);
      tratamentosPorPaciente.set(chave, lista);
    }

    const nomesClinicas = new Map<string, string>();
    for (const clinica of clinicasParaFiltro) nomesClinicas.set(String(clinica.id), clinica.nome);

    const formatados = permitidos.map((p) => {
      const agendamentosPaciente = agendamentosPorPaciente.get(String(p.id)) || [];
      const ultimo = agendamentosPaciente[0];
      const status = ultimo ? (new Date(ultimo.data_hora) > new Date() ? 'agendado' : 'ativo') : 'novo';
      const nomeClinica = p.clinica_id != null ? nomesClinicas.get(String(p.clinica_id)) : undefined;
      return {
        ...p,
        agendamentos: agendamentosPaciente,
        paciente_tratamentos: tratamentosPorPaciente.get(String(p.id)) || [],
        paciente_anamneses: [],
        paciente_documentos: [],
        clinicas: nomeClinica ? { nome: nomeClinica } : null,
        planos: null,
        // Sem a tabela de planos local, sinaliza convênio pelo plano_id para a coluna/ordenação não mentir.
        plano_sem_nome: p.plano_id ? true : undefined,
        status,
        nome_clinica: nomeClinica,
      };
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

  async function carregarDados(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);

    try {
      const modo = await modoDados();

      // 1. Usar clínicas já carregadas pelo ClinicaContext (sem fetch redundante).
      // No modo local a lista vem do cache do contexto: não há round-trip para a nuvem.
      const listaClinicas = clinics.length > 0 ? clinics : modo === 'local' ? [] : await fetchUserClinicas();
      setClinicas(listaClinicas);
      const idsPermitidos = listaClinicas.map((c) => c.id);

      if (modo === 'local') {
        await carregarPacientesLocal(listaClinicas, idsPermitidos);
        jaCarregou.current = true;
        return;
      }

      // 2. Carregar Pacientes restritos às clínicas do usuário
      let pacientesQuery = tabelas.from('pacientes')
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
    } catch (erro) {
      setLoading(false);
      setAviso(erro instanceof Error ? erro.message : 'Não foi possível carregar os pacientes.');
    }
  }

  function novoPaciente() {
      // Quick Capture: abre o modal de cadastro rápido. Se houver filtro de clínica ativo,
      // pré-seleciona-o para o INSERT. Após cadastrar, a UI desliza para o Hub de Ações.
      openQuickCapture(filtroClinica !== 'todas' ? filtroClinica : null);
  }

  function planoDe(p: any) {
      if (!p.planos) return p.plano_sem_nome ? 'Convênio' : 'Particular';
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

  function alternarFiltros() {
    // No celular os filtros abrem numa folha: embutidos, os cinco campos empurravam a lista para fora da tela.
    if (window.matchMedia('(max-width: 767px)').matches) setFolhaFiltros(true);
    else setShowFiltros((atual) => !atual);
  }

  /** Os mesmos campos servem ao painel embutido (computador) e à folha de filtros (celular). */
  function camposFiltro(classeRotulo: string) {
    return (
      <>
        <div className="min-w-0">
          <label className={classeRotulo}>Clínica</label>
          <CustomSelect value={filtroClinica} onChange={setFiltroClinica} options={[{ value: 'todas', label: 'Todas as clínicas' }, ...clinicas.map((c) => ({ value: String(c.id), label: getClinicLabel(c) }))]} size="sm" />
        </div>
        <div className="min-w-0">
          <label className={classeRotulo}>Status</label>
          <CustomSelect value={filtroStatus} onChange={setFiltroStatus} options={[{ value: 'todos', label: 'Todos' }, { value: 'ativo', label: 'Ativo' }, { value: 'agendado', label: 'Agendado' }, { value: 'novo', label: 'Novo' }]} size="sm" />
        </div>
        <div className="min-w-0">
          <label className={classeRotulo}>Sem consulta há</label>
          <CustomSelect value={String(filtroSemConsulta ?? '')} onChange={(v) => setFiltroSemConsulta(v ? Number(v) : null)} options={[{ value: '', label: 'Qualquer período' }, { value: '30', label: '30 dias' }, { value: '60', label: '60 dias' }, { value: '90', label: '90 dias' }, { value: '180', label: '6 meses' }, { value: '365', label: '1 ano' }]} size="sm" />
        </div>
        <div className="min-w-0">
          <label className={classeRotulo}>Procedimento pendente</label>
          <input placeholder="Ex: canal" value={filtroProcedimento} onChange={(e) => setFiltroProcedimento(e.target.value)} className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900" />
        </div>
      </>
    );
  }

  function botaoDebito(tamanho: string) {
    return (
      <button
        type="button"
        onClick={() => setFiltroDebito((atual) => !atual)}
        aria-pressed={filtroDebito}
        className={`inline-flex items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${tamanho} ${filtroDebito ? 'border-red-200 bg-red-50 text-neutral-900' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
      >
        <span className={`flex h-4 w-4 items-center justify-center rounded-md border ${filtroDebito ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
          {filtroDebito && <Check size={11} strokeWidth={3} />}
        </span>
        <AlertCircle size={15} className="text-red-500" />
        Com débito
      </button>
    );
  }

  function limparTudo() {
    limparFiltros();
    setFiltroClinica(clinicaAtivaId);
  }

  const card = 'rounded-xl bg-white';
  const textoVazio = pacientes.length === 0 ? 'Nenhum paciente cadastrado.' : 'Nenhum paciente encontrado com essa busca ou filtro.';
  // Celular: botão com rótulo e 40px de altura. No computador volta a ser o ícone redondo de antes.
  const acaoCartao = 'inline-flex h-10 items-center gap-1.5 rounded-full border border-black/10 px-3 text-sm font-medium text-neutral-700 hover:bg-white hover:text-neutral-900 md:h-auto md:border-0 md:p-2 md:text-neutral-500';

  return (
    <div className="flex w-full flex-col gap-3 px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <Aviso mensagem={aviso} />
      {/* Celular: os filtros abrem numa folha que cabe na tela e a lista continua visível ao fechar. */}
      <Modal
        open={folhaFiltros}
        onClose={() => setFolhaFiltros(false)}
        maxWidth="lg"
        hideCloseButton
        className="max-sm:p-0"
        panelClassName="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh] max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/5 py-2 pl-4 pr-2">
          <h2 className="text-base font-semibold text-neutral-900">Filtros</h2>
          <button type="button" onClick={() => setFolhaFiltros(false)} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
          {camposFiltro('mb-1.5 block text-xs font-medium text-neutral-500')}
          {botaoDebito('h-11 w-full')}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-black/5 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={limparTudo} disabled={!filtrosAtivos} className="inline-flex h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">
            Limpar
          </button>
          <button type="button" onClick={() => setFolhaFiltros(false)} className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800">
            Ver {filtrados.length} {filtrados.length === 1 ? 'paciente' : 'pacientes'}
          </button>
        </div>
      </Modal>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
              Pacientes
              <span className="hidden text-neutral-400 md:inline"> · {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'}</span>
            </h1>
            <p className="mt-1 text-sm text-neutral-500 sm:text-base">{filtrados.length} {filtrados.length === 1 ? 'paciente' : 'pacientes'}</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
              <button onClick={novoPaciente} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:h-10 sm:flex-none"><Plus size={16}/> Novo paciente</button>
          </div>
      </div>

      {/* Celular: a busca fica presa no topo enquanto a lista rola. A faixa na cor do fundo cobre o que passa por trás;
          as margens negativas devolvem o espaço que ela ocupa (por isso a página usa gap, e não space-y, que as anularia). */}
      <div className="sticky top-0 z-20 -mx-2.5 -my-1.5 bg-[#f3f4f1] px-2.5 py-1.5 sm:-mx-3 sm:px-3 md:static md:z-auto md:m-0 md:bg-transparent md:p-0">
      <div className={`${card} flex flex-col gap-2 p-3 sm:p-4`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18}/>
                  <input type="text" placeholder="Buscar nome, CPF ou telefone…" aria-label="Buscar paciente" className="h-10 w-full rounded-md border border-neutral-200 bg-white py-2 pl-10 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>

              <div className="flex shrink-0 items-center gap-2">
              <button onClick={alternarFiltros} className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors md:h-10 md:flex-none ${showFiltros || filtrosAtivos ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'}`}>
                  <Filter size={15}/> Filtros
                  {filtrosAtivos && <span className="h-1.5 w-1.5 rounded-full bg-[#c8f053]"></span>}
              </button>

              {/* Celular: cada lado do alternador tem 40x42px (era 34x34). O trilho perde a folga interna e o ícone ganha uma caixa de 24px. */}
              <SegmentedControl
                  value={(visualizacao === 'cards' ? 'cards' : 'lista') as 'lista' | 'cards'}
                  onChange={(v) => setVisualizacao(v)}
                  className="w-fit shrink-0 max-md:h-11 max-md:p-0"
                  options={[
                      { value: 'lista', label: <span className="flex w-6 justify-center md:w-auto"><ListIcon size={18} /></span>, ariaLabel: 'Lista' },
                      { value: 'cards', label: <span className="flex w-6 justify-center md:w-auto"><LayoutGrid size={18} /></span>, ariaLabel: 'Grade' },
                  ]}
              />
              </div>
          </div>

          {showFiltros && (
              <div className="hidden items-end gap-2 border-t border-black/5 pt-3 md:grid md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_8.5rem_11.5rem_minmax(0,1fr)_auto]">
                  {camposFiltro('mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400')}
                  <div className="flex items-center gap-2">
                  {botaoDebito('h-10 shrink-0')}
                  {filtrosAtivos && (
                      <button onClick={limparTudo} className="inline-flex h-10 shrink-0 items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900"><X size={14}/> Limpar</button>
                  )}
                  </div>
              </div>
          )}
      </div>
      </div>

      {clinicaDivergente && (
          <p className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600">
              O filtro está em outra unidade.
          </p>
      )}

      {/* Sem spinner bloqueante — skeletons inline se não há dados ainda */}
      {loading && !jaCarregou.current ? (
        <div className={`${card} shrink-0 overflow-hidden`}>
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
        <div className={`${card} shrink-0 overflow-hidden`}>
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
            {filtrados.length === 0 && (
              <li className="border-t border-black/[0.05] px-4 py-10 text-center text-sm text-neutral-400">{textoVazio}</li>
            )}
            {filtrados.map((p: any) => {
              const partes = String(p.nome || '').trim().split(/\s+/);
              const iniciais = ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
              const tel = (p.telefone || '').replace(/\D/g, '');
              const telFmt = tel.length >= 11 ? `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7, 11)}` : (p.telefone || 'Sem telefone');
              const plano = p.planos ? (p.planos.tipo === 'particular' ? 'Particular' : p.planos.nome) : (p.plano_sem_nome ? 'Convênio' : 'Particular');
              return (
                <li key={p.id}>
                  <div
                    onClick={(e) => {
                      // O nome é um link de verdade: sem este desvio o toque nele abriria o prontuário duas vezes.
                      if (e.target instanceof Element && e.target.closest('a')) return;
                      router.push(`/pacientes/${p.id}`);
                    }}
                    className="grid cursor-pointer grid-cols-1 items-center gap-2 border-t border-black/[0.05] transition-colors hover:bg-[#f8f8f6] md:grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)_9.5rem] md:px-5 md:py-3"
                  >
                    {/* Celular: a linha inteira é este link (56px no mínimo). No computador ele ocupa só a célula do nome. */}
                    <Link href={`/pacientes/${p.id}`} prefetch={false} className="flex min-h-[56px] min-w-0 items-center gap-2 px-4 py-3 md:min-h-0 md:p-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-3">
                          <FotoPaciente pacienteId={p.id} fotoUrl={p.foto_url} className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f5f5f7] text-[11px] font-semibold text-[#6e6e73]">{iniciais}</FotoPaciente>
                          <div className="min-w-0">
                            <p className="break-words text-[14px] font-medium text-[#1d1d1f] md:truncate">{p.nome}</p>
                            <p className="truncate text-[12px] text-[#aeaeb2]">Paciente · {telFmt}</p>
                          </div>
                        </div>
                        <p className="mt-2 pl-12 text-sm font-medium text-neutral-800 md:hidden">{plano}</p>
                      </div>
                      <ChevronRight size={18} className="shrink-0 text-neutral-300 md:hidden" aria-hidden />
                    </Link>
                    <span className="hidden text-sm font-medium text-neutral-800 md:block">{plano}</span>
                    <span className="hidden text-sm capitalize text-neutral-800 md:block">{p.status}</span>
                    <div className="hidden items-center justify-end gap-1 md:flex" onClick={stopRowClick}>
                      <PatientContactButtons
                        variant="icons"
                        channels={['whatsapp']}
                        telefone={p.telefone}
                        email={p.email}
                        nome={p.nome}
                        pacienteId={p.id}
                        clinicaId={p.clinica_id}
                        evento="pos_consulta"
                        contexto={buildDocumentoContexto({
                          paciente_nome: p.nome?.split(' ')[0],
                          clinica_nome: p.nome_clinica,
                        })}
                      />
                      <DicaAcao label="Agendar consulta"><button type="button" aria-label="Agendar consulta" onClick={() => window.dispatchEvent(new CustomEvent('ortus:novo-agendamento', { detail: { pacienteId: String(p.id), pacienteNome: p.nome, clinicaId: p.clinica_id ? String(p.clinica_id) : undefined } }))} className="alvo-toque rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"><Calendar size={15}/></button></DicaAcao>
                      <DicaAcao label="Nova prótese"><button type="button" aria-label="Nova prótese" onClick={() => abrirProtese(p)} className="alvo-toque rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"><Smile size={15}/></button></DicaAcao>
                      <ChevronRight size={16} className="text-neutral-300" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
       ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.length === 0 && (
            <p className={`${card} col-span-full px-4 py-10 text-center text-sm text-neutral-400`}>{textoVazio}</p>
          )}
          {filtrados.map((p: any) => {
            const partes = String(p.nome || '').trim().split(/\s+/);
            const iniciais = ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
            return (
            // Celular: o cartão é uma grade de duas colunas e as ações descem para o pé (order-last), com rótulo e 40px.
            // No topo, ao lado do nome, elas deixavam 141px para ele. No computador a grade repete a linha de antes.
            <div key={p.id} onClick={() => router.push(`/pacientes/${p.id}`)} className={`${card} grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 p-4 transition-colors hover:bg-[#f8f8f6] sm:p-5 md:grid-cols-[auto_minmax(0,1fr)_auto]`}>
                <FotoPaciente pacienteId={p.id} fotoUrl={p.foto_url} className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-100 text-sm font-semibold text-neutral-900">{iniciais}</FotoPaciente>
                <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold text-neutral-900 md:truncate">{p.nome}</h3>
                    <p className="truncate text-xs font-medium text-neutral-500">{p.nome_clinica || 'Sem clínica'}</p>
                </div>
                <div className="order-last col-span-2 mt-3 flex items-center gap-2 border-t border-black/5 pt-3 md:order-none md:col-span-1 md:mt-0 md:gap-1 md:border-0 md:pt-0" onClick={stopRowClick}>
                    {/* O botão do WhatsApp tem 38px no componente; a folga extra leva a 40px só no celular. */}
                    <PatientContactButtons variant="icons" channels={['whatsapp']} className="max-md:[&_button]:p-[11px]" telefone={p.telefone} email={p.email} nome={p.nome} pacienteId={p.id} clinicaId={p.clinica_id} evento="pos_consulta" contexto={buildDocumentoContexto({ paciente_nome: p.nome?.split(' ')[0], clinica_nome: p.nome_clinica })} />
                    <DicaAcao label="Agendar consulta"><button type="button" aria-label="Agendar consulta" onClick={() => window.dispatchEvent(new CustomEvent('ortus:novo-agendamento', { detail: { pacienteId: String(p.id), pacienteNome: p.nome, clinicaId: p.clinica_id ? String(p.clinica_id) : undefined } }))} className={acaoCartao}><Calendar size={16}/><span className="md:hidden">Agendar</span></button></DicaAcao>
                    <DicaAcao label="Nova prótese"><button type="button" aria-label="Nova prótese" onClick={() => abrirProtese(p)} className={acaoCartao}><Smile size={16}/><span className="md:hidden">Prótese</span></button></DicaAcao>
                </div>
                <div className="col-span-2 mt-4 space-y-2 md:col-span-3">
                    <div className="flex items-center gap-2 text-sm text-neutral-600"><Phone size={14}/> {p.telefone || 'Sem telefone'}</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">{planoDe(p)}</span>
                        <span className="rounded-md border border-neutral-200 px-2 py-0.5 text-xs font-medium capitalize text-neutral-600">{p.status}</span>
                    </div>
                </div>
            </div>
            );
          })}
        </div>
       )}
    </div>
  );
}