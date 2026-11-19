/**
 * Relatos de bug e sugestão.
 *
 * O que a tela de Ajuda, a rota POST /api/relatos e a fila do painel SaaS têm
 * em comum: tipos, limites, rótulos e a validação do corpo. Sem import de
 * servidor nem de navegador — o arquivo serve dos dois lados.
 */

export type TipoRelato = 'bug' | 'sugestao';
export type StatusRelato = 'aberto' | 'em_analise' | 'resolvido' | 'descartado';

/** Os mesmos limites dos CHECKs de `relatos_suporte` (migration 20261123_relatos). */
export const RELATO_ASSUNTO_MAX = 160;
export const RELATO_DESCRICAO_MAX = 5000;

/** Envios aceitos por pessoa a cada hora. O seguinte recebe 429. */
export const RELATOS_POR_HORA = 5;

export const ROTULO_TIPO_RELATO: Record<TipoRelato, string> = {
  bug: 'Bug',
  sugestao: 'Sugestão',
};

export const ROTULO_STATUS_RELATO: Record<StatusRelato, string> = {
  aberto: 'Aberto',
  em_analise: 'Em análise',
  resolvido: 'Resolvido',
  descartado: 'Descartado',
};

/** Linha de `relatos_suporte`. */
export type RelatoSuporte = {
  id: number;
  criado_em: string;
  tipo: TipoRelato;
  assunto: string;
  descricao: string;
  autor_user_id: string;
  autor_profissional_id: number | null;
  autor_nome: string | null;
  clinica_id: number | null;
  /** Nome da clínica na hora do envio; continua preenchido se a clínica for removida. */
  clinica_nome: string | null;
  status: StatusRelato;
  /** Última mudança de status (carimbada pelo banco). */
  atualizado_em: string | null;
  /** Quando o aviso aos donos saiu. Com os dois campos de e-mail vazios, não há registro do envio. */
  email_enviado_em: string | null;
  email_erro: string | null;
};

/** Corpo de POST /api/relatos. */
export type PedidoRelato = {
  tipo: TipoRelato;
  assunto: string;
  descricao: string;
  clinicaId: string | number | null;
};

/** Resposta 200 de POST /api/relatos. `email.enviado: false` não é erro: o relato já está na fila. */
export type RespostaRelato = {
  ok: true;
  id: number;
  email: { enviado: boolean };
};

export type RelatoValidado = {
  tipo: TipoRelato;
  assunto: string;
  descricao: string;
  /** Só o número. Quem decide se a pessoa trabalha nessa clínica é o servidor. */
  clinicaId: number | null;
};

export type ResultadoValidacao = { ok: true; relato: RelatoValidado } | { ok: false; erro: string };

// Caracteres de controle, menos tabulação e quebra de linha. O Postgres recusa \u0000 em texto.
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Metade solta de um emoji (texto cortado no meio do par): o banco recusa a gravação inteira.
const PAR_OU_METADE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

function limpar(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor
    .replace(/\r\n?/g, '\n')
    .replace(CONTROLE, '')
    .replace(PAR_OU_METADE, (trecho) => (trecho.length === 2 ? trecho : ''))
    .trim();
}

function lerClinicaId(valor: unknown): number | null {
  const texto = typeof valor === 'number' ? String(valor) : typeof valor === 'string' ? valor.trim() : '';
  if (!/^\d{1,15}$/.test(texto)) return null;
  const numero = Number(texto);
  return numero > 0 ? numero : null;
}

/**
 * Confere e apara o corpo de um relato. Texto acima do limite é recusado, não
 * cortado: a pessoa precisa saber que o relato não coube.
 *
 * `clinicaId` que não for um número (clínica "todas", vazio, ausente) vira
 * null — o relato vale sem clínica.
 */
export function validarRelato(corpo: unknown): ResultadoValidacao {
  const dados = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;

  const tipo = dados.tipo;
  if (tipo !== 'bug' && tipo !== 'sugestao') {
    return { ok: false, erro: 'Escolha o tipo do relato: bug ou sugestão.' };
  }

  // O assunto vira título de e-mail e de linha de tabela: uma linha só.
  const assunto = limpar(dados.assunto).replace(/\s+/g, ' ');
  if (!assunto) return { ok: false, erro: 'Informe o assunto.' };
  if (assunto.length > RELATO_ASSUNTO_MAX) {
    return { ok: false, erro: `O assunto pode ter até ${RELATO_ASSUNTO_MAX} caracteres.` };
  }

  const descricao = limpar(dados.descricao);
  if (!descricao) {
    return { ok: false, erro: tipo === 'bug' ? 'Descreva o que aconteceu.' : 'Descreva a sua sugestão.' };
  }
  if (descricao.length > RELATO_DESCRICAO_MAX) {
    return { ok: false, erro: `A descrição pode ter até ${RELATO_DESCRICAO_MAX.toLocaleString('pt-BR')} caracteres.` };
  }

  return { ok: true, relato: { tipo, assunto, descricao, clinicaId: lerClinicaId(dados.clinicaId) } };
}
