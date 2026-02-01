'use client';
import Link from 'next/link';
import { CheckCircle, Calendar, DollarSign, Users, ArrowRight, Star, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-100 scroll-smooth">
      {/* NAVBAR */}
      <nav className="fixed w-full z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <img src="/logo.png" alt="ORTUS" className="h-10 w-auto object-contain"/>
                <span className="font-black text-2xl tracking-tighter text-blue-600 hidden sm:block">ORTUS</span>
            </div>
            <div className="hidden md:flex items-center gap-8 font-bold text-sm text-slate-500">
                <a href="#recursos" className="hover:text-blue-600 transition-colors">Recursos</a>
                <a href="#precos" className="hover:text-blue-600 transition-colors">Planos</a>
                <Link href="/termos" className="hover:text-blue-600 transition-colors">Privacidade</Link>
            </div>
            <div className="hidden md:flex items-center gap-4">
                <Link href="/login" className="text-slate-600 font-bold hover:text-blue-600">Área do Cliente</Link>
                <Link href="/login" className="bg-blue-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 hover:shadow-blue-300 transform hover:-translate-y-0.5">Acessar Sistema</Link>
            </div>
            <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2 text-slate-600">{mobileMenu ? <X/> : <Menu/>}</button>
        </div>
        {mobileMenu && (
            <div className="md:hidden absolute top-20 left-0 w-full bg-white border-b border-slate-100 p-6 flex flex-col gap-4 shadow-xl">
                <a href="#recursos" onClick={() => setMobileMenu(false)} className="font-bold text-slate-600">Recursos</a>
                <Link href="/login" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-center">Entrar</Link>
            </div>
        )}
      </nav>

      {/* HERO */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100 rounded-full blur-3xl opacity-30 -z-10 translate-x-1/2 -translate-y-1/4"></div>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 animate-in slide-in-from-left duration-700">
                <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border border-blue-100"><Star size={12} fill="currentColor"/> Software Odontológico</div>
                <h1 className="text-5xl md:text-7xl font-black text-slate-900 leading-[1.1] tracking-tight">Sua clínica, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">organizada.</span></h1>
                <p className="text-lg text-slate-500 leading-relaxed max-w-lg font-medium">Agenda, prontuário e financeiro em um só lugar. O sistema feito para dentistas que querem crescer.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Link href="/login" className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-2">Começar Agora <ArrowRight size={20}/></Link>
                </div>
            </div>
            <div className="relative animate-in zoom-in duration-700 delay-150">
                <div className="bg-slate-900 rounded-3xl p-2 shadow-2xl shadow-blue-900/20 rotate-2 hover:rotate-0 transition-transform duration-500">
                    <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 aspect-video flex items-center justify-center relative">
                        <div className="text-center"><p className="text-slate-500 font-bold text-sm uppercase tracking-widest mb-2">Sistema Ortus</p><h3 className="text-white text-2xl font-black">Dashboard Preview</h3></div>
                    </div>
                </div>
            </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section id="recursos" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm"><div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-blue-50 text-blue-600"><Calendar size={32}/></div><h3 className="text-xl font-bold text-slate-800 mb-3">Agenda Inteligente</h3><p className="text-slate-500 font-medium">Controle total dos horários e confirmações.</p></div>
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm"><div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-emerald-50 text-emerald-600"><Users size={32}/></div><h3 className="text-xl font-bold text-slate-800 mb-3">Prontuário Digital</h3><p className="text-slate-500 font-medium">Anamnese, histórico e evolução clínica.</p></div>
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm"><div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-purple-50 text-purple-600"><DollarSign size={32}/></div><h3 className="text-xl font-bold text-slate-800 mb-3">Financeiro</h3><p className="text-slate-500 font-medium">Fluxo de caixa e controle de despesas.</p></div>
            </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2"><img src="/logo.png" className="h-8 opacity-50 grayscale"/><span className="font-bold text-white">ORTUS</span></div>
            <p className="text-xs font-bold opacity-30">&copy; 2025 Recode Systems.</p>
        </div>
      </footer>
    </div>
  );
}