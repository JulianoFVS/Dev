'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Calendar,
  DollarSign,
  LayoutDashboard,
  Settings,
  Smile,
  User,
  Users,
} from 'lucide-react';

const LINKS = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/pacientes', label: 'Pacientes', icon: Users },
  { href: '/proteses', label: 'Laboratório', icon: Smile },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
] as const;

function NavIcon({ href, label, Icon }: { href: string; label: string; Icon: typeof LayoutDashboard }) {
  const pathname = usePathname();
  const active = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white/10 hover:text-slate-200'
      }`}
    >
      <Icon size={20} strokeWidth={1.75} />
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
              active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-100 bg-white text-slate-600'
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
  return (
    <aside className="flex h-full w-[4.25rem] shrink-0 flex-col items-center overflow-hidden rounded-3xl bg-[#121212] py-4 sm:w-[4.75rem]">
      <Link
        href="/dashboard"
        title="Ortus"
        className="mb-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white"
      >
        <img src="/landing/ortus-mark.svg" alt="" className="h-6 w-6 object-contain brightness-0 invert" />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-2 overflow-hidden">
        {LINKS.map((item) => (
          <NavIcon key={item.href} href={item.href} label={item.label} Icon={item.icon} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2">
        <Link
          href="/configuracoes"
          title="Configurações"
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-white/10 hover:text-slate-200"
        >
          <Settings size={18} strokeWidth={1.75} />
        </Link>
        <Link
          href="/perfil"
          title="Perfil"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white ring-2 ring-[#121212]"
        >
          <User size={18} strokeWidth={1.75} />
        </Link>
      </div>
    </aside>
  );
}
