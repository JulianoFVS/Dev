'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export type ClinicRecord = {
  id: string;
  nome: string;
  endereco?: string | null;
  rede_id?: string | null;
  redes?: { id: string; nome: string } | { id: string; nome: string }[] | null;
};

type ActiveClinic =
  | { id: 'all'; nome: 'Todas as Clínicas'; rede_id: null; redes: null }
  | (ClinicRecord & { id: string });

type ClinicaContextType = {
  loading: boolean;
  clinics: ClinicRecord[];          // unidades permitidas para o usuário logado
  activeClinic: ActiveClinic | null; // unidade selecionada (ou 'all' para visão consolidada)
  activeClinicId: string | 'all' | null; // valor escalar pronto para queries
  setActiveClinicById: (id: string | 'all') => void;
  refreshClinics: () => Promise<void>;
  // Aliases mantidos por compat com código legado
  selectedClinicaId: string | 'all';
  setSelectedClinicaId: (id: string | 'all') => void;
  clinicaNome: string;
};

const ClinicaContext = createContext<ClinicaContextType | undefined>(undefined);

const STORAGE_KEY = 'ortus_clinica_id';

function pickRede(c?: ClinicRecord | null): { id: string; nome: string } | null {
  if (!c) return null;
  const r = c.redes;
  if (!r) return null;
  return Array.isArray(r) ? (r[0] || null) : r;
}

export function ClinicaProvider({ children }: { children: ReactNode }) {
  const [clinics, setClinics] = useState<ClinicRecord[]>([]);
  const [activeId, setActiveId] = useState<string | 'all' | null>(null);
  const [loading, setLoading] = useState(true);

  const loadClinics = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setClinics([]);
        setActiveId(null);
        setLoading(false);
        return;
      }

      // ===== Multi-Tenant Hard Boundary =====
      // Estratégia em 3 etapas (mais resiliente ao RLS do que um único
      // SELECT com nested embed + filtro em coluna aninhada):
      //   1. profissionais.id do auth.uid() corrente
      //   2. clinica_ids vinculados a esse profissional
      //   3. clinicas (+ redes) filtradas por esses ids
      // Cada etapa cai em uma policy clara e o motor não precisa
      // resolver embeds encadeados sob RLS.

      const logErro = (etapa: string, error: any) => {
        if (!error) return;
        console.error(
          `[ClinicaContext] Falha em "${etapa}":\n` +
          `  message: ${error.message}\n` +
          `  details: ${error.details}\n` +
          `  hint:    ${error.hint}\n` +
          `  code:    ${error.code}`,
          error,
        );
      };

      // 1) profissional do usuário logado
      const { data: prof, error: profErr } = await supabase
        .from('profissionais')
        .select('id, is_super_admin')
        .eq('user_id', session.user.id)
        .maybeSingle();
      logErro('profissionais.select', profErr);

      let lista: ClinicRecord[] = [];

      if (prof?.is_super_admin) {
        // Super admin: vê todas as clínicas (bypass intencional para o backoffice).
        const { data, error } = await supabase
          .from('clinicas')
          .select('id, nome, endereco, rede_id, redes(id, nome)')
          .order('nome');
        logErro('clinicas.select (super admin)', error);
        lista = (data || []) as ClinicRecord[];
      } else if (prof?.id) {
        // 2) clinica_ids vinculados a esse profissional
        const { data: vinculos, error: vincErr } = await supabase
          .from('profissionais_clinicas')
          .select('clinica_id')
          .eq('profissional_id', prof.id);
        logErro('profissionais_clinicas.select', vincErr);

        const ids = Array.from(new Set((vinculos || []).map((v: any) => v.clinica_id))).filter((x) => x !== null && x !== undefined);

        if (ids.length > 0) {
          // 3) clinicas que o usuário pode acessar (RLS já é redundante aqui)
          const { data: clins, error: clErr } = await supabase
            .from('clinicas')
            .select('id, nome, endereco, rede_id, redes(id, nome)')
            .in('id', ids as any)
            .order('nome');
          logErro('clinicas.select (in ids)', clErr);
          lista = (clins || []) as ClinicRecord[];
        }
      }

      setClinics(lista);

      // Resolve a clínica ativa — cada início de sessão deve escolher novamente se houver múltiplas
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      let nextId: string | 'all' | null = null;

      if (lista.length === 1) {
        nextId = String(lista[0].id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, nextId);
        }
      } else if (lista.length > 1) {
        if (stored === 'all' || stored === 'todas') {
          nextId = 'all';
        } else if (stored && lista.some((c) => String(c.id) === stored)) {
          nextId = stored; // respeita escolha feita durante a sessão
        } else {
          nextId = null; // sem seleção válida → tela /selecao
        }
      } else {
        nextId = null;
      }

      setActiveId(nextId);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClinics();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        loadClinics();
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [loadClinics]);

  const setActiveClinicById = useCallback((id: string | 'all') => {
    setActiveId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id === 'all' ? 'all' : String(id));
      window.dispatchEvent(new CustomEvent('ortus:active-clinic-changed', { detail: { id } }));
    }
  }, []);

  const activeClinic = useMemo<ActiveClinic | null>(() => {
    if (activeId === 'all') return { id: 'all', nome: 'Todas as Clínicas', rede_id: null, redes: null };
    if (!activeId) return null;
    const found = clinics.find((c) => String(c.id) === String(activeId));
    return found ? (found as ActiveClinic) : null;
  }, [activeId, clinics]);

  const value = useMemo<ClinicaContextType>(() => ({
    loading,
    clinics,
    activeClinic,
    activeClinicId: activeId,
    setActiveClinicById,
    refreshClinics: loadClinics,
    // Aliases legacy
    selectedClinicaId: (activeId ?? 'all') as string | 'all',
    setSelectedClinicaId: setActiveClinicById,
    clinicaNome: activeClinic?.nome || 'Todas as Clínicas',
  }), [loading, clinics, activeClinic, activeId, setActiveClinicById, loadClinics]);

  return <ClinicaContext.Provider value={value}>{children}</ClinicaContext.Provider>;
}

export function useClinica() {
  const ctx = useContext(ClinicaContext);
  if (!ctx) throw new Error('useClinica deve ser usado dentro de um ClinicaProvider');
  return ctx;
}

// Alias semântico em inglês para novos códigos
export const useClinic = useClinica;

export function getClinicLabel(clinic?: ClinicRecord | ActiveClinic | null) {
  if (!clinic) return 'Sem unidade';
  if ((clinic as ActiveClinic).id === 'all') return 'Todas as Clínicas';
  const rede = pickRede(clinic as ClinicRecord);
  return rede ? `${rede.nome} · ${clinic.nome}` : clinic.nome;
}
