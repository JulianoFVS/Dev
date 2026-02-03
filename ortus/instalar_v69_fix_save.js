const fs = require('fs');
const path = require('path');

console.log('🚑 Instalando V69: Corrigindo importação do ícone Save...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Corrigido: ${caminhoRelativo}`);
}

const configPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
// ADICIONEI O 'Save' AQUI NA LISTA ABAIXO
import { Building2, Users, Plus, Trash2, MapPin, Check, X, Loader2, Edit, UserPlus, Shield, User, Camera, FileText, Phone, Mail, Save } from 'lucide-react';

export default function Configuracoes() {
  const [abaAtiva, setAbaAtiva] = useState('clinicas');
  const [loading, setLoading] = useState(true);
  
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  
  // MODAL CLÍNICA
  const [modalClinica, setModalClinica] = useState(false);
  const [novaClinica, setNovaClinica] = useState('');

  // MODAL PROFISSIONAL COMPLETO
  const [modalProf, setModalProf] = useState(false);
  const [profForm, setProfForm] = useState({ 
      id: '', 
      nome: '', 
      cargo: 'Dentista', 
      nivel_acesso: 'comum', 
      email: '',
      cpf: '',
      cro: '',
      telefone: '',
      foto_url: ''
  });
  const [editandoProf, setEditandoProf] = useState(false);

  // MODAL VINCULOS
  const [modalVinculo, setModalVinculo] = useState(false);
  const [profSelecionado, setProfSelecionado] = useState<any>(null);
  const [vinculosDoProf, setVinculosDoProf] = useState<number[]>([]);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
      setLoading(true);
      const { data: c } = await supabase.from('clinicas').select('*').order('nome');
      const { data: p } = await supabase.from('profissionais').select('*').order('nome');
      setClinicas(c || []);
      setProfissionais(p || []);
      setLoading(false);
  }

  // --- CLÍNICAS ---
  async function criarClinica() {
      if (!novaClinica) return;
      const { error } = await supabase.from('clinicas').insert([{ nome: novaClinica }]);
      if (error) alert('Erro: ' + error.message);
      else { setNovaClinica(''); setModalClinica(false); carregarDados(); }
  }

  async function excluirClinica(id: number) {
      if (!confirm('Excluir esta clínica?')) return;
      await supabase.from('clinicas').delete().eq('id', id);
      carregarDados();
  }

  // --- PROFISSIONAIS (CRUD COMPLETO) ---
  function abrirNovoProf() {
      setProfForm({ 
          id: '', nome: '', cargo: 'Dentista', nivel_acesso: 'comum', 
          email: '', cpf: '', cro: '', telefone: '', foto_url: '' 
      });
      setEditandoProf(false);
      setModalProf(true);
  }

  function abrirEditarProf(p: any) {
      setProfForm({ 
          id: p.id, 
          nome: p.nome, 
          cargo: p.cargo || 'Dentista', 
          nivel_acesso: p.nivel_acesso || 'comum', 
          email: p.email || '',
          cpf: p.cpf || '',
          cro: p.cro || '',
          telefone: p.telefone || '',
          foto_url: p.foto_url || ''
      });
      setEditandoProf(true);
      setModalProf(true);
  }

  async function salvarProfissional() {
      if (!profForm.nome) return alert('Nome é obrigatório');

      const dadosParaSalvar = {
          nome: profForm.nome,
          cargo: profForm.cargo,
          nivel_acesso: profForm.nivel_acesso,
          email: profForm.email,
          cpf: profForm.cpf,
          cro: profForm.cro,
          telefone: profForm.telefone,
          foto_url: profForm.foto_url
      };

      if (editandoProf) {
          const { error } = await supabase.from('profissionais').update(dadosParaSalvar).eq('id', profForm.id);
          if (error) alert('Erro ao atualizar: ' + error.message);
      } else {
          const { error } = await supabase.from('profissionais').insert([dadosParaSalvar]);
          if (error) alert('Erro ao criar: ' + error.message);
      }
      setModalProf(false);
      carregarDados();
  }

  async function excluirProfissional() {
      if (!editandoProf) return;
      if (!confirm('Tem certeza? Isso apagará o profissional e pode afetar agendamentos passados.')) return;
      
      const { error } = await supabase.from('profissionais').delete().eq('id', profForm.id);
      if (error) alert('Erro ao excluir: ' + error.message);
      else {
          setModalProf(false);
          carregarDados();
      }
  }

  // --- VÍNCULOS ---
  async function abrirVinculos(prof: any) {
      setProfSelecionado(prof);
      const { data } = await supabase.from('profissionais_clinicas').select('clinica_id').eq('profissional_id', prof.id);
      if (data) setVinculosDoProf(data.map((v: any) => v.clinica_id));
      setModalVinculo(true);
  }

  async function toggleVinculo(clinicaId: number) {
      const jaTem = vinculosDoProf.includes(clinicaId);
      if (jaTem) {
          await supabase.from('profissionais_clinicas').delete().eq('profissional_id', profSelecionado.id).eq('clinica_id', clinicaId);
          setVinculosDoProf(prev => prev.filter(id => id !== clinicaId));
      } else {
          await supabase.from('profissionais_clinicas').insert([{ profissional_id: profSelecionado.id, clinica_id: clinicaId }]);
          setVinculosDoProf(prev => [...prev, clinicaId]);
      }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 space-y-8 animate-fade-in">
      
      <div>
          <h1 className="text-3xl font-black text-slate-800">Configurações</h1>
          <p className="text-slate-500 font-medium">Gerencie suas unidades e equipe completa.</p>
      </div>

      <div className="flex gap-4 border-b border-slate-200">
          <button onClick={() => setAbaAtiva('clinicas')} className={\`pb-4 px-2 font-bold text-sm flex items-center gap-2 border-b-2 transition-all \${abaAtiva === 'clinicas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}\`}><Building2 size={18}/> Minhas Clínicas</button>
          <button onClick={() => setAbaAtiva('equipe')} className={\`pb-4 px-2 font-bold text-sm flex items-center gap-2 border-b-2 transition-all \${abaAtiva === 'equipe' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}\`}><Users size={18}/> Acesso da Equipe</button>
      </div>

      {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-slate-300"/></div> : (
        <>
            {/* ABA CLÍNICAS */}
            {abaAtiva === 'clinicas' && (
                <div className="space-y-6 animate-in slide-in-from-left-4">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-700 text-lg">Unidades Cadastradas</h3>
                            <button onClick={() => setModalClinica(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200"><Plus size={16}/> Nova Clínica</button>
                        </div>
                        <div className="space-y-3">
                            {clinicas.map(c => (
                                <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors">
                                    <div className="flex items-center gap-4"><div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-blue-600 border border-slate-200 font-bold"><Building2 size={20}/></div><span className="font-bold text-slate-700">{c.nome}</span></div>
                                    <button onClick={() => excluirClinica(c.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-white rounded-lg transition-all"><Trash2 size={18}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ABA EQUIPE */}
            {abaAtiva === 'equipe' && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-700 text-lg">Profissionais</h3>
                            <button onClick={abrirNovoProf} className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-green-700 flex items-center gap-2 shadow-lg shadow-green-200"><UserPlus size={16}/> Adicionar Profissional</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {profissionais.map(p => (
                                <div key={p.id} className="p-5 border border-slate-100 rounded-2xl bg-slate-50 hover:bg-white hover:shadow-md transition-all relative group flex flex-col justify-between h-full">
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg overflow-hidden border-2 border-white shadow-sm">
                                                    {p.foto_url ? <img src={p.foto_url} className="w-full h-full object-cover"/> : p.nome.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 leading-tight">{p.nome}</h4>
                                                    <p className="text-xs text-slate-400 font-bold">{p.cargo}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => abrirEditarProf(p)} className="p-2 text-slate-400 hover:text-blue-600 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-all"><Edit size={16}/></button>
                                        </div>
                                        
                                        <div className="space-y-2 mb-4">
                                            {p.email && <div className="flex items-center gap-2 text-xs text-slate-500 font-medium"><Mail size={12}/> {p.email}</div>}
                                            {p.telefone && <div className="flex items-center gap-2 text-xs text-slate-500 font-medium"><Phone size={12}/> {p.telefone}</div>}
                                            <div className="flex items-center gap-2 mt-2">
                                                {p.nivel_acesso === 'admin' && <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-purple-100 text-purple-700 flex items-center gap-1 border border-purple-200"><Shield size={10}/> Admin</span>}
                                                {p.cro && <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1"><FileText size={10}/> CRO: {p.cro}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    <button onClick={() => abrirVinculos(p)} className="w-full py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2 mt-auto">
                                        <MapPin size={14}/> Gerenciar Unidades
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
      )}

      {/* MODAL CLÍNICA */}
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

      {/* MODAL PROFISSIONAL COMPLETO */}
      {modalProf && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white p-8 rounded-3xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 my-auto">
                  <div className="flex justify-between items-start mb-6">
                      <div>
                          <h3 className="font-black text-2xl text-slate-800">{editandoProf ? 'Editar Perfil' : 'Novo Profissional'}</h3>
                          <p className="text-slate-500 font-medium text-sm">Preencha os dados completos do membro da equipe.</p>
                      </div>
                      {editandoProf && (
                          <button onClick={excluirProfissional} className="p-2 text-red-400 hover:bg-red-50 rounded-lg hover:text-red-600 transition-colors" title="Excluir Profissional"><Trash2 size={20}/></button>
                      )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                      {/* Lado Esquerdo */}
                      <div className="space-y-4">
                          <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Nome Completo</label><div className="relative"><User className="absolute left-3 top-3.5 text-slate-300" size={18}/><input value={profForm.nome} onChange={e => setProfForm({...profForm, nome: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Dr. Nome Sobrenome"/></div></div>
                          <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">E-mail</label><div className="relative"><Mail className="absolute left-3 top-3.5 text-slate-300" size={18}/><input value={profForm.email} onChange={e => setProfForm({...profForm, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="email@clinica.com"/></div></div>
                          <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Telefone / WhatsApp</label><div className="relative"><Phone className="absolute left-3 top-3.5 text-slate-300" size={18}/><input value={profForm.telefone} onChange={e => setProfForm({...profForm, telefone: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="(00) 00000-0000"/></div></div>
                      </div>

                      {/* Lado Direito */}
                      <div className="space-y-4">
                          <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Cargo</label><input value={profForm.cargo} onChange={e => setProfForm({...profForm, cargo: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: Ortodontista"/></div>
                          <div className="grid grid-cols-2 gap-3">
                              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">CPF</label><input value={profForm.cpf} onChange={e => setProfForm({...profForm, cpf: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="000.000.000-00"/></div>
                              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">CRO</label><input value={profForm.cro} onChange={e => setProfForm({...profForm, cro: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="UF-00000"/></div>
                          </div>
                          <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Link da Foto (URL)</label><div className="relative"><Camera className="absolute left-3 top-3.5 text-slate-300" size={18}/><input value={profForm.foto_url} onChange={e => setProfForm({...profForm, foto_url: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-xs text-slate-600" placeholder="https://..."/></div></div>
                      </div>
                  </div>

                  {/* Rodapé: Nível de Acesso */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                      <div className="flex items-center gap-3">
                          <div className={\`p-3 rounded-xl \${profForm.nivel_acesso === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-white border border-slate-200 text-slate-400'}\`}><Shield size={24}/></div>
                          <div><h4 className="font-bold text-slate-800 text-sm">Nível de Permissão</h4><p className="text-xs text-slate-500">Admins podem editar clínicas e equipe.</p></div>
                      </div>
                      <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                          <button onClick={() => setProfForm({...profForm, nivel_acesso: 'comum'})} className={\`px-4 py-2 rounded-lg text-xs font-bold transition-all \${profForm.nivel_acesso === 'comum' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}\`}>Comum</button>
                          <button onClick={() => setProfForm({...profForm, nivel_acesso: 'admin'})} className={\`px-4 py-2 rounded-lg text-xs font-bold transition-all \${profForm.nivel_acesso === 'admin' ? 'bg-purple-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}\`}>Admin</button>
                      </div>
                  </div>

                  <div className="flex gap-3">
                      <button onClick={() => setModalProf(false)} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                      <button onClick={salvarProfissional} className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2"><Save size={18}/> Salvar Dados</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL VÍNCULOS */}
      {modalVinculo && profSelecionado && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6">
                      <div><h3 className="font-bold text-lg">Onde {profSelecionado.nome.split(' ')[0]} atende?</h3><p className="text-xs text-slate-400">Marque as clínicas permitidas.</p></div>
                      <button onClick={() => setModalVinculo(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                  </div>
                  <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                      {clinicas.map(c => {
                          const ativo = vinculosDoProf.includes(c.id);
                          return (
                              <button key={c.id} onClick={() => toggleVinculo(c.id)} className={\`w-full flex items-center justify-between p-4 rounded-xl border transition-all \${ativo ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:bg-slate-50'}\`}>
                                  <span className={\`font-bold \${ativo ? 'text-blue-700' : 'text-slate-600'}\`}>{c.nome}</span>
                                  <div className={\`w-6 h-6 rounded-full border flex items-center justify-center \${ativo ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300'}\`}>{ativo && <Check size={14}/>}</div>
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
`;

salvarArquivo('app/configuracoes/page.tsx', configPage);