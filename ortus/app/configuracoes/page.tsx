'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, Users, Plus, Trash2, Save, MapPin, Shield, Check, X, Loader2 } from 'lucide-react';

export default function Configuracoes() {
  const [abaAtiva, setAbaAtiva] = useState('clinicas'); // clinicas | equipe
  const [loading, setLoading] = useState(true);
  
  // DADOS
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  
  // MODAIS
  const [modalClinica, setModalClinica] = useState(false);
  const [novaClinica, setNovaClinica] = useState('');
  
  const [modalVinculo, setModalVinculo] = useState(false);
  const [profSelecionado, setProfSelecionado] = useState<any>(null);
  const [vinculosDoProf, setVinculosDoProf] = useState<number[]>([]); // IDs das clínicas

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
      setLoading(true);
      const { data: c } = await supabase.from('clinicas').select('*').order('nome');
      const { data: p } = await supabase.from('profissionais').select('*').order('nome');
      
      setClinicas(c || []);
      setProfissionais(p || []);
      setLoading(false);
  }

  // --- AÇÕES DE CLÍNICA ---
  async function criarClinica() {
      if (!novaClinica) return;
      const { error } = await supabase.from('clinicas').insert([{ nome: novaClinica }]);
      if (error) alert('Erro: ' + error.message);
      else {
          setNovaClinica('');
          setModalClinica(false);
          carregarDados();
      }
  }

  async function excluirClinica(id: number) {
      if (!confirm('Tem certeza? Isso pode afetar dados vinculados.')) return;
      await supabase.from('clinicas').delete().eq('id', id);
      carregarDados();
  }

  // --- AÇÕES DE VÍNCULO (QUEM TRABALHA ONDE) ---
  async function abrirVinculos(prof: any) {
      setProfSelecionado(prof);
      // Busca onde ele já trabalha
      const { data } = await supabase.from('profissionais_clinicas').select('clinica_id').eq('profissional_id', prof.id);
      if (data) setVinculosDoProf(data.map((v: any) => v.clinica_id));
      setModalVinculo(true);
  }

  async function toggleVinculo(clinicaId: number) {
      const jaTem = vinculosDoProf.includes(clinicaId);
      
      if (jaTem) {
          // Remover
          await supabase.from('profissionais_clinicas')
              .delete()
              .eq('profissional_id', profSelecionado.id)
              .eq('clinica_id', clinicaId);
          setVinculosDoProf(prev => prev.filter(id => id !== clinicaId));
      } else {
          // Adicionar
          await supabase.from('profissionais_clinicas')
              .insert([{ profissional_id: profSelecionado.id, clinica_id: clinicaId }]);
          setVinculosDoProf(prev => [...prev, clinicaId]);
      }
  }

  return (
    <div className="max-w-5xl mx-auto pb-20 space-y-8 animate-fade-in">
      
      {/* HEADER */}
      <div>
          <h1 className="text-3xl font-black text-slate-800">Configurações</h1>
          <p className="text-slate-500 font-medium">Gerencie suas unidades e permissões da equipe.</p>
      </div>

      {/* ABAS */}
      <div className="flex gap-4 border-b border-slate-200">
          <button onClick={() => setAbaAtiva('clinicas')} className={`pb-4 px-2 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${abaAtiva === 'clinicas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              <Building2 size={18}/> Minhas Clínicas
          </button>
          <button onClick={() => setAbaAtiva('equipe')} className={`pb-4 px-2 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${abaAtiva === 'equipe' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              <Users size={18}/> Acesso da Equipe
          </button>
      </div>

      {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-slate-300"/></div> : (
        <>
            {/* CONTEÚDO: CLÍNICAS */}
            {abaAtiva === 'clinicas' && (
                <div className="space-y-6 animate-in slide-in-from-left-4">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-700 text-lg">Unidades Cadastradas</h3>
                            <button onClick={() => setModalClinica(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200"><Plus size={16}/> Nova Clínica</button>
                        </div>
                        
                        <div className="space-y-3">
                            {clinicas.map(c => (
                                <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-blue-600 border border-slate-200 font-bold"><Building2 size={20}/></div>
                                        <span className="font-bold text-slate-700">{c.nome}</span>
                                    </div>
                                    <button onClick={() => excluirClinica(c.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-white rounded-lg transition-all"><Trash2 size={18}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* CONTEÚDO: EQUIPE */}
            {abaAtiva === 'equipe' && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-700 text-lg">Profissionais e Vínculos</h3>
                            <p className="text-xs text-slate-400 font-medium">Clique em "Gerenciar Acesso" para definir onde cada um trabalha.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {profissionais.map(p => (
                                <div key={p.id} className="p-5 border border-slate-100 rounded-2xl bg-slate-50 hover:bg-white hover:shadow-md transition-all">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg">{p.nome.charAt(0)}</div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">{p.nome}</h4>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${p.nivel_acesso === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}`}>{p.cargo || 'Dentista'}</span>
                                        </div>
                                    </div>
                                    <button onClick={() => abrirVinculos(p)} className="w-full py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2">
                                        <MapPin size={16}/> Gerenciar Clínicas
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
      )}

      {/* MODAL NOVA CLÍNICA */}
      {modalClinica && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                  <h3 className="font-bold text-lg mb-4">Cadastrar Nova Unidade</h3>
                  <input autoFocus value={novaClinica} onChange={e => setNovaClinica(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold mb-4" placeholder="Ex: Filial Centro" />
                  <div className="flex gap-2">
                      <button onClick={() => setModalClinica(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Cancelar</button>
                      <button onClick={criarClinica} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Salvar</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL VÍNCULOS */}
      {modalVinculo && profSelecionado && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6">
                      <div>
                          <h3 className="font-bold text-lg">Onde {profSelecionado.nome.split(' ')[0]} atende?</h3>
                          <p className="text-xs text-slate-400">Marque as clínicas permitidas.</p>
                      </div>
                      <button onClick={() => setModalVinculo(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                  </div>
                  
                  <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                      {clinicas.map(c => {
                          const ativo = vinculosDoProf.includes(c.id);
                          return (
                              <button key={c.id} onClick={() => toggleVinculo(c.id)} className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${ativo ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                                  <span className={`font-bold ${ativo ? 'text-blue-700' : 'text-slate-600'}`}>{c.nome}</span>
                                  <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${ativo ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300'}`}>
                                      {ativo && <Check size={14}/>}
                                  </div>
                              </button>
                          );
                      })}
                  </div>
                  
                  <button onClick={() => setModalVinculo(false)} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Concluir</button>
              </div>
          </div>
      )}

    </div>
  );
}