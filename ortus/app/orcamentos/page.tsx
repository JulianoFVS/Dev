'use client';

/**
 * Orçamentos: lista, funil dos que não foram para a frente e funil de
 * oportunidades (avaliação sem orçamento, falta ou cancelamento sem retorno,
 * orçamento parado sem contato).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Plus, Search } from 'lucide-react';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import CustomSelect from '@/components/ui/CustomSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import EditorOrcamento from '@/components/orcamentos/EditorOrcamento';
import DetalheOrcamento, { mensagemDoOrcamento } from '@/components/orcamentos/DetalheOrcamento';
import ContatoRapido from '@/components/orcamentos/ContatoRapido';
import ModalContato from '@/components/orcamentos/ModalContato';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { fetchUserEquipe, type ProfissionalEquipe } from '@/lib/clinicScoped';
import { listarOrcamentos } from '@/lib/db/orcamentos';
import { carregarOportunidades, ROTULO_OPORTUNIDADE, type Oportunidade, type TipoOportunidade } from '@/lib/funil';
import {
  COR_STATUS_ORCAMENTO,
  ROTULO_STATUS_ORCAMENTO,
  STATUS_EM_ANDAMENTO,
  diasParado,
  formatarDia,
  formatarDinheiro,
  ligarHoje,
  primeiroNome,
  somarDias,
  statusEfetivo,
  telefoneDoPaciente,
  type MotivoContato,
  type Orcamento,
  type OrcamentoItem,
  type StatusOrcamento,
} from '@/lib/orcamentos';
import { hojeNoFuso } from '@/lib/fuso';
import { useMeuProfissionalId } from '@/lib/meuProfissional';

type Aba = 'funil' | 'lista' | 'oportunidades';

const CACHE_KEY = 'ortus:orcamentos:v1';
const COLUNAS_FUNIL: StatusOrcamento[] = ['rascunho', 'enviado', 'em_aberto'];
const ORDEM_OPORTUNIDADE: TipoOportunidade[] = ['orcamento_parado', 'avaliacao_sem_orcamento', 'faltou_sem_retorno', 'cancelou_sem_retorno'];

type Snapshot = { orcamentos: Orcamento[] };

function mensagemDaOportunidade(op: Oportunidade, clinicaNome: string | null): string {
  const nome = primeiroNome(op.paciente.nome);
  const ola = `Olá${nome ? `, ${nome}` : ''}! Aqui é da ${clinicaNome || 'clínica'}.`;
  if (op.tipo === 'orcamento_parado' && op.orcamento) return mensagemDoOrcamento(op.orcamento, clinicaNome);
  if (op.tipo === 'avaliacao_sem_orcamento') return `${ola} Como você está depois da avaliação? Podemos preparar o seu plano de tratamento e o orçamento?`;
  if (op.tipo === 'faltou_sem_retorno') return `${ola} Sentimos sua falta na última consulta. Vamos marcar um novo horário?`;
  return `${ola} Vimos que a sua consulta foi cancelada. Quer marcar um novo horário?`;
}

function motivoDaOportunidade(tipo: TipoOportunidade): MotivoContato {
  return tipo === 'orcamento_parado' ? 'orcamento' : tipo;
}

export default function OrcamentosPage() {
  const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
  const { showAlert } = useCustomAlert();
  const { openPatient } = usePatientSlideOver();
  const meuId = useMeuProfissionalId();

  const [aba, setAba] = useState<Aba>('funil');
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(() => readRouteCache<Snapshot>(CACHE_KEY, clinicScope(activeClinicId))?.orcamentos ?? []);
  const [carregando, setCarregando] = useState(orcamentos.length === 0);
  const [oportunidades, setOportunidades] = useState<Oportunidade[] | null>(null);
  const [equipe, setEquipe] = useState<ProfissionalEquipe[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroPessoa, setFiltroPessoa] = useState<string>('todos');
  const [soLigarHoje, setSoLigarHoje] = useState(false);
  const [colunaMobile, setColunaMobile] = useState<StatusOrcamento>('enviado');

  const [editor, setEditor] = useState<{ orcamento: Orcamento | null; itens: OrcamentoItem[]; paciente: { id: string; nome: string } | null; clinicaId: number | null } | null>(null);
  const [aberto, setAberto] = useState<Orcamento | null>(null);
  const [contato, setContato] = useState<{ op: Oportunidade; canal: 'ligacao' | 'whatsapp' } | null>(null);
  const geracao = useRef(0);

  const clinicaFixa = activeClinicId && activeClinicId !== 'all' ? Number(activeClinicId) : null;
  const clinicaIds = useMemo(() => {
    if (clinicaFixa) return [clinicaFixa];
    return clinics.map((c) => Number(c.id)).filter(Number.isFinite);
  }, [clinicaFixa, clinics]);
  const clinicasOpcoes = useMemo(() => clinics.map((c) => ({ id: Number(c.id), nome: c.nome })), [clinics]);
  const clinicaNome = activeClinic && activeClinic.id !== 'all' ? activeClinic.nome : null;
  const hoje = hojeNoFuso();

  const carregar = useCallback(async () => {
    if (clinicaIds.length === 0) return;
    const minha = ++geracao.current;
    try {
      const desde = `${somarDias(hoje, -365)}T00:00:00`;
      const [recentes, andamento] = await Promise.all([
        listarOrcamentos({ clinicaIds, desde }),
        listarOrcamentos({ clinicaIds, status: STATUS_EM_ANDAMENTO }),
      ]);
      if (minha !== geracao.current) return;
      const mapa = new Map<string, Orcamento>();
      for (const o of [...recentes, ...andamento]) mapa.set(o.id, o);
      const lista = Array.from(mapa.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
      setOrcamentos(lista);
      // O orçamento aberto no detalhe passa a mostrar o status novo.
      setAberto((atual) => (atual ? mapa.get(atual.id) ?? atual : atual));
      writeRouteCache<Snapshot>(CACHE_KEY, clinicScope(activeClinicId), { orcamentos: lista });
    } catch (e) {
      if (minha === geracao.current) {
        void showAlert(`Não foi possível carregar os orçamentos: ${e instanceof Error ? e.message : 'erro desconhecido'}`, { type: 'error' });
      }
    } finally {
      if (minha === geracao.current) setCarregando(false);
    }
    try {
      const ops = await carregarOportunidades({ clinicaIds, hoje });
      if (minha === geracao.current) setOportunidades(ops);
    } catch {
      if (minha === geracao.current) setOportunidades([]);
    }
  }, [clinicaIds, activeClinicId, hoje, showAlert]);

  useEffect(() => {
    if (clinicLoading || !activeClinicId) return;
    const snap = readRouteCache<Snapshot>(CACHE_KEY, clinicScope(activeClinicId));
    setOrcamentos(snap?.orcamentos ?? []);
    setCarregando(!snap);
    setOportunidades(null);
    void carregar();
  }, [clinicLoading, activeClinicId, carregar]);

  useEffect(() => {
    void fetchUserEquipe().then(setEquipe).catch(() => setEquipe([]));
  }, []);

  const nomeDe = useCallback((id: number | null) => (id == null ? null : equipe.find((p) => Number(p.id) === id)?.nome ?? null), [equipe]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return orcamentos.filter((o) => {
      if (termo && !String(o.pacientes?.nome || '').toLowerCase().includes(termo)) return false;
      if (filtroPessoa !== 'todos' && String(o.profissional_id) !== filtroPessoa && String(o.comercial_id) !== filtroPessoa) return false;
      return true;
    });
  }, [orcamentos, busca, filtroPessoa]);

  const kpis = useMemo(() => {
    const inicioMes = `${hoje.slice(0, 7)}-01`;
    let andamento = 0;
    let valorAndamento = 0;
    let ligar = 0;
    let aprovadosMes = 0;
    let valorAprovadoMes = 0;
    let decididosMes = 0;
    for (const o of orcamentos) {
      const s = statusEfetivo(o, hoje);
      if (STATUS_EM_ANDAMENTO.includes(s)) { andamento += 1; valorAndamento += o.valor_total; }
      if (ligarHoje(o, hoje)) ligar += 1;
      if (o.aprovado_em && o.aprovado_em.slice(0, 10) >= inicioMes) { aprovadosMes += 1; valorAprovadoMes += o.valor_total; }
      const decisao = o.aprovado_em || o.recusado_em;
      if (decisao && decisao.slice(0, 10) >= inicioMes && (s === 'aprovado' || s === 'recusado')) decididosMes += 1;
    }
    return {
      andamento, valorAndamento, ligar, aprovadosMes, valorAprovadoMes,
      conversao: decididosMes > 0 ? Math.round((aprovadosMes / decididosMes) * 100) : null,
    };
  }, [orcamentos, hoje]);

  const opcoesPessoa = useMemo(() => {
    const ids = new Set<number>();
    for (const o of orcamentos) {
      if (o.profissional_id != null) ids.add(o.profissional_id);
      if (o.comercial_id != null) ids.add(o.comercial_id);
    }
    return [{ value: 'todos', label: 'Toda a equipe' }, ...Array.from(ids).map((id) => ({ value: String(id), label: nomeDe(id) || `Profissional ${id}` }))];
  }, [orcamentos, nomeDe]);

  function abrirNovo(paciente: { id: string; nome: string } | null = null, clinicaId: number | null = clinicaFixa) {
    setEditor({ orcamento: null, itens: [], paciente, clinicaId });
  }

  const totalOportunidades = oportunidades?.length ?? 0;

  const cartaoOrcamento = (o: Orcamento) => {
    const s = statusEfetivo(o, hoje);
    const dias = diasParado(o);
    const ligar = ligarHoje(o, hoje);
    return (
      <div
        key={o.id}
        role="button"
        tabIndex={0}
        onClick={() => setAberto(o)}
        onKeyDown={(e) => { if (e.key === 'Enter') setAberto(o); }}
        className="flex cursor-pointer flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-left hover:border-neutral-300"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-neutral-900">{o.pacientes?.nome || 'Paciente'}</p>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">{formatarDinheiro(o.valor_total)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span>{telefoneDoPaciente(o.pacientes) || 'sem telefone'}</span>
          <span>parado há {dias} {dias === 1 ? 'dia' : 'dias'}</span>
          {s === 'expirado' && <span className="text-neutral-400">vencido</span>}
          {o.proximo_contato && (
            <span className={ligar ? 'font-medium text-amber-700' : ''}>
              <CalendarClock size={12} className="mr-0.5 inline" />
              {ligar ? 'ligar hoje' : `ligar em ${formatarDia(o.proximo_contato)}`}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-neutral-400">{nomeDe(o.comercial_id) || nomeDe(o.profissional_id) || ''}</span>
          <ContatoRapido
            compacto
            telefone={telefoneDoPaciente(o.pacientes)}
            nome={o.pacientes?.nome}
            pacienteId={o.paciente_id}
            clinicaId={o.clinica_id}
            mensagem={mensagemDoOrcamento(o, clinicaNome)}
          />
        </div>
      </div>
    );
  };

  const funil = () => {
    const doFunil = filtrados.filter((o) => STATUS_EM_ANDAMENTO.includes(statusEfetivo(o, hoje)) && (!soLigarHoje || ligarHoje(o, hoje)));
    const coluna = (status: StatusOrcamento) => {
      const lista = doFunil.filter((o) => statusEfetivo(o, hoje) === status).sort((a, b) => diasParado(b) - diasParado(a));
      const soma = lista.reduce((t, o) => t + o.valor_total, 0);
      return (
        <div key={status} className={`min-h-0 flex-col rounded-xl bg-neutral-50 p-2 ${colunaMobile === status ? 'flex' : 'hidden'} lg:flex`}>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-neutral-900">{ROTULO_STATUS_ORCAMENTO[status]} <span className="font-normal text-neutral-400">· {lista.length}</span></p>
            <p className="text-xs tabular-nums text-neutral-500">{formatarDinheiro(soma)}</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-1">
            {lista.length === 0 ? <p className="px-1 py-6 text-center text-xs text-neutral-400">Nada aqui.</p> : lista.map(cartaoOrcamento)}
          </div>
        </div>
      );
    };
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="lg:hidden">
          <SegmentedControl
            value={colunaMobile}
            onChange={setColunaMobile}
            options={COLUNAS_FUNIL.map((s) => ({ value: s, label: ROTULO_STATUS_ORCAMENTO[s] }))}
            size="sm"
          />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">{COLUNAS_FUNIL.map(coluna)}</div>
      </div>
    );
  };

  const lista = () => {
    const linhas = filtrados.filter((o) => filtroStatus === 'todos' || statusEfetivo(o, hoje) === filtroStatus);
    if (!carregando && linhas.length === 0) {
      return <p className="py-10 text-center text-sm text-neutral-500">Nenhum orçamento encontrado.</p>;
    }
    return (
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white">
        <table className="hidden w-full text-sm md:table">
          <thead className="sticky top-0 bg-white text-left text-xs font-medium text-neutral-500">
            <tr className="border-b border-neutral-100">
              <th className="px-4 py-2.5">Paciente</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Valor</th>
              <th className="px-4 py-2.5">Validade</th>
              <th className="px-4 py-2.5">Profissional</th>
              <th className="px-4 py-2.5">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((o) => {
              const s = statusEfetivo(o, hoje);
              return (
                <tr key={o.id} onClick={() => setAberto(o)} className="cursor-pointer border-b border-neutral-50 hover:bg-neutral-50">
                  <td className="max-w-[16rem] truncate px-4 py-2.5 text-neutral-900">{o.pacientes?.nome || 'Paciente'}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_STATUS_ORCAMENTO[s]}`}>{ROTULO_STATUS_ORCAMENTO[s]}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-900">{formatarDinheiro(o.valor_total)}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{formatarDia(o.validade)}</td>
                  <td className="max-w-[12rem] truncate px-4 py-2.5 text-neutral-600">{nomeDe(o.profissional_id) || '—'}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{formatarDia(o.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul className="divide-y divide-neutral-100 md:hidden">
          {linhas.map((o) => {
            const s = statusEfetivo(o, hoje);
            return (
              <li key={o.id}>
                <button type="button" onClick={() => setAberto(o)} className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-neutral-900">{o.pacientes?.nome || 'Paciente'}</span>
                    <span className="text-xs text-neutral-500">{formatarDia(o.created_at)} · <span className={`rounded-full px-1.5 py-0.5 ${COR_STATUS_ORCAMENTO[s]}`}>{ROTULO_STATUS_ORCAMENTO[s]}</span></span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-neutral-900">{formatarDinheiro(o.valor_total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const painelOportunidades = () => {
    if (oportunidades === null) return <div className="h-32 animate-pulse rounded-xl bg-neutral-100" />;
    const termo = busca.trim().toLowerCase();
    const vis = oportunidades.filter((op) => !termo || String(op.paciente.nome || '').toLowerCase().includes(termo));
    if (vis.length === 0) {
      return <p className="py-10 text-center text-sm text-neutral-500">Nenhuma oportunidade parada agora. Bom trabalho!</p>;
    }
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 pb-2">
          {ORDEM_OPORTUNIDADE.map((tipo) => {
            const doTipo = vis.filter((op) => op.tipo === tipo);
            if (doTipo.length === 0) return null;
            return (
              <section key={tipo}>
                <h2 className="mb-2 text-base font-semibold text-neutral-900">{ROTULO_OPORTUNIDADE[tipo]} <span className="font-normal text-neutral-400">· {doTipo.length}</span></h2>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {doTipo.map((op) => (
                    <div key={op.chave} className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => openPatient(op.paciente.id)} className="min-w-0 truncate text-left text-sm font-medium text-neutral-900 hover:underline">
                          {op.paciente.nome || 'Paciente'}
                        </button>
                        {op.valor != null && <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">{formatarDinheiro(op.valor)}</span>}
                      </div>
                      <p className="text-xs text-neutral-500">
                        {telefoneDoPaciente(op.paciente) || 'sem telefone'} · há {op.dias} {op.dias === 1 ? 'dia' : 'dias'}
                        {op.procedimento ? ` · ${op.procedimento}` : ''}
                      </p>
                      {op.ultimoContato?.resumo && <p className="line-clamp-2 text-xs text-neutral-600">Último contato: {op.ultimoContato.resumo}</p>}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <ContatoRapido
                          compacto
                          telefone={telefoneDoPaciente(op.paciente)}
                          nome={op.paciente.nome}
                          pacienteId={op.paciente.id}
                          clinicaId={op.clinica_id}
                          mensagem={mensagemDaOportunidade(op, clinicaNome)}
                          onContato={(canal) => setContato({ op, canal })}
                        />
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => setContato({ op, canal: 'ligacao' })} className="inline-flex h-11 items-center rounded-md px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 sm:h-8">Registrar contato</button>
                          {op.orcamento ? (
                            <button type="button" onClick={() => setAberto(op.orcamento)} className="inline-flex h-11 items-center rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800 sm:h-8">Abrir orçamento</button>
                          ) : (
                            <button type="button" onClick={() => abrirNovo({ id: op.paciente.id, nome: op.paciente.nome || 'Paciente' }, op.clinica_id)} className="inline-flex h-11 items-center rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800 sm:h-8">Criar orçamento</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="mb-3 shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
              Orçamentos
              <span className="hidden text-neutral-400 md:inline"> · {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'}</span>
            </h1>
            <p className="mt-1 text-sm text-neutral-500 sm:text-base">Funil comercial e pacientes para chamar de volta.</p>
          </div>
          <button type="button" onClick={() => abrirNovo()} className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-10">
            <Plus size={14} /> Novo orçamento
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          <p className="text-sm text-neutral-500"><span className="font-medium tabular-nums text-neutral-900">{carregando ? '—' : kpis.andamento}</span> em andamento · {carregando ? '—' : formatarDinheiro(kpis.valorAndamento)}</p>
          <p className="text-sm text-neutral-500"><span className={`font-medium tabular-nums ${kpis.ligar > 0 ? 'text-amber-700' : 'text-neutral-900'}`}>{carregando ? '—' : kpis.ligar}</span> para ligar hoje</p>
          <p className="text-sm text-neutral-500"><span className="font-medium tabular-nums text-neutral-900">{carregando ? '—' : formatarDinheiro(kpis.valorAprovadoMes)}</span> aprovados no mês</p>
          <p className="hidden text-sm text-neutral-500 sm:block"><span className="font-medium tabular-nums text-neutral-900">{kpis.conversao == null ? '—' : `${kpis.conversao}%`}</span> de conversão no mês</p>
        </div>
      </div>

      <div className="mb-3 flex shrink-0 flex-col gap-2 lg:flex-row lg:items-center">
        <SegmentedControl
          value={aba}
          onChange={setAba}
          options={[
            { value: 'funil', label: 'Funil' },
            { value: 'lista', label: 'Lista' },
            {
              value: 'oportunidades',
              ariaLabel: `Oportunidades: ${totalOportunidades}`,
              label: (
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  Oportunidades
                  {totalOportunidades > 0 && (
                    <span className="rounded-full bg-[#c8f053] px-1.5 text-[10px] font-bold tabular-nums leading-4 text-neutral-900">{totalOportunidades}</span>
                  )}
                </span>
              ),
            },
          ]}
          size="md"
          className="lg:w-[25rem]"
        />
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            type="text"
            placeholder="Buscar paciente..."
            className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {aba !== 'oportunidades' && (
          <div className="grid shrink-0 grid-cols-2 gap-2 lg:w-[26rem]">
            <CustomSelect value={filtroPessoa} onChange={setFiltroPessoa} options={opcoesPessoa} size="md" />
            {aba === 'lista' ? (
              <CustomSelect
                value={filtroStatus}
                onChange={setFiltroStatus}
                options={[{ value: 'todos', label: 'Todos os status' }, ...(['rascunho', 'enviado', 'em_aberto', 'aprovado', 'recusado', 'expirado'] as StatusOrcamento[]).map((s) => ({ value: s, label: ROTULO_STATUS_ORCAMENTO[s] }))]}
                size="md"
              />
            ) : (
              <button
                type="button"
                onClick={() => setSoLigarHoje((v) => !v)}
                className={`inline-flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium ${soLigarHoje ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
              >
                Só ligar hoje
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {carregando && orcamentos.length === 0 && aba !== 'oportunidades' ? (
          <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-neutral-100" />)}
          </div>
        ) : aba === 'funil' ? funil() : aba === 'lista' ? lista() : painelOportunidades()}
      </div>

      <EditorOrcamento
        open={editor !== null}
        onClose={() => setEditor(null)}
        clinicaId={editor?.clinicaId ?? null}
        clinicas={clinicasOpcoes}
        paciente={editor?.paciente ?? null}
        orcamento={editor?.orcamento ?? null}
        itens={editor?.itens ?? []}
        equipe={equipe}
        meuProfissionalId={meuId}
        onSalvo={(orc) => { void carregar(); setAberto(orc); }}
      />

      <DetalheOrcamento
        open={aberto !== null}
        onClose={() => setAberto(null)}
        orcamento={aberto}
        equipe={equipe}
        clinicaNome={clinicaNome}
        meuProfissionalId={meuId}
        onEditar={(orc, itens) => { setAberto(null); setEditor({ orcamento: orc, itens, paciente: null, clinicaId: orc.clinica_id }); }}
        onMudou={() => { void carregar(); }}
      />

      {contato && (
        <ModalContato
          open
          onClose={() => setContato(null)}
          clinicaId={contato.op.clinica_id}
          pacienteId={contato.op.paciente.id}
          pacienteNome={contato.op.paciente.nome}
          orcamentoId={contato.op.orcamento?.id ?? null}
          motivo={motivoDaOportunidade(contato.op.tipo)}
          canalInicial={contato.canal}
          feitoPor={meuId}
          onSalvo={() => { void carregar(); }}
        />
      )}
    </div>
  );
}
