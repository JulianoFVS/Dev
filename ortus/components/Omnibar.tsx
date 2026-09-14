'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import {
  Search,
  User,
  Calendar,
  DollarSign,
  Settings,
  LayoutDashboard,
  Smile,
  Bell,
  BarChart3,
  ArrowUpRight,
  Command,
  ClipboardList,
  ShieldCheck,
  Mail,
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

  const canAccessModule = useCallback(
    (module?: ModuleName) => {
      if (!module) return true;
      if (isAdmin) return true;
      return !!moduleAccess[module];
    },
    [isAdmin, moduleAccess],
  );

  const navItems = useMemo<OmniResult[]>(() => {
    const base: OmniResult[] = [
      {
        id: 'nav_dash',
        label: 'Dashboard',
        sublabel: 'Visão geral da clínica',
        icon: <LayoutDashboard size={18} strokeWidth={1.75} />,
        action: () => router.push('/dashboard'),
        category: 'navegacao',
        module: 'inteligencia',
      },
      {
        id: 'nav_agenda',
        label: 'Agenda',
        sublabel: 'Calendário de consultas',
        icon: <Calendar size={18} strokeWidth={1.75} />,
        action: () => router.push('/agenda'),
        category: 'navegacao',
        module: 'agenda',
      },
      {
        id: 'nav_pac',
        label: 'Pacientes',
        sublabel: 'Lista de pacientes',
        icon: <User size={18} strokeWidth={1.75} />,
        action: () => router.push('/pacientes'),
        category: 'navegacao',
        module: 'ficha_paciente',
      },
      {
        id: 'nav_fin',
        label: 'Financeiro',
        sublabel: 'Entradas e saídas',
        icon: <DollarSign size={18} strokeWidth={1.75} />,
        action: () => router.push('/financeiro'),
        category: 'navegacao',
        module: 'financeiro',
      },
      {
        id: 'nav_prot',
        label: 'Próteses',
        sublabel: 'Kanban de próteses',
        icon: <Smile size={18} strokeWidth={1.75} />,
        action: () => router.push('/proteses'),
        category: 'navegacao',
        module: 'controle_protese',
      },
      {
        id: 'nav_inbox',
        label: 'Notificações',
        sublabel: 'Central de avisos',
        icon: <Bell size={18} strokeWidth={1.75} />,
        action: () => router.push('/inbox'),
        category: 'navegacao',
      },
      {
        id: 'nav_mensagens',
        label: 'Mensagens',
        sublabel: 'Central de mensagens',
        icon: <Mail size={18} strokeWidth={1.75} />,
        action: () => router.push('/mensagens'),
        category: 'navegacao',
      },
      {
        id: 'nav_trat_base',
        label: 'Tratamentos base',
        sublabel: 'Catálogo de procedimentos',
        icon: <ClipboardList size={18} strokeWidth={1.75} />,
        action: () => router.push('/ajustes/tratamentos'),
        category: 'navegacao',
        module: 'configuracoes',
      },
      {
        id: 'nav_equipe',
        label: 'Equipe',
        sublabel: 'Profissionais e permissões',
        icon: <ShieldCheck size={18} strokeWidth={1.75} />,
        action: () => router.push('/ajustes/equipe'),
        category: 'navegacao',
        module: 'configuracoes',
      },
      {
        id: 'nav_config',
        label: 'Configurações',
        sublabel: 'Clínicas e preferências',
        icon: <Settings size={18} strokeWidth={1.75} />,
        action: () => router.push('/configuracoes'),
        category: 'navegacao',
        module: 'configuracoes',
      },
      {
        id: 'nav_relat',
        label: 'Relatórios',
        sublabel: 'Faturamento e estatísticas',
        icon: <BarChart3 size={18} strokeWidth={1.75} />,
        action: () => router.push('/relatorios'),
        category: 'navegacao',
        module: 'inteligencia',
      },
    ];
    return base.filter((item) => canAccessModule(item.module));
  }, [router, canAccessModule]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    setTimeout(() => inputRef.current?.focus(), 40);
    if (pacientesCache.length === 0) {
      supabase
        .from('pacientes')
        .select('id, nome, telefone, cpf')
        .limit(500)
        .then(({ data }) => {
          if (data) setPacientesCache(data);
        });
    }
  }, [open, pacientesCache.length]);

  const search = useCallback(
    (q: string) => {
      const term = q.trim().toLowerCase();
      if (!term) {
        setResults(navItems);
        setActiveIdx(0);
        return;
      }

      const matched: OmniResult[] = [];

      pacientesCache
        .filter(
          (p) =>
            p.nome?.toLowerCase().includes(term) ||
            p.cpf?.includes(term) ||
            p.telefone?.includes(term),
        )
        .slice(0, 6)
        .forEach((p) => {
          matched.push({
            id: `pac_${p.id}`,
            label: p.nome,
            sublabel: p.telefone || p.cpf || '',
            icon: <User size={18} strokeWidth={1.75} />,
            action: () => {
              openPatient(p.id);
              setOpen(false);
            },
            category: 'paciente',
          });
        });

      matched.push(
        ...navItems.filter(
          (n) =>
            n.label.toLowerCase().includes(term) ||
            (n.sublabel || '').toLowerCase().includes(term),
        ),
      );

      setResults(matched.slice(0, 12));
      setActiveIdx(0);
    },
    [pacientesCache, navItems, openPatient],
  );

  useEffect(() => {
    if (open) search(query);
  }, [query, search, open]);

  function handleKeyNav(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[activeIdx]) {
      e.preventDefault();
      results[activeIdx].action();
      setOpen(false);
    }
  }

  if (!open) return null;

  const grouped = {
    paciente: results.filter((r) => r.category === 'paciente'),
    navegacao: results.filter((r) => r.category === 'navegacao'),
  };

  let flatIdx = 0;

  function renderRow(r: OmniResult) {
    const idx = flatIdx++;
    const active = idx === activeIdx;
    return (
      <button
        key={r.id}
        type="button"
        onClick={() => {
          r.action();
          setOpen(false);
        }}
        onMouseEnter={() => setActiveIdx(idx)}
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
          active ? 'bg-neutral-900 text-white' : 'text-neutral-900 hover:bg-white'
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            active ? 'bg-white/15 text-white' : 'bg-[#f3f4f1] text-neutral-700'
          }`}
        >
          {r.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${active ? 'text-white' : 'text-neutral-900'}`}>
            {r.label}
          </span>
          {r.sublabel && (
            <span className={`block truncate text-xs ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>
              {r.sublabel}
            </span>
          )}
        </span>
        <ArrowUpRight size={16} className={active ? 'text-white/70' : 'text-neutral-400'} />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-neutral-950/50 px-3 pt-[10vh] backdrop-blur-sm sm:px-4"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-[#eceee9] shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:max-w-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
      >
        <div className="border-b border-black/5 bg-white px-4 py-4 sm:px-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Busca rápida</p>
          <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-[#f8f8f6] px-3 py-2.5">
            <Search size={20} className="shrink-0 text-neutral-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyNav}
              placeholder="Paciente, página ou comando…"
              className="min-w-0 flex-1 bg-transparent text-base font-medium text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            <kbd className="hidden rounded-lg border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-500 sm:inline">
              esc
            </kbd>
          </div>
        </div>

        <div className="max-h-[min(52vh,420px)] overflow-y-auto p-2 sm:p-3">
          {results.length === 0 && query ? (
            <p className="py-10 text-center text-sm text-neutral-500">
              Nada encontrado para &quot;<span className="font-semibold text-neutral-800">{query}</span>&quot;
            </p>
          ) : null}

          {grouped.paciente.length > 0 && (
            <div className="mb-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Pacientes</p>
              <div className="space-y-1">{grouped.paciente.map((r) => renderRow(r))}</div>
            </div>
          )}

          {grouped.navegacao.length > 0 && (
            <div>
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Páginas</p>
              <div className="space-y-1">{grouped.navegacao.map((r) => renderRow(r))}</div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 bg-white px-4 py-2.5 text-[11px] font-medium text-neutral-500">
          <div className="flex flex-wrap gap-2">
            <span>
              <kbd className="rounded border border-black/10 bg-[#f3f4f1] px-1.5 py-0.5">↑↓</kbd> navegar
            </span>
            <span>
              <kbd className="rounded border border-black/10 bg-[#f3f4f1] px-1.5 py-0.5">↵</kbd> abrir
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <Command size={11} />K
          </span>
        </div>
      </div>
    </div>
  );
}
