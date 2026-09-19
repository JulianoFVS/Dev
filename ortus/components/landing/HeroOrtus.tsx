'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Calendar,
  CalendarDays,
  DollarSign,
  LayoutDashboard,
  Mail,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import MarcasCarrossel from './MarcasCarrossel';

function MiniPillMeter({ ratio, accent }: { ratio: number; accent: 'lime' | 'dark' }) {
  const pct = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(pct * 14);
  const fillClass = accent === 'lime' ? 'bg-neutral-900' : 'bg-[#c8f053]';
  const emptyClass = accent === 'lime' ? 'border border-black/10 bg-white/70' : 'border border-black/10 bg-white/50';

  return (
    <div className="flex items-end gap-1">
      <div className="flex items-end gap-[2px]">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={`h-4 w-[4px] rounded-full sm:h-[18px] sm:w-[5px] ${i < filled ? fillClass : emptyClass}`} />
        ))}
      </div>
      <span className="pb-0.5 text-[10px] font-medium tabular-nums text-neutral-800 sm:text-[11px]">{Math.round(pct * 100)}%</span>
    </div>
  );
}

const BARRAS = [
  { id: 's', rotulo: 'S, 14', valor: 1200, prev: 420 },
  { id: 't', rotulo: 'T, 15', valor: 800, prev: 280 },
  { id: 'q', rotulo: 'Q, 16', valor: 2100, prev: 740 },
  { id: 'q2', rotulo: 'Q, 17', valor: 4700, prev: 1650 },
  { id: 's2', rotulo: 'S, 18', valor: 900, prev: 320 },
  { id: 'd', rotulo: 'D, 19', valor: 600, prev: 210 },
  { id: 's3', rotulo: 'S, 20', valor: 400, prev: 140 },
];

function PreviewDashboard() {
  const maxBarra = Math.max(...BARRAS.map((b) => b.valor));
  const bento = 'rounded-[0.85rem] bg-white sm:rounded-[1rem]';
  const bentoDark = 'rounded-[0.85rem] border border-neutral-800 bg-neutral-950 text-white sm:rounded-[1rem]';

  const navIcons = [
    { Icon: LayoutDashboard, active: true },
    { Icon: Calendar, active: false },
    { Icon: Users, active: false },
    { Icon: DollarSign, active: false },
    { Icon: BarChart3, active: false },
  ];

  return (
    <div className="flex h-auto min-h-[280px] overflow-hidden rounded-2xl border border-black/10 bg-[#f3f4f1] text-left shadow-[0_18px_50px_-28px_rgba(0,0,0,0.22)] sm:min-h-[360px] md:h-[min(520px,72vh)]">
      <aside className="hidden w-[52px] shrink-0 flex-col items-center gap-1 bg-neutral-950 py-3 sm:flex md:w-[56px]">
        <img src="/landing/ortus-mark.svg" alt="" className="mb-3 h-6 w-6 brightness-0 invert opacity-90 md:h-7 md:w-7" />
        <nav className="flex flex-1 flex-col items-center gap-2">
          {navIcons.map(({ Icon, active }, i) => (
            <span
              key={i}
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-white/15 text-white' : 'text-white/75'}`}
            >
              <Icon size={17} strokeWidth={1.65} />
            </span>
          ))}
        </nav>
        <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-[#c8f053] text-neutral-900">
          <Users size={14} strokeWidth={1.75} />
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#c8f053] ring-2 ring-neutral-950" aria-hidden />
        </span>
      </aside>

      <div className="min-w-0 flex-1 overflow-hidden p-2.5 sm:p-3 md:p-4">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2 md:mb-2.5">
          <div className="min-w-0">
            <h3 className="font-poppins text-[13px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[15px] md:text-[17px]">
              Gerenciando sua clínica
              <span className="text-neutral-400"> e o fluxo do dia</span>
            </h3>
            <p className="mt-0.5 truncate font-poppins text-[10px] capitalize text-neutral-500 sm:text-[11px] md:text-xs">
              Sábado, 19 de setembro · Ortus
            </p>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            {[Search, Mail, Bell, Settings].map((Icon, i) => (
              <span key={i} className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-600">
                <Icon size={14} />
              </span>
            ))}
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-neutral-900 px-3 font-poppins text-[11px] font-medium text-white">
              <Plus size={13} />
              Novo agendamento
            </span>
          </div>
        </div>

        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mb-2.5">
          {['Visão do dia', 'Agenda', 'Financeiro', 'Pendências', 'Relatórios'].map((tab, i) => (
            <span
              key={tab}
              className={`shrink-0 rounded-full px-2.5 py-1 font-poppins text-[10px] font-medium sm:text-[11px] ${
                i === 0 ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-600'
              }`}
            >
              {tab}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
          <section className={`${bento} p-2 sm:p-2.5`}>
            <div className="flex items-start justify-between gap-1">
              <p className="text-[10px] font-medium text-neutral-500 sm:text-[11px]">Consultas do dia</p>
              <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-medium text-neutral-600">0 concluídas</span>
            </div>
            <p className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
              0<span className="text-sm font-medium text-neutral-400"> / 1</span>
            </p>
            <div className="mt-2">
              <MiniPillMeter ratio={0} accent="lime" />
            </div>
          </section>

          <section className={`${bento} bg-[#c8f053] p-2 sm:p-2.5`}>
            <p className="text-[10px] font-medium text-neutral-800 sm:text-[11px]">Recebimentos · Hoje</p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">R$ 4.700,00</p>
            <p className="text-[10px] text-neutral-700 sm:text-[11px]">Previsto R$ 0,00</p>
            <div className="mt-2">
              <MiniPillMeter ratio={1} accent="dark" />
            </div>
          </section>

          <section className={`${bentoDark} relative flex min-h-[88px] flex-col justify-between overflow-hidden p-2 sm:min-h-[96px] sm:p-2.5`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(200,240,83,0.18),transparent_50%)]" />
            <div className="relative z-[1]">
              <p className="text-[10px] text-neutral-300 sm:text-[11px]">Sala livre agora</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-white sm:text-base">Nenhum paciente em curso</p>
            </div>
            <span className="relative z-[1] mt-1.5 inline-flex w-fit rounded-full bg-white px-3 py-1 font-poppins text-[10px] font-medium text-neutral-900 sm:text-[11px]">
              Abrir agenda
            </span>
          </section>
        </div>

        <div className="mt-1.5 grid grid-cols-1 gap-1.5 lg:grid-cols-[1.4fr_0.85fr] sm:mt-2 sm:gap-2">
          <section className={`${bento} flex min-h-[140px] flex-col p-2 sm:min-h-[160px] sm:p-2.5`}>
            <div className="flex flex-wrap items-start justify-between gap-1">
              <div>
                <p className="text-[11px] font-semibold text-neutral-900 sm:text-xs">Estatísticas</p>
                <p className="text-[10px] text-neutral-500">Recebimentos por dia · Semana</p>
              </div>
              <div className="flex rounded-full border border-black/10 bg-[#f3f4f1] p-0.5">
                {['Hoje', 'Semana', 'Mês'].map((l, i) => (
                  <span
                    key={l}
                    className={`rounded-full px-2 py-0.5 text-[9px] font-medium sm:text-[10px] ${
                      i === 1 ? 'bg-neutral-900 text-white' : 'text-neutral-600'
                    }`}
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-1.5 flex gap-3 text-[9px] text-neutral-600 sm:text-[10px]">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-900" />
                Recebido
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#c8f053]" />
                Previsto / fila
              </span>
            </div>
            <div className="relative mt-2 flex flex-1 items-end justify-between gap-0.5 sm:gap-1">
              {BARRAS.map((item) => {
                const h = Math.max(8, (item.valor / maxBarra) * 100);
                const hPrev = Math.max(4, (item.prev / maxBarra) * 100);
                return (
                  <div key={item.id} className="relative z-[1] flex flex-1 flex-col items-center gap-1">
                    <div className="relative flex h-[4.5rem] w-full max-w-[1.65rem] flex-col items-center justify-end sm:h-[5.25rem] sm:max-w-[1.85rem]">
                      <div className="absolute bottom-0 w-[85%] rounded-full bg-neutral-100" style={{ height: `${Math.min(100, h + 12)}%` }} />
                      <div className="absolute bottom-0 z-[1] w-[72%] rounded-full bg-[#c8f053]" style={{ height: `${hPrev}%` }} />
                      <div className="absolute bottom-0 z-[2] w-[72%] rounded-full bg-neutral-900" style={{ height: `${h}%` }} />
                      <span
                        className="absolute z-[3] rounded-full bg-neutral-900 ring-1 ring-white"
                        style={{ bottom: `calc(${h}% - 3px)` }}
                      >
                        <span className="block h-1.5 w-1.5 rounded-full bg-[#c8f053]" />
                      </span>
                    </div>
                    <span className="text-[8px] tabular-nums text-neutral-400 sm:text-[9px]">{item.rotulo}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="hidden min-h-0 flex-col gap-1.5 lg:flex">
            <div className="grid grid-cols-2 gap-1.5">
              <span className={`${bento} flex items-center gap-2 px-2 py-2`}>
                <CalendarDays size={14} className="text-neutral-800" />
                <span className="text-[11px] font-semibold text-neutral-900">Agenda</span>
              </span>
              <span className={`${bento} flex items-center gap-2 px-2 py-2`}>
                <Users size={14} className="text-neutral-800" />
                <span className="text-[11px] font-semibold text-neutral-900">Pacientes</span>
              </span>
            </div>
            <section className={`${bento} flex min-h-0 flex-1 flex-col overflow-hidden`}>
              <div className="border-b border-black/5 px-2.5 py-2">
                <p className="text-[11px] font-semibold text-neutral-900">Fila do dia</p>
              </div>
              <div className="p-1.5">
                <div className="mb-1.5 flex items-start justify-between gap-2 rounded-xl border border-black/5 bg-[#f8f8f6] p-2">
                  <div>
                    <p className="text-[11px] font-medium text-neutral-900">Horário livre</p>
                    <p className="text-[10px] font-medium text-neutral-600">08:00</p>
                  </div>
                  <ArrowUpRight size={12} className="shrink-0 text-neutral-400" />
                </div>
                <p className="mb-1 px-1 text-[10px] font-semibold text-neutral-900">Pendências</p>
                <div className="rounded-xl border border-black/5 bg-[#f8f8f6] p-2">
                  <p className="truncate text-[10px] font-medium text-neutral-900">fddfgdf</p>
                  <p className="text-[9px] text-neutral-500">Débito em aberto · R$ 500,00</p>
                </div>
                <div className="mt-1.5 flex items-center justify-between rounded-xl border border-black/5 px-2 py-1.5">
                  <span className="text-[9px] text-neutral-500">Fechamento de caixa</span>
                  <span className="text-[10px] font-medium text-red-600">Atraso R$ 1.200,00 · 3 pac.</span>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function HeroOrtus() {
  return (
    <section className="overflow-x-hidden bg-white pb-8 pt-8 md:pb-16 md:pt-16">
      <div className="mx-auto flex max-w-[820px] flex-col items-center px-5 text-center">
        <span className="ortus-logo-idle mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f3f4f1] md:mb-7 md:h-16 md:w-16 md:rounded-3xl">
          <img src="/landing/ortus-mark.svg" alt="ortus" className="h-7 w-7 object-contain brightness-0 md:h-10 md:w-10" />
        </span>

        <h1 className="font-poppins text-[28px] font-extrabold leading-[1.12] tracking-[-0.03em] text-neutral-900 md:text-[clamp(32px,5.4vw,64px)] md:leading-[1.08]">
          Gestão inteligente
          <br />
          para <span className="ortus-shine">odontologia</span>
        </h1>

        <p className="mt-3 max-w-[560px] font-poppins text-[13px] font-normal leading-snug text-neutral-500 md:mt-5 md:text-[clamp(16px,1.7vw,20px)] md:leading-relaxed">
          Tecnologia, experiência e humanização para transformar sorrisos e melhorar vidas.
        </p>

        <Link
          href="/cadastro"
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-900 px-4 font-poppins text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800 md:mt-8 md:h-12 md:px-7 md:text-[16px]"
        >
          Comece já
          <ArrowRight className="h-[1.05em] w-[1.05em]" strokeWidth={2.4} />
        </Link>
      </div>

      <div className="relative mt-8 md:mt-16">
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden w-screen -translate-x-1/2 -translate-y-1/2 md:block">
          <MarcasCarrossel denso />
        </div>

        <div className="group/preview relative z-10 mx-auto w-full max-w-[1080px] px-4 md:px-6">
          <div className="ortus-landing-preview rounded-[1.15rem] transition-[transform,box-shadow] duration-500 ease-out will-change-transform md:rounded-[1.35rem] [@media(hover:hover)]:group-hover/preview:-translate-y-1.5 [@media(hover:hover)]:group-hover/preview:scale-[1.012] [@media(hover:hover)]:group-hover/preview:shadow-[0_28px_70px_-24px_rgba(0,0,0,0.28)]">
            <PreviewDashboard />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-screen -translate-x-1/2 md:hidden">
          <MarcasCarrossel denso />
        </div>
      </div>
    </section>
  );
}
