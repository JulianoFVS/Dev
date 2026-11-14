'use client';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Plus,
    Download, ArrowUpCircle, ArrowDownCircle, Loader2, X, Save, AlertCircle, Search, Filter, Pencil,
    Trash2, Ban, Clock as ClockIcon, RotateCcw, CheckCircle
} from 'lucide-react';
import MenuPontos from '@/components/ui/MenuPontos';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import CustomSelect from '@/components/ui/CustomSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import CampoData from '@/components/ui/CampoData';
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

const CATS_PADRAO = nomesCategoriasAtivas(CATEGORIAS_FINANCEIRAS_PADRAO);
const cardShell = 'rounded-xl border border-neutral-200 bg-white';
const campo = 'box-border h-11 w-full rounded-md border border-neutral-200 bg-white px-3 text-base text-neutral-900 outline-none focus:border-neutral-900 sm:h-10 sm:text-sm';
const rotulo = 'mb-1.5 block text-xs font-medium text-neutral-500';

const FORMAS_PAGAMENTO = [
  { value: 'nao_informada', label: 'Não informada' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'convenio', label: 'Convênio' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'outro', label: 'Outro' },
];

const ORIGEM_LABEL: Record<string, string> = {
  consulta: 'Consulta',
  fiado: 'Fiado recebido',
  manual: 'Manual',
  protese: 'Prótese',
  comissao: 'Comissão',
  taxa: 'Taxa',
};

const RESUMO_VAZIO = { entrada: 0, saida: 0, saldo: 0, andamento: 0, aReceber: 0, aPagar: 0 };

function brl(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Lançamento já normalizado pela tela (agendamento ou despesa manual). */
type Lancamento = {
  id: string;
  refId: string;
  origem: string;
  origemTipo: string;
  tipo: string;
  descricao: string;
  paciente?: string;
  pacienteId?: string;
  profissional?: string;
  valor: number;
  valorBruto?: number | null;
  taxaNome?: string;
  forma?: string;
  temTaxa?: boolean;
  data: string;
  categoria?: string;
  status: string;
  motivo_cancelamento?: string | null;
  cancelado_em?: string | null;
};

/** Ação de um lançamento — vira item de menu no celular e botão-ícone no desktop. */
type AcaoLancamento = {
  id: string;
  label: string;
  icone: ReactNode;
  tom: 'neutro' | 'positivo' | 'perigo';
  onClick: () => void;
};

export default function Financeiro() {
  const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
  const { showAlert, showConfirm } = useCustomAlert();
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState(RESUMO_VAZIO);
  const [loading, setLoading] = useState(true);
  const jaCarregou = useRef(false);

  // Filtros
  const [modoData, setModoData] = useState<'mes' | 'periodo'>('mes');
  const [mesSelecionado, setMesSelecionado] = useState(new Date().toISOString().slice(0, 7));
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [abaStatus, setAbaStatus] = useState<'ativos' | 'andamento' | 'cancelados'>('ativos');
  const [busca, setBusca] = useState('');
  const [showFiltros, setShowFiltros] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroOrigem, setFiltroOrigem] = useState('todas');
  const [filtroForma, setFiltroForma] = useState('todas');
  const [filtroPaciente, setFiltroPaciente] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [filtroTaxa, setFiltroTaxa] = useState<'todas' | 'com' | 'sem'>('todas');
  const [filtroProfissional, setFiltroProfissional] = useState('todos');

  // Modal Lançamento
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
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
      forma: 'nao_informada',
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

  const idsClinicaKey = clinics.map((c) => c.id).join(',');
  useEffect(() => { if (dataInicio && dataFim && !clinicLoading && activeClinicId) carregarDados(); }, [mesSelecionado, dataInicio, dataFim, modoData, clinicLoading, activeClinicId, idsClinicaKey]);

  async function carregarDados(metaOverride?: Record<string, any>) {
    if (clinicLoading || !activeClinicId) return;
    const metaAtual = metaOverride ?? meta;
    if (!jaCarregou.current) setLoading(true);
    const clinicaId = activeClinicId;
    const filtrarClinica = clinicaId && clinicaId !== 'all';
    const idsClinica = clinics.map((c) => c.id).filter((id) => id != null && id !== '');
    if (!filtrarClinica && idsClinica.length === 0) {
      setTransacoes([]);
      setResumo(RESUMO_VAZIO);
      jaCarregou.current = true;
      setLoading(false);
      return;
    }

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
            .select('id, valor_final, data_hora, procedimento, status, profissional_id, pacientes(nome), profissionais(nome)')
            .gte('data_hora', inicioFull).lte('data_hora', fimFull);
        qAg = filtrarClinica ? qAg.eq('clinica_id', clinicaId) : qAg.in('clinica_id', idsClinica);
        const { data: agendamentos, error: errAg } = await qAg;
        if (errAg) throw errAg;

        let qMan = supabase.from('despesas').select('*').gte('data', inicio).lte('data', fim);
        qMan = filtrarClinica ? qMan.eq('clinica_id', clinicaId) : qMan.in('clinica_id', idsClinica);
        const { data: manuais, error: errMan } = await qMan;
        if (errMan) throw errMan;

        const listaAg = (agendamentos || [])
            .filter((e: any) => (e.status === 'concluido' || e.status === 'fiado') && e.tipo_registro !== 'debito_manual' && e.observacoes !== 'Débito manual')
            .map((e: any) => {
                const metaAg = metaAtual[`ag_${e.id}`] as { valor_liquido?: number; taxa_nome?: string; valor_bruto?: number; forma_label?: string } | undefined;
                const bruto = parseFloat(String(e.valor_final ?? 0)) || 0;
                const liquido = metaAg?.valor_liquido ?? bruto;
                const pacNome = Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome;
                const profNome = Array.isArray(e.profissionais) ? e.profissionais[0]?.nome : e.profissionais?.nome;
                return {
                id: 'ag_' + e.id, refId: e.id, origem: 'agendamento',
                origemTipo: e.status === 'fiado' ? 'fiado' : 'consulta',
                tipo: 'entrada',
                descricao: `${pacNome || 'Paciente'} - ${e.procedimento || 'Atendimento'}`,
                paciente: pacNome || '',
                profissional: profNome || '',
                valor: liquido,
                valorBruto: bruto,
                taxaNome: metaAg?.taxa_nome || '',
                forma: metaAg?.forma_label || metaAg?.taxa_nome || 'Não informada',
                temTaxa: Boolean(metaAg?.taxa_nome),
                data: e.data_hora,
                categoria: e.status === 'fiado' ? 'Fiado / A Receber' : 'Atendimento',
                status: e.status === 'fiado' ? 'andamento' : 'concluido',
            };});

        const listaMan = (manuais || []).map((s: any) => {
            const id = 'man_' + s.id;
            const m = { ...(metaAtual[`manual_${s.id}`] || {}), ...(metaAtual[id] || {}) };
            const status = (m.status || s.status || 'concluido') as string;
            const texto = `${s.categoria || ''} ${s.descricao || ''}`;
            const origemTipo = /pr[oó]tese/i.test(texto) ? 'protese' : /comiss/i.test(texto) ? 'comissao' : /taxa/i.test(texto) ? 'taxa' : 'manual';
            return {
                id, refId: s.id, origem: 'manual',
                origemTipo,
                tipo: s.tipo || 'saida',
                descricao: s.descricao,
                paciente: '',
                pacienteId: s.paciente_id ? String(s.paciente_id) : '',
                profissional: '',
                valor: m.valor_liquido ?? (parseFloat(String(s.valor ?? 0)) || 0),
                valorBruto: m.valor_bruto ?? (parseFloat(String(s.valor ?? 0)) || 0),
                taxaNome: m.taxa_nome || '',
                forma: m.forma_label || m.taxa_nome || 'Não informada',
                temTaxa: Boolean(m.taxa_nome),
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
        const aReceber = todas.filter(t => t.tipo === 'entrada' && t.status === 'andamento').reduce((s, c) => s + (c.valor || 0), 0);
        const aPagar = todas.filter(t => t.tipo === 'saida' && t.status === 'andamento').reduce((s, c) => s + (c.valor || 0), 0);
        setResumo({ entrada: totalEntrada, saida: totalSaida, saldo: totalEntrada - totalSaida, andamento: aReceber + aPagar, aReceber, aPagar });

    } catch (err: any) {
        console.error(err);
        showAlert('Erro ao carregar financeiro: ' + (err?.message || 'tente novamente'), { type: 'error' });
        setTransacoes([]);
        setResumo(RESUMO_VAZIO);
    }
    jaCarregou.current = true;
    setLoading(false);
  }

  function abrirNovoLancamento() {
      if (!activeClinicId || activeClinicId === 'all') {
          showAlert('Selecione uma Clínica específica no menu antes de lançar.', { type: 'warning' });
          return;
      }
      setEditandoId(null);
      setNovoLancamento({ tipo: 'saida', descricao: '', valor: '', data: new Date().toISOString().split('T')[0], categoria: 'Geral', status: 'concluido', paciente_id: '', taxa_id: '', forma: 'nao_informada' });
      setModoCategoria('lista');
      setNovaCatTemp('');
      setModalAberto(true);
      // Carrega pacientes da clínica para vinculação opcional
      supabase.from('pacientes').select('id, nome').eq('clinica_id', activeClinicId).order('nome').then(({ data }) => {
          setPacientesOptions((data || []) as { id: string; nome: string }[]);
      });
  }

  function abrirEdicao(t: any) {
      if (!activeClinicId || activeClinicId === 'all') {
          showAlert('Selecione uma clínica específica no menu antes de editar.', { type: 'warning' });
          return;
      }
      const forma = FORMAS_PAGAMENTO.find((f) => f.label === t.forma)?.value || 'nao_informada';
      setEditandoId(String(t.refId));
      setNovoLancamento({
          tipo: t.tipo === 'entrada' ? 'entrada' : 'saida',
          descricao: t.descricao || '',
          valor: String(t.valorBruto ?? t.valor ?? ''),
          data: String(t.data || '').slice(0, 10),
          categoria: t.categoria || 'Geral',
          status: t.status === 'andamento' ? 'andamento' : 'concluido',
          paciente_id: t.pacienteId || '',
          taxa_id: '',
          forma,
      });
      setModoCategoria('lista');
      setModalAberto(true);
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
      if (!novoLancamento.data) {
          await showAlert('Informe a data.', { type: 'warning' });
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
      let idAlvo = editandoId;
      if (editandoId) {
          const { error } = await supabase.from('despesas').update(payload).eq('id', editandoId);
          if (error) { await showAlert('Erro: ' + error.message, { type: 'error' }); setSalvando(false); return; }
      } else {
          const { data: ins, error } = await supabase.from('despesas').insert([payload]).select().single();
          if (error) { await showAlert('Erro: ' + error.message, { type: 'error' }); setSalvando(false); return; }
          idAlvo = ins.id;
      }

      const formaOpt = FORMAS_PAGAMENTO.find((f) => f.value === novoLancamento.forma);
      const taxa = novoLancamento.tipo === 'entrada' && novoLancamento.taxa_id
          ? taxasMaquininha.find((t) => t.id === novoLancamento.taxa_id)
          : undefined;
      const metaItem: Record<string, unknown> = {};
      if (formaOpt && formaOpt.value !== 'nao_informada') {
          metaItem.forma = formaOpt.value;
          metaItem.forma_label = formaOpt.label;
      }
      if (taxa) {
          const bruto = parseFloat(novoLancamento.valor) || 0;
          metaItem.taxa_id = taxa.id;
          metaItem.taxa_nome = taxa.nome;
          metaItem.taxa_percentual = taxa.taxa_percentual;
          metaItem.valor_bruto = bruto;
          metaItem.valor_liquido = calcularValorLiquido(bruto, taxa.taxa_percentual);
      }
      let metaParaReload = meta;
      if (editandoId || Object.keys(metaItem).length > 0) {
          metaParaReload = { ...meta, [`manual_${idAlvo}`]: metaItem };
          setMeta(metaParaReload);
          salvarConfig(String(clinicaId), 'lancamentos_meta', metaParaReload);
      }

      setEditandoId(null);
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

  async function receberFiado(t: any) {
      if (!(await showConfirm('Registrar este valor como recebido? Ele entra no saldo do caixa.', { title: 'Receber', type: 'info', confirmLabel: 'Receber' }))) return;
      const { error } = await supabase.from('agendamentos').update({ status: 'concluido' }).eq('id', t.refId);
      if (error) { await showAlert('Erro: ' + error.message, { type: 'error' }); return; }
      carregarDados();
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

  function nomeDoPaciente(t: { paciente?: string; pacienteId?: string }) {
      if (t.paciente) return t.paciente;
      if (!t.pacienteId) return '';
      return pacientesOptions.find((p) => p.id === t.pacienteId)?.nome || '';
  }

  const transacoesFiltradas = transacoes.filter((t) => {
      if (tipoFiltro !== 'todos' && t.tipo !== tipoFiltro) return false;
      if (abaStatus === 'ativos' && t.status !== 'concluido') return false;
      if (abaStatus === 'andamento' && t.status !== 'andamento') return false;
      if (abaStatus === 'cancelados' && t.status !== 'cancelado') return false;
      if (filtroCategoria !== 'todas' && t.categoria !== filtroCategoria) return false;
      if (filtroOrigem !== 'todas' && t.origemTipo !== filtroOrigem) return false;
      if (filtroForma !== 'todas' && String(t.forma || 'Não informada') !== filtroForma) return false;
      if (filtroProfissional !== 'todos' && String(t.profissional || '') !== filtroProfissional) return false;
      if (filtroPaciente) {
          const nome = nomeDoPaciente(t).toLowerCase();
          const idOk = t.pacienteId && t.pacienteId === filtroPaciente;
          const nomeOk = nome.includes(filtroPaciente.toLowerCase()) || pacientesOptions.find((p) => p.id === filtroPaciente)?.nome.toLowerCase() === nome;
          if (!idOk && !nomeOk) return false;
      }
      if (filtroTaxa === 'com' && !t.temTaxa) return false;
      if (filtroTaxa === 'sem' && t.temTaxa) return false;
      const valor = Number(t.valor) || 0;
      if (valorMin !== '' && valor < Number(valorMin)) return false;
      if (valorMax !== '' && valor > Number(valorMax)) return false;
      const q = busca.trim().toLowerCase();
      if (q) {
          const blob = `${t.descricao || ''} ${nomeDoPaciente(t)} ${t.categoria || ''} ${t.profissional || ''}`.toLowerCase();
          if (!blob.includes(q)) return false;
      }
      return true;
  });

  const opcoesCategoria = [...new Set(transacoes.map((t) => t.categoria).filter(Boolean))].sort();
  const opcoesForma = [...new Set(transacoes.map((t) => t.forma || 'Não informada'))].sort();
  const opcoesProfissional = [...new Set(transacoes.map((t) => t.profissional).filter(Boolean))].sort();

  function exportarCsv() {
      const cab = ['Data', 'Descrição', 'Paciente', 'Categoria', 'Origem', 'Forma', 'Bruto', 'Taxa', 'Líquido', 'Status'];
      const linhas = transacoesFiltradas.map((t) => {
          const bruto = Number(t.valorBruto ?? t.valor) || 0;
          const liquido = Number(t.valor) || 0;
          const taxa = Math.max(0, bruto - liquido);
          return [
              new Date(t.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
              t.descricao || '',
              nomeDoPaciente(t),
              t.categoria || '',
              ORIGEM_LABEL[t.origemTipo] || t.origemTipo || '',
              t.forma || 'Não informada',
              bruto.toFixed(2).replace('.', ','),
              taxa.toFixed(2).replace('.', ','),
              liquido.toFixed(2).replace('.', ','),
              t.status === 'concluido' ? 'Concluído' : t.status === 'andamento' ? 'Em andamento' : 'Cancelado',
          ];
      });
      const csv = [cab, ...linhas]
          .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
          .join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `extrato-${mesSelecionado || 'periodo'}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
  }

  const countAtivos = transacoes.filter(t => t.status === 'concluido').length;
  const countAndamento = transacoes.filter(t => t.status === 'andamento').length;
  const countCancelados = transacoes.filter(t => t.status === 'cancelado').length;

  const pillPeriodo = (ativo: boolean) =>
    `inline-flex h-11 shrink-0 items-center rounded-full px-3.5 text-sm font-medium transition-colors sm:h-10 sm:rounded-md sm:px-3 ${ativo ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`;

  const [filtrosMobile, setFiltrosMobile] = useState(false);

  const filtrosAtivos = [
    modoData !== 'mes',
    tipoFiltro !== 'todos',
    filtroCategoria !== 'todas',
    filtroOrigem !== 'todas',
    filtroForma !== 'todas',
    filtroProfissional !== 'todos',
    !!filtroPaciente,
    filtroTaxa !== 'todas',
    valorMin !== '',
    valorMax !== '',
  ].filter(Boolean).length;

  function limparFiltros() {
    setModoData('mes');
    setTipoFiltro('todos');
    setFiltroCategoria('todas');
    setFiltroOrigem('todas');
    setFiltroForma('todas');
    setFiltroProfissional('todos');
    setFiltroPaciente('');
    setFiltroTaxa('todas');
    setValorMin('');
    setValorMax('');
    setBusca('');
  }

  /** Ações disponíveis para um lançamento (mesma regra em cartão e em tabela). */
  function acoesDoLancamento(t: Lancamento): AcaoLancamento[] {
    const acoes: AcaoLancamento[] = [];
    if (abaStatus === 'andamento' && t.origem === 'manual') {
      acoes.push({ id: 'concluir', label: 'Marcar como concluído', icone: <CheckCircle size={15} />, tom: 'positivo', onClick: () => concluirAndamento(t) });
    }
    if (abaStatus === 'andamento' && t.origem === 'agendamento') {
      acoes.push({ id: 'receber', label: 'Registrar recebimento', icone: <CheckCircle size={15} />, tom: 'positivo', onClick: () => receberFiado(t) });
    }
    if (abaStatus === 'cancelados') {
      acoes.push({ id: 'restaurar', label: 'Restaurar', icone: <RotateCcw size={15} />, tom: 'neutro', onClick: () => restaurarCancelado(t) });
      acoes.push({ id: 'excluir', label: 'Excluir definitivamente', icone: <Trash2 size={15} />, tom: 'perigo', onClick: () => excluirDefinitivo(t) });
      return acoes;
    }
    if (t.origem === 'manual') {
      acoes.push({ id: 'editar', label: 'Editar lançamento', icone: <Pencil size={15} />, tom: 'neutro', onClick: () => abrirEdicao(t) });
      acoes.push({ id: 'cancelar', label: 'Cancelar lançamento', icone: <Ban size={15} />, tom: 'perigo', onClick: () => pedirCancelamento(t) });
    }
    return acoes;
  }

  function camposPeriodo() {
    return (
      <>
        <div className="flex gap-2">
          <button type="button" onClick={() => setModoData('mes')} className={pillPeriodo(modoData === 'mes')}>Mês</button>
          <button type="button" onClick={() => setModoData('periodo')} className={pillPeriodo(modoData === 'periodo')}>Intervalo</button>
        </div>
        {modoData === 'mes' ? (
          <div className="flex h-11 w-full items-center justify-between gap-1 rounded-lg border border-neutral-200 bg-white px-1 sm:h-10 sm:w-auto sm:justify-start sm:rounded-md">
            <button type="button" onClick={() => mudarMes(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg text-neutral-500 hover:bg-neutral-50" aria-label="Mês anterior">‹</button>
            <span className="min-w-0 flex-1 truncate px-1 text-center text-sm font-medium text-neutral-900 sm:min-w-[9.5rem] sm:flex-none">{rotuloMes}</span>
            <button type="button" onClick={() => mudarMes(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg text-neutral-500 hover:bg-neutral-50" aria-label="Próximo mês">›</button>
          </div>
        ) : (
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <CampoData value={dataInicio} onChange={setDataInicio} />
            <CampoData value={dataFim} onChange={setDataFim} />
          </div>
        )}
      </>
    );
  }

  function camposAvancados() {
    return (
      <>
        <label>
          <span className={rotulo}>Categoria</span>
          <CustomSelect value={filtroCategoria} onChange={setFiltroCategoria} options={[{ value: 'todas', label: 'Todas' }, ...opcoesCategoria.map((c) => ({ value: c, label: c }))]} size="md" />
        </label>
        <label>
          <span className={rotulo}>Origem</span>
          <CustomSelect value={filtroOrigem} onChange={setFiltroOrigem} options={[{ value: 'todas', label: 'Todas' }, ...Object.entries(ORIGEM_LABEL).map(([value, label]) => ({ value, label }))]} size="md" />
        </label>
        <label>
          <span className={rotulo}>Forma</span>
          <CustomSelect value={filtroForma} onChange={setFiltroForma} options={[{ value: 'todas', label: 'Todas' }, ...opcoesForma.map((c) => ({ value: c, label: c }))]} size="md" />
        </label>
        <label>
          <span className={rotulo}>Profissional</span>
          <CustomSelect value={filtroProfissional} onChange={setFiltroProfissional} options={[{ value: 'todos', label: 'Todos' }, ...opcoesProfissional.map((c) => ({ value: c, label: c }))]} size="md" />
        </label>
        <label>
          <span className={rotulo}>Paciente</span>
          <CustomSelect value={filtroPaciente} onChange={setFiltroPaciente} options={[{ value: '', label: 'Todos' }, ...pacientesOptions.map((p) => ({ value: p.id, label: p.nome }))]} searchable size="md" />
        </label>
        <label>
          <span className={rotulo}>Taxa de cartão</span>
          <CustomSelect value={filtroTaxa} onChange={(v) => setFiltroTaxa(v as 'todas' | 'com' | 'sem')} options={[{ value: 'todas', label: 'Com e sem taxa' }, { value: 'com', label: 'Com taxa' }, { value: 'sem', label: 'Sem taxa' }]} size="md" />
        </label>
        <label>
          <span className={rotulo}>Valor mínimo</span>
          <input type="number" inputMode="decimal" step="0.01" value={valorMin} onChange={(e) => setValorMin(e.target.value)} className={campo} />
        </label>
        <label>
          <span className={rotulo}>Valor máximo</span>
          <input type="number" inputMode="decimal" step="0.01" value={valorMax} onChange={(e) => setValorMax(e.target.value)} className={campo} />
        </label>
      </>
    );
  }

  function mudarMes(delta: number) {
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    const data = new Date(ano, (mes || 1) - 1 + delta, 1);
    setMesSelecionado(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`);
  }

  const rotuloMes = (() => {
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    if (!ano || !mes) return mesSelecionado;
    const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  })();

  const resumoPeriodo = (() => {
    if (modoData === 'mes') return rotuloMes;
    if (!dataInicio || !dataFim) return 'Escolha o intervalo';
    const de = new Date(`${dataInicio}T12:00:00`).toLocaleDateString('pt-BR');
    const ate = new Date(`${dataFim}T12:00:00`).toLocaleDateString('pt-BR');
    return `${de} até ${ate}`;
  })();

  return (
    <div className="w-full min-w-0 space-y-3 overflow-x-hidden px-2.5 py-2.5 pb-24 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5 lg:pb-12">
      {/* Cabeçalho: título + ações principais (desktop) / ⋯ + CSV (mobile) */}
      <div className="flex items-start justify-between gap-3 lg:items-end">
        <div className="min-w-0">
          <h1 className="text-[1.65rem] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-2xl md:text-[2rem]">Financeiro</h1>
          <p className="mt-1 truncate text-sm text-neutral-500">
            {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'} · Caixa e lançamentos
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={exportarCsv}
            aria-label="Exportar CSV"
            title="Baixar o extrato filtrado em CSV"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 active:bg-neutral-50 lg:hidden"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            onClick={exportarCsv}
            title="Baixar o extrato filtrado em CSV"
            className="hidden h-10 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 lg:inline-flex"
          >
            <Download size={16} /> CSV
          </button>
          <button
            type="button"
            onClick={abrirNovoLancamento}
            className="hidden h-10 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 lg:inline-flex"
          >
            <Plus size={16} /> Novo lançamento
          </button>
        </div>
      </div>

      {activeClinicId === 'all' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>O caixa está somando todas as suas clínicas. Selecione uma unidade no menu para ver o extrato de uma clínica só.</span>
        </div>
      )}

      {/* Resumo — dois cartões por linha no celular */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <section className={`${cardShell} min-w-0 p-3 sm:p-4`}>
          <p className="text-xs font-medium text-neutral-500">Entradas</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-neutral-100" />
          ) : (
            <p className="mt-1 break-words text-lg font-semibold leading-tight tabular-nums text-neutral-900 sm:text-xl">{brl(resumo.entrada)}</p>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">Já entrou</p>
        </section>
        <section className={`${cardShell} min-w-0 p-3 sm:p-4`}>
          <p className="text-xs font-medium text-neutral-500">Saídas</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-neutral-100" />
          ) : (
            <p className="mt-1 break-words text-lg font-semibold leading-tight tabular-nums text-neutral-900 sm:text-xl">{brl(resumo.saida)}</p>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">Já pagas</p>
        </section>
        <section className={`${cardShell} min-w-0 p-3 sm:p-4`}>
          <p className="text-xs font-medium text-neutral-500">Resultado</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-neutral-100" />
          ) : (
            <p className={`mt-1 break-words text-lg font-semibold leading-tight tabular-nums sm:text-xl ${resumo.saldo >= 0 ? 'text-neutral-900' : 'text-rose-600'}`}>
              {brl(resumo.saldo)}
            </p>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">Entradas − saídas</p>
        </section>
        <section className={`${cardShell} min-w-0 p-3 sm:p-4`}>
          <p className="text-xs font-medium text-neutral-500">Em aberto</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-neutral-100" />
          ) : (
            <>
              <p className="mt-1 break-words text-lg font-semibold leading-tight tabular-nums text-neutral-900 sm:text-xl">{brl(resumo.andamento)}</p>
              <p className="mt-0.5 text-xs leading-snug text-neutral-400">
                A receber {brl(resumo.aReceber)} · A pagar {brl(resumo.aPagar)}
              </p>
            </>
          )}
        </section>
      </div>

      {/* Filtros: inline no desktop, gaveta no celular */}
      <div className={`${cardShell} p-3 sm:p-4`}>
        <div className="flex min-w-0 flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
          <div className="hidden lg:flex lg:items-center lg:gap-2">{camposPeriodo()}</div>
          <div className="hidden shrink-0 lg:block">
            <SegmentedControl
              value={(tipoFiltro === 'entrada' || tipoFiltro === 'saida' ? tipoFiltro : 'todos') as 'todos' | 'entrada' | 'saida'}
              onChange={(v) => setTipoFiltro(v)}
              className="shrink-0"
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'entrada', label: 'Entradas' },
                { value: 'saida', label: 'Saídas' },
              ]}
            />
          </div>
          <div className="flex min-w-0 items-center gap-2 lg:contents">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Descrição, paciente ou categoria"
                aria-label="Buscar lançamento"
                className="h-11 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-base outline-none focus:border-neutral-900 sm:h-10 sm:rounded-md sm:text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltrosMobile(true)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 active:bg-neutral-50 lg:hidden"
            >
              <Filter size={16} />
              Filtros
              {filtrosAtivos > 0 && (
                <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">{filtrosAtivos}</span>
              )}
            </button>
          </div>
          <button type="button" onClick={() => setShowFiltros((v) => !v)} className={`${pillPeriodo(showFiltros)} hidden lg:inline-flex`}>
            <span className="inline-flex items-center gap-1.5"><Filter size={14} /> Filtros</span>
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 lg:hidden">
          <p className="min-w-0 truncate text-xs font-medium text-neutral-500">{resumoPeriodo}</p>
          <p className="shrink-0 text-xs tabular-nums text-neutral-400">{transacoesFiltradas.length} movimentações</p>
        </div>
        {showFiltros && (
          <div className="mt-3 hidden grid-cols-1 gap-3 border-t border-black/5 pt-3 sm:grid-cols-2 lg:grid lg:grid-cols-4">{camposAvancados()}</div>
        )}
      </div>

      {/* Status — chips roláveis no celular */}
      <div className="-mx-2.5 flex snap-x gap-2 overflow-x-auto px-2.5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {([
          ['ativos', 'Concluídos', countAtivos, CheckCircle],
          ['andamento', 'Em andamento', countAndamento, ClockIcon],
          ['cancelados', 'Cancelados', countCancelados, Trash2],
        ] as const).map(([id, label, count, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAbaStatus(id)}
            aria-pressed={abaStatus === id}
            className={`inline-flex h-11 shrink-0 snap-start items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors sm:h-10 sm:rounded-md sm:px-3 ${
              abaStatus === id ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            <Icon size={16} />
            {label}
            {count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${abaStatus === id ? 'bg-white/20' : 'bg-neutral-100 text-neutral-600'}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Extrato — cartões no celular, linha de tabela no desktop */}
      <div className={`${cardShell} overflow-hidden`}>
        <div className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-3 sm:px-4">
          <h3 className="min-w-0 truncate text-base font-semibold text-neutral-900">
            {abaStatus === 'ativos' ? 'Extrato' : abaStatus === 'andamento' ? 'Em andamento' : 'Cancelados'}
          </h3>
          <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-400">{transacoesFiltradas.length} movimentações</span>
        </div>
        <div className="divide-y divide-black/5">
          {loading && !jaCarregou.current ? (
            <div className="space-y-2 p-3 sm:p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-50 sm:h-14" />
              ))}
            </div>
          ) : transacoesFiltradas.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-400">Nenhuma movimentação encontrada.</div>
          ) : (
            transacoesFiltradas.map((t: Lancamento) => {
              const isCancel = t.status === 'cancelado';
              const isAndam = t.status === 'andamento';
              const acoes = acoesDoLancamento(t);
              const valorTexto = `${t.tipo === 'entrada' ? '+' : '-'} ${brl(Number(t.valor) || 0)}`;
              const valorClasse = isCancel
                ? 'text-neutral-400 line-through'
                : t.tipo === 'entrada'
                  ? 'text-emerald-700'
                  : 'text-rose-600';
              return (
                <div
                  key={t.id}
                  className={`flex items-start gap-2.5 px-3 py-3 transition-colors sm:items-center sm:gap-3 sm:px-4 ${isCancel ? 'bg-neutral-50/80' : 'sm:hover:bg-neutral-50'}`}
                >
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white sm:mt-0 sm:rounded-md ${
                      isCancel ? 'text-neutral-400' : isAndam ? 'text-amber-700' : t.tipo === 'entrada' ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {isCancel ? <Ban size={16} /> : isAndam ? <ClockIcon size={16} /> : t.tipo === 'entrada' ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 sm:block">
                      <p className={`min-w-0 flex-1 truncate text-sm font-medium ${isCancel ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{t.descricao}</p>
                      <span className={`shrink-0 whitespace-nowrap text-[15px] font-semibold tabular-nums sm:hidden ${valorClasse}`}>{valorTexto}</span>
                    </div>
                    {t.taxaNome && t.valorBruto != null && t.valorBruto !== t.valor && (
                      <p className="mt-0.5 truncate text-xs text-neutral-400">Bruto {brl(Number(t.valorBruto))} · {t.taxaNome} · Líquido</p>
                    )}
                    <div className="mt-1.5 flex items-end justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        {t.categoria ? (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 sm:rounded-md">{t.categoria}</span>
                        ) : null}
                        <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-500 sm:rounded-md">{ORIGEM_LABEL[t.origemTipo] || 'Manual'}</span>
                        <span className="text-xs text-neutral-400">{t.forma || 'Não informada'}</span>
                        {t.profissional ? <span className="max-w-[9rem] truncate text-xs text-neutral-400">{t.profissional}</span> : null}
                        <span className="text-xs tabular-nums text-neutral-400">{new Date(t.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                        {isAndam && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 sm:rounded-md">Em andamento</span>}
                        {isCancel && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 sm:rounded-md">Cancelado</span>}
                        {isCancel && t.motivo_cancelamento ? (
                          <span
                            className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 sm:rounded-md"
                            title={String(t.motivo_cancelamento)}
                          >
                            Motivo: {String(t.motivo_cancelamento).length > 40 ? `${String(t.motivo_cancelamento).slice(0, 40)}…` : String(t.motivo_cancelamento)}
                          </span>
                        ) : null}
                      </div>
                      {/* Celular: ações em menu */}
                      {acoes.length > 0 ? (
                        <div className="-mb-2 -mr-2 flex shrink-0 items-center sm:hidden">
                          <MenuPontos
                            itens={acoes}
                            tamanho={18}
                            className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 active:bg-neutral-100"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Desktop: valor + ações na linha */}
                  <div className="hidden shrink-0 items-center gap-3 sm:flex">
                    <span className={`whitespace-nowrap text-sm font-semibold tabular-nums md:text-lg ${valorClasse}`}>{valorTexto}</span>
                    {acoes.length > 0 ? (
                      <div className="flex items-center gap-1">
                        {acoes.map((acao) => (
                          <button
                            key={acao.id}
                            type="button"
                            onClick={acao.onClick}
                            title={acao.label}
                            aria-label={acao.label}
                            className={`rounded-md p-2 ${
                              acao.tom === 'positivo'
                                ? 'text-emerald-700 hover:bg-emerald-50'
                                : acao.tom === 'perigo'
                                  ? 'text-red-600 hover:bg-red-50'
                                  : 'text-neutral-700 hover:bg-neutral-100'
                            }`}
                          >
                            {acao.icone}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Barra de ação fixa, acima da navegação inferior */}
      <div className="fixed inset-x-0 bottom-[calc(4.6rem_+_env(safe-area-inset-bottom))] z-40 px-3 lg:hidden">
        <button
          type="button"
          onClick={abrirNovoLancamento}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 text-sm font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)] active:bg-neutral-800"
        >
          <Plus size={18} />
          <span className="truncate">Novo lançamento</span>
        </button>
      </div>

      {/* Gaveta de filtros (celular) */}
      <Modal
        open={filtrosMobile}
        onClose={() => setFiltrosMobile(false)}
        maxWidth="md"
        hideCloseButton
        panelClassName="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[1.6rem] border border-neutral-200 bg-white sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/5 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-neutral-900">Filtros</h3>
            <p className="mt-0.5 truncate text-sm text-neutral-500">{resumoPeriodo}</p>
          </div>
          <button
            type="button"
            onClick={() => setFiltrosMobile(false)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-400 active:bg-neutral-100"
            aria-label="Fechar filtros"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-2.5">{camposPeriodo()}</div>
          <div>
            <span className={rotulo}>Tipo</span>
            <SegmentedControl
              value={(tipoFiltro === 'entrada' || tipoFiltro === 'saida' ? tipoFiltro : 'todos') as 'todos' | 'entrada' | 'saida'}
              onChange={(v) => setTipoFiltro(v)}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'entrada', label: 'Entradas' },
                { value: 'saida', label: 'Saídas' },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-3">{camposAvancados()}</div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-black/5 px-5 py-3">
          <button type="button" onClick={limparFiltros} className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-neutral-600 active:bg-neutral-50">
            Limpar
          </button>
          <button
            type="button"
            onClick={() => setFiltrosMobile(false)}
            className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white active:bg-neutral-800"
          >
            <span className="truncate">Ver {transacoesFiltradas.length} lançamentos</span>
          </button>
        </div>
      </Modal>

      <Modal open={modalAberto} onClose={() => { setModalAberto(false); setEditandoId(null); }} maxWidth="md" hideCloseButton panelClassName="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[1.6rem] border border-neutral-200 bg-white sm:rounded-xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
                    <div>
                        <h3 className="text-base font-semibold text-neutral-900">{editandoId ? 'Editar lançamento' : 'Novo lançamento'}</h3>
                        <p className="mt-0.5 text-sm text-neutral-500">Vinculado à clínica selecionada no menu.</p>
                    </div>
                    <button type="button" onClick={() => { setModalAberto(false); setEditandoId(null); }} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-400 active:bg-neutral-100" aria-label="Fechar"><X size={18}/></button>
                </div>
                <form onSubmit={salvarLancamento} className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
                    <SegmentedControl
                        value={novoLancamento.tipo === 'entrada' ? 'entrada' : 'saida'}
                        onChange={(tipo) => setNovoLancamento({ ...novoLancamento, tipo })}
                        options={[
                            { value: 'entrada', label: <><ArrowUpCircle size={16} /> Receita</> },
                            { value: 'saida', label: <><ArrowDownCircle size={16} /> Despesa</> },
                        ]}
                    />

                    <label>
                        <span className={rotulo}>Descrição</span>
                        <input required className={campo} placeholder={novoLancamento.tipo === 'entrada' ? 'Ex: Venda de kit' : 'Ex: Conta de luz'} value={novoLancamento.descricao} onChange={e => setNovoLancamento({...novoLancamento, descricao: e.target.value})} />
                    </label>

                    <label>
                        <span className={rotulo}>Forma de pagamento</span>
                        <CustomSelect
                            value={novoLancamento.forma}
                            onChange={(v) => setNovoLancamento({ ...novoLancamento, forma: v })}
                            options={FORMAS_PAGAMENTO}
                            size="md"
                        />
                    </label>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label>
                            <span className={rotulo}>Valor (R$)</span>
                            <input required type="number" step="0.01" inputMode="decimal" className={campo} placeholder="0,00" value={novoLancamento.valor} onChange={e => setNovoLancamento({...novoLancamento, valor: e.target.value})} />
                        </label>
                        <label>
                            <span className={rotulo}>Data</span>
                            <CampoData value={novoLancamento.data} onChange={(iso) => setNovoLancamento({ ...novoLancamento, data: iso })} />
                        </label>
                    </div>

                    {novoLancamento.tipo === 'entrada' && taxasMaquininha.length > 0 && (
                        <div>
                            <span className={rotulo}>Taxa da maquininha</span>
                            <CustomSelect
                                value={novoLancamento.taxa_id}
                                onChange={v => setNovoLancamento({ ...novoLancamento, taxa_id: v })}
                                options={[{ value: '', label: 'Sem taxa (valor integral)' }, ...taxasMaquininha.map(t => ({ value: t.id, label: `${t.nome} (${t.taxa_percentual}%)` }))]}
                                placeholder="Selecione..."
                                size="md"
                                menuPortal
                            />
                            {novoLancamento.taxa_id && novoLancamento.valor && (() => {
                                const taxa = taxasMaquininha.find(t => t.id === novoLancamento.taxa_id);
                                if (!taxa) return null;
                                const bruto = parseFloat(novoLancamento.valor) || 0;
                                const liquido = calcularValorLiquido(bruto, taxa.taxa_percentual);
                                return (
                                    <p className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                                        Valor líquido estimado: R$ {liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (taxa {taxa.taxa_percentual}%)
                                    </p>
                                );
                            })()}
                        </div>
                    )}

                    <div>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-neutral-500">Categoria</span>
                            <SegmentedControl
                                value={modoCategoria}
                                onChange={setModoCategoria}
                                size="sm"
                                className="w-fit"
                                options={[
                                    { value: 'lista', label: 'Lista' },
                                    { value: 'livre', label: 'Livre' },
                                ]}
                            />
                        </div>
                        {modoCategoria === 'lista' ? (
                            <>
                                <CustomSelect value={novoLancamento.categoria} onChange={v => setNovoLancamento({...novoLancamento, categoria: v})} options={categorias.map(c => ({ value: c, label: c }))} placeholder="Selecione a categoria" size="md"/>
                                <div className="mt-2 flex gap-2">
                                    <input value={novaCatTemp} onChange={e => setNovaCatTemp(e.target.value)} placeholder="Nova categoria" className={campo}/>
                                    <button type="button" onClick={adicionarNovaCategoria} disabled={!novaCatTemp.trim()} className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-10"><Plus size={14}/> Salvar</button>
                                </div>
                            </>
                        ) : (
                            <div>
                                <input value={novoLancamento.categoria} onChange={e => setNovoLancamento({...novoLancamento, categoria: e.target.value})} placeholder="Digite uma categoria" className={campo}/>
                                <p className="mt-1 text-xs text-neutral-400">Usada só neste lançamento.</p>
                            </div>
                        )}
                    </div>

                    <div>
                        <span className={rotulo}>Paciente</span>
                        <CustomSelect
                            value={novoLancamento.paciente_id}
                            onChange={v => setNovoLancamento({ ...novoLancamento, paciente_id: v })}
                            options={[{ value: '', label: 'Sem vínculo' }, ...pacientesOptions.map(p => ({ value: p.id, label: p.nome }))]}
                            placeholder="Selecione..."
                            searchable
                            size="md"
                        />
                    </div>

                    <div>
                        <span className={rotulo}>Status</span>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setNovoLancamento({...novoLancamento, status: 'concluido'})} className={`flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium sm:h-10 ${novoLancamento.status === 'concluido' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}><CheckCircle size={14}/> Concluído</button>
                            <button type="button" onClick={() => setNovoLancamento({...novoLancamento, status: 'andamento'})} className={`flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium sm:h-10 ${novoLancamento.status === 'andamento' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}><ClockIcon size={14}/> Em andamento</button>
                        </div>
                    </div>

                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-2 border-t border-black/5 px-5 py-3 sm:px-6 sm:py-4">
                      <button type="button" onClick={() => setModalAberto(false)} className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9">Cancelar</button>
                      <button type="submit" disabled={salvando} className="inline-flex h-11 items-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">
                          {salvando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar
                      </button>
                  </div>
                </form>
      </Modal>

      {modalCancelar && (
      <Modal open onClose={() => setModalCancelar(null)} maxWidth="md" hideCloseButton panelClassName="overflow-hidden rounded-t-[1.6rem] border border-neutral-200 bg-white sm:rounded-xl">
                <div className="border-b border-black/5 px-5 py-4 sm:px-6">
                    <h3 className="text-base font-semibold text-neutral-900">Cancelar lançamento</h3>
                    <p className="mt-0.5 text-sm text-neutral-500">{modalCancelar.descricao}</p>
                </div>
                <div className="px-5 py-4 sm:px-6">
                    <label className={rotulo}>Motivo <span className="text-red-500">*</span></label>
                    <textarea autoFocus value={motivoCancelar} onChange={e => setMotivoCancelar(e.target.value)} className="h-24 w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900" placeholder="Ex: pagamento não realizado, lançamento duplicado"/>
                    <p className="mt-1.5 text-xs text-neutral-400">O lançamento fica em Cancelados, com o motivo.</p>
                </div>
                <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-3 sm:px-6 sm:py-4">
                    <button type="button" onClick={() => setModalCancelar(null)} className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9">Cancelar</button>
                    <button type="button" onClick={confirmarCancelamento} disabled={!motivoCancelar.trim()} className="inline-flex h-11 items-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">Confirmar</button>
                </div>
      </Modal>
      )}
    </div>
  );
}
