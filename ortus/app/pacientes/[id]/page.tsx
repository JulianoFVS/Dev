'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import { User, Phone, MapPin, FileText, Clock, Save, Loader2, Trash2, ArrowLeft, Calendar, Mail } from 'lucide-react';
import Link from 'next/link';

export default function PacienteDetalhe() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [historico, setHistorico] = useState<any[]>([]);

  useEffect(() => { if(id) carregar(); }, [id]);

  async function carregar() {
      setLoading(true);
      const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
      if (data) setForm(data);
      const { data: hist } = await supabase.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false });
      setHistorico(hist || []);
      setLoading(false);
  }

  async function salvar(e: any) {
      e.preventDefault();
      setSaving(true);
      await supabase.from('pacientes').update(form).eq('id', id);
      setSaving(false);
      alert('Dados salvos!');
  }

  async function excluir() {
      if(!confirm('Cuidado: Isso apagará o paciente e todo o histórico. Continuar?')) return;
      await supabase.from('agendamentos').delete().eq('paciente_id', id);
      await supabase.from('pacientes').delete().eq('id', id);
      router.push('/pacientes');
  }

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Carregando Prontuário...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-6 animate-in slide-in-from-right-4 duration-500">
        {/* HEADER */}
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Link href="/pacientes" className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500"><ArrowLeft size={20}/></Link>
                <div>
                    <h1 className="text-2xl font-black text-slate-800">{form.nome}</h1>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Prontuário Digital</p>
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={excluir} className="px-4 py-2 text-red-500 hover:bg-red-50 rounded-xl font-bold text-sm transition-colors">Excluir</button>
                <button onClick={salvar} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 transition-all active:scale-95">
                    {saving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} Salvar Alterações
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* COLUNA ESQUERDA: DADOS E ANAMNESE */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* DADOS PESSOAIS */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2"><User size={16}/> Dados Pessoais</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" value={form.nome || ''} onChange={e => setForm({...form, nome: e.target.value})} /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">CPF</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.cpf || ''} onChange={e => setForm({...form, cpf: e.target.value})} /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Telefone</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.telefone || ''} onChange={e => setForm({...form, telefone: e.target.value})} /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data Nascimento</label><input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.data_nascimento || ''} onChange={e => setForm({...form, data_nascimento: e.target.value})} /></div>
                        <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} /></div>
                        <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Endereço</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.endereco || ''} onChange={e => setForm({...form, endereco: e.target.value})} /></div>
                    </div>
                </div>

                {/* ANAMNESE GRANDE */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[500px]">
                    <h3 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2"><FileText size={16}/> Anamnese e Evolução</h3>
                    <textarea 
                        className="flex-1 w-full p-4 bg-yellow-50 border border-yellow-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400 text-slate-700 leading-relaxed text-sm resize-none"
                        placeholder="Descreva o histórico clínico, alergias, procedimentos realizados e evolução do tratamento..."
                        value={form.anamnese || ''}
                        onChange={e => setForm({...form, anamnese: e.target.value})}
                    ></textarea>
                </div>
            </div>

            {/* COLUNA DIREITA: HISTÓRICO (MENU LATERAL) */}
            <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-full max-h-[800px] overflow-y-auto sticky top-24">
                    <h3 className="text-sm font-bold text-slate-400 uppercase mb-6 flex items-center gap-2"><Clock size={16}/> Histórico Clínico</h3>
                    
                    {historico.length === 0 ? (
                        <div className="text-center text-slate-400 py-10">Nenhuma consulta.</div>
                    ) : (
                        <div className="relative border-l-2 border-slate-100 ml-3 space-y-8 pb-10">
                            {historico.map((h: any) => (
                                <div key={h.id} className="ml-6 relative group">
                                    <div className={`absolute -left-[31px] top-2 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-colors ${h.status === 'concluido' ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-bold text-slate-700 text-sm">{h.procedimento}</span>
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${h.status === 'concluido' ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'}`}>{h.status}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                            <Calendar size={12}/> {new Date(h.data_hora).toLocaleDateString('pt-BR')}
                                            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                            <User size={12}/> {h.profissionais?.nome || 'Dr(a).'}
                                        </div>
                                        {h.observacoes && <p className="text-xs text-slate-600 italic bg-white/50 p-2 rounded-lg">"{h.observacoes}"</p>}
                                        {h.valor_final > 0 && <p className="text-xs font-bold text-green-600 mt-2 text-right">R$ {h.valor_final}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
}