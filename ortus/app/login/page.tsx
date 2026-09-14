'use client';
import { useState, useEffect, useRef, type CSSProperties, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { registrarAudit } from '@/lib/auditLog';
import { setAuthMarkerCookie } from '@/lib/authCookies';

type BlobMotion = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  squashX: number;
  squashY: number;
};

const BLOB_DIAM = 380;
const BLOB_R = BLOB_DIAM / 2;
const WALL_PAD = 28;
const MAX_SPEED = 1.85;
const DAMPING = 0.992;
const WALL_SOFT = 0.045;

function LoginFluidGlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const blobARef = useRef<HTMLDivElement>(null);
  const blobBRef = useRef<HTMLDivElement>(null);
  const state = useRef<{ a: BlobMotion; b: BlobMotion; t: number }>({
    a: { x: 0, y: 0, vx: 0.65, vy: 0.48, phase: 0, squashX: 1, squashY: 1 },
    b: { x: 0, y: 0, vx: -0.42, vy: 0.55, phase: 1.7, squashX: 1, squashY: 1 },
    t: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    const elA = blobARef.current;
    const elB = blobBRef.current;
    if (!container || !elA || !elB) return;

    const init = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      state.current.a.x = w * 0.35 - BLOB_R;
      state.current.a.y = h * 0.4 - BLOB_R;
      state.current.b.x = w * 0.62 - BLOB_R;
      state.current.b.y = h * 0.55 - BLOB_R;
    };
    init();

    const stepBlob = (s: BlobMotion, w: number, h: number) => {
      s.x += s.vx;
      s.y += s.vy;

      const cx = s.x + BLOB_R;
      const cy = s.y + BLOB_R;
      const minC = WALL_PAD + BLOB_R * 0.55;
      const maxCx = w - WALL_PAD - BLOB_R * 0.55;
      const maxCy = h - WALL_PAD - BLOB_R * 0.55;

      let hitX = 0;
      let hitY = 0;

      if (cx < minC) {
        const d = minC - cx;
        s.vx += d * WALL_SOFT;
        hitX = 1;
      } else if (cx > maxCx) {
        const d = cx - maxCx;
        s.vx -= d * WALL_SOFT;
        hitX = -1;
      }
      if (cy < minC) {
        const d = minC - cy;
        s.vy += d * WALL_SOFT;
        hitY = 1;
      } else if (cy > maxCy) {
        const d = cy - maxCy;
        s.vy -= d * WALL_SOFT;
        hitY = -1;
      }

      if (hitX !== 0) {
        s.vx *= -0.68;
        s.squashX = Math.min(s.squashX, 0.82);
        s.squashY = Math.max(s.squashY, 1.12);
      }
      if (hitY !== 0) {
        s.vy *= -0.68;
        s.squashY = Math.min(s.squashY, 0.82);
        s.squashX = Math.max(s.squashX, 1.12);
      }

      s.squashX += (1 - s.squashX) * 0.06;
      s.squashY += (1 - s.squashY) * 0.06;

      s.vx += (Math.random() - 0.5) * 0.018;
      s.vy += (Math.random() - 0.5) * 0.018;
      s.vx *= DAMPING;
      s.vy *= DAMPING;

      const speed = Math.hypot(s.vx, s.vy);
      if (speed > MAX_SPEED) {
        s.vx = (s.vx / speed) * MAX_SPEED;
        s.vy = (s.vy / speed) * MAX_SPEED;
      } else if (speed < 0.35) {
        const angle = Math.random() * Math.PI * 2;
        s.vx += Math.cos(angle) * 0.25;
        s.vy += Math.sin(angle) * 0.25;
      }

      s.phase += 0.012;
    };

    const applyTransform = (el: HTMLDivElement, s: BlobMotion, wobble: number) => {
      const morph = 1 + Math.sin(s.phase) * 0.08;
      el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) scale(${s.squashX * morph}, ${s.squashY * (2 - morph) * 0.5 + 0.5})`;
      el.style.opacity = String(0.55 + wobble * 0.15);
    };

    let raf = 0;
    const tick = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 1 || h < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }

      state.current.t += 0.016;
      const { a, b } = state.current;
      stepBlob(a, w, h);
      stepBlob(b, w, h);

      applyTransform(elA, a, 0);
      applyTransform(elB, b, 1);

      raf = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(() => init());
    ro.observe(container);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const blobStyle = (gradient: string): CSSProperties => ({
    width: BLOB_DIAM,
    height: BLOB_DIAM,
    background: gradient,
    filter: 'blur(56px)',
  });

  return (
    <div ref={containerRef} className="relative h-full min-h-[inherit] w-full overflow-hidden bg-neutral-950">
      <div
        ref={blobARef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 will-change-transform"
        style={blobStyle(
          'radial-gradient(circle at 42% 38%, rgba(52, 211, 193, 0.7) 0%, rgba(20, 184, 166, 0.35) 42%, rgba(0, 0, 0, 0) 74%)',
        )}
      />
      <div
        ref={blobBRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 will-change-transform"
        style={blobStyle(
          'radial-gradient(circle at 58% 62%, rgba(56, 189, 248, 0.35) 0%, rgba(45, 212, 191, 0.22) 45%, rgba(0, 0, 0, 0) 76%)',
        )}
      />
      <div className="relative z-10 flex h-full min-h-[inherit] items-center justify-center px-8">
        <img
          src="/landing/ortus-wordmark.svg"
          alt="Ortus"
          className="h-12 w-auto max-w-[min(360px,78vw)] brightness-0 invert drop-shadow-[0_0_40px_rgba(255,255,255,0.12)] sm:h-14 lg:h-[4.25rem] xl:h-[4.75rem]"
        />
      </div>
    </div>
  );
}

function LoginBrandPanel({ className = '' }: { className?: string }) {
  return (
    <div className={`flex min-h-[inherit] flex-col p-3 sm:p-4 md:p-5 lg:p-6 ${className}`}>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[1.35rem] bg-neutral-950 sm:rounded-[1.65rem] md:rounded-[1.85rem] lg:rounded-[2rem]">
        <LoginFluidGlow />
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
      <div className="h-[36vh] min-h-[210px] shrink-0 bg-white pt-3 sm:pt-4 lg:hidden">
        <LoginBrandPanel className="h-full !p-0 px-3 pb-0 sm:px-4" />
      </div>

      {/* Formulário */}
      <div className="relative z-10 flex flex-1 flex-col bg-white lg:max-w-[50%] lg:shrink-0">
        <Link
          href="/"
          className="absolute left-4 top-4 z-20 inline-flex items-center gap-1 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-800 sm:left-6 sm:top-6 lg:left-8 lg:top-8"
        >
          <ArrowLeft size={14} aria-hidden />
          Voltar
        </Link>

        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10 sm:py-14">
          <div className="-mt-6 w-full max-w-[400px] rounded-t-[1.75rem] bg-white pt-6 lg:mt-0 lg:rounded-none lg:pt-0">
            <Link href="/" className="mb-6 flex justify-center">
              <img
                src="/landing/ortus-wordmark.svg"
                alt="Ortus"
                className="h-6 w-auto brightness-0 sm:h-[1.65rem]"
              />
            </Link>

            <div className="mb-8 text-center">
              <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-neutral-900 sm:text-[1.65rem]">
                Bem-vindo de volta
              </h1>
              <p className="mx-auto mt-2 max-w-[320px] text-xs leading-relaxed text-neutral-500 sm:text-[13px]">
                Entre com o e-mail da clínica para continuar no painel Ortus.
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

          <form onSubmit={handleLogin} className="space-y-5 text-left">
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

          <p className="mt-8 text-center text-sm text-neutral-500">
            Ainda não é cliente?{' '}
            <Link href="/#precos" className="font-semibold text-neutral-900 hover:underline">
              Conheça os planos
            </Link>
          </p>

          <p className="mt-6 hidden text-center text-[11px] text-neutral-400 lg:block">
            © {new Date().getFullYear()} Ortus · Acesso restrito a profissionais autorizados.
          </p>
          </div>
        </div>
      </div>

      {/* Painel escuro — desktop (com respiro nas bordas) */}
      <div className="hidden min-h-[100dvh] flex-1 bg-white lg:flex lg:flex-col">
        <LoginBrandPanel className="flex-1" />
      </div>

      <p className="bg-white px-4 py-3 text-center text-[11px] text-neutral-400 lg:hidden">
        Acesso restrito a profissionais autorizados pela clínica.
      </p>
    </div>
  );
}
