'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { dados as tabelas } from '@/lib/local/consulta';
import { gravarVerificadorSenha } from '@/lib/local/cliente';
import { fraseDoErroDeSenha, sessaoDaSenhaPerdida, validarSenhaNova, type ErroDeSenha } from '@/lib/senhaNova';
import { patchProfileSession } from '@/lib/profileSession';

/**
 * Tela obrigatória de primeiro acesso.
 *
 * Acessada quando `profissionais.precisa_trocar_senha = true` (funcionário com
 * senha temporária ou quem acabou de assinar e chegou pelo link do e-mail).
 * Ninguém navega pelo sistema antes de escolher a própria senha e aceitar os
 * termos. A tela abre na hora; a sessão e o perfil são conferidos em seguida.
 */

const BOTAO = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60';
const ROTULO = 'mb-1.5 block text-xs font-medium text-neutral-500';
const CAMPO = 'h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400';

export default function PrimeiroAcesso() {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aceitouTermos, setAceitouTermos] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivo) return;
      if (!session) {
        router.replace('/login');
        return;
      }
      const { data: prof } = await tabelas.from('profissionais')
        .select('nome, precisa_trocar_senha')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!vivo) return;
      // Senha já escolhida: segue o fluxo normal.
      if (prof && !prof.precisa_trocar_senha) {
        router.replace('/dashboard');
        return;
      }
      setNome(prof?.nome || '');
    })();
    return () => {
      vivo = false;
    };
  }, [router]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setErro(null);
    const errSenha = validarSenhaNova(novaSenha);
    if (errSenha) { setErro(errSenha); return; }
    if (novaSenha !== confirmar) { setErro('As senhas não coincidem.'); return; }
    if (!aceitouTermos) { setErro('Para entrar, aceite os Termos de Uso e a Política de Privacidade.'); return; }

    setSalvando(true);
    try {
      const { error: upErr } = await supabase.auth
        .updateUser({ password: novaSenha })
        .catch(() => ({ error: { name: 'AuthUnknownError' } as ErroDeSenha }));
      // "same_password" numa segunda tentativa: a senha já ficou gravada na primeira e o que
      // faltou foi concluir o primeiro acesso. Segue para isso.
      if (upErr && (upErr as ErroDeSenha)?.code !== 'same_password') {
        if (sessaoDaSenhaPerdida(upErr as ErroDeSenha)) {
          setErro('Sua sessão terminou. Abra de novo o link do e-mail ou entre com a senha temporária.');
        } else {
          setErro(fraseDoErroDeSenha(upErr as ErroDeSenha));
        }
        setSalvando(false);
        return;
      }
      await gravarVerificadorSenha(novaSenha).catch(() => undefined);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErro('Sua sessão terminou. Abra de novo o link do e-mail ou entre com a senha temporária.');
        setSalvando(false);
        return;
      }
      const { data: alteradas, error: flagErr } = await tabelas.from('profissionais')
        .update({ precisa_trocar_senha: false })
        .eq('user_id', user.id)
        .select('id');
      if (flagErr || !alteradas?.length) {
        // Sem isso a casca traria a pessoa de volta para cá: avisa e deixa tentar de novo.
        setErro('A senha foi salva, mas não deu para concluir o primeiro acesso. Toque em Salvar de novo.');
        setSalvando(false);
        return;
      }
      // A casca ainda tem o perfil antigo (precisa trocar senha) e não busca de novo.
      // Sem este aviso ela manda a pessoa de volta para cá, e esta tela manda para o painel: um loop.
      patchProfileSession({ precisa_trocar_senha: false });

      // Uma clínica: direto para o painel. Várias: escolher a unidade.
      let destino = '/selecao';
      const { data: prof } = await tabelas.from('profissionais').select('id').eq('user_id', user.id).maybeSingle();
      if (prof?.id) {
        const { data: vinculos } = await tabelas.from('profissionais_clinicas').select('clinica_id').eq('profissional_id', prof.id);
        if (vinculos?.length === 1) {
          localStorage.setItem('ortus_clinica_id', String(vinculos[0].clinica_id));
          destino = '/dashboard';
        }
      }
      router.replace(destino);
    } catch {
      setErro('Não foi possível concluir agora. Confira a internet e tente de novo.');
      setSalvando(false);
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center overflow-y-auto bg-[#f3f4f1] px-4 py-6 font-poppins text-neutral-900">
      <main className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 md:p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
          <ShieldCheck size={22} aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">Defina sua nova senha</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          {nome ? <>Olá, <span className="font-medium text-neutral-900">{nome.split(' ')[0]}</span>! </> : null}
          Escolha a senha que você vai usar para entrar. Use pelo menos 8 caracteres, com letras e números.
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

          <label className="flex min-h-10 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={aceitouTermos}
              onChange={(e) => setAceitouTermos(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 accent-neutral-900 focus:ring-neutral-400"
            />
            <span className="text-sm leading-relaxed text-neutral-600">
              Eu li e concordo com os{' '}
              <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-medium text-neutral-900 underline underline-offset-2">Termos de Uso</a>{' '}e a{' '}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-medium text-neutral-900 underline underline-offset-2">Política de Privacidade</a>.
            </span>
          </label>

          <button type="submit" disabled={salvando} className={BOTAO}>
            {salvando ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
            {salvando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>

        <p className="mt-5 text-xs leading-relaxed text-neutral-500">
          Enquanto a senha não for definida, o sistema não abre.
        </p>
      </main>
    </div>
  );
}
