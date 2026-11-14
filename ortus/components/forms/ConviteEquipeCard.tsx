'use client';

import {
    Briefcase,
    Building2,
    CalendarClock,
    Check,
    Loader2,
    MailPlus,
    Network,
    X,
} from 'lucide-react';
import {
    formatarDataConvite,
    nomesClinicasConvite,
    rotuloStatusConvite,
    type ConviteStatus,
    type MeuConvite,
} from '@/lib/convites';

type RespostaEmAndamento = 'aceitar' | 'recusar' | null;

const CLASSE_BADGE_STATUS: Record<ConviteStatus, string> = {
    pendente: 'border-amber-200 bg-amber-100 text-amber-800',
    aceito: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    recusado: 'border-rose-200 bg-rose-50 text-rose-700',
    cancelado: 'border-neutral-200 bg-neutral-100 text-neutral-600',
    expirado: 'border-neutral-200 bg-neutral-100 text-neutral-500',
};

export function ConviteStatusBadge({ status }: { status: ConviteStatus }) {
    return (
        <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CLASSE_BADGE_STATUS[status]}`}>
            {rotuloStatusConvite(status)}
        </span>
    );
}

type Props = {
    convite: MeuConvite;
    respondendo: RespostaEmAndamento;
    onAceitar: (convite: MeuConvite) => void;
    onRecusar: (convite: MeuConvite) => void;
};

export default function ConviteEquipeCard({ convite, respondendo, onAceitar, onRecusar }: Props) {
    const ocupado = respondendo !== null;
    const clinicas = nomesClinicasConvite(convite.clinicas);

    return (
        <article className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 shadow-[0_1px_2px_rgba(120,53,15,0.06)] sm:p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                            <MailPlus size={19} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-neutral-900 sm:text-base">Convite de equipe</h3>
                                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                    Pendente
                                </span>
                            </div>
                            <p className="mt-0.5 text-sm text-neutral-600">
                                <span className="font-medium text-neutral-900">
                                    {convite.convidante_nome || 'A equipe'}
                                </span>
                                {' '}convidou você para participar da equipe.
                            </p>
                        </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                        <div className="flex items-start gap-2">
                            <Building2 size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                            <div className="min-w-0">
                                <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Unidades</dt>
                                <dd className="break-words text-neutral-700">{clinicas}</dd>
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <Network size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                            <div className="min-w-0">
                                <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Rede</dt>
                                <dd className="break-words text-neutral-700">{convite.rede_nome || 'Não informada'}</dd>
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <Briefcase size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                            <div className="min-w-0">
                                <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Cargo</dt>
                                <dd className="break-words text-neutral-700">{convite.cargo || 'Não informado'}</dd>
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <CalendarClock size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                            <div className="min-w-0">
                                <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Prazo</dt>
                                <dd className="break-words text-neutral-700">
                                    Expira em {formatarDataConvite(convite.expires_at, true)}
                                </dd>
                            </div>
                        </div>
                    </dl>

                    {convite.mensagem ? (
                        <blockquote className="mt-3 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-sm break-words text-neutral-700">
                            “{convite.mensagem}”
                        </blockquote>
                    ) : null}
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:shrink-0 lg:flex-col xl:flex-row">
                    <button
                        type="button"
                        onClick={() => onAceitar(convite)}
                        disabled={ocupado}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                        {respondendo === 'aceitar' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        Aceitar
                    </button>
                    <button
                        type="button"
                        onClick={() => onRecusar(convite)}
                        disabled={ocupado}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                        {respondendo === 'recusar' ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                        Recusar
                    </button>
                </div>
            </div>
        </article>
    );
}
