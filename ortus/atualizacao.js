const fs = require('fs');
const path = require('path');

console.log('🚑 Restaurando sistema (Login, AuthGuard e Seleção) para versão estável...');

function salvarArquivo(caminhoRelativo, conteudo) {
    try {
        const caminhoCompleto = path.join(__dirname, caminhoRelativo);
        const dir = path.dirname(caminhoCompleto);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(caminhoCompleto, conteudo.trim());
        console.log(`✅ Arquivo restaurado: ${caminhoRelativo}`);
    } catch (err) {
        console.error(`❌ Erro ao salvar ${caminhoRelativo}:`, err.message);
    }
}

// 1. LOGIN: Padrão (Redireciona para Dashboard)
const loginContent = `
'use client';
import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, ShieldCheck, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogin(e: FormEvent) {
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
            <Link href="/" className="h-24 w-full flex items-center justify-center mb-2 hover:scale-105 transition-transform cursor-pointer">
                <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain"/>
            </Link>
            <p className="text-slate-400 font-medium text-xs uppercase tracking-widest">Acesso Restrito</p>
        </div>
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold flex items-center gap-2 mb-6 border border-red-100"><ShieldCheck size={18}/> {error}</div>}
        <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-wider">Email</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700 placeholder:text-slate-300" placeholder="seu@email.com" required/>
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-wider">Senha</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700 placeholder:text-slate-300" 
                  placeholder="••••••••" 
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-3.5 text-slate-300 hover:text-blue-500 transition-colors focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex justify-center items-center gap-2 mt-6">{loading ? <Loader2 className="animate-spin" /> : 'Entrar no Sistema'}</button>
        </form>
        <p className="text-center mt-6 text-xs text-slate-400 font-medium">Ainda não tem conta? <Link href="/#precos" className="text-blue-600 hover:underline">Assinar agora</Link></p>
    </div></div>
  );
}
`;

// 2. AUTHGUARD: Corrigido (Sem Loop, com ícones certos e Admin vendo tudo)
const authGuardContent = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
    LayoutDashboard, Users, LogOut, Calendar, Menu, X, DollarSign, 
    Settings, Building2, Bell, Mail, User, ChevronRight, ChevronsUpDown, 
    Check, Smile, ChevronLeft, Globe
} from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [menuRecolhido, setMenuRecolhido] = useState(false);
  const [minhasClinicas, setMinhasClinicas] = useState<any[]>([]);
  const [clinicaAtual, setClinicaAtual] = useState<any>(null);
  const [menuClinicaAberto, setMenuClinicaAberto] = useState(false);
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
        if (prof) {
            setPerfil(prof);
            
            let lista: any[] = [];
            // ADMIN: Busca todas as clínicas do sistema
            if (prof.nivel_acesso === 'admin') {
                const { data: todas } = await supabase.from('clinicas').select('id, nome');
                if (todas) lista = todas;
            } else {
                // COMUM: Busca apenas vinculadas
                const { data: vinculos } = await supabase.from('profissionais_clinicas').select('clinica_id, clinicas(id, nome)').eq('profissional_id', prof.id);
                if (vinculos) lista = vinculos.map((v: any) => v.clinicas);
            }

            if (lista.length > 0) {
                const todasOption = { id: 'todas', nome: 'Todas as Clínicas' };
                const listaCompleta = [todasOption, ...lista];
                
                setMinhasClinicas(listaCompleta);
                
                const salva = localStorage.getItem('ortus_clinica_id');
                const atual = listaCompleta.find((c: any) => c.id.toString() === salva) || todasOption;
                
                setClinicaAtual(atual);
                localStorage.setItem('ortus_clinica_id', atual.id.toString());
            }
        }
        const { count } = await supabase.from('notificacoes').select('*', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('lida', false);
        setNotificacoesCount(count || 0);
    }
    setLoading(false);
  }

  function trocarClinica(clinica: any) {
      setClinicaAtual(clinica);
      localStorage.setItem('ortus_clinica_id', clinica.id.toString());
      setMenuClinicaAberto(false);
      window.location.reload();
  }

  async function handleLogout() {
      await supabase.auth.signOut();
      localStorage.removeItem('ortus_clinica_id');
      router.push('/login');
  }

  if (['/login', '/', '/site', '/termos', '/checkout', '/cadastro'].includes(pathname)) return <>{children}</>;
  if (loading) return <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-blue-600 animate-pulse"><Building2 size={40}/></div>;
  if (!session) return null;

  const isAdmin = perfil?.nivel_acesso === 'admin';

  const NavItem = ({ href, icon, label }: { href: string, icon: any, label: string }) => {
      const active = pathname.includes(href) || (href === '/dashboard' && pathname === '/dashboard');
      return (
        <Link href={href} onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-3 py-3 rounded-xl transition-all mb-1 group relative \${active ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'} \${menuRecolhido ? 'justify-center' : ''}\`}>
            <span className={\`transition-transform \${!menuRecolhido && 'group-hover:scale-110'}\`}>{icon}</span>
            {!menuRecolhido && <span>{label}</span>}
            {menuRecolhido && (<div className="absolute left-full ml-2 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">{label}</div>)}
        </Link>
      );
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <aside className={\`bg-white border-r border-slate-200 fixed h-full hidden md:flex flex-col z-30 shadow-sm transition-all duration-300 \${menuRecolhido ? 'w-20' : 'w-64'}\`}>
        <div className={\`h-20 flex items-center border-b border-slate-50 \${menuRecolhido ? 'justify-center' : 'px-6'}\`}>
            <Link href="/dashboard" className="cursor-pointer hover:opacity-80 transition-opacity"><img src="/logo.png" alt="Ortus Logo" className="h-10 w-auto object-contain"/></Link>
        </div>
        
        <div className="px-3 mt-6 mb-2">
            <div className="relative">
                <button onClick={() => !menuRecolhido && setMenuClinicaAberto(!menuClinicaAberto)} className={\`w-full flex items-center p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-300 transition-all group \${menuRecolhido ? 'justify-center bg-transparent border-transparent' : 'justify-between'}\`}>
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className={\`w-9 h-9 rounded-lg flex-none flex items-center justify-center border shadow-sm transition-colors \${clinicaAtual?.id === 'todas' ? 'bg-slate-800 text-white border-slate-900 shadow-md ring-2 ring-slate-100' : 'bg-white text-blue-600 border-slate-200'}\`}>
                            {clinicaAtual?.id === 'todas' ? <Globe size={18}/> : <Building2 size={18}/>}
                        </div>
                        {!menuRecolhido && (
                            <div className="text-left truncate">
                                <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-0.5">Clínica Atual</p>
                                <p className="text-sm font-bold text-slate-800 truncate w-28">{clinicaAtual?.nome || 'Selecione'}</p>
                            </div>
                        )}
                    </div>
                    {!menuRecolhido && <ChevronsUpDown size={16} className="text-slate-400 group-hover:text-blue-500"/>}
                </button>
                
                {menuClinicaAberto && !menuRecolhido && (
                    <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                        <p className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 border-b border-slate-100">Trocar Unidade</p>
                        {minhasClinicas.map(c => (
                            <button key={c.id} onClick={() => trocarClinica(c)} className={\`w-full text-left px-4 py-3 text-sm font-bold flex items-center justify-between border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors \${c.id === 'todas' ? 'text-slate-900 bg-slate-50/50 hover:bg-slate-100' : 'text-slate-600'}\`}>
                                <div className="flex items-center gap-2">
                                    {c.id === 'todas' && <Globe size={14} className="text-slate-600"/>}
                                    {c.nome}
                                </div>
                                {clinicaAtual?.id === c.id && <Check size={16} className="text-blue-600"/>}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
            <NavItem href="/dashboard" icon={<LayoutDashboard size={22}/>} label="Visão Geral" />
            <NavItem href="/agenda" icon={<Calendar size={22}/>} label="Agenda" />
            <NavItem href="/pacientes" icon={<Users size={22}/>} label="Pacientes" />
            <NavItem href="/proteses" icon={<Smile size={22}/>} label="Próteses" />
            {isAdmin && (<><div className="my-2 border-t border-slate-100 mx-2"></div><NavItem href="/financeiro" icon={<DollarSign size={22}/>} label="Financeiro" /><NavItem href="/configuracoes" icon={<Settings size={22}/>} label="Ajustes" /></>)}
        </nav>

        <button onClick={() => setMenuRecolhido(!menuRecolhido)} className="absolute top-24 -right-3 bg-white border border-slate-200 shadow-sm p-1 rounded-full text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-all z-50 hidden md:flex items-center justify-center w-6 h-6">{menuRecolhido ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}</button>
        <div className="p-4 border-t border-slate-50">{!menuRecolhido ? (<p className="text-[10px] text-center text-slate-300 font-medium">v1.0 &copy; 2025</p>) : (<div className="w-1 h-1 bg-slate-300 rounded-full mx-auto"></div>)}</div>
      </aside>

      <div className="md:hidden fixed top-0 w-full bg-white border-b border-slate-200 z-50 px-4 py-3 flex justify-between items-center shadow-sm h-16">
        <Link href="/dashboard"><img src="/logo.png" alt="Logo" className="h-8 w-auto" /></Link>
        <button onClick={() => setMenuMobileAberto(!menuMobileAberto)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">{menuMobileAberto ? <X size={24} /> : <Menu size={24} />}</button>
      </div>

      <main className={\`flex-1 flex flex-col min-h-screen transition-all duration-300 pt-16 md:pt-0 \${menuRecolhido ? 'md:ml-20' : 'md:ml-64'}\`}>
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-end px-6 gap-3 sticky top-16 md:top-0 z-20 shadow-sm/50 backdrop-blur-sm bg-white/90">
            <div className="md:hidden mr-auto flex items-center gap-2">
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                    <Building2 size={14} className="text-blue-600"/>
                    <span className="text-xs font-bold text-slate-700 max-w-[100px] truncate">{clinicaAtual?.nome}</span>
                 </div>
            </div>
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
                <div className="p-4 bg-slate-50 border-b border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Unidade Atual</p>
                    {minhasClinicas.map(c => (
                        <button key={c.id} onClick={() => trocarClinica(c)} className={\`w-full text-left px-4 py-3 mb-2 rounded-xl text-sm font-bold flex items-center justify-between border \${clinicaAtual?.id === c.id ? 'bg-white border-blue-500 text-blue-700 shadow-sm' : 'bg-transparent border-transparent text-slate-500'}\`}>
                            {c.nome}
                            {clinicaAtual?.id === c.id && <Check size={16} className="text-blue-600"/>}
                        </button>
                    ))}
                </div>
                <div className="p-4 space-y-1 flex-1 overflow-y-auto">
                    <NavItem href="/dashboard" icon={<LayoutDashboard size={20}/>} label="Dashboard" />
                    <NavItem href="/agenda" icon={<Calendar size={20}/>} label="Agenda" />
                    <NavItem href="/pacientes" icon={<Users size={20}/>} label="Pacientes" />
                    <NavItem href="/proteses" icon={<Smile size={20}/>} label="Próteses" />
                    {isAdmin && <><NavItem href="/financeiro" icon={<DollarSign size={20}/>} label="Financeiro" /><NavItem href="/configuracoes" icon={<Settings size={20}/>} label="Ajustes" /></>}
                </div>
                <div className="p-5 border-t border-slate-100 bg-slate-50"><button onClick={handleLogout} className="flex w-full items-center justify-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl font-bold bg-white border border-slate-200 shadow-sm transition-all active:scale-95"><LogOut size={18} /> Sair do Sistema</button></div>
            </div>
        </div>
      )}
    </div>
  );
}
`;

// Executa a restauração
salvarArquivo('app/login/page.tsx', loginContent);
salvarArquivo('components/AuthGuard.tsx', authGuardContent);

console.log('🏁 Restauração concluída! Sintaxe do AuthGuard corrigida.');