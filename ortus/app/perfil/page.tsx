'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Perfil() {
  const [sessionUser, setSessionUser] = useState<any>(null); // FIX: any
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSessionUser(data.user));
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (!sessionUser) return <div className="p-10 text-center">Carregando...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-black text-slate-800">Meu Perfil</h1>
      <div className="bg-white p-8 rounded-3xl border shadow-sm text-center">
        <div className="w-24 h-24 bg-blue-100 rounded-full mx-auto flex items-center justify-center text-blue-600 mb-4"><User size={48} /></div>
        <h2 className="text-xl font-bold">{sessionUser.email}</h2>
        <p className="text-slate-400 text-sm mb-6">Conta do Sistema ORTUS</p>
        <button onClick={sair} className="bg-red-50 text-red-600 px-6 py-2 rounded-xl font-bold hover:bg-red-100 flex items-center gap-2 mx-auto"><LogOut size={18}/> Sair do Sistema</button>
      </div>
    </div>
  );
}