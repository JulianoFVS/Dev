'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
    TrendingUp, TrendingDown, Wallet, Activity, Plus,
    Printer, ArrowUpCircle, ArrowDownCircle, Loader2, X, Save, Calendar, AlertCircle,
    Trash2, Ban, Clock as ClockIcon, RotateCcw, CheckCircle, Tag
} from 'lucide-react';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';

const CATS_PADRAO = ['Geral','Vendas','Aluguel','Fornecedores','Equipe','Impostos','Marketing','Procedimentos Extras'];

export default function Financeiro() {
  const { activeClinicId, activeClinic, loading: clinicLoading } = useClinica();
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entrada: 0, saida: 0, saldo: 0, andamento: 0 });
  const [loading, setLoading] = useState(true);

  // Filtros
  const [modoData, setModoData] = useState<'mes' | 'periodo'>('mes');
  const [mesSelecionado, setMesSelecionado] = useState(new Date().toISOString().slice(0, 7));
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [abaStatus, setAbaStatus] = useState<'ativos' | 'andamento' | 'cancelados'>('ativos');

  // Modal Lançamento
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [modoCategoria, setModoCategoria] = useState<'lista' | 'livre'>('lista');
  const [novaCatTemp, setNovaCatTemp] = useState('');

  const [novoLancamento, setNovoLancamento] = useState({
      tipo: 'saida', descricao: '', valor: '',
      data: new Date().toISOString().split('T')[0],
      categoria: 'Geral',
      status: 'concluido' as 'concluido' | 'andamento',
      paciente_id: '' as string,
  });

  // Pacientes (vinculação opcional ao lançamento)
  const [pacientesOptions, setPacientesOptions] = useState<{ id: string; nome: string }[]>([]);

  // Meta & Cancelamento (persisted in Supabase)
  const [meta, setMeta] = useState<Record<string, any>>({});
  const [modalCancelar, setModalCancelar] = useState<any>(null);
  const [motivoCancelar, setMotivoCancelar] = useState('');

  useEffect(() => {
      const hoje = new Date();
      setDataInicio(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10));
      setDataFim(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10));
  }, []);

  // Carregar categorias e meta do Supabase (com fallback localStorage)
  useEffect(() => {
      if (clinicLoading || !activeClinicId) return;
      const cid = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      carregarConfig<string[]>(cid, 'categorias_financeiro', 'ortus_categorias_financeiro', CATS_PADRAO).then(c => setCategorias(c && c.length ? c : CATS_PADRAO));
      carregarConfig<Record<string, any>>(cid, 'lancamentos_meta', 'ortus_lancamentos_meta', {}).then(m => setMeta(m || {}));
  }, [clinicLoading, activeClinicId]);

  useEffect(() => { if (dataInicio && dataFim && !clinicLoading) carregarDados(); }, [mesSelecionado, dataInicio, dataFim, modoData, clinicLoading, activeClinicId]);

  async function carregarDados() {
    setLoading(true);
    const clinicaId = activeClinicId;
    const filtrarClinica = clinicaId && clinicaId !== 'all';

    let inicio = '', fim = '';
    if (modoData === 'mes') {
        const [ano, mes] = mesSelecionado.split('-');
        const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate();
        inicio = `${mesSelecionado}-01`;
        fim = `${mesSelecionado}-${ultimoDia}`;
    } else { inicio = dataInicio; fim = dataFim; }

    const inicioFull = `${inicio}T00:00:00`;
    const fimFull = `${fim}T23:59:59`;

    try {
        let qAg = supabase.from('agendamentos')
            .select('id, valor_final, data_hora, procedimento, status, pacientes(nome)')
            .gte('data_hora', inicioFull).lte('data_hora', fimFull);
        if (filtrarClinica) qAg = qAg.eq('clinica_id', clinicaId);
        const { data: agendamentos } = await qAg;

        let qMan = supabase.from('despesas').select('*').gte('data', inicio).lte('data', fim);
        if (filtrarClinica) qMan = qMan.eq('clinica_id', clinicaId);
        const { data: manuais } = await qMan;

        const listaAg = (agendamentos || [])
            .filter((e: any) => e.status === 'concluido' || e.status === 'fiado')
            .map((e: any) => ({
                id: 'ag_' + e.id, refId: e.id, origem: 'agendamento',
                tipo: 'entrada',
                descricao: `${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - ${e.procedimento}`,
                valor: parseFloat(e.valor_final || '0'),
                data: e.data_hora,
                categoria: e.status === 'fiado' ? 'Fiado / A Receber' : 'Atendimento',
                status: e.status === 'fiado' ? 'andamento' : 'concluido',
            }));

        const listaMan = (manuais || []).map((s: any) => {
            const id = 'man_' + s.id;
            const m = meta[id] || {};
            const status = (m.status || s.status || 'concluido') as string;
            return {
                id, refId: s.id, origem: 'manual',
                tipo: s.tipo || 'saida',
                descricao: s.descricao,
                valor: parseFloat(s.valor || '0'),
                data: s.data,
                categoria: s.categoria || 'Geral',
                status,
                motivo_cancelamento: m.motivo || s.motivo_cancelamento || null,
                cancelado_em: m.cancelado_em || s.cancelado_em || null,
            };
        });

        const todas = [...listaAg, ...listaMan].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
        setTransacoes(todas);

        const totalEntrada = todas.filter(t => t.tipo === 'entrada' && t.status === 'concluido').reduce((s, c) => s + (c.valor || 0), 0);
        const totalSaida = todas.filter(t => t.tipo === 'saida' && t.status === 'concluido').reduce((s, c) => s + (c.valor || 0), 0);
        const totalAndamento = todas.filter(t => t.status === 'andamento').reduce((s, c) => s + (c.valor || 0), 0);
        setResumo({ entrada: totalEntrada, saida: totalSaida, saldo: totalEntrada - totalSaida, andamento: totalAndamento });

    } catch (err) { console.error(err); }
    setLoading(false);
  }

  function abrirNovoLancamento() {
      if (!activeClinicId || activeClinicId === 'all') {
          alert('Selecione uma Clínica específica no menu antes de lançar.');
          return;
      }
      setNovoLancamento({ tipo: 'saida', descricao: '', valor: '', data: new Date().toISOString().split('T')[0], categoria: 'Geral', status: 'concluido', paciente_id: '' });
      setModoCategoria('lista');
      setNovaCatTemp('');
      setModalAberto(true);
      // Carrega pacientes da clínica para vinculação opcional
      supabase.from('pacientes').select('id, nome').eq('clinica_id', activeClinicId).order('nome').then(({ data }) => {
          setPacientesOptions((data || []) as { id: string; nome: string }[]);
      });
  }

  function adicionarNovaCategoria() {
      const nome = novaCatTemp.trim();
      if (!nome) return;
      if (categorias.find(c => c.toLowerCase() === nome.toLowerCase())) {
          setNovoLancamento({ ...novoLancamento, categoria: nome });
          setNovaCatTemp('');
          return;
      }
      const novas = [...categorias, nome].sort();
      setCategorias(novas);
      const cid = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      salvarConfig(cid, 'categorias_financeiro', novas);
      setNovoLancamento({ ...novoLancamento, categoria: nome });
      setNovaCatTemp('');
  }

  async function salvarLancamento(e: any) {
      e.preventDefault();
      setSalvando(true);
      if (!activeClinicId || activeClinicId === 'all') {
          alert('Selecione uma clínica específica no menu.');
          setSalvando(false);
          return;
      }
      const clinicaId = activeClinicId;
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
          descricao: novoLancamento.descricao,
          valor: parseFloat(novoLancamento.valor),
          data: novoLancamento.data,
          categoria: novoLancamento.categoria,
          tipo: novoLancamento.tipo,
          clinica_id: clinicaId,
          user_id: user?.id,
          status: novoLancamento.status,
          paciente_id: novoLancamento.paciente_id || null,
      };
      const { data: ins, error } = await supabase.from('despesas').insert([payload]).select().single();
      if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }

      setModalAberto(false);
      carregarDados();
      setSalvando(false);
  }

  // Cancelar lançamento (manual)
  function pedirCancelamento(t: any) {
      if (t.origem !== 'manual') { alert('Apenas lançamentos manuais podem ser cancelados.'); return; }
      setModalCancelar(t);
      setMotivoCancelar('');
  }

  async function confirmarCancelamento() {
      if (!modalCancelar) return;
      if (!motivoCancelar.trim()) { alert('Informe o motivo do cancelamento.'); return; }
      const t = modalCancelar;
      const updMeta = { ...meta, [t.id]: { status: 'cancelado', motivo: motivoCancelar.trim(), cancelado_em: new Date().toISOString() } };
      setMeta(updMeta);
      const cid2 = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      salvarConfig(cid2, 'lancamentos_meta', updMeta);
      // Tenta também salvar no DB (caso colunas existam)
      try {
          await supabase.from('despesas').update({ status: 'cancelado', motivo_cancelamento: motivoCancelar.trim(), cancelado_em: new Date().toISOString() }).eq('id', t.refId);
      } catch {}
      setModalCancelar(null);
      setMotivoCancelar('');
      carregarDados();
  }

  async function restaurarCancelado(t: any) {
      if (!confirm('Restaurar este lançamento?')) return;
      const updMeta = { ...meta };
      delete updMeta[t.id];
      setMeta(updMeta);
      const cid3 = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      salvarConfig(cid3, 'lancamentos_meta', updMeta);
      try { await supabase.from('despesas').update({ status: 'concluido', motivo_cancelamento: null, cancelado_em: null }).eq('id', t.refId); } catch {}
      carregarDados();
  }

  async function excluirDefinitivo(t: any) {
      if (!confirm('Excluir definitivamente? Esta ação não pode ser desfeita.')) return;
      const updMeta = { ...meta };
      delete updMeta[t.id];
      setMeta(updMeta);
      const cid4 = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      salvarConfig(cid4, 'lancamentos_meta', updMeta);
      if (t.origem === 'manual') await supabase.from('despesas').delete().eq('id', t.refId);
      carregarDados();
  }

  async function concluirAndamento(t: any) {
      if (!confirm('Marcar como concluído?')) return;
      const updMeta = { ...meta };
      delete updMeta[t.id];
      setMeta(updMeta);
      const cid5 = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      salvarConfig(cid5, 'lancamentos_meta', updMeta);
      try { await supabase.from('despesas').update({ status: 'concluido' }).eq('id', t.refId); } catch {}
      carregarDados();
  }

  // ===== IMPRESSÃO BONITA =====
  function imprimirRelatorio() {
      const clinicaNome = activeClinic ? getClinicLabel(activeClinic) : 'ORTUS CLINIC';
      const periodoStr = modoData === 'mes'
          ? new Date(mesSelecionado + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
          : `${new Date(dataInicio).toLocaleDateString('pt-BR')} a ${new Date(dataFim).toLocaleDateString('pt-BR')}`;

      const ativos = transacoesFiltradas.filter(t => t.status === 'concluido');
      const andamento = transacoesFiltradas.filter(t => t.status === 'andamento');
      const cancelados = transacoesFiltradas.filter(t => t.status === 'cancelado');

      const totalEntrada = ativos.filter(t => t.tipo === 'entrada').reduce((s,c) => s + c.valor, 0);
      const totalSaida = ativos.filter(t => t.tipo === 'saida').reduce((s,c) => s + c.valor, 0);
      const saldo = totalEntrada - totalSaida;

      // Agrupa por categoria
      const catMap: Record<string, { entrada: number; saida: number }> = {};
      ativos.forEach(t => {
          if (!catMap[t.categoria]) catMap[t.categoria] = { entrada: 0, saida: 0 };
          if (t.tipo === 'entrada') catMap[t.categoria].entrada += t.valor;
          else catMap[t.categoria].saida += t.valor;
      });

      const linhasTab = (lista: any[]) => lista.map(t => `
          <tr class="${t.status === 'cancelado' ? 'cancelado' : ''}">
              <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
              <td>${t.descricao}</td>
              <td><span class="cat">${t.categoria}</span></td>
              <td class="${t.tipo}">${t.tipo === 'entrada' ? '+' : '-'} R$ ${t.valor.toFixed(2)}</td>
          </tr>`).join('');

      const linhasCat = Object.entries(catMap).sort().map(([nome, v]) => `
          <tr>
              <td><strong>${nome}</strong></td>
              <td class="entrada">R$ ${v.entrada.toFixed(2)}</td>
              <td class="saida">R$ ${v.saida.toFixed(2)}</td>
              <td><strong>R$ ${(v.entrada - v.saida).toFixed(2)}</strong></td>
          </tr>`).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Relatório Financeiro</title>
        <style>
          @page { size: A4; margin: 18mm 14mm; }
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; }
          .wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
          .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 3px solid #2563eb; margin-bottom: 24px; }
          .header h1 { margin: 0; font-size: 22px; letter-spacing: 1px; color: #1e3a8a; }
          .header .meta { text-align: right; font-size: 11px; color: #64748b; }
          .titulo { font-size: 28px; font-weight: 900; margin: 8px 0 4px 0; color: #0f172a; }
          .periodo { color: #475569; text-transform: capitalize; font-weight: 600; }
          .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
          .card { padding: 14px; border-radius: 10px; border: 1px solid #e2e8f0; }
          .card .lbl { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; }
          .card .val { font-size: 22px; font-weight: 900; margin-top: 6px; }
          .card.entrada { background: #ecfdf5; border-color: #6ee7b7; } .card.entrada .val { color: #047857; }
          .card.saida { background: #fef2f2; border-color: #fca5a5; } .card.saida .val { color: #b91c1c; }
          .card.saldo { background: #eff6ff; border-color: #93c5fd; } .card.saldo .val { color: #1d4ed8; }
          .card.andamento { background: #fffbeb; border-color: #fcd34d; } .card.andamento .val { color: #b45309; }
          h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 28px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
          th { text-align: left; padding: 8px 6px; background: #f1f5f9; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #cbd5e1; }
          td { padding: 6px; border-bottom: 1px solid #f1f5f9; }
          td.entrada { color: #047857; font-weight: 700; text-align: right; }
          td.saida { color: #b91c1c; font-weight: 700; text-align: right; }
          .cat { background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; }
          tr.cancelado td { text-decoration: line-through; color: #94a3b8; }
          .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style></head><body><div class="wrap">
        <div class="header">
          <div>
            <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px">Relatório Financeiro</div>
            <h1>${clinicaNome}</h1>
          </div>
          <div class="meta">
            <div>Emitido em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
            <div>Sistema ORTUS</div>
          </div>
        </div>

        <div class="titulo">Resumo do Período</div>
        <div class="periodo">${periodoStr}</div>

        <div class="cards">
          <div class="card entrada"><div class="lbl">Receitas</div><div class="val">R$ ${totalEntrada.toFixed(2)}</div></div>
          <div class="card saida"><div class="lbl">Despesas</div><div class="val">R$ ${totalSaida.toFixed(2)}</div></div>
          <div class="card saldo"><div class="lbl">Saldo Líquido</div><div class="val">R$ ${saldo.toFixed(2)}</div></div>
          <div class="card andamento"><div class="lbl">Em Andamento</div><div class="val">R$ ${andamento.reduce((s,c)=>s+c.valor,0).toFixed(2)}</div></div>
        </div>

        <h2>Por Categoria</h2>
        <table><thead><tr><th>Categoria</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saídas</th><th style="text-align:right">Saldo</th></tr></thead>
        <tbody>${linhasCat || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sem dados.</td></tr>'}</tbody></table>

        <h2>Movimentações Concluídas (${ativos.length})</h2>
        <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody>${linhasTab(ativos) || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sem movimentações.</td></tr>'}</tbody></table>

        ${andamento.length > 0 ? `
          <h2>Em Andamento (${andamento.length})</h2>
          <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${linhasTab(andamento)}</tbody></table>` : ''}

        ${cancelados.length > 0 ? `
          <h2>Cancelados (${cancelados.length})</h2>
          <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${linhasTab(cancelados)}</tbody></table>` : ''}

        <div class="footer">Documento gerado eletronicamente pelo Sistema ORTUS · ${new Date().getFullYear()}</div>
        </div>
        <script>window.onload=function(){setTimeout(function(){window.print();},200);}</script>
        </body></html>`;

      const w = window.open('', '', 'width=1000,height=800');
      w?.document.write(html);
      w?.document.close();
  }

  // Filtragem
  const transacoesFiltradas = transacoes.filter(t => {
      if (tipoFiltro !== 'todos' && t.tipo !== tipoFiltro) return false;
      if (abaStatus === 'ativos' && t.status !== 'concluido') return false;
      if (abaStatus === 'andamento' && t.status !== 'andamento') return false;
      if (abaStatus === 'cancelados' && t.status !== 'cancelado') return false;
      return true;
  });

  const countAtivos = transacoes.filter(t => t.status === 'concluido').length;
  const countAndamento = transacoes.filter(t => t.status === 'andamento').length;
  const countCancelados = transacoes.filter(t => t.status === 'cancelado').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-20">
      {/* HEADER */}
      <div className="flex flex-col items-start gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-full">
            <h1 className="text-xl sm:text-2xl font-black text-slate-800">Gestão Financeira</h1>
            <div className="flex gap-2 mt-2">
                <button onClick={() => setModoData('mes')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${modoData === 'mes' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Por Mês</button>
                <button onClick={() => setModoData('periodo')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${modoData === 'periodo' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Personalizado</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center w-full">
              {modoData === 'mes' ? (
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <Calendar size={18} className="text-slate-400"/>
                      <input type="month" value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} className="bg-transparent text-slate-700 font-bold text-sm outline-none cursor-pointer"/>
                  </div>
              ) : (
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-transparent text-slate-600 font-bold text-xs outline-none"/>
                      <span className="text-slate-300">até</span>
                      <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-transparent text-slate-600 font-bold text-xs outline-none"/>
                  </div>
              )}
              <button onClick={imprimirRelatorio} className="bg-white border border-slate-200 text-slate-600 p-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors" title="Imprimir Relatório"><Printer size={20}/></button>
              <button onClick={abrirNovoLancamento} className="bg-blue-600 text-white px-4 sm:px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 text-sm shadow-lg shadow-blue-200 transition-all active:scale-95"><Plus size={18}/> Novo Lançamento</button>
          </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-3"><div className="p-2 bg-green-50 text-green-600 rounded-xl"><TrendingUp size={20}/></div><span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded-lg border border-green-100">+ Entradas</span></div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Faturamento</p>
              <p className="text-2xl font-black text-slate-800 mt-1">R$ {resumo.entrada.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
          </div>
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-3"><div className="p-2 bg-red-50 text-red-600 rounded-xl"><TrendingDown size={20}/></div><span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-1 rounded-lg border border-red-100">- Saídas</span></div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Despesas</p>
              <p className="text-2xl font-black text-slate-800 mt-1">R$ {resumo.saida.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
          </div>
          <div className="bg-white p-5 rounded-3xl border border-amber-200 shadow-sm">
              <div className="flex justify-between items-start mb-3"><div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><ClockIcon size={20}/></div><span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">Pendente</span></div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Em Andamento</p>
              <p className="text-2xl font-black text-amber-700 mt-1">R$ {resumo.andamento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
          </div>
          <div className="bg-slate-900 p-5 rounded-3xl shadow-xl text-white">
              <div className="flex justify-between items-start mb-3"><div className="p-2 bg-white/10 rounded-xl"><Wallet size={20}/></div><span className="text-[10px] font-bold text-white/90 bg-white/10 px-2 py-1 rounded-lg">= Resultado</span></div>
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">Saldo Líquido</p>
              <p className={`text-2xl font-black mt-1 ${resumo.saldo >= 0 ? 'text-white' : 'text-red-400'}`}>R$ {resumo.saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
          </div>
      </div>

      {/* TABS DE STATUS */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm gap-1">
          <button onClick={() => setAbaStatus('ativos')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${abaStatus === 'ativos' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
              <CheckCircle size={16}/> Ativos <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20">{countAtivos}</span>
          </button>
          <button onClick={() => setAbaStatus('andamento')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${abaStatus === 'andamento' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
              <ClockIcon size={16}/> Em Andamento {countAndamento > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20">{countAndamento}</span>}
          </button>
          <button onClick={() => setAbaStatus('cancelados')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${abaStatus === 'cancelados' ? 'bg-rose-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Trash2 size={16}/> Lixeira / Cancelados {countCancelados > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20">{countCancelados}</span>}
          </button>
      </div>

      {/* EXTRATO */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Activity size={18}/></div>
                  <h3 className="font-bold text-slate-700">{abaStatus === 'ativos' ? 'Extrato de Movimentações' : abaStatus === 'andamento' ? 'Lançamentos em Andamento' : 'Lançamentos Cancelados'}</h3>
              </div>
              <div className="flex bg-slate-200 p-1 rounded-xl">
                  <button onClick={() => setTipoFiltro('todos')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tipoFiltro === 'todos' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Tudo</button>
                  <button onClick={() => setTipoFiltro('entrada')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tipoFiltro === 'entrada' ? 'bg-white shadow text-green-600' : 'text-slate-500 hover:text-slate-700'}`}>Entradas</button>
                  <button onClick={() => setTipoFiltro('saida')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tipoFiltro === 'saida' ? 'bg-white shadow text-red-600' : 'text-slate-500 hover:text-slate-700'}`}>Saídas</button>
              </div>
          </div>
          <div className="divide-y divide-slate-100">
              {loading ? (
                  <div className="p-10 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2"/> Calculando...</div>
              ) : transacoesFiltradas.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 bg-slate-50/50">Nenhuma movimentação encontrada.</div>
              ) : (
                  transacoesFiltradas.map((t: any) => {
                      const isCancel = t.status === 'cancelado';
                      const isAndam = t.status === 'andamento';
                      return (
                          <div key={t.id} className={`p-5 flex items-center justify-between transition-colors group ${isCancel ? 'bg-slate-50/70 hover:bg-slate-100/60' : 'hover:bg-slate-50'}`}>
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                  <div className={`p-3 rounded-2xl flex items-center justify-center shadow-sm transition-colors ${
                                      isCancel ? 'bg-slate-200 text-slate-400'
                                      : isAndam ? 'bg-amber-50 text-amber-600'
                                      : t.tipo === 'entrada' ? 'bg-green-50 text-green-600'
                                      : 'bg-red-50 text-red-600'
                                  }`}>
                                      {isCancel ? <Ban size={22}/> : isAndam ? <ClockIcon size={22}/> : t.tipo === 'entrada' ? <ArrowUpCircle size={24}/> : <ArrowDownCircle size={24}/>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <p className={`font-bold text-sm md:text-base ${isCancel ? 'line-through text-slate-400' : 'text-slate-700'}`}>{t.descricao}</p>
                                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wide border border-slate-200">{t.categoria}</span>
                                          <span className="text-xs text-slate-400 font-medium">{new Date(t.data).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</span>
                                          {isAndam && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded uppercase border border-amber-200">Em andamento</span>}
                                          {isCancel && t.motivo_cancelamento && <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200" title={t.motivo_cancelamento}>Motivo: {t.motivo_cancelamento.length > 40 ? t.motivo_cancelamento.slice(0,40)+'…' : t.motivo_cancelamento}</span>}
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-3">
                                  <span className={`font-black text-sm md:text-lg whitespace-nowrap ${
                                      isCancel ? 'text-slate-400 line-through'
                                      : t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                      {t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                  </span>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {abaStatus === 'andamento' && t.origem === 'manual' && (
                                          <button onClick={() => concluirAndamento(t)} className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100" title="Marcar como concluído"><CheckCircle size={14}/></button>
                                      )}
                                      {abaStatus === 'cancelados' ? (
                                          <>
                                              <button onClick={() => restaurarCancelado(t)} className="p-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100" title="Restaurar"><RotateCcw size={14}/></button>
                                              <button onClick={() => excluirDefinitivo(t)} className="p-1.5 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100" title="Excluir definitivamente"><Trash2 size={14}/></button>
                                          </>
                                      ) : t.origem === 'manual' && (
                                          <button onClick={() => pedirCancelamento(t)} className="p-1.5 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100" title="Cancelar lançamento"><Ban size={14}/></button>
                                      )}
                                  </div>
                              </div>
                          </div>
                      );
                  })
              )}
          </div>
      </div>

      {/* MODAL DE LANÇAMENTO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-md max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-zoom-in border border-slate-100">
                <div className="p-5 border-b bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="font-black text-xl text-slate-800">Novo Lançamento</h3>
                    <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-red-500 p-1 bg-white rounded-full border border-slate-200 hover:border-red-200 transition-colors"><X size={20}/></button>
                </div>
                <form onSubmit={salvarLancamento} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                    <div className="p-3 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl flex items-start gap-2 border border-blue-100">
                        <AlertCircle size={16} className="mt-0.5 flex-none"/>
                        <span>O lançamento será vinculado à clínica selecionada no menu lateral.</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-xl">
                        <button type="button" onClick={() => setNovoLancamento({...novoLancamento, tipo: 'entrada'})} className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${novoLancamento.tipo === 'entrada' ? 'bg-white text-green-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}><ArrowUpCircle size={18}/> Receita</button>
                        <button type="button" onClick={() => setNovoLancamento({...novoLancamento, tipo: 'saida'})} className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${novoLancamento.tipo === 'saida' ? 'bg-white text-red-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}><ArrowDownCircle size={18}/> Despesa</button>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Descrição</label>
                        <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder={novoLancamento.tipo === 'entrada' ? 'Ex: Venda de Kit' : 'Ex: Conta de Luz'} value={novoLancamento.descricao} onChange={e => setNovoLancamento({...novoLancamento, descricao: e.target.value})} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Valor (R$)</label>
                            <input required type="number" step="0.01" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="0.00" value={novoLancamento.valor} onChange={e => setNovoLancamento({...novoLancamento, valor: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data</label>
                            <input required type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-600" value={novoLancamento.data} onChange={e => setNovoLancamento({...novoLancamento, data: e.target.value})} />
                        </div>
                    </div>

                    {/* CATEGORIA */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">Categoria</label>
                            <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                <button type="button" onClick={() => setModoCategoria('lista')} className={`px-2 py-0.5 rounded text-[10px] font-bold ${modoCategoria === 'lista' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}>Lista</button>
                                <button type="button" onClick={() => setModoCategoria('livre')} className={`px-2 py-0.5 rounded text-[10px] font-bold ${modoCategoria === 'livre' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}>Livre</button>
                            </div>
                        </div>
                        {modoCategoria === 'lista' ? (
                            <>
                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-600 cursor-pointer" value={novoLancamento.categoria} onChange={e => setNovoLancamento({...novoLancamento, categoria: e.target.value})}>
                                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <div className="flex gap-2 mt-2">
                                    <input value={novaCatTemp} onChange={e => setNovaCatTemp(e.target.value)} placeholder="+ Criar nova categoria..." className="flex-1 p-2 bg-white border border-slate-200 rounded-lg outline-none text-xs font-medium focus:ring-2 focus:ring-blue-500"/>
                                    <button type="button" onClick={adicionarNovaCategoria} disabled={!novaCatTemp.trim()} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"><Plus size={12}/> Salvar</button>
                                </div>
                            </>
                        ) : (
                            <div>
                                <input value={novoLancamento.categoria} onChange={e => setNovoLancamento({...novoLancamento, categoria: e.target.value})} placeholder="Digite uma categoria..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"/>
                                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><Tag size={10}/> Esta categoria será usada apenas neste lançamento (não será salva para reutilização).</p>
                            </div>
                        )}
                    </div>

                    {/* PACIENTE (vinculação opcional) */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Paciente <span className="text-slate-300 normal-case font-medium">(opcional)</span></label>
                        <select
                            value={novoLancamento.paciente_id}
                            onChange={e => setNovoLancamento({ ...novoLancamento, paciente_id: e.target.value })}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-600 cursor-pointer"
                        >
                            <option value="">Sem vínculo (despesa operacional)</option>
                            {pacientesOptions.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1">Se vinculado, este lançamento será excluído automaticamente caso o paciente seja removido.</p>
                    </div>

                    {/* STATUS */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Status do Lançamento</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setNovoLancamento({...novoLancamento, status: 'concluido'})} className={`py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${novoLancamento.status === 'concluido' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-200' : 'bg-white border-slate-200 text-slate-500'}`}><CheckCircle size={14}/> Concluído</button>
                            <button type="button" onClick={() => setNovoLancamento({...novoLancamento, status: 'andamento'})} className={`py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${novoLancamento.status === 'andamento' ? 'bg-amber-50 border-amber-300 text-amber-700 ring-2 ring-amber-200' : 'bg-white border-slate-200 text-slate-500'}`}><ClockIcon size={14}/> Em Andamento</button>
                        </div>
                    </div>

                  </div>
                  <div className="p-5 border-t border-slate-100 bg-white flex gap-3 shrink-0">
                      <button type="button" onClick={() => setModalAberto(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                      <button type="submit" disabled={salvando} className="flex-1 bg-slate-900 text-white rounded-xl font-bold py-3 hover:bg-black transition-all shadow-lg flex justify-center items-center gap-2">
                          {salvando ? <Loader2 className="animate-spin"/> : <><Save size={18}/> Salvar</>}
                      </button>
                  </div>
                </form>
            </div>
        </div>
      )}

      {/* MODAL CANCELAR */}
      {modalCancelar && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
                <div className="p-5 border-b bg-rose-50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center"><Ban size={20}/></div>
                    <div>
                        <h3 className="font-black text-slate-800">Cancelar Lançamento</h3>
                        <p className="text-xs text-slate-500">{modalCancelar.descricao}</p>
                    </div>
                </div>
                <div className="p-5 space-y-3">
                    <label className="text-xs font-bold text-slate-500 uppercase">Motivo do Cancelamento <span className="text-rose-500">*</span></label>
                    <textarea autoFocus value={motivoCancelar} onChange={e => setMotivoCancelar(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm h-24 resize-none" placeholder="Ex: Pagamento não realizado, lançamento duplicado..."/>
                    <p className="text-[10px] text-slate-400">O lançamento ficará visível na aba "Lixeira / Cancelados" com o motivo registrado.</p>
                </div>
                <div className="p-5 bg-slate-50 border-t flex gap-2 justify-end">
                    <button onClick={() => setModalCancelar(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg">Voltar</button>
                    <button onClick={confirmarCancelamento} disabled={!motivoCancelar.trim()} className="px-5 py-2 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 disabled:opacity-40 flex items-center gap-2"><Ban size={14}/> Confirmar Cancelamento</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
