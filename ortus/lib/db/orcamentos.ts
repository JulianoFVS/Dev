/**
 * Orçamentos no banco: leitura, gravação, contatos do comercial, aprovação
 * e recusa.
 *
 * Usa `dados` (lib/local/consulta), que fala com a nuvem no navegador e com
 * o banco local no desktop. O banco local não tem RPC nem transação entre
 * linhas, então cada operação de várias linhas é feita em passos que podem
 * rodar de novo sem duplicar nada (ver aprovarOrcamento).
 *
 * Nunca embute `profissionais` a partir de orcamentos: há três chaves para
 * a mesma tabela (profissional, comercial, quem criou) e o PostgREST recusa.
 * Os nomes vêm da equipe já carregada na tela (fetchUserEquipe).
 */
import { dados as tabelas } from '@/lib/local/consulta';
import { emBlocos, lerTudo } from '@/lib/paginar';
import {
  centavos,
  formatarDia,
  numero,
  uuidDerivado,
  valorFinal,
  type CanalContato,
  type ContatoComercial,
  type MotivoContato,
  type Orcamento,
  type OrcamentoItem,
  type StatusOrcamento,
} from '@/lib/orcamentos';

const SELECT_ORCAMENTO = '*, pacientes(id, nome, telefone, responsavel_telefone)';

function erro(e: { message?: string } | null | undefined, padrao: string): Error {
  return new Error(e?.message || padrao);
}

function paraOrcamento(linha: Record<string, unknown>): Orcamento {
  return {
    ...(linha as unknown as Orcamento),
    clinica_id: Number(linha.clinica_id),
    profissional_id: linha.profissional_id == null ? null : Number(linha.profissional_id),
    comercial_id: linha.comercial_id == null ? null : Number(linha.comercial_id),
    criado_por: linha.criado_por == null ? null : Number(linha.criado_por),
    valor_total: numero(linha.valor_total),
    desconto: numero(linha.desconto),
  };
}

function paraItem(linha: Record<string, unknown>): OrcamentoItem {
  return {
    ...(linha as unknown as OrcamentoItem),
    clinica_id: Number(linha.clinica_id),
    tratamento_base_id: linha.tratamento_base_id == null ? null : Number(linha.tratamento_base_id),
    quantidade: Math.max(1, Math.round(numero(linha.quantidade) || 1)),
    valor_unitario: numero(linha.valor_unitario),
    valor_total: numero(linha.valor_total),
    ordem: Math.round(numero(linha.ordem)),
  };
}

/** Orçamentos das clínicas pedidas (todas as páginas), do mais novo para o mais antigo. */
export async function listarOrcamentos(opts: {
  clinicaIds: number[];
  pacienteId?: string;
  status?: StatusOrcamento[];
  desde?: string;
}): Promise<Orcamento[]> {
  if (opts.clinicaIds.length === 0) return [];
  const linhas = await lerTudo<Record<string, unknown>>((de, ate) => {
    let q = tabelas.from('orcamentos').select(SELECT_ORCAMENTO).in('clinica_id', opts.clinicaIds);
    if (opts.pacienteId) q = q.eq('paciente_id', opts.pacienteId);
    if (opts.status?.length) q = q.in('status', opts.status);
    if (opts.desde) q = q.gte('created_at', opts.desde);
    return q.order('created_at', { ascending: false }).order('id', { ascending: true }).range(de, ate);
  });
  return linhas.map(paraOrcamento);
}

export async function obterOrcamento(id: string): Promise<Orcamento | null> {
  const { data, error } = await tabelas.from('orcamentos').select(SELECT_ORCAMENTO).eq('id', id).maybeSingle();
  if (error) throw erro(error, 'Não foi possível abrir o orçamento.');
  return data ? paraOrcamento(data as Record<string, unknown>) : null;
}

/** Itens de vários orçamentos de uma vez, agrupados por orçamento. */
export async function listarItens(orcamentoIds: string[]): Promise<Map<string, OrcamentoItem[]>> {
  const mapa = new Map<string, OrcamentoItem[]>();
  for (const bloco of emBlocos(Array.from(new Set(orcamentoIds)))) {
    const linhas = await lerTudo<Record<string, unknown>>((de, ate) =>
      tabelas.from('orcamento_itens')
        .select('*')
        .in('orcamento_id', bloco)
        .order('orcamento_id', { ascending: true })
        .order('ordem', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate),
    );
    for (const linha of linhas) {
      const item = paraItem(linha);
      const lista = mapa.get(item.orcamento_id) || [];
      lista.push(item);
      mapa.set(item.orcamento_id, lista);
    }
  }
  return mapa;
}

export type ItemEditado = {
  id?: string;
  tratamento_base_id: number | null;
  procedimento: string;
  dente: string | null;
  quantidade: number;
  valor_unitario: number;
};

export type OrcamentoEditado = {
  id?: string;
  clinica_id: number;
  paciente_id: string;
  profissional_id: number | null;
  comercial_id: number | null;
  validade: string | null;
  desconto: number;
  observacoes: string | null;
  status?: StatusOrcamento;
  criado_por?: number | null;
};

/**
 * Cria ou atualiza o orçamento e os itens. O id do orçamento novo nasce
 * aqui, para os itens já apontarem para ele. Itens que saíram da lista são
 * apagados depois que o resto foi gravado.
 */
export async function salvarOrcamento(orc: OrcamentoEditado, itens: ItemEditado[]): Promise<Orcamento> {
  const limpos = itens
    .map((item) => ({ ...item, procedimento: item.procedimento.trim() }))
    .filter((item) => item.procedimento.length > 0);
  const total = valorFinal(limpos, orc.desconto);
  const agora = new Date().toISOString();

  const base = {
    clinica_id: orc.clinica_id,
    paciente_id: orc.paciente_id,
    profissional_id: orc.profissional_id,
    comercial_id: orc.comercial_id,
    validade: orc.validade,
    desconto: centavos(numero(orc.desconto)),
    valor_total: total,
    observacoes: orc.observacoes?.trim() || null,
  };

  let id = orc.id;
  if (!id) {
    id = crypto.randomUUID();
    const { error } = await tabelas.from('orcamentos').insert({
      id,
      ...base,
      status: orc.status || 'rascunho',
      status_desde: agora,
      criado_por: orc.criado_por ?? null,
    });
    if (error) throw erro(error, 'Não foi possível criar o orçamento.');
  } else {
    const { error } = await tabelas.from('orcamentos').update(base).eq('id', id);
    if (error) throw erro(error, 'Não foi possível salvar o orçamento.');
  }

  const atuais = (await listarItens([id])).get(id) || [];
  const manter = new Set<string>();
  for (let i = 0; i < limpos.length; i += 1) {
    const item = limpos[i];
    const quantidade = Math.max(1, Math.round(numero(item.quantidade) || 1));
    const valorUnitario = centavos(numero(item.valor_unitario));
    const payload = {
      clinica_id: orc.clinica_id,
      orcamento_id: id,
      tratamento_base_id: item.tratamento_base_id,
      procedimento: item.procedimento,
      dente: item.dente?.trim() || null,
      quantidade,
      valor_unitario: valorUnitario,
      valor_total: centavos(quantidade * valorUnitario),
      ordem: i,
    };
    if (item.id && atuais.some((a) => a.id === item.id)) {
      manter.add(item.id);
      const { error } = await tabelas.from('orcamento_itens').update(payload).eq('id', item.id);
      if (error) throw erro(error, 'Não foi possível salvar um item do orçamento.');
    } else {
      const novoId = crypto.randomUUID();
      manter.add(novoId);
      const { error } = await tabelas.from('orcamento_itens').insert({ id: novoId, ...payload });
      if (error) throw erro(error, 'Não foi possível salvar um item do orçamento.');
    }
  }
  for (const antigo of atuais) {
    if (manter.has(antigo.id) || antigo.tratamento_id) continue;
    const { error } = await tabelas.from('orcamento_itens').delete().eq('id', antigo.id);
    if (error) throw erro(error, 'Não foi possível remover um item do orçamento.');
  }

  const salvo = await obterOrcamento(id);
  if (!salvo) throw new Error('O orçamento foi gravado, mas não voltou do banco.');
  return salvo;
}

/** Troca o status (enviado, em aberto, de volta a rascunho) e marca desde quando. */
export async function mudarStatus(orc: Orcamento, status: StatusOrcamento): Promise<void> {
  if (status === 'aprovado' || status === 'recusado') {
    throw new Error('Use aprovar ou recusar.');
  }
  const agora = new Date().toISOString();
  const payload: Record<string, unknown> = { status, status_desde: agora };
  if (status === 'enviado' && !orc.enviado_em) payload.enviado_em = agora;
  const { error } = await tabelas.from('orcamentos').update(payload).eq('id', orc.id);
  if (error) throw erro(error, 'Não foi possível mudar o status.');
}

export async function excluirOrcamento(orc: Orcamento): Promise<void> {
  if (orc.status === 'aprovado') {
    throw new Error('Orçamento aprovado não pode ser excluído: ele já virou tratamento.');
  }
  const { error } = await tabelas.from('orcamentos').delete().eq('id', orc.id);
  if (error) throw erro(error, 'Não foi possível excluir o orçamento.');
}

/**
 * Aprova: cada item vira um tratamento planejado do paciente (com o
 * profissional do orçamento), o valor final vira um débito pendente e o
 * orçamento fica aprovado. Cada passo confere se já foi feito, então repetir
 * depois de uma falha no meio não duplica tratamento nem débito.
 */
export async function aprovarOrcamento(orc: Orcamento, itens: OrcamentoItem[]): Promise<void> {
  if (orc.status === 'recusado') throw new Error('Este orçamento foi recusado. Reabra-o antes de aprovar.');
  const hoje = new Date().toISOString().slice(0, 10);
  const nota = `Do orçamento aprovado em ${formatarDia(hoje)}.`;

  for (let i = 0; i < itens.length; i += 1) {
    const item = itens[i];
    const tratamentoId = item.tratamento_id || (await uuidDerivado(`orcamento-item:${item.id}`));
    const { data: existe, error: erroBusca } = await tabelas.from('paciente_tratamentos')
      .select('id')
      .eq('id', tratamentoId)
      .maybeSingle();
    if (erroBusca) throw erro(erroBusca, 'Não foi possível conferir os tratamentos.');
    if (!existe) {
      const { error } = await tabelas.from('paciente_tratamentos').insert({
        id: tratamentoId,
        paciente_id: orc.paciente_id,
        clinica_id: orc.clinica_id,
        legacy_id: `${Date.now()}${i}`,
        procedimento: item.quantidade > 1 ? `${item.procedimento} (${item.quantidade}x)` : item.procedimento,
        dente: item.dente,
        valor: item.valor_total,
        status: 'planejado',
        data: hoje,
        observacoes: nota,
        orcamento_id: orc.id,
        profissional_id: orc.profissional_id,
      });
      if (error) throw erro(error, 'Não foi possível criar o tratamento do orçamento.');
    }
    if (item.tratamento_id !== tratamentoId) {
      const { error } = await tabelas.from('orcamento_itens').update({ tratamento_id: tratamentoId }).eq('id', item.id);
      if (error) throw erro(error, 'Não foi possível ligar o item ao tratamento.');
    }
  }

  const { data: debitos, error: erroDebito } = await tabelas.from('paciente_debitos')
    .select('id')
    .eq('orcamento_id', orc.id)
    .limit(1);
  if (erroDebito) throw erro(erroDebito, 'Não foi possível conferir o débito.');
  if (!debitos || (debitos as unknown[]).length === 0) {
    if (orc.valor_total > 0) {
      const qtd = itens.length;
      const { error } = await tabelas.from('paciente_debitos').insert({
        paciente_id: orc.paciente_id,
        clinica_id: orc.clinica_id,
        descricao: `Orçamento aprovado (${qtd} ${qtd === 1 ? 'item' : 'itens'})`,
        valor: orc.valor_total,
        status: 'pendente',
        orcamento_id: orc.id,
      });
      if (error) throw erro(error, 'Não foi possível lançar o valor a receber.');
    }
  }

  const agora = new Date().toISOString();
  const { error } = await tabelas.from('orcamentos').update({
    status: 'aprovado',
    status_desde: agora,
    aprovado_em: orc.aprovado_em || agora,
    recusado_em: null,
    motivo_recusa: null,
    proximo_contato: null,
  }).eq('id', orc.id);
  if (error) throw erro(error, 'Não foi possível marcar o orçamento como aprovado.');
}

/** Recusa: o orçamento sai do funil e guarda o motivo (o histórico fica). */
export async function recusarOrcamento(orc: Orcamento, motivo: string): Promise<void> {
  if (orc.status === 'aprovado') throw new Error('Orçamento aprovado não pode ser recusado.');
  const agora = new Date().toISOString();
  const { error } = await tabelas.from('orcamentos').update({
    status: 'recusado',
    status_desde: agora,
    recusado_em: agora,
    motivo_recusa: motivo.trim() || null,
    proximo_contato: null,
  }).eq('id', orc.id);
  if (error) throw erro(error, 'Não foi possível recusar o orçamento.');
}

/** Reabre um orçamento recusado ou vencido: volta a "em aberto" com nova validade. */
export async function reabrirOrcamento(orc: Orcamento, novaValidade: string | null): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await tabelas.from('orcamentos').update({
    status: 'em_aberto',
    status_desde: agora,
    recusado_em: null,
    motivo_recusa: null,
    validade: novaValidade,
  }).eq('id', orc.id);
  if (error) throw erro(error, 'Não foi possível reabrir o orçamento.');
}

export type NovoContato = {
  clinica_id: number;
  paciente_id: string;
  orcamento_id: string | null;
  motivo: MotivoContato;
  canal: CanalContato;
  resumo: string | null;
  proximo_contato: string | null;
  feito_por: number | null;
};

/** Registra o que foi conversado e, se for de um orçamento, marca a data do contato nele. */
export async function registrarContato(contato: NovoContato): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await tabelas.from('orcamento_contatos').insert({
    id: crypto.randomUUID(),
    ...contato,
    resumo: contato.resumo?.trim() || null,
  });
  if (error) throw erro(error, 'Não foi possível registrar o contato.');
  if (contato.orcamento_id) {
    const { error: erroOrc } = await tabelas.from('orcamentos').update({
      ultimo_contato_em: agora,
      proximo_contato: contato.proximo_contato,
    }).eq('id', contato.orcamento_id);
    if (erroOrc) throw erro(erroOrc, 'O contato foi registrado, mas o orçamento não foi atualizado.');
  }
}

/** Contatos das clínicas a partir de uma data (para o funil de oportunidades). */
export async function listarContatos(opts: { clinicaIds: number[]; desde?: string; pacienteId?: string; orcamentoId?: string }): Promise<ContatoComercial[]> {
  if (opts.clinicaIds.length === 0) return [];
  const linhas = await lerTudo<Record<string, unknown>>((de, ate) => {
    let q = tabelas.from('orcamento_contatos').select('*').in('clinica_id', opts.clinicaIds);
    if (opts.desde) q = q.gte('created_at', opts.desde);
    if (opts.pacienteId) q = q.eq('paciente_id', opts.pacienteId);
    if (opts.orcamentoId) q = q.eq('orcamento_id', opts.orcamentoId);
    return q.order('created_at', { ascending: false }).order('id', { ascending: true }).range(de, ate);
  });
  return linhas.map((l) => ({
    ...(l as unknown as ContatoComercial),
    clinica_id: Number(l.clinica_id),
    feito_por: l.feito_por == null ? null : Number(l.feito_por),
  }));
}
