'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Building2, Users, Plus, Trash2, MapPin, Check, X, Loader2, Edit, UserPlus, Shield, User, FileText, Phone, Mail, Save, Lock, ClipboardList, HelpCircle, FileSignature, Tag, SlidersHorizontal, Database, Download, Upload, Bell, Palette, RotateCcw, AlertTriangle, Clock, DollarSign, Layers3, MessageCircle, CreditCard, Eye, Search, Filter, LayoutGrid, List, ChevronDown, Camera } from 'lucide-react';
import { PlanosContent } from '@/app/planos/page';
import { carregarModelos, carregarModelosAsync, salvarModelos, salvarModelosAsync, novoIdModelo, novoIdPergunta, type ModeloAnamnese, type PerguntaAnamnese, type TipoPergunta } from '@/lib/anamnese';
import { listarBackups, criarBackupAgora, baixarBackupComoJson, excluirBackup as deletarBackupServer, restaurarBackup } from '@/lib/backup';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import {
  CATEGORIAS_FINANCEIRAS_PADRAO,
  TEMPLATES_COMUNICACAO_PADRAO,
  TAXAS_MAQUININHA_PADRAO,
  normalizarCategoriasFinanceiras,
  normalizarTaxasMaquininha,
  type CategoriaFinanceira,
  type TemplateComunicacao,
  type TaxaMaquininha,
} from '@/lib/configDefaults';
import CustomSelect from '@/components/ui/CustomSelect';
import DocumentoVariavelEditor, { type DocumentoVariavelEditorHandle } from '@/components/forms/DocumentoVariavelEditor';
import Modal from '@/components/ui/Modal';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { DOCUMENTO_VARIAVEIS, inserirTokenVariavel, tokenVariavelLabel, aplicarVariaveisDocumento, buildDocumentoContexto } from '@/lib/documentVariables';
import { applyTheme, THEME_OPTIONS, type ThemeId } from '@/lib/themePresets';
import { FUSO_HORARIO_OPTIONS, UF_OPTIONS } from '@/lib/formOptions';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { bentoPrimaryBtn, bentoGhostBtn, bentoInput, bentoChip, bentoChipOutline, bentoToggleTrackOn, bentoToggleTrackOff, bentoModalPanel } from '@/lib/bentoUi';

const cardShell = 'rounded-xl bg-white';

const CONFIG_NAVS = [
  { key: 'geral', label: 'Geral', icon: SlidersHorizontal },
  { key: 'clinicas', label: 'Clínicas', icon: Building2 },
  { key: 'anamnese', label: 'Anamnese', icon: ClipboardList },
  { key: 'documentos', label: 'Docs', icon: FileSignature },
  { key: 'planos', label: 'Planos', icon: Layers3 },
  { key: 'categorias', label: 'Categorias', icon: Tag },
  { key: 'taxas', label: 'Taxas', icon: CreditCard },
  { key: 'comunicacao', label: 'Comunicação', icon: MessageCircle },
  { key: 'backup', label: 'Backup', icon: Database },
];
const sectionPad = 'flex h-full min-h-0 flex-col overflow-hidden p-3';
const campoLabel = 'mb-1 block text-xs font-medium text-neutral-500';
const campoInput = 'h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900';
const campoModal = 'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900';
const labelModal = 'mb-1.5 block text-xs font-medium text-neutral-500';
const CORES_CATEGORIA = ['#171717', '#3b82f6', '#0ea5e9', '#10b981', '#84cc16', '#eab308', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b', '#c8f053'];
const CORES_RECENTES_KEY = 'ortus:cores-categoria';

function lerCoresRecentes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CORES_RECENTES_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((c) => typeof c === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

function guardarCorRecente(cor: string) {
  const atuais = lerCoresRecentes().filter((c) => c.toLowerCase() !== cor.toLowerCase());
  localStorage.setItem(CORES_RECENTES_KEY, JSON.stringify([cor, ...atuais].slice(0, 8)));
}

interface ModeloDocumento { id: string; tipo: 'contrato' | 'receita' | 'atestado' | 'outro'; nome: string; conteudo: string; }

const PREFS_PADRAO = {
    nome_clinica: '',
    slogan: '',
    cnpj: '',
    cabecalho_documentos: '',
    rodape_documentos: 'Documento gerado pelo Sistema ORTUS',
    horario_abertura: '08:00',
    horario_fechamento: '18:00',
    dias_atendimento: { seg: true, ter: true, qua: true, qui: true, sex: true, sab: false, dom: false },
    duracao_consulta_padrao: 60,
    cor_tema: 'blue',
    notificar_aniversariantes: true,
    notificar_debitos: true,
    confirmar_exclusao: true,
};

const DOCS_PADRAO: ModeloDocumento[] = [
    { id: 'doc_contrato_1', tipo: 'contrato', nome: 'Contrato de Prestação de Serviços Odontológicos', conteudo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS\n\nPelo presente instrumento, de um lado {{clinica_nome}}, inscrita no CNPJ {{clinica_cnpj}}, doravante denominada CONTRATADA, e de outro lado {{paciente_nome}}, CPF {{paciente_cpf}}, doravante denominado(a) CONTRATANTE, têm entre si justo e contratado o seguinte:\n\nCLÁUSULA 1 - DO OBJETO\nA CONTRATADA prestará serviços odontológicos ao CONTRATANTE conforme plano de tratamento previamente apresentado.\n\nCLÁUSULA 2 - DO VALOR\nO valor total do tratamento é de {{valor_total}}, a ser pago da seguinte forma: ____.\n\nCLÁUSULA 3 - DAS RESPONSABILIDADES\nO paciente compromete-se a comparecer às consultas e seguir as orientações do profissional.\n\n{{data_extenso}}.\n\n___________________\nCONTRATADA\n\n___________________\nCONTRATANTE' },
    { id: 'doc_receita_1', tipo: 'receita', nome: 'Receituário Padrão', conteudo: 'RECEITUÁRIO\n\nPaciente: {{paciente_nome}}\nCPF: {{paciente_cpf}}\nData: {{data}}\n\nUSO ORAL:\n\n1. Amoxicilina 500mg ----------------------- 1 caixa\n   Tomar 1 comprimido de 8 em 8 horas por 7 dias.\n\n2. Dipirona Sódica 500mg ------------------ 1 caixa\n   Tomar 1 comprimido em caso de dor ou febre (6/6h).\n\n___________________\nProfissional responsável' },
    { id: 'doc_atestado_1', tipo: 'atestado', nome: 'Atestado de Comparecimento', conteudo: 'ATESTADO ODONTOLÓGICO\n\nAtesto para os devidos fins que o(a) Sr(a) {{paciente_nome}}, inscrito(a) no CPF {{paciente_cpf}}, esteve sob meus cuidados profissionais nesta data ({{data}}).\n\nNecessita de _____ dias de repouso por motivo de tratamento odontológico.\n\nCID: K08.8\n\n{{data_extenso}}.\n\n___________________\nAssinatura e Carimbo' },
    { id: 'doc_termo_1', tipo: 'outro', nome: 'Termo de Consentimento Livre e Esclarecido', conteudo: 'TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO\n\nEu, {{paciente_nome}}, declaro que fui devidamente informado(a) pelo profissional sobre o tratamento odontológico a ser realizado, seus riscos, benefícios, alternativas e prognóstico.\n\nEstou ciente de que ____________________________.\n\nAutorizo a realização do procedimento.\n\n{{data_extenso}}.\n\n____________________\nAssinatura do Paciente' },
];


function bootClinicasFromStorage(): any[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('ortus_clinics_cache') || '[]');
  } catch {
    return [];
  }
}

export default function Configuracoes() {
  const router = useRouter();
  const { clinics: ctxClinics, loading: clinicLoading, activeClinic } = useClinica();
  const jaCarregou = useRef(bootClinicasFromStorage().length > 0);
  const [abaAtiva, setAbaAtiva] = useState('geral');
  const [loading, setLoading] = useState(() => bootClinicasFromStorage().length === 0);
  const { showAlert, showConfirm } = useCustomAlert();
  // Gate de acesso: só admin de tenant ou super admin podem entrar.
  const [perfilCaller, setPerfilCaller] = useState<any>(null);

  const [clinicas, setClinicas] = useState<any[]>(() => bootClinicasFromStorage());
  const [profissionais, setProfissionais] = useState<any[]>([]);
  
  // MODAL CLÍNICA (criação e edição completas)
  const [modalClinicaCompleto, setModalClinicaCompleto] = useState(false);
  const [clinicaEditando, setClinicaEditando] = useState<any>(null);
  const [clinicaForm, setClinicaForm] = useState({
      id: '', nome: '', cnpj: '', responsavel_nome: '', email: '', telefone: '',
      horario_inicio: '08:00', horario_fim: '18:00', fuso_horario: 'America/Sao_Paulo',
      emitir_notas_em_nome: 'clinica', logo_url: '',
      cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: ''
  });
  const [buscandoCepClinica, setBuscandoCepClinica] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoArquivo, setLogoArquivo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');

  // MODAL PROFISSIONAL
  const [modalProf, setModalProf] = useState(false);
  const [salvandoProf, setSalvandoProf] = useState(false);
  
  const [profForm, setProfForm] = useState({ 
      id: '', user_id: '', nome: '', cargo: 'Dentista', nivel_acesso: 'comum', 
      email: '', senha: '', 
      cpf: '', cro: '', telefone: '', foto_url: '',
      conselho: 'CRO', uf: '', sexo: '', endereco: '' 
  });
  const [editandoProf, setEditandoProf] = useState(false);

  // MODAL VINCULOS
  const [modalVinculo, setModalVinculo] = useState(false);
  const [profSelecionado, setProfSelecionado] = useState<any>(null);
  const [vinculosDoProf, setVinculosDoProf] = useState<number[]>([]);

  // ANAMNESE
  const [modelos, setModelos] = useState<ModeloAnamnese[]>([]);
  const [modalModelo, setModalModelo] = useState(false);
  const [modeloEdit, setModeloEdit] = useState<ModeloAnamnese | null>(null);
  const perguntasListRef = useRef<HTMLDivElement>(null);

  // GERAL / Preferências
  const [prefs, setPrefs] = useState<any>(PREFS_PADRAO);

  // CATEGORIAS FINANCEIRAS
  const [catsFin, setCatsFin] = useState<CategoriaFinanceira[]>(CATEGORIAS_FINANCEIRAS_PADRAO);
  const [buscaCatFin, setBuscaCatFin] = useState('');
  const [corCatAberta, setCorCatAberta] = useState(false);
  const [docsBusca, setDocsBusca] = useState('');
  const [docsTipo, setDocsTipo] = useState('todos');
  const [docsVisualizacao, setDocsVisualizacao] = useState<'lista' | 'grade'>('grade');
  const [modalCatFin, setModalCatFin] = useState(false);
  const [catFinEdit, setCatFinEdit] = useState<CategoriaFinanceira | null>(null);

  // COMUNICAÇÃO
  const [templatesComunicacao, setTemplatesComunicacao] = useState<TemplateComunicacao[]>(TEMPLATES_COMUNICACAO_PADRAO);
  const [templateComEdit, setTemplateComEdit] = useState<TemplateComunicacao | null>(null);
  const [modalTemplateCom, setModalTemplateCom] = useState(false);

  // TAXAS MAQUININHA
  const [taxasMaquininha, setTaxasMaquininha] = useState<TaxaMaquininha[]>(TAXAS_MAQUININHA_PADRAO);

  // MODELOS DE DOCUMENTOS (Contratos / Outros)
  const [docs, setDocs] = useState<ModeloDocumento[]>([]);
  const [modalDoc, setModalDoc] = useState(false);
  const [docEdit, setDocEdit] = useState<ModeloDocumento | null>(null);
  const docEditorRef = useRef<DocumentoVariavelEditorHandle>(null);

  // BACKUP
  const [backups, setBackups] = useState<any[]>([]);
  const [criandoBackup, setCriandoBackup] = useState(false);
  const [modalRestaurar, setModalRestaurar] = useState<any>(null);
  const [confirmacaoTexto, setConfirmacaoTexto] = useState('');
  const [restaurando, setRestaurando] = useState(false);

  useEffect(() => {
      if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const aba = params.get('aba');
          if (aba && ['equipe', 'permissoes', 'comissoes'].includes(aba)) {
              router.replace('/ajustes/equipe');
              return;
          }
          if (aba) setAbaAtiva(aba);
      }
      if (clinicLoading) return;
      carregarDados({ silent: ctxClinics.length > 0 || bootClinicasFromStorage().length > 0 });
      setModelos(carregarModelos());
      recarregarBackups();
  }, [router, clinicLoading, ctxClinics.length]);

  useEffect(() => {
      if (ctxClinics.length > 0) setClinicas(ctxClinics);
  }, [ctxClinics]);

  // Carregar configs do Supabase após clinicas carregarem
  useEffect(() => {
      if (clinicas.length === 0) return;
      const cid = clinicas[0]?.id || '0';
      carregarConfig(cid, 'preferencias', 'ortus_preferencias', PREFS_PADRAO).then(p => setPrefs({ ...PREFS_PADRAO, ...(p || {}) }));
      carregarConfig(cid, 'categorias_financeiro', 'ortus_categorias_financeiro', CATEGORIAS_FINANCEIRAS_PADRAO).then(c => setCatsFin(normalizarCategoriasFinanceiras(c)));
      carregarConfig(cid, 'modelos_documentos', 'ortus_modelos_documentos', DOCS_PADRAO).then(d => setDocs(d && d.length ? d : DOCS_PADRAO));
      carregarConfig(cid, 'templates_comunicacao', 'ortus_templates_comunicacao', TEMPLATES_COMUNICACAO_PADRAO).then(t => setTemplatesComunicacao(Array.isArray(t) && t.length ? t : TEMPLATES_COMUNICACAO_PADRAO));
      carregarConfig(cid, 'taxas_maquininha', 'ortus_taxas_maquininha', TAXAS_MAQUININHA_PADRAO).then(t => {
          const norm = normalizarTaxasMaquininha(t);
          setTaxasMaquininha(norm);
          if (JSON.stringify(t) !== JSON.stringify(norm)) salvarConfig(cid, 'taxas_maquininha', norm);
      });
      carregarModelosAsync(cid).then(setModelos);
  }, [clinicas]);

  async function persistirModelosAnamnese(novos: ModeloAnamnese[]) {
      setModelos(novos);
      const cid = clinicas[0]?.id;
      if (cid) await salvarModelosAsync(cid, novos);
      else salvarModelos(novos);
  }

  async function recarregarBackups() {
      const list = await listarBackups(50);
      setBackups(list);
  }

  async function backupAgoraManual() {
      setCriandoBackup(true);
      const r = await criarBackupAgora('manual', 'Backup manual via interface');
      setCriandoBackup(false);
      if (r.ok) { showAlert('Backup criado com sucesso!', { type: 'success' }); recarregarBackups(); }
      else showAlert('Falha: ' + r.erro + '\n\nVerifique se o SQL de criação da tabela e função foi executado no Supabase.', { type: 'error' });
  }

  async function excluirBackupItem(id: number) {
      if (!(await showConfirm('Excluir este backup permanentemente?', { title: 'Excluir Backup', type: 'error', confirmLabel: 'Excluir' }))) return;
      const ok = await deletarBackupServer(id);
      if (ok) recarregarBackups();
  }

  function abrirModalRestaurar(b: any) {
      setModalRestaurar(b);
      setConfirmacaoTexto('');
  }

  async function confirmarRestauracao() {
      if (!modalRestaurar) return;
      if (confirmacaoTexto !== 'RESTAURAR') return;
      setRestaurando(true);
      const r = await restaurarBackup(modalRestaurar.id);
      setRestaurando(false);
      if (r.ok) {
          await showAlert((r.msg || 'Backup restaurado com sucesso!') + '\nA página será recarregada.', { type: 'success', title: 'Sucesso' });
          setModalRestaurar(null);
          window.location.reload();
      } else {
          await showAlert('Falha ao restaurar:\n\n' + r.erro + '\n\nVerifique se a função restaurar_backup foi criada no Supabase.', { type: 'error', title: 'Erro' });
      }
  }

  // ===== PREFERÊNCIAS =====
  function atualizarPref(k: string, v: any) { const p = { ...prefs, [k]: v }; setPrefs(p); const cid = clinicas[0]?.id || '0'; salvarConfig(cid, 'preferencias', p); }
  function toggleDia(d: string) { const dias = { ...prefs.dias_atendimento, [d]: !prefs.dias_atendimento[d] }; atualizarPref('dias_atendimento', dias); }

  function persistirCategorias(lista: CategoriaFinanceira[]) {
      setCatsFin(lista);
      const cid = clinicas[0]?.id || '0';
      salvarConfig(cid, 'categorias_financeiro', lista);
  }

  function abrirNovaCatFin() {
      setCorCatAberta(false);
      setCatFinEdit({ id: `cat_${Date.now()}`, nome: '', tipo: 'despesa', cor: '#64748b', ativo: true });
      setModalCatFin(true);
  }

  function abrirEditarCatFin(cat: CategoriaFinanceira) {
      setCorCatAberta(false);
      setCatFinEdit({ ...cat });
      setModalCatFin(true);
  }

  function salvarCatFinModal() {
      if (!catFinEdit?.nome.trim()) {
          showAlert('Informe o nome da categoria.', { type: 'warning' });
          return;
      }
      const nome = catFinEdit.nome.trim();
      const duplicada = catsFin.find(c => c.nome.toLowerCase() === nome.toLowerCase() && c.id !== catFinEdit.id);
      if (duplicada) {
          showAlert('Categoria já existe.', { type: 'warning' });
          return;
      }
      const idx = catsFin.findIndex(c => c.id === catFinEdit.id);
      const novos = idx >= 0
          ? catsFin.map(c => c.id === catFinEdit.id ? catFinEdit : c)
          : [...catsFin, catFinEdit];
      persistirCategorias(novos.sort((a, b) => a.nome.localeCompare(b.nome)));
      setModalCatFin(false);
      setCatFinEdit(null);
  }

  const catsFinFiltradas = useMemo(() => {
      const q = buscaCatFin.trim().toLowerCase();
      if (!q) return catsFin;
      return catsFin.filter(c => c.nome.toLowerCase().includes(q) || c.tipo.includes(q));
  }, [catsFin, buscaCatFin]);

  const totalModelosAnamnese = modelos.length;
  const totalDocs = docs.length;
  const totalCatsAtivas = useMemo(() => catsFin.filter(c => c.ativo).length, [catsFin]);
  const totalBackups = backups.length;
  const kpiLoading = loading && !jaCarregou.current;


  const taxasPorBandeira = useMemo(() => {
      const map = new Map<string, TaxaMaquininha[]>();
      taxasMaquininha.forEach(t => {
          if (!map.has(t.bandeira)) map.set(t.bandeira, []);
          map.get(t.bandeira)!.push(t);
      });
      map.forEach(list => {
          list.sort((a, b) => {
              const ordemTipo = (x: TaxaMaquininha) => {
                  if (x.tipo === 'pix') return 0;
                  if (x.tipo === 'debito') return 1;
                  if (x.tipo === 'credito_vista') return 2;
                  return 3;
              };
              const diff = ordemTipo(a) - ordemTipo(b);
              if (diff !== 0) return diff;
              return (a.parcela ?? 0) - (b.parcela ?? 0);
          });
      });
      return Array.from(map.entries());
  }, [taxasMaquininha]);

  async function removerCatFin(id: string) {
      const cat = catsFin.find(c => c.id === id);
      if (!cat) return;
      if (!(await showConfirm(`Excluir categoria "${cat.nome}"?`, { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      persistirCategorias(catsFin.filter(x => x.id !== id));
  }

  function toggleCatFinAtiva(id: string) {
      persistirCategorias(catsFin.map(c => c.id === id ? { ...c, ativo: !c.ativo } : c));
  }

  function salvarTemplatesComunicacao(lista: TemplateComunicacao[]) {
      setTemplatesComunicacao(lista);
      salvarConfig(clinicas[0]?.id || '0', 'templates_comunicacao', lista);
  }

  function salvarTaxas(lista: TaxaMaquininha[]) {
      setTaxasMaquininha(lista);
      salvarConfig(clinicas[0]?.id || '0', 'taxas_maquininha', lista);
  }

  function abrirNovoTemplateCom() {
      setTemplateComEdit({ id: `tpl_${Date.now()}`, canal: 'whatsapp', nome: '', corpo: '', ativo: true });
      setModalTemplateCom(true);
  }

  function abrirEditarTemplateCom(t: TemplateComunicacao) {
      setTemplateComEdit({ ...t });
      setModalTemplateCom(true);
  }

  function salvarTemplateComEdit() {
      if (!templateComEdit?.nome.trim() || !templateComEdit.corpo.trim()) {
          showAlert('Preencha nome e mensagem.', { type: 'warning' });
          return;
      }
      const idx = templatesComunicacao.findIndex(t => t.id === templateComEdit.id);
      const novos = idx >= 0
          ? templatesComunicacao.map((t, i) => i === idx ? templateComEdit : t)
          : [...templatesComunicacao, templateComEdit];
      salvarTemplatesComunicacao(novos);
      setModalTemplateCom(false);
      setTemplateComEdit(null);
  }

  async function excluirTemplateCom(id: string) {
      if (!(await showConfirm('Excluir este template?', { title: 'Excluir', type: 'warning' }))) return;
      salvarTemplatesComunicacao(templatesComunicacao.filter(t => t.id !== id));
  }

  function atualizarTaxa(id: string, campo: keyof TaxaMaquininha, valor: string | number | boolean) {
      salvarTaxas(taxasMaquininha.map(t => t.id === id ? { ...t, [campo]: valor } : t));
  }

  // ===== MODELOS DE DOCUMENTOS =====
  function abrirNovoDoc() {
      setDocEdit({ id: 'doc_' + Date.now(), tipo: 'contrato', nome: '', conteudo: '' });
      setModalDoc(true);
  }
  function abrirEditarDoc(d: ModeloDocumento) { setDocEdit({ ...d }); setModalDoc(true); }
  function salvarDocEdit() {
      if (!docEdit) return;
      if (!docEdit.nome.trim() || !docEdit.conteudo.trim()) { showAlert('Preencha nome e conteúdo.', { type: 'warning' }); return; }
      const idx = docs.findIndex(d => d.id === docEdit.id);
      const novos = idx >= 0 ? docs.map((d,i) => i === idx ? docEdit : d) : [...docs, docEdit];
      setDocs(novos); const cidD = clinicas[0]?.id || '0'; salvarConfig(cidD, 'modelos_documentos', novos);
      setModalDoc(false); setDocEdit(null);
  }
  async function excluirDoc(id: string) {
      if (!(await showConfirm('Excluir este modelo de documento?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      const novos = docs.filter(d => d.id !== id);
      setDocs(novos); const cidD2 = clinicas[0]?.id || '0'; salvarConfig(cidD2, 'modelos_documentos', novos);
  }

  function inserirVariavelDoc(chave: string) {
      if (!docEdit) return;
      const variavel = DOCUMENTO_VARIAVEIS.find(v => String(v.chave) === chave);
      const label = variavel?.label || chave;
      if (docEditorRef.current) {
          docEditorRef.current.insertVariable(label);
      } else {
          setDocEdit({ ...docEdit, conteudo: inserirTokenVariavel(docEdit.conteudo, label) });
      }
  }

  const docPreview = docEdit ? aplicarVariaveisDocumento(
      docEdit.conteudo,
      buildDocumentoContexto({
          paciente_nome: 'Maria Silva',
          paciente_cpf: '123.456.789-00',
          paciente_telefone: '(11) 99999-0000',
          paciente_email: 'maria@email.com',
          paciente_endereco: 'Rua Exemplo, 100 — Centro',
          clinica_nome: clinicas[0]?.nome,
          clinica_cnpj: clinicas[0]?.cnpj,
          clinica_telefone: clinicas[0]?.telefone,
          clinica_endereco: [clinicas[0]?.rua, clinicas[0]?.numero, clinicas[0]?.cidade].filter(Boolean).join(', '),
      }),
  ) : '';

  // ===== BACKUP =====
  async function exportarPacientes() {
      const ids = (clinicas || []).map((c: any) => c.id).filter(Boolean);
      let query = supabase.from('pacientes').select('id, nome, cpf, rg, telefone, email, data_nascimento, sexo, endereco, created_at, clinicas(nome)').order('nome');
      if (ids.length) query = query.or(`clinica_id.in.(${ids.join(',')}),clinica_id.is.null`);
      const { data, error } = await query;
      if (error) { showAlert('Não foi possível exportar: ' + error.message, { type: 'error' }); return; }
      if (!data?.length) { showAlert('Nenhum paciente para exportar.', { type: 'warning' }); return; }
      const esc = (val: any) => `"${String(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
      const headers = ['Nome', 'CPF', 'RG', 'Telefone', 'E-mail', 'Nascimento', 'Sexo', 'Endereço', 'Clínica', 'Cadastrado em'];
      const rows = data.map((p: any) => [
          p.nome, p.cpf, p.rg, p.telefone, p.email, p.data_nascimento, p.sexo, p.endereco,
          p.clinicas?.nome || '',
          p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '',
      ].map(esc).join(','));
      const csv = '\uFEFF' + headers.map(esc).join(',') + '\n' + rows.join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `pacientes_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
  }

  function exportarTudo() {
      const tudo = {
          versao: 1,
          exportado_em: new Date().toISOString(),
          preferencias: prefs,
          categorias_financeiro: catsFin,
          templates_comunicacao: templatesComunicacao,
          taxas_maquininha: taxasMaquininha,
          modelos_anamnese: modelos,
          modelos_documentos: docs,
          lancamentos_meta: {},
      };
      const blob = new Blob([JSON.stringify(tudo, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ortus_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
  }

  async function importarTudo(e: any) {
      const file = e.target.files?.[0];
      if (!file) return;
      const ok = await showConfirm('Isso irá sobrescrever todas as configurações locais (preferências, categorias, modelos). Continuar?', { title: 'Importar Backup', type: 'warning', confirmLabel: 'Importar' });
      if (!ok) { e.target.value=''; return; }
      const reader = new FileReader();
      reader.onload = () => {
          try {
              const obj = JSON.parse(reader.result as string);
              const cidB = clinicas[0]?.id || '0';
              if (obj.preferencias) { setPrefs(obj.preferencias); salvarConfig(cidB, 'preferencias', obj.preferencias); }
              if (obj.categorias_financeiro) {
                  const norm = normalizarCategoriasFinanceiras(obj.categorias_financeiro);
                  setCatsFin(norm);
                  salvarConfig(cidB, 'categorias_financeiro', norm);
              }
              if (obj.templates_comunicacao) { setTemplatesComunicacao(obj.templates_comunicacao); salvarConfig(cidB, 'templates_comunicacao', obj.templates_comunicacao); }
              if (obj.taxas_maquininha) {
                  const norm = normalizarTaxasMaquininha(obj.taxas_maquininha);
                  setTaxasMaquininha(norm);
                  salvarConfig(cidB, 'taxas_maquininha', norm);
              }
              if (obj.modelos_anamnese) { setModelos(obj.modelos_anamnese); salvarModelos(obj.modelos_anamnese); }
              if (obj.modelos_documentos) { setDocs(obj.modelos_documentos); salvarConfig(cidB, 'modelos_documentos', obj.modelos_documentos); }
              if (obj.lancamentos_meta) { salvarConfig(cidB, 'lancamentos_meta', obj.lancamentos_meta); }
              showAlert('Backup importado com sucesso!', { type: 'success' });
          } catch (err: any) { showAlert('Arquivo inválido: ' + err.message, { type: 'error' }); }
      };
      reader.readAsText(file);
      e.target.value='';
  }

  // ----- ANAMNESE: helpers -----
  function abrirNovoModelo() {
      setModeloEdit({ id: novoIdModelo(), nome: '', descricao: '', perguntas: [{ id: novoIdPergunta(), label: '', tipo: 'texto' }] });
      setModalModelo(true);
  }
  function abrirEditarModelo(m: ModeloAnamnese) {
      setModeloEdit({ ...m, perguntas: m.perguntas.map(p => ({ ...p })) });
      setModalModelo(true);
  }
  function adicionarPergunta() {
      if (!modeloEdit) return;
      setModeloEdit({ ...modeloEdit, perguntas: [...modeloEdit.perguntas, { id: novoIdPergunta(), label: '', tipo: 'texto' }] });
      setTimeout(() => {
          perguntasListRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
  }
  function atualizarPergunta(idx: number, patch: Partial<PerguntaAnamnese>) {
      if (!modeloEdit) return;
      const novas = modeloEdit.perguntas.map((p, i) => i === idx ? { ...p, ...patch } : p);
      setModeloEdit({ ...modeloEdit, perguntas: novas });
  }
  async function removerPergunta(idx: number) {
      if (!modeloEdit) return;
      const pergunta = modeloEdit.perguntas[idx];
      const msg = pergunta?.label.trim()
          ? 'Excluir esta pergunta?'
          : 'Excluir esta pergunta em branco?';
      if (!(await showConfirm(msg, { title: 'Excluir pergunta', type: 'warning', confirmLabel: 'Excluir' }))) return;
      if (modeloEdit.perguntas.length <= 1) {
          showAlert('O modelo precisa de pelo menos uma pergunta.', { type: 'warning' });
          return;
      }
      setModeloEdit({ ...modeloEdit, perguntas: modeloEdit.perguntas.filter((_, i) => i !== idx) });
  }
  async function salvarModelo() {
      if (!modeloEdit) return;
      if (!modeloEdit.nome.trim()) { showAlert('Informe o nome do modelo.', { type: 'warning' }); return; }
      const perguntasValidas = modeloEdit.perguntas.filter(p => p.label.trim());
      if (perguntasValidas.length === 0) { showAlert('Adicione pelo menos uma pergunta.', { type: 'warning' }); return; }
      const limpo = { ...modeloEdit, perguntas: perguntasValidas, padrao: false };
      const existe = modelos.findIndex(m => m.id === limpo.id);
      const novos = existe >= 0 ? modelos.map((m, i) => i === existe ? limpo : m) : [...modelos, limpo];
      await persistirModelosAnamnese(novos);
      setModalModelo(false);
      setModeloEdit(null);
  }
  async function excluirModelo(id: string) {
      const m = modelos.find(x => x.id === id);
      if (m?.padrao) { showAlert('Modelos padrão não podem ser excluídos.', { type: 'warning' }); return; }
      if (!(await showConfirm('Excluir este modelo?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      const novos = modelos.filter(x => x.id !== id);
      await persistirModelosAnamnese(novos);
  }
  async function duplicarModelo(m: ModeloAnamnese) {
      const copia: ModeloAnamnese = {
          ...m,
          id: novoIdModelo(),
          nome: m.nome + ' (Cópia)',
          padrao: false,
          perguntas: m.perguntas.map(p => ({ ...p, id: novoIdPergunta() })),
      };
      const novos = [...modelos, copia];
      await persistirModelosAnamnese(novos);
  }

  // Buscar endereço ViaCEP para clínica
  async function buscarCepClinica(cep: string) {
      const cleanCep = cep.replace(/\D/g, '');
      if (cleanCep.length !== 8) return;
      
      setBuscandoCepClinica(true);
      try {
          const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
          const data = await response.json();
          
          if (!data.erro) {
              setClinicaForm(prev => ({
                  ...prev,
                  rua: data.logradouro || prev.rua,
                  bairro: data.bairro || prev.bairro,
                  cidade: data.localidade || prev.cidade,
                  uf: data.uf || prev.uf
              }));
          }
      } catch (err) {
          console.error('Erro ao buscar CEP:', err);
      } finally {
          setBuscandoCepClinica(false);
      }
  }

  async function carregarDados(opts?: { silent?: boolean }) {
      if (!opts?.silent) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPerfilCaller(null); setLoading(false); return; }
      const { data: meu } = await supabase
          .from('profissionais')
          .select('id, nivel_acesso, is_super_admin')
          .eq('user_id', user.id)
          .maybeSingle();
      setPerfilCaller(meu);

      if (ctxClinics.length > 0) {
          setClinicas(ctxClinics);
      } else {
          const c = await fetchUserClinicas();
          setClinicas(c || []);
      }
      setProfissionais([]);
      jaCarregou.current = true;
      setLoading(false);
  }

  const CLINICA_FORM_VAZIO = {
      id: '', nome: '', cnpj: '', responsavel_nome: '', email: '', telefone: '',
      horario_inicio: '08:00', horario_fim: '18:00', fuso_horario: 'America/Sao_Paulo',
      emitir_notas_em_nome: 'clinica', logo_url: '',
      cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: ''
  };

  function validarClinicaForm(): string | null {
      if (!clinicaForm.nome.trim()) return 'Nome da clínica é obrigatório.';
      const cep = clinicaForm.cep?.replace(/\D/g, '') || '';
      if (cep.length !== 8) return 'Informe um CEP válido (8 dígitos).';
      if (!clinicaForm.rua?.trim()) return 'Informe a rua/avenida.';
      if (!clinicaForm.numero?.trim()) return 'Informe o número do endereço.';
      if (!clinicaForm.bairro?.trim()) return 'Informe o bairro.';
      if (!clinicaForm.cidade?.trim()) return 'Informe a cidade.';
      if (!clinicaForm.uf?.trim()) return 'Selecione a UF.';
      return null;
  }

  function limparLogoLocal() {
      setLogoArquivo(null);
      setLogoPreview((atual) => {
          if (atual.startsWith('blob:')) URL.revokeObjectURL(atual);
          return '';
      });
  }

  function abrirNovaClinica() {
      setClinicaEditando(null);
      setClinicaForm({ ...CLINICA_FORM_VAZIO });
      limparLogoLocal();
      setModalClinicaCompleto(true);
  }

  // --- CLÍNICAS ---
  // Cria ou atualiza clínica com formulário completo
  async function salvarClinicaCompleta() {
      const erro = validarClinicaForm();
      if (erro) {
          showAlert(erro, { type: 'warning' });
          return;
      }

      const payload = {
          nome: clinicaForm.nome.trim(),
          cnpj: clinicaForm.cnpj.trim() || null,
          responsavel_nome: clinicaForm.responsavel_nome.trim() || null,
          email: clinicaForm.email.trim() || null,
          telefone: clinicaForm.telefone.trim() || null,
          horario_inicio: clinicaForm.horario_inicio || null,
          horario_fim: clinicaForm.horario_fim || null,
          fuso_horario: clinicaForm.fuso_horario || 'America/Sao_Paulo',
          emitir_notas_em_nome: clinicaForm.emitir_notas_em_nome || 'clinica',
          logo_url: clinicaForm.logo_url || null,
          cep: clinicaForm.cep.trim() || null,
          rua: clinicaForm.rua.trim() || null,
          numero: clinicaForm.numero.trim() || null,
          complemento: clinicaForm.complemento.trim() || null,
          bairro: clinicaForm.bairro.trim() || null,
          cidade: clinicaForm.cidade.trim() || null,
          uf: clinicaForm.uf || null
      };

      try {
          let clinicaId: string | number | null = clinicaEditando?.id ?? null;
          if (clinicaEditando?.id) {
              const { error } = await supabase.from('clinicas').update(payload).eq('id', clinicaEditando.id);
              if (error) throw error;
              showAlert('Clínica atualizada com sucesso!', { type: 'success' });
          } else {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) { showAlert('Sessão expirada. Faça login novamente.', { type: 'error' }); return; }

              const { data: prof } = await supabase
                  .from('profissionais')
                  .select('id, is_super_admin')
                  .eq('user_id', session.user.id)
                  .maybeSingle();

              if (!prof?.id) {
                  showAlert('Não foi possível identificar seu perfil.', { type: 'error' });
                  return;
              }

              let redeId: any = null;
              const { data: vinculos } = await supabase
                  .from('profissionais_clinicas')
                  .select('clinicas(rede_id)')
                  .eq('profissional_id', prof.id)
                  .limit(1);
              redeId = (vinculos?.[0] as any)?.clinicas?.rede_id ?? null;

              if (!redeId && !prof.is_super_admin) {
                  showAlert('Sua conta não está vinculada a nenhuma rede. Contate o suporte.', { type: 'error' });
                  return;
              }

              const insertPayload: any = { ...payload };
              if (redeId !== null && redeId !== undefined) insertPayload.rede_id = redeId;

              const { data: novaC, error } = await supabase
                  .from('clinicas')
                  .insert([insertPayload])
                  .select('id')
                  .single();
              if (error || !novaC) throw error || new Error('Falha ao criar clínica');
              clinicaId = novaC.id;

              const { error: vincErr } = await supabase
                  .from('profissionais_clinicas')
                  .insert([{ profissional_id: prof.id, clinica_id: novaC.id }]);
              if (vincErr) {
                  showAlert('Clínica criada, mas não foi possível vincular você automaticamente. Vincule em /ajustes/equipe.', { type: 'warning' });
              } else {
                  showAlert('Clínica cadastrada com sucesso!', { type: 'success' });
              }
          }

          if (clinicaId && logoArquivo) {
              try {
                  await publicarLogo(clinicaId, logoArquivo);
              } catch (err: any) {
                  showAlert('A clínica foi salva, mas a logo não foi enviada: ' + (err?.message || err), { type: 'warning' });
              }
          }

          setModalClinicaCompleto(false);
          setClinicaEditando(null);
          limparLogoLocal();
          carregarDados({ silent: true });
      } catch (e: any) {
          showAlert('Erro ao salvar: ' + (e?.message || e), { type: 'error' });
      }
  }

  async function excluirClinica(id: number) {
      if (!(await showConfirm('Tem certeza absoluta? Isso apagará a clínica e pode afetar dados vinculados.', { title: 'Excluir Clínica', type: 'error', confirmLabel: 'Excluir' }))) return;
      
      const { error } = await supabase.from('clinicas').delete().eq('id', id);
      
      if (error) {
          console.error(error);
          showAlert('Não foi possível excluir: ' + error.message + '\nDica: Verifique se existem pacientes ou vínculos dependentes desta clínica.', { type: 'error' });
      } else {
          showAlert('Clínica excluída com sucesso!', { type: 'success' });
          carregarDados({ silent: true });
      }
  }

  // Abrir modal de edição completa da clínica
  function abrirEdicaoClinica(c: any) {
      setClinicaEditando(c);
      setClinicaForm({
          id: c.id,
          nome: c.nome || '',
          cnpj: c.cnpj || '',
          responsavel_nome: c.responsavel_nome || '',
          email: c.email || '',
          telefone: c.telefone || '',
          horario_inicio: c.horario_inicio || '08:00',
          horario_fim: c.horario_fim || '18:00',
          fuso_horario: c.fuso_horario || 'America/Sao_Paulo',
          emitir_notas_em_nome: c.emitir_notas_em_nome || 'clinica',
          logo_url: c.logo_url || '',
          cep: c.cep || '',
          rua: c.rua || '',
          numero: c.numero || '',
          complemento: c.complemento || '',
          bairro: c.bairro || '',
          cidade: c.cidade || '',
          uf: c.uf || ''
      });
      limparLogoLocal();
      setLogoPreview(c.logo_url || '');
      setModalClinicaCompleto(true);
  }

  function escolherLogo(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
          showAlert('Selecione uma imagem válida', { type: 'warning' });
          return;
      }
      if (file.size > 2 * 1024 * 1024) {
          showAlert('Imagem deve ter no máximo 2MB', { type: 'warning' });
          return;
      }
      setLogoArquivo(file);
      setLogoPreview((atual) => {
          if (atual.startsWith('blob:')) URL.revokeObjectURL(atual);
          return URL.createObjectURL(file);
      });
  }

  async function publicarLogo(clinicaId: string | number, file: File) {
      setUploadingLogo(true);
      try {
          const fileExt = file.name.split('.').pop() || 'png';
          const filePath = `clinica-${clinicaId}-${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('clinicas-logos').upload(filePath, file, { upsert: true });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('clinicas-logos').getPublicUrl(filePath);
          const { error } = await supabase.from('clinicas').update({ logo_url: publicUrl }).eq('id', clinicaId);
          if (error) throw error;
          setClinicaForm((prev) => ({ ...prev, logo_url: publicUrl }));
      } finally {
          setUploadingLogo(false);
      }
  }

  // --- PROFISSIONAIS ---
  function abrirNovoProf() {
      setProfForm({ 
          id: '', user_id: '', nome: '', cargo: 'Dentista', nivel_acesso: 'comum', 
          email: '', senha: '', 
          cpf: '', cro: '', telefone: '', foto_url: '',
          conselho: 'CRO', uf: '', sexo: '', endereco: ''
      });
      setEditandoProf(false);
      setModalProf(true);
  }

  function abrirEditarProf(p: any) {
      setProfForm({ 
          id: p.id, user_id: p.user_id, nome: p.nome, 
          cargo: p.cargo || 'Dentista', nivel_acesso: p.nivel_acesso || 'comum', 
          email: '', senha: '', 
          cpf: p.cpf || '', cro: p.cro || '', telefone: p.telefone || '', foto_url: p.foto_url || '',
          conselho: p.conselho || 'CRO', uf: p.uf || '', sexo: p.sexo || '', endereco: p.endereco || ''
      });
      setEditandoProf(true);
      setModalProf(true);
  }

  async function salvarProfissional() {
      if (!profForm.nome) { await showAlert('Nome é obrigatório', { type: 'warning' }); return; }
      if (!editandoProf && (!profForm.email || !profForm.senha)) { await showAlert('Email e Senha são obrigatórios para novos usuários.', { type: 'warning' }); return; }

      setSalvandoProf(true);

      const dados = {
          id: profForm.id,
          user_id: profForm.user_id,
          email: profForm.email,
          password: profForm.senha,
          nome: profForm.nome,
          cargo: profForm.cargo,
          nivel_acesso: profForm.nivel_acesso,
          cpf: profForm.cpf,
          cro: profForm.cro,
          telefone: profForm.telefone,
          foto_url: profForm.foto_url,
          conselho: profForm.conselho,
          uf: profForm.uf,
          sexo: profForm.sexo,
          endereco: profForm.endereco
      };

      try {
          const url = editandoProf ? '/api/editar-usuario' : '/api/criar-usuario';
          const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(dados)
          });

          const json = await res.json();
          if (!res.ok) throw new Error(json.error);

          setModalProf(false);
          carregarDados({ silent: true });
          showAlert(editandoProf ? 'Dados atualizados!' : 'Profissional cadastrado com acesso ao sistema!', { type: 'success' });

      } catch (err: any) {
          showAlert('Erro: ' + err.message, { type: 'error' });
      } finally {
          setSalvandoProf(false);
      }
  }

  async function excluirProfissional() {
      if (!editandoProf) return;
      if (!(await showConfirm('ATENÇÃO: Isso removerá o acesso deste usuário ao sistema. Continuar?', { title: 'Excluir Profissional', type: 'error', confirmLabel: 'Excluir' }))) return;
      
      const { error } = await supabase.from('profissionais').delete().eq('id', profForm.id);
      if (error) showAlert('Erro ao excluir: ' + error.message, { type: 'error' });
      else {
          setModalProf(false);
          carregarDados({ silent: true });
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
    <>
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-3 py-3 font-poppins">
      <div className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Configurações</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {activeClinic ? getClinicLabel(activeClinic) : 'Rede'} · Clínicas, preferências e integrações
        </p>
      </div>

      {kpiLoading && clinicas.length === 0 ? (
        <div className={`${cardShell} space-y-2 p-4 sm:p-5`}>
          <div className="h-10 w-48 animate-pulse rounded-xl bg-neutral-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-neutral-50" />
          <div className="h-32 animate-pulse rounded-2xl bg-neutral-50" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <nav aria-label="Seções de configuração" className="flex w-[12.75rem] shrink-0 flex-col border-r border-black/10 px-2 py-2 sm:w-56">
            {CONFIG_NAVS.map((section) => {
              const Icon = section.icon;
              const active = abaAtiva === section.key;
              const badge = section.key === 'clinicas' ? clinicas.length : section.key === 'anamnese' ? modelos.length : section.key === 'backup' ? totalBackups : null;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setAbaAtiva(section.key)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm leading-snug ${active ? 'bg-neutral-900 font-medium text-white' : 'font-medium text-neutral-600 hover:bg-[#f3f4f1]'}`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1">{section.label}</span>
                  {badge != null && badge > 0 && (
                    <span className={`text-[11px] font-medium tabular-nums ${active ? 'text-white/70' : 'text-neutral-400'}`}>{badge}</span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {/* ABA CLÍNICAS */}
            {abaAtiva === 'clinicas' && (
                <section className={sectionPad}>
                        <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                            <div>
                              <h3 className="text-base font-semibold text-neutral-900">Unidades</h3>
                              <p className="text-xs text-neutral-500">Endereço, horário e dados fiscais</p>
                            </div>
                            <button type="button" onClick={abrirNovaClinica} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Plus size={14}/> Nova clínica</button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                            {clinicas.map(c => (
                                <div key={c.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-[#f3f4f1] text-neutral-700">
                                            {c.logo_url ? <img src={c.logo_url} className="h-full w-full object-cover" alt=""/> : <Building2 size={16}/>}
                                        </div>
                                        <div className="min-w-0">
                                            <span className="block truncate text-sm font-medium text-neutral-900">{c.nome}</span>
                                            {c.cnpj && <span className="text-xs text-neutral-500">{c.cnpj}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => abrirEdicaoClinica(c)} className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-white rounded-lg transition-all" title="Editar"><Edit size={18}/></button>
                                        <button onClick={() => excluirClinica(c.id)} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-white rounded-lg transition-all" title="Excluir"><Trash2 size={18}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                </section>
            )}

            {/* ABA PLANOS */}
            {abaAtiva === 'planos' && (perfilCaller?.nivel_acesso === 'admin' || perfilCaller?.is_super_admin) && (
                <section className={sectionPad}>
                    <PlanosContent embedded />
                </section>
            )}
            {abaAtiva === 'planos' && !(perfilCaller?.nivel_acesso === 'admin' || perfilCaller?.is_super_admin) && (
                <section className={`${sectionPad} text-sm text-amber-800`}>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">Apenas administradores podem gerenciar planos.</div>
                </section>
            )}

            {/* ABA ANAMNESE */}
            {abaAtiva === 'anamnese' && (
                <section className={sectionPad}>
                        <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-neutral-900">Modelos de anamnese</h3>
                                <p className="mt-1 text-xs text-neutral-500">Perguntas usadas na ficha do paciente.</p>
                            </div>
                            <button type="button" onClick={abrirNovoModelo} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Plus size={14}/> Novo modelo</button>
                        </div>

                        <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto md:grid-cols-2">
                            {modelos.map(m => (
                                <div key={m.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="truncate text-sm font-semibold text-neutral-900">{m.nome}</h4>
                                                {m.padrao && <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">Padrão</span>}
                                            </div>
                                            {m.descricao && <p className="text-xs text-neutral-500">{m.descricao}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-neutral-500 font-bold mb-4">
                                        <HelpCircle size={12}/> {m.perguntas.length} pergunta{m.perguntas.length !== 1 ? 's' : ''}
                                    </div>
                                    <div className="mb-2 max-h-24 space-y-1 overflow-y-auto">
                                        {m.perguntas.slice(0, 5).map(p => (
                                            <div key={p.id} className="text-[11px] text-neutral-600 bg-white p-2 rounded border border-neutral-100 truncate">
                                                <span className="text-neutral-400 font-bold mr-1">{p.tipo === 'sim_nao' || p.tipo === 'sim_nao_texto' ? '◉' : p.tipo === 'multipla' ? '☰' : '▭'}</span>
                                                {p.label}
                                            </div>
                                        ))}
                                        {m.perguntas.length > 5 && <div className="text-[10px] text-neutral-400 text-center">+ {m.perguntas.length - 5} mais</div>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => abrirEditarModelo(m)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Edit size={12}/> Editar</button>
                                        <button onClick={() => duplicarModelo(m)} className="h-8 rounded-md border border-neutral-200 px-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Duplicar</button>
                                        {!m.padrao && <button onClick={() => excluirModelo(m.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:bg-neutral-50 hover:text-rose-600"><Trash2 size={12}/></button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                </section>
            )}

            {/* ABA GERAL / PREFERÊNCIAS */}
            {abaAtiva === 'geral' && (
                <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-2">
                    <section className="min-h-0 space-y-2 overflow-hidden">
                        <h3 className="text-base font-semibold text-neutral-900">Preferências gerais</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <div><label className={campoLabel}>Nome para documentos</label><input value={prefs.nome_clinica} onChange={e => atualizarPref('nome_clinica', e.target.value)} className={campoInput} placeholder="Ex: Clínica Sorriso"/></div>
                            <div><label className={campoLabel}>CNPJ</label><input value={prefs.cnpj} onChange={e => atualizarPref('cnpj', e.target.value)} className={campoInput} placeholder="00.000.000/0000-00"/></div>
                            <div className="col-span-2"><label className={campoLabel}>Slogan</label><input value={prefs.slogan} onChange={e => atualizarPref('slogan', e.target.value)} className={campoInput} placeholder="Ex: Odontologia Integrada"/></div>
                            <div className="col-span-2"><label className={campoLabel}>Cabeçalho dos documentos</label><textarea value={prefs.cabecalho_documentos} onChange={e => atualizarPref('cabecalho_documentos', e.target.value)} className="h-16 w-full resize-none rounded-md border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900" placeholder="Endereço, telefone e responsável técnico..."/></div>
                            <div className="col-span-2"><label className={campoLabel}>Rodapé dos documentos</label><input value={prefs.rodape_documentos} onChange={e => atualizarPref('rodape_documentos', e.target.value)} className={campoInput}/></div>
                        </div>
                    </section>
                    <section className="min-h-0 space-y-3 overflow-hidden">
                        <h3 className="text-base font-semibold text-neutral-900">Horário de atendimento</h3>
                        <div className="grid grid-cols-3 gap-2">
                            <div><label className={campoLabel}>Abertura</label><input type="time" value={prefs.horario_abertura} onChange={e => atualizarPref('horario_abertura', e.target.value)} className={campoInput}/></div>
                            <div><label className={campoLabel}>Fechamento</label><input type="time" value={prefs.horario_fechamento} onChange={e => atualizarPref('horario_fechamento', e.target.value)} className={campoInput}/></div>
                            <div><label className={campoLabel}>Consulta (min)</label><input type="number" value={prefs.duracao_consulta_padrao} onChange={e => atualizarPref('duracao_consulta_padrao', parseInt(e.target.value)||60)} className={campoInput}/></div>
                        </div>
                        <div>
                            <label className={campoLabel}>Dias</label>
                            <div className="flex flex-wrap gap-1.5">
                                {[{k:'seg',l:'Seg'},{k:'ter',l:'Ter'},{k:'qua',l:'Qua'},{k:'qui',l:'Qui'},{k:'sex',l:'Sex'},{k:'sab',l:'Sáb'},{k:'dom',l:'Dom'}].map(d => (
                                    <button key={d.k} type="button" onClick={() => toggleDia(d.k)} className={`h-8 rounded-md px-2.5 text-xs font-medium ${prefs.dias_atendimento[d.k] ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>{d.l}</button>
                                ))}
                            </div>
                        </div>
                        <div className="max-w-xs">
                            <label className={campoLabel}>Cor do tema</label>
                            <CustomSelect value={prefs.cor_tema || 'blue'} onChange={v => { atualizarPref('cor_tema', v); applyTheme(v as ThemeId); }} options={THEME_OPTIONS} size="lg"/>
                        </div>
                        <div className="space-y-1.5">
                            {[
                                { k: 'notificar_aniversariantes', l: 'Aniversariantes do dia' },
                                { k: 'notificar_debitos', l: 'Débitos pendentes' },
                                { k: 'confirmar_exclusao', l: 'Confirmar antes de excluir' },
                            ].map(it => (
                                <label key={it.k} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
                                    <span className="text-sm font-medium text-neutral-800">{it.l}</span>
                                    <button type="button" onClick={() => atualizarPref(it.k, !prefs[it.k])} className={`relative h-6 w-11 rounded-full ${prefs[it.k] ? 'bg-neutral-900' : 'bg-neutral-300'}`} aria-pressed={!!prefs[it.k]}>
                                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${prefs[it.k] ? 'left-5' : 'left-0.5'}`}></span>
                                    </button>
                                </label>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {/* ABA CONTRATOS & DOCUMENTOS */}
            {abaAtiva === 'documentos' && (
                <section className={sectionPad}>
                        <div className="mb-3 flex shrink-0 flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-neutral-900">Modelos de documentos</h3>
                                    <p className="mt-1 text-xs text-neutral-500">Contratos, receitas e termos.</p>
                                </div>
                                <button type="button" onClick={abrirNovoDoc} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Plus size={14}/> Novo modelo</button>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative min-w-0 flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16}/>
                                    <input value={docsBusca} onChange={e => setDocsBusca(e.target.value)} placeholder="Buscar modelo" className="h-10 w-full rounded-full border border-black/10 bg-[#f8f8f6] py-2 pl-9 pr-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"/>
                                </div>
                                <div className="w-40 shrink-0">
                                    <CustomSelect pill value={docsTipo} onChange={setDocsTipo} options={[{value:'todos',label:'Tipo'},{value:'contrato',label:'Contrato'},{value:'receita',label:'Receita'},{value:'atestado',label:'Atestado'},{value:'outro',label:'Outro'}]} size="sm"/>
                                </div>
                                <div className="flex rounded-full border border-black/10 bg-[#f3f4f1] p-0.5">
                                    <button type="button" onClick={() => setDocsVisualizacao('lista')} className={`rounded-full p-2 ${docsVisualizacao === 'lista' ? 'bg-neutral-900 text-white' : 'text-neutral-500'}`} aria-label="Lista"><List size={16}/></button>
                                    <button type="button" onClick={() => setDocsVisualizacao('grade')} className={`rounded-full p-2 ${docsVisualizacao === 'grade' ? 'bg-neutral-900 text-white' : 'text-neutral-500'}`} aria-label="Grade"><LayoutGrid size={16}/></button>
                                </div>
                            </div>
                        </div>

                        {(() => {
                            const q = docsBusca.trim().toLowerCase();
                            const lista = docs.filter((d) => (docsTipo === 'todos' || d.tipo === docsTipo) && (!q || d.nome.toLowerCase().includes(q) || d.conteudo.toLowerCase().includes(q)));
                            if (lista.length === 0) return <div className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-500">Nenhum modelo encontrado.</div>;
                            if (docsVisualizacao === 'lista') {
                                return (
                                    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-neutral-200">
                                        {lista.map((d) => (
                                            <div key={d.id} className="flex items-center gap-3 border-b border-black/5 px-3 py-2.5 last:border-0">
                                                <span className="w-20 shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-center text-[10px] font-medium text-neutral-600">{d.tipo}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-neutral-900">{d.nome}</p>
                                                    <p className="truncate text-xs text-neutral-500">{d.conteudo}</p>
                                                </div>
                                                <button onClick={() => abrirEditarDoc(d)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50"><Edit size={14}/></button>
                                                <button onClick={() => excluirDoc(d.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600"><Trash2 size={14}/></button>
                                            </div>
                                        ))}
                                    </div>
                                );
                            }
                            return (
                        <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto md:grid-cols-2">
                            {lista.map(d => (
                                <div key={d.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                                    <div className="mb-1.5 flex items-center gap-2">
                                        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{d.tipo}</span>
                                        <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{d.nome}</h4>
                                    </div>
                                    <p className="mb-2 line-clamp-2 whitespace-pre-line text-xs text-neutral-500">{d.conteudo}</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => abrirEditarDoc(d)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Edit size={12}/> Editar</button>
                                        <button onClick={() => excluirDoc(d.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600"><Trash2 size={12}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                            );
                        })()}
                </section>
            )}

            {/* ABA CATEGORIAS FINANCEIRAS */}
            {abaAtiva === 'categorias' && (
                <section className={sectionPad}>
                        <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-neutral-900">Categorias financeiras</h3>
                                <p className="text-xs text-neutral-500">Inativas não aparecem no Financeiro.</p>
                            </div>
                            <button type="button" onClick={abrirNovaCatFin} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Plus size={14}/> Adicionar</button>
                        </div>

                        <div className="mb-2 flex shrink-0 items-center gap-2">
                            <input
                                value={buscaCatFin}
                                onChange={e => setBuscaCatFin(e.target.value)}
                                placeholder="Buscar categorias"
                                className={campoInput}
                            />
                            <span className="shrink-0 text-xs text-neutral-500">{catsFinFiltradas.length}/{catsFin.length}</span>
                        </div>

                        <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-1.5 overflow-y-auto md:grid-cols-2">
                            {catsFinFiltradas.length === 0 ? (
                                <div className="col-span-2 rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-500">
                                    {buscaCatFin.trim() ? 'Nenhuma categoria encontrada.' : 'Nenhuma categoria cadastrada.'}
                                </div>
                            ) : catsFinFiltradas.map(c => (
                                <div key={c.id} className={`flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 ${c.ativo ? '' : 'opacity-50'}`}>
                                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: c.cor }} />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{c.nome}</span>
                                    <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{c.tipo}</span>
                                    <button onClick={() => toggleCatFinAtiva(c.id)} className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${c.ativo ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-400'}`} title={c.ativo ? 'Desativar' : 'Ativar'}><Check size={14}/></button>
                                    <button onClick={() => abrirEditarCatFin(c)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50"><Edit size={14}/></button>
                                    <button onClick={() => removerCatFin(c.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                </section>
            )}

            {abaAtiva === 'comunicacao' && (
                <section className={sectionPad}>
                    <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base font-semibold text-neutral-900">Templates</h3>
                            <p className="text-xs text-neutral-500">WhatsApp, e-mail e SMS. Lembretes automáticos saem às 10h.</p>
                        </div>
                        <button type="button" onClick={abrirNovoTemplateCom} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Plus size={14}/> Novo template</button>
                    </div>
                    <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto md:grid-cols-2">
                        {templatesComunicacao.map(t => (
                            <div key={t.id} className={`rounded-xl border border-neutral-200 bg-white p-3 ${t.ativo ? '' : 'opacity-50'}`}>
                                <div className="mb-1.5 flex items-center gap-2">
                                    <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{t.canal}</span>
                                    <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{t.nome}</h4>
                                    {!t.ativo && <span className="text-[10px] text-neutral-400">Inativo</span>}
                                </div>
                                <p className="mb-2 line-clamp-2 whitespace-pre-line text-xs text-neutral-500">{t.corpo}</p>
                                <div className="flex gap-2">
                                    <button onClick={() => abrirEditarTemplateCom(t)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Edit size={12}/> Editar</button>
                                    <button onClick={() => excluirTemplateCom(t.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600"><Trash2 size={12}/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {abaAtiva === 'taxas' && (() => {
                const achar = (pred: (t: TaxaMaquininha) => boolean) => taxasMaquininha.find(pred) || TAXAS_MAQUININHA_PADRAO.find(pred);
                const pix = achar((t) => t.tipo === 'pix');
                const debVisa = achar((t) => t.tipo === 'debito' && t.bandeira === 'Visa/Master');
                const debitosOutrosSalvos = taxasMaquininha.filter((t) => t.tipo === 'debito' && t.bandeira !== 'Visa/Master');
                const debitosOutros = debitosOutrosSalvos.length > 0 ? debitosOutrosSalvos : TAXAS_MAQUININHA_PADRAO.filter((t) => t.tipo === 'debito' && t.bandeira !== 'Visa/Master');
                const parcelasDe = (bandeira: string) => {
                    const salvas = taxasMaquininha.filter((t) => t.bandeira === bandeira && t.parcela != null && t.tipo !== 'debito' && t.tipo !== 'pix');
                    const base = TAXAS_MAQUININHA_PADRAO.filter((t) => t.bandeira === bandeira && t.parcela != null);
                    return base.map((p) => salvas.find((s) => s.parcela === p.parcela) || p).sort((a, b) => (a.parcela || 0) - (b.parcela || 0));
                };
                const creditoVisa = parcelasDe('Visa/Master');
                const creditoElo = parcelasDe('Elo');
                const aplicarGrupo = (itens: TaxaMaquininha[], campo: keyof TaxaMaquininha, valor: string | number | boolean) => {
                    let lista = [...taxasMaquininha];
                    itens.forEach((item) => {
                        const idx = lista.findIndex((t) => t.id === item.id);
                        if (idx >= 0) lista[idx] = { ...lista[idx], [campo]: valor };
                        else lista.push({ ...item, [campo]: valor });
                    });
                    salvarTaxas(lista);
                };
                const linha = (nome: string, amostra: TaxaMaquininha, grupo: TaxaMaquininha[]) => (
                    <div key={nome} className={`grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_4.5rem_3.25rem_2rem] items-center gap-2 px-1 ${amostra.ativo ? '' : 'opacity-45'}`}>
                        <p className="truncate text-sm font-medium text-neutral-900">{nome}</p>
                        <input type="number" step="0.01" min="0" max="100" value={amostra.taxa_percentual} onChange={e => aplicarGrupo(grupo, 'taxa_percentual', parseFloat(e.target.value) || 0)} className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-900 outline-none focus:border-neutral-900" aria-label="Taxa" />
                        <input type="number" min="0" value={amostra.prazo_recebimento_dias} onChange={e => aplicarGrupo(grupo, 'prazo_recebimento_dias', parseInt(e.target.value) || 0)} className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-900 outline-none focus:border-neutral-900" aria-label="Prazo" />
                        <button type="button" onClick={() => aplicarGrupo(grupo, 'ativo', !amostra.ativo)} className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${amostra.ativo ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-400'}`} aria-label={amostra.ativo ? 'Desativar' : 'Ativar'}><Check size={14}/></button>
                    </div>
                );
                const coluna = (titulo: string, linhas: React.ReactNode) => (
                    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                        <div className="border-b border-black/5 px-3 py-2.5">
                            <h3 className="text-sm font-semibold text-neutral-900">{titulo}</h3>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col p-2">
                            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_4.5rem_3.25rem_2rem] gap-2 px-1 pb-1">
                                <span className="text-[11px] font-medium text-neutral-500">Pagamento</span>
                                <span className="text-[11px] font-medium text-neutral-500">Taxa</span>
                                <span className="text-[11px] font-medium text-neutral-500">Prazo</span>
                                <span />
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col">{linhas}</div>
                        </div>
                    </section>
                );
                const nomeParcela = (t: TaxaMaquininha) => t.parcela === 1 ? 'À vista' : `${t.parcela}x`;
                const grupoParcela = (parcela: number, bandeiras: string[]) => {
                    const salvas = taxasMaquininha.filter((t) => t.parcela === parcela && bandeiras.includes(t.bandeira));
                    if (salvas.length) return salvas;
                    return TAXAS_MAQUININHA_PADRAO.filter((t) => t.parcela === parcela && bandeiras.includes(t.bandeira));
                };
                return (
                <div className="grid h-full min-h-0 grid-cols-1 gap-2 overflow-hidden p-3 lg:grid-cols-3">
                    {pix && debVisa && coluna('PIX e débito', <>
                        {linha('PIX', pix, [pix])}
                        {linha('Débito Visa/Master', debVisa, [debVisa])}
                        {debitosOutros[0] && linha('Elo/outros', debitosOutros[0], debitosOutros)}
                    </>)}
                    {coluna('Crédito Visa/Master', creditoVisa.map((t) => linha(nomeParcela(t), t, grupoParcela(t.parcela || 1, ['Visa/Master']))))}
                    {coluna('Crédito Elo/Outros', creditoElo.map((t) => linha(nomeParcela(t), t, grupoParcela(t.parcela || 1, ['Elo', 'Amex', 'Hipercard']))))}
                </div>
                );
            })()}

            {/* ABA BACKUP */}
            {abaAtiva === 'backup' && (
                <section className={sectionPad}>
                    <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base font-semibold text-neutral-900">Backups</h3>
                            <p className="text-xs text-neutral-500">Automático 2 vezes ao dia. Os 30 mais recentes ficam guardados.</p>
                        </div>
                        <button type="button" onClick={backupAgoraManual} disabled={criandoBackup} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                            {criandoBackup ? <><Loader2 className="animate-spin" size={14}/> Gerando</> : <><Plus size={14}/> Backup manual</>}
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                        {backups.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">Nenhum backup encontrado.</div>
                        ) : backups.map((b: any) => {
                            const isAuto = (b.tipo || '').startsWith('automatico');
                            return (
                                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-neutral-900">#{b.id}</span>
                                            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{isAuto ? 'automático' : (b.tipo || 'manual')}</span>
                                            {b.tamanho_kb ? <span className="text-[10px] text-neutral-500">{b.tamanho_kb} KB</span> : null}
                                        </div>
                                        <p className="truncate text-xs text-neutral-500">
                                            {new Date(b.criado_em).toLocaleDateString('pt-BR')} às {new Date(b.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            {b.observacao ? ` · ${b.observacao}` : ''}
                                        </p>
                                    </div>
                                    <button onClick={() => baixarBackupComoJson(b.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50" title="Baixar"><Download size={14}/></button>
                                    <button onClick={() => abrirModalRestaurar(b)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50" title="Restaurar"><RotateCcw size={14}/></button>
                                    <button onClick={() => excluirBackupItem(b.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600" title="Excluir"><Trash2 size={14}/></button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-2 grid shrink-0 grid-cols-3 gap-2">
                        <button type="button" onClick={exportarPacientes} className="h-9 rounded-md border border-neutral-200 text-xs font-medium text-neutral-800 hover:bg-neutral-50">Exportar pacientes</button>
                        <button type="button" onClick={exportarTudo} className="h-9 rounded-md border border-neutral-200 text-xs font-medium text-neutral-800 hover:bg-neutral-50">Exportar configurações</button>
                        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-neutral-200 text-xs font-medium text-neutral-800 hover:bg-neutral-50">
                            Importar configurações
                            <input type="file" accept="application/json" onChange={importarTudo} className="hidden"/>
                        </label>
                    </div>
                </section>
            )}
          </div>
        </div>
      )}
    </div>

      {/* MODAL RESTAURAR BACKUP - Confirmação Dupla */}
      <Modal open={!!modalRestaurar} onClose={() => setModalRestaurar(null)} maxWidth="lg" zIndex={70} hideCloseButton>
          {modalRestaurar && (
          <div className="w-full overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
                      <div>
                          <h3 className="text-base font-semibold text-neutral-900">Restaurar backup</h3>
                          <p className="mt-0.5 text-xs text-neutral-500">Essa ação substitui os dados atuais e não pode ser desfeita.</p>
                      </div>
                      <button onClick={() => setModalRestaurar(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50"><X size={16}/></button>
                  </div>

                  <div className="space-y-3 p-4">
                      <div className="rounded-xl border border-neutral-200 bg-[#f8f8f6] p-3">
                          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-neutral-900"><AlertTriangle size={14}/> O que vai acontecer</div>
                          <ul className="ml-5 list-disc space-y-1 text-xs text-neutral-600">
                              <li><strong>Apagar TODOS os dados atuais</strong> de pacientes, agendamentos, despesas, clínicas, profissionais e serviços.</li>
                              <li><strong>Substituir</strong> pelo conteúdo do backup selecionado.</li>
                              <li>Tudo o que foi adicionado <strong>após {new Date(modalRestaurar.criado_em).toLocaleString('pt-BR')}</strong> será permanentemente perdido.</li>
                              <li><strong>Não pode ser desfeita.</strong></li>
                          </ul>
                      </div>

                      <div className="rounded-xl border border-neutral-200 px-3 py-2">
                          <p className="text-xs text-neutral-500">Backup selecionado</p>
                          <p className="text-sm font-medium text-neutral-900">#{modalRestaurar.id} · {modalRestaurar.tipo}</p>
                          <p className="text-xs text-neutral-500">{new Date(modalRestaurar.criado_em).toLocaleString('pt-BR')} {modalRestaurar.tamanho_kb ? `· ${modalRestaurar.tamanho_kb} KB` : ''}</p>
                      </div>

                      <p className="text-xs text-neutral-500">Antes de restaurar, gere um backup manual do estado atual.</p>

                      <div>
                          <label className={campoLabel}>
                              Digite RESTAURAR para confirmar
                          </label>
                          <input
                              autoFocus
                              value={confirmacaoTexto}
                              onChange={e => setConfirmacaoTexto(e.target.value)}
                              placeholder="RESTAURAR"
                              className={`${campoInput} text-center font-mono tracking-wide ${confirmacaoTexto === 'RESTAURAR' ? 'border-neutral-900' : ''}`}
                          />
                      </div>
                  </div>

                  <div className="flex gap-2 border-t border-neutral-200 px-4 py-3">
                      <button onClick={() => setModalRestaurar(null)} disabled={restaurando} className="h-9 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">Cancelar</button>
                      <button
                          onClick={confirmarRestauracao}
                          disabled={confirmacaoTexto !== 'RESTAURAR' || restaurando}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
                      >
                          {restaurando ? <><Loader2 className="animate-spin" size={18}/> Restaurando...</> : <><RotateCcw size={18}/> Confirmar Restauração</>}
                      </button>
                  </div>
              </div>
          )}
      </Modal>

      {/* MODAL EDITAR DOCUMENTO */}
      <Modal open={modalDoc && !!docEdit} onClose={() => setModalDoc(false)} maxWidth="2xl" hideCloseButton>
          {docEdit && (
          <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                      <h3 className="text-base font-semibold text-neutral-900">{docs.find(d => d.id === docEdit.id) ? 'Editar modelo' : 'Novo modelo'}</h3>
                      <button onClick={() => setModalDoc(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50"><X size={16}/></button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div className="md:col-span-2">
                              <label className={campoLabel}>Nome</label>
                              <input value={docEdit.nome} onChange={e => setDocEdit({...docEdit, nome: e.target.value})} className={campoInput}/>
                          </div>
                          <div>
                              <label className={campoLabel}>Tipo</label>
                              <CustomSelect value={docEdit.tipo} onChange={v => setDocEdit({...docEdit, tipo: v as any})} options={[{value:'contrato',label:'Contrato'},{value:'receita',label:'Receita'},{value:'atestado',label:'Atestado'},{value:'outro',label:'Outro'}]} size="md"/>
                          </div>
                      </div>
                      <div>
                          <label className={campoLabel}>Conteúdo</label>
                          <div className="mb-2 flex flex-wrap gap-1">
                              {DOCUMENTO_VARIAVEIS.map(v => (
                                  <button key={v.chave} type="button" onClick={() => inserirVariavelDoc(String(v.chave))} title={tokenVariavelLabel(v.label)} className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50">{v.label}</button>
                              ))}
                          </div>
                          <DocumentoVariavelEditor
                              ref={docEditorRef}
                              value={docEdit.conteudo}
                              onChange={(conteudo) => setDocEdit({ ...docEdit, conteudo })}
                              placeholder="Digite o texto do modelo e insira variáveis pelos botões acima..."
                          />
                          <div className="mt-2 rounded-xl border border-neutral-200 bg-[#f8f8f6] p-3">
                              <p className="mb-1 text-xs font-medium text-neutral-500">Pré-visualização</p>
                              <p className="whitespace-pre-line text-sm text-neutral-800">{docPreview || '—'}</p>
                          </div>
                      </div>
                  </div>
                  <div className="flex gap-2 border-t border-neutral-200 px-4 py-3">
                      <button onClick={() => setModalDoc(false)} className="h-9 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50">Cancelar</button>
                      <button onClick={salvarDocEdit} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800"><Save size={14}/> Salvar</button>
                  </div>
              </div>
          )}
      </Modal>

      {/* MODAL TEMPLATE COMUNICAÇÃO */}
      <Modal open={modalTemplateCom && !!templateComEdit} onClose={() => setModalTemplateCom(false)} maxWidth="2xl" hideCloseButton>
          {templateComEdit && (
          <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                      <h3 className="text-base font-semibold text-neutral-900">{templatesComunicacao.find(t => t.id === templateComEdit.id) ? 'Editar template' : 'Novo template'}</h3>
                      <button onClick={() => setModalTemplateCom(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50"><X size={16}/></button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <div>
                              <label className={campoLabel}>Nome</label>
                              <input value={templateComEdit.nome} onChange={e => setTemplateComEdit({ ...templateComEdit, nome: e.target.value })} className={campoInput}/>
                          </div>
                          <div>
                              <label className={campoLabel}>Canal</label>
                              <CustomSelect value={templateComEdit.canal} onChange={v => setTemplateComEdit({ ...templateComEdit, canal: v as TemplateComunicacao['canal'] })} options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'E-mail' }, { value: 'sms', label: 'SMS' }]} size="md"/>
                          </div>
                      </div>
                      {templateComEdit.canal === 'email' && (
                          <div>
                              <label className={campoLabel}>Assunto</label>
                              <input value={templateComEdit.assunto || ''} onChange={e => setTemplateComEdit({ ...templateComEdit, assunto: e.target.value })} className={campoInput}/>
                          </div>
                      )}
                      <div>
                          <label className={campoLabel}>Mensagem</label>
                          <textarea value={templateComEdit.corpo} onChange={e => setTemplateComEdit({ ...templateComEdit, corpo: e.target.value })} rows={6} className="w-full resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"/>
                      </div>
                  </div>
                  <div className="flex gap-2 border-t border-neutral-200 px-4 py-3">
                      <button onClick={() => setModalTemplateCom(false)} className="h-9 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50">Cancelar</button>
                      <button onClick={salvarTemplateComEdit} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800"><Save size={14}/> Salvar</button>
                  </div>
              </div>
          )}
      </Modal>

      {/* MODAL CATEGORIA FINANCEIRA */}
      <Modal open={modalCatFin && !!catFinEdit} onClose={() => { setModalCatFin(false); setCatFinEdit(null); setCorCatAberta(false); }} maxWidth="md" hideCloseButton panelClassName="!overflow-visible">
          {catFinEdit && (
          <div className="w-full rounded-xl border border-neutral-200 bg-white">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                  <h3 className="text-base font-semibold text-neutral-900">{catsFin.find(c => c.id === catFinEdit.id) ? 'Editar categoria' : 'Nova categoria'}</h3>
                  <button onClick={() => { setModalCatFin(false); setCatFinEdit(null); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50"><X size={16}/></button>
              </div>
              <div className="space-y-3 p-4">
                  <div>
                      <label className={campoLabel}>Nome</label>
                      <input value={catFinEdit.nome} onChange={e => setCatFinEdit({ ...catFinEdit, nome: e.target.value })} className={campoInput}/>
                  </div>
                  <div>
                      <label className={campoLabel}>Tipo</label>
                      <div className="grid h-10 grid-cols-2 rounded-md border border-neutral-200 p-0.5">
                          <button type="button" onClick={() => setCatFinEdit({ ...catFinEdit, tipo: 'receita' })} className={`rounded-[5px] text-sm font-medium ${catFinEdit.tipo === 'receita' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Receita</button>
                          <button type="button" onClick={() => setCatFinEdit({ ...catFinEdit, tipo: 'despesa' })} className={`rounded-[5px] text-sm font-medium ${catFinEdit.tipo === 'despesa' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Despesa</button>
                      </div>
                  </div>
                  <div className="relative">
                      <label className={campoLabel}>Cor</label>
                      <button type="button" onClick={() => setCorCatAberta(v => !v)} className="flex h-10 w-full items-center justify-between rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900">
                          <span className="flex items-center gap-2">
                              <span className="h-5 w-5 rounded-md border border-black/10" style={{ backgroundColor: catFinEdit.cor }} />
                              {catFinEdit.cor}
                          </span>
                          <ChevronDown size={16} className={`text-neutral-400 ${corCatAberta ? 'rotate-180' : ''}`} />
                      </button>
                      {corCatAberta && (
                          <div className="mt-2 rounded-xl border border-neutral-200 bg-[#f8f8f6] p-3">
                              <p className="mb-2 text-xs font-medium text-neutral-500">Predefinidas</p>
                              <div className="grid grid-cols-6 gap-1.5">
                                  {CORES_CATEGORIA.map((cor) => (
                                      <button key={cor} type="button" onClick={() => { guardarCorRecente(cor); setCatFinEdit({ ...catFinEdit, cor }); setCorCatAberta(false); }} className={`h-8 rounded-md border ${catFinEdit.cor.toLowerCase() === cor ? 'border-neutral-900' : 'border-black/10'}`} style={{ backgroundColor: cor }} aria-label={cor} />
                                  ))}
                              </div>
                              {lerCoresRecentes().length > 0 && (
                                  <>
                                      <p className="mb-2 mt-3 text-xs font-medium text-neutral-500">Últimas usadas</p>
                                      <div className="flex flex-wrap gap-1.5">
                                          {lerCoresRecentes().map((cor) => (
                                              <button key={cor} type="button" onClick={() => { guardarCorRecente(cor); setCatFinEdit({ ...catFinEdit, cor }); setCorCatAberta(false); }} className="h-8 w-8 rounded-md border border-black/10" style={{ backgroundColor: cor }} aria-label={cor} />
                                          ))}
                                      </div>
                                  </>
                              )}
                              <label className="mt-3 flex items-center gap-2 text-xs font-medium text-neutral-600">
                                  Personalizar
                                  <input type="color" value={catFinEdit.cor} onChange={e => { guardarCorRecente(e.target.value); setCatFinEdit({ ...catFinEdit, cor: e.target.value }); }} className="h-8 w-10 cursor-pointer rounded-md border border-neutral-200 bg-white" />
                              </label>
                          </div>
                      )}
                  </div>
              </div>
              <div className="flex gap-2 border-t border-neutral-200 px-4 py-3">
                  <button onClick={() => { setModalCatFin(false); setCatFinEdit(null); }} className="h-9 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50">Cancelar</button>
                  <button onClick={salvarCatFinModal} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800"><Save size={14}/> Salvar</button>
              </div>
          </div>
          )}
      </Modal>

      {/* MODAL CRIAR/EDITAR MODELO ANAMNESE */}
      <Modal open={modalModelo && !!modeloEdit} onClose={() => setModalModelo(false)} maxWidth="2xl" hideCloseButton>
          {modeloEdit && (
          <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                      <div>
                          <h3 className="text-base font-semibold text-neutral-900">{modelos.find(m => m.id === modeloEdit.id) ? 'Editar modelo' : 'Novo modelo'}</h3>
                          <p className="text-xs text-neutral-500">Perguntas do questionário.</p>
                      </div>
                      <button onClick={() => setModalModelo(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50"><X size={16}/></button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div>
                              <label className={campoLabel}>Nome</label>
                              <input value={modeloEdit.nome} onChange={e => setModeloEdit({...modeloEdit, nome: e.target.value})} className={campoInput} placeholder="Ex: Anamnese endodôntica"/>
                          </div>
                          <div className="md:col-span-2">
                              <label className={campoLabel}>Descrição</label>
                              <input value={modeloEdit.descricao || ''} onChange={e => setModeloEdit({...modeloEdit, descricao: e.target.value})} className={campoInput} placeholder="Para que serve este modelo"/>
                          </div>
                      </div>
                      <div>
                          <div className="mb-2 flex items-center justify-between">
                              <h4 className="text-sm font-medium text-neutral-900">Perguntas ({modeloEdit.perguntas.length})</h4>
                              <button onClick={adicionarPergunta} className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-200 px-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Plus size={12}/> Adicionar</button>
                          </div>
                          <div className="space-y-1.5" ref={perguntasListRef}>
                              {modeloEdit.perguntas.map((p, idx) => (
                                  <div key={p.id} className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-[#f8f8f6] p-2">
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-xs font-medium text-neutral-600">{idx + 1}</div>
                                      <div className="min-w-0 flex-1 space-y-1.5">
                                          <input value={p.label} onChange={e => atualizarPergunta(idx, { label: e.target.value })} className={campoInput} placeholder="Texto da pergunta"/>
                                          <div className="flex items-center gap-2">
                                              <CustomSelect value={p.tipo} onChange={v => atualizarPergunta(idx, { tipo: v as TipoPergunta, opcoes: v === 'multipla' ? (p.opcoes || ['Opção 1']) : undefined })} options={[{value:'texto',label:'Texto livre'},{value:'sim_nao',label:'Sim / Não'},{value:'sim_nao_texto',label:'Sim / Não + Texto'},{value:'multipla',label:'Múltipla escolha'}]} size="sm"/>
                                              {p.tipo === 'multipla' && (
                                                  <input value={(p.opcoes || []).join(', ')} onChange={e => atualizarPergunta(idx, { opcoes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className={campoInput} placeholder="Opções separadas por vírgula"/>
                                              )}
                                          </div>
                                      </div>
                                      <button onClick={() => removerPergunta(idx)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-white hover:text-rose-600"><Trash2 size={14}/></button>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
                  <div className="flex gap-2 border-t border-neutral-200 px-4 py-3">
                      <button onClick={() => setModalModelo(false)} className="h-9 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50">Cancelar</button>
                      <button onClick={salvarModelo} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800"><Save size={14}/> Salvar</button>
                  </div>
              </div>
          )}
      </Modal>

      <Modal open={modalProf} onClose={() => setModalProf(false)} maxWidth="2xl" hideCloseButton>
          <div className="bg-white w-full rounded-[1.35rem] shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 border border-neutral-100">
                  <div className="p-6 border-b border-neutral-100 flex justify-between items-start bg-neutral-50/50 rounded-t-[1.35rem] flex-none">
                      <div><h3 className="font-black text-2xl text-neutral-800">{editandoProf ? 'Editar Perfil' : 'Novo Acesso'}</h3><p className="text-neutral-500 font-medium text-sm">Dados profissionais e de acesso.</p></div>
                      {editandoProf && (<button onClick={excluirProfissional} className="p-2 text-red-400 hover:bg-red-50 rounded-lg hover:text-red-600 transition-colors"><Trash2 size={20}/></button>)}
                  </div>
                  <div className="p-8 overflow-y-auto custom-scrollbar space-y-6 flex-1">
                      <div className="bg-neutral-50 p-5 rounded-2xl border border-black/10 space-y-4">
                          <div className="flex items-center gap-2 text-neutral-800 font-bold text-sm mb-2"><Shield size={16}/> Dados de Login</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div><label className="mb-1 block text-xs font-medium text-neutral-500">E-mail de Acesso</label><div className="relative"><Mail className="absolute left-3 top-3.5 text-neutral-400" size={18}/><input value={profForm.email} onChange={e => setProfForm({...profForm, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white border border-black/10 rounded-xl outline-none outline-none focus:border-neutral-400 font-medium text-neutral-700 placeholder:text-neutral-300" placeholder="email@clinica.com"/></div></div>
                              <div><label className="mb-1 block text-xs font-medium text-neutral-500">Senha {editandoProf && '(Opcional)'}</label><div className="relative"><Lock className="absolute left-3 top-3.5 text-neutral-400" size={18}/><input type="password" value={profForm.senha} onChange={e => setProfForm({...profForm, senha: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white border border-black/10 rounded-xl outline-none outline-none focus:border-neutral-400 font-medium text-neutral-700 placeholder:text-neutral-300" placeholder={editandoProf ? "Manter atual" : "Criar senha"}/></div></div>
                          </div>
                      </div>
                      <div className="space-y-4">
                          <h4 className="text-sm font-bold text-neutral-800 border-b border-neutral-100 pb-2">Dados do Profissional</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="md:col-span-2"><label className="mb-1 block text-xs font-medium text-neutral-500">Nome Completo</label><div className="relative"><User className="absolute left-3 top-3.5 text-neutral-300" size={18}/><input value={profForm.nome} onChange={e => setProfForm({...profForm, nome: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none outline-none focus:border-neutral-400 font-bold text-neutral-700" placeholder="Dr. Nome Sobrenome"/></div></div>
                              <div><label className="mb-1 block text-xs font-medium text-neutral-500">CPF</label><input value={profForm.cpf} onChange={e => setProfForm({...profForm, cpf: e.target.value})} className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="000.000.000-00"/></div>
                              <div><label className="mb-1 block text-xs font-medium text-neutral-500">Sexo</label><CustomSelect value={profForm.sexo} onChange={v => setProfForm({...profForm, sexo: v})} options={[{value:'Masculino',label:'Masculino'},{value:'Feminino',label:'Feminino'},{value:'Outro',label:'Outro'}]} placeholder="Selecione..." size="lg"/></div>
                              <div><label className="mb-1 block text-xs font-medium text-neutral-500">Contato / Telefone</label><div className="relative"><Phone className="absolute left-3 top-3.5 text-neutral-300" size={18}/><input value={profForm.telefone} onChange={e => setProfForm({...profForm, telefone: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none outline-none focus:border-neutral-400 font-medium text-neutral-700" placeholder="(00) 00000-0000"/></div></div>
                              <div><label className="mb-1 block text-xs font-medium text-neutral-500">Cargo</label><input value={profForm.cargo} onChange={e => setProfForm({...profForm, cargo: e.target.value})} className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Ex: Ortodontista"/></div>
                          </div>
                          <div className="md:col-span-2"><label className="mb-1 block text-xs font-medium text-neutral-500">Endereço</label><input value={profForm.endereco} onChange={e => setProfForm({...profForm, endereco: e.target.value})} className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Rua, Número, Bairro..."/></div>
                          <div className="grid grid-cols-3 gap-3 bg-neutral-50 p-3 rounded-xl border border-neutral-100"><div className="col-span-1"><label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Conselho</label><CustomSelect value={profForm.conselho} onChange={v => setProfForm({...profForm, conselho: v})} options={[{value:'CRO',label:'CRO'},{value:'CRM',label:'CRM'},{value:'Outro',label:'Outro'}]} size="sm"/></div><div className="col-span-1"><label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">UF</label><input value={profForm.uf} onChange={e => setProfForm({...profForm, uf: e.target.value})} className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg outline-none text-sm font-medium" placeholder="UF"/></div><div className="col-span-1"><label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Nº Conselho</label><input value={profForm.cro} onChange={e => setProfForm({...profForm, cro: e.target.value})} className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg outline-none text-sm font-medium" placeholder="12345"/></div></div>
                      </div>
                      <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 flex flex-col md:flex-row justify-between items-center gap-4">
                          <div className="flex items-center gap-3"><div className={`p-3 rounded-xl ${profForm.nivel_acesso === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-white border border-neutral-200 text-neutral-400'}`}><Shield size={24}/></div><div><h4 className="font-bold text-neutral-800 text-sm">Nível de Permissão</h4><p className="text-xs text-neutral-500">Admins podem editar financeiro e ajustes.</p></div></div>
                          <div className="flex bg-white p-1 rounded-xl border border-neutral-200 shadow-sm"><button onClick={() => setProfForm({...profForm, nivel_acesso: 'comum'})} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${profForm.nivel_acesso === 'comum' ? 'bg-neutral-800 text-white shadow' : 'text-neutral-500 hover:bg-neutral-50'}`}>Comum</button><button onClick={() => setProfForm({...profForm, nivel_acesso: 'admin'})} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${profForm.nivel_acesso === 'admin' ? 'bg-purple-600 text-white shadow' : 'text-neutral-500 hover:bg-neutral-50'}`}>Admin</button></div>
                      </div>
                  </div>
                  <div className="p-6 border-t border-neutral-100 bg-neutral-50 flex gap-3 rounded-b-3xl flex-none"><button onClick={() => setModalProf(false)} className="flex-1 py-4 text-neutral-500 font-bold hover:bg-neutral-200 rounded-xl transition-colors">Cancelar</button><button onClick={salvarProfissional} disabled={salvandoProf} className={`${bentoPrimaryBtn} flex-1 py-4 active:scale-95`}>{salvandoProf ? <Loader2 className="animate-spin"/> : <><Save size={18}/> Salvar Acesso</>}</button></div>
              </div>
      </Modal>

      {/* MODAL VINCULOS */}
      <Modal open={modalVinculo && !!profSelecionado} onClose={() => setModalVinculo(false)} maxWidth="md" hideCloseButton>
          {profSelecionado && (
              <div className="bg-white p-6 rounded-2xl w-full shadow-2xl animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6"><div><h3 className="font-bold text-lg">Onde {profSelecionado.nome.split(' ')[0]} atende?</h3><p className="text-xs text-neutral-400">Marque as clínicas permitidas.</p></div><button onClick={() => setModalVinculo(false)} className="p-2 hover:bg-neutral-100 rounded-full"><X size={20}/></button></div>
                  <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                      {clinicas.map(c => {
                          const ativo = vinculosDoProf.includes(c.id);
                          return (
                              <button key={c.id} onClick={() => toggleVinculo(c.id)} className={`flex w-full items-center justify-between rounded-xl p-4 ${bentoChipOutline(ativo)}`}><span className={`font-bold ${ativo ? 'text-neutral-900' : 'text-neutral-600'}`}>{c.nome}</span><div className={`flex h-6 w-6 items-center justify-center rounded-full border ${ativo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>{ativo && <Check size={14}/>}</div></button>
                          );
                      })}
                  </div>
                  <button onClick={() => setModalVinculo(false)} className="w-full py-3 bg-neutral-900 text-white font-bold rounded-xl">Concluir</button>
              </div>
          )}
      </Modal>

      {/* MODAL EDIÇÃO COMPLETA CLÍNICA */}
      <Modal open={modalClinicaCompleto} onClose={() => { setModalClinicaCompleto(false); setClinicaEditando(null); limparLogoLocal(); }} maxWidth="4xl" hideCloseButton panelClassName="overflow-visible rounded-xl border border-neutral-200 bg-white">
          <div className="px-5 py-4 sm:px-6 sm:py-5">
              <div className="mb-5 flex items-center justify-between gap-4 border-b border-black/5 pb-4">
                  <div className="flex min-w-0 items-center gap-3.5">
                      <label className="relative h-16 w-16 shrink-0 cursor-pointer">
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={escolherLogo} />
                          <span className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-[#f8f8f6] text-neutral-500 ${logoPreview ? 'border-neutral-900' : 'border-black/10'}`}>
                              {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-cover" /> : <Building2 size={22} />}
                          </span>
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white">
                              {uploadingLogo ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                          </span>
                      </label>
                      <div className="min-w-0">
                          <h3 className="text-lg font-semibold text-neutral-900">{clinicaEditando ? 'Editar clínica' : 'Nova clínica'}</h3>
                          <p className="mt-0.5 text-xs font-medium text-neutral-400">Logo opcional. JPG, PNG ou WebP, até 2 MB.</p>
                      </div>
                  </div>
                  <button type="button" onClick={() => { setModalClinicaCompleto(false); setClinicaEditando(null); limparLogoLocal(); }} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" aria-label="Fechar"><X size={18}/></button>
              </div>

              <section>
                  <h4 className="mb-3 text-sm font-semibold text-neutral-900">Identificação</h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4">
                      <label className="min-w-0 lg:col-span-2"><span className={labelModal}>Nome <span className="text-red-500">*</span></span><input value={clinicaForm.nome} onChange={e => setClinicaForm({...clinicaForm, nome: e.target.value})} className={campoModal} placeholder="Nome da clínica"/></label>
                      <label className="min-w-0"><span className={labelModal}>CNPJ</span><input value={clinicaForm.cnpj} onChange={e => setClinicaForm({...clinicaForm, cnpj: e.target.value})} className={campoModal} placeholder="00.000.000/0000-00"/></label>
                      <label className="min-w-0"><span className={labelModal}>Responsável</span><input value={clinicaForm.responsavel_nome} onChange={e => setClinicaForm({...clinicaForm, responsavel_nome: e.target.value})} className={campoModal} placeholder="Responsável técnico"/></label>
                      <label className="min-w-0"><span className={labelModal}>E-mail</span><input value={clinicaForm.email} onChange={e => setClinicaForm({...clinicaForm, email: e.target.value})} className={campoModal} placeholder="clinica@email.com"/></label>
                      <label className="min-w-0"><span className={labelModal}>Telefone</span><input value={clinicaForm.telefone} onChange={e => setClinicaForm({...clinicaForm, telefone: e.target.value})} className={campoModal} placeholder="(00) 0000-0000"/></label>
                      <label className="min-w-0"><span className={labelModal}>Início</span><input type="time" value={clinicaForm.horario_inicio} onChange={e => setClinicaForm({...clinicaForm, horario_inicio: e.target.value})} className={campoModal}/></label>
                      <label className="min-w-0"><span className={labelModal}>Término</span><input type="time" value={clinicaForm.horario_fim} onChange={e => setClinicaForm({...clinicaForm, horario_fim: e.target.value})} className={campoModal}/></label>
                      <label className="min-w-0"><span className={labelModal}>Fuso</span><CustomSelect value={clinicaForm.fuso_horario} onChange={v => setClinicaForm({...clinicaForm, fuso_horario: v})} options={FUSO_HORARIO_OPTIONS} size="md"/></label>
                      <div className="min-w-0 lg:col-span-2">
                          <span className={labelModal}>Notas fiscais em nome de</span>
                          <div className="grid h-10 grid-cols-2 rounded-md border border-neutral-200 p-0.5">
                              <button type="button" onClick={() => setClinicaForm({...clinicaForm, emitir_notas_em_nome: 'clinica'})} className={`rounded-[5px] text-sm font-medium ${clinicaForm.emitir_notas_em_nome === 'clinica' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Clínica</button>
                              <button type="button" onClick={() => setClinicaForm({...clinicaForm, emitir_notas_em_nome: 'profissional'})} className={`rounded-[5px] text-sm font-medium ${clinicaForm.emitir_notas_em_nome === 'profissional' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Profissional</button>
                          </div>
                      </div>
                  </div>
              </section>

              <section className="mt-5 border-t border-black/5 pt-4">
                  <h4 className="mb-3 text-sm font-semibold text-neutral-900">Endereço</h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4">
                      <label className="min-w-0">
                          <span className={labelModal}>CEP {buscandoCepClinica && <Loader2 size={12} className="ml-1 inline animate-spin" />}</span>
                          <input value={clinicaForm.cep} onChange={e => { setClinicaForm({...clinicaForm, cep: e.target.value}); if (e.target.value.replace(/\D/g, '').length === 8) buscarCepClinica(e.target.value); }} onBlur={() => buscarCepClinica(clinicaForm.cep)} className={campoModal} placeholder="00000-000"/>
                      </label>
                      <label className="min-w-0"><span className={labelModal}>Rua / avenida</span><input value={clinicaForm.rua} onChange={e => setClinicaForm({...clinicaForm, rua: e.target.value})} className={campoModal} placeholder="Rua / Avenida"/></label>
                      <label className="min-w-0"><span className={labelModal}>Número</span><input value={clinicaForm.numero} onChange={e => setClinicaForm({...clinicaForm, numero: e.target.value})} className={campoModal} placeholder="Nº"/></label>
                      <label className="min-w-0"><span className={labelModal}>Complemento</span><input value={clinicaForm.complemento} onChange={e => setClinicaForm({...clinicaForm, complemento: e.target.value})} className={campoModal} placeholder="Apto, bloco, sala"/></label>
                      <label className="min-w-0"><span className={labelModal}>Bairro</span><input value={clinicaForm.bairro} onChange={e => setClinicaForm({...clinicaForm, bairro: e.target.value})} className={campoModal} placeholder="Bairro"/></label>
                      <label className="min-w-0"><span className={labelModal}>Cidade</span><input value={clinicaForm.cidade} onChange={e => setClinicaForm({...clinicaForm, cidade: e.target.value})} className={campoModal} placeholder="Cidade"/></label>
                      <label className="min-w-0"><span className={labelModal}>UF</span><CustomSelect value={clinicaForm.uf || ''} onChange={v => setClinicaForm({...clinicaForm, uf: v})} options={UF_OPTIONS} size="md"/></label>
                  </div>
              </section>

              <div className="mt-5 flex justify-end border-t border-black/5 pt-4">
                  <button type="button" onClick={salvarClinicaCompleta} className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800">
                      <Save size={15}/> {clinicaEditando ? 'Salvar' : 'Cadastrar'}
                  </button>
              </div>
          </div>
      </Modal>

    </>
  );
}