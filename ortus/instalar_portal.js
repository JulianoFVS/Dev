const fs = require('fs');
const path = require('path');

console.log('🏥 Instalando Portal de Seleção de Clínicas (Tema Azul)...');

function salvarArquivo(caminho, conteudo) {
    const fullPath = path.join(__dirname, caminho);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, conteudo.trim());
    console.log(`✅ ${caminho} criado.`);
}

const portalPage = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Plus, Building2, LayoutGrid, ArrowRight, Trash2, Loader2, X } from 'lucide-react';

export default function SelecaoClinica() {
  const router = useRouter();
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [novaClinica, setNovaClinica] = useState('');

  useEffect(() => { carregarClinicas(); }, []);

  async function carregarClinicas() {
    const { data } = await supabase.from('clinicas').select('*').order('created_at');
    setClinicas(data || []);
    setLoading(false);
  }

  async function criarClinica(e: any) {
    e.preventDefault();
    if (!novaClinica) return;
    await supabase.from('clinicas').insert([{ nome: novaClinica, cor_tema: 'blue' }]);
    setNovaClinica('');
    setModalAberto(false);
    carregarClinicas();
  }

  async function excluirClinica(e: any, id: number) {
    e.stopPropagation();
    if (!confirm('ATENÇÃO: Isso apagará TODOS os agendamentos e profissionais desta clínica. Continuar?')) return;
    await supabase.from('clinicas').delete().eq('id', id);
    carregarClinicas();
  }

  function selecionar(id: string | number) {
    // Salva a preferência no navegador
    if (typeof window !== 'undefined') {
        localStorage.setItem('ortus_clinica_atual', id.toString());
    }
    router.push('/'); // Vai para o Dashboard
  }

  if (loading) return <div className="h-screen flex items-center justify-center text-blue-600"><Loader2 className="animate-spin" size={40}/></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 animate-fade-in">
      
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tight">ORTUS</h1>
            <p className="text-slate-500">Selecione o ambiente de trabalho</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* CARD: VISÃO GERAL (TODAS) */}
            <div 
                onClick={() => selecionar('todas')}
                className="group bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 rounded-2xl shadow-lg cursor-pointer hover:scale-[1.02] transition-all relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><LayoutGrid size={100}/></div>
                <div className="relative z-10 h-full flex flex-col justify-between">
                    <div className="bg-white/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4"><LayoutGrid size={24}/></div>
                    <div>
                        <h3 className="text-xl font-bold">Visão Geral</h3>
                        <p className="text-slate-300 text-sm mt-1">Gerenciar todas as clínicas</p>
                    </div>
                </div>
            </div>

            {/* LISTA DE CLÍNICAS */}
            {clinicas.map(c => (
                <div 
                    key={c.id} 
                    onClick={() => selecionar(c.id)}
                    className="group bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all relative"
                >
                    <div className="flex justify-between items-start">
                        <div className="bg-blue-50 text-blue-600 w-12 h-12 rounded-xl flex items-center justify-center mb-4"><Building2 size={24}/></div>
                        <button onClick={(e) => excluirClinica(e, c.id)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"><Trash2 size={16}/></button>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{c.nome}</h3>
                        <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">Acessar painel <ArrowRight size={12}/></p>
                    </div>
                </div>
            ))}

            {/* CARD: NOVA CLÍNICA */}
            <button 
                onClick={() => setModalAberto(true)}
                className="border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all gap-2 min-h-[180px]"
            >
                <Plus size={32}/>
                <span className="font-bold">Nova Clínica</span>
            </button>
        </div>
      </div>

      {/* MODAL CRIAR */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Cadastrar Clínica</h3>
                    <button onClick={() => setModalAberto(false)}><X size={20} className="text-slate-400"/></button>
                </div>
                <form onSubmit={criarClinica} className="p-6 space-y-4">
                    <input autoFocus value={novaClinica} onChange={e => setNovaClinica(e.target.value)} placeholder="Nome da Clínica (Ex: Matriz)" className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors">Confirmar</button>
                </form>
            </div>
        </div>
      )}

    </div>
  );
}
`;

// Precisamos mudar o redirect do login para ir para /selecao
// Vamos criar um middleware ou apenas alterar a página de login se ela existisse
// Como não temos acesso ao Login agora, vamos assumir que o usuário acessa /selecao manualmente ou via redirecionamento do AuthGuard.
// Vou atualizar o AuthGuard para redirecionar para selecao se não tiver clinica no localStorage.

const authGuardUpdate = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, LogOut, Calendar, Menu, X, DollarSign, Settings, Building2 } from 'lucide-react';

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

  if (pathname === '/login' || pathname === '/selecao') return <>{children}</>;
  if (loading) return <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-blue-600 animate-pulse">Carregando...</div>;
  if (!session) return null;

  const LinksDoMenu = () => (
    <>
      <div className="px-4 pb-4 mb-2 border-b border-slate-100">
         <Link href="/selecao" className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wide">
            <Building2 size={14}/> Trocar Clínica
         </Link>
      </div>
      <Link href="/" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname === '/' ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><LayoutDashboard size={20} /> Dashboard</Link>
      <Link href="/agenda" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname.includes('/agenda') ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><Calendar size={20} /> Agenda</Link>
      <Link href="/pacientes" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname.includes('/pacientes') ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><Users size={20} /> Pacientes</Link>
      <Link href="/financeiro" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname.includes('/financeiro') ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><DollarSign size={20} /> Financeiro</Link>
      <Link href="/configuracoes" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname.includes('/configuracoes') ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><Settings size={20} /> Ajustes</Link>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 fixed h-full hidden md:flex flex-col z-20">
        <div className="p-6"><h1 className="text-2xl font-black text-blue-600 tracking-tight">ORTUS</h1><p className="text-xs text-slate-400 font-medium mt-1">Multi-Clinic System</p></div>
        <nav className="flex-1 px-4 space-y-2 mt-2"><LinksDoMenu /></nav>
        <div className="p-4 border-t border-slate-100"><button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 px-4 py-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"><LogOut size={16} /> Sair</button></div>
      </aside>
      <div className="md:hidden fixed top-0 w-full bg-white border-b border-slate-200 z-30 px-4 py-3 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-black text-blue-600">ORTUS</h1>
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
`;

salvarArquivo('app/selecao/page.tsx', portalPage);
salvarArquivo('components/AuthGuard.tsx', authGuardUpdate);