const fs = require('fs');
const path = require('path');

console.log('🔐 Instalando V35: Tela de Login Azul Royal (Identidade Visual)...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Atualizado: ${caminhoRelativo}`);
}

const loginPage = `
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, Building2, ShieldCheck } from 'lucide-react';

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
      setError('Credenciais inválidas. Verifique seu e-mail e senha.');
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {/* Fundo Decorativo Sutil */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-slate-100 z-0"></div>
      
      <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-xl shadow-slate-200/60 border border-white relative z-10 animate-in zoom-in-95 duration-500">
        
        <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200 transform rotate-3">
                <Building2 size={32} />
            </div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">ORTUS</h1>
            <p className="text-slate-400 font-medium mt-1 text-sm">Gestão Inteligente para Clínicas</p>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold flex items-center gap-2 mb-6 border border-red-100 animate-in slide-in-from-top-2">
                <ShieldCheck size={18}/> {error}
            </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail Profissional</label>
                <div className="relative group">
                    <Mail className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input 
                        type="email" 
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="doutor@ortus.com" 
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700"
                        required
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Senha de Acesso</label>
                <div className="relative group">
                    <Lock className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input 
                        type="password" 
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••" 
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700"
                        required
                    />
                </div>
            </div>

            <button 
                type="submit" 
                disabled={loading} 
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex justify-center items-center gap-2 mt-4"
            >
                {loading ? <Loader2 className="animate-spin" /> : 'Entrar no Sistema'}
            </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-100 pt-6">
            <p className="text-xs text-slate-400 font-medium">Sistema seguro e monitorado 24h.</p>
        </div>
      </div>
    </div>
  );
}
`;

salvarArquivo('app/login/page.tsx', loginPage);