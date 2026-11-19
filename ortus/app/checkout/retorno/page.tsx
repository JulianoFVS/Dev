'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Clock, Loader2, Mail, XCircle } from 'lucide-react';
import { motivoDoPagamento, reais, type StatusPedido } from '@/lib/assinaturas';
import { numerosSuporte } from '@/lib/suporte';

/**
 * Volta do pagamento.
 *
 * Mostra em que pé está a compra — aguardando, pendente, recusado, pago,
 * estornado, contestado — e, quando a conta nasce, para onde foi o link de
 * criação da senha. A tela pergunta ao servidor a cada poucos segundos
 * enquanto algo ainda pode mudar; o servidor, por sua vez, confere com o
 * provedor. Nada aqui depende de o webhook ter chegado.
 */

type Situacao = {
  pedido: string;
  status: StatusPedido;
  plano: string;
  valor_centavos: number;
  clinica: string;
  email: string;
  pagamento_status: string | null;
  pagamento_detalhe: string | null;
  link_pagamento: string | null;
  conta_criada: boolean;
  email_acesso: 'enviado' | 'falhou' | 'pendente';
  conta_com_problema?: boolean;
  outra_compra_paga?: boolean;
};

// Consultas automáticas: 4 s no começo; depois de dois minutos, a cada 15 s; param em ~22 minutos.
const MAX_CONSULTAS = 110;

const BOTAO = 'inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60';
const BOTAO_CLARO = 'inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60';

function Retorno() {
  const busca = useSearchParams();
  const pedido = busca.get('pedido') || '';
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [reenvio, setReenvio] = useState<{ estado: 'parado' | 'enviando' | 'ok' | 'erro'; texto?: string }>({ estado: 'parado' });
  // As consultas automáticas pararam com a compra ainda em andamento: a tela deixa de prometer
  // que se atualiza sozinha e oferece "Conferir de novo".
  const [parou, setParou] = useState(false);
  const [rodadaManual, setRodadaManual] = useState(0);
  const tentativas = useRef(0);

  const consultar = useCallback(async () => {
    if (!pedido) return null;
    try {
      const r = await fetch(`/api/public/assinatura/pedido?id=${encodeURIComponent(pedido)}`, { cache: 'no-store' });
      if (r.status === 404) {
        setFalha('Não encontramos esta compra. Confira o link ou comece de novo.');
        return null;
      }
      if (!r.ok) throw new Error('falha');
      const dados = (await r.json()) as Situacao;
      setSituacao(dados);
      setFalha(null);
      return dados;
    } catch {
      setFalha((atual) => atual ?? 'Sem resposta do servidor. Tentando de novo…');
      return null;
    }
  }, [pedido]);

  useEffect(() => {
    if (!pedido) return;
    let cancelado = false;
    let relogio: ReturnType<typeof setTimeout> | null = null;
    tentativas.current = 0;
    setParou(false);
    const emAndamento = (s: Situacao | null) =>
      !s || (s.status === 'pago' && !s.conta_com_problema) || (s.status === 'aguardando_pagamento' && s.pagamento_status !== 'recusado')
      || (s.status === 'provisionado' && s.email_acesso === 'pendente');
    const rodada = async () => {
      const s = await consultar();
      if (cancelado) return;
      tentativas.current += 1;
      if (!emAndamento(s)) return;
      if (tentativas.current < MAX_CONSULTAS) relogio = setTimeout(rodada, tentativas.current < 30 ? 4000 : 15_000);
      else setParou(true);
    };
    void rodada();
    return () => {
      cancelado = true;
      if (relogio) clearTimeout(relogio);
    };
  }, [pedido, consultar, rodadaManual]);

  async function reenviar() {
    setReenvio({ estado: 'enviando' });
    try {
      const r = await fetch('/api/public/assinatura/reenviar-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido }),
      });
      const d = (await r.json().catch(() => null)) as { enviado?: boolean; error?: string } | null;
      if (r.ok && d?.enviado) {
        setReenvio({ estado: 'ok', texto: 'Novo link enviado. Os anteriores deixam de valer.' });
        void consultar();
      } else {
        setReenvio({ estado: 'erro', texto: d?.error || 'Não foi possível enviar agora.' });
      }
    } catch {
      setReenvio({ estado: 'erro', texto: 'Sem conexão com o servidor.' });
    }
  }

  const suporte = numerosSuporte();
  const contato = suporte.length > 0 && (
    <p className="mt-4 text-xs text-neutral-500">
      Precisa de ajuda?{' '}
      {suporte.map((n, i) => (
        <span key={n.digitos}>
          {i > 0 && ' ou '}
          <a href={`https://wa.me/${n.digitos}`} target="_blank" rel="noopener noreferrer" className="font-medium text-neutral-800 underline underline-offset-2">
            {n.exibicao}
          </a>
        </span>
      ))}
    </p>
  );

  let icone = <Loader2 size={22} className="animate-spin" aria-hidden />;
  let tom = 'bg-neutral-100 text-neutral-700';
  let titulo = 'Conferindo o pagamento…';
  let corpo: React.ReactNode = <p>Isso leva alguns segundos.</p>;
  let acoes: React.ReactNode = null;

  if (!pedido) {
    icone = <AlertTriangle size={22} aria-hidden />;
    titulo = 'Nenhuma compra para mostrar';
    corpo = <p>Abra esta página pelo link de retorno do pagamento ou comece uma assinatura.</p>;
    acoes = <Link href="/checkout" className={BOTAO}>Ver os planos</Link>;
  } else if (!situacao && falha) {
    icone = <AlertTriangle size={22} aria-hidden />;
    tom = 'bg-amber-50 text-amber-700';
    titulo = 'Não deu para conferir';
    corpo = <p>{falha}</p>;
    acoes = <Link href="/checkout" className={BOTAO_CLARO}>Voltar aos planos</Link>;
  } else if (situacao) {
    const motivo = motivoDoPagamento(situacao.pagamento_detalhe);
    const resumo = (
      <p className="text-neutral-500">
        Plano {situacao.plano} · {reais(situacao.valor_centavos)} por mês · {situacao.clinica}
      </p>
    );
    if (situacao.status === 'provisionado') {
      icone = <Check size={22} strokeWidth={2.5} aria-hidden />;
      tom = 'bg-emerald-50 text-emerald-700';
      titulo = 'Pagamento confirmado. Sua clínica está criada.';
      corpo = (
        <>
          {situacao.email_acesso === 'enviado' && (
            <p className="flex items-start gap-2">
              <Mail size={16} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden />
              <span>
                Enviamos para <strong className="font-semibold text-neutral-900">{situacao.email}</strong> o link para confirmar o e-mail e criar a sua senha. Confira também a caixa de spam.
              </span>
            </p>
          )}
          {situacao.email_acesso === 'pendente' && <p>Estamos enviando o link de acesso para {situacao.email}…</p>}
          {situacao.email_acesso === 'falhou' && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              A conta foi criada, mas o e-mail com o link de acesso não saiu. Peça o envio de novo abaixo; se continuar sem chegar, fale com o suporte.
            </p>
          )}
          {resumo}
          {reenvio.texto && (
            <p role="status" className={reenvio.estado === 'ok' ? 'text-emerald-700' : 'text-red-600'}>{reenvio.texto}</p>
          )}
        </>
      );
      acoes = (
        <>
          <button type="button" onClick={reenviar} disabled={reenvio.estado === 'enviando'} className={BOTAO_CLARO}>
            {reenvio.estado === 'enviando' && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {situacao.email_acesso === 'falhou' ? 'Enviar o link de acesso' : 'Não chegou? Enviar de novo'}
          </button>
          <Link href="/login" className={BOTAO}>Já criei a senha: entrar</Link>
        </>
      );
    } else if (situacao.status === 'pago' && situacao.conta_com_problema) {
      icone = <AlertTriangle size={22} aria-hidden />;
      tom = 'bg-amber-50 text-amber-700';
      titulo = 'Pagamento confirmado. Falta concluir a sua conta.';
      corpo = (
        <>
          <p>O pagamento está registrado, mas a criação da clínica não terminou. A equipe do Ortus já foi avisada; fale com o suporte para concluir. Nada será cobrado de novo.</p>
          {resumo}
        </>
      );
    } else if (situacao.status === 'pago') {
      titulo = 'Pagamento confirmado. Criando a sua clínica…';
      tom = 'bg-emerald-50 text-emerald-700';
      corpo = <>{<p>Não feche esta página: em instantes o link de acesso chega em {situacao.email}.</p>}{resumo}</>;
      if (parou) {
        icone = <Clock size={22} aria-hidden />;
        acoes = <button type="button" onClick={() => setRodadaManual((n) => n + 1)} className={BOTAO}>Conferir de novo</button>;
      }
    } else if (situacao.status === 'aguardando_pagamento' && situacao.pagamento_status === 'recusado') {
      icone = <XCircle size={22} aria-hidden />;
      tom = 'bg-rose-50 text-rose-700';
      titulo = 'Pagamento recusado';
      corpo = <><p>{motivo || 'O provedor não aprovou este pagamento.'} Nada foi cobrado. Você pode tentar de novo com outro cartão ou com Pix.</p>{resumo}</>;
      acoes = situacao.link_pagamento
        ? <a href={situacao.link_pagamento} className={BOTAO}>Tentar de novo</a>
        : <Link href="/checkout" className={BOTAO}>Começar de novo</Link>;
    } else if (situacao.status === 'aguardando_pagamento' && situacao.pagamento_status === 'pendente') {
      icone = <Clock size={22} aria-hidden />;
      tom = 'bg-amber-50 text-amber-700';
      titulo = 'Pagamento pendente';
      corpo = (
        <>
          <p>
            {motivo || 'O provedor ainda não confirmou o pagamento.'}{' '}
            {parou ? 'Confira de novo daqui a pouco' : 'Esta página se atualiza sozinha'}: a conta nasce assim que o pagamento for confirmado, e o link de acesso vai para {situacao.email}.
          </p>
          {resumo}
        </>
      );
      acoes = (
        <>
          {situacao.link_pagamento && <a href={situacao.link_pagamento} className={BOTAO_CLARO}>Abrir o pagamento de novo</a>}
          {parou && <button type="button" onClick={() => setRodadaManual((n) => n + 1)} className={BOTAO}>Conferir de novo</button>}
        </>
      );
    } else if (situacao.status === 'aguardando_pagamento') {
      icone = <Clock size={22} aria-hidden />;
      tom = 'bg-amber-50 text-amber-700';
      titulo = 'Aguardando o pagamento';
      corpo = (
        <>
          <p>
            Ainda não recebemos a confirmação do provedor.{' '}
            {parou
              ? 'Se você já pagou, toque em "Conferir de novo" daqui a alguns minutos ou fale com o suporte.'
              : 'Se você já pagou, aguarde: esta página se atualiza sozinha.'}
          </p>
          {resumo}
        </>
      );
      acoes = (
        <>
          {situacao.link_pagamento
            ? <a href={situacao.link_pagamento} className={parou ? BOTAO_CLARO : BOTAO}>Ir para o pagamento</a>
            : <Link href="/checkout" className={BOTAO_CLARO}>Começar de novo</Link>}
          {parou && <button type="button" onClick={() => setRodadaManual((n) => n + 1)} className={BOTAO}>Conferir de novo</button>}
        </>
      );
    } else if (situacao.status === 'estornado' || situacao.status === 'contestado') {
      icone = <AlertTriangle size={22} aria-hidden />;
      tom = 'bg-rose-50 text-rose-700';
      titulo = situacao.status === 'estornado' ? 'Pagamento estornado' : 'Pagamento contestado';
      corpo = (
        <>
          <p>
            {situacao.status === 'estornado'
              ? 'O valor desta compra foi devolvido pelo provedor.'
              : 'O pagamento desta compra foi contestado junto ao banco ou ao provedor.'}{' '}
            Se a clínica já foi criada, a mensalidade volta a ficar em aberto; os dados continuam guardados.
          </p>
          {resumo}
        </>
      );
    } else if (situacao.outra_compra_paga) {
      icone = <AlertTriangle size={22} aria-hidden />;
      titulo = 'Este e-mail já tem uma assinatura';
      corpo = (
        <>
          <p>
            Outra compra com o mesmo e-mail foi paga, e o acesso vai para {situacao.email}. Se você pagou também esta, fale com o suporte para receber o valor de volta.
          </p>
          {resumo}
        </>
      );
      acoes = <Link href="/login" className={BOTAO}>Entrar</Link>;
    } else {
      icone = <AlertTriangle size={22} aria-hidden />;
      titulo = situacao.status === 'expirado' ? 'Esta compra expirou' : 'Esta compra foi encerrada';
      // Não afirma que "nada foi cobrado": um Pix ou link antigo ainda pode ter sido pago. Esta
      // página confere com o provedor ao abrir; pagamento confirmado é atendido.
      corpo = (
        <>
          <p>Esta compra não está mais aberta para pagamento. Se você chegou a pagar, abra esta página de novo em alguns minutos: o pagamento é conferido com o provedor e a conta é criada. Se não pagou, é só começar de novo.</p>
          {resumo}
        </>
      );
      acoes = <Link href="/checkout" className={BOTAO}>Começar de novo</Link>;
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center overflow-y-auto bg-[#f3f4f1] px-4 py-6 font-poppins text-neutral-900">
      <main className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 md:p-6" aria-live="polite">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${tom}`}>{icone}</span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">{titulo}</h1>
        <div className="mt-2 grid gap-2 text-sm leading-relaxed text-neutral-600">{corpo}</div>
        {acoes && <div className="mt-5 grid gap-2 sm:grid-cols-2">{acoes}</div>}
        {contato}
      </main>
    </div>
  );
}

export default function PaginaRetorno() {
  return (
    <Suspense fallback={<div className="h-dvh bg-[#f3f4f1]" />}>
      <Retorno />
    </Suspense>
  );
}
