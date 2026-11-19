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

const PONTO_STATUS: Record<ConviteStatus, string> = {
    pendente: 'bg-amber-500',
    aceito: 'bg-emerald-500',
    recusado: 'bg-red-500',
    cancelado: 'bg-neutral-300',
    expirado: 'bg-neutral-300',
};

export function ConviteStatusBadge({ status }: { status: ConviteStatus }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-700">
            <span className={`h-1.5 w-1.5 rounded-full ${PONTO_STATUS[status]}`} />
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
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                            <MailPlus size={19} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-semibold text-neutral-900">Convite de equipe</h3>
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
                                <dt className="text-xs font-medium text-neutral-500">Unidades</dt>
                                <dd className="break-words text-neutral-700">{clinicas}</dd>
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <Network size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                            <div className="min-w-0">
                                <dt className="text-xs font-medium text-neutral-500">Rede</dt>
                                <dd className="break-words text-neutral-700">{convite.rede_nome || 'Não informada'}</dd>
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <Briefcase size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                            <div className="min-w-0">
                                <dt className="text-xs font-medium text-neutral-500">Cargo</dt>
                                <dd className="break-words text-neutral-700">{convite.cargo || 'Não informado'}</dd>
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <CalendarClock size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                            <div className="min-w-0">
                                <dt className="text-xs font-medium text-neutral-500">Prazo</dt>
                                <dd className="break-words text-neutral-700">
                                    Expira em {formatarDataConvite(convite.expires_at, true)}
                                </dd>
                            </div>
                        </div>
                    </dl>

                    {convite.mensagem ? (
                        <blockquote className="mt-3 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm break-words text-neutral-700">
                            “{convite.mensagem}”
                        </blockquote>
                    ) : null}
                </div>

                {/* Celular: os dois lado a lado, metade cada, com 44px. A decisão fica inteira à vista, sem um botão empurrar o outro para baixo. */}
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row lg:w-auto lg:shrink-0 lg:flex-col xl:flex-row">
                    <button
                        type="button"
                        onClick={() => onAceitar(convite)}
                        disabled={ocupado}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:w-auto"
                    >
                        {respondendo === 'aceitar' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        Aceitar
                    </button>
                    <button
                        type="button"
                        onClick={() => onRecusar(convite)}
                        disabled={ocupado}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 sm:w-auto"
                    >
                        {respondendo === 'recusar' ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                        Recusar
                    </button>
                </div>
            </div>
        </article>
    );
}
