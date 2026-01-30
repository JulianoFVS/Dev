const fs = require('fs');
const path = require('path');

console.log('🚀 Instalando a Versão Final do ORTUS (Financeiro, Catálogo e Arquivos)...');

// FUNÇÃO SEGURA PARA SALVAR ARQUIVOS
function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    const pasta = path.dirname(caminhoCompleto);

    // Cria a pasta se não existir (recursive garante que cria pai e filho se precisar)
    if (!fs.existsSync(pasta)) {
        fs.mkdirSync(pasta, { recursive: true });
        console.log(`📁 Pasta criada: ${pasta}`);
    }

    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Arquivo criado: ${caminhoRelativo}`);
}

// ==========================================
// 1. CÓDIGO: CONFIGURAÇÕES
// ==========================================
const configPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Save, Loader2, Settings } from 'lucide-react';

export default function Configuracoes() {
  const [servicos, setServicos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '' });

  useEffect(() => { fetchServicos(); }, []);

  async function fetchServicos() {
    const { data } = await supabase.from('servicos').select('*').order('nome');
    if (data) setServicos(data);
  }

  async function adicionarServico(e: any) {
    e.preventDefault();
    if (!novoServico.nome || !novoServico.valor) return;
    setLoading(true);
    await supabase.from('servicos').insert([{ nome: novoServico.nome, valor: parseFloat(novoServico.valor) }]);
    setNovoServico({ nome: '', valor: '' });
    fetchServicos();
    setLoading(false);
  }

  async function excluirServico(id: number) {
    if (!confirm('Excluir este serviço?')) return;
    await supabase.from('servicos').delete().eq('id', id);
    fetchServicos();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Settings className="text-teal-600"/> Catálogo de Procedimentos
        </h2>
        <p className="text-slate-500 mb-6">Cadastre seus preços fixos para agilizar o agendamento.</p>

        <form onSubmit={adicionarServico} className="flex gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
            <div className="flex-1">
                <label className="block text-sm font-bold text-slate-700 mb-1">Nome do Procedimento</label>
                <input value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} placeholder="Ex: Clareamento" className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div className="w-32">
                <label className="block text-sm font-bold text-slate-700 mb-1">Valor (R$)</label>
                <input type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} placeholder="0.00" className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <button disabled={loading} className="bg-teal-600 text-white p-2.5 rounded-lg hover:bg-teal-700 font-bold flex items-center gap-2">
                {loading ? <Loader2 className="animate-spin"/> : <Plus size={20}/>} Adicionar
            </button>
        </form>

        <div className="space-y-2">
            {servicos.map(s => (
                <div key={s.id} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg hover:border-teal-200 transition-colors">
                    <span className="font-medium text-slate-700">{s.nome}</span>
                    <div className="flex items-center gap-4">
                        <span className="font-bold text-teal-600">R$ {s.valor}</span>
                        <button onClick={() => excluirServico(s.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>
                    </div>
                </div>
            ))}
            {servicos.length === 0 && <p className="text-center text-slate-400 py-4">Nenhum serviço cadastrado.</p>}
        </div>
      </div>
    </div>
  );
}
`;

// ==========================================
// 2. CÓDIGO: FINANCEIRO
// ==========================================
const financeiroPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DollarSign, TrendingUp, TrendingDown, Plus, Trash2, Calendar, Filter } from 'lucide-react';

export default function Financeiro() {
  const [entradas, setEntradas] = useState<any[]>([]);
  const [saidas, setSaidas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [novaDespesa, setNovaDespesa] = useState({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0] });
  const [mes, setMes] = useState(new Date().getMonth());
  const [ano, setAno] = useState(new Date().getFullYear());

  useEffect(() => { carregarFinanceiro(); }, [mes, ano]);

  async function carregarFinanceiro() {
    const inicio = new Date(ano, mes, 1).toISOString();
    const fim = new Date(ano, mes + 1, 0).toISOString();

    const { data: ent } = await supabase.from('agendamentos').select('id, procedimento, valor, data_hora, pacientes(nome)').eq('status', 'concluido').gte('data_hora', inicio).lte('data_hora', fim);
    const { data: sai } = await supabase.from('despesas').select('*').gte('data', inicio).lte('data', fim);

    if (ent) setEntradas(ent);
    if (sai) setSaidas(sai);
  }

  async function adicionarDespesa(e: any) {
    e.preventDefault();
    if (!novaDespesa.descricao || !novaDespesa.valor) return;
    setLoading(true);
    await supabase.from('despesas').insert([{ descricao: novaDespesa.descricao, valor: parseFloat(novaDespesa.valor), data: novaDespesa.data }]);
    setNovaDespesa({ ...novaDespesa, descricao: '', valor: '' });
    carregarFinanceiro();
    setLoading(false);
  }

  async function excluirDespesa(id: number) {
    if (!confirm('Apagar despesa?')) return;
    await supabase.from('despesas').delete().eq('id', id);
    carregarFinanceiro();
  }

  const totalEntradas = entradas.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
  const totalSaidas = saidas.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
  const saldo = totalEntradas - totalSaidas;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><DollarSign className="text-teal-600"/> Financeiro</h2>
        <div className="flex gap-2">
            <select value={mes} onChange={e => setMes(Number(e.target.value))} className="p-2 border rounded-lg outline-none bg-slate-50">
                {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} className="p-2 border rounded-lg outline-none bg-slate-50">
                <option value={2025}>2025</option><option value={2026}>2026</option>
            </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
            <p className="text-green-600 font-bold text-sm flex items-center gap-1"><TrendingUp size={16}/> Entradas</p>
            <p className="text-3xl font-bold text-green-700 mt-1">R$ {totalEntradas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
        </div>
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
            <p className="text-red-600 font-bold text-sm flex items-center gap-1"><TrendingDown size={16}/> Saídas</p>
            <p className="text-3xl font-bold text-red-700 mt-1">R$ {totalSaidas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 font-bold text-sm">Saldo Líquido</p>
            <p className={\`text-3xl font-bold mt-1 \${saldo >= 0 ? 'text-teal-600' : 'text-red-600'}\`}>R$ {saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Registrar Despesa</h3>
            <form onSubmit={adicionarDespesa} className="flex gap-2 mb-6">
                <input value={novaDespesa.descricao} onChange={e => setNovaDespesa({...novaDespesa, descricao: e.target.value})} placeholder="Ex: Aluguel" className="flex-1 p-2 border rounded-lg outline-none" required />
                <input type="number" value={novaDespesa.valor} onChange={e => setNovaDespesa({...novaDespesa, valor: e.target.value})} placeholder="R$" className="w-24 p-2 border rounded-lg outline-none" required />
                <button disabled={loading} className="bg-red-500 text-white p-2 rounded-lg hover:bg-red-600"><Plus/></button>
            </form>
            <div className="space-y-2 max-h-80 overflow-y-auto">
                {saidas.map(s => (
                    <div key={s.id} className="flex justify-between items-center p-3 bg-red-50/50 rounded-lg border border-red-100 text-sm">
                        <div><p className="font-bold text-slate-700">{s.descricao}</p><p className="text-xs text-slate-400">{new Date(s.data).toLocaleDateString('pt-BR')}</p></div>
                        <div className="flex items-center gap-3"><span className="font-bold text-red-600">- R$ {s.valor}</span><button onClick={() => excluirDespesa(s.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button></div>
                    </div>
                ))}
            </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Entradas (Consultas)</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
                {entradas.length === 0 && <p className="text-slate-400 text-sm">Nenhuma consulta concluída neste mês.</p>}
                {entradas.map(e => (
                    <div key={e.id} className="flex justify-between items-center p-3 bg-green-50/50 rounded-lg border border-green-100 text-sm">
                        <div><p className="font-bold text-slate-700">{e.pacientes?.nome}</p><p className="text-xs text-slate-400">{e.procedimento} • {new Date(e.data_hora).toLocaleDateString('pt-BR')}</p></div>
                        <span className="font-bold text-green-600">+ R$ {e.valor}</span>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}
`;

// ==========================================
// 3. CÓDIGO: PRONTUÁRIO
// ==========================================
const prontuarioUpdate = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Phone, Calendar, FileText, ChevronLeft, Activity, Upload, Paperclip, Trash2, Eye } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Prontuario() {
  const params = useParams();
  const router = useRouter();
  const [paciente, setPaciente] = useState<any>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [arquivos, setArquivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { carregarDados(); }, [params.id]);

  async function carregarDados() {
    const { data: pac } = await supabase.from('pacientes').select('*').eq('id', params.id).single();
    if (!pac) return router.push('/pacientes');
    setPaciente(pac);
    const { data: agenda } = await supabase.from('agendamentos').select('*').eq('paciente_id', params.id).order('data_hora', { ascending: false });
    if (agenda) setHistorico(agenda);
    const { data: arq } = await supabase.from('anexos').select('*').eq('paciente_id', params.id).order('created_at', { ascending: false });
    if (arq) setArquivos(arq);
    setLoading(false);
  }

  async function handleFileUpload(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = \`\${Date.now()}.\${fileExt}\`;
    const filePath = \`\${params.id}/\${fileName}\`;
    const { error: uploadError } = await supabase.storage.from('arquivos').upload(filePath, file);
    if (uploadError) { alert('Erro no upload: ' + uploadError.message); } 
    else {
        const { data: publicUrl } = supabase.storage.from('arquivos').getPublicUrl(filePath);
        await supabase.from('anexos').insert([{ paciente_id: params.id, nome_arquivo: file.name, url: publicUrl.publicUrl, tipo: fileExt }]);
        carregarDados();
    }
    setUploading(false);
  }

  async function deletarArquivo(id: number) {
    if(!confirm('Excluir arquivo?')) return;
    await supabase.from('anexos').delete().eq('id', id);
    carregarDados();
  }

  if (loading) return <div className="p-8 text-center text-slate-400">Carregando...</div>;
  const agora = new Date();
  const agendamentosFuturos = historico.filter(h => new Date(h.data_hora) > agora);
  const agendamentosPassados = historico.filter(h => new Date(h.data_hora) <= agora);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-10">
      <Link href="/pacientes" className="inline-flex items-center text-slate-500 hover:text-teal-600 transition-colors font-medium text-sm"><ChevronLeft size={16} className="mr-1"/> Voltar para Lista</Link>
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-start">
        <div className="w-24 h-24 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold text-3xl shrink-0">{paciente.nome.charAt(0).toUpperCase()}</div>
        <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-800">{paciente.nome}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-slate-500 text-sm">
                <div className="flex items-center gap-1"><Phone size={14}/> {paciente.telefone}</div>
                <div className="flex items-center gap-1"><Activity size={14}/> {historico.length} consultas</div>
            </div>
            <a href={\`https://wa.me/55\${paciente.telefone.replace(/[^0-9]/g, '')}\`} target="_blank" className="mt-4 inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-100 transition-colors border border-green-200"><Phone size={14} /> WhatsApp</a>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
            <div className="space-y-2">
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Próximas Consultas</h3>
                {agendamentosFuturos.length === 0 ? (<div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400">Nada agendado.</div>) : (agendamentosFuturos.map(item => (<div key={item.id} className="bg-white p-3 rounded-xl border-l-4 border-l-teal-500 shadow-sm border border-slate-100"><p className="font-bold text-slate-800 text-sm">{new Date(item.data_hora).toLocaleDateString('pt-BR')}</p><p className="text-xs text-teal-600 font-bold">{new Date(item.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} - {item.procedimento}</p></div>)))}
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2"><Paperclip size={16}/> Anexos</h3>
                    <label className="cursor-pointer text-teal-600 hover:text-teal-700 bg-teal-50 p-1.5 rounded-lg transition-colors"><Upload size={16} /><input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} /></label>
                </div>
                {uploading && <p className="text-xs text-teal-600 animate-pulse mb-2">Enviando arquivo...</p>}
                <div className="space-y-2">
                    {arquivos.length === 0 && <p className="text-xs text-slate-400 text-center py-2">Sem arquivos.</p>}
                    {arquivos.map(arq => (<div key={arq.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg text-xs border border-slate-100 group"><a href={arq.url} target="_blank" className="flex items-center gap-2 text-slate-600 hover:text-teal-600 font-medium truncate flex-1"><FileText size={14} className="shrink-0"/> <span className="truncate">{arq.nome_arquivo}</span></a><button onClick={() => deletarArquivo(arq.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button></div>))}
                </div>
            </div>
        </div>
        <div className="md:col-span-2 space-y-4">
            <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Histórico Clínico</h3>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {agendamentosPassados.length === 0 ? (<div className="p-8 text-center text-slate-400">Nenhum atendimento realizado.</div>) : (agendamentosPassados.map(item => (<div key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex gap-4"><div className="flex flex-col items-center min-w-[50px]"><span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(item.data_hora).toLocaleString('pt-BR', {month:'short'}).replace('.','')}</span><span className="text-lg font-bold text-slate-700 leading-none">{new Date(item.data_hora).getDate()}</span></div><div className="flex-1"><div className="flex justify-between items-start"><h4 className="font-bold text-slate-800 text-sm">{item.procedimento}</h4><span className={\`text-[10px] px-2 py-0.5 rounded-full border uppercase font-bold \${item.status === 'concluido' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}\`}>{item.status || 'Agendado'}</span></div>{item.observacoes && <div className="mt-2 bg-yellow-50 p-2 rounded-lg text-xs text-yellow-800 border border-yellow-100 italic">"{item.observacoes}"</div>}{item.status === 'concluido' && item.valor > 0 && <p className="text-xs text-green-600 font-bold mt-1">R$ {item.valor}</p>}</div></div>)))}
            </div>
        </div>
      </div>
    </div>
  );
}
`;

// ==========================================
// 4. CÓDIGO: AGENDA
// ==========================================
const agendaUpdate = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight, X, Loader2, Trash2, Plus, CheckCircle, XCircle, DollarSign, FileText } from 'lucide-react';

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function Agenda() {
  const [date, setDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);

  const [formData, setFormData] = useState({ id: null, title: '', date: '', time: '08:00', theme: 'blue', paciente_id: '', valor: '0', observacoes: '', status: 'agendado' });

  useEffect(() => { fetchEvents(); fetchPacientes(); fetchServicos(); }, [date]); 

  async function fetchEvents() {
    const start = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString();
    const { data } = await supabase.from('agendamentos').select('*, pacientes(nome)').gte('data_hora', start).lte('data_hora', end).neq('status', 'cancelado');
    if (data) setEvents(data);
  }
  async function fetchPacientes() { const { data } = await supabase.from('pacientes').select('id, nome').order('nome'); if (data) setPacientes(data); }
  async function fetchServicos() { const { data } = await supabase.from('servicos').select('*').order('nome'); if (data) setServicos(data); }

  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const blankDays = Array.from({ length: firstDayOfMonth });
  const dayArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const handlePrevMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1));
  const handleNextMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));

  const openDateModal = (day: number) => {
    const formattedDate = \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`;
    setFormData({ id: null, title: '', date: formattedDate, time: '09:00', theme: 'blue', paciente_id: '', valor: '0', observacoes: '', status: 'agendado' });
    setOpenModal(true);
  };

  const openEditModal = (e: any, event: any) => {
    e.stopPropagation(); 
    const d = new Date(event.data_hora);
    setFormData({ id: event.id, title: event.procedimento, date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5), theme: event.cor || 'blue', paciente_id: event.paciente_id, valor: event.valor || '0', observacoes: event.observacoes || '', status: event.status || 'agendado' });
    setOpenModal(true);
  }

  async function saveEvent() {
    if (!formData.title || !formData.paciente_id) return alert('Preencha paciente e procedimento');
    setLoading(true);
    const payload = { paciente_id: formData.paciente_id, data_hora: \`\${formData.date}T\${formData.time}:00\`, procedimento: formData.title, cor: formData.theme, valor: parseFloat(formData.valor), observacoes: formData.observacoes, status: formData.status };
    if (formData.id) await supabase.from('agendamentos').update(payload).eq('id', formData.id);
    else await supabase.from('agendamentos').insert([payload]);
    setOpenModal(false); fetchEvents(); setLoading(false);
  }

  const handleServiceSelect = (e: any) => {
    const servicoId = e.target.value;
    if (!servicoId) return;
    const servico = servicos.find(s => s.id == servicoId);
    if (servico) { setFormData(prev => ({ ...prev, title: servico.nome, valor: servico.valor })); }
  }

  const themes = [ { value: "blue", label: "Agendado", bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" }, { value: "green", label: "Concluído", bg: "bg-green-100", text: "text-green-800", border: "border-green-200" }, { value: "red", label: "Cancelado", bg: "bg-red-100", text: "text-red-800", border: "border-red-200" }, { value: "purple", label: "Cirurgia", bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200" } ];

  return (
    <div className="antialiased sans-serif bg-slate-50 h-full flex flex-col animate-fade-in pb-20 md:pb-0">
      <div className="container mx-auto px-2 py-4 md:px-4 md:py-10">
        <div className="bg-white rounded-t-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="text-lg md:text-xl font-bold text-slate-800">{MONTH_NAMES[date.getMonth()]}</span><span className="text-lg md:text-xl text-slate-500 font-normal">{date.getFullYear()}</span></div>
            <div className="flex gap-2"><button onClick={handlePrevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200"><ChevronLeft size={20} /></button><button onClick={() => setDate(new Date())} className="px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200 text-sm font-bold">Hoje</button><button onClick={handleNextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200"><ChevronRight size={20} /></button></div>
        </div>
        <div className="bg-white shadow-sm rounded-b-xl border-x border-b border-slate-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">{DAYS.map(d => <div key={d} className="py-3 text-center text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wide">{d}</div>)}</div>
            <div className="grid grid-cols-7">
                {blankDays.map((_, i) => <div key={\`blank-\${i}\`} className="h-24 md:h-40 border-b border-r border-slate-100 bg-slate-50/30"></div>)}
                {dayArray.map(day => {
                    const currentDayStr = \`\${date.getFullYear()}-\${String(date.getMonth()+1).padStart(2,'0')}-\${String(day).padStart(2,'0')}\`;
                    const dayEvents = events.filter(e => e.data_hora.startsWith(currentDayStr));
                    const isToday = new Date().toISOString().split('T')[0] === currentDayStr;
                    return (
                        <div key={day} onClick={() => openDateModal(day)} className={\`h-24 md:h-40 border-b border-r border-slate-100 p-1 md:p-2 relative cursor-pointer hover:bg-slate-50 transition-colors group \${isToday ? 'bg-teal-50/30' : ''}\`}>
                            <span className={\`w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full text-xs md:text-sm font-bold mb-1 \${isToday ? 'bg-teal-600 text-white shadow-sm shadow-teal-200' : 'text-slate-700'}\`}>{day}</span>
                            <div className="space-y-1 overflow-y-auto max-h-[calc(100%-1.5rem)] no-scrollbar">{dayEvents.map(ev => { const theme = themes.find(t => t.value === ev.cor) || themes[0]; const hora = new Date(ev.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}); return (<div key={ev.id} onClick={(e) => openEditModal(e, ev)} className={\`px-1.5 py-0.5 md:px-2 md:py-1 rounded border text-[10px] md:text-xs truncate \${theme.bg} \${theme.text} \${theme.border} shadow-sm\`}> <span className="font-bold mr-1 hidden md:inline">{hora}</span>{ev.pacientes?.nome.split(' ')[0]}</div>)})}</div>
                            <div className="absolute top-1 right-1 md:opacity-0 md:group-hover:opacity-100 text-teal-600 md:bg-teal-50 rounded-full p-1 transition-opacity"><Plus size={14} className="md:w-4 md:h-4" /></div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
      <button onClick={() => openDateModal(new Date().getDate())} className="md:hidden fixed bottom-6 right-6 bg-teal-600 text-white p-4 rounded-full shadow-xl z-30 hover:bg-teal-700 active:scale-90 transition-all"><Plus size={24} /></button>
      {openModal && (
        <div className="fixed z-50 inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50"><h3 className="font-bold text-slate-800 text-lg">{formData.id ? 'Gerenciar' : 'Novo Agendamento'}</h3><button onClick={() => setOpenModal(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24}/></button></div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    {formData.id && ( <div className="flex gap-2 mb-2 p-2 bg-slate-50 rounded-lg border border-slate-100 justify-center"><button type="button" onClick={() => setFormData(p => ({...p, status: 'concluido', theme: 'green'}))} className={\`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all \${formData.status === 'concluido' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-white text-slate-500 hover:bg-green-50 hover:text-green-600 border'}\`}><CheckCircle size={16}/> Concluir</button><button type="button" onClick={() => setFormData(p => ({...p, status: 'cancelado', theme: 'red'}))} className={\`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all \${formData.status === 'cancelado' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 border'}\`}><XCircle size={16}/> Cancelar</button></div> )}
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label><select value={formData.paciente_id} onChange={e => setFormData({...formData, paciente_id: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500"><option value="">Selecione...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none" /></div><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hora</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none" /></div></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Procedimento</label><select onChange={handleServiceSelect} className="w-full mb-2 bg-slate-100 border-none rounded-lg text-sm p-2 text-slate-600"><option value="">✨ Selecionar do Catálogo...</option>{servicos.map(s => <option key={s.id} value={s.id}>{s.nome} - R$ {s.valor}</option>)}</select><input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ou digite manualmente..." className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500" /></div>
                    <div className="grid grid-cols-2 gap-4"><div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><DollarSign size={14}/> Valor (R$)</label><input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full bg-green-50 border border-green-200 text-green-800 font-bold rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500" placeholder="0.00" /></div><div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cor</label><div className="flex gap-1 h-[42px] items-center">{themes.map(t => <button key={t.value} type="button" onClick={() => setFormData({...formData, theme: t.value})} className={\`w-full h-8 rounded border-2 transition-all \${t.bg} \${formData.theme === t.value ? 'border-slate-600 scale-110 shadow-sm' : 'border-transparent opacity-50'}\`} />)}</div></div></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><FileText size={14}/> Observações</label><textarea rows={2} value={formData.observacoes} onChange={e => setFormData({...formData, observacoes: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-teal-500 text-sm" placeholder="Detalhes..." /></div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-between items-center border-t border-slate-100"><button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Cancelar</button><button onClick={saveEvent} disabled={loading} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition-transform active:scale-95 flex items-center gap-2">{loading && <Loader2 size={16} className="animate-spin"/>} Salvar</button></div>
            </div>
        </div>
      )}
    </div>
  );
}
`;

// ==========================================
// 5. CÓDIGO: MENU ATUALIZADO
// ==========================================
const authGuardUpdate = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, LogOut, Calendar, Menu, X, DollarSign, Settings } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false);
      if (!session && pathname !== '/login') router.push('/login');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session && pathname !== '/login') router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, [pathname, router]);

  if (pathname === '/login') return <>{children}</>;
  if (loading) return <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-teal-600 animate-pulse">Carregando...</div>;
  if (!session) return null;

  const LinksDoMenu = () => (
    <>
      <Link href="/" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname === '/' ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><LayoutDashboard size={20} /> Dashboard</Link>
      <Link href="/agenda" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname.includes('/agenda') ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><Calendar size={20} /> Agenda</Link>
      <Link href="/pacientes" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname.includes('/pacientes') ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><Users size={20} /> Pacientes</Link>
      <Link href="/financeiro" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname.includes('/financeiro') ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><DollarSign size={20} /> Financeiro</Link>
      <Link href="/configuracoes" onClick={() => setMenuMobileAberto(false)} className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${pathname.includes('/configuracoes') ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}\`}><Settings size={20} /> Ajustes</Link>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 fixed h-full hidden md:flex flex-col z-20">
        <div className="p-6"><h1 className="text-2xl font-bold text-teal-600 tracking-tight">ORTUS</h1><p className="text-xs text-slate-400 font-medium mt-1">Clinic Management</p></div>
        <nav className="flex-1 px-4 space-y-2 mt-4"><LinksDoMenu /></nav>
        <div className="p-4 border-t border-slate-100"><button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 px-4 py-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"><LogOut size={16} /> Sair</button></div>
      </aside>
      <div className="md:hidden fixed top-0 w-full bg-white border-b border-slate-200 z-30 px-4 py-3 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-teal-600">ORTUS</h1>
        <button onClick={() => setMenuMobileAberto(!menuMobileAberto)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">{menuMobileAberto ? <X size={24} /> : <Menu size={24} />}</button>
      </div>
      {menuMobileAberto && (
        <div className="md:hidden fixed inset-0 z-20 bg-slate-900/50 backdrop-blur-sm animate-in fade-in" onClick={() => setMenuMobileAberto(false)}>
            <div className="absolute right-0 top-0 h-full w-64 bg-white shadow-2xl p-4 pt-20 space-y-2 animate-in slide-in-from-right" onClick={e => e.stopPropagation()}><LinksDoMenu /><div className="border-t border-slate-100 mt-4 pt-4"><button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 px-4 py-2 text-red-400 hover:bg-red-50 rounded-lg"><LogOut size={16} /> Sair</button></div></div>
        </div>
      )}
      <main className="flex-1 md:ml-64 p-4 md:p-8 mt-16 md:mt-0 overflow-x-hidden">{children}</main>
    </div>
  );
}
`;

// EXECUÇÃO DA CRIAÇÃO DOS ARQUIVOS
salvarArquivo('app/configuracoes/page.tsx', configPage);
salvarArquivo('app/financeiro/page.tsx', financeiroPage);
salvarArquivo('app/pacientes/[id]/page.tsx', prontuarioUpdate);
salvarArquivo('app/agenda/page.tsx', agendaUpdate);
salvarArquivo('components/AuthGuard.tsx', authGuardUpdate);

console.log('🎉 TUDO PRONTO! O erro foi corrigido.');