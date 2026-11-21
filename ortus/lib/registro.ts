import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Registro de falhas do servidor.
 *
 * Regra: o que vai para o log e para o painel nunca carrega dado clínico,
 * dado pessoal nem segredo. A mensagem passa por `limparTexto`, que troca
 * e-mail, CPF, telefone, token, chave e UUID por marcadores. O objeto de erro
 * inteiro nunca é impresso (o do Supabase traz a linha recusada em `details`).
 *
 * Destinos:
 *   1. stderr, uma linha JSON por falha (journald na VM, logs da Vercel).
 *   2. tabela `falhas_servidor`, lida no painel SaaS. Melhor-esforço: se o
 *      banco estiver fora, a falha continua no stderr.
 */

const TROCAS: Array<[RegExp, string]> = [
  // JWT e chaves longas vêm antes: contêm pontos e dígitos que os outros padrões pegariam em pedaços.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[token]'],
  // Tokens do Google (acesso ya29.… e refresh 1//…).
  [/\bya29\.[A-Za-z0-9_.-]{10,}/g, '[token]'],
  [/(?:^|[^A-Za-z0-9])1\/\/[A-Za-z0-9_-]{10,}/g, ' [token]'],
  [/\b(?:re|sk|pk|rk|whsec|APP_USR|TEST)[-_][A-Za-z0-9_-]{12,}\b/g, '[chave]'],
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '[credencial]'],
  [/([?&](?:token|access_token|refresh_token|apikey|key|secret|signature|sig|senha|password)=)[^&\s"']+/gi, '$1[oculto]'],
  [/postgres(?:ql)?:\/\/[^\s"']+/gi, '[url-do-banco]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]'],
  [/(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[telefone]'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
  [/\b[A-Fa-f0-9]{32,}\b/g, '[hash]'],
];

/** Tira dado pessoal e segredo de um texto livre antes de ele virar log. */
export function limparTexto(texto: unknown, limite = 300): string {
  let saida = typeof texto === 'string' ? texto : String(texto ?? '');
  for (const [padrao, troca] of TROCAS) saida = saida.replace(padrao, troca);
  saida = saida.replace(/\s+/g, ' ').trim();
  return saida.length > limite ? `${saida.slice(0, limite)}…` : saida;
}

type ErroLido = { mensagem: string; codigo: string | null; nome: string | null; onde: string | null };

function lerErro(erro: unknown): ErroLido {
  if (erro && typeof erro === 'object') {
    const alvo = erro as { message?: unknown; code?: unknown; name?: unknown; stack?: unknown };
    // Só a primeira linha do stack que aponta para o nosso código: diz ONDE quebrou sem repetir a mensagem.
    const stack = typeof alvo.stack === 'string' ? alvo.stack.split('\n').slice(1) : [];
    const linha = stack.find((l) => !l.includes('node_modules') && !l.includes('node:internal')) || stack[0] || '';
    return {
      mensagem: limparTexto(typeof alvo.message === 'string' ? alvo.message : 'erro sem mensagem'),
      codigo: typeof alvo.code === 'string' || typeof alvo.code === 'number' ? String(alvo.code).slice(0, 40) : null,
      nome: typeof alvo.name === 'string' ? alvo.name.slice(0, 60) : null,
      onde: linha ? limparTexto(linha.replace(/^\s*at\s+/, ''), 160) : null,
    };
  }
  return { mensagem: limparTexto(erro), codigo: null, nome: null, onde: null };
}

export type ContextoFalha = {
  /** Rota ou rotina, ex.: "api/lembretes/processar". */
  origem: string;
  /** Clínica envolvida, quando houver. É um número interno, não é dado pessoal. */
  clinicaId?: number | string | null;
  /** Rótulos curtos e fixos (ex.: { etapa: 'webhook' }). Nunca texto digitado por usuário. */
  extra?: Record<string, string | number | boolean | null>;
};

/**
 * Registra uma falha do servidor. Nunca lança: registrar erro não pode
 * derrubar a rota que já estava falhando.
 */
export async function registrarFalha(contexto: ContextoFalha, erro: unknown): Promise<void> {
  const lido = lerErro(erro);
  const clinica = contexto.clinicaId == null || contexto.clinicaId === '' ? null : Number(contexto.clinicaId);
  const linha = {
    nivel: 'erro',
    em: new Date().toISOString(),
    origem: contexto.origem.slice(0, 120),
    mensagem: lido.mensagem,
    codigo: lido.codigo,
    tipo: lido.nome,
    onde: lido.onde,
    clinica_id: Number.isFinite(clinica) ? clinica : null,
    ...(contexto.extra ? { extra: contexto.extra } : {}),
  };
  try {
    console.error(JSON.stringify(linha));
  } catch {
    /* stderr indisponível */
  }
  try {
    const admin = createSupabaseAdmin();
    await admin.from('falhas_servidor').insert({
      origem: linha.origem,
      mensagem: linha.mensagem,
      codigo: linha.codigo,
      tipo: linha.tipo,
      onde: linha.onde,
      clinica_id: linha.clinica_id,
      extra: contexto.extra ?? null,
    });
  } catch {
    /* banco fora do ar ou tabela ainda não criada: o stderr já tem a falha */
  }
}

/** Mensagem segura para devolver ao navegador quando a causa é interna. */
export const ERRO_INTERNO = 'Não foi possível concluir agora. Tente de novo em instantes.';
