'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
import {
  ArrowUpRight,
  Check,
  FileText,
  Loader2,
  MoreHorizontal,
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

type Tratamento = { id: string; procedimento: string; status: string };
type Pendencia = { id: string; titulo: string; detalhe: string; href: string };

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

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [agendaHoje, setAgendaHoje] = useState<AgendaItem[]>([]);
  const [tratamentos, setTratamentos] = useState<Tratamento[]>([]);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [ultimaVisita, setUltimaVisita] = useState<string | null>(null);
  const [saldoAberto, setSaldoAberto] = useState(0);
  const [financeiro, setFinanceiro] = useState({ recebido: 0, pagamentos: 0, previsto: 0, restantes: 0, atraso: 0, atrasados: 0 });
  const [horas, setHoras] = useState<{ hora: number; valor: number }[]>([]);
  const [concluindo, setConcluindo] = useState(false);
  const { activeClinicId, activeClinic, loading: clinicLoading } = useClinica();

  useEffect(() => {
    if (!clinicLoading) carregar();
  }, [clinicLoading, activeClinicId]);

  async function idsClinica() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [] as number[];
    const { data: prof } = await supabase.from('profissionais').select('id').eq('user_id', user.id).single();
    if (!prof) return [];
    const { data: vinculos } = await supabase.from('profissionais_clinicas').select('clinica_id').eq('profissional_id', prof.id);
    const permitidos = (vinculos || []).map((v) => v.clinica_id);
    if (activeClinicId && activeClinicId !== 'all') {
      return permitidos.includes(Number(activeClinicId)) ? [Number(activeClinicId)] : permitidos;
    }
    return permitidos;
  }

  async function carregar() {
    setLoading(true);
    const filtros = await idsClinica();
    if (filtros.length === 0) {
      setLoading(false);
      return;
    }

    const hoje = new Date().toISOString().split('T')[0];
    const agora = new Date();

    const [agendaRes, fiadosRes, tarefasRes] = await Promise.all([
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
      supabase
        .from('tarefas')
        .select('id, titulo, data_limite, status')
        .in('clinica_id', filtros)
        .neq('status', 'concluido')
        .order('data_limite', { ascending: true })
        .limit(5),
    ]);

    const hojeLista = ((agendaRes.data as AgendaItem[]) || []).filter((a) => a.status !== 'cancelado');
    setAgendaHoje(hojeLista);

    const atuais = hojeLista.filter((a) => a.status !== 'concluido');
    const emCurso = atuais.find((a) => new Date(a.data_hora).getTime() <= agora.getTime()) || atuais[0] || null;
    const pacienteId = emCurso?.pacientes?.id;

    if (pacienteId) {
      const [{ data: trats }, { data: historico }, { data: debitos }] = await Promise.all([
        supabase.from('paciente_tratamentos').select('id, procedimento, status').eq('paciente_id', pacienteId).order('criado_em', { ascending: false }).limit(6),
        supabase.from('agendamentos').select('data_hora').eq('paciente_id', pacienteId).eq('status', 'concluido').order('data_hora', { ascending: false }).limit(1),
        supabase.from('agendamentos').select('valor_final').eq('paciente_id', pacienteId).eq('status', 'fiado'),
      ]);
      setTratamentos((trats as Tratamento[]) || []);
      setUltimaVisita(historico?.[0]?.data_hora ? new Date(historico[0].data_hora).toLocaleDateString('pt-BR') : null);
      setSaldoAberto((debitos || []).reduce((acc, i) => acc + (i.valor_final || 0), 0));
    } else {
      setTratamentos([]);
      setUltimaVisita(null);
      setSaldoAberto(0);
    }

    const concluidos = hojeLista.filter((a) => a.status === 'concluido');
    const futuros = hojeLista.filter((a) => a.status !== 'concluido' && new Date(a.data_hora).getTime() >= agora.getTime());
    const mapaHoras = new Map<number, number>();
    for (let h = 8; h <= 16; h += 1) mapaHoras.set(h, 0);
    concluidos.forEach((a) => {
      const h = new Date(a.data_hora).getHours();
      if (mapaHoras.has(h)) mapaHoras.set(h, (mapaHoras.get(h) || 0) + (a.valor_final || 0));
    });

    setHoras(Array.from(mapaHoras.entries()).map(([horaNum, valor]) => ({ hora: horaNum, valor })));
    setFinanceiro({
      recebido: concluidos.reduce((acc, a) => acc + (a.valor_final || 0), 0),
      pagamentos: concluidos.length,
      previsto: futuros.reduce((acc, a) => acc + (a.valor_final || 0), 0),
      restantes: futuros.length,
      atraso: (fiadosRes.data || []).reduce((acc, a) => acc + (a.valor_final || 0), 0),
      atrasados: (fiadosRes.data || []).length,
    });

    const pend: Pendencia[] = [];
    hojeLista.filter((a) => a.status === 'agendado').slice(0, 3).forEach((a) => {
      pend.push({
        id: `conf-${a.id}`,
        titulo: a.pacientes?.nome || 'Paciente',
        detalhe: `${hora(a.data_hora)} · Aguardando confirmação`,
        href: a.pacientes?.id ? `/pacientes/${a.pacientes.id}` : '/agenda',
      });
    });
    (fiadosRes.data || []).slice(0, 3).forEach((a: any) => {
      pend.push({
        id: `deb-${a.id}`,
        titulo: a.pacientes?.nome || 'Paciente',
        detalhe: `Débito em aberto · ${moeda(a.valor_final || 0)}`,
        href: a.pacientes?.id ? `/pacientes/${a.pacientes.id}` : '/financeiro',
      });
    });
    (tarefasRes.data || []).slice(0, 2).forEach((t: any) => {
      const atrasada = t.data_limite && new Date(`${t.data_limite}T12:00:00`).getTime() < Date.now();
      pend.push({
        id: `tar-${t.id}`,
        titulo: t.titulo,
        detalhe: atrasada ? 'Tarefa atrasada' : t.data_limite ? `Até ${new Date(`${t.data_limite}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Tarefa pendente',
        href: '/tarefas',
      });
    });
    setPendencias(pend.slice(0, 6));
    setLoading(false);
  }

  const emAtendimento = useMemo(() => {
    const agora = Date.now();
    const abertos = agendaHoje.filter((a) => a.status !== 'concluido');
    return abertos.find((a) => new Date(a.data_hora).getTime() <= agora) || abertos[0] || null;
  }, [agendaHoje]);

  async function concluirAtual() {
    if (!emAtendimento) return;
    setConcluindo(true);
    await supabase.from('agendamentos').update({ status: 'concluido' }).eq('id', emAtendimento.id);
    await carregar();
    setConcluindo(false);
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-[#aeaeb2]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const dataTitulo = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const clinicaNome = activeClinic && activeClinic.id !== 'all' ? (activeClinic as any).nome : 'Todas as clínicas';
  const maxBarra = Math.max(1, ...horas.map((h) => h.valor));
  const paciente = emAtendimento?.pacientes;
  const anos = idade(paciente?.data_nascimento);

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5 pb-10 font-poppins">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[#1d1d1f] md:text-[26px]">Visão Geral</h1>
          <p className="mt-0.5 text-[13px] capitalize text-[#6e6e73]">
            {dataTitulo} · {clinicaNome}
          </p>
        </div>
        <Link href="/agenda" className="inline-flex h-9 items-center gap-1.5 self-start rounded-full bg-ortus-blue px-3.5 text-[13px] font-medium text-white sm:bg-transparent sm:px-0 sm:text-ortus-blue sm:hover:underline">
          <span className="sm:hidden">Novo agendamento</span>
          <span className="hidden sm:inline-flex items-center gap-1">Abrir agenda <ArrowUpRight size={14} /></span>
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-black/[0.06] bg-white p-4 md:p-5">
            {emAtendimento ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] text-[#6e6e73]">
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#1e8e3e] align-middle" />
                      Em atendimento · {hora(emAtendimento.data_hora)}
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
                      <Check size={15} />
                      Concluir
                    </button>
                    <Link
                      href={paciente?.id ? `/pacientes/${paciente.id}` : '/agenda'}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] text-[#6e6e73] hover:bg-[#f5f5f7]"
                      title="Abrir ficha"
                    >
                      <FileText size={15} />
                    </Link>
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

                {emAtendimento.observacoes && (
                  <p className="mt-4 text-[12px] text-[#6e6e73]">
                    Observações: {emAtendimento.observacoes}
                  </p>
                )}
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
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-[15px] font-semibold text-[#1d1d1f]">Saúde financeira</h3>
                <span className="rounded-full bg-[#f5f5f7] px-2.5 py-0.5 text-[12px] font-medium text-[#1d1d1f]">Hoje</span>
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
                <p className="text-[12px] text-[#6e6e73]">{financeiro.restantes} atendimento{financeiro.restantes === 1 ? '' : 's'} até o fim do dia</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#aeaeb2]">Em atraso</p>
                <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#ea8600]">{moeda(financeiro.atraso)}</p>
                <p className="text-[12px] text-[#6e6e73]">{financeiro.atrasados} paciente{financeiro.atrasados === 1 ? '' : 's'}</p>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-[12px] text-[#6e6e73]">
                <span>Recebimentos por hora · Hoje</span>
              </div>
              <div className="flex h-24 items-end gap-1.5 sm:gap-2">
                {horas.map((item) => (
                  <div key={item.hora} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-sm bg-ortus-blue/80"
                      style={{ height: `${Math.max(item.valor > 0 ? 12 : 4, (item.valor / maxBarra) * 72)}px` }}
                    />
                    <span className="text-[10px] text-[#aeaeb2]">{String(item.hora).padStart(2, '0')}</span>
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
            {agendaHoje.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-[#aeaeb2]">Nenhuma consulta hoje.</p>
            ) : (
              <ul>
                {agendaHoje.map((ag) => {
                  const atual = emAtendimento?.id === ag.id;
                  return (
                    <li key={ag.id}>
                      <Link
                        href={ag.pacientes?.id ? `/pacientes/${ag.pacientes.id}` : '/agenda'}
                        className={`grid grid-cols-[52px_1fr] gap-2 border-t border-black/[0.05] px-4 py-2.5 ${atual ? 'bg-[#eaf2fd]' : 'hover:bg-[#fafafa]'}`}
                      >
                        <span className="text-[13px] font-medium tabular-nums text-[#1d1d1f]">{hora(ag.data_hora)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[#1d1d1f]">{ag.pacientes?.nome || 'Horário'}</p>
                          <p className="truncate text-[12px] text-[#6e6e73]">
                            {ag.status === 'concluido' ? 'Concluído · ' : ''}
                            {ag.procedimento || 'Consulta'}
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
    </div>
  );
}
