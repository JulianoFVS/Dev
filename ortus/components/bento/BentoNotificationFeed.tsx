'use client';

import type { ReactNode } from 'react';
import { History } from 'lucide-react';
import BentoPageShell from '@/components/bento/BentoPageShell';
import MenuPontos from '@/components/ui/MenuPontos';
import { bentoCard, bentoPill } from '@/lib/bentoUi';

type Item = {
  id: string | number;
  titulo?: string | null;
  mensagem?: string | null;
  lida?: boolean;
  created_at?: string;
};

type Props = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyIcon: ReactNode;
  escopo: 'ativas' | 'historico';
  onEscopo: (e: 'ativas' | 'historico') => void;
  loading: boolean;
  items: Item[];
  onMarkRead: (id: Item['id']) => void;
  onDelete: (id: Item['id']) => void;
  unreadBgClass?: string;
  iconForItem?: (item: Item) => ReactNode;
  embedded?: boolean;
};

export default function BentoNotificationFeed({
  title,
  subtitle,
  emptyTitle,
  emptyIcon,
  escopo,
  onEscopo,
  loading,
  items,
  onMarkRead,
  onDelete,
  unreadBgClass = 'bg-[#f3f4f1]/80',
  iconForItem,
  embedded = false,
}: Props) {
  const acoes = (
    <>
      <button type="button" className={bentoPill(escopo === 'ativas')} onClick={() => onEscopo('ativas')}>
        Ativas
      </button>
      <button type="button" className={`${bentoPill(escopo === 'historico')} inline-flex items-center gap-1.5`} onClick={() => onEscopo('historico')}>
        <History size={14} />
        Histórico
      </button>
    </>
  );
  const lista = (
      <div className={`${embedded ? 'min-h-0 flex-1 overflow-y-auto' : `${bentoCard} min-h-[420px] overflow-hidden border border-black/5`}`}>
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-3 text-neutral-300">{emptyIcon}</div>
            <h3 className="font-semibold text-neutral-900">{emptyTitle}</h3>
            <p className="mt-1 text-sm text-neutral-500">Nada por aqui no momento.</p>
          </div>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((n) => (
              <li key={n.id} className={`flex gap-3 p-4 sm:gap-4 sm:p-5 ${!n.lida ? unreadBgClass : ''}`}>
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white">
                  {iconForItem ? iconForItem(n) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-neutral-900">{n.titulo || 'Aviso'}</h4>
                  {n.mensagem ? <p className="mt-0.5 text-sm text-neutral-600">{n.mensagem}</p> : null}
                  {n.created_at ? (
                    <p className="mt-1 text-[11px] text-neutral-400">
                      {new Date(n.created_at).toLocaleString('pt-BR')}
                    </p>
                  ) : null}
                </div>
                <MenuPontos
                  itens={[
                    ...(!n.lida ? [{ id: 'lida', label: 'Marcar como lida', onClick: () => onMarkRead(n.id) }] : []),
                    { id: 'excluir', label: 'Excluir', perigo: true, onClick: () => onDelete(n.id) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
  );
  if (embedded) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/5 px-3 py-2.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
            <p className="truncate text-xs text-neutral-500">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">{acoes}</div>
        </div>
        {lista}
      </section>
    );
  }
  return (
    <BentoPageShell title={title} subtitle={subtitle} maxWidthClass="max-w-3xl" actions={acoes}>
      {lista}
    </BentoPageShell>
  );
}
