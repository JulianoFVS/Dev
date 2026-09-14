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
      className={`flex shrink-0 items-center rounded-xl transition-colors ${
        collapsed ? 'h-11 w-11 justify-center' : 'h-10 w-full gap-3 px-3'
      } ${active ? 'bg-ortus-blue text-white' : 'text-slate-400 hover:bg-white/10 hover:text-slate-100'}`}
    >
      <Icon size={20} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && <span className="truncate text-sm font-medium">{label}</span>}
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
              active ? 'border-ortus-blue bg-ortus-blue text-white' : 'border-slate-200 bg-white text-slate-600'
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
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'collapsed') setCollapsed(true);
    } catch {
      /* ignore */
    }
    setReady(true);
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

  const widthClass = collapsed ? 'w-[4.25rem]' : 'w-[14.5rem]';

  return (
    <aside
      className={`flex h-[calc(100vh-1.25rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-slate-900 py-3 shadow-sm transition-[width] duration-200 ease-out md:h-[calc(100vh-1.5rem)] ${widthClass} ${
        ready ? '' : collapsed ? 'w-[4.25rem]' : 'w-[14.5rem]'
      }`}
    >
      <div className={`mb-3 flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'}`}>
        <Link
          href="/dashboard"
          title="Ortus"
          className={`flex shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ${
            collapsed ? 'h-10 w-10' : 'h-10 w-10'
          }`}
        >
          <img src="/landing/ortus-mark.svg" alt="" className="h-6 w-6 object-contain brightness-0 invert" />
        </Link>
        {!collapsed && (
          <Link href="/dashboard" className="min-w-0 flex-1">
            <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-5 w-auto max-w-full brightness-0 invert" />
          </Link>
        )}
      </div>

      <nav className={`flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden ${collapsed ? 'items-center px-2' : 'px-2.5'}`}>
        {LINKS.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} collapsed={collapsed} />
        ))}
      </nav>

      <div className={`mt-auto flex flex-col gap-1.5 ${collapsed ? 'items-center px-2' : 'px-2.5'}`}>
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`flex items-center rounded-xl text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200 ${
            collapsed ? 'h-10 w-10 justify-center' : 'h-9 w-full gap-2.5 px-3 text-sm font-medium'
          }`}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRight size={18} strokeWidth={1.75} /> : <ChevronLeft size={18} strokeWidth={1.75} />}
          {!collapsed && <span>Recolher menu</span>}
        </button>

        <Link
          href="/configuracoes"
          title="Configurações"
          className={`flex items-center rounded-xl text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200 ${
            collapsed ? 'h-10 w-10 justify-center' : 'h-10 w-full gap-3 px-3'
          }`}
        >
          <Settings size={18} strokeWidth={1.75} className="shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Configurações</span>}
        </Link>
        <Link
          href="/perfil"
          title="Perfil"
          className={`flex items-center rounded-xl ring-2 ring-slate-900 ${
            collapsed ? 'h-10 w-10 justify-center rounded-full bg-ortus-blue text-white' : 'gap-3 bg-white/5 px-3 py-2 hover:bg-white/10'
          }`}
        >
          <span
            className={`flex shrink-0 items-center justify-center bg-ortus-blue text-white ${
              collapsed ? 'h-full w-full rounded-full' : 'h-8 w-8 rounded-full'
            }`}
          >
            <User size={18} strokeWidth={1.75} />
          </span>
          {!collapsed && (
            <span className="min-w-0 truncate text-sm font-medium text-slate-200">Meu perfil</span>
          )}
        </Link>
      </div>
    </aside>
  );
}
