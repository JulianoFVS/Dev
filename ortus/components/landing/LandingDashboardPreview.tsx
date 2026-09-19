import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Calendar,
  CalendarDays,
  Check,
  ChevronRight,
  DollarSign,
  FileText,
  LayoutDashboard,
  Mail,
  Plus,
  Search,
  Settings,
  Smile,
  User,
  Users,
} from 'lucide-react';
import PillMeter from '@/components/bento/PillMeter';

const BARRAS = [
  { id: 's', rotulo: 'S, 14', valor: 3200 },
  { id: 't', rotulo: 'T, 15', valor: 4100 },
  { id: 'q', rotulo: 'Q, 16', valor: 5800 },
  { id: 'q2', rotulo: 'Q, 17', valor: 7200 },
  { id: 's2', rotulo: 'S, 18', valor: 8900 },
  { id: 'd', rotulo: 'D, 19', valor: 12400 },
  { id: 's3', rotulo: 'S, 20', valor: 2600 },
];

const FILA = [
  { id: 'livre', tipo: 'livre' as const, hora: '08:00' },
  { id: '1', tipo: 'consulta' as const, nome: 'Marina Alves', hora: '08:30', proc: 'Limpeza', atual: false },
  { id: '2', tipo: 'consulta' as const, nome: 'Rafael Costa', hora: '09:15', proc: 'Retorno ortodontia', atual: true },
  { id: '3', tipo: 'consulta' as const, nome: 'Helena Dias', hora: '10:00', proc: 'Canal', atual: false },
];

const PENDENCIAS = [
  { id: 'p1', titulo: 'Bruno Lima', detalhe: 'Débito em aberto · R$ 500,00' },
  { id: 'p2', titulo: 'Camila Nunes', detalhe: 'Prótese pendente · R$ 1.200,00' },
];

const NAV = [
  { Icon: LayoutDashboard, active: true },
  { Icon: Calendar, active: false },
  { Icon: Users, active: false },
  { Icon: Smile, active: false },
  { Icon: DollarSign, active: false },
  { Icon: BarChart3, active: false },
];

function SidebarMock() {
  return (
    <aside className="hidden w-[4.5rem] shrink-0 flex-col overflow-visible rounded-[1.75rem] bg-neutral-950 py-3 sm:flex sm:rounded-[2rem] md:rounded-[2.25rem]">
      <div className="mb-2 flex justify-center px-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl">
          <img src="/landing/ortus-mark.svg" alt="" className="h-7 w-7 shrink-0 brightness-0 invert" />
        </span>
      </div>
      <div className="mb-3 flex justify-center px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[10px] font-semibold text-white/90">
          OR
        </span>
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1 overflow-visible px-2">
        {NAV.map(({ Icon, active }, i) => (
          <span
            key={i}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              active ? 'bg-white/15 text-white' : 'text-white/80'
            }`}
          >
            <Icon size={20} strokeWidth={1.65} />
          </span>
        ))}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-1.5 px-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-white/40">
          <ChevronRight size={18} />
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-white/45">
          <Settings size={18} strokeWidth={1.65} />
        </span>
        <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-[#c8f053] ring-2 ring-neutral-800">
          <User size={18} className="text-neutral-900" strokeWidth={1.75} />
        </span>
      </div>
    </aside>
  );
}

export default function LandingDashboardPreview() {
  const maxBarra = Math.max(1, ...BARRAS.map((b) => b.valor));
  const bentoShell = 'min-h-0 rounded-[1.35rem] sm:rounded-[1.5rem] md:rounded-[1.65rem]';
  const bento = `${bentoShell} bg-white`;
  const bentoAgenda = `${bentoShell} border border-neutral-800 bg-neutral-950 text-white shadow-md`;

  const dashTabs = ['Visão do dia', 'Agenda', 'Financeiro', 'Pendências', 'Relatórios'];

  return (
    <div className="ortus-landing-preview-ui font-poppins flex w-full gap-1.5 overflow-hidden rounded-[1.75rem] bg-[#dfe5df] p-1.5 sm:gap-2 sm:rounded-[2rem] sm:p-2 lg:rounded-[2.25rem]">
      <SidebarMock />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] bg-[#f3f4f1] shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:rounded-[2rem] md:rounded-[2.25rem]">
        <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
          <header className="relative z-20 mb-3 shrink-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="max-w-3xl text-[1.65rem] font-semibold leading-[1.12] tracking-tight text-neutral-900 sm:text-[1.85rem] md:text-[2.05rem] lg:text-[2.15rem]">
                  Gerenciando sua clínica
                  <span className="text-neutral-400"> e o fluxo do dia</span>
                </h1>
                <p className="mt-1 truncate text-sm capitalize text-neutral-500 sm:text-base">Sábado, 19 De Setembro · Ortus</p>
              </div>
              <div className="hidden shrink-0 items-center gap-2 self-start lg:flex">
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700">
                  <Search size={18} />
                </span>
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700">
                  <Mail size={18} />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-neutral-900 ring-2 ring-white" aria-hidden />
                </span>
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700">
                  <Bell size={18} />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700">
                  <Settings size={18} />
                </span>
                <span className="inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white sm:text-base">
                  <Plus size={18} />
                  Novo agendamento
                </span>
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {dashTabs.map((label, i) => (
                <span
                  key={label}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium sm:px-5 sm:text-base ${
                    i === 0 ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-700'
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2.5 overflow-hidden sm:gap-3">
            <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:gap-3 lg:grid-cols-3">
              <section className={`${bento} flex flex-col p-4 sm:p-5`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-neutral-500 sm:text-base">Consultas do dia</p>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 sm:text-sm">8 concluídas</span>
                </div>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                  12<span className="text-lg font-medium text-neutral-400 sm:text-xl"> / 15</span>
                </p>
                <div className="mt-4">
                  <PillMeter ratio={8 / 12} accent="lime" />
                </div>
              </section>

              <section className={`${bento} flex flex-col bg-[#c8f053] p-4 sm:p-5`}>
                <p className="text-sm font-medium text-neutral-800 sm:text-base">Recebimentos · Hoje</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">R$ 12.400,00</p>
                <p className="mt-1 text-sm text-neutral-700 sm:text-base">Previsto R$ 2.850,00</p>
                <div className="mt-4">
                  <PillMeter ratio={12400 / (12400 + 2850)} accent="dark" />
                </div>
              </section>

              <section className={`${bentoAgenda} relative flex min-h-[10rem] flex-col justify-between overflow-hidden p-4 sm:min-h-[11rem] sm:p-5`}>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(200,240,83,0.18),transparent_50%)]" />
                <div className="relative z-[1]">
                  <p className="text-sm text-neutral-300 sm:text-base">Em atendimento · Cadeira 2 · 09:15</p>
                  <h2 className="mt-2 truncate text-xl font-semibold text-white sm:text-2xl">Rafael Costa</h2>
                  <p className="mt-1 truncate text-sm text-neutral-200 sm:text-base">Retorno ortodontia · 34 anos · 2 itens no plano</p>
                </div>
                <div className="relative z-[1] mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-neutral-900 sm:h-11 sm:text-base">
                    <Check size={16} />
                    Concluir
                  </span>
                  <span className="inline-flex h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-medium text-white sm:h-11 sm:text-base">
                    <FileText size={16} />
                    Ficha
                  </span>
                </div>
              </section>
            </div>

            <div className="grid min-h-0 grid-cols-1 gap-2.5 overflow-hidden lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,1fr)] sm:gap-3">
              <section className={`${bento} flex min-h-0 flex-col p-4 sm:p-5`}>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 sm:text-xl">Estatísticas</h3>
                    <p className="text-sm text-neutral-500 sm:text-base">Recebimentos por dia · Semana</p>
                  </div>
                  <div className="flex rounded-full border border-black/10 bg-[#f3f4f1] p-1">
                    {['Hoje', 'Semana', 'Mês'].map((label, i) => (
                      <span
                        key={label}
                        className={`rounded-full px-3 py-1 text-sm font-medium sm:px-4 sm:text-base ${
                          i === 1 ? 'bg-neutral-900 text-white' : 'text-neutral-600'
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex shrink-0 flex-wrap gap-4 text-sm sm:text-base">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
                    Recebido
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#c8f053]" />
                    Previsto / fila
                  </span>
                </div>

                <div className="relative mt-3 flex min-h-0 flex-1 items-end justify-between gap-1 sm:gap-2">
                  <div className="pointer-events-none absolute inset-x-0 bottom-8 top-2 flex flex-col justify-between">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-px w-full bg-neutral-100" />
                    ))}
                  </div>
                  {BARRAS.map((item) => {
                    const h = Math.max(8, (item.valor / maxBarra) * 100);
                    const hPrev = Math.max(4, h * 0.35);
                    return (
                      <div key={item.id} className="relative z-[1] flex flex-1 flex-col items-center gap-2">
                        <div className="relative flex h-[7.5rem] w-full max-w-[2.75rem] flex-col items-center justify-end sm:h-[8.5rem] sm:max-w-[3rem]">
                          <div className="absolute bottom-0 w-[85%] rounded-full bg-neutral-100" style={{ height: `${Math.min(100, h + 12)}%` }} />
                          <div className="absolute bottom-0 z-[1] w-[72%] rounded-full bg-[#c8f053]" style={{ height: `${hPrev}%` }} />
                          <div className="absolute bottom-0 z-[2] w-[72%] rounded-full bg-neutral-900" style={{ height: `${h}%` }} />
                          <span className="absolute z-[3] rounded-full bg-neutral-900 ring-2 ring-white" style={{ bottom: `calc(${h}% - 4px)` }}>
                            <span className="block h-2 w-2 rounded-full bg-[#c8f053]" />
                          </span>
                        </div>
                        <span className="text-xs tabular-nums text-neutral-400 sm:text-sm">{item.rotulo}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 shrink-0 grid grid-cols-2 gap-2 border-t border-black/5 pt-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 sm:text-sm">Alergias</p>
                    <p className="line-clamp-2 text-sm font-medium text-amber-800 sm:text-base">Penicilina</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 sm:text-sm">Última visita</p>
                    <p className="text-sm text-neutral-800 sm:text-base">12/08/2025</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 sm:text-sm">Saldo</p>
                    <p className="text-sm font-medium text-red-600 sm:text-base">R$ 320,00</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 sm:text-sm">Pendências</p>
                    <p className="text-sm font-semibold text-neutral-900 sm:text-base">3</p>
                  </div>
                </div>
              </section>

              <aside className="flex min-h-0 flex-col gap-2 overflow-hidden">
                <div className="grid shrink-0 grid-cols-2 gap-2">
                  <span className={`${bento} flex items-center gap-2.5 px-3 py-2.5`}>
                    <CalendarDays size={18} className="shrink-0 text-neutral-800" />
                    <span className="text-sm font-semibold text-neutral-900">Agenda</span>
                  </span>
                  <span className={`${bento} flex items-center gap-2.5 px-3 py-2.5`}>
                    <Users size={18} className="shrink-0 text-neutral-800" />
                    <span className="text-sm font-semibold text-neutral-900">Pacientes</span>
                  </span>
                </div>

                <section className={`${bento} flex min-h-0 flex-[1.2] flex-col overflow-hidden`}>
                  <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                    <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">Fila do dia</h3>
                    <span className="text-sm text-neutral-400">4</span>
                  </div>
                  <ul className="min-h-0 flex-1 overflow-hidden p-2">
                    {FILA.map((linha) => {
                      if (linha.tipo === 'livre') {
                        return (
                          <li key={linha.id}>
                            <div className="mb-2 flex items-start justify-between gap-2 rounded-2xl border border-black/5 bg-[#f8f8f6] p-3">
                              <div>
                                <p className="font-medium text-neutral-900 sm:text-base">Horário livre</p>
                                <p className="text-sm font-medium text-neutral-600">{linha.hora}</p>
                              </div>
                              <ArrowUpRight size={16} className="shrink-0 text-neutral-400" />
                            </div>
                          </li>
                        );
                      }
                      return (
                        <li key={linha.id}>
                          <div
                            className={`mb-2 flex items-start justify-between gap-2 rounded-2xl border p-3 ${
                              linha.atual ? 'border-[#c8f053] bg-white' : 'border-black/5 bg-[#f8f8f6]'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-neutral-900 sm:text-base">{linha.nome}</p>
                              <p className="truncate text-sm font-medium text-neutral-600">
                                {linha.hora} · {linha.proc}
                              </p>
                            </div>
                            <ArrowUpRight size={16} className="shrink-0 text-neutral-400" />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className={`${bento} flex min-h-0 flex-1 flex-col overflow-hidden`}>
                  <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                    <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">Pendências</h3>
                    <span className="text-sm font-medium text-neutral-600 sm:text-base">Ver</span>
                  </div>
                  <ul className="min-h-0 flex-1 overflow-hidden p-2">
                    {PENDENCIAS.map((item) => (
                      <li key={item.id}>
                        <div className="mb-2 flex items-start justify-between gap-2 rounded-2xl border border-black/5 bg-[#f8f8f6] p-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-neutral-900 sm:text-base">{item.titulo}</p>
                            <p className="truncate text-sm font-medium text-neutral-600">{item.detalhe}</p>
                          </div>
                          <ArrowUpRight size={16} className="shrink-0 text-neutral-400" />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <div className={`${bento} flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3`}>
                  <div>
                    <p className="font-semibold text-neutral-900 sm:text-lg">Fechamento de caixa</p>
                    <p className="text-sm text-neutral-500 sm:text-base">Atraso R$ 1.200,00 · 3 pac.</p>
                  </div>
                  <ArrowUpRight size={18} className="shrink-0 text-neutral-400" />
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
