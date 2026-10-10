'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { verificarBackupAutomatico } from '@/lib/backup';
import { useRouter, usePathname } from 'next/navigation';
import { PatientSlideOverProvider } from '@/components/PatientSlideOver';
import { PatientActionModalProvider } from '@/components/PatientActionModal';
import Omnibar from '@/components/Omnibar';
import BentoShell from '@/components/dashboard/BentoShell';
import { useClinica } from '@/app/context/ClinicaContext';
import type { ModuleName } from '@/lib/types/permissions';
import { buildModuleAccessMap } from '@/lib/modules';
import { moduleForPath } from '@/lib/permissionPresets';
import {
  readModuleAccessMapFromCookie,
  readSuperAdminCache,
  setAuthMarkerCookie,
  syncModuleAccessCookie,
  writeSuperAdminCache,
} from '@/lib/authCookies';
import {
  PROFILE_PATCH_EVENT,
  readProfileSession,
  writeProfileSession,
  type ProfileSessionSnapshot,
} from '@/lib/profileSession';

const ROTAS_PUBLICAS = ['/login', '/', '/site', '/termos', '/checkout', '/cadastro', '/teste-3d'];

function hasAuthCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith('ortus_auth=1'));
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [tarefasPendentes, setTarefasPendentes] = useState(0);
  const [moduleAccess, setModuleAccess] = useState<Record<ModuleName, boolean>>(() => readModuleAccessMapFromCookie(false));
  const [permissoesResolvidas, setPermissoesResolvidas] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();

  // Header switcher (consome o ClinicaProvider global multi-tenant)
  const { clinics: ctxClinics, activeClinic: ctxActive, activeClinicId: ctxActiveId, loading: clinicLoading } = useClinica();
  const sessaoPronta = useRef(false);
  const perfilRef = useRef<any>(null);
  perfilRef.current = perfil;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const cargaRef = useRef(0);

  useEffect(() => {
    if (!sessaoPronta.current || !session || !perfil) return;
    if (perfil.precisa_trocar_senha && pathname !== '/primeiro-acesso') {
      router.replace('/primeiro-acesso');
    } else if (pathname.startsWith('/super-admin') && !perfil.is_super_admin) {
      router.replace('/dashboard');
    }
  }, [pathname, session, perfil, router]);

  useEffect(() => {
    if (clinicLoading) return;
    if (['/selecao', '/primeiro-acesso', '/login'].includes(pathname)) return;
    if (ctxClinics.length > 1 && !ctxActiveId) {
      router.replace('/selecao');
    }
  }, [clinicLoading, ctxClinics.length, ctxActiveId, pathname, router]);

  useEffect(() => {
    if (loading || !session || !perfil) return;
    if (perfil.nivel_acesso === 'admin' || perfil.is_super_admin) return;
    if (!permissoesResolvidas) return;
    if (pathname === '/dashboard' || pathname.startsWith('/dashboard')) return;
    const rotaPublica = ['/login', '/', '/site', '/termos', '/checkout', '/cadastro', '/selecao', '/primeiro-acesso', '/teste-3d'].includes(pathname) || pathname.startsWith('/super-admin');
    if (rotaPublica) return;
    const modulo = moduleForPath(pathname);
    if (modulo && !moduleAccess[modulo]) {
      router.replace('/dashboard?acesso=negado');
    }
  }, [loading, session, perfil, pathname, moduleAccess, router, permissoesResolvidas]);

  useEffect(() => {
    if (!perfil?.id) return;
    let cancelado = false;

    async function sincronizarPermissoes() {
      if (perfil.nivel_acesso === 'admin' || perfil.is_super_admin) {
        setModuleAccess(buildModuleAccessMap(true));
        syncModuleAccessCookie('all');
        setPermissoesResolvidas(true);
        return;
      }
      const clinicId = ctxActive?.id && ctxActive.id !== 'all' ? Number(ctxActive.id) : null;
      if (!clinicId) {
        if (ctxActive?.id === 'all') {
          setModuleAccess(buildModuleAccessMap(true));
          syncModuleAccessCookie('all');
          setPermissoesResolvidas(true);
        }
        return;
      }
      const { data, error } = await supabase
        .from('permissoes_modulos')
        .select('modulo, pode_acessar')
        .eq('profissional_id', perfil.id)
        .eq('clinica_id', clinicId);
      if (cancelado) return;
      if (error) {
        console.error('[AuthGuard] permissoes_modulos:', error);
        setPermissoesResolvidas(true);
        return;
      }
      const mapa = buildModuleAccessMap(false);
      (data || []).forEach((row: any) => {
        const modulo = row.modulo as ModuleName;
        if (mapa[modulo] !== undefined) mapa[modulo] = !!row.pode_acessar;
      });
      setModuleAccess(mapa);
      syncModuleAccessCookie(mapa);
      setPermissoesResolvidas(true);
    }

    sincronizarPermissoes();
    return () => { cancelado = true; };
  }, [perfil?.id, perfil?.nivel_acesso, perfil?.is_super_admin, ctxActive?.id]);

  // Backup automático
  useEffect(() => {
      if (session) verificarBackupAutomatico().catch(() => {});
  }, [session]);

  const carregarPerfil = useCallback(async () => {
    const path = pathnameRef.current;
    if (ROTAS_PUBLICAS.includes(path)) {
      setLoading(false);
      return;
    }

    const boot = readProfileSession();
    const saasCache = boot?.is_super_admin === true || readSuperAdminCache();
    if (boot?.foto_url || boot?.nome || saasCache) {
      setPerfil((atual: any) => {
        if (atual?.id) return atual;
        return {
          ...atual,
          foto_url: boot?.foto_url ?? atual?.foto_url ?? null,
          nome: boot?.nome ?? atual?.nome ?? null,
          cargo: boot?.cargo ?? atual?.cargo ?? null,
          nivel_acesso: boot?.nivel_acesso ?? atual?.nivel_acesso ?? null,
          is_super_admin: saasCache,
        };
      });
    }

    if (hasAuthCookie()) setLoading(false);

    if (sessaoPronta.current && perfilRef.current?.id) {
      setLoading(false);
      return;
    }

    const carga = ++cargaRef.current;
    const { data: { session: sess } } = await supabase.auth.getSession();
    if (carga !== cargaRef.current) return;

    if (!sess) {
      if (hasAuthCookie()) {
        setLoading(false);
        return;
      }
      router.push('/login');
      return;
    }

    setSession(sess);
    setAuthMarkerCookie();

    const { data: prof, error } = await supabase
      .from('profissionais')
      .select('*')
      .eq('user_id', sess.user.id)
      .maybeSingle();
    if (carga !== cargaRef.current) return;
    if (error) {
      console.error('[AuthGuard] profissionais:', error);
      setLoading(false);
      return;
    }

    if (prof) {
      const saas = prof.is_super_admin === true || (prof.is_super_admin == null && (readSuperAdminCache() || readProfileSession()?.is_super_admin === true));
      if (prof.is_super_admin != null) writeSuperAdminCache(saas);
      const foto = prof.foto_url || readProfileSession()?.foto_url || null;
      const proximo = { ...prof, is_super_admin: saas, foto_url: foto };
      writeProfileSession({
        foto_url: foto,
        nome: prof.nome,
        cargo: prof.cargo,
        nivel_acesso: prof.nivel_acesso,
        is_super_admin: saas,
      });
      perfilRef.current = proximo;
      setPerfil(proximo);
      sessaoPronta.current = true;

      if (prof.precisa_trocar_senha && path !== '/primeiro-acesso') {
        router.replace('/primeiro-acesso');
        setLoading(false);
        return;
      }
      if (path.startsWith('/super-admin') && !saas) {
        router.replace('/dashboard');
        setLoading(false);
        return;
      }
    }

    sessaoPronta.current = true;
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void carregarPerfil();
  }, [pathname, carregarPerfil]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_OUT') {
        sessaoPronta.current = false;
        perfilRef.current = null;
        setPerfil(null);
        setSession(null);
        return;
      }
      if (event === 'INITIAL_SESSION' && !sess) {
        if (!ROTAS_PUBLICAS.includes(pathnameRef.current)) {
          setTimeout(() => router.push('/login'), 0);
        }
        return;
      }
      if (event === 'SIGNED_IN') sessaoPronta.current = false;
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setTimeout(() => { void carregarPerfil(); }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [carregarPerfil, router]);

  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      sessaoPronta.current = false;
      void carregarPerfil();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [carregarPerfil]);

  async function atualizarBadgeTarefas(clinicasIds: (string | number)[]) {
      if (!clinicasIds || clinicasIds.length === 0) {
          setTarefasPendentes(0);
          return;
      }
      const hoje = new Date();
      const tresDiasDepois = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];
      try {
          const { count, error } = await supabase
              .from('tarefas')
              .select('*', { count: 'exact', head: true })
              .in('clinica_id', clinicasIds as any)
              .neq('status', 'concluido')
              .lte('data_limite', tresDiasDepois);
          if (error) throw error;
          setTarefasPendentes(count || 0);
      } catch (err) {
          console.error('[AuthGuard] badge de tarefas', err);
          setTarefasPendentes(0);
      }
  }

  useEffect(() => {
      if (!perfil || clinicLoading) return;
      atualizarBadgeTarefas(ctxClinics.map((c) => c.id));
  }, [perfil?.id, clinicLoading, ctxClinics.length]);

  useEffect(() => {
    const onPatch = (ev: Event) => {
      const detail = (ev as CustomEvent<ProfileSessionSnapshot>).detail;
      setPerfil((p: any) => ({
        ...(p || {}),
        ...detail,
        is_super_admin: detail.is_super_admin ?? p?.is_super_admin,
      }));
    };
    window.addEventListener(PROFILE_PATCH_EVENT, onPatch);
    return () => window.removeEventListener(PROFILE_PATCH_EVENT, onPatch);
  }, []);

  if (['/login', '/', '/site', '/termos', '/checkout', '/cadastro', '/teste-3d', '/selecao', '/primeiro-acesso'].includes(pathname)) return <>{children}</>;
  // Mostra spinner bloqueante APENAS se não temos cookie de auth (primeiro acesso)
  if (loading) return <div className="flex h-screen w-screen items-center justify-center bg-[#f3f4f1]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" /></div>;
  // Se validação em background ainda não terminou mas já temos cookie, continua renderizando
  // Se não tem session e não tem cookie (ex: sessão expirada), redireciona via validarSessao
  if (!session && !hasAuthCookie()) return null;

  // Layout limpo (sem sidebar) — onboarding e troca de clínica
  if (pathname === '/selecao' || pathname === '/primeiro-acesso') {
      return <>{children}</>;
  }

  const isPerfilAdmin = perfil?.nivel_acesso === 'admin' || perfil?.is_super_admin;

  const canAccessModule = (module?: ModuleName) => {
      if (!module) return true;
      if (isPerfilAdmin) return true;
      return moduleAccess[module];
  };

  return (
      <PatientSlideOverProvider>
        <PatientActionModalProvider>
          <BentoShell
            sidebarNav={{
              showTarefas: !permissoesResolvidas || canAccessModule('agenda'),
              showEquipe: !permissoesResolvidas || canAccessModule('configuracoes'),
              showTratamentosBase: !permissoesResolvidas || canAccessModule('configuracoes'),
              showPainelSaas: perfil?.is_super_admin === true || readSuperAdminCache(),
              tarefasBadge: tarefasPendentes,
              profilePhotoUrl: perfil?.foto_url ?? null,
              profileName: perfil?.nome ?? null,
            }}
          >
            {children}
          </BentoShell>
          <Omnibar moduleAccess={moduleAccess} isAdmin={isPerfilAdmin} />
        </PatientActionModalProvider>
      </PatientSlideOverProvider>
    );
}
