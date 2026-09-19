/**
 * LandingDashboardPreview
 *
 * Renderiza sempre em 1280 px (desktop full) — sem breakpoints responsivos.
 * O componente pai aplica CSS scale para caber no frame da landing.
 */
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

/* ─── dados simulados ─── */
const BARRAS = [
  { id: 's',  rotulo: 'S, 14', valor: 3200 },
  { id: 't',  rotulo: 'T, 15', valor: 4100 },
  { id: 'q',  rotulo: 'Q, 16', valor: 5800 },
  { id: 'q2', rotulo: 'Q, 17', valor: 7200 },
  { id: 's2', rotulo: 'S, 18', valor: 8900 },
  { id: 'd',  rotulo: 'D, 19', valor: 12400 },
  { id: 's3', rotulo: 'S, 20', valor: 2600 },
];

const FILA = [
  { id: 'livre', tipo: 'livre' as const, hora: '08:00' },
  { id: '1', tipo: 'consulta' as const, nome: 'Marina Alves', hora: '08:30', proc: 'Limpeza',            atual: false },
  { id: '2', tipo: 'consulta' as const, nome: 'Rafael Costa', hora: '09:15', proc: 'Retorno ortodontia', atual: true  },
  { id: '3', tipo: 'consulta' as const, nome: 'Helena Dias',  hora: '10:00', proc: 'Canal',              atual: false },
];

const PENDENCIAS = [
  { id: 'p1', titulo: 'Bruno Lima',    detalhe: 'Débito em aberto · R$ 500,00' },
  { id: 'p2', titulo: 'Camila Nunes', detalhe: 'Prótese pendente · R$ 1.200,00' },
];

const NAV = [
  { Icon: LayoutDashboard, active: true  },
  { Icon: Calendar,        active: false },
  { Icon: Users,           active: false },
  { Icon: Smile,           active: false },
  { Icon: DollarSign,      active: false },
  { Icon: BarChart3,       active: false },
];

const TABS = ['Visão do dia', 'Agenda', 'Financeiro', 'Pendências', 'Relatórios'];

/* ─── estilos base ─── */
const bento      = 'rounded-[1.5rem] bg-white';
const bentoDark  = 'rounded-[1.5rem] border border-neutral-800 bg-neutral-950 text-white shadow-md';

/* ─── Sidebar ─── */
function Sidebar() {
  return (
    <aside className="flex w-[4.5rem] shrink-0 flex-col overflow-visible rounded-[2rem] bg-neutral-950 py-3">
      {/* logo */}
      <div className="mb-2 flex justify-center px-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl">
          <img src="/landing/ortus-mark.svg" alt="" className="h-7 w-7 shrink-0 brightness-0 invert" />
        </span>
      </div>
      {/* avatar */}
      <div className="mb-3 flex justify-center px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[10px] font-semibold text-white/90">
          OR
        </span>
      </div>
      {/* nav */}
      <nav className="flex flex-1 flex-col items-center gap-1 px-2">
        {NAV.map(({ Icon, active }, i) => (
          <span
            key={i}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              active ? 'bg-white/15 text-white' : 'text-white/60'
            }`}
          >
            <Icon size={20} strokeWidth={1.65} />
          </span>
        ))}
      </nav>
      {/* footer */}
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

/* ─── componente principal ─── */
export default function LandingDashboardPreview() {
  const maxBarra = Math.max(1, ...BARRAS.map((b) => b.valor));

  return (
    /* largura FIXA 1280px — o pai aplica scale() para caber no frame */
    <div className="font-poppins flex w-[1280px] gap-2 rounded-[2.25rem] bg-[#dfe5df] p-2">
      <Sidebar />

      {/* ── conteúdo principal ── */}
      <div className="flex flex-1 flex-col rounded-[2rem] bg-[#f3f4f1]">
        <div className="flex flex-col px-8 py-6">

          {/* ── cabeçalho ── */}
          <header className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[2.1rem] font-semibold leading-[1.12] tracking-tight text-neutral-900">
                Gerenciando sua clínica
                <span className="text-neutral-400"> e o fluxo do dia</span>
              </h1>
              <p className="mt-1 text-sm text-neutral-500">Sábado, 19 De Setembro · Ortus</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {[Search, Mail, Bell, Settings].map((Icon, i) => (
                <span key={i} className="relative flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700">
                  <Icon size={18} />
                  {i === 1 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-neutral-900 ring-2 ring-white" />}
                  {i === 2 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />}
                </span>
              ))}
              <span className="inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-base font-medium text-white">
                <Plus size={18} />
                Novo agendamento
              </span>
            </div>
          </header>

          {/* ── abas ── */}
          <div className="mb-5 flex gap-2">
            {TABS.map((label, i) => (
              <span
                key={label}
                className={`shrink-0 rounded-full px-5 py-2 text-base font-medium ${
                  i === 0 ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-700'
                }`}
              >
                {label}
              </span>
            ))}
          </div>

          {/* ── KPI cards ── */}
          <div className="grid grid-cols-3 gap-3">
            {/* Consultas */}
            <section className={`${bento} flex flex-col p-5`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-medium text-neutral-500">Consultas do dia</p>
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-sm font-medium text-neutral-600">8 concluídas</span>
              </div>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-neutral-900">
                12<span className="text-xl font-medium text-neutral-400"> / 15</span>
              </p>
              <div className="mt-4">
                <PillMeter ratio={8 / 12} accent="lime" />
              </div>
            </section>

            {/* Recebimentos */}
            <section className={`${bento} flex flex-col bg-[#c8f053] p-5`}>
              <p className="text-base font-medium text-neutral-800">Recebimentos · Hoje</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-neutral-900">R$ 12.400,00</p>
              <p className="mt-1 text-base text-neutral-700">Previsto R$ 2.850,00</p>
              <div className="mt-4">
                <PillMeter ratio={12400 / (12400 + 2850)} accent="dark" />
              </div>
            </section>

            {/* Em atendimento */}
            <section className={`${bentoDark} relative flex min-h-[11rem] flex-col justify-between overflow-hidden p-5`}>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(200,240,83,0.18),transparent_50%)]" />
              <div className="relative z-[1]">
                <p className="text-base text-neutral-300">Em atendimento · Cadeira 2 · 09:15</p>
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
          </div>

          {/* ── linha inferior ── */}
          <div className="mt-3 grid grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)] gap-3">

            {/* Estatísticas (gráfico) */}
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

              {/* barras */}
              <div className="relative mt-3 flex h-[8.5rem] items-end justify-between gap-1">
                {/* linhas de grade */}
                <div className="pointer-events-none absolute inset-x-0 bottom-8 top-0 flex flex-col justify-between">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-px w-full bg-neutral-100" />
                  ))}
                </div>
                {BARRAS.map((item) => {
                  const h     = Math.max(8, (item.valor / maxBarra) * 100);
                  const hPrev = Math.max(4, h * 0.35);
                  return (
                    <div key={item.id} className="relative z-[1] flex flex-1 flex-col items-center gap-2">
                      <div className="relative flex h-[8.5rem] w-full max-w-[3rem] flex-col items-center justify-end">
                        <div className="absolute bottom-0 w-[85%] rounded-full bg-neutral-100"  style={{ height: `${Math.min(100, h + 12)}%` }} />
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

              {/* rodapé do paciente */}
              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-black/5 pt-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Alergias</p>
                  <p className="text-sm font-medium text-amber-800">Penicilina</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Última visita</p>
                  <p className="text-sm text-neutral-800">12/08/2025</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Saldo</p>
                  <p className="text-sm font-medium text-red-600">R$ 320,00</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Pendências</p>
                  <p className="text-sm font-semibold text-neutral-900">3</p>
                </div>
              </div>
            </section>

            {/* Coluna direita: tabs + fila + pendências + caixa */}
            <aside className="flex flex-col gap-3">
              {/* tabs Agenda / Pacientes */}
              <div className="grid grid-cols-2 gap-3">
                <span className={`${bento} flex items-center gap-2.5 px-4 py-3`}>
                  <CalendarDays size={18} className="shrink-0 text-neutral-800" />
                  <span className="text-base font-semibold text-neutral-900">Agenda</span>
                </span>
                <span className={`${bento} flex items-center gap-2.5 px-4 py-3`}>
                  <Users size={18} className="shrink-0 text-neutral-800" />
                  <span className="text-base font-semibold text-neutral-900">Pacientes</span>
                </span>
              </div>

              {/* Fila do dia */}
              <section className={`${bento} flex flex-col`}>
                <div className="flex items-center justify-between border-b border-black/5 px-5 py-3.5">
                  <h3 className="text-lg font-semibold text-neutral-900">Fila do dia</h3>
                  <span className="text-base text-neutral-400">4</span>
                </div>
                <ul className="p-2.5">
                  {FILA.map((linha) => {
                    if (linha.tipo === 'livre') {
                      return (
                        <li key={linha.id} className="mb-2">
                          <div className="flex items-start justify-between gap-2 rounded-2xl border border-black/5 bg-[#f8f8f6] p-3.5">
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
                      <li key={linha.id} className="mb-2">
                        <div
                          className={`flex items-start justify-between gap-2 rounded-2xl border p-3.5 ${
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

              {/* Pendências */}
              <section className={`${bento} flex flex-col`}>
                <div className="flex items-center justify-between border-b border-black/5 px-5 py-3.5">
                  <h3 className="text-lg font-semibold text-neutral-900">Pendências</h3>
                  <span className="text-base font-medium text-neutral-600">Ver</span>
                </div>
                <ul className="p-2.5">
                  {PENDENCIAS.map((item) => (
                    <li key={item.id} className="mb-2">
                      <div className="flex items-start justify-between gap-2 rounded-2xl border border-black/5 bg-[#f8f8f6] p-3.5">
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

              {/* Fechamento de caixa */}
              <div className={`${bento} flex items-center justify-between gap-2 px-5 py-4`}>
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
  );
}
