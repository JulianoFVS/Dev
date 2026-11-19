import { supabase } from '@/lib/supabase';

/**
 * A aba entra no menu do site publicado e do aplicativo. `NEXT_PUBLIC_WHATSAPP_ATIVO=0`
 * esconde a aba e faz os atalhos de contato abrirem o WhatsApp do próprio aparelho.
 * É o valor certo para um endereço sem aplicativo de computador nem servidor sempre
 * ligado (veja docs/WHATSAPP.md).
 */
export const WHATSAPP_ATIVO = process.env.NEXT_PUBLIC_WHATSAPP_ATIVO !== '0';

/**
 * O que as outras telas precisam saber do WhatsApp do Ortus para a clínica.
 *
 * `configurado` separa "desconectado" de "não existe WhatsApp neste endereço":
 * false quando a aba está desligada ou o endereço não tem serviço (modo
 * `indisponivel`); null quando não deu para perguntar (sem internet, sessão
 * vencida, erro do servidor). `status` é o estado da sessão, com `offline`
 * para serviço configurado que não respondeu.
 */
export type SituacaoWhatsapp = {
  configurado: boolean | null;
  modo: 'aplicativo' | 'servidor' | 'indisponivel' | null;
  status: 'desconectado' | 'iniciando' | 'qr' | 'conectado' | 'falha' | 'offline' | null;
  conectado: boolean;
  /** Pode abrir as conversas no Ortus (módulo da tela /whatsapp). */
  podeConversar: boolean;
  /** Pode conectar o aparelho: administrador da clínica que não entrou por convite. */
  podeConectar: boolean;
};

const DESCONHECIDA: SituacaoWhatsapp = {
  configurado: null, modo: null, status: null, conectado: false, podeConversar: false, podeConectar: false,
};
const MODOS = new Set(['aplicativo', 'servidor', 'indisponivel']);
const ESTADOS = new Set(['desconectado', 'iniciando', 'qr', 'conectado', 'falha', 'offline']);

const cache = new Map<string, { em: number; situacao: SituacaoWhatsapp }>();

/** Situação do WhatsApp do Ortus para a clínica (resultado guardado por 30 s). */
export async function situacaoWhatsapp(clinicaId: string | number): Promise<SituacaoWhatsapp> {
  if (!WHATSAPP_ATIVO) return { ...DESCONHECIDA, configurado: false };
  const chave = String(clinicaId);
  const salvo = cache.get(chave);
  if (salvo && Date.now() - salvo.em < 30_000) return salvo.situacao;
  let situacao = DESCONHECIDA;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resposta = await fetch(`/api/whatsapp?clinicaId=${encodeURIComponent(chave)}`, {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      cache: 'no-store',
    });
    const dados: unknown = await resposta.json().catch(() => null);
    if (resposta.ok && dados && typeof dados === 'object') {
      const d = dados as Record<string, unknown>;
      const status = typeof d.status === 'string' && ESTADOS.has(d.status) ? d.status as SituacaoWhatsapp['status'] : null;
      situacao = {
        configurado: typeof d.configurado === 'boolean' ? d.configurado : null,
        modo: typeof d.modo === 'string' && MODOS.has(d.modo) ? d.modo as SituacaoWhatsapp['modo'] : null,
        status,
        conectado: status === 'conectado',
        podeConversar: d.podeConversar === true,
        podeConectar: d.podeConectar === true,
      };
    }
  } catch {
    situacao = DESCONHECIDA;
  }
  cache.set(chave, { em: Date.now(), situacao });
  return situacao;
}

/** Se o WhatsApp da clínica está conectado ao Ortus (resultado guardado por 30 s). */
export async function whatsappConectado(clinicaId: string | number): Promise<boolean> {
  return (await situacaoWhatsapp(clinicaId)).conectado;
}
