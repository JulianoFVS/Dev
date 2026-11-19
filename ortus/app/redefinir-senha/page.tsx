'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { gravarVerificadorSenha } from '@/lib/local/cliente';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { fraseDoErroDeSenha, sessaoDaSenhaPerdida, validarSenhaNova, type ErroDeSenha } from '@/lib/senhaNova';

/**
 * Senha nova pedida em "Esqueci a senha". Chega aqui pelo /acesso?tipo=senha,
 * que já abriu a sessão com o link do e-mail; quem ainda precisa criar a
 * primeira senha vai para /primeiro-acesso.
 *
 * Mesma regra de senha do primeiro acesso. A tela abre na hora e a sessão é
 * conferida em seguida: sem sessão, o link não vale mais.
 */

const BOTAO = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60';
const BOTAO_CLARO = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60';
const ROTULO = 'mb-1.5 block text-xs font-medium text-neutral-500';
const CAMPO = 'h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400';

export default function RedefinirSenha() {
  const { showAlert } = useCustomAlert();
  const [semSessao, setSemSessao] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (vivo && !data.session) setSemSessao(true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setErro(null);
    const errSenha = validarSenhaNova(novaSenha);
    if (errSenha) { setErro(errSenha); return; }
    if (novaSenha !== confirmar) { setErro('As senhas não coincidem.'); return; }

    setSalvando(true);
    const { error } = await supabase.auth
      .updateUser({ password: novaSenha })
      .catch(() => ({ error: { name: 'AuthUnknownError' } as ErroDeSenha }));
    if (error) {
      if (sessaoDaSenhaPerdida(error)) setSemSessao(true);
      else setErro(fraseDoErroDeSenha(error));
      setSalvando(false);
      return;
    }
    // Só no app do computador (senha para entrar sem internet); no site não faz nada.
    await gravarVerificadorSenha(novaSenha).catch(() => undefined);
    await showAlert('A partir de agora, entre com a senha nova.', { type: 'success', title: 'Senha alterada' });
    window.location.replace('/dashboard');
  }

  return (
    <div className="flex h-dvh items-center justify-center overflow-y-auto bg-[#f3f4f1] px-4 py-6 font-poppins text-neutral-900">
      <main className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 md:p-6">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${semSessao ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-700'}`}>
          {semSessao ? <AlertTriangle size={22} aria-hidden /> : <KeyRound size={22} aria-hidden />}
        </span>
        {semSessao ? (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">Este link não vale mais</h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              O link para criar uma nova senha expira e só funciona uma vez. Peça outro: ele vai para o e-mail da sua conta.
            </p>
            <div className="mt-5 grid gap-2">
              <Link href="/recuperar-senha" className={BOTAO}>Pedir outro link</Link>
              <Link href="/login" className={BOTAO_CLARO}>Voltar para o login</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">Criar uma nova senha</h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Use pelo menos 8 caracteres, com letras e números. A senha antiga deixa de valer.
            </p>

            {erro && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span>{erro}</span>
              </div>
            )}

            <form onSubmit={salvar} className="mt-5 space-y-4">
              <div>
                <label htmlFor="nova-senha" className={ROTULO}>
                  Nova senha <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="nova-senha"
                    type={mostrar ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    className={`${CAMPO} pr-11`}
                    placeholder="Mínimo 8 caracteres com letras e números"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setMostrar((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-neutral-400 hover:text-neutral-700"
                    tabIndex={-1}
                    aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmar-senha" className={ROTULO}>
                  Confirmar senha <span className="text-red-500">*</span>
                </label>
                <input
                  id="confirmar-senha"
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  className={CAMPO}
                  placeholder="Repita a nova senha"
                  required
                />
              </div>

              <button type="submit" disabled={salvando} className={BOTAO}>
                {salvando ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
                {salvando ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
