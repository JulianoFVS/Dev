const fs = require('fs');
const path = require('path');

console.log('🖨️ Instalando Módulo de Relatórios e Impressão...');

const financeiroRelatorio = `
'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  DollarSign, TrendingUp, TrendingDown, Filter, Calendar, 
  Search, Printer, ChevronDown, ChevronUp, ArrowDownCircle, Trash2 
} from 'lucide-react';

export default function Financeiro() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entradas: 0, saidas: 0, saldo: 0 });
  const [loading, setLoading] = useState(false);
  
  // Filtros
  const [modo, setModo] = useState<'mes' | 'ano' | 'todos' | 'periodo'>('mes');
  const [mes, setMes] = useState(new Date().getMonth());
  const [ano, setAno] = useState(new Date().getFullYear());
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);

  const [novaDespesa, setNovaDespesa] = useState({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0] });
  
  // Ref para impressão
  const relatorioRef = useRef<HTMLDivElement>(null);

  useEffect(() => { carregarDados(); }, [modo, mes, ano, dataInicio, dataFim]);

  async function carregarDados() {
    setLoading(true);
    let inicioISO, fimISO;

    // Lógica de Datas
    if (modo === 'mes') {
        const i = new Date(ano, mes, 1);
        const f = new Date(ano, mes + 1, 0);
        inicioISO = new Date(i.setHours(0,0,0,0)).toISOString();
        fimISO = new Date(f.setHours(23,59,59,999)).toISOString();
    } else if (modo === 'ano') {
        const i = new Date(ano, 0, 1);
        const f = new Date(ano, 12, 0);
        inicioISO = new Date(i.setHours(0,0,0,0)).toISOString();
        fimISO = new Date(f.setHours(23,59,59,999)).toISOString();
    } else if (modo === 'todos') {
        // Pega desde 2020 até 2030 (Basicamente tudo)
        inicioISO = '2020-01-01T00:00:00.000Z';
        fimISO = '2030-12-31T23:59:59.999Z';
    } else {
        inicioISO = new Date(new Date(dataInicio).setHours(0,0,0,0)).toISOString();
        fimISO = new Date(new Date(dataFim).setHours(23,59,59,999)).toISOString();
    }

    // Buscas
    const { data: entradas } = await supabase.from('agendamentos').select('id, procedimento, valor, data_hora, pacientes(nome)').eq('status', 'concluido').gte('data_hora', inicioISO).lte('data_hora', fimISO);
    const { data: saidas } = await supabase.from('despesas').select('*').gte('data', inicioISO).lte('data', fimISO);

    // Unificação
    const listaEntradas = entradas?.map(e => ({ id: e.id, tipo: 'entrada', descricao: \`\${e.pacientes?.nome} - \${e.procedimento}\`, valor: Number(e.valor), data: e.data_hora, origem: 'agendamento' })) || [];
    const listaSaidas = saidas?.map(s => ({ id: s.id, tipo: 'saida', descricao: s.descricao, valor: Number(s.valor), data: s.data, origem: 'despesa' })) || [];

    const tudo = [...listaEntradas, ...listaSaidas].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    
    setTransacoes(tudo);
    const totalEnt = listaEntradas.reduce((acc, item) => acc + item.valor, 0);
    const totalSai = listaSaidas.reduce((acc, item) => acc + item.valor, 0);
    setResumo({ entradas: totalEnt, saidas: totalSai, saldo: totalEnt - totalSai });
    setLoading(false);
  }

  async function adicionarDespesa(e: any) {
    e.preventDefault();
    if (!novaDespesa.descricao || !novaDespesa.valor) return;
    await supabase.from('despesas').insert([{ descricao: novaDespesa.descricao, valor: parseFloat(novaDespesa.valor), data: novaDespesa.data }]);
    setNovaDespesa({ ...novaDespesa, descricao: '', valor: '' });
    carregarDados();
  }

  async function excluirItem(id: number, origem: string) {
    if (!confirm('Tem certeza?')) return;
    if (origem === 'despesa') await supabase.from('despesas').delete().eq('id', id);
    else await supabase.from('agendamentos').update({ status: 'agendado', cor: 'blue' }).eq('id', id);
    carregarDados();
  }

  // FUNÇÃO DE IMPRESSÃO
  function imprimir() {
    const conteudo = relatorioRef.current?.innerHTML;
    if (!conteudo) return;

    const janela = window.open('', '', 'height=800,width=800');
    janela?.document.write('<html><head><title>Relatório Financeiro ORTUS</title>');
    janela?.document.write('<script src="https://cdn.tailwindcss.com"></script>'); // Tailwind para o print
    janela?.document.write('</head><body class="p-10 bg-white">');
    janela?.document.write('<div class="text-center mb-8"><h1 class="text-3xl font-bold text-slate-800">Relatório Financeiro</h1><p class="text-slate-500">Extrato de Entradas e Saídas</p></div>');
    
    // Injeta o resumo
    janela?.document.write(\`
        <div class="grid grid-cols-3 gap-4 mb-8 border-b pb-8">
            <div class="p-4 bg-green-50 rounded border border-green-100"><p class="text-sm text-green-700 font-bold">ENTRADAS</p><p class="text-2xl font-bold">R$ \${resumo.entradas.toFixed(2)}</p></div>
            <div class="p-4 bg-red-50 rounded border border-red-100"><p class="text-sm text-red-700 font-bold">SAÍDAS</p><p class="text-2xl font-bold">R$ \${resumo.saidas.toFixed(2)}</p></div>
            <div class="p-4 bg-slate-50 rounded border border-slate-200"><p class="text-sm text-slate-700 font-bold">SALDO</p><p class="text-2xl font-bold">R$ \${resumo.saldo.toFixed(2)}</p></div>
        </div>
    \`);

    janela?.document.write(conteudo);
    
    // Remove os botões de lixeira do HTML impresso
    const lixeiras = janela?.document.querySelectorAll('.btn-lixeira');
    lixeiras?.forEach(el => el.remove());

    janela?.document.write('<div class="mt-8 text-center text-xs text-slate-400 border-t pt-4">Gerado pelo sistema ORTUS</div></body></html>');
    janela?.document.close();
    setTimeout(() => janela?.print(), 500); // Espera o Tailwind carregar
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-6xl mx-auto">
      
      {/* 1. CABEÇALHO */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><DollarSign className="text-teal-600"/> Financeiro</h2>
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setModo('mes')} className={\`px-3 py-1 text-xs font-bold rounded transition-all \${modo === 'mes' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}\`}>Mês</button>
                <button onClick={() => setModo('ano')} className={\`px-3 py-1 text-xs font-bold rounded transition-all \${modo === 'ano' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}\`}>Ano</button>
                <button onClick={() => setModo('todos')} className={\`px-3 py-1 text-xs font-bold rounded transition-all \${modo === 'todos' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}\`}>Todos</button>
                <button onClick={() => setModo('periodo')} className={\`px-3 py-1 text-xs font-bold rounded transition-all \${modo === 'periodo' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}\`}>Período</button>
            </div>
        </div>

        <div className="flex items-center gap-2">
            {(modo === 'mes' || modo === 'ano') && ( <select value={ano} onChange={e => setAno(Number(e.target.value))} className="p-2 border rounded-lg bg-white text-sm"><option value={2025}>2025</option><option value={2026}>2026</option></select> )}
            {modo === 'mes' && ( <select value={mes} onChange={e => setMes(Number(e.target.value))} className="p-2 border rounded-lg bg-white text-sm">{['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => <option key={i} value={i}>{m}</option>)}</select> )}
            {modo === 'periodo' && ( <div className="flex gap-1"><input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="p-2 border rounded-lg text-sm"/><input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="p-2 border rounded-lg text-sm"/></div> )}
            
            <button onClick={imprimir} className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2 text-sm font-bold shadow-sm">
                <Printer size={16}/> <span className="hidden md:inline">Imprimir Relatório</span>
            </button>
        </div>
      </div>

      {/* 2. BIG NUMBERS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 p-6 rounded-2xl border border-green-100"><p className="text-green-700 font-bold text-sm flex items-center gap-2 uppercase"><TrendingUp size={18}/> Receitas</p><p className="text-3xl font-bold text-green-800 mt-2">R$ {resumo.entradas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100"><p className="text-red-700 font-bold text-sm flex items-center gap-2 uppercase"><TrendingDown size={18}/> Despesas</p><p className="text-3xl font-bold text-red-800 mt-2">R$ {resumo.saidas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200"><p className="text-slate-500 font-bold text-sm uppercase">Saldo</p><p className={\`text-3xl font-bold mt-2 \${resumo.saldo >= 0 ? 'text-teal-600' : 'text-red-600'}\`}>R$ {resumo.saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 3. LANÇAMENTO RÁPIDO */}
        <div className="lg:col-span-1">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 sticky top-4">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><ArrowDownCircle size={18} className="text-red-500"/> Lançar Despesa</h3>
                <form onSubmit={adicionarDespesa} className="space-y-3">
                    <input value={novaDespesa.descricao} onChange={e => setNovaDespesa({...novaDespesa, descricao: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-red-400" placeholder="Descrição" required />
                    <div className="grid grid-cols-2 gap-3">
                        <input type="number" value={novaDespesa.valor} onChange={e => setNovaDespesa({...novaDespesa, valor: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-red-400" placeholder="R$" required />
                        <input type="date" value={novaDespesa.data} onChange={e => setNovaDespesa({...novaDespesa, data: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-red-400" required />
                    </div>
                    <button type="submit" className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-lg transition-colors flex justify-center items-center gap-2"><TrendingDown size={18}/> Registrar Saída</button>
                </form>
            </div>
        </div>

        {/* 4. EXTRATO (ÁREA DE IMPRESSÃO) */}
        <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2"><Filter size={16}/> Extrato Detalhado</h3>
                    <span className="text-xs text-slate-400 font-medium">{transacoes.length} lançamentos</span>
                </div>
                
                {/* DIV REFERENCIADA PARA IMPRESSÃO */}
                <div ref={relatorioRef} className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                                <th className="px-4 py-3 text-center btn-lixeira">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {transacoes.length === 0 && (<tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">Nenhum registro.</td></tr>)}
                            {transacoes.map((t) => (
                                <tr key={t.tipo + t.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(t.data).toLocaleDateString('pt-BR')}</td>
                                    <td className="px-4 py-3 font-medium text-slate-700">
                                        {t.descricao}
                                        {t.tipo === 'entrada' && <span className="ml-2 text-[10px] bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded border border-teal-100">Consulta</span>}
                                    </td>
                                    <td className={\`px-4 py-3 text-right font-bold \${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-500'}\`}>
                                        {t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                    </td>
                                    <td className="px-4 py-3 text-center btn-lixeira">
                                        <button onClick={() => excluirItem(t.id, t.origem)} className="text-slate-300 hover:text-red-500 transition-colors p-1"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>

      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join('app', 'financeiro', 'page.tsx'), financeiroRelatorio.trim());
console.log('✅ Sistema de Relatórios Instalado!');