/**
 * Funil de oportunidades do comercial (calculado no cliente, nas duas
 * pontas: nuvem e desktop).
 *
 * Três tipos:
 * 1. avaliação sem orçamento: consulta/avaliação atendida nos últimos 60 dias
 *    sem nenhum orçamento do paciente depois dela;
 * 2. faltou ou cancelou e não remarcou: o agendamento mais recente do
 *    paciente (nos últimos 90 dias, futuros incluídos) é "faltou" ou
 *    "cancelado" e não há nada marcado à frente;
 * 3. orçamento parado: enviado ou em aberto, com o próximo contato vencido
 *    ou sem contato há DIAS_SEM_CONTATO dias.
 *
 * Registrar um contato tira a oportunidade do funil até a data do próximo
 * contato (ou por DIAS_SEM_CONTATO dias, se nenhuma data foi combinada).
 */
import { dados as tabelas } from '@/lib/local/consulta';
import { lerTudo } from '@/lib/paginar';
import { listarContatos, listarOrcamentos } from '@/lib/db/orcamentos';
import {
  DIAS_SEM_CONTATO,
  STATUS_APRESENTADO,
  STATUS_EM_ANDAMENTO,
  diasParado,
  somarDias,
  statusEfetivo,
  type ContatoComercial,
  type MotivoContato,
  type Orcamento,
  type PacienteDoOrcamento,
} from '@/lib/orcamentos';

export type TipoOportunidade = 'avaliacao_sem_orcamento' | 'faltou_sem_retorno' | 'cancelou_sem_retorno' | 'orcamento_parado';

export const ROTULO_OPORTUNIDADE: Record<TipoOportunidade, string> = {
  avaliacao_sem_orcamento: 'Avaliação sem orçamento',
  faltou_sem_retorno: 'Faltou e não remarcou',
  cancelou_sem_retorno: 'Cancelou e não remarcou',
  orcamento_parado: 'Orçamento parado',
};

export type Oportunidade = {
  chave: string;
  tipo: TipoOportunidade;
  clinica_id: number;
  paciente: PacienteDoOrcamento;
  /** Data de referência: do atendimento, da falta/cancelamento ou da última novidade do orçamento. */
  desde: string;
  dias: number;
  procedimento: string | null;
  valor: number | null;
  orcamento: Orcamento | null;
  ultimoContato: ContatoComercial | null;
};

const DIAS_AVALIACAO = 60;
const DIAS_FALTA = 90;

type LinhaAgenda = {
  id: number;
  paciente_id: string | null;
  clinica_id: number;
  data_hora: string;
  status: string | null;
  procedimento: string | null;
  tratamento_base_id: number | null;
  tipo_registro: string | null;
  observacoes: string | null;
  pacientes: PacienteDoOrcamento | null;
};

/** Minúsculas, sem acento, sem o prefixo "Tratamento:" que a ficha põe na agenda. */
export function normalizarProcedimento(texto: string | null | undefined): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^tratamento:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Instante em milissegundos (os textos de data chegam com fusos escritos de jeitos diferentes). */
function ms(texto: string): number {
  const v = new Date(texto).getTime();
  return Number.isFinite(v) ? v : 0;
}

function pareceAvaliacao(texto: string): boolean {
  return texto.includes('avalia') || texto.includes('consulta');
}

function dias(desde: string, hoje: string): number {
  const a = new Date(`${desde.slice(0, 10)}T12:00:00Z`).getTime();
  const b = new Date(`${hoje}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** O contato esconde a oportunidade? Até o próximo contato, ou por alguns dias sem data combinada. */
function contatoSegura(contato: ContatoComercial | undefined, hoje: string): boolean {
  if (!contato) return false;
  if (contato.proximo_contato) return contato.proximo_contato > hoje;
  return somarDias(contato.created_at.slice(0, 10), DIAS_SEM_CONTATO) > hoje;
}

export async function carregarOportunidades(opts: { clinicaIds: number[]; hoje: string }): Promise<Oportunidade[]> {
  const { clinicaIds, hoje } = opts;
  if (clinicaIds.length === 0) return [];
  const inicio = somarDias(hoje, -DIAS_FALTA);

  const [agenda, orcamentosRecentes, emAndamento, contatos, catalogo] = await Promise.all([
    lerTudo<LinhaAgenda>((de, ate) =>
      tabelas.from('agendamentos')
        .select('id, paciente_id, clinica_id, data_hora, status, procedimento, tratamento_base_id, tipo_registro, observacoes, pacientes(id, nome, telefone, responsavel_telefone)')
        .in('clinica_id', clinicaIds)
        .gte('data_hora', `${inicio}T00:00:00`)
        .order('data_hora', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate) as unknown as PromiseLike<{ data: LinhaAgenda[] | null; error: { message: string } | null }>,
    ),
    listarOrcamentos({ clinicaIds, desde: `${inicio}T00:00:00` }),
    listarOrcamentos({ clinicaIds, status: STATUS_EM_ANDAMENTO }),
    listarContatos({ clinicaIds, desde: `${inicio}T00:00:00` }),
    lerTudo<{ id: number; nome: string; avaliacao: boolean | null }>((de, ate) =>
      tabelas.from('tratamentos_base')
        .select('id, nome, avaliacao')
        .in('clinica_id', clinicaIds)
        .order('id', { ascending: true })
        .range(de, ate) as unknown as PromiseLike<{ data: { id: number; nome: string; avaliacao: boolean | null }[] | null; error: { message: string } | null }>,
    ),
  ]);

  const orcamentos = new Map<string, Orcamento>();
  for (const o of [...orcamentosRecentes, ...emAndamento]) orcamentos.set(o.id, o);

  const idsAvaliacao = new Set(catalogo.filter((t) => t.avaliacao).map((t) => Number(t.id)));
  const nomesAvaliacao = new Set(catalogo.filter((t) => t.avaliacao).map((t) => normalizarProcedimento(t.nome)));
  const nomesCatalogo = new Set(catalogo.map((t) => normalizarProcedimento(t.nome)));

  const ehAvaliacao = (linha: LinhaAgenda) => {
    if (linha.tratamento_base_id != null && idsAvaliacao.has(Number(linha.tratamento_base_id))) return true;
    const nome = normalizarProcedimento(linha.procedimento);
    if (!nome) return false;
    if (nomesAvaliacao.has(nome)) return true;
    // Procedimento digitado à mão (fora do catálogo): vale o nome.
    return !nomesCatalogo.has(nome) && pareceAvaliacao(nome);
  };

  // Último contato por paciente e motivo (a lista já vem do mais novo para o mais antigo).
  const ultimoContato = new Map<string, ContatoComercial>();
  for (const c of contatos) {
    const chave = `${c.paciente_id}:${c.motivo}`;
    if (!ultimoContato.has(chave)) ultimoContato.set(chave, c);
  }
  const contatoDe = (pacienteId: string, motivo: MotivoContato) => ultimoContato.get(`${pacienteId}:${motivo}`);

  const porPaciente = new Map<string, LinhaAgenda[]>();
  for (const linha of agenda) {
    if (!linha.paciente_id) continue;
    if (linha.tipo_registro === 'debito_manual' || linha.observacoes === 'Débito manual') continue;
    const lista = porPaciente.get(linha.paciente_id) || [];
    lista.push(linha);
    porPaciente.set(linha.paciente_id, lista);
  }

  const orcamentosPorPaciente = new Map<string, Orcamento[]>();
  for (const o of orcamentos.values()) {
    const lista = orcamentosPorPaciente.get(o.paciente_id) || [];
    lista.push(o);
    orcamentosPorPaciente.set(o.paciente_id, lista);
  }

  const saida: Oportunidade[] = [];
  const limiteAvaliacao = somarDias(hoje, -DIAS_AVALIACAO);
  const agora = Date.now();

  for (const [pacienteId, linhas] of porPaciente) {
    const paciente = linhas.find((l) => l.pacientes)?.pacientes || { id: pacienteId, nome: null, telefone: null };
    const ordenadas = [...linhas].sort((a, b) => a.data_hora.localeCompare(b.data_hora));
    const ultima = ordenadas[ordenadas.length - 1];

    // 2. faltou ou cancelou e não remarcou
    const status = String(ultima.status || '').toLowerCase();
    if ((status === 'faltou' || status === 'falta' || status === 'cancelado') && ultima.data_hora.slice(0, 10) <= hoje) {
      const tipo: TipoOportunidade = status === 'cancelado' ? 'cancelou_sem_retorno' : 'faltou_sem_retorno';
      const contato = contatoDe(pacienteId, tipo);
      const contatoDepois = contato && ms(contato.created_at) >= ms(ultima.data_hora) ? contato : undefined;
      if (!contatoSegura(contatoDepois, hoje)) {
        saida.push({
          chave: `${tipo}:${ultima.id}`,
          tipo,
          clinica_id: Number(ultima.clinica_id),
          paciente,
          desde: ultima.data_hora,
          dias: dias(ultima.data_hora, hoje),
          procedimento: ultima.procedimento,
          valor: null,
          orcamento: null,
          ultimoContato: contatoDepois || null,
        });
      }
    }

    // 1. avaliação atendida sem orçamento depois dela
    const atendidas = ordenadas.filter((l) => {
      const s = String(l.status || '').toLowerCase();
      return (s === 'concluido' || s === 'fiado')
        && l.data_hora.slice(0, 10) >= limiteAvaliacao
        && ms(l.data_hora) <= agora
        && ehAvaliacao(l);
    });
    const avaliacao = atendidas[atendidas.length - 1];
    if (avaliacao) {
      const temOrcamento = (orcamentosPorPaciente.get(pacienteId) || [])
        .some((o) => ms(o.created_at) >= ms(avaliacao.data_hora) - 12 * 3_600_000);
      const contato = contatoDe(pacienteId, 'avaliacao_sem_orcamento');
      const contatoDepois = contato && ms(contato.created_at) >= ms(avaliacao.data_hora) ? contato : undefined;
      if (!temOrcamento && !contatoSegura(contatoDepois, hoje)) {
        saida.push({
          chave: `avaliacao_sem_orcamento:${avaliacao.id}`,
          tipo: 'avaliacao_sem_orcamento',
          clinica_id: Number(avaliacao.clinica_id),
          paciente,
          desde: avaliacao.data_hora,
          dias: dias(avaliacao.data_hora, hoje),
          procedimento: avaliacao.procedimento,
          valor: null,
          orcamento: null,
          ultimoContato: contatoDepois || null,
        });
      }
    }
  }

  // 3. orçamento apresentado e parado
  for (const o of orcamentos.values()) {
    if (!STATUS_APRESENTADO.includes(statusEfetivo(o, hoje))) continue;
    const parado = diasParado(o);
    const vencido = o.proximo_contato ? o.proximo_contato <= hoje : parado >= DIAS_SEM_CONTATO;
    if (!vencido) continue;
    saida.push({
      chave: `orcamento_parado:${o.id}`,
      tipo: 'orcamento_parado',
      clinica_id: o.clinica_id,
      paciente: o.pacientes || { id: o.paciente_id, nome: null, telefone: null },
      desde: o.ultimo_contato_em || o.status_desde,
      dias: parado,
      procedimento: null,
      valor: o.valor_total,
      orcamento: o,
      ultimoContato: contatoDe(o.paciente_id, 'orcamento') || null,
    });
  }

  return saida.sort((a, b) => b.dias - a.dias);
}
