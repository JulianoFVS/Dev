'use client';

import Link from 'next/link';
import { CircleHelp, Mail, MessageCircle } from 'lucide-react';

const ITENS = [
  { titulo: 'Agenda', texto: 'Clique em um horário para criar um agendamento. A grade mostra o dia inteiro.' },
  { titulo: 'Pacientes', texto: 'Use Filtros para clínica, status e débito. A ordenação padrão é alfabética — clique no cabeçalho para mudar.' },
  { titulo: 'Laboratório', texto: 'Arraste o pedido entre os quadros. Quadros e pedidos têm um limite alto para evitar uso indevido.' },
  { titulo: 'Tarefas', texto: 'As setas de cada card avançam ou voltam o status depois de uma confirmação.' },
];

export default function AjudaPage() {
  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Ajuda</h1>
        <p className="mt-1 text-sm text-neutral-500 sm:text-base">Atalhos do dia a dia no Ortus.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ITENS.map((item) => (
          <section key={item.titulo} className="rounded-[1.35rem] bg-white p-5 sm:rounded-[1.5rem]">
            <div className="mb-2 flex items-center gap-2 text-neutral-900">
              <CircleHelp size={18} />
              <h2 className="text-base font-semibold">{item.titulo}</h2>
            </div>
            <p className="text-sm text-neutral-600">{item.texto}</p>
          </section>
        ))}
      </div>
      <section className="flex flex-col gap-3 rounded-[1.35rem] bg-neutral-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:rounded-[1.5rem]">
        <div>
          <p className="text-base font-semibold">Precisa de suporte?</p>
          <p className="mt-1 text-sm text-white/70">Fale com a equipe pelo e-mail ou pelo WhatsApp.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="mailto:contato@ortus.com.br" className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-neutral-900">
            <Mail size={16} /> E-mail
          </a>
          <Link href="/mensagens" className="inline-flex h-10 items-center gap-2 rounded-full border border-white/20 px-4 text-sm font-medium text-white">
            <MessageCircle size={16} /> Mensagens
          </Link>
        </div>
      </section>
    </div>
  );
}
