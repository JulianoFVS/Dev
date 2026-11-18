import { NextResponse } from 'next/server';
import { CABECALHO_JANELA, conferirRequisicaoLocal } from '@/desktop/lib/origemLocal.cjs';

/**
 * Prova de origem do servidor local do aplicativo.
 *
 * Só a janela do Ortus Desktop fala com o Next local: o processo principal do
 * Electron gera um segredo a cada execução, entrega ao servidor por variável
 * de ambiente e injeta o mesmo valor, por cabeçalho, nas requisições que a
 * janela faz. O JavaScript da página nunca enxerga o segredo. Site aberto no
 * navegador da máquina, DNS rebinding e outro programa ficam de fora, porque
 * não têm o segredo, não mandam o `Host` certo ou chegam com `Origin` alheio.
 *
 * Este arquivo não importa nada do servidor (`server-only`, banco, sessão)
 * para poder ser usado também pelo `proxy.ts`.
 */

/** Devolve a recusa (403) ou `null` quando a requisição prova que veio da janela. */
export function recusarForaDaJanela(req: Request): NextResponse | null {
  const conferencia = conferirRequisicaoLocal({
    host: req.headers.get('host'),
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    segredoRecebido: req.headers.get(CABECALHO_JANELA),
    segredoEsperado: process.env.ORTUS_JANELA_SEGREDO,
    porta: process.env.ORTUS_LOCAL_PORTA,
  });
  if (conferencia.ok) return null;
  return NextResponse.json(
    { erro: 'Este endereço só atende a janela do aplicativo Ortus.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}
