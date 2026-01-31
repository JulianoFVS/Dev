const fs = require('fs');
const path = require('path');

console.log('🏥 Instalando V48: Vínculo de Paciente com Clínica (Cadastro e Filtros)...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Atualizado: ${caminhoRelativo}`);
}

// ======================================================
// 1. LISTA DE PACIENTES (Com Filtro de Clínica)
// ======================================================
const pacientesListPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, LayoutGrid, List as ListIcon, User, Phone, Edit, Trash2, Activity, Loader2, ChevronRight, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visualizacao, setVisualizacao] = useState('lista');
  const [busca, setBusca] = useState('');
  
  // Filtros
  const [filtroClinica, setFiltroClinica] = useState('todas');

  const router = useRouter();

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setLoading(true);
    
    // 1. Carregar Clínicas
    const { data: listaClinicas } = await supabase.from('clinicas').select('*').order('nome');
    if (listaClinicas) setClinicas(listaClinicas);

    // 2. Carregar Pacientes
    const { data } = await supabase.from('pacientes').select('*, agendamentos(data_hora, status), clinicas(nome)').order('created_at', { ascending: false });
    
    if (data) {
        const formatados = data.map((p: any) => {
            const agendamentos = p.agendamentos || [];
            agendamentos.sort((a: any, b: any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
            const ultimo = agendamentos[0];
            const status = ultimo ? (new Date(ultimo.data_hora) > new Date() ? 'agendado' : 'ativo') : 'novo';
            return { ...p, status, nome_clinica: p.clinicas?.nome };
        });
        setPacientes(formatados);
    }
    setLoading(false);
  }

  async function novoPaciente() {
      // Se tiver filtro de clínica selecionado, já cria o paciente nela
      const payload: any = { nome: 'Novo Paciente', telefone: '' };
      if (filtroClinica !== 'todas') payload.clinica_id = filtroClinica;

      const { data, error } = await supabase.from('pacientes').insert([payload]).select().single();
      if(data) router.push(\`/pacientes/\${data.id}\`);
  }

  const filtrados = pacientes.filter((p: any) => {
      const bateBusca = p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.telefone || '').includes(busca);
      const bateClinica = filtroClinica === 'todas' ? true : p.clinica_id == filtroClinica;
      return bateBusca && bateClinica;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex justify-between items-end">
          <div><h1 className="text-3xl font-black text-slate-800">Pacientes</h1><p className="text-slate-500">Gerencie seus clientes.</p></div>
          <button onClick={novoPaciente} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center gap-2"><Plus size={20}/> Novo Paciente</button>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
              <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          
          {/* FILTRO DE CLÍNICA */}
          <div className="flex items-center gap-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
              <Building2 size={16} className="text-slate-400"/>
              <select 
                  value={filtroClinica} 
                  onChange={(e) => setFiltroClinica(e.target.value)} 
                  className="bg-transparent py-2.5 outline-none text-sm font-bold text-slate-600 cursor-pointer min-w-[150px]"
              >
                  <option value="todas">Todas as Clínicas</option>
                  {clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setVisualizacao('lista')} className={\`p-2 rounded-lg \${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}\`}><ListIcon size={20}/></button>
              <button onClick={() => setVisualizacao('cards')} className={\`p-2 rounded-lg \${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}\`}><LayoutGrid size={20}/></button>
          </div>
      </div>

      {loading ? <div className="py-20 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2"/> Carregando...</div> : 
       visualizacao === 'lista' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 pl-6 text-xs font-bold text-slate-400 uppercase">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Clínica</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Telefone</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-right"></th></tr></thead>
                <tbody className="divide-y divide-slate-50">{filtrados.map((p: any) => (
                    <tr key={p.id} onClick={() => router.push(\`/pacientes/\${p.id}\`)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
                        <td className="p-4 pl-6 font-bold text-slate-700">{p.nome}</td>
                        <td className="p-4 text-sm text-slate-500 flex items-center gap-2">{p.nome_clinica ? <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold text-slate-600">{p.nome_clinica}</span> : <span className="text-slate-300 italic">--</span>}</td>
                        <td className="p-4 text-sm text-slate-500">{p.telefone}</td>
                        <td className="p-4"><span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded">{p.status}</span></td>
                        <td className="p-4 text-right pr-6 text-slate-300 group-hover:text-blue-500"><ChevronRight size={20}/></td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
       ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{filtrados.map((p: any) => (
            <div key={p.id} onClick={() => router.push(\`/pacientes/\${p.id}\`)} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-blue-200 group">
                <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">{p.nome.charAt(0)}</div><div><h3 className="font-bold text-slate-800 truncate w-40">{p.nome}</h3><p className="text-xs text-slate-400 uppercase font-bold">{p.nome_clinica || 'Sem Clínica'}</p></div></div>
                <div className="text-sm text-slate-500 flex items-center gap-2"><Phone size={14}/> {p.telefone || 'Sem telefone'}</div>
            </div>
        ))}</div>
       )
      }
    </div>
  );
}
`;

// ======================================================
// 2. PÁGINA DO PACIENTE (Com Campo de Clínica)
// ======================================================
const pacienteDetailPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import { User, Phone, Edit, ArrowLeft, Save, Loader2, FileText, Clock, Trash2, Calendar, Pill, AlertTriangle, Stethoscope, X, Check, Building2 } from 'lucide-react';
import Link from 'next/link';

export default function PacienteDetalhe() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  // MODOS DE TELA
  const [abaAtiva, setAbaAtiva] = useState('dados'); 
  const [modoEdicao, setModoEdicao] = useState(false); 
  
  const [form, setForm] = useState<any>({});
  const [ficha, setFicha] = useState<any>({}); 
  const [historico, setHistorico] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);

  useEffect(() => { if(id) carregar(); }, [id]);

  async function carregar() {
      setLoading(true);
      
      // Carregar Clínicas para o Select
      const { data: listaClinicas } = await supabase.from('clinicas').select('*');
      if (listaClinicas) setClinicas(listaClinicas);

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
        
        {/* HEADER */}
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
            
            {/* MENU LATERAL */}
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
                            
                            {/* CAMPO NOVO: CLÍNICA */}
                            <div className="col-span-2 md:col-span-1">
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Clínica de Atendimento</label>
                                <div className="relative">
                                    <Building2 className="absolute left-3 top-3 text-slate-400" size={18}/>
                                    <select 
                                        disabled={!modoEdicao} 
                                        className={\`w-full pl-10 pr-4 py-3 rounded-xl border outline-none font-bold text-slate-700 appearance-none \${modoEdicao ? 'bg-white border-blue-300 ring-2 ring-blue-100 cursor-pointer' : 'bg-slate-50 border-slate-200'}\`}
                                        value={form.clinica_id || ''} 
                                        onChange={e => setForm({...form, clinica_id: e.target.value})}
                                    >
                                        <option value="">Sem Clínica Definida</option>
                                        {clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </select>
                                </div>
                            </div>

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
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Stethoscope size={20} className="text-pink-500"/> Ficha Médica</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {['Diabetes', 'Hipertensão', 'Cardiopatia', 'Asma/Bronquite', 'Alergia Antibiótico', 'Alergia Anestésico', 'Gestante', 'Fumante', 'Uso de Anticoagulante'].map(item => (
                                    <label key={item} className={\`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer \${ficha[item] ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100 hover:border-slate-300'} \${!modoEdicao && 'pointer-events-none opacity-80'}\`}>
                                        <div className={\`w-5 h-5 rounded-md border flex items-center justify-center transition-colors \${ficha[item] ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-slate-300'}\`}>{ficha[item] && <Check size={14}/>}</div>
                                        <input type="checkbox" className="hidden" checked={ficha[item] || false} onChange={() => toggleCheck(item)} disabled={!modoEdicao}/>
                                        <span className={\`text-sm font-bold \${ficha[item] ? 'text-red-700' : 'text-slate-600'}\`}>{item}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Pill size={20} className="text-purple-500"/> Medicamentos em Uso</h3>
                            <textarea disabled={!modoEdicao} value={ficha.medicamentos || ''} onChange={e => setFicha({...ficha, medicamentos: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-200 h-24 resize-none" placeholder="Liste os medicamentos contínuos..." />
                        </div>
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

salvarArquivo('app/pacientes/page.tsx', pacientesListPage);
salvarArquivo('app/pacientes/[id]/page.tsx', pacienteDetailPage);