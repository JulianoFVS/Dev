'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, LogOut, Calendar, Menu, X, DollarSign, Settings, Building2, Bell, Mail, User, Lock } from 'lucide-react';

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
    
    if (!session && pathname !== '/login') { router.push('/login'); return; }
    
    if (session) {
        setSession(session);
        const { data: prof } = await supabase.from('profissionais').select('*').eq('user_id', session.user.id).single();
        setPerfil(prof);

        // Conta apenas notificações do tipo 'alerta' ou 'agenda' não lidas para o sino
        const { count } = await supabase.from('notificacoes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', session.user.id)
            .eq('lida', false)
            .in('tipo', ['agenda', 'alerta', 'sistema', 'aviso']);
            
        setNotificacoesCount(count || 0);

        if (prof && prof.nivel_acesso !== 'admin') {
            if (pathname.includes('/financeiro') || pathname.includes('/configuracoes')) {
                router.push('/');
            }
        }
    }
    setLoading(false);
  }

  async function handleLogout() {
      await supabase.auth.signOut();
      router.push('/login');
  }

  if (pathname === '/login' || pathname === '/selecao') return <>{children}</>;
  if (loading) return <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-blue-600 animate-pulse"><Building2 size={40}/></div>;
  if (!session) return null;

  const isAdmin = perfil?.nivel_acesso === 'admin';

  const LinksDoMenu = () => (
    <>
      <div className="px-4 pb-6 mb-2 border-b border-slate-100">
         <Link href="/selecao" className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wide">
            <Building2 size={14}/> Trocar Clínica
         </Link>
      </div>
      <Link href="/" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname === '/' ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><LayoutDashboard size={20} /> Dashboard</Link>
      <Link href="/agenda" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname.includes('/agenda') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Calendar size={20} /> Agenda</Link>
      <Link href="/pacientes" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname.includes('/pacientes') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Users size={20} /> Pacientes</Link>
      
      {isAdmin ? (
        <>
            <Link href="/financeiro" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname.includes('/financeiro') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><DollarSign size={20} /> Financeiro</Link>
            <Link href="/configuracoes" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${pathname.includes('/configuracoes') ? 'bg-blue-50 text-blue-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Settings size={20} /> Ajustes</Link>
        </>
      ) : (
        <div className="mt-4 px-4 py-2 bg-slate-50 rounded-lg border border-slate-100 opacity-60"><p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Lock size={10}/> Área Admin</p></div>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <aside className="w-64 bg-white border-r border-slate-200 fixed h-full hidden md:flex flex-col z-30 shadow-sm">
        <div className="p-6 pb-2"><h1 className="text-2xl font-black text-blue-600 tracking-tight">ORTUS</h1><p className="text-xs text-slate-400 font-bold mt-1">Gestão Inteligente</p></div>
        <nav className="flex-1 px-4 space-y-1 mt-6"><LinksDoMenu /></nav>
        <div className="p-6 text-center border-t border-slate-50"><p className="text-[10px] text-slate-300 font-medium">ORTUS v19.0 &copy; 2025</p></div>
      </aside>

      <div className="md:hidden fixed top-0 w-full bg-white border-b border-slate-200 z-40 px-4 py-3 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-black text-blue-600">ORTUS</h1>
        <button onClick={() => setMenuMobileAberto(!menuMobileAberto)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">{menuMobileAberto ? <X size={24} /> : <Menu size={24} />}</button>
      </div>

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen transition-all">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-end px-6 gap-3 sticky top-0 z-20 shadow-sm/50 backdrop-blur-sm bg-white/90">
            <div className="flex items-center gap-1 border-r border-slate-100 pr-3 mr-1">
                {/* ÍCONE DE MENSAGENS -> ABA MENSAGENS */}
                <Link href="/inbox?tab=mensagens" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all relative" title="Mensagens">
                    <Mail size={20}/>
                </Link>
                {/* ÍCONE DE SINO -> ABA ALERTAS */}
                <Link href="/inbox?tab=alertas" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all relative" title="Alertas">
                    <Bell size={20}/>
                    {notificacoesCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                </Link>
            </div>

            <Link href="/perfil" className="flex items-center gap-3 pl-2 py-1 pr-2 rounded-xl hover:bg-slate-50 transition-colors group border border-transparent hover:border-slate-100">
                <div className="text-right hidden sm:block"><p className="text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors">{perfil?.nome}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-right">{perfil?.nivel_acesso === 'admin' ? 'Admin' : 'Dr(a).'}</p></div>
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full flex items-center justify-center shadow-md shadow-blue-200 overflow-hidden border-2 border-white ring-1 ring-slate-100">
                    {perfil?.foto_url ? <img src={perfil.foto_url} className="w-full h-full object-cover"/> : <User size={18}/>}
                </div>
            </Link>
            <button onClick={handleLogout} className="ml-1 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100" title="Sair"><LogOut size={20}/></button>
        </header>
        <div className="p-6 md:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">{children}</div>
      </main>

      {menuMobileAberto && (
        <div className="md:hidden fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMenuMobileAberto(false)}>
            <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-2xl p-6 pt-20 space-y-2" onClick={e => e.stopPropagation()}>
                <LinksDoMenu />
                <div className="border-t border-slate-100 mt-6 pt-6"><button onClick={handleLogout} className="flex w-full items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-50 rounded-xl font-bold"><LogOut size={18} /> Sair</button></div>
            </div>
        </div>
      )}
    </div>
  );
}