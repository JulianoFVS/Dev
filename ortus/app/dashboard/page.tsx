'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
import { carregarConfig } from '@/lib/configClinica';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import {
  ArrowUpRight,
  Check,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react';

type AgendaItem = {
  id: string;
  data_hora: string;
  procedimento?: string | null;
  status?: string | null;
  valor_final?: number | null;
  observacoes?: string | null;
  profissional_id?: string | number | null;
  pacientes?: {
    id?: string;
    nome?: string;
    telefone?: string | null;
    data_nascimento?: string | null;
    ficha_medica?: any;
    planos?: { nome?: string; tipo?: string } | null;
  } | null;
};

type Tratamento = { id: string; procedimento: string; status: string; observacoes?: string | null };
type Pendencia = { id: string; titulo: string; detalhe: string; href: string };
type Periodo = 'hoje' | 'semana' | 'mes';
type FilaLinha =
  | { tipo: 'consulta'; id: string; ag: AgendaItem; cadeira: number }
  | { tipo: 'livre'; id: string; inicio: string };

type Financeiro = {
  recebido: number;
  pagamentos: number;
  previsto: number;
  restantes: number;
  atraso: number;
  atrasados: number;
};

const FIN_VAZIO: Financeiro = { recebido: 0, pagamentos: 0, previsto: 0, restantes: 0, atraso: 0, atrasados: 0 };

function iniciais(nome?: string | null) {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '—';
}

function idade(nasc?: string | null) {
  if (!nasc) return null;
  const d = new Date(nasc + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  let n = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) n -= 1;
  return n;
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function alergiaDe(ficha: any) {
  if (!ficha) return 'Não informado';
  if (typeof ficha.alergia === 'string' && ficha.alergia.trim()) return ficha.alergia;
  if (typeof ficha.alergias === 'string' && ficha.alergias.trim()) return ficha.alergias;
  if (Array.isArray(ficha.alergias) && ficha.alergias.length) return ficha.alergias.join(', ');
  if (ficha['Alergia Antibiótico']) return 'Alergia a antibiótico';
  if (ficha['Alergia Anestésico']) return 'Alergia a anestésico';
  return 'Nenhuma registrada';
}

function planoNome(planos?: { nome?: string; tipo?: string } | null) {
  if (!planos) return 'Particular';
  if (planos.tipo === 'particular') return 'Particular';
  return planos.nome || 'Particular';
}

function abrirBusca() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
}

function parseHora(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fmtMinutos(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function inicioDoPeriodo(periodo: Periodo) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (periodo === 'semana') {
    const dia = d.getDay();
    const delta = dia === 0 ? 6 : dia - 1;
    d.setDate(d.getDate() - delta);
  } else if (periodo === 'mes') {
    d.setDate(1);
  }
  return d;
}

function cadeiraDe(ag: AgendaItem, mapa: Map<string, number>) {
  const key = ag.profissional_id != null ? String(ag.profissional_id) : 'sem';
  return mapa.get(key) || 1;
}

function montarMapaCadeiras(lista: AgendaItem[]) {
  const mapa = new Map<string, number>();
  lista.forEach((ag) => {
    const key = ag.profissional_id != null ? String(ag.profissional_id) : 'sem';
    if (!mapa.has(key)) mapa.set(key, mapa.size + 1);
  });
  if (!mapa.size) mapa.set('sem', 1);
  return mapa;
}

function montarFila(
  lista: AgendaItem[],
  duracaoMin: number,
  abertura: string,
  fechamento: string,
  cadeiras: Map<string, number>,
): FilaLinha[] {
  const linhas: FilaLinha[] = [];
  const ab = parseHora(abertura);
  const fe = parseHora(fechamento);
  const ordenada = [...lista].sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());

  const minutosDe = (iso: string) => {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  };

  let cursor = ab;
  ordenada.forEach((ag, i) => {
    const ini = minutosDe(ag.data_hora);
    if (ini - cursor >= duracaoMin) {
      linhas.push({ tipo: 'livre', id: `livre-${cursor}-${i}`, inicio: fmtMinutos(cursor) });
    }
    linhas.push({ tipo: 'consulta', id: ag.id, ag, cadeira: cadeiraDe(ag, cadeiras) });
    cursor = Math.max(cursor, ini + duracaoMin);
  });
  if (fe - cursor >= duracaoMin) {
    linhas.push({ tipo: 'livre', id: `livre-fim`, inicio: fmtMinutos(cursor) });
  }
  return linhas;
}

function somarFinanceiro(
  lista: { data_hora: string; status?: string | null; valor_final?: number | null }[],
  fiados: { valor_final?: number | null }[],
  agora = Date.now(),
): { fin: Financeiro; barras: { rotulo: string; valor: number }[] } {
  const validos = lista.filter((a) => a.status !== 'cancelado');
  const concluidos = validos.filter((a) => a.status === 'concluido');
  const futuros = validos.filter((a) => a.status !== 'concluido' && new Date(a.data_hora).getTime() >= agora);
  return {
    fin: {
      recebido: concluidos.reduce((acc, a) => acc + (a.valor_final || 0), 0),
      pagamentos: concluidos.length,
      previsto: futuros.reduce((acc, a) => acc + (a.valor_final || 0), 0),
      restantes: futuros.length,
      atraso: fiados.reduce((acc, a) => acc + (a.valor_final || 0), 0),
      atrasados: fiados.length,
    },
    barras: [],
  };
}

function barrasHora(lista: AgendaItem[]) {
  const mapa = new Map<number, number>();
  for (let h = 8; h <= 18; h += 1) mapa.set(h, 0);
  lista.filter((a) => a.status === 'concluido').forEach((a) => {
    const h = new Date(a.data_hora).getHours();
    if (mapa.has(h)) mapa.set(h, (mapa.get(h) || 0) + (a.valor_final || 0));
  });
  return Array.from(mapa.entries()).map(([h, valor]) => ({
    rotulo: String(h).padStart(2, '0'),
    valor,
  }));
}

function barrasDia(lista: { data_hora: string; status?: string | null; valor_final?: number | null }[], dias: Date[]) {
  return dias.map((d) => {
    const chave = d.toISOString().split('T')[0];
    const valor = lista
      .filter((a) => a.status === 'concluido' && a.data_hora.slice(0, 10) === chave)
      .reduce((acc, a) => acc + (a.valor_final || 0), 0);
    return {
      rotulo: d.toLocaleDateString('pt-BR', { weekday: 'narrow' }),
      valor,
    };
  });
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [agendaHoje, setAgendaHoje] = useState<AgendaItem[]>([]);
  const [tratamentos, setTratamentos] = useState<Tratamento[]>([]);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [ultimaVisita, setUltimaVisita] = useState<string | null>(null);
  const [saldoAberto, setSaldoAberto] = useState(0);
  const [financeiro, setFinanceiro] = useState<Financeiro>(FIN_VAZIO);
  const [barras, setBarras] = useState<{ rotulo: string; valor: number }[]>([]);
  const [concluindo, setConcluindo] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [duracaoMin, setDuracaoMin] = useState(40);
  const [abertura, setAbertura] = useState('08:00');
  const [fechamento, setFechamento] = useState('18:00');
  const [fiados, setFiados] = useState<{ id: string; valor_final?: number | null; pacientes?: { id?: string; nome?: string } | null }[]>([]);
  const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
  const { openPatient } = usePatientSlideOver();
  const jaCarregou = useRef(false);
  const reqId = useRef(0);

  const idsClinica = useMemo(() => {
    if (activeClinicId && activeClinicId !== 'all') return [Number(activeClinicId)];
    return clinics.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
  }, [activeClinicId, clinics]);

  useEffect(() => {
    if (clinicLoading) return;
    carregar({ silent: jaCarregou.current });
    // idsClinica cobre a troca de clínica
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicLoading, activeClinicId, idsClinica.join(',')]);

  useEffect(() => {
    if (!jaCarregou.current) return;
    if (periodo === 'hoje') {
      aplicarFinanceiroHoje(agendaHoje, fiados);
      return;
    }
    carregarPeriodo(periodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  function aplicarFinanceiroHoje(
    hojeLista: AgendaItem[],
    listaFiados: { valor_final?: number | null }[],
  ) {
    const { fin } = somarFinanceiro(hojeLista, listaFiados);
    setFinanceiro(fin);
    setBarras(barrasHora(hojeLista));
  }

  async function carregar(opts?: { silent?: boolean }) {
    const id = ++reqId.current;
    if (!opts?.silent) setLoading(true);

    const filtros = idsClinica;
    if (filtros.length === 0) {
      if (id === reqId.current) {
        setAgendaHoje([]);
        setPendencias([]);
        setFinanceiro(FIN_VAZIO);
        setLoading(false);
        jaCarregou.current = true;
      }
      return;
    }

    const hoje = new Date().toISOString().split('T')[0];
    const agora = new Date();
    const prefClinica = filtros[0];

    const [agendaRes, fiadosRes, prefs] = await Promise.all([
      supabase
        .from('agendamentos')
        .select('id, data_hora, procedimento, status, valor_final, observacoes, profissional_id, pacientes(id, nome, telefone, data_nascimento, ficha_medica, planos(nome, tipo))')
        .gte('data_hora', `${hoje}T00:00:00`)
        .lte('data_hora', `${hoje}T23:59:59`)
        .in('clinica_id', filtros)
        .order('data_hora', { ascending: true }),
      supabase
        .from('agendamentos')
        .select('id, valor_final, data_hora, pacientes(id, nome)')
        .eq('status', 'fiado')
        .in('clinica_id', filtros)
        .limit(8),
      carregarConfig(prefClinica, 'preferencias', 'ortus_preferencias', {
        duracao_consulta_padrao: 40,
        horario_abertura: '08:00',
        horario_fechamento: '18:00',
      }),
    ]);

    if (id !== reqId.current) return;

    const hojeLista = ((agendaRes.data as AgendaItem[]) || []).filter((a) => a.status !== 'cancelado');
    const listaFiados = (fiadosRes.data || []) as typeof fiados;
    setAgendaHoje(hojeLista);
    setFiados(listaFiados);
    setDuracaoMin(Number(prefs?.duracao_consulta_padrao) || 40);
    setAbertura(prefs?.horario_abertura || '08:00');
    setFechamento(prefs?.horario_fechamento || '18:00');

    const atuais = hojeLista.filter((a) => a.status !== 'concluido');
    const emCurso = atuais.find((a) => new Date(a.data_hora).getTime() <= agora.getTime()) || atuais[0] || null;
    const pacienteId = emCurso?.pacientes?.id;

    if (pacienteId) {
      const [{ data: trats }, { data: historico }, { data: debitos }] = await Promise.all([
        supabase.from('paciente_tratamentos').select('id, procedimento, status, observacoes').eq('paciente_id', pacienteId).order('criado_em', { ascending: false }).limit(6),
        supabase.from('agendamentos').select('data_hora').eq('paciente_id', pacienteId).eq('status', 'concluido').order('data_hora', { ascending: false }).limit(1),
        supabase.from('agendamentos').select('valor_final').eq('paciente_id', pacienteId).eq('status', 'fiado'),
      ]);
      if (id !== reqId.current) return;
      setTratamentos((trats as Tratamento[]) || []);
      setUltimaVisita(historico?.[0]?.data_hora ? new Date(historico[0].data_hora).toLocaleDateString('pt-BR') : null);
      setSaldoAberto((debitos || []).reduce((acc, i) => acc + (i.valor_final || 0), 0));
    } else {
      setTratamentos([]);
      setUltimaVisita(null);
      setSaldoAberto(0);
    }

    if (periodo === 'hoje') aplicarFinanceiroHoje(hojeLista, listaFiados);

    const pend: Pendencia[] = [];
    hojeLista.filter((a) => a.status === 'agendado').slice(0, 3).forEach((a) => {
      pend.push({
        id: `conf-${a.id}`,
        titulo: a.pacientes?.nome || 'Paciente',
        detalhe: `${hora(a.data_hora)} · Aguardando confirmação`,
        href: a.pacientes?.id ? `/pacientes/${a.pacientes.id}` : '/agenda',
      });
    });
    listaFiados.slice(0, 3).forEach((a) => {
      pend.push({
        id: `deb-${a.id}`,
        titulo: a.pacientes?.nome || 'Paciente',
        detalhe: `Débito em aberto · ${moeda(a.valor_final || 0)}`,
        href: a.pacientes?.id ? `/pacientes/${a.pacientes.id}` : '/financeiro',
      });
    });
    hojeLista
      .filter((a) => a.pacientes?.planos && a.pacientes.planos.tipo !== 'particular' && a.status === 'agendado')
      .slice(0, 2)
      .forEach((a) => {
        pend.push({
          id: `aut-${a.id}`,
          titulo: a.pacientes?.nome || 'Paciente',
          detalhe: `Autorização · ${planoNome(a.pacientes?.planos)}`,
          href: a.pacientes?.id ? `/pacientes/${a.pacientes.id}` : '/agenda',
        });
      });
    setPendencias(pend.slice(0, 6));
    setLoading(false);
    jaCarregou.current = true;
  }

  async function carregarPeriodo(alvo: Periodo) {
    if (alvo === 'hoje' || idsClinica.length === 0) return;
    const inicio = inicioDoPeriodo(alvo);
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from('agendamentos')
      .select('data_hora, status, valor_final')
      .gte('data_hora', inicio.toISOString())
      .lte('data_hora', fim.toISOString())
      .in('clinica_id', idsClinica)
      .neq('status', 'cancelado');
    const lista = data || [];
    const { fin } = somarFinanceiro(lista, fiados);
    setFinanceiro(fin);

    if (alvo === 'semana') {
      const dias = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(inicio);
        d.setDate(inicio.getDate() + i);
        return d;
      });
      setBarras(barrasDia(lista, dias));
    } else {
      const semanas = 4;
      const barrasMes = Array.from({ length: semanas }, (_, i) => {
        const de = new Date(inicio);
        de.setDate(1 + i * 7);
        const ate = new Date(de);
        ate.setDate(de.getDate() + 6);
        const valor = lista
          .filter((a) => {
            const t = new Date(a.data_hora).getTime();
            return a.status === 'concluido' && t >= de.getTime() && t <= ate.getTime();
          })
          .reduce((acc, a) => acc + (a.valor_final || 0), 0);
        return { rotulo: `${i + 1}ª`, valor };
      });
      setBarras(barrasMes);
    }
  }

  const mapaCadeiras = useMemo(() => montarMapaCadeiras(agendaHoje), [agendaHoje]);

  const emAtendimento = useMemo(() => {
    const agora = Date.now();
    const abertos = agendaHoje.filter((a) => a.status !== 'concluido');
    return abertos.find((a) => new Date(a.data_hora).getTime() <= agora) || abertos[0] || null;
  }, [agendaHoje]);

  const fila = useMemo(
    () => montarFila(agendaHoje, duracaoMin, abertura, fechamento, mapaCadeiras),
    [agendaHoje, duracaoMin, abertura, fechamento, mapaCadeiras],
  );

  async function concluirAtual() {
    if (!emAtendimento) return;
    setConcluindo(true);
    await supabase.from('agendamentos').update({ status: 'concluido' }).eq('id', emAtendimento.id);
    await carregar({ silent: true });
    setConcluindo(false);
  }

  const dataTitulo = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const clinicaNome = activeClinic && activeClinic.id !== 'all' ? (activeClinic as { nome?: string }).nome : 'Todas as clínicas';
  const maxBarra = Math.max(1, ...barras.map((h) => h.valor));
  const paciente = emAtendimento?.pacientes;
  const anos = idade(paciente?.data_nascimento);
  const cadeiraAtual = emAtendimento ? cadeiraDe(emAtendimento, mapaCadeiras) : 1;
  const materiais = tratamentos.map((t) => t.observacoes).filter(Boolean).join(' · ') || emAtendimento?.observacoes;
  const graficoLabel = periodo === 'hoje' ? 'Recebimentos por hora · Hoje' : periodo === 'semana' ? 'Recebimentos por dia · Semana' : 'Recebimentos por semana · Mês';

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5 pb-10 font-poppins">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[#1d1d1f] md:text-[26px]">Visão Geral</h1>
          <p className="mt-0.5 truncate text-[13px] capitalize text-[#6e6e73]">
            {dataTitulo} · {clinicaNome}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={abrirBusca}
            className="flex h-10 w-full items-center gap-2 rounded-full border border-black/[0.08] bg-[#f7f7f8] px-3.5 text-[13px] text-[#aeaeb2] hover:border-black/[0.14] sm:min-w-[240px] lg:min-w-[280px]"
          >
            <Search size={14} />
            <span className="truncate">Buscar paciente ou procedimento</span>
          </button>
          <Link
            href="/agenda"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ortus-blue px-4 text-[13px] font-medium text-white hover:bg-ortus-blueDark"
          >
            <Plus size={15} />
            Novo agendamento
          </Link>
        </div>
      </header>

      {loading && !jaCarregou.current ? (
        <div className="flex h-[40vh] items-center justify-center text-[#aeaeb2]">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-black/[0.06] bg-white p-4 md:p-5">
            {emAtendimento ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] text-[#6e6e73]">
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#1e8e3e] align-middle" />
                      Em atendimento · Cadeira {cadeiraAtual} · {hora(emAtendimento.data_hora)}–{duracaoMin} min
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eaf2fd] text-[12px] font-semibold text-ortus-blue">
                        {iniciais(paciente?.nome)}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-[#1d1d1f] md:text-[22px]">
                          {paciente?.nome || 'Paciente'}
                        </h2>
                        <p className="truncate text-[13px] text-[#6e6e73]">
                          {emAtendimento.procedimento || 'Consulta'}
                          {anos != null ? ` · ${anos} anos` : ''}
                          {` · ${planoNome(paciente?.planos)}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={concluirAtual}
                      disabled={concluindo}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ortus-blue px-3.5 text-[13px] font-medium text-white hover:bg-ortus-blueDark disabled:opacity-60"
                    >
                      {concluindo ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      Concluir
                    </button>
                    <button
                      type="button"
                      onClick={() => openPatient(paciente?.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] text-[#6e6e73] hover:bg-[#f5f5f7]"
                      title="Abrir ficha"
                    >
                      <FileText size={15} />
                    </button>
                    <Link
                      href="/agenda"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] text-[#6e6e73] hover:bg-[#f5f5f7]"
                      title="Mais"
                    >
                      <MoreHorizontal size={15} />
                    </Link>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 border-t border-black/[0.05] pt-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#aeaeb2]">Alergias</p>
                    <p className="mt-1 text-[13px] font-medium text-[#ea8600]">{alergiaDe(paciente?.ficha_medica)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#aeaeb2]">Última visita</p>
                    <p className="mt-1 text-[13px] text-[#1d1d1f]">{ultimaVisita || 'Primeira sessão'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#aeaeb2]">Saldo em aberto</p>
                    <p className={`mt-1 text-[13px] font-medium ${saldoAberto > 0 ? 'text-[#d93025]' : 'text-[#1e8e3e]'}`}>{moeda(saldoAberto)}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-[#aeaeb2]">Plano desta sessão</p>
                  {tratamentos.length === 0 ? (
                    <p className="text-[13px] text-[#aeaeb2]">{emAtendimento.procedimento || 'Sem procedimentos lançados nesta ficha.'}</p>
                  ) : (
                    <ul>
                      {tratamentos.map((t) => {
                        const feito = t.status === 'concluido';
                        return (
                          <li key={t.id} className="flex items-center gap-2.5 border-t border-black/[0.05] py-2.5 first:border-t-0">
                            <span className={`flex h-4 w-4 items-center justify-center rounded border ${feito ? 'border-ortus-blue bg-ortus-blue text-white' : 'border-[#d2d2d7] bg-white'}`}>
                              {feito && <Check size={10} strokeWidth={3} />}
                            </span>
                            <span className={`text-[14px] ${feito ? 'text-[#6e6e73]' : 'text-[#1d1d1f]'}`}>{t.procedimento}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <p className="mt-4 border-t border-black/[0.05] pt-3 text-[12px] text-[#6e6e73]">
                  Materiais reservados · {materiais || 'nenhum item lançado nesta sessão'}
                </p>
              </>
            ) : (
              <div className="py-10 text-center">
                <p className="text-[15px] font-medium text-[#1d1d1f]">Nenhum atendimento em curso</p>
                <p className="mt-1 text-[13px] text-[#6e6e73]">A fila do dia está livre neste momento.</p>
                <Link href="/agenda" className="mt-4 inline-flex h-9 items-center rounded-full bg-ortus-blue px-4 text-[13px] font-medium text-white">
                  Novo agendamento
                </Link>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-black/[0.06] bg-white p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <h3 className="text-[15px] font-semibold text-[#1d1d1f]">Saúde financeira</h3>
                <div className="flex rounded-full bg-[#f5f5f7] p-0.5">
                  {([
                    ['hoje', 'Hoje'],
                    ['semana', 'Semana'],
                    ['mes', 'Mês'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPeriodo(id)}
                      className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors ${periodo === id ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <Link href="/financeiro" className="inline-flex items-center gap-1 text-[13px] font-medium text-ortus-blue">
                Fechamento de caixa <ArrowUpRight size={13} />
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#aeaeb2]">Recebido</p>
                <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#1e8e3e]">{moeda(financeiro.recebido)}</p>
                <p className="text-[12px] text-[#6e6e73]">{financeiro.pagamentos} pagamento{financeiro.pagamentos === 1 ? '' : 's'}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#aeaeb2]">Previsto restante</p>
                <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#1d1d1f]">{moeda(financeiro.previsto)}</p>
                <p className="text-[12px] text-[#6e6e73]">
                  {financeiro.restantes} atendimento{financeiro.restantes === 1 ? '' : 's'} {periodo === 'hoje' ? 'até o fim do dia' : 'no período'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#aeaeb2]">Em atraso</p>
                <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#ea8600]">{moeda(financeiro.atraso)}</p>
                <p className="text-[12px] text-[#6e6e73]">{financeiro.atrasados} paciente{financeiro.atrasados === 1 ? '' : 's'}</p>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-[12px] text-[#6e6e73]">
                <span>{graficoLabel}</span>
              </div>
              <div className="flex h-24 items-end gap-1.5 sm:gap-2">
                {barras.map((item) => (
                  <div key={item.rotulo} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-sm bg-ortus-blue/80"
                      style={{ height: `${Math.max(item.valor > 0 ? 12 : 4, (item.valor / maxBarra) * 72)}px` }}
                    />
                    <span className="text-[10px] text-[#aeaeb2]">{item.rotulo}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-[15px] font-semibold text-[#1d1d1f]">Fila do dia</h3>
              <span className="text-[12px] text-[#aeaeb2]">{agendaHoje.length}</span>
            </div>
            {fila.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-[#aeaeb2]">Nenhuma consulta hoje.</p>
            ) : (
              <ul>
                {fila.map((linha) => {
                  if (linha.tipo === 'livre') {
                    return (
                      <li key={linha.id}>
                        <Link
                          href="/agenda"
                          className="grid grid-cols-[52px_1fr] gap-2 border-t border-black/[0.05] px-4 py-2.5 text-[#aeaeb2] hover:bg-[#fafafa]"
                        >
                          <span className="text-[13px] tabular-nums">{linha.inicio}</span>
                          <p className="text-[13px]">Horário livre</p>
                        </Link>
                      </li>
                    );
                  }
                  const atual = emAtendimento?.id === linha.ag.id;
                  return (
                    <li key={linha.id}>
                      <Link
                        href={linha.ag.pacientes?.id ? `/pacientes/${linha.ag.pacientes.id}` : '/agenda'}
                        className={`grid grid-cols-[52px_1fr] gap-2 border-t border-black/[0.05] px-4 py-2.5 ${atual ? 'bg-[#eaf2fd]' : 'hover:bg-[#fafafa]'}`}
                      >
                        <span className="text-[13px] font-medium tabular-nums text-[#1d1d1f]">{hora(linha.ag.data_hora)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[#1d1d1f]">{linha.ag.pacientes?.nome || 'Horário'}</p>
                          <p className="truncate text-[12px] text-[#6e6e73]">
                            {linha.ag.status === 'concluido' ? 'Concluído · ' : ''}
                            {linha.ag.procedimento || 'Consulta'}
                            {` · Cadeira ${linha.cadeira}`}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-[15px] font-semibold text-[#1d1d1f]">Pendências que travam o dia</h3>
              <Link href="/tarefas" className="text-[12px] font-medium text-ortus-blue">Ver</Link>
            </div>
            {pendencias.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-[#aeaeb2]">Nada travando o dia.</p>
            ) : (
              <ul>
                {pendencias.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="block border-t border-black/[0.05] px-4 py-2.5 hover:bg-[#fafafa]">
                      <p className="truncate text-[13px] font-medium text-[#1d1d1f]">{item.titulo}</p>
                      <p className="truncate text-[12px] text-[#6e6e73]">{item.detalhe}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      )}
    </div>
  );
}
