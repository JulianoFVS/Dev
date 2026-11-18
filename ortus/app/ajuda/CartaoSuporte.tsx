'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Copy, Headset, MessageCircle } from 'lucide-react';
import { useClinica } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { linkConversaSuporte, numeroParaCopiar, numerosSuporte, type NumeroSuporte } from '@/lib/suporte';
import { WHATSAPP_ATIVO, situacaoWhatsapp, type SituacaoWhatsapp } from '@/lib/whatsappCliente';

/** Situação do WhatsApp do Ortus para a clínica ativa. Decide o que o toque no número faz. */
type Estado = 'desligado' | 'verificando' | 'sem-clinica' | 'conectado' | 'desconectado' | 'sem-servico' | 'fora-do-ar' | 'sem-acesso';

const TEXTO_DO_ESTADO: Record<Estado, string> = {
  conectado: 'O atendimento é pelo WhatsApp. Toque em um número para abrir a conversa aqui no Ortus.',
  desconectado: 'O atendimento é pelo WhatsApp. O WhatsApp da clínica não está conectado ao Ortus: copie o número e fale pelo seu, ou conecte para conversar por aqui.',
  'sem-clinica': 'O atendimento é pelo WhatsApp. Copie o número e fale pelo seu, ou escolha uma clínica no seletor de unidade para conversar por aqui.',
  desligado: 'O atendimento é pelo WhatsApp. Nesta instalação o WhatsApp do Ortus está desligado: copie o número e fale pelo seu.',
  verificando: 'O atendimento é pelo WhatsApp. Conferindo a conexão da clínica…',
  'sem-servico': 'O atendimento é pelo WhatsApp. Este endereço não tem o WhatsApp do Ortus: copie o número e fale pelo seu.',
  'fora-do-ar': 'O atendimento é pelo WhatsApp. O WhatsApp do Ortus não respondeu agora: copie o número e fale pelo seu.',
  'sem-acesso': 'O atendimento é pelo WhatsApp. As conversas do WhatsApp do Ortus não estão liberadas para você: copie o número e fale pelo seu.',
};

export default function CartaoSuporte({ className = '' }: { className?: string }) {
  const { activeClinicId, loading } = useClinica();
  const { showAlert } = useCustomAlert();
  const numeros = useMemo(() => numerosSuporte(), []);
  const clinicaId = activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : null;
  const [conexao, setConexao] = useState<{ clinicaId: string; situacao: SituacaoWhatsapp } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const timerCopiado = useRef<number | null>(null);

  useEffect(() => {
    if (!WHATSAPP_ATIVO || !clinicaId || numeros.length === 0) return;
    let vivo = true;
    void situacaoWhatsapp(clinicaId).then((situacao) => {
      if (vivo) setConexao({ clinicaId, situacao });
    });
    return () => {
      vivo = false;
    };
  }, [clinicaId, numeros.length]);

  useEffect(() => () => {
    if (timerCopiado.current) window.clearTimeout(timerCopiado.current);
  }, []);

  function estadoAtual(): Estado {
    if (!WHATSAPP_ATIVO) return 'desligado';
    if (!clinicaId) return loading ? 'verificando' : 'sem-clinica';
    // A resposta guardada pode ser de outra clínica (a pessoa trocou de unidade): só vale se o id bater.
    if (!conexao || conexao.clinicaId !== clinicaId) return 'verificando';
    const s = conexao.situacao;
    if (s.configurado === false) return 'sem-servico';
    if (s.status === 'offline' || s.configurado === null) return 'fora-do-ar';
    if (s.conectado) return s.podeConversar ? 'conectado' : 'sem-acesso';
    return 'desconectado';
  }
  const estado = estadoAtual();
  const podeConectar = conexao?.clinicaId === clinicaId && conexao?.situacao.podeConectar === true;

  async function copiar(numero: NumeroSuporte) {
    try {
      await navigator.clipboard.writeText(numeroParaCopiar(numero.digitos));
    } catch {
      await showAlert(`Não foi possível copiar. O número é ${numero.exibicao}.`, { type: 'warning' });
      return;
    }
    setCopiado(numero.digitos);
    if (timerCopiado.current) window.clearTimeout(timerCopiado.current);
    timerCopiado.current = window.setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <section aria-labelledby="ajuda-suporte" className={`rounded-xl border border-neutral-200 bg-white p-3 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
          <Headset size={16} />
        </span>
        <div className="min-w-0">
          <h2 id="ajuda-suporte" className="text-sm font-semibold text-neutral-900">Contatar o suporte</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
            {numeros.length === 0
              ? 'Os números do suporte ainda não foram configurados. Enquanto isso, envie um relato em Reportar bugs ou sugerir funcionalidades: ele chega à fila do suporte.'
              : estado === 'desconectado' && !podeConectar
                ? 'O atendimento é pelo WhatsApp. O WhatsApp da clínica não está conectado ao Ortus: copie o número e fale pelo seu, ou peça ao administrador da clínica para conectar.'
                : TEXTO_DO_ESTADO[estado]}
          </p>
        </div>
      </div>

      {numeros.length > 0 && (
        <div className="mt-3 max-w-3xl">
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {numeros.map((numero) => {
              const acabouDeCopiar = copiado === numero.digitos;
              return (
                <li key={numero.digitos} className="flex items-stretch overflow-hidden rounded-md border border-neutral-200">
                  {estado === 'conectado' ? (
                    <Link
                      href={linkConversaSuporte(numero.digitos)}
                      aria-label={`Abrir a conversa com o suporte no número ${numero.exibicao}`}
                      className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                    >
                      <MessageCircle size={16} className="shrink-0 text-neutral-500" />
                      <span className="min-w-0 flex-1 whitespace-nowrap tabular-nums">{numero.exibicao}</span>
                      <ChevronRight size={16} className="hidden shrink-0 text-neutral-300 sm:block" />
                    </Link>
                  ) : (
                    <span className="flex min-h-[44px] min-w-0 flex-1 select-all items-center whitespace-nowrap px-3 text-sm font-medium tabular-nums text-neutral-900">
                      {numero.exibicao}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void copiar(numero)}
                    aria-label={`Copiar o número ${numero.exibicao}`}
                    className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 border-l border-neutral-200 px-3 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                  >
                    {acabouDeCopiar ? <Check size={14} /> : <Copy size={14} />}
                    {/* No celular fica só o ícone: com o rótulo, o número não caberia inteiro na linha. */}
                    <span className="hidden sm:inline">{acabouDeCopiar ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p aria-live="polite" className="sr-only">{copiado ? 'Número copiado.' : ''}</p>

          {estado === 'desconectado' && podeConectar && (
            <Link
              href="/whatsapp"
              className="mt-2 flex min-h-[44px] items-center gap-2 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
            >
              <MessageCircle size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 py-2">Abra WhatsApp e conecte o aparelho da clínica</span>
              <ChevronRight size={16} className="shrink-0 text-white/60" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
