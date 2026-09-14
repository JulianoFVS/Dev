'use client';

import type { ReactNode } from 'react';
import { CheckSquare, History, Trash2 } from 'lucide-react';
import BentoPageShell from '@/components/bento/BentoPageShell';
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
}: Props) {
  return (
    <BentoPageShell
      title={title}
      subtitle={subtitle}
      maxWidthClass="max-w-3xl"
      actions={
        <>
          <button type="button" className={bentoPill(escopo === 'ativas')} onClick={() => onEscopo('ativas')}>
            Ativas
          </button>
          <button type="button" className={`${bentoPill(escopo === 'historico')} inline-flex items-center gap-1.5`} onClick={() => onEscopo('historico')}>
            <History size={14} />
            Histórico
          </button>
        </>
      }
    >
      <div className={`${bentoCard} min-h-[420px] overflow-hidden border border-black/5`}>
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
                <div className="flex shrink-0 gap-1">
                  {!n.lida && (
                    <button
                      type="button"
                      onClick={() => onMarkRead(n.id)}
                      className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                      title="Marcar como lida"
                    >
                      <CheckSquare size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(n.id)}
                    className="rounded-full p-2 text-neutral-500 hover:bg-red-50 hover:text-red-600"
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BentoPageShell>
  );
}
