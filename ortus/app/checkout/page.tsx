'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Lock } from 'lucide-react';
import { PLANOS_VITRINE, reais, type PlanoPublico } from '@/lib/assinaturas';
import { numerosSuporte } from '@/lib/suporte';

/**
 * Assinar o Ortus — página pública.
 *
 * Aqui a pessoa escolhe o plano e identifica a clínica. O pagamento (Pix ou
 * cartão) acontece na página do provedor: nenhum dado de cartão é digitado
 * nem trafega pelo Ortus. O valor cobrado é o do catálogo no servidor; o que
 * a tela mostra é só vitrine.
 */

const ROTULO = 'mb-1.5 block text-xs font-medium text-neutral-500';
const CAMPO =
  'h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400';

type Campo = 'plano' | 'clinica' | 'responsavel' | 'email' | 'telefone' | 'aceite';

/** "Básico", "basico" e "BASICO" apontam para o mesmo plano (os links antigos mandavam o nome). */
function codigoDe(valor: string | null): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function Checkout() {
  const router = useRouter();
  const busca = useSearchParams();
  const pedidoNaUrl = codigoDe(busca.get('plano'));

  const [planos, setPlanos] = useState<PlanoPublico[]>(PLANOS_VITRINE);
  const [disponivel, setDisponivel] = useState<boolean | null>(null);
  const [plano, setPlano] = useState<string>(pedidoNaUrl || 'profissional');
  const [clinica, setClinica] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<{ campo?: Campo; texto: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch('/api/public/assinatura/planos', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { disponivel?: boolean; planos?: PlanoPublico[] } | null) => {
        if (cancelado) return;
        if (d?.planos?.length) setPlanos(d.planos);
        setDisponivel(d ? d.disponivel === true : false);
      })
      .catch(() => {
        if (!cancelado) setDisponivel(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const escolhido = useMemo(
    () => planos.find((p) => p.codigo === plano) || planos.find((p) => p.destaque) || planos[0],
    [planos, plano],
  );
  const suporte = numerosSuporte();

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando || !escolhido) return;
    setErro(null);
    if (clinica.trim().length < 2) return setErro({ campo: 'clinica', texto: 'Informe o nome da clínica.' });
    if (responsavel.trim().length < 2) return setErro({ campo: 'responsavel', texto: 'Informe o seu nome.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro({ campo: 'email', texto: 'Informe um e-mail válido.' });
    if (!aceite) return setErro({ campo: 'aceite', texto: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' });

    setEnviando(true);
    try {
      const resposta = await fetch('/api/public/assinatura/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plano: escolhido.codigo, clinica, responsavel, email, telefone, aceite: true }),
      });
      const dados = (await resposta.json().catch(() => null)) as { pedido?: string; url?: string | null; pago?: boolean; error?: string; campo?: Campo } | null;
      if (!resposta.ok || !dados?.pedido) {
        setErro({ campo: dados?.campo, texto: dados?.error || 'Não foi possível iniciar a compra. Tente de novo.' });
        setEnviando(false);
        return;
      }
      if (dados.url && !dados.pago) {
        window.location.assign(dados.url);
        return;
      }
      router.push(`/checkout/retorno?pedido=${dados.pedido}`);
    } catch {
      setErro({ texto: 'Sem conexão com o servidor. Confira a internet e tente de novo.' });
      setEnviando(false);
    }
  }

  const erroDe = (campo: Campo) => (erro?.campo === campo ? erro.texto : null);

  return (
    <div className="h-dvh overflow-y-auto bg-[#f3f4f1] font-poppins text-neutral-900">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-4 md:px-6 md:py-6">
        <header className="flex shrink-0 items-center justify-between">
          <Link href="/" className="inline-flex h-10 items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900">
            <ArrowLeft size={16} aria-hidden /> Voltar
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
            <Lock size={13} aria-hidden /> Pagamento na página do Mercado Pago
          </span>
        </header>

        <main className="grid flex-1 grid-cols-1 content-center gap-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:gap-6">
          <section aria-labelledby="titulo-checkout" className="flex flex-col">
            <h1 id="titulo-checkout" className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
              Assinar o Ortus
            </h1>
            <p className="mt-1.5 text-sm text-neutral-600">
              Escolha o plano e identifique a clínica. A conta é criada assim que o pagamento for confirmado.
            </p>

            <fieldset className="mt-4">
              <legend className={ROTULO}>
                Plano <span className="text-red-500">*</span>
              </legend>
              <div className="grid gap-2">
                {planos.map((p) => {
                  const ativo = escolhido?.codigo === p.codigo;
                  return (
                    <label
                      key={p.codigo}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-3.5 py-3 ${
                        ativo ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="plano"
                        value={p.codigo}
                        checked={ativo}
                        onChange={() => setPlano(p.codigo)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          ativo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'
                        }`}
                      >
                        {ativo && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-neutral-900">{p.nome}</span>
                        <span className="block text-xs text-neutral-500">{p.recursos.slice(0, 3).join(' · ') || p.descricao}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums text-neutral-900">{reais(p.valor_centavos)}</span>
                        <span className="block text-[11px] text-neutral-500">por mês</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <ul className="mt-4 hidden space-y-1.5 text-sm text-neutral-600 md:block">
              <li>Pix ou cartão, sem fidelidade. A mensalidade é paga a cada mês, pela fatura que chega por e-mail.</li>
              <li>O Ortus não recebe nem guarda número de cartão.</li>
            </ul>
          </section>

          <section aria-label="Dados da clínica" className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5">
            {disponivel === false ? (
              <div className="flex h-full flex-col justify-center">
                <h2 className="text-base font-semibold text-neutral-900">Assinatura pela internet indisponível</h2>
                <p className="mt-1.5 text-sm text-neutral-600">
                  No momento a contratação é feita direto com a nossa equipe. Chame no WhatsApp e a clínica é criada no mesmo dia.
                </p>
                {suporte.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    {suporte.map((n) => (
                      <a
                        key={n.digitos}
                        href={`https://wa.me/${n.digitos}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-11 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
                      >
                        Falar com {n.exibicao}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-neutral-500">O contato do suporte ainda não foi configurado nesta instalação.</p>
                )}
              </div>
            ) : (
              <form onSubmit={enviar} noValidate className="grid gap-3">
                <h2 className="text-base font-semibold text-neutral-900">Dados da clínica</h2>
                <div>
                  <label htmlFor="ck-clinica" className={ROTULO}>
                    Nome da clínica <span className="text-red-500">*</span>
                  </label>
                  <input id="ck-clinica" value={clinica} onChange={(e) => setClinica(e.target.value)} maxLength={120} autoComplete="organization" className={CAMPO} aria-invalid={Boolean(erroDe('clinica'))} />
                  {erroDe('clinica') && <p className="mt-1 text-xs text-red-600">{erroDe('clinica')}</p>}
                </div>
                <div>
                  <label htmlFor="ck-responsavel" className={ROTULO}>
                    Seu nome <span className="text-red-500">*</span>
                  </label>
                  <input id="ck-responsavel" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} maxLength={120} autoComplete="name" className={CAMPO} aria-invalid={Boolean(erroDe('responsavel'))} />
                  {erroDe('responsavel') && <p className="mt-1 text-xs text-red-600">{erroDe('responsavel')}</p>}
                </div>
                <div>
                  <label htmlFor="ck-email" className={ROTULO}>
                    E-mail de acesso <span className="text-red-500">*</span>
                  </label>
                  <input id="ck-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" className={CAMPO} aria-invalid={Boolean(erroDe('email'))} />
                  {erroDe('email') ? (
                    <p className="mt-1 text-xs text-red-600">{erroDe('email')}</p>
                  ) : (
                    <p className="mt-1 text-xs text-neutral-500">É para ele que vai o link de criação da senha.</p>
                  )}
                </div>
                <div>
                  <label htmlFor="ck-telefone" className={ROTULO}>
                    WhatsApp
                  </label>
                  <input id="ck-telefone" type="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} autoComplete="tel-national" placeholder="(00) 00000-0000" className={CAMPO} aria-invalid={Boolean(erroDe('telefone'))} />
                  {erroDe('telefone') && <p className="mt-1 text-xs text-red-600">{erroDe('telefone')}</p>}
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-neutral-600">
                  <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 accent-neutral-900" />
                  <span>
                    Li e aceito os{' '}
                    <a href="/termos" target="_blank" rel="noopener" className="font-medium text-neutral-900 underline underline-offset-2">Termos de Uso</a>{' '}
                    e a{' '}
                    <a href="/privacidade" target="_blank" rel="noopener" className="font-medium text-neutral-900 underline underline-offset-2">Política de Privacidade</a>
                    . <span className="text-red-500">*</span>
                  </span>
                </label>

                {erro && (!erro.campo || erro.campo === 'aceite' || erro.campo === 'plano') && (
                  <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro.texto}</p>
                )}

                <button
                  type="submit"
                  disabled={enviando || !escolhido}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
                  {enviando ? 'Abrindo o pagamento…' : `Ir para o pagamento · ${escolhido ? reais(escolhido.valor_centavos) : ''}`}
                </button>
                <p className="text-center text-[11px] leading-relaxed text-neutral-500">
                  Você escolhe Pix ou cartão na página do Mercado Pago e volta para cá em seguida.
                </p>
              </form>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default function PaginaCheckout() {
  return (
    <Suspense fallback={<div className="h-dvh bg-[#f3f4f1]" />}>
      <Checkout />
    </Suspense>
  );
}
