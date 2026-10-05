/**
 * LandingDashboardPreview
 *
 * Renderiza sempre em 1280 px (desktop full) — sem breakpoints responsivos.
 * O componente pai aplica CSS scale para caber no frame da landing.
 * O desenho espelha o dashboard em app/dashboard/page.tsx.
 */
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckSquare,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  DollarSign,
  FileText,
  LayoutDashboard,
  Mail,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Smile,
  User,
  Users,
} from 'lucide-react';
import PillMeter from '@/components/bento/PillMeter';

const BARRAS = [
  { id: 's', rotulo: 'S, 29', valor: 3200 },
  { id: 't', rotulo: 'T, 30', valor: 4100 },
  { id: 'q', rotulo: 'Q, 1', valor: 5800 },
  { id: 'q2', rotulo: 'Q, 2', valor: 7200 },
  { id: 's2', rotulo: 'S, 3', valor: 8900 },
  { id: 'd', rotulo: 'D, 4', valor: 12400 },
  { id: 's3', rotulo: 'S, 5', valor: 2600 },
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
  { Icon: CheckSquare, active: false },
  { Icon: ShieldCheck, active: false },
  { Icon: ClipboardList, active: false },
];

const bento = 'rounded-[1.65rem] bg-white';
const bentoAgenda = 'rounded-[1.65rem] border border-neutral-800 bg-neutral-950 text-white shadow-md';

function Sidebar() {
  return (
    <aside className="flex w-[4.5rem] shrink-0 flex-col overflow-visible rounded-[2.25rem] bg-neutral-950 py-3">
      <div className="mb-2 flex justify-center px-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl">
          <img src="/landing/ortus-mark.svg" alt="" className="h-9 w-9 shrink-0 brightness-0 invert" />
        </span>
      </div>
      <div className="mb-3 flex justify-center px-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white/90">
          <Building2 size={18} strokeWidth={1.75} className="text-white/70" />
        </span>
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1 px-2">
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
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-white/45">
          <Settings size={18} strokeWidth={1.65} />
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-white/45">
          <CircleHelp size={18} strokeWidth={1.65} />
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-white/40">
          <ChevronRight size={18} />
        </span>
        <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full ring-2 ring-neutral-800">
          <span className="flex h-full w-full items-center justify-center rounded-full bg-[#c8f053] text-neutral-900">
            <User size={18} strokeWidth={1.75} />
          </span>
        </span>
      </div>
    </aside>
  );
}

export default function LandingDashboardPreview() {
  const maxBarra = Math.max(1, ...BARRAS.map((b) => b.valor));

  return (
    <div className="font-poppins flex w-[1280px] gap-2 bg-[#dfe5df] p-2">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[2.25rem] bg-[#f3f4f1] shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-col px-4 py-3.5">
          <header className="relative z-20 mb-3 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="max-w-3xl text-[2.15rem] font-semibold leading-[1.12] tracking-tight text-neutral-900">
                  Gerenciando sua clínica
                  <span className="text-neutral-400"> e o fluxo do dia</span>
                </h1>
                <p className="mt-1 truncate text-base capitalize text-neutral-500">segunda-feira, 5 de outubro · Ortus</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700">
                  <Search size={18} />
                </span>
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700">
                  <Mail size={18} />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-neutral-900 ring-2 ring-white" />
                </span>
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700">
                  <Bell size={18} />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700">
                  <Settings size={18} />
                </span>
                <span className="inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-base font-medium text-white">
                  <Plus size={18} />
                  Novo agendamento
                </span>
              </div>
            </div>
          </header>

          <div className="grid grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="grid grid-cols-3 gap-3">
              <section className={`${bentoAgenda} relative flex min-h-[11rem] flex-col justify-between overflow-hidden p-5`}>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(200,240,83,0.18),transparent_50%)]" />
                <div className="relative z-[1]">
                  <p className="text-base text-neutral-300">Em atendimento · 09:15</p>
                  <h2 className="mt-2 truncate text-2xl font-semibold text-white">Rafael Costa</h2>
                  <p className="mt-1 truncate text-base text-neutral-200">Retorno ortodontia · 34 anos · 2 itens no plano</p>
                </div>
                <div className="relative z-[1] mt-3 flex gap-2">
                  <span className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-base font-medium text-neutral-900">
                    <Check size={16} /> Concluir
                  </span>
                  <span className="inline-flex h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-base font-medium text-white">
                    <FileText size={16} /> Ficha
                  </span>
                </div>
              </section>

              <section className={`${bento} flex flex-col p-5`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-medium text-neutral-500">Consultas do dia</p>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-sm font-medium text-neutral-600">8 concluídas</span>
                </div>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-neutral-900">
                  12<span className="text-xl font-medium text-neutral-400"> / 12</span>
                </p>
                <div className="mt-4">
                  <PillMeter ratio={8 / 12} accent="lime" />
                </div>
              </section>

              <section className={`${bento} flex flex-col bg-[#c8f053] p-5`}>
                <p className="text-base font-medium text-neutral-800">Recebimentos · Hoje</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-neutral-900">R$ 12.400,00</p>
                <p className="mt-1 text-base text-neutral-700">Previsto R$ 2.850,00</p>
                <div className="mt-4">
                  <PillMeter ratio={12400 / (12400 + 2850)} accent="dark" />
                </div>
              </section>
            </div>

            <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(260px,1fr)] gap-3">
              <section className={`${bento} flex flex-col p-5`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-semibold text-neutral-900">Estatísticas</h3>
                    <p className="text-base text-neutral-500">Recebimentos por dia · Semana</p>
                  </div>
                  <div className="flex rounded-full border border-black/10 bg-[#f3f4f1] p-1">
                    {['Hoje', 'Semana', 'Mês'].map((label, i) => (
                      <span
                        key={label}
                        className={`rounded-full px-4 py-1 text-base font-medium ${
                          i === 1 ? 'bg-neutral-900 text-white' : 'text-neutral-600'
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex gap-4 text-base">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" /> Recebido
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#c8f053]" /> Previsto / fila
                  </span>
                </div>

                <div className="relative mt-3 flex items-end justify-between gap-2">
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
                        <div className="relative flex h-[8.5rem] w-full max-w-[3rem] flex-col items-center justify-end">
                          <div className="absolute bottom-0 w-[85%] rounded-full bg-neutral-100" style={{ height: `${Math.min(100, h + 12)}%` }} />
                          <div className="absolute bottom-0 z-[1] w-[72%] rounded-full bg-[#c8f053]" style={{ height: `${hPrev}%` }} />
                          <div className="absolute bottom-0 z-[2] w-[72%] rounded-full bg-neutral-900" style={{ height: `${h}%` }} />
                          <span className="absolute z-[3] rounded-full bg-neutral-900 ring-2 ring-white" style={{ bottom: `calc(${h}% - 4px)` }}>
                            <span className="block h-2 w-2 rounded-full bg-[#c8f053]" />
                          </span>
                        </div>
                        <span className="text-sm tabular-nums text-neutral-400">{item.rotulo}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 border-t border-black/5 pt-3">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">Alergias</p>
                    <p className="text-base font-medium text-amber-800">Penicilina</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">Última visita</p>
                    <p className="text-base text-neutral-800">12/08/2025</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">Saldo</p>
                    <p className="text-base font-medium text-red-600">R$ 320,00</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">Pendências</p>
                    <p className="text-base font-semibold text-neutral-900">2</p>
                  </div>
                </div>
              </section>

              <aside className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <section className={`${bento} flex flex-col`}>
                    <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                      <h3 className="text-lg font-semibold text-neutral-900">Fila do dia</h3>
                      <span className="text-sm text-neutral-400">4</span>
                    </div>
                    <ul className="p-2">
                      {FILA.map((linha) => {
                        if (linha.tipo === 'livre') {
                          return (
                            <li key={linha.id}>
                              <div className="mb-2 flex items-start justify-between gap-2 rounded-2xl border border-black/5 bg-[#f8f8f6] p-3">
                                <div>
                                  <p className="font-medium text-neutral-900">Horário livre</p>
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
                                <p className="truncate font-medium text-neutral-900">{linha.nome}</p>
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

                  <section className={`${bento} flex flex-col`}>
                    <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                      <h3 className="text-lg font-semibold text-neutral-900">Pendências</h3>
                      <span className="text-base font-medium text-neutral-600">Ver</span>
                    </div>
                    <ul className="p-2">
                      {PENDENCIAS.map((item) => (
                        <li key={item.id}>
                          <div className="mb-2 flex items-start justify-between gap-2 rounded-2xl border border-black/5 bg-[#f8f8f6] p-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-neutral-900">{item.titulo}</p>
                              <p className="truncate text-sm font-medium text-neutral-600">{item.detalhe}</p>
                            </div>
                            <ArrowUpRight size={16} className="shrink-0 text-neutral-400" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>

                <div className={`${bento} flex items-center justify-between gap-2 px-4 py-3`}>
                  <div>
                    <p className="text-lg font-semibold text-neutral-900">Fechamento de caixa</p>
                    <p className="text-base text-neutral-500">Atraso R$ 1.200,00 · 3 pac.</p>
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
