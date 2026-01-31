const fs = require('fs');
const path = require('path');

console.log('🚑 Instalando V45: Correção do Ícone X na Página do Paciente...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Corrigido: ${caminhoRelativo}`);
}

const pacienteDetailPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
// CORREÇÃO: Adicionado o 'X' e 'Check' nas importações
import { User, Phone, Edit, ArrowLeft, Save, Loader2, FileText, Clock, Trash2, Calendar, Pill, AlertTriangle, Stethoscope, X, Check } from 'lucide-react';
import Link from 'next/link';

export default function PacienteDetalhe() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  // MODOS DE TELA
  const [abaAtiva, setAbaAtiva] = useState('dados'); // dados, anamnese, historico
  const [modoEdicao, setModoEdicao] = useState(false); // true = editando
  
  const [form, setForm] = useState<any>({});
  const [ficha, setFicha] = useState<any>({}); // Anamnese Estruturada
  const [historico, setHistorico] = useState<any[]>([]);

  useEffect(() => { if(id) carregar(); }, [id]);

  async function carregar() {
      setLoading(true);
      const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
      if (data) {
          setForm(data);
          setFicha(data.ficha_medica || {});
      }
      const { data: hist } = await supabase.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false });
      setHistorico(hist || []);
      setLoading(false);
  }

  async function salvarTudo() {
      const payload = { ...form, ficha_medica: ficha };
      await supabase.from('pacientes').update(payload).eq('id', id);
      setModoEdicao(false);
      alert('Dados salvos com sucesso!');
  }

  const toggleCheck = (campo: string) => {
      setFicha((prev: any) => ({ ...prev, [campo]: !prev[campo] }));
  };

  async function excluir() {
      if(!confirm('Cuidado: Isso apagará o paciente e todo o histórico. Continuar?')) return;
      await supabase.from('agendamentos').delete().eq('paciente_id', id);
      await supabase.from('pacientes').delete().eq('id', id);
      router.push('/pacientes');
  }

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Carregando Prontuário...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-6 animate-in slide-in-from-right-4 duration-500">
        
        {/* HEADER COM NAVEGAÇÃO E AÇÕES */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4">
                <Link href="/pacientes" className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"><ArrowLeft size={20}/></Link>
                <div>
                    <h1 className="text-2xl font-black text-slate-800">{form.nome}</h1>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide flex items-center gap-2"><User size={12}/> Prontuário Digital</p>
                </div>
            </div>
            <div className="flex gap-2">
                {modoEdicao ? (
                    <>
                        <button onClick={() => setModoEdicao(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                        <button onClick={salvarTudo} className="px-6 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-200 flex items-center gap-2 transition-all active:scale-95"><Save size={18}/> Salvar Alterações</button>
                    </>
                ) : (
                    <>
                        <button onClick={excluir} className="px-4 py-2 text-red-400 hover:text-red-600 font-bold text-sm transition-colors flex items-center gap-2"><Trash2 size={16}/> Excluir</button>
                        <button onClick={() => setModoEdicao(true)} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 transition-all active:scale-95"><Edit size={18}/> Editar Prontuário</button>
                    </>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* MENU LATERAL (ABAS) */}
            <div className="lg:col-span-1 space-y-2">
                <button onClick={() => setAbaAtiva('dados')} className={\`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all \${abaAtiva === 'dados' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}\`}><User size={20}/> Dados Pessoais</button>
                <button onClick={() => setAbaAtiva('anamnese')} className={\`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all \${abaAtiva === 'anamnese' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}\`}><FileText size={20}/> Anamnese</button>
                <button onClick={() => setAbaAtiva('historico')} className={\`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all \${abaAtiva === 'historico' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}\`}><Clock size={20}/> Histórico</button>
            </div>

            {/* CONTEÚDO PRINCIPAL */}
            <div className="lg:col-span-3">
                
                {/* ABA DADOS PESSOAIS */}
                {abaAtiva === 'dados' && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><User size={20} className="text-blue-500"/> Informações do Paciente</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none font-bold text-slate-700 \${modoEdicao ? 'bg-white border-blue-300 ring-2 ring-blue-100' : 'bg-slate-50 border-slate-200'}\`} value={form.nome || ''} onChange={e => setForm({...form, nome: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">CPF</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.cpf || ''} onChange={e => setForm({...form, cpf: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Telefone</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.telefone || ''} onChange={e => setForm({...form, telefone: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data Nascimento</label><input type="date" disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.data_nascimento || ''} onChange={e => setForm({...form, data_nascimento: e.target.value})} /></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} /></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Endereço</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.endereco || ''} onChange={e => setForm({...form, endereco: e.target.value})} /></div>
                        </div>
                    </div>
                )}

                {/* ABA ANAMNESE ESTRUTURADA */}
                {abaAtiva === 'anamnese' && (
                    <div className="space-y-6 animate-in fade-in">
                        {/* QUADRO DE CHECAGEM */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Stethoscope size={20} className="text-pink-500"/> Ficha Médica</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {['Diabetes', 'Hipertensão', 'Cardiopatia', 'Asma/Bronquite', 'Alergia Antibiótico', 'Alergia Anestésico', 'Gestante', 'Fumante', 'Uso de Anticoagulante'].map(item => (
                                    <label key={item} className={\`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer \${ficha[item] ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100 hover:border-slate-300'} \${!modoEdicao && 'pointer-events-none opacity-80'}\`}>
                                        <div className={\`w-5 h-5 rounded-md border flex items-center justify-center transition-colors \${ficha[item] ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-slate-300'}\`}>
                                            {ficha[item] && <Check size={14}/>}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={ficha[item] || false} onChange={() => toggleCheck(item)} disabled={!modoEdicao}/>
                                        <span className={\`text-sm font-bold \${ficha[item] ? 'text-red-700' : 'text-slate-600'}\`}>{item}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* MEDICAMENTOS */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Pill size={20} className="text-purple-500"/> Medicamentos em Uso</h3>
                            <textarea disabled={!modoEdicao} value={ficha.medicamentos || ''} onChange={e => setFicha({...ficha, medicamentos: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-200 h-24 resize-none" placeholder="Liste os medicamentos contínuos..." />
                        </div>

                        {/* OBSERVAÇÕES LIVRES */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle size={20} className="text-amber-500"/> Observações Clínicas</h3>
                            <textarea disabled={!modoEdicao} value={form.anamnese || ''} onChange={e => setForm({...form, anamnese: e.target.value})} className="w-full p-4 bg-yellow-50 border border-yellow-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-300 h-40 resize-none text-slate-700" placeholder="Histórico detalhado, queixas principais e evolução..." />
                        </div>
                    </div>
                )}

                {/* ABA HISTÓRICO */}
                {abaAtiva === 'historico' && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Clock size={20} className="text-blue-500"/> Histórico de Atendimentos</h3>
                        {historico.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">Nenhum atendimento registrado.</div>
                        ) : (
                            <div className="relative border-l-2 border-blue-100 ml-4 space-y-8 pb-4">
                                {historico.map((h: any) => (
                                    <div key={h.id} className="ml-8 relative">
                                        <div className="absolute -left-[41px] top-1 w-6 h-6 rounded-full border-4 border-white bg-blue-500 shadow-sm"></div>
                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-bold text-slate-800 text-lg">{h.procedimento}</span>
                                                <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-slate-200 text-slate-500 uppercase">{h.status}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-500 font-bold mb-3">
                                                <span className="flex items-center gap-1"><Calendar size={14}/> {new Date(h.data_hora).toLocaleDateString('pt-BR')}</span>
                                                <span className="flex items-center gap-1"><Clock size={14}/> {new Date(h.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                                                <span className="flex items-center gap-1"><User size={14}/> {h.profissionais?.nome || 'Dr(a).'}</span>
                                            </div>
                                            {h.observacoes && <p className="text-sm text-slate-600 bg-white p-3 rounded-xl border border-slate-100 italic">"{h.observacoes}"</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}
`;

salvarArquivo('app/pacientes/[id]/page.tsx', pacienteDetailPage);