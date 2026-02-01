'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ArrowLeft, Building2, User, Mail, Lock, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function Cadastro() {
  const searchParams = useSearchParams();
  const plano = searchParams.get('plano') || 'Básico';
  const status = searchParams.get('status');
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ clinica: '', nome: '', email: '', password: '' });

  async function handleSubmit(e: any) {
      e.preventDefault();
      setLoading(true);

      try {
          const res = await fetch('/api/criar-usuario', {
              method: 'POST',
              body: JSON.stringify({
                  email: form.email,
                  password: form.password,
                  nome: form.nome,
                  cargo: 'Administrador',
                  nivel_acesso: 'admin'
              })
          });

          const json = await res.json();
          if (!res.ok) throw new Error(json.error);
          alert('Conta criada com sucesso! Faça login para começar.');
          router.push('/login');

      } catch (error: any) {
          alert(error.message);
      }
      setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative">
        <Link href="/" className="absolute top-6 left-6 flex items-center gap-2 text-slate-500 font-bold hover:text-blue-600 transition-colors"><ArrowLeft size={20}/> Voltar</Link>
        
        <div className="mb-8 text-center">
            {status === 'pago' && (
                <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-green-200 mb-4 animate-in fade-in slide-in-from-top-2">
                    <ShieldCheck size={14}/> Pagamento Confirmado
                </div>
            )}
            <h1 className="text-3xl font-black text-slate-900 mb-2">Criar conta {plano}</h1>
            <p className="text-slate-500 font-medium">Preencha os dados para configurar sua clínica.</p>
        </div>

        <div className="bg-white w-full max-w-lg p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 animate-in zoom-in-95">
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Nome da Clínica</label><div className="relative group"><Building2 className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} /><input required value={form.clinica} onChange={e => setForm({...form, clinica: e.target.value})} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: Clínica Sorriso" /></div></div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Seu Nome Completo</label><div className="relative group"><User className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} /><input required value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: Dr. João Silva" /></div></div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Email de Acesso</label><div className="relative group"><Mail className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} /><input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="email@clinica.com" /></div></div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Senha Segura</label><div className="relative group"><Lock className="absolute left-4 top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} /><input required type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="••••••••" /></div></div>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex justify-center items-center gap-2 mt-4">{loading ? <Loader2 className="animate-spin" /> : 'Finalizar Cadastro'}</button>
            </form>
        </div>
    </div>
  );
}