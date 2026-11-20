'use client';
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { dados as tabelas, usuarioDaSessao } from '@/lib/local/consulta';
import { usePatientActionModal } from '@/components/PatientActionModal';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas, fetchUserEquipe } from '@/lib/clinicScoped';
import {
  atualizar,
  inserir,
  lerSessaoCacheUI,
  listar,
  modoDados,
  remover,
  type FiltroLocal,
} from '@/lib/local/cliente';

import { Plus, X, Loader2, UserPlus, Trash2, Bell, ChevronDown, ChevronLeft, ChevronRight, Search, Calendar, LayoutGrid, Clock, List, Users, SlidersHorizontal } from 'lucide-react';
import { BotaoChamar, BotaoSenha } from '@/components/chamadas/BotaoChamar';
import { hojeNoFuso } from '@/lib/fuso';
import Aviso from '@/components/ui/Aviso';
import CustomSelect from '@/components/ui/CustomSelect';
import CampoData from '@/components/ui/CampoData';
import CampoHora from '@/components/ui/CampoHora';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarAgendamentoCompleto } from '@/lib/horarioProfissional';
import PatientContactButtons from '@/components/PatientContactButtons';
import Modal from '@/components/ui/Modal';
import SegmentedControl from '@/components/ui/SegmentedControl';
import ProcedureCombobox from '@/components/forms/ProcedureCombobox';
import {
  buscarAgendamentosLembrete24h,
  filtrarPendentesLembrete,
  ctxLembreteAgendamento,
  marcarLembreteEnviado,
  type LembreteAgendamento,
} from '@/lib/lembretesAgenda';
import { tratamentosVisiveis, valorNaAgenda, type LinhaPreco, type PlanoTipo } from '@/lib/precoTratamento';
import { fraseDeErro } from '@/lib/fraseDeErro';

type Visao = 'mes' | 'semana' | 'dia' | 'lista' | 'profissionais';

type PacienteAgenda = {
  id: string;
  nome: string;
  clinica_id: number | string | null;
  telefone?: string | null;
  plano_id?: string | null;
};

type AgendamentoLocal = {
  id: number;
  paciente_id: string | null;
  clinica_id: number | null;
  profissional_id: number | null;
  data_hora: string;
  procedimento: string;
  cor: string | null;
  valor: number | null;
  desconto: number | null;
  valor_final: number | null;
  status: string;
  observacoes: string | null;
  duracao_minutos: number | null;
  tipo_registro?: string | null;
};

type PerfilSessaoLocal = {
  id?: string | number | null;
  nivel_acesso?: string | null;
  is_super_admin?: boolean | null;
};

/** Linha de `agendamentos` como chega da nuvem (com o paciente embutido). */
type RegistroAgenda = {
  id: number | string;
  data_hora: string;
  procedimento?: string | null;
  status?: string | null;
  observacoes?: string | null;
  tipo_registro?: string | null;
  profissional_id?: number | string | null;
  pacientes?: { nome?: string | null } | { nome?: string | null }[] | null;
  [coluna: string]: unknown;
};

type EventoAgenda = {
  id: number | string;
  title: string;
  start: string;
  end: string;
  extendedProps: RegistroAgenda;
  backgroundColor: string;
  borderColor: string;
};

/** Período carregado: `data_hora >= inicio` e `data_hora < fim`, em ISO. */
type JanelaAgenda = { inicio: string; fim: string };

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const LETRAS_DIA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
// A mesma consulta que o Tailwind gera para `max-md:`, para o JS e o CSS concordarem sobre o que é celular.
const CONSULTA_CELULAR = 'not all and (min-width: 768px)';
// Abaixo de lg a barra flutuante da casca (MobileAppChrome) cobre o fim da tela: 4.5rem, o mesmo desconto do MenuPontos.
const BARRA_CELULAR = 72;
// O PostgREST corta a resposta em 1000 linhas: a agenda é lida em blocos.
const BLOCO_AGENDA = 1000;
const MAX_BLOCOS_AGENDA = 20;
// O SQLite do desktop recusa lista com mais de 900 itens no filtro "in".
const BLOCO_IDS_LOCAL = 500;
const STATUS_OPCOES = [
  { value: 'todos', label: 'Todas' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'fiado', label: 'Fiado' },
  // "Faltou" alimenta o funil de oportunidades (paciente que faltou e não remarcou).
  { value: 'faltou', label: 'Faltou' },
  { value: 'cancelado', label: 'Cancelado' },
];

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function inicioSemana(data: Date) {
  const dia = inicioDoDia(data);
  dia.setDate(dia.getDate() - dia.getDay());
  return dia;
}

function somarDias(data: Date, dias: number) {
  const proxima = new Date(data);
  proxima.setDate(proxima.getDate() + dias);
  return proxima;
}

function mesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function chaveLocal(data: Date) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/**
 * Janela de carga da agenda: o mês do cursor com 7 dias de folga de cada lado.
 * A grade do mês tem 6 semanas e pode avançar até 14 dias no mês seguinte,
 * então o fim vai até a última célula dela quando a folga não alcança.
 */
function janelaDoMes(cursor: Date): JanelaAgenda {
  const primeiroDia = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const proximoMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const fimDaFolga = somarDias(proximoMes, 7);
  const fimDaGrade = somarDias(inicioSemana(primeiroDia), 42);
  const fim = fimDaGrade > fimDaFolga ? fimDaGrade : fimDaFolga;
  return { inicio: somarDias(primeiroDia, -7).toISOString(), fim: fim.toISOString() };
}

function capitalizar(texto: string) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

function nomePaciente(props: any) {
  return Array.isArray(props?.pacientes) ? props.pacientes[0]?.nome : props?.pacientes?.nome;
}

function corStatus(status?: string) {
  if (status === 'concluido') return 'bg-emerald-500';
  if (status === 'fiado') return 'bg-amber-500';
  if (status === 'cancelado') return 'bg-rose-500';
  if (status === 'faltou') return 'bg-orange-400';
  return 'bg-neutral-900';
}

/**
 * Nível efetivo na clínica ativa. Quem entrou por convite de outra rede nunca é administrador na clínica que
 * convidou, mesmo sendo admin na de origem. A RLS da agenda não olha o convite: quem segura é esta tela.
 */
function adminNaClinica(nivel: unknown, superAdmin: unknown, convidado: boolean) {
  return superAdmin === true || (nivel === 'admin' && !convidado);
}

function MenuFiltro({
  rotulo,
  valor,
  opcoes,
  onChange,
  cheio = false,
  alto = false,
}: {
  rotulo: string;
  valor: string;
  opcoes: { value: string; label: string }[];
  onChange: (valor: string) => void;
  cheio?: boolean;
  /** Barra de toque (celular e tablet): botão e opções com 40px de altura. */
  alto?: boolean;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 180, maxHeight: 240 });
  const ativo = valor !== 'todos';
  const titulo = ativo ? (opcoes.find((opcao) => opcao.value === valor)?.label || rotulo) : rotulo;

  function abrir() {
    const rect = botao.current?.getBoundingClientRect();
    if (!rect) return;
    // O menu para acima da barra flutuante do celular: atrás dela, o toque na última opção caía na navegação.
    const fim = window.innerHeight - (window.innerWidth < 1024 ? BARRA_CELULAR : 0);
    const abaixo = fim - rect.bottom;
    const acima = rect.top;
    const abreAbaixo = abaixo >= 160 || abaixo >= acima;
    const maxHeight = Math.max(120, Math.min(240, (abreAbaixo ? abaixo : acima) - 12));
    const width = Math.max(rect.width, 180);
    setPos({
      top: abreAbaixo ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4),
      // Em tela estreita o menu é mais largo que o botão: não pode sair pela direita.
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight,
    });
    setAberto((atual) => !atual);
  }

  useEffect(() => {
    if (!aberto) return;
    const fechar = (event: Event) => {
      const alvo = event.target as Node | null;
      if (alvo && menu.current?.contains(alvo)) return;
      setAberto(false);
    };
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={abrir}
        title={ativo ? titulo : undefined}
        className={`relative inline-flex ${alto ? 'h-10' : 'h-8'} items-center rounded-md border bg-white text-sm text-neutral-700 hover:bg-neutral-50 ${cheio ? 'w-full min-w-0' : ''} ${ativo ? 'border-red-500' : 'border-neutral-200'}`}
      >
        <span className={`invisible inline-flex items-center gap-1.5 px-2.5 ${cheio ? 'min-w-0 overflow-hidden' : ''}`}>
          <ChevronDown size={13} />
          {rotulo}
        </span>
        <span className="absolute inset-0 flex items-center gap-1.5 px-2.5">
          <ChevronDown size={13} className={`shrink-0 text-neutral-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
          <span className="truncate">{titulo}</span>
        </span>
      </button>
      {aberto && typeof document !== 'undefined' && createPortal(
        <>
          {/* Acima da barra flutuante do celular (z-[110]), como o MenuPontos: tocar nela com o menu aberto só fecha o menu. */}
          <button type="button" aria-label="Fechar filtro" className="fixed inset-0 z-[120] cursor-default" onClick={() => setAberto(false)} />
          <div
            ref={menu}
            className="fixed z-[121] overflow-y-auto overscroll-contain rounded-md border border-neutral-200 bg-white py-1"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            onWheel={(event) => event.stopPropagation()}
          >
            {opcoes.map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                onClick={() => { onChange(opcao.value); setAberto(false); }}
                className={`block w-full px-3 ${alto ? 'py-2.5' : 'py-1.5'} text-left text-sm hover:bg-neutral-50 ${valor === opcao.value ? 'font-medium text-neutral-900' : 'text-neutral-600'}`}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

export default function Agenda() {
  const searchParams = useSearchParams();
  const pacientePreSelecionado = searchParams?.get('paciente');
  const { openQuickCapture } = usePatientActionModal();
  const { activeClinicId, loading: clinicLoading, clinicaNome, clinics: clinicasContexto, convidadoAqui } = useClinica();
  const clinicaFiltro =
    !activeClinicId || activeClinicId === 'all' ? 'todas' : String(activeClinicId);
  const { showAlert, showConfirm } = useCustomAlert();
  const [events, setEvents] = useState<any[]>([]);
  const [usuarioAtual, setUsuarioAtual] = useState<any>(null);
  
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [tratamentosBase, setTratamentosBase] = useState<any[]>([]);
  const [planosPreco, setPlanosPreco] = useState<PlanoTipo[]>([]);
  const [linhasPreco, setLinhasPreco] = useState<LinhaPreco[]>([]);
  const [especialidades, setEspecialidades] = useState<{ id: string; nome: string }[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [lembretesAbertos, setLembretesAbertos] = useState(true);
  const [loading, setLoading] = useState(false);
  const [modoLocal, setModoLocal] = useState(false);
  const [lembretesPendentes, setLembretesPendentes] = useState<LembreteAgendamento[]>([]);
  const [lembretesLoading, setLembretesLoading] = useState(false);
  const [visao, setVisao] = useState<Visao>('semana');
  const [cursor, setCursor] = useState(() => new Date());
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroProfissional, setFiltroProfissional] = useState('todos');
  const [agora, setAgora] = useState(() => new Date());
  const gradeHorasRef = useRef<HTMLDivElement>(null);
  // Celular: busca e filtros ficam recolhidos para a grade do dia caber na tela.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // Os agendamentos na tela ainda são de outra janela (primeira carga, troca de mês ou de clínica).
  const [carregandoJanela, setCarregandoJanela] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoTimer = useRef<number | null>(null);
  const montadoRef = useRef(true);
  const cargaEventosRef = useRef(0);
  const janelaCarregadaRef = useRef<string | null>(null);
  const cargaLembretesRef = useRef(0);
  // Clínica (ou "todas") da lista de lembretes na tela.
  const lembretesEscopoRef = useRef<string | null>(null);
  const visaoEscolhida = useRef(false);
  const salvandoRef = useRef(false);

  const [formData, setFormData] = useState({
      id: null, title: '', date: '', time: '08:00', theme: 'blue',
      paciente_id: '', valor: '0', desconto: '0', observacoes: '',
      status: 'agendado', clinica_id: '', profissional_id: ''
  });

  // A carga só depende do mês do cursor e das clínicas no escopo: trocar de dia dentro do mês não busca de novo.
  const chaveMes = `${cursor.getFullYear()}-${cursor.getMonth()}`;
  const escopoClinicas = clinicaFiltro !== 'todas'
      ? clinicaFiltro
      : clinicasContexto.map((c) => String(c.id)).join(',');
  const ehAdmin = !!usuarioAtual && adminNaClinica(usuarioAtual.nivel, usuarioAtual.superAdmin, convidadoAqui);

  useEffect(() => {
      montadoRef.current = true;
      return () => { montadoRef.current = false; };
  }, []);

  // No telefone a agenda abre no dia. Roda uma vez, antes da primeira pintura,
  // e nunca passa por cima da visão que a pessoa escolheu.
  useLayoutEffect(() => {
      if (visaoEscolhida.current) return;
      if (!window.matchMedia(CONSULTA_CELULAR).matches) return;
      setVisao('dia');
      setLembretesAbertos(false);
  }, []);

  useEffect(() => {
      if (!clinicLoading) inicializar();
  }, [clinicLoading]);

  // ehAdmin entra porque decide o filtro por profissional (muda com a troca para uma clínica que convidou).
  useEffect(() => { if(usuarioAtual) carregarEventos(); }, [escopoClinicas, usuarioAtual, chaveMes, ehAdmin]);

  useEffect(() => {
      let ativo = true;
      modoDados().then((modo) => { if (ativo) setModoLocal(modo === 'local'); }).catch(() => undefined);
      return () => { ativo = false; };
  }, []);

  useEffect(() => {
      if (!clinicLoading && clinicas.length) carregarLembretes();
  }, [clinicLoading, clinicas, clinicaFiltro]);

  async function carregarLembretes() {
      // Só a carga mais recente grava. Na troca de clínica, a da anterior (2 consultas por agendamento, em série)
      // terminava depois da nova e deixava os lembretes da outra clínica na tela.
      const carga = ++cargaLembretesRef.current;
      const atual = () => montadoRef.current && carga === cargaLembretesRef.current;
      // Lista de outra clínica sai já, sem esperar a carga nova.
      if (lembretesEscopoRef.current !== clinicaFiltro) {
          lembretesEscopoRef.current = clinicaFiltro;
          setLembretesPendentes([]);
      }
      const modo = await modoDados();
      if (!atual()) return;
      setLembretesLoading(true);
      try {
          const ids = clinicaFiltro !== 'todas'
              ? [clinicaFiltro]
              : clinicas.map((c: any) => c.id);
          const todos = await buscarAgendamentosLembrete24h(ids);
          if (!atual()) return;
          if (clinicaFiltro !== 'todas') {
              const pendentes = await filtrarPendentesLembrete(clinicaFiltro, todos);
              if (atual()) setLembretesPendentes(pendentes);
          } else {
              const agregado: LembreteAgendamento[] = [];
              for (const cid of ids) {
                  const p = await filtrarPendentesLembrete(cid, todos);
                  if (!atual()) return;
                  agregado.push(...p);
              }
              setLembretesPendentes(agregado);
          }
      } catch (erro) {
          if (!atual()) return;
          setLembretesPendentes([]);
          if (modo === 'local') {
              await showAlert(fraseDeErro(erro, 'Não foi possível carregar os lembretes.'), { type: 'error' });
          }
      } finally {
          // A carga que perdeu a vez não mexe no indicador: quem cuida dele é a mais recente.
          if (atual()) setLembretesLoading(false);
      }
  }

  const prefillAplicado = useRef(false);

  useEffect(() => {
      if (prefillAplicado.current || !pacientePreSelecionado || pacientes.length === 0) return;
      const paciente = pacientes.find((p: any) => String(p.id) === String(pacientePreSelecionado));
      if (!paciente) return;
      // Data local: pelo relógio UTC, depois das 21h o agendamento já nascia no dia seguinte.
      const hoje = chaveLocal(new Date());
      // Ids em texto, como as opções dos selects: número vindo da nuvem deixava o campo em "Selecione...".
      const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : paciente.clinica_id ? String(paciente.clinica_id) : '';
      const preProfissional = (!ehAdmin && usuarioAtual?.profissional_id) ? String(usuarioAtual.profissional_id) : '';
      setFormData({
          id: null,
          title: '',
          date: hoje,
          time: '08:00',
          theme: 'blue',
          paciente_id: paciente.id,
          valor: '0',
          desconto: '0',
          observacoes: '',
          status: 'agendado',
          clinica_id: preClinica,
          profissional_id: preProfissional,
      });
      prefillAplicado.current = true;
      setOpenModal(true);
  }, [pacientePreSelecionado, pacientes, clinicaFiltro, usuarioAtual, ehAdmin]);

  // Revalida quando o Action Hub criar/quitar agendamentos in-place.
  // O mês entra nas dependências para o ouvinte recarregar a janela do cursor atual, e não a de quando foi registrado.
  useEffect(() => {
      function handle() { if (usuarioAtual) carregarEventos(); }
      window.addEventListener('ortus:agenda-changed', handle);
      return () => window.removeEventListener('ortus:agenda-changed', handle);
  }, [usuarioAtual, escopoClinicas, chaveMes, ehAdmin]);
  
  useEffect(() => { 
      if (!formData.clinica_id) { 
          setProfissionaisFiltrados([]); 
          setTratamentosBase([]);
          setEspecialidades([]);
      } else { 
          const filtrados = profissionais.filter((p:any) => p.profissionais_clinicas?.some((vinculo:any) => vinculo.clinica_id == formData.clinica_id)); 
          setProfissionaisFiltrados(filtrados);
          carregarTratamentosBase(formData.clinica_id);
          carregarEspecialidades(formData.clinica_id);
      } 
  }, [formData.clinica_id, profissionais]);

  const recarregarPacientes = useCallback(async () => {
      const modo = await modoDados();
      if (modo === 'local') {
          try {
              const idsLocais = clinicas.length
                  ? clinicas.map((c) => c.id)
                  : (clinicaFiltro !== 'todas' ? [clinicaFiltro] : []);
              if (idsLocais.length > 0) {
                  const pac = await listar<PacienteAgenda>('pacientes', {
                      filtros: [{ col: 'clinica_id', op: 'in', valor: idsLocais }],
                      ordem: [{ col: 'nome', asc: true }],
                  });
                  setPacientes(pac);
              } else {
                  setPacientes([]);
              }
          } catch (erro) {
              await showAlert(fraseDeErro(erro, 'Não foi possível recarregar os pacientes.'), { type: 'error' });
          }
          return;
      }

      try {
          const cl = await fetchUserClinicas();
          const idsPermitidos = cl.map((c) => c.id);
          if (idsPermitidos.length > 0) {
              const { data: pac } = await tabelas.from('pacientes')
                  .select('id, nome, clinica_id, telefone, plano_id')
                  .in('clinica_id', idsPermitidos as any)
                  .order('nome');
              if (pac) setPacientes(pac);
          } else {
              setPacientes([]);
          }
      } catch (erro) {
          await showAlert(fraseDeErro(erro, 'Não foi possível recarregar os pacientes.'), { type: 'error' });
      }
  }, [clinicas, clinicaFiltro, showAlert]);

  async function carregarTratamentosBase(clinicaId: string) {
      const [tr, planos, linhas] = await Promise.all([
          tabelas.from('tratamentos_base').select('id, nome, valor_sugerido, especialidade_id').eq('clinica_id', clinicaId).eq('ativo', true).order('nome'),
          tabelas.from('planos').select('id, tipo').eq('clinica_id', Number(clinicaId)),
          tabelas.from('planos_tratamentos').select('plano_id, tratamento_id, valor, ativo').eq('clinica_id', Number(clinicaId)),
      ]);
      setTratamentosBase(tr.data || []);
      setPlanosPreco((planos.data || []) as PlanoTipo[]);
      setLinhasPreco((linhas.data || []) as LinhaPreco[]);
  }

  async function carregarEspecialidades(clinicaId: string) {
      const { data } = await tabelas.from('especialidades')
          .select('id, nome')
          .eq('clinica_id', Number(clinicaId))
          .eq('ativo', true)
          .order('nome');
      setEspecialidades(data || []);
  }

  useEffect(() => {
      function handlePacienteChanged() { recarregarPacientes(); }
      window.addEventListener('ortus:paciente-changed', handlePacienteChanged);
      return () => window.removeEventListener('ortus:paciente-changed', handlePacienteChanged);
  }, [recarregarPacientes]);

  async function inicializar() { 
      const modo = await modoDados();
      if (modo === 'local') {
          try {
              const cache = await lerSessaoCacheUI();
              const perfil = cache?.perfil as PerfilSessaoLocal | null | undefined;
              const nivel = typeof perfil?.nivel_acesso === 'string' ? perfil.nivel_acesso : 'admin';
              const profissionalId = perfil?.id ?? null;
              const superAdmin = perfil?.is_super_admin === true;
              if (cache?.user?.id) {
                  setUsuarioAtual({ id: cache.user.id, nivel, profissional_id: profissionalId, superAdmin });
                  if (!adminNaClinica(nivel, superAdmin, convidadoAqui) && profissionalId != null) {
                      setFormData(prev => ({ ...prev, profissional_id: String(profissionalId) }));
                  }
              } else {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (session?.user) setUsuarioAtual({ id: session.user.id, nivel, profissional_id: profissionalId, superAdmin });
              }
          } catch (erro) {
              await showAlert(fraseDeErro(erro, 'Não foi possível carregar a sessão local.'), { type: 'error' });
          }
          await fetchDados();
          return;
      }

      const user = await usuarioDaSessao(); 
      if (user) { 
          const { data: prof } = await tabelas.from('profissionais').select('*').eq('user_id', user.id).single(); 
          if (prof) {
              const superAdmin = prof.is_super_admin === true;
              setUsuarioAtual({ id: user.id, nivel: prof.nivel_acesso, profissional_id: prof.id, superAdmin });
              // Em texto, como as opções do select: o número da nuvem deixava o campo em "Qualquer um...".
              if (!adminNaClinica(prof.nivel_acesso, superAdmin, convidadoAqui)) setFormData(prev => ({ ...prev, profissional_id: String(prof.id) }));
          } else {
              setUsuarioAtual({ id: user.id, nivel: 'admin', profissional_id: null }); 
          } 
      } 
      fetchDados(); 
  }

  async function fetchDados() {
      const modo = await modoDados();
      if (modo === 'local') {
          try {
              const clinicasAtivas = await resolverClinicasLocal();
              setClinicas(clinicasAtivas);
              const idsPermitidos = clinicasAtivas.map((c) => c.id);
              if (idsPermitidos.length > 0) {
                  const pac = await listar<PacienteAgenda>('pacientes', {
                      filtros: [{ col: 'clinica_id', op: 'in', valor: idsPermitidos }],
                      ordem: [{ col: 'nome', asc: true }],
                  });
                  setPacientes(pac);
              } else {
                  setPacientes([]);
              }

              const equipe = await fetchUserEquipe();
              const equipeNormalizada = equipe.map((p) => ({
                  ...p,
                  profissionais_clinicas: (p.clinicas || []).map((c) => ({ clinica_id: c.id })),
              }));
              setProfissionais(equipeNormalizada);
          } catch (erro) {
              await showAlert(fraseDeErro(erro, 'Não foi possível carregar os dados da agenda.'), { type: 'error' });
          }
          return;
      }

      // Clínicas restritas ao usuário (multi-tenant)
      const cl = await fetchUserClinicas();
      setClinicas(cl);
      const idsPermitidos = cl.map((c) => c.id);

      // Equipe visível ao usuário (filtrada por rede; super admin vê tudo).
      // Mantém a forma `{ profissionais_clinicas: [{ clinica_id }] }` esperada
      // pela UI a partir das `clinicas` retornadas pelo helper.
      const equipe = await fetchUserEquipe();
      const equipeNormalizada = equipe.map((p: any) => ({
          ...p,
          profissionais_clinicas: (p.clinicas || []).map((c: any) => ({ clinica_id: c.id })),
      }));
      setProfissionais(equipeNormalizada as any);

      // Pacientes apenas das clínicas permitidas
      if (idsPermitidos.length > 0) {
          const { data: pac } = await tabelas.from('pacientes')
              .select('id, nome, clinica_id, telefone, plano_id')
              .in('clinica_id', idsPermitidos as any)
              .order('nome');
          if (pac) setPacientes(pac);
      } else {
          setPacientes([]);
      }
  }

  /**
   * Carrega só a janela do mês do cursor. Antes vinha a tabela inteira numa
   * consulta só, e o PostgREST cortava em 1000 linhas sem avisar.
   */
  async function carregarEventos() {
      if (!usuarioAtual) return;
      // Cargas que se sobrepõem (troca rápida de mês, salvar seguido do aviso de mudança): só a mais recente grava o estado.
      const carga = ++cargaEventosRef.current;
      const atual = () => montadoRef.current && carga === cargaEventosRef.current;
      const janela = janelaDoMes(cursor);
      const chaveCarga = `${escopoClinicas}|${janela.inicio}`;
      if (janelaCarregadaRef.current !== chaveCarga) {
          setCarregandoJanela(true);
          // Troca de clínica: as consultas da anterior saem já, para não ficarem tocáveis sob o nome da nova.
          // Na troca de mês, no mesmo escopo, as antigas ficam na tela até a carga nova chegar.
          if (!janelaCarregadaRef.current?.startsWith(`${escopoClinicas}|`)) {
              janelaCarregadaRef.current = null;
              setEvents([]);
          }
      }

      let modo: 'local' | 'nuvem' = 'nuvem';
      try {
          modo = await modoDados();
          if (!atual()) return;
          const lista = modo === 'local'
              ? await buscarEventosLocal(janela)
              : await buscarEventosNuvem(janela, atual);
          if (!lista || !atual()) return;
          janelaCarregadaRef.current = chaveCarga;
          setEvents(lista);
          setCarregandoJanela(false);
      } catch (erro) {
          if (!atual()) return;
          // O que está na tela só fica se for desta mesma janela; de outra, sai para não passar por agenda do período.
          if (janelaCarregadaRef.current !== chaveCarga) {
              janelaCarregadaRef.current = null;
              setEvents([]);
          }
          setCarregandoJanela(false);
          // Falha de rede, sessão vencida e recusa do banco viram frase: o texto técnico do erro não chega à tela.
          await showAlert(
              fraseDeErro(erro, modo === 'local' ? 'Não foi possível carregar a agenda local.' : 'Não foi possível carregar a agenda.'),
              { type: 'error' },
          );
      }
  }

  /** Nuvem: lê a janela em blocos, até acabar. Devolve null quando outra carga passou na frente. */
  async function buscarEventosNuvem(janela: JanelaAgenda, atual: () => boolean): Promise<EventoAgenda[] | null> {
      const ids = clinicaFiltro !== 'todas'
          ? [clinicaFiltro]
          : clinicasContexto.map((c) => String(c.id));
      if (ids.length === 0) return [];

      const colunas = '*, pacientes(nome), clinicas(nome, cor_tema)';
      const porId = new Map<string, RegistroAgenda>();
      let recebidas = 0;
      let total: number | null = null;
      for (let bloco = 0; bloco < MAX_BLOCOS_AGENDA; bloco += 1) {
          // O total vem junto do primeiro bloco: com ele a parada não depende do teto de linhas do servidor.
          let query = bloco === 0
              ? tabelas.from('agendamentos').select(colunas, { count: 'exact' })
              : tabelas.from('agendamentos').select(colunas);
          query = query.gte('data_hora', janela.inicio).lt('data_hora', janela.fim);
          query = ids.length === 1 ? query.eq('clinica_id', ids[0]) : query.in('clinica_id', ids);
          if (!ehAdmin && usuarioAtual.profissional_id) query = query.eq('profissional_id', usuarioAtual.profissional_id);
          // Ordem estável (data e depois id): sem ela a paginação pode repetir ou pular linha.
          const { data, error, count } = await query
              .order('data_hora', { ascending: true })
              .order('id', { ascending: true })
              .range(recebidas, recebidas + BLOCO_AGENDA - 1);
          if (!atual()) return null;
          // Bloco que falha derruba a carga inteira: metade da agenda na tela passaria por agenda completa.
          // O erro sobe inteiro, com o código, para virar frase na tela.
          if (error) throw error;
          if (!Array.isArray(data)) throw new Error('A agenda veio em formato inesperado.');
          if (bloco === 0 && typeof count === 'number') total = count;
          const linhas = data as RegistroAgenda[];
          linhas.forEach((linha) => porId.set(String(linha.id), linha));
          recebidas += linhas.length;
          if (linhas.length === 0) break;
          if (total !== null ? recebidas >= total : linhas.length < BLOCO_AGENDA) break;
      }

      return Array.from(porId.values())
          .filter((e) => e.tipo_registro !== 'debito_manual' && e.observacoes !== 'Débito manual')
          .map((e) => ({
              id: e.id,
              title: `${nomePaciente(e)} - ${e.procedimento}`,
              start: e.data_hora,
              end: new Date(new Date(e.data_hora).getTime() + 60*60*1000).toISOString(),
              extendedProps: e,
              backgroundColor: 'transparent',
              borderColor: 'transparent'
          }));
  }

  async function resolverClinicasLocal(): Promise<{ id: string | number; nome: string }[]> {
      if (clinicasContexto.length > 0) {
          return clinicasContexto.map((c) => ({ id: c.id, nome: c.nome }));
      }
      const cache = await lerSessaoCacheUI();
      return (cache?.clinicas || []).map((c) => ({ id: c.id, nome: c.nome }));
  }

  /** Desktop: a mesma janela, lida do SQLite. Quem chama trata o erro e a corrida. */
  async function buscarEventosLocal(janela: JanelaAgenda): Promise<EventoAgenda[]> {
      const clinicasAtivas = await resolverClinicasLocal();
      const ids = clinicaFiltro !== 'todas'
          ? [clinicaFiltro]
          : clinicasAtivas.map((c) => c.id);
      if (ids.length === 0) return [];
      const filtros: FiltroLocal[] = [
          ids.length === 1
              ? { col: 'clinica_id', op: 'eq', valor: ids[0] }
              : { col: 'clinica_id', op: 'in', valor: ids },
          { col: 'data_hora', op: 'gte', valor: janela.inicio },
          { col: 'data_hora', op: 'lt', valor: janela.fim },
      ];
      if (!ehAdmin && usuarioAtual?.profissional_id) {
          filtros.push({ col: 'profissional_id', op: 'eq', valor: usuarioAtual.profissional_id });
      }

      const agendamentos = await listar<AgendamentoLocal>('agendamentos', {
          filtros,
          ordem: [{ col: 'data_hora', asc: true }],
      });

      const idsPacientes = Array.from(new Set(
          agendamentos
              .map((a) => a.paciente_id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ));
      // Em pedaços: com a lista inteira num filtro só, um mês movimentado estourava o limite do SQLite e a agenda não abria.
      const pacientesRelacionados: PacienteAgenda[] = [];
      for (let i = 0; i < idsPacientes.length; i += BLOCO_IDS_LOCAL) {
          pacientesRelacionados.push(...await listar<PacienteAgenda>('pacientes', {
              filtros: [{ col: 'id', op: 'in', valor: idsPacientes.slice(i, i + BLOCO_IDS_LOCAL) }],
          }));
      }
      const mapaPacientes = new Map(pacientesRelacionados.map((p) => [String(p.id), p]));
      const mapaClinicas = new Map(clinicasAtivas.map((c) => [String(c.id), c.nome]));

      return agendamentos
        .filter((e) => e.tipo_registro !== 'debito_manual' && e.observacoes !== 'Débito manual')
        .map((e) => {
          const paciente = mapaPacientes.get(String(e.paciente_id));
          const nomeClinica = mapaClinicas.get(String(e.clinica_id)) || clinicaNome;
          return {
            id: e.id,
            title: `${paciente?.nome ?? ''} - ${e.procedimento}`,
            start: e.data_hora,
            end: new Date(new Date(e.data_hora).getTime() + (e.duracao_minutos ?? 60) * 60 * 1000).toISOString(),
            extendedProps: {
              ...e,
              clinica_id: e.clinica_id != null ? String(e.clinica_id) : null,
              profissional_id: e.profissional_id != null ? String(e.profissional_id) : null,
              pacientes: paciente ? { nome: paciente.nome } : null,
              clinicas: { nome: nomeClinica, cor_tema: null },
            },
            backgroundColor: 'transparent',
            borderColor: 'transparent',
          };
        });
  }

  function abrirNoDia(dia: Date, hora = '08:00', profissionalId?: string) {
      const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : '';
      const preProfissional = profissionalId || ((!ehAdmin && usuarioAtual?.profissional_id) ? String(usuarioAtual.profissional_id) : '');
      setFormData({
          id: null,
          title: '',
          date: chaveLocal(dia),
          time: hora,
          theme: 'blue',
          paciente_id: '',
          valor: '0',
          desconto: '0',
          observacoes: '',
          status: 'agendado',
          clinica_id: preClinica,
          profissional_id: preProfissional,
      });
      setOpenModal(true);
  }

  function abrirEvento(registro: any) { 
      const r = registro; 
      const localDate = new Date(r.data_hora); 
      setFormData({
          id: r.id, 
          title: r.procedimento, 
          date: chaveLocal(localDate), 
          time: localDate.toTimeString().slice(0,5), 
          theme: r.cor || 'blue', 
          paciente_id: r.paciente_id, 
          valor: r.valor || '0', 
          desconto: r.desconto || '0', 
          observacoes: r.observacoes || '', 
          status: r.status || 'agendado',
          // Na nuvem os ids chegam como número e as opções dos selects são texto: sem converter,
          // o popup mostrava Clínica "Selecione..." e Profissional "Qualquer um...".
          clinica_id: r.clinica_id != null ? String(r.clinica_id) : '',
          profissional_id: r.profissional_id != null ? String(r.profissional_id) : ''
      });
      setOpenModal(true); 
  };

  function avisar(mensagem: string) {
      setAviso(mensagem);
      if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
      avisoTimer.current = window.setTimeout(() => setAviso(null), 2600);
  }

  // Um segundo toque em Salvar enquanto a checagem de horário ou a gravação
  // estão em curso gravaria o agendamento duas vezes.
  async function saveOrUpdate(overrideStatus?: string) {
      if (salvandoRef.current) return;
      salvandoRef.current = true;
      try {
          await gravarAgendamento(overrideStatus);
      } finally {
          salvandoRef.current = false;
          setLoading(false);
      }
  }

  async function gravarAgendamento(overrideStatus?: string) {
      // Sem data ou hora a conversão para ISO estourava e o botão ficava girando para sempre.
      if (!formData.title || !formData.paciente_id || !formData.clinica_id || !formData.date || !formData.time) { await showAlert('Preencha clínica, paciente, data, hora e procedimento.', { type: 'warning' }); return; }

      if (formData.profissional_id) {
          const erroHorario = await validarAgendamentoCompleto({
              clinicaId: formData.clinica_id,
              profissionalId: formData.profissional_id,
              date: formData.date,
              time: formData.time,
              excludeAgendamentoId: formData.id,
          });
          if (erroHorario) { await showAlert(erroHorario, { type: 'warning' }); return; }
      }

      setLoading(true); 
      
      const finalStatus = overrideStatus || formData.status;
      const dataLocal = new Date(`${formData.date}T${formData.time}:00`); 
      const dataHoraISO = dataLocal.toISOString(); 
      
      const payload = { 
          paciente_id: formData.paciente_id, 
          clinica_id: formData.clinica_id, 
          profissional_id: formData.profissional_id || null, 
          data_hora: dataHoraISO, 
          procedimento: formData.title, 
          cor: formData.theme, 
          valor: parseFloat(formData.valor) || 0, 
          desconto: parseFloat(formData.desconto) || 0, 
          valor_final: (parseFloat(formData.valor) || 0) - (parseFloat(formData.desconto) || 0), 
          observacoes: formData.observacoes, 
          status: finalStatus 
      }; 
      
      const modo = await modoDados();
      try {
          if (modo === 'local') {
              const payloadLocal = { ...payload, duracao_minutos: 60 };
              if (formData.id) await atualizar<AgendamentoLocal>('agendamentos', Number(formData.id), payloadLocal);
              else await inserir<AgendamentoLocal>('agendamentos', payloadLocal);
          } else {
              // O supabase-js devolve o erro em vez de lançar: sem olhar, a gravação recusada fechava o popup como se tivesse salvo.
              if (formData.id) {
                  // Edição barrada pela RLS não dá erro: passa sem alterar linha nenhuma. Sem a linha de volta, não salvou.
                  const { data, error } = await tabelas.from('agendamentos').update(payload).eq('id', formData.id).select('id');
                  if (error) throw error;
                  if (!Array.isArray(data) || data.length === 0) throw new Error('Nenhum agendamento alterado.');
              } else {
                  const { error } = await tabelas.from('agendamentos').insert([payload]);
                  if (error) throw error;
              }
          }
      } catch (erro) {
          // Aviso do modo de consulta e regra do banco passam; rede, sessão e permissão viram frase fixa.
          await showAlert(fraseDeErro(erro, 'Não foi possível salvar o agendamento.'), { type: 'error' });
          setLoading(false);
          return;
      }

      setOpenModal(false);
      avisar('Agendamento salvo.');
      carregarEventos();
      window.dispatchEvent(new CustomEvent('ortus:agenda-changed'));
      setLoading(false); 
  }

  async function excluirAgendamento() {
      if(!formData.id) return;
      if(!(await showConfirm('Tem certeza que deseja excluir este agendamento?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      const modo = await modoDados();
      try {
          if (modo === 'local') await remover('agendamentos', Number(formData.id));
          else {
              // Exclusão barrada pela RLS também não dá erro: sem linha apagada, o popup fica aberto com o aviso.
              const { data, error } = await tabelas.from('agendamentos').delete().eq('id', formData.id).select('id');
              if (error) throw error;
              if (!Array.isArray(data) || data.length === 0) throw new Error('Nenhum agendamento excluído.');
          }
      } catch (erro) {
          await showAlert(fraseDeErro(erro, 'Não foi possível excluir o agendamento.'), { type: 'error' });
          return;
      }
      setOpenModal(false);
      avisar('Agendamento excluído.');
      carregarEventos();
  }

  function abrirCadastroPaciente() {
      const clinicaId = formData.clinica_id || (clinicaFiltro !== 'todas' ? clinicaFiltro : null);
      openQuickCapture(clinicaId);
  }

  function abrirNovoAgendamento() {
      const hoje = chaveLocal(new Date());
      const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : '';
      const preProfissional =
          !ehAdmin && usuarioAtual?.profissional_id ? String(usuarioAtual.profissional_id) : '';
      setFormData({
          id: null,
          title: '',
          date: hoje,
          time: '08:00',
          theme: 'blue',
          paciente_id: '',
          valor: '0',
          desconto: '0',
          observacoes: '',
          status: 'agendado',
          clinica_id: preClinica,
          profissional_id: preProfissional,
      });
      setOpenModal(true);
  }

  // Celular: quem está olhando um dia à frente marca nesse dia; hoje ou dia que já passou seguem abrindo em hoje.
  function abrirNovoNoDiaVisto() {
      const umDiaSo = visao === 'dia' || visao === 'profissionais';
      if (umDiaSo && inicioDoDia(cursor) > inicioDoDia(new Date())) abrirNoDia(cursor);
      else abrirNovoAgendamento();
  }

  function escolherVisao(proxima: Visao) {
      visaoEscolhida.current = true;
      setVisao(proxima);
  }

  const cardShell = 'rounded-xl bg-white';

  const eventosVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return events.filter((evento) => {
      const props = evento.extendedProps || {};
      const nome = String(nomePaciente(props) || '');
      const procedimento = String(props.procedimento || '');
      if (termo && !nome.toLowerCase().includes(termo) && !procedimento.toLowerCase().includes(termo)) return false;
      if (filtroStatus !== 'todos' && (props.status || 'agendado') !== filtroStatus) return false;
      if (filtroProfissional !== 'todos' && String(props.profissional_id || '') !== filtroProfissional) return false;
      return true;
    });
  }, [events, busca, filtroStatus, filtroProfissional]);

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, any[]>();
    eventosVisiveis.forEach((evento) => {
      const chave = chaveLocal(new Date(evento.start));
      const lista = mapa.get(chave) || [];
      lista.push(evento);
      mapa.set(chave, lista);
    });
    mapa.forEach((lista) => lista.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
    return mapa;
  }, [eventosVisiveis]);

  const horasGrade = useMemo(() => {
    let min = 7;
    let max = 20;
    eventosVisiveis.forEach((evento) => {
      const hora = new Date(evento.start).getHours();
      if (Number.isNaN(hora)) return;
      if (hora < min) min = hora;
      if (hora > max) max = hora;
    });
    return Array.from({ length: max - min + 1 }, (_, indice) => min + indice);
  }, [eventosVisiveis]);

  const planoDoPaciente = useMemo(() => {
    const pac = pacientes.find((p: any) => String(p.id) === String(formData.paciente_id));
    if (!pac?.plano_id) return null;
    return planosPreco.find((p) => p.id === pac.plano_id) ?? null;
  }, [pacientes, formData.paciente_id, planosPreco]);

  const tratamentosAgenda = useMemo(
    () => tratamentosVisiveis(tratamentosBase, planoDoPaciente, linhasPreco),
    [tratamentosBase, planoDoPaciente, linhasPreco],
  );

  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (visao !== 'semana' && visao !== 'dia' && visao !== 'profissionais') return;
    const grade = gradeHorasRef.current;
    const linha = grade?.querySelector('[data-agora]') as HTMLElement | null;
    if (!grade || !linha) return;
    const gradeRect = grade.getBoundingClientRect();
    const linhaRect = linha.getBoundingClientRect();
    grade.scrollTop += linhaRect.top - gradeRect.top - grade.clientHeight / 2;
    // Também quando a janela termina de carregar: os agendamentos esticam as linhas e tiravam o "agora" do meio da grade.
  }, [visao, cursor, carregandoJanela]);

  const hoje = inicioDoDia(new Date());
  const titulo = visao === 'dia' || visao === 'profissionais'
    ? capitalizar(cursor.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }))
    : visao === 'semana'
      ? `${inicioSemana(cursor).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${somarDias(inicioSemana(cursor), 6).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : `${capitalizar(cursor.toLocaleDateString('pt-BR', { month: 'long' }))} ${cursor.getFullYear()}`;

  function mover(direcao: -1 | 1) {
    const proxima = new Date(cursor);
    if (visao === 'dia' || visao === 'profissionais') proxima.setDate(proxima.getDate() + direcao);
    else if (visao === 'semana') proxima.setDate(proxima.getDate() + direcao * 7);
    else {
      // Mês e Lista: o dia fica limitado ao fim do mês de destino. Só com setMonth, 31/01 virava 03/03
      // (pulava fevereiro) e 31/12 voltando um mês virava 01/12 (não saía do mês).
      const dia = proxima.getDate();
      proxima.setDate(1);
      proxima.setMonth(proxima.getMonth() + direcao);
      const ultimoDia = new Date(proxima.getFullYear(), proxima.getMonth() + 1, 0).getDate();
      proxima.setDate(Math.min(dia, ultimoDia));
    }
    setCursor(proxima);
  }

  function ChipEvento({ evento }: { evento: any }) {
    const props = evento.extendedProps || {};
    const hora = new Date(evento.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return (
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); abrirEvento(props); }}
        className="flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-neutral-700 hover:bg-neutral-100 max-md:min-h-10 max-md:gap-2 max-md:px-2 max-md:py-1.5 max-md:text-sm"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${corStatus(props.status)}`} />
        {/* No celular o chip só aparece na visão Dia, com a largura toda: o nome quebra a linha em vez de ser cortado. */}
        <span className={`truncate max-md:whitespace-normal max-md:break-words ${props.status === 'cancelado' ? 'line-through text-neutral-400' : ''}`}>
          <span className="text-neutral-400">{hora}</span> {nomePaciente(props) || 'Paciente'}
          {props.procedimento ? <span className="text-neutral-500 md:hidden"> · {props.procedimento}</span> : null}
        </span>
      </button>
    );
  }

  // Celular: uma linha tocável por agendamento, com o nome inteiro e o procedimento embaixo.
  function renderLinhaCelular(evento: EventoAgenda) {
    const props = evento.extendedProps;
    const hora = new Date(evento.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const status = props.status || 'agendado';
    const rotuloStatus = status === 'agendado' ? '' : STATUS_OPCOES.find((opcao) => opcao.value === status)?.label || '';
    return (
      <button
        key={evento.id}
        type="button"
        onClick={() => abrirEvento(props)}
        className="flex min-h-11 w-full items-start gap-3 border-t border-neutral-100 px-3 py-2.5 text-left active:bg-neutral-50"
      >
        <span className="w-11 shrink-0 text-sm tabular-nums text-neutral-500">{hora}</span>
        <span className="min-w-0 flex-1">
          <span className={`block break-words text-sm font-medium ${status === 'cancelado' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{nomePaciente(props) || 'Paciente'}</span>
          <span className="block break-words text-xs text-neutral-500">{[props.procedimento, rotuloStatus].filter(Boolean).join(' · ')}</span>
        </span>
        <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${corStatus(status)}`} />
      </button>
    );
  }

  // Celular: os agendamentos de um dia sob um cabeçalho que leva à visão Dia e tem o atalho de marcar nesse dia.
  function renderDiaCelular(dia: Date, lista: EventoAgenda[]) {
    const rotuloDia = capitalizar(dia.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
    return (
      <section key={chaveLocal(dia)} className="border-b border-neutral-200 last:border-b-0">
        <div className="sticky top-0 z-[1] flex items-center gap-1 bg-neutral-50 pl-3 pr-1">
          <button
            type="button"
            onClick={() => { setCursor(dia); escolherVisao('dia'); }}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-neutral-900"
          >
            <span className="min-w-0 break-words">{rotuloDia}</span>
            {mesmoDia(dia, hoje) && <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">Hoje</span>}
          </button>
          <button
            type="button"
            aria-label={`Novo agendamento em ${rotuloDia}`}
            onClick={() => abrirNoDia(dia)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-600 active:bg-neutral-200"
          >
            <Plus size={18} />
          </button>
        </div>
        {lista.length === 0
          ? <p className="border-t border-neutral-100 px-3 py-3 text-sm text-neutral-400">Sem agendamentos.</p>
          : lista.map((evento) => renderLinhaCelular(evento))}
      </section>
    );
  }

  const inputClass =
    'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';

  const diasMes = Array.from({ length: 42 }, (_, indice) => somarDias(inicioSemana(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), indice));
  const diasSemana = Array.from({ length: 7 }, (_, indice) => somarDias(inicioSemana(cursor), indice));
  const visoes: { id: Visao; label: string; Icone: typeof Calendar }[] = [
    { id: 'dia', label: 'Dia', Icone: Clock },
    { id: 'semana', label: 'Semana', Icone: LayoutGrid },
    { id: 'mes', label: 'Mês', Icone: Calendar },
    { id: 'lista', label: 'Lista', Icone: List },
    { id: 'profissionais', label: 'Profissionais', Icone: Users },
  ];

  function dentroDoPeriodo(data: Date) {
    if (visao === 'dia' || visao === 'profissionais') return mesmoDia(data, cursor);
    if (visao === 'semana') {
      const inicio = inicioSemana(cursor);
      return data >= inicio && data < somarDias(inicio, 7);
    }
    return data.getMonth() === cursor.getMonth() && data.getFullYear() === cursor.getFullYear();
  }

  const colunasProfissional = profissionais.filter((profissional: any) => {
    if (filtroProfissional !== 'todos' && String(profissional.id) !== filtroProfissional) return false;
    if (clinicaFiltro === 'todas') return true;
    return (profissional.profissionais_clinicas || []).some((vinculo: any) => String(vinculo.clinica_id) === String(clinicaFiltro));
  });

  const eventosLista = eventosVisiveis
    .filter((evento) => dentroDoPeriodo(new Date(evento.start)))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const temFiltroAtivo = busca.trim() !== '' || filtroStatus !== 'todos' || filtroProfissional !== 'todos';

  const campoBusca = (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        value={busca}
        onChange={(event) => setBusca(event.target.value)}
        placeholder="Buscar paciente ou procedimento..."
        aria-label="Buscar paciente ou procedimento"
        className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
      />
    </div>
  );

  // Celular, visões de um dia só: a semana do cursor num toque. Substitui o cabeçalho de um dia.
  const faixaSemana = (
    <div className="grid shrink-0 grid-cols-7 border-b border-neutral-200 md:hidden">
      {diasSemana.map((dia) => {
        const selecionado = mesmoDia(dia, cursor);
        const ehHoje = mesmoDia(dia, hoje);
        const temAgendamento = (eventosPorDia.get(chaveLocal(dia)) || []).length > 0;
        const rotuloDia = capitalizar(dia.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
        return (
          <button
            key={chaveLocal(dia)}
            type="button"
            onClick={() => setCursor(dia)}
            aria-pressed={selecionado}
            aria-current={ehHoje ? 'date' : undefined}
            aria-label={`${rotuloDia}${ehHoje ? ', hoje' : ''}${temAgendamento ? ', com agendamentos' : ''}`}
            className="flex min-h-[3.75rem] min-w-0 flex-col items-center justify-center gap-0.5 py-1"
          >
            <span className={`text-[11px] font-medium ${ehHoje ? 'text-amber-600' : 'text-neutral-400'}`}>{LETRAS_DIA[dia.getDay()]}</span>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                selecionado
                  ? `font-semibold text-white ${ehHoje ? 'bg-amber-500' : 'bg-neutral-900'}`
                  : ehHoje
                    ? 'font-semibold text-amber-600 ring-1 ring-inset ring-amber-500'
                    : 'text-neutral-800'
              }`}
            >
              {dia.getDate()}
            </span>
            <span className={`h-1 w-1 rounded-full ${temAgendamento ? 'bg-neutral-500' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5 max-md:overflow-y-auto">
      <Aviso mensagem={aviso} />
      <header className="relative mb-2 shrink-0 space-y-2 md:mb-3 md:space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
          {titulo}
          <span className="hidden text-neutral-400 md:inline"> · {clinicaNome}</span>
        </h1>

        <div className="max-md:hidden">{campoBusca}</div>

        {/* Barra de toque (celular e tablet): tudo com 40px de altura. */}
        <div className="flex flex-wrap items-center gap-2 lg:hidden">
          <div className="inline-flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Anterior" onClick={() => mover(-1)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => setCursor(new Date())} className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700 hover:bg-neutral-50">
              Hoje
            </button>
            <button type="button" aria-label="Próximo" onClick={() => mover(1)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50">
              <ChevronRight size={16} />
            </button>
          </div>
          {/* Celular: busca e filtros abrem por este botão, para a grade do dia ficar com a altura da tela. */}
          <div className="ml-auto inline-flex shrink-0 items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setFiltrosAbertos((aberto) => !aberto)}
              aria-expanded={filtrosAbertos}
              aria-label={temFiltroAtivo ? 'Busca e filtros (há filtro ativo)' : 'Busca e filtros'}
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-md border bg-white ${filtrosAbertos ? 'border-neutral-900 text-neutral-900' : 'border-neutral-200 text-neutral-600'}`}
            >
              <SlidersHorizontal size={16} />
              {temFiltroAtivo && <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
            </button>
            {clinicaFiltro !== 'todas' && <BotaoSenha clinicaId={Number(clinicaFiltro)} />}
            <button
              type="button"
              onClick={abrirNovoNoDiaVisto}
              aria-label="Novo agendamento"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
            >
              <Plus size={16} className="shrink-0" />
              Novo
            </button>
          </div>
          {/* No celular ocupa a linha inteira (cinco opções ao lado das setas ficavam com menos de 40px); no tablet divide a linha com as setas. */}
          <SegmentedControl
            size="md"
            className="w-full bg-white [&>button]:alvo-toque md:w-auto md:min-w-0 md:flex-1"
            value={visao}
            onChange={escolherVisao}
            options={visoes.map(({ id, label, Icone }) => ({
              value: id,
              ariaLabel: label,
              label: (
                <>
                  <Icone size={14} className="shrink-0 max-sm:h-4 max-sm:w-4" />
                  <span className="hidden truncate text-xs sm:inline">{label}</span>
                </>
              ),
            }))}
          />
          {filtrosAbertos && <div className="w-full md:hidden">{campoBusca}</div>}
          <div className={`flex w-full items-center gap-2 ${filtrosAbertos ? '' : 'max-md:hidden'}`}>
            {(filtroStatus !== 'todos' || filtroProfissional !== 'todos') && (
              <button
                type="button"
                aria-label="Limpar filtros"
                onClick={() => { setFiltroStatus('todos'); setFiltroProfissional('todos'); }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-200 bg-white text-red-500"
              >
                <X size={16} />
              </button>
            )}
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
              <MenuFiltro cheio alto rotulo="Status" valor={filtroStatus} onChange={setFiltroStatus} opcoes={STATUS_OPCOES} />
              <MenuFiltro
                cheio
                alto
                rotulo="Profissional"
                valor={filtroProfissional}
                onChange={setFiltroProfissional}
                opcoes={[{ value: 'todos', label: 'Todos' }, ...profissionais.map((profissional: any) => ({ value: String(profissional.id), label: profissional.nome }))]}
              />
              <button
                type="button"
                onClick={abrirNovoAgendamento}
                className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-2 text-sm font-medium text-white hover:bg-neutral-800 max-md:hidden"
              >
                <Plus size={14} className="shrink-0" />
                <span className="truncate">Novo</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 max-lg:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1">
              <button type="button" aria-label="Anterior" onClick={() => mover(-1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50">
                <ChevronLeft size={16} />
              </button>
              <button type="button" onClick={() => setCursor(new Date())} className="h-8 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700 hover:bg-neutral-50">
                Hoje
              </button>
              <button type="button" aria-label="Próximo" onClick={() => mover(1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(filtroStatus !== 'todos' || filtroProfissional !== 'todos') && (
              <button
                type="button"
                aria-label="Limpar filtros"
                onClick={() => { setFiltroStatus('todos'); setFiltroProfissional('todos'); }}
                className="inline-flex h-8 w-8 items-center justify-center text-red-500"
              >
                <X size={16} />
              </button>
            )}
            <MenuFiltro rotulo="Status" valor={filtroStatus} onChange={setFiltroStatus} opcoes={STATUS_OPCOES} />
            <MenuFiltro
              rotulo="Profissional"
              valor={filtroProfissional}
              onChange={setFiltroProfissional}
              opcoes={[{ value: 'todos', label: 'Todos' }, ...profissionais.map((profissional: any) => ({ value: String(profissional.id), label: profissional.nome }))]}
            />
            <SegmentedControl
              fit
              className="shrink-0 bg-white"
              value={visao}
              onChange={escolherVisao}
              options={visoes.map(({ id, label, Icone }) => ({
                value: id,
                ariaLabel: label,
                label: (
                  <>
                    <Icone size={14} />
                    <span className="hidden sm:inline">{label}</span>
                  </>
                ),
              }))}
            />
            <button
              type="button"
              onClick={abrirNovoAgendamento}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 py-0 text-sm font-medium leading-none text-white hover:bg-neutral-800"
            >
              <Plus size={14} />
              Novo agendamento
            </button>
          </div>
        </div>

        {lembretesPendentes.length > 0 && (
          <section className={`${cardShell} border border-amber-200/80 bg-amber-50/80 p-3 sm:p-4`}>
            <button
              type="button"
              onClick={() => setLembretesAbertos((v) => !v)}
              aria-expanded={lembretesAbertos}
              className="flex w-full items-center justify-between gap-2 text-left max-md:min-h-10"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700">
                  <Bell size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-950">Lembretes 24h</p>
                  <p className="truncate text-xs text-amber-800/90">
                    {`${lembretesPendentes.length} consulta(s) amanhã`}
                  </p>
                </div>
              </div>
              <ChevronDown size={18} className={`shrink-0 text-amber-800 transition-transform ${lembretesAbertos ? 'rotate-180' : ''}`} />
            </button>
            {lembretesAbertos && !lembretesLoading && lembretesPendentes.length > 0 && (
              <div className="mt-3 max-h-36 space-y-2 overflow-y-auto">
                {lembretesPendentes.map((ag) => (
                  <div
                    key={ag.id}
                    className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 text-sm">
                      <span className="font-semibold text-neutral-900">{ag.paciente_nome}</span>
                      <span className="ml-2 text-neutral-500">
                        {new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {ag.procedimento}
                      </span>
                    </div>
                    <PatientContactButtons
                      variant="row"
                      className="max-md:[&_button]:h-10"
                      telefone={ag.paciente_telefone}
                      email={ag.paciente_email}
                      clinicaId={ag.clinica_id}
                      evento="lembrete"
                      contexto={ctxLembreteAgendamento(ag)}
                      onEnviado={(canal) => {
                        // O registro que vale é o de lembretes_agenda; a cópia em configuração pode falhar para quem não é admin.
                        void marcarLembreteEnviado(
                          ag.clinica_id,
                          ag.id,
                          canal === 'whatsapp' ? 'whatsapp' : canal === 'email' ? 'email' : canal === 'sms' ? 'sms' : 'manual',
                        ).catch(() => undefined);
                        setLembretesPendentes((prev) => prev.filter((x) => x.id !== ag.id));
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Sem bloquear a tela: só avisa que os agendamentos do período ainda estão chegando. */}
        {carregandoJanela && (
          <span role="status" aria-label="Carregando agendamentos" className="pointer-events-none absolute inset-x-0 -bottom-1.5 h-0.5 animate-pulse rounded-full bg-neutral-400 md:-bottom-2" />
        )}
      </header>

      {visao === 'mes' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-md:min-h-[20rem]">
          <div className="grid shrink-0 grid-cols-7 border-b border-neutral-200">
            {DIAS_CURTOS.map((dia) => (
              <div key={dia} className="py-2 text-center text-xs font-medium text-neutral-500">{dia}</div>
            ))}
          </div>
          <div className="grid min-h-[280px] flex-1 grid-cols-7 grid-rows-6">
            {diasMes.map((dia, indice) => {
              const lista = eventosPorDia.get(chaveLocal(dia)) || [];
              const fora = dia.getMonth() !== cursor.getMonth();
              return (
                <div
                  key={`${chaveLocal(dia)}-${indice}`}
                  onClick={() => {
                    // Celular: a célula só tem espaço para pontos; o toque leva ao dia, onde os nomes cabem.
                    if (window.matchMedia(CONSULTA_CELULAR).matches) {
                      setCursor(dia);
                      escolherVisao('dia');
                      return;
                    }
                    abrirNoDia(dia);
                  }}
                  className={`flex min-h-0 cursor-pointer flex-col p-1 text-left hover:bg-neutral-50 max-md:items-center md:p-1.5 ${indice % 7 !== 6 ? 'border-r border-neutral-200' : ''} ${indice < 35 ? 'border-b border-neutral-200' : ''}`}
                >
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs md:text-sm ${mesmoDia(dia, hoje) ? 'bg-amber-500 font-semibold text-white' : fora ? 'text-neutral-300' : 'text-neutral-700'}`}>{dia.getDate()}</span>
                  <div className="mt-0.5 min-h-0 space-y-0.5 overflow-hidden max-md:hidden">
                    {lista.slice(0, 2).map((evento) => <ChipEvento key={evento.id} evento={evento} />)}
                    {lista.length > 2 && <span className="px-1 text-[11px] text-neutral-400">+{lista.length - 2}</span>}
                  </div>
                  {lista.length > 0 && (
                    <div className="mt-1 flex flex-wrap justify-center gap-0.5 md:hidden">
                      {lista.slice(0, 3).map((evento) => (
                        <span key={evento.id} className={`h-1.5 w-1.5 rounded-full ${corStatus(evento.extendedProps?.status)}`} />
                      ))}
                      {lista.length > 3 && <span className="text-[9px] leading-none text-neutral-400">+{lista.length - 3}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Celular: a semana vira lista por dia. Sete colunas só cabiam rolando para o lado e cortando os nomes. */}
      {visao === 'semana' && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white max-md:min-h-[15rem] md:hidden">
          {diasSemana.map((dia) => renderDiaCelular(dia, eventosPorDia.get(chaveLocal(dia)) || []))}
        </div>
      )}

      {(visao === 'semana' || visao === 'dia') && (
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white ${visao === 'semana' ? 'max-md:hidden' : 'max-md:min-h-[15rem]'}`}>
          {visao === 'dia' && faixaSemana}
          <div className={`grid shrink-0 border-b border-neutral-200 ${visao === 'dia' ? 'grid-cols-[3.25rem_minmax(0,1fr)] max-md:hidden' : 'grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]'}`}>
            <div />
            {(visao === 'dia' ? [inicioDoDia(cursor)] : diasSemana).map((dia) => (
              <div key={chaveLocal(dia)} className="py-2 text-center">
                <div className="text-[11px] text-neutral-400">{DIAS_CURTOS[dia.getDay()]}</div>
                <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-sm ${mesmoDia(dia, hoje) ? 'bg-amber-500 font-semibold text-white' : 'text-neutral-800'}`}>{dia.getDate()}</div>
              </div>
            ))}
          </div>
          <div ref={gradeHorasRef} className="relative min-h-0 flex-1 overflow-y-auto">
            {horasGrade.map((hora) => {
              const dias = visao === 'dia' ? [inicioDoDia(cursor)] : diasSemana;
              const rotulo = `${String(hora).padStart(2, '0')}:00`;
              return (
                <div key={hora} className={`grid min-h-12 border-b border-neutral-100 last:border-b-0 ${visao === 'dia' ? 'grid-cols-[3.25rem_minmax(0,1fr)]' : 'grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]'}`}>
                  <div className="px-1 pt-1 text-right text-[11px] text-neutral-400">{rotulo}</div>
                  {dias.map((dia) => {
                    const lista = (eventosPorDia.get(chaveLocal(dia)) || []).filter((evento) => new Date(evento.start).getHours() === hora);
                    const mostraAgora = mesmoDia(dia, agora) && agora.getHours() === hora;
                    return (
                      <div
                        key={`${chaveLocal(dia)}-${hora}`}
                        onClick={() => abrirNoDia(dia, rotulo)}
                        className="relative min-h-12 cursor-pointer border-l border-neutral-100 p-0.5 hover:bg-neutral-50"
                      >
                        {mostraAgora && (
                          <div
                            data-agora=""
                            className="pointer-events-none absolute inset-x-0 z-10"
                            style={{ top: `${(agora.getMinutes() / 60) * 100}%` }}
                          >
                            <span className="absolute left-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
                            <span className="absolute left-0 right-0 h-0.5 -translate-y-1/2 bg-red-500" />
                          </div>
                        )}
                        {lista.map((evento) => <ChipEvento key={evento.id} evento={evento} />)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visao === 'profissionais' && (() => {
        const dia = inicioDoDia(cursor);
        const doDia = eventosPorDia.get(chaveLocal(dia)) || [];
        const temSemProfissional = doDia.some((evento) => !evento.extendedProps?.profissional_id);
        const colunas = temSemProfissional
          ? [...colunasProfissional, { id: '', nome: 'Sem profissional', foto_url: null }]
          : colunasProfissional;
        const grade = `3.25rem repeat(${Math.max(colunas.length, 1)}, minmax(8.5rem, 1fr))`;
        return (
          <>
          {/* Celular: um bloco por profissional com os agendamentos do dia. As colunas lado a lado só cabiam rolando para o lado. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-md:min-h-[15rem] md:hidden">
            {faixaSemana}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {colunas.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-neutral-400">Nenhum profissional nesta clínica.</p>
              ) : colunas.map((profissional) => {
                const nome = profissional.nome || 'Profissional';
                const lista: EventoAgenda[] = doDia.filter((evento) => String(evento.extendedProps?.profissional_id || '') === String(profissional.id || ''));
                return (
                  <section key={profissional.id || 'sem'} className="border-b border-neutral-200 last:border-b-0">
                    <div className="sticky top-0 z-[1] flex items-center gap-1 bg-neutral-50 pl-3 pr-1">
                      <p className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm font-medium text-neutral-900">
                        <span className="min-w-0 break-words">{nome}</span>
                        <span className="shrink-0 text-xs font-normal tabular-nums text-neutral-400">{lista.length}</span>
                      </p>
                      <button
                        type="button"
                        aria-label={profissional.id ? `Novo agendamento para ${nome}` : 'Novo agendamento sem profissional'}
                        onClick={() => abrirNoDia(dia, '08:00', profissional.id ? String(profissional.id) : undefined)}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-600 active:bg-neutral-200"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {lista.length === 0
                      ? <p className="border-t border-neutral-100 px-3 py-3 text-sm text-neutral-400">Sem agendamentos.</p>
                      : lista.map((evento) => renderLinhaCelular(evento))}
                  </section>
                );
              })}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-md:hidden">
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="min-w-max">
                <div className="grid shrink-0 border-b border-neutral-200" style={{ gridTemplateColumns: grade }}>
                  <div className="sticky left-0 z-[5] bg-white" />
                  {colunas.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-neutral-400">Nenhum profissional nesta clínica.</div>
                  ) : colunas.map((profissional: any) => {
                    const nome = profissional.nome || 'Profissional';
                    const partes = nome.trim().split(/\s+/);
                    const iniciais = ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
                    return (
                      <div key={profissional.id || 'sem'} className="flex min-w-[8.5rem] flex-col items-center gap-1 px-2 py-2">
                        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-500">
                          {profissional.foto_url ? <img src={profissional.foto_url} alt="" className="h-full w-full object-cover" /> : iniciais || '—'}
                        </span>
                        <span className="w-full truncate text-center text-xs font-medium text-neutral-800">{nome}</span>
                      </div>
                    );
                  })}
                </div>
                <div ref={gradeHorasRef}>
                  {horasGrade.map((hora) => {
                    const rotulo = `${String(hora).padStart(2, '0')}:00`;
                    const mostraAgora = mesmoDia(dia, agora) && agora.getHours() === hora;
                    return (
                      <div key={hora} className="relative grid min-h-12 border-b border-neutral-100 last:border-b-0" style={{ gridTemplateColumns: grade }}>
                        {mostraAgora && (
                          <div data-agora="" className="pointer-events-none absolute inset-x-0 z-10" style={{ top: `${(agora.getMinutes() / 60) * 100}%` }}>
                            <span className="absolute left-[3.25rem] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
                            <span className="absolute left-[3.25rem] right-0 h-0.5 -translate-y-1/2 bg-red-500" />
                          </div>
                        )}
                        <div className="sticky left-0 z-[5] bg-white px-1 pt-1 text-right text-[11px] text-neutral-400">{rotulo}</div>
                        {(colunas.length ? colunas : [null]).map((profissional: any, indice: number) => {
                          const lista = profissional
                            ? doDia.filter((evento) => String(evento.extendedProps?.profissional_id || '') === String(profissional.id || '') && new Date(evento.start).getHours() === hora)
                            : [];
                          return (
                            <div
                              key={profissional?.id || indice}
                              onClick={() => profissional && abrirNoDia(dia, rotulo, profissional.id ? String(profissional.id) : undefined)}
                              className="relative min-h-12 min-w-[8.5rem] cursor-pointer border-l border-neutral-100 p-0.5 hover:bg-neutral-50"
                            >
                              {lista.map((evento) => <ChipEvento key={evento.id} evento={evento} />)}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          </>
        );
      })()}

      {visao === 'lista' && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white max-md:min-h-[15rem]">
          {eventosLista.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">Nenhum agendamento neste período.</p>
          ) : (
            <>
              {/* Celular: agrupado por dia, com o nome inteiro. A linha única cortava o nome e escondia o procedimento. */}
              <div className="md:hidden">
                {eventosLista
                  .reduce<{ dia: Date; lista: EventoAgenda[] }[]>((grupos, evento) => {
                    const dia = inicioDoDia(new Date(evento.start));
                    const ultimo = grupos[grupos.length - 1];
                    if (ultimo && mesmoDia(ultimo.dia, dia)) ultimo.lista.push(evento);
                    else grupos.push({ dia, lista: [evento] });
                    return grupos;
                  }, [])
                  .map(({ dia, lista }) => renderDiaCelular(dia, lista))}
              </div>
              {eventosLista.map((evento) => {
                const props = evento.extendedProps || {};
                const data = new Date(evento.start);
                return (
                  <button
                    key={evento.id}
                    type="button"
                    onClick={() => abrirEvento(props)}
                    className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-left last:border-b-0 hover:bg-neutral-50 max-md:hidden"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${corStatus(props.status)}`} />
                    <span className="w-28 shrink-0 text-sm text-neutral-500">{data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={`min-w-0 truncate text-sm text-neutral-900 ${props.status === 'cancelado' ? 'line-through text-neutral-400' : ''}`}>{nomePaciente(props) || 'Paciente'}</span>
                    <span className="hidden min-w-0 truncate text-sm text-neutral-500 sm:block">{props.procedimento}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        maxWidth="lg"
        hideCloseButton
        panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]"
      >
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-4 py-3 sm:px-6 sm:py-4">
                      <div>
                          <h2 className="text-lg font-semibold text-neutral-900">{formData.id ? 'Editar agendamento' : 'Novo agendamento'}</h2>
                          <p className="mt-0.5 text-xs font-medium text-neutral-400">Paciente, horário e procedimento.</p>
                      </div>
                      <button type="button" onClick={() => setOpenModal(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 max-md:inline-flex max-md:h-10 max-md:w-10 max-md:shrink-0 max-md:items-center max-md:justify-center" aria-label="Fechar"><X size={18}/></button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
                      {/* Celular: uma coluna, cada campo com a largura toda. */}
                      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Clínica <span className="text-red-500">*</span></span>
                              <CustomSelect
                                  value={formData.clinica_id}
                                  onChange={v => setFormData({...formData, clinica_id: v})}
                                  disabled={clinicaFiltro !== 'todas'}
                                  options={clinicas.map((c:any) => ({ value: String(c.id), label: c.nome }))}
                                  placeholder="Selecione..."
                                  size="md"
                              />
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Profissional</span>
                              <CustomSelect value={formData.profissional_id} onChange={v => setFormData({...formData,profissional_id: v})} disabled={!ehAdmin} options={profissionaisFiltrados.map((p:any) => ({ value: String(p.id), label: p.nome }))} placeholder="Qualquer um..." size="md"/>
                          </label>
                          <label className="sm:col-span-2">
                              <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-neutral-500">
                                  <span>Paciente <span className="text-red-500">*</span></span>
                                  <button type="button" onClick={abrirCadastroPaciente} className="alvo-toque inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-neutral-900"><UserPlus size={12}/> Novo</button>
                              </span>
                              <CustomSelect value={formData.paciente_id} onChange={v => {
                                  const pac = pacientes.find((p: any) => String(p.id) === String(v));
                                  const plano = pac?.plano_id ? planosPreco.find((p) => p.id === pac.plano_id) ?? null : null;
                                  const tratamento = tratamentosBase.find((item: any) => item.nome === formData.title);
                                  const preco = valorNaAgenda(tratamento, plano, linhasPreco);
                                  setFormData({ ...formData, paciente_id: v, valor: preco ?? formData.valor });
                              }} options={pacientes.filter((p:any) => !formData.clinica_id || p.clinica_id == formData.clinica_id).map((p:any) => ({ value: String(p.id), label: p.nome }))} placeholder="Selecione..." searchable size="md"/>
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Data <span className="text-red-500">*</span></span>
                              <CampoData value={formData.date} onChange={(v) => setFormData({ ...formData, date: v })} />
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Hora <span className="text-red-500">*</span></span>
                              <CampoHora value={formData.time} onChange={(v) => setFormData({ ...formData, time: v })} passo={30} />
                          </label>
                          <label className="sm:col-span-2">
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Procedimento <span className="text-red-500">*</span></span>
                              {modoLocal && formData.clinica_id && tratamentosAgenda.length === 0 ? (
                                  <input
                                      type="text"
                                      value={formData.title}
                                      onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                                      className={inputClass}
                                      placeholder="Digite o procedimento"
                                  />
                              ) : (
                                  <ProcedureCombobox
                                      clinicaId={formData.clinica_id}
                                      especialidades={especialidades}
                                      tratamentos={tratamentosAgenda}
                                      value={formData.title}
                                      onChange={(nome, t) => {
                                          const preco = valorNaAgenda(t, planoDoPaciente, linhasPreco);
                                          setFormData((p) => ({
                                              ...p,
                                              title: nome,
                                              valor: preco ?? p.valor,
                                          }));
                                      }}
                                      disabled={!formData.clinica_id}
                                  />
                              )}
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Valor (R$)</span>
                              <input type="number" step="1" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className={inputClass} placeholder="0,00" />
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Desconto (R$)</span>
                              <input type="number" step="1" value={formData.desconto} onChange={e => setFormData({...formData, desconto: e.target.value})} className={inputClass} placeholder="0,00" />
                          </label>
                          <label className="sm:col-span-2">
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Total</span>
                              <p className="flex h-10 items-center text-sm font-medium text-neutral-900">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</p>
                          </label>
                      </div>
                      {formData.id && formData.date === hojeNoFuso() && formData.clinica_id && (
                        <div className="flex items-center gap-2">
                          <BotaoChamar clinicaId={Number(formData.clinica_id)} agendamentoId={Number(formData.id)} compacto />
                          <span className="text-xs text-neutral-500">Chama o paciente na TV da sala de espera.</span>
                        </div>
                      )}
                      {formData.id && (
                        <div className="flex flex-wrap gap-1.5">
                          {(['agendado', 'concluido', 'faltou', 'cancelado'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setFormData((p) => ({ ...p, status: st }))}
                              className={`h-9 rounded-md border px-3 text-sm font-medium capitalize max-md:h-10 ${
                                formData.status === st ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                              }`}
                            >
                              {STATUS_OPCOES.find((opcao) => opcao.value === st)?.label || st}
                            </button>
                          ))}
                        </div>
                      )}
                      
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 border-t border-black/5 px-4 py-3 sm:px-6 sm:py-4">
                      {formData.id ? (
                        <button type="button" onClick={excluirAgendamento} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 max-md:h-10" title="Excluir">
                          <Trash2 size={14} /> Excluir
                        </button>
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setOpenModal(false)} className="h-10 px-3 text-sm font-medium text-neutral-500 hover:text-neutral-900">Cancelar</button>
                        <button type="button" onClick={() => saveOrUpdate()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60">
                          {loading && <Loader2 className="animate-spin" size={16} />} Salvar
                        </button>
                      </div>
                  </div>
      </Modal>
    </div>
  );
}