'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User, LogOut, Save, Loader2, Lock, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Perfil() {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', cargo: '', novaSenha: '' });
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser();
    if(user) {
        setUser(user);
        const { data: prof } = await supabase.from('profissionais').select('*').eq('user_id', user.id).single();
        if(prof) setForm({ nome: prof.nome, cargo: prof.cargo, email: user.email || '', novaSenha: '' });
    }
    setLoading(false);
  }

  async function salvar(e: any) {
      e.preventDefault();
      setSalvando(true);
      
      // 1. Atualizar dados do Profissional
      await supabase.from('profissionais').update({ nome: form.nome, cargo: form.cargo }).eq('user_id', user.id);

      // 2. Atualizar Senha (se preenchida)
      if (form.novaSenha) {
          const { error } = await supabase.auth.updateUser({ password: form.novaSenha });
          if (error) alert('Erro ao mudar senha: ' + error.message);
          else alert('Senha atualizada com sucesso!');
      }

      // 3. Atualizar Email (se mudou) - Nota: Supabase envia confirmação
      if (form.email !== user.email) {
          const { error } = await supabase.auth.updateUser({ email: form.email });
          if (error) alert('Erro ao mudar email: ' + error.message);
          else alert('Verifique seu novo email para confirmar a troca.');
      }

      setSalvando(false);
      alert('Perfil atualizado!');
  }

  async function sair() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) return <div className="p-10 text-center text-slate-400 flex justify-center"><Loader2 className="animate-spin"/></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
          <h1 className="text-3xl font-black text-slate-800">Meu Perfil</h1>
          <button onClick={sair} className="text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-sm transition-colors"><LogOut size={18}/> Sair</button>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-4 border-4 border-white shadow-lg"><User size={48} /></div>
            <p className="text-slate-400 text-sm font-bold uppercase">Editando Informações</p>
        </div>

        <form onSubmit={salvar} className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
                <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} /></div>
                <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Cargo / Especialidade</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={form.cargo} onChange={e => setForm({...form, cargo: e.target.value})} /></div>
            </div>

            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Mail size={12}/> Email de Acesso</label><input type="email" required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-600" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>

            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Lock size={12}/> Nova Senha (Opcional)</label><input type="password" placeholder="Deixe em branco para não alterar" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-600" value={form.novaSenha} onChange={e => setForm({...form, novaSenha: e.target.value})} /></div>

            <button type="submit" disabled={salvando} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex justify-center items-center gap-2 mt-4">
                {salvando ? <Loader2 className="animate-spin"/> : <><Save size={20}/> Salvar Alterações</>}
            </button>
        </form>
      </div>
    </div>
  );
}