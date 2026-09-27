'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useClinica } from '@/app/context/ClinicaContext';
import { LoginBrandPanel } from '@/app/login/page';
import { clearAuthCookies, clearSuperAdminCache } from '@/lib/authCookies';
import { clearProfileSession } from '@/lib/profileSession';
import { Building2, ChevronRight, Globe, LogOut } from 'lucide-react';

function nomeRede(c: { redes?: { nome?: string } | { nome?: string }[] | null }): string | null {
    const r = c?.redes;
    if (!r) return null;
    const obj = Array.isArray(r) ? r[0] : r;
    return obj?.nome || null;
}

type ClinicaOpcao = {
    id: string | number;
    nome: string;
    endereco?: string | null;
    redes?: { nome?: string } | { nome?: string }[] | null;
};

export default function SelecaoClinica() {
    const [clinicas, setClinicas] = useState<ClinicaOpcao[]>([]);
    const [loading, setLoading] = useState(true);
    const [usuario, setUsuario] = useState<{ nome?: string } | null>(null);
    const router = useRouter();
    const { setActiveClinicById } = useClinica();

    useEffect(() => {
        carregar();
    }, []);

    async function carregar() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/login'); return; }

            const res = await fetch('/api/listar-clinicas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id }),
            });

            const json = await res.json();
            if (!res.ok) {
                console.error(json.error);
                await fallbackCarregarDoCliente();
                return;
            }

            setUsuario(json.usuario);
            const listaDoBanco = (json.clinicas || []) as ClinicaOpcao[];
            setClinicas([{ id: 'todas', nome: 'Todas as clínicas', endereco: 'Visão geral' }, ...listaDoBanco]);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    }

    async function fallbackCarregarDoCliente() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoading(false); return; }

        const { data: prof } = await supabase
            .from('profissionais')
            .select('id, is_super_admin, nome')
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (prof?.nome) setUsuario({ nome: prof.nome });

        let minhas: ClinicaOpcao[] = [];
        if (prof?.is_super_admin) {
            const { data } = await supabase.from('clinicas').select('id, nome, endereco').order('nome');
            minhas = (data || []) as ClinicaOpcao[];
        } else if (prof?.id) {
            const { data: vinculos } = await supabase
                .from('profissionais_clinicas')
                .select('clinica_id')
                .eq('profissional_id', prof.id);
            const ids = Array.from(new Set((vinculos || []).map((v: { clinica_id: string | number }) => v.clinica_id))).filter((x) => x != null);
            if (ids.length > 0) {
                const { data } = await supabase.from('clinicas').select('id, nome, endereco').in('id', ids).order('nome');
                minhas = (data || []) as ClinicaOpcao[];
            }
        }

        setClinicas([{ id: 'todas', nome: 'Todas as clínicas', endereco: 'Visão geral' }, ...minhas]);
        setLoading(false);
    }

    function selecionar(id: string) {
        const normalized = id === 'todas' ? 'all' : id;
        localStorage.setItem('ortus_clinica_id', normalized);
        try { setActiveClinicById(normalized); } catch { /* contexto ainda hidratando */ }
        router.replace('/dashboard');
    }

    async function sair() {
        await supabase.auth.signOut();
        localStorage.removeItem('ortus_clinica_id');
        localStorage.removeItem('ortus_clinics_cache');
        clearAuthCookies();
        clearSuperAdminCache();
        clearProfileSession();
        try { sessionStorage.clear(); } catch { /* sessão já encerrada */ }
        router.push('/login');
    }

    const primeiroNome = usuario?.nome?.split(' ')[0];

    return (
        <div className="flex min-h-[100dvh] w-full flex-col font-poppins lg:flex-row">
            <div className="h-[28vh] min-h-[180px] shrink-0 bg-white pt-3 sm:pt-4 lg:hidden">
                <LoginBrandPanel className="h-full !p-0 px-3 pb-0 sm:px-4" />
            </div>

            <div className="relative z-10 flex flex-1 flex-col bg-white lg:max-w-[50%] lg:shrink-0">
                <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-10 sm:py-14">
                    <div className="w-full max-w-[420px]">
                        <div className="mb-8 text-center">
                            <img src="/landing/ortus-wordmark.svg" alt="Ortus" className="mx-auto mb-6 h-6 w-auto brightness-0 sm:h-[1.65rem]" />
                            <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-neutral-900 sm:text-[1.65rem]">
                                {primeiroNome ? `Olá, ${primeiroNome}` : 'Olá'}
                            </h1>
                            <p className="mx-auto mt-2 max-w-[320px] text-xs leading-relaxed text-neutral-500 sm:text-[13px]">
                                Escolha a unidade para continuar.
                            </p>
                        </div>

                        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-0.5 sm:max-h-[58vh]">
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="flex h-[4.5rem] animate-pulse items-center gap-3 rounded-[1.15rem] bg-[#f3f4f1] px-3" />
                                ))
                            ) : clinicas.length === 0 ? (
                                <p className="rounded-[1.15rem] bg-[#f3f4f1] px-4 py-8 text-center text-sm text-neutral-500">
                                    Nenhuma unidade vinculada a esta conta.
                                </p>
                            ) : (
                                clinicas.map((c) => {
                                    const todas = String(c.id) === 'todas';
                                    const rede = nomeRede(c);
                                    return (
                                        <button
                                            key={String(c.id)}
                                            type="button"
                                            onClick={() => selecionar(String(c.id))}
                                            className="flex w-full items-center gap-3 rounded-[1.15rem] border border-black/8 bg-white px-3 py-3 text-left transition-colors hover:border-black/15 hover:bg-[#f8f8f6] sm:px-4"
                                        >
                                            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${todas ? 'bg-neutral-900 text-white' : 'bg-[#f3f4f1] text-neutral-700'}`}>
                                                {todas ? <Globe size={18} strokeWidth={1.75} /> : <Building2 size={18} strokeWidth={1.75} />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                {!todas && rede ? (
                                                    <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{rede}</span>
                                                ) : null}
                                                <span className="block truncate text-sm font-semibold text-neutral-900">{c.nome}</span>
                                                <span className="mt-0.5 block truncate text-xs text-neutral-500">{c.endereco || 'Unidade'}</span>
                                            </span>
                                            <ChevronRight size={18} className="shrink-0 text-neutral-300" />
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={sair}
                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-black/10 py-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-[#f3f4f1] hover:text-neutral-900"
                        >
                            <LogOut size={16} />
                            Sair da conta
                        </button>
                    </div>
                </div>
            </div>

            <div className="hidden min-h-[100dvh] flex-1 bg-white lg:flex lg:flex-col">
                <LoginBrandPanel className="flex-1" />
            </div>
        </div>
    );
}
