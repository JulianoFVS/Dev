const fs = require('fs');
const path = require('path');

console.log('🏗️ Instalando V52: Reestruturação de Pastas (Site na Raiz, Sistema no Dashboard)...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    // Garante que a pasta existe (ex: app/dashboard)
    const dir = path.dirname(caminhoCompleto);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Configurado: ${caminhoRelativo}`);
}

// ======================================================
// 1. LANDING PAGE (Agora na Raiz: app/page.tsx)
// ======================================================
const homePage = `
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
`;

// ======================================================
// 2. DASHBOARD (Agora em: app/dashboard/page.tsx)
// ======================================================
const dashboardPage = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Users, Calendar, DollarSign, ArrowRight, Clock } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ pacientes: 0, agendamentos: 0, faturamento: 0 });
  const [proximos, setProximos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [usuario, setUsuario] = useState<any>(null);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser();
    setUsuario(user);

    if (user) {
        const hoje = new Date().toISOString().split('T')[0];
        
        const { count: countPac } = await supabase.from('pacientes').select('*', { count: 'exact', head: true });
        const { count: countAg } = await supabase.from('agendamentos').select('*', { count: 'exact', head: true }).gte('data_hora', \`\${hoje}T00:00:00\`).lte('data_hora', \`\${hoje}T23:59:59\`);
        
        const { data: agendamentos } = await supabase.from('agendamentos').select('valor_final').eq('status', 'concluido');
        const totalFat = agendamentos?.reduce((acc: any, curr: any) => acc + (curr.valor_final || 0), 0) || 0;

        setStats({ pacientes: countPac || 0, agendamentos: countAg || 0, faturamento: totalFat });

        const { data: prox } = await supabase.from('agendamentos').select('*, pacientes(nome)').gte('data_hora', new Date().toISOString()).order('data_hora', { ascending: true }).limit(4);
        setProximos(prox || []);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4"><div><h1 className="text-3xl font-black text-slate-800 tracking-tight">Olá, Dr(a).</h1><p className="text-slate-500 font-medium">Aqui está o resumo da sua clínica hoje.</p></div><div className="text-right hidden md:block"><p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Link href="/agenda" className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white shadow-xl shadow-blue-200 transition-all hover:shadow-2xl hover:scale-[1.01]"><div className="relative z-10"><div className="mb-4 inline-flex rounded-xl bg-white/20 p-3 backdrop-blur-sm group-hover:bg-white/30 transition-colors"><Calendar size={28} className="text-white" /></div><h3 className="text-2xl font-bold">Acessar Agenda</h3><p className="mt-2 text-blue-100 font-medium max-w-sm">Gerencie consultas, marque como concluído e lance valores.</p><div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur-sm transition-colors group-hover:bg-white group-hover:text-blue-700">Ver Grade <ArrowRight size={16} /></div></div><Calendar className="absolute -bottom-6 -right-6 h-48 w-48 text-white/5 rotate-12 group-hover:rotate-0 transition-transform duration-500" /></Link><Link href="/pacientes" className="group relative overflow-hidden rounded-3xl bg-white border border-slate-100 p-8 text-slate-800 shadow-xl shadow-slate-200/50 transition-all hover:shadow-2xl hover:border-blue-200"><div className="relative z-10"><div className="mb-4 inline-flex rounded-xl bg-blue-50 p-3 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><Users size={28} /></div><h3 className="text-2xl font-bold">Prontuários</h3><p className="mt-2 text-slate-500 font-medium max-w-sm">Consulte o histórico completo e dados de cada paciente.</p><div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-blue-600 group-hover:underline">Ir para Pacientes <ArrowRight size={16} /></div></div></Link></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Users size={24}/></div><div><p className="text-sm font-bold text-slate-400 uppercase">Pacientes</p><p className="text-2xl font-black text-slate-800">{stats.pacientes}</p></div></div><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"><div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Calendar size={24}/></div><div><p className="text-sm font-bold text-slate-400 uppercase">Agendamentos Hoje</p><p className="text-2xl font-black text-slate-800">{stats.agendamentos}</p></div></div><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"><div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><DollarSign size={24}/></div><div><p className="text-sm font-bold text-slate-400 uppercase">Faturamento Mês</p><p className="text-2xl font-black text-slate-800">R$ {stats.faturamento.toFixed(2)}</p></div></div></div>
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"><div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center gap-2"><Clock size={20} className="text-blue-500"/> Próximos Atendimentos</h3><Link href="/agenda" className="text-xs font-bold text-blue-600 hover:underline">Ver todos</Link></div><div className="divide-y divide-slate-50">{proximos.length === 0 ? (<div className="p-8 text-center text-slate-400">Nenhum agendamento futuro encontrado.</div>) : (proximos.map((ag: any) => (<div key={ag.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"><div className="flex items-center gap-4"><div className="flex flex-col items-center justify-center w-12 h-12 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs border border-blue-100"><span>{new Date(ag.data_hora).getDate()}</span><span className="text-[9px] uppercase">{new Date(ag.data_hora).toLocaleString('pt-BR', { month: 'short' }).replace('.','')}</span></div><div><p className="font-bold text-slate-700">{ag.pacientes?.nome}</p><p className="text-xs text-slate-500">{ag.procedimento} • {new Date(ag.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p></div></div><div className="flex items-center gap-2"><span className={\`text-[10px] font-bold px-2 py-1 rounded-md uppercase \${ag.status === 'concluido' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}\`}>{ag.status}</span></div></div>)))}</div></div>
    </div>
  );
}
`;

// ======================================================
// 3. LOGIN (Redirecionando para /dashboard)
// ======================================================
const loginPage = `
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, ShieldCheck } from 'lucide-react';

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

    if (error) {
      setError('Acesso negado. Verifique seus dados.');
      setLoading(false);
    } else {
      // FIX: Redireciona para o Dashboard
      router.push('/dashboard');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-100/40 to-slate-50 z-0"></div>
      <div className="bg-white w-full max-w-md p-10 rounded-3xl shadow-2xl shadow-blue-900/10 border border-white relative z-10 animate-in zoom-in-95 duration-500">
        <div className="flex flex-col items-center mb-10">
            <div className="h-24 w-full flex items-center justify-center mb-2"><img src="/logo.png" alt="Logo" className="h-full w-auto object-contain"/></div>
            <p className="text-slate-400 font-medium text-xs uppercase tracking-widest">Acesso Restrito</p>
        </div>
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold flex items-center gap-2 mb-6 border border-red-100"><ShieldCheck size={18}/> {error}</div>}
        <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-wider">Email</label><div className="relative group"><Mail className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} /><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700 placeholder:text-slate-300" placeholder="seu@email.com" required/></div></div>
            <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-wider">Senha</label><div className="relative group"><Lock className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} /><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700 placeholder:text-slate-300" placeholder="••••••••" required/></div></div>
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex justify-center items-center gap-2 mt-6">{loading ? <Loader2 className="animate-spin" /> : 'Entrar'}</button>
        </form>
    </div></div>
  );
}
`;

// ======================================================
// 4. MENU (Atualizando links para /dashboard)
// ======================================================
const authGuard = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, LogOut, Calendar, Menu, X, DollarSign, Settings, Building2, Bell, Mail, User, Lock, ChevronRight } from 'lucide-react';

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
    
    // Se for rota pública (Site/Termos/Login), não valida
    const rotasPublicas = ['/login', '/', '/site', '/termos'];
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

  // Não renderiza menu nas páginas públicas
  if (['/login', '/', '/site', '/termos'].includes(pathname)) return <>{children}</>;
  
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
        <div className="p-6 pb-2 flex justify-center"><img src="/logo.png" alt="Logo" className="h-16 w-auto object-contain hover:scale-105 transition-transform"/><h1 className="hidden">ORTUS</h1></div>
        <nav className="flex-1 px-4 space-y-1 mt-6"><LinksDoMenu /></nav>
        <div className="p-6 text-center border-t border-slate-50"><p className="text-[10px] text-slate-300 font-medium">v1.0 &copy; 2025</p></div>
      </aside>

      {/* BARRA MOBILE */}
      <div className="md:hidden fixed top-0 w-full bg-white border-b border-slate-200 z-40 px-4 py-3 flex justify-between items-center shadow-sm h-16">
        <img src="/logo.png" alt="Logo" className="h-8 w-auto" />
        <button onClick={() => setMenuMobileAberto(!menuMobileAberto)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">{menuMobileAberto ? <X size={24} /> : <Menu size={24} />}</button>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
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

      {/* MENU MOBILE OVERLAY */}
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
// 5. METADATA E PÁGINA 404 (app/layout.tsx e app/not-found.tsx)
// ======================================================
const layout = `
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ORTUS - Sistema de Gestão Odontológica',
  description: 'Gestão completa para clínicas odontológicas. Agenda, prontuário e financeiro.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
`;

const notFound = `
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-md">
            <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-2xl flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32}/></div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Página não encontrada</h2>
            <p className="text-slate-500 font-medium mb-8">O link que você tentou acessar não existe ou foi removido.</p>
            <Link href="/" className="block w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors">Voltar para o Início</Link>
        </div>
    </div>
  );
}
`;

salvarArquivo('app/page.tsx', homePage);
salvarArquivo('app/dashboard/page.tsx', dashboardPage);
salvarArquivo('app/login/page.tsx', loginPage);
salvarArquivo('components/AuthGuard.tsx', authGuard);
salvarArquivo('app/layout.tsx', layout);
salvarArquivo('app/not-found.tsx', notFound);