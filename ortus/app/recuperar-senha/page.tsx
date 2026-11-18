'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { KeyRound, Loader2, MailCheck } from 'lucide-react';

/**
 * "Esqueci a senha": pede um link para criar uma senha nova.
 *
 * A resposta é a mesma exista ou não conta com o e-mail (a página não serve
 * para descobrir quem tem cadastro). O link chega por e-mail e abre
 * /acesso?tipo=senha. Também resolve a conta de quem comprou e não chegou a
 * criar a primeira senha.
 */

const BOTAO = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60';
const BOTAO_CLARO = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60';
const CAMPO = 'h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400';
const MENSAGEM_PADRAO = 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha.';

export default function RecuperarSenha() {
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'ok' | 'erro'>('parado');
  const [texto, setTexto] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (estado === 'enviando') return;
    setEstado('enviando');
    setTexto('');
    try {
      const r = await fetch('/api/public/recuperar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Só frases escritas pela rota chegam à tela; resposta fora do formato vira a frase fixa.
      const d = (await r.json().catch(() => null)) as { enviado?: boolean; mensagem?: string; error?: string } | null;
      if (r.ok && d?.enviado) {
        setEstado('ok');
        setTexto(d.mensagem || MENSAGEM_PADRAO);
      } else {
        setEstado('erro');
        setTexto(d?.error || 'Não foi possível enviar agora. Tente de novo em alguns minutos.');
      }
    } catch {
      setEstado('erro');
      setTexto('Sem conexão com o servidor. Confira a internet e tente de novo.');
    }
  }

  const enviado = estado === 'ok';

  return (
    <div className="flex h-dvh items-center justify-center overflow-y-auto bg-[#f3f4f1] px-4 py-6 font-poppins text-neutral-900">
      <main className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 md:p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
          {enviado ? <MailCheck size={22} aria-hidden /> : <KeyRound size={22} aria-hidden />}
        </span>
        {enviado ? (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">Confira o seu e-mail</h1>
            <p role="status" className="mt-2 text-sm leading-relaxed text-neutral-600">{texto}</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              O link vale por tempo limitado e só funciona uma vez. Se não chegar em alguns minutos, confira o spam ou peça outro.
            </p>
            <div className="mt-5 grid gap-2">
              <Link href="/login" className={BOTAO}>Voltar para o login</Link>
              <button type="button" onClick={() => { setEstado('parado'); setTexto(''); }} className={BOTAO_CLARO}>
                Pedir outro link
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">Esqueci a senha</h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Informe o e-mail da sua conta. Enviamos um link para você criar uma senha nova.
            </p>
            <form onSubmit={enviar} className="mt-5">
              <label htmlFor="recuperar-email" className="mb-1.5 block text-xs font-medium text-neutral-500">
                E-mail <span className="text-red-500">*</span>
              </label>
              <input
                id="recuperar-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={CAMPO}
                placeholder="seu@clinica.com"
                maxLength={254}
                required
              />
              {estado === 'erro' && texto && (
                <p role="alert" className="mt-3 text-sm text-red-600">{texto}</p>
              )}
              <div className="mt-5 grid gap-2">
                <button type="submit" disabled={estado === 'enviando'} className={BOTAO}>
                  {estado === 'enviando' && <Loader2 size={16} className="animate-spin" aria-hidden />}
                  {estado === 'enviando' ? 'Enviando…' : 'Enviar link'}
                </button>
                <Link href="/login" className={BOTAO_CLARO}>Voltar para o login</Link>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
