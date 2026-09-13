'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { verificarBackupAutomatico } from '@/lib/backup';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { PatientSlideOverProvider } from '@/components/PatientSlideOver';
import { PatientActionModalProvider } from '@/components/PatientActionModal';
import Omnibar from '@/components/Omnibar';
import { 
    LayoutDashboard, Users, LogOut, Calendar, Menu, X, DollarSign, 
    Settings, Building2, Bell, Mail, User, ChevronRight, ChevronsUpDown, 
    Check, Smile, ChevronLeft, Globe, ShieldCheck, ShieldAlert, Search, BarChart3,
    CheckSquare, Plus
} from 'lucide-react';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import type { ModuleName } from '@/lib/types/permissions';
import { buildModuleAccessMap } from '@/lib/modules';
import { moduleForPath } from '@/lib/permissionPresets';
import { clearAuthCookies, setAuthMarkerCookie, syncModuleAccessCookie } from '@/lib/authCookies';

function CadeirasOcupadas({ recolhido }: { recolhido: boolean }) {
  const { clinics, activeClinicId, loading } = useClinica();
  const [ocupadas, setOcupadas] = useState(0);
  const [total, setTotal] = useState(0);
  const [proximo, setProximo] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    let cancelado = false;
    const ids = activeClinicId && activeClinicId !== 'all'
      ? [Number(activeClinicId)]
      : clinics.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) return;

    const hoje = new Date().toISOString().split('T')[0];
    supabase
      .from('agendamentos')
      .select('data_hora, profissional_id, status')
      .gte('data_hora', `${hoje}T00:00:00`)
      .lte('data_hora', `${hoje}T23:59:59`)
      .in('clinica_id', ids)
      .neq('status', 'cancelado')
      .then(({ data }) => {
        if (cancelado) return;
        const lista = data || [];
        const agora = Date.now();
        const dur = 40 * 60 * 1000;
        const profs = new Set(lista.map((a: any) => String(a.profissional_id || a.data_hora)));
        const ativos = lista.filter((a: any) => {
          if (a.status === 'concluido') return false;
          const t = new Date(a.data_hora).getTime();
          return t <= agora && agora < t + dur;
        });
        const ocup = new Set(ativos.map((a: any) => String(a.profissional_id || a.data_hora))).size;
        const fins = ativos.map((a: any) => new Date(a.data_hora).getTime() + dur);
        const proximos = lista.map((a: any) => new Date(a.data_hora).getTime()).filter((t: number) => t > agora);
        const next = [...fins, ...proximos].sort((a, b) => a - b)[0];
        setOcupadas(ocup);
        setTotal(Math.max(profs.size, ocup, 1));
        setProximo(next ? new Date(next).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null);
      });

    return () => { cancelado = true; };
  }, [loading, activeClinicId, clinics.length]);

  if (recolhido) {
    return (
      <div className="mb-2 flex justify-center" title={`Cadeiras ${ocupadas} de ${total}`}>
        <span className="rounded-full bg-[#eaf2fd] px-1.5 py-0.5 text-[10px] font-semibold text-ortus-blue">{ocupadas}/{total}</span>
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-xl bg-[#f7f7f8] px-3 py-2.5">
      <p className="text-[11px] font-medium text-[#6e6e73]">Cadeiras ocupadas</p>
      <p className="mt-0.5 text-[13px] font-medium text-[#1d1d1f]">
        {total === 0 ? 'Livre agora' : `${ocupadas} de ${total}`}
        {proximo ? <span className="font-normal text-[#6e6e73]"> · próximo intervalo {proximo}</span> : null}
      </p>
    </div>
  );
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [menuRecolhido, setMenuRecolhido] = useState(false);
  const [notificacoesCount, setNotificacoesCount] = useState(0);
  const [mensagensCount, setMensagensCount] = useState(0);
  const [tarefasPendentes, setTarefasPendentes] = useState(0);
  const [moduleAccess, setModuleAccess] = useState<Record<ModuleName, boolean>>(() => buildModuleAccessMap(false));
  const [permissoesResolvidas, setPermissoesResolvidas] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();

  // Header switcher (consome o ClinicaProvider global multi-tenant)
  const { clinics: ctxClinics, activeClinic: ctxActive, activeClinicId: ctxActiveId, setActiveClinicById, loading: clinicLoading } = useClinica();
  const [headerSwitchOpen, setHeaderSwitchOpen] = useState(false);
  const sessaoPronta = useRef(false);

  useEffect(() => { validarSessao(); }, [pathname]);

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

  async function validarSessao() {
    const rotasPublicas = ['/login', '/', '/site', '/termos', '/checkout', '/cadastro', '/teste-3d'];
    if (rotasPublicas.includes(pathname)) { setLoading(false); return; }

    const { data: { session: sess } } = await supabase.auth.getSession();
    if (!sess) {
      if (sessaoPronta.current && session) {
        setLoading(false);
        return;
      }
      router.push('/login');
      return;
    }

    setSession(sess);
    setAuthMarkerCookie();

    if (sessaoPronta.current && perfil) {
      if (perfil.precisa_trocar_senha && pathname !== '/primeiro-acesso') {
        router.replace('/primeiro-acesso');
      } else if (pathname.startsWith('/super-admin') && !perfil.is_super_admin) {
        router.replace('/dashboard');
      }
      setLoading(false);
      return;
    }

    const { data: prof } = await supabase.from('profissionais').select('*').eq('user_id', sess.user.id).single();
    if (prof) {
      setPerfil(prof);
      if (prof.precisa_trocar_senha && pathname !== '/primeiro-acesso') {
        router.replace('/primeiro-acesso');
        setLoading(false);
        return;
      }
      if (pathname.startsWith('/super-admin') && !prof.is_super_admin) {
        router.replace('/dashboard');
        setLoading(false);
        return;
      }
    }

    const agoraIso = new Date().toISOString();
    const tiposAlerta = ['agenda', 'alerta', 'sistema', 'aviso'];
    const [{ count: alertasCount }, { count: msgsCount }] = await Promise.all([
      supabase
        .from('notificacoes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', sess.user.id)
        .eq('lida', false)
        .in('tipo', tiposAlerta)
        .or(`expires_at.is.null,expires_at.gt.${agoraIso}`),
      supabase
        .from('notificacoes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', sess.user.id)
        .eq('lida', false)
        .eq('tipo', 'mensagem')
        .or(`expires_at.is.null,expires_at.gt.${agoraIso}`),
    ]);
    setNotificacoesCount(alertasCount || 0);
    setMensagensCount(msgsCount || 0);
    sessaoPronta.current = true;
    setLoading(false);
  }

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

  function persistirClinicaSelecionada(clinica: any) {
      const normalizedId = clinica?.id === 'todas' || clinica?.id === 'all'
          ? 'all'
          : String(clinica.id);
      localStorage.setItem('ortus_clinica_id', normalizedId);
      setActiveClinicById(normalizedId);
  }

  async function handleLogout() {
      await supabase.auth.signOut();
      localStorage.removeItem('ortus_clinica_id');
      clearAuthCookies();
      router.push('/login');
  }

  if (['/login', '/', '/site', '/termos', '/checkout', '/cadastro', '/teste-3d'].includes(pathname)) return <>{children}</>;
  if (loading) return <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-ortus-accent-muted animate-pulse"><Building2 size={40}/></div>;
  if (!session) return null;

  // LAYOUT LIMPO PARA SELEÇÃO, PRIMEIRO ACESSO E SUPER ADMIN
  if (pathname === '/selecao' || pathname === '/primeiro-acesso' || pathname.startsWith('/super-admin')) {
      return <>{children}</>;
  }

  const isDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard');
  const isPerfilAdmin = perfil?.nivel_acesso === 'admin' || perfil?.is_super_admin;

  const canAccessModule = (module?: ModuleName) => {
      if (!module) return true;
      if (isPerfilAdmin) return true;
      return moduleAccess[module];
  };

  const NavItem = ({ href, icon, label, badge }: { href: string, icon: any, label: string, badge?: number }) => {
      const active = pathname.includes(href) || (href === '/dashboard' && pathname === '/dashboard');
      const showBadge = typeof badge === 'number' && badge > 0;
      return (
        <Link href={href} onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors mb-0.5 group relative overflow-hidden ${active ? 'bg-ortus-blue text-white font-medium' : 'text-[#6e6e73] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]'} ${menuRecolhido ? 'justify-center !px-0 w-11 mx-auto' : ''}`}>
            <span className={active ? 'opacity-100' : 'opacity-80'}>{icon}</span>
            {!menuRecolhido && (
                <span className="flex-1 flex items-center justify-between">
                    {label}
                    {showBadge && (
                        <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {badge! > 99 ? '99+' : badge}
                        </span>
                    )}
                </span>
            )}
            {menuRecolhido && showBadge && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                    {badge! > 9 ? '9+' : badge}
                </span>
            )}
            {menuRecolhido && (<div className="absolute left-full ml-2 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">{label}</div>)}
        </Link>
      );
  };

  type NavLink = {
      href: string;
      label: string;
      module?: ModuleName;
      badge?: number;
      icon: (size: number) => ReactNode;
  };

  const navLinks: NavLink[] = [
      { href: '/dashboard', label: 'Visão Geral', module: 'inteligencia', icon: (size) => <LayoutDashboard size={size}/> },
      { href: '/agenda', label: 'Agenda', module: 'agenda', icon: (size) => <Calendar size={size}/> },
      { href: '/pacientes', label: 'Pacientes', module: 'ficha_paciente', icon: (size) => <Users size={size}/> },
      { href: '/proteses', label: 'Laboratório', module: 'controle_protese', icon: (size) => <Smile size={size}/> },
      { href: '/financeiro', label: 'Financeiro', module: 'financeiro', icon: (size) => <DollarSign size={size}/> },
      { href: '/relatorios', label: 'Relatórios', module: 'inteligencia', icon: (size) => <BarChart3 size={size}/> },
  ];

  const footerLinks: NavLink[] = [
      { href: '/tarefas', label: 'Tarefas', module: 'agenda', icon: (size) => <CheckSquare size={size}/>, badge: tarefasPendentes > 0 ? tarefasPendentes : undefined },
      { href: '/ajustes/equipe', label: 'Equipe', module: 'configuracoes', icon: (size) => <ShieldCheck size={size}/> },
      { href: '/configuracoes', label: 'Configurações', module: 'configuracoes', icon: (size) => <Settings size={size}/> },
  ];

  const filteredNavLinks = navLinks.filter((link) => canAccessModule(link.module));
  const filteredFooterLinks = footerLinks.filter((link) => canAccessModule(link.module));

  return (
    <PatientSlideOverProvider>
    <PatientActionModalProvider>
    <div className="flex min-h-screen bg-[#f7f7f8] font-poppins">
      <aside className={`bg-white border-r border-black/[0.06] fixed h-full hidden md:flex flex-col z-30 transition-all duration-300 ${menuRecolhido ? 'w-20 items-center' : 'w-[220px]'}`}>
        <div className={`flex flex-col ${menuRecolhido ? 'items-center px-0 pt-4' : 'px-5 pt-4 pb-2'}`}>
            <Link href="/dashboard" className="cursor-pointer hover:opacity-80 transition-opacity flex items-center">
                <img src={menuRecolhido ? '/landing/ortus-mark.svg' : '/landing/ortus-wordmark.svg'} alt="ortus" className={menuRecolhido ? 'h-7 w-7 object-contain' : 'h-6 w-auto object-contain'}/>
            </Link>
            {!menuRecolhido && (
              <button type="button" onClick={() => setHeaderSwitchOpen((v) => !v)} className="mt-2 truncate text-left text-[12px] text-[#6e6e73] hover:text-[#1d1d1f]">
                {ctxActive ? getClinicLabel(ctxActive) : 'Selecionar clínica'}
              </button>
            )}
        </div>
        
        <nav className={`flex-1 space-y-0.5 mt-1 overflow-y-auto ortus-scroll ${menuRecolhido ? 'px-1 flex flex-col items-center' : 'px-3'}`}>
            {filteredNavLinks.map((link) => (
                <NavItem key={link.href} href={link.href} icon={link.icon(18)} label={link.label} badge={link.badge}/>
            ))}
            {perfil?.is_super_admin && (<><div className="my-2 border-t border-slate-100 mx-2"></div><NavItem href="/super-admin" icon={<ShieldAlert size={22}/>} label="Painel SaaS" /></>)}
        </nav>

        <button onClick={() => setMenuRecolhido(!menuRecolhido)} className="absolute top-16 -right-3 bg-white border border-black/[0.08] p-1 rounded-full text-[#aeaeb2] hover:text-[#1d1d1f] transition-colors z-50 hidden md:flex items-center justify-center w-6 h-6">{menuRecolhido ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}</button>
        <div className={`mt-auto border-t border-black/[0.06] ${menuRecolhido ? 'p-2' : 'p-3'}`}>
            <CadeirasOcupadas recolhido={menuRecolhido} />
            <div className={`${menuRecolhido ? 'flex flex-col items-center' : ''}`}>
                {filteredFooterLinks.map((link) => (
                    <NavItem key={`footer-${link.href}`} href={link.href} icon={link.icon(18)} label={link.label} badge={link.badge}/>
                ))}
            </div>
            {isDashboard && (
              <div className={`mb-1 flex items-center ${menuRecolhido ? 'flex-col' : 'justify-between px-1'}`}>
                  <Link href="/mensagens" className="p-1.5 text-[#6e6e73] hover:text-[#1d1d1f] rounded-lg relative" title="Mensagens"><Mail size={16}/>{mensagensCount > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-ortus-blue rounded-full"></span>}</Link>
                  <Link href="/inbox" className="p-1.5 text-[#6e6e73] hover:text-[#1d1d1f] rounded-lg relative" title="Avisos"><Bell size={16}/>{notificacoesCount > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full"></span>}</Link>
                  <button type="button" onClick={handleLogout} className="p-1.5 text-[#aeaeb2] hover:text-[#d93025] rounded-lg" title="Sair"><LogOut size={16}/></button>
              </div>
            )}
            <Link href="/perfil" className={`flex items-center rounded-xl hover:bg-[#f5f5f7] transition-colors ${menuRecolhido ? 'justify-center p-2' : 'gap-2.5 px-2 py-2'}`}>
                <div className="w-8 h-8 shrink-0 bg-ortus-blue text-white rounded-full flex items-center justify-center overflow-hidden text-[11px] font-semibold">
                    {perfil?.foto_url ? <img src={perfil.foto_url} className="w-full h-full object-cover" alt=""/> : (perfil?.nome ? perfil.nome.split(' ').slice(0,2).map((n:string)=>n[0]).join('').toUpperCase() : <User size={14}/>)}
                </div>
                {!menuRecolhido && (
                    <div className="min-w-0 text-left">
                        <p className="truncate text-[13px] font-medium text-[#1d1d1f]">{perfil?.nome || 'Perfil'}</p>
                        <p className="truncate text-[11px] text-[#aeaeb2]">{perfil?.cro || (perfil?.nivel_acesso === 'admin' ? 'Admin' : 'Profissional')}</p>
                    </div>
                )}
            </Link>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 w-full bg-white/90 backdrop-blur-md border-b border-black/[0.06] z-50 px-3 py-2 flex items-center h-14 gap-2">
        <button onClick={() => setMenuMobileAberto(!menuMobileAberto)} className="p-2 text-[#1d1d1f] hover:bg-black/[0.04] rounded-lg transition-colors touch-target shrink-0">{menuMobileAberto ? <X size={22} /> : <Menu size={22} />}</button>
        <button onClick={() => setHeaderSwitchOpen((v) => !v)} className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left">
            <Building2 size={14} className="text-ortus-blue shrink-0"/>
            <span className="text-xs font-medium text-[#1d1d1f] truncate">{ctxActive ? getClinicLabel(ctxActive) : 'Unidade'}</span>
        </button>
        <Link href="/dashboard" className="shrink-0"><img src="/landing/ortus-mark.svg" alt="ortus" className="h-7 w-7" /></Link>
      </div>

      <main className={`flex-1 min-w-0 flex flex-col min-h-screen bg-white transition-all duration-300 pt-14 md:pt-0 ${menuRecolhido ? 'md:ml-20' : 'md:ml-[220px]'}`}>
        <header className={`${isDashboard ? 'hidden' : 'hidden md:flex'} h-14 shrink-0 items-center justify-end px-6 lg:px-8 gap-2 border-b border-black/[0.06] sticky top-0 z-20 bg-white`}>
            <div className="mr-auto relative min-w-0">
                <button
                    onClick={() => setHeaderSwitchOpen((v) => !v)}
                    className="flex items-center gap-2 py-1 text-[13px] font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors group max-w-full"
                    title="Trocar unidade"
                >
                    {ctxActive?.id === 'all' ? <Globe size={15} className="text-[#6e6e73]"/> : <Building2 size={15} className="text-[#6e6e73]"/>}
                    <span className="max-w-[280px] truncate">{ctxActive ? getClinicLabel(ctxActive) : 'Selecione a clínica'}</span>
                    <ChevronsUpDown size={13} className="text-[#aeaeb2] shrink-0"/>
                </button>
            </div>
            <button
                type="button"
                onClick={() => { const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }); window.dispatchEvent(e); }}
                className="hidden lg:flex h-9 min-w-[220px] items-center gap-2 rounded-full border border-black/[0.08] bg-[#f7f7f8] px-3 text-[13px] text-[#aeaeb2] hover:border-black/[0.14] transition-colors"
            >
                <Search size={14} />
                Buscar paciente ou procedimento
            </button>
            <Link
                href="/agenda"
                className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-full bg-ortus-blue px-3.5 text-[13px] font-medium text-white hover:bg-ortus-blueDark"
            >
                <Plus size={15} />
                Novo agendamento
            </Link>
            <div className="flex items-center gap-0.5">
                <Link href="/mensagens" className="p-2 text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors relative" title="Mensagens"><Mail size={18}/>{mensagensCount > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-ortus-blue rounded-full"></span>}</Link>
                <Link href="/inbox" className="p-2 text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors relative" title="Central de Avisos"><Bell size={18}/>{notificacoesCount > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>}</Link>
            </div>
            <button onClick={handleLogout} className="p-2 text-[#aeaeb2] hover:text-[#d93025] hover:bg-red-50 rounded-lg transition-colors" title="Sair"><LogOut size={17}/></button>
        </header>
        <div className="ortus-scroll flex-1 min-w-0 max-w-full overflow-y-auto p-4 sm:p-6 md:px-7 md:py-6">{children}</div>
      </main>

      {headerSwitchOpen && (
        <>
          <button aria-label="Fechar" className="fixed inset-0 z-[55]" onClick={() => setHeaderSwitchOpen(false)}/>
          <div className="fixed left-3 right-3 top-14 z-[60] max-h-[70vh] overflow-hidden overflow-y-auto rounded-xl border border-black/[0.06] bg-white shadow-xl animate-in fade-in slide-in-from-top-2 ortus-scroll md:left-[232px] md:right-auto md:top-16 md:w-[18rem]">
            <p className="sticky top-0 border-b border-black/[0.06] bg-[#f5f5f7] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#aeaeb2]">Trocar unidade</p>
            <button
              onClick={() => { persistirClinicaSelecionada({ id: 'todas', nome: 'Todas as Clínicas' }); setHeaderSwitchOpen(false); }}
              className="flex w-full items-center justify-between border-b border-slate-50 px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700"
            >
              <div className="flex items-center gap-2"><Globe size={16}/> Todas as Clínicas</div>
              {ctxActive?.id === 'all' && <Check size={16} className="text-purple-600"/>}
            </button>
            {ctxClinics.length === 0 && (
              <p className="px-4 py-4 text-xs italic text-slate-400">Nenhuma unidade vinculada ao seu usuário.</p>
            )}
            {ctxClinics.map((c: any) => (
              <button
                key={c.id}
                onClick={() => { persistirClinicaSelecionada(c); setHeaderSwitchOpen(false); }}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-ortus-accent-soft hover:text-ortus-accent"
              >
                <div className="min-w-0">
                  <p className="truncate">{getClinicLabel(c)}</p>
                  {c.endereco && <p className="truncate text-[10px] font-medium text-slate-400">{c.endereco}</p>}
                </div>
                {String(ctxActive?.id) === String(c.id) && <Check size={16} className="ml-2 shrink-0 text-ortus-accent-muted"/>}
              </button>
            ))}
          </div>
        </>
      )}

      {menuMobileAberto && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm animate-in fade-in" onClick={() => setMenuMobileAberto(false)}>
            <div className="absolute left-0 top-0 h-full w-[280px] bg-[#f5f5f7] shadow-2xl flex flex-col animate-in slide-in-from-left duration-300" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-black/[0.06] flex justify-between items-center">
                    <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-6"/>
                    <button onClick={() => setMenuMobileAberto(false)} className="p-2 rounded-full text-[#6e6e73] hover:bg-black/[0.04]"><X size={20}/></button>
                </div>
                <div className="p-4 space-y-1 flex-1 overflow-y-auto">
                    {filteredNavLinks.map((link) => (
                        <NavItem key={`mobile-${link.href}`} href={link.href} icon={link.icon(20)} label={link.label} badge={link.badge}/>
                    ))}
                    <div className="my-3 border-t border-black/[0.06]" />
                    <CadeirasOcupadas recolhido={false} />
                    {filteredFooterLinks.map((link) => (
                        <NavItem key={`mobile-footer-${link.href}`} href={link.href} icon={link.icon(20)} label={link.label} badge={link.badge}/>
                    ))}
                    {perfil?.is_super_admin && <NavItem href="/super-admin" icon={<ShieldAlert size={20}/>} label="Painel SaaS" />}
                </div>
                <div className="p-5 border-t border-black/[0.06]"><button onClick={handleLogout} className="flex w-full items-center justify-center gap-3 px-4 py-3 text-[#d93025] hover:bg-red-50 rounded-xl font-medium bg-white transition-colors active:scale-95"><LogOut size={18} /> Sair</button></div>
            </div>
        </div>
      )}
    </div>
    <Omnibar moduleAccess={moduleAccess} isAdmin={isPerfilAdmin} />
    </PatientActionModalProvider>
    </PatientSlideOverProvider>
  );
}
