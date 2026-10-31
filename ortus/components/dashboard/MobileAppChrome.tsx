'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  CircleHelp,
  ClipboardList,
  Compass,
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

const SAIDA_MS = 220;

function ativo(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Hamburguer({ aberto }: { aberto: boolean }) {
  const linha = 'absolute left-0 h-[1.75px] w-[18px] rounded-full bg-current';
  const trans = { transition: 'transform 200ms ease-out, opacity 200ms ease-out, top 200ms ease-out' };
  return (
    <span className="relative block h-3.5 w-[18px]" aria-hidden>
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
  const [painel, setPainel] = useState(false);
  const fecharTimer = useRef<number | null>(null);

  function abrirMenu() {
    if (fecharTimer.current) {
      window.clearTimeout(fecharTimer.current);
      fecharTimer.current = null;
    }
    setPainel(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAberto(true));
    });
  }

  function fecharMenu() {
    setAberto(false);
    if (fecharTimer.current) window.clearTimeout(fecharTimer.current);
    fecharTimer.current = window.setTimeout(() => {
      setPainel(false);
      fecharTimer.current = null;
    }, SAIDA_MS);
  }

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
    setPainel(false);
  }, [pathname]);

  useEffect(() => {
    if (!painel) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') fecharMenu();
    };
    const largura = () => {
      if (window.innerWidth >= 1024) fecharMenu();
    };
    window.addEventListener('keydown', tecla);
    window.addEventListener('resize', largura);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('resize', largura);
    };
  }, [painel]);

  const [modalAberto, setModalAberto] = useState(false);
  useEffect(() => {
    const checar = () => setModalAberto(!!document.querySelector('[role="dialog"][aria-modal="true"]'));
    checar();
    const obs = new MutationObserver(checar);
    obs.observe(document.body, { childList: true });
    return () => obs.disconnect();
  }, []);

  const indiceAba = ABAS.findIndex((item) => ativo(pathname, item.href));
  const indicePolegar = aberto || menuAtivo ? ABAS.length : Math.max(0, indiceAba);
  const vidro = 'border border-black/[0.04] bg-white/70 shadow-[0_4px_16px_rgba(0,0,0,0.08)] backdrop-blur-md';

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className={`${pathname === '/dashboard' ? 'hidden' : 'flex'} shrink-0 items-center gap-3 border-b border-black/5 bg-[#f3f4f1] px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden`}>
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

      {painel && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={fecharMenu}
          className={`fixed inset-0 z-[84] bg-black/15 transition-opacity duration-200 ease-out lg:hidden ${aberto ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        />
      )}

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[110] flex flex-col items-center px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] transition-[opacity,transform,visibility] duration-200 ease-out lg:hidden ${
          modalAberto && !painel ? 'invisible translate-y-4 opacity-0' : ''
        }`}
      >
        {painel && (
          <div
            id="menu-mobile"
            className="w-full max-w-sm overflow-hidden"
            style={{
              maxHeight: aberto ? 560 : 0,
              opacity: aberto ? 1 : 0,
              transform: aberto ? 'translateY(0)' : 'translateY(12px)',
              transition: 'max-height 220ms ease-out, opacity 200ms ease-out, transform 200ms ease-out',
              pointerEvents: aberto ? 'auto' : 'none',
            }}
          >
            <div className={`mb-2 max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain rounded-[1.6rem] p-2 ${vidro}`}>
              <button
                type="button"
                onClick={() => {
                  fecharMenu();
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
                }}
                className="mb-1 flex h-11 w-full items-center gap-2.5 rounded-2xl bg-black/[0.04] px-3 text-left text-sm font-medium text-neutral-500 active:bg-black/[0.07]"
              >
                <Compass size={18} strokeWidth={1.75} className="shrink-0 text-neutral-800" />
                Pesquisar paciente, tela ou ação
              </button>
              <nav aria-label="Todas as telas" className="grid grid-cols-2 gap-1">
                {itens.map((item) => {
                  const Icon = item.icon;
                  const on = ativo(pathname, item.href);
                  const temBadge = typeof item.badge === 'number' && item.badge > 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={fecharMenu}
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
                onClick={fecharMenu}
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
        )}

        <nav aria-label="Navegação principal" className={`pointer-events-auto relative flex items-center gap-2 rounded-full p-1.5 ${vidro}`}>
          <span
            aria-hidden
            className="pointer-events-none absolute left-1.5 top-1.5 h-10 w-10 rounded-full bg-neutral-900 transition-transform duration-200 ease-out"
            style={{ transform: `translateX(calc(${indicePolegar} * (2.5rem + 0.5rem)))` }}
          />
          {ABAS.map((item) => {
            const Icon = item.icon;
            const on = !aberto && ativo(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={on ? 'page' : undefined}
                className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 ease-out ${
                  on ? 'text-white' : 'text-neutral-800'
                }`}
              >
                <Icon size={20} strokeWidth={1.6} />
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => (aberto ? fecharMenu() : abrirMenu())}
            aria-expanded={aberto}
            aria-controls="menu-mobile"
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 ease-out ${
              aberto || menuAtivo ? 'text-white' : 'text-neutral-800'
            }`}
          >
            <Hamburguer aberto={aberto} />
          </button>
        </nav>
      </div>
    </div>
  );
}
