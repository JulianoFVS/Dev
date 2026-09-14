'use client';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { registrarAudit } from '@/lib/auditLog';
import { setAuthMarkerCookie } from '@/lib/authCookies';

const BLOB_SIZE = 300;

function LoginDvdGlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const motion = useRef({
    x: 48,
    y: 40,
    vx: 1.35,
    vy: 1.05,
  });

  useEffect(() => {
    const container = containerRef.current;
    const blob = blobRef.current;
    if (!container || !blob) return;

    let raf = 0;
    const tick = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const s = motion.current;

      s.x += s.vx;
      s.y += s.vy;

      const maxX = Math.max(0, w - BLOB_SIZE);
      const maxY = Math.max(0, h - BLOB_SIZE);

      if (s.x <= 0) {
        s.x = 0;
        s.vx = Math.abs(s.vx);
      } else if (s.x >= maxX) {
        s.x = maxX;
        s.vx = -Math.abs(s.vx);
      }
      if (s.y <= 0) {
        s.y = 0;
        s.vy = Math.abs(s.vy);
      } else if (s.y >= maxY) {
        s.y = maxY;
        s.vy = -Math.abs(s.vy);
      }

      blob.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={containerRef} className="relative h-full min-h-[220px] w-full overflow-hidden bg-neutral-950">
      <div
        ref={blobRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 will-change-transform"
        style={{
          width: BLOB_SIZE,
          height: BLOB_SIZE,
          background:
            'radial-gradient(circle at center, rgba(45, 212, 191, 0.55) 0%, rgba(20, 184, 166, 0.28) 38%, rgba(0, 0, 0, 0) 72%)',
          filter: 'blur(48px)',
        }}
      />
      <div className="relative z-10 flex h-full min-h-[inherit] items-center justify-center px-6">
        <img
          src="/landing/ortus-wordmark.svg"
          alt="Ortus"
          className="h-9 w-auto max-w-[min(280px,70vw)] brightness-0 invert sm:h-11"
        />
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

  const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400';

  return (
    <div className="flex min-h-[100dvh] w-full flex-col font-poppins lg:flex-row">
      {/* Painel escuro — mobile (topo) */}
      <div className="h-[34vh] min-h-[200px] shrink-0 lg:hidden">
        <LoginDvdGlow />
      </div>

      {/* Formulário */}
      <div className="relative z-10 flex flex-1 flex-col bg-white lg:max-w-[50%] lg:shrink-0">
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-6 py-8 sm:px-10 sm:py-12 lg:max-w-[480px] lg:px-14 lg:py-16">
          <div className="-mt-10 mb-8 rounded-t-[1.75rem] bg-white pt-8 lg:mt-0 lg:rounded-none lg:pt-0">
            <Link href="/" className="mb-8 inline-flex lg:hidden">
              <img src="/landing/ortus-wordmark.svg" alt="Ortus" className="h-7 w-auto" />
            </Link>

            <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-neutral-900 sm:text-[1.85rem]">
              Bem-vindo de volta 👋
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-500 sm:text-[15px]">
              Hoje é um novo dia. Entre com o e-mail da clínica para continuar no painel Ortus.
            </p>
          </div>

          {error ? (
            <div
              className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
              role="alert"
            >
              <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-sm font-medium text-neutral-800">
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="seu@clinica.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium text-neutral-800">
                Senha
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-11`}
                  placeholder="Pelo menos 8 caracteres"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-0.5 text-neutral-400 hover:text-neutral-700"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <div className="flex justify-end pt-0.5">
                <Link
                  href="/#contato"
                  className="text-sm font-medium text-[#2563eb] hover:underline"
                >
                  Esqueceu a senha?
                </Link>
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

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-base font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  Entrando…
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-neutral-500 sm:text-left">
            Ainda não é cliente?{' '}
            <Link href="/#precos" className="font-semibold text-neutral-900 hover:underline">
              Conheça os planos
            </Link>
          </p>

          <p className="mt-auto hidden pt-10 text-center text-xs text-neutral-400 lg:block lg:text-left">
            © {new Date().getFullYear()} Ortus · Acesso restrito a profissionais autorizados.
          </p>
        </div>
      </div>

      {/* Painel escuro — desktop */}
      <div className="hidden min-h-[100dvh] flex-1 lg:block">
        <LoginDvdGlow />
      </div>

      <p className="bg-white px-4 py-3 text-center text-[11px] text-neutral-400 lg:hidden">
        Acesso restrito a profissionais autorizados pela clínica.
      </p>
    </div>
  );
}
