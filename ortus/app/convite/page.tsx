'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Chegada do link do e-mail de convite.
 *
 * Abrir o link já com a conta do Ortus confirma, para este convite, que a
 * pessoa lê a caixa de entrada do e-mail convidado. Só depois disso o aceite
 * em Mensagens passa (o banco confere). Sem sessão, o login devolve a pessoa
 * para cá com o link inteiro.
 */

/**
 * Frase do erro para a tela. As do banco (equipe_confirmar_email) são escritas
 * para pessoas e passam; falha de rede e erro técnico viram frase fixa.
 */
function mensagemDoErro(error: { code?: string; message?: string } | null | undefined): string {
  const texto = (error?.message || '').trim();
  if (/failed to fetch|load failed|networkerror|network error|fetch failed/i.test(texto)) {
    return 'Sem conexão com a internet. Confira a rede e abra o link do convite de novo.';
  }
  if (/jwt|token/i.test(texto)) return 'Sua sessão expirou. Entre de novo na sua conta e abra o link do convite.';
  if ((error?.code === '22023' || error?.code === '42501') && texto && !/permission denied/i.test(texto)) return texto;
  return 'Não foi possível confirmar o convite agora. Abra o link do e-mail de novo em alguns minutos.';
}

function Convite() {
  const busca = useSearchParams();
  const id = Number(busca.get('id'));
  const chave = busca.get('chave') || '';
  const [estado, setEstado] = useState<'confirmando' | 'ok' | 'erro'>('confirmando');
  const [mensagem, setMensagem] = useState('');
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    if (!Number.isSafeInteger(id) || id <= 0 || !chave) {
      setEstado('erro');
      setMensagem('O link do convite está incompleto. Abra de novo o botão do e-mail.');
      return;
    }
    supabase
      .rpc('equipe_confirmar_email', { p_convite: id, p_chave: chave })
      .then(
        ({ error }) => {
          if (error) {
            setEstado('erro');
            setMensagem(mensagemDoErro(error));
            return;
          }
          setEstado('ok');
          // Tira a chave da barra de endereço: ela já cumpriu o papel.
          window.history.replaceState(null, '', '/convite');
        },
        // Falha antes de haver resposta: a tela não fica em "Confirmando…" para sempre.
        (falha: unknown) => {
          setEstado('erro');
          setMensagem(mensagemDoErro(falha instanceof Error ? { message: falha.message } : null));
        },
      );
  }, [id, chave]);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 font-poppins">
      <main className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 md:p-6" aria-live="polite">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-full ${
            estado === 'ok' ? 'bg-emerald-50 text-emerald-700' : estado === 'erro' ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-700'
          }`}
        >
          {estado === 'ok' ? <Check size={22} strokeWidth={2.5} aria-hidden /> : estado === 'erro' ? <AlertTriangle size={22} aria-hidden /> : <Loader2 size={22} className="animate-spin" aria-hidden />}
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
          {estado === 'ok' ? 'E-mail confirmado' : estado === 'erro' ? 'Não deu para confirmar' : 'Confirmando o convite…'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          {estado === 'ok'
            ? 'Pronto: este convite está liberado para a sua conta. Agora responda em Mensagens — aceitar não remove você das clínicas em que já trabalha.'
            : estado === 'erro'
              ? mensagem
              : 'Só um instante.'}
        </p>
        {estado !== 'confirmando' && (
          <div className="mt-5">
            <Link
              href="/mensagens"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              {estado === 'ok' ? 'Responder ao convite' : 'Abrir Mensagens'}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PaginaConvite() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Convite />
    </Suspense>
  );
}
