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