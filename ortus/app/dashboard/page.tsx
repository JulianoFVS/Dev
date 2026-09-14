'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
import { carregarConfig } from '@/lib/configClinica';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  FileText,
  Loader2,
  Mail,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import { useInboxCounts } from '@/hooks/useInboxCounts';

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
    id: `h-${h}`,
    rotulo: String(h).padStart(2, '0'),
    valor,
  }));
}

function PillMeter({ ratio, accent = 'lime' }: { ratio: number; accent?: 'lime' | 'dark' }) {
  const pct = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(pct * 22);
  const fillClass = accent === 'lime' ? 'bg-neutral-900' : 'bg-[#c8f053]';
  const emptyClass = accent === 'lime' ? 'border border-black/10 bg-white/70' : 'border border-black/10 bg-white/50';

  return (
    <div className="flex items-end gap-1">
      <div className="flex items-end gap-[3px]">
        {Array.from({ length: 22 }).map((_, i) => (
          <span key={i} className={`h-7 w-[6px] rounded-full sm:h-8 sm:w-[7px] ${i < filled ? fillClass : emptyClass}`} />
        ))}
      </div>
      <span className="pb-0.5 text-sm font-medium tabular-nums text-neutral-800 sm:text-base">{Math.round(pct * 100)}%</span>
    </div>
  );
}

function barrasDia(lista: { data_hora: string; status?: string | null; valor_final?: number | null }[], dias: Date[]) {
  return dias.map((d) => {
    const chave = d.toISOString().split('T')[0];
    const valor = lista
      .filter((a) => a.status === 'concluido' && a.data_hora.slice(0, 10) === chave)
      .reduce((acc, a) => acc + (a.valor_final || 0), 0);
    return {
      id: chave,
      rotulo: d.toLocaleDateString('pt-BR', { weekday: 'narrow', day: 'numeric' }),
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
  const [barras, setBarras] = useState<{ id: string; rotulo: string; valor: number }[]>([]);
  const [concluindo, setConcluindo] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [duracaoMin, setDuracaoMin] = useState(40);
  const [abertura, setAbertura] = useState('08:00');
  const [fechamento, setFechamento] = useState('18:00');
  const [fiados, setFiados] = useState<{ id: string; valor_final?: number | null; pacientes?: { id?: string; nome?: string } | null }[]>([]);
  const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
  const { openPatient } = usePatientSlideOver();
  const { mensagensCount, notificacoesCount } = useInboxCounts();
  const jaCarregou = useRef(false);
  const reqId = useRef(0);
  const periodoReqId = useRef(0);

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
    // Invalida fetch de período anterior (evita barras “fantasma” ao alternar Hoje/Semana/Mês)
    periodoReqId.current += 1;
    if (periodo === 'hoje') {
      aplicarFinanceiroHoje(agendaHoje, fiados);
      return;
    }
    carregarPeriodo(periodo, periodoReqId.current);
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

  async function carregarPeriodo(alvo: Periodo, req: number) {
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
    if (req !== periodoReqId.current) return;

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
        return { id: `sem-${i}`, rotulo: `${i + 1}ª`, valor };
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

  const proximoAgendamento = useMemo(() => {
    const agora = Date.now();
    const futuros = agendaHoje.filter(
      (a) => a.status !== 'concluido' && new Date(a.data_hora).getTime() >= agora,
    );
    return futuros[0] || agendaHoje.find((a) => a.status !== 'concluido') || null;
  }, [agendaHoje]);

  const pathname = usePathname();

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
  const graficoLabel = periodo === 'hoje' ? 'Recebimentos por hora · Hoje' : periodo === 'semana' ? 'Recebimentos por dia · Semana' : 'Recebimentos por semana · Mês';

  const bentoShell = 'min-h-0 rounded-[1.35rem] sm:rounded-[1.5rem] md:rounded-[1.65rem]';
  const bento = `${bentoShell} bg-white`;
  const bentoAgenda = `${bentoShell} border border-neutral-800 bg-neutral-950 text-white shadow-md`;

  const resumoConsultas = agendaHoje.length;
  const resumoPend = pendencias.length;
  const concluidas = agendaHoje.filter((a) => a.status === 'concluido').length;
  const ratioConsultas = resumoConsultas > 0 ? concluidas / resumoConsultas : 0;
  const totalCaixa = financeiro.recebido + financeiro.previsto;
  const ratioCaixa = totalCaixa > 0 ? financeiro.recebido / totalCaixa : 0;

  const dashTabs = [
    { label: 'Visão do dia', href: '/dashboard' },
    { label: 'Agenda', href: '/agenda' },
    { label: 'Financeiro', href: '/financeiro' },
    { label: 'Pendências', href: '/tarefas' },
    { label: 'Relatórios', href: '/relatorios' },
  ] as const;

  function tabAtivo(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <header className="relative z-20 mb-3 shrink-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="max-w-3xl text-[1.65rem] font-semibold leading-[1.12] tracking-tight text-neutral-900 sm:text-[1.85rem] md:text-[2.05rem] lg:text-[2.15rem]">
              Gerenciando sua clínica
              <span className="text-neutral-400"> e o fluxo do dia</span>
            </h1>
            <p className="mt-1 truncate text-sm capitalize text-neutral-500 sm:text-base">
              {dataTitulo} · {clinicaNome}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start">
            <button
              type="button"
              onClick={abrirBusca}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
              title="Buscar"
            >
              <Search size={18} />
            </button>
            <Link
              href="/mensagens"
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
              title="Mensagens"
            >
              <Mail size={18} />
              {mensagensCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-neutral-900 ring-2 ring-white" aria-hidden />
              )}
            </Link>
            <Link
              href="/inbox"
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
              title="Notificações"
            >
              <Bell size={18} />
              {notificacoesCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />
              )}
            </Link>
            <Link
              href="/configuracoes"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
              title="Configurações"
            >
              <Settings size={18} />
            </Link>
            <Link
              href="/agenda"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 sm:text-base"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Novo agendamento</span>
              <span className="sm:hidden">Novo</span>
            </Link>
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {dashTabs.map(({ label, href }) => {
            const ativo = tabAtivo(href);
            return (
              <Link
                key={href}
                href={href}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors sm:px-5 sm:text-base ${
                  ativo ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-700 hover:border-black/20'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Renderiza sempre — skeletons inline enquanto carrega */}
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2.5 overflow-hidden sm:gap-3">
          <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:gap-3 lg:grid-cols-3">
            <section className={`${bento} flex flex-col p-4 sm:p-5`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-neutral-500 sm:text-base">Consultas do dia</p>
                {loading && !jaCarregou.current ? (
                  <span className="h-5 w-20 animate-pulse rounded-full bg-neutral-100" />
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 sm:text-sm">
                    {concluidas} concluídas
                  </span>
                )}
              </div>
              {loading && !jaCarregou.current ? (
                <div className="mt-2 h-10 w-24 animate-pulse rounded-xl bg-neutral-100" />
              ) : (
                <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                  {resumoConsultas}
                  <span className="text-lg font-medium text-neutral-400 sm:text-xl"> / {Math.max(resumoConsultas, 1)}</span>
                </p>
              )}
              <div className="mt-4">
                <PillMeter ratio={ratioConsultas} accent="lime" />
              </div>
            </section>

            <section className={`${bento} flex flex-col bg-[#c8f053] p-4 sm:p-5`}>
              <p className="text-sm font-medium text-neutral-800 sm:text-base">Recebimentos · Hoje</p>
              {loading && !jaCarregou.current ? (
                <div className="mt-2 h-10 w-36 animate-pulse rounded-xl bg-lime-200/60" />
              ) : (
                <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                  {moeda(financeiro.recebido)}
                </p>
              )}
              <p className="mt-1 text-sm text-neutral-700 sm:text-base">
                {loading && !jaCarregou.current ? '' : `Previsto ${moeda(financeiro.previsto)}`}
              </p>
              <div className="mt-4">
                <PillMeter ratio={ratioCaixa} accent="dark" />
              </div>
            </section>

            <section className={`${bentoAgenda} relative flex min-h-[10rem] flex-col justify-between overflow-hidden p-4 sm:min-h-[11rem] sm:p-5 lg:col-span-1`}>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(200,240,83,0.18),transparent_50%)]" />
              <div className="relative z-[1]">
                {emAtendimento ? (
                  <>
                    <p className="text-sm text-neutral-300 sm:text-base">
                      Em atendimento · Cadeira {cadeiraAtual} · {hora(emAtendimento.data_hora)}
                    </p>
                    <h2 className="mt-2 truncate text-xl font-semibold text-white sm:text-2xl">{paciente?.nome || 'Paciente'}</h2>
                    <p className="mt-1 truncate text-sm text-neutral-200 sm:text-base">
                      {emAtendimento.procedimento || 'Consulta'}
                      {anos != null ? ` · ${anos} anos` : ''}
                      {tratamentos.length > 0 ? ` · ${tratamentos.length} itens no plano` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-neutral-300 sm:text-base">Sala livre agora</p>
                    <h2 className="mt-2 truncate text-xl font-semibold text-white sm:text-2xl">
                      {proximoAgendamento?.pacientes?.nome || 'Nenhum paciente em curso'}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-200 sm:text-base">
                      {proximoAgendamento
                        ? `Próximo horário · ${hora(proximoAgendamento.data_hora)} · ${proximoAgendamento.procedimento || 'Consulta'}`
                        : 'Abra a agenda e encaixe o próximo horário.'}
                    </p>
                  </>
                )}
              </div>
              <div className="relative z-[1] mt-3 flex flex-wrap gap-2">
                {emAtendimento ? (
                  <>
                    <button
                      type="button"
                      onClick={concluirAtual}
                      disabled={concluindo}
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-neutral-900 disabled:opacity-60 sm:h-11 sm:text-base"
                    >
                      {concluindo ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Concluir
                    </button>
                    <button
                      type="button"
                      onClick={() => openPatient(paciente?.id)}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-medium text-white sm:h-11 sm:text-base"
                    >
                      <FileText size={16} />
                      Ficha
                    </button>
                  </>
                ) : (
                  <Link
                    href="/agenda"
                    className="inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-medium text-neutral-900 sm:h-11 sm:text-base"
                  >
                    Abrir agenda
                  </Link>
                )}
              </div>
            </section>
          </div>

          <div className="grid min-h-0 grid-cols-1 gap-2.5 overflow-hidden lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,1fr)] sm:gap-3">
            <section className={`${bento} flex min-h-0 flex-col p-4 sm:p-5`}>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 sm:text-xl">Estatísticas</h3>
                  <p className="text-sm text-neutral-500 sm:text-base">{graficoLabel}</p>
                </div>
                <div className="flex rounded-full border border-black/10 bg-[#f3f4f1] p-1">
                  {([
                    ['hoje', 'Hoje'],
                    ['semana', 'Semana'],
                    ['mes', 'Mês'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPeriodo(id)}
                      className={`rounded-full px-3 py-1 text-sm font-medium sm:px-4 sm:text-base ${
                        periodo === id ? 'bg-neutral-900 text-white' : 'text-neutral-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex shrink-0 flex-wrap gap-4 text-sm sm:text-base">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
                  Recebido
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#c8f053]" />
                  Previsto / fila
                </span>
              </div>

              <div key={periodo} className="relative mt-3 flex min-h-0 flex-1 items-end justify-between gap-1 sm:gap-2">
                <div className="pointer-events-none absolute inset-x-0 bottom-8 top-2 flex flex-col justify-between">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-px w-full bg-neutral-100" />
                  ))}
                </div>
                {barras.map((item) => {
                  const h = Math.max(8, (item.valor / maxBarra) * 100);
                  const hPrev = Math.max(4, h * 0.35);
                  return (
                    <div key={item.id} className="relative z-[1] flex flex-1 flex-col items-center gap-2">
                      <div className="relative flex h-[7.5rem] w-full max-w-[2.75rem] flex-col items-center justify-end sm:h-[8.5rem] sm:max-w-[3rem]">
                        <div
                          className="absolute bottom-0 w-[85%] rounded-full bg-neutral-100"
                          style={{ height: `${Math.min(100, h + 12)}%` }}
                        />
                        <div
                          className="absolute bottom-0 z-[1] w-[72%] rounded-full bg-[#c8f053]"
                          style={{ height: `${hPrev}%` }}
                        />
                        <div
                          className="absolute bottom-0 z-[2] w-[72%] rounded-full bg-neutral-900"
                          style={{ height: `${h}%` }}
                        />
                        <span className="absolute z-[3] rounded-full bg-neutral-900 ring-2 ring-white" style={{ bottom: `calc(${h}% - 4px)` }}>
                          <span className="block h-2 w-2 rounded-full bg-[#c8f053]" />
                        </span>
                      </div>
                      <span className="text-xs tabular-nums text-neutral-400 sm:text-sm">{item.rotulo}</span>
                    </div>
                  );
                })}
              </div>

              {emAtendimento && (
                <div className="mt-3 shrink-0 grid grid-cols-2 gap-2 border-t border-black/5 pt-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 sm:text-sm">Alergias</p>
                    <p className="line-clamp-2 text-sm font-medium text-amber-800 sm:text-base">{alergiaDe(paciente?.ficha_medica)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 sm:text-sm">Última visita</p>
                    <p className="text-sm text-neutral-800 sm:text-base">{ultimaVisita || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 sm:text-sm">Saldo</p>
                    <p className={`text-sm font-medium sm:text-base ${saldoAberto > 0 ? 'text-red-600' : 'text-neutral-800'}`}>{moeda(saldoAberto)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 sm:text-sm">Pendências</p>
                    <p className="text-sm font-semibold text-neutral-900 sm:text-base">{resumoPend}</p>
                  </div>
                </div>
              )}
            </section>

            <aside className="flex min-h-0 flex-col gap-2 overflow-hidden">
              <div className="grid shrink-0 grid-cols-2 gap-2">
                <Link
                  href="/agenda"
                  className={`${bento} flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-neutral-50`}
                >
                  <CalendarDays size={18} className="shrink-0 text-neutral-800" />
                  <span className="text-sm font-semibold text-neutral-900">Agenda</span>
                </Link>
                <Link
                  href="/pacientes"
                  className={`${bento} flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-neutral-50`}
                >
                  <Users size={18} className="shrink-0 text-neutral-800" />
                  <span className="text-sm font-semibold text-neutral-900">Pacientes</span>
                </Link>
              </div>

              <section className={`${bento} flex min-h-0 flex-[1.2] flex-col overflow-hidden`}>
                <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                  <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">Fila do dia</h3>
                  <span className="text-sm text-neutral-400">{agendaHoje.length}</span>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                  {fila.length === 0 ? (
                    <li className="p-3 text-sm text-neutral-400 sm:text-base">Nenhuma consulta hoje.</li>
                  ) : (
                    fila.map((linha) => {
                      if (linha.tipo === 'livre') {
                        return (
                          <li key={linha.id}>
                            <Link href="/agenda" className="mb-2 flex items-start justify-between gap-2 rounded-2xl border border-black/5 bg-[#f8f8f6] p-3 hover:bg-white">
                              <div>
                                <p className="font-medium text-neutral-900 sm:text-base">Horário livre</p>
                                <p className="text-sm font-medium text-neutral-600">{linha.inicio}</p>
                              </div>
                              <ArrowUpRight size={16} className="shrink-0 text-neutral-400" />
                            </Link>
                          </li>
                        );
                      }
                      const atual = emAtendimento?.id === linha.ag.id;
                      return (
                        <li key={linha.id}>
                          <Link
                            href={linha.ag.pacientes?.id ? `/pacientes/${linha.ag.pacientes.id}` : '/agenda'}
                            className={`mb-2 flex items-start justify-between gap-2 rounded-2xl border p-3 ${
                              atual ? 'border-[#c8f053] bg-white' : 'border-black/5 bg-[#f8f8f6] hover:bg-white'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-neutral-900 sm:text-base">{linha.ag.pacientes?.nome || 'Consulta'}</p>
                              <p className="truncate text-sm font-medium text-neutral-600">
                                {hora(linha.ag.data_hora)} · {linha.ag.procedimento || 'Consulta'}
                              </p>
                            </div>
                            <ArrowUpRight size={16} className="shrink-0 text-neutral-400" />
                          </Link>
                        </li>
                      );
                    })
                  )}
                </ul>
              </section>

              <section className={`${bento} flex min-h-0 flex-1 flex-col overflow-hidden`}>
                <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                  <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">Pendências</h3>
                  <Link href="/tarefas" className="text-sm font-medium text-neutral-600 hover:text-neutral-900 sm:text-base">
                    Ver
                  </Link>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                  {pendencias.length === 0 ? (
                    <li className="p-3 text-sm text-neutral-400 sm:text-base">Nada travando o dia.</li>
                  ) : (
                    pendencias.slice(0, 4).map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="mb-2 flex items-start justify-between gap-2 rounded-2xl border border-black/5 bg-[#f8f8f6] p-3 hover:bg-white"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-neutral-900 sm:text-base">{item.titulo}</p>
                            <p className="truncate text-sm font-medium text-neutral-600">{item.detalhe}</p>
                          </div>
                          <ArrowUpRight size={16} className="shrink-0 text-neutral-400" />
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <Link
                href="/financeiro"
                className={`${bento} flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 hover:bg-neutral-50 sm:px-4 sm:py-3`}
              >
                <div>
                  <p className="font-semibold text-neutral-900 sm:text-lg">Fechamento de caixa</p>
                  <p className="text-sm text-neutral-500 sm:text-base">
                    Atraso {moeda(financeiro.atraso)} · {financeiro.atrasados} pac.
                  </p>
                </div>
                <ArrowUpRight size={18} />
              </Link>
            </aside>
          </div>
        </div>
    </div>
  );
}
