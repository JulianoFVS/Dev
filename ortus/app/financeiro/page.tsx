'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
    TrendingUp, TrendingDown, Wallet, Activity, Plus,
    Printer, ArrowUpCircle, ArrowDownCircle, Loader2, X, Save, Calendar, AlertCircle,
    Trash2, Ban, Clock as ClockIcon, RotateCcw, CheckCircle, Tag
} from 'lucide-react';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import CustomSelect from '@/components/ui/CustomSelect';
import Modal from '@/components/ui/Modal';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
    CATEGORIAS_FINANCEIRAS_PADRAO,
    TAXAS_MAQUININHA_PADRAO,
    normalizarCategoriasFinanceiras,
    normalizarTaxasMaquininha,
    nomesCategoriasAtivas,
    calcularValorLiquido,
    type CategoriaFinanceira,
    type TaxaMaquininha,
} from '@/lib/configDefaults';
import { printDocument, printTable, escapePrintHtml } from '@/lib/printDocument';

const CATS_PADRAO = nomesCategoriasAtivas(CATEGORIAS_FINANCEIRAS_PADRAO);
const cardShell = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';

export default function Financeiro() {
  const { activeClinicId, activeClinic, loading: clinicLoading } = useClinica();
  const { showAlert, showConfirm } = useCustomAlert();
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entrada: 0, saida: 0, saldo: 0, andamento: 0 });
  const [loading, setLoading] = useState(true);
  const jaCarregou = useRef(false);

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
  const [categorias, setCategorias] = useState<string[]>(CATS_PADRAO);
  const [categoriasObj, setCategoriasObj] = useState<CategoriaFinanceira[]>(CATEGORIAS_FINANCEIRAS_PADRAO);
  const [taxasMaquininha, setTaxasMaquininha] = useState<TaxaMaquininha[]>(TAXAS_MAQUININHA_PADRAO);
  const [modoCategoria, setModoCategoria] = useState<'lista' | 'livre'>('lista');
  const [novaCatTemp, setNovaCatTemp] = useState('');

  const [novoLancamento, setNovoLancamento] = useState({
      tipo: 'saida', descricao: '', valor: '',
      data: new Date().toISOString().split('T')[0],
      categoria: 'Geral',
      status: 'concluido' as 'concluido' | 'andamento',
      paciente_id: '' as string,
      taxa_id: '' as string,
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
      carregarConfig<unknown>(cid, 'categorias_financeiro', 'ortus_categorias_financeiro', CATEGORIAS_FINANCEIRAS_PADRAO).then(c => {
          try {
              const norm = normalizarCategoriasFinanceiras(c);
              setCategoriasObj(norm);
              setCategorias(nomesCategoriasAtivas(norm));
          } catch {
              setCategoriasObj(CATEGORIAS_FINANCEIRAS_PADRAO);
              setCategorias(CATS_PADRAO);
          }
      });
      carregarConfig<TaxaMaquininha[]>(cid, 'taxas_maquininha', 'ortus_taxas_maquininha', TAXAS_MAQUININHA_PADRAO).then(t => {
          try {
              const norm = normalizarTaxasMaquininha(t);
              setTaxasMaquininha(norm.filter(x => x.ativo));
          } catch {
              setTaxasMaquininha(TAXAS_MAQUININHA_PADRAO.filter(x => x.ativo));
          }
      });
      carregarConfig<Record<string, any>>(cid, 'lancamentos_meta', 'ortus_lancamentos_meta', {}).then(m => setMeta(m || {}));
  }, [clinicLoading, activeClinicId]);

  useEffect(() => { if (dataInicio && dataFim && !clinicLoading) carregarDados(); }, [mesSelecionado, dataInicio, dataFim, modoData, clinicLoading, activeClinicId]);

  async function carregarDados(metaOverride?: Record<string, any>) {
    const metaAtual = metaOverride ?? meta;
    if (!jaCarregou.current) setLoading(true);
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
        const { data: agendamentos, error: errAg } = await qAg;
        if (errAg) throw errAg;

        let qMan = supabase.from('despesas').select('*').gte('data', inicio).lte('data', fim);
        if (filtrarClinica) qMan = qMan.eq('clinica_id', clinicaId);
        const { data: manuais, error: errMan } = await qMan;
        if (errMan) throw errMan;

        const listaAg = (agendamentos || [])
            .filter((e: any) => (e.status === 'concluido' || e.status === 'fiado') && e.tipo_registro !== 'debito_manual' && e.observacoes !== 'Débito manual')
            .map((e: any) => {
                const metaAg = metaAtual[`ag_${e.id}`] as { valor_liquido?: number; taxa_nome?: string; valor_bruto?: number } | undefined;
                const bruto = parseFloat(String(e.valor_final ?? 0)) || 0;
                const liquido = metaAg?.valor_liquido ?? bruto;
                const pacNome = Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome;
                return {
                id: 'ag_' + e.id, refId: e.id, origem: 'agendamento',
                tipo: 'entrada',
                descricao: `${pacNome || 'Paciente'} - ${e.procedimento || 'Atendimento'}`,
                valor: liquido,
                valorBruto: bruto,
                taxaNome: metaAg?.taxa_nome,
                data: e.data_hora,
                categoria: e.status === 'fiado' ? 'Fiado / A Receber' : 'Atendimento',
                status: e.status === 'fiado' ? 'andamento' : 'concluido',
            };});

        const listaMan = (manuais || []).map((s: any) => {
            const id = 'man_' + s.id;
            const m = metaAtual[id] || {};
            const status = (m.status || s.status || 'concluido') as string;
            return {
                id, refId: s.id, origem: 'manual',
                tipo: s.tipo || 'saida',
                descricao: s.descricao,
                valor: parseFloat(String(s.valor ?? 0)) || 0,
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

    } catch (err: any) {
        console.error(err);
        showAlert('Erro ao carregar financeiro: ' + (err?.message || 'tente novamente'), { type: 'error' });
        setTransacoes([]);
        setResumo({ entrada: 0, saida: 0, saldo: 0, andamento: 0 });
    }
    jaCarregou.current = true;
    setLoading(false);
  }

  function abrirNovoLancamento() {
      if (!activeClinicId || activeClinicId === 'all') {
          showAlert('Selecione uma Clínica específica no menu antes de lançar.', { type: 'warning' });
          return;
      }
      setNovoLancamento({ tipo: 'saida', descricao: '', valor: '', data: new Date().toISOString().split('T')[0], categoria: 'Geral', status: 'concluido', paciente_id: '', taxa_id: '' });
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
      const nova: CategoriaFinanceira = {
          id: `cat_${Date.now()}`,
          nome,
          tipo: novoLancamento.tipo === 'entrada' ? 'receita' : 'despesa',
          cor: novoLancamento.tipo === 'entrada' ? '#10b981' : '#64748b',
          ativo: true,
      };
      const novasObj = [...categoriasObj, nova].sort((a, b) => a.nome.localeCompare(b.nome));
      const novas = nomesCategoriasAtivas(novasObj);
      setCategoriasObj(novasObj);
      setCategorias(novas);
      const cid = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      salvarConfig(cid, 'categorias_financeiro', novasObj);
      setNovoLancamento({ ...novoLancamento, categoria: nome });
      setNovaCatTemp('');
  }

  async function salvarLancamento(e: any) {
      e.preventDefault();
      setSalvando(true);
      if (!activeClinicId || activeClinicId === 'all') {
          await showAlert('Selecione uma clínica específica no menu.', { type: 'warning' });
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
      if (error) { await showAlert('Erro: ' + error.message, { type: 'error' }); setSalvando(false); return; }

      let metaParaReload = meta;
      if (novoLancamento.tipo === 'entrada' && novoLancamento.taxa_id) {
          const taxa = taxasMaquininha.find(t => t.id === novoLancamento.taxa_id);
          if (taxa) {
              const bruto = parseFloat(novoLancamento.valor) || 0;
              const liquido = calcularValorLiquido(bruto, taxa.taxa_percentual);
              metaParaReload = {
                  ...meta,
                  [`manual_${ins.id}`]: {
                      taxa_id: taxa.id,
                      taxa_nome: taxa.nome,
                      taxa_percentual: taxa.taxa_percentual,
                      valor_bruto: bruto,
                      valor_liquido: liquido,
                  },
              };
              setMeta(metaParaReload);
              salvarConfig(String(clinicaId), 'lancamentos_meta', metaParaReload);
          }
      }

      setModalAberto(false);
      carregarDados(metaParaReload);
      setSalvando(false);
  }

  // Cancelar lançamento (manual)
  function pedirCancelamento(t: any) {
      if (t.origem !== 'manual') { showAlert('Apenas lançamentos manuais podem ser cancelados.', { type: 'warning' }); return; }
      setModalCancelar(t);
      setMotivoCancelar('');
  }

  async function confirmarCancelamento() {
      if (!modalCancelar) return;
      if (!motivoCancelar.trim()) { await showAlert('Informe o motivo do cancelamento.', { type: 'warning' }); return; }
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
      carregarDados(updMeta);
  }

  async function restaurarCancelado(t: any) {
      if (!(await showConfirm('Restaurar este lançamento?', { title: 'Restaurar', type: 'info', confirmLabel: 'Restaurar' }))) return;
      const updMeta = { ...meta };
      delete updMeta[t.id];
      setMeta(updMeta);
      const cid3 = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      salvarConfig(cid3, 'lancamentos_meta', updMeta);
      try { await supabase.from('despesas').update({ status: 'concluido', motivo_cancelamento: null, cancelado_em: null }).eq('id', t.refId); } catch {}
      carregarDados(updMeta);
  }

  async function excluirDefinitivo(t: any) {
      if (!(await showConfirm('Excluir definitivamente? Esta ação não pode ser desfeita.', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      const updMeta = { ...meta };
      delete updMeta[t.id];
      setMeta(updMeta);
      const cid4 = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      salvarConfig(cid4, 'lancamentos_meta', updMeta);
      if (t.origem === 'manual') await supabase.from('despesas').delete().eq('id', t.refId);
      carregarDados(updMeta);
  }

  async function concluirAndamento(t: any) {
      if (!(await showConfirm('Marcar como concluído?', { title: 'Concluir', type: 'info', confirmLabel: 'Concluir' }))) return;
      const updMeta = { ...meta };
      delete updMeta[t.id];
      setMeta(updMeta);
      const cid5 = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      salvarConfig(cid5, 'lancamentos_meta', updMeta);
      try { await supabase.from('despesas').update({ status: 'concluido' }).eq('id', t.refId); } catch {}
      carregarDados(updMeta);
  }

  // Filtragem
  const transacoesFiltradas = transacoes.filter(t => {
      if (tipoFiltro !== 'todos' && t.tipo !== tipoFiltro) return false;
      if (abaStatus === 'ativos' && t.status !== 'concluido') return false;
      if (abaStatus === 'andamento' && t.status !== 'andamento') return false;
      if (abaStatus === 'cancelados' && t.status !== 'cancelado') return false;
      return true;
  });

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

      const catMap: Record<string, { entrada: number; saida: number }> = {};
      ativos.forEach(t => {
          if (!catMap[t.categoria]) catMap[t.categoria] = { entrada: 0, saida: 0 };
          if (t.tipo === 'entrada') catMap[t.categoria].entrada += t.valor;
          else catMap[t.categoria].saida += t.valor;
      });

      const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
      const linhasTab = (lista: typeof transacoes) => lista.map(t => [
          escapePrintHtml(new Date(t.data).toLocaleDateString('pt-BR')),
          escapePrintHtml(t.descricao),
          `<span class="ortus-tag">${escapePrintHtml(t.categoria)}</span>`,
          `<span class="${t.tipo}">${t.tipo === 'entrada' ? '+' : '-'} ${fmt(t.valor)}</span>`,
      ]);

      const linhasCat = Object.entries(catMap).sort().map(([nome, v]) => [
          `<strong>${escapePrintHtml(nome)}</strong>`,
          `<span class="entrada">${fmt(v.entrada)}</span>`,
          `<span class="saida">${fmt(v.saida)}</span>`,
          `<strong>${fmt(v.entrada - v.saida)}</strong>`,
      ]);

      let bodyHtml = `
        <div class="ortus-section-title">Por Categoria</div>
        ${printTable(['Categoria', 'Entradas', 'Saídas', 'Saldo'], linhasCat, { numCols: [1, 2, 3] })}
        <div class="ortus-section-title">Movimentações Concluídas (${ativos.length})</div>
        ${printTable(['Data', 'Descrição', 'Categoria', 'Valor'], linhasTab(ativos), { numCols: [3] })}
      `;

      if (andamento.length > 0) {
          bodyHtml += `
            <div class="ortus-section-title">Em Andamento (${andamento.length})</div>
            ${printTable(['Data', 'Descrição', 'Categoria', 'Valor'], linhasTab(andamento), { numCols: [3] })}
          `;
      }
      if (cancelados.length > 0) {
          bodyHtml += `
            <div class="ortus-section-title">Cancelados (${cancelados.length})</div>
            ${printTable(['Data', 'Descrição', 'Categoria', 'Valor'], linhasTab(cancelados), { numCols: [3] })}
          `;
      }

      printDocument({
          title: 'Relatório Financeiro',
          documentTitle: `Financeiro — ${clinicaNome}`,
          clinicName: clinicaNome,
          period: periodoStr,
          kpis: [
              { label: 'Receitas', value: fmt(totalEntrada), variant: 'entrada' },
              { label: 'Despesas', value: fmt(totalSaida), variant: 'saida' },
              { label: 'Saldo Líquido', value: fmt(saldo), variant: 'saldo' },
              { label: 'Em Andamento', value: fmt(andamento.reduce((s,c) => s + c.valor, 0)), variant: 'andamento' },
          ],
          bodyHtml,
          autoPrint: true,
      });
  }

  const countAtivos = transacoes.filter(t => t.status === 'concluido').length;
  const countAndamento = transacoes.filter(t => t.status === 'andamento').length;
  const countCancelados = transacoes.filter(t => t.status === 'cancelado').length;

  const pillPeriodo = (ativo: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition-colors ${ativo ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50'}`;

  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Financeiro</h1>
          <p className="mt-1 text-sm text-neutral-500 sm:text-base">
            {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'} · caixa e lançamentos
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={imprimirRelatorio}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            title="Imprimir relatório"
          >
            <Printer size={16} />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            type="button"
            onClick={abrirNovoLancamento}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:flex-none"
          >
            <Plus size={16} /> Novo lançamento
          </button>
        </div>
      </div>

      <div className={`${cardShell} flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4`}>
        <div className="flex gap-2">
          <button type="button" onClick={() => setModoData('mes')} className={pillPeriodo(modoData === 'mes')}>Por mês</button>
          <button type="button" onClick={() => setModoData('periodo')} className={pillPeriodo(modoData === 'periodo')}>Período</button>
        </div>
        {modoData === 'mes' ? (
          <div className="flex h-10 items-center gap-2 rounded-full border border-black/10 bg-[#f8f8f6] px-3">
            <Calendar size={16} className="text-neutral-400" />
            <input
              type="month"
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(e.target.value)}
              className="cursor-pointer bg-transparent text-sm font-medium text-neutral-800 outline-none"
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-black/10 bg-[#f8f8f6] px-3 py-2">
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-transparent text-xs font-medium text-neutral-700 outline-none sm:text-sm" />
            <span className="text-neutral-400">até</span>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-transparent text-xs font-medium text-neutral-700 outline-none sm:text-sm" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 sm:gap-3">
        <section className={`${cardShell} p-4 sm:p-5`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><TrendingUp size={18} /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Entradas</span>
          </div>
          <p className="text-xs font-medium text-neutral-500">Faturamento</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-neutral-100" />
          ) : (
            <p className="mt-1 text-xl font-semibold text-neutral-900 sm:text-2xl">R$ {resumo.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          )}
        </section>
        <section className={`${cardShell} p-4 sm:p-5`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-red-100 p-2 text-red-600"><TrendingDown size={18} /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Saídas</span>
          </div>
          <p className="text-xs font-medium text-neutral-500">Despesas</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-neutral-100" />
          ) : (
            <p className="mt-1 text-xl font-semibold text-neutral-900 sm:text-2xl">R$ {resumo.saida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          )}
        </section>
        <section className={`${cardShell} border border-amber-200/80 p-4 sm:p-5`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-amber-100 p-2 text-amber-700"><ClockIcon size={18} /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Pendente</span>
          </div>
          <p className="text-xs font-medium text-neutral-500">Em andamento</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-neutral-100" />
          ) : (
            <p className="mt-1 text-xl font-semibold text-amber-800 sm:text-2xl">R$ {resumo.andamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          )}
        </section>
        <section className={`${cardShell} border border-neutral-800 bg-neutral-950 p-4 text-white sm:p-5`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-white/10 p-2 text-[#c8f053]"><Wallet size={18} /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Resultado</span>
          </div>
          <p className="text-xs font-medium text-white/60">Saldo líquido</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-white/10" />
          ) : (
            <p className={`mt-1 text-xl font-semibold sm:text-2xl ${resumo.saldo >= 0 ? 'text-white' : 'text-red-400'}`}>
              R$ {resumo.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {([
          ['ativos', 'Ativos', countAtivos, CheckCircle],
          ['andamento', 'Em andamento', countAndamento, ClockIcon],
          ['cancelados', 'Cancelados', countCancelados, Trash2],
        ] as const).map(([id, label, count, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAbaStatus(id)}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none ${
              abaStatus === id ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            <Icon size={16} />
            {label}
            {count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${abaStatus === id ? 'bg-white/20' : 'bg-neutral-100 text-neutral-600'}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      <div className={`${cardShell} overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b border-black/5 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
              <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#f3f4f1] p-2 text-neutral-700"><Activity size={18}/></span>
                  <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">
                    {abaStatus === 'ativos' ? 'Extrato' : abaStatus === 'andamento' ? 'Em andamento' : 'Cancelados'}
                  </h3>
              </div>
              <div className="flex rounded-full border border-black/10 bg-[#f3f4f1] p-0.5">
                  <button type="button" onClick={() => setTipoFiltro('todos')} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${tipoFiltro === 'todos' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Tudo</button>
                  <button type="button" onClick={() => setTipoFiltro('entrada')} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${tipoFiltro === 'entrada' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Entradas</button>
                  <button type="button" onClick={() => setTipoFiltro('saida')} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${tipoFiltro === 'saida' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Saídas</button>
              </div>
          </div>
          <div className="divide-y divide-black/5">
              {loading && !jaCarregou.current ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex h-16 animate-pulse items-center gap-3 rounded-2xl bg-neutral-50 px-3" />
                    ))}
                  </div>
              ) : transacoesFiltradas.length === 0 ? (
                  <div className="p-12 text-center text-sm text-neutral-400">Nenhuma movimentação encontrada.</div>
              ) : (
                  transacoesFiltradas.map((t: any) => {
                      const isCancel = t.status === 'cancelado';
                      const isAndam = t.status === 'andamento';
                      return (
                          <div key={t.id} className={`group flex items-center justify-between p-4 transition-colors sm:p-5 ${isCancel ? 'bg-neutral-50/80 hover:bg-neutral-100/60' : 'hover:bg-[#f8f8f6]'}`}>
                              <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                                  <div className={`flex items-center justify-center rounded-2xl p-2.5 sm:p-3 ${
                                      isCancel ? 'bg-neutral-200 text-neutral-400'
                                      : isAndam ? 'bg-amber-100 text-amber-700'
                                      : t.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-red-100 text-red-600'
                                  }`}>
                                      {isCancel ? <Ban size={22}/> : isAndam ? <ClockIcon size={22}/> : t.tipo === 'entrada' ? <ArrowUpCircle size={24}/> : <ArrowDownCircle size={24}/>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-semibold md:text-base ${isCancel ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>{t.descricao}</p>
                                      {t.taxaNome && t.valorBruto != null && t.valorBruto !== t.valor && (
                                          <p className="text-[10px] text-neutral-400">Bruto R$ {(t.valorBruto ?? 0).toFixed(2)} · {t.taxaNome} · Líquido</p>
                                      )}
                                      <div className="mt-1 flex flex-wrap items-center gap-2">
                                          <span className="rounded-full border border-black/5 bg-[#f3f4f1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{t.categoria}</span>
                                          <span className="text-xs font-medium text-neutral-400">{new Date(t.data).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</span>
                                          {isAndam && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Em andamento</span>}
                                          {isCancel && t.motivo_cancelamento && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700" title={String(t.motivo_cancelamento)}>Motivo: {String(t.motivo_cancelamento).length > 40 ? String(t.motivo_cancelamento).slice(0,40)+'…' : String(t.motivo_cancelamento)}</span>}
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-3">
                                  <span className={`whitespace-nowrap text-sm font-semibold md:text-lg ${
                                      isCancel ? 'text-neutral-400 line-through'
                                      : t.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-600'
                                  }`}>
                                      {t.tipo === 'entrada' ? '+' : '-'} R$ {(Number(t.valor) || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                  </span>
                                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                      {abaStatus === 'andamento' && t.origem === 'manual' && (
                                          <button type="button" onClick={() => concluirAndamento(t)} className="rounded-full p-2 text-emerald-700 hover:bg-emerald-50" title="Marcar como concluído"><CheckCircle size={14}/></button>
                                      )}
                                      {abaStatus === 'cancelados' ? (
                                          <>
                                              <button type="button" onClick={() => restaurarCancelado(t)} className="rounded-full p-2 text-neutral-700 hover:bg-neutral-100" title="Restaurar"><RotateCcw size={14}/></button>
                                              <button type="button" onClick={() => excluirDefinitivo(t)} className="rounded-full p-2 text-red-600 hover:bg-red-50" title="Excluir definitivamente"><Trash2 size={14}/></button>
                                          </>
                                      ) : t.origem === 'manual' && (
                                          <button type="button" onClick={() => pedirCancelamento(t)} className="rounded-full p-2 text-red-600 hover:bg-red-50" title="Cancelar lançamento"><Ban size={14}/></button>
                                      )}
                                  </div>
                              </div>
                          </div>
                      );
                  })
              )}
          </div>
      </div>

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} maxWidth="md" hideCloseButton panelClassName="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-[#eceee9] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="flex shrink-0 items-center justify-between border-b border-black/5 bg-white p-5">
                    <h3 className="text-xl font-semibold text-neutral-900">Novo lançamento</h3>
                    <button type="button" onClick={() => setModalAberto(false)} className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"><X size={20}/></button>
                </div>
                <form onSubmit={salvarLancamento} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                    <div className="flex items-start gap-2 rounded-[1.15rem] border border-black/5 bg-[#f3f4f1] p-3 text-xs font-medium text-neutral-700">
                        <AlertCircle size={16} className="mt-0.5 shrink-0 text-neutral-500"/>
                        <span>O lançamento será vinculado à clínica selecionada no menu.</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-full border border-black/10 bg-[#f3f4f1] p-0.5">
                        <button type="button" onClick={() => setNovoLancamento({...novoLancamento, tipo: 'entrada'})} className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-all ${novoLancamento.tipo === 'entrada' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}><ArrowUpCircle size={18}/> Receita</button>
                        <button type="button" onClick={() => setNovoLancamento({...novoLancamento, tipo: 'saida'})} className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-all ${novoLancamento.tipo === 'saida' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}><ArrowDownCircle size={18}/> Despesa</button>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-400">Descrição</label>
                        <input required className="w-full rounded-2xl border border-black/10 bg-[#f8f8f6] p-3 font-medium text-neutral-800 outline-none focus:border-neutral-400" placeholder={novoLancamento.tipo === 'entrada' ? 'Ex: Venda de Kit' : 'Ex: Conta de Luz'} value={novoLancamento.descricao} onChange={e => setNovoLancamento({...novoLancamento, descricao: e.target.value})} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-400">Valor (R$)</label>
                            <input required type="number" step="0.01" className="w-full rounded-2xl border border-black/10 bg-[#f8f8f6] p-3 font-medium text-neutral-800 outline-none focus:border-neutral-400" placeholder="0.00" value={novoLancamento.valor} onChange={e => setNovoLancamento({...novoLancamento, valor: e.target.value})} />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-400">Data</label>
                            <input required type="date" className="w-full rounded-2xl border border-black/10 bg-[#f8f8f6] p-3 font-medium text-neutral-700 outline-none focus:border-neutral-400" value={novoLancamento.data} onChange={e => setNovoLancamento({...novoLancamento, data: e.target.value})} />
                        </div>
                    </div>

                    {novoLancamento.tipo === 'entrada' && taxasMaquininha.length > 0 && (
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-400">Forma de pagamento / Maquininha</label>
                            <CustomSelect
                                value={novoLancamento.taxa_id}
                                onChange={v => setNovoLancamento({ ...novoLancamento, taxa_id: v })}
                                options={[{ value: '', label: 'Sem taxa (valor integral)' }, ...taxasMaquininha.map(t => ({ value: t.id, label: `${t.nome} (${t.taxa_percentual}%)` }))]}
                                placeholder="Selecione..."
                                size="lg"
                                menuPortal
                            />
                            {novoLancamento.taxa_id && novoLancamento.valor && (() => {
                                const taxa = taxasMaquininha.find(t => t.id === novoLancamento.taxa_id);
                                if (!taxa) return null;
                                const bruto = parseFloat(novoLancamento.valor) || 0;
                                const liquido = calcularValorLiquido(bruto, taxa.taxa_percentual);
                                return (
                                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mt-2 font-bold">
                                        Valor líquido estimado: R$ {liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (taxa {taxa.taxa_percentual}%)
                                    </p>
                                );
                            })()}
                        </div>
                    )}

                    {/* CATEGORIA */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Categoria</label>
                            <div className="flex rounded-full border border-black/10 bg-[#f3f4f1] p-0.5">
                                <button type="button" onClick={() => setModoCategoria('lista')} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${modoCategoria === 'lista' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Lista</button>
                                <button type="button" onClick={() => setModoCategoria('livre')} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${modoCategoria === 'livre' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Livre</button>
                            </div>
                        </div>
                        {modoCategoria === 'lista' ? (
                            <>
                                <CustomSelect value={novoLancamento.categoria} onChange={v => setNovoLancamento({...novoLancamento, categoria: v})} options={categorias.map(c => ({ value: c, label: c }))} placeholder="Selecione a categoria" size="lg"/>
                                <div className="flex gap-2 mt-2">
                                    <input value={novaCatTemp} onChange={e => setNovaCatTemp(e.target.value)} placeholder="+ Criar nova categoria..." className="flex-1 rounded-2xl border border-black/10 bg-[#f8f8f6] p-2 text-xs font-medium outline-none focus:border-neutral-400"/>
                                    <button type="button" onClick={adicionarNovaCategoria} disabled={!novaCatTemp.trim()} className="flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"><Plus size={12}/> Salvar</button>
                                </div>
                            </>
                        ) : (
                            <div>
                                <input value={novoLancamento.categoria} onChange={e => setNovoLancamento({...novoLancamento, categoria: e.target.value})} placeholder="Digite uma categoria..." className="w-full rounded-2xl border border-black/10 bg-[#f8f8f6] p-3 font-medium text-neutral-800 outline-none focus:border-neutral-400"/>
                                <p className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400"><Tag size={10}/> Usada só neste lançamento (não salva na lista).</p>
                            </div>
                        )}
                    </div>

                    {/* PACIENTE (vinculação opcional) */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-400">Paciente <span className="font-normal normal-case text-neutral-400">(opcional)</span></label>
                        <CustomSelect
                            value={novoLancamento.paciente_id}
                            onChange={v => setNovoLancamento({ ...novoLancamento, paciente_id: v })}
                            options={[{ value: '', label: 'Sem vínculo (despesa operacional)' }, ...pacientesOptions.map(p => ({ value: p.id, label: p.nome }))]}
                            placeholder="Selecione..."
                            searchable
                            size="lg"
                        />
                        <p className="mt-1 text-[10px] text-neutral-400">Se vinculado, o lançamento some se o paciente for removido.</p>
                    </div>

                    {/* STATUS */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-400">Status</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setNovoLancamento({...novoLancamento, status: 'concluido'})} className={`flex items-center justify-center gap-1.5 rounded-full border py-2.5 text-xs font-semibold transition-all ${novoLancamento.status === 'concluido' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/10 bg-white text-neutral-600'}`}><CheckCircle size={14}/> Concluído</button>
                            <button type="button" onClick={() => setNovoLancamento({...novoLancamento, status: 'andamento'})} className={`flex items-center justify-center gap-1.5 rounded-full border py-2.5 text-xs font-semibold transition-all ${novoLancamento.status === 'andamento' ? 'border-amber-600 bg-amber-600 text-white' : 'border-black/10 bg-white text-neutral-600'}`}><ClockIcon size={14}/> Em andamento</button>
                        </div>
                    </div>

                  </div>
                  <div className="flex shrink-0 gap-3 border-t border-black/5 bg-white p-5">
                      <button type="button" onClick={() => setModalAberto(false)} className="flex-1 rounded-full bg-[#f3f4f1] py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-200">Cancelar</button>
                      <button type="submit" disabled={salvando} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60">
                          {salvando ? <Loader2 className="animate-spin"/> : <><Save size={18}/> Salvar</>}
                      </button>
                  </div>
                </form>
      </Modal>

      {modalCancelar && (
      <Modal open onClose={() => setModalCancelar(null)} maxWidth="md" hideCloseButton panelClassName="overflow-hidden rounded-[1.75rem] border border-black/10 bg-[#eceee9] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="flex items-center gap-3 border-b border-black/5 bg-white p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600 text-white"><Ban size={20}/></div>
                    <div>
                        <h3 className="font-semibold text-neutral-900">Cancelar lançamento</h3>
                        <p className="text-xs text-neutral-500">{modalCancelar.descricao}</p>
                    </div>
                </div>
                <div className="space-y-3 bg-white p-5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Motivo <span className="text-red-500">*</span></label>
                    <textarea autoFocus value={motivoCancelar} onChange={e => setMotivoCancelar(e.target.value)} className="h-24 w-full resize-none rounded-2xl border border-black/10 bg-[#f8f8f6] p-3 text-sm outline-none focus:border-neutral-400" placeholder="Ex: Pagamento não realizado, lançamento duplicado..."/>
                    <p className="text-[10px] text-neutral-400">O lançamento ficará na aba Cancelados com o motivo registrado.</p>
                </div>
                <div className="flex justify-end gap-2 border-t border-black/5 bg-[#f3f4f1] p-5">
                    <button type="button" onClick={() => setModalCancelar(null)} className="rounded-full px-4 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-white">Voltar</button>
                    <button type="button" onClick={confirmarCancelamento} disabled={!motivoCancelar.trim()} className="flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"><Ban size={14}/> Confirmar</button>
                </div>
      </Modal>
      )}
    </div>
  );
}
