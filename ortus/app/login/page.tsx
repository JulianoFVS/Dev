'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, ShieldCheck, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { registrarAudit } from '@/lib/auditLog';
import { setAuthMarkerCookie } from '@/lib/authCookies';
import { bentoCard, bentoInput, bentoPrimaryBtn } from '@/lib/bentoUi';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const authError = params.get('error_description') || params.get('error');
    if (authError) {
      setError(
        decodeURIComponent(authError.replace(/\+/g, ' ')) === 'Email link is invalid or has expired'
          ? 'Link de e-mail expirado ou inválido. Use e-mail e senha abaixo — não clique em links antigos do Supabase.'
          : decodeURIComponent(authError.replace(/\+/g, ' ')),
      );
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const userId = signIn.user?.id;
      let count = 0;
      let unicaClinicaId: string | null = null;
      let precisaTrocarSenha = false;

      if (userId) {
        const { data: prof } = await supabase
          .from('profissionais')
          .select('id, precisa_trocar_senha')
          .eq('user_id', userId)
          .single();

        precisaTrocarSenha = !!prof?.precisa_trocar_senha;

        if (prof?.id) {
          const { data: vinculos } = await supabase
            .from('profissionais_clinicas')
            .select('clinica_id')
            .eq('profissional_id', prof.id);

          count = vinculos?.length || 0;
          if (count === 1) unicaClinicaId = String(vinculos![0].clinica_id);
        }
      }

      registrarAudit({ acao: 'login', entidade: 'profissional', entidade_id: userId || undefined });
      setAuthMarkerCookie();

      if (precisaTrocarSenha) {
        router.push('/primeiro-acesso');
        router.refresh();
        return;
      }

      if (count === 1 && unicaClinicaId) {
        localStorage.setItem('ortus_clinica_id', unicaClinicaId);
        router.push('/dashboard');
      } else {
        router.push('/selecao');
      }
      router.refresh();
    } catch {
      setError('Acesso negado. Verifique seus dados.');
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f3f4f1] px-4 py-10 font-poppins">
      <Link
        href="/"
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 sm:left-6 sm:top-6"
      >
        <ArrowLeft size={18} aria-hidden />
        Voltar para o site
      </Link>

      <div
        className={`${bentoCard} relative z-10 w-full max-w-md border border-black/10 p-6 shadow-sm sm:p-8 md:p-10`}
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="mb-4 flex items-center justify-center transition-opacity hover:opacity-90">
            <img
              src="/landing/ortus-wordmark.svg"
              alt="Ortus"
              className="h-8 w-auto md:h-9"
            />
          </Link>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Acesso restrito</p>
        </div>

        {error ? (
          <div
            className="mb-6 flex items-start gap-2 rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            role="alert"
          >
            <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="ml-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              E-mail
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-neutral-400" aria-hidden />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${bentoInput} pl-10`}
                placeholder="seu@email.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="ml-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              Senha
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-neutral-400" aria-hidden />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${bentoInput} pl-10 pr-11`}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-0.5 text-neutral-400 transition-colors hover:text-neutral-800"
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`${bentoPrimaryBtn} mt-2 w-full py-3.5 text-base`}
          >
            {loading ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Entrando…
              </>
            ) : (
              'Entrar no sistema'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Ainda não tem conta?{' '}
          <Link href="/#precos" className="font-semibold text-neutral-900 underline-offset-2 hover:underline">
            Assinar agora
          </Link>
        </p>
      </div>
    </div>
  );
}
