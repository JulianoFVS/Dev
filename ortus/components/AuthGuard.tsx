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
      <Link href="/dashboard" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname === '/dashboard' ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><LayoutDashboard size={20} /> Dashboard</Link>
      <Link href="/agenda" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname.includes('/agenda') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Calendar size={20} /> Agenda</Link>
      <Link href="/pacientes" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname.includes('/pacientes') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Users size={20} /> Pacientes</Link>
      {isAdmin ? (<><Link href="/financeiro" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname.includes('/financeiro') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><DollarSign size={20} /> Financeiro</Link><Link href="/configuracoes" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname.includes('/configuracoes') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Settings size={20} /> Ajustes</Link></>) : null}
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