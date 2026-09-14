'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  Settings,
  Smile,
  User,
  Users,
} from 'lucide-react';

const STORAGE_KEY = 'ortus-dashboard-sidebar';

const LINKS = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/pacientes', label: 'Pacientes', icon: Users },
  { href: '/proteses', label: 'Laboratório', icon: Smile },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
] as const;

function NavItem({
  href,
  label,
  Icon,
  collapsed,
}: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const active = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      title={label}
      className={`flex shrink-0 items-center transition-colors ${
        collapsed ? 'h-11 w-11 justify-center rounded-2xl' : 'h-10 w-full gap-3 rounded-2xl px-3'
      } ${active ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
    >
      <Icon size={20} strokeWidth={1.65} className="shrink-0" />
      {!collapsed && <span className={`truncate text-sm font-medium ${active ? 'text-white' : 'text-white/85'}`}>{label}</span>}
    </Link>
  );
}

export function DashboardMobileNav() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((item) => {
        const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
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

export default function DashboardSidebar() {
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
      className={`flex h-[calc(100vh-0.75rem)] shrink-0 flex-col overflow-hidden rounded-[1.75rem] bg-neutral-950 py-3 transition-[width] duration-200 ease-out sm:h-[calc(100vh-1rem)] sm:rounded-[2rem] md:rounded-[2.25rem] ${widthClass}`}
    >
      <div className={`mb-4 ${collapsed ? 'flex justify-center px-2' : 'px-3'}`}>
        <Link
          href="/dashboard"
          title="ortus — Visão geral"
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
      </div>

      <nav
        className={`flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden ${collapsed ? 'items-center px-2' : 'px-2.5'}`}
      >
        {LINKS.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} collapsed={collapsed} />
        ))}
      </nav>

      <div className={`mt-auto flex flex-col gap-1.5 ${collapsed ? 'items-center px-2' : 'px-2.5'}`}>
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
        <Link
          href="/configuracoes"
          title="Configurações"
          className={`flex items-center text-white/45 hover:bg-white/10 hover:text-white/90 ${
            collapsed ? 'h-10 w-10 justify-center rounded-2xl' : 'h-10 w-full gap-3 rounded-2xl px-3'
          }`}
        >
          <Settings size={18} strokeWidth={1.65} className="shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Configurações</span>}
        </Link>
        <Link
          href="/perfil"
          title="Perfil"
          className={`flex items-center ${collapsed ? 'h-11 w-11 justify-center overflow-hidden rounded-2xl ring-2 ring-neutral-800' : 'gap-3 rounded-2xl px-3 py-2 hover:bg-white/10'}`}
        >
          <span
            className={`flex shrink-0 items-center justify-center bg-[#c8f053] text-neutral-900 ${
              collapsed ? 'h-full w-full' : 'h-9 w-9 rounded-xl'
            }`}
          >
            <User size={18} strokeWidth={1.75} />
          </span>
          {!collapsed && <span className="truncate text-sm font-medium text-white/90">Meu perfil</span>}
        </Link>
      </div>
    </aside>
  );
}
