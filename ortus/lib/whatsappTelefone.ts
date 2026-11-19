/**
 * Chave para comparar telefones: DDD + últimos 8 dígitos.
 * O WhatsApp às vezes guarda celulares sem o 9 inicial, então o número completo não bate.
 */
export function chaveTelefone(telefone: string | null | undefined): string | null {
  let digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length >= 12 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length < 10) return null;
  return `${digitos.slice(0, 2)}${digitos.slice(-8)}`;
}

/**
 * Link que abre a conversa no WhatsApp do próprio aparelho (wa.me). É a saída
 * para quando o WhatsApp do Ortus não existe neste acesso. Número sem DDI
 * ganha o 55; devolve null se não parecer telefone.
 */
export function linkWhatsappDoAparelho(telefone: string | null | undefined, texto?: string | null): string | null {
  let digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  if (digitos.length < 12 || digitos.length > 15) return null;
  return `https://wa.me/${digitos}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

export function formatarTelefone(telefone: string | null | undefined): string {
  let digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length >= 12 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return telefone || '';
}
