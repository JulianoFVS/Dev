const fs = require('fs');
const path = require('path');

console.log('🎨 Instalando V57: Fix do Logo no Checkout e Link na Home...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Corrigido: ${caminhoRelativo}`);
}

// ======================================================
// 1. LANDING PAGE (Logo Clicável) - app/page.tsx
// ======================================================
const landingPage = `
'use client';
import Link from 'next/link';
import { CheckCircle, Calendar, DollarSign, Users, ArrowRight, Star, Menu, X, LayoutDashboard, TrendingUp } from 'lucide-react';
import { useState } from 'react';

export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-100 scroll-smooth">
      
      {/* NAVBAR */}
      <nav className="fixed w-full z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            
            {/* LOGO CLICÁVEL (FIX V57) */}
            <Link href="/" className="flex items-center gap-3 group cursor-pointer">
                <img src="/logo.png" alt="ORTUS" className="h-10 w-auto object-contain group-hover:scale-105 transition-transform"/>
                <span className="font-black text-2xl tracking-tighter text-blue-600 hidden sm:block group-hover:text-blue-700">ORTUS</span>
            </Link>
            
            <div className="hidden md:flex items-center gap-8 font-bold text-sm text-slate-500">
                <a href="#recursos" className="hover:text-blue-600 transition-colors">Recursos</a>
                <a href="#precos" className="hover:text-blue-600 transition-colors">Planos</a>
            </div>

            <div className="hidden md:flex items-center gap-4">
                <Link href="/login" className="text-slate-600 font-bold hover:text-blue-600">Entrar</Link>
                <a href="#precos" className="bg-blue-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 hover:shadow-blue-300 transform hover:-translate-y-0.5">Criar Conta</a>
            </div>

            <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2 text-slate-600">
                {mobileMenu ? <X/> : <Menu/>}
            </button>
        </div>
        
        {mobileMenu && (
            <div className="md:hidden absolute top-20 left-0 w-full bg-white border-b border-slate-100 p-6 flex flex-col gap-4 shadow-xl">
                <a href="#recursos" onClick={() => setMobileMenu(false)} className="font-bold text-slate-600">Recursos</a>
                <a href="#precos" onClick={() => setMobileMenu(false)} className="font-bold text-slate-600">Planos</a>
                <Link href="/login" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-center">Acessar Sistema</Link>
            </div>
        )}
      </nav>

      {/* HERO SECTION */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100 rounded-full blur-3xl opacity-30 -z-10 translate-x-1/2 -translate-y-1/4"></div>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 animate-in slide-in-from-left duration-700">
                <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border border-blue-100">
                    <Star size={12} fill="currentColor"/> O sistema nº 1 para Dentistas
                </div>
                <h1 className="text-5xl md:text-7xl font-black text-slate-900 leading-[1.1] tracking-tight">
                    Gerencie sua clínica com <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">inteligência.</span>
                </h1>
                <p className="text-lg text-slate-500 leading-relaxed max-w-lg font-medium">
                    Agenda, prontuário eletrônico e financeiro completo. Elimine a papelada e foque no que importa: o sorriso do seu paciente.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <a href="#precos" className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-2">
                        Começar Agora <ArrowRight size={20}/>
                    </a>
                    <a href="#recursos" className="bg-white text-slate-600 border border-slate-200 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-slate-50 transition-all flex items-center justify-center">
                        Ver Recursos
                    </a>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                    <span className="flex items-center gap-1"><CheckCircle size={14} className="text-green-500"/> Teste grátis de 7 dias</span>
                    <span className="flex items-center gap-1"><CheckCircle size={14} className="text-green-500"/> Instalação imediata</span>
                </div>
            </div>
            
            {/* DASHBOARD PREVIEW */}
            <div className="relative animate-in zoom-in duration-700 delay-150">
                <div className="bg-slate-900 rounded-3xl p-2 shadow-2xl shadow-blue-900/30 rotate-1 hover:rotate-0 transition-transform duration-500 border border-slate-800">
                    <div className="bg-slate-50 rounded-2xl overflow-hidden aspect-video relative flex">
                        {/* Fake Sidebar */}
                        <div className="w-16 bg-white border-r border-slate-100 flex flex-col items-center py-4 gap-4 hidden sm:flex">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg"></div>
                            <div className="w-8 h-8 bg-blue-50 rounded-lg text-blue-500 flex items-center justify-center"><LayoutDashboard size={16}/></div>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300"><Users size={16}/></div>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300"><Calendar size={16}/></div>
                        </div>
                        {/* Fake Content */}
                        <div className="flex-1 p-4 sm:p-6 space-y-4">
                            <div className="flex justify-between items-center mb-6">
                                <div className="space-y-1">
                                    <div className="h-4 w-32 bg-slate-200 rounded-full"></div>
                                    <div className="h-3 w-48 bg-slate-100 rounded-full"></div>
                                </div>
                                <div className="w-8 h-8 bg-slate-200 rounded-full"></div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-2">
                                    <div className="w-8 h-8 bg-blue-50 rounded-lg"></div>
                                    <div className="h-3 w-16 bg-slate-100 rounded-full"></div>
                                    <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                                </div>
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-2">
                                    <div className="w-8 h-8 bg-emerald-50 rounded-lg"></div>
                                    <div className="h-3 w-16 bg-slate-100 rounded-full"></div>
                                    <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                                </div>
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-2">
                                    <div className="w-8 h-8 bg-purple-50 rounded-lg"></div>
                                    <div className="h-3 w-16 bg-slate-100 rounded-full"></div>
                                    <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 h-24 flex items-center justify-center relative overflow-hidden">
                                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-blue-50 to-transparent opacity-50"></div>
                                <TrendingUp className="text-blue-500 w-full h-12 opacity-20"/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section id="recursos" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">Tudo o que você precisa</h2>
                <p className="text-slate-500 font-medium">Centralizamos toda a gestão da sua clínica em uma única plataforma intuitiva e poderosa.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <CardRecurso 
                    icon={<Calendar size={32}/>}
                    titulo="Agenda Inteligente"
                    desc="Controle total dos seus horários, com confirmação de consultas e histórico de atendimentos integrado."
                    cor="blue"
                />
                <CardRecurso 
                    icon={<Users size={32}/>}
                    titulo="Prontuário Digital"
                    desc="Anamnese estruturada, histórico de procedimentos e evolução clínica. Tudo seguro e acessível."
                    cor="green"
                />
                <CardRecurso 
                    icon={<DollarSign size={32}/>}
                    titulo="Controle Financeiro"
                    desc="Fluxo de caixa em tempo real. Saiba exatamente quanto entra e sai da sua clínica sem planilhas complexas."
                    cor="purple"
                />
            </div>
        </div>
      </section>

      {/* PREÇOS */}
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

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <Link href="/" className="flex items-center gap-2 opacity-50 grayscale hover:grayscale-0 transition-all cursor-pointer">
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
    return (
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
            <div className={\`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 \${cores[cor]}\`}>{icon}</div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">{titulo}</h3>
            <p className="text-slate-500 leading-relaxed font-medium">{desc}</p>
        </div>
    );
}

function CardPreco({ titulo, valor, recursos, destaque }: any) {
    return (
        <div className={\`p-8 rounded-3xl border flex flex-col \${destaque ? 'bg-slate-900 text-white border-slate-800 shadow-2xl scale-105 z-10' : 'bg-white text-slate-800 border-slate-200 shadow-sm'}\`}>
            <h3 className={\`font-bold text-sm uppercase tracking-wider mb-2 \${destaque ? 'text-blue-400' : 'text-slate-400'}\`}>{titulo}</h3>
            <div className="flex items-end gap-1 mb-6"><span className="text-4xl font-black">R$ {valor}</span><span className="font-bold mb-1">/mês</span></div>
            <ul className="space-y-4 mb-8 flex-1">{recursos.map((r: string) => (<li key={r} className="flex items-center gap-3 font-medium text-sm"><CheckCircle size={18} className={destaque ? 'text-blue-400' : 'text-blue-600'}/> {r}</li>))}</ul>
            <Link href={\`/checkout?plano=\${titulo}&valor=\${valor}\`} className={\`w-full py-4 rounded-xl font-bold text-center transition-all \${destaque ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/50' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}\`}>Assinar Agora</Link>
        </div>
    );
}
`;

// ======================================================
// 2. CHECKOUT (Logo com Fundo Branco) - app/checkout/page.tsx
// ======================================================
const checkoutPage = `
'use client';
import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Lock, CreditCard, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const plano = searchParams.get('plano') || 'Profissional';
  const valor = searchParams.get('valor') || '197';
  
  const [loading, setLoading] = useState(false);
  const [etapa, setEtapa] = useState('pagamento');

  async function processarPagamento(e: any) {
      e.preventDefault();
      setLoading(true);
      setTimeout(() => {
          setLoading(false);
          setEtapa('sucesso');
          setTimeout(() => {
             router.push(\`/cadastro?plano=\${plano}&status=pago\`);
          }, 2000);
      }, 2000);
  }

  if (etapa === 'sucesso') {
      return (
          <div className="min-h-screen bg-white flex items-center justify-center p-6">
              <div className="text-center space-y-4 animate-in zoom-in">
                  <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle size={48}/></div>
                  <h1 className="text-3xl font-black text-slate-800">Pagamento Aprovado!</h1>
                  <p className="text-slate-500 font-medium">Redirecionando para configurar sua conta...</p>
                  <Loader2 className="animate-spin mx-auto text-blue-600" size={24}/>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <div className="w-full md:w-1/2 bg-slate-900 text-white p-8 md:p-20 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600 rounded-full blur-3xl opacity-20 translate-x-1/2 -translate-y-1/2"></div>
          <div>
              <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-10 font-bold"><ArrowLeft size={18}/> Voltar</Link>
              
              {/* FIX DO LOGO: FUNDO BRANCO PARA CONTRASTE */}
              <div className="flex items-center gap-3 mb-6 bg-white/10 p-3 rounded-xl w-fit backdrop-blur-sm border border-white/10">
                  <img src="/logo.png" className="h-8 w-auto object-contain"/>
                  <span className="font-bold text-lg tracking-widest text-white">ORTUS</span>
              </div>

              <p className="text-slate-400 font-medium uppercase tracking-wider text-xs mb-2">Você está assinando:</p>
              <h1 className="text-4xl font-black mb-4">Plano {plano}</h1>
              <div className="flex items-end gap-1 mb-8"><span className="text-5xl font-bold">R$ {valor}</span><span className="text-slate-400 font-medium mb-2">/mês</span></div>
              <ul className="space-y-3 text-slate-300 font-medium">
                  <li className="flex items-center gap-3"><CheckCircle size={18} className="text-blue-400"/> Acesso imediato ao sistema</li>
                  <li className="flex items-center gap-3"><CheckCircle size={18} className="text-blue-400"/> Cancelamento a qualquer momento</li>
                  <li className="flex items-center gap-3"><CheckCircle size={18} className="text-blue-400"/> 7 dias de garantia</li>
              </ul>
          </div>
          <div className="mt-12 pt-8 border-t border-slate-800 text-xs text-slate-500 flex items-center gap-2"><ShieldCheck size={14}/> Pagamento 100% seguro via SSL</div>
      </div>
      <div className="w-full md:w-1/2 bg-white p-8 md:p-20 flex items-center justify-center">
          <div className="w-full max-w-md space-y-8">
              <div><h2 className="text-2xl font-black text-slate-800">Dados de Pagamento</h2><p className="text-slate-500 font-medium">Complete seus dados para liberar o acesso.</p></div>
              <form onSubmit={processarPagamento} className="space-y-5">
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Nome no Cartão</label><input required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="COMO NO CARTAO" /></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Número do Cartão</label><div className="relative"><CreditCard className="absolute left-4 top-4 text-slate-300" size={20}/><input required maxLength={19} className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="0000 0000 0000 0000" /></div></div>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Validade</label><input required maxLength={5} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="MM/AA" /></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">CVV</label><input required maxLength={3} type="password" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="123" /></div>
                  </div>
                  <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex justify-center items-center gap-2 mt-6">{loading ? <Loader2 className="animate-spin" /> : \`Pagar R$ \${valor}\`}</button>
                  <div className="flex justify-center gap-4 opacity-50 grayscale"><img src="https://upload.wikimedia.org/wikipedia/commons/0/04/Visa.svg" className="h-6"/><img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" className="h-6"/></div>
              </form>
          </div>
      </div>
    </div>
  );
}

export default function Checkout() {
  return (
    <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600" size={40}/></div>}>
        <CheckoutContent />
    </Suspense>
  );
}
`;

salvarArquivo('app/page.tsx', landingPage);
salvarArquivo('app/checkout/page.tsx', checkoutPage);