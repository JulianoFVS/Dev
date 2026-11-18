'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2, MailCheck } from 'lucide-react';
import { setAuthMarkerCookie } from '@/lib/authCookies';
import { supabase } from '@/lib/supabase';
import { limparRastrosDaSessao } from '@/lib/sessao';

/**
 * Chegada do link enviado por e-mail: o de quem acabou de assinar (?pedido=)
 * e o de "Esqueci a senha" (?tipo=senha, app/api/public/recuperar-senha).
 *
 * O link só é gasto quando a pessoa aperta "Continuar": programa de e-mail
 * que abre links para inspecionar não queima o acesso. Confirmado, a pessoa
 * já entra com sessão e vai para a tela que pede a senha: a de primeiro
 * acesso ou, no "Esqueci a senha" de quem já tinha senha, a de senha nova.
 */

const BOTAO = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60';
const BOTAO_CLARO = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60';

function Acesso() {
  const busca = useSearchParams();
  const token = busca.get('token') || '';
  const pedido = busca.get('pedido') || '';
  const senha = busca.get('tipo') === 'senha';
  const [estado, setEstado] = useState<'pronto' | 'confirmando' | 'expirado'>('pronto');
  const [reenvio, setReenvio] = useState<{ estado: 'parado' | 'enviando' | 'ok' | 'erro'; texto?: string; jaAcessou?: boolean }>({ estado: 'parado' });

  async function continuar() {
    if (!token) {
      setEstado('expirado');
      return;
    }
    setEstado('confirmando');
    // O link vale para a conta da compra, não para quem já estiver logado neste navegador (computador
    // compartilhado): a sessão aberta sai só daqui (escopo local) e os caches dela vão junto.
    const { data: atual } = await supabase.auth.getSession();
    if (atual.session) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      limparRastrosDaSessao();
    }
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' });
    if (error || !data.session) {
      setEstado('expirado');
      return;
    }
    setAuthMarkerCookie();
    if (senha) {
      // Quem ainda não criou a primeira senha (ex.: comprou e não chegou a criar) segue pelo primeiro
      // acesso, que também pede o aceite dos termos. Na dúvida (perfil não lido), a tela de senha nova.
      const { data: perfil } = await supabase
        .from('profissionais')
        .select('precisa_trocar_senha')
        .eq('user_id', data.session.user.id)
        .maybeSingle();
      window.location.replace(perfil?.precisa_trocar_senha === true ? '/primeiro-acesso' : '/redefinir-senha');
      return;
    }
    window.location.replace('/primeiro-acesso');
  }

  async function pedirOutro() {
    setReenvio({ estado: 'enviando' });
    try {
      const r = await fetch('/api/public/assinatura/reenviar-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido }),
      });
      const d = (await r.json().catch(() => null)) as { enviado?: boolean; email?: string; error?: string; ja_acessou?: boolean } | null;
      if (r.ok && d?.enviado) setReenvio({ estado: 'ok', texto: `Novo link enviado para ${d.email}. Abra o e-mail mais recente.` });
      else setReenvio({ estado: 'erro', texto: d?.error || 'Não foi possível enviar agora.', jaAcessou: d?.ja_acessou === true });
    } catch {
      setReenvio({ estado: 'erro', texto: 'Sem conexão com o servidor.' });
    }
  }

  const expirado = estado === 'expirado' || !token;

  return (
    <div className="flex h-dvh items-center justify-center overflow-y-auto bg-[#f3f4f1] px-4 py-6 font-poppins text-neutral-900">
      <main className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 md:p-6">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${expirado ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-700'}`}>
          {expirado ? <AlertTriangle size={22} aria-hidden /> : <MailCheck size={22} aria-hidden />}
        </span>
        {expirado ? (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">Este link não vale mais</h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              {senha
                ? 'O link para criar uma nova senha expira e só funciona uma vez. Peça outro: ele vai para o e-mail da sua conta.'
                : 'O link de acesso expira e só funciona uma vez. Peça outro: ele vai para o mesmo e-mail da assinatura.'}
            </p>
            {reenvio.texto && (
              <p role="status" className={`mt-3 text-sm ${reenvio.estado === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{reenvio.texto}</p>
            )}
            <div className="mt-5 grid gap-2">
              {senha ? (
                <Link href="/recuperar-senha" className={BOTAO}>Pedir outro link</Link>
              ) : (
                pedido && !reenvio.jaAcessou && reenvio.estado !== 'ok' && (
                  <button type="button" onClick={pedirOutro} disabled={reenvio.estado === 'enviando'} className={BOTAO}>
                    {reenvio.estado === 'enviando' && <Loader2 size={16} className="animate-spin" aria-hidden />}
                    Enviar novo link
                  </button>
                )
              )}
              <Link href="/login" className={BOTAO_CLARO}>{senha ? 'Voltar para o login' : 'Já tenho senha: entrar'}</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
              {senha ? 'Criar uma nova senha' : 'Confirmar e-mail e criar a senha'}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              {senha
                ? 'Continue para confirmar que este e-mail é seu e escolher a senha nova.'
                : 'Seu pagamento foi confirmado e a clínica já está criada. Continue para confirmar este e-mail e escolher a senha de acesso.'}
            </p>
            <div className="mt-5">
              <button type="button" onClick={continuar} disabled={estado === 'confirmando'} className={BOTAO}>
                {estado === 'confirmando' && <Loader2 size={16} className="animate-spin" aria-hidden />}
                {estado === 'confirmando' ? 'Confirmando…' : 'Continuar'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function PaginaAcesso() {
  return (
    <Suspense fallback={<div className="h-dvh bg-[#f3f4f1]" />}>
      <Acesso />
    </Suspense>
  );
}
