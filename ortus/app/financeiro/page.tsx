'use client';
import { useState, useEffect, useRef } from 'react';
import { dados as tabelas, usuarioDaSessao } from '@/lib/local/consulta';
import {
    Plus,
    Download, ArrowUpCircle, ArrowDownCircle, Loader2, X, Save, AlertCircle, Search, Filter, Pencil,
    Trash2, Ban, Clock as ClockIcon, RotateCcw, CheckCircle
} from 'lucide-react';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import { fraseDeErro } from '@/lib/fraseDeErro';
import { FUSO_PADRAO, hojeNoFuso, instanteLocal } from '@/lib/fuso';
import { receberAgendamento } from '@/lib/recebimentoAgendamento';
import CustomSelect from '@/components/ui/CustomSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import CampoData from '@/components/ui/CampoData';
import Modal from '@/components/ui/Modal';
import Aviso from '@/components/ui/Aviso';
import MenuPontos from '@/components/ui/MenuPontos';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
    CATEGORIAS_FINANCEIRAS_PADRAO,
    TAXAS_MAQUININHA_PADRAO,
    normalizarCategoriasFinanceiras,
    proximaCorCategoria,
    normalizarTaxasMaquininha,
    nomesCategoriasAtivas,
    calcularValorLiquido,
    type CategoriaFinanceira,
    type TaxaMaquininha,
} from '@/lib/configDefaults';

const CATS_PADRAO = nomesCategoriasAtivas(CATEGORIAS_FINANCEIRAS_PADRAO);
const cardShell = 'rounded-xl border border-neutral-200 bg-white';
const campo = 'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';
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
  debito: 'Débito do paciente',
  orcamento: 'Orçamento aprovado',
};

const RESUMO_VAZIO = { entrada: 0, saida: 0, saldo: 0, andamento: 0, aReceber: 0, aPagar: 0 };

/** O que o cartão do celular lê de cada movimentação montada em carregarDados. */
type Lancamento = {
  id: string;
  origem: 'agendamento' | 'manual';
  origemTipo: string;
  tipo: string;
  descricao?: string | null;
  profissional?: string;
  valor?: number | null;
  valorBruto?: number | null;
  taxaNome?: string;
  forma?: string;
  data: string;
  categoria?: string;
  status: string;
  motivo_cancelamento?: string | null;
};

function moeda(valor: number | null | undefined) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

const NADA_GRAVADO = 'Nada foi gravado: o lançamento não foi encontrado nesta clínica. A lista foi atualizada.';

/** Frase de uma falha de gravação. salvarConfig e a conferência da linha gravada lançam um Error com o retorno do banco em `cause`; o resto é o retorno cru do banco. */
function fraseDaFalha(erro: unknown, padrao: string) {
  if (erro instanceof Error && erro.cause !== undefined) return fraseDeErro(erro.cause, erro.message || padrao);
  return fraseDeErro(erro, padrao);
}

/** Início do dia AAAA-MM-DD em Brasília, em UTC. Sem o fuso o banco lia o dia em UTC, e a consulta das 21h30 do dia 30 caía no mês seguinte. */
function inicioDoDia(dia: string, somarDias = 0) {
  const [ano, mes, d] = dia.split('-').map(Number);
  return instanteLocal(ano, mes, d + somarDias, 0, 0, FUSO_PADRAO).toISOString();
}

/** Dia do lançamento: data pura (despesa) já é o dia; data e hora (consulta) é vista em Brasília, não em UTC. */
function diaDoLancamento(valor: string | null | undefined) {
  const data = new Date(String(valor || ''));
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', { timeZone: String(valor).length <= 10 ? 'UTC' : FUSO_PADRAO });
}

/** No recebimento a bandeira vai junto: há um "Débito" e um "Crédito 3x" para cada uma. */
function rotuloTaxa(t: TaxaMaquininha) {
  const pct = (Number(t.taxa_percentual) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return `${t.nome}${t.bandeira && t.bandeira !== t.nome ? ` · ${t.bandeira}` : ''} (${pct}%)`;
}

export default function Financeiro() {
  const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
  const { showAlert, showConfirm } = useCustomAlert();
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState(RESUMO_VAZIO);
  const [loading, setLoading] = useState(true);
  const jaCarregou = useRef(false);
  // Trava de ordem das cargas: só a mais recente escreve na tela (mês trocado rápido, troca de clínica).
  const geracaoCarga = useRef(0);

  // Filtros
  const [modoData, setModoData] = useState<'mes' | 'periodo'>('mes');
  // Mês e "hoje" no fuso de Brasília: com toISOString, depois das 21h já era o dia (e o mês) seguinte.
  const [mesSelecionado, setMesSelecionado] = useState(() => hojeNoFuso().slice(0, 7));
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

  const [novoLancamento, setNovoLancamento] = useState(() => ({
      tipo: 'saida', descricao: '', valor: '',
      data: hojeNoFuso(),
      categoria: 'Geral',
      status: 'concluido' as 'concluido' | 'andamento',
      paciente_id: '' as string,
      taxa_id: '' as string,
      forma: 'nao_informada',
  }));

  // Pacientes (vinculação opcional ao lançamento)
  const [pacientesOptions, setPacientesOptions] = useState<{ id: string; nome: string }[]>([]);

  // Meta & Cancelamento (persisted in Supabase)
  const [meta, setMeta] = useState<Record<string, any>>({});
  const [modalCancelar, setModalCancelar] = useState<any>(null);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [cancelando, setCancelando] = useState(false);

  // Recebimento de consulta em aberto (fiado): forma/taxa escolhida no popup.
  const [modalReceber, setModalReceber] = useState<any>(null);
  const [taxaReceber, setTaxaReceber] = useState('');
  const [recebendo, setRecebendo] = useState(false);

  const [aviso, setAviso] = useState<string | null>(null);
  const avisoTimer = useRef<number | null>(null);

  function avisar(mensagem: string) {
      setAviso(mensagem);
      if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
      avisoTimer.current = window.setTimeout(() => setAviso(null), 2600);
  }

  useEffect(() => {
      // Mês corrente em Brasília (toISOString dava o dia em UTC).
      const [ano, mes] = hojeNoFuso().split('-').map(Number);
      const mm = String(mes).padStart(2, '0');
      setDataInicio(`${ano}-${mm}-01`);
      setDataFim(`${ano}-${mm}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`);
  }, []);

  // Carregar categorias e taxas do Supabase (com fallback localStorage). A meta dos lançamentos vem junto com a lista, em carregarDados.
  useEffect(() => {
      if (clinicLoading || !activeClinicId) return;
      // Troca de clínica no meio: a resposta da anterior não sobrescreve a nova (as taxas valem no recebimento).
      let valida = true;
      const cid = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      carregarConfig<unknown>(cid, 'categorias_financeiro', 'ortus_categorias_financeiro', CATEGORIAS_FINANCEIRAS_PADRAO).then(c => {
          if (!valida) return;
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
          if (!valida) return;
          try {
              const norm = normalizarTaxasMaquininha(t);
              setTaxasMaquininha(norm.filter(x => x.ativo));
          } catch {
              setTaxasMaquininha(TAXAS_MAQUININHA_PADRAO.filter(x => x.ativo));
          }
      });
      return () => { valida = false; };
  }, [clinicLoading, activeClinicId]);

  const idsClinicaKey = clinics.map((c) => c.id).join(',');
  useEffect(() => { if (dataInicio && dataFim && !clinicLoading && activeClinicId) carregarDados(); }, [mesSelecionado, dataInicio, dataFim, modoData, clinicLoading, activeClinicId, idsClinicaKey]);

  // Pacientes da clínica (filtro, busca e CSV dos lançamentos manuais) vêm com a tela, não só ao abrir o popup.
  useEffect(() => {
      if (clinicLoading || !activeClinicId) return;
      let valida = true;
      setPacientesOptions([]);
      setFiltroPaciente('');
      const ids = clinics.map((c) => c.id).filter((id) => id != null && id !== '');
      if (activeClinicId === 'all' && ids.length === 0) return;
      const base = tabelas.from('pacientes').select('id, nome');
      const consulta = activeClinicId !== 'all' ? base.eq('clinica_id', activeClinicId) : base.in('clinica_id', ids);
      consulta.order('nome').then(({ data }) => {
          if (valida) setPacientesOptions((data || []) as { id: string; nome: string }[]);
      });
      return () => { valida = false; };
  }, [clinicLoading, activeClinicId, idsClinicaKey]);

  async function carregarDados() {
    const gen = ++geracaoCarga.current;
    if (clinicLoading || !activeClinicId) return;
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

    try {
        // data_hora é timestamptz: o mês vai do início do dia 1 ao início do dia seguinte ao último, em Brasília.
        let qAg = tabelas.from('agendamentos')
            .select('id, valor_final, data_hora, procedimento, status, profissional_id, pacientes(nome), profissionais(nome)')
            .gte('data_hora', inicioDoDia(inicio)).lt('data_hora', inicioDoDia(fim, 1));
        qAg = filtrarClinica ? qAg.eq('clinica_id', clinicaId) : qAg.in('clinica_id', idsClinica);

        let qMan = tabelas.from('despesas').select('*').gte('data', inicio).lte('data', fim);
        qMan = filtrarClinica ? qMan.eq('clinica_id', clinicaId) : qMan.in('clinica_id', idsClinica);

        // A meta (taxa, forma, cancelamento) vem na mesma carga, como em Relatórios: carregada à parte,
        // a lista era montada antes de ela chegar (ou com a da clínica anterior) e saía pelo bruto.
        // Débitos do paciente sem consulta ligada (o "a receber" do orçamento aprovado, do tratamento
        // e do débito manual). Os ligados a uma consulta já aparecem pelo "fiado" dela.
        // Em aberto: pela data em que nasceram. Pagos: pela data do pagamento (entrou no caixa).
        let qDebAbertos = tabelas.from('paciente_debitos')
            .select('id, clinica_id, paciente_id, descricao, valor, status, created_at, data_pagamento, forma_pagamento, orcamento_id, agendamento_id, pacientes(nome)')
            .eq('status', 'pendente').is('agendamento_id', null)
            .gte('created_at', inicioDoDia(inicio)).lt('created_at', inicioDoDia(fim, 1));
        qDebAbertos = filtrarClinica ? qDebAbertos.eq('clinica_id', clinicaId) : qDebAbertos.in('clinica_id', idsClinica);
        let qDebPagos = tabelas.from('paciente_debitos')
            .select('id, clinica_id, paciente_id, descricao, valor, status, created_at, data_pagamento, forma_pagamento, orcamento_id, agendamento_id, pacientes(nome)')
            .eq('status', 'pago').is('agendamento_id', null)
            .gte('data_pagamento', inicioDoDia(inicio)).lt('data_pagamento', inicioDoDia(fim, 1));
        qDebPagos = filtrarClinica ? qDebPagos.eq('clinica_id', clinicaId) : qDebPagos.in('clinica_id', idsClinica);

        const cidMeta = filtrarClinica ? String(clinicaId) : '0';
        const [resAg, resMan, metaLida, resDebAbertos, resDebPagos] = await Promise.all([
            qAg,
            qMan,
            carregarConfig<Record<string, any>>(cidMeta, 'lancamentos_meta', 'ortus_lancamentos_meta', {}).catch(() => ({})),
            qDebAbertos,
            qDebPagos,
        ]);
        if (gen !== geracaoCarga.current) return;
        if (resAg.error) throw resAg.error;
        if (resMan.error) throw resMan.error;
        if (resDebAbertos.error) throw resDebAbertos.error;
        if (resDebPagos.error) throw resDebPagos.error;
        const agendamentos = resAg.data;
        const manuais = resMan.data;
        const metaAtual: Record<string, any> = metaLida && typeof metaLida === 'object' && !Array.isArray(metaLida) ? metaLida : {};
        setMeta(metaAtual);

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
                // O recebimento grava o nome da forma também sem taxa ("Dinheiro", PIX a 0%): só conta como "com taxa" se houve desconto.
                temTaxa: Boolean(metaAg?.taxa_nome) && liquido < bruto,
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
                // Em "Todas as clínicas" a gravação vai para a clínica da própria linha.
                clinicaId: s.clinica_id != null ? String(s.clinica_id) : '',
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

        const listaDeb = [...(resDebAbertos.data || []), ...(resDebPagos.data || [])].map((d: any) => {
            const pago = d.status === 'pago';
            const valor = parseFloat(String(d.valor ?? 0)) || 0;
            const pacNome = Array.isArray(d.pacientes) ? d.pacientes[0]?.nome : d.pacientes?.nome;
            return {
                id: 'deb_' + d.id, refId: d.id, origem: 'debito',
                clinicaId: d.clinica_id != null ? String(d.clinica_id) : '',
                origemTipo: d.orcamento_id ? 'orcamento' : 'debito',
                tipo: 'entrada',
                descricao: `${pacNome || 'Paciente'} - ${d.descricao || 'Débito'}`,
                paciente: pacNome || '',
                pacienteId: d.paciente_id ? String(d.paciente_id) : '',
                profissional: '',
                valor,
                valorBruto: valor,
                taxaNome: '',
                forma: d.forma_pagamento || 'Não informada',
                temTaxa: false,
                data: pago ? d.data_pagamento : d.created_at,
                categoria: pago ? 'Débito recebido' : 'Fiado / A Receber',
                status: pago ? 'concluido' : 'andamento',
            };
        });

        const todas = [...listaAg, ...listaMan, ...listaDeb].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
        setTransacoes(todas);

        const totalEntrada = todas.filter(t => t.tipo === 'entrada' && t.status === 'concluido').reduce((s, c) => s + (c.valor || 0), 0);
        const totalSaida = todas.filter(t => t.tipo === 'saida' && t.status === 'concluido').reduce((s, c) => s + (c.valor || 0), 0);
        const aReceber = todas.filter(t => t.tipo === 'entrada' && t.status === 'andamento').reduce((s, c) => s + (c.valor || 0), 0);
        const aPagar = todas.filter(t => t.tipo === 'saida' && t.status === 'andamento').reduce((s, c) => s + (c.valor || 0), 0);
        setResumo({ entrada: totalEntrada, saida: totalSaida, saldo: totalEntrada - totalSaida, andamento: aReceber + aPagar, aReceber, aPagar });

    } catch (err: any) {
        if (gen !== geracaoCarga.current) return;
        console.error(err);
        showAlert(fraseDeErro(err, 'Não foi possível carregar o financeiro. Tente de novo.'), { type: 'error' });
        setTransacoes([]);
        setResumo(RESUMO_VAZIO);
    }
    jaCarregou.current = true;
    setLoading(false);
  }

  /** Clínica do lançamento: a do menu, ou (em "Todas") a da própria linha, desde que seja uma das clínicas da pessoa. */
  function clinicaDoItem(t: { clinicaId?: unknown }): string | null {
      if (activeClinicId && activeClinicId !== 'all') return String(activeClinicId);
      const id = t?.clinicaId != null ? String(t.clinicaId) : '';
      return id && clinics.some((c) => String(c.id) === id) ? id : null;
  }

  /** A meta na tela é a da clínica do menu; em "Todas" ela não é a da linha, então a conferência fica com o banco (gravarMeta). */
  function talvezNaMeta(...chaves: string[]) {
      return activeClinicId === 'all' || chaves.some((k) => k in meta);
  }

  /**
   * Grava (ou apaga, com `mudanca` nula) uma despesa da clínica e confere que a linha mudou:
   * o banco devolve a recusa em `error`, sem lançar, e uma gravação que não pegou linha volta vazia.
   */
  async function gravarDespesa(cid: string, id: unknown, mudanca: Record<string, unknown> | null) {
      const base = tabelas.from('despesas');
      const consulta = mudanca ? base.update(mudanca) : base.delete();
      const { data, error } = await consulta.eq('id', id).eq('clinica_id', cid).select('id');
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) throw new Error(NADA_GRAVADO, { cause: 'nenhuma linha gravada' });
  }

  /**
   * Muda o lancamentos_meta da clínica sobre a cópia atual do banco. O JSON é um só para a clínica:
   * gravar a cópia da tela apagaria o que outra pessoa salvou depois da carga, e carregarConfig
   * devolve {} quando a leitura falha (gravar em cima disso zeraria a meta). `mudar` devolve null
   * quando não há o que gravar. Lança quando o banco recusa (salvarConfig lança).
   */
  async function gravarMeta(cid: string, mudar: (atual: Record<string, any>) => Record<string, any> | null) {
      const { data, error } = await tabelas.from('configuracoes_clinica').select('valor')
          .eq('clinica_id', Number(cid)).eq('chave', 'lancamentos_meta').maybeSingle();
      if (error) throw error;
      const valor = data?.valor;
      const novo = mudar(valor && typeof valor === 'object' && !Array.isArray(valor) ? { ...valor } : {});
      if (novo) await salvarConfig(cid, 'lancamentos_meta', novo);
  }

  function abrirNovoLancamento() {
      if (!activeClinicId || activeClinicId === 'all') {
          showAlert('Selecione uma Clínica específica no menu antes de lançar.', { type: 'warning' });
          return;
      }
      setEditandoId(null);
      setNovoLancamento({ tipo: 'saida', descricao: '', valor: '', data: hojeNoFuso(), categoria: 'Geral', status: 'concluido', paciente_id: '', taxa_id: '', forma: 'nao_informada' });
      setModoCategoria('lista');
      setNovaCatTemp('');
      setModalAberto(true);
      // Carrega pacientes da clínica para vinculação opcional
      tabelas.from('pacientes').select('id, nome').eq('clinica_id', activeClinicId).order('nome').then(({ data }) => {
          setPacientesOptions((data || []) as { id: string; nome: string }[]);
      });
  }

  function abrirEdicao(t: any) {
      if (!activeClinicId || activeClinicId === 'all') {
          showAlert('Selecione uma clínica específica no menu antes de editar.', { type: 'warning' });
          return;
      }
      // Forma e taxa voltam da meta do lançamento: com a taxa em branco, salvar só para corrigir a descrição apagava a taxa.
      const gravado: Record<string, any> = meta[`manual_${t.refId}`] || {};
      const forma = FORMAS_PAGAMENTO.some((f) => f.value === gravado.forma)
          ? String(gravado.forma)
          : FORMAS_PAGAMENTO.find((f) => f.label === t.forma)?.value || 'nao_informada';
      setEditandoId(String(t.refId));
      setNovoLancamento({
          tipo: t.tipo === 'entrada' ? 'entrada' : 'saida',
          descricao: t.descricao || '',
          valor: String(t.valorBruto ?? t.valor ?? ''),
          data: String(t.data || '').slice(0, 10),
          categoria: t.categoria || 'Geral',
          status: t.status === 'andamento' ? 'andamento' : 'concluido',
          paciente_id: t.pacienteId || '',
          taxa_id: gravado.taxa_id ? String(gravado.taxa_id) : '',
          forma,
      });
      setModoCategoria('lista');
      setModalAberto(true);
      tabelas.from('pacientes').select('id, nome').eq('clinica_id', activeClinicId).order('nome').then(({ data }) => {
          setPacientesOptions((data || []) as { id: string; nome: string }[]);
      });
  }

  async function adicionarNovaCategoria() {
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
          cor: proximaCorCategoria(categoriasObj.map((c) => c.cor)),
          ativo: true,
      };
      const novasObj = [...categoriasObj, nova].sort((a, b) => a.nome.localeCompare(b.nome));
      const novas = nomesCategoriasAtivas(novasObj);
      const categoriaAntes = novoLancamento.categoria;
      setCategoriasObj(novasObj);
      setCategorias(novas);
      setNovoLancamento((atual) => ({ ...atual, categoria: nome }));
      setNovaCatTemp('');
      const cid = (activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '0');
      try {
          await salvarConfig(cid, 'categorias_financeiro', novasObj);
      } catch (erro) {
          // Não gravou (a lista de categorias é só do administrador): desfaz a lista e o campo e avisa.
          setCategoriasObj((atual) => atual.filter((c) => c.id !== nova.id));
          setCategorias((atual) => atual.filter((c) => c !== nome));
          setNovoLancamento((atual) => (atual.categoria === nome ? { ...atual, categoria: categoriaAntes } : atual));
          setNovaCatTemp(nome);
          const semPermissao = erro instanceof Error && (erro.cause as { code?: string } | undefined)?.code === '42501';
          await showAlert(
              semPermissao
                  ? 'A categoria não foi salva: só o administrador da clínica cria categorias. Para usar só neste lançamento, escolha "Livre".'
                  : `${fraseDaFalha(erro, 'A categoria não foi salva. Tente de novo.')} Para usar só neste lançamento, escolha "Livre".`,
              { type: 'error' },
          );
      }
  }

  // Taxa gravada no lançamento em edição: fica no campo com o percentual daquele lançamento, mesmo que
  // a lista ativa tenha mudado ou não a tenha mais (sem ela, salvar voltava o valor para o bruto).
  const metaEditado: Record<string, any> = editandoId ? (meta[`manual_${editandoId}`] || {}) : {};
  const taxasDoFormulario: Pick<TaxaMaquininha, 'id' | 'nome' | 'taxa_percentual'>[] = (() => {
      if (!metaEditado.taxa_id) return taxasMaquininha;
      const id = String(metaEditado.taxa_id);
      const ativa = taxasMaquininha.find((t) => t.id === id);
      const pctGravado = Number(metaEditado.taxa_percentual);
      const gravada = {
          id,
          nome: String(metaEditado.taxa_nome || ativa?.nome || 'Taxa'),
          taxa_percentual: Number.isFinite(pctGravado) ? pctGravado : (ativa?.taxa_percentual ?? 0),
      };
      return ativa ? taxasMaquininha.map((t) => (t.id === id ? gravada : t)) : [...taxasMaquininha, gravada];
  })();

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
      const user = await usuarioDaSessao();
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
      try {
          if (editandoId) {
              await gravarDespesa(String(clinicaId), editandoId, payload);
          } else {
              const { data: ins, error } = await tabelas.from('despesas').insert([payload]).select().single();
              if (error) throw error;
              idAlvo = ins.id;
          }
      } catch (erro) {
          // Popup fica aberto com o aviso (modo de consulta, sem permissão, nada gravado).
          if (erro instanceof Error && erro.message === NADA_GRAVADO) carregarDados();
          await showAlert(fraseDaFalha(erro, 'Não foi possível salvar o lançamento. Tente de novo.'), { type: 'error' });
          setSalvando(false);
          return;
      }

      const formaOpt = FORMAS_PAGAMENTO.find((f) => f.value === novoLancamento.forma);
      const taxa = novoLancamento.tipo === 'entrada' && novoLancamento.taxa_id
          ? taxasDoFormulario.find((t) => t.id === novoLancamento.taxa_id)
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
      if (editandoId || Object.keys(metaItem).length > 0) {
          const chave = `manual_${idAlvo}`;
          try {
              await gravarMeta(String(clinicaId), (atual) => {
                  // Mescla com a entrada anterior: troca só o que o formulário mostra (forma e taxa) e mantém o resto.
                  const anterior: Record<string, unknown> = { ...(atual[chave] || {}) };
                  const entrada: Record<string, unknown> = { ...anterior };
                  ['forma', 'forma_label', 'taxa_id', 'taxa_nome', 'taxa_percentual', 'valor_bruto', 'valor_liquido'].forEach((campo) => { delete entrada[campo]; });
                  Object.assign(entrada, metaItem);
                  const chaves = Object.keys(entrada);
                  if (chaves.length === Object.keys(anterior).length && chaves.every((k) => entrada[k] === anterior[k])) return null;
                  if (chaves.length) atual[chave] = entrada; else delete atual[chave];
                  return atual;
              });
          } catch (erro) {
              // O lançamento já está no banco: o popup passa a editar o que foi salvo, para tentar de novo sem duplicar.
              setEditandoId(String(idAlvo));
              carregarDados();
              await showAlert(`O lançamento foi salvo, mas a forma de pagamento e a taxa não foram gravadas. ${fraseDaFalha(erro, 'Tente salvar de novo.')}`, { type: 'error' });
              setSalvando(false);
              return;
          }
      }

      avisar(editandoId ? 'Lançamento atualizado.' : 'Lançamento salvo.');
      setEditandoId(null);
      setModalAberto(false);
      carregarDados();
      setSalvando(false);
  }

  // Cancelar lançamento (manual)
  function pedirCancelamento(t: any) {
      if (t.origem !== 'manual') { showAlert('Apenas lançamentos manuais podem ser cancelados.', { type: 'warning' }); return; }
      setModalCancelar(t);
      setMotivoCancelar('');
  }

  // Ordem nas ações abaixo: primeiro a despesa, conferida (o banco devolve a recusa em `error`, sem
  // lançar: o try/catch antigo nunca via o modo de consulta); a meta só depois que o banco confirmou.
  async function confirmarCancelamento() {
      if (!modalCancelar || cancelando) return;
      const motivo = motivoCancelar.trim();
      if (!motivo) { await showAlert('Informe o motivo do cancelamento.', { type: 'warning' }); return; }
      const t = modalCancelar;
      const cid = clinicaDoItem(t);
      if (!cid) { await showAlert('Selecione uma clínica específica no menu antes de cancelar.', { type: 'warning' }); return; }
      const canceladoEm = new Date().toISOString();
      setCancelando(true);
      try {
          await gravarDespesa(cid, t.refId, { status: 'cancelado', motivo_cancelamento: motivo, cancelado_em: canceladoEm });
      } catch (erro) {
          // Popup continua aberto com o aviso.
          setCancelando(false);
          if (erro instanceof Error && erro.message === NADA_GRAVADO) carregarDados();
          await showAlert(fraseDaFalha(erro, 'Não foi possível cancelar o lançamento. Tente de novo.'), { type: 'error' });
          return;
      }
      // Cópia na meta, para quem ainda lê dela. A despesa já guarda status, motivo e data, então a falha aqui não desfaz nem esconde o cancelamento.
      try {
          await gravarMeta(cid, (atual) => ({ ...atual, [t.id]: { status: 'cancelado', motivo, cancelado_em: canceladoEm } }));
      } catch (erro) {
          console.warn('[financeiro] cópia do cancelamento na meta não gravada', erro);
      }
      setCancelando(false);
      setModalCancelar(null);
      setMotivoCancelar('');
      avisar('Lançamento cancelado.');
      carregarDados();
  }

  async function restaurarCancelado(t: any) {
      const cid = clinicaDoItem(t);
      if (!cid) { await showAlert('Selecione uma clínica específica no menu antes de restaurar.', { type: 'warning' }); return; }
      if (!(await showConfirm('Restaurar este lançamento?', { title: 'Restaurar', type: 'info', confirmLabel: 'Restaurar' }))) return;
      try {
          await gravarDespesa(cid, t.refId, { status: 'concluido', motivo_cancelamento: null, cancelado_em: null });
          // A marca de cancelado na meta manda no status: sem tirá-la, o lançamento continua cancelado.
          if (talvezNaMeta(t.id)) await gravarMeta(cid, (atual) => { if (!(t.id in atual)) return null; delete atual[t.id]; return atual; });
          avisar('Lançamento restaurado.');
      } catch (erro) {
          await showAlert(fraseDaFalha(erro, 'Não foi possível restaurar o lançamento. Tente de novo.'), { type: 'error' });
      }
      carregarDados();
  }

  async function excluirDefinitivo(t: any) {
      const cid = clinicaDoItem(t);
      if (!cid) { await showAlert('Selecione uma clínica específica no menu antes de excluir.', { type: 'warning' }); return; }
      if (!(await showConfirm('Excluir definitivamente? Esta ação não pode ser desfeita.', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      try {
          if (t.origem === 'manual') await gravarDespesa(cid, t.refId, null);
      } catch (erro) {
          // A meta fica como estava: apagá-la antes do delete recusado devolvia o lançamento ao saldo.
          await showAlert(fraseDaFalha(erro, 'Não foi possível excluir o lançamento. Tente de novo.'), { type: 'error' });
          carregarDados();
          return;
      }
      // A linha já saiu do banco; o que sobrar dela na meta não aparece em lugar nenhum, então a limpeza não barra o aviso.
      const chaves = [t.id, `manual_${t.refId}`];
      if (talvezNaMeta(...chaves)) {
          try {
              await gravarMeta(cid, (atual) => {
                  if (!chaves.some((k) => k in atual)) return null;
                  chaves.forEach((k) => { delete atual[k]; });
                  return atual;
              });
          } catch (erro) {
              console.warn('[financeiro] limpeza da meta do lançamento excluído não gravada', erro);
          }
      }
      avisar('Lançamento excluído.');
      carregarDados();
  }

  function receberFiado(t: any) {
      // Taxas, comissão e a meta são da clínica: em "Todas as clínicas" não dá para saber quais valem.
      if (!activeClinicId || activeClinicId === 'all') {
          showAlert('Selecione uma clínica específica no menu antes de receber.', { type: 'warning' });
          return;
      }
      setTaxaReceber('');
      setModalReceber(t);
  }

  // Mesmo caminho da ficha do paciente (receberAgendamento): data do pagamento, bruto/líquido/taxa,
  // cópia na meta e comissão "Débito recebido". Antes só trocava o status.
  async function confirmarRecebimento() {
      const t = modalReceber;
      if (!t || recebendo || !activeClinicId || activeClinicId === 'all') return;
      const cid = String(activeClinicId);
      setRecebendo(true);
      if (t.origem === 'debito') {
          try {
              // Débito do paciente: marca como pago com a forma escolhida. Relido antes, como a consulta.
              const { data: atual, error } = await tabelas.from('paciente_debitos')
                  .select('id, status').eq('id', t.refId).eq('clinica_id', cid).maybeSingle();
              if (error) throw error;
              if (!atual || atual.status !== 'pendente') {
                  setModalReceber(null);
                  carregarDados();
                  await showAlert('Este débito já foi recebido ou não está mais em aberto. A lista foi atualizada.', { type: 'warning' });
                  return;
              }
              const forma = taxasMaquininha.find((tx: any) => String(tx.id) === String(taxaReceber))?.nome || null;
              const { error: erroPago } = await tabelas.from('paciente_debitos')
                  .update({ status: 'pago', data_pagamento: new Date().toISOString(), forma_pagamento: forma })
                  .eq('id', t.refId).eq('status', 'pendente');
              if (erroPago) throw erroPago;
              setModalReceber(null);
              avisar('Recebimento registrado.');
              carregarDados();
          } catch (erro) {
              await showAlert(fraseDaFalha(erro, 'Não foi possível registrar o recebimento. Tente de novo.'), { type: 'error' });
          } finally {
              setRecebendo(false);
          }
          return;
      }
      try {
          // Relê a consulta: se já foi recebida (pela ficha, por outra pessoa), receber de novo lançaria a comissão duas vezes.
          const { data: atual, error } = await tabelas.from('agendamentos')
              .select('id, status, profissional_id, paciente_id, procedimento, valor_final, valor')
              .eq('id', t.refId).eq('clinica_id', cid).maybeSingle();
          if (error) throw error;
          if (!atual || atual.status !== 'fiado') {
              setModalReceber(null);
              carregarDados();
              await showAlert('Este débito já foi recebido ou não está mais em aberto. A lista foi atualizada.', { type: 'warning' });
              return;
          }
          const { comissaoLancamentos } = await receberAgendamento(
              {
                  id: atual.id,
                  clinica_id: cid,
                  profissional_id: atual.profissional_id ?? null,
                  paciente_id: atual.paciente_id ?? null,
                  procedimento: atual.procedimento || undefined,
                  valor_final: atual.valor_final,
                  valor: atual.valor,
              },
              taxaReceber || undefined,
              taxasMaquininha,
          );
          setModalReceber(null);
          avisar(comissaoLancamentos > 0 ? 'Recebimento registrado, com a comissão do profissional.' : 'Recebimento registrado.');
          carregarDados();
      } catch (erro) {
          // Popup continua aberto com o aviso (modo de consulta, sem permissão, sem conexão).
          await showAlert(fraseDaFalha(erro, 'Não foi possível registrar o recebimento. Tente de novo.'), { type: 'error' });
      } finally {
          setRecebendo(false);
      }
  }

  async function concluirAndamento(t: any) {
      const cid = clinicaDoItem(t);
      if (!cid) { await showAlert('Selecione uma clínica específica no menu antes de concluir.', { type: 'warning' }); return; }
      if (!(await showConfirm('Marcar como concluído?', { title: 'Concluir', type: 'info', confirmLabel: 'Concluir' }))) return;
      try {
          await gravarDespesa(cid, t.refId, { status: 'concluido' });
          // Marca antiga de status na meta mandaria sobre o banco.
          if (talvezNaMeta(t.id)) await gravarMeta(cid, (atual) => { if (!(t.id in atual)) return null; delete atual[t.id]; return atual; });
          avisar('Lançamento concluído.');
      } catch (erro) {
          await showAlert(fraseDaFalha(erro, 'Não foi possível concluir o lançamento. Tente de novo.'), { type: 'error' });
      }
      carregarDados();
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
              diaDoLancamento(t.data),
              t.descricao || '',
              nomeDoPaciente(t),
              t.categoria || '',
              ORIGEM_LABEL[t.origemTipo] || t.origemTipo || '',
              t.forma || 'Não informada',
              bruto.toFixed(2).replace('.', ','),
              taxa.toFixed(2).replace('.', ','),
              liquido.toFixed(2).replace('.', ','),
              t.status === 'concluido' ? 'Concluído' : t.status === 'andamento' ? 'Em aberto' : 'Cancelado',
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

  // `curto` é o rótulo da aba no celular (três abas dividem 343px).
  const abasStatus = [
    { id: 'ativos', label: 'Concluídos', curto: 'Concluídos', count: countAtivos, Icon: CheckCircle },
    { id: 'andamento', label: 'Em aberto', curto: 'Em aberto', count: countAndamento, Icon: ClockIcon },
    { id: 'cancelados', label: 'Cancelados', curto: 'Cancelados', count: countCancelados, Icon: Trash2 },
  ] as const;
  const tituloLista = abaStatus === 'ativos' ? 'Extrato' : abaStatus === 'andamento' ? 'Em aberto' : 'Cancelados';
  const tituloListaCelular = abaStatus === 'ativos' ? 'Extrato' : abaStatus === 'andamento' ? 'Em aberto' : 'Cancelados';
  const totalFiltrado = `${transacoesFiltradas.length} ${transacoesFiltradas.length === 1 ? 'movimentação' : 'movimentações'}`;
  const carregandoLista = loading && !jaCarregou.current;

  const brutoReceber = Number(modalReceber?.valorBruto ?? modalReceber?.valor) || 0;
  const taxaEscolhida = taxasMaquininha.find((t) => t.id === taxaReceber);
  const liquidoReceber = taxaEscolhida ? calcularValorLiquido(brutoReceber, taxaEscolhida.taxa_percentual) : brutoReceber;

  function renderLancamentoCelular(t: Lancamento) {
      const cancelado = t.status === 'cancelado';
      const emAberto = t.status === 'andamento';
      const valor = Number(t.valor) || 0;
      const temTaxa = Boolean(t.taxaNome) && t.valorBruto != null && t.valorBruto !== t.valor;
      const detalhes = [t.categoria, ORIGEM_LABEL[t.origemTipo] || 'Manual', t.forma || 'Não informada', t.profissional].filter(Boolean).join(' · ');
      // No toque não existe legenda de mouse: a ação principal vem escrita e o resto vai para o menu.
      const acao = cancelado
          ? { label: 'Restaurar', Icon: RotateCcw, onClick: () => restaurarCancelado(t) }
          : !emAberto ? null
          : t.origem === 'manual'
              ? { label: 'Concluir', Icon: CheckCircle, onClick: () => concluirAndamento(t) }
              : { label: 'Receber', Icon: CheckCircle, onClick: () => receberFiado(t) };
      const menu = cancelado
          ? [{ id: 'excluir', label: 'Excluir', perigo: true, onClick: () => { void excluirDefinitivo(t); } }]
          : t.origem === 'manual'
              ? [
                  { id: 'editar', label: 'Editar', onClick: () => abrirEdicao(t) },
                  { id: 'cancelar', label: 'Cancelar lançamento', perigo: true, onClick: () => pedirCancelamento(t) },
              ]
              : [];
      return (
          <article key={t.id} className={`rounded-xl border border-neutral-200 px-3.5 py-3 ${cancelado ? 'bg-neutral-50' : 'bg-white'}`}>
              <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                      <h3 className={`break-words text-[15px] font-medium leading-snug ${cancelado ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{t.descricao || 'Sem descrição'}</h3>
                      <p className="mt-1 break-words text-xs text-neutral-500">{detalhes}</p>
                      {temTaxa && (
                          <p className="mt-0.5 break-words text-xs text-neutral-400">Bruto R$ {moeda(t.valorBruto)} · {t.taxaNome} · valor já líquido</p>
                      )}
                  </div>
                  {menu.length > 0 && (
                      <MenuPontos
                          itens={menu}
                          className="-mr-2 -mt-2.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-500 active:bg-neutral-100"
                      />
                  )}
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                      <span className="tabular-nums">{diaDoLancamento(t.data)}</span>
                      <span className={`rounded-md px-2 py-0.5 font-medium ${cancelado ? 'bg-neutral-200 text-neutral-600' : emAberto ? 'bg-amber-50 text-amber-800' : 'bg-neutral-100 text-neutral-600'}`}>
                          {cancelado ? 'Cancelado' : emAberto ? 'Em aberto' : 'Concluído'}
                      </span>
                  </span>
                  <span className={`shrink-0 whitespace-nowrap text-lg font-semibold tabular-nums ${cancelado ? 'text-neutral-400 line-through' : t.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {t.tipo === 'entrada' ? '+' : '-'} R$ {moeda(valor)}
                  </span>
              </div>
              {cancelado && t.motivo_cancelamento && (
                  <p className="mt-2 break-words rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">Motivo: {t.motivo_cancelamento}</p>
              )}
              {acao && (
                  <div className="mt-2.5 flex justify-end">
                      <button type="button" onClick={acao.onClick} className="inline-flex h-11 min-w-[7.5rem] items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white active:bg-neutral-700">
                          <acao.Icon size={16} /> {acao.label}
                      </button>
                  </div>
              )}
          </article>
      );
  }

  const pillPeriodo = (ativo: boolean) =>
    `inline-flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors ${ativo ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`;

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

  return (
    // Coluna flex (e não space-y) porque o celular reordena os blocos com `order`.
    <div className="flex w-full flex-col gap-3 px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <Aviso mensagem={aviso} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
            Financeiro
            <span className="hidden text-neutral-400 md:inline"> · {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'}</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-500 sm:text-base">Caixa e lançamentos</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={exportarCsv}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:h-10 sm:w-auto sm:px-4"
            title="Baixar o extrato filtrado em CSV"
            aria-label="Baixar o extrato filtrado em CSV"
          >
            <Download size={16} />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            type="button"
            onClick={abrirNovoLancamento}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:h-10 sm:flex-none"
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

      {/* Celular: o período manda nos indicadores e fica logo acima deles. Os filtros da lista descem para junto dela. */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setModoData('mes')} aria-pressed={modoData === 'mes'} className={`${pillPeriodo(modoData === 'mes')} justify-center`}>Mês</button>
          <button type="button" onClick={() => setModoData('periodo')} aria-pressed={modoData === 'periodo'} className={`${pillPeriodo(modoData === 'periodo')} justify-center`}>Intervalo</button>
        </div>
        {modoData === 'mes' ? (
          <div className="flex h-11 items-center rounded-md border border-neutral-200 bg-white px-0.5">
            <button type="button" onClick={() => mudarMes(-1)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xl leading-none text-neutral-500 active:bg-neutral-100" aria-label="Mês anterior">‹</button>
            <span className="min-w-0 flex-1 text-center text-sm font-medium text-neutral-900">{rotuloMes}</span>
            <button type="button" onClick={() => mudarMes(1)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xl leading-none text-neutral-500 active:bg-neutral-100" aria-label="Próximo mês">›</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <span className={rotulo}>De</span>
              <CampoData value={dataInicio} onChange={setDataInicio} />
            </label>
            <label className="min-w-0">
              <span className={rotulo}>Até</span>
              <CampoData value={dataFim} onChange={setDataFim} />
            </label>
          </div>
        )}
      </div>

      <div className={`${cardShell} order-2 flex flex-col gap-3 p-3 sm:p-4 md:order-none`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="hidden gap-2 md:flex">
            <button type="button" onClick={() => setModoData('mes')} className={pillPeriodo(modoData === 'mes')}>Mês</button>
            <button type="button" onClick={() => setModoData('periodo')} className={pillPeriodo(modoData === 'periodo')}>Intervalo</button>
          </div>
          {modoData === 'mes' ? (
            <div className="hidden h-10 items-center gap-1 rounded-md border border-neutral-200 bg-white px-1 md:flex">
              <button type="button" onClick={() => mudarMes(-1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-50" aria-label="Mês anterior">‹</button>
              <span className="min-w-[9.5rem] px-1 text-center text-sm text-neutral-900">{rotuloMes}</span>
              <button type="button" onClick={() => mudarMes(1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-50" aria-label="Próximo mês">›</button>
            </div>
          ) : (
            <div className="hidden min-w-0 flex-1 grid-cols-2 gap-2 md:grid">
              <CampoData value={dataInicio} onChange={setDataInicio} />
              <CampoData value={dataFim} onChange={setDataFim} />
            </div>
          )}
          {/* No celular o trilho sobe para 46px: descontados borda e respiro, cada opção fica com 40px de toque. */}
          <SegmentedControl
            value={(tipoFiltro === 'entrada' || tipoFiltro === 'saida' ? tipoFiltro : 'todos') as 'todos' | 'entrada' | 'saida'}
            onChange={(v) => setTipoFiltro(v)}
            className="shrink-0 !h-[46px] md:!h-10"
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'entrada', label: 'Entradas' },
              { value: 'saida', label: 'Saídas' },
            ]}
          />
          <div className="flex min-w-0 flex-1 gap-2 lg:gap-3">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              {/* A dica longa não cabe ao lado do botão no celular e aparecia cortada: lá o campo usa a curta. */}
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar lançamento"
                aria-label="Buscar por descrição, paciente ou categoria"
                className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-neutral-900 md:hidden"
              />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Descrição, paciente ou categoria"
                aria-label="Buscar por descrição, paciente ou categoria"
                className="hidden h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-neutral-900 md:block"
              />
            </div>
            <button type="button" onClick={() => setShowFiltros((v) => !v)} aria-expanded={showFiltros} className={`${pillPeriodo(showFiltros)} shrink-0`}>
              <span className="inline-flex items-center gap-1.5"><Filter size={14} /> Filtros</span>
            </button>
          </div>
        </div>
        {showFiltros && (
          // No celular: duas colunas só para o que tem texto curto; nome de categoria, forma, profissional e paciente ocupa a linha inteira.
          <div className="grid grid-flow-row-dense grid-cols-2 gap-3 border-t border-black/5 pt-3 lg:grid-cols-4">
            <label className="col-span-2 min-w-0 sm:col-span-1">
              <span className={rotulo}>Categoria</span>
              <CustomSelect value={filtroCategoria} onChange={setFiltroCategoria} options={[{ value: 'todas', label: 'Todas' }, ...opcoesCategoria.map((c) => ({ value: c, label: c }))]} size="md" />
            </label>
            <label className="min-w-0">
              <span className={rotulo}>Origem</span>
              <CustomSelect value={filtroOrigem} onChange={setFiltroOrigem} options={[{ value: 'todas', label: 'Todas' }, ...Object.entries(ORIGEM_LABEL).map(([value, label]) => ({ value, label }))]} size="md" />
            </label>
            <label className="col-span-2 min-w-0 sm:col-span-1">
              <span className={rotulo}>Forma</span>
              <CustomSelect value={filtroForma} onChange={setFiltroForma} options={[{ value: 'todas', label: 'Todas' }, ...opcoesForma.map((c) => ({ value: c, label: c }))]} size="md" />
            </label>
            <label className="col-span-2 min-w-0 sm:col-span-1">
              <span className={rotulo}>Profissional</span>
              <CustomSelect value={filtroProfissional} onChange={setFiltroProfissional} options={[{ value: 'todos', label: 'Todos' }, ...opcoesProfissional.map((c) => ({ value: c, label: c }))]} size="md" />
            </label>
            <label className="col-span-2 min-w-0 sm:col-span-1">
              <span className={rotulo}>Paciente</span>
              <CustomSelect value={filtroPaciente} onChange={setFiltroPaciente} options={[{ value: '', label: 'Todos' }, ...pacientesOptions.map((p) => ({ value: p.id, label: p.nome }))]} searchable size="md" />
            </label>
            <label className="min-w-0">
              <span className={rotulo}>Taxa de cartão</span>
              <CustomSelect value={filtroTaxa} onChange={(v) => setFiltroTaxa(v as 'todas' | 'com' | 'sem')} options={[{ value: 'todas', label: 'Com e sem taxa' }, { value: 'com', label: 'Com taxa' }, { value: 'sem', label: 'Sem taxa' }]} size="md" />
            </label>
            <label className="min-w-0">
              <span className={rotulo}>Valor mínimo</span>
              <input type="number" inputMode="decimal" step="0.01" value={valorMin} onChange={(e) => setValorMin(e.target.value)} className={campo} />
            </label>
            <label className="min-w-0">
              <span className={rotulo}>Valor máximo</span>
              <input type="number" inputMode="decimal" step="0.01" value={valorMax} onChange={(e) => setValorMax(e.target.value)} className={campo} />
            </label>
          </div>
        )}
      </div>

      <div className="order-1 grid grid-cols-2 gap-2.5 sm:gap-3 md:order-none md:grid-cols-4">
        <section className={`${cardShell} p-3 sm:p-4`}>
          <p className="text-xs font-medium text-neutral-500">Entradas</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-7 w-28 animate-pulse rounded-md bg-neutral-100" />
          ) : (
            <p className="mt-1 text-xl font-semibold text-neutral-900">R$ {resumo.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">Já entrou</p>
        </section>
        <section className={`${cardShell} p-3 sm:p-4`}>
          <p className="text-xs font-medium text-neutral-500">Saídas</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-7 w-28 animate-pulse rounded-md bg-neutral-100" />
          ) : (
            <p className="mt-1 text-xl font-semibold text-neutral-900">R$ {resumo.saida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">Já pagas</p>
        </section>
        <section className={`${cardShell} p-3 sm:p-4`}>
          <p className="text-xs font-medium text-neutral-500">Resultado</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-7 w-28 animate-pulse rounded-md bg-neutral-100" />
          ) : (
            <p className={`mt-1 text-xl font-semibold ${resumo.saldo >= 0 ? 'text-neutral-900' : 'text-red-600'}`}>
              R$ {resumo.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">Entradas − saídas concluídas</p>
        </section>
        <section className={`${cardShell} p-3 sm:p-4`}>
          <p className="text-xs font-medium text-neutral-500">Em aberto</p>
          {loading && !jaCarregou.current ? (
            <div className="mt-2 h-7 w-28 animate-pulse rounded-md bg-neutral-100" />
          ) : (
            <>
              <p className="mt-1 text-xl font-semibold text-neutral-900">R$ {resumo.andamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="mt-0.5 text-xs text-neutral-400">A receber R$ {resumo.aReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · A pagar R$ {resumo.aPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </>
          )}
        </section>
      </div>

      {/* Celular: os três grupos são abas numa linha só e a lista é uma, no fluxo da página. Três botões empilhados empurravam o extrato para fora da primeira tela. */}
      <div role="tablist" aria-label="Situação dos lançamentos" className="order-3 grid grid-cols-3 gap-1 rounded-xl border border-neutral-200 bg-white p-1 md:hidden">
        {abasStatus.map(({ id, curto, count }) => {
          const ativa = abaStatus === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => setAbaStatus(id)}
              className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1 text-[13px] font-medium ${ativa ? 'bg-neutral-900 text-white' : 'text-neutral-600 active:bg-neutral-100'}`}
            >
              <span className="truncate">{curto}</span>
              {count > 0 && <span className={`tabular-nums ${ativa ? 'text-white/70' : 'text-neutral-400'}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="hidden gap-2 md:flex md:flex-wrap">
        {abasStatus.map(({ id, label, count, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAbaStatus(id)}
            className={`inline-flex h-10 flex-none items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
              abaStatus === id ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            <Icon size={16} />
            {label}
            {count > 0 && (
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${abaStatus === id ? 'bg-white/20' : 'bg-neutral-100 text-neutral-600'}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      <section aria-label={tituloListaCelular} className="order-4 md:hidden">
        <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-base font-semibold text-neutral-900">{tituloListaCelular}</h2>
          <span className="text-xs font-medium text-neutral-400">{totalFiltrado}</span>
        </div>
        <div className="space-y-2">
          {carregandoLista ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />)
          ) : transacoesFiltradas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">Nenhuma movimentação encontrada.</p>
          ) : (
            transacoesFiltradas.map((t: Lancamento) => renderLancamentoCelular(t))
          )}
        </div>
      </section>

      <div className={`${cardShell} hidden shrink-0 overflow-hidden md:block`}>
          <div className="flex flex-col gap-1 border-b border-black/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-semibold text-neutral-900">{tituloLista}</h3>
              <span className="text-xs font-medium text-neutral-400">{totalFiltrado}</span>
          </div>
          <div className="divide-y divide-black/5">
              {carregandoLista ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex h-14 animate-pulse items-center gap-3 rounded-md bg-neutral-50 px-3" />
                    ))}
                  </div>
              ) : transacoesFiltradas.length === 0 ? (
                  <div className="p-12 text-center text-sm text-neutral-400">Nenhuma movimentação encontrada.</div>
              ) : (
                  transacoesFiltradas.map((t: any) => {
                      const isCancel = t.status === 'cancelado';
                      const isAndam = t.status === 'andamento';
                      return (
                          <div key={t.id} className={`group flex items-center justify-between gap-3 px-4 py-3 transition-colors ${isCancel ? 'bg-neutral-50/80 hover:bg-neutral-100/60' : 'hover:bg-neutral-50'}`}>
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white ${
                                      isCancel ? 'text-neutral-400'
                                      : isAndam ? 'text-amber-700'
                                      : t.tipo === 'entrada' ? 'text-emerald-700'
                                      : 'text-red-600'
                                  }`}>
                                      {isCancel ? <Ban size={16}/> : isAndam ? <ClockIcon size={16}/> : t.tipo === 'entrada' ? <ArrowUpCircle size={16}/> : <ArrowDownCircle size={16}/>}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                      <p className={`truncate text-sm font-medium ${isCancel ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{t.descricao}</p>
                                      {t.taxaNome && t.valorBruto != null && t.valorBruto !== t.valor && (
                                          <p className="text-xs text-neutral-400">Bruto R$ {(t.valorBruto ?? 0).toFixed(2)} · {t.taxaNome} · Líquido</p>
                                      )}
                                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">{t.categoria}</span>
                                          <span className="rounded-md border border-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-500">{ORIGEM_LABEL[t.origemTipo] || 'Manual'}</span>
                                          <span className="text-xs text-neutral-400">{t.forma || 'Não informada'}</span>
                                          {t.profissional ? <span className="text-xs text-neutral-400">{t.profissional}</span> : null}
                                          <span className="text-xs text-neutral-400">{diaDoLancamento(t.data)}</span>
                                          {isAndam && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Em aberto</span>}
                                          {isCancel && t.motivo_cancelamento && <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700" title={String(t.motivo_cancelamento)}>Motivo: {String(t.motivo_cancelamento).length > 40 ? String(t.motivo_cancelamento).slice(0,40)+'…' : String(t.motivo_cancelamento)}</span>}
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
                                  {/* Abaixo de lg o aparelho é de toque (casca de celular): sem mouse por cima, as ações ficam sempre à vista. */}
                                  <div className="flex items-center gap-1 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                                      {abaStatus === 'andamento' && t.origem === 'manual' && (
                                          <button type="button" onClick={() => concluirAndamento(t)} className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50" title="Marcar como concluído"><CheckCircle size={14}/></button>
                                      )}
                                      {abaStatus === 'andamento' && (t.origem === 'agendamento' || t.origem === 'debito') && (
                                          <button type="button" onClick={() => receberFiado(t)} className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50" title="Registrar recebimento"><CheckCircle size={14}/></button>
                                      )}
                                      {abaStatus === 'cancelados' ? (
                                          <>
                                              <button type="button" onClick={() => restaurarCancelado(t)} className="rounded-md p-2 text-neutral-700 hover:bg-neutral-100" title="Restaurar"><RotateCcw size={14}/></button>
                                              <button type="button" onClick={() => excluirDefinitivo(t)} className="rounded-md p-2 text-red-600 hover:bg-red-50" title="Excluir definitivamente"><Trash2 size={14}/></button>
                                          </>
                                      ) : t.origem === 'manual' && (
                                          <>
                                              <button type="button" onClick={() => abrirEdicao(t)} className="rounded-md p-2 text-neutral-700 hover:bg-neutral-100" title="Editar lançamento"><Pencil size={14}/></button>
                                              <button type="button" onClick={() => pedirCancelamento(t)} className="rounded-md p-2 text-red-600 hover:bg-red-50" title="Cancelar lançamento"><Ban size={14}/></button>
                                          </>
                                      )}
                                  </div>
                              </div>
                          </div>
                      );
                  })
              )}
          </div>
      </div>

      {/* A altura usa dvh: com vh o popup passava da área visível quando a barra do navegador do celular está à mostra, e o topo ou o rodapé saía da tela. */}
      <Modal open={modalAberto} onClose={() => { setModalAberto(false); setEditandoId(null); }} maxWidth="md" hideCloseButton panelClassName="flex !max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white sm:!max-h-[90dvh]">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
                    <div>
                        <h3 className="text-base font-semibold text-neutral-900">{editandoId ? 'Editar lançamento' : 'Novo lançamento'}</h3>
                        <p className="mt-0.5 text-sm text-neutral-500">Vinculado à clínica selecionada no menu.</p>
                    </div>
                    <button type="button" onClick={() => { setModalAberto(false); setEditandoId(null); }} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar"><X size={16}/></button>
                </div>
                <form onSubmit={salvarLancamento} className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
                    <SegmentedControl
                        value={novoLancamento.tipo === 'entrada' ? 'entrada' : 'saida'}
                        onChange={(tipo) => setNovoLancamento({ ...novoLancamento, tipo })}
                        className="!h-[46px] sm:!h-10"
                        options={[
                            { value: 'entrada', label: <><ArrowUpCircle size={16} /> Receita</> },
                            { value: 'saida', label: <><ArrowDownCircle size={16} /> Despesa</> },
                        ]}
                    />

                    <label>
                        <span className={rotulo}>Descrição <span className="text-red-500">*</span></span>
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
                            <span className={rotulo}>Valor (R$) <span className="text-red-500">*</span></span>
                            <input required type="number" inputMode="decimal" step="0.01" className={campo} placeholder="0,00" value={novoLancamento.valor} onChange={e => setNovoLancamento({...novoLancamento, valor: e.target.value})} />
                        </label>
                        <label>
                            <span className={rotulo}>Data <span className="text-red-500">*</span></span>
                            <CampoData value={novoLancamento.data} onChange={(iso) => setNovoLancamento({ ...novoLancamento, data: iso })} />
                        </label>
                    </div>

                    {novoLancamento.tipo === 'entrada' && taxasDoFormulario.length > 0 && (
                        <div>
                            <span className={rotulo}>Taxa da maquininha</span>
                            <CustomSelect
                                value={novoLancamento.taxa_id}
                                onChange={v => setNovoLancamento({ ...novoLancamento, taxa_id: v })}
                                options={[{ value: '', label: 'Sem taxa (valor integral)' }, ...taxasDoFormulario.map(t => ({ value: t.id, label: `${t.nome} (${t.taxa_percentual}%)` }))]}
                                placeholder="Selecione..."
                                size="md"
                                menuPortal
                            />
                            {novoLancamento.taxa_id && novoLancamento.valor && (() => {
                                const taxa = taxasDoFormulario.find(t => t.id === novoLancamento.taxa_id);
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
                                className="w-fit !h-[46px] sm:!h-8"
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
                                    <input value={novaCatTemp} onChange={e => setNovaCatTemp(e.target.value)} placeholder="Nova categoria" aria-label="Nova categoria" className={`${campo} min-w-0`}/>
                                    <button type="button" onClick={() => { void adicionarNovaCategoria(); }} disabled={!novaCatTemp.trim()} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"><Plus size={14}/> Salvar</button>
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
                            <button type="button" onClick={() => setNovoLancamento({...novoLancamento, status: 'concluido'})} className={`flex h-10 items-center justify-center gap-1.5 rounded-md border text-sm font-medium ${novoLancamento.status === 'concluido' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}><CheckCircle size={14}/> Concluído</button>
                            <button type="button" onClick={() => setNovoLancamento({...novoLancamento, status: 'andamento'})} className={`flex h-10 items-center justify-center gap-1.5 rounded-md border text-sm font-medium ${novoLancamento.status === 'andamento' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}><ClockIcon size={14}/> Em aberto</button>
                        </div>
                    </div>

                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-2 border-t border-black/5 px-5 py-3 sm:px-6 sm:py-4">
                      <button type="button" onClick={() => { setModalAberto(false); setEditandoId(null); }} className="inline-flex h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9 sm:flex-none">Cancelar</button>
                      <button type="submit" disabled={salvando} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9 sm:flex-none">
                          {salvando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar
                      </button>
                  </div>
                </form>
      </Modal>

      {modalCancelar && (
      <Modal open onClose={() => setModalCancelar(null)} maxWidth="md" hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
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
                    <button type="button" onClick={() => setModalCancelar(null)} className="inline-flex h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9 sm:flex-none">Cancelar</button>
                    <button type="button" onClick={confirmarCancelamento} disabled={!motivoCancelar.trim() || cancelando} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9 sm:flex-none">
                        {cancelando && <Loader2 size={14} className="animate-spin" />} Confirmar
                    </button>
                </div>
      </Modal>
      )}

      {modalReceber && (
      <Modal open onClose={() => setModalReceber(null)} maxWidth="md" hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="border-b border-black/5 px-5 py-4 sm:px-6">
                    <h3 className="text-base font-semibold text-neutral-900">Registrar recebimento</h3>
                    <p className="mt-0.5 break-words text-sm text-neutral-500">{modalReceber.descricao}</p>
                </div>
                <div className="px-5 py-4 sm:px-6">
                    <p className="text-xl font-semibold tabular-nums text-neutral-900">R$ {moeda(brutoReceber)}</p>
                    <div className="mt-3">
                        <span className={rotulo}>Forma de pagamento</span>
                        <CustomSelect
                            value={taxaReceber}
                            onChange={setTaxaReceber}
                            options={[{ value: '', label: 'Dinheiro (sem taxa)' }, ...taxasMaquininha.map((t) => ({ value: t.id, label: rotuloTaxa(t) }))]}
                            searchable
                            size="md"
                            menuPortal
                        />
                        <p className="mt-1.5 text-xs text-neutral-500">
                            Líquido: R$ {moeda(liquidoReceber)}
                            {taxaEscolhida && taxaEscolhida.taxa_percentual > 0 ? ` · taxa ${taxaEscolhida.taxa_percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : ''}
                        </p>
                    </div>
                    <p className="mt-3 text-xs text-neutral-400">Entra no caixa pelo líquido. Se o profissional tem comissão por débito recebido, ela é lançada junto.</p>
                </div>
                <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-3 sm:px-6 sm:py-4">
                    <button type="button" onClick={() => setModalReceber(null)} className="inline-flex h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9 sm:flex-none">Cancelar</button>
                    <button type="button" onClick={confirmarRecebimento} disabled={recebendo} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9 sm:flex-none">
                        {recebendo ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Receber
                    </button>
                </div>
      </Modal>
      )}
    </div>
  );
}
