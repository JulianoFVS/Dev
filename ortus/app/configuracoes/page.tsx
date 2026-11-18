'use client';
import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { dados as tabelas, usuarioDaSessao } from '@/lib/local/consulta';
import { enviarArquivoClinica } from '@/lib/armazenamento';
import { Building2, Plus, Trash2, Check, X, Loader2, Edit, Save, ClipboardList, HelpCircle, FileSignature, Tag, SlidersHorizontal, Database, Download, RotateCcw, AlertTriangle, MessageCircle, CreditCard, Search, LayoutGrid, List, ChevronDown, ChevronRight, Camera, Copy } from 'lucide-react';
import { salvarModelosAsync, novoIdModelo, novoIdPergunta, MODELOS_PADRAO, type ModeloAnamnese, type PerguntaAnamnese, type TipoPergunta } from '@/lib/anamnese';
import { listarBackups, criarBackupAgora, baixarBackupComoJson, excluirBackup as deletarBackupServer, restaurarBackup } from '@/lib/backup';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import { carregarConfigComErro, salvarConfig, mensagemErroConfig } from '@/lib/configClinica';
import {
  CATEGORIAS_FINANCEIRAS_PADRAO,
  TEMPLATES_COMUNICACAO_PADRAO,
  TAXAS_MAQUININHA_PADRAO,
  normalizarCategoriasFinanceiras,
  proximaCorCategoria,
  normalizarTaxasMaquininha,
  type CategoriaFinanceira,
  type TemplateComunicacao,
  type TaxaMaquininha,
} from '@/lib/configDefaults';
import CustomSelect from '@/components/ui/CustomSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Switch from '@/components/ui/Switch';
import MenuPontos from '@/components/ui/MenuPontos';
import DocumentoVariavelEditor, { type DocumentoVariavelEditorHandle } from '@/components/forms/DocumentoVariavelEditor';
import Modal from '@/components/ui/Modal';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { DOCUMENTO_VARIAVEIS, inserirTokenVariavel, tokenVariavelLabel, aplicarVariaveisDocumento, buildDocumentoContexto } from '@/lib/documentVariables';
import { applyTheme, THEME_OPTIONS, type ThemeId } from '@/lib/themePresets';
import { FUSO_HORARIO_OPTIONS, UF_OPTIONS } from '@/lib/formOptions';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { baixarTabelaTratamentos } from '@/lib/exportarTratamentos';
import { readProfileSession } from '@/lib/profileSession';

const cardShell = 'rounded-xl bg-white';

const CONFIG_NAVS = [
  { key: 'geral', label: 'Geral', icon: SlidersHorizontal },
  { key: 'clinicas', label: 'Clínicas', icon: Building2 },
  { key: 'anamnese', label: 'Anamnese', icon: ClipboardList },
  { key: 'documentos', label: 'Docs', icon: FileSignature },
  { key: 'categorias', label: 'Categorias', icon: Tag },
  { key: 'taxas', label: 'Taxas', icon: CreditCard },
  { key: 'comunicacao', label: 'Comunicação', icon: MessageCircle },
  { key: 'backup', label: 'Backup', icon: Database },
];
// Abaixo de lg a página rola inteira; a seção só ganha altura fixa e rolagem interna no computador.
const sectionPad = 'flex flex-col p-3 lg:h-full lg:min-h-0 lg:overflow-hidden';
const campoLabel = 'mb-1.5 block text-xs font-medium text-neutral-500 sm:mb-1';
const campoInput = 'h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-500 sm:h-9';
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

const botaoPontos = 'flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900';
// Ação solta ao lado do cartão no celular (excluir, duplicar): 40px de toque.
const botaoCartao = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 active:bg-neutral-100 active:text-neutral-900';

/**
 * Cartão das listas no celular: tocar abre o item para editar; o que sobra (excluir, duplicar, ligar)
 * fica em botões próprios à direita. Não usa menu de três pontos porque, perto do fim da tela,
 * ele abre por baixo da barra flutuante de navegação.
 */
function CartaoCelular({ onAbrir, acoes, apagado = false, children }: {
  /** Sem `onAbrir` o cartão só mostra: a pessoa não pode alterar o item. */
  onAbrir?: () => void;
  acoes?: ReactNode;
  apagado?: boolean;
  children: ReactNode;
}) {
  const miolo = `flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-2.5 text-left ${apagado ? 'opacity-50' : ''}`;
  return (
    <div className="flex items-stretch rounded-xl border border-neutral-200 bg-white">
      {onAbrir ? (
        <button type="button" onClick={onAbrir} className={`${miolo} active:bg-neutral-50`}>
          {children}
          <ChevronRight size={16} className="ml-auto shrink-0 text-neutral-300" aria-hidden />
        </button>
      ) : (
        <div className={miolo}>{children}</div>
      )}
      {acoes ? <div className="flex shrink-0 items-center pr-1">{acoes}</div> : null}
    </div>
  );
}

// Chaves de configuracoes_clinica que esta tela lê e grava, sempre da clínica ativa.
type SecaoConfig = 'preferencias' | 'categorias_financeiro' | 'modelos_documentos' | 'templates_comunicacao' | 'taxas_maquininha' | 'anamnese_modelos';
type EstadoCarga = 'carregando' | 'pronto' | 'erro';
const CARGA_INICIAL: Record<SecaoConfig, EstadoCarga> = {
  preferencias: 'carregando',
  categorias_financeiro: 'carregando',
  modelos_documentos: 'carregando',
  templates_comunicacao: 'carregando',
  taxas_maquininha: 'carregando',
  anamnese_modelos: 'carregando',
};
const SECAO_DA_ABA: Record<string, SecaoConfig> = {
  geral: 'preferencias',
  anamnese: 'anamnese_modelos',
  documentos: 'modelos_documentos',
  categorias: 'categorias_financeiro',
  taxas: 'taxas_maquininha',
  comunicacao: 'templates_comunicacao',
};
const NOME_DA_SECAO: Record<SecaoConfig, string> = {
  preferencias: 'preferências',
  categorias_financeiro: 'categorias financeiras',
  modelos_documentos: 'modelos de documentos',
  templates_comunicacao: 'modelos de mensagem',
  taxas_maquininha: 'taxas',
  anamnese_modelos: 'modelos de anamnese',
};

// O formulário parte da linha do banco, nunca do item da lista da casca (que só traz id, nome e rede):
// montado da lista, o Salvar apagava e-mail, telefone, CNPJ, logo, horários e fuso.
const COLUNAS_FORM_CLINICA = 'id, nome, cnpj, responsavel_nome, email, telefone, horario_inicio, horario_fim, fuso_horario, emitir_notas_em_nome, logo_url, cep, rua, numero, complemento, bairro, cidade, uf';
const ERRO_SEM_PERMISSAO_CLINICA = 'Você não pode alterar esta clínica.';

/** Data local para o nome do arquivo: em UTC, depois das 21h já seria o dia seguinte. */
function dataDoArquivo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Texto de erro que pode ir para a tela: o modo de consulta e as regras escritas para pessoas
 * (gatilhos do banco, avisos do armazenamento do Ortus). Texto técnico do banco, da rede ou do
 * armazenamento (em inglês, com nome de tabela ou de regra) vira a frase da própria tela.
 */
function fraseDoErro(err: unknown, padrao: string): string {
  const { message, code } = (err && typeof err === 'object' ? err : {}) as { message?: unknown; code?: unknown };
  const texto = typeof message === 'string' ? message.trim() : '';
  if (code === 'PT402' || /^Assinatura suspensa/i.test(texto)) return texto || padrao;
  if (err instanceof TypeError || /failed to fetch|network ?error|load failed|fetch failed/i.test(texto)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (/jwt|refresh token/i.test(texto)) return 'Sua sessão expirou. Entre de novo para continuar.';
  const tecnico = !texto || /violates|constraint|syntax|row-level|permission denied|duplicate key|null value|relation|column|policy|[{}"]|\b(the|is|not|of|too|was|has|invalid)\b/i.test(texto);
  if (!tecnico) return texto;
  return code === '42501' ? 'Você não tem permissão para fazer isso nesta clínica.' : padrao;
}

// ===== IMPORTAÇÃO DE CONFIGURAÇÕES =====
// O arquivo é conferido inteiro antes de gravar: configuração fora do formato, uma vez gravada na
// clínica, derruba esta tela e o Financeiro. Por isso é tudo ou nada.
const TAMANHO_MAX_IMPORTACAO = 2 * 1024 * 1024;

type Registro = Record<string, unknown>;

type ConfigImportada = {
  preferencias?: typeof PREFS_PADRAO;
  categorias_financeiro?: CategoriaFinanceira[];
  templates_comunicacao?: TemplateComunicacao[];
  taxas_maquininha?: TaxaMaquininha[];
  modelos_anamnese?: ModeloAnamnese[];
  modelos_documentos?: ModeloDocumento[];
};

function ehRegistro(v: unknown): v is Registro {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Lê a lista inteira ou nada: um item fora do formato invalida a seção. */
function lerLista<T>(v: unknown, lerItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null;
  const itens: T[] = [];
  for (const bruto of v) {
    const item = lerItem(bruto);
    if (item === null) return null;
    itens.push(item);
  }
  return itens;
}

/** Só entram as chaves que a tela conhece e com o tipo do padrão; o que faltar fica no padrão. */
function lerChaves<T extends Record<string, string | number | boolean>>(origem: Registro, padrao: T): T {
  const saida: Record<string, string | number | boolean> = { ...padrao };
  for (const chave of Object.keys(padrao)) {
    const valor = origem[chave];
    if (typeof valor === typeof padrao[chave]) saida[chave] = valor as string | number | boolean;
  }
  return saida as T;
}

function lerPreferencias(v: unknown): typeof PREFS_PADRAO | null {
  if (!ehRegistro(v)) return null;
  const dias = v.dias_atendimento ?? {};
  if (!ehRegistro(dias)) return null;
  const { dias_atendimento: diasPadrao, ...simplesPadrao } = PREFS_PADRAO;
  return { ...lerChaves(v, simplesPadrao), dias_atendimento: lerChaves(dias, diasPadrao) };
}

function lerCategoria(v: unknown): CategoriaFinanceira | null {
  if (!ehRegistro(v)) return null;
  const { id, nome, tipo, cor, ativo } = v;
  if (typeof id !== 'string' || !id || typeof nome !== 'string' || !nome.trim()) return null;
  if (tipo !== 'receita' && tipo !== 'despesa') return null;
  return { id, nome: nome.trim(), tipo, cor: typeof cor === 'string' && /^#[0-9a-f]{6}$/i.test(cor) ? cor : '#64748b', ativo: ativo !== false };
}

function lerTemplate(v: unknown): TemplateComunicacao | null {
  if (!ehRegistro(v)) return null;
  const { id, canal, nome, assunto, corpo, ativo } = v;
  if (typeof id !== 'string' || !id || typeof nome !== 'string' || typeof corpo !== 'string') return null;
  if (canal !== 'whatsapp' && canal !== 'email' && canal !== 'sms') return null;
  return { id, canal, nome, ...(typeof assunto === 'string' ? { assunto } : {}), corpo, ativo: ativo !== false };
}

function lerTaxa(v: unknown): TaxaMaquininha | null {
  if (!ehRegistro(v)) return null;
  const { id, nome, bandeira, tipo, parcela, taxa_percentual: taxa, prazo_recebimento_dias: prazo, ativo } = v;
  if (typeof id !== 'string' || !id || typeof nome !== 'string' || typeof bandeira !== 'string') return null;
  if (tipo !== 'debito' && tipo !== 'credito_vista' && tipo !== 'credito_parcelado' && tipo !== 'pix') return null;
  if (typeof taxa !== 'number' || taxa < 0 || taxa > 100 || typeof prazo !== 'number' || prazo < 0) return null;
  if (parcela != null && (typeof parcela !== 'number' || parcela < 1)) return null;
  return { id, nome, bandeira, tipo, ...(typeof parcela === 'number' ? { parcela } : {}), taxa_percentual: taxa, prazo_recebimento_dias: prazo, ativo: ativo !== false };
}

function lerPergunta(v: unknown): PerguntaAnamnese | null {
  if (!ehRegistro(v)) return null;
  const { id, label, tipo, opcoes } = v;
  if (typeof id !== 'string' || !id || typeof label !== 'string') return null;
  if (tipo !== 'texto' && tipo !== 'sim_nao' && tipo !== 'sim_nao_texto' && tipo !== 'multipla') return null;
  if (opcoes == null) return { id, label, tipo };
  const lista = lerLista(opcoes, (opcao) => (typeof opcao === 'string' ? opcao : null));
  return lista ? { id, label, tipo, opcoes: lista } : null;
}

function lerModeloAnamnese(v: unknown): ModeloAnamnese | null {
  if (!ehRegistro(v)) return null;
  const { id, nome, descricao, padrao } = v;
  if (typeof id !== 'string' || !id || typeof nome !== 'string' || !nome.trim()) return null;
  const perguntas = lerLista(v.perguntas, lerPergunta);
  if (!perguntas || perguntas.length === 0) return null;
  return { id, nome, ...(typeof descricao === 'string' ? { descricao } : {}), perguntas, ...(padrao === true ? { padrao: true } : {}) };
}

function lerModeloDocumento(v: unknown): ModeloDocumento | null {
  if (!ehRegistro(v)) return null;
  const { id, tipo, nome, conteudo } = v;
  if (typeof id !== 'string' || !id || typeof nome !== 'string' || typeof conteudo !== 'string') return null;
  if (tipo !== 'contrato' && tipo !== 'receita' && tipo !== 'atestado' && tipo !== 'outro') return null;
  return { id, tipo, nome, conteudo };
}

function lerConfigImportada(conteudo: unknown): { config: ConfigImportada; partes: string[] } | { erro: string } {
  if (!ehRegistro(conteudo)) return { erro: 'O conteúdo precisa ser um objeto de configurações do Ortus, não uma lista nem um valor solto.' };
  const config: ConfigImportada = {};
  const partes: string[] = [];
  const foraDoFormato = (parte: string) => ({ erro: `A parte de ${parte} do arquivo não está no formato do Ortus.` });

  if (conteudo.preferencias !== undefined) {
    const lido = lerPreferencias(conteudo.preferencias);
    if (!lido) return foraDoFormato('preferências');
    config.preferencias = lido;
    partes.push('preferências');
  }
  if (conteudo.categorias_financeiro !== undefined) {
    const lido = lerLista(conteudo.categorias_financeiro, lerCategoria);
    if (!lido) return foraDoFormato('categorias financeiras');
    if (lido.length) { config.categorias_financeiro = lido; partes.push('categorias financeiras'); }
  }
  if (conteudo.templates_comunicacao !== undefined) {
    const lido = lerLista(conteudo.templates_comunicacao, lerTemplate);
    if (!lido) return foraDoFormato('modelos de mensagem');
    if (lido.length) { config.templates_comunicacao = lido; partes.push('modelos de mensagem'); }
  }
  if (conteudo.taxas_maquininha !== undefined) {
    const lido = lerLista(conteudo.taxas_maquininha, lerTaxa);
    if (!lido) return foraDoFormato('taxas');
    if (lido.length) { config.taxas_maquininha = lido; partes.push('taxas'); }
  }
  if (conteudo.modelos_anamnese !== undefined) {
    const lido = lerLista(conteudo.modelos_anamnese, lerModeloAnamnese);
    if (!lido) return foraDoFormato('modelos de anamnese');
    if (lido.length) { config.modelos_anamnese = lido; partes.push('modelos de anamnese'); }
  }
  if (conteudo.modelos_documentos !== undefined) {
    const lido = lerLista(conteudo.modelos_documentos, lerModeloDocumento);
    if (!lido) return foraDoFormato('modelos de documentos');
    if (lido.length) { config.modelos_documentos = lido; partes.push('modelos de documentos'); }
  }
  if (partes.length === 0) return { erro: 'O arquivo não traz nenhuma configuração do Ortus.' };
  return { config, partes };
}

export default function Configuracoes() {
  const router = useRouter();
  const { clinics: ctxClinics, loading: clinicLoading, activeClinic, convidadoAqui, refreshClinics } = useClinica();
  // Tudo nesta tela (cargas, gravações, prévia, importação) é da clínica ativa. Em "Todas as clínicas" não há uma só.
  const clinicaAtivaId = activeClinic && activeClinic.id !== 'all' ? String(activeClinic.id) : null;
  const jaCarregou = useRef(bootClinicasFromStorage().length > 0);
  const [abaAtiva, setAbaAtiva] = useState('geral');
  const [loading, setLoading] = useState(() => bootClinicasFromStorage().length === 0);
  const { showAlert, showConfirm } = useCustomAlert();

  const [clinicas, setClinicas] = useState<any[]>(() => bootClinicasFromStorage());
  
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
  const [carregandoClinica, setCarregandoClinica] = useState(false);
  const pedidoClinica = useRef(0);
  // O ref trava o segundo toque antes de o estado chegar à tela: dois toques gravavam duas clínicas.
  const [salvandoClinica, setSalvandoClinica] = useState(false);
  const salvandoClinicaRef = useRef(false);

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
  // Só o dono da plataforma cria, restaura e apaga backups; o banco recusa os demais.
  // null = ainda não confirmado no banco. O cache só serve para negar cedo, nunca para liberar.
  const [donoPlataforma, setDonoPlataforma] = useState<boolean | null>(() => (readProfileSession()?.is_super_admin === false ? false : null));
  const donoConferido = useRef(false);
  const [abaTaxas, setAbaTaxas] = useState<'pix' | 'visa' | 'elo'>('pix');
  const navRef = useRef<HTMLElement>(null);

  // PERMISSÃO E CARGA
  // Nível de acesso: vem do perfil guardado e é confirmado no banco (null = ainda não se sabe).
  const [nivelAdmin, setNivelAdmin] = useState<boolean | null>(() => {
      const nivel = readProfileSession()?.nivel_acesso;
      return nivel ? nivel === 'admin' : null;
  });
  // Mesma regra do banco (user_is_clinic_admin): dono da plataforma, ou administrador com vínculo
  // próprio (não convidado) na unidade ativa. O banco é quem barra de verdade; isto só alinha a tela.
  const podeEditar = !!clinicaAtivaId && (donoPlataforma === true || (nivelAdmin === true && !convidadoAqui));
  const somenteLeitura = !podeEditar;
  const podeEditarRef = useRef(podeEditar);
  podeEditarRef.current = podeEditar;
  // Cada seção só aceita gravação depois que o banco devolveu o valor da clínica ativa: antes disso
  // a tela tem o padrão, e gravar o objeto inteiro apagava a configuração da clínica.
  const [carga, setCarga] = useState<Record<SecaoConfig, EstadoCarga>>(CARGA_INICIAL);
  // Unidade dona dos valores na tela: resposta que chega depois de trocar de unidade é descartada.
  const clinicaDaTela = useRef<string | null>(null);
  // Por seção: número da última gravação pedida e o último valor que o banco confirmou (para desfazer).
  const gravacoes = useRef<Partial<Record<SecaoConfig, { pedida: number; confirmada: number; valor: unknown }>>>({});
  const avisoGravacaoAberto = useRef(false);
  const [salvandoPopup, setSalvandoPopup] = useState(false);
  const [dadosClinicaAtiva, setDadosClinicaAtiva] = useState<{ nome?: string | null; cnpj?: string | null; telefone?: string | null; rua?: string | null; numero?: string | null; cidade?: string | null } | null>(null);

  useEffect(() => {
      if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const aba = params.get('aba');
          if (aba && ['equipe', 'permissoes', 'comissoes'].includes(aba)) {
              router.replace('/ajustes/equipe');
              return;
          }
          // Aba desconhecida no endereço deixava o painel em branco.
          if (aba && CONFIG_NAVS.some((secao) => secao.key === aba)) setAbaAtiva(aba);
      }
      if (clinicLoading) return;
      carregarDados({ silent: ctxClinics.length > 0 || bootClinicasFromStorage().length > 0 });
  }, [router, clinicLoading, ctxClinics.length]);

  // A lista de backups só existe para o dono: para os demais o banco devolve vazio.
  useEffect(() => {
      if (donoPlataforma) recarregarBackups();
  }, [donoPlataforma]);

  // No celular a faixa de abas rola para o lado: traz a aba ativa para dentro dela sem mexer na rolagem da página.
  useEffect(() => {
      const nav = navRef.current;
      const botao = nav?.querySelector<HTMLElement>('[data-ativa="true"]');
      if (!nav || !botao) return;
      const alvo = nav.scrollLeft + botao.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - botao.offsetWidth) / 2;
      nav.scrollTo({ left: Math.max(0, alvo), behavior: 'smooth' });
  }, [abaAtiva, loading]);

  useEffect(() => {
      if (ctxClinics.length > 0) setClinicas(ctxClinics);
  }, [ctxClinics]);

  // Configurações da clínica ativa, só do banco (o localStorage pode ser de outra pessoa ou unidade).
  // Recarrega ao trocar de unidade; até a resposta, a seção fica em "carregando" e não aceita gravação.
  useEffect(() => {
      clinicaDaTela.current = clinicaAtivaId;
      setCarga(CARGA_INICIAL);
      setModelos([]);
      setDadosClinicaAtiva(null);
      if (!clinicaAtivaId) return;
      const cid = clinicaAtivaId;
      let vigente = true;
      const carregar = <T,>(secao: SecaoConfig, padrao: T, aplicar: (valor: T) => unknown) => {
          carregarConfigComErro<T>(cid, secao, padrao)
              .then((bruto) => {
                  if (!vigente) return;
                  const valor = aplicar(bruto);
                  const pedida = gravacoes.current[secao]?.pedida ?? 0;
                  gravacoes.current[secao] = { pedida, confirmada: pedida, valor };
                  setCarga((atual) => ({ ...atual, [secao]: 'pronto' }));
              })
              .catch(() => { if (vigente) setCarga((atual) => ({ ...atual, [secao]: 'erro' })); });
      };
      carregar('preferencias', PREFS_PADRAO, (p) => { const v = { ...PREFS_PADRAO, ...(p || {}) }; setPrefs(v); return v; });
      carregar<unknown>('categorias_financeiro', CATEGORIAS_FINANCEIRAS_PADRAO, (c) => { const v = normalizarCategoriasFinanceiras(c); setCatsFin(v); return v; });
      carregar<ModeloDocumento[]>('modelos_documentos', DOCS_PADRAO, (d) => { const v = Array.isArray(d) && d.length ? d : DOCS_PADRAO; setDocs(v); return v; });
      carregar<TemplateComunicacao[]>('templates_comunicacao', TEMPLATES_COMUNICACAO_PADRAO, (t) => { const v = Array.isArray(t) && t.length ? t : TEMPLATES_COMUNICACAO_PADRAO; setTemplatesComunicacao(v); return v; });
      carregar<unknown>('taxas_maquininha', TAXAS_MAQUININHA_PADRAO, (t) => {
          const norm = normalizarTaxasMaquininha(t);
          setTaxasMaquininha(norm);
          // Formato antigo vira o atual no banco em segundo plano, e só para quem administra a unidade.
          if (JSON.stringify(t) !== JSON.stringify(norm) && podeEditarRef.current) salvarConfig(cid, 'taxas_maquininha', norm).catch(() => {});
          return norm;
      });
      carregar<ModeloAnamnese[]>('anamnese_modelos', MODELOS_PADRAO, (m) => { const v = Array.isArray(m) && m.length ? m : MODELOS_PADRAO; setModelos(v); return v; });
      // Dados da unidade para a prévia dos documentos.
      tabelas.from('clinicas').select('nome, cnpj, telefone, rua, numero, cidade').eq('id', cid).maybeSingle()
          .then(({ data }) => { if (vigente && data) setDadosClinicaAtiva(data); }, () => {});
      return () => { vigente = false; };
  }, [clinicaAtivaId]);

  /** Por que a seção não aceita gravação agora; null quando aceita. */
  function bloqueioDeGravacao(secao: SecaoConfig): string | null {
      if (!clinicaAtivaId) return 'Escolha no seletor uma unidade própria para alterar as configurações.';
      if (!podeEditar) return 'Você não pode alterar as configurações desta unidade. Para alterar, escolha uma unidade própria no seletor.';
      if (carga[secao] === 'carregando') return 'Espere as configurações desta unidade carregarem para alterar.';
      if (carga[secao] === 'erro') return 'As configurações desta unidade não carregaram. Recarregue a página antes de alterar.';
      return null;
  }

  /**
   * Grava uma seção na clínica ativa e lança a frase do erro. Otimista (interruptor, campo que grava a
   * cada tecla): a tela muda na hora e volta ao último valor confirmado se o banco recusar. Sem
   * otimismo (popup, exclusão, importação): a tela só muda depois que o banco aceitou.
   */
  async function gravarSecao<T>(secao: SecaoConfig, valor: T, aplicar: (v: T) => void, otimista = false): Promise<void> {
      const bloqueio = bloqueioDeGravacao(secao);
      if (bloqueio) throw new Error(bloqueio);
      const cid = clinicaAtivaId as string;
      const g = gravacoes.current[secao] ?? (gravacoes.current[secao] = { pedida: 0, confirmada: 0, valor });
      const numero = ++g.pedida;
      if (otimista) aplicar(valor);
      try {
          if (secao === 'anamnese_modelos') await salvarModelosAsync(cid, valor as ModeloAnamnese[]);
          else await salvarConfig(cid, secao, valor);
      } catch (err) {
          // Só a gravação mais recente desfaz a tela: uma resposta atrasada não apaga o que veio depois.
          if (otimista && clinicaDaTela.current === cid && numero === g.pedida) aplicar(g.valor as T);
          throw new Error(mensagemErroConfig(err));
      }
      if (clinicaDaTela.current !== cid) return;
      if (numero > g.confirmada) { g.confirmada = numero; g.valor = valor; }
      if (!otimista) aplicar(valor);
  }

  // Falha sem popup aberto (interruptor, campo, exclusão): um aviso por vez, mesmo com várias respostas seguidas.
  function avisarFalhaGravacao(err: unknown) {
      if (avisoGravacaoAberto.current) return;
      avisoGravacaoAberto.current = true;
      void showAlert(err instanceof Error ? err.message : mensagemErroConfig(err), { type: 'error' })
          .finally(() => { avisoGravacaoAberto.current = false; });
  }

  async function recarregarBackups() {
      const list = await listarBackups(50);
      setBackups(list);
  }

  async function conferirDonoPlataforma(userId: string) {
      let dono: boolean | null = null;
      try {
          const { data, error } = await tabelas.from('profissionais')
              .select('is_super_admin, nivel_acesso')
              .eq('user_id', userId)
              .maybeSingle();
          if (!error) {
              dono = data?.is_super_admin === true;
              setNivelAdmin(data?.nivel_acesso === 'admin');
          }
      } catch {
          dono = null;
      }
      if (dono === null) {
          // Sem resposta do banco vale o lado seguro (a aba não oferece nada) e a próxima carga tenta de novo.
          donoConferido.current = false;
          setDonoPlataforma((atual) => atual ?? false);
          return;
      }
      setDonoPlataforma(dono);
  }

  async function backupAgoraManual() {
      setCriandoBackup(true);
      const r = await criarBackupAgora('manual', 'Backup manual via interface');
      setCriandoBackup(false);
      if (r.ok) { showAlert('Backup criado com sucesso!', { type: 'success' }); recarregarBackups(); }
      else {
          // O texto do banco fica no console para o suporte; a tela mostra a frase fixa.
          console.error('[backup] criar:', r.erro);
          showAlert(fraseDoErro({ message: r.erro }, 'Não foi possível criar o backup. Tente de novo em instantes.'), { type: 'error' });
      }
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

  // O teclado do celular costuma deixar um espaço depois da palavra; a caixa continua valendo.
  const restauracaoLiberada = confirmacaoTexto.trim() === 'RESTAURAR';

  async function confirmarRestauracao() {
      if (!modalRestaurar || !donoPlataforma) return;
      if (!restauracaoLiberada) return;
      setRestaurando(true);
      const r = await restaurarBackup(modalRestaurar.id);
      setRestaurando(false);
      if (r.ok) {
          await showAlert((r.msg || 'Backup restaurado com sucesso!') + '\nA página será recarregada.', { type: 'success', title: 'Sucesso' });
          setModalRestaurar(null);
          window.location.reload();
      } else {
          console.error('[backup] restaurar:', r.erro);
          await showAlert(fraseDoErro({ message: r.erro }, 'Não foi possível restaurar o backup. Tente de novo em instantes.'), { type: 'error', title: 'Erro' });
      }
  }

  // ===== PREFERÊNCIAS =====
  // Grava a cada mudança, como antes; se o banco recusar, a tela (e a cor do tema) volta ao que estava salvo.
  function aplicarPrefs(p: typeof PREFS_PADRAO) { setPrefs(p); applyTheme(p.cor_tema as ThemeId); }
  function atualizarPref(k: string, v: any) { void gravarSecao('preferencias', { ...prefs, [k]: v }, aplicarPrefs, true).catch(avisarFalhaGravacao); }
  function toggleDia(d: string) { const dias = { ...prefs.dias_atendimento, [d]: !prefs.dias_atendimento[d] }; atualizarPref('dias_atendimento', dias); }

  function persistirCategorias(lista: CategoriaFinanceira[], otimista = false) {
      return gravarSecao('categorias_financeiro', lista, setCatsFin, otimista);
  }

  function abrirNovaCatFin() {
      setCorCatAberta(false);
      setCatFinEdit({ id: `cat_${Date.now()}`, nome: '', tipo: 'despesa', cor: proximaCorCategoria(catsFin.map((c) => c.cor)), ativo: true });
      setModalCatFin(true);
  }

  function abrirEditarCatFin(cat: CategoriaFinanceira) {
      setCorCatAberta(false);
      setCatFinEdit({ ...cat });
      setModalCatFin(true);
  }

  async function salvarCatFinModal() {
      if (salvandoPopup) return;
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
      // Fecha e avisa só depois que o banco aceitou; na recusa o popup fica aberto com o que foi digitado.
      setSalvandoPopup(true);
      try {
          await persistirCategorias(novos.sort((a, b) => a.nome.localeCompare(b.nome)));
          setModalCatFin(false);
          setCatFinEdit(null);
          showAlert('Categoria salva.', { type: 'success' });
      } catch (err) {
          showAlert(err instanceof Error ? err.message : mensagemErroConfig(err), { type: 'error' });
      } finally {
          setSalvandoPopup(false);
      }
  }

  const catsFinFiltradas = useMemo(() => {
      const q = buscaCatFin.trim().toLowerCase();
      if (!q) return catsFin;
      return catsFin.filter(c => c.nome.toLowerCase().includes(q) || c.tipo.includes(q));
  }, [catsFin, buscaCatFin]);

  const totalBackups = backups.length;
  const kpiLoading = loading && !jaCarregou.current;


  async function removerCatFin(id: string) {
      const cat = catsFin.find(c => c.id === id);
      if (!cat) return;
      if (!(await showConfirm(`Excluir categoria "${cat.nome}"?`, { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      await persistirCategorias(catsFin.filter(x => x.id !== id)).catch(avisarFalhaGravacao);
  }

  function toggleCatFinAtiva(id: string) {
      void persistirCategorias(catsFin.map(c => c.id === id ? { ...c, ativo: !c.ativo } : c), true).catch(avisarFalhaGravacao);
  }

  function salvarTemplatesComunicacao(lista: TemplateComunicacao[]) {
      return gravarSecao('templates_comunicacao', lista, setTemplatesComunicacao);
  }

  // Taxas gravam a cada tecla, como antes; se o banco recusar, voltam ao que estava salvo.
  function salvarTaxas(lista: TaxaMaquininha[]) {
      void gravarSecao('taxas_maquininha', lista, setTaxasMaquininha, true).catch(avisarFalhaGravacao);
  }

  function abrirNovoTemplateCom() {
      setTemplateComEdit({ id: `tpl_${Date.now()}`, canal: 'whatsapp', nome: '', corpo: '', ativo: true });
      setModalTemplateCom(true);
  }

  function abrirEditarTemplateCom(t: TemplateComunicacao) {
      setTemplateComEdit({ ...t });
      setModalTemplateCom(true);
  }

  async function salvarTemplateComEdit() {
      if (salvandoPopup) return;
      if (!templateComEdit?.nome.trim() || !templateComEdit.corpo.trim()) {
          showAlert('Preencha nome e mensagem.', { type: 'warning' });
          return;
      }
      const idx = templatesComunicacao.findIndex(t => t.id === templateComEdit.id);
      const novos = idx >= 0
          ? templatesComunicacao.map((t, i) => i === idx ? templateComEdit : t)
          : [...templatesComunicacao, templateComEdit];
      setSalvandoPopup(true);
      try {
          await salvarTemplatesComunicacao(novos);
          setModalTemplateCom(false);
          setTemplateComEdit(null);
          showAlert('Template salvo.', { type: 'success' });
      } catch (err) {
          showAlert(err instanceof Error ? err.message : mensagemErroConfig(err), { type: 'error' });
      } finally {
          setSalvandoPopup(false);
      }
  }

  async function excluirTemplateCom(id: string) {
      if (!(await showConfirm('Excluir este template?', { title: 'Excluir', type: 'warning' }))) return;
      await salvarTemplatesComunicacao(templatesComunicacao.filter(t => t.id !== id)).catch(avisarFalhaGravacao);
  }

  // ===== MODELOS DE DOCUMENTOS =====
  function abrirNovoDoc() {
      setDocEdit({ id: 'doc_' + Date.now(), tipo: 'contrato', nome: '', conteudo: '' });
      setModalDoc(true);
  }
  function abrirEditarDoc(d: ModeloDocumento) { setDocEdit({ ...d }); setModalDoc(true); }
  async function salvarDocEdit() {
      if (!docEdit || salvandoPopup) return;
      if (!docEdit.nome.trim() || !docEdit.conteudo.trim()) { showAlert('Preencha nome e conteúdo.', { type: 'warning' }); return; }
      const idx = docs.findIndex(d => d.id === docEdit.id);
      const novos = idx >= 0 ? docs.map((d,i) => i === idx ? docEdit : d) : [...docs, docEdit];
      setSalvandoPopup(true);
      try {
          await gravarSecao('modelos_documentos', novos, setDocs);
          setModalDoc(false); setDocEdit(null);
          showAlert('Modelo salvo.', { type: 'success' });
      } catch (err) {
          showAlert(err instanceof Error ? err.message : mensagemErroConfig(err), { type: 'error' });
      } finally {
          setSalvandoPopup(false);
      }
  }
  async function excluirDoc(id: string) {
      if (!(await showConfirm('Excluir este modelo de documento?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      await gravarSecao('modelos_documentos', docs.filter(d => d.id !== id), setDocs).catch(avisarFalhaGravacao);
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
          // A prévia é da clínica ativa (antes era a primeira por nome, às vezes de outra rede).
          clinica_nome: dadosClinicaAtiva?.nome || (clinicaAtivaId ? activeClinic?.nome : undefined),
          clinica_cnpj: dadosClinicaAtiva?.cnpj || undefined,
          clinica_telefone: dadosClinicaAtiva?.telefone || undefined,
          clinica_endereco: [dadosClinicaAtiva?.rua, dadosClinicaAtiva?.numero, dadosClinicaAtiva?.cidade].filter(Boolean).join(', '),
      }),
  ) : '';

  // ===== BACKUP =====
  async function exportarPacientes() {
      const ids = (clinicas || []).map((c: any) => c.id).filter(Boolean);
      let query = tabelas.from('pacientes').select('id, nome, cpf, rg, telefone, email, data_nascimento, sexo, endereco, created_at, clinicas(nome)').order('nome');
      if (ids.length) query = query.or(`clinica_id.in.(${ids.join(',')}),clinica_id.is.null`);
      const { data, error } = await query;
      if (error) { showAlert(fraseDoErro(error, 'Não foi possível exportar os pacientes. Confira a internet e tente de novo.'), { type: 'error' }); return; }
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
      a.download = `pacientes_${dataDoArquivo()}.csv`;
      a.click();
  }

  function exportarTudo() {
      // Exporta o que a clínica ativa tem no banco: antes da carga a tela só teria o padrão.
      if (!clinicaAtivaId) { showAlert('Escolha no seletor a unidade cujas configurações você quer exportar.', { type: 'warning' }); return; }
      const secoes = Object.keys(CARGA_INICIAL) as SecaoConfig[];
      if (secoes.some((s) => carga[s] === 'carregando')) { showAlert('Espere as configurações desta unidade carregarem para exportar.', { type: 'warning' }); return; }
      if (secoes.some((s) => carga[s] === 'erro')) { showAlert('As configurações desta unidade não carregaram. Recarregue a página antes de exportar.', { type: 'error' }); return; }
      const tudo = {
          versao: 1,
          exportado_em: new Date().toISOString(),
          preferencias: prefs,
          categorias_financeiro: catsFin,
          templates_comunicacao: templatesComunicacao,
          taxas_maquininha: taxasMaquininha,
          modelos_anamnese: modelos,
          modelos_documentos: docs,
      };
      const blob = new Blob([JSON.stringify(tudo, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ortus_configuracoes_${dataDoArquivo()}.json`;
      a.click();
  }

  async function importarTudo(e: React.ChangeEvent<HTMLInputElement>) {
      const arquivo = e.target.files?.[0];
      // Limpa o campo antes de qualquer espera: o mesmo arquivo pode ser escolhido de novo depois de uma recusa.
      e.target.value = '';
      if (!arquivo) return;
      const recusar = (motivo: string) => showAlert(`${motivo}\n\nNada foi alterado.`, { type: 'warning', title: 'Arquivo recusado' });

      if (!/\.json$/i.test(arquivo.name)) return recusar('Só é aceito o arquivo .json gerado em "Exportar configurações".');
      if (arquivo.size > TAMANHO_MAX_IMPORTACAO) return recusar('O arquivo passa de 2 MB.');
      // Grava só na clínica ativa, e só quem a administra.
      if (!clinicaAtivaId || !podeEditar) return recusar(bloqueioDeGravacao('preferencias') || 'Você não pode alterar as configurações desta unidade.');

      let conteudo: unknown;
      try {
          conteudo = JSON.parse(await arquivo.text());
      } catch {
          return recusar('O arquivo não é um JSON válido.');
      }
      const lido = lerConfigImportada(conteudo);
      if ('erro' in lido) return recusar(lido.erro);

      const { config, partes } = lido;
      // "lancamentos_meta" (taxas e cancelamentos já lançados no Financeiro) não é configuração:
      // a importação nunca grava essa chave, mesmo que um arquivo antigo a traga.
      const tarefas: { secao: SecaoConfig; gravar: () => Promise<void> }[] = [];
      if (config.preferencias) { const v = config.preferencias; tarefas.push({ secao: 'preferencias', gravar: () => gravarSecao('preferencias', v, setPrefs) }); }
      if (config.categorias_financeiro) { const v = normalizarCategoriasFinanceiras(config.categorias_financeiro); tarefas.push({ secao: 'categorias_financeiro', gravar: () => gravarSecao('categorias_financeiro', v, setCatsFin) }); }
      if (config.templates_comunicacao) { const v = config.templates_comunicacao; tarefas.push({ secao: 'templates_comunicacao', gravar: () => gravarSecao('templates_comunicacao', v, setTemplatesComunicacao) }); }
      if (config.taxas_maquininha) { const v = normalizarTaxasMaquininha(config.taxas_maquininha); tarefas.push({ secao: 'taxas_maquininha', gravar: () => gravarSecao('taxas_maquininha', v, setTaxasMaquininha) }); }
      if (config.modelos_documentos) { const v = config.modelos_documentos; tarefas.push({ secao: 'modelos_documentos', gravar: () => gravarSecao('modelos_documentos', v, setDocs) }); }
      if (config.modelos_anamnese) { const v = config.modelos_anamnese; tarefas.push({ secao: 'anamnese_modelos', gravar: () => gravarSecao('anamnese_modelos', v, setModelos) }); }
      // Parte ainda carregando (ou que não carregou) não recebe nada: recusa antes de gravar qualquer coisa.
      const bloqueio = tarefas.map((t) => bloqueioDeGravacao(t.secao)).find(Boolean);
      if (bloqueio) return recusar(bloqueio);

      const ok = await showConfirm(
          `O arquivo traz: ${partes.join(', ')}.\n\nO que ${activeClinic?.nome ? `"${activeClinic.nome}"` : 'esta unidade'} tem hoje nessas partes será substituído. Continuar?`,
          { title: 'Importar configurações', type: 'warning', confirmLabel: 'Importar' },
      );
      if (!ok) return;

      const resultados = await Promise.allSettled(tarefas.map((t) => t.gravar()));
      const falhas = tarefas.filter((_, i) => resultados[i].status === 'rejected');
      if (falhas.length === 0) { showAlert('Configurações importadas.', { type: 'success' }); return; }
      const importadas = tarefas.filter((_, i) => resultados[i].status === 'fulfilled');
      const recusa = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason;
      showAlert(
          `${importadas.length ? `Importado: ${importadas.map((t) => NOME_DA_SECAO[t.secao]).join(', ')}.\n` : ''}`
          + `Não foi importado: ${falhas.map((t) => NOME_DA_SECAO[t.secao]).join(', ')}.\n\n`
          + (recusa instanceof Error ? recusa.message : mensagemErroConfig(recusa)),
          { type: importadas.length ? 'warning' : 'error', title: importadas.length ? 'Importação incompleta' : 'Nada foi importado' },
      );
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
      if (!modeloEdit || salvandoPopup) return;
      if (!modeloEdit.nome.trim()) { showAlert('Informe o nome do modelo.', { type: 'warning' }); return; }
      const perguntasValidas = modeloEdit.perguntas.filter(p => p.label.trim());
      if (perguntasValidas.length === 0) { showAlert('Adicione pelo menos uma pergunta.', { type: 'warning' }); return; }
      const limpo = { ...modeloEdit, perguntas: perguntasValidas, padrao: false };
      const existe = modelos.findIndex(m => m.id === limpo.id);
      const novos = existe >= 0 ? modelos.map((m, i) => i === existe ? limpo : m) : [...modelos, limpo];
      // A lista atrás do popup só muda depois que o banco aceitou; na recusa o popup fica com o aviso.
      setSalvandoPopup(true);
      try {
          await gravarSecao('anamnese_modelos', novos, setModelos);
          setModalModelo(false);
          setModeloEdit(null);
          showAlert('Modelo salvo.', { type: 'success' });
      } catch (err) {
          showAlert(err instanceof Error ? err.message : mensagemErroConfig(err), { type: 'error' });
      } finally {
          setSalvandoPopup(false);
      }
  }
  async function excluirModelo(id: string) {
      const m = modelos.find(x => x.id === id);
      if (m?.padrao) { showAlert('Modelos padrão não podem ser excluídos.', { type: 'warning' }); return; }
      if (!(await showConfirm('Excluir este modelo?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      const novos = modelos.filter(x => x.id !== id);
      await gravarSecao('anamnese_modelos', novos, setModelos).catch(avisarFalhaGravacao);
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
      await gravarSecao('anamnese_modelos', novos, setModelos).catch(avisarFalhaGravacao);
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
      const user = await usuarioDaSessao();
      if (!user) { setDonoPlataforma((atual) => atual ?? false); setLoading(false); return; }

      // Uma leitura por visita basta, e sem segurar a tela: só a aba de backups depende dela.
      if (!donoConferido.current) {
          donoConferido.current = true;
          void conferirDonoPlataforma(user.id);
      }

      if (ctxClinics.length > 0) {
          setClinicas(ctxClinics);
      } else {
          const c = await fetchUserClinicas();
          setClinicas(c || []);
      }
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
      pedidoClinica.current += 1;
      setCarregandoClinica(false);
      setClinicaEditando(null);
      setClinicaForm({ ...CLINICA_FORM_VAZIO });
      limparLogoLocal();
      setModalClinicaCompleto(true);
  }

  // Fechar invalida a leitura da linha que ainda esteja a caminho. Durante a gravação o popup não fecha:
  // a resposta dela fecharia o popup de outra clínica aberta em seguida.
  function fecharModalClinica() {
      if (salvandoClinicaRef.current) return;
      pedidoClinica.current += 1;
      setCarregandoClinica(false);
      setModalClinicaCompleto(false);
      setClinicaEditando(null);
      limparLogoLocal();
  }

  // Mesma regra do banco para editar e excluir a clínica (user_is_clinic_admin).
  function podeAlterarClinica(c: { convidado?: boolean }) {
      return donoPlataforma === true || (nivelAdmin === true && c.convidado !== true);
  }

  // --- CLÍNICAS ---
  // Cria ou atualiza clínica com formulário completo
  async function salvarClinicaCompleta() {
      if (salvandoClinicaRef.current || carregandoClinica) return;
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

      const editandoId: string | number | null = clinicaEditando?.id ?? null;
      salvandoClinicaRef.current = true;
      setSalvandoClinica(true);
      try {
          let clinicaId: string | number | null = editandoId;
          let aviso: string | null = null;
          if (editandoId) {
              // Sem o select, a recusa da RLS voltava sem erro e sem linhas, e a tela dizia "atualizada".
              const { data: alteradas, error } = await tabelas.from('clinicas').update(payload).eq('id', editandoId).select('id');
              if (error) throw error;
              if (!alteradas?.length) { showAlert(ERRO_SEM_PERMISSAO_CLINICA, { type: 'error' }); return; }
              // A prévia dos documentos usa estes dados da unidade ativa.
              if (String(editandoId) === clinicaAtivaId) {
                  setDadosClinicaAtiva({ nome: payload.nome, cnpj: payload.cnpj, telefone: payload.telefone, rua: payload.rua, numero: payload.numero, cidade: payload.cidade });
              }
          } else {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) { showAlert('Sessão expirada. Faça login novamente.', { type: 'error' }); return; }

              const { data: prof } = await tabelas.from('profissionais')
                  .select('id, is_super_admin')
                  .eq('user_id', session.user.id)
                  .maybeSingle();

              if (!prof?.id) {
                  showAlert('Não foi possível identificar seu perfil.', { type: 'error' });
                  return;
              }

              // A rede vem de um vínculo próprio: o de convidado é de outra rede, e lá o banco recusa a clínica nova.
              let redeId: any = null;
              const proprias = new Set(ctxClinics.filter((c) => c.convidado !== true).map((c) => String(c.id)));
              const { data: vinculos } = await tabelas.from('profissionais_clinicas')
                  .select('clinica_id, clinicas(rede_id)')
                  .eq('profissional_id', prof.id);
              const vinculo = (vinculos || []).find((v: any) => proprias.has(String(v.clinica_id))) ?? vinculos?.[0];
              redeId = (vinculo as any)?.clinicas?.rede_id ?? null;

              if (!redeId && !prof.is_super_admin) {
                  showAlert('Sua conta não está vinculada a nenhuma rede. Contate o suporte.', { type: 'error' });
                  return;
              }

              const insertPayload: any = { ...payload };
              if (redeId !== null && redeId !== undefined) insertPayload.rede_id = redeId;

              const { data: novaC, error } = await tabelas.from('clinicas')
                  .insert([insertPayload])
                  .select('id')
                  .single();
              if (error || !novaC) throw error || new Error('Falha ao criar clínica');
              clinicaId = novaC.id;

              const { error: vincErr } = await tabelas.from('profissionais_clinicas')
                  .insert([{ profissional_id: prof.id, clinica_id: novaC.id }]);
              if (vincErr) {
                  aviso = 'Clínica criada, mas não foi possível vincular você automaticamente. Vincule em Equipe.';
              }
              await salvarConfig(novaC.id, 'categorias_financeiro', CATEGORIAS_FINANCEIRAS_PADRAO).catch(() => {});
          }

          if (clinicaId && logoArquivo) {
              try {
                  await publicarLogo(clinicaId, logoArquivo);
              } catch (err) {
                  const falhaLogo = 'A clínica foi salva, mas a logo não foi enviada. ' + fraseDoErro(err, 'Tente enviar de novo pela edição da clínica.');
                  aviso = aviso ? `${aviso}\n${falhaLogo}` : falhaLogo;
              }
          }

          // A lista e o seletor de unidades vêm da casca: fecha só depois de ela recarregar.
          await refreshClinics().catch(() => {});
          salvandoClinicaRef.current = false;
          fecharModalClinica();
          showAlert(aviso || (editandoId ? 'Clínica atualizada com sucesso!' : 'Clínica cadastrada com sucesso!'), {
              type: aviso ? 'warning' : 'success',
          });
      } catch (e) {
          showAlert(fraseDoErro(e, editandoId ? 'Não foi possível salvar a clínica. Confira a internet e tente de novo.' : 'Não foi possível cadastrar a clínica. Confira a internet e tente de novo.'), { type: 'error' });
      } finally {
          salvandoClinicaRef.current = false;
          setSalvandoClinica(false);
      }
  }

  async function excluirClinica(id: number) {
      if (!(await showConfirm('Tem certeza absoluta? Isso apagará a clínica e pode afetar dados vinculados.', { title: 'Excluir Clínica', type: 'error', confirmLabel: 'Excluir' }))) return;

      try {
          const { data: apagadas, error } = await tabelas.from('clinicas').delete().eq('id', id).select('id');
          if (error) throw error;
          // Recusa da RLS volta sem erro e sem linhas: antes aparecia "excluída" com a clínica intacta.
          if (!apagadas?.length) { showAlert(ERRO_SEM_PERMISSAO_CLINICA, { type: 'error' }); return; }
      } catch (e) {
          console.error(e);
          showAlert(fraseDoErro(e, 'Não foi possível excluir a clínica. Confira se ainda há pacientes ou vínculos ligados a ela.'), { type: 'error' });
          return;
      }
      await refreshClinics().catch(() => {});
      setClinicas((atual) => atual.filter((c) => String(c.id) !== String(id)));
      showAlert('Clínica excluída com sucesso!', { type: 'success' });
  }

  // Abre o popup na hora, carregando, e só preenche com a linha completa do banco.
  async function abrirEdicaoClinica(c: any) {
      const pedido = ++pedidoClinica.current;
      setClinicaEditando(c);
      setClinicaForm({ ...CLINICA_FORM_VAZIO, id: c.id, nome: c.nome || '' });
      limparLogoLocal();
      setCarregandoClinica(true);
      setModalClinicaCompleto(true);
      let linha: any = null;
      try {
          const { data, error } = await tabelas.from('clinicas').select(COLUNAS_FORM_CLINICA).eq('id', c.id).maybeSingle();
          if (!error) linha = data;
      } catch {
          linha = null;
      }
      // Popup fechado, ou outra clínica aberta, enquanto a leitura vinha.
      if (pedido !== pedidoClinica.current) return;
      setCarregandoClinica(false);
      if (!linha) {
          fecharModalClinica();
          showAlert('Não foi possível abrir os dados desta clínica. Confira a internet e tente de novo.', { type: 'error' });
          return;
      }
      setClinicaForm({
          id: linha.id,
          nome: linha.nome || '',
          cnpj: linha.cnpj || '',
          responsavel_nome: linha.responsavel_nome || '',
          email: linha.email || '',
          telefone: linha.telefone || '',
          horario_inicio: linha.horario_inicio || '08:00',
          horario_fim: linha.horario_fim || '18:00',
          fuso_horario: linha.fuso_horario || 'America/Sao_Paulo',
          emitir_notas_em_nome: linha.emitir_notas_em_nome || 'clinica',
          logo_url: linha.logo_url || '',
          cep: linha.cep || '',
          rua: linha.rua || '',
          numero: linha.numero || '',
          complemento: linha.complemento || '',
          bairro: linha.bairro || '',
          cidade: linha.cidade || '',
          uf: linha.uf || ''
      });
      setLogoPreview(linha.logo_url || '');
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
          const fileExt = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
          const filePath = `clinicas/${clinicaId}/logo-${Date.now()}.${fileExt}`;
          const publicUrl = await enviarArquivoClinica(filePath, file, { upsert: true, contentType: file.type || undefined });
          if (!publicUrl) throw new Error('Não foi possível publicar a logo.');
          const { data: alteradas, error } = await tabelas.from('clinicas').update({ logo_url: publicUrl }).eq('id', clinicaId).select('id');
          if (error) throw error;
          if (!alteradas?.length) throw new Error('A logo foi enviada, mas o banco não deixou ligá-la à clínica.');
          setClinicaForm((prev) => ({ ...prev, logo_url: publicUrl }));
      } finally {
          setUploadingLogo(false);
      }
  }

  async function exportarTabelaTratamentos() {
    if (!activeClinic || activeClinic.id === 'all') {
      await showAlert('Selecione uma clínica para exportar a tabela.', { type: 'warning' });
      return;
    }
    try {
      await baixarTabelaTratamentos(supabase, Number(activeClinic.id));
    } catch {
      await showAlert('Não foi possível exportar a tabela.', { type: 'error' });
    }
  }

  // Unidade específica em que a pessoa é convidada ou não é administradora: mostra, mas não deixa alterar.
  const avisoSomenteLeitura = clinicaAtivaId && !podeEditar && (convidadoAqui || (nivelAdmin === false && donoPlataforma !== true))
      ? 'Só leitura: você não administra esta unidade. Para alterar, escolha uma unidade própria no seletor.'
      : null;

  /** Toma o lugar do conteúdo da aba: sem unidade escolhida, carregando, ou com a leitura falha. */
  function bloqueioDaSecao(secao: SecaoConfig): ReactNode {
      if (!clinicaAtivaId) {
          return (
              <div className={sectionPad}>
                  <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">Escolha no seletor uma unidade própria para ver e alterar estas configurações.</div>
              </div>
          );
      }
      if (carga[secao] === 'carregando') {
          return (
              <div className={`${sectionPad} gap-2`} aria-busy="true">
                  {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-50" />)}
              </div>
          );
      }
      if (carga[secao] === 'erro') {
          return (
              <div className={sectionPad}>
                  <div className="rounded-xl border border-neutral-200 bg-[#f8f8f6] px-4 py-4 text-sm text-neutral-700">Não foi possível carregar esta configuração. Confira a internet e recarregue a página. Nada foi alterado.</div>
              </div>
          );
      }
      return null;
  }

  return (
    <>
    {/* Abaixo de lg a página rola inteira (quem rola é a casca); a altura fixa com rolagem por dentro fica só no computador. */}
    <div className="flex shrink-0 flex-col px-3 py-3 font-poppins lg:h-full lg:min-h-0 lg:shrink lg:overflow-hidden">
      <div className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
          Configurações
          <span className="hidden text-neutral-400 md:inline"> · {activeClinic ? getClinicLabel(activeClinic) : 'Rede'}</span>
        </h1>
        {avisoSomenteLeitura && SECAO_DA_ABA[abaAtiva] && (
          <p className="mt-2 rounded-md border border-neutral-200 bg-[#f8f8f6] px-3 py-2 text-sm text-neutral-700">{avisoSomenteLeitura}</p>
        )}
      </div>

      {kpiLoading && clinicas.length === 0 ? (
        <div className={`${cardShell} space-y-2 p-4 sm:p-5`}>
          <div className="h-10 w-48 animate-pulse rounded-xl bg-neutral-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-neutral-50" />
          <div className="h-32 animate-pulse rounded-2xl bg-neutral-50" />
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:min-h-0 lg:flex-1 lg:flex-row">
          <nav ref={navRef} aria-label="Seções de configuração" className="flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain border-b border-black/10 px-2 py-2 lg:w-56 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
            {CONFIG_NAVS.map((section) => {
              const Icon = section.icon;
              const active = abaAtiva === section.key;
              const badge = section.key === 'clinicas' ? clinicas.length : section.key === 'anamnese' ? modelos.length : section.key === 'backup' ? totalBackups : null;
              return (
                <button
                  key={section.key}
                  type="button"
                  data-ativa={active}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setAbaAtiva(section.key)}
                  className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm leading-snug lg:min-h-0 lg:w-full lg:gap-2.5 lg:py-2.5 ${active ? 'bg-neutral-900 font-medium text-white' : 'font-medium text-neutral-600 hover:bg-[#f3f4f1]'}`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="whitespace-nowrap lg:min-w-0 lg:flex-1 lg:whitespace-normal">{section.label}</span>
                  {badge != null && badge > 0 && (
                    <span className={`text-[11px] font-medium tabular-nums ${active ? 'text-white/70' : 'text-neutral-400'}`}>{badge}</span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
            {/* ABA CLÍNICAS */}
            {abaAtiva === 'clinicas' && (
                <section className={sectionPad}>
                        <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-base font-semibold text-neutral-900">Unidades</h3>
                              <p className="text-xs text-neutral-500">Endereço, horário e dados fiscais</p>
                            </div>
                            {(donoPlataforma === true || nivelAdmin === true) && (
                                <button type="button" onClick={abrirNovaClinica} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-9"><Plus size={14}/> Nova clínica</button>
                            )}
                        </div>
                        {/* Celular: o cartão inteiro abre a edição; excluir é um botão à parte e sempre pede confirmação.
                            Clínica que a pessoa não administra (convidada, ou sem ser administradora) só aparece. */}
                        <div className="space-y-2 md:hidden">
                            {clinicas.map(c => (
                                <CartaoCelular
                                    key={c.id}
                                    onAbrir={podeAlterarClinica(c) ? () => { void abrirEdicaoClinica(c); } : undefined}
                                    acoes={podeAlterarClinica(c) ? <button type="button" aria-label={`Excluir ${c.nome}`} onClick={() => { void excluirClinica(c.id); }} className={botaoCartao}><Trash2 size={16}/></button> : undefined}
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-[#f3f4f1] text-neutral-700">
                                        {c.logo_url ? <img src={c.logo_url} className="h-full w-full object-cover" alt=""/> : <Building2 size={16}/>}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block break-words text-sm font-medium text-neutral-900">{c.nome}</span>
                                        {c.cnpj && <span className="block text-xs text-neutral-500">{c.cnpj}</span>}
                                    </span>
                                </CartaoCelular>
                            ))}
                        </div>
                        <div className="hidden space-y-1.5 md:block lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
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
                                    {podeAlterarClinica(c) && (
                                        <div className="flex items-center gap-1">
                                            <button type="button" aria-label={`Editar ${c.nome}`} onClick={() => { void abrirEdicaoClinica(c); }} className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-white rounded-lg transition-all" title="Editar"><Edit size={18}/></button>
                                            <button type="button" aria-label={`Excluir ${c.nome}`} onClick={() => { void excluirClinica(c.id); }} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-white rounded-lg transition-all" title="Excluir"><Trash2 size={18}/></button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                </section>
            )}

            {/* ABA ANAMNESE */}
            {/* Até o banco responder (ou sem unidade escolhida) a aba não mostra o padrão como se fosse da clínica. */}
            {abaAtiva === 'anamnese' && (bloqueioDaSecao('anamnese_modelos') ?? (
                <section className={sectionPad}>
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 md:mb-5">
                            <div className="min-w-0">
                                <h3 className="text-base font-semibold text-neutral-900">Modelos de anamnese</h3>
                                <p className="mt-1 text-xs text-neutral-500">Perguntas usadas na ficha do paciente.</p>
                            </div>
                            {podeEditar && <button type="button" onClick={abrirNovoModelo} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-9"><Plus size={14}/> Novo modelo</button>}
                        </div>

                        {/* Celular: sem a prévia das perguntas, que era uma caixa de rolagem dentro do cartão. */}
                        <div className="space-y-2 md:hidden">
                            {modelos.map(m => (
                                <CartaoCelular
                                    key={m.id}
                                    onAbrir={() => abrirEditarModelo(m)}
                                    acoes={podeEditar ? (
                                        <>
                                            <button type="button" aria-label={`Duplicar ${m.nome}`} onClick={() => { void duplicarModelo(m); }} className={botaoCartao}><Copy size={16}/></button>
                                            {!m.padrao && <button type="button" aria-label={`Excluir ${m.nome}`} onClick={() => { void excluirModelo(m.id); }} className={botaoCartao}><Trash2 size={16}/></button>}
                                        </>
                                    ) : undefined}
                                >
                                    <span className="min-w-0">
                                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            <span className="break-words text-sm font-semibold text-neutral-900">{m.nome}</span>
                                            {m.padrao && <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">Padrão</span>}
                                        </span>
                                        {m.descricao && <span className="mt-0.5 block text-xs text-neutral-500">{m.descricao}</span>}
                                        <span className="mt-0.5 block text-xs text-neutral-500">{m.perguntas.length} pergunta{m.perguntas.length !== 1 ? 's' : ''}</span>
                                    </span>
                                </CartaoCelular>
                            ))}
                        </div>
                        <div className="hidden content-start gap-2 md:grid md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
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
                                        <button onClick={() => abrirEditarModelo(m)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Edit size={12}/> {podeEditar ? 'Editar' : 'Ver'}</button>
                                        {podeEditar && <button onClick={() => duplicarModelo(m)} className="h-8 rounded-md border border-neutral-200 px-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Duplicar</button>}
                                        {podeEditar && !m.padrao && <button type="button" aria-label={`Excluir ${m.nome}`} onClick={() => excluirModelo(m.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:bg-neutral-50 hover:text-rose-600"><Trash2 size={12}/></button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                </section>
            ))}

            {/* ABA GERAL / PREFERÊNCIAS */}
            {abaAtiva === 'geral' && (bloqueioDaSecao('preferencias') ?? (
                <div className="grid grid-cols-1 gap-5 p-3 lg:h-full lg:min-h-0 lg:grid-cols-2 lg:gap-3 lg:overflow-hidden">
                    <section className="space-y-2 lg:min-h-0 lg:overflow-hidden">
                        <h3 className="text-base font-semibold text-neutral-900">Preferências gerais</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
                            <div><label className={campoLabel}>Nome para documentos</label><input value={prefs.nome_clinica} onChange={e => atualizarPref('nome_clinica', e.target.value)} disabled={somenteLeitura} className={campoInput} placeholder="Ex: Clínica Sorriso"/></div>
                            <div><label className={campoLabel}>CNPJ</label><input value={prefs.cnpj} onChange={e => atualizarPref('cnpj', e.target.value)} disabled={somenteLeitura} className={campoInput} placeholder="00.000.000/0000-00"/></div>
                            <div className="sm:col-span-2"><label className={campoLabel}>Slogan</label><input value={prefs.slogan} onChange={e => atualizarPref('slogan', e.target.value)} disabled={somenteLeitura} className={campoInput} placeholder="Ex: Odontologia Integrada"/></div>
                            <div className="sm:col-span-2"><label className={campoLabel}>Cabeçalho dos documentos</label><textarea value={prefs.cabecalho_documentos} onChange={e => atualizarPref('cabecalho_documentos', e.target.value)} disabled={somenteLeitura} className="h-20 w-full resize-none rounded-md border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-500 sm:h-16" placeholder="Endereço, telefone e responsável técnico..."/></div>
                            <div className="sm:col-span-2"><label className={campoLabel}>Rodapé dos documentos</label><input value={prefs.rodape_documentos} onChange={e => atualizarPref('rodape_documentos', e.target.value)} disabled={somenteLeitura} className={campoInput}/></div>
                            <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 py-1.5 pl-3 pr-1.5 sm:col-span-2 sm:px-3 sm:py-2">
                                <span className="text-sm font-medium text-neutral-800">Tabela de tratamentos</span>
                                <button type="button" onClick={() => void exportarTabelaTratamentos()} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 sm:h-8 sm:px-2.5 sm:text-xs">
                                    <Download size={14} /> Exportar
                                </button>
                            </div>
                        </div>
                    </section>
                    <section className="space-y-3 lg:min-h-0 lg:overflow-hidden">
                        <h3 className="text-base font-semibold text-neutral-900">Horário de atendimento</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
                            <div><label className={campoLabel}>Abertura</label><input type="time" value={prefs.horario_abertura} onChange={e => atualizarPref('horario_abertura', e.target.value)} disabled={somenteLeitura} className={campoInput}/></div>
                            <div><label className={campoLabel}>Fechamento</label><input type="time" value={prefs.horario_fechamento} onChange={e => atualizarPref('horario_fechamento', e.target.value)} disabled={somenteLeitura} className={campoInput}/></div>
                            <div><label className={campoLabel}>Consulta (min)</label><input type="number" inputMode="numeric" value={prefs.duracao_consulta_padrao} onChange={e => atualizarPref('duracao_consulta_padrao', parseInt(e.target.value)||60)} disabled={somenteLeitura} className={campoInput}/></div>
                        </div>
                        <div>
                            <label className={campoLabel}>Dias</label>
                            {/* Celular: sete colunas iguais, uma por dia; em tela muito estreita viram duas fileiras para o toque não encolher. */}
                            <div className="grid grid-cols-4 gap-1 min-[360px]:grid-cols-7 sm:flex sm:flex-wrap sm:gap-1.5">
                                {[{k:'seg',l:'Seg'},{k:'ter',l:'Ter'},{k:'qua',l:'Qua'},{k:'qui',l:'Qui'},{k:'sex',l:'Sex'},{k:'sab',l:'Sáb'},{k:'dom',l:'Dom'}].map(d => (
                                    <button key={d.k} type="button" aria-pressed={!!prefs.dias_atendimento[d.k]} onClick={() => toggleDia(d.k)} disabled={somenteLeitura} className={`h-10 rounded-md text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 sm:h-8 sm:px-2.5 ${prefs.dias_atendimento[d.k] ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>{d.l}</button>
                                ))}
                            </div>
                        </div>
                        <div className="sm:max-w-xs">
                            <label className={campoLabel}>Cor do tema</label>
                            <CustomSelect value={prefs.cor_tema || 'blue'} onChange={v => atualizarPref('cor_tema', v)} options={THEME_OPTIONS} size="lg" disabled={somenteLeitura}/>
                        </div>
                        <div className="space-y-1.5">
                            {[
                                { k: 'notificar_aniversariantes', l: 'Aniversariantes do dia' },
                                { k: 'notificar_debitos', l: 'Débitos pendentes' },
                                { k: 'confirmar_exclusao', l: 'Confirmar antes de excluir' },
                            ].map(it => (
                                // A linha inteira é o rótulo do interruptor: no celular o alvo é a linha, não só a chave de 36px.
                                <div key={it.k} className="flex rounded-md border border-neutral-200">
                                    <Switch checked={!!prefs[it.k]} onChange={(valor) => atualizarPref(it.k, valor)} disabled={somenteLeitura} className="min-h-[44px] w-full justify-between px-3 py-2 sm:min-h-0">
                                        <span className="text-sm font-medium text-neutral-800">{it.l}</span>
                                    </Switch>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            ))}

            {/* ABA CONTRATOS & DOCUMENTOS */}
            {abaAtiva === 'documentos' && (bloqueioDaSecao('modelos_documentos') ?? (
                <section className={sectionPad}>
                        <div className="mb-3 flex shrink-0 flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-neutral-900">Modelos de documentos</h3>
                                    <p className="mt-1 text-xs text-neutral-500">Contratos, receitas e termos.</p>
                                </div>
                                {podeEditar && <button type="button" onClick={abrirNovoDoc} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-9"><Plus size={14}/> Novo modelo</button>}
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <div className="relative min-w-0 sm:flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16}/>
                                    <input value={docsBusca} onChange={e => setDocsBusca(e.target.value)} placeholder="Buscar modelo" className="h-10 w-full rounded-md border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-900"/>
                                </div>
                                <div className="shrink-0 sm:w-40">
                                    <CustomSelect value={docsTipo} onChange={setDocsTipo} options={[{value:'todos',label:'Tipo'},{value:'contrato',label:'Contrato'},{value:'receita',label:'Receita'},{value:'atestado',label:'Atestado'},{value:'outro',label:'Outro'}]} size="md"/>
                                </div>
                                {/* Lista ou grade só muda algo quando há duas colunas; no celular os modelos já são uma lista de cartões. */}
                                <div className="hidden shrink-0 md:block">
                                    <SegmentedControl
                                        value={docsVisualizacao}
                                        onChange={setDocsVisualizacao}
                                        className="w-fit shrink-0"
                                        options={[
                                            { value: 'lista', label: <List size={16} />, ariaLabel: 'Lista' },
                                            { value: 'grade', label: <LayoutGrid size={16} />, ariaLabel: 'Grade' },
                                        ]}
                                    />
                                </div>
                            </div>
                        </div>

                        {(() => {
                            const q = docsBusca.trim().toLowerCase();
                            const lista = docs.filter((d) => (docsTipo === 'todos' || d.tipo === docsTipo) && (!q || d.nome.toLowerCase().includes(q) || d.conteudo.toLowerCase().includes(q)));
                            if (lista.length === 0) return <div className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-500">Nenhum modelo encontrado.</div>;
                            const cartoesCelular = (
                                <div className="space-y-2 md:hidden">
                                    {lista.map((d) => (
                                        <CartaoCelular
                                            key={d.id}
                                            onAbrir={() => abrirEditarDoc(d)}
                                            acoes={podeEditar ? <button type="button" aria-label={`Excluir ${d.nome}`} onClick={() => { void excluirDoc(d.id); }} className={botaoCartao}><Trash2 size={16}/></button> : undefined}
                                        >
                                            <span className="min-w-0">
                                                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                    <span className="break-words text-sm font-semibold text-neutral-900">{d.nome}</span>
                                                    <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{d.tipo}</span>
                                                </span>
                                                <span className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{d.conteudo}</span>
                                            </span>
                                        </CartaoCelular>
                                    ))}
                                </div>
                            );
                            if (docsVisualizacao === 'lista') {
                                return (
                                    <>
                                    {cartoesCelular}
                                    <div className="hidden rounded-xl border border-neutral-200 md:block lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                                        {lista.map((d) => (
                                            <div key={d.id} className="flex items-center gap-3 border-b border-black/5 px-3 py-2.5 last:border-0">
                                                <span className="w-20 shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-center text-[10px] font-medium text-neutral-600">{d.tipo}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-neutral-900">{d.nome}</p>
                                                    <p className="truncate text-xs text-neutral-500">{d.conteudo}</p>
                                                </div>
                                                <button onClick={() => abrirEditarDoc(d)} aria-label={podeEditar ? `Editar ${d.nome}` : `Ver ${d.nome}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50"><Edit size={14}/></button>
                                                {podeEditar && <button type="button" aria-label={`Excluir ${d.nome}`} onClick={() => excluirDoc(d.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600"><Trash2 size={14}/></button>}
                                            </div>
                                        ))}
                                    </div>
                                    </>
                                );
                            }
                            return (
                        <>
                        {cartoesCelular}
                        <div className="hidden content-start gap-2 md:grid md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                            {lista.map(d => (
                                <div key={d.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                                    <div className="mb-1.5 flex items-center gap-2">
                                        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{d.tipo}</span>
                                        <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{d.nome}</h4>
                                    </div>
                                    <p className="mb-2 line-clamp-2 whitespace-pre-line text-xs text-neutral-500">{d.conteudo}</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => abrirEditarDoc(d)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Edit size={12}/> {podeEditar ? 'Editar' : 'Ver'}</button>
                                        {podeEditar && <button type="button" aria-label={`Excluir ${d.nome}`} onClick={() => excluirDoc(d.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600"><Trash2 size={12}/></button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                        </>
                            );
                        })()}
                </section>
            ))}

            {/* ABA CATEGORIAS FINANCEIRAS */}
            {abaAtiva === 'categorias' && (bloqueioDaSecao('categorias_financeiro') ?? (
                <section className={sectionPad}>
                        <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="flex items-center gap-1.5 text-base font-semibold text-neutral-900">
                                    Categorias financeiras
                                    {/* A dica por cima do "?" depende de passar o mouse: no celular ela vira texto fixo logo abaixo. */}
                                    <span className="group relative hidden md:inline-flex">
                                        <button type="button" aria-label="Inativas não aparecem no Financeiro." className="flex h-5 w-5 items-center justify-center text-neutral-400">
                                            <HelpCircle size={14} />
                                        </button>
                                        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-white group-hover:block group-active:hidden">
                                            Inativas não aparecem no Financeiro.
                                        </span>
                                    </span>
                                </h3>
                                <p className="text-xs text-neutral-500 md:hidden">Inativas não aparecem no Financeiro.</p>
                            </div>
                            {podeEditar && <button type="button" onClick={abrirNovaCatFin} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-9"><Plus size={14}/> Adicionar</button>}
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

                        {/* Celular: tocar abre a edição; ligar e desligar fica à mão, porque é o que mais se faz aqui. */}
                        <div className="space-y-2 md:hidden">
                            {catsFinFiltradas.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-500">
                                    {buscaCatFin.trim() ? 'Nenhuma categoria encontrada.' : 'Nenhuma categoria cadastrada.'}
                                </div>
                            ) : catsFinFiltradas.map(c => (
                                <CartaoCelular
                                    key={c.id}
                                    apagado={!c.ativo}
                                    onAbrir={() => abrirEditarCatFin(c)}
                                    acoes={(
                                        <>
                                            <Switch checked={c.ativo} onChange={() => toggleCatFinAtiva(c.id)} disabled={somenteLeitura} className="h-10 w-12 justify-center">
                                                <span className="sr-only">{`Categoria ${c.nome} ativa`}</span>
                                            </Switch>
                                            {podeEditar && <button type="button" aria-label={`Excluir ${c.nome}`} onClick={() => { void removerCatFin(c.id); }} className={botaoCartao}><Trash2 size={16}/></button>}
                                        </>
                                    )}
                                >
                                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: c.cor }} />
                                    <span className="min-w-0">
                                        <span className="block break-words text-sm font-medium text-neutral-900">{c.nome}</span>
                                        <span className="block text-xs text-neutral-500">{c.tipo === 'receita' ? 'Receita' : 'Despesa'}{c.ativo ? '' : ' · inativa'}</span>
                                    </span>
                                </CartaoCelular>
                            ))}
                        </div>
                        <div className="hidden content-start gap-1.5 md:grid md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                            {catsFinFiltradas.length === 0 ? (
                                <div className="col-span-2 rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-500">
                                    {buscaCatFin.trim() ? 'Nenhuma categoria encontrada.' : 'Nenhuma categoria cadastrada.'}
                                </div>
                            ) : catsFinFiltradas.map(c => (
                                <div key={c.id} className={`flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 ${c.ativo ? '' : 'opacity-50'}`}>
                                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: c.cor }} />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{c.nome}</span>
                                    <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{c.tipo}</span>
                                    <button onClick={() => toggleCatFinAtiva(c.id)} disabled={somenteLeitura} className={`inline-flex h-8 w-8 items-center justify-center rounded-md disabled:cursor-not-allowed ${c.ativo ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-400'}`} title={c.ativo ? 'Desativar' : 'Ativar'}><Check size={14}/></button>
                                    <button onClick={() => abrirEditarCatFin(c)} aria-label={podeEditar ? `Editar ${c.nome}` : `Ver ${c.nome}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50"><Edit size={14}/></button>
                                    {podeEditar && <button type="button" aria-label={`Excluir ${c.nome}`} onClick={() => removerCatFin(c.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600"><Trash2 size={14}/></button>}
                                </div>
                            ))}
                        </div>
                </section>
            ))}

            {abaAtiva === 'comunicacao' && (bloqueioDaSecao('templates_comunicacao') ?? (
                <section className={sectionPad}>
                    <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold text-neutral-900">Templates</h3>
                            <p className="text-xs text-neutral-500">WhatsApp, e-mail e SMS. Lembretes automáticos saem às 10h.</p>
                        </div>
                        {podeEditar && <button type="button" onClick={abrirNovoTemplateCom} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-9"><Plus size={14}/> Novo template</button>}
                    </div>
                    <div className="space-y-2 md:hidden">
                        {templatesComunicacao.map(t => (
                            <CartaoCelular
                                key={t.id}
                                apagado={!t.ativo}
                                onAbrir={() => abrirEditarTemplateCom(t)}
                                acoes={podeEditar ? <button type="button" aria-label={`Excluir ${t.nome}`} onClick={() => { void excluirTemplateCom(t.id); }} className={botaoCartao}><Trash2 size={16}/></button> : undefined}
                            >
                                <span className="min-w-0">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className="break-words text-sm font-semibold text-neutral-900">{t.nome}</span>
                                        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{t.canal}</span>
                                        {!t.ativo && <span className="text-[10px] text-neutral-500">Inativo</span>}
                                    </span>
                                    <span className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{t.corpo}</span>
                                </span>
                            </CartaoCelular>
                        ))}
                    </div>
                    <div className="hidden content-start gap-2 md:grid md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                        {templatesComunicacao.map(t => (
                            <div key={t.id} className={`rounded-xl border border-neutral-200 bg-white p-3 ${t.ativo ? '' : 'opacity-50'}`}>
                                <div className="mb-1.5 flex items-center gap-2">
                                    <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{t.canal}</span>
                                    <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{t.nome}</h4>
                                    {!t.ativo && <span className="text-[10px] text-neutral-400">Inativo</span>}
                                </div>
                                <p className="mb-2 line-clamp-2 whitespace-pre-line text-xs text-neutral-500">{t.corpo}</p>
                                <div className="flex gap-2">
                                    <button onClick={() => abrirEditarTemplateCom(t)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Edit size={12}/> {podeEditar ? 'Editar' : 'Ver'}</button>
                                    {podeEditar && <button type="button" aria-label={`Excluir ${t.nome}`} onClick={() => excluirTemplateCom(t.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600"><Trash2 size={12}/></button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            {abaAtiva === 'taxas' && (bloqueioDaSecao('taxas_maquininha') ?? (() => {
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
                    <div key={nome} className={`grid grid-cols-[minmax(0,1fr)_4.5rem_3.25rem_2.5rem] items-center gap-2 px-1 py-1 sm:grid-cols-[minmax(0,1fr)_4.5rem_3.25rem_2rem] ${amostra.ativo ? '' : 'opacity-45'}`}>
                        <p className="break-words text-sm font-medium text-neutral-900 sm:truncate">{nome}</p>
                        <input type="number" inputMode="decimal" step="1" min="0" max="100" value={amostra.taxa_percentual} onChange={e => aplicarGrupo(grupo, 'taxa_percentual', parseFloat(e.target.value) || 0)} disabled={somenteLeitura} className="h-10 w-full rounded-md border border-neutral-200 bg-white px-2 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-500 sm:h-8 sm:text-xs" aria-label={`Taxa de ${nome}, em %`} />
                        <input type="number" inputMode="numeric" min="0" value={amostra.prazo_recebimento_dias} onChange={e => aplicarGrupo(grupo, 'prazo_recebimento_dias', parseInt(e.target.value) || 0)} disabled={somenteLeitura} className="h-10 w-full rounded-md border border-neutral-200 bg-white px-2 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-500 sm:h-8 sm:text-xs" aria-label={`Prazo de ${nome}, em dias`} />
                        <button type="button" onClick={() => aplicarGrupo(grupo, 'ativo', !amostra.ativo)} disabled={somenteLeitura} className={`inline-flex h-10 w-10 items-center justify-center rounded-md disabled:cursor-not-allowed sm:h-8 sm:w-8 ${amostra.ativo ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-400'}`} aria-label={amostra.ativo ? `Desativar ${nome}` : `Ativar ${nome}`}><Check size={14}/></button>
                    </div>
                );
                // Abaixo de lg os três grupos viram abas e só o escolhido aparece; lado a lado só no computador.
                const coluna = (id: 'pix' | 'visa' | 'elo', titulo: string, linhas: ReactNode) => (
                    <section className={`${abaTaxas === id ? 'flex' : 'hidden lg:flex'} flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:h-full lg:min-h-0`}>
                        <div className="hidden border-b border-black/5 px-3 py-2.5 lg:block">
                            <h3 className="text-sm font-semibold text-neutral-900">{titulo}</h3>
                        </div>
                        <div className="flex flex-col p-2 lg:min-h-0 lg:flex-1">
                            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_4.5rem_3.25rem_2.5rem] gap-2 px-1 pb-1 sm:grid-cols-[minmax(0,1fr)_4.5rem_3.25rem_2rem]">
                                <span className="text-[11px] font-medium text-neutral-500">Pagamento</span>
                                <span className="text-[11px] font-medium text-neutral-500">Taxa</span>
                                <span className="text-[11px] font-medium text-neutral-500">Prazo</span>
                                <span />
                            </div>
                            <div className="flex flex-col gap-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{linhas}</div>
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
                <div className="grid grid-cols-1 gap-2 p-3 lg:h-full lg:min-h-0 lg:grid-cols-3 lg:overflow-hidden">
                    <div role="tablist" aria-label="Formas de pagamento" className="grid grid-cols-3 gap-1 rounded-xl border border-neutral-200 bg-white p-1 lg:hidden">
                        {([['pix', 'PIX e débito'], ['visa', 'Crédito Visa/Master'], ['elo', 'Crédito Elo/Outros']] as const).map(([id, rotulo]) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={abaTaxas === id}
                                onClick={() => setAbaTaxas(id)}
                                className={`flex min-h-[44px] items-center justify-center rounded-lg px-1 py-1 text-center text-[13px] font-medium leading-tight ${abaTaxas === id ? 'bg-neutral-900 text-white' : 'text-neutral-600 active:bg-neutral-100'}`}
                            >
                                {rotulo}
                            </button>
                        ))}
                    </div>
                    {pix && debVisa && coluna('pix', 'PIX e débito', <>
                        {linha('PIX', pix, [pix])}
                        {linha('Débito Visa/Master', debVisa, [debVisa])}
                        {debitosOutros[0] && linha('Elo/outros', debitosOutros[0], debitosOutros)}
                    </>)}
                    {coluna('visa', 'Crédito Visa/Master', creditoVisa.map((t) => linha(nomeParcela(t), t, grupoParcela(t.parcela || 1, ['Visa/Master']))))}
                    {coluna('elo', 'Crédito Elo/Outros', creditoElo.map((t) => linha(nomeParcela(t), t, grupoParcela(t.parcela || 1, ['Elo', 'Amex', 'Hipercard']))))}
                </div>
                );
            })())}

            {/* ABA BACKUP */}
            {abaAtiva === 'backup' && (
                <section className={sectionPad}>
                    <div className="mb-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold text-neutral-900">Backups</h3>
                            {donoPlataforma && (
                                <p className="text-xs text-neutral-500">Cada backup guarda pacientes, agendamentos, despesas, clínicas, profissionais e serviços de todas as clínicas. Ficam os 30 automáticos e os 10 manuais mais recentes.</p>
                            )}
                        </div>
                        {donoPlataforma && (
                            <button type="button" onClick={backupAgoraManual} disabled={criandoBackup} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 sm:h-9">
                                {criandoBackup ? <><Loader2 className="animate-spin" size={14}/> Gerando</> : <><Plus size={14}/> Backup manual</>}
                            </button>
                        )}
                    </div>
                    <div className="space-y-2 md:space-y-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                        {donoPlataforma === null ? (
                            Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-50" />)
                        ) : !donoPlataforma ? (
                            // Criar, restaurar e apagar são recusados pelo banco para quem não é dono da plataforma: a tela não oferece o que não funciona.
                            <div className="rounded-xl border border-neutral-200 bg-[#f8f8f6] px-4 py-4">
                                <p className="text-sm font-medium text-neutral-900">Os backups são feitos pelo suporte do Ortus.</p>
                                <p className="mt-1 text-sm text-neutral-600">Por aqui não dá para criar, restaurar nem apagar backups. Se precisar recuperar algum dado da clínica, fale com o suporte.</p>
                            </div>
                        ) : backups.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">Nenhum backup encontrado.</div>
                        ) : backups.map((b: any) => {
                            const isAuto = (b.tipo || '').startsWith('automatico');
                            return (
                                <div key={b.id} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white py-2 pl-3 pr-1 md:gap-3 md:pr-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            <span className="text-sm font-medium text-neutral-900">#{b.id}</span>
                                            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{isAuto ? 'automático' : (b.tipo || 'manual')}</span>
                                            {b.tamanho_kb ? <span className="text-[10px] text-neutral-500">{b.tamanho_kb} KB</span> : null}
                                        </div>
                                        <p className="break-words text-xs text-neutral-500 md:truncate">
                                            {new Date(b.criado_em).toLocaleDateString('pt-BR')} às {new Date(b.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            {b.observacao ? ` · ${b.observacao}` : ''}
                                        </p>
                                    </div>
                                    {/* Celular: três ícones sem nome lado a lado, um deles restaurar, pedem erro de dedo; viram menu com o nome de cada ação. */}
                                    <div className="shrink-0 md:hidden">
                                        <MenuPontos
                                            className={botaoPontos}
                                            itens={[
                                                { id: 'baixar', label: 'Baixar', onClick: () => { void baixarBackupComoJson(b.id); } },
                                                { id: 'restaurar', label: 'Restaurar', onClick: () => abrirModalRestaurar(b) },
                                                { id: 'excluir', label: 'Excluir', perigo: true, onClick: () => { void excluirBackupItem(b.id); } },
                                            ]}
                                        />
                                    </div>
                                    <button onClick={() => baixarBackupComoJson(b.id)} className="hidden h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50 md:inline-flex" title="Baixar"><Download size={14}/></button>
                                    <button onClick={() => abrirModalRestaurar(b)} className="hidden h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50 md:inline-flex" title="Restaurar"><RotateCcw size={14}/></button>
                                    <button type="button" aria-label="Excluir backup" onClick={() => excluirBackupItem(b.id)} className="hidden h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600 md:inline-flex" title="Excluir"><Trash2 size={14}/></button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-3 shrink-0 lg:mt-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <button type="button" onClick={exportarPacientes} className="h-11 rounded-md border border-neutral-200 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:h-9 sm:text-xs">Exportar pacientes</button>
                            <button type="button" onClick={exportarTudo} className="h-11 rounded-md border border-neutral-200 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:h-9 sm:text-xs">Exportar configurações</button>
                            {/* A importação grava na clínica ativa: fica travada onde a pessoa só pode ler. */}
                            <label aria-disabled={somenteLeitura} className={`inline-flex h-11 items-center justify-center rounded-md border border-neutral-200 text-sm font-medium sm:h-9 sm:text-xs ${somenteLeitura ? 'cursor-not-allowed text-neutral-400' : 'cursor-pointer text-neutral-800 hover:bg-neutral-50'}`}>
                                Importar configurações
                                <input type="file" accept=".json,application/json" onChange={importarTudo} disabled={somenteLeitura} className="hidden"/>
                            </label>
                        </div>
                        <p className="mt-1.5 text-xs text-neutral-500">
                            {somenteLeitura
                                ? 'A importação grava na unidade ativa: escolha no seletor uma unidade própria, em que você é administrador.'
                                : <>A importação só aceita o arquivo .json de &quot;Exportar configurações&quot;, com até 2 MB.</>}
                        </p>
                    </div>
                </section>
            )}
          </div>
        </div>
      )}
    </div>

      {/* MODAL RESTAURAR BACKUP - Confirmação Dupla */}
      <Modal open={!!modalRestaurar} onClose={() => { if (!restaurando) setModalRestaurar(null); }} maxWidth="lg" zIndex={70} hideCloseButton>
          {modalRestaurar && (
          <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
                      <div className="min-w-0">
                          <h3 className="text-base font-semibold text-neutral-900">Restaurar backup</h3>
                          <p className="mt-0.5 text-xs text-neutral-500">Apaga os dados de todas as clínicas e recoloca só o que está neste backup. Não pode ser desfeito.</p>
                      </div>
                      <button onClick={() => setModalRestaurar(null)} disabled={restaurando} aria-label="Fechar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50 disabled:opacity-50 sm:h-8 sm:w-8"><X size={16}/></button>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                      {/* O aviso repete o que a função restaurar_backup faz no banco, tabela por tabela: não resumir. */}
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-red-800"><AlertTriangle size={14}/> O que a restauração faz</div>
                          <ul className="ml-5 list-disc space-y-1.5 text-xs leading-relaxed text-neutral-800">
                              <li><strong>Apaga</strong> agendamentos, despesas, pacientes, serviços, vínculos da equipe, profissionais e clínicas de <strong>TODAS as clínicas da plataforma</strong>, não só desta.</li>
                              <li><strong>Recoloca só o que está na fotografia</strong> de {new Date(modalRestaurar.criado_em).toLocaleString('pt-BR')}: clínicas, profissionais, serviços, pacientes, agendamentos e despesas.</li>
                              <li><strong>O que não está na fotografia some junto e não volta:</strong> tratamentos, anamneses, documentos, evoluções e débitos dos pacientes; planos, tarefas e configurações das clínicas.</li>
                              <li><strong>Os vínculos da equipe com as clínicas não voltam:</strong> depois da restauração ninguém fica ligado a clínica nenhuma, e é preciso vincular cada pessoa de novo.</li>
                              <li>Tudo o que qualquer clínica registrou <strong>depois de {new Date(modalRestaurar.criado_em).toLocaleString('pt-BR')}</strong> se perde.</li>
                              <li><strong>Não pode ser desfeito.</strong> Um backup manual feito agora não protege o que some junto: ele guarda só essas mesmas seis tabelas.</li>
                          </ul>
                      </div>

                      <div className="rounded-xl border border-neutral-200 px-3 py-2">
                          <p className="text-xs text-neutral-500">Backup selecionado</p>
                          <p className="text-sm font-medium text-neutral-900">#{modalRestaurar.id} · {modalRestaurar.tipo}</p>
                          <p className="text-xs text-neutral-500">{new Date(modalRestaurar.criado_em).toLocaleString('pt-BR')} {modalRestaurar.tamanho_kb ? `· ${modalRestaurar.tamanho_kb} KB` : ''}</p>
                      </div>

                      <div>
                          <label htmlFor="confirmar-restauracao" className={campoLabel}>
                              Digite RESTAURAR para liberar o botão
                          </label>
                          {/* Sem foco automático: no celular o teclado abriria por cima do aviso antes de ele ser lido. */}
                          <input
                              id="confirmar-restauracao"
                              value={confirmacaoTexto}
                              onChange={e => setConfirmacaoTexto(e.target.value)}
                              placeholder="RESTAURAR"
                              autoCapitalize="characters"
                              autoCorrect="off"
                              autoComplete="off"
                              spellCheck={false}
                              disabled={restaurando}
                              className={`${campoInput} text-center font-mono tracking-wide ${restauracaoLiberada ? 'border-neutral-900' : ''}`}
                          />
                      </div>
                  </div>

                  <div className="flex shrink-0 gap-2 border-t border-neutral-200 px-4 py-3">
                      <button onClick={() => setModalRestaurar(null)} disabled={restaurando} className="h-11 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 sm:h-9">Cancelar</button>
                      <button
                          onClick={confirmarRestauracao}
                          disabled={!restauracaoLiberada || restaurando}
                          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 sm:h-9"
                      >
                          {restaurando ? <><Loader2 className="animate-spin" size={16}/> Restaurando...</> : <><RotateCcw size={16}/> Confirmar restauração</>}
                      </button>
                  </div>
              </div>
          )}
      </Modal>

      {/* MODAL EDITAR DOCUMENTO */}
      {/* Durante a gravação os popups não fecham: a resposta fecharia o próximo popup aberto. */}
      <Modal open={modalDoc && !!docEdit} onClose={() => { if (!salvandoPopup) setModalDoc(false); }} maxWidth="2xl" hideCloseButton>
          {docEdit && (
          <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                      <h3 className="text-base font-semibold text-neutral-900">{docs.find(d => d.id === docEdit.id) ? 'Editar modelo' : 'Novo modelo'}</h3>
                      <button onClick={() => { if (!salvandoPopup) setModalDoc(false); }} aria-label="Fechar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50 sm:h-8 sm:w-8"><X size={16}/></button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div className="md:col-span-2">
                              <label className={campoLabel}>Nome <span className="text-red-500">*</span></label>
                              <input value={docEdit.nome} onChange={e => setDocEdit({...docEdit, nome: e.target.value})} className={campoInput}/>
                          </div>
                          <div>
                              <label className={campoLabel}>Tipo</label>
                              <CustomSelect value={docEdit.tipo} onChange={v => setDocEdit({...docEdit, tipo: v as any})} options={[{value:'contrato',label:'Contrato'},{value:'receita',label:'Receita'},{value:'atestado',label:'Atestado'},{value:'outro',label:'Outro'}]} size="md"/>
                          </div>
                      </div>
                      <div>
                          <label className={campoLabel}>Conteúdo <span className="text-red-500">*</span></label>
                          {/* Celular: dezesseis botões pequenos empurravam o texto para fora da tela; viram uma lista só. */}
                          <div className="mb-2 sm:hidden">
                              <CustomSelect
                                  value=""
                                  onChange={(chave) => { if (chave) inserirVariavelDoc(chave); }}
                                  options={DOCUMENTO_VARIAVEIS.map((v) => ({ value: String(v.chave), label: v.label }))}
                                  placeholder="Inserir variável no texto"
                                  size="md"
                              />
                          </div>
                          <div className="mb-2 hidden flex-wrap gap-1 sm:flex">
                              {DOCUMENTO_VARIAVEIS.map(v => (
                                  <button key={v.chave} type="button" onClick={() => inserirVariavelDoc(String(v.chave))} title={tokenVariavelLabel(v.label)} className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50">{v.label}</button>
                              ))}
                          </div>
                          <DocumentoVariavelEditor
                              ref={docEditorRef}
                              value={docEdit.conteudo}
                              onChange={(conteudo) => setDocEdit({ ...docEdit, conteudo })}
                              placeholder="Digite o texto do modelo e insira as variáveis acima..."
                          />
                          <div className="mt-2 rounded-xl border border-neutral-200 bg-[#f8f8f6] p-3">
                              <p className="mb-1 text-xs font-medium text-neutral-500">Pré-visualização</p>
                              <p className="whitespace-pre-line text-sm text-neutral-800">{docPreview || '—'}</p>
                          </div>
                      </div>
                  </div>
                  <div className="flex gap-2 border-t border-neutral-200 px-4 py-3">
                      <button onClick={() => { if (!salvandoPopup) setModalDoc(false); }} disabled={salvandoPopup} className="h-11 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 sm:h-9">Cancelar</button>
                      <button onClick={() => { void salvarDocEdit(); }} disabled={salvandoPopup || somenteLeitura} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">{salvandoPopup ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar</button>
                  </div>
              </div>
          )}
      </Modal>

      {/* MODAL TEMPLATE COMUNICAÇÃO */}
      <Modal open={modalTemplateCom && !!templateComEdit} onClose={() => { if (!salvandoPopup) setModalTemplateCom(false); }} maxWidth="2xl" hideCloseButton>
          {templateComEdit && (
          <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                      <h3 className="text-base font-semibold text-neutral-900">{templatesComunicacao.find(t => t.id === templateComEdit.id) ? 'Editar template' : 'Novo template'}</h3>
                      <button onClick={() => { if (!salvandoPopup) setModalTemplateCom(false); }} aria-label="Fechar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50 sm:h-8 sm:w-8"><X size={16}/></button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
                          <div className="min-w-0">
                              <label className={campoLabel}>Nome <span className="text-red-500">*</span></label>
                              <input value={templateComEdit.nome} onChange={e => setTemplateComEdit({ ...templateComEdit, nome: e.target.value })} className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900"/>
                          </div>
                          <div className="min-w-0">
                              <label className={campoLabel}>Canal</label>
                              <CustomSelect value={templateComEdit.canal} onChange={v => setTemplateComEdit({ ...templateComEdit, canal: v as TemplateComunicacao['canal'] })} options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'E-mail' }, { value: 'sms', label: 'SMS' }]} size="md"/>
                          </div>
                      </div>
                      {templateComEdit.canal === 'email' && (
                          <div>
                              <label className={campoLabel}>Assunto</label>
                              <input value={templateComEdit.assunto || ''} onChange={e => setTemplateComEdit({ ...templateComEdit, assunto: e.target.value })} className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900"/>
                          </div>
                      )}
                      <div>
                          <label className={campoLabel}>Mensagem <span className="text-red-500">*</span></label>
                          <textarea value={templateComEdit.corpo} onChange={e => setTemplateComEdit({ ...templateComEdit, corpo: e.target.value })} rows={6} className="box-border w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900"/>
                      </div>
                  </div>
                  <div className="flex gap-2 border-t border-neutral-200 px-4 py-3">
                      <button onClick={() => { if (!salvandoPopup) setModalTemplateCom(false); }} disabled={salvandoPopup} className="h-11 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 sm:h-9">Cancelar</button>
                      <button onClick={() => { void salvarTemplateComEdit(); }} disabled={salvandoPopup || somenteLeitura} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">{salvandoPopup ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar</button>
                  </div>
              </div>
          )}
      </Modal>

      {/* MODAL CATEGORIA FINANCEIRA */}
      {/* O miolo rola e o rodapé fica fixo: com as cores abertas o popup passava da tela do celular e levava o Salvar junto. */}
      <Modal open={modalCatFin && !!catFinEdit} onClose={() => { if (salvandoPopup) return; setModalCatFin(false); setCatFinEdit(null); setCorCatAberta(false); }} maxWidth="md" hideCloseButton>
          {catFinEdit && (
          <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3">
                  <h3 className="text-base font-semibold text-neutral-900">{catsFin.find(c => c.id === catFinEdit.id) ? 'Editar categoria' : 'Nova categoria'}</h3>
                  <button onClick={() => { if (salvandoPopup) return; setModalCatFin(false); setCatFinEdit(null); }} aria-label="Fechar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50 sm:h-8 sm:w-8"><X size={16}/></button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  <div>
                      <label className={campoLabel}>Nome <span className="text-red-500">*</span></label>
                      <input value={catFinEdit.nome} onChange={e => setCatFinEdit({ ...catFinEdit, nome: e.target.value })} className={campoInput}/>
                  </div>
                  <div>
                      <label className={campoLabel}>Tipo</label>
                      {/* 48px no celular: descontada a moldura, cada metade fica com 42px de toque. */}
                      <div className="grid h-12 grid-cols-2 rounded-md border border-neutral-200 p-0.5 sm:h-10">
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
                                      <button key={cor} type="button" onClick={() => { guardarCorRecente(cor); setCatFinEdit({ ...catFinEdit, cor }); setCorCatAberta(false); }} className={`h-10 rounded-md border sm:h-8 ${catFinEdit.cor.toLowerCase() === cor ? 'border-neutral-900' : 'border-black/10'}`} style={{ backgroundColor: cor }} aria-label={cor} />
                                  ))}
                              </div>
                              {lerCoresRecentes().length > 0 && (
                                  <>
                                      <p className="mb-2 mt-3 text-xs font-medium text-neutral-500">Últimas usadas</p>
                                      <div className="flex flex-wrap gap-1.5">
                                          {lerCoresRecentes().map((cor) => (
                                              <button key={cor} type="button" onClick={() => { guardarCorRecente(cor); setCatFinEdit({ ...catFinEdit, cor }); setCorCatAberta(false); }} className="h-10 w-10 rounded-md border border-black/10 sm:h-8 sm:w-8" style={{ backgroundColor: cor }} aria-label={cor} />
                                          ))}
                                      </div>
                                  </>
                              )}
                              <label className="mt-3 flex items-center gap-2 text-xs font-medium text-neutral-600">
                                  Personalizar
                                  <input type="color" value={catFinEdit.cor} onChange={e => { guardarCorRecente(e.target.value); setCatFinEdit({ ...catFinEdit, cor: e.target.value }); }} className="h-10 w-12 cursor-pointer rounded-md border border-neutral-200 bg-white sm:h-8 sm:w-10" />
                              </label>
                          </div>
                      )}
                  </div>
              </div>
              <div className="flex shrink-0 gap-2 border-t border-neutral-200 px-4 py-3">
                  <button onClick={() => { if (salvandoPopup) return; setModalCatFin(false); setCatFinEdit(null); }} disabled={salvandoPopup} className="h-11 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 sm:h-9">Cancelar</button>
                  <button onClick={() => { void salvarCatFinModal(); }} disabled={salvandoPopup || somenteLeitura} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">{salvandoPopup ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar</button>
              </div>
          </div>
          )}
      </Modal>

      {/* MODAL CRIAR/EDITAR MODELO ANAMNESE */}
      <Modal open={modalModelo && !!modeloEdit} onClose={() => { if (!salvandoPopup) setModalModelo(false); }} maxWidth="2xl" hideCloseButton>
          {modeloEdit && (
          <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                      <div>
                          <h3 className="text-base font-semibold text-neutral-900">{modelos.find(m => m.id === modeloEdit.id) ? 'Editar modelo' : 'Novo modelo'}</h3>
                          <p className="text-xs text-neutral-500">Perguntas do questionário.</p>
                      </div>
                      <button onClick={() => { if (!salvandoPopup) setModalModelo(false); }} aria-label="Fechar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50 sm:h-8 sm:w-8"><X size={16}/></button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div>
                              <label className={campoLabel}>Nome <span className="text-red-500">*</span></label>
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
                              <button onClick={adicionarPergunta} className="inline-flex h-10 items-center gap-1 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:h-8 sm:px-2 sm:text-xs"><Plus size={12}/> Adicionar</button>
                          </div>
                          <div className="space-y-1.5" ref={perguntasListRef}>
                              {modeloEdit.perguntas.map((p, idx) => (
                                  <div key={p.id} className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-[#f8f8f6] p-2">
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-xs font-medium text-neutral-600">{idx + 1}</div>
                                      <div className="min-w-0 flex-1 space-y-1.5">
                                          <input value={p.label} onChange={e => atualizarPergunta(idx, { label: e.target.value })} className={campoInput} placeholder="Texto da pergunta"/>
                                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                                              <CustomSelect value={p.tipo} onChange={v => atualizarPergunta(idx, { tipo: v as TipoPergunta, opcoes: v === 'multipla' ? (p.opcoes || ['Opção 1']) : undefined })} options={[{value:'texto',label:'Texto livre'},{value:'sim_nao',label:'Sim / Não'},{value:'sim_nao_texto',label:'Sim / Não + Texto'},{value:'multipla',label:'Múltipla escolha'}]} size="sm"/>
                                              {p.tipo === 'multipla' && (
                                                  <input value={(p.opcoes || []).join(', ')} onChange={e => atualizarPergunta(idx, { opcoes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className={campoInput} placeholder="Opções separadas por vírgula"/>
                                              )}
                                          </div>
                                      </div>
                                      <button onClick={() => removerPergunta(idx)} aria-label={`Excluir pergunta ${idx + 1}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-white hover:text-rose-600 sm:h-8 sm:w-8"><Trash2 size={14}/></button>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
                  <div className="flex gap-2 border-t border-neutral-200 px-4 py-3">
                      <button onClick={() => { if (!salvandoPopup) setModalModelo(false); }} disabled={salvandoPopup} className="h-11 flex-1 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 sm:h-9">Cancelar</button>
                      <button onClick={() => { void salvarModelo(); }} disabled={salvandoPopup || somenteLeitura} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">{salvandoPopup ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar</button>
                  </div>
              </div>
          )}
      </Modal>

      {/* MODAL EDIÇÃO COMPLETA CLÍNICA */}
      {/* Cabeçalho e rodapé ficam parados e só os campos rolam: no celular o formulário é mais alto que a tela e o Salvar saía dela. */}
      <Modal open={modalClinicaCompleto} onClose={fecharModalClinica} maxWidth="4xl" hideCloseButton panelClassName="rounded-xl border border-neutral-200 bg-white">
          <div className="flex max-h-[90dvh] min-h-0 flex-col px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-black/5 pb-4">
                  <div className="flex min-w-0 items-center gap-3.5">
                      <label className="relative h-16 w-16 shrink-0 cursor-pointer">
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={escolherLogo} disabled={carregandoClinica || salvandoClinica} />
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
                  <button type="button" onClick={fecharModalClinica} disabled={salvandoClinica} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50 sm:h-[34px] sm:w-[34px]" aria-label="Fechar"><X size={18}/></button>
              </div>

              <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:-mx-6 sm:px-6">
              {carregandoClinica ? (
                  // Os campos só aparecem com a linha do banco: preenchidos da lista, o Salvar apagava o que a clínica tinha.
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
                      {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-50" />)}
                  </div>
              ) : (<>
              <section>
                  <h4 className="mb-3 text-sm font-semibold text-neutral-900">Identificação</h4>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 sm:gap-y-2.5 lg:grid-cols-4">
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
                          {/* 48px no celular: descontada a moldura do controle, cada opção fica com 42px de toque. */}
                          <SegmentedControl
                              className="!h-12 sm:!h-10"
                              value={clinicaForm.emitir_notas_em_nome === 'profissional' ? 'profissional' : 'clinica'}
                              onChange={(v) => setClinicaForm({ ...clinicaForm, emitir_notas_em_nome: v })}
                              options={[
                                  { value: 'clinica', label: 'Clínica' },
                                  { value: 'profissional', label: 'Profissional' },
                              ]}
                          />
                      </div>
                  </div>
              </section>

              <section className="mt-5 border-t border-black/5 pt-4">
                  <h4 className="mb-3 text-sm font-semibold text-neutral-900">Endereço</h4>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 sm:gap-y-2.5 lg:grid-cols-4">
                      <label className="min-w-0">
                          <span className={labelModal}>CEP <span className="text-red-500">*</span> {buscandoCepClinica && <Loader2 size={12} className="ml-1 inline animate-spin" />}</span>
                          <input value={clinicaForm.cep} onChange={e => { setClinicaForm({...clinicaForm, cep: e.target.value}); if (e.target.value.replace(/\D/g, '').length === 8) buscarCepClinica(e.target.value); }} onBlur={() => buscarCepClinica(clinicaForm.cep)} className={campoModal} placeholder="00000-000"/>
                      </label>
                      <label className="min-w-0"><span className={labelModal}>Rua / avenida <span className="text-red-500">*</span></span><input value={clinicaForm.rua} onChange={e => setClinicaForm({...clinicaForm, rua: e.target.value})} className={campoModal} placeholder="Rua / Avenida"/></label>
                      <label className="min-w-0"><span className={labelModal}>Número <span className="text-red-500">*</span></span><input value={clinicaForm.numero} onChange={e => setClinicaForm({...clinicaForm, numero: e.target.value})} className={campoModal} placeholder="Nº"/></label>
                      <label className="min-w-0"><span className={labelModal}>Complemento</span><input value={clinicaForm.complemento} onChange={e => setClinicaForm({...clinicaForm, complemento: e.target.value})} className={campoModal} placeholder="Apto, bloco, sala"/></label>
                      <label className="min-w-0"><span className={labelModal}>Bairro <span className="text-red-500">*</span></span><input value={clinicaForm.bairro} onChange={e => setClinicaForm({...clinicaForm, bairro: e.target.value})} className={campoModal} placeholder="Bairro"/></label>
                      <label className="min-w-0"><span className={labelModal}>Cidade <span className="text-red-500">*</span></span><input value={clinicaForm.cidade} onChange={e => setClinicaForm({...clinicaForm, cidade: e.target.value})} className={campoModal} placeholder="Cidade"/></label>
                      <label className="min-w-0"><span className={labelModal}>UF <span className="text-red-500">*</span></span><CustomSelect value={clinicaForm.uf || ''} onChange={v => setClinicaForm({...clinicaForm, uf: v})} options={UF_OPTIONS} size="md"/></label>
                  </div>
              </section>
              </>)}
              </div>

              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-black/5 pt-4">
                  <button type="button" onClick={fecharModalClinica} disabled={salvandoClinica} className="h-11 px-3 text-sm font-medium text-neutral-500 hover:text-neutral-900 disabled:opacity-50 sm:h-10">Cancelar</button>
                  {/* Travado enquanto carrega e enquanto grava: dois toques cadastravam duas clínicas. */}
                  <button type="button" onClick={() => { void salvarClinicaCompleta(); }} disabled={carregandoClinica || salvandoClinica} className="inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 sm:h-10">
                      {salvandoClinica && <Loader2 size={14} className="animate-spin" />}
                      {clinicaEditando ? 'Salvar' : 'Cadastrar'}
                  </button>
              </div>
          </div>
      </Modal>

    </>
  );
}