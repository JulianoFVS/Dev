'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import MarcasCarrossel from './MarcasCarrossel';

function PainelClinica() {
  const linhas = [
    { paciente: 'Marina Alves', procedimento: 'Clareamento', horario: '09:00', status: 'Confirmado', cor: 'bg-emerald-100 text-emerald-700' },
    { paciente: 'Rafael Costa', procedimento: 'Implante', horario: '10:30', status: 'Em atendimento', cor: 'bg-sky-100 text-sky-700' },
    { paciente: 'Helena Dias', procedimento: 'Ortodontia', horario: '13:00', status: 'Aguardando', cor: 'bg-amber-100 text-amber-700' },
    { paciente: 'Bruno Lima', procedimento: 'Avaliação', horario: '15:20', status: 'Confirmado', cor: 'bg-emerald-100 text-emerald-700' },
  ];

  return (
    <div className="relative mx-auto w-full max-w-[980px]">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <p className="font-poppins text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
              Agenda do dia
            </p>
            <p className="font-poppins text-[17px] font-semibold text-[#323338]">Clínica Ortus — Centro</p>
          </div>
          <span className="rounded-full bg-ortus-mist px-3 py-1 font-poppins text-[12px] font-semibold text-ortus-blue">
            12 consultas
          </span>
        </div>

        <div className="grid grid-cols-[1.4fr_1.1fr_0.7fr_1fr] gap-3 border-b border-slate-100 px-5 py-2 font-poppins text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <span>Paciente</span>
          <span>Procedimento</span>
          <span>Horário</span>
          <span>Status</span>
        </div>

        {linhas.map((linha) => (
          <div
            key={linha.paciente}
            className="grid grid-cols-[1.4fr_1.1fr_0.7fr_1fr] items-center gap-3 border-b border-slate-50 px-5 py-3 last:border-b-0"
          >
            <span className="truncate font-poppins text-[14px] font-medium text-[#323338]">{linha.paciente}</span>
            <span className="truncate font-poppins text-[13px] text-slate-500">{linha.procedimento}</span>
            <span className="font-poppins text-[13px] text-slate-500">{linha.horario}</span>
            <span className={`w-fit rounded-full px-2.5 py-1 font-poppins text-[11px] font-semibold ${linha.cor}`}>
              {linha.status}
            </span>
          </div>
        ))}
      </div>

      <div className="absolute -right-2 top-16 hidden w-[240px] rounded-2xl border border-slate-200 bg-white p-4 lg:block">
        <p className="font-poppins text-[13px] font-semibold text-[#323338]">Ana, recepção</p>
        <p className="mt-0.5 font-poppins text-[12px] text-slate-500">Especialista em agenda</p>
        <ul className="mt-3 space-y-2 font-poppins text-[12px] text-slate-600">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-ortus-blue" />
            Confirmando retornos
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Enviando lembretes
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Revisando anamneses
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function HeroOrtus() {
  return (
    <section className="bg-white px-5 pb-10 pt-14 sm:pt-16 md:pb-16 md:pt-20">
      <div className="mx-auto flex max-w-[820px] flex-col items-center text-center">
        <div className="mb-5 flex items-center gap-2 font-poppins text-[13px] font-medium text-slate-500">
          <img src="/landing/ortus-mark.svg" alt="" className="h-5 w-5 object-contain" />
          plataforma para clínicas
        </div>

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

      <div className="mx-auto mt-14 w-full max-w-[1100px] px-0 sm:mt-16 sm:px-6">
        <PainelClinica />
      </div>

      <div className="mx-auto mt-12 w-full max-w-[980px]">
        <MarcasCarrossel />
      </div>
    </section>
  );
}
