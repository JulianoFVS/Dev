'use client';

import { AlertTriangle, Building2, Layers, ReceiptText, Users, Wallet } from 'lucide-react';
import { moeda, pluralizar, type TotaisSaaS } from '@/lib/saas';
import { SkeletonBloco } from './Feedback';

type Props = {
  totais: TotaisSaaS | null;
  carregando: boolean;
};

export default function SaaSKpis({ totais, carregando }: Props) {
  if (carregando && !totais) {
    return (
      <div
        className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"
        aria-busy="true"
        aria-label="Carregando indicadores da plataforma"
      >
        {Array.from({ length: 6 }).map((_, indice) => (
          <div
            key={indice}
            className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5"
          >
            <SkeletonBloco className="h-3 w-16" />
            <SkeletonBloco className="mt-2 h-5 w-20" />
            <SkeletonBloco className="mt-2 h-2.5 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      rotulo: 'Redes',
      valor: totais ? String(totais.redes) : '—',
      detalhe: totais
        ? `${pluralizar(totais.redes_ativas, 'ativa', 'ativas')} · ${pluralizar(totais.redes_inadimplentes, 'inadimplente', 'inadimplentes')}`
        : 'indisponível',
      Icone: Layers,
      destaque: 'text-neutral-900',
    },
    {
      rotulo: 'Clínicas',
      valor: totais ? String(totais.clinicas) : '—',
      detalhe: totais ? `${totais.clinicas_sem_rede} sem rede` : 'indisponível',
      Icone: Building2,
      destaque: 'text-neutral-900',
    },
    {
      rotulo: 'Profissionais',
      valor: totais ? String(totais.profissionais) : '—',
      detalhe: totais ? `${pluralizar(totais.vinculos, 'vínculo', 'vínculos')}` : 'indisponível',
      Icone: Users,
      destaque: 'text-neutral-900',
    },
    {
      rotulo: 'Faturas em aberto',
      valor: totais ? String(totais.faturas_abertas) : '—',
      detalhe: !totais
        ? 'indisponível'
        : totais.faturas_abertas > 0
          ? 'aguardando pagamento'
          : 'nenhuma em aberto',
      Icone: ReceiptText,
      destaque: 'text-neutral-900',
    },
    {
      rotulo: 'Valor vencido',
      valor: totais ? moeda(totais.vencido_centavos) : '—',
      detalhe: !totais ? 'indisponível' : totais.vencido_centavos > 0 ? 'em atraso' : 'nada em atraso',
      Icone: AlertTriangle,
      destaque:
        totais && totais.vencido_centavos > 0 ? 'text-rose-600' : 'text-neutral-900',
    },
    {
      rotulo: 'Valor recebido',
      valor: totais ? moeda(totais.recebido_centavos) : '—',
      detalhe: 'total liquidado',
      Icone: Wallet,
      destaque: 'text-emerald-700',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {cards.map(({ rotulo, valor, detalhe, Icone, destaque }) => (
        <div
          key={rotulo}
          className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
            <Icone size={13} className="shrink-0" />
            <span className="truncate">{rotulo}</span>
          </div>
          <p
            className={`mt-1 truncate text-[17px] font-semibold tabular-nums sm:text-lg ${destaque}`}
            title={valor}
          >
            {valor}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-400" title={detalhe}>
            {detalhe}
          </p>
        </div>
      ))}
    </div>
  );
}
