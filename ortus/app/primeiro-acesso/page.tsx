'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Loader2, ShieldCheck, Eye, EyeOff, Check, AlertTriangle } from 'lucide-react';

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

    if (carregando) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600">
                <Loader2 size={32} className="animate-spin"/>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100/40 to-slate-50 z-0"></div>
            <div className="bg-white w-full max-w-md p-10 rounded-3xl shadow-2xl shadow-blue-900/10 border border-white relative z-10">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 mb-4">
                        <ShieldCheck size={28}/>
                    </div>
                    <h1 className="text-2xl font-extrabold text-slate-800">Defina sua nova senha</h1>
                    <p className="text-sm text-slate-500 text-center mt-2">
                        {nome ? <>Olá, <span className="font-bold text-slate-700">{nome.split(' ')[0]}</span>! </> : null}
                        Por segurança, troque a senha temporária antes de continuar.
                    </p>
                </div>

                {erro && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 mb-4">
                        <AlertTriangle size={14}/> {erro}
                    </div>
                )}

                <form onSubmit={salvar} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Nova senha</label>
                        <div className="relative mt-1">
                            <Lock className="absolute left-4 top-3.5 text-slate-300" size={20}/>
                            <input
                                type={mostrar ? 'text' : 'password'}
                                value={novaSenha}
                                onChange={(e) => setNovaSenha(e.target.value)}
                                className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700"
                                placeholder="Mínimo 8 caracteres com letras e números"
                                required
                                autoFocus
                            />
                            <button type="button" onClick={() => setMostrar(!mostrar)} className="absolute right-4 top-3.5 text-slate-300 hover:text-blue-500" tabIndex={-1}>
                                {mostrar ? <EyeOff size={20}/> : <Eye size={20}/>}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Confirmar senha</label>
                        <div className="relative mt-1">
                            <Lock className="absolute left-4 top-3.5 text-slate-300" size={20}/>
                            <input
                                type={mostrar ? 'text' : 'password'}
                                value={confirmar}
                                onChange={(e) => setConfirmar(e.target.value)}
                                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-slate-700"
                                placeholder="Repita a nova senha"
                                required
                            />
                        </div>
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer group mt-2">
                        <input
                            type="checkbox"
                            checked={aceitouTermos}
                            onChange={(e) => setAceitouTermos(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                        />
                        <span className="text-xs text-slate-500 leading-relaxed">
                            Eu li e concordo com os{' '}
                            <a href="/termos" target="_blank" className="text-blue-600 font-bold hover:underline">Termos de Uso</a>{' '}e a{' '}
                            <a href="/privacidade" target="_blank" className="text-blue-600 font-bold hover:underline">Política de Privacidade</a>.
                        </span>
                    </label>
                    {!aceitouTermos && erro?.includes('termos') && (
                        <p className="text-[11px] text-red-500 font-bold ml-7">Você precisa aceitar os termos para acessar o sistema.</p>
                    )}

                    <button
                        type="submit"
                        disabled={salvando}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex justify-center items-center gap-2 mt-2 disabled:opacity-60"
                    >
                        {salvando ? <Loader2 className="animate-spin" size={18}/> : <Check size={18}/>}
                        Salvar nova senha
                    </button>
                </form>

                <p className="text-[10px] text-center text-slate-400 mt-6 font-medium">
                    Você não conseguirá acessar o sistema enquanto não definir uma senha pessoal.
                </p>
            </div>
        </div>
    );
}
