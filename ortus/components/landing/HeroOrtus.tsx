'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  Calendar,
  Check,
  Home,
  Heart,
  Mic,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import MarcasCarrossel from './MarcasCarrossel';

function PainelClinica() {
  const novos = [
    { nome: 'Marina Alves', canal: 'WhatsApp', status: 'Mensagem enviada', telefone: '+55 11 98810-2210' },
    { nome: 'Rafael Costa', canal: 'Instagram', status: 'Mensagem enviada', telefone: '+55 21 99740-1188' },
    { nome: 'Helena Dias', canal: 'Indicação', status: 'Mensagem enviada', telefone: '+55 31 98412-5502' },
  ];

  const tratamento = [
    { nome: 'Bruno Lima', procedimento: 'Implante', status: 'Confirmado', cor: 'bg-[#00c875]' },
    { nome: 'Camila Nunes', procedimento: 'Ortodontia', status: 'Retorno', cor: 'bg-[#a25ddc]' },
    { nome: 'Diego Prado', procedimento: 'Clareamento', status: 'Confirmado', cor: 'bg-[#00c875]' },
  ];

  return (
    <div className="flex h-[min(520px,72vh)] overflow-hidden rounded-2xl border border-slate-200 bg-[#f6f7fb] text-left shadow-[0_18px_50px_-28px_rgba(20,30,50,0.28)]">
      <aside className="hidden w-[56px] shrink-0 flex-col items-center bg-[#323338] py-4 sm:flex">
        <img src="/landing/ortus-mark.svg" alt="" className="mb-6 h-7 w-7 brightness-0 invert" />
        <nav className="flex flex-1 flex-col items-center gap-5 text-white/80">
          <Home size={18} />
          <Calendar size={18} />
          <Users size={18} />
          <Heart size={18} />
          <Bell size={18} />
        </nav>
        <Settings size={18} className="text-white/60" />
      </aside>

      <div className="min-w-0 flex-1 overflow-hidden px-3 py-3 sm:px-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-poppins text-[20px] font-semibold text-[#323338]">Agenda da clínica</h3>
            <div className="mt-2 flex items-center gap-4 font-poppins text-[13px] text-slate-500">
              <span className="border-b-2 border-ortus-blue pb-1 font-medium text-ortus-blue">Quadro principal</span>
              <span>Agenda</span>
              <span>Kanban</span>
              <Plus size={14} />
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-poppins text-[12px] text-slate-500">
              Integrar
            </span>
            <span className="rounded-md bg-ortus-blue px-2.5 py-1 font-poppins text-[12px] font-medium text-white">
              Automações
            </span>
          </div>
        </div>

        <section className="relative mb-3 overflow-hidden rounded-xl bg-white">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="h-5 w-1.5 rounded-sm bg-[#579bfc]" />
            <p className="font-poppins text-[13px] font-semibold text-[#323338]">Novos pacientes</p>
          </div>
          <div className="grid grid-cols-[1.3fr_1fr_1.1fr_1.2fr] gap-2 bg-[#edf3ff] px-3 py-1.5 font-poppins text-[11px] font-medium text-slate-400">
            <span>Nome</span>
            <span>Canal</span>
            <span>Status</span>
            <span>Telefone</span>
          </div>
          {novos.map((item) => (
            <div key={item.nome} className="grid grid-cols-[1.3fr_1fr_1.1fr_1.2fr] items-center gap-2 border-t border-[#e8f0ff] bg-[#f3f7ff] px-3 py-2">
              <span className="truncate font-poppins text-[13px] text-[#323338]">{item.nome}</span>
              <span className="truncate font-poppins text-[12px] text-slate-500">{item.canal}</span>
              <span className="w-fit rounded-sm bg-[#579bfc] px-2 py-0.5 font-poppins text-[11px] font-medium text-white">
                {item.status}
              </span>
              <span className="truncate font-poppins text-[12px] text-slate-500">{item.telefone}</span>
            </div>
          ))}
          <div className="absolute -left-1 top-16 hidden rounded-full bg-white px-2.5 py-1 font-poppins text-[11px] font-medium text-[#323338] ring-1 ring-pink-200 sm:block">
            8 retornos confirmados
          </div>
        </section>

        <section className="relative overflow-hidden rounded-xl bg-white">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="h-5 w-1.5 rounded-sm bg-[#00c875]" />
            <p className="font-poppins text-[13px] font-semibold text-[#323338]">Em tratamento</p>
          </div>
          <div className="grid grid-cols-[1.3fr_1.2fr_1fr] gap-2 px-3 py-1.5 font-poppins text-[11px] font-medium text-slate-400">
            <span>Paciente</span>
            <span>Procedimento</span>
            <span>Status</span>
          </div>
          {tratamento.map((item) => (
            <div key={item.nome} className="grid grid-cols-[1.3fr_1.2fr_1fr] items-center gap-2 border-t border-slate-100 px-3 py-2">
              <span className="truncate font-poppins text-[13px] text-[#323338]">{item.nome}</span>
              <span className="truncate font-poppins text-[12px] text-slate-500">{item.procedimento}</span>
              <span className={`w-fit rounded-sm px-2 py-0.5 font-poppins text-[11px] font-medium text-white ${item.cor}`}>
                {item.status}
              </span>
            </div>
          ))}
          <div className="absolute right-4 top-10 hidden rounded-full bg-white px-2.5 py-1 font-poppins text-[11px] font-medium text-[#323338] ring-1 ring-pink-200 md:block">
            Ligando p/ Marina
          </div>
        </section>
      </div>

      <aside className="hidden w-[250px] shrink-0 flex-col border-l border-slate-200 bg-white p-4 lg:flex">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-ortus-mist">
            <img src="/landing/ortus-mark.svg" alt="" className="h-5 w-5" />
          </span>
          <div>
            <p className="font-poppins text-[13px] font-semibold text-[#323338]">Lia</p>
            <p className="font-poppins text-[11px] text-slate-500">assistente da clínica</p>
          </div>
        </div>

        <div className="mb-3 self-end rounded-2xl rounded-tr-sm bg-ortus-blue px-3 py-2 font-poppins text-[12px] text-white">
          Buscar novos pacientes para a semana
        </div>

        <ul className="space-y-2.5 font-poppins text-[12px] text-slate-600">
          <li className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check size={10} strokeWidth={3} />
            </span>
            Separando indicações da semana
          </li>
          <li className="flex items-center gap-2">
            <Search size={14} className="text-ortus-blue" />
            Analisando indicações
          </li>
          <li className="flex items-center gap-2">
            <Calendar size={14} className="text-ortus-blue" />
            Organizando horários
          </li>
        </ul>

        <div className="mt-auto flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-slate-400">
          <span className="flex-1 font-poppins text-[12px]">Fale com a Lia</span>
          <Mic size={14} />
          <ArrowRight size={14} />
        </div>
      </aside>
    </div>
  );
}

export default function HeroOrtus() {
  return (
    <section className="overflow-x-hidden bg-white pb-10 pt-12 sm:pt-14 md:pb-16 md:pt-16">
      <div className="mx-auto flex max-w-[820px] flex-col items-center px-5 text-center">
        <img
          src="/landing/ortus-mark.svg"
          alt="ortus"
          className="mb-7 h-14 w-14 object-contain sm:h-16 sm:w-16"
        />

        <h1 className="font-poppins text-[clamp(32px,5.4vw,64px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#1a1a1a]">
          Gestão inteligente
          <br />
          para <span className="ortus-shine">odontologia</span>
        </h1>

        <p className="mt-5 max-w-[560px] font-poppins text-[clamp(16px,1.7vw,20px)] font-normal leading-relaxed text-slate-500">
          Tecnologia, experiência e humanização para transformar sorrisos e melhorar vidas.
        </p>

        <Link
          href="/cadastro"
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-ortus-blue px-7 font-poppins text-[16px] font-semibold text-white transition-colors hover:bg-ortus-blueDark"
        >
          Comece já
          <ArrowRight className="h-[1.05em] w-[1.05em]" strokeWidth={2.4} />
        </Link>
      </div>

      <div className="relative mt-14 sm:mt-16">
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 w-screen -translate-x-1/2 -translate-y-1/2">
          <MarcasCarrossel />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1080px] px-4 sm:px-6">
          <PainelClinica />
        </div>
      </div>
    </section>
  );
}
