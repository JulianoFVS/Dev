/**
 * Contato do suporte do Ortus por WhatsApp.
 *
 * Os números vêm do ambiente, em NEXT_PUBLIC_SUPORTE_WHATSAPP_1 e
 * NEXT_PUBLIC_SUPORTE_WHATSAPP_2: só dígitos, com DDI (5511999990000).
 * Sem a variável não existe número: a tela avisa que o contato ainda não foi
 * configurado em vez de mostrar um número inventado.
 */

export type NumeroSuporte = {
  /** Só dígitos, com DDI. É o que vai no endereço da conversa. */
  digitos: string;
  /** Como aparece na tela: +55 (11) 99999-0000. */
  exibicao: string;
};

export const NOME_CONTATO_SUPORTE = 'Suporte Ortus';

/** Com DDI, um telefone tem de 12 a 15 dígitos (o teto é o do padrão E.164). */
const MINIMO_DIGITOS = 12;
const MAXIMO_DIGITOS = 15;

/**
 * Tira máscara, espaço e "+". Devolve '' quando o valor não é um telefone com DDI.
 * Número brasileiro cadastrado sem o 55 (10 ou 11 dígitos) ganha o DDI, como em lib/whatsappTelefone.ts.
 */
export function digitosDoWhatsapp(valor: string | null | undefined): string {
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  return digitos.length >= MINIMO_DIGITOS && digitos.length <= MAXIMO_DIGITOS ? digitos : '';
}

/** 5511999990000 vira +55 (11) 99999-0000. Número de outro país fica só com o "+". */
export function formatarWhatsapp(valor: string): string {
  const d = valor.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length === 13) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.startsWith('55') && d.length === 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
}

/** Números configurados, sem repetição e na ordem das variáveis. Lista vazia = suporte ainda não configurado. */
export function numerosSuporte(): NumeroSuporte[] {
  // Os nomes ficam por extenso de propósito: o Next só leva NEXT_PUBLIC_* para o
  // navegador quando encontra a variável escrita assim. process.env[nome] chegaria vazio na tela.
  const brutos = [process.env.NEXT_PUBLIC_SUPORTE_WHATSAPP_1, process.env.NEXT_PUBLIC_SUPORTE_WHATSAPP_2];
  const lista: NumeroSuporte[] = [];
  for (const bruto of brutos) {
    const digitos = digitosDoWhatsapp(bruto);
    if (!digitos || lista.some((item) => item.digitos === digitos)) continue;
    lista.push({ digitos, exibicao: formatarWhatsapp(digitos) });
  }
  return lista;
}

/** Endereço que abre a conversa com o suporte na aba WhatsApp do Ortus. */
export function linkConversaSuporte(digitos: string): string {
  return `/whatsapp?telefone=${encodeURIComponent(digitos)}&nome=${encodeURIComponent(NOME_CONTATO_SUPORTE)}`;
}

/** Formato internacional sem máscara: é o que o WhatsApp e a agenda do celular aceitam ao colar. */
export function numeroParaCopiar(digitos: string): string {
  return `+${digitos}`;
}
