const fs = require('fs');
const path = require('path');

// 1. CÓDIGO DA NOVA AGENDA (Com status e edição)
const agendaCode = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { addDays, format, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Check, Trash2, Edit2, AlertCircle } from 'lucide-react';

export default function AgendaVisual() {
  const [dataBase, setDataBase] = useState(new Date());
  const [agendamentos, setAgendamentos] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  
  // Modais
  const [modalNovo, setModalNovo] = useState(false);
  const [modalEditar, setModalEditar] = useState<any>(null); // Se tiver dados, abre o modal de edição
  const [loading, setLoading] = useState(false);

  // Form States
  const [form, setForm] = useState({ id: '', paciente_id: '', data_hora: '', procedimento: '', cor: 'blue', status: 'agendado' });

  const inicioDaSemana = startOfWeek(dataBase, { weekStartsOn: 0 });
  const diasDaSemana = Array.from({ length: 7 }).map((_, i) => addDays(inicioDaSemana, i));
  const horarios = Array.from({ length: 11 }).map((_, i) => i + 8);

  async function carregarDados() {
    // Busca agendamentos da semana
    const { data: agenda } = await supabase
      .from('agendamentos')
      .select('*, pacientes(nome, telefone)')
      .gte('data_hora', inicioDaSemana.toISOString())
      .lte('data_hora', addDays(inicioDaSemana, 7).toISOString())
      .neq('status', 'cancelado'); // Não mostra cancelados na grade
    
    if (agenda) setAgendamentos(agenda);

    // Busca pacientes para o select
    const { data: pac } = await supabase.from('pacientes').select('id, nome').order('nome');
    if (pac) setPacientes(pac);
  }

  useEffect(() => { carregarDados(); }, [dataBase]);

  // Salvar (Novo ou Edição)
  async function salvar(e: any) {
    e.preventDefault();
    setLoading(true);
    
    const dados = {
        paciente_id: form.paciente_id,
        data_hora: form.data_hora,
        procedimento: form.procedimento,
        cor: form.cor,
        status: form.status
    };

    let erro;
    if (form.id) {
        // Atualizar existente
        const { error } = await supabase.from('agendamentos').update(dados).eq('id', form.id);
        erro = error;
    } else {
        // Criar novo
        const { error } = await supabase.from('agendamentos').insert([dados]);
        erro = error;
    }

    if (erro) alert(erro.message);
    else { fecharModais(); carregarDados(); }
    setLoading(false);
  }

  // Mudar Status Rápido (Concluir/Excluir)
  async function mudarStatus(id: number, novoStatus: string) {
    if (!confirm('Tem certeza?')) return;
    await supabase.from('agendamentos').update({ status: novoStatus }).eq('id', id);
    setModalEditar(null);
    carregarDados();
  }

  function abrirNovo(dataIso: string) {
    setForm({ id: '', paciente_id: '', data_hora: dataIso, procedimento: '', cor: 'blue', status: 'agendado' });
    setModalNovo(true);
  }

  function abrirEdicao(agendamento: any) {
    setForm({
        id: agendamento.id,
        paciente_id: agendamento.paciente_id,
        data_hora: agendamento.data_hora,
        procedimento: agendamento.procedimento,
        cor: agendamento.cor,
        status: agendamento.status
    });
    setModalEditar(agendamento);
  }

  function fecharModais() {
    setModalNovo(false);
    setModalEditar(null);
  }

  const getAgendamento = (dia: Date, hora: number) => {
    return agendamentos.find(item => {
      const itemData = parseISO(item.data_hora);
      return isSameDay(itemData, dia) && itemData.getHours() === hora;
    });
  };

  const cores: any = {
    blue: 'bg-blue-100 border-blue-200 text-blue-700',
    green: 'bg-green-100 border-green-200 text-green-700',
    purple: 'bg-purple-100 border-purple-200 text-purple-700',
    rose: 'bg-rose-100 border-rose-200 text-rose-700',
    gray: 'bg-slate-100 border-slate-200 text-slate-500 line-through opacity-70', // Estilo para concluído
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
      
      {/* NAVEGAÇÃO SUPERIOR */}
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-700 capitalize">
            {format(dataBase, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm">
            <button onClick={() => setDataBase(addDays(dataBase, -7))} className="p-2 hover:bg-slate-50"><ChevronLeft size={18}/></button>
            <button onClick={() => setDataBase(new Date())} className="px-3 py-2 text-sm border-x border-slate-200 hover:bg-slate-50">Hoje</button>
            <button onClick={() => setDataBase(addDays(dataBase, 7))} className="p-2 hover:bg-slate-50"><ChevronRight size={18}/></button>
          </div>
        </div>
      </div>

      {/* GRADE DA AGENDA */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[800px]">
          {/* Cabeçalho dos Dias */}
          <div className="grid grid-cols-8 border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
            <div className="p-4 text-xs font-medium text-slate-400 text-center uppercase border-r border-slate-100">Horário</div>
            {diasDaSemana.map((dia, i) => (
              <div key={i} className={\`p-3 text-center border-r border-slate-100 \${isSameDay(dia, new Date()) ? 'bg-teal-50/50' : ''}\`}>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">{format(dia, 'EEE', { locale: ptBR })}</p>
                <p className="text-xl font-bold text-slate-700">{format(dia, 'd')}</p>
              </div>
            ))}
          </div>

          {/* Corpo da Grade */}
          <div className="relative">
            {horarios.map((hora) => (
              <div key={hora} className="grid grid-cols-8 border-b border-slate-50 h-24">
                <div className="text-xs text-slate-400 font-medium p-2 text-center border-r border-slate-100 relative -top-3">
                  {hora}:00
                </div>

                {diasDaSemana.map((dia, i) => {
                  const item = getAgendamento(dia, hora);
                  return (
                    <div key={i} className="border-r border-slate-100 p-1 group hover:bg-slate-50 transition-colors">
                      {item ? (
                        <div onClick={() => abrirEdicao(item)} className={\`w-full h-full rounded-lg p-2 text-xs border-l-4 shadow-sm cursor-pointer hover:brightness-95 transition-all \${item.status === 'concluido' ? cores.gray : (cores[item.cor] || cores.blue)}\`}>
                          <p className="font-bold truncate">{item.pacientes?.nome}</p>
                          <p className="opacity-80 truncate">{item.procedimento}</p>
                          {item.status === 'concluido' && <span className="flex items-center gap-1 mt-1 font-bold text-[10px]"><Check size={10}/> Concluído</span>}
                        </div>
                      ) : (
                        <button 
                          onClick={() => {
                            const d = new Date(dia); d.setHours(hora); d.setMinutes(0);
                            // Gambiarra de fuso horário simples
                            const iso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                            abrirNovo(iso);
                          }}
                          className="w-full h-full hidden group-hover:flex items-center justify-center text-teal-600/30"
                        >
                          <Plus size={20} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL DE CRIAÇÃO/EDIÇÃO */}
      {(modalNovo || modalEditar) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl animate-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h3 className="font-bold text-slate-700">{modalEditar ? 'Gerenciar Atendimento' : 'Novo Agendamento'}</h3>
              <button onClick={fecharModais}><X className="text-slate-400 hover:text-red-500" size={20}/></button>
            </div>
            
            <form onSubmit={salvar} className="p-5 space-y-4">
              {!modalEditar && (
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Paciente</label>
                    <select required value={form.paciente_id} onChange={e => setForm({...form, paciente_id: e.target.value})} className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg outline-none">
                      <option value="">Selecione...</option>
                      {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
              )}
              
              {modalEditar && (
                 <div className="bg-slate-50 p-3 rounded-lg mb-4">
                    <p className="font-bold text-slate-800">{modalEditar.pacientes?.nome}</p>
                    <p className="text-xs text-slate-500">{modalEditar.pacientes?.telefone || 'Sem telefone'}</p>
                 </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Data/Hora</label>
                    <input required type="datetime-local" value={form.data_hora} onChange={e => setForm({...form, data_hora: e.target.value})} className="w-full mt-1 p-2 border border-slate-200 rounded-lg outline-none text-sm" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Cor</label>
                    <select value={form.cor} onChange={e => setForm({...form, cor: e.target.value})} className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg outline-none text-sm">
                        <option value="blue">Azul</option>
                        <option value="green">Verde</option>
                        <option value="purple">Roxo</option>
                        <option value="rose">Rosa</option>
                    </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Procedimento</label>
                <input required value={form.procedimento} onChange={e => setForm({...form, procedimento: e.target.value})} className="w-full mt-1 p-2 border border-slate-200 rounded-lg outline-none" />
              </div>

              {/* BOTOES DE ACAO */}
              <div className="pt-2 space-y-2">
                  <button type="submit" disabled={loading} className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-bold hover:bg-teal-700 flex justify-center gap-2">
                    {loading ? <Loader2 className="animate-spin" /> : (modalEditar ? 'Salvar Alterações' : 'Agendar')}
                  </button>
                  
                  {modalEditar && (
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => mudarStatus(form.id, 'concluido')} className="bg-green-100 text-green-700 py-2 rounded-lg font-bold text-sm hover:bg-green-200 flex items-center justify-center gap-1">
                            <Check size={16}/> Concluir
                        </button>
                        <button type="button" onClick={() => mudarStatus(form.id, 'cancelado')} className="bg-red-50 text-red-600 py-2 rounded-lg font-bold text-sm hover:bg-red-100 flex items-center justify-center gap-1">
                            <Trash2 size={16}/> Cancelar
                        </button>
                    </div>
                  )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`;

// 2. CÓDIGO DE PACIENTES (Com Excluir e Busca)
const pacientesCode = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, ChevronRight, X, Loader2, Trash2, Search } from 'lucide-react';
import Link from 'next/link';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [busca, setBusca] = useState('');

  async function fetchPacientes() {
    const { data } = await supabase.from('pacientes').select('*').order('created_at', { ascending: false });
    if (data) setPacientes(data);
  }

  async function criarPaciente(e: any) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('pacientes').insert([{ nome, telefone }]);
    if (error) alert(error.message);
    else { setModalAberto(false); setNome(''); setTelefone(''); fetchPacientes(); }
    setLoading(false);
  }

  async function excluirPaciente(e: any, id: number) {
    e.preventDefault(); // Evita abrir o link
    if (!confirm('Tem certeza? Isso apagará também os prontuários desse paciente.')) return;
    
    // Primeiro apaga os filhos (constraints)
    await supabase.from('agendamentos').delete().eq('paciente_id', id);
    // Depois o pai
    const { error } = await supabase.from('pacientes').delete().eq('id', id);
    
    if (error) alert('Erro ao excluir: ' + error.message);
    else fetchPacientes();
  }

  useEffect(() => { fetchPacientes(); }, []);

  const filtrados = pacientes.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in relative">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Pacientes</h2>
            <p className="text-sm text-slate-400">{pacientes.length} cadastrados</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome..." className="pl-10 p-2 border border-slate-200 rounded-lg w-full outline-none focus:ring-2 focus:ring-teal-500"/>
            </div>
            <button onClick={() => setModalAberto(true)} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 font-medium text-sm flex items-center gap-2 transition-transform active:scale-95 whitespace-nowrap">
                <Plus size={18}/> Novo
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map((p) => (
          <Link key={p.id} href={\`/pacientes/\${p.id}\`}>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all cursor-pointer group relative overflow-hidden flex justify-between items-center">
                <div className="flex gap-4 items-center overflow-hidden">
                    <div className="w-12 h-12 shrink-0 bg-slate-50 group-hover:bg-teal-50 rounded-full flex items-center justify-center text-slate-400 group-hover:text-teal-600 transition-colors font-bold text-lg">
                        {p.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-slate-800 truncate">{p.nome}</h3>
                        <p className="text-sm text-slate-500 truncate">{p.telefone}</p>
                    </div>
                </div>
                <button onClick={(e) => excluirPaciente(e, p.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-10 relative">
                    <Trash2 size={18} />
                </button>
            </div>
          </Link>
        ))}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-700">Novo Paciente</h3>
                    <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                </div>
                <form onSubmit={criarPaciente} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                        <input autoFocus required type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Ex: Maria Silva" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Telefone / WhatsApp</label>
                        <input required type="text" value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="(00) 00000-0000" />
                    </div>
                    <button disabled={loading} type="submit" className="w-full bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 flex justify-center items-center gap-2">
                        {loading ? <Loader2 className="animate-spin" /> : 'Cadastrar Paciente'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  )
}
`;

// 3. CÓDIGO DA DASHBOARD (HOME)
const homeCode = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Calendar, DollarSign, Activity, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const [stats, setStats] = useState({ pacientes: 0, hoje: 0, concluidos: 0 });

  useEffect(() => {
    async function getStats() {
      // Total Pacientes
      const { count: totalPacientes } = await supabase.from('pacientes').select('*', { count: 'exact', head: true });
      
      // Agendamentos Hoje
      const hoje = new Date().toISOString().split('T')[0];
      const { count: totalHoje } = await supabase.from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .gte('data_hora', \`\${hoje}T00:00:00\`)
        .lte('data_hora', \`\${hoje}T23:59:59\`)
        .neq('status', 'cancelado');

      // Total Concluídos (Geral)
      const { count: totalConcluidos } = await supabase.from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'concluido');

      setStats({ 
        pacientes: totalPacientes || 0, 
        hoje: totalHoje || 0,
        concluidos: totalConcluidos || 0
      });
    }
    getStats();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Bem-vindo, Doutor(a)</h1>
        <p className="text-slate-500">Aqui está o resumo da sua clínica hoje.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><Users size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Total de Pacientes</p><p className="text-2xl font-bold text-slate-800">{stats.pacientes}</p></div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-teal-50 text-teal-600 rounded-xl"><Calendar size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Agendados Hoje</p><p className="text-2xl font-bold text-slate-800">{stats.hoje}</p></div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-green-50 text-green-600 rounded-xl"><Activity size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Atendimentos Realizados</p><p className="text-2xl font-bold text-slate-800">{stats.concluidos}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/agenda" className="bg-gradient-to-br from-teal-600 to-teal-800 p-8 rounded-3xl text-white shadow-lg hover:scale-[1.02] transition-transform cursor-pointer">
            <h3 className="text-2xl font-bold mb-2">Acessar Agenda</h3>
            <p className="opacity-80 mb-6">Visualize e gerencie seus compromissos da semana.</p>
            <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg backdrop-blur-sm font-medium">Ver Grade <ChevronRight size={16}/></div>
        </Link>
        <Link href="/pacientes" className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:border-teal-200 hover:shadow-md transition-all cursor-pointer group">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Novo Prontuário</h3>
            <p className="text-slate-500 mb-6">Cadastre pacientes e registre procedimentos no odontograma.</p>
            <div className="inline-flex items-center gap-2 text-teal-600 font-bold group-hover:gap-3 transition-all">Ir para Pacientes <ChevronRight size={16}/></div>
        </Link>
      </div>
    </div>
  );
}
`;

// Escrevendo arquivos
fs.writeFileSync('app/agenda/page.tsx', agendaCode.trim());
console.log('✅ Agenda 2.0 instalada (Edição/Status)');

fs.writeFileSync('app/pacientes/page.tsx', pacientesCode.trim());
console.log('✅ Pacientes 2.0 instalada (Busca/Exclusão)');

fs.writeFileSync('app/page.tsx', homeCode.trim());
console.log('✅ Dashboard Real instalada (Dados do Banco)');