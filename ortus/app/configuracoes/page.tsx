'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, Users, Plus, Trash2, MapPin, Check, X, Loader2, Edit, UserPlus, Shield, User, FileText, Phone, Mail, Save, Lock, ClipboardList, HelpCircle, FileSignature, Tag, SlidersHorizontal, Database, Download, Upload, Bell, Palette, RotateCcw, AlertTriangle, Clock } from 'lucide-react';
import { carregarModelos, salvarModelos, novoIdModelo, novoIdPergunta, type ModeloAnamnese, type PerguntaAnamnese, type TipoPergunta } from '@/lib/anamnese';
import { listarBackups, criarBackupAgora, baixarBackupComoJson, excluirBackup as deletarBackupServer, restaurarBackup } from '@/lib/backup';
import { fetchUserClinicas, fetchUserEquipe } from '@/lib/clinicScoped';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import CustomSelect from '@/components/ui/CustomSelect';
import { useCustomAlert } from '@/components/ui/CustomAlert';

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
    { id: 'doc_contrato_1', tipo: 'contrato', nome: 'Contrato de Prestação de Serviços Odontológicos', conteudo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS\n\nPelo presente instrumento, de um lado [NOME DA CLÍNICA], inscrita no CNPJ [CNPJ], doravante denominada CONTRATADA, e de outro lado {{paciente_nome}}, CPF {{paciente_cpf}}, doravante denominado(a) CONTRATANTE, têm entre si justo e contratado o seguinte:\n\nCLÁUSULA 1 - DO OBJETO\nA CONTRATADA prestará serviços odontológicos ao CONTRATANTE conforme plano de tratamento previamente apresentado.\n\nCLÁUSULA 2 - DO VALOR\nO valor total do tratamento é de R$ ____ (___________), a ser pago da seguinte forma: ____.\n\nCLÁUSULA 3 - DAS RESPONSABILIDADES\nO paciente compromete-se a comparecer às consultas e seguir as orientações do profissional.\n\n_____________, ___ de ________ de _____.\n\n___________________\nCONTRATADA\n\n___________________\nCONTRATANTE' },
    { id: 'doc_termo_1', tipo: 'outro', nome: 'Termo de Consentimento Livre e Esclarecido', conteudo: 'TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO\n\nEu, {{paciente_nome}}, declaro que fui devidamente informado(a) pelo profissional sobre o tratamento odontológico a ser realizado, seus riscos, benefícios, alternativas e prognóstico.\n\nEstou ciente de que ____________________________.\n\nAutorizo a realização do procedimento.\n\n____, ___ de ________ de _____.\n\n____________________\nAssinatura do Paciente' },
];


export default function Configuracoes() {
  const [abaAtiva, setAbaAtiva] = useState('clinicas');
  const [loading, setLoading] = useState(true);
  const { showAlert, showConfirm } = useCustomAlert();
  // Gate de acesso: só admin de tenant ou super admin podem entrar.
  const [perfilCaller, setPerfilCaller] = useState<any>(null);

  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  
  // MODAL CLÍNICA
  const [modalClinica, setModalClinica] = useState(false);
  const [novaClinica, setNovaClinica] = useState('');
  
  // MODAL EDIÇÃO COMPLETA CLÍNICA
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

  // GERAL / Preferências
  const [prefs, setPrefs] = useState<any>(PREFS_PADRAO);

  // CATEGORIAS FINANCEIRAS
  const [catsFin, setCatsFin] = useState<string[]>([]);
  const [novaCatFin, setNovaCatFin] = useState('');

  // MODELOS DE DOCUMENTOS (Contratos / Outros)
  const [docs, setDocs] = useState<ModeloDocumento[]>([]);
  const [modalDoc, setModalDoc] = useState(false);
  const [docEdit, setDocEdit] = useState<ModeloDocumento | null>(null);

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
          if (aba) setAbaAtiva(aba);
      }
      carregarDados();
      setModelos(carregarModelos());
      recarregarBackups();
  }, []);

  // Carregar configs do Supabase após clinicas carregarem
  useEffect(() => {
      if (clinicas.length === 0) return;
      const cid = clinicas[0]?.id || '0';
      carregarConfig(cid, 'preferencias', 'ortus_preferencias', PREFS_PADRAO).then(p => setPrefs({ ...PREFS_PADRAO, ...(p || {}) }));
      carregarConfig(cid, 'categorias_financeiro', 'ortus_categorias_financeiro', []).then(c => setCatsFin(c || []));
      carregarConfig(cid, 'modelos_documentos', 'ortus_modelos_documentos', DOCS_PADRAO).then(d => setDocs(d && d.length ? d : DOCS_PADRAO));
  }, [clinicas]);

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

  // ===== CATEGORIAS FINANCEIRAS =====
  function adicionarCatFin() {
      const n = novaCatFin.trim(); if (!n) return;
      if (catsFin.find(c => c.toLowerCase() === n.toLowerCase())) { showAlert('Categoria já existe.', { type: 'warning' }); return; }
      const novas = [...catsFin, n].sort();
      setCatsFin(novas); const cid = clinicas[0]?.id || '0'; salvarConfig(cid, 'categorias_financeiro', novas); setNovaCatFin('');
  }
  async function removerCatFin(c: string) {
      if (!(await showConfirm(`Excluir categoria "${c}"?`, { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      const novas = catsFin.filter(x => x !== c);
      setCatsFin(novas); const cid = clinicas[0]?.id || '0'; salvarConfig(cid, 'categorias_financeiro', novas);
  }
  function renomearCatFin(antiga: string) {
      const nova = prompt('Novo nome:', antiga);
      if (!nova || nova.trim() === antiga) return;
      const novas = catsFin.map(c => c === antiga ? nova.trim() : c).sort();
      setCatsFin(novas); const cid = clinicas[0]?.id || '0'; salvarConfig(cid, 'categorias_financeiro', novas);
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

  // ===== BACKUP =====
  function exportarTudo() {
      const tudo = {
          versao: 1,
          exportado_em: new Date().toISOString(),
          preferencias: prefs,
          categorias_financeiro: catsFin,
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
              if (obj.categorias_financeiro) { setCatsFin(obj.categorias_financeiro); salvarConfig(cidB, 'categorias_financeiro', obj.categorias_financeiro); }
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
  }
  function atualizarPergunta(idx: number, patch: Partial<PerguntaAnamnese>) {
      if (!modeloEdit) return;
      const novas = modeloEdit.perguntas.map((p, i) => i === idx ? { ...p, ...patch } : p);
      setModeloEdit({ ...modeloEdit, perguntas: novas });
  }
  function removerPergunta(idx: number) {
      if (!modeloEdit) return;
      setModeloEdit({ ...modeloEdit, perguntas: modeloEdit.perguntas.filter((_, i) => i !== idx) });
  }
  function salvarModelo() {
      if (!modeloEdit) return;
      if (!modeloEdit.nome.trim()) { showAlert('Informe o nome do modelo.', { type: 'warning' }); return; }
      const perguntasValidas = modeloEdit.perguntas.filter(p => p.label.trim());
      if (perguntasValidas.length === 0) { showAlert('Adicione pelo menos uma pergunta.', { type: 'warning' }); return; }
      const limpo = { ...modeloEdit, perguntas: perguntasValidas, padrao: false };
      const existe = modelos.findIndex(m => m.id === limpo.id);
      const novos = existe >= 0 ? modelos.map((m, i) => i === existe ? limpo : m) : [...modelos, limpo];
      setModelos(novos);
      salvarModelos(novos);
      setModalModelo(false);
      setModeloEdit(null);
  }
  async function excluirModelo(id: string) {
      const m = modelos.find(x => x.id === id);
      if (m?.padrao) { showAlert('Modelos padrão não podem ser excluídos.', { type: 'warning' }); return; }
      if (!(await showConfirm('Excluir este modelo?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      const novos = modelos.filter(x => x.id !== id);
      setModelos(novos);
      salvarModelos(novos);
  }
  function duplicarModelo(m: ModeloAnamnese) {
      const copia: ModeloAnamnese = {
          ...m,
          id: novoIdModelo(),
          nome: m.nome + ' (Cópia)',
          padrao: false,
          perguntas: m.perguntas.map(p => ({ ...p, id: novoIdPergunta() })),
      };
      const novos = [...modelos, copia];
      setModelos(novos);
      salvarModelos(novos);
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

  async function carregarDados() {
      setLoading(true);
      // 1) Identifica o usuário logado e checa permissão antes de
      //    qualquer SELECT em tabelas sensíveis.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPerfilCaller(null); setLoading(false); return; }
      const { data: meu } = await supabase
          .from('profissionais')
          .select('id, nivel_acesso, is_super_admin')
          .eq('user_id', user.id)
          .maybeSingle();
      setPerfilCaller(meu);

      const podeVerEquipe = meu?.nivel_acesso === 'admin' || meu?.is_super_admin;

      // 2) Multi-tenant: clínicas e equipe sempre filtradas pelo helper.
      //    A lista de profissionais só carrega se o usuário tem permissão.
      const c = await fetchUserClinicas();
      setClinicas(c || []);
      if (podeVerEquipe) {
          const equipe = await fetchUserEquipe();
          setProfissionais(equipe || []);
      } else {
          setProfissionais([]);
      }
      setLoading(false);
  }

  // --- CLÍNICAS ---
  // Cria uma nova clínica DENTRO da rede do usuário logado e vincula ele
  // automaticamente como membro (caso contrário, com RLS ativo, ninguém
  // mais conseguiria enxergar a clínica recém-criada).
  async function criarClinica() {
      if (!novaClinica) return;
      try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) { await showAlert('Sessão expirada. Faça login novamente.', { type: 'error' }); return; }

          // 1) Profissional + rede_id atual do usuário (via primeiro vínculo)
          const { data: prof } = await supabase
              .from('profissionais')
              .select('id, is_super_admin')
              .eq('user_id', session.user.id)
              .maybeSingle();

          if (!prof?.id) {
              await showAlert('Não foi possível identificar seu perfil. Contate o suporte.', { type: 'error' });
              return;
          }

          let redeId: any = null;
          const { data: vinculos } = await supabase
              .from('profissionais_clinicas')
              .select('clinicas(rede_id)')
              .eq('profissional_id', prof.id)
              .limit(1);
          const primeiroVinculo: any = vinculos?.[0]?.clinicas;
          redeId = primeiroVinculo?.rede_id ?? null;

          if (!redeId && !prof.is_super_admin) {
              await showAlert('Sua conta não está vinculada a nenhuma rede. Contate o suporte para configurar sua rede antes de criar clínicas.', { type: 'error' });
              return;
          }

          // 2) Cria a clínica já com rede_id (se houver)
          const payload: any = { nome: novaClinica.trim() };
          if (redeId !== null && redeId !== undefined) payload.rede_id = redeId;

          const { data: novaC, error } = await supabase
              .from('clinicas')
              .insert([payload])
              .select('id')
              .single();
          if (error || !novaC) {
              await showAlert('Erro ao criar clínica: ' + (error?.message || 'desconhecido'), { type: 'error' });
              return;
          }

          // 3) Vincula o criador à nova clínica para que ele a enxergue
          const { error: vincErr } = await supabase
              .from('profissionais_clinicas')
              .insert([{ profissional_id: prof.id, clinica_id: novaC.id }]);
          if (vincErr) {
              console.error('Aviso: clínica criada mas vínculo falhou:', vincErr);
              showAlert('Clínica criada, mas não foi possível vincular você automaticamente. Vincule manualmente em /ajustes/equipe.', { type: 'warning' });
          }

          setNovaClinica('');
          setModalClinica(false);
          carregarDados();
      } catch (e: any) {
          console.error(e);
          showAlert('Erro inesperado: ' + (e?.message || e), { type: 'error' });
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
          carregarDados();
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
      setModalClinicaCompleto(true);
  }

  // Salvar clínica completa (edição)
  async function salvarClinicaCompleta() {
      if (!clinicaForm.nome.trim()) {
          showAlert('Nome da clínica é obrigatório', { type: 'warning' });
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

      const { error } = await supabase
          .from('clinicas')
          .update(payload)
          .eq('id', clinicaEditando.id);

      if (error) {
          showAlert('Erro ao salvar: ' + error.message, { type: 'error' });
      } else {
          showAlert('Clínica atualizada com sucesso!', { type: 'success' });
          setModalClinicaCompleto(false);
          setClinicaEditando(null);
          carregarDados();
      }
  }

  // Upload de logo
  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
          showAlert('Selecione uma imagem válida', { type: 'warning' });
          return;
      }
      if (file.size > 2 * 1024 * 1024) {
          showAlert('Imagem deve ter no máximo 2MB', { type: 'warning' });
          return;
      }

      setUploadingLogo(true);
      try {
          const fileExt = file.name.split('.').pop();
          const fileName = `clinica-${clinicaEditando.id}-${Date.now()}.${fileExt}`;
          const filePath = `${fileName}`;

          const { error: uploadError } = await supabase.storage
              .from('clinicas-logos')
              .upload(filePath, file, { upsert: true });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
              .from('clinicas-logos')
              .getPublicUrl(filePath);

          setClinicaForm(prev => ({ ...prev, logo_url: publicUrl }));
          showAlert('Logo enviada com sucesso!', { type: 'success' });
      } catch (err: any) {
          showAlert('Erro ao enviar logo: ' + err.message, { type: 'error' });
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
          carregarDados();
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
          carregarDados();
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
    <div className="max-w-6xl mx-auto pb-20 space-y-6 sm:space-y-8 animate-fade-in">
      
      <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800">Configurações</h1>
          <p className="text-slate-500 text-sm font-medium">Gerencie suas unidades e equipe completa.</p>
      </div>

      <div className="flex gap-4 border-b border-slate-200">
          <div className="flex gap-1 overflow-x-auto pb-1 -mb-1">
              <button onClick={() => setAbaAtiva('clinicas')} className={`pb-4 px-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${abaAtiva === 'clinicas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Building2 size={16}/> Clínicas</button>
              {(perfilCaller?.nivel_acesso === 'admin' || perfilCaller?.is_super_admin) && (
                <button onClick={() => setAbaAtiva('equipe')} className={`pb-4 px-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${abaAtiva === 'equipe' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Users size={16}/> Equipe</button>
              )}
              <button onClick={() => setAbaAtiva('geral')} className={`pb-4 px-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${abaAtiva === 'geral' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><SlidersHorizontal size={16}/> Geral</button>
              <button onClick={() => setAbaAtiva('anamnese')} className={`pb-4 px-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${abaAtiva === 'anamnese' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><ClipboardList size={16}/> Anamnese</button>
              <button onClick={() => setAbaAtiva('documentos')} className={`pb-4 px-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${abaAtiva === 'documentos' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><FileSignature size={16}/> Contratos & Docs</button>
              <button onClick={() => setAbaAtiva('categorias')} className={`pb-4 px-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${abaAtiva === 'categorias' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Tag size={16}/> Categorias Fin.</button>
              <button onClick={() => setAbaAtiva('backup')} className={`pb-4 px-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${abaAtiva === 'backup' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Database size={16}/> Backup</button>
          </div>
      </div>

      {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-slate-300"/></div> : (
        <>
            {/* ABA CLÍNICAS */}
            {abaAtiva === 'clinicas' && (
                <div className="space-y-6 animate-in slide-in-from-left-4">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-700 text-lg">Unidades Cadastradas</h3>
                            <button onClick={() => setModalClinica(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200"><Plus size={16}/> Nova Clínica</button>
                        </div>
                        <div className="space-y-3">
                            {clinicas.map(c => (
                                <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-blue-600 border border-slate-200 font-bold overflow-hidden">
                                            {c.logo_url ? <img src={c.logo_url} className="w-full h-full object-cover"/> : <Building2 size={20}/>}
                                        </div>
                                        <div>
                                            <span className="font-bold text-slate-700 block">{c.nome}</span>
                                            {c.cnpj && <span className="text-xs text-slate-400">CNPJ: {c.cnpj}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => abrirEdicaoClinica(c)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all" title="Editar"><Edit size={18}/></button>
                                        <button onClick={() => excluirClinica(c.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-all" title="Excluir"><Trash2 size={18}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ABA EQUIPE */}
            {abaAtiva === 'equipe' && (perfilCaller?.nivel_acesso === 'admin' || perfilCaller?.is_super_admin) && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                            <h3 className="font-bold text-slate-700 text-lg">Profissionais</h3>
                            <button onClick={abrirNovoProf} className="bg-green-600 text-white px-3 py-2 rounded-xl font-bold text-xs sm:text-sm hover:bg-green-700 flex items-center gap-2 shadow-sm"><UserPlus size={14}/> Adicionar</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {profissionais.map(p => (
                                <div key={p.id} className="p-5 border border-slate-100 rounded-2xl bg-slate-50 hover:bg-white hover:shadow-md transition-all relative group flex flex-col justify-between h-full">
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg overflow-hidden border-2 border-white shadow-sm">
                                                    {p.foto_url ? <img src={p.foto_url} className="w-full h-full object-cover"/> : p.nome.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 leading-tight">{p.nome}</h4>
                                                    <p className="text-xs text-slate-400 font-bold">{p.cargo}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => abrirEditarProf(p)} className="p-2 text-slate-400 hover:text-blue-600 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-all"><Edit size={16}/></button>
                                        </div>
                                        
                                        <div className="space-y-2 mb-4">
                                            {p.telefone && <div className="flex items-center gap-2 text-xs text-slate-500 font-medium"><Phone size={12}/> {p.telefone}</div>}
                                            <div className="flex items-center gap-2 mt-2">
                                                {p.nivel_acesso === 'admin' && <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-purple-100 text-purple-700 flex items-center gap-1 border border-purple-200"><Shield size={10}/> Admin</span>}
                                                {p.cro && <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1"><FileText size={10}/> {p.conselho || 'CRO'}: {p.cro}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    <button onClick={() => abrirVinculos(p)} className="w-full py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2 mt-auto">
                                        <MapPin size={14}/> Gerenciar Unidades
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ABA ANAMNESE */}
            {abaAtiva === 'anamnese' && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2"><ClipboardList size={20} className="text-blue-500"/> Modelos de Anamnese</h3>
                                <p className="text-xs text-slate-400 font-medium mt-1">Crie modelos com perguntas personalizadas para usar com pacientes.</p>
                            </div>
                            <button onClick={abrirNovoModelo} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200"><Plus size={16}/> Novo Modelo</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {modelos.map(m => (
                                <div key={m.id} className="p-5 border border-slate-100 rounded-2xl bg-slate-50 hover:bg-white hover:shadow-md transition-all relative group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-slate-800 truncate">{m.nome}</h4>
                                                {m.padrao && <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">Padrão</span>}
                                            </div>
                                            {m.descricao && <p className="text-xs text-slate-500">{m.descricao}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 font-bold mb-4">
                                        <HelpCircle size={12}/> {m.perguntas.length} pergunta{m.perguntas.length !== 1 ? 's' : ''}
                                    </div>
                                    <div className="space-y-1.5 max-h-32 overflow-y-auto mb-4">
                                        {m.perguntas.slice(0, 5).map(p => (
                                            <div key={p.id} className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-100 truncate">
                                                <span className="text-slate-400 font-bold mr-1">{p.tipo === 'sim_nao' ? '◉' : p.tipo === 'multipla' ? '☰' : '▭'}</span>
                                                {p.label}
                                            </div>
                                        ))}
                                        {m.perguntas.length > 5 && <div className="text-[10px] text-slate-400 text-center">+ {m.perguntas.length - 5} mais</div>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => abrirEditarModelo(m)} className="flex-1 py-2 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-1"><Edit size={12}/> Editar</button>
                                        <button onClick={() => duplicarModelo(m)} className="py-2 px-3 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-500 hover:border-purple-400 hover:text-purple-600">Duplicar</button>
                                        {!m.padrao && <button onClick={() => excluirModelo(m.id)} className="py-2 px-3 text-xs font-bold rounded-lg bg-white border border-slate-200 text-rose-400 hover:border-rose-400 hover:text-rose-600"><Trash2 size={12}/></button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ABA GERAL / PREFERÊNCIAS */}
            {abaAtiva === 'geral' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
                        <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2"><SlidersHorizontal size={20} className="text-blue-500"/> Preferências Gerais</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome para Documentos</label><input value={prefs.nome_clinica} onChange={e => atualizarPref('nome_clinica', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="Ex: Clínica Sorriso"/></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">CNPJ</label><input value={prefs.cnpj} onChange={e => atualizarPref('cnpj', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium" placeholder="00.000.000/0000-00"/></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Slogan / Subtítulo</label><input value={prefs.slogan} onChange={e => atualizarPref('slogan', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium" placeholder="Ex: Odontologia Integrada"/></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Cabeçalho dos Documentos</label><textarea value={prefs.cabecalho_documentos} onChange={e => atualizarPref('cabecalho_documentos', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium h-20 resize-none" placeholder="Endereço, telefone e responsável técnico..."/></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Rodapé dos Documentos</label><input value={prefs.rodape_documentos} onChange={e => atualizarPref('rodape_documentos', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"/></div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                        <h3 className="font-bold text-slate-700 text-lg">Horário de Atendimento</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Abertura</label><input type="time" value={prefs.horario_abertura} onChange={e => atualizarPref('horario_abertura', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"/></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Fechamento</label><input type="time" value={prefs.horario_fechamento} onChange={e => atualizarPref('horario_fechamento', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"/></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Duração Padrão Consulta (min)</label><input type="number" value={prefs.duracao_consulta_padrao} onChange={e => atualizarPref('duracao_consulta_padrao', parseInt(e.target.value)||60)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"/></div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Dias de Atendimento</label>
                            <div className="flex flex-wrap gap-2">
                                {[{k:'seg',l:'Seg'},{k:'ter',l:'Ter'},{k:'qua',l:'Qua'},{k:'qui',l:'Qui'},{k:'sex',l:'Sex'},{k:'sab',l:'Sáb'},{k:'dom',l:'Dom'}].map(d => (
                                    <button key={d.k} onClick={() => toggleDia(d.k)} className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${prefs.dias_atendimento[d.k] ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}>{d.l}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                        <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2"><Bell size={18} className="text-amber-500"/> Notificações</h3>
                        {[
                            { k: 'notificar_aniversariantes', l: 'Avisar sobre aniversariantes do dia' },
                            { k: 'notificar_debitos', l: 'Avisar sobre pacientes com débitos pendentes' },
                            { k: 'confirmar_exclusao', l: 'Pedir confirmação antes de excluir registros' },
                        ].map(it => (
                            <label key={it.k} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100">
                                <span className="text-sm font-bold text-slate-700">{it.l}</span>
                                <button type="button" onClick={() => atualizarPref(it.k, !prefs[it.k])} className={`w-12 h-6 rounded-full relative transition-all ${prefs[it.k] ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                    <span className={`absolute top-0.5 ${prefs[it.k] ? 'right-0.5' : 'left-0.5'} w-5 h-5 bg-white rounded-full transition-all shadow`}></span>
                                </button>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* ABA CONTRATOS & DOCUMENTOS */}
            {abaAtiva === 'documentos' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2"><FileSignature size={20} className="text-purple-500"/> Modelos de Contratos & Documentos</h3>
                                <p className="text-xs text-slate-400 font-medium mt-1">Crie modelos reutilizáveis de contratos, termos e outros documentos. Use <code className="bg-slate-100 px-1 rounded">{`{{paciente_nome}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{paciente_cpf}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{data}}`}</code> como variáveis.</p>
                            </div>
                            <button onClick={abrirNovoDoc} className="bg-purple-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-purple-700 flex items-center gap-2 shadow-lg shadow-purple-200"><Plus size={16}/> Novo Modelo</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {docs.map(d => (
                                <div key={d.id} className="p-5 border border-slate-100 rounded-2xl bg-slate-50 hover:bg-white hover:shadow-md transition-all">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1 min-w-0">
                                            <span className={`inline-block text-[9px] uppercase font-black px-1.5 py-0.5 rounded mb-2 ${
                                                d.tipo === 'contrato' ? 'bg-purple-100 text-purple-700' :
                                                d.tipo === 'receita' ? 'bg-blue-100 text-blue-700' :
                                                d.tipo === 'atestado' ? 'bg-emerald-100 text-emerald-700' :
                                                'bg-slate-200 text-slate-700'
                                            }`}>{d.tipo}</span>
                                            <h4 className="font-bold text-slate-800 truncate">{d.nome}</h4>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-slate-500 line-clamp-3 mb-3 whitespace-pre-line">{d.conteudo.slice(0, 200)}{d.conteudo.length > 200 ? '...' : ''}</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => abrirEditarDoc(d)} className="flex-1 py-2 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-purple-400 hover:text-purple-600 flex items-center justify-center gap-1"><Edit size={12}/> Editar</button>
                                        <button onClick={() => excluirDoc(d.id)} className="py-2 px-3 text-xs font-bold rounded-lg bg-white border border-slate-200 text-rose-400 hover:border-rose-400 hover:text-rose-600"><Trash2 size={12}/></button>
                                    </div>
                                </div>
                            ))}
                            {docs.length === 0 && (
                                <div className="md:col-span-2 text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
                                    Nenhum modelo cadastrado. Clique em "Novo Modelo" para começar.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ABA CATEGORIAS FINANCEIRAS */}
            {abaAtiva === 'categorias' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2 mb-4"><Tag size={20} className="text-emerald-500"/> Categorias Financeiras</h3>
                        <p className="text-xs text-slate-400 mb-4">Categorias usadas no módulo Financeiro. Você também pode criar novas direto na tela de novo lançamento.</p>

                        <div className="flex gap-2 mb-4">
                            <input value={novaCatFin} onChange={e => setNovaCatFin(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), adicionarCatFin())} placeholder="Nome da nova categoria..." className="flex-1 min-w-0 p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"/>
                            <button onClick={adicionarCatFin} disabled={!novaCatFin.trim()} className="px-3 sm:px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5 text-xs sm:text-sm shrink-0"><Plus size={14}/> Adicionar</button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {catsFin.length === 0 ? (
                                <div className="col-span-3 text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl text-sm">Nenhuma categoria cadastrada ainda.</div>
                            ) : catsFin.map(c => (
                                <div key={c} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl group hover:bg-white">
                                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2"><Tag size={14} className="text-slate-400"/> {c}</span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => renomearCatFin(c)} className="p-1 text-slate-400 hover:text-blue-600"><Edit size={14}/></button>
                                        <button onClick={() => removerCatFin(c)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ABA BACKUP */}
            {abaAtiva === 'backup' && (
                <div className="space-y-6 animate-in fade-in">
                    {/* BACKUPS AUTOMÁTICOS NO SERVIDOR */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                            <div>
                                <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2"><Database size={20} className="text-blue-500"/> Backups Automáticos do Banco</h3>
                                <p className="text-xs text-slate-400 mt-1">O sistema cria um backup automático <strong>2x ao dia</strong> (manhã e tarde) com todos os dados (pacientes, agendamentos, despesas, clínicas, profissionais, serviços). Mantemos os <strong>30 mais recentes</strong>.</p>
                            </div>
                            <button onClick={backupAgoraManual} disabled={criandoBackup} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 disabled:opacity-50">
                                {criandoBackup ? <><Loader2 className="animate-spin" size={14}/> Gerando...</> : <><Plus size={14}/> Backup Manual</>}
                            </button>
                        </div>

                        {backups.length === 0 ? (
                            <div className="p-8 bg-amber-50 border-2 border-dashed border-amber-200 rounded-xl text-center">
                                <Database className="mx-auto mb-2 text-amber-400" size={32}/>
                                <p className="text-sm font-bold text-amber-800">Nenhum backup encontrado.</p>
                                <p className="text-xs text-amber-600 mt-1">Você precisa rodar o SQL de criação da tabela e função no Supabase. Veja a documentação.</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[480px] overflow-y-auto">
                                {backups.map((b: any) => {
                                    const isAuto = (b.tipo || '').startsWith('automatico');
                                    return (
                                        <div key={b.id} className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl transition-colors">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAuto ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                <Database size={18}/>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-slate-800">#{b.id}</span>
                                                    <span className={`text-[10px] uppercase font-black px-1.5 py-0.5 rounded ${isAuto ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{(b.tipo || 'auto').replace('automatico_', '')}</span>
                                                    {b.tamanho_kb && <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">{b.tamanho_kb} KB</span>}
                                                </div>
                                                <div className="text-xs text-slate-500 font-semibold mt-0.5">
                                                    {new Date(b.criado_em).toLocaleDateString('pt-BR')} às {new Date(b.criado_em).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                                                    {b.observacao && <span className="ml-2 italic text-slate-400">· {b.observacao}</span>}
                                                </div>
                                            </div>
                                            <button onClick={() => baixarBackupComoJson(b.id)} className="p-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100" title="Baixar JSON"><Download size={14}/></button>
                                            <button onClick={() => abrirModalRestaurar(b)} className="p-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100" title="Restaurar este backup (substitui dados atuais)"><RotateCcw size={14}/></button>
                                            <button onClick={() => excluirBackupItem(b.id)} className="p-2 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100" title="Excluir"><Trash2 size={14}/></button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* CONFIG LOCAIS */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2 mb-2"><Database size={18} className="text-purple-500"/> Configurações Locais</h3>
                        <p className="text-xs text-slate-400 mb-4">Apenas as preferências/modelos salvos no navegador (não inclui dados do banco — esses estão nos backups acima).</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button onClick={exportarTudo} className="p-5 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl hover:from-blue-100 hover:to-blue-200 transition-all flex flex-col items-center gap-3 group">
                                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><Download size={22}/></div>
                                <div className="text-center">
                                    <div className="font-black text-blue-900 text-sm">Exportar Configurações</div>
                                    <div className="text-[11px] text-blue-700">Baixar .json com modelos e preferências.</div>
                                </div>
                            </button>
                            <label className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 rounded-2xl hover:from-emerald-100 hover:to-emerald-200 transition-all flex flex-col items-center gap-3 group cursor-pointer">
                                <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><Upload size={22}/></div>
                                <div className="text-center">
                                    <div className="font-black text-emerald-900 text-sm">Importar Configurações</div>
                                    <div className="text-[11px] text-emerald-700">Restaurar a partir de um .json.</div>
                                </div>
                                <input type="file" accept="application/json" onChange={importarTudo} className="hidden"/>
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </>
      )}

      {/* MODAL RESTAURAR BACKUP - Confirmação Dupla */}
      {modalRestaurar && (
          <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border-4 border-rose-300 animate-in zoom-in-95">
                  <div className="p-5 bg-gradient-to-br from-rose-500 to-rose-600 text-white flex items-start gap-3">
                      <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-sm">
                          <AlertTriangle size={28}/>
                      </div>
                      <div className="flex-1">
                          <h3 className="font-black text-xl">Restaurar Backup</h3>
                          <p className="text-rose-50 text-xs mt-1 font-medium">Operação destrutiva — leia com atenção antes de prosseguir.</p>
                      </div>
                      <button onClick={() => setModalRestaurar(null)} className="p-1 hover:bg-white/20 rounded-lg"><X size={20}/></button>
                  </div>

                  <div className="p-6 space-y-4">
                      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2">
                          <div className="font-black text-rose-800 text-sm flex items-center gap-2"><AlertTriangle size={16}/> ATENÇÃO: Esta ação irá:</div>
                          <ul className="text-xs text-rose-700 space-y-1 ml-6 list-disc">
                              <li><strong>Apagar TODOS os dados atuais</strong> de pacientes, agendamentos, despesas, clínicas, profissionais e serviços.</li>
                              <li><strong>Substituir</strong> pelo conteúdo do backup selecionado.</li>
                              <li>Tudo o que foi adicionado <strong>após {new Date(modalRestaurar.criado_em).toLocaleString('pt-BR')}</strong> será permanentemente perdido.</li>
                              <li><strong>Não pode ser desfeita.</strong></li>
                          </ul>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                          <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Backup selecionado</div>
                          <div className="font-bold text-slate-800">#{modalRestaurar.id} · {modalRestaurar.tipo}</div>
                          <div className="text-xs text-slate-500">{new Date(modalRestaurar.criado_em).toLocaleString('pt-BR')} {modalRestaurar.tamanho_kb ? `· ${modalRestaurar.tamanho_kb} KB` : ''}</div>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                          <strong>💡 Dica:</strong> Antes de restaurar, recomendamos clicar em <strong>"Backup Manual"</strong> para criar um snapshot do estado atual. Assim, em caso de problema, você pode voltar atrás.
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-600 uppercase mb-2 block">
                              Para confirmar, digite <code className="bg-slate-200 px-2 py-0.5 rounded text-rose-600 font-mono">RESTAURAR</code> abaixo:
                          </label>
                          <input
                              autoFocus
                              value={confirmacaoTexto}
                              onChange={e => setConfirmacaoTexto(e.target.value)}
                              placeholder="Digite RESTAURAR"
                              className={`w-full p-3 border-2 rounded-xl outline-none font-mono font-black text-center text-lg tracking-wider transition-all ${
                                  confirmacaoTexto === 'RESTAURAR'
                                      ? 'bg-emerald-50 border-emerald-400 text-emerald-700 ring-2 ring-emerald-200'
                                      : 'bg-slate-50 border-slate-200 text-slate-600 focus:ring-2 focus:ring-rose-500'
                              }`}
                          />
                      </div>
                  </div>

                  <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-3">
                      <button onClick={() => setModalRestaurar(null)} disabled={restaurando} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50">Cancelar</button>
                      <button
                          onClick={confirmarRestauracao}
                          disabled={confirmacaoTexto !== 'RESTAURAR' || restaurando}
                          className="flex-1 py-3 bg-rose-600 text-white font-black rounded-xl hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2 transition-all"
                      >
                          {restaurando ? <><Loader2 className="animate-spin" size={18}/> Restaurando...</> : <><RotateCcw size={18}/> Confirmar Restauração</>}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL EDITAR DOCUMENTO */}
      {modalDoc && docEdit && (
          <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 border border-slate-100">
                  <div className="p-5 border-b bg-slate-50 flex justify-between items-center rounded-t-3xl">
                      <h3 className="font-black text-lg text-slate-800 flex items-center gap-2"><FileSignature size={18} className="text-purple-500"/> {docs.find(d => d.id === docEdit.id) ? 'Editar' : 'Novo'} Modelo</h3>
                      <button onClick={() => setModalDoc(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto flex-1">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2">
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome</label>
                              <input value={docEdit.nome} onChange={e => setDocEdit({...docEdit, nome: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"/>
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tipo</label>
                              <CustomSelect value={docEdit.tipo} onChange={v => setDocEdit({...docEdit, tipo: v as any})} options={[{value:'contrato',label:'Contrato'},{value:'receita',label:'Receita'},{value:'atestado',label:'Atestado'},{value:'outro',label:'Outro'}]} size="lg"/>
                          </div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Conteúdo</label>
                          <textarea value={docEdit.conteudo} onChange={e => setDocEdit({...docEdit, conteudo: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm h-72 resize-none" placeholder="Texto do modelo. Use {{paciente_nome}}, {{paciente_cpf}}, {{data}} como variáveis..."/>
                          <p className="text-[10px] text-slate-400 mt-1">Variáveis disponíveis: <code className="bg-slate-100 px-1 rounded">{`{{paciente_nome}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{paciente_cpf}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{data}}`}</code></p>
                      </div>
                  </div>
                  <div className="p-5 border-t bg-slate-50 flex gap-3 rounded-b-3xl">
                      <button onClick={() => setModalDoc(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl">Cancelar</button>
                      <button onClick={salvarDocEdit} className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-200 flex items-center justify-center gap-2"><Save size={16}/> Salvar</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL CRIAR/EDITAR MODELO ANAMNESE */}
      {modalModelo && modeloEdit && (
          <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 border border-slate-100">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-3xl flex-none">
                      <div>
                          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2"><ClipboardList size={20} className="text-blue-500"/> {modelos.find(m => m.id === modeloEdit.id) ? 'Editar' : 'Novo'} Modelo de Anamnese</h3>
                          <p className="text-slate-500 font-medium text-xs mt-1">Configure as perguntas do questionário.</p>
                      </div>
                      <button onClick={() => setModalModelo(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20}/></button>
                  </div>
                  <div className="p-6 overflow-y-auto space-y-5 flex-1">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-1">
                              <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nome do Modelo</label>
                              <input value={modeloEdit.nome} onChange={e => setModeloEdit({...modeloEdit, nome: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: Anamnese Endodôntica"/>
                          </div>
                          <div className="md:col-span-2">
                              <label className="text-xs font-bold text-slate-400 uppercase ml-1">Descrição (opcional)</label>
                              <input value={modeloEdit.descricao || ''} onChange={e => setModeloEdit({...modeloEdit, descricao: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="Para que serve este modelo..."/>
                          </div>
                      </div>

                      <div className="border-t border-slate-100 pt-4">
                          <div className="flex justify-between items-center mb-3">
                              <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><HelpCircle size={16} className="text-purple-500"/> Perguntas ({modeloEdit.perguntas.length})</h4>
                              <button onClick={adicionarPergunta} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"><Plus size={14}/> Adicionar Pergunta</button>
                          </div>

                          <div className="space-y-3">
                              {modeloEdit.perguntas.map((p, idx) => (
                                  <div key={p.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                                      <div className="flex items-start gap-3">
                                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black flex-none">{idx + 1}</div>
                                          <div className="flex-1 space-y-2">
                                              <input value={p.label} onChange={e => atualizarPergunta(idx, { label: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 text-sm" placeholder="Texto da pergunta..."/>
                                              <div className="flex gap-2 items-center">
                                                  <CustomSelect value={p.tipo} onChange={v => atualizarPergunta(idx, { tipo: v as TipoPergunta, opcoes: v === 'multipla' ? (p.opcoes || ['Opção 1']) : undefined })} options={[{value:'texto',label:'Texto livre'},{value:'sim_nao',label:'Sim / Não'},{value:'multipla',label:'Múltipla escolha'}]} size="sm"/>
                                                  {p.tipo === 'multipla' && (
                                                      <input value={(p.opcoes || []).join(', ')} onChange={e => atualizarPergunta(idx, { opcoes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs font-medium text-slate-600" placeholder="Opções separadas por vírgula"/>
                                                  )}
                                              </div>
                                          </div>
                                          <button onClick={() => removerPergunta(idx)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg flex-none"><Trash2 size={14}/></button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
                  <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 rounded-b-3xl flex-none">
                      <button onClick={() => setModalModelo(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
                      <button onClick={salvarModelo} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center justify-center gap-2"><Save size={16}/> Salvar Modelo</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAIS (MANTIDOS IGUAIS, APENAS OCORREM QUANDO ATIVADOS) */}
      {modalClinica && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                  <h3 className="font-bold text-lg mb-4">Cadastrar Nova Unidade</h3>
                  <input autoFocus value={novaClinica} onChange={e => setNovaClinica(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold mb-4" placeholder="Ex: Filial Centro" />
                  <div className="flex gap-2">
                      <button onClick={() => setModalClinica(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Cancelar</button>
                      <button onClick={criarClinica} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Salvar</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL PROFISSIONAL */}
      {modalProf && (
          <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 border border-slate-100">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 rounded-t-3xl flex-none">
                      <div><h3 className="font-black text-2xl text-slate-800">{editandoProf ? 'Editar Perfil' : 'Novo Acesso'}</h3><p className="text-slate-500 font-medium text-sm">Dados profissionais e de acesso.</p></div>
                      {editandoProf && (<button onClick={excluirProfissional} className="p-2 text-red-400 hover:bg-red-50 rounded-lg hover:text-red-600 transition-colors"><Trash2 size={20}/></button>)}
                  </div>
                  <div className="p-8 overflow-y-auto custom-scrollbar space-y-6 flex-1">
                      <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 space-y-4">
                          <div className="flex items-center gap-2 text-blue-700 font-bold text-sm mb-2"><Shield size={16}/> Dados de Login</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">E-mail de Acesso</label><div className="relative"><Mail className="absolute left-3 top-3.5 text-slate-400" size={18}/><input value={profForm.email} onChange={e => setProfForm({...profForm, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 placeholder:text-slate-300" placeholder="email@clinica.com"/></div></div>
                              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Senha {editandoProf && '(Opcional)'}</label><div className="relative"><Lock className="absolute left-3 top-3.5 text-slate-400" size={18}/><input type="password" value={profForm.senha} onChange={e => setProfForm({...profForm, senha: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 placeholder:text-slate-300" placeholder={editandoProf ? "Manter atual" : "Criar senha"}/></div></div>
                          </div>
                      </div>
                      <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Dados do Profissional</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Nome Completo</label><div className="relative"><User className="absolute left-3 top-3.5 text-slate-300" size={18}/><input value={profForm.nome} onChange={e => setProfForm({...profForm, nome: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Dr. Nome Sobrenome"/></div></div>
                              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">CPF</label><input value={profForm.cpf} onChange={e => setProfForm({...profForm, cpf: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="000.000.000-00"/></div>
                              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Sexo</label><CustomSelect value={profForm.sexo} onChange={v => setProfForm({...profForm, sexo: v})} options={[{value:'Masculino',label:'Masculino'},{value:'Feminino',label:'Feminino'},{value:'Outro',label:'Outro'}]} placeholder="Selecione..." size="lg"/></div>
                              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Contato / Telefone</label><div className="relative"><Phone className="absolute left-3 top-3.5 text-slate-300" size={18}/><input value={profForm.telefone} onChange={e => setProfForm({...profForm, telefone: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="(00) 00000-0000"/></div></div>
                              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Cargo</label><input value={profForm.cargo} onChange={e => setProfForm({...profForm, cargo: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: Ortodontista"/></div>
                          </div>
                          <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Endereço</label><input value={profForm.endereco} onChange={e => setProfForm({...profForm, endereco: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="Rua, Número, Bairro..."/></div>
                          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100"><div className="col-span-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Conselho</label><CustomSelect value={profForm.conselho} onChange={v => setProfForm({...profForm, conselho: v})} options={[{value:'CRO',label:'CRO'},{value:'CRM',label:'CRM'},{value:'Outro',label:'Outro'}]} size="sm"/></div><div className="col-span-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">UF</label><input value={profForm.uf} onChange={e => setProfForm({...profForm, uf: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none text-sm font-medium" placeholder="UF"/></div><div className="col-span-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nº Conselho</label><input value={profForm.cro} onChange={e => setProfForm({...profForm, cro: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none text-sm font-medium" placeholder="12345"/></div></div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                          <div className="flex items-center gap-3"><div className={`p-3 rounded-xl ${profForm.nivel_acesso === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-white border border-slate-200 text-slate-400'}`}><Shield size={24}/></div><div><h4 className="font-bold text-slate-800 text-sm">Nível de Permissão</h4><p className="text-xs text-slate-500">Admins podem editar financeiro e ajustes.</p></div></div>
                          <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm"><button onClick={() => setProfForm({...profForm, nivel_acesso: 'comum'})} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${profForm.nivel_acesso === 'comum' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>Comum</button><button onClick={() => setProfForm({...profForm, nivel_acesso: 'admin'})} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${profForm.nivel_acesso === 'admin' ? 'bg-purple-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>Admin</button></div>
                      </div>
                  </div>
                  <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 rounded-b-3xl flex-none"><button onClick={() => setModalProf(false)} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button><button onClick={salvarProfissional} disabled={salvandoProf} className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2">{salvandoProf ? <Loader2 className="animate-spin"/> : <><Save size={18}/> Salvar Acesso</>}</button></div>
              </div>
          </div>
      )}

      {/* MODAL VINCULOS */}
      {modalVinculo && profSelecionado && (
          <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6"><div><h3 className="font-bold text-lg">Onde {profSelecionado.nome.split(' ')[0]} atende?</h3><p className="text-xs text-slate-400">Marque as clínicas permitidas.</p></div><button onClick={() => setModalVinculo(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button></div>
                  <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                      {clinicas.map(c => {
                          const ativo = vinculosDoProf.includes(c.id);
                          return (
                              <button key={c.id} onClick={() => toggleVinculo(c.id)} className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${ativo ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:bg-slate-50'}`}><span className={`font-bold ${ativo ? 'text-blue-700' : 'text-slate-600'}`}>{c.nome}</span><div className={`w-6 h-6 rounded-full border flex items-center justify-center ${ativo ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300'}`}>{ativo && <Check size={14}/>}</div></button>
                          );
                      })}
                  </div>
                  <button onClick={() => setModalVinculo(false)} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Concluir</button>
              </div>
          </div>
      )}

      {/* MODAL EDIÇÃO COMPLETA CLÍNICA */}
      {modalClinicaCompleto && clinicaEditando && (
          <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 border border-slate-100">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-blue-50 to-white rounded-t-3xl flex-none">
                      <div>
                          <h3 className="font-black text-2xl text-slate-800">Editar Clínica</h3>
                          <p className="text-slate-500 font-medium text-sm">Complete os dados da unidade.</p>
                      </div>
                      <button onClick={() => setModalClinicaCompleto(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"><X size={24}/></button>
                  </div>
                  
                  <div className="p-8 overflow-y-auto custom-scrollbar space-y-8 flex-1">
                      {/* Logo */}
                      <div className="flex items-center gap-6">
                          <div className="w-24 h-24 bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl flex items-center justify-center overflow-hidden">
                              {clinicaForm.logo_url ? (
                                  <img src={clinicaForm.logo_url} alt="Logo" className="w-full h-full object-cover"/>
                              ) : (
                                  <Building2 size={40} className="text-slate-300"/>
                              )}
                          </div>
                          <div className="flex-1">
                              <label className="block text-sm font-bold text-slate-700 mb-2">Logomarca</label>
                              <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" id="logo-upload"/>
                              <label htmlFor="logo-upload" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm cursor-pointer transition-colors">
                                  {uploadingLogo ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}
                                  {uploadingLogo ? 'Enviando...' : 'Selecionar Imagem'}
                              </label>
                              <p className="text-xs text-slate-400 mt-1">Max. 2MB • PNG, JPG</p>
                          </div>
                      </div>

                      {/* Dados Básicos */}
                      <div className="space-y-4">
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"><Building2 size={16} className="text-blue-500"/> Dados da Clínica</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="md:col-span-2">
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nome da Clínica *</label>
                                  <input value={clinicaForm.nome} onChange={e => setClinicaForm({...clinicaForm, nome: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: Clínica Ortus Centro"/>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">CNPJ</label>
                                  <input value={clinicaForm.cnpj} onChange={e => setClinicaForm({...clinicaForm, cnpj: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="00.000.000/0000-00"/>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Responsável</label>
                                  <input value={clinicaForm.responsavel_nome} onChange={e => setClinicaForm({...clinicaForm, responsavel_nome: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="Nome do responsável técnico"/>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">E-mail</label>
                                  <input value={clinicaForm.email} onChange={e => setClinicaForm({...clinicaForm, email: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="clinica@email.com"/>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Telefone</label>
                                  <input value={clinicaForm.telefone} onChange={e => setClinicaForm({...clinicaForm, telefone: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="(00) 0000-0000"/>
                              </div>
                          </div>
                      </div>

                      {/* Horários */}
                      <div className="space-y-4">
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"><Clock size={16} className="text-blue-500"/> Horário de Funcionamento</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Início</label>
                                  <input type="time" value={clinicaForm.horario_inicio} onChange={e => setClinicaForm({...clinicaForm, horario_inicio: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"/>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Término</label>
                                  <input type="time" value={clinicaForm.horario_fim} onChange={e => setClinicaForm({...clinicaForm, horario_fim: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"/>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Fuso Horário</label>
                                  <select value={clinicaForm.fuso_horario} onChange={e => setClinicaForm({...clinicaForm, fuso_horario: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700">
                                      <option value="America/Sao_Paulo">São Paulo (GMT-3)</option>
                                      <option value="America/Manaus">Manaus (GMT-4)</option>
                                      <option value="America/Rio_Branco">Rio Branco (GMT-5)</option>
                                      <option value="America/Fortaleza">Fortaleza (GMT-3)</option>
                                      <option value="America/Recife">Recife (GMT-3)</option>
                                      <option value="America/Bahia">Salvador (GMT-3)</option>
                                  </select>
                              </div>
                          </div>
                      </div>

                      {/* Fiscal */}
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4"><FileText size={16} className="text-blue-500"/> Configuração Fiscal</h4>
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase ml-1">Emitir notas fiscais em nome de:</label>
                              <div className="flex gap-4 mt-2">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                      <input type="radio" name="emitir_notas" checked={clinicaForm.emitir_notas_em_nome === 'clinica'} onChange={() => setClinicaForm({...clinicaForm, emitir_notas_em_nome: 'clinica'})} className="w-4 h-4 text-blue-600"/>
                                      <span className="text-sm font-medium text-slate-700">Clínica (CNPJ da clínica)</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                      <input type="radio" name="emitir_notas" checked={clinicaForm.emitir_notas_em_nome === 'profissional'} onChange={() => setClinicaForm({...clinicaForm, emitir_notas_em_nome: 'profissional'})} className="w-4 h-4 text-blue-600"/>
                                      <span className="text-sm font-medium text-slate-700">Profissional (CPF do dentista)</span>
                                  </label>
                              </div>
                          </div>
                      </div>

                      {/* Endereço com ViaCEP */}
                      <div className="space-y-4">
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"><MapPin size={16} className="text-blue-500"/> Endereço (ViaCEP)</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="relative">
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">CEP</label>
                                  <div className="flex gap-2">
                                      <input 
                                          value={clinicaForm.cep} 
                                          onChange={e => {
                                              setClinicaForm({...clinicaForm, cep: e.target.value});
                                              if (e.target.value.replace(/\D/g, '').length === 8) {
                                                  buscarCepClinica(e.target.value);
                                              }
                                          }}
                                          onBlur={() => buscarCepClinica(clinicaForm.cep)}
                                          className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" 
                                          placeholder="00000-000"
                                      />
                                      {buscandoCepClinica && <Loader2 size={20} className="animate-spin text-blue-500 absolute right-3 top-10"/>}
                                  </div>
                              </div>
                              <div className="md:col-span-2">
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Rua / Avenida</label>
                                  <input value={clinicaForm.rua} onChange={e => setClinicaForm({...clinicaForm, rua: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="Logradouro"/>
                              </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Número</label>
                                  <input value={clinicaForm.numero} onChange={e => setClinicaForm({...clinicaForm, numero: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="123"/>
                              </div>
                              <div className="md:col-span-3">
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Complemento</label>
                                  <input value={clinicaForm.complemento} onChange={e => setClinicaForm({...clinicaForm, complemento: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="Sala, Bloco, Andar..."/>
                              </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Bairro</label>
                                  <input value={clinicaForm.bairro} onChange={e => setClinicaForm({...clinicaForm, bairro: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="Bairro"/>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Cidade</label>
                                  <input value={clinicaForm.cidade} onChange={e => setClinicaForm({...clinicaForm, cidade: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700" placeholder="Cidade"/>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">UF</label>
                                  <select value={clinicaForm.uf} onChange={e => setClinicaForm({...clinicaForm, uf: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700">
                                      <option value="">Selecione...</option>
                                      {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                                          <option key={uf} value={uf}>{uf}</option>
                                      ))}
                                  </select>
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 rounded-b-3xl flex-none">
                      <button onClick={() => setModalClinicaCompleto(false)} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-colors">
                          Cancelar
                      </button>
                      <button onClick={salvarClinicaCompleta} className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2">
                          <Save size={18}/> Salvar Alterações
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}