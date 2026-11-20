'use client';

/**
 * Aba "Suporte" do painel SaaS: as conversas das clínicas com a Ortus.
 * Enquanto a aba está aberta e visível, um batimento a cada 30 s diz ao
 * servidor que alguém da Ortus está olhando (aí a clínica não gera e-mail
 * de aviso).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Conversa, { type ItemConversa } from '@/components/chat/Conversa';
import { usuarioDaSessao } from '@/lib/local/consulta';
import {
  baterPresencaSuporte,
  enviarMensagemSuporte,
  listarConversasSuporte,
  listarMensagensSuporte,
  marcarSuporteLido,
  naoLidaPelaOrtus,
  type ConversaSuporte,
  type MensagemSuporte,
} from '@/lib/conversas';

function quando(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function SuporteConversas({ conversaInicial }: { conversaInicial?: string | null }) {
  const [conversas, setConversas] = useState<ConversaSuporte[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(conversaInicial ?? null);
  const [mensagens, setMensagens] = useState<MensagemSuporte[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [eu, setEu] = useState<string | null>(null);
  const versao = useRef(0);

  useEffect(() => { void usuarioDaSessao().then((u) => setEu(u?.id ?? null)); }, []);

  const carregarLista = useCallback(async () => {
    try {
      setConversas(await listarConversasSuporte());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as conversas.');
      setConversas((c) => c ?? []);
    }
  }, []);

  // Lista a cada 10 s e batimento de presença a cada 30 s, com a aba visível.
  useEffect(() => {
    void carregarLista();
    void baterPresencaSuporte();
    const lista = window.setInterval(() => { if (document.visibilityState === 'visible') void carregarLista(); }, 10_000);
    const presenca = window.setInterval(() => { if (document.visibilityState === 'visible') void baterPresencaSuporte(); }, 30_000);
    return () => { window.clearInterval(lista); window.clearInterval(presenca); };
  }, [carregarLista]);

  useEffect(() => {
    if (!aberta) return;
    const minha = ++versao.current;
    let ultima: string | null = null;
    setMensagens([]);
    setCarregando(true);
    async function ciclo(inicial: boolean) {
      if (!inicial && document.visibilityState !== 'visible') return;
      try {
        const novas = await listarMensagensSuporte(aberta!, inicial ? null : ultima);
        if (minha !== versao.current) return;
        if (inicial || novas.length > 0) {
          setMensagens((atual) => {
            const base = inicial ? [] : atual.filter((m) => !m.enviando);
            const ids = new Set(base.map((m) => m.id));
            return [...base, ...novas.filter((m) => !ids.has(m.id))];
          });
          if (novas.length > 0) ultima = novas[novas.length - 1].created_at;
          void marcarSuporteLido(aberta!).then(() => setConversas((cs) => cs?.map((c) => (c.id === aberta ? { ...c, ortus_leu_ate: new Date().toISOString() } : c)) ?? cs));
        }
      } catch {
        // Próxima volta tenta de novo.
      } finally {
        if (inicial && minha === versao.current) setCarregando(false);
      }
    }
    void ciclo(true);
    const timer = window.setInterval(() => void ciclo(false), 3000);
    return () => window.clearInterval(timer);
  }, [aberta]);

  async function responder(texto: string) {
    if (!aberta) return;
    const temp: MensagemSuporte = { id: `local-${Date.now()}`, conversa_id: aberta, lado: 'ortus', autor_nome: null, autor_user_id: eu, texto, created_at: new Date().toISOString(), enviando: true };
    setMensagens((a) => [...a, temp]);
    try {
      const salva = await enviarMensagemSuporte(aberta, texto, false);
      setMensagens((a) => (a.some((m) => m.id === salva.id) ? a.filter((m) => m.id !== temp.id) : a.map((m) => (m.id === temp.id ? salva : m))));
      void carregarLista();
    } catch (e) {
      setMensagens((a) => a.filter((m) => m.id !== temp.id));
      throw e;
    }
  }

  const atual = conversas?.find((c) => c.id === aberta) || null;
  const nomeClinica = (c: ConversaSuporte | null) => c?.clinicas?.nome || (c ? `Clínica ${c.clinica_id}` : '');
  const itens: ItemConversa[] = mensagens.map((m) => ({
    id: m.id,
    texto: m.texto,
    created_at: m.created_at,
    minha: m.lado === 'ortus',
    autor: m.lado === 'ortus' ? (m.autor_user_id === eu ? null : `Ortus · ${m.autor_nome || ''}`) : m.autor_nome || nomeClinica(atual),
    enviando: m.enviando,
  }));

  return (
    <div className="grid min-h-[60vh] flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white lg:min-h-0 lg:grid-cols-[19rem_1fr]">
      <aside className={`${aberta ? 'hidden' : 'flex'} min-h-0 flex-col border-neutral-200 lg:flex lg:border-r`}>
        <p className="shrink-0 px-3 py-2.5 text-base font-semibold text-neutral-900">Conversas</p>
        {erro && <p className="px-3 pb-2 text-xs text-red-600">{erro}</p>}
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {conversas === null ? (
            <li className="py-6 text-center"><Loader2 size={16} className="mx-auto animate-spin text-neutral-400" /></li>
          ) : conversas.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-neutral-500">Nenhuma clínica escreveu ainda.</li>
          ) : conversas.map((c) => {
            const nova = naoLidaPelaOrtus(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setAberta(c.id)}
                  className={`flex min-h-[48px] w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left ${c.id === aberta ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'}`}
                >
                  <span className={`min-w-0 truncate text-sm ${nova ? 'font-semibold' : ''}`}>{nomeClinica(c)}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className={`text-[11px] ${c.id === aberta ? 'text-white/70' : 'text-neutral-400'}`}>{quando(c.ultima_mensagem_em)}</span>
                    {nova && c.id !== aberta && <span className="h-2 w-2 rounded-full bg-[#c8f053] ring-1 ring-neutral-900/10" aria-label="Mensagem nova" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <section className={`${aberta ? 'flex' : 'hidden'} min-h-0 flex-col lg:flex`}>
        <div className="flex shrink-0 items-center gap-1 border-b border-neutral-200 px-2 py-2 sm:px-3">
          <button type="button" onClick={() => setAberta(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 lg:hidden" aria-label="Voltar para a lista">
            <ArrowLeft size={16} />
          </button>
          <p className="truncate text-base font-semibold text-neutral-900">{atual ? nomeClinica(atual) : 'Escolha uma conversa'}</p>
        </div>
        {aberta ? (
          <Conversa mensagens={itens} carregando={carregando} placeholder="Responder como Ortus" onEnviar={responder} vazio="Sem mensagens." />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">Escolha uma conversa à esquerda.</div>
        )}
      </section>
    </div>
  );
}
