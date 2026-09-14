'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import {
    Search, User, Calendar, DollarSign, Settings, LayoutDashboard,
    Smile, FolderOpen, Bell, BarChart3, X, ArrowRight, Command, ClipboardList, ShieldCheck, Mail,
} from 'lucide-react';
import type { ModuleName } from '@/lib/types/permissions';

type OmniResult = {
    id: string;
    label: string;
    sublabel?: string;
    icon: ReactNode;
    action: () => void;
    category: 'paciente' | 'navegacao' | 'comando';
    module?: ModuleName;
};

const PAGINAS: OmniResult[] = [];

type OmnibarProps = {
    moduleAccess: Record<ModuleName, boolean>;
    isAdmin: boolean;
};

export default function Omnibar({ moduleAccess, isAdmin }: OmnibarProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<OmniResult[]>([]);
    const [activeIdx, setActiveIdx] = useState(0);
    const [pacientesCache, setPacientesCache] = useState<any[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const { openPatient } = usePatientSlideOver();

    const canAccessModule = useCallback((module?: ModuleName) => {
        if (!module) return true;
        if (isAdmin) return true;
        return !!moduleAccess[module];
    }, [isAdmin, moduleAccess]);

    const navItems = useMemo<OmniResult[]>(() => {
        const base: OmniResult[] = [
            { id: 'nav_dash', label: 'Dashboard', sublabel: 'Visão geral da clínica', icon: <LayoutDashboard size={16} className="text-blue-500"/>, action: () => router.push('/dashboard'), category: 'navegacao', module: 'inteligencia' },
            { id: 'nav_agenda', label: 'Agenda', sublabel: 'Calendário de consultas', icon: <Calendar size={16} className="text-emerald-500"/>, action: () => router.push('/agenda'), category: 'navegacao', module: 'agenda' },
            { id: 'nav_pac', label: 'Pacientes', sublabel: 'Lista de pacientes', icon: <User size={16} className="text-indigo-500"/>, action: () => router.push('/pacientes'), category: 'navegacao', module: 'ficha_paciente' },
            { id: 'nav_fin', label: 'Financeiro', sublabel: 'Entradas e saídas', icon: <DollarSign size={16} className="text-amber-500"/>, action: () => router.push('/financeiro'), category: 'navegacao', module: 'financeiro' },
            { id: 'nav_prot', label: 'Próteses', sublabel: 'Kanban de próteses', icon: <Smile size={16} className="text-pink-500"/>, action: () => router.push('/proteses'), category: 'navegacao', module: 'controle_protese' },
            { id: 'nav_inbox', label: 'Notificações', sublabel: 'Central de avisos', icon: <Bell size={16} className="text-purple-500"/>, action: () => router.push('/inbox'), category: 'navegacao' },
            { id: 'nav_mensagens', label: 'Mensagens', sublabel: 'Central de mensagens', icon: <Mail size={16} className="text-indigo-500"/>, action: () => router.push('/mensagens'), category: 'navegacao' },
            { id: 'nav_trat_base', label: 'Tratamentos Base', sublabel: 'Catálogo de especialidades e procedimentos', icon: <ClipboardList size={16} className="text-emerald-500"/>, action: () => router.push('/ajustes/tratamentos'), category: 'navegacao', module: 'configuracoes' },
            { id: 'nav_equipe', label: 'Equipe', sublabel: 'Profissionais, permissões e comissões', icon: <ShieldCheck size={16} className="text-blue-500"/>, action: () => router.push('/ajustes/equipe'), category: 'navegacao', module: 'configuracoes' },
            { id: 'nav_config', label: 'Configurações', sublabel: 'Clínicas, preferências, backup', icon: <Settings size={16} className="text-slate-500"/>, action: () => router.push('/configuracoes'), category: 'navegacao', module: 'configuracoes' },
            { id: 'nav_relat', label: 'Relatórios', sublabel: 'Faturamento e estatísticas', icon: <BarChart3 size={16} className="text-cyan-500"/>, action: () => router.push('/relatorios'), category: 'navegacao', module: 'inteligencia' },
        ];
        return base.filter((item) => canAccessModule(item.module));
    }, [router, canAccessModule]);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(prev => !prev);
            }
            if (e.key === 'Escape' && open) {
                setOpen(false);
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open]);

    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIdx(0);
            setTimeout(() => inputRef.current?.focus(), 50);
            if (pacientesCache.length === 0) {
                supabase.from('pacientes').select('id, nome, telefone, cpf').limit(500).then(({ data }) => {
                    if (data) setPacientesCache(data);
                });
            }
        }
    }, [open]);

    const search = useCallback((q: string) => {
        const term = q.trim().toLowerCase();
        if (!term) {
            setResults(navItems.slice(0, 6));
            setActiveIdx(0);
            return;
        }

        const matched: OmniResult[] = [];

        // Search patients
        const pacMatch = pacientesCache.filter(p =>
            p.nome?.toLowerCase().includes(term) ||
            p.cpf?.includes(term) ||
            p.telefone?.includes(term)
        ).slice(0, 5);

        pacMatch.forEach(p => {
            matched.push({
                id: `pac_${p.id}`,
                label: p.nome,
                sublabel: p.telefone || p.cpf || '',
                icon: <User size={16} className="text-blue-500"/>,
                action: () => { openPatient(p.id); setOpen(false); },
                category: 'paciente',
            });
        });

        // Search pages
        const navMatch = navItems.filter(n =>
            n.label.toLowerCase().includes(term) ||
            (n.sublabel || '').toLowerCase().includes(term)
        );
        matched.push(...navMatch);

        setResults(matched.slice(0, 10));
        setActiveIdx(0);
    }, [pacientesCache, navItems, openPatient]);

    useEffect(() => { if (open) search(query); }, [query, search, open]);

    function handleKeyNav(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[activeIdx]) {
            e.preventDefault();
            results[activeIdx].action();
            setOpen(false);
        }
    }

    if (!open) return null;

    const grouped = {
        paciente: results.filter(r => r.category === 'paciente'),
        navegacao: results.filter(r => r.category === 'navegacao'),
        comando: results.filter(r => r.category === 'comando'),
    };
    let flatIdx = 0;

    const rowClass = (idx: number) =>
        idx === activeIdx
            ? 'border border-black/10 bg-white shadow-sm'
            : 'border border-transparent bg-[#f8f8f6] hover:bg-white hover:border-black/5';

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-neutral-950/45 pt-[12vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
            <div
                className="w-full max-w-xl overflow-hidden rounded-[1.65rem] border border-black/10 bg-[#f3f4f1] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-3.5 sm:px-5">
                    <Search size={20} className="shrink-0 text-neutral-500" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyNav}
                        placeholder="Buscar pacientes, páginas, comandos..."
                        className="flex-1 bg-transparent text-sm font-medium text-neutral-900 outline-none placeholder:text-neutral-400 sm:text-base"
                    />
                    <kbd className="hidden rounded-full border border-black/10 bg-[#f3f4f1] px-2.5 py-1 text-[10px] font-semibold text-neutral-500 sm:inline-flex">
                        ESC
                    </kbd>
                </div>

                <div className="max-h-[50vh] overflow-y-auto p-2 sm:p-3">
                    {results.length === 0 && query && (
                        <div className="py-8 text-center text-sm text-neutral-500">
                            Nenhum resultado para &quot;<span className="font-semibold text-neutral-800">{query}</span>&quot;
                        </div>
                    )}

                    {grouped.paciente.length > 0 && (
                        <div className="mb-2">
                            <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Pacientes</div>
                            {grouped.paciente.map((r) => {
                                const idx = flatIdx++;
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => {
                                            r.action();
                                            setOpen(false);
                                        }}
                                        className={`mb-1.5 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${rowClass(idx)}`}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                    >
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">{r.icon}</div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-semibold text-neutral-900">{r.label}</div>
                                            {r.sublabel && <div className="truncate text-xs text-neutral-500">{r.sublabel}</div>}
                                        </div>
                                        <ArrowRight size={15} className="shrink-0 text-neutral-400" />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {grouped.navegacao.length > 0 && (
                        <div className="mb-1">
                            <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Páginas</div>
                            {grouped.navegacao.map((r) => {
                                const idx = flatIdx++;
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => {
                                            r.action();
                                            setOpen(false);
                                        }}
                                        className={`mb-1.5 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${rowClass(idx)}`}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                    >
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">{r.icon}</div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-semibold text-neutral-900">{r.label}</div>
                                            {r.sublabel && <div className="truncate text-xs text-neutral-500">{r.sublabel}</div>}
                                        </div>
                                        <ArrowRight size={15} className="shrink-0 text-neutral-400" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-black/5 bg-white px-4 py-2.5 text-[11px] font-medium text-neutral-500">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="flex items-center gap-1">
                            <kbd className="rounded-md border border-black/10 bg-[#f3f4f1] px-1.5 py-0.5 text-[10px]">↑↓</kbd> navegar
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="rounded-md border border-black/10 bg-[#f3f4f1] px-1.5 py-0.5 text-[10px]">↵</kbd> selecionar
                        </span>
                        <span className="hidden items-center gap-1 sm:flex">
                            <kbd className="rounded-md border border-black/10 bg-[#f3f4f1] px-1.5 py-0.5 text-[10px]">esc</kbd> fechar
                        </span>
                    </div>
                    <span className="flex items-center gap-1">
                        <Command size={11} /> K
                    </span>
                </div>
            </div>
        </div>
    );
}
