'use client';

export type BarraItem = { id: string; rotulo: string; valor: number };

type Props = {
  items: BarraItem[];
  /** Formata o valor para leitores de tela e tooltip. */
  format?: (valor: number) => string;
  accent?: 'dark' | 'lime';
  /** Altura da área das barras (o rótulo fica fora dela). */
  altura?: string;
  className?: string;
  vazioTexto?: string;
};

/**
 * Gráfico de barras simples (divs) — sem dependências.
 *
 * Mobile-first: as colunas usam `flex-1` + `min-w-0`, então nunca estouram a
 * largura, e os rótulos ficam retos (sem rotação) abaixo de cada barra.
 */
export default function ChartBars({
  items,
  format,
  accent = 'dark',
  altura = 'h-28 sm:h-32',
  className = '',
  vazioTexto = 'Sem valores no período.',
}: Props) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-400">{vazioTexto}</p>;
  }

  const max = items.reduce((acc, item) => Math.max(acc, Number(item.valor) || 0), 0);
  const corBarra = accent === 'lime' ? 'bg-[#c8f053]' : 'bg-neutral-900';
  const rotulo = (item: BarraItem) => (format ? format(Number(item.valor) || 0) : String(item.valor));

  return (
    <div className={`flex w-full flex-col ${className}`}>
      <div className={`flex w-full items-stretch gap-1 ${altura}`}>
        {items.map((item) => {
          const alturaPct = max > 0 ? Math.max(3, Math.round(((Number(item.valor) || 0) / max) * 100)) : 0;
          return (
            <div
              key={item.id}
              role="img"
              aria-label={`${item.rotulo}: ${rotulo(item)}`}
              title={`${item.rotulo} · ${rotulo(item)}`}
              className="flex min-w-0 flex-1 flex-col"
            >
              <div className="flex min-h-0 flex-1 items-end">
                <span
                  className={`w-full rounded-t-[5px] ${alturaPct > 0 ? corBarra : 'bg-neutral-200'}`}
                  style={{ height: `${alturaPct}%` }}
                  aria-hidden
                />
              </div>
              <span className="mt-1.5 w-full truncate text-center text-[11px] font-medium leading-none tabular-nums text-neutral-400">
                {item.rotulo}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
