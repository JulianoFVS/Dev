'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle, Calendar, DollarSign, Users } from 'lucide-react';
import LandingNavbar from '@/components/landing/LandingNavbar';
import HeroOrtus from '@/components/landing/HeroOrtus';
import { PLANOS_VITRINE, type PlanoPublico } from '@/lib/assinaturas';
import { numerosSuporte } from '@/lib/suporte';

export default function LandingPage() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('landing-scroll');
    return () => html.classList.remove('landing-scroll');
  }, []);

  // Planos e preços: a página pinta a vitrine e confirma no servidor, que é
  // quem cobra. `disponivel` = o pagamento pela internet está configurado.
  const [planos, setPlanos] = useState<PlanoPublico[]>(PLANOS_VITRINE);
  const [disponivel, setDisponivel] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelado = false;
    fetch('/api/public/assinatura/planos', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { disponivel?: boolean; planos?: PlanoPublico[] } | null) => {
        if (cancelado) return;
        if (d?.planos?.length) setPlanos(d.planos);
        setDisponivel(d ? d.disponivel === true : false);
      })
      .catch(() => {
        if (!cancelado) setDisponivel(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);
  const contato = numerosSuporte()[0] ?? null;

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-sky-100">
      <LandingNavbar />
      <HeroOrtus />

      <section id="funcionalidades" className="scroll-mt-24 py-24">
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

      <section id="precos" className="scroll-mt-24 border-t border-slate-100 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-16 text-center font-poppins text-3xl font-extrabold tracking-tight text-[#1a1a1a] md:text-4xl">
            Planos flexíveis
          </h2>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
            {planos.map((plano) => (
              <CardPreco
                key={plano.codigo}
                destaque={plano.destaque}
                titulo={plano.nome}
                // Com centavos, sempre duas casas (149,90, como o checkout cobra); sem, só o inteiro (97).
                valor={(plano.valor_centavos / 100).toLocaleString('pt-BR', {
                  minimumFractionDigits: plano.valor_centavos % 100 ? 2 : 0,
                  maximumFractionDigits: 2,
                })}
                recursos={plano.recursos}
                // Sem pagamento configurado a página não oferece assinatura: leva ao contato.
                acao={
                  disponivel === false
                    ? contato
                      ? { rotulo: 'Falar com a gente', href: `https://wa.me/${contato.digitos}`, externo: true }
                      : null
                    : { rotulo: 'Assinar Agora', href: `/checkout?plano=${plano.codigo}`, externo: false }
                }
              />
            ))}
          </div>
        </div>
      </section>

      <footer id="contato" className="scroll-mt-24 border-t border-slate-800 bg-slate-900 px-6 py-12 text-slate-400">
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

function CardPreco({ titulo, valor, recursos, destaque, acao }: { titulo: string; valor: string; recursos: string[]; destaque?: boolean; acao: { rotulo: string; href: string; externo: boolean } | null }) {
  const classeBotao = `w-full rounded-xl py-4 text-center font-bold transition-colors ${destaque ? 'bg-ortus-blue text-white hover:bg-ortus-blueDark' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`;
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
      {acao === null ? (
        <p className={`w-full rounded-xl py-4 text-center text-sm font-bold ${destaque ? 'bg-white/10 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
          Assinatura pela internet em breve
        </p>
      ) : acao.externo ? (
        <a href={acao.href} target="_blank" rel="noopener noreferrer" className={classeBotao}>
          {acao.rotulo}
        </a>
      ) : (
        <Link href={acao.href} className={classeBotao}>
          {acao.rotulo}
        </Link>
      )}
    </div>
  );
}
