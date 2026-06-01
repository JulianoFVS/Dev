'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import {
    Search, User, Calendar, DollarSign, Settings, LayoutDashboard,
    Smile, FolderOpen, Bell, BarChart3, X, ArrowRight, Command,
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
            { id: 'nav_config', label: 'Configurações', sublabel: 'Clínicas, equipe, preferências', icon: <Settings size={16} className="text-slate-500"/>, action: () => router.push('/configuracoes'), category: 'navegacao', module: 'configuracoes' },
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

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[15vh] animate-in fade-in duration-150" onClick={() => setOpen(false)}>
            <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Search input */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                    <Search size={20} className="text-slate-400 shrink-0"/>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyNav}
                        placeholder="Buscar pacientes, páginas, comandos..."
                        className="flex-1 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
                    />
                    <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-1 bg-slate-100 text-slate-400 text-[10px] font-bold rounded border border-slate-200">
                        ESC
                    </kbd>
                </div>

                {/* Results */}
                <div className="max-h-[50vh] overflow-y-auto p-2">
                    {results.length === 0 && query && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                            Nenhum resultado para "<span className="font-bold text-slate-600">{query}</span>"
                        </div>
                    )}

                    {grouped.paciente.length > 0 && (
                        <div className="mb-1">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pacientes</div>
                            {grouped.paciente.map(r => {
                                const idx = flatIdx++;
                                return (
                                    <button key={r.id} onClick={() => { r.action(); setOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${idx === activeIdx ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${idx === activeIdx ? 'bg-blue-100' : 'bg-slate-100'}`}>{r.icon}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate">{r.label}</div>
                                            {r.sublabel && <div className="text-[11px] text-slate-400 truncate">{r.sublabel}</div>}
                                        </div>
                                        <ArrowRight size={14} className={`shrink-0 ${idx === activeIdx ? 'text-blue-400' : 'text-slate-300'}`}/>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {grouped.navegacao.length > 0 && (
                        <div className="mb-1">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Páginas</div>
                            {grouped.navegacao.map(r => {
                                const idx = flatIdx++;
                                return (
                                    <button key={r.id} onClick={() => { r.action(); setOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${idx === activeIdx ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${idx === activeIdx ? 'bg-blue-100' : 'bg-slate-100'}`}>{r.icon}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate">{r.label}</div>
                                            {r.sublabel && <div className="text-[11px] text-slate-400 truncate">{r.sublabel}</div>}
                                        </div>
                                        <ArrowRight size={14} className={`shrink-0 ${idx === activeIdx ? 'text-blue-400' : 'text-slate-300'}`}/>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">↑↓</kbd> navegar</span>
                        <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">↵</kbd> selecionar</span>
                        <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">esc</kbd> fechar</span>
                    </div>
                    <span className="flex items-center gap-1"><Command size={10}/> K</span>
                </div>
            </div>
        </div>
    );
}
