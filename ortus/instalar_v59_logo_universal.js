const fs = require('fs');
const path = require('path');

console.log('🧭 Instalando V59: Logo Clicável em Todas as Telas (Login, Checkout, Sistema)...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Corrigido: ${caminhoRelativo}`);
}

// ======================================================
// 1. AUTH GUARD (Sistema Interno - Ajuste Z-Index e Link)
// ======================================================
const authGuard = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, LogOut, Calendar, Menu, X, DollarSign, Settings, Building2, Bell, Mail, User, ChevronRight } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [notificacoesCount, setNotificacoesCount] = useState(0);
  
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { validarSessao(); }, [pathname]);

  async function validarSessao() {
    const { data: { session } } = await supabase.auth.getSession();
    const rotasPublicas = ['/login', '/', '/site', '/termos', '/checkout', '/cadastro'];
    if (rotasPublicas.includes(pathname)) { setLoading(false); return; }

    if (!session) { router.push('/login'); return; }
    
    if (session) {
        setSession(session);
        const { data: prof } = await supabase.from('profissionais').select('*').eq('user_id', session.user.id).single();
        setPerfil(prof);
        const { count } = await supabase.from('notificacoes').select('*', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('lida', false);
        setNotificacoesCount(count || 0);
    }
    setLoading(false);
  }

  async function handleLogout() {
      await supabase.auth.signOut();
      router.push('/login');
  }

  if (['/login', '/', '/site', '/termos', '/checkout', '/cadastro'].includes(pathname)) return <>{children}</>;
  if (loading) return <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-blue-600 animate-pulse"><Building2 size={40}/></div>;
  if (!session) return null;

  const isAdmin = perfil?.nivel_acesso === 'admin';

  const LinksDoMenu = () => (
    <>
      <Link href="/dashboard" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 \${pathname === '/dashboard' ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><LayoutDashboard size={20} /> Dashboard</Link>
      <Link href="/agenda" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 \${pathname.includes('/agenda') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><Calendar size={20} /> Agenda</Link>
      <Link href="/pacientes" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 \${pathname.includes('/pacientes') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><Users size={20} /> Pacientes</Link>
      {isAdmin ? (<><Link href="/financeiro" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 \${pathname.includes('/financeiro') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><DollarSign size={20} /> Financeiro</Link><Link href="/configuracoes" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 \${pathname.includes('/configuracoes') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><Settings size={20} /> Ajustes</Link></>) : null}
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* SIDEBAR DESKTOP */}
      <aside className="w-64 bg-white border-r border-slate-200 fixed h-full hidden md:flex flex-col z-30 shadow-sm">
        <div className="p-6 pb-2 flex justify-center">
            {/* LOGO LINK PARA DASHBOARD */}
            <Link href="/dashboard" className="hover:opacity-80 transition-opacity cursor-pointer">
                <img src="/logo.png" alt="Logo" className="h-16 w-auto object-contain hover:scale-105 transition-transform"/>
            </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1 mt-6"><LinksDoMenu /></nav>
        <div className="p-6 text-center border-t border-slate-50"><p className="text-[10px] text-slate-300 font-medium">v1.0 &copy; 2025</p></div>
      </aside>

      {/* BARRA MOBILE - LOGO CLICÁVEL */}
      <div className="md:hidden fixed top-0 w-full bg-white border-b border-slate-200 z-50 px-4 py-3 flex justify-between items-center shadow-sm h-16">
        <Link href="/dashboard" className="z-50 cursor-pointer active:scale-95 transition-transform">
            <img src="/logo.png" alt="Logo" className="h-8 w-auto" />
        </Link>
        <button onClick={() => setMenuMobileAberto(!menuMobileAberto)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">{menuMobileAberto ? <X size={24} /> : <Menu size={24} />}</button>
      </div>

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen transition-all pt-16 md:pt-0">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-end px-6 gap-3 sticky top-16 md:top-0 z-20 shadow-sm/50 backdrop-blur-sm bg-white/90">
            <div className="flex items-center gap-1 border-r border-slate-100 pr-3 mr-1">
                <Link href="/inbox?tab=mensagens" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all relative" title="Mensagens"><Mail size={20}/></Link>
                <Link href="/inbox?tab=alertas" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all relative" title="Alertas"><Bell size={20}/>{notificacoesCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}</Link>
            </div>
            <Link href="/perfil" className="flex items-center gap-3 pl-2 py-1 pr-2 rounded-xl hover:bg-slate-50 transition-colors group border border-transparent hover:border-slate-100">
                <div className="text-right hidden sm:block"><p className="text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors">{perfil?.nome}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-right">{perfil?.nivel_acesso === 'admin' ? 'Admin' : 'Dr(a).'}</p></div>
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full flex items-center justify-center shadow-md shadow-blue-200 overflow-hidden border-2 border-white ring-1 ring-slate-100">{perfil?.foto_url ? <img src={perfil.foto_url} className="w-full h-full object-cover"/> : <User size={18}/>}</div>
            </Link>
            <button onClick={handleLogout} className="ml-1 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100 hidden md:block" title="Sair"><LogOut size={20}/></button>
        </header>
        <div className="p-4 md:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">{children}</div>
      </main>

      {menuMobileAberto && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm animate-in fade-in" onClick={() => setMenuMobileAberto(false)}>
            <div className="absolute right-0 top-0 h-full w-[280px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-black text-slate-800 text-lg">Menu</h3>
                    <button onClick={() => setMenuMobileAberto(false)} className="p-2 bg-white rounded-full text-slate-400 shadow-sm border"><X size={20}/></button>
                </div>
                <div className="p-5 border-b border-slate-100 bg-white">
                    <Link href="/perfil" onClick={() => setMenuMobileAberto(false)} className="flex items-center gap-4 group">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center border-2 border-white shadow-md overflow-hidden">{perfil?.foto_url ? <img src={perfil.foto_url} className="w-full h-full object-cover"/> : <User size={24}/>}</div>
                        <div className="flex-1"><p className="font-bold text-slate-800 leading-tight group-hover:text-blue-700">{perfil?.nome}</p><p className="text-xs text-slate-400 font-bold uppercase">{perfil?.nivel_acesso === 'admin' ? 'Administrador' : 'Profissional'}</p></div><ChevronRight size={16} className="text-slate-300"/>
                    </Link>
                </div>
                <div className="p-4 space-y-1 flex-1 overflow-y-auto"><LinksDoMenu /></div>
                <div className="p-5 border-t border-slate-100 bg-slate-50"><button onClick={handleLogout} className="flex w-full items-center justify-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl font-bold bg-white border border-slate-200 shadow-sm transition-all active:scale-95"><LogOut size={18} /> Sair do Sistema</button></div>
            </div>
        </div>
      )}
    </div>
  );
}
`;

// ======================================================
// 2. LOGIN (Logo Clicável -> /)
// ======================================================
const loginPage = `
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError('Acesso negado. Verifique seus dados.'); setLoading(false); } 
    else { router.push('/dashboard'); router.refresh(); }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <Link href="/" className="absolute top-6 left-6 flex items-center gap-2 text-slate-500 font-bold hover:text-blue-600 transition-colors z-20"><ArrowLeft size={20}/> Voltar para o site</Link>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-100/40 to-slate-50 z-0"></div>
      <div className="bg-white w-full max-w-md p-10 rounded-3xl shadow-2xl shadow-blue-900/10 border border-white relative z-10 animate-in zoom-in-95 duration-500">
        <div className="flex flex-col items-center mb-10">
            {/* LOGO CLICÁVEL */}
            <Link href="/" className="h-24 w-full flex items-center justify-center mb-2 hover:scale-105 transition-transform cursor-pointer">
                <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain"/>
            </Link>
            <p className="text-slate-400 font-medium text-xs uppercase tracking-widest">Acesso Restrito</p>
        </div>
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold flex items-center gap-2 mb-6 border border-red-100"><ShieldCheck size={18}/> {error}</div>}
        <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-wider">Email</label><div className="relative group"><Mail className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} /><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700 placeholder:text-slate-300" placeholder="seu@email.com" required/></div></div>
            <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-wider">Senha</label><div className="relative group"><Lock className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} /><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700 placeholder:text-slate-300" placeholder="••••••••" required/></div></div>
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex justify-center items-center gap-2 mt-6">{loading ? <Loader2 className="animate-spin" /> : 'Entrar no Sistema'}</button>
        </form>
        <p className="text-center mt-6 text-xs text-slate-400 font-medium">Ainda não tem conta? <Link href="/#precos" className="text-blue-600 hover:underline">Assinar agora</Link></p>
    </div></div>
  );
}
`;

// ======================================================
// 3. CHECKOUT (Logo Clicável -> /)
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
      e.preventDefault(); setLoading(true);
      setTimeout(() => { setLoading(false); setEtapa('sucesso'); setTimeout(() => { router.push(\`/cadastro?plano=\${plano}&status=pago\`); }, 2000); }, 2000);
  }

  if (etapa === 'sucesso') return (<div className="min-h-screen bg-white flex items-center justify-center p-6"><div className="text-center space-y-4 animate-in zoom-in"><div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle size={48}/></div><h1 className="text-3xl font-black text-slate-800">Pagamento Aprovado!</h1><p className="text-slate-500 font-medium">Redirecionando para configurar sua conta...</p><Loader2 className="animate-spin mx-auto text-blue-600" size={24}/></div></div>);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <div className="w-full md:w-1/2 bg-slate-900 text-white p-8 md:p-20 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600 rounded-full blur-3xl opacity-20 translate-x-1/2 -translate-y-1/2"></div>
          <div>
              <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-10 font-bold"><ArrowLeft size={18}/> Voltar</Link>
              
              {/* LOGO CLICÁVEL COM FUNDO */}
              <Link href="/" className="flex items-center gap-3 mb-6 bg-white/10 p-3 rounded-xl w-fit backdrop-blur-sm border border-white/10 hover:bg-white/20 transition-colors cursor-pointer">
                  <img src="/logo.png" className="h-8 w-auto object-contain"/>
                  <span className="font-bold text-lg tracking-widest text-white">ORTUS</span>
              </Link>

              <p className="text-slate-400 font-medium uppercase tracking-wider text-xs mb-2">Você está assinando:</p>
              <h1 className="text-4xl font-black mb-4">Plano {plano}</h1>
              <div className="flex items-end gap-1 mb-8"><span className="text-5xl font-bold">R$ {valor}</span><span className="text-slate-400 font-medium mb-2">/mês</span></div>
              <ul className="space-y-3 text-slate-300 font-medium"><li className="flex items-center gap-3"><CheckCircle size={18} className="text-blue-400"/> Acesso imediato ao sistema</li><li className="flex items-center gap-3"><CheckCircle size={18} className="text-blue-400"/> Cancelamento a qualquer momento</li><li className="flex items-center gap-3"><CheckCircle size={18} className="text-blue-400"/> 7 dias de garantia</li></ul>
          </div>
          <div className="mt-12 pt-8 border-t border-slate-800 text-xs text-slate-500 flex items-center gap-2"><ShieldCheck size={14}/> Pagamento 100% seguro via SSL</div>
      </div>
      <div className="w-full md:w-1/2 bg-white p-8 md:p-20 flex items-center justify-center">
          <div className="w-full max-w-md space-y-8">
              <div><h2 className="text-2xl font-black text-slate-800">Dados de Pagamento</h2><p className="text-slate-500 font-medium">Complete seus dados para liberar o acesso.</p></div>
              <form onSubmit={processarPagamento} className="space-y-5">
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Nome no Cartão</label><input required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="COMO NO CARTAO" /></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Número do Cartão</label><div className="relative"><CreditCard className="absolute left-4 top-4 text-slate-300" size={20}/><input required maxLength={19} className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="0000 0000 0000 0000" /></div></div>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Validade</label><input required maxLength={5} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="MM/AA" /></div><div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">CVV</label><input required maxLength={3} type="password" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="123" /></div></div>
                  <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex justify-center items-center gap-2 mt-6">{loading ? <Loader2 className="animate-spin" /> : \`Pagar R$ \${valor}\`}</button>
              </form>
          </div>
      </div>
    </div>
  );
}

export default function Checkout() { return (<Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600" size={40}/></div>}><CheckoutContent /></Suspense>); }
`;

salvarArquivo('components/AuthGuard.tsx', authGuard);
salvarArquivo('app/login/page.tsx', loginPage);
salvarArquivo('app/checkout/page.tsx', checkoutPage);