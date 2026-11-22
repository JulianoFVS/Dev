'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PROFILE_PATCH_EVENT, type ProfileSessionSnapshot } from '@/lib/profileSession';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  Settings,
  CircleHelp,
  ShieldAlert,
  ShieldCheck,
  CreditCard,
  FileText,
  MessageCircle,
  MessagesSquare,
  Smile,
  User,
  Users,
} from 'lucide-react';
import BentoClinicSwitcher from '@/components/dashboard/BentoClinicSwitcher';
import { useImagemSdr } from '@/lib/imagemSdr';
import { WHATSAPP_ATIVO } from '@/lib/whatsappCliente';
import BentoSidebarTooltip from '@/components/bento/BentoSidebarTooltip';
import { useConvitesRecebidos } from '@/lib/useConvitesRecebidos';

export type DashboardSidebarNavOptions = {
  showTarefas?: boolean;
  /** Orçamentos e funil comercial: módulo orcamentos. */
  showOrcamentos?: boolean;
  /** Chat da equipe: módulo conversas. */
  showConversas?: boolean;
  conversasBadge?: number;
  showEquipe?: boolean;
  showTratamentosBase?: boolean;
  showPainelSaas?: boolean;
  /** Assinatura do Ortus: só para quem administra a clínica. */
  showAssinatura?: boolean;
  tarefasBadge?: number;
  profilePhotoUrl?: string | null;
  profileName?: string | null;
};

function ProfileAvatar({
  photoUrl: photoUrlOriginal,
  profileName,
  collapsed,
}: {
  photoUrl?: string | null;
  profileName?: string | null;
  collapsed: boolean;
}) {
  const photoUrl = useImagemSdr(photoUrlOriginal);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl]);

  const showPhoto = Boolean(photoUrl) && !photoFailed;
  const collapsedPhoto = `rounded-full transition-[width,height] duration-200 ease-out ${collapsed ? 'h-11 w-11' : 'h-9 w-9'}`;
  const alt = profileName ? `Foto de ${profileName}` : 'Meu perfil';

  if (showPhoto) {
    return (
      <img
        src={photoUrl!}
        alt={alt}
        className={`shrink-0 object-cover ${collapsedPhoto}`}
        loading="eager"
        decoding="sync"
        onError={() => setPhotoFailed(true)}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#c8f053] text-neutral-900 transition-[width,height] duration-200 ease-out ${collapsed ? 'h-11 w-11' : 'h-9 w-9'}`}
    >
      <User size={18} strokeWidth={1.75} />
    </span>
  );
}

const STORAGE_KEY = 'ortus-dashboard-sidebar';

const LINKS_TOPO = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/pacientes', label: 'Pacientes', icon: Users },
];

const LINKS = [
  { href: '/proteses', label: 'Laboratório', icon: Smile },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  ...(WHATSAPP_ATIVO ? [{ href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle }] : []),
];

function isNavActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  href,
  label,
  Icon,
  collapsed,
  badge,
}: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  collapsed: boolean;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href);
  const showBadge = typeof badge === 'number' && badge > 0;

  const link = (
    <Link
      href={href}
      title={collapsed ? undefined : label}
      className={`relative flex shrink-0 items-center transition-colors ${
        collapsed ? 'h-10 w-10 justify-center rounded-2xl' : 'h-10 w-full gap-3 rounded-2xl px-3'
      } ${active ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
    >
      <Icon size={20} strokeWidth={1.65} className="shrink-0" />
      {!collapsed && (
        <span className={`flex min-w-0 flex-1 items-center justify-between gap-2 truncate text-sm font-medium ${active ? 'text-white' : 'text-white/85'}`}>
          <span className="truncate">{label}</span>
          {showBadge && (
            <span className="shrink-0 rounded-full bg-[#c8f053] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-neutral-900">
              {badge! > 99 ? '99+' : badge}
            </span>
          )}
        </span>
      )}
      {collapsed && showBadge && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#c8f053]" aria-hidden />
      )}
    </Link>
  );

  return (
    <BentoSidebarTooltip label={label} show={collapsed}>
      {link}
    </BentoSidebarTooltip>
  );
}

export default function DashboardSidebar({
  showTarefas = true,
  showOrcamentos = false,
  showConversas = false,
  conversasBadge = 0,
  showEquipe = true,
  showTratamentosBase = true,
  showPainelSaas = false,
  showAssinatura = false,
  tarefasBadge = 0,
  profilePhotoUrl: profilePhotoUrlProp = null,
  profileName: profileNameProp = null,
}: DashboardSidebarNavOptions = {}) {
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(profilePhotoUrlProp);
  const [profileName, setProfileName] = useState<string | null>(profileNameProp);
  const { pendentes: convitesAbertos } = useConvitesRecebidos();
  const temConvite = convitesAbertos.length > 0;

  useEffect(() => {
    setProfilePhotoUrl(profilePhotoUrlProp);
  }, [profilePhotoUrlProp]);

  useEffect(() => {
    setProfileName(profileNameProp);
  }, [profileNameProp]);

  useEffect(() => {
    const onPatch = (ev: Event) => {
      const detail = (ev as CustomEvent<ProfileSessionSnapshot>).detail;
      if (detail.foto_url !== undefined) setProfilePhotoUrl(detail.foto_url ?? null);
      if (detail.nome) setProfileName(detail.nome);
    };
    window.addEventListener(PROFILE_PATCH_EVENT, onPatch);
    return () => window.removeEventListener(PROFILE_PATCH_EVENT, onPatch);
  }, []);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'expanded') setCollapsed(false);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const widthClass = collapsed ? 'w-[4.5rem]' : 'w-[14rem]';

  return (
    <aside
      className={`flex h-full shrink-0 flex-col overflow-visible rounded-[1.75rem] bg-neutral-950 py-3 transition-[width] duration-200 ease-out sm:rounded-[2rem] md:rounded-[2.25rem] ${widthClass}`}
    >
      <div className={`mb-2 shrink-0 ${collapsed ? 'flex justify-center px-2' : 'px-3'}`}>
        <BentoSidebarTooltip label="Visão geral" show={collapsed}>
          <Link
            href="/dashboard"
            className={`flex shrink-0 items-center transition-all duration-200 ease-out hover:opacity-90 ${
              collapsed ? 'h-11 w-11 justify-center rounded-2xl' : 'gap-2 rounded-2xl px-1 py-1.5'
            }`}
          >
            <img
              src="/landing/ortus-mark.svg"
              alt=""
              className={`shrink-0 brightness-0 invert transition-[width,height] duration-200 ease-out ${collapsed ? 'h-9 w-9' : 'h-6 w-6'}`}
            />
            {!collapsed && (
              <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-4 w-auto brightness-0 invert" />
            )}
          </Link>
        </BentoSidebarTooltip>
      </div>

      <div className={`mb-3 shrink-0 ${collapsed ? 'flex justify-center px-2' : 'px-2.5'}`}>
        <BentoClinicSwitcher variant="sidebar" collapsed={collapsed} className={collapsed ? '' : 'w-full'} />
      </div>

      <nav
        className={`flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${collapsed ? 'items-center gap-1 px-2' : 'gap-0.5 px-2.5'}`}
      >
        {LINKS_TOPO.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} collapsed={collapsed} />
        ))}
        {showOrcamentos && (
          <NavItem href="/orcamentos" label="Orçamentos" Icon={FileText} collapsed={collapsed} />
        )}
        {LINKS.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} collapsed={collapsed} />
        ))}
        {showConversas && (
          <NavItem href="/conversas" label="Conversas" Icon={MessagesSquare} collapsed={collapsed} badge={conversasBadge} />
        )}
        {showTarefas && (
          <NavItem
            href="/tarefas"
            label="Tarefas"
            Icon={CheckSquare}
            collapsed={collapsed}
            badge={tarefasBadge}
          />
        )}
        {showEquipe && (
          <NavItem href="/ajustes/equipe" label="Equipe" Icon={ShieldCheck} collapsed={collapsed} />
        )}
        {showTratamentosBase && (
          <NavItem href="/ajustes/tratamentos" label="Tratamentos" Icon={ClipboardList} collapsed={collapsed} />
        )}
        {showAssinatura && (
          <NavItem href="/assinatura" label="Assinatura" Icon={CreditCard} collapsed={collapsed} />
        )}
      </nav>

      <div className={`mt-auto flex shrink-0 flex-col gap-1 ${collapsed ? 'items-center px-2' : 'px-2.5'}`}>
        {showPainelSaas && (
          <div className={`h-px bg-white/10 ${collapsed ? 'my-0.5 w-7' : 'mx-1 my-0.5'}`} role="presentation" />
        )}
        {showPainelSaas && (
          <NavItem href="/super-admin" label="Painel SaaS" Icon={ShieldAlert} collapsed={collapsed} />
        )}
        <BentoSidebarTooltip label="Configurações" show={collapsed}>
          <Link
            href="/configuracoes"
            className={`flex items-center text-white/45 hover:bg-white/10 hover:text-white/90 ${
              collapsed ? 'h-10 w-10 justify-center rounded-2xl' : 'h-10 w-full gap-3 rounded-2xl px-3'
            }`}
          >
            <Settings size={18} strokeWidth={1.65} className="shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Configurações</span>}
          </Link>
        </BentoSidebarTooltip>
        <BentoSidebarTooltip label="Ajuda" show={collapsed}>
          <Link
            href="/ajuda"
            className={`flex items-center text-white/45 hover:bg-white/10 hover:text-white/90 ${
              collapsed ? 'h-10 w-10 justify-center rounded-2xl' : 'h-10 w-full gap-3 rounded-2xl px-3'
            }`}
          >
            <CircleHelp size={18} strokeWidth={1.65} className="shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Ajuda</span>}
          </Link>
        </BentoSidebarTooltip>
        <BentoSidebarTooltip label={collapsed ? 'Expandir menu' : 'Recolher menu'} show={collapsed}>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`flex items-center text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 ${
              collapsed ? 'h-10 w-10 justify-center rounded-2xl' : 'h-9 w-full gap-2 rounded-2xl px-3 text-sm font-medium'
            }`}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            {!collapsed && <span>Recolher</span>}
          </button>
        </BentoSidebarTooltip>
        <BentoSidebarTooltip label="Meu perfil" show={collapsed}>
          <Link
            href="/perfil"
            className={`flex items-center transition-all duration-200 ease-out ${collapsed ? `h-11 w-11 justify-center overflow-hidden rounded-full ring-2 ${temConvite ? 'ring-red-500' : 'ring-neutral-800'}` : 'gap-3 rounded-2xl px-3 py-1 hover:bg-white/10'}`}
          >
            <ProfileAvatar photoUrl={profilePhotoUrl} profileName={profileName} collapsed={collapsed} />
            {!collapsed && <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">Meu perfil</span>}
            {!collapsed && temConvite && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-label="Convite em aberto" />
            )}
          </Link>
        </BentoSidebarTooltip>
      </div>
    </aside>
  );
}
