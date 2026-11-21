'use client';

/**
 * Conversas da equipe da clínica: canal Geral e os que a clínica criar.
 * Separado do WhatsApp dos pacientes e do suporte da Ortus (que fica em
 * Ajuda → Contatar o suporte). Só na nuvem: sem internet, a tela avisa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Archive, Hash, Loader2, Plus, X } from 'lucide-react';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import Modal from '@/components/ui/Modal';
import Conversa, { type ItemConversa } from '@/components/chat/Conversa';
import { fetchUserEquipe, type ProfissionalEquipe } from '@/lib/clinicScoped';
import {
  apagarMensagem,
  arquivarCanal,
  criarCanal,
  enviarMensagem,
  listarCanais,
  listarMensagens,
  marcarCanalLido,
  naoLidasPorCanal,
  semInternet,
  type Canal,
  type MensagemEquipe,
} from '@/lib/conversas';
import { useAdminDaClinica, useMeuProfissionalId } from '@/lib/meuProfissional';

const INTERVALO_MS = 3000;

export default function ConversasPage() {
  const { activeClinicId, activeClinic, loading: clinicLoading } = useClinica();
  const { showAlert, showConfirm } = useCustomAlert();
  const clinicaId = activeClinicId && activeClinicId !== 'all' ? Number(activeClinicId) : null;
  const meuId = useMeuProfissionalId();
  const admin = useAdminDaClinica(clinicaId);

  const [canais, setCanais] = useState<Canal[]>([]);
  const [naoLidas, setNaoLidas] = useState<Map<string, number>>(new Map());
  const [canalId, setCanalId] = useState<string | null>(null);
  const [mostrarLista, setMostrarLista] = useState(true);
  const [mensagens, setMensagens] = useState<MensagemEquipe[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [equipe, setEquipe] = useState<ProfissionalEquipe[]>([]);
  const [offline, setOffline] = useState(false);
  const [novoCanal, setNovoCanal] = useState(false);
  const [nomeCanal, setNomeCanal] = useState('');
  const [criando, setCriando] = useState(false);
  const [erroCanal, setErroCanal] = useState<string | null>(null);
  const versao = useRef(0);

  const canal = canais.find((c) => c.id === canalId) || null;

  const carregarCanais = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const [lista, contagem] = await Promise.all([listarCanais(clinicaId), naoLidasPorCanal(clinicaId)]);
      setCanais(lista);
      setNaoLidas(contagem);
      setCanalId((atual) => (atual && lista.some((c) => c.id === atual) ? atual : lista[0]?.id ?? null));
      setOffline(false);
    } catch {
      setOffline(semInternet());
    }
  }, [clinicaId]);

  useEffect(() => {
    if (clinicLoading) return;
    setCanais([]);
    setCanalId(null);
    setMensagens([]);
    void carregarCanais();
  }, [clinicLoading, carregarCanais]);

  useEffect(() => { void fetchUserEquipe().then(setEquipe).catch(() => setEquipe([])); }, []);

  // Mensagens do canal aberto: carga inteira ao trocar de canal e, depois, só as novas a cada 3 s com a aba visível.
  useEffect(() => {
    if (!canalId || !clinicaId) return;
    const minha = ++versao.current;
    let ultima: string | null = null;
    setMensagens([]);
    setCarregando(true);

    async function ciclo(inicial: boolean) {
      if (!inicial && document.visibilityState !== 'visible') return;
      try {
        const novas = await listarMensagens(canalId!, inicial ? null : ultima);
        if (minha !== versao.current) return;
        setOffline(false);
        if (inicial || novas.length > 0) {
          setMensagens((atual) => {
            const base = inicial ? [] : atual.filter((m) => !m.enviando);
            const ids = new Set(base.map((m) => m.id));
            return [...base, ...novas.filter((m) => !ids.has(m.id))];
          });
          if (novas.length > 0) ultima = novas[novas.length - 1].created_at;
          if (meuId) void marcarCanalLido(clinicaId!, canalId!, meuId).then(() => setNaoLidas((n) => new Map(n).set(canalId!, 0)));
        }
      } catch {
        if (minha === versao.current) setOffline(semInternet());
      } finally {
        if (inicial && minha === versao.current) setCarregando(false);
      }
    }

    void ciclo(true);
    const timer = window.setInterval(() => void ciclo(false), INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [canalId, clinicaId, meuId]);

  // Contagem de não lidas dos outros canais.
  useEffect(() => {
    if (!clinicaId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void naoLidasPorCanal(clinicaId).then(setNaoLidas).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [clinicaId]);

  const nomes = useMemo(() => new Map(equipe.map((p) => [Number(p.id), p.nome])), [equipe]);
  const itens: ItemConversa[] = mensagens.map((m) => ({
    id: m.id,
    texto: m.texto,
    created_at: m.created_at,
    minha: meuId != null && m.autor_id === meuId,
    autor: m.autor_id != null ? nomes.get(m.autor_id) || 'Equipe' : 'Equipe',
    enviando: m.enviando,
    podeApagar: meuId != null && m.autor_id === meuId,
  }));

  async function enviar(texto: string) {
    if (!clinicaId || !canalId) return;
    const temp: MensagemEquipe = { id: `local-${Date.now()}`, canal_id: canalId, autor_id: meuId, texto, created_at: new Date().toISOString(), enviando: true };
    setMensagens((a) => [...a, temp]);
    try {
      const salva = await enviarMensagem(clinicaId, canalId, texto);
      setMensagens((a) => (a.some((m) => m.id === salva.id) ? a.filter((m) => m.id !== temp.id) : a.map((m) => (m.id === temp.id ? salva : m))));
    } catch (e) {
      setMensagens((a) => a.filter((m) => m.id !== temp.id));
      throw e;
    }
  }

  async function apagar(id: string) {
    if (!(await showConfirm('A mensagem some para todos do canal.', { title: 'Apagar mensagem?', confirmLabel: 'Apagar', type: 'warning' }))) return;
    try {
      await apagarMensagem(id);
      setMensagens((a) => a.filter((m) => m.id !== id));
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível apagar.', { type: 'error' });
    }
  }

  async function salvarCanal() {
    if (!clinicaId) return;
    if (!nomeCanal.trim()) { setErroCanal('Dê um nome ao canal.'); return; }
    setCriando(true);
    setErroCanal(null);
    try {
      const novo = await criarCanal(clinicaId, nomeCanal);
      void showAlert('Canal criado.', { type: 'success' });
      setNovoCanal(false);
      setNomeCanal('');
      setCanais((a) => [...a, novo]);
      setCanalId(novo.id);
      setMostrarLista(false);
    } catch (e) {
      setErroCanal(e instanceof Error ? e.message : 'Não foi possível criar o canal.');
    } finally {
      setCriando(false);
    }
  }

  async function arquivar() {
    if (!canal || canal.geral) return;
    if (!(await showConfirm(`O canal #${canal.nome} sai da lista de todos. As mensagens ficam guardadas.`, { title: 'Arquivar canal?', confirmLabel: 'Arquivar', type: 'warning' }))) return;
    try {
      await arquivarCanal(canal.id);
      void showAlert('Canal arquivado.', { type: 'success' });
      setCanalId(null);
      setMostrarLista(true);
      void carregarCanais();
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível arquivar.', { type: 'error' });
    }
  }

  if (!clinicLoading && !clinicaId) {
    return (
      <div className="flex h-full flex-col px-3 py-3 font-poppins md:px-4">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Conversas</h1>
        <p className="mt-6 rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600">Escolha uma clínica no menu para conversar com a equipe dela.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
          Conversas
          <span className="hidden text-neutral-400 md:inline"> · {activeClinic ? getClinicLabel(activeClinic) : ''}</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-500 sm:text-base">Recados da equipe da clínica. Para falar com a Ortus, use Ajuda → Contatar o suporte.</p>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white lg:grid-cols-[17rem_1fr]">
        <aside className={`${mostrarLista ? 'flex' : 'hidden'} min-h-0 flex-col border-neutral-200 lg:flex lg:border-r`}>
          <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
            <p className="text-base font-semibold text-neutral-900">Canais</p>
            {admin && (
              <button type="button" onClick={() => { setErroCanal(null); setNovoCanal(true); }} className="inline-flex h-10 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:h-8">
                <Plus size={14} /> Novo
              </button>
            )}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {canais.map((c) => {
              const n = naoLidas.get(c.id) || 0;
              const ativo = c.id === canalId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { setCanalId(c.id); setMostrarLista(false); }}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-sm ${ativo ? 'bg-neutral-900 text-white' : 'text-neutral-800 hover:bg-neutral-100'}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5"><Hash size={14} className={ativo ? 'text-white/70' : 'text-neutral-400'} /><span className="truncate">{c.nome}</span></span>
                    {n > 0 && !ativo && <span className="shrink-0 rounded-full bg-[#c8f053] px-1.5 text-[11px] font-bold tabular-nums text-neutral-900">{n > 99 ? '99+' : n}</span>}
                  </button>
                </li>
              );
            })}
            {canais.length === 0 && !offline && <li className="px-2.5 py-6 text-center text-xs text-neutral-400"><Loader2 size={14} className="mx-auto animate-spin" /></li>}
            {offline && <li className="px-2.5 py-6 text-center text-xs text-neutral-500">Sem internet: as conversas voltam quando a conexão voltar.</li>}
          </ul>
        </aside>

        <section className={`${mostrarLista ? 'hidden' : 'flex'} min-h-0 flex-col lg:flex`}>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-2 py-2 sm:px-3">
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => setMostrarLista(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 lg:hidden" aria-label="Voltar para os canais">
                <ArrowLeft size={16} />
              </button>
              <p className="flex min-w-0 items-center gap-1 truncate text-base font-semibold text-neutral-900"><Hash size={15} className="text-neutral-400" />{canal?.nome || '—'}</p>
            </div>
            {admin && canal && !canal.geral && (
              <button type="button" onClick={arquivar} className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 sm:h-8" title="Arquivar canal">
                <Archive size={14} /> Arquivar
              </button>
            )}
          </div>
          {canal ? (
            <Conversa
              mensagens={itens}
              carregando={carregando}
              bloqueado={offline ? 'Sem internet: não dá para enviar agora.' : null}
              vazio={<>Nenhuma mensagem em <strong className="font-medium">#{canal.nome}</strong> ainda. Comece a conversa.</>}
              placeholder={`Mensagem em #${canal.nome}`}
              onEnviar={enviar}
              onApagar={apagar}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">Escolha um canal.</div>
          )}
        </section>
      </div>

      <Modal open={novoCanal} onClose={() => setNovoCanal(false)} maxWidth="sm" hideCloseButton panelClassName="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-black/5 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Novo canal</h2>
            <p className="mt-0.5 text-sm text-neutral-500">Ex.: recepção, comercial, laboratório.</p>
          </div>
          <button type="button" onClick={() => setNovoCanal(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Nome do canal <span className="text-red-500">*</span></span>
            <input
              value={nomeCanal}
              onChange={(e) => setNomeCanal(e.target.value.slice(0, 60))}
              onKeyDown={(e) => { if (e.key === 'Enter') void salvarCanal(); }}
              className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
              placeholder="comercial"
              autoFocus
            />
          </label>
          {erroCanal && <p className="mt-2 text-sm text-red-600">{erroCanal}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
          <button type="button" onClick={() => setNovoCanal(false)} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9">Cancelar</button>
          <button type="button" onClick={salvarCanal} disabled={criando} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">
            {criando && <Loader2 size={14} className="animate-spin" />} Criar canal
          </button>
        </div>
      </Modal>
    </div>
  );
}
