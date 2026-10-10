'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Bell,
  Calendar,
  CheckSquare,
  CircleHelp,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  Mail,
  Menu,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smile,
  User,
  Users,
  X,
} from 'lucide-react';
import BentoClinicSwitcher from '@/components/dashboard/BentoClinicSwitcher';
import type { DashboardSidebarNavOptions } from '@/components/dashboard/DashboardSidebar';

type Item = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const ABAS: Item[] = [
  { href: '/dashboard', label: 'Início', icon: LayoutDashboard },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/pacientes', label: 'Pacientes', icon: Users },
  { href: '/financeiro', label: 'Caixa', icon: DollarSign },
];

function ativo(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MobileAppChrome({
  children,
  showTarefas = true,
  showEquipe = true,
  showTratamentosBase = true,
  showPainelSaas = false,
  profilePhotoUrl = null,
  profileName = null,
}: DashboardSidebarNavOptions & { children: ReactNode }) {
  const pathname = usePathname();
  const [maisAberto, setMaisAberto] = useState(false);

  const mais: Item[] = [
    { href: '/proteses', label: 'Laboratório', icon: Smile },
    { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
    ...(showTarefas ? [{ href: '/tarefas', label: 'Tarefas', icon: CheckSquare }] : []),
    ...(showEquipe ? [{ href: '/ajustes/equipe', label: 'Equipe', icon: ShieldCheck }] : []),
    ...(showTratamentosBase ? [{ href: '/ajustes/tratamentos', label: 'Tratamentos', icon: ClipboardList }] : []),
    ...(showPainelSaas ? [{ href: '/super-admin', label: 'Painel SaaS', icon: ShieldAlert }] : []),
    { href: '/mensagens', label: 'Mensagens', icon: Mail },
    { href: '/inbox', label: 'Notificações', icon: Bell },
    { href: '/configuracoes', label: 'Configurações', icon: Settings },
    { href: '/ajuda', label: 'Ajuda', icon: CircleHelp },
    { href: '/perfil', label: 'Meu perfil', icon: User },
  ];

  const maisAtivo = mais.some((item) => ativo(pathname, item.href));

  useEffect(() => {
    setMaisAberto(false);
  }, [pathname]);

  useEffect(() => {
    if (!maisAberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [maisAberto]);

  const folha =
    maisAberto && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[80] lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Fechar menu"
              onClick={() => setMaisAberto(false)}
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[min(85dvh,32rem)] overflow-y-auto rounded-t-[1.75rem] bg-white px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
              <div className="mb-2 flex items-center justify-between px-2">
                <p className="text-base font-semibold text-neutral-900">Mais</p>
                <button
                  type="button"
                  onClick={() => setMaisAberto(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
              <ul className="flex flex-col">
                {mais.map((item) => {
                  const Icon = item.icon;
                  const on = ativo(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium ${
                          on ? 'bg-neutral-900 text-white' : 'text-neutral-800 active:bg-neutral-100'
                        }`}
                      >
                        {item.href === '/perfil' && profilePhotoUrl ? (
                          <img src={profilePhotoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                        ) : (
                          <Icon size={20} strokeWidth={1.75} />
                        )}
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-[#f3f4f1] px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
        <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-5 w-auto shrink-0" />
        <BentoClinicSwitcher className="ml-auto min-w-0 max-w-[58%]" />
        <Link
          href="/perfil"
          aria-label={profileName ? `Perfil de ${profileName}` : 'Meu perfil'}
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#c8f053] text-neutral-900"
        >
          {profilePhotoUrl ? (
            <img src={profilePhotoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <User size={18} strokeWidth={1.75} />
          )}
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain lg:overflow-y-hidden">
        {children}
      </div>

      <nav
        className="grid shrink-0 grid-cols-5 border-t border-black/10 bg-white pb-[max(0.35rem,env(safe-area-inset-bottom))] lg:hidden"
        aria-label="Navegação principal"
      >
        {ABAS.map((item) => {
          const Icon = item.icon;
          const on = ativo(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                on ? 'text-neutral-900' : 'text-neutral-400'
              }`}
            >
              <Icon size={22} strokeWidth={on ? 2.25 : 1.75} />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMaisAberto(true)}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            maisAtivo ? 'text-neutral-900' : 'text-neutral-400'
          }`}
          aria-expanded={maisAberto}
        >
          <Menu size={22} strokeWidth={maisAtivo ? 2.25 : 1.75} />
          Mais
        </button>
      </nav>
      {folha}
    </div>
  );
}
