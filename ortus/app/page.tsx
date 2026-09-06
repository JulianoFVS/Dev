'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle, Calendar, DollarSign, Users } from 'lucide-react';
import LandingNavbar from '@/components/landing/LandingNavbar';
import HeroOrtus from '@/components/landing/HeroOrtus';

export default function LandingPage() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-sky-100 scroll-smooth">
      <LandingNavbar />
      <HeroOrtus />

      <section id="funcionalidades" className="border-t border-slate-100 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 font-poppins text-3xl font-extrabold tracking-tight text-[#1a1a1a] md:text-4xl">
              Tudo o que você precisa
            </h2>
            <p className="font-poppins font-medium text-slate-500">
              Centralizamos toda a gestão da sua clínica em uma única plataforma intuitiva e poderosa.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <CardRecurso icon={<Calendar size={32} />} titulo="Agenda Inteligente" desc="Controle total dos seus horários, com confirmação de consultas." cor="blue" />
            <CardRecurso icon={<Users size={32} />} titulo="Prontuário Digital" desc="Anamnese estruturada e histórico seguro e acessível." cor="green" />
            <CardRecurso icon={<DollarSign size={32} />} titulo="Controle Financeiro" desc="Fluxo de caixa em tempo real sem planilhas complexas." cor="purple" />
          </div>
        </div>
      </section>

      <section id="precos" className="border-t border-slate-100 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-16 text-center font-poppins text-3xl font-extrabold tracking-tight text-[#1a1a1a] md:text-4xl">
            Planos flexíveis
          </h2>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
            <CardPreco titulo="Básico" valor="97" recursos={['1 Profissional', 'Agenda', 'Prontuário Simples']} />
            <CardPreco destaque titulo="Profissional" valor="197" recursos={['Até 3 Profissionais', 'Financeiro Completo', 'Anamnese Personalizada', 'Suporte Prioritário']} />
            <CardPreco titulo="Clínica" valor="297" recursos={['Profissionais Ilimitados', 'Multi-Clínicas', 'Gestão Avançada', 'API de Integração']} />
          </div>
        </div>
      </section>

      <footer id="contato" className="border-t border-slate-800 bg-slate-900 px-6 py-12 text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <Link href="/" onClick={scrollToTop} className="flex items-center gap-2 opacity-50 grayscale transition-all hover:grayscale-0">
            <img src="/landing/ortus-wordmark.svg" className="h-7" alt="ortus" />
          </Link>
          <div className="flex gap-6 text-sm font-medium">
            <Link href="/termos" className="transition-colors hover:text-white">Termos de Uso</Link>
            <Link href="/privacidade" className="transition-colors hover:text-white">Privacidade</Link>
          </div>
          <p className="text-xs font-bold opacity-30">&copy; 2026 Recode Systems.</p>
        </div>
      </footer>
    </div>
  );
}

function CardRecurso({ icon, titulo, desc, cor }: { icon: ReactNode; titulo: string; desc: string; cor: 'blue' | 'green' | 'purple' }) {
  const cores = { blue: 'bg-blue-50 text-ortus-blue', green: 'bg-emerald-50 text-emerald-600', purple: 'bg-purple-50 text-purple-600' };
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-8">
      <div className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${cores[cor]}`}>{icon}</div>
      <h3 className="mb-3 font-poppins text-xl font-bold text-slate-800">{titulo}</h3>
      <p className="font-poppins font-medium leading-relaxed text-slate-500">{desc}</p>
    </div>
  );
}

function CardPreco({ titulo, valor, recursos, destaque }: { titulo: string; valor: string; recursos: string[]; destaque?: boolean }) {
  return (
    <div className={`flex flex-col rounded-3xl border p-8 ${destaque ? 'z-10 scale-105 border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800'}`}>
      <h3 className={`mb-2 text-sm font-bold uppercase tracking-wider ${destaque ? 'text-sky-300' : 'text-slate-400'}`}>{titulo}</h3>
      <div className="mb-6 flex items-end gap-1">
        <span className="text-4xl font-black">R$ {valor}</span>
        <span className="mb-1 font-bold">/mês</span>
      </div>
      <ul className="mb-8 flex-1 space-y-4">
        {recursos.map((r) => (
          <li key={r} className="flex items-center gap-3 text-sm font-medium">
            <CheckCircle size={18} className={destaque ? 'text-sky-300' : 'text-ortus-blue'} /> {r}
          </li>
        ))}
      </ul>
      <Link
        href={`/checkout?plano=${titulo}&valor=${valor}`}
        className={`w-full rounded-xl py-4 text-center font-bold transition-colors ${destaque ? 'bg-ortus-blue text-white hover:bg-ortus-blueDark' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
      >
        Assinar Agora
      </Link>
    </div>
  );
}
