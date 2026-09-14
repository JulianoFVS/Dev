'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
    Loader2, Plus, Network, Building2, Users as UsersIcon, ShieldAlert,
    X, Mail, User, Building, Copy, Check, AlertTriangle,
} from 'lucide-react';
import BentoPageShell from '@/components/bento/BentoPageShell';
import { bentoCard, bentoPrimaryBtn, bentoGhostBtn } from '@/lib/bentoUi';

type Rede = { id: string | number; nome: string; created_at?: string | null };

type Metricas = { redes: number; clinicas: number; usuarios: number };

type Credenciais = {
    rede: string;
    email: string;
    senha: string;
};

const SA_CACHE_KEY = 'ortus:super-admin:v1';
const SA_SCOPE = 'global';

type SaSnapshot = { redes: Rede[]; metricas: Metricas };

export default function SuperAdminPage() {
    const router = useRouter();
    const bootSa = typeof sessionStorage !== 'undefined' ? readRouteCache<SaSnapshot>(SA_CACHE_KEY, SA_SCOPE) : null;
    const fetchGen = useRef(0);
    const [autorizado, setAutorizado] = useState<boolean | null>(null);
    const [carregando, setCarregando] = useState(() => !bootSa);
    const [redes, setRedes] = useState<Rede[]>(() => bootSa?.redes ?? []);
    const [metricas, setMetricas] = useState<Metricas>(() => bootSa?.metricas ?? { redes: 0, clinicas: 0, usuarios: 0 });

    const [modalOpen, setModalOpen] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [form, setForm] = useState({ nomeRede: '', nomeMatriz: '', nomeDono: '', emailDono: '' });

    const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
    const [copiado, setCopiado] = useState<'email' | 'senha' | 'tudo' | null>(null);

    useEffect(() => { validar(); }, []);

    async function validar() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace('/login'); return; }
        const { data: prof } = await supabase
            .from('profissionais')
            .select('is_super_admin')
            .eq('user_id', session.user.id)
            .single();
        if (!prof?.is_super_admin) {
            router.replace('/dashboard');
            return;
        }
        setAutorizado(true);
        const snap = readRouteCache<SaSnapshot>(SA_CACHE_KEY, SA_SCOPE);
        if (snap) {
            setRedes(snap.redes);
            setMetricas(snap.metricas);
            setCarregando(false);
        }
        await carregar({ silent: !!snap });
    }

    async function carregar(opts?: { silent?: boolean }) {
        const gen = ++fetchGen.current;
        if (!opts?.silent) setCarregando(true);
        try {
            const [redesResp, clinicasResp, usuariosResp] = await Promise.all([
                supabase.from('redes').select('id, nome, created_at').order('created_at', { ascending: false }),
                supabase.from('clinicas').select('id', { count: 'exact', head: true }),
                supabase.from('profissionais').select('id', { count: 'exact', head: true }),
            ]);

            if (gen !== fetchGen.current) return;

            const nextRedes = (redesResp.data || []) as Rede[];
            const nextMetricas = {
                redes: redesResp.data?.length || 0,
                clinicas: clinicasResp.count || 0,
                usuarios: usuariosResp.count || 0,
            };
            writeRouteCache(SA_CACHE_KEY, SA_SCOPE, { redes: nextRedes, metricas: nextMetricas });
            setRedes(nextRedes);
            setMetricas(nextMetricas);
        } catch (e) {
            console.error(e);
        }
        if (gen === fetchGen.current) setCarregando(false);
    }

    function abrirModal() {
        setErro(null);
        setForm({ nomeRede: '', nomeMatriz: '', nomeDono: '', emailDono: '' });
        setModalOpen(true);
    }

    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        setErro(null);
        setSalvando(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) { setErro('Sessão expirada.'); setSalvando(false); return; }

            const resp = await fetch('/api/super-admin/criar-cliente', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    nomeRede: form.nomeRede.trim(),
                    nomeMatriz: form.nomeMatriz.trim(),
                    nomeDono: form.nomeDono.trim(),
                    emailDono: form.emailDono.trim().toLowerCase(),
                }),
            });
            const json = await resp.json();
            if (!resp.ok || !json.success) {
                setErro(json.error || 'Falha no onboarding.');
                setSalvando(false);
                return;
            }
            setModalOpen(false);
            setCredenciais({ rede: json.rede_nome, email: json.email, senha: json.senha_temporaria });
            await carregar();
        } catch (e: any) {
            setErro(e?.message || 'Erro inesperado.');
        }
        setSalvando(false);
    }

    function copiar(tipo: 'email' | 'senha' | 'tudo') {
        if (!credenciais) return;
        const texto =
            tipo === 'email' ? credenciais.email :
            tipo === 'senha' ? credenciais.senha :
            `Bem-vindo(a) à Ortus!\n\nRede: ${credenciais.rede}\nE-mail: ${credenciais.email}\nSenha temporária: ${credenciais.senha}\n\nNo primeiro acesso você será solicitado a trocar a senha.`;
        try {
            navigator.clipboard.writeText(texto);
            setCopiado(tipo);
            setTimeout(() => setCopiado(null), 1800);
        } catch {}
    }

    const fmtData = useMemo(() => (d?: string | null) => {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
        catch { return '—'; }
    }, []);

    if (autorizado === false) return null;

    return (
        <BentoPageShell
            title="Painel SaaS"
            subtitle="Onboarding de redes e visão global da plataforma"
            eyebrow="Super admin"
            maxWidthClass="max-w-5xl"
            actions={
                <button type="button" onClick={abrirModal} className={bentoPrimaryBtn}>
                    <Plus size={16} /> Novo cliente
                </button>
            }
        >
            {(autorizado === null || (carregando && redes.length === 0)) ? (
                <div className="space-y-3 py-8">
                    <div className="h-24 animate-pulse rounded-[1.35rem] bg-neutral-200" />
                    <div className="h-64 animate-pulse rounded-[1.35rem] bg-neutral-100" />
                </div>
            ) : (
              <>
                <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Card label="Total de Redes" value={metricas.redes} icon={<Network size={20} />} accent="from-neutral-800 to-neutral-950" />
                    <Card label="Total de Clínicas" value={metricas.clinicas} icon={<Building2 size={20} />} accent="from-neutral-700 to-neutral-900" />
                    <Card label="Usuários Ativos" value={metricas.usuarios} icon={<UsersIcon size={20} />} accent="from-neutral-600 to-neutral-800" />
                </div>

                <div className={`${bentoCard} overflow-hidden border border-black/5`}>
                    <table className="w-full">
                        <thead className="bg-neutral-50">
                            <tr className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                <th className="text-left px-5 py-3">Rede</th>
                                <th className="text-left px-5 py-3">Criada em</th>
                            </tr>
                        </thead>
                        <tbody>
                            {redes.length === 0 && (
                                <tr><td colSpan={2} className="px-5 py-10 text-center text-sm text-neutral-400 italic">Nenhuma rede cadastrada ainda.</td></tr>
                            )}
                            {redes.map((r, idx) => (
                                <tr key={`${r.id}-${idx}`} className="border-t border-neutral-50 hover:bg-neutral-50 transition-colors">
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-neutral-700 to-neutral-900 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                                                {r.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-neutral-700 text-sm">{r.nome}</p>
                                                <p className="text-[10px] text-neutral-400 font-mono">#{r.id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-sm font-bold text-neutral-600">{fmtData(r.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
              </>
            )}

            {/* Modal de onboarding */}
            {modalOpen && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-neutral-100 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-neutral-900 text-white px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldAlert size={16} className="text-neutral-300"/>
                                <h2 className="font-bold">Onboarding de cliente</h2>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white"><X size={18} /></button>
                        </div>
                        <form onSubmit={salvar} className="p-6 space-y-4">
                            {erro && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2">
                                    <AlertTriangle size={14}/> {erro}
                                </div>
                            )}
                            <Field label="Nome da Rede" icon={<Network size={12}/>}>
                                <input
                                    value={form.nomeRede}
                                    onChange={(e) => setForm({ ...form, nomeRede: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none"
                                    placeholder="Ex.: Clínica Sorrir"
                                    required
                                />
                            </Field>
                            <Field label="Nome da Matriz (clínica inicial)" icon={<Building size={12}/>}>
                                <input
                                    value={form.nomeMatriz}
                                    onChange={(e) => setForm({ ...form, nomeMatriz: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none"
                                    placeholder="Ex.: Sorrir Centro"
                                    required
                                />
                            </Field>
                            <Field label="Nome do Dono" icon={<User size={12}/>}>
                                <input
                                    value={form.nomeDono}
                                    onChange={(e) => setForm({ ...form, nomeDono: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none"
                                    placeholder="Ex.: Dr. João Silva"
                                    required
                                />
                            </Field>
                            <Field label="E-mail do Dono" icon={<Mail size={12}/>}>
                                <input
                                    type="email"
                                    value={form.emailDono}
                                    onChange={(e) => setForm({ ...form, emailDono: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none"
                                    placeholder="dono@clinica.com"
                                    required
                                />
                            </Field>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-50">
                                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-50 rounded-lg">Cancelar</button>
                                <button type="submit" disabled={salvando} className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 shadow-md">
                                    {salvando ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
                                    Criar tenant
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de credenciais */}
            {credenciais && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-neutral-100 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-neutral-900 px-6 py-5 text-white">
                            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
                                <Check size={24} />
                            </div>
                            <h2 className="text-lg font-semibold">Tenant criado com sucesso!</h2>
                            <p className="mt-0.5 text-xs text-neutral-300">Envie estes dados ao dono via WhatsApp.</p>
                        </div>
                        <div className="p-6 space-y-3">
                            <div className="bg-neutral-900 text-white border border-neutral-800 rounded-xl p-3">
                                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-300 mb-0.5">Rede</p>
                                <p className="text-sm font-bold">{credenciais.rede}</p>
                            </div>
                            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3">
                                <div className="flex items-center justify-between">
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400 mb-0.5">E-mail</p>
                                        <p className="text-sm font-bold text-neutral-700 font-mono break-all">{credenciais.email}</p>
                                    </div>
                                    <button onClick={() => copiar('email')} className="ml-2 p-2 rounded-lg hover:bg-white text-neutral-400 hover:text-neutral-900">
                                        {copiado === 'email' ? <Check size={16} className="text-emerald-600"/> : <Copy size={16}/>}
                                    </button>
                                </div>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-wider text-amber-700 mb-0.5">Senha temporária</p>
                                        <p className="text-xl font-bold text-amber-900 font-mono tracking-widest">{credenciais.senha}</p>
                                    </div>
                                    <button onClick={() => copiar('senha')} className="ml-2 p-2 rounded-lg hover:bg-white text-amber-600 hover:text-amber-700">
                                        {copiado === 'senha' ? <Check size={16} className="text-emerald-600"/> : <Copy size={16}/>}
                                    </button>
                                </div>
                                <p className="text-[10px] text-amber-700 mt-2 font-medium">
                                    O dono será obrigado a trocar a senha no primeiro acesso.
                                </p>
                            </div>
                            <button
                                onClick={() => copiar('tudo')}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-bold rounded-lg"
                            >
                                {copiado === 'tudo' ? <><Check size={14} className="text-emerald-600"/> Copiado!</> : <><Copy size={14}/> Copiar mensagem para WhatsApp</>}
                            </button>
                            <button
                                onClick={() => setCredenciais(null)}
                                className="w-full px-4 py-3 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-bold rounded-lg shadow-md"
                            >
                                Concluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </BentoPageShell>
    );
}

function Card({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: string }) {
    return (
        <div className={`${bentoCard} flex items-center justify-between border border-black/5 p-5`}>
            <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-1">{label}</p>
                <p className="text-3xl font-extrabold text-neutral-800">{value.toLocaleString('pt-BR')}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} text-white flex items-center justify-center shadow-md`}>
                {icon}
            </div>
        </div>
    );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1 flex items-center gap-1 mb-1">
                {icon} {label}
            </label>
            {children}
        </div>
    );
}
