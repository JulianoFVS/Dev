'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, CircleAlert, CircleHelp, CreditCard, MoreHorizontal, Pencil, Plus, User, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import CustomSelect from '@/components/ui/CustomSelect';
import Modal from '@/components/ui/Modal';
import Switch from '@/components/ui/Switch';
import MenuPontos from '@/components/ui/MenuPontos';
import SegmentedControl from '@/components/ui/SegmentedControl';

const CACHE_KEY = 'ortus:tratamentos:v2';

const campo = 'h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';
const campoErro = 'h-10 w-full rounded-md border border-red-500 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-red-500';
const rotulo = 'mb-1.5 block text-xs font-medium text-neutral-500';
const btnPrimario = 'inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50';
const btnNeutro = 'inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700';
const btnBloqueado = 'inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-md bg-neutral-200 px-3 text-sm font-medium text-neutral-400';

function Legenda({ texto, children }: { texto: string; children: ReactNode }) {
  const ancora = useRef<HTMLSpanElement>(null);
  const [caixa, setCaixa] = useState<{ top: number; bottom: number; left: number; acima: boolean } | null>(null);

  function abrir() {
    const rect = ancora.current?.getBoundingClientRect();
    if (!rect) return;
    const largura = texto.length * 6.6 + 20;
    const centro = rect.left + rect.width / 2;
    const left = Math.min(window.innerWidth - largura / 2 - 8, Math.max(largura / 2 + 8, centro));
    setCaixa({ top: rect.top, bottom: rect.bottom, left, acima: rect.top >= 44 });
  }

  return (
    <span
      ref={ancora}
      className="relative inline-flex"
      onMouseEnter={abrir}
      onMouseLeave={() => setCaixa(null)}
      onPointerDown={() => setCaixa(null)}
    >
      {children}
      {caixa && createPortal(
        <span
          className="pointer-events-none fixed z-[80] whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white"
          style={caixa.acima
            ? { top: caixa.top - 6, left: caixa.left, transform: 'translate(-50%, -100%)' }
            : { top: caixa.bottom + 6, left: caixa.left, transform: 'translateX(-50%)' }}
        >
          {texto}
        </span>,
        document.body,
      )}
    </span>
  );
}

type Especialidade = { id: string; nome: string; ativo?: boolean | null };
type Tratamento = {
  id: number;
  nome: string;
  especialidade_id: string | null;
  valor_sugerido: number | null;
  custo_padrao: number | null;
  codigo_tuss_padrao: string | null;
  aceita_faces: boolean;
  ativo: boolean;
};
type Plano = {
  id: string;
  nome: string;
  tipo: string;
  observacoes: string | null;
  ativo: boolean;
};
type Preco = {
  plano_id: string;
  tratamento_id: number;
  valor: number | null;
  custo: number | null;
  codigo_tuss: string | null;
  aceita_faces: boolean;
  ativo: boolean;
};
type Snap = {
  clinicaId: number;
  planos: Plano[];
  especialidades: Especialidade[];
  tratamentos: Tratamento[];
  precos: Preco[];
  selecionadoId: string | null;
  espId: string | null;
};
type OrigemPlano = 'particular' | 'vazio' | 'escolha';
type FormTratamento = {
  nome: string;
  especialidadeId: string;
  valor: string;
  custo: string;
  tuss: string;
  faces: boolean;
  ativo: boolean;
  aplicar: string[];
  todosPlanos: boolean;
};

function lerBoot(): Snap | null {
  if (typeof localStorage === 'undefined') return null;
  const cid = localStorage.getItem('ortus_clinica_id');
  if (!cid || cid === 'all' || cid === 'todas') return null;
  const n = Number(cid);
  if (!Number.isFinite(n)) return null;
  const snap = readRouteCache<Snap>(CACHE_KEY, clinicScope(String(n)));
  if (!snap || snap.clinicaId !== n) return null;
  return snap;
}

function moeda(valor: number | null | undefined) {
  if (valor == null || Number.isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function numero(valor: string): number | null {
  const texto = valor.trim().replace(',', '.');
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

function nomeIgual(a: string, b: string) {
  return a.trim().localeCompare(b.trim(), 'pt-BR', { sensitivity: 'base' }) === 0;
}

function mensagemErro(err: unknown, fallback: string) {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : '';
  if (/duplicate|unique/i.test(msg)) return 'Já existe um registro com esse nome.';
  return fallback;
}

function ordenarPlanos(lista: Plano[]) {
  const particular = lista.filter((p) => p.tipo === 'particular');
  const resto = lista
    .filter((p) => p.tipo !== 'particular')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return [...particular, ...resto];
}

const formVazio: FormTratamento = {
  nome: '',
  especialidadeId: '',
  valor: '',
  custo: '',
  tuss: '',
  faces: false,
  ativo: true,
  aplicar: [],
  todosPlanos: true,
};

export default function TratamentosPage() {
  const { activeClinicId, activeClinic, loading: clinicLoading } = useClinica();
  const { showAlert, showConfirm } = useCustomAlert();
  const boot = useState(lerBoot)[0];
  const geracao = useRef(0);

  const clinicaId = activeClinicId && activeClinicId !== 'all' ? Number(activeClinicId) : null;

  const [planos, setPlanos] = useState<Plano[]>(() => boot?.planos ?? []);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>(() => boot?.especialidades ?? []);
  const [tratamentos, setTratamentos] = useState<Tratamento[]>(() => boot?.tratamentos ?? []);
  const [precos, setPrecos] = useState<Preco[]>(() => boot?.precos ?? []);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(() => boot?.selecionadoId ?? null);
  const [espId, setEspId] = useState<string | null>(() => boot?.espId ?? null);
  const [pronto, setPronto] = useState(() => !!boot);
  const [carregando, setCarregando] = useState(() => !boot);

  const [espModal, setEspModal] = useState<Especialidade | 'nova' | null>(null);
  const [espNome, setEspNome] = useState('');
  const [planoModal, setPlanoModal] = useState<'novo' | Plano | null>(null);
  const [planoNome, setPlanoNome] = useState('');
  const [planoAtivo, setPlanoAtivo] = useState(true);
  const [ordenacao, setOrdenacao] = useState<{ campo: 'nome' | 'valor' | 'status'; dir: 'asc' | 'desc' }>({ campo: 'nome', dir: 'asc' });
  const [buscaLista, setBuscaLista] = useState('');
  const [origem, setOrigem] = useState<OrigemPlano>('particular');
  const [buscaEscolha, setBuscaEscolha] = useState('');
  const [escolhidos, setEscolhidos] = useState<number[]>([]);
  const [tratModal, setTratModal] = useState<Tratamento | 'novo' | null>(null);
  const [form, setForm] = useState<FormTratamento>(formVazio);
  const [salvando, setSalvando] = useState(false);
  const tituloEspModal = useRef('Nova especialidade');
  const tituloPlanoModal = useRef('Novo plano');
  const criandoPlano = useRef(true);
  const tituloTratModal = useRef('Novo tratamento');
  const ignorarEspId = useRef('');
  const ignorarPlanoId = useRef<string | undefined>(undefined);
  const ignorarTratId = useRef(-1);
  if (espModal === 'nova') {
    tituloEspModal.current = 'Nova especialidade';
    ignorarEspId.current = '';
  } else if (espModal) {
    tituloEspModal.current = 'Editar especialidade';
    ignorarEspId.current = espModal.id;
  }
  if (planoModal === 'novo') {
    tituloPlanoModal.current = 'Novo plano';
    criandoPlano.current = true;
    ignorarPlanoId.current = undefined;
  } else if (planoModal) {
    tituloPlanoModal.current = 'Editar plano';
    criandoPlano.current = false;
    ignorarPlanoId.current = planoModal.id;
  }
  if (tratModal === 'novo') ignorarTratId.current = -1;
  else if (tratModal) ignorarTratId.current = tratModal.id;

  const ordenados = useMemo(() => ordenarPlanos(planos), [planos]);
  const particular = ordenados.find((p) => p.tipo === 'particular') ?? null;
  const planoAtual = ordenados.find((p) => p.id === selecionadoId) ?? particular;
  const ehParticular = !planoAtual || planoAtual.tipo === 'particular';
  const outrosPlanos = ordenados.filter((p) => p.id !== planoAtual?.id);
  if (tratModal === 'novo') tituloTratModal.current = 'Novo tratamento';
  else if (tratModal) tituloTratModal.current = ehParticular ? 'Editar tratamento' : tratModal.nome;

  useEffect(() => {
    if (clinicLoading) return;
    if (!clinicaId) {
      setPlanos([]);
      setEspecialidades([]);
      setTratamentos([]);
      setPrecos([]);
      setSelecionadoId(null);
      setPronto(false);
      setCarregando(false);
      return;
    }
    const snap = readRouteCache<Snap>(CACHE_KEY, clinicScope(String(clinicaId)));
    if (snap?.clinicaId === clinicaId) {
      setPlanos(snap.planos);
      setEspecialidades(snap.especialidades);
      setTratamentos(snap.tratamentos);
      setPrecos(snap.precos);
      setSelecionadoId(snap.selecionadoId);
      setEspId(snap.espId);
      setPronto(true);
      setCarregando(false);
    } else if (!boot || boot.clinicaId !== clinicaId) {
      setCarregando(true);
    }
    const ticket = ++geracao.current;
    void carregar(clinicaId, ticket);
    // boot só hidrata o primeiro paint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicLoading, clinicaId]);

  useEffect(() => {
    if (!pronto || !clinicaId) return;
    writeRouteCache(CACHE_KEY, clinicScope(String(clinicaId)), {
      clinicaId,
      planos,
      especialidades,
      tratamentos,
      precos,
      selecionadoId,
      espId,
    } satisfies Snap);
  }, [pronto, clinicaId, planos, especialidades, tratamentos, precos, selecionadoId, espId]);

  async function carregar(id: number, ticket: number) {
    try {
      const [planosRes, espRes, trRes] = await Promise.all([
        supabase.from('planos').select('id, nome, tipo, observacoes, ativo').eq('clinica_id', id).order('nome'),
        supabase.from('especialidades').select('id, nome, ativo').eq('clinica_id', id).order('nome'),
        supabase
          .from('tratamentos_base')
          .select('id, nome, especialidade_id, valor_sugerido, custo_padrao, codigo_tuss_padrao, aceita_faces, ativo')
          .eq('clinica_id', id)
          .order('nome'),
      ]);
      if (planosRes.error) throw planosRes.error;
      if (espRes.error) throw espRes.error;
      if (trRes.error) throw trRes.error;
      let lista = (planosRes.data || []) as Plano[];
      if (!lista.some((p) => p.tipo === 'particular')) {
        const { data: criado, error } = await supabase
          .from('planos')
          .insert({ clinica_id: id, nome: 'Particular', tipo: 'particular', ativo: true })
          .select('id, nome, tipo, observacoes, ativo')
          .single();
        if (error) throw error;
        lista = [criado as Plano, ...lista];
      }
      const ids = lista.map((p) => p.id);
      let linhas: Preco[] = [];
      if (ids.length) {
        const { data, error } = await supabase
          .from('planos_tratamentos')
          .select('plano_id, tratamento_id, valor, custo, codigo_tuss, aceita_faces, ativo')
          .in('plano_id', ids);
        if (error) throw error;
        linhas = (data || []) as Preco[];
      }
      if (ticket !== geracao.current) return;
      const ordem = ordenarPlanos(lista);
      setPlanos(ordem);
      setEspecialidades((espRes.data || []) as Especialidade[]);
      setTratamentos((trRes.data || []) as Tratamento[]);
      setPrecos(linhas);
      setSelecionadoId((atual) => (atual && ordem.some((p) => p.id === atual) ? atual : ordem[0]?.id ?? null));
      setPronto(true);
    } catch (err) {
      if (ticket !== geracao.current) return;
      showAlert(mensagemErro(err, 'Não foi possível carregar os tratamentos.'), { type: 'error' });
    } finally {
      if (ticket === geracao.current) setCarregando(false);
    }
  }

  function precoDe(planoId: string | undefined, tratamentoId: number) {
    if (!planoId) return undefined;
    return precos.find((p) => p.plano_id === planoId && p.tratamento_id === tratamentoId);
  }

  function linhaPreco(planoId: string, tratamentoId: number, valores: Omit<Preco, 'plano_id' | 'tratamento_id'>): Preco {
    return { plano_id: planoId, tratamento_id: tratamentoId, ...valores };
  }

  const especialidadesAtivas = especialidades.filter((e) => e.ativo !== false);
  const lista = useMemo(() => {
    const q = buscaLista.trim().toLocaleLowerCase('pt-BR');
    const sinal = ordenacao.dir === 'asc' ? 1 : -1;
    const linhaDe = (id: number) => precos.find((p) => p.plano_id === planoAtual?.id && p.tratamento_id === id);
    const coberto = (t: Tratamento) => (ehParticular ? t.ativo : !!linhaDe(t.id)?.ativo);
    const valorDe = (t: Tratamento) => (ehParticular ? t.valor_sugerido ?? 0 : linhaDe(t.id)?.valor ?? 0);
    return tratamentos
      .filter((t) => (ehParticular || t.ativo) && (!espId || t.especialidade_id === espId))
      .filter((t) => !q || t.nome.toLocaleLowerCase('pt-BR').includes(q))
      .slice()
      .sort((a, b) => {
        if (ordenacao.campo === 'valor') return sinal * (valorDe(a) - valorDe(b));
        if (ordenacao.campo === 'status') return sinal * (Number(coberto(b)) - Number(coberto(a)));
        return sinal * a.nome.localeCompare(b.nome, 'pt-BR');
      });
  }, [tratamentos, ehParticular, espId, ordenacao, buscaLista, precos, planoAtual?.id]);

  function abrirEspecialidade(esp: Especialidade | 'nova') {
    setEspModal(esp);
    setEspNome(esp === 'nova' ? '' : esp.nome);
  }

  async function salvarEspecialidade(e: FormEvent) {
    e.preventDefault();
    if (!clinicaId) return;
    const nome = espNome.trim();
    if (!nome) {
      showAlert('Informe o nome da especialidade.', { type: 'warning' });
      return;
    }
    const editando = espModal !== 'nova' ? espModal : null;
    if (especialidades.some((item) => item.id !== editando?.id && nomeIgual(item.nome, nome))) {
      showAlert('Já existe uma especialidade com esse nome.', { type: 'warning' });
      return;
    }
    const anterior = especialidades;
    if (editando) {
      setEspecialidades((atual) => atual.map((item) => (item.id === editando.id ? { ...item, nome } : item)));
    }
    setSalvando(true);
    try {
      if (editando) {
        const { error } = await supabase.from('especialidades').update({ nome }).eq('id', editando.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('especialidades')
          .insert({ clinica_id: clinicaId, nome, ativo: true })
          .select('id, nome, ativo')
          .single();
        if (error) throw error;
        setEspecialidades((atual) => [...atual, data as Especialidade].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
        setEspId((data as Especialidade).id);
      }
      setEspModal(null);
      showAlert(editando ? 'Especialidade atualizada.' : 'Especialidade criada.', { type: 'success' });
    } catch (err) {
      setEspecialidades(anterior);
      showAlert(mensagemErro(err, 'Não foi possível salvar a especialidade.'), { type: 'error' });
    } finally {
      setSalvando(false);
    }
  }

  async function excluirEspecialidade(esp: Especialidade) {
    const ok = await showConfirm(`Excluir a especialidade "${esp.nome}" e os tratamentos dela?`, {
      title: 'Excluir especialidade',
      type: 'error',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    const anteriorEsp = especialidades;
    const anteriorTr = tratamentos;
    const anteriorPr = precos;
    const ids = tratamentos.filter((t) => t.especialidade_id === esp.id).map((t) => t.id);
    setEspecialidades((atual) => atual.filter((item) => item.id !== esp.id));
    setTratamentos((atual) => atual.filter((item) => item.especialidade_id !== esp.id));
    setPrecos((atual) => atual.filter((item) => !ids.includes(item.tratamento_id)));
    if (espId === esp.id) setEspId(null);
    try {
      if (ids.length) {
        const { error } = await supabase.from('tratamentos_base').delete().in('id', ids);
        if (error) throw error;
      }
      const { error } = await supabase.from('especialidades').delete().eq('id', esp.id);
      if (error) throw error;
      showAlert('Especialidade excluída.', { type: 'success' });
    } catch (err) {
      setEspecialidades(anteriorEsp);
      setTratamentos(anteriorTr);
      setPrecos(anteriorPr);
      showAlert(mensagemErro(err, 'Não foi possível excluir a especialidade.'), { type: 'error' });
    }
  }

  function abrirTratamento(item: Tratamento | 'novo') {
    if (item === 'novo' && especialidadesAtivas.length === 0) {
      showAlert('Crie uma especialidade antes de cadastrar o tratamento.', { type: 'warning' });
      abrirEspecialidade('nova');
      return;
    }
    setTratModal(item);
    if (item === 'novo') {
      setForm({ ...formVazio, especialidadeId: espId || especialidadesAtivas[0]?.id || '' });
      return;
    }
    const linha = ehParticular ? null : precoDe(planoAtual?.id, item.id);
    setForm({
      nome: item.nome,
      especialidadeId: item.especialidade_id || '',
      valor: String((ehParticular ? item.valor_sugerido : linha?.valor) ?? ''),
      custo: String((ehParticular ? item.custo_padrao : linha?.custo) ?? ''),
      tuss: (ehParticular ? item.codigo_tuss_padrao : linha?.codigo_tuss) || '',
      faces: ehParticular ? item.aceita_faces : (linha?.aceita_faces ?? item.aceita_faces),
      ativo: ehParticular ? item.ativo : (linha?.ativo ?? false),
      aplicar: [],
      todosPlanos: true,
    });
  }

  async function salvarTratamento(e: FormEvent) {
    e.preventDefault();
    if (!clinicaId || !tratModal) return;
    const nome = form.nome.trim();
    if (ehParticular && !nome) {
      showAlert('Informe o nome do tratamento.', { type: 'warning' });
      return;
    }
    if (ehParticular && !form.especialidadeId) {
      showAlert('Selecione a especialidade.', { type: 'warning' });
      return;
    }
    const editandoPrevio = tratModal === 'novo' ? null : tratModal;
    if (ehParticular && tratamentos.some((item) => item.id !== editandoPrevio?.id && nomeIgual(item.nome, nome))) {
      showAlert('Já existe um tratamento com esse nome.', { type: 'warning' });
      return;
    }
    const valor = numero(form.valor);
    const custo = numero(form.custo);
    const tuss = form.tuss.trim() || null;
    const editando = tratModal === 'novo' ? null : tratModal;
    const tempId = editando?.id ?? -Date.now();
    const anteriorTr = tratamentos;
    const anteriorPr = precos;
    const comercial = { valor, custo, codigo_tuss: tuss, aceita_faces: form.faces, ativo: form.ativo };
    const extras = (form.todosPlanos ? outrosPlanos.map((plano) => plano.id) : form.aplicar).filter((id) => id !== planoAtual?.id);

    if (ehParticular) {
      const item: Tratamento = {
        id: tempId,
        nome,
        especialidade_id: form.especialidadeId,
        valor_sugerido: valor,
        custo_padrao: custo,
        codigo_tuss_padrao: tuss,
        aceita_faces: form.faces,
        ativo: form.ativo,
      };
      setTratamentos((atual) => [...atual.filter((t) => t.id !== tempId), item]);
    } else if (editando && planoAtual) {
      setPrecos((atual) => [
        ...atual.filter((p) => !(p.plano_id === planoAtual.id && p.tratamento_id === editando.id)),
        linhaPreco(planoAtual.id, editando.id, comercial),
      ]);
    }
    setSalvando(true);
    try {
      let id = editando?.id;
      if (ehParticular) {
        if (id) {
          const { error } = await supabase
            .from('tratamentos_base')
            .update({
              nome,
              especialidade_id: form.especialidadeId,
              valor_sugerido: valor,
              custo_padrao: custo,
              codigo_tuss_padrao: tuss,
              aceita_faces: form.faces,
              ativo: form.ativo,
            })
            .eq('id', id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('tratamentos_base')
            .insert({
              clinica_id: clinicaId,
              nome,
              especialidade_id: form.especialidadeId,
              valor_sugerido: valor,
              custo_padrao: custo,
              codigo_tuss_padrao: tuss,
              aceita_faces: form.faces,
              ativo: form.ativo,
            })
            .select('id, nome, especialidade_id, valor_sugerido, custo_padrao, codigo_tuss_padrao, aceita_faces, ativo')
            .single();
          if (error) throw error;
          id = (data as Tratamento).id;
          setTratamentos((atual) => atual.map((t) => (t.id === tempId ? (data as Tratamento) : t)));
        }
        const destinos = [particular?.id, ...extras].filter((pid): pid is string => !!pid);
        await gravarPrecos(id!, [...new Set(destinos)], comercial);
      } else if (editando && planoAtual) {
        await gravarPrecos(editando.id, [planoAtual.id], comercial);
        const convenios = extras.filter((pid) => pid !== particular?.id);
        if (convenios.length) await gravarPrecos(editando.id, convenios, comercial);
        if (particular && extras.includes(particular.id)) {
          const { error } = await supabase
            .from('tratamentos_base')
            .update({
              valor_sugerido: valor,
              custo_padrao: custo,
              codigo_tuss_padrao: tuss,
              aceita_faces: form.faces,
            })
            .eq('id', editando.id);
          if (error) throw error;
          setTratamentos((atual) =>
            atual.map((t) =>
              t.id === editando.id
                ? { ...t, valor_sugerido: valor, custo_padrao: custo, codigo_tuss_padrao: tuss, aceita_faces: form.faces }
                : t,
            ),
          );
          await gravarPrecos(editando.id, [particular.id], { ...comercial, ativo: true });
        }
      }
      setTratModal(null);
      showAlert(editando ? 'Tratamento atualizado.' : 'Tratamento criado.', { type: 'success' });
    } catch (err) {
      setTratamentos(anteriorTr);
      setPrecos(anteriorPr);
      showAlert(mensagemErro(err, 'Não foi possível salvar o tratamento.'), { type: 'error' });
    } finally {
      setSalvando(false);
    }
  }

  async function gravarPrecos(
    tratamentoId: number,
    planoIds: string[],
    valores: { valor: number | null; custo: number | null; codigo_tuss: string | null; aceita_faces: boolean; ativo: boolean },
  ) {
    if (!clinicaId || planoIds.length === 0) return;
    const rows = planoIds.map((planoId) => ({
      plano_id: planoId,
      clinica_id: clinicaId,
      tratamento_id: tratamentoId,
      valor: valores.valor,
      custo: valores.custo,
      codigo_tuss: valores.codigo_tuss,
      aceita_faces: valores.aceita_faces,
      ativo: valores.ativo,
    }));
    const { error } = await supabase.from('planos_tratamentos').upsert(rows, { onConflict: 'plano_id,tratamento_id' });
    if (error) throw error;
    setPrecos((atual) => {
      const mapa = new Map(atual.map((p) => [`${p.plano_id}:${p.tratamento_id}`, p]));
      for (const row of rows) {
        mapa.set(`${row.plano_id}:${row.tratamento_id}`, {
          plano_id: row.plano_id,
          tratamento_id: row.tratamento_id,
          valor: row.valor,
          custo: row.custo,
          codigo_tuss: row.codigo_tuss,
          aceita_faces: row.aceita_faces,
          ativo: row.ativo,
        });
      }
      return [...mapa.values()];
    });
  }

  async function excluirTratamento(item: Tratamento) {
    const ok = await showConfirm(`Excluir o tratamento "${item.nome}"? Ele sai de todos os planos.`, {
      title: 'Excluir tratamento',
      type: 'error',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    const anteriorTr = tratamentos;
    const anteriorPr = precos;
    setTratamentos((atual) => atual.filter((t) => t.id !== item.id));
    setPrecos((atual) => atual.filter((p) => p.tratamento_id !== item.id));
    const { error } = await supabase.from('tratamentos_base').delete().eq('id', item.id);
    if (error) {
      setTratamentos(anteriorTr);
      setPrecos(anteriorPr);
      showAlert(mensagemErro(error, 'Não foi possível excluir o tratamento.'), { type: 'error' });
      return;
    }
    showAlert('Tratamento excluído.', { type: 'success' });
  }

  async function alternarCobertura(item: Tratamento, ligado: boolean) {
    if (!clinicaId) return;
    const anteriorTr = tratamentos;
    const anteriorPr = precos;
    if (ehParticular) {
      setTratamentos((atual) => atual.map((t) => (t.id === item.id ? { ...t, ativo: ligado } : t)));
      const { error } = await supabase.from('tratamentos_base').update({ ativo: ligado }).eq('id', item.id);
      if (error) {
        setTratamentos(anteriorTr);
        showAlert(mensagemErro(error, 'Não foi possível atualizar o tratamento.'), { type: 'error' });
        return;
      }
      if (particular) {
        await gravarPrecos(item.id, [particular.id], {
          valor: item.valor_sugerido,
          custo: item.custo_padrao,
          codigo_tuss: item.codigo_tuss_padrao,
          aceita_faces: item.aceita_faces,
          ativo: ligado,
        });
      }
      return;
    }
    if (!planoAtual) return;
    const linha = precoDe(planoAtual.id, item.id);
    const valores = {
      valor: linha?.valor ?? item.valor_sugerido,
      custo: linha?.custo ?? item.custo_padrao,
      codigo_tuss: linha?.codigo_tuss ?? item.codigo_tuss_padrao,
      aceita_faces: linha?.aceita_faces ?? item.aceita_faces,
      ativo: ligado,
    };
    setPrecos((atual) => [
      ...atual.filter((p) => !(p.plano_id === planoAtual.id && p.tratamento_id === item.id)),
      linhaPreco(planoAtual.id, item.id, valores),
    ]);
    try {
      await gravarPrecos(item.id, [planoAtual.id], valores);
    } catch (err) {
      setPrecos(anteriorPr);
      showAlert(mensagemErro(err, 'Não foi possível atualizar a cobertura.'), { type: 'error' });
    }
  }

  function nomePlanoOcupado(nome: string, ignorarId?: string) {
    return planos.some((plano) => plano.id !== ignorarId && (nomeIgual(plano.nome, nome) || (plano.tipo === 'particular' && nomeIgual(nome, 'Particular'))));
  }

  function abrirPlano(plano: 'novo' | Plano) {
    setPlanoModal(plano);
    setOrigem('particular');
    setEscolhidos([]);
    setBuscaEscolha('');
    setPlanoNome(plano === 'novo' ? '' : plano.nome);
    setPlanoAtivo(plano === 'novo' ? true : plano.ativo !== false);
  }

  async function salvarPlano(e: FormEvent) {
    e.preventDefault();
    if (!clinicaId || !planoModal) return;
    const nome = planoNome.trim();
    if (!nome) {
      showAlert('Informe o nome do plano.', { type: 'warning' });
      return;
    }
    if (planoModal === 'novo' && origem === 'escolha' && escolhidos.length === 0) {
      showAlert('Selecione ao menos um tratamento.', { type: 'warning' });
      return;
    }
    if (nomePlanoOcupado(nome, planoModal === 'novo' ? undefined : planoModal.id)) {
      showAlert('Já existe um plano com esse nome.', { type: 'warning' });
      return;
    }
    const anterior = planos;
    const anteriorPr = precos;
    if (planoModal !== 'novo') {
      if (planoModal.tipo === 'particular') return;
      setPlanos((atual) => atual.map((p) => (p.id === planoModal.id ? { ...p, nome, ativo: planoAtivo } : p)));
      const { error } = await supabase.from('planos').update({ nome, ativo: planoAtivo }).eq('id', planoModal.id);
      if (error) {
        setPlanos(anterior);
        showAlert(mensagemErro(error, 'Não foi possível salvar o plano.'), { type: 'error' });
        return;
      }
      setPlanoModal(null);
      showAlert('Plano atualizado.', { type: 'success' });
      return;
    }
    setSalvando(true);
    try {
      const { data, error } = await supabase
        .from('planos')
        .insert({
          clinica_id: clinicaId,
          nome,
          tipo: 'convenio',
          ativo: true,
        })
        .select('id, nome, tipo, observacoes, ativo')
        .single();
      if (error) throw error;
      const criado = data as Plano;
      const fonte =
        origem === 'vazio'
          ? []
          : tratamentos.filter((t) => t.ativo && (origem === 'particular' || escolhidos.includes(t.id)));
      let novas: Preco[] = [];
      if (fonte.length) {
        const rows = fonte.map((t) => ({
          plano_id: criado.id,
          clinica_id: clinicaId,
          tratamento_id: t.id,
          valor: t.valor_sugerido,
          custo: t.custo_padrao,
          codigo_tuss: t.codigo_tuss_padrao,
          aceita_faces: t.aceita_faces,
          ativo: true,
        }));
        const { error: precoErro } = await supabase.from('planos_tratamentos').upsert(rows, { onConflict: 'plano_id,tratamento_id' });
        if (precoErro) throw precoErro;
        novas = rows.map((row) => ({
          plano_id: row.plano_id,
          tratamento_id: row.tratamento_id,
          valor: row.valor,
          custo: row.custo,
          codigo_tuss: row.codigo_tuss,
          aceita_faces: row.aceita_faces,
          ativo: true,
        }));
      }
      setPlanos((atual) => ordenarPlanos([...atual, criado]));
      setPrecos((atual) => [...atual, ...novas]);
      setSelecionadoId(criado.id);
      setPlanoModal(null);
      showAlert('Plano criado.', { type: 'success' });
    } catch (err) {
      setPlanos(anterior);
      setPrecos(anteriorPr);
      showAlert(mensagemErro(err, 'Não foi possível criar o plano.'), { type: 'error' });
    } finally {
      setSalvando(false);
    }
  }

  async function excluirPlano(plano: Plano) {
    if (plano.tipo === 'particular') return;
    const ok = await showConfirm(`Excluir o plano "${plano.nome}"? Os preços dele saem. Os pacientes vinculados ficam sem plano.`, {
      title: 'Excluir plano',
      type: 'error',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    const anterior = planos;
    const anteriorPr = precos;
    setPlanos((atual) => atual.filter((p) => p.id !== plano.id));
    setPrecos((atual) => atual.filter((p) => p.plano_id !== plano.id));
    if (selecionadoId === plano.id) setSelecionadoId(particular?.id ?? null);
    const { error } = await supabase.from('planos').delete().eq('id', plano.id);
    if (error) {
      setPlanos(anterior);
      setPrecos(anteriorPr);
      setSelecionadoId(plano.id);
      showAlert(mensagemErro(error, 'Não foi possível excluir o plano.'), { type: 'error' });
      return;
    }
    showAlert('Plano excluído.', { type: 'success' });
  }

  function alternarAplicar(id: string) {
    setForm((atual) => ({
      ...atual,
      aplicar: atual.aplicar.includes(id) ? atual.aplicar.filter((item) => item !== id) : [...atual.aplicar, id],
    }));
  }

  const tituloPlano = ehParticular ? 'Particular' : planoAtual?.nome || 'Particular';
  const clinicLabel = activeClinic && activeClinic.id !== 'all' ? getClinicLabel(activeClinic) : 'Selecione uma clínica';
  const espDuplicado = espNome.trim().length > 0 && especialidades.some((item) => item.id !== ignorarEspId.current && nomeIgual(item.nome, espNome));
  const planoDuplicado = planoNome.trim().length > 0 && nomePlanoOcupado(planoNome, ignorarPlanoId.current);
  const tratDuplicado = ehParticular && form.nome.trim().length > 0 && tratamentos.some((item) => item.id !== ignorarTratId.current && nomeIgual(item.nome, form.nome));
  function alternarOrdem(campo: 'nome' | 'valor' | 'status') {
    setOrdenacao((atual) => atual.campo === campo ? { campo, dir: atual.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' });
  }
  const escolhaVisivel = tratamentos.filter((t) => t.ativo && (!buscaEscolha.trim() || t.nome.toLocaleLowerCase('pt-BR').includes(buscaEscolha.trim().toLocaleLowerCase('pt-BR'))));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
          Tratamentos
          <span className="text-neutral-400"> · {clinicLabel}</span>
        </h1>
      </div>

      {!clinicaId ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4">
          {!clinicLoading && (
            <p className="text-center text-sm text-neutral-500">Selecione uma clínica para ver o catálogo e os planos.</p>
          )}
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:flex-row">
        <nav aria-label="Planos" className="flex shrink-0 flex-col border-b border-neutral-200 lg:w-56 lg:border-b-0 lg:border-r">
          <div className="flex gap-1 overflow-x-auto px-2 py-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
            {ordenados.map((plano) => {
              const ativo = plano.id === planoAtual?.id;
              const nome = plano.tipo === 'particular' ? 'Particular' : plano.nome;
              const Icone = plano.tipo === 'particular' ? User : CreditCard;
              const inativo = plano.tipo !== 'particular' && plano.ativo === false;
              return (
                <div key={plano.id} className={`flex shrink-0 items-center rounded-xl lg:w-full ${ativo ? 'bg-neutral-900' : plano.tipo === 'particular' ? 'bg-neutral-100 hover:bg-neutral-200/70' : 'hover:bg-[#f3f4f1]'} ${inativo ? 'opacity-50' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setSelecionadoId(plano.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm leading-snug lg:gap-2.5 lg:py-2.5 ${ativo ? 'font-medium text-white' : plano.tipo === 'particular' ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-600'}`}
                  >
                    <Icone size={16} className="shrink-0" />
                    <span className="truncate">{nome}</span>
                  </button>
                  {plano.tipo !== 'particular' && (
                    <MenuPontos
                      tamanho={16}
                      className={`mr-1 shrink-0 rounded-md p-1.5 ${ativo ? 'text-white hover:bg-white/10' : 'text-neutral-500 hover:bg-neutral-200/70'}`}
                      itens={[
                        { id: 'editar', label: 'Editar', onClick: () => { setSelecionadoId(plano.id); abrirPlano(plano); } },
                        { id: 'excluir', label: 'Excluir', perigo: true, onClick: () => { setSelecionadoId(plano.id); void excluirPlano(plano); } },
                      ]}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-2 pb-2 lg:border-t lg:border-neutral-200 lg:py-2">
            <button
              type="button"
              onClick={() => abrirPlano('novo')}
              disabled={!clinicaId}
              className="flex w-full shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-neutral-600 hover:bg-[#f3f4f1] disabled:opacity-40 lg:gap-2.5 lg:py-2.5"
            >
              <Plus size={16} className="shrink-0" />
              Novo plano
            </button>
          </div>
        </nav>

        <nav aria-label="Especialidades" className="flex shrink-0 flex-col border-b border-neutral-200 lg:w-48 lg:border-b-0 lg:border-r">
          <div className="flex gap-1 overflow-x-auto px-2 py-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
            <div className={`flex shrink-0 items-center rounded-xl lg:w-full ${espId === null ? 'bg-neutral-900' : 'hover:bg-[#f3f4f1]'}`}>
              <button
                type="button"
                onClick={() => setEspId(null)}
                className={`flex min-w-0 flex-1 items-center px-3 py-2 text-left text-sm leading-snug lg:py-2.5 ${espId === null ? 'font-medium text-white' : 'font-medium text-neutral-600'}`}
              >
                Todas
              </button>
            </div>
            {especialidadesAtivas.map((esp) => {
              const ativo = espId === esp.id;
              return (
                <div key={esp.id} className={`flex shrink-0 items-center rounded-xl lg:w-full ${ativo ? 'bg-neutral-900' : 'hover:bg-[#f3f4f1]'}`}>
                  <button
                    type="button"
                    onClick={() => setEspId(esp.id)}
                    className={`flex min-w-0 flex-1 items-center px-3 py-2 text-left text-sm leading-snug lg:py-2.5 ${ativo ? 'font-medium text-white' : 'font-medium text-neutral-600'}`}
                  >
                    <span className="truncate">{esp.nome}</span>
                  </button>
                  {ehParticular ? (
                    <MenuPontos
                      tamanho={16}
                      className={`mr-1 shrink-0 rounded-md p-1.5 ${ativo ? 'text-white hover:bg-white/10' : 'text-neutral-500 hover:bg-neutral-200/70'}`}
                      itens={[
                        { id: 'editar', label: 'Editar', onClick: () => { setEspId(esp.id); abrirEspecialidade(esp); } },
                        { id: 'excluir', label: 'Excluir', perigo: true, onClick: () => { setEspId(esp.id); void excluirEspecialidade(esp); } },
                      ]}
                    />
                  ) : (
                    <Legenda texto="Só é possível editar se estiver em Particular.">
                      <span className="mr-1 inline-flex cursor-not-allowed rounded-md p-1.5 text-neutral-300">
                        <MoreHorizontal size={16} />
                      </span>
                    </Legenda>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1 px-2 pb-2 lg:border-t lg:border-neutral-200 lg:py-2">
            <button
              type="button"
              disabled={!ehParticular}
              onClick={() => abrirEspecialidade('nova')}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium lg:py-2.5 ${ehParticular ? 'text-neutral-600 hover:bg-[#f3f4f1]' : 'cursor-not-allowed text-neutral-300'}`}
            >
              <Plus size={16} className="shrink-0" />
              Especialidade
            </button>
            {!ehParticular && (
              <Legenda texto="Só é possível criar se estiver em Particular.">
                <span className="inline-flex p-1 text-neutral-400">
                  <CircleHelp size={15} />
                </span>
              </Legenda>
            )}
          </div>
        </nav>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
          {carregando && tratamentos.length === 0 && planos.length === 0 ? (
            <div className="space-y-2">
              <div className="h-8 w-40 animate-pulse rounded-md bg-neutral-100" />
              <div className="h-10 animate-pulse rounded-md bg-neutral-50" />
              <div className="h-10 animate-pulse rounded-md bg-neutral-50" />
              <div className="h-10 animate-pulse rounded-md bg-neutral-50" />
            </div>
          ) : (
            <>
              <div className="mb-3 shrink-0">
                <h2 className="truncate text-base font-semibold text-neutral-900">{tituloPlano}</h2>
                <p className="truncate text-xs text-neutral-500">
                  {ehParticular ? 'Catálogo da clínica' : 'Preço e cobertura deste plano'}
                </p>
              </div>
              <div className="mb-3 flex shrink-0 items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={buscaLista}
                    onChange={(ev) => setBuscaLista(ev.target.value)}
                    placeholder="Buscar"
                    className="h-8 w-full rounded-md border border-neutral-200 bg-white px-3 pr-7 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  />
                  {buscaLista && (
                    <button type="button" aria-label="Limpar" onClick={() => setBuscaLista('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!ehParticular && (
                    <Legenda texto="Só é possível criar se estiver em Particular.">
                      <span className="inline-flex p-1 text-red-500">
                        <CircleAlert size={16} />
                      </span>
                    </Legenda>
                  )}
                  <button type="button" disabled={!ehParticular} onClick={() => abrirTratamento('novo')} className={ehParticular ? btnPrimario : btnBloqueado}>
                    <Plus size={14} /> Novo tratamento
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_6rem_4.5rem_2rem] items-center gap-2 border-b border-black/5 bg-white px-1 py-2">
                  <button
                    type="button"
                    onClick={() => alternarOrdem('nome')}
                    className={`inline-flex items-center gap-1 justify-self-start text-xs font-medium hover:text-neutral-900 ${ordenacao.campo === 'nome' ? 'text-neutral-900' : 'text-neutral-400'}`}
                  >
                    Nome
                    <ArrowUpDown size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarOrdem('valor')}
                    className={`inline-flex items-center justify-end gap-1 justify-self-end text-xs font-medium hover:text-neutral-900 ${ordenacao.campo === 'valor' ? 'text-neutral-900' : 'text-neutral-400'}`}
                  >
                    Valor
                    <ArrowUpDown size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarOrdem('status')}
                    className={`inline-flex items-center justify-center gap-1 justify-self-center text-xs font-medium hover:text-neutral-900 ${ordenacao.campo === 'status' ? 'text-neutral-900' : 'text-neutral-400'}`}
                  >
                    Status
                    <ArrowUpDown size={12} />
                  </button>
                  <span />
                </div>
                {lista.length === 0 ? (
                  <p className="py-6 text-sm text-neutral-500">
                    {buscaLista.trim()
                      ? 'Nenhum tratamento encontrado.'
                      : ehParticular ? 'Nenhum tratamento nesta especialidade.' : 'Nenhum tratamento ativo no catálogo.'}
                  </p>
                ) : (
                  lista.map((item) => {
                    const linha = ehParticular ? null : precoDe(planoAtual?.id, item.id);
                    const valor = ehParticular ? item.valor_sugerido : linha?.valor;
                    const coberto = ehParticular ? item.ativo : !!linha?.ativo;
                    const especialidade = especialidades.find((esp) => esp.id === item.especialidade_id)?.nome;
                    return (
                      <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_6rem_4.5rem_2rem] items-center gap-2 border-b border-neutral-100 px-1 py-2">
                        <span className="min-w-0">
                          <span className={`block truncate text-sm font-medium ${coberto ? 'text-neutral-900' : 'text-neutral-400'}`}>{item.nome}</span>
                          <span className="block truncate text-xs text-neutral-500">
                            {espId === null && especialidade ? `${especialidade} · ` : ''}
                            {(ehParticular ? item.codigo_tuss_padrao : linha?.codigo_tuss) || 'Sem TUSS'}
                          </span>
                        </span>
                        <span className="justify-self-end text-right text-sm tabular-nums text-neutral-900">{moeda(valor)}</span>
                        <span className="justify-self-center">
                          <Switch checked={coberto} onChange={(ligado) => void alternarCobertura(item, ligado)}>
                            <span className="sr-only">{ehParticular ? 'Ativo' : 'Coberto'}</span>
                          </Switch>
                        </span>
                        {ehParticular ? (
                          <button
                            type="button"
                            onClick={() => abrirTratamento(item)}
                            className="inline-flex h-8 w-8 justify-self-end items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                            aria-label={`Editar ${item.nome}`}
                          >
                            <Pencil size={14} />
                          </button>
                        ) : (
                          <Legenda texto="Só é possível editar se estiver em Particular.">
                            <span className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md text-neutral-300">
                              <Pencil size={14} />
                            </span>
                          </Legenda>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </section>
      </div>
      )}

      <Modal open={espModal !== null} onClose={() => setEspModal(null)} maxWidth="sm" hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <form onSubmit={salvarEspecialidade} className="p-3 sm:p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-neutral-900">{tituloEspModal.current}</h2>
            <button type="button" onClick={() => setEspModal(null)} className="text-neutral-400" aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
          <label className={rotulo}>
            Nome <span className="text-red-500">*</span>
          </label>
          <input className={espDuplicado ? campoErro : campo} value={espNome} onChange={(ev) => setEspNome(ev.target.value)} autoFocus />
          {espDuplicado && <p className="mt-1 text-xs text-red-500">Já existe uma especialidade com esse nome.</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEspModal(null)} className={btnNeutro}>Cancelar</button>
            <button type="submit" className={btnPrimario} disabled={salvando || espDuplicado || !espNome.trim()}>Salvar</button>
          </div>
        </form>
      </Modal>

      <Modal open={planoModal !== null} onClose={() => setPlanoModal(null)} maxWidth="lg" hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <form onSubmit={salvarPlano} className="flex max-h-[90vh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-3 py-3 sm:px-4">
            <h2 className="text-base font-semibold text-neutral-900">{tituloPlanoModal.current}</h2>
            <button type="button" onClick={() => setPlanoModal(null)} className="text-neutral-400" aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
            <label className={rotulo}>
              Nome <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input className={`min-w-0 flex-1 ${planoDuplicado ? campoErro : campo}`} value={planoNome} onChange={(ev) => setPlanoNome(ev.target.value)} autoFocus />
              {!criandoPlano.current && (
                <Switch checked={planoAtivo} onChange={setPlanoAtivo}>
                  <span className="text-sm text-neutral-700">Ativo</span>
                </Switch>
              )}
            </div>
            {planoDuplicado && <p className="mt-1 text-xs text-red-500">Já existe um plano com esse nome.</p>}
            {criandoPlano.current && (
              <SegmentedControl
                size="sm"
                className="mt-3 w-full"
                value={origem}
                onChange={setOrigem}
                options={[
                  { value: 'particular', label: <span className="whitespace-nowrap text-[11px] leading-none">Com base no Particular</span> },
                  { value: 'vazio', label: <span className="whitespace-nowrap text-[11px] leading-none">Vazio</span> },
                  { value: 'escolha', label: <span className="whitespace-nowrap text-[11px] leading-none">Tratamentos selecionados</span> },
                ]}
              />
            )}
            {criandoPlano.current && origem === 'escolha' && (
              <div className="mt-3">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  <div className="relative col-span-full flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <input
                        value={buscaEscolha}
                        onChange={(ev) => setBuscaEscolha(ev.target.value)}
                        placeholder="Buscar"
                        className={`${campo} pr-8`}
                      />
                      {buscaEscolha && (
                        <button type="button" aria-label="Limpar" onClick={() => setBuscaEscolha('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-neutral-900"
                      onClick={() => {
                        const ativos = tratamentos.filter((t) => t.ativo).map((t) => t.id);
                        setEscolhidos(escolhidos.length === ativos.length ? [] : ativos);
                      }}
                    >
                      {tratamentos.some((t) => t.ativo) && escolhidos.length === tratamentos.filter((t) => t.ativo).length ? 'Limpar' : 'Todos'}
                    </button>
                  </div>
                </div>
                <div className="mt-1 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:max-h-48 sm:grid-cols-2">
                  {escolhaVisivel.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900">
                      <input
                        type="checkbox"
                        className="accent-neutral-900"
                        checked={escolhidos.includes(t.id)}
                        onChange={() => setEscolhidos((atual) => (atual.includes(t.id) ? atual.filter((id) => id !== t.id) : [...atual, t.id]))}
                      />
                      <span className="truncate">{t.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-neutral-200 px-3 py-3 sm:px-4">
            <button type="button" onClick={() => setPlanoModal(null)} className={btnNeutro}>Cancelar</button>
            <button type="submit" className={btnPrimario} disabled={salvando || planoDuplicado || !planoNome.trim()}>Salvar</button>
          </div>
        </form>
      </Modal>

      <Modal open={tratModal !== null} onClose={() => setTratModal(null)} maxWidth="lg" hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <form onSubmit={salvarTratamento} className="p-3 sm:p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-neutral-900">{tituloTratModal.current}</h2>
              {!ehParticular && <p className="text-xs text-neutral-500">{tituloPlano}</p>}
            </div>
            <button type="button" onClick={() => setTratModal(null)} className="text-neutral-400" aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
          {ehParticular ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={rotulo}>
                  Nome <span className="text-red-500">*</span>
                </label>
                <input className={tratDuplicado ? campoErro : campo} value={form.nome} onChange={(ev) => setForm({ ...form, nome: ev.target.value })} autoFocus />
                {tratDuplicado && <p className="mt-1 text-xs text-red-500">Já existe um tratamento com esse nome.</p>}
              </div>
              <div className="sm:col-span-2">
                <label className={rotulo}>
                  Especialidade <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  searchable
                  size="md"
                  value={form.especialidadeId}
                  onChange={(valor) => setForm({ ...form, especialidadeId: valor })}
                  options={especialidadesAtivas.map((esp) => ({ value: esp.id, label: esp.nome }))}
                  placeholder="Buscar especialidade"
                />
              </div>
            </div>
          ) : null}
          <div className={`grid grid-cols-2 gap-2 ${ehParticular ? 'mt-2' : ''}`}>
            <div>
              <label className={rotulo}>Valor</label>
              <input className={campo} inputMode="decimal" value={form.valor} onChange={(ev) => setForm({ ...form, valor: ev.target.value })} />
            </div>
            <div>
              <label className={rotulo}>Custo</label>
              <input className={campo} inputMode="decimal" value={form.custo} onChange={(ev) => setForm({ ...form, custo: ev.target.value })} />
            </div>
            <div className="col-span-2">
              <label className={rotulo}>Código TUSS</label>
              <input className={campo} value={form.tuss} onChange={(ev) => setForm({ ...form, tuss: ev.target.value })} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <Switch checked={form.faces} onChange={(faces) => setForm({ ...form, faces })}>
              <span className="text-sm text-neutral-700">Aceita faces</span>
            </Switch>
            <Switch checked={form.ativo} onChange={(ativo) => setForm({ ...form, ativo })}>
              <span className="text-sm text-neutral-700">{ehParticular ? 'Ativo' : 'Coberto'}</span>
            </Switch>
          </div>
          {outrosPlanos.length > 0 && (
            <div className="mt-4 border-t border-neutral-100 pt-3">
              <Switch checked={form.todosPlanos} onChange={(todosPlanos) => setForm({ ...form, todosPlanos, aplicar: [] })}>
                <span className="text-sm text-neutral-700">Adicionar a todos os planos</span>
              </Switch>
              <div className={`mt-2 grid max-h-28 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 ${form.todosPlanos ? 'pointer-events-none opacity-40' : ''}`}>
                {outrosPlanos.map((plano) => (
                  <label key={plano.id} className="flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900">
                    <input
                      type="checkbox"
                      className="accent-neutral-900"
                      disabled={form.todosPlanos}
                      checked={!form.todosPlanos && form.aplicar.includes(plano.id)}
                      onChange={() => alternarAplicar(plano.id)}
                    />
                    <span className="truncate">{plano.tipo === 'particular' ? 'Particular' : plano.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            {ehParticular && tratModal && tratModal !== 'novo' ? (
              <button type="button" onClick={() => { const item = tratModal; setTratModal(null); void excluirTratamento(item); }} className={btnNeutro}>Excluir</button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={() => setTratModal(null)} className={btnNeutro}>Cancelar</button>
              <button type="submit" className={btnPrimario} disabled={salvando || tratDuplicado || (ehParticular && !form.nome.trim())}>Salvar</button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
