'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  CircleHelp,
  ClipboardList,
  DollarSign,
  House,
  LayoutDashboard,
  Mail,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smile,
  User,
  Users,
} from 'lucide-react';
import BentoClinicSwitcher from '@/components/dashboard/BentoClinicSwitcher';
import type { DashboardSidebarNavOptions } from '@/components/dashboard/DashboardSidebar';

type Item = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
};

const ABAS: Item[] = [
  { href: '/dashboard', label: 'Início', icon: House },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/pacientes', label: 'Pacientes', icon: Users },
];

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

function ativo(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Hamburguer({ aberto }: { aberto: boolean }) {
  const linha = 'absolute left-0 h-[1.75px] w-5 rounded-full bg-current';
  const trans = { transition: `transform 220ms ${EASE}, opacity 140ms ease, top 220ms ${EASE}` };
  return (
    <span className="relative block h-[14px] w-5" aria-hidden>
      <span className={linha} style={{ ...trans, top: aberto ? 6 : 0, transform: aberto ? 'rotate(45deg)' : 'none' }} />
      <span className={linha} style={{ ...trans, top: 6, opacity: aberto ? 0 : 1 }} />
      <span className={linha} style={{ ...trans, top: aberto ? 6 : 12, transform: aberto ? 'rotate(-45deg)' : 'none' }} />
    </span>
  );
}

export default function MobileAppChrome({
  children,
  showTarefas = true,
  showEquipe = true,
  showTratamentosBase = true,
  showPainelSaas = false,
  tarefasBadge,
  profilePhotoUrl = null,
  profileName = null,
}: DashboardSidebarNavOptions & { children: ReactNode }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  const itens: Item[] = [
    { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { href: '/agenda', label: 'Agenda', icon: Calendar },
    { href: '/pacientes', label: 'Pacientes', icon: Users },
    { href: '/proteses', label: 'Laboratório', icon: Smile },
    { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
    { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
    ...(showTarefas ? [{ href: '/tarefas', label: 'Tarefas', icon: CheckSquare, badge: tarefasBadge }] : []),
    ...(showEquipe ? [{ href: '/ajustes/equipe', label: 'Equipe', icon: ShieldCheck }] : []),
    ...(showTratamentosBase ? [{ href: '/ajustes/tratamentos', label: 'Tratamentos', icon: ClipboardList }] : []),
    { href: '/mensagens', label: 'Mensagens', icon: Mail },
    ...(showPainelSaas ? [{ href: '/super-admin', label: 'Painel SaaS', icon: ShieldAlert }] : []),
    { href: '/configuracoes', label: 'Configurações', icon: Settings },
    { href: '/ajuda', label: 'Ajuda', icon: CircleHelp },
  ];

  const menuAtivo = !ABAS.some((item) => ativo(pathname, item.href));

  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAberto(false);
    };
    const largura = () => {
      if (window.innerWidth >= 1024) setAberto(false);
    };
    window.addEventListener('keydown', tecla);
    window.addEventListener('resize', largura);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('resize', largura);
    };
  }, [aberto]);

  const total = itens.length + 1;
  const entrada = (indice: number) => {
    const atraso = aberto ? 40 + (total - indice) * 12 : 0;
    return {
      transition: `opacity 160ms ease ${atraso}ms, transform 240ms ${EASE} ${atraso}ms`,
      opacity: aberto ? 1 : 0,
      transform: aberto ? 'translateY(0)' : 'translateY(6px)',
    };
  };
  const vidro = 'border border-white/60 bg-white/65 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl backdrop-saturate-150';

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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

      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain max-lg:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:overflow-y-hidden">
        {children}
      </div>

      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => setAberto(false)}
        className={`fixed inset-0 z-[84] bg-black/20 backdrop-blur-[3px] transition-opacity duration-200 lg:hidden ${aberto ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden ${aberto ? 'z-[85]' : 'z-40'}`}>
        <div
          id="menu-mobile"
          className="grid w-full max-w-md"
          style={{
            gridTemplateRows: aberto ? '1fr' : '0fr',
            transition: `grid-template-rows ${aberto ? 260 : 200}ms ${EASE}`,
          }}
          inert={aberto ? undefined : true}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={`pointer-events-auto mb-2 max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain rounded-[1.75rem] p-2 ${vidro}`}
              style={{
                opacity: aberto ? 1 : 0,
                transform: aberto ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.98)',
                transformOrigin: 'bottom center',
                transition: `opacity 160ms ease, transform 260ms ${EASE}`,
              }}
            >
              <nav aria-label="Todas as telas" className="grid grid-cols-2 gap-1">
                {itens.map((item, indice) => {
                  const Icon = item.icon;
                  const on = ativo(pathname, item.href);
                  const temBadge = typeof item.badge === 'number' && item.badge > 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAberto(false)}
                      style={entrada(indice)}
                      className={`flex h-11 min-w-0 items-center gap-2.5 rounded-2xl px-3 text-sm font-medium ${
                        on ? 'bg-neutral-900 text-white' : 'text-neutral-800 active:bg-black/5'
                      }`}
                    >
                      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {temBadge && (
                        <span className="shrink-0 rounded-full bg-[#c8f053] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-neutral-900">
                          {item.badge! > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
              <Link
                href="/perfil"
                onClick={() => setAberto(false)}
                style={entrada(total - 1)}
                className="mt-1 flex h-12 items-center gap-3 rounded-2xl border-t border-black/5 px-3 text-sm font-medium text-neutral-800 active:bg-black/5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#c8f053] text-neutral-900">
                  {profilePhotoUrl ? <img src={profilePhotoUrl} alt="" className="h-full w-full object-cover" /> : <User size={16} strokeWidth={1.75} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{profileName || 'Meu perfil'}</span>
                <span className="text-xs text-neutral-400">Meu perfil</span>
              </Link>
            </div>
          </div>
        </div>

        <nav aria-label="Navegação principal" className={`pointer-events-auto flex items-center gap-3 rounded-full p-2 ${vidro}`}>
          {ABAS.map((item) => {
            const Icon = item.icon;
            const on = !aberto && ativo(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={on ? 'page' : undefined}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
                  on ? 'bg-neutral-900 text-white' : 'text-neutral-800 active:bg-black/5'
                }`}
              >
                <Icon size={22} strokeWidth={1.6} />
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setAberto((atual) => !atual)}
            aria-expanded={aberto}
            aria-controls="menu-mobile"
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
              aberto || menuAtivo ? 'bg-neutral-900 text-white' : 'text-neutral-800 active:bg-black/5'
            }`}
          >
            <Hamburguer aberto={aberto} />
          </button>
        </nav>
      </div>
    </div>
  );
}
