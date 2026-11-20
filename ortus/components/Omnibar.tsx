'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { dados as tabelas } from '@/lib/local/consulta';
import { useClinica } from '@/app/context/ClinicaContext';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import { usePatientActionModal } from '@/components/PatientActionModal';
import Modal from '@/components/ui/Modal';
import {
  Search,
  User,
  UserPlus,
  CalendarPlus,
  AlertCircle,
  Clock,
  FileText,
  X,
} from 'lucide-react';
import ModalNovoAgendamento from '@/components/agenda/ModalNovoAgendamento';
import Aviso from '@/components/ui/Aviso';
import { apenasDigitos } from '@/lib/mascaras';
import type { ModuleName } from '@/lib/types/permissions';

type OmniResult = {
  id: string;
  label: string;
  sublabel?: string;
  icon: ReactNode;
  action: () => void;
  category: 'paciente' | 'navegacao' | 'comando';
  module?: ModuleName;
};

type OmnibarProps = {
  moduleAccess: Record<ModuleName, boolean>;
  isAdmin: boolean;
};

type PacienteBusca = { id: string; nome: string | null; telefone: string | null; cpf: string | null };

/** Última resposta do servidor e para qual termo e quais clínicas ela vale. */
type BuscaPacientes = { escopo: string; termo: string; lista: PacienteBusca[]; falhou: boolean };

const BUSCA_VAZIA: BuscaPacientes = { escopo: '', termo: '', lista: [], falhou: false };
const LIMITE_PACIENTES = 6;
// Com os dígitos espalhados vêm também números em que eles não ficam juntos. Esses são
// descartados na tela, então essa consulta pede um pouco mais.
const LIMITE_DIGITOS_ESPALHADOS = 30;

/** Dígitos do termo quando ele parece telefone ou CPF (só números e sinais de máscara), sem o DDI 55. */
function digitosDaBusca(termo: string): string {
  if (!/\d/.test(termo) || !/^[\d\s().+\-/]+$/.test(termo)) return '';
  const digitos = apenasDigitos(termo);
  // DDI: "+55" na frente, ou o número inteiro com ele (55 + DDD + 8 ou 9 dígitos).
  if (digitos.length > 2 && digitos.startsWith('55') && (termo.startsWith('+') || digitos.length >= 12)) {
    return digitos.slice(2);
  }
  return digitos;
}

/** Nome por trecho; telefone e CPF só pelos dígitos, seja qual for a máscara gravada. */
function pacienteCombina(p: PacienteBusca, termoMinusculo: string, digitos: string): boolean {
  if (digitos) {
    return apenasDigitos(p.telefone || '').includes(digitos) || apenasDigitos(p.cpf || '').includes(digitos);
  }
  return (p.nome || '').toLowerCase().includes(termoMinusculo);
}

/**
 * Pacientes das clínicas do escopo que batem com o termo, buscados no servidor. Devolve null
 * se a consulta falhar. O texto digitado nunca entra num .or(): o nome vai num ilike próprio,
 * e o .or() leva só dígitos e %.
 */
async function buscarPacientes(termo: string, clinicaIds: number[]): Promise<PacienteBusca[] | null> {
  const base = () => tabelas.from('pacientes').select('id, nome, telefone, cpf').in('clinica_id', clinicaIds);
  const digitos = digitosDaBusca(termo);
  if (!digitos) {
    // % _ * e \ são curingas no ilike; trocados por _ (um caractere qualquer), o termo continua inteiro.
    const { data, error } = await base()
      .ilike('nome', `%${termo.replace(/[%_*\\]/g, '_')}%`)
      .order('nome')
      .limit(LIMITE_PACIENTES);
    return error ? null : ((data || []) as PacienteBusca[]);
  }
  // Telefone e CPF ficam gravados com máscaras diferentes. Vão dois padrões: os dígitos juntos
  // (dentro de um bloco da máscara) e com qualquer coisa entre eles (atravessando a máscara).
  const padroes = [`%${digitos}%`];
  if (digitos.length > 1) padroes.push(`%${digitos.split('').join('%')}%`);
  const respostas = await Promise.all(
    padroes.map((padrao, i) =>
      base()
        .or(`telefone.ilike.${padrao},cpf.ilike.${padrao}`)
        .order('nome')
        .limit(i === 0 ? LIMITE_PACIENTES : LIMITE_DIGITOS_ESPALHADOS),
    ),
  );
  const porId = new Map<string, PacienteBusca>();
  for (const { data, error } of respostas) {
    if (error) return null;
    for (const p of (data || []) as PacienteBusca[]) porId.set(String(p.id), p);
  }
  return Array.from(porId.values()).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}

export default function Omnibar({ moduleAccess, isAdmin }: OmnibarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OmniResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [buscaPacientes, setBuscaPacientes] = useState<BuscaPacientes>(BUSCA_VAZIA);
  const [agenda, setAgenda] = useState<{ pacienteId?: string; pacienteNome?: string; clinicaId?: string } | null>(null);
  const [aviso, setAviso] = useState('');
  const [alturaTeclado, setAlturaTeclado] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { openPatient } = usePatientSlideOver();
  const { openQuickCapture } = usePatientActionModal();
  const { activeClinicId, clinics } = useClinica();
  const clinicIds = useMemo(() => {
    if (activeClinicId && activeClinicId !== 'all') return [Number(activeClinicId)];
    return clinics.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
  }, [activeClinicId, clinics]);
  // A lista de clínicas ganha nova identidade a cada recarga do contexto (o Supabase avisa
  // SIGNED_IN ao voltar para a aba), mesmo sem mudar: a busca segue esta chave.
  const chaveEscopo = clinicIds.join(',');

  const canAccessModule = useCallback(
    (module?: ModuleName) => {
      if (!module) return true;
      if (isAdmin) return true;
      return !!moduleAccess[module];
    },
    [isAdmin, moduleAccess],
  );

  const navItems = useMemo<OmniResult[]>(() => {
    const base: OmniResult[] = [
      {
        id: 'atalho_agenda',
        label: 'Novo agendamento',
        sublabel: 'Marcar consulta sem sair da tela',
        icon: <CalendarPlus size={18} strokeWidth={1.75} />,
        action: () => setAgenda({}),
        category: 'navegacao',
        module: 'agenda',
      },
      {
        id: 'atalho_paciente',
        label: 'Novo paciente',
        sublabel: 'Cadastro rápido',
        icon: <UserPlus size={18} strokeWidth={1.75} />,
        action: () => openQuickCapture(null),
        category: 'navegacao',
        module: 'ficha_paciente',
      },
      {
        id: 'atalho_orcamentos',
        label: 'Orçamentos e funil',
        sublabel: 'Quem ligar hoje e oportunidades',
        icon: <FileText size={18} strokeWidth={1.75} />,
        action: () => router.push('/orcamentos'),
        category: 'navegacao',
        module: 'orcamentos',
      },
      {
        id: 'atalho_debito',
        label: 'Pacientes com débito',
        sublabel: 'Quem ainda está em aberto',
        icon: <AlertCircle size={18} strokeWidth={1.75} />,
        action: () => router.push('/pacientes?filtro=debito'),
        category: 'navegacao',
        module: 'ficha_paciente',
      },
      {
        id: 'atalho_retorno',
        label: 'Sem consulta há 30 dias',
        sublabel: 'Pacientes para retorno',
        icon: <Clock size={18} strokeWidth={1.75} />,
        action: () => router.push('/pacientes?filtro=sem30'),
        category: 'navegacao',
        module: 'ficha_paciente',
      },
    ];
    return base.filter((item) => canAccessModule(item.module));
  }, [router, canAccessModule, openQuickCapture]);

  useEffect(() => {
    function abrir(evento: Event) {
      const detalhe = (evento as CustomEvent<{ pacienteId?: string; pacienteNome?: string; clinicaId?: string }>).detail || {};
      setOpen(false);
      setAgenda({
        pacienteId: detalhe.pacienteId,
        pacienteNome: detalhe.pacienteNome,
        clinicaId: detalhe.clinicaId,
      });
    }
    window.addEventListener('ortus:novo-agendamento', abrir);
    return () => window.removeEventListener('ortus:novo-agendamento', abrir);
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => setAviso(''), 2400);
    return () => window.clearTimeout(timer);
  }, [aviso]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Celular: o teclado cobre o fim da lista sem encolher a tela. O respiro do tamanho dele
  // deixa rolar até o último resultado.
  useEffect(() => {
    if (!open) return;
    const visor = window.visualViewport;
    if (!visor) return;
    const medir = () => {
      const celular = window.matchMedia('(max-width: 639px)').matches;
      setAlturaTeclado(celular ? Math.max(0, Math.round(window.innerHeight - visor.height - visor.offsetTop)) : 0);
    };
    medir();
    visor.addEventListener('resize', medir);
    visor.addEventListener('scroll', medir);
    return () => {
      visor.removeEventListener('resize', medir);
      visor.removeEventListener('scroll', medir);
      setAlturaTeclado(0);
    };
  }, [open]);

  // Zera a busca só quando ela abre.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    setBuscaPacientes(BUSCA_VAZIA);
    setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  // Pacientes vêm do servidor pelo termo, depois de uma espera curta entre as teclas, e não
  // de uma lista parcial carregada antes.
  useEffect(() => {
    if (!open) return;
    // Outra clínica: o que foi achado antes não vale mais.
    setBuscaPacientes((atual) => (atual.escopo === chaveEscopo ? atual : { ...BUSCA_VAZIA, escopo: chaveEscopo }));
    const termo = query.trim();
    if (!termo || !chaveEscopo) return;
    let cancelado = false;
    const timer = window.setTimeout(() => {
      buscarPacientes(termo, chaveEscopo.split(',').map(Number))
        .catch(() => null)
        .then((lista) => {
          // Na falha a lista fica vazia: nada da busca anterior continua valendo.
          if (!cancelado) setBuscaPacientes({ escopo: chaveEscopo, termo, lista: lista || [], falhou: !lista });
        });
    }, 250);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [open, query, chaveEscopo]);

  const search = useCallback(
    (q: string) => {
      const term = q.trim().toLowerCase();
      if (!term) {
        setResults(navItems);
        setActiveIdx(0);
        return;
      }

      const matched: OmniResult[] = [];
      const digitos = digitosDaBusca(q.trim());

      // Só a resposta para estas clínicas, conferida com o termo de agora: a do termo anterior
      // vale até a nova chegar, sem mostrar quem não bate.
      (buscaPacientes.escopo === chaveEscopo ? buscaPacientes.lista : [])
        .filter((p) => pacienteCombina(p, term, digitos))
        .slice(0, 6)
        .forEach((p) => {
          matched.push({
            id: `pac_${p.id}`,
            label: p.nome || '',
            sublabel: p.telefone || p.cpf || '',
            icon: <User size={18} strokeWidth={1.75} />,
            action: () => {
              openPatient(p.id);
              setOpen(false);
            },
            category: 'paciente',
          });
        });

      matched.push(
        ...navItems.filter(
          (n) =>
            n.label.toLowerCase().includes(term) ||
            (n.sublabel || '').toLowerCase().includes(term),
        ),
      );

      setResults(matched.slice(0, 12));
      setActiveIdx(0);
    },
    [buscaPacientes, chaveEscopo, navItems, openPatient],
  );

  useEffect(() => {
    if (open) search(query);
  }, [query, search, open]);

  function handleKeyNav(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[activeIdx]) {
      e.preventDefault();
      results[activeIdx].action();
      setOpen(false);
    }
  }

  const grouped = {
    paciente: results.filter((r) => r.category === 'paciente'),
    navegacao: results.filter((r) => r.category === 'navegacao'),
  };

  // Enquanto o servidor não responde ao termo de agora, "Nenhum resultado." (ou só o atalho
  // "Novo paciente") levaria a cadastrar de novo um paciente que existe.
  const termoAtual = query.trim();
  const buscaEmDia = buscaPacientes.escopo === chaveEscopo && buscaPacientes.termo === termoAtual;
  const buscando = !!termoAtual && !!chaveEscopo && !buscaEmDia;
  const avisoBusca = termoAtual && buscaEmDia && buscaPacientes.falhou
    ? 'Não foi possível buscar os pacientes. Tente de novo.'
    : buscando && grouped.paciente.length === 0
      ? 'Buscando pacientes…'
      : results.length === 0 && query
        ? 'Nenhum resultado.'
        : '';

  let flatIdx = 0;

  function renderRow(r: OmniResult) {
    const idx = flatIdx++;
    const active = idx === activeIdx;
    return (
      <button
        key={r.id}
        type="button"
        onClick={() => {
          r.action();
          setOpen(false);
        }}
        onMouseEnter={() => setActiveIdx(idx)}
        className={`flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-left sm:min-h-0 ${
          active ? 'bg-neutral-900 text-white' : 'text-neutral-900 hover:bg-neutral-50'
        }`}
      >
        <span className={`shrink-0 ${active ? 'text-white' : 'text-neutral-400'}`}>{r.icon}</span>
        <span className="min-w-0 flex-1">
          {/* Celular: o nome do paciente quebra a linha em vez de ser cortado. */}
          <span className={`block break-words text-sm font-medium sm:truncate ${active ? 'text-white' : 'text-neutral-900'}`}>
            {r.label}
          </span>
          {r.sublabel && (
            <span className={`block truncate text-xs ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>
              {r.sublabel}
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <>
    <Aviso mensagem={aviso || null} />
    <ModalNovoAgendamento
      open={!!agenda}
      onClose={() => setAgenda(null)}
      pacienteId={agenda?.pacienteId}
      pacienteNome={agenda?.pacienteNome}
      clinicaId={agenda?.clinicaId}
      onSaved={() => setAviso('Agendamento salvo.')}
    />
    {/* Celular: a busca ocupa a tela a partir do topo, com o campo em cima e os resultados logo abaixo.
        Presa embaixo, como os outros popups, o teclado cobria os resultados. */}
    {open && <Modal
      open={open}
      onClose={() => setOpen(false)}
      zIndex={100}
      maxWidth="lg"
      hideCloseButton
      className="max-sm:items-start max-sm:p-0"
      panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:border-0"
    >
      <div className="hidden shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:flex sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Busca</h2>
          <p className="mt-0.5 text-xs font-medium text-neutral-400">Pacientes e atalhos da clínica.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <div className="shrink-0 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-4">
        <label className="mb-1.5 hidden text-xs font-medium text-neutral-500 sm:block">Buscar</label>
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyNav}
              placeholder="Nome, telefone ou atalho"
              aria-label="Buscar paciente ou atalho"
              enterKeyHint="search"
              className="box-border h-11 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 sm:h-10"
            />
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 sm:hidden" aria-label="Fechar busca">
            <X size={20} />
          </button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
        style={alturaTeclado > 0 ? { paddingBottom: alturaTeclado + 12 } : undefined}
      >
        {avisoBusca ? (
          <p className={`px-2 text-sm text-neutral-500 ${results.length === 0 ? 'py-6' : 'pb-3'}`}>{avisoBusca}</p>
        ) : null}

        {grouped.paciente.length > 0 && (
          <div className="mb-2">
            <p className="px-2 pb-1 text-xs font-medium text-neutral-500">Pacientes</p>
            <div className="space-y-0.5">{grouped.paciente.map((r) => renderRow(r))}</div>
          </div>
        )}

        {grouped.navegacao.length > 0 && (
          <div>
            <p className="px-2 pb-1 text-xs font-medium text-neutral-500">Atalhos</p>
            <div className="space-y-0.5">{grouped.navegacao.map((r) => renderRow(r))}</div>
          </div>
        )}
      </div>
    </Modal>}
    </>
  );
}
