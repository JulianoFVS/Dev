const fs = require('fs');
const path = require('path');

console.log('💰 Corrigindo Relatório Financeiro (Datas e Soma)...');

const financeiroCode = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DollarSign, TrendingUp, TrendingDown, Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react';

export default function Financeiro() {
  const [entradas, setEntradas] = useState<any[]>([]);
  const [saidas, setSaidas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [novaDespesa, setNovaDespesa] = useState({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0] });
  
  // Data atual
  const [mes, setMes] = useState(new Date().getMonth());
  const [ano, setAno] = useState(new Date().getFullYear());

  useEffect(() => { carregarFinanceiro(); }, [mes, ano]);

  async function carregarFinanceiro() {
    setLoading(true);
    
    // TRUQUE DE DATA: Garante que pega do primeiro milissegundo ao último do mês
    // Cria data no dia 1 do mês selecionado
    const dataInicio = new Date(ano, mes, 1);
    // Cria data no dia 0 do mês seguinte (que é o último dia do mês atual)
    const dataFim = new Date(ano, mes + 1, 0); 
    
    // Ajusta para o formato ISO que o Supabase entende, cobrindo o dia inteiro
    const inicioISO = new Date(dataInicio.setHours(0,0,0,0)).toISOString();
    const fimISO = new Date(dataFim.setHours(23,59,59,999)).toISOString();

    console.log('Buscando dados entre:', inicioISO, 'e', fimISO);

    // 1. Buscar Entradas (SÓ status 'concluido')
    const { data: ent, error: errEnt } = await supabase
        .from('agendamentos')
        .select('id, procedimento, valor, data_hora, pacientes(nome)')
        .eq('status', 'concluido') // OBRIGATÓRIO SER CONCLUÍDO
        .gte('data_hora', inicioISO)
        .lte('data_hora', fimISO)
        .order('data_hora', { ascending: false });
    
    if (errEnt) console.error('Erro entradas:', errEnt);

    // 2. Buscar Saídas
    const { data: sai, error: errSai } = await supabase
        .from('despesas')
        .select('*')
        .gte('data', inicioISO)
        .lte('data', fimISO)
        .order('data', { ascending: false });

    if (errSai) console.error('Erro saidas:', errSai);

    if (ent) setEntradas(ent);
    if (sai) setSaidas(sai);
    setLoading(false);
  }

  async function adicionarDespesa(e: any) {
    e.preventDefault();
    if (!novaDespesa.descricao || !novaDespesa.valor) return;
    setLoading(true);
    await supabase.from('despesas').insert([{ 
        descricao: novaDespesa.descricao, 
        valor: parseFloat(novaDespesa.valor),
        data: novaDespesa.data 
    }]);
    setNovaDespesa({ ...novaDespesa, descricao: '', valor: '' });
    await carregarFinanceiro();
  }

  async function excluirDespesa(id: number) {
    if (!confirm('Apagar despesa?')) return;
    await supabase.from('despesas').delete().eq('id', id);
    carregarFinanceiro();
  }

  // Cálculos Seguros (trata nulo como 0)
  const totalEntradas = entradas.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
  const totalSaidas = saidas.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
  const saldo = totalEntradas - totalSaidas;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      
      {/* Cabeçalho e Filtros */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
        <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><DollarSign className="text-teal-600"/> Financeiro</h2>
            <button onClick={carregarFinanceiro} className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors" title="Atualizar Dados">
                {loading ? <Loader2 size={18} className="animate-spin"/> : <RefreshCw size={18}/>}
            </button>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
            <select value={mes} onChange={e => setMes(Number(e.target.value))} className="flex-1 md:w-32 p-2 border rounded-lg outline-none bg-slate-50 cursor-pointer hover:border-teal-500 transition-colors">
                {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} className="w-24 p-2 border rounded-lg outline-none bg-slate-50 cursor-pointer hover:border-teal-500 transition-colors">
                <option value={2025}>2025</option><option value={2026}>2026</option>
            </select>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 p-6 rounded-2xl border border-green-100 flex flex-col justify-between">
            <p className="text-green-600 font-bold text-sm flex items-center gap-1"><TrendingUp size={16}/> Entradas</p>
            <p className="text-3xl font-bold text-green-700 mt-2">R$ {totalEntradas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
            <p className="text-xs text-green-600/70 mt-1">{entradas.length} recebimentos</p>
        </div>
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100 flex flex-col justify-between">
            <p className="text-red-600 font-bold text-sm flex items-center gap-1"><TrendingDown size={16}/> Saídas</p>
            <p className="text-3xl font-bold text-red-700 mt-2">R$ {totalSaidas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
            <p className="text-xs text-red-600/70 mt-1">{saidas.length} despesas</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <p className="text-slate-500 font-bold text-sm">Saldo Líquido</p>
            <p className={\`text-3xl font-bold mt-2 \${saldo >= 0 ? 'text-teal-600' : 'text-red-600'}\`}>
                R$ {saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
            </p>
            <p className="text-xs text-slate-400 mt-1">Lucro do período</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Coluna 1: Registrar Despesas */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
            <h3 className="font-bold text-slate-800 mb-4 border-b pb-2 flex justify-between">Saídas <span className="text-xs font-normal text-slate-400 self-center">Contas, Aluguel, Materiais...</span></h3>
            
            <form onSubmit={adicionarDespesa} className="flex gap-2 mb-6">
                <input value={novaDespesa.descricao} onChange={e => setNovaDespesa({...novaDespesa, descricao: e.target.value})} placeholder="Descrição" className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-red-200" required />
                <input type="number" value={novaDespesa.valor} onChange={e => setNovaDespesa({...novaDespesa, valor: e.target.value})} placeholder="R$" className="w-24 p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-red-200" required />
                <button disabled={loading} className="bg-red-500 text-white p-2.5 rounded-lg hover:bg-red-600 transition-colors shadow-sm shadow-red-200"><Plus size={20}/></button>
            </form>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {saidas.length === 0 && <p className="text-center text-slate-400 text-sm py-4">Nenhuma despesa lançada.</p>}
                {saidas.map(s => (
                    <div key={s.id} className="flex justify-between items-center p-3 bg-red-50/30 rounded-lg border border-red-100 text-sm hover:bg-red-50 transition-colors">
                        <div>
                            <p className="font-bold text-slate-700">{s.descricao}</p>
                            <p className="text-xs text-slate-400">{new Date(s.data).toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-bold text-red-600">- R$ {s.valor}</span>
                            <button onClick={() => excluirDespesa(s.id)} className="text-red-300 hover:text-red-600 transition-colors"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Coluna 2: Lista de Entradas (Automático da Agenda) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
            <h3 className="font-bold text-slate-800 mb-4 border-b pb-2 flex justify-between">Entradas <span className="text-xs font-normal text-slate-400 self-center">Vem da Agenda (Concluídos)</span></h3>
            
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                {entradas.length === 0 && <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-slate-400 text-sm">Nenhum atendimento concluído neste mês.</div>}
                
                {entradas.map(e => (
                    <div key={e.id} className="flex justify-between items-center p-3 bg-green-50/30 rounded-lg border border-green-100 text-sm hover:bg-green-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs">
                                {e.pacientes?.nome.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p className="font-bold text-slate-700">{e.pacientes?.nome}</p>
                                <p className="text-xs text-slate-500">{e.procedimento} • {new Date(e.data_hora).toLocaleDateString('pt-BR')}</p>
                            </div>
                        </div>
                        <span className="font-bold text-green-600 bg-white px-2 py-1 rounded border border-green-100 shadow-sm">+ R$ {e.valor}</span>
                    </div>
                ))}
            </div>
        </div>

      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join('app', 'financeiro', 'page.tsx'), financeiroCode.trim());
console.log('✅ Financeiro Corrigido!');