'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { useClinica } from '@/app/context/ClinicaContext';
import { carregarConfig } from '@/lib/configClinica';
import { CONFIG_KEYS } from '@/lib/configKeys';
import { PROFILE_PATCH_EVENT, readProfileSession } from '@/lib/profileSession';
import { normalizarTaxasMaquininha, TAXAS_MAQUININHA_PADRAO, type TaxaMaquininha } from '@/lib/configDefaults';
import CustomSelect from '@/components/ui/CustomSelect';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import ModalNovoAgendamento from '@/components/agenda/ModalNovoAgendamento';
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react';
import { useInboxCounts } from '@/hooks/useInboxCounts';
import PillMeter from '@/components/bento/PillMeter';
import Aviso from '@/components/ui/Aviso';
import type { ReactNode } from 'react';

function DicaBotao({ texto, children }: { texto: string; children: ReactNode }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisivel(true)}
      onMouseLeave={() => setVisivel(false)}
      onPointerDown={() => setVisivel(false)}
    >
      {children}
      {visivel && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white">
          {texto}
        </span>
      )}
    </span>
  );
}

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
    foto_url?: string | null;
    planos?: { nome?: string; tipo?: string } | null;
  } | null;
};

type Tratamento = { id: string; procedimento: string; status: string; observacoes?: string | null };
type Pendencia = { id: string; titulo: string; detalhe: string; href: string };
type Periodo = 'hoje' | 'semana' | 'mes';
type Financeiro = {
  recebido: number;
  pagamentos: number;
  previsto: number;
  restantes: number;
  atraso: number;
  atrasados: number;
};

const FIN_VAZIO: Financeiro = { recebido: 0, pagamentos: 0, previsto: 0, restantes: 0, atraso: 0, atrasados: 0 };
const DASH_CACHE_KEY = 'ortus:dashboard:v2';

type DashSnap = {
  agendaHoje: AgendaItem[];
  tratamentos: Tratamento[];
  pendencias: Pendencia[];
  ultimaVisita: string | null;
  saldoAberto: number;
  financeiro: Financeiro;
  barras: { id: string; rotulo: string; valor: number }[];
  fiados: { id: string; valor_final?: number | null; pacientes?: { id?: string; nome?: string } | null }[];
  duracaoMin: number;
  abertura: string;
  fechamento: string;
};

function readDashBoot(): DashSnap | null {
  if (typeof localStorage === 'undefined') return null;
  const cid = localStorage.getItem('ortus_clinica_id');
  const clinicId = !cid || cid === 'all' || cid === 'todas' ? 'all' : cid;
  return readRouteCache<DashSnap>(DASH_CACHE_KEY, clinicScope(clinicId));
}

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

function isoLocal(d: Date) {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function limitesDia(iso: string) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return {
    inicio: new Date(ano, mes - 1, dia, 0, 0, 0, 0).toISOString(),
    fim: new Date(ano, mes - 1, dia, 23, 59, 59, 999).toISOString(),
  };
}

function gradeMes(ano: number, mes: number) {
  const primeiro = new Date(ano, mes, 1);
  const inicio = (primeiro.getDay() + 6) % 7;
  const total = new Date(ano, mes + 1, 0).getDate();
  const celulas: (number | null)[] = Array.from({ length: inicio }, () => null);
  for (let dia = 1; dia <= total; dia += 1) celulas.push(dia);
  while (celulas.length % 7 !== 0) celulas.push(null);
  return celulas;
}

type TarefaDia = {
  id: string;
  titulo: string;
  status: string;
  prioridade?: string | null;
  data_limite: string | null;
  paciente_nome?: string | null;
  responsavel_nome?: string | null;
};

const TAREFAS_CACHE_KEY = 'ortus:tarefas:v1';

function tarefasPendentes(lista: TarefaDia[] | undefined | null) {
  return (lista || [])
    .filter((t) => t.status !== 'concluido' && t.data_limite)
    .sort((a, b) => String(a.data_limite).localeCompare(String(b.data_limite)))
    .slice(0, 12);
}

function lerTarefasCache(): TarefaDia[] {
  if (typeof localStorage === 'undefined') return [];
  const cid = localStorage.getItem('ortus_clinica_id');
  const clinicId = !cid || cid === 'all' || cid === 'todas' ? 'all' : cid;
  return tarefasPendentes(readRouteCache<{ tarefas: TarefaDia[] }>(TAREFAS_CACHE_KEY, clinicScope(clinicId))?.tarefas);
}

function abrirBusca() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
}

function lerValor(texto: string) {
  const limpo = texto.replace(/[^\d,.]/g, '');
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

function whatsAppDe(telefone?: string | null) {
  const digitos = (telefone || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.startsWith('55') ? digitos : `55${digitos}`}`;
}

function rotuloStatus(status?: string | null) {
  if (status === 'concluido') return 'Concluído';
  if (status === 'fiado') return 'Fiado';
  if (status === 'faltou' || status === 'falta') return 'Faltou';
  if (status === 'cancelado') return 'Cancelado';
  return 'Agendado';
}

function saudacaoAgora() {
  const horaAtual = new Date().getHours();
  if (horaAtual < 12) return 'Bom dia';
  if (horaAtual < 18) return 'Boa tarde';
  return 'Boa noite';
}

type LinhaTaxa = { id: string; nome: string; taxa: number; parcelas: number };

function taxaResolvida(lista: TaxaMaquininha[], pred: (t: TaxaMaquininha) => boolean) {
  return lista.find(pred) || TAXAS_MAQUININHA_PADRAO.find(pred) || null;
}

function linhasDaTaxa(grupo: string, lista: TaxaMaquininha[]): LinhaTaxa[] {
  if (grupo === 'pix_debito') {
    const pix = taxaResolvida(lista, (t) => t.tipo === 'pix');
    const debVisa = taxaResolvida(lista, (t) => t.tipo === 'debito' && t.bandeira === 'Visa/Master');
    const debOutro = taxaResolvida(lista, (t) => t.tipo === 'debito' && t.bandeira !== 'Visa/Master');
    return [
      pix && pix.ativo !== false && { id: pix.id, nome: 'PIX', taxa: pix.taxa_percentual, parcelas: 1 },
      debVisa && debVisa.ativo !== false && { id: debVisa.id, nome: 'Débito Visa/Master', taxa: debVisa.taxa_percentual, parcelas: 1 },
      debOutro && debOutro.ativo !== false && { id: debOutro.id, nome: 'Débito Elo/outros', taxa: debOutro.taxa_percentual, parcelas: 1 },
    ].filter((item): item is LinhaTaxa => !!item);
  }
  const bandeira = grupo === 'credito_visa' ? 'Visa/Master' : 'Elo';
  const salvas = lista.filter((t) => t.bandeira === bandeira && t.parcela != null && t.tipo !== 'debito' && t.tipo !== 'pix');
  const base = TAXAS_MAQUININHA_PADRAO.filter((t) => t.bandeira === bandeira && t.parcela != null);
  return base
    .map((p) => salvas.find((s) => s.parcela === p.parcela) || p)
    .filter((t) => t.ativo !== false)
    .sort((a, b) => (a.parcela || 0) - (b.parcela || 0))
    .map((t) => ({
      id: t.id,
      nome: t.parcela === 1 ? 'À vista' : `${t.parcela}x`,
      taxa: t.taxa_percentual,
      parcelas: t.parcela || 1,
    }));
}

function FotoPaciente({ nome, url, claro = false, grande = false }: { nome?: string | null; url?: string | null; claro?: boolean; grande?: boolean }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${grande ? 'h-12 w-12 text-sm' : 'h-8 w-8 text-[10px]'} ${claro ? 'bg-white/10 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : iniciais(nome)}
    </span>
  );
}

const SELECT_AGENDA = 'id, data_hora, procedimento, status, valor_final, observacoes, profissional_id, pacientes(id, nome, telefone, data_nascimento, foto_url, planos(nome, tipo))';

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
  const boot = typeof sessionStorage !== 'undefined' ? readDashBoot() : null;
  const [loading, setLoading] = useState(() => !boot);
  const [agendaHoje, setAgendaHoje] = useState<AgendaItem[]>(() => boot?.agendaHoje ?? []);
  const [tratamentos, setTratamentos] = useState<Tratamento[]>(() => boot?.tratamentos ?? []);
  const [pendencias, setPendencias] = useState<Pendencia[]>(() => boot?.pendencias ?? []);
  const [ultimaVisita, setUltimaVisita] = useState<string | null>(() => boot?.ultimaVisita ?? null);
  const [saldoAberto, setSaldoAberto] = useState(() => boot?.saldoAberto ?? 0);
  const [financeiro, setFinanceiro] = useState<Financeiro>(() => boot?.financeiro ?? FIN_VAZIO);
  const [barras, setBarras] = useState<{ id: string; rotulo: string; valor: number }[]>(() => boot?.barras ?? []);
  const [concluindo, setConcluindo] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [duracaoMin, setDuracaoMin] = useState(() => boot?.duracaoMin ?? 40);
  const [abertura, setAbertura] = useState(() => boot?.abertura ?? '08:00');
  const [fechamento, setFechamento] = useState(() => boot?.fechamento ?? '18:00');
  const [fiados, setFiados] = useState<{ id: string; valor_final?: number | null; pacientes?: { id?: string; nome?: string } | null }[]>(() => boot?.fiados ?? []);
  const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
  const { openPatient } = usePatientSlideOver();
  const { mensagensCount, notificacoesCount } = useInboxCounts();
  const jaCarregou = useRef(!!boot);
  const reqId = useRef(0);
  const periodoReqId = useRef(0);
  const avisoTimer = useRef<number | null>(null);
  const [modalAgenda, setModalAgenda] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const hojeISO = useMemo(() => isoLocal(new Date()), []);
  const [diaISO, setDiaISO] = useState(hojeISO);
  const [mesCursor, setMesCursor] = useState(() => {
    const agora = new Date();
    return { ano: agora.getFullYear(), mes: agora.getMonth() };
  });
  const [marcados, setMarcados] = useState<string[]>([]);
  const [agendaVista, setAgendaVista] = useState<AgendaItem[]>(() => boot?.agendaHoje ?? []);
  const [selId, setSelId] = useState<string | null>(null);
  const [carregandoDia, setCarregandoDia] = useState(false);
  const [tarefasDia, setTarefasDia] = useState<TarefaDia[]>(lerTarefasCache);
  const [tarefasCarregando, setTarefasCarregando] = useState(() => lerTarefasCache().length === 0);
  const [taxas, setTaxas] = useState<TaxaMaquininha[]>([]);
  const [calcValor, setCalcValor] = useState('');
  const [calcGrupo, setCalcGrupo] = useState('pix_debito');
  const [nomeUsuario, setNomeUsuario] = useState(() => readProfileSession()?.nome || '');
  const [detalhe, setDetalhe] = useState<{
    pacienteId: string;
    tratamentos: Tratamento[];
    ultima: string | null;
    saldo: number;
    ficha: any;
  } | null>(null);

  function avisar(mensagem: string) {
    setAviso(mensagem);
    if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 2600);
  }

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

  useEffect(() => {
    if (diaISO === hojeISO) {
      setAgendaVista(agendaHoje);
      setCarregandoDia(false);
      return;
    }
    if (clinicLoading || idsClinica.length === 0) {
      setAgendaVista([]);
      setCarregandoDia(false);
      return;
    }
    let ativo = true;
    setCarregandoDia(true);
    supabase
      .from('agendamentos')
      .select(SELECT_AGENDA)
      .gte('data_hora', limitesDia(diaISO).inicio)
      .lte('data_hora', limitesDia(diaISO).fim)
      .in('clinica_id', idsClinica)
      .order('data_hora', { ascending: true })
      .then(({ data }) => {
        if (!ativo) return;
        setAgendaVista(((data as AgendaItem[]) || []).filter((item) => item.status !== 'cancelado'));
        setCarregandoDia(false);
      });
    return () => {
      ativo = false;
    };
  }, [diaISO, hojeISO, agendaHoje, clinicLoading, idsClinica]);

  useEffect(() => {
    if (clinicLoading || idsClinica.length === 0) return;
    const inicio = new Date(mesCursor.ano, mesCursor.mes, 1, 0, 0, 0, 0).toISOString();
    const fim = new Date(mesCursor.ano, mesCursor.mes + 1, 0, 23, 59, 59, 999).toISOString();
    let ativo = true;
    supabase
      .from('agendamentos')
      .select('data_hora')
      .gte('data_hora', inicio)
      .lte('data_hora', fim)
      .in('clinica_id', idsClinica)
      .neq('status', 'cancelado')
      .then(({ data }) => {
        if (!ativo) return;
        const dias = new Set((data || []).map((item) => isoLocal(new Date(item.data_hora))));
        setMarcados([...dias]);
      });
    return () => {
      ativo = false;
    };
  }, [mesCursor, clinicLoading, idsClinica]);

  useEffect(() => {
    if (clinicLoading) return;
    if (idsClinica.length === 0) {
      setTarefasDia([]);
      setTarefasCarregando(false);
      return;
    }
    let ativo = true;
    supabase
      .from('v_tarefas_completo')
      .select('id, titulo, status, prioridade, data_limite, paciente_nome, responsavel_nome')
      .in('clinica_id', idsClinica)
      .neq('status', 'concluido')
      .not('data_limite', 'is', null)
      .order('data_limite', { ascending: true })
      .limit(12)
      .then(({ data }) => {
        if (!ativo) return;
        setTarefasDia(tarefasPendentes(data as TarefaDia[]));
        setTarefasCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [clinicLoading, idsClinica]);

  useEffect(() => {
    if (clinicLoading || idsClinica.length === 0) return;
    let ativo = true;
    void carregarConfig<TaxaMaquininha[]>(idsClinica[0], CONFIG_KEYS.taxas_maquininha, 'ortus_taxas_maquininha', TAXAS_MAQUININHA_PADRAO).then((raw) => {
      if (!ativo) return;
      setTaxas(normalizarTaxasMaquininha(raw));
    });
    return () => {
      ativo = false;
    };
  }, [clinicLoading, idsClinica]);

  useEffect(() => {
    const aplicar = () => setNomeUsuario(readProfileSession()?.nome || '');
    window.addEventListener(PROFILE_PATCH_EVENT, aplicar);
    if (nomeUsuario) return () => window.removeEventListener(PROFILE_PATCH_EVENT, aplicar);
    let ativo = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!ativo) return;
      const meta = data.user?.user_metadata?.nome as string | undefined;
      if (meta) {
        setNomeUsuario(meta);
        return;
      }
      if (!data.user?.id) return;
      const { data: prof } = await supabase.from('profissionais').select('nome').eq('user_id', data.user.id).maybeSingle();
      if (ativo && prof?.nome) setNomeUsuario(prof.nome);
    });
    return () => {
      ativo = false;
      window.removeEventListener(PROFILE_PATCH_EVENT, aplicar);
    };
  }, [nomeUsuario]);

  async function concluirTarefa(id: string) {
    const anterior = tarefasDia;
    setTarefasDia((lista) => lista.filter((t) => t.id !== id));
    const { error } = await supabase.from('tarefas').update({ status: 'concluido' }).eq('id', id);
    if (error) {
      setTarefasDia(anterior);
      avisar('Não foi possível concluir a tarefa.');
      return;
    }
    avisar('Tarefa concluída.');
  }

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

    const hoje = isoLocal(new Date());
    const agora = new Date();
    const prefClinica = filtros[0];

    const [agendaRes, fiadosRes] = await Promise.all([
      supabase
        .from('agendamentos')
        .select(SELECT_AGENDA)
        .gte('data_hora', limitesDia(hoje).inicio)
        .lte('data_hora', limitesDia(hoje).fim)
        .in('clinica_id', filtros)
        .order('data_hora', { ascending: true }),
      supabase
        .from('agendamentos')
        .select('id, valor_final, data_hora, pacientes(id, nome)')
        .eq('status', 'fiado')
        .in('clinica_id', filtros)
        .limit(8),
    ]);

    if (id !== reqId.current) return;

    const hojeLista = ((agendaRes.data as AgendaItem[]) || []).filter((a) => a.status !== 'cancelado');
    const listaFiados = (fiadosRes.data || []) as typeof fiados;
    setAgendaHoje(hojeLista);
    setFiados(listaFiados);
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
    const proximasPendencias = pend.slice(0, 6);
    setPendencias(proximasPendencias);
    setLoading(false);
    jaCarregou.current = true;

    const atuais = hojeLista.filter((a) => a.status !== 'concluido');
    const emCurso = atuais.find((a) => new Date(a.data_hora).getTime() <= agora.getTime()) || atuais[0] || null;
    const pacienteId = emCurso?.pacientes?.id;
    const soma = somarFinanceiro(hojeLista, listaFiados);
    const fin = soma.fin;
    const barrasHoje = barrasHora(hojeLista);
    const snapBase = {
      agendaHoje: hojeLista,
      pendencias: proximasPendencias,
      financeiro: periodo === 'hoje' ? fin : financeiro,
      barras: periodo === 'hoje' ? barrasHoje : barras,
      fiados: listaFiados,
      duracaoMin,
      abertura,
      fechamento,
    };

    void carregarConfig(prefClinica, 'preferencias', 'ortus_preferencias', {
      duracao_consulta_padrao: 40,
      horario_abertura: '08:00',
      horario_fechamento: '18:00',
    }).then((prefs) => {
      if (id !== reqId.current) return;
      setDuracaoMin(Number(prefs?.duracao_consulta_padrao) || 40);
      setAbertura(prefs?.horario_abertura || '08:00');
      setFechamento(prefs?.horario_fechamento || '18:00');
    });

    if (!pacienteId) {
      setTratamentos([]);
      setUltimaVisita(null);
      setSaldoAberto(0);
      writeRouteCache(DASH_CACHE_KEY, clinicScope(activeClinicId), {
        ...snapBase,
        tratamentos: [],
        ultimaVisita: null,
        saldoAberto: 0,
      });
      return;
    }

    writeRouteCache(DASH_CACHE_KEY, clinicScope(activeClinicId), {
      ...snapBase,
      tratamentos,
      ultimaVisita,
      saldoAberto,
    });

    void Promise.all([
      supabase.from('paciente_tratamentos').select('id, procedimento, status, observacoes').eq('paciente_id', pacienteId).order('criado_em', { ascending: false }).limit(6),
      supabase.from('agendamentos').select('data_hora').eq('paciente_id', pacienteId).eq('status', 'concluido').order('data_hora', { ascending: false }).limit(1),
      supabase.from('agendamentos').select('valor_final').eq('paciente_id', pacienteId).eq('status', 'fiado'),
      supabase.from('pacientes').select('id, ficha_medica').eq('id', pacienteId).maybeSingle(),
    ]).then(([{ data: trats }, { data: historico }, { data: debitos }, { data: fichaRow }]) => {
      if (id !== reqId.current) return;
      const nextTrats = (trats as Tratamento[]) || [];
      const nextVisita = historico?.[0]?.data_hora ? new Date(historico[0].data_hora).toLocaleDateString('pt-BR') : null;
      const nextSaldo = (debitos || []).reduce((acc, item) => acc + (item.valor_final || 0), 0);
      setTratamentos(nextTrats);
      setUltimaVisita(nextVisita);
      setSaldoAberto(nextSaldo);
      const agendaComFicha = fichaRow?.ficha_medica
        ? hojeLista.map((item) => (
          item.pacientes?.id === pacienteId
            ? { ...item, pacientes: { ...item.pacientes, ficha_medica: fichaRow.ficha_medica } }
            : item
        ))
        : hojeLista;
      if (fichaRow?.ficha_medica) setAgendaHoje(agendaComFicha);
      writeRouteCache(DASH_CACHE_KEY, clinicScope(activeClinicId), {
        ...snapBase,
        agendaHoje: agendaComFicha,
        tratamentos: nextTrats,
        ultimaVisita: nextVisita,
        saldoAberto: nextSaldo,
      });
    });
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

  const emAtendimento = useMemo(() => {
    const agora = Date.now();
    const abertos = agendaHoje.filter((a) => a.status !== 'concluido');
    return abertos.find((a) => new Date(a.data_hora).getTime() <= agora) || abertos[0] || null;
  }, [agendaHoje]);

  const proximoAgendamento = useMemo(() => {
    const agora = Date.now();
    const futuros = agendaHoje.filter(
      (a) => a.status !== 'concluido' && new Date(a.data_hora).getTime() >= agora,
    );
    return futuros[0] || agendaHoje.find((a) => a.status !== 'concluido') || null;
  }, [agendaHoje]);

  async function concluirAtual() {
    if (!emAtendimento) return;
    setConcluindo(true);
    await supabase.from('agendamentos').update({ status: 'concluido' }).eq('id', emAtendimento.id);
    await carregar({ silent: true });
    setConcluindo(false);
  }

  const clinicaNome = activeClinic && activeClinic.id !== 'all' ? (activeClinic as { nome?: string }).nome : 'Todas as clínicas';
  const primeiroNome = nomeUsuario.trim().split(/\s+/)[0] || '';
  const pacienteCurso = emAtendimento?.pacientes;
  const anosCurso = idade(pacienteCurso?.data_nascimento);
  const listaDia = diaISO === hojeISO ? agendaHoje : agendaVista;
  const padraoId = diaISO === hojeISO ? (emAtendimento?.id || proximoAgendamento?.id || null) : null;
  const selecionado = selId === ''
    ? null
    : listaDia.find((item) => item.id === selId) || listaDia.find((item) => item.id === padraoId) || listaDia[0] || null;
  const pacienteSel = selecionado?.pacientes;
  const anosSel = idade(pacienteSel?.data_nascimento);
  const pacienteSelId = pacienteSel?.id || '';

  useEffect(() => {
    if (!pacienteSelId) return;
    let ativo = true;
    Promise.all([
      supabase.from('paciente_tratamentos').select('id, procedimento, status, observacoes').eq('paciente_id', pacienteSelId).order('criado_em', { ascending: false }).limit(4),
      supabase.from('agendamentos').select('data_hora').eq('paciente_id', pacienteSelId).eq('status', 'concluido').order('data_hora', { ascending: false }).limit(1),
      supabase.from('agendamentos').select('valor_final').eq('paciente_id', pacienteSelId).eq('status', 'fiado'),
      supabase.from('pacientes').select('id, ficha_medica').eq('id', pacienteSelId).maybeSingle(),
    ]).then(([{ data: trats }, { data: historico }, { data: debitos }, { data: fichaRow }]) => {
      if (!ativo) return;
      setDetalhe({
        pacienteId: pacienteSelId,
        tratamentos: (trats as Tratamento[]) || [],
        ultima: historico?.[0]?.data_hora ? new Date(historico[0].data_hora).toLocaleDateString('pt-BR') : null,
        saldo: (debitos || []).reduce((acc, item) => acc + (item.valor_final || 0), 0),
        ficha: fichaRow?.ficha_medica ?? null,
      });
    });
    return () => {
      ativo = false;
    };
  }, [pacienteSelId]);

  const detalheAtual = detalhe?.pacienteId && detalhe.pacienteId === pacienteSel?.id ? detalhe : null;
  const celulas = gradeMes(mesCursor.ano, mesCursor.mes);
  const rotuloMes = new Date(mesCursor.ano, mesCursor.mes, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  const rotuloLinha = new Date(`${diaISO}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  const card = 'min-h-0 rounded-[1.35rem] bg-white';

  function mudarMes(delta: number) {
    setMesCursor((atual) => {
      const proximo = new Date(atual.ano, atual.mes + delta, 1);
      return { ano: proximo.getFullYear(), mes: proximo.getMonth() };
    });
  }

  function alternarPaciente(id: string) {
    setSelId(selecionado?.id === id ? '' : id);
  }

  function escolherDia(iso: string) {
    setDiaISO(iso);
    setSelId(null);
    const data = new Date(`${iso}T12:00:00`);
    setMesCursor({ ano: data.getFullYear(), mes: data.getMonth() });
  }

  const consultasDia = listaDia.length;
  const concluidasDia = listaDia.filter((item) => item.status === 'concluido').length;
  const ratioConsultas = consultasDia > 0 ? concluidasDia / consultasDia : 0;
  const hojeTarefa = hojeISO;
  const valorCalc = lerValor(calcValor);
  const gruposTaxa = [
    { value: 'pix_debito', label: 'PIX e débito' },
    { value: 'credito_visa', label: 'Crédito Visa/Master' },
    { value: 'credito_outros', label: 'Crédito Elo/Outros' },
  ].filter((grupo) => linhasDaTaxa(grupo.value, taxas).length > 0);
  const formasCalc = linhasDaTaxa(calcGrupo, taxas);
  const rotulo = 'mb-1.5 block text-xs font-medium text-neutral-500';
  const listaRef = useRef<HTMLUListElement>(null);
  const [recorte, setRecorte] = useState(0);

  useLayoutEffect(() => {
    const el = listaRef.current;
    if (!el) return;
    const medir = () => {
      const desktop = window.matchMedia('(min-width: 1024px)').matches;
      if (!desktop || listaDia.length <= 2) {
        setRecorte((atual) => (atual === 0 ? atual : 0));
        return;
      }
      const botao = el.querySelector<HTMLElement>('li[data-aberto="0"] button');
      const altura = botao?.offsetHeight || 52;
      const gap = parseFloat(getComputedStyle(el).rowGap || '8') || 8;
      const proximo = Math.round(el.clientHeight - altura - gap - 32);
      setRecorte((atual) => (atual === proximo ? atual : Math.max(proximo, 0)));
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [listaDia.length, selecionado?.id, carregandoDia]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5 lg:overflow-hidden">
      <Aviso mensagem={aviso} />
      <div className="grid gap-2.5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_17.75rem] lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-3">
        <header className="order-1 flex shrink-0 items-center justify-between gap-3 lg:col-start-1 lg:row-start-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-none tracking-tight text-neutral-900 md:text-[2rem]">
              {saudacaoAgora()}{primeiroNome ? `, ${primeiroNome}` : ''}
              <span className="text-neutral-400"> · {clinicaNome}</span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <DicaBotao texto="Mensagens e notificações">
              <Link
                href="/mensagens"
                aria-label="Mensagens e notificações"
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
              >
                <Bell size={15} />
                {(mensagensCount + notificacoesCount) > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />
                )}
              </Link>
            </DicaBotao>
            <DicaBotao texto="Configurações">
              <Link
                href="/configuracoes"
                aria-label="Configurações"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
              >
                <Settings size={15} />
              </Link>
            </DicaBotao>
            <DicaBotao texto="Buscar">
              <button
                type="button"
                onClick={abrirBusca}
                aria-label="Buscar"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
              >
                <Search size={15} />
              </button>
            </DicaBotao>
          </div>
        </header>

        <section className="relative order-2 flex min-h-[8.5rem] flex-col justify-between overflow-hidden rounded-[1.35rem] bg-[#141816] p-4 text-white lg:col-start-1 lg:row-start-2">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_60%_0%,rgba(190,220,90,0.32),transparent_60%)]" />
          <div className="relative z-[1] flex items-center gap-3">
            {(emAtendimento || proximoAgendamento) && (
              <FotoPaciente
                nome={(emAtendimento ? pacienteCurso : proximoAgendamento?.pacientes)?.nome}
                url={(emAtendimento ? pacienteCurso : proximoAgendamento?.pacientes)?.foto_url}
                claro
                grande
              />
            )}
            <div className="min-w-0">
              {emAtendimento ? (
                <>
                  <p className="text-sm text-neutral-300">Em atendimento · {hora(emAtendimento.data_hora)}</p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-white">{pacienteCurso?.nome || 'Paciente'}</h2>
                  <p className="mt-0.5 truncate text-sm text-neutral-300">
                    {emAtendimento.procedimento || 'Consulta'}
                    {anosCurso != null ? ` · ${anosCurso} anos` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-neutral-300">Nenhum atendimento agora</p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-white">
                    {proximoAgendamento?.pacientes?.nome || 'Nenhum paciente em curso'}
                  </h2>
                  <p className="mt-0.5 text-sm text-neutral-300">
                    {proximoAgendamento
                      ? `Próxima consulta · ${hora(proximoAgendamento.data_hora)} · ${proximoAgendamento.procedimento || 'Consulta'}`
                      : 'Abra a agenda e encaixe o próximo paciente.'}
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="relative z-[1] mt-3 flex flex-wrap gap-2">
            {emAtendimento ? (
              <>
                <button
                  type="button"
                  onClick={concluirAtual}
                  disabled={concluindo}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-neutral-900 disabled:opacity-60"
                >
                  {concluindo ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Concluir
                </button>
                <button
                  type="button"
                  onClick={() => openPatient(pacienteCurso?.id)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/25 px-4 text-sm font-medium text-white"
                >
                  <FileText size={15} />
                  Ficha
                </button>
              </>
            ) : (
              <Link href="/agenda" className="inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-medium text-neutral-900">
                Ver agenda
              </Link>
            )}
          </div>
        </section>

        <aside className="order-3 flex flex-col lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:min-h-0">
          <div className="flex items-center justify-between gap-1">
            <button type="button" aria-label="Mês anterior" onClick={() => mudarMes(-1)} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-white">
              <ChevronLeft size={16} />
            </button>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium capitalize text-neutral-900">{rotuloMes}</span>
            <button type="button" aria-label="Próximo mês" onClick={() => mudarMes(1)} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-white">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wide text-neutral-400">
            {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((dia) => (
              <span key={dia}>{dia}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-y-0.5">
            {celulas.map((dia, indice) => {
              if (!dia) return <span key={`vazio-${indice}`} />;
              const iso = isoLocal(new Date(mesCursor.ano, mesCursor.mes, dia));
              const ehHoje = iso === hojeISO;
              const ehSel = iso === diaISO;
              const temConsulta = marcados.includes(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => escolherDia(iso)}
                  className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                    ehHoje ? 'bg-neutral-900 font-semibold text-white' : ehSel ? 'bg-neutral-200 font-medium text-neutral-900' : 'text-neutral-700 hover:bg-white'
                  }`}
                >
                  {dia}
                  {temConsulta && !ehHoje && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-neutral-400" />}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setModalAgenda(true)}
              className="inline-flex h-9 min-w-0 flex-1 items-center justify-center rounded-full bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Novo agendamento
            </button>
            <DicaBotao texto="Atualizar">
              <button
                type="button"
                aria-label="Atualizar"
                onClick={() => carregar({ silent: true })}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50"
              >
                <RefreshCw size={15} />
              </button>
            </DicaBotao>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold capitalize text-neutral-900">{rotuloLinha}</p>
            <p className="text-xs text-neutral-500">
              {diaISO !== hojeISO && (
                <button type="button" onClick={() => escolherDia(hojeISO)} className="mr-2 font-medium text-neutral-500 hover:text-neutral-900">
                  Hoje
                </button>
              )}
              Linha do dia
            </p>
          </div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col max-lg:max-h-[28rem]">
            {carregandoDia ? (
              <div className="space-y-2">
                <div className="h-12 animate-pulse rounded-xl bg-white" />
                <div className="h-12 animate-pulse rounded-xl bg-white" />
              </div>
            ) : listaDia.length === 0 ? (
              <p className="rounded-xl bg-white px-3 py-3 text-sm text-neutral-400">Nenhuma consulta neste dia.</p>
            ) : (
              <ul ref={listaRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
                {listaDia.map((ag) => {
                  const aberto = selecionado?.id === ag.id;
                  const ehAtual = emAtendimento?.id === ag.id;
                  const paciente = ag.pacientes;
                  const anosPaciente = idade(paciente?.data_nascimento);
                  const alergia = alergiaDe(detalheAtual?.ficha);
                  const temAlergia = aberto && !!detalheAtual && alergia !== 'Nenhuma registrada' && alergia !== 'Não informado';
                  const zap = whatsAppDe(paciente?.telefone);
                  const contexto = ehAtual ? 'Em atendimento' : diaISO === hojeISO && proximoAgendamento?.id === ag.id ? 'Próximo' : rotuloStatus(ag.status);
                  return (
                    <li
                      key={ag.id}
                      data-aberto={aberto ? '1' : '0'}
                      style={recorte > 0 ? { minHeight: aberto ? recorte : 0 } : undefined}
                      className={`flex flex-col transition-[min-height] duration-300 ease-out ${aberto && recorte === 0 ? 'min-h-0 flex-1' : 'shrink-0'}`}
                    >
                      <div className={`flex min-h-0 flex-col rounded-xl bg-white ${aberto ? 'h-full shadow-sm ring-1 ring-black/5' : ''}`}>
                        <button type="button" onClick={() => alternarPaciente(ag.id)} className="flex w-full shrink-0 items-center gap-2.5 px-3 py-2 text-left">
                          <span className="w-11 shrink-0 text-sm font-semibold tabular-nums text-neutral-900">{hora(ag.data_hora)}</span>
                          <FotoPaciente nome={paciente?.nome} url={paciente?.foto_url} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm text-neutral-900 ${aberto ? 'font-semibold' : 'font-medium'}`}>{paciente?.nome || 'Consulta'}</span>
                            <span className="block truncate text-xs text-neutral-500">
                              {aberto
                                ? `${contexto}${anosPaciente != null ? ` · ${anosPaciente} anos` : ''} · ${planoNome(paciente?.planos)}`
                                : ag.procedimento || 'Consulta'}
                            </span>
                          </span>
                        </button>
                        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${aberto ? 'min-h-0 flex-1 grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                          <div className="overflow-hidden" inert={aberto ? undefined : true}>
                            <div className="flex h-full min-h-0 flex-col px-3 pb-3">
                              <dl className="space-y-1.5 border-t border-black/5 pt-2 text-xs">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <dt className="text-neutral-400">Procedimento</dt>
                                    <dd className="text-neutral-800">{ag.procedimento || 'Consulta'}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-neutral-400">Status</dt>
                                    <dd className="text-neutral-800">{rotuloStatus(ag.status)}</dd>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <dt className="text-neutral-400">Telefone</dt>
                                    <dd className="truncate text-neutral-800">{paciente?.telefone || '—'}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-neutral-400">Valor</dt>
                                    <dd className="text-neutral-800">{ag.valor_final != null ? moeda(ag.valor_final) : '—'}</dd>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <dt className="text-neutral-400">Última visita</dt>
                                    <dd className="text-neutral-800">{detalheAtual?.ultima || '—'}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-neutral-400">Saldo</dt>
                                    <dd className={detalheAtual && detalheAtual.saldo > 0 ? 'font-medium text-red-600' : 'text-neutral-800'}>
                                      {detalheAtual ? moeda(detalheAtual.saldo) : '—'}
                                    </dd>
                                  </div>
                                </div>
                                <div>
                                  <dt className="text-neutral-400">Alergias</dt>
                                  <dd className={`line-clamp-2 ${temAlergia ? 'font-medium text-amber-700' : 'text-neutral-800'}`}>{detalheAtual ? alergia : '—'}</dd>
                                </div>
                                {ag.observacoes ? (
                                  <div>
                                    <dt className="text-neutral-400">Observações</dt>
                                    <dd className="line-clamp-3 text-neutral-600">{ag.observacoes}</dd>
                                  </div>
                                ) : null}
                              </dl>
                              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                                {paciente?.id && (
                                  <button
                                    type="button"
                                    onClick={() => openPatient(paciente.id)}
                                    className="inline-flex h-8 items-center gap-1 rounded-full border border-black/10 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                                  >
                                    <FileText size={12} />
                                    Ficha
                                  </button>
                                )}
                                {zap && (
                                  <a
                                    href={zap}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-8 items-center rounded-full border border-black/10 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                                  >
                                    WhatsApp
                                  </a>
                                )}
                                {detalheAtual && detalheAtual.saldo > 0 && paciente?.id && (
                                  <Link
                                    href={`/pacientes/${paciente.id}`}
                                    className="inline-flex h-8 items-center rounded-full bg-neutral-900 px-3 text-xs font-medium text-white"
                                  >
                                    Receber
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Link
            href="/agenda"
            className="mt-2 inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Ver agenda
          </Link>
        </aside>

        <div className="order-4 grid gap-2.5 sm:grid-cols-2 lg:col-start-1 lg:row-start-3 lg:min-h-0 lg:gap-3">
          <div className="flex flex-col gap-2.5 lg:min-h-0 lg:gap-3">
            <section className={`${card} shrink-0 p-4`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-500">Consultas do dia</p>
                {loading && !jaCarregou.current ? (
                  <span className="h-5 w-20 animate-pulse rounded-full bg-neutral-100" />
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">{concluidasDia} concluídas</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
                {loading && !jaCarregou.current ? (
                  <div className="h-10 w-20 animate-pulse rounded-xl bg-neutral-100" />
                ) : (
                  <p className="text-4xl font-semibold leading-none tracking-tight text-neutral-900">
                    {concluidasDia}
                    <span className="text-neutral-300">/{consultasDia}</span>
                  </p>
                )}
                <PillMeter ratio={ratioConsultas} accent="lime" />
              </div>
            </section>

            <section className={`${card} flex min-h-[14rem] flex-col p-4 lg:min-h-0 lg:flex-1`}>
              <div className="flex shrink-0 items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-neutral-900">Tarefas</h2>
                <Link href="/tarefas" className="text-xs font-medium text-neutral-500 hover:text-neutral-900">
                  Ver todas
                </Link>
              </div>
              <p className="shrink-0 text-xs text-neutral-500">Hoje e próximas a vencer</p>
              <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
                {tarefasCarregando ? (
                  <li className="space-y-2">
                    <div className="h-10 animate-pulse rounded-xl bg-neutral-100" />
                    <div className="h-10 animate-pulse rounded-xl bg-neutral-100" />
                  </li>
                ) : tarefasDia.length === 0 ? (
                  <li className="py-2 text-sm text-neutral-400">Nenhuma tarefa com prazo.</li>
                ) : (
                  tarefasDia.map((tarefa) => {
                    const dia = String(tarefa.data_limite).slice(0, 10);
                    const atrasada = dia < hojeTarefa;
                    const hoje = dia === hojeTarefa;
                    const quando = atrasada
                      ? 'Atrasada'
                      : hoje
                        ? 'Hoje'
                        : new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                    return (
                      <li key={tarefa.id} className="flex items-start gap-2 rounded-xl px-1.5 py-1.5 hover:bg-neutral-50">
                        <button
                          type="button"
                          aria-label={`Concluir ${tarefa.titulo}`}
                          onClick={() => concluirTarefa(tarefa.id)}
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-transparent hover:border-neutral-900 hover:text-neutral-900"
                        >
                          <Check size={10} />
                        </button>
                        <Link href="/tarefas" className="min-w-0 flex-1">
                          <p className="truncate text-sm text-neutral-900">{tarefa.titulo}</p>
                          {(tarefa.paciente_nome || tarefa.responsavel_nome) && (
                            <p className="truncate text-xs text-neutral-500">{tarefa.paciente_nome || tarefa.responsavel_nome}</p>
                          )}
                        </Link>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            atrasada ? 'bg-red-50 text-red-600' : hoje ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {quando}
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          </div>

          <div className="flex flex-col gap-2.5 lg:min-h-0 lg:gap-3">
            <section className={`${card} flex min-h-[20rem] flex-col overflow-hidden p-4 lg:min-h-0 lg:flex-[1.6]`}>
              <h2 className="shrink-0 text-base font-semibold text-neutral-900">Calculadora de taxas</h2>
              <div className="mt-2 grid shrink-0 grid-cols-2 items-end gap-2">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">R$</span>
                  <input
                    value={calcValor}
                    onChange={(ev) => setCalcValor(ev.target.value)}
                    inputMode="decimal"
                    aria-label="Valor"
                    placeholder="0,00"
                    className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className={rotulo}>Taxa</label>
                  <CustomSelect
                    value={calcGrupo}
                    onChange={setCalcGrupo}
                    options={gruposTaxa}
                    placeholder="Taxa"
                  />
                </div>
              </div>
              <div className="mt-2 grid shrink-0 grid-cols-[minmax(0,1fr)_4.75rem_5.25rem_5.25rem] gap-1.5 border-b border-black/5 px-1 pb-1 text-[11px] font-medium text-neutral-400">
                <span>Forma</span>
                <span className="text-right">Parcela</span>
                <span className="text-right">Você recebe</span>
                <span className="text-right">Cobrar</span>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {formasCalc.length === 0 ? (
                  <li className="px-1 py-2 text-sm text-neutral-400">Cadastre as taxas em Configurações.</li>
                ) : (
                  formasCalc.map((taxa) => {
                    const recebe = valorCalc * (1 - taxa.taxa / 100);
                    const cobrar = taxa.taxa < 100 ? valorCalc / (1 - taxa.taxa / 100) : valorCalc;
                    return (
                      <li key={taxa.id} className="grid grid-cols-[minmax(0,1fr)_4.75rem_5.25rem_5.25rem] items-center gap-1.5 border-b border-black/[0.03] px-1 py-1.5 text-xs tabular-nums">
                        <span className="min-w-0 truncate text-neutral-800">
                          {taxa.nome}
                          <span className="text-neutral-400"> · {taxa.taxa.toLocaleString('pt-BR')}%</span>
                        </span>
                        <span className="text-right text-neutral-500">{taxa.parcelas > 1 ? moeda(valorCalc / taxa.parcelas) : '—'}</span>
                        <span className="text-right font-medium text-neutral-900">{moeda(recebe)}</span>
                        <span className="text-right text-neutral-500">{moeda(cobrar)}</span>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
            <section className={`${card} hidden lg:block lg:flex-1`} aria-hidden />
          </div>
        </div>
      </div>
      <ModalNovoAgendamento
        open={modalAgenda}
        onClose={() => setModalAgenda(false)}
        onSaved={() => {
          avisar('Agendamento salvo.');
          carregar({ silent: true });
        }}
      />
    </div>
  );
}
