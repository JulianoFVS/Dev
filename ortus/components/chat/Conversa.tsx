'use client';

/**
 * Lista de mensagens + campo de escrever, usada pelo chat da equipe e pelo
 * suporte. Os padrões vêm da conversa do WhatsApp (app/whatsapp/Conversas.tsx):
 * separador por dia, bolha escura para as próprias mensagens, Enter envia no
 * computador (Shift+Enter quebra a linha), rolagem automática só quando a
 * pessoa já está perto do fim.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, SendHorizontal, Trash2 } from 'lucide-react';
import { TEXTO_MAX } from '@/lib/conversas';

export type ItemConversa = {
  id: string;
  texto: string;
  created_at: string;
  minha: boolean;
  autor?: string | null;
  enviando?: boolean;
  podeApagar?: boolean;
};

type Props = {
  mensagens: ItemConversa[];
  carregando?: boolean;
  /** Quando preenchido, o campo de escrever some e este texto aparece no lugar. */
  bloqueado?: string | null;
  vazio?: ReactNode;
  placeholder?: string;
  onEnviar: (texto: string) => Promise<void>;
  onApagar?: (id: string) => void;
};

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function rotuloDia(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' });
}

export default function Conversa({ mensagens, carregando, bloqueado, vazio, placeholder = 'Escreva uma mensagem', onEnviar, onApagar }: Props) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const perto = useRef(true);
  const total = useRef(0);

  // Rola até o fim quando chegam mensagens, se a pessoa já estava perto dele.
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    if (mensagens.length !== total.current && (perto.current || total.current === 0)) el.scrollTop = el.scrollHeight;
    total.current = mensagens.length;
  }, [mensagens]);

  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 5 * 22 + 16)}px`;
  }, [texto]);

  async function enviar() {
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await onEnviar(limpo);
      setTexto('');
      perto.current = true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  let diaAnterior = '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={lista}
        onScroll={(e) => {
          const el = e.currentTarget;
          perto.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:14px_14px] px-3 py-3 sm:px-4"
      >
        {carregando && mensagens.length === 0 ? (
          <div className="flex h-full items-center justify-center"><Loader2 size={18} className="animate-spin text-neutral-400" /></div>
        ) : mensagens.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">{vazio || 'Nenhuma mensagem ainda.'}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {mensagens.map((m) => {
              const dia = rotuloDia(m.created_at);
              const separador = dia !== diaAnterior;
              diaAnterior = dia;
              return (
                <div key={m.id}>
                  {separador && (
                    <div className="my-2 flex justify-center">
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-neutral-500 shadow-sm">{dia}</span>
                    </div>
                  )}
                  <div className={`group flex items-end gap-1.5 ${m.minha ? 'justify-end' : 'justify-start'}`}>
                    {m.minha && m.podeApagar && onApagar && !m.enviando && (
                      <button type="button" onClick={() => onApagar(m.id)} className="alvo-toque mb-1 rounded p-1 text-neutral-300 opacity-0 hover:text-rose-600 group-hover:opacity-100 max-lg:opacity-100" aria-label="Apagar mensagem" title="Apagar">
                        <Trash2 size={13} />
                      </button>
                    )}
                    <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm shadow-sm ${m.minha ? 'rounded-br-none bg-neutral-900 text-white' : 'rounded-bl-none bg-white text-neutral-900'} ${m.enviando ? 'opacity-60' : ''}`}>
                      {!m.minha && m.autor && <p className="mb-0.5 text-[11px] font-semibold text-neutral-500">{m.autor}</p>}
                      {m.texto}
                      <p className={`mt-0.5 text-right text-[10px] ${m.minha ? 'text-white/60' : 'text-neutral-400'}`}>{m.enviando ? 'enviando…' : hora(m.created_at)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {bloqueado ? (
        <p className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 text-center text-sm text-neutral-500">{bloqueado}</p>
      ) : (
        <div className="shrink-0 border-t border-neutral-200 bg-white px-3 py-2.5 sm:px-4">
          {erro && <p className="mb-1.5 text-xs text-red-600">{erro}</p>}
          <div className="flex items-end gap-2">
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAX))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              rows={1}
              placeholder={placeholder}
              className="min-h-[40px] flex-1 resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 max-sm:text-base"
            />
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={enviando || !texto.trim()}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-10 sm:w-10"
              aria-label="Enviar"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
