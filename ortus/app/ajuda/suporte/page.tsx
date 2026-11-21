'use client';

/**
 * Conversa da clínica com o suporte da Ortus. Só a própria clínica e a
 * equipe da Ortus veem. Quando ninguém da Ortus está olhando, o servidor
 * avisa o suporte por e-mail (sem o texto da mensagem).
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Headset } from 'lucide-react';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import Conversa, { type ItemConversa } from '@/components/chat/Conversa';
import { usuarioDaSessao } from '@/lib/local/consulta';
import {
  abrirSuporte,
  enviarMensagemSuporte,
  listarMensagensSuporte,
  marcarSuporteLido,
  semInternet,
  type MensagemSuporte,
} from '@/lib/conversas';

const INTERVALO_MS = 3000;

export default function SuportePage() {
  const { activeClinicId, activeClinic, loading: clinicLoading } = useClinica();
  const clinicaId = activeClinicId && activeClinicId !== 'all' ? Number(activeClinicId) : null;
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemSuporte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [eu, setEu] = useState<string | null>(null);
  const versao = useRef(0);

  useEffect(() => { void usuarioDaSessao().then((u) => setEu(u?.id ?? null)); }, []);

  useEffect(() => {
    if (clinicLoading || !clinicaId) return;
    const minha = ++versao.current;
    let ultima: string | null = null;
    let id: string | null = null;
    setMensagens([]);
    setCarregando(true);
    setErro(null);

    async function ciclo(inicial: boolean) {
      if (!inicial && document.visibilityState !== 'visible') return;
      try {
        if (!id) {
          id = await abrirSuporte(clinicaId!);
          if (minha !== versao.current) return;
          setConversaId(id);
        }
        const novas = await listarMensagensSuporte(id, inicial ? null : ultima);
        if (minha !== versao.current) return;
        setErro(null);
        if (inicial || novas.length > 0) {
          setMensagens((atual) => {
            const base = inicial ? [] : atual.filter((m) => !m.enviando);
            const ids = new Set(base.map((m) => m.id));
            return [...base, ...novas.filter((m) => !ids.has(m.id))];
          });
          if (novas.length > 0) ultima = novas[novas.length - 1].created_at;
          void marcarSuporteLido(id);
        }
      } catch (e) {
        if (minha === versao.current) setErro(semInternet() ? 'Sem internet: a conversa volta quando a conexão voltar.' : e instanceof Error ? e.message : 'Não foi possível abrir a conversa.');
      } finally {
        if (inicial && minha === versao.current) setCarregando(false);
      }
    }

    void ciclo(true);
    const timer = window.setInterval(() => void ciclo(false), INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [clinicLoading, clinicaId]);

  async function enviar(texto: string) {
    if (!conversaId) throw new Error('A conversa ainda está abrindo. Tente de novo em instantes.');
    const temp: MensagemSuporte = { id: `local-${Date.now()}`, conversa_id: conversaId, lado: 'clinica', autor_nome: null, autor_user_id: eu, texto, created_at: new Date().toISOString(), enviando: true };
    setMensagens((a) => [...a, temp]);
    try {
      const salva = await enviarMensagemSuporte(conversaId, texto, true);
      setMensagens((a) => (a.some((m) => m.id === salva.id) ? a.filter((m) => m.id !== temp.id) : a.map((m) => (m.id === temp.id ? salva : m))));
    } catch (e) {
      setMensagens((a) => a.filter((m) => m.id !== temp.id));
      throw e;
    }
  }

  const itens: ItemConversa[] = mensagens.map((m) => ({
    id: m.id,
    texto: m.texto,
    created_at: m.created_at,
    minha: m.lado === 'clinica' && (m.autor_user_id === eu || m.enviando === true),
    autor: m.lado === 'ortus' ? `Suporte Ortus${m.autor_nome ? ` · ${m.autor_nome.split(/\s+/)[0]}` : ''}` : m.autor_nome || 'Equipe da clínica',
    enviando: m.enviando,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="mb-3 shrink-0">
        <Link href="/ajuda" className="mb-1 inline-flex h-10 items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900 md:h-auto">
          <ArrowLeft size={14} /> Ajuda
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
          <Headset className="size-6 text-neutral-500" /> Suporte Ortus
        </h1>
        <p className="mt-1 text-sm text-neutral-500 sm:text-base">
          {activeClinic && clinicaId ? `${getClinicLabel(activeClinic)} · ` : ''}Só a sua clínica e a equipe da Ortus veem esta conversa.
        </p>
      </div>

      {!clinicLoading && !clinicaId ? (
        <p className="rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600">Escolha uma clínica no menu: a conversa com o suporte é de cada clínica.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <Conversa
            mensagens={itens}
            carregando={carregando}
            bloqueado={erro}
            vazio="Conte o que está acontecendo. A equipe da Ortus responde por aqui; se ninguém estiver online, o suporte é avisado."
            placeholder="Escreva para o suporte"
            onEnviar={enviar}
          />
        </div>
      )}
    </div>
  );
}
