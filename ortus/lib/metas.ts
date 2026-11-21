/**
 * Meta de vendas: quanto a clínica quer aprovar em orçamentos no mês (no
 * total e por profissional), quanto já foi aprovado, quanto falta, o ritmo
 * e, à parte, quanto entrou no caixa.
 *
 * "Aprovado" é o valor final dos orçamentos aprovados no mês (aprovado_em).
 * "Entrou no caixa" é dinheiro recebido no mês:
 * - consulta concluída, pela data do pagamento (ou pelo dia da consulta
 *   quando a data do pagamento não foi guardada — pagou na hora);
 * - débito do paciente pago, pela data do pagamento (só os sem consulta
 *   ligada; os outros já entram pela consulta);
 * - entrada manual concluída, pela data do lançamento.
 * Os meses seguem o horário de Brasília, como o Financeiro.
 */
import { dados as tabelas } from '@/lib/local/consulta';
import { lerTudo } from '@/lib/paginar';
import { FUSO_PADRAO, instanteLocal } from '@/lib/fuso';
import { centavos, numero } from '@/lib/orcamentos';

export type MetaVendas = {
  id: string;
  clinica_id: number;
  mes: string;
  profissional_id: number | null;
  valor: number;
};

export type ResumoMeta = {
  mes: string;
  metaTotal: number | null;
  metasPorProfissional: Map<number, number>;
  aprovado: number;
  aprovadoPorProfissional: Map<number, number>;
  caixa: number;
  falta: number | null;
  /** Quanto já devia estar aprovado hoje, no ritmo da meta. */
  esperadoAteHoje: number | null;
  /** Para onde vai o mês se o ritmo continuar. */
  projecao: number | null;
  diaAtual: number;
  diasNoMes: number;
};

/** AAAA-MM do dia (AAAA-MM-DD). */
export function mesDoDia(dia: string): string {
  return dia.slice(0, 7);
}

export function diasNoMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export function proximoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

/** Início do mês em Brasília, em UTC (ISO). */
export function inicioDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return instanteLocal(a, m, 1, 0, 0, FUSO_PADRAO).toISOString();
}

export function rotuloDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const nome = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${a}`;
}

/** Dia do mês que já passou (o mês corrente conta até hoje; mês passado, inteiro; mês futuro, zero). */
export function diaCorrido(mes: string, hoje: string): number {
  const total = diasNoMes(mes);
  const mesHoje = mesDoDia(hoje);
  if (mes < mesHoje) return total;
  if (mes > mesHoje) return 0;
  return Number(hoje.slice(8, 10));
}

export function calcularRitmo(meta: number | null, aprovado: number, mes: string, hoje: string) {
  const total = diasNoMes(mes);
  const dia = diaCorrido(mes, hoje);
  return {
    diaAtual: dia,
    diasNoMes: total,
    esperadoAteHoje: meta == null ? null : centavos((meta * dia) / total),
    projecao: dia > 0 ? centavos((aprovado / dia) * total) : null,
  };
}

type OrcAprovado = { valor_total: number | string | null; profissional_id: number | null; aprovado_em: string | null; status: string };

/** Soma dos orçamentos aprovados entre dois instantes (ISO), no total e por profissional. */
export function calcularAprovado(orcamentos: OrcAprovado[], inicio: string, fim: string) {
  const ini = new Date(inicio).getTime();
  const ate = new Date(fim).getTime();
  let total = 0;
  const porProfissional = new Map<number, number>();
  for (const o of orcamentos) {
    if (o.status !== 'aprovado' || !o.aprovado_em) continue;
    const t = new Date(o.aprovado_em).getTime();
    if (!(t >= ini && t < ate)) continue;
    const v = numero(o.valor_total);
    total += v;
    if (o.profissional_id != null) {
      const id = Number(o.profissional_id);
      porProfissional.set(id, centavos((porProfissional.get(id) || 0) + v));
    }
  }
  return { total: centavos(total), porProfissional };
}

export type AgendamentoCaixa = {
  status: string | null;
  data_hora: string;
  data_pagamento?: string | null;
  valor_liquido?: number | string | null;
  valor_final?: number | string | null;
  valor?: number | string | null;
  tipo_registro?: string | null;
  observacoes?: string | null;
};
export type DebitoCaixa = { status: string | null; data_pagamento: string | null; valor: number | string | null; agendamento_id?: number | null };
export type EntradaCaixa = { tipo: string | null; status: string | null; data: string | null; valor: number | string | null };

/** Dinheiro que entrou entre dois instantes (ISO). Ver o comentário do arquivo. */
export function calcularCaixa(
  dados: { agendamentos: AgendamentoCaixa[]; debitos: DebitoCaixa[]; entradas: EntradaCaixa[] },
  inicio: string,
  fim: string,
): number {
  const ini = new Date(inicio).getTime();
  const ate = new Date(fim).getTime();
  const dentro = (valor: string | null | undefined) => {
    if (!valor) return false;
    const t = new Date(valor).getTime();
    return t >= ini && t < ate;
  };
  let soma = 0;
  for (const a of dados.agendamentos) {
    if (a.status !== 'concluido') continue;
    if (a.tipo_registro === 'debito_manual' || a.observacoes === 'Débito manual') continue;
    const quando = a.data_pagamento || a.data_hora;
    if (!dentro(quando)) continue;
    soma += numero(a.valor_liquido ?? a.valor_final ?? a.valor);
  }
  for (const d of dados.debitos) {
    if (d.status !== 'pago' || d.agendamento_id != null) continue;
    if (dentro(d.data_pagamento)) soma += numero(d.valor);
  }
  for (const e of dados.entradas) {
    if (e.tipo !== 'entrada' || e.status !== 'concluido' || !e.data) continue;
    // A data da entrada manual é um dia (AAAA-MM-DD): meio-dia em Brasília cai no mesmo dia.
    if (dentro(`${String(e.data).slice(0, 10)}T15:00:00Z`)) soma += numero(e.valor);
  }
  return centavos(soma);
}

export async function carregarMetas(clinicaIds: number[], mes: string): Promise<MetaVendas[]> {
  if (clinicaIds.length === 0) return [];
  const { data, error } = await tabelas.from('metas_vendas')
    .select('id, clinica_id, mes, profissional_id, valor')
    .in('clinica_id', clinicaIds)
    .eq('mes', `${mes}-01`);
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    clinica_id: Number(m.clinica_id),
    mes: String(m.mes).slice(0, 10),
    profissional_id: m.profissional_id == null ? null : Number(m.profissional_id),
    valor: numero(m.valor),
  }));
}

/**
 * Grava as metas de um mês de uma clínica: o total e as de cada
 * profissional. Valor vazio (null) apaga a meta. Não usa upsert: os índices
 * únicos são parciais (total e por profissional) e o banco local não os tem.
 */
export async function salvarMetas(
  clinicaId: number,
  mes: string,
  total: number | null,
  porProfissional: Map<number, number | null>,
): Promise<void> {
  const atuais = await carregarMetas([clinicaId], mes);
  const gravar = async (profissionalId: number | null, valor: number | null) => {
    const atual = atuais.find((m) => m.profissional_id === profissionalId);
    if (valor == null || valor <= 0) {
      if (atual) {
        const { error } = await tabelas.from('metas_vendas').delete().eq('id', atual.id);
        if (error) throw new Error(error.message);
      }
      return;
    }
    if (atual) {
      if (atual.valor === valor) return;
      const { error } = await tabelas.from('metas_vendas').update({ valor }).eq('id', atual.id);
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await tabelas.from('metas_vendas').insert({
      id: crypto.randomUUID(),
      clinica_id: clinicaId,
      mes: `${mes}-01`,
      profissional_id: profissionalId,
      valor,
    });
    if (error) throw new Error(error.message);
  };
  await gravar(null, total);
  for (const [id, valor] of porProfissional) await gravar(id, valor);
}

/** Tudo que o cartão "Meta do mês" mostra, lido do banco (nuvem ou desktop). */
export async function carregarResumoMeta(opts: { clinicaIds: number[]; mes: string; hoje: string }): Promise<ResumoMeta> {
  const { clinicaIds, mes, hoje } = opts;
  const inicio = inicioDoMes(mes);
  const fim = inicioDoMes(proximoMes(mes));
  const vazio = (): ResumoMeta => ({
    mes, metaTotal: null, metasPorProfissional: new Map(), aprovado: 0, aprovadoPorProfissional: new Map(), caixa: 0,
    falta: null, esperadoAteHoje: null, projecao: null, diaAtual: diaCorrido(mes, hoje), diasNoMes: diasNoMes(mes),
  });
  if (clinicaIds.length === 0) return vazio();

  type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  const [metas, orcamentos, pagos, semData, debitos, entradas] = await Promise.all([
    carregarMetas(clinicaIds, mes),
    lerTudo<OrcAprovado>((de, ate) => tabelas.from('orcamentos')
      .select('valor_total, profissional_id, aprovado_em, status')
      .in('clinica_id', clinicaIds).eq('status', 'aprovado')
      .gte('aprovado_em', inicio).lt('aprovado_em', fim)
      .order('aprovado_em').order('id').range(de, ate) as unknown as Pagina<OrcAprovado>),
    lerTudo<AgendamentoCaixa>((de, ate) => tabelas.from('agendamentos')
      .select('status, data_hora, data_pagamento, valor_liquido, valor_final, valor, tipo_registro, observacoes')
      .in('clinica_id', clinicaIds).eq('status', 'concluido')
      .gte('data_pagamento', inicio).lt('data_pagamento', fim)
      .order('data_pagamento').order('id').range(de, ate) as unknown as Pagina<AgendamentoCaixa>),
    lerTudo<AgendamentoCaixa>((de, ate) => tabelas.from('agendamentos')
      .select('status, data_hora, data_pagamento, valor_liquido, valor_final, valor, tipo_registro, observacoes')
      .in('clinica_id', clinicaIds).eq('status', 'concluido').is('data_pagamento', null)
      .gte('data_hora', inicio).lt('data_hora', fim)
      .order('data_hora').order('id').range(de, ate) as unknown as Pagina<AgendamentoCaixa>),
    lerTudo<DebitoCaixa>((de, ate) => tabelas.from('paciente_debitos')
      .select('status, data_pagamento, valor, agendamento_id')
      .in('clinica_id', clinicaIds).eq('status', 'pago').is('agendamento_id', null)
      .gte('data_pagamento', inicio).lt('data_pagamento', fim)
      .order('data_pagamento').order('id').range(de, ate) as unknown as Pagina<DebitoCaixa>),
    lerTudo<EntradaCaixa>((de, ate) => tabelas.from('despesas')
      .select('tipo, status, data, valor')
      .in('clinica_id', clinicaIds).eq('tipo', 'entrada').eq('status', 'concluido')
      .gte('data', `${mes}-01`).lt('data', `${proximoMes(mes)}-01`)
      .order('data').order('id').range(de, ate) as unknown as Pagina<EntradaCaixa>),
  ]);

  const total = metas.filter((m) => m.profissional_id == null).reduce((s, m) => s + m.valor, 0);
  const metaTotal = metas.some((m) => m.profissional_id == null) ? centavos(total) : null;
  const metasPorProfissional = new Map<number, number>();
  for (const m of metas) {
    if (m.profissional_id != null) metasPorProfissional.set(m.profissional_id, centavos((metasPorProfissional.get(m.profissional_id) || 0) + m.valor));
  }
  const aprovado = calcularAprovado(orcamentos, inicio, fim);
  const caixa = calcularCaixa({ agendamentos: [...pagos, ...semData], debitos, entradas }, inicio, fim);
  const ritmo = calcularRitmo(metaTotal, aprovado.total, mes, hoje);
  return {
    mes,
    metaTotal,
    metasPorProfissional,
    aprovado: aprovado.total,
    aprovadoPorProfissional: aprovado.porProfissional,
    caixa,
    falta: metaTotal == null ? null : Math.max(0, centavos(metaTotal - aprovado.total)),
    esperadoAteHoje: ritmo.esperadoAteHoje,
    projecao: ritmo.projecao,
    diaAtual: ritmo.diaAtual,
    diasNoMes: ritmo.diasNoMes,
  };
}
