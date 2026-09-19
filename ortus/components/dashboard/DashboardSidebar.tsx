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
  ShieldAlert,
  ShieldCheck,
  Smile,
  User,
  Users,
} from 'lucide-react';
import BentoClinicSwitcher from '@/components/dashboard/BentoClinicSwitcher';
import BentoSidebarTooltip from '@/components/bento/BentoSidebarTooltip';

export type DashboardSidebarNavOptions = {
  showTarefas?: boolean;
  showEquipe?: boolean;
  showTratamentosBase?: boolean;
  showPainelSaas?: boolean;
  tarefasBadge?: number;
  profilePhotoUrl?: string | null;
  profileName?: string | null;
};

function ProfileAvatar({
  photoUrl,
  profileName,
  collapsed,
}: {
  photoUrl?: string | null;
  profileName?: string | null;
  collapsed: boolean;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl]);

  const showPhoto = Boolean(photoUrl) && !photoFailed;
  const sizeClass = collapsed ? 'h-full w-full' : 'h-9 w-9 rounded-xl';
  const alt = profileName ? `Foto de ${profileName}` : 'Meu perfil';

  if (showPhoto) {
    return (
      <img
        src={photoUrl!}
        alt={alt}
        className={`shrink-0 object-cover ${sizeClass}`}
        onError={() => setPhotoFailed(true)}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-[#c8f053] text-neutral-900 ${sizeClass}`}
    >
      <User size={18} strokeWidth={1.75} />
    </span>
  );
}

const STORAGE_KEY = 'ortus-dashboard-sidebar';

const LINKS = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/pacientes', label: 'Pacientes', icon: Users },
  { href: '/proteses', label: 'Laboratório', icon: Smile },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
] as const;

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
        collapsed ? 'h-11 w-11 justify-center rounded-2xl' : 'h-10 w-full gap-3 rounded-2xl px-3'
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

export function DashboardMobileNav({
  showTarefas = true,
  showEquipe = true,
  showTratamentosBase = true,
  showPainelSaas = false,
}: DashboardSidebarNavOptions = {}) {
  const pathname = usePathname();
  const mid = [
    showTarefas ? { href: '/tarefas', label: 'Tarefas', icon: CheckSquare } : null,
    showEquipe ? { href: '/ajustes/equipe', label: 'Equipe', icon: ShieldCheck } : null,
    showTratamentosBase ? { href: '/ajustes/tratamentos', label: 'Tratamentos base', icon: ClipboardList } : null,
  ].filter(Boolean) as { href: string; label: string; icon: typeof LayoutDashboard }[];
  const footer = showPainelSaas
    ? [{ href: '/super-admin', label: 'Painel SaaS', icon: ShieldAlert }]
    : [];

  const all = [...LINKS, ...mid, ...footer];

  return (
    <>
      {all.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/10 bg-white text-neutral-600'
            }`}
          >
            <Icon size={16} strokeWidth={1.75} />
          </Link>
        );
      })}
    </>
  );
}

export default function DashboardSidebar({
  showTarefas = true,
  showEquipe = true,
  showTratamentosBase = true,
  showPainelSaas = false,
  tarefasBadge = 0,
  profilePhotoUrl: profilePhotoUrlProp = null,
  profileName: profileNameProp = null,
}: DashboardSidebarNavOptions = {}) {
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(profilePhotoUrlProp);
  const [profileName, setProfileName] = useState<string | null>(profileNameProp);

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
      className={`flex h-[calc(100vh-0.75rem)] shrink-0 flex-col overflow-visible rounded-[1.75rem] bg-neutral-950 py-3 transition-[width] duration-200 ease-out sm:h-[calc(100vh-1rem)] sm:rounded-[2rem] md:rounded-[2.25rem] ${widthClass}`}
    >
      <div className={`mb-2 ${collapsed ? 'flex justify-center px-2' : 'px-3'}`}>
        <BentoSidebarTooltip label="Visão geral" show={collapsed}>
          <Link
            href="/dashboard"
            className={`flex shrink-0 items-center transition-colors hover:opacity-90 ${
              collapsed ? 'h-11 w-11 justify-center rounded-2xl' : 'gap-2 rounded-2xl px-1 py-1.5'
            }`}
          >
            <img
              src="/landing/ortus-mark.svg"
              alt=""
              className={`shrink-0 brightness-0 invert ${collapsed ? 'h-7 w-7' : 'h-6 w-6'}`}
            />
            {!collapsed && (
              <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-4 w-auto brightness-0 invert" />
            )}
          </Link>
        </BentoSidebarTooltip>
      </div>

      <div className={`mb-3 ${collapsed ? 'flex justify-center px-2' : 'px-2.5'}`}>
        <BentoClinicSwitcher variant="sidebar" collapsed={collapsed} className={collapsed ? '' : 'w-full'} />
      </div>

      <nav
        className={`flex min-h-0 flex-1 flex-col gap-1 ${collapsed ? 'items-center overflow-visible px-2' : 'overflow-x-hidden overflow-y-auto px-2.5'}`}
      >
        {LINKS.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} collapsed={collapsed} />
        ))}
        {(showTarefas || showEquipe || showTratamentosBase) && (
          <div className={`my-1.5 h-px bg-white/10 ${collapsed ? 'mx-2 w-7' : 'mx-1'}`} role="presentation" />
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
          <NavItem href="/ajustes/tratamentos" label="Tratamentos base" Icon={ClipboardList} collapsed={collapsed} />
        )}
      </nav>

      <div className={`mt-auto flex flex-col gap-1.5 ${collapsed ? 'items-center px-2' : 'px-2.5'}`}>
        {showPainelSaas && (
          <NavItem href="/super-admin" label="Painel SaaS" Icon={ShieldAlert} collapsed={collapsed} />
        )}
        {showPainelSaas && (
          <div className={`h-px bg-white/10 ${collapsed ? 'my-0.5 w-7' : 'mx-1 my-0.5'}`} role="presentation" />
        )}
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
        <BentoSidebarTooltip label="Meu perfil" show={collapsed}>
          <Link
            href="/perfil"
            className={`flex items-center ${collapsed ? 'h-11 w-11 justify-center overflow-hidden rounded-2xl ring-2 ring-neutral-800' : 'gap-3 rounded-2xl px-3 py-2 hover:bg-white/10'}`}
          >
            <ProfileAvatar photoUrl={profilePhotoUrl} profileName={profileName} collapsed={collapsed} />
            {!collapsed && <span className="truncate text-sm font-medium text-white/90">Meu perfil</span>}
          </Link>
        </BentoSidebarTooltip>
      </div>
    </aside>
  );
}
