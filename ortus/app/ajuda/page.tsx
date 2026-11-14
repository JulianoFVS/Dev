'use client';

import Link from 'next/link';
import { CalendarDays, CircleHelp, FlaskConical, Mail, MessageCircle, Users2 } from 'lucide-react';

const ITENS = [
  { titulo: 'Agenda', texto: 'Toque em um horário para criar um agendamento. A grade mostra o dia inteiro.', icone: CalendarDays, atalho: { rotulo: 'Abrir agenda', href: '/agenda' } },
  { titulo: 'Pacientes', texto: 'Use Filtros para clínica, status e débito. A ordem padrão é alfabética — no computador basta clicar no cabeçalho para mudar.', icone: Users2, atalho: { rotulo: 'Abrir pacientes', href: '/pacientes' } },
  { titulo: 'Laboratório', texto: 'Organize os pedidos por etapa. No celular, use as etapas no topo para trocar de coluna.', icone: FlaskConical, atalho: { rotulo: 'Abrir laboratório', href: '/proteses' } },
  { titulo: 'Tarefas', texto: 'As setas de cada card avançam ou voltam o status depois de uma confirmação.', icone: CircleHelp, atalho: null },
];

export default function AjudaPage() {
  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Ajuda</h1>
        <p className="mt-1 text-sm text-neutral-500 sm:text-base">Atalhos do dia a dia no Ortus.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ITENS.map((item) => {
          const Icone = item.icone;
          return (
            <section key={item.titulo} className="flex min-w-0 flex-col rounded-[1.35rem] border border-neutral-200 bg-white p-4 sm:rounded-[1.5rem] sm:p-5">
              <div className="mb-2 flex items-center gap-2 text-neutral-900">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f1] text-neutral-800">
                  <Icone size={18} />
                </span>
                <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{item.titulo}</h2>
              </div>
              <p className="text-sm leading-relaxed text-neutral-600">{item.texto}</p>
              {item.atalho && (
                <Link
                  href={item.atalho.href}
                  className="mt-3 inline-flex h-11 items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:h-9 sm:w-fit sm:rounded-md"
                >
                  {item.atalho.rotulo}
                </Link>
              )}
            </section>
          );
        })}
      </div>

      <section className="flex flex-col gap-4 rounded-[1.35rem] bg-neutral-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:rounded-[1.5rem]">
        <div className="min-w-0">
          <p className="text-base font-semibold">Precisa de suporte?</p>
          <p className="mt-1 text-sm text-white/70">Fale com a equipe pelo e-mail ou pelo WhatsApp.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a
            href="mailto:contato@ortus.com.br"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-neutral-900 sm:h-10"
          >
            <Mail size={16} /> E-mail
          </a>
          <Link
            href="/mensagens"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/20 px-4 text-sm font-medium text-white sm:h-10"
          >
            <MessageCircle size={16} /> Mensagens
          </Link>
        </div>
      </section>
    </div>
  );
}
