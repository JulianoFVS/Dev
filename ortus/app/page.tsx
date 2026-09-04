'use client';
import Link from 'next/link';
import { CheckCircle, Calendar, DollarSign, Users } from 'lucide-react';
import LandingNavbar from '@/components/landing/LandingNavbar';
import HeroOrtus from '@/components/landing/HeroOrtus';

export default function LandingPage() {
  // Função para rolar ao topo suavemente
  const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#f8fbff] font-sans text-slate-900 selection:bg-blue-100 scroll-smooth">
      
      <LandingNavbar />

      <HeroOrtus />

      <section id="funcionalidades" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">Tudo o que você precisa</h2>
                <p className="text-slate-500 font-medium">Centralizamos toda a gestão da sua clínica em uma única plataforma intuitiva e poderosa.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <CardRecurso icon={<Calendar size={32}/>} titulo="Agenda Inteligente" desc="Controle total dos seus horários, com confirmação de consultas." cor="blue"/>
                <CardRecurso icon={<Users size={32}/>} titulo="Prontuário Digital" desc="Anamnese estruturada e histórico seguro e acessível." cor="green"/>
                <CardRecurso icon={<DollarSign size={32}/>} titulo="Controle Financeiro" desc="Fluxo de caixa em tempo real sem planilhas complexas." cor="purple"/>
            </div>
        </div>
      </section>

      <section id="precos" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-16 text-center">Planos flexíveis</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <CardPreco titulo="Básico" valor="97" recursos={['1 Profissional', 'Agenda', 'Prontuário Simples']} />
                <CardPreco destaque titulo="Profissional" valor="197" recursos={['Até 3 Profissionais', 'Financeiro Completo', 'Anamnese Personalizada', 'Suporte Prioritário']} />
                <CardPreco titulo="Clínica" valor="297" recursos={['Profissionais Ilimitados', 'Multi-Clínicas', 'Gestão Avançada', 'API de Integração']} />
            </div>
        </div>
      </section>

      <footer id="contato" className="bg-slate-900 text-slate-400 py-12 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <Link href="/" onClick={scrollToTop} className="flex items-center gap-2 opacity-50 grayscale hover:grayscale-0 transition-all cursor-pointer">
                <img src="/logo.png" className="h-8"/>
                <span className="font-bold text-white">ORTUS</span>
            </Link>
            <div className="text-sm font-medium flex gap-6">
                <Link href="/termos" className="hover:text-white transition-colors">Termos de Uso</Link>
                <Link href="/termos" className="hover:text-white transition-colors">Privacidade</Link>
            </div>
            <p className="text-xs font-bold opacity-30">&copy; 2025 Recode Systems.</p>
        </div>
      </footer>
    </div>
  );
}

function CardRecurso({ icon, titulo, desc, cor }: any) {
    const cores: any = { blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600', purple: 'bg-purple-50 text-purple-600' };
    return (<div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1"><div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${cores[cor]}`}>{icon}</div><h3 className="text-xl font-bold text-slate-800 mb-3">{titulo}</h3><p className="text-slate-500 leading-relaxed font-medium">{desc}</p></div>);
}

function CardPreco({ titulo, valor, recursos, destaque }: any) {
    return (<div className={`p-8 rounded-3xl border flex flex-col ${destaque ? 'bg-slate-900 text-white border-slate-800 shadow-2xl scale-105 z-10' : 'bg-white text-slate-800 border-slate-200 shadow-sm'}`}><h3 className={`font-bold text-sm uppercase tracking-wider mb-2 ${destaque ? 'text-blue-400' : 'text-slate-400'}`}>{titulo}</h3><div className="flex items-end gap-1 mb-6"><span className="text-4xl font-black">R$ {valor}</span><span className="font-bold mb-1">/mês</span></div><ul className="space-y-4 mb-8 flex-1">{recursos.map((r: string) => (<li key={r} className="flex items-center gap-3 font-medium text-sm"><CheckCircle size={18} className={destaque ? 'text-blue-400' : 'text-blue-600'}/> {r}</li>))}</ul><Link href={`/checkout?plano=${titulo}&valor=${valor}`} className={`w-full py-4 rounded-xl font-bold text-center transition-all ${destaque ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/50' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}`}>Assinar Agora</Link></div>);
}