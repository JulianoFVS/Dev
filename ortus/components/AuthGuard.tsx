'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, LogOut, Calendar, Menu, X, DollarSign, Settings } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false);
      if (!session && pathname !== '/login') router.push('/login');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session && pathname !== '/login') router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, [pathname, router]);

  if (pathname === '/login') return <>{children}</>;
  if (loading) return <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-teal-600 animate-pulse">Carregando...</div>;
  if (!session) return null;

  const LinksDoMenu = () => (
    <>
      <Link href="/" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/' ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><LayoutDashboard size={20} /> Dashboard</Link>
      <Link href="/agenda" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname.includes('/agenda') ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Calendar size={20} /> Agenda</Link>
      <Link href="/pacientes" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname.includes('/pacientes') ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Users size={20} /> Pacientes</Link>
      <Link href="/financeiro" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname.includes('/financeiro') ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><DollarSign size={20} /> Financeiro</Link>
      <Link href="/configuracoes" onClick={() => setMenuMobileAberto(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname.includes('/configuracoes') ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Settings size={20} /> Ajustes</Link>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 fixed h-full hidden md:flex flex-col z-20">
        <div className="p-6"><h1 className="text-2xl font-bold text-teal-600 tracking-tight">ORTUS</h1><p className="text-xs text-slate-400 font-medium mt-1">Clinic Management</p></div>
        <nav className="flex-1 px-4 space-y-2 mt-4"><LinksDoMenu /></nav>
        <div className="p-4 border-t border-slate-100"><button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 px-4 py-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"><LogOut size={16} /> Sair</button></div>
      </aside>
      <div className="md:hidden fixed top-0 w-full bg-white border-b border-slate-200 z-30 px-4 py-3 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-teal-600">ORTUS</h1>
        <button onClick={() => setMenuMobileAberto(!menuMobileAberto)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">{menuMobileAberto ? <X size={24} /> : <Menu size={24} />}</button>
      </div>
      {menuMobileAberto && (
        <div className="md:hidden fixed inset-0 z-20 bg-slate-900/50 backdrop-blur-sm animate-in fade-in" onClick={() => setMenuMobileAberto(false)}>
            <div className="absolute right-0 top-0 h-full w-64 bg-white shadow-2xl p-4 pt-20 space-y-2 animate-in slide-in-from-right" onClick={e => e.stopPropagation()}><LinksDoMenu /><div className="border-t border-slate-100 mt-4 pt-4"><button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 px-4 py-2 text-red-400 hover:bg-red-50 rounded-lg"><LogOut size={16} /> Sair</button></div></div>
        </div>
      )}
      <main className="flex-1 md:ml-64 p-4 md:p-8 mt-16 md:mt-0 overflow-x-hidden">{children}</main>
    </div>
  );
}