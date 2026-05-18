'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { fetchUserEquipe } from '@/lib/clinicScoped';
import {
    Users, UserPlus, Loader2, X, Mail, Building2, ShieldCheck, Copy, Check,
    KeyRound, AlertTriangle, User, Briefcase,
} from 'lucide-react';

type Profissional = {
    id: number | string;
    nome: string;
    cargo?: string | null;
    nivel_acesso?: string | null;
    user_id?: string | null;
    precisa_trocar_senha?: boolean | null;
    clinicas?: Array<{ id: string | number; nome: string }>;
};

const CARGOS = [
    'Dentista', 'Auxiliar', 'Recepcionista', 'Protético', 'Gestor', 'Outro',
];

export default function EquipePage() {
    const { clinics, loading: clinicLoading } = useClinica();

    const [profissionais, setProfissionais] = useState<Profissional[]>([]);
    const [loading, setLoading] = useState(true);
    const [perfilCaller, setPerfilCaller] = useState<any>(null);

    // Modal de criação
    const [modalOpen, setModalOpen] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [form, setForm] = useState({
        nome: '', email: '', cargo: 'Dentista', clinicas: [] as string[],
    });

    // Modal final com credenciais
    const [credenciais, setCredenciais] = useState<{ email: string; senha: string; nome: string } | null>(null);
    const [copiado, setCopiado] = useState<'email' | 'senha' | 'tudo' | null>(null);

    useEffect(() => { carregar(); }, []);

    async function carregar() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }

            // Pega meu perfil só para o gate de acesso (admin/super admin)
            const { data: meu } = await supabase
                .from('profissionais')
                .select('id, nome, nivel_acesso, is_super_admin')
                .eq('user_id', user.id)
                .single();
            setPerfilCaller(meu);

            // Helper centralizado que aplica regras de visibilidade:
            //  - super admin: todos
            //  - demais: colegas das mesmas clínicas
            const lista = await fetchUserEquipe();
            setProfissionais(lista as any);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }

    function abrirModal() {
        setErro(null);
        setForm({ nome: '', email: '', cargo: 'Dentista', clinicas: [] });
        setModalOpen(true);
    }

    function toggleClinica(id: string) {
        setForm((f) => ({
            ...f,
            clinicas: f.clinicas.includes(id) ? f.clinicas.filter((x) => x !== id) : [...f.clinicas, id],
        }));
    }

    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        setErro(null);

        if (!form.nome.trim() || !form.email.trim()) {
            setErro('Nome e e-mail são obrigatórios.');
            return;
        }
        if (form.clinicas.length === 0) {
            setErro('Selecione pelo menos uma unidade.');
            return;
        }

        setSalvando(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) {
                setErro('Sessão expirada. Faça login novamente.');
                setSalvando(false);
                return;
            }

            const resp = await fetch('/api/admin/criar-usuario', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    nome: form.nome.trim(),
                    email: form.email.trim().toLowerCase(),
                    cargo: form.cargo,
                    clinicas: form.clinicas,
                }),
            });
            const json = await resp.json();
            if (!resp.ok || !json.success) {
                setErro(json.error || 'Falha ao criar usuário.');
                setSalvando(false);
                return;
            }

            setModalOpen(false);
            setCredenciais({ nome: form.nome.trim(), email: json.email, senha: json.senha_temporaria });
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
            `E-mail: ${credenciais.email}\nSenha temporária: ${credenciais.senha}`;
        try {
            navigator.clipboard.writeText(texto);
            setCopiado(tipo);
            setTimeout(() => setCopiado(null), 1800);
        } catch {}
    }

    const isAdmin = perfilCaller?.nivel_acesso === 'admin' || perfilCaller?.is_super_admin;

    const totalAtivos = useMemo(() => profissionais.length, [profissionais]);

    if (loading || clinicLoading) {
        return (
            <div className="p-10 flex items-center justify-center text-blue-600">
                <Loader2 className="animate-spin" size={32} />
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="p-10">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 max-w-2xl mx-auto text-center">
                    <ShieldCheck size={40} className="text-amber-600 mx-auto mb-3" />
                    <h2 className="text-lg font-bold text-amber-900">Acesso restrito</h2>
                    <p className="text-sm text-amber-700 mt-1">Apenas administradores podem gerenciar a equipe.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-black text-blue-500 uppercase tracking-wider mb-1">
                        <Users size={14} /> Ajustes
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800">Equipe</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {totalAtivos} {totalAtivos === 1 ? 'profissional' : 'profissionais'} com acesso ao sistema
                    </p>
                </div>
                <button
                    onClick={abrirModal}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all text-sm sm:text-base w-full sm:w-auto"
                >
                    <UserPlus size={18} /> Adicionar funcionário
                </button>
            </div>

            {/* Lista */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px]">
                    <thead className="bg-slate-50">
                        <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <th className="text-left px-3 sm:px-5 py-3">Nome</th>
                            <th className="text-left px-3 sm:px-5 py-3">Cargo</th>
                            <th className="text-left px-3 sm:px-5 py-3">Unidades</th>
                            <th className="text-left px-3 sm:px-5 py-3 whitespace-nowrap">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {profissionais.map((p) => (
                            <tr key={p.id} className="border-t border-slate-50 hover:bg-blue-50/40 transition-colors">
                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                                            {p.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-700 text-sm">{p.nome}</p>
                                            {p.nivel_acesso === 'admin' && (
                                                <p className="text-[10px] font-bold text-blue-500 uppercase">Administrador</p>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-5 py-4 text-sm font-bold text-slate-600">{p.cargo || '—'}</td>
                                <td className="px-5 py-4">
                                    <div className="flex flex-wrap gap-1">
                                        {(p.clinicas || []).slice(0, 3).map((c, index) => (
                                            <span key={`${c.id}-${index}`} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md uppercase tracking-wide">
                                                {c.nome}
                                            </span>
                                        ))}
                                        {(p.clinicas || []).length > 3 && (
                                            <span className="text-[10px] font-bold text-slate-400">+{(p.clinicas || []).length - 3}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-5 py-4">
                                    {p.precisa_trocar_senha ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-md uppercase">
                                            <KeyRound size={10} /> Senha provisória
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-md uppercase">
                                            <Check size={10} /> Ativo
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {profissionais.length === 0 && (
                            <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400 italic">Nenhum profissional cadastrado.</td></tr>
                        )}
                    </tbody>
                </table>
              </div>
            </div>

            {/* Modal de criação */}
            {modalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <h2 className="font-bold text-slate-800 flex items-center gap-2"><UserPlus size={18} className="text-blue-600" /> Novo funcionário</h2>
                            <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-50"><X size={18} /></button>
                        </div>
                        <form onSubmit={salvar} className="p-6 space-y-4">
                            {erro && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2">
                                    <AlertTriangle size={14} /> {erro}
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-1 mb-1"><User size={12}/> Nome completo</label>
                                <input
                                    value={form.nome}
                                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                                    placeholder="Ex.: Dra. Ana Souza"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-1 mb-1"><Mail size={12}/> E-mail de acesso</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                                    placeholder="funcionario@email.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-1 mb-1"><Briefcase size={12}/> Cargo</label>
                                <select
                                    value={form.cargo}
                                    onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                                >
                                    {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-1 mb-2"><Building2 size={12}/> Unidades de acesso</label>
                                <div className="space-y-1.5 max-h-52 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50/50">
                                    {clinics.length === 0 && (
                                        <p className="text-xs text-slate-400 italic px-2 py-3">Nenhuma unidade disponível na sua rede.</p>
                                    )}
                                    {clinics.map((c) => {
                                        const id = String(c.id);
                                        const checked = form.clinicas.includes(id);
                                        return (
                                            <label
                                                key={id}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${checked ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-300'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleClinica(id)}
                                                    className="rounded text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-sm font-bold text-slate-700">{getClinicLabel(c)}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-50">
                                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Cancelar</button>
                                <button type="submit" disabled={salvando} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 shadow-md shadow-blue-200">
                                    {salvando ? <Loader2 size={14} className="animate-spin"/> : <UserPlus size={14}/>}
                                    Criar funcionário
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de credenciais */}
            {credenciais && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white px-6 py-5">
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-2">
                                <Check size={24} />
                            </div>
                            <h2 className="font-bold text-lg">Usuário criado com sucesso!</h2>
                            <p className="text-emerald-50 text-xs mt-0.5">Envie estes dados para <strong>{credenciais.nome}</strong> com segurança.</p>
                        </div>
                        <div className="p-6 space-y-3">
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">E-mail</p>
                                        <p className="text-sm font-bold text-slate-700 font-mono break-all">{credenciais.email}</p>
                                    </div>
                                    <button onClick={() => copiar('email')} className="ml-2 p-2 rounded-lg hover:bg-white text-slate-400 hover:text-blue-600 transition-all">
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
                                    <button onClick={() => copiar('senha')} className="ml-2 p-2 rounded-lg hover:bg-white text-amber-600 hover:text-amber-700 transition-all">
                                        {copiado === 'senha' ? <Check size={16} className="text-emerald-600"/> : <Copy size={16}/>}
                                    </button>
                                </div>
                                <p className="text-[10px] text-amber-700 mt-2 font-medium">
                                    O funcionário será obrigado a trocar a senha no primeiro acesso.
                                </p>
                            </div>
                            <button
                                onClick={() => copiar('tudo')}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg"
                            >
                                {copiado === 'tudo' ? <><Check size={14} className="text-emerald-600"/> Copiado!</> : <><Copy size={14}/> Copiar tudo</>}
                            </button>
                            <button
                                onClick={() => setCredenciais(null)}
                                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-md shadow-blue-200"
                            >
                                Concluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
