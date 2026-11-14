'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Lock, Loader2, ShieldCheck, Eye, EyeOff, Check, AlertTriangle } from 'lucide-react';
import { LoginBrandPanel } from '@/app/login/page';

/**
 * Tela obrigatória de primeiro acesso.
 *
 * Acessada quando `profissionais.precisa_trocar_senha = true`. O usuário não
 * consegue navegar pelo sistema enquanto não trocar a senha temporária.
 */
export default function PrimeiroAcesso() {
    const router = useRouter();
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [nome, setNome] = useState<string>('');
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmar, setConfirmar] = useState('');
    const [mostrar, setMostrar] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [aceitouTermos, setAceitouTermos] = useState(false);

    useEffect(() => {
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.replace('/login');
                return;
            }
            const { data: prof } = await supabase
                .from('profissionais')
                .select('nome, precisa_trocar_senha')
                .eq('user_id', session.user.id)
                .single();

            // Se a flag for false, manda para o fluxo normal.
            if (!prof?.precisa_trocar_senha) {
                router.replace('/dashboard');
                return;
            }
            setNome(prof?.nome || '');
            setCarregando(false);
        })();
    }, [router]);

    function validarSenha(s: string): string | null {
        if (s.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
        if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'Use letras e números na nova senha.';
        return null;
    }

    async function salvar(e: FormEvent) {
        e.preventDefault();
        setErro(null);
        const errSenha = validarSenha(novaSenha);
        if (errSenha) { setErro(errSenha); return; }
        if (novaSenha !== confirmar) { setErro('As senhas não coincidem.'); return; }
        if (!aceitouTermos) { setErro('Você precisa aceitar os termos para acessar o sistema.'); return; }

        setSalvando(true);
        try {
            const { error: upErr } = await supabase.auth.updateUser({ password: novaSenha });
            if (upErr) throw upErr;

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error: flagErr } = await supabase
                    .from('profissionais')
                    .update({ precisa_trocar_senha: false })
                    .eq('user_id', user.id);
                if (flagErr) console.warn('Falha ao limpar flag:', flagErr);
            }

            // Decide destino: se 1 clínica → dashboard; se múltiplas → seleção.
            const { data: { user: u2 } } = await supabase.auth.getUser();
            let destino = '/selecao';
            if (u2) {
                const { data: prof } = await supabase
                    .from('profissionais').select('id').eq('user_id', u2.id).single();
                if (prof?.id) {
                    const { data: vinculos } = await supabase
                        .from('profissionais_clinicas').select('clinica_id').eq('profissional_id', prof.id);
                    if (vinculos?.length === 1) {
                        localStorage.setItem('ortus_clinica_id', String(vinculos[0].clinica_id));
                        destino = '/dashboard';
                    }
                }
            }
            router.replace(destino);
        } catch (err: any) {
            setErro(err?.message || 'Não foi possível alterar a senha.');
            setSalvando(false);
        }
    }

    const inputBase =
        'w-full rounded-xl border border-neutral-200 bg-white py-3.5 pl-12 text-[15px] font-medium text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

    if (carregando) {
        return (
            <div className="flex min-h-[100dvh] items-center justify-center bg-white text-neutral-400">
                <Loader2 size={28} className="animate-spin" aria-label="Carregando" />
            </div>
        );
    }

    const primeiroNome = nome ? nome.split(' ')[0] : '';

    return (
        <div className="flex min-h-[100dvh] w-full flex-col font-poppins lg:flex-row">
            {/* Faixa de marca no celular */}
            <div className="h-[22svh] max-h-[9.5rem] min-h-[5.5rem] shrink-0 bg-white pt-2 lg:hidden">
                <LoginBrandPanel className="h-full !p-0 px-3 pb-0 sm:px-4" />
            </div>

            {/* Formulário */}
            <div className="relative z-10 flex flex-1 flex-col bg-white lg:max-w-[50%] lg:shrink-0">
                <Link
                    href="/login"
                    className="absolute left-4 top-4 z-20 inline-flex items-center gap-1 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-800 sm:left-6 sm:top-6 lg:left-8 lg:top-8"
                >
                    <ArrowLeft size={14} aria-hidden />
                    Voltar
                </Link>

                <div className="flex flex-1 flex-col items-center justify-start px-5 py-4 sm:justify-center sm:px-10 sm:py-14">
                    <div className="w-full max-w-[420px]">
                        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
                            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#c8f053] text-neutral-900">
                                <ShieldCheck size={26} strokeWidth={1.9} />
                            </span>
                            <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-neutral-900 sm:text-[1.65rem]">
                                Defina sua nova senha
                            </h1>
                            <p className="mx-auto mt-2 max-w-[330px] text-[13px] leading-relaxed text-neutral-500">
                                {primeiroNome ? <>Olá, <span className="font-semibold text-neutral-800">{primeiroNome}</span>! </> : null}
                                Por segurança, troque a senha temporária antes de continuar.
                            </p>
                        </div>

                        {erro && (
                            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                <span>{erro}</span>
                            </div>
                        )}

                        <form onSubmit={salvar} className="space-y-4">
                            <div>
                                <label htmlFor="nova-senha" className="mb-1.5 block text-sm font-medium text-neutral-800">
                                    Nova senha
                                </label>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                                    <input
                                        id="nova-senha"
                                        type={mostrar ? 'text' : 'password'}
                                        value={novaSenha}
                                        onChange={(e) => setNovaSenha(e.target.value)}
                                        className={`${inputBase} pr-12`}
                                        placeholder="Mínimo 8 caracteres com letras e números"
                                        autoComplete="new-password"
                                        required
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setMostrar(!mostrar)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-400 hover:text-neutral-700"
                                        tabIndex={-1}
                                        aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
                                    >
                                        {mostrar ? <EyeOff size={19} /> : <Eye size={19} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="confirmar-senha" className="mb-1.5 block text-sm font-medium text-neutral-800">
                                    Confirmar senha
                                </label>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                                    <input
                                        id="confirmar-senha"
                                        type={mostrar ? 'text' : 'password'}
                                        value={confirmar}
                                        onChange={(e) => setConfirmar(e.target.value)}
                                        className={`${inputBase} pr-4`}
                                        placeholder="Repita a nova senha"
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                            </div>

                            <label className="flex cursor-pointer items-start gap-3 pt-1">
                                <input
                                    type="checkbox"
                                    checked={aceitouTermos}
                                    onChange={(e) => setAceitouTermos(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 accent-neutral-900"
                                />
                                <span className="text-xs leading-relaxed text-neutral-500">
                                    Eu li e concordo com os{' '}
                                    <a href="/termos" target="_blank" rel="noreferrer" className="font-semibold text-neutral-900 hover:underline">Termos de Uso</a>{' '}e a{' '}
                                    <a href="/privacidade" target="_blank" rel="noreferrer" className="font-semibold text-neutral-900 hover:underline">Política de Privacidade</a>.
                                </span>
                            </label>

                            <button
                                type="submit"
                                disabled={salvando}
                                className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[15px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
                            >
                                {salvando ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                                {salvando ? 'Salvando…' : 'Salvar nova senha'}
                            </button>
                        </form>

                        <p className="mt-6 text-center text-[11px] leading-relaxed text-neutral-400">
                            Você não conseguirá acessar o sistema enquanto não definir uma senha pessoal.
                        </p>
                    </div>
                </div>
            </div>

            {/* Painel de marca no desktop */}
            <div className="hidden min-h-[100dvh] flex-1 bg-white lg:flex lg:flex-col">
                <LoginBrandPanel className="flex-1" />
            </div>
        </div>
    );
}
