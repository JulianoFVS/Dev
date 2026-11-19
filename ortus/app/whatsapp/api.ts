import { supabase } from '@/lib/supabase';
import { avisarMudancaNaAssinatura } from '@/lib/assinaturaCliente';

export type StatusSessao = 'desconectado' | 'iniciando' | 'qr' | 'conectado' | 'falha' | 'offline';

/** Onde o WhatsApp roda: no aplicativo de computador, num servidor sempre ligado ou em lugar nenhum. */
export type ModoWhatsapp = 'aplicativo' | 'servidor' | 'indisponivel';

export type Sessao = {
  configurado: boolean;
  modo?: ModoWhatsapp;
  status: StatusSessao;
  qr?: string | null;
  numero?: string | null;
  nome?: string | null;
  erro?: string | null;
  agendador?: boolean;
  /** Iniciar, ver o QR e desconectar: administrador da clínica que não entrou por convite. */
  podeConectar?: boolean;
  /** Ler as conversas e enviar: o módulo que abre esta tela. */
  podeConversar?: boolean;
};

export type Conversa = {
  id: string;
  nome: string;
  telefone: string | null;
  grupo: boolean;
  ultima: string;
  ultimaDeMim: boolean;
  em: number;
  naoLidas: number;
  paciente: { id: string; nome: string } | null;
};

export type Mensagem = {
  id: string;
  chatId: string;
  deMim: boolean;
  texto: string;
  tipo: string;
  temMidia: boolean;
  arquivo: string | null;
  em: number;
  ack: number | null;
  autor?: string | null;
};

export type Midia = { mimetype: string; data: string; nome: string | null };

export type PacienteBusca = { id: string; nome: string; telefone: string | null };

export function urlWhatsapp(clinicaId: string, params: Record<string, string> = {}) {
  return `/api/whatsapp?${new URLSearchParams({ clinicaId, ...params }).toString()}`;
}

/** Erro cuja mensagem foi escrita para a tela, pelo servidor ou por estas telas. */
export class ErroWhatsapp extends Error {}

export async function chamarWhatsapp<T = unknown>(caminho: string, corpo?: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: corpo ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
    });
  } catch {
    // O navegador descreve a falha de rede em inglês ("Failed to fetch").
    throw new ErroWhatsapp('Sem conexão com o Ortus. Confira a internet e tente de novo.');
  }
  const dados = await resposta.json().catch(() => ({}));
  // 402 = modo de consulta: a faixa de assinatura confere de novo e aparece na hora.
  if (resposta.status === 402) avisarMudancaNaAssinatura();
  if (!resposta.ok) {
    const erro = (dados as { erro?: unknown }).erro;
    throw new ErroWhatsapp(typeof erro === 'string' && erro ? erro : 'Não foi possível falar com o WhatsApp.');
  }
  return dados as T;
}

/** Só mensagem escrita para a tela aparece. Erro de biblioteca ou do navegador vira o aviso padrão. */
export function mensagemDeErro(err: unknown, padrao: string) {
  return err instanceof ErroWhatsapp && err.message ? err.message : padrao;
}

/** Motivos de falha que o serviço grava em `whatsapp_envios` e `whatsapp_agendadas` (server.mjs). */
const MOTIVOS_DE_ENVIO = new Set([
  'Este número não tem WhatsApp.',
  'WhatsApp desconectado.',
  'Conversa inválida.',
  'O WhatsApp atualizou a tela. Tente enviar de novo.',
  'Não foi possível enviar.',
]);

/**
 * Motivo de falha de um envio, do jeito que pode ir para a tela. Versões antigas
 * do serviço gravavam a mensagem crua do navegador: o que não é um dos motivos
 * conhecidos vira o aviso fixo.
 */
export function erroDeEnvio(texto: string | null | undefined): string | null {
  const limpo = String(texto || '').trim();
  if (!limpo) return null;
  return MOTIVOS_DE_ENVIO.has(limpo) ? limpo : 'Não foi possível enviar.';
}

export function iniciais(nome: string) {
  return nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0] || '').join('').toUpperCase() || '?';
}

export function primeiroNome(nome: string | null | undefined) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}
