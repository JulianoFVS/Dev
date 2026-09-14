'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, ShieldCheck, ArrowLeft, Eye, EyeOff, Calendar, Users, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { registrarAudit } from '@/lib/auditLog';
import { setAuthMarkerCookie } from '@/lib/authCookies';
import { bentoInput, bentoPrimaryBtn, bentoGhostBtn } from '@/lib/bentoUi';

function LoginShowcase() {
  return (
    <div className="relative flex h-full min-h-[280px] flex-col justify-between overflow-hidden p-8 text-white lg:min-h-0 lg:p-10">
      <div className="pointer-events-none absolute -right-16 top-8 h-48 w-48 rounded-full bg-[#c8f053]/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-12 left-0 h-40 w-40 rounded-full bg-white/5 blur-2xl" aria-hidden />

      <div className="relative">
        <img src="/landing/ortus-mark.svg" alt="" className="mb-6 h-10 w-10 brightness-0 invert" />
        <p className="max-w-sm text-2xl font-semibold leading-snug tracking-tight text-white lg:text-[1.65rem]">
          Gestão clínica clara, do agendamento ao financeiro.
        </p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
          Um só lugar para equipe, pacientes e indicadores — no ritmo do seu consultório.
        </p>
      </div>

      <div className="relative mt-8 space-y-2.5 lg:mt-0">
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-white/45">
            <span>Hoje</span>
            <span className="text-[#c8f053]">Ao vivo</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Calendar, label: 'Consultas', val: '12' },
              { icon: Users, label: 'Pacientes', val: '248' },
              { icon: BarChart3, label: 'Receita', val: 'R$ 18k' },
            ].map(({ icon: Icon, label, val }) => (
              <div key={label} className="rounded-xl bg-white/10 px-2 py-2.5 text-center">
                <Icon size={14} className="mx-auto mb-1 text-white/70" strokeWidth={1.75} />
                <p className="text-xs font-semibold tabular-nums">{val}</p>
                <p className="text-[9px] text-white/45">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-white/35">Ilustração do painel — dados fictícios.</p>
      </div>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('ortus_login_email');
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      /* ignore */
    }
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
      if (remember) {
        try {
          localStorage.setItem('ortus_login_email', email.trim());
        } catch {
          /* ignore */
        }
      } else {
        try {
          localStorage.removeItem('ortus_login_email');
        } catch {
          /* ignore */
        }
      }

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
      setError('Acesso negado. Verifique e-mail e senha.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#dfe5df] px-3 py-4 font-poppins sm:px-4 sm:py-6">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 pb-2 pt-1 sm:px-2">
        <Link
          href="/"
          className={`${bentoGhostBtn} !bg-white/80 !py-2 text-sm`}
        >
          <ArrowLeft size={16} aria-hidden />
          Voltar ao site
        </Link>
      </div>

      <div className="mx-auto flex max-w-6xl min-h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-[1.75rem] border border-black/[0.06] bg-[#f3f4f1] shadow-[0_24px_80px_-32px_rgba(0,0,0,0.25)] sm:rounded-[2rem] lg:min-h-[min(640px,calc(100vh-6rem))] lg:flex-row">
        {/* Formulário */}
        <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:max-w-[52%] lg:px-12 lg:py-12">
          <Link href="/" className="mb-8 inline-flex w-fit items-center gap-2 lg:mb-10">
            <img src="/landing/ortus-wordmark.svg" alt="Ortus" className="h-7 w-auto sm:h-8" />
          </Link>

          <div className="mb-8 max-w-md">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[1.75rem]">
              Bem-vindo de volta
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500 sm:text-base">
              Entre com o e-mail da clínica para continuar no painel Ortus.
            </p>
          </div>

          {error ? (
            <div
              className="mb-6 flex max-w-md items-start gap-2 rounded-[1.15rem] border border-red-200/80 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
              role="alert"
            >
              <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={handleLogin} className="max-w-md space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-medium text-neutral-700">
                E-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-neutral-400" aria-hidden />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${bentoInput} pl-10`}
                  placeholder="seu@clinica.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="login-password" className="text-xs font-medium text-neutral-700">
                  Senha
                </label>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-neutral-400" aria-hidden />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${bentoInput} pl-10 pr-11`}
                  placeholder="Sua senha"
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

            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400"
              />
              Lembrar meu e-mail neste dispositivo
            </label>

            <button type="submit" disabled={loading} className={`${bentoPrimaryBtn} w-full py-3.5 text-base`}>
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

          <p className="mt-8 max-w-md text-sm text-neutral-500">
            Ainda não é cliente?{' '}
            <Link href="/#precos" className="font-semibold text-neutral-900 underline-offset-2 hover:underline">
              Conheça os planos
            </Link>
          </p>
        </div>

        {/* Painel visual — desktop */}
        <div className="hidden min-h-[320px] flex-1 flex-col bg-neutral-950 lg:flex lg:max-w-[48%] lg:rounded-l-none lg:rounded-r-[2rem]">
          <LoginShowcase />
        </div>

        {/* Faixa resumida — mobile */}
        <div className="border-t border-black/5 bg-neutral-950 px-6 py-8 lg:hidden">
          <LoginShowcase />
        </div>
      </div>

      <p className="mx-auto mt-4 max-w-6xl px-2 text-center text-[11px] text-neutral-500">
        Acesso restrito a profissionais autorizados pela clínica.
      </p>
    </div>
  );
}
