'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import { usePatientActionModal } from '@/components/PatientActionModal';
import Modal from '@/components/ui/Modal';
import {
  Search,
  User,
  UserPlus,
  CalendarPlus,
  AlertCircle,
  Clock,
  X,
} from 'lucide-react';
import ModalNovoAgendamento from '@/components/agenda/ModalNovoAgendamento';
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
  const [agenda, setAgenda] = useState<{ pacienteId?: string; pacienteNome?: string; clinicaId?: string } | null>(null);
  const [aviso, setAviso] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { openPatient } = usePatientSlideOver();
  const { openQuickCapture } = usePatientActionModal();
  const { activeClinicId, clinics } = useClinica();
  const clinicIds = useMemo(() => {
    if (activeClinicId && activeClinicId !== 'all') return [Number(activeClinicId)];
    return clinics.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
  }, [activeClinicId, clinics]);

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
        id: 'atalho_agenda',
        label: 'Novo agendamento',
        sublabel: 'Marcar consulta sem sair da tela',
        icon: <CalendarPlus size={18} strokeWidth={1.75} />,
        action: () => setAgenda({}),
        category: 'navegacao',
        module: 'agenda',
      },
      {
        id: 'atalho_paciente',
        label: 'Novo paciente',
        sublabel: 'Cadastro rápido',
        icon: <UserPlus size={18} strokeWidth={1.75} />,
        action: () => openQuickCapture(null),
        category: 'navegacao',
        module: 'ficha_paciente',
      },
      {
        id: 'atalho_debito',
        label: 'Pacientes com débito',
        sublabel: 'Quem ainda está em aberto',
        icon: <AlertCircle size={18} strokeWidth={1.75} />,
        action: () => router.push('/pacientes?filtro=debito'),
        category: 'navegacao',
        module: 'ficha_paciente',
      },
      {
        id: 'atalho_retorno',
        label: 'Sem consulta há 30 dias',
        sublabel: 'Pacientes para retorno',
        icon: <Clock size={18} strokeWidth={1.75} />,
        action: () => router.push('/pacientes?filtro=sem30'),
        category: 'navegacao',
        module: 'ficha_paciente',
      },
    ];
    return base.filter((item) => canAccessModule(item.module));
  }, [router, canAccessModule, openQuickCapture]);

  useEffect(() => {
    function abrir(evento: Event) {
      const detalhe = (evento as CustomEvent<{ pacienteId?: string; pacienteNome?: string; clinicaId?: string }>).detail || {};
      setOpen(false);
      setAgenda({
        pacienteId: detalhe.pacienteId,
        pacienteNome: detalhe.pacienteNome,
        clinicaId: detalhe.clinicaId,
      });
    }
    window.addEventListener('ortus:novo-agendamento', abrir);
    return () => window.removeEventListener('ortus:novo-agendamento', abrir);
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => setAviso(''), 2400);
    return () => window.clearTimeout(timer);
  }, [aviso]);

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
    if (clinicIds.length === 0) {
      setPacientesCache([]);
      return;
    }
    let cancelado = false;
    supabase
      .from('pacientes')
      .select('id, nome, telefone, cpf')
      .in('clinica_id', clinicIds)
      .order('nome')
      .limit(500)
      .then(({ data }) => {
        if (!cancelado && data) setPacientesCache(data);
      });
    return () => { cancelado = true; };
  }, [open, clinicIds]);

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
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${
          active ? 'bg-neutral-900 text-white' : 'text-neutral-900 hover:bg-neutral-50'
        }`}
      >
        <span className={`shrink-0 ${active ? 'text-white' : 'text-neutral-400'}`}>{r.icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${active ? 'text-white' : 'text-neutral-900'}`}>
            {r.label}
          </span>
          {r.sublabel && (
            <span className={`block truncate text-xs ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>
              {r.sublabel}
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <>
    {aviso && (
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[10000] flex justify-center px-4">
        <p className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">{aviso}</p>
      </div>
    )}
    <ModalNovoAgendamento
      open={!!agenda}
      onClose={() => setAgenda(null)}
      pacienteId={agenda?.pacienteId}
      pacienteNome={agenda?.pacienteNome}
      clinicaId={agenda?.clinicaId}
      onSaved={() => setAviso('Agendamento salvo.')}
    />
    {open && <Modal
      open={open}
      onClose={() => setOpen(false)}
      zIndex={100}
      maxWidth="lg"
      hideCloseButton
      panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Busca</h2>
          <p className="mt-0.5 text-xs font-medium text-neutral-400">Pacientes e atalhos da clínica.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <div className="shrink-0 px-5 pt-4 sm:px-6">
        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Buscar</label>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyNav}
            placeholder="Nome, telefone ou atalho"
            className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {results.length === 0 && query ? (
          <p className="px-2 py-6 text-sm text-neutral-500">Nenhum resultado.</p>
        ) : null}

        {grouped.paciente.length > 0 && (
          <div className="mb-2">
            <p className="px-2 pb-1 text-xs font-medium text-neutral-500">Pacientes</p>
            <div className="space-y-0.5">{grouped.paciente.map((r) => renderRow(r))}</div>
          </div>
        )}

        {grouped.navegacao.length > 0 && (
          <div>
            <p className="px-2 pb-1 text-xs font-medium text-neutral-500">Atalhos</p>
            <div className="space-y-0.5">{grouped.navegacao.map((r) => renderRow(r))}</div>
          </div>
        )}
      </div>
    </Modal>}
    </>
  );
}
