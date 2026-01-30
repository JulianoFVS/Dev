const fs = require('fs');
const path = require('path');

const files = {
  // 1. O Componente "Guarda-Costas" (Protege o site e desenha o menu lateral)
  'components/AuthGuard.tsx': `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, LogOut } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Verifica se tem sessão ativa
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session && pathname !== '/login') {
        router.push('/login');
      }
    });

    // Escuta mudanças (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session && pathname !== '/login') {
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  // Se estiver na página de login, mostra ela "limpa" (sem menu lateral)
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // Enquanto carrega, mostra tela branca
  if (loading) return <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-teal-600">Carregando segurança...</div>;

  // Se não tiver sessão (e não estiver no login), não mostra nada (o redirect acontece acima)
  if (!session) return null;

  // LAYOUT LOGADO (Com Menu Lateral)
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Barra Lateral Fixa */}
      <aside className="w-64 bg-white border-r border-slate-200 fixed h-full hidden md:flex flex-col z-10">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-teal-600 tracking-tight">ORTUS</h1>
          <p className="text-xs text-slate-400 font-medium mt-1">Clinic Management</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <Link href="/" className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname === '/' ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}>
            <LayoutDashboard size={20} /> Dashboard
          </Link>
          <Link href="/pacientes" className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname.includes('/pacientes') ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}>
            <Users size={20} /> Pacientes
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 px-4 py-3 text-slate-500 mb-2">
                <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-xs">
                    {session.user.email?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-medium text-slate-900 truncate">Doutor(a)</p>
                    <p className="text-[10px] truncate" title={session.user.email}>{session.user.email}</p>
                </div>
            </div>
            <button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 px-4 py-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors">
                <LogOut size={16} /> Sair do Sistema
            </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 md:ml-64 p-8">
        {children}
      </main>
    </div>
  );
}
`,

  // 2. A Página de Login
  'app/login/page.tsx': `
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { KeyRound, Mail, Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert('Erro: ' + error.message);
      setLoading(false);
    } else {
      router.push('/'); // Redireciona para home ao logar
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-teal-600 mb-2">ORTUS</h1>
          <p className="text-slate-400">Acesse o sistema da clínica</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Email Profissional</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-slate-400" size={20} />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                placeholder="doutor@ortus.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Senha</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 text-slate-400" size={20} />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 transition-transform active:scale-95 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Entrar no Sistema'}
          </button>
        </form>
        
        <p className="text-center text-xs text-slate-400 mt-6">Sistema seguro e monitorado.</p>
      </div>
    </div>
  );
}
`,

  // 3. Atualiza o Layout Global para usar o AuthGuard
  'app/layout.tsx': `
import type { Metadata } from "next";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";

export const metadata: Metadata = {
  title: "Ortus | Gestão Clínica",
  description: "Sistema de gerenciamento odontológico",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br">
      <body>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
`
};

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

Object.keys(files).forEach(path => {
  ensureDirectoryExistence(path);
  fs.writeFileSync(path, files[path].trim());
  console.log('✅ Segurança aplicada: ' + path);
});