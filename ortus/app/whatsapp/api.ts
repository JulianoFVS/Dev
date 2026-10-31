import { supabase } from '@/lib/supabase';

export type StatusSessao = 'desconectado' | 'iniciando' | 'qr' | 'conectado' | 'falha' | 'offline';

export type Sessao = {
  configurado: boolean;
  status: StatusSessao;
  qr?: string | null;
  numero?: string | null;
  nome?: string | null;
  erro?: string | null;
  agendador?: boolean;
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
};

export type Midia = { mimetype: string; data: string; nome: string | null };

export type PacienteBusca = { id: string; nome: string; telefone: string | null };

export function urlWhatsapp(clinicaId: string, params: Record<string, string> = {}) {
  return `/api/whatsapp?${new URLSearchParams({ clinicaId, ...params }).toString()}`;
}

export async function chamarWhatsapp<T = unknown>(caminho: string, corpo?: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const resposta = await fetch(caminho, {
    method: corpo ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store',
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error((dados as { erro?: string }).erro || 'Não foi possível falar com o WhatsApp.');
  return dados as T;
}

export function mensagemDeErro(err: unknown, padrao: string) {
  return err instanceof Error && err.message ? err.message : padrao;
}

export function iniciais(nome: string) {
  return nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0] || '').join('').toUpperCase() || '?';
}

export function primeiroNome(nome: string | null | undefined) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}
