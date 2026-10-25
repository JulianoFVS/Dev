'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
    Loader2, Plus, X, Copy, Check, AlertTriangle, ArrowUpDown, Pencil, Trash2, Building2,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { UF_OPTIONS } from '@/lib/formOptions';
import { mascaraCep } from '@/lib/mascaras';

type Rede = { id: string | number; nome: string; created_at?: string | null };

type Metricas = { redes: number; clinicas: number; usuarios: number };

type Credenciais = {
    rede: string;
    email: string;
    senha: string;
};

const FORM_VAZIO = {
    nomeRede: '', nomeMatriz: '', nomeDono: '', emailDono: '',
    telefone: '', cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
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
    const [form, setForm] = useState(FORM_VAZIO);
    const [clinicaEditId, setClinicaEditId] = useState<string | number | null>(null);
    const [donoEdit, setDonoEdit] = useState<{ id: string | number; userId: string; email: string } | null>(null);
    const [logoArquivo, setLogoArquivo] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState('');
    const [carregandoEdicao, setCarregandoEdicao] = useState(false);

    const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
    const [copiado, setCopiado] = useState<'email' | 'senha' | 'tudo' | null>(null);
    const [ordem, setOrdem] = useState<{ campo: 'nome' | 'criada'; dir: 'asc' | 'desc' }>({ campo: 'nome', dir: 'asc' });
    const [editando, setEditando] = useState<Rede | null>(null);
    const { showConfirm } = useCustomAlert();

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

    function limparLogo() {
        setLogoArquivo(null);
        setLogoPreview((atual) => {
            if (atual.startsWith('blob:')) URL.revokeObjectURL(atual);
            return '';
        });
    }

    function abrirModal() {
        setErro(null);
        setEditando(null);
        setClinicaEditId(null);
        setDonoEdit(null);
        setForm(FORM_VAZIO);
        limparLogo();
        setModalOpen(true);
    }

    function escolherFoto(arquivo?: File) {
        if (!arquivo) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) {
            setErro('Use uma imagem JPG, PNG ou WebP.');
            return;
        }
        if (arquivo.size > 2 * 1024 * 1024) {
            setErro('A foto deve ter no máximo 2MB.');
            return;
        }
        setErro(null);
        setLogoArquivo(arquivo);
        setLogoPreview((atual) => {
            if (atual.startsWith('blob:')) URL.revokeObjectURL(atual);
            return URL.createObjectURL(arquivo);
        });
    }

    async function publicarLogo(token: string, redeId: string | number, clinicaId: string | number, arquivo: File) {
        const ext = arquivo.name.split('.').pop() || 'png';
        const filePath = `clinicas/${clinicaId}/logo-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('arquivos_ortus').upload(filePath, arquivo, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('arquivos_ortus').getPublicUrl(filePath);
        const resp = await fetch('/api/super-admin/rede', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ id: redeId, nome: form.nomeRede.trim(), clinicaId, logo_url: publicUrl }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json.error || 'A foto não foi salva.');
    }

    async function tokenAtual() {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || '';
    }

    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        setErro(null);
        setSalvando(true);
        try {
            const token = await tokenAtual();
            if (!token) { setErro('Sessão expirada.'); setSalvando(false); return; }

            if (editando) {
                const resp = await fetch('/api/super-admin/rede', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        id: editando.id,
                        nome: form.nomeRede.trim(),
                        clinica: clinicaEditId == null ? undefined : {
                            id: clinicaEditId,
                            nome: form.nomeMatriz.trim(),
                            telefone: form.telefone,
                            email: form.emailDono.trim().toLowerCase(),
                            cep: form.cep,
                            rua: form.rua,
                            numero: form.numero,
                            complemento: form.complemento,
                            bairro: form.bairro,
                            cidade: form.cidade,
                            uf: form.uf,
                        },
                        dono: donoEdit ? {
                            id: donoEdit.id,
                            userId: donoEdit.userId,
                            nome: form.nomeDono.trim(),
                            email: form.emailDono.trim().toLowerCase(),
                            emailAlterado: form.emailDono.trim().toLowerCase() !== donoEdit.email,
                        } : undefined,
                    }),
                });
                const json = await resp.json().catch(() => ({}));
                if (!resp.ok) throw new Error(json.error || 'Não foi possível salvar.');
                if (logoArquivo && clinicaEditId != null) await publicarLogo(token, editando.id, clinicaEditId, logoArquivo);
                const nome = form.nomeRede.trim();
                const proximas = redes.map((r) => String(r.id) === String(editando.id) ? { ...r, nome } : r);
                setRedes(proximas);
                writeRouteCache(SA_CACHE_KEY, SA_SCOPE, { redes: proximas, metricas });
                setModalOpen(false);
                setEditando(null);
            } else {
                const resp = await fetch('/api/super-admin/criar-cliente', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        nomeRede: form.nomeRede.trim(),
                        nomeMatriz: form.nomeMatriz.trim(),
                        nomeDono: form.nomeDono.trim(),
                        emailDono: form.emailDono.trim().toLowerCase(),
                        telefone: form.telefone,
                        cep: form.cep,
                        rua: form.rua,
                        numero: form.numero,
                        complemento: form.complemento,
                        bairro: form.bairro,
                        cidade: form.cidade,
                        uf: form.uf,
                    }),
                });
                const json = await resp.json();
                if (!resp.ok || !json.success) {
                    setErro(json.error || 'Falha no onboarding.');
                    setSalvando(false);
                    return;
                }
                if (logoArquivo && json.clinica_id != null) {
                    try {
                        await publicarLogo(token, json.rede_id, json.clinica_id, logoArquivo);
                    } catch (err: any) {
                        setErro(err?.message || 'Cliente criado, mas a foto não foi enviada.');
                    }
                }
                setModalOpen(false);
                setCredenciais({ rede: json.rede_nome, email: json.email, senha: json.senha_temporaria });
                await carregar();
            }
        } catch (err: any) {
            setErro(err?.message || 'Erro inesperado.');
        }
        setSalvando(false);
    }

    async function abrirEdicao(rede: Rede) {
        setErro(null);
        setEditando(rede);
        setClinicaEditId(null);
        setDonoEdit(null);
        setForm({ ...FORM_VAZIO, nomeRede: rede.nome });
        limparLogo();
        setModalOpen(true);
        setCarregandoEdicao(true);
        try {
            const token = await tokenAtual();
            if (!token) throw new Error('Sessão expirada.');
            const resp = await fetch(`/api/super-admin/rede?id=${encodeURIComponent(String(rede.id))}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = await resp.json();
            if (!resp.ok) throw new Error(json.error || 'Não foi possível carregar a rede.');
            const clinica = json.clinica;
            const dono = json.dono;
            setClinicaEditId(clinica?.id ?? null);
            setDonoEdit(dono ? { id: dono.id, userId: dono.userId || '', email: dono.email || '' } : null);
            setForm({
                nomeRede: json.rede?.nome || rede.nome,
                nomeMatriz: clinica?.nome || '',
                nomeDono: dono?.nome || '',
                emailDono: dono?.email || clinica?.email || '',
                telefone: clinica?.telefone || '',
                cep: clinica?.cep || '',
                rua: clinica?.rua || '',
                numero: clinica?.numero || '',
                complemento: clinica?.complemento || '',
                bairro: clinica?.bairro || '',
                cidade: clinica?.cidade || '',
                uf: clinica?.uf || '',
            });
            setLogoPreview(clinica?.logo_url || '');
        } catch (err: any) {
            setErro(err?.message || 'Não foi possível carregar a rede.');
        }
        setCarregandoEdicao(false);
    }

    async function apagarRede(rede: Rede) {
        const ok = await showConfirm(`Apagar a rede "${rede.nome}"?`, { title: 'Apagar rede', type: 'warning', confirmLabel: 'Apagar' });
        if (!ok) return;
        const anterior = redes;
        const metricasAnteriores = metricas;
        const proximas = redes.filter((r) => String(r.id) !== String(rede.id));
        const metricasProximas = { ...metricas, redes: Math.max(0, metricas.redes - 1) };
        setRedes(proximas);
        setMetricas(metricasProximas);
        writeRouteCache(SA_CACHE_KEY, SA_SCOPE, { redes: proximas, metricas: metricasProximas });
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Sessão expirada.');
            const resp = await fetch('/api/super-admin/rede', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ id: rede.id }),
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(json.error || 'Não foi possível apagar a rede.');
        } catch (err: any) {
            setRedes(anterior);
            setMetricas(metricasAnteriores);
            writeRouteCache(SA_CACHE_KEY, SA_SCOPE, { redes: anterior, metricas: metricasAnteriores });
            setErro(err?.message || 'Não foi possível apagar a rede.');
        }
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

    const redesOrdenadas = useMemo(() => [...redes].sort((a, b) => {
        const cmp = ordem.campo === 'criada'
            ? (a.created_at || '').localeCompare(b.created_at || '')
            : (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' });
        return ordem.dir === 'asc' ? cmp : -cmp;
    }), [redes, ordem]);

    function alternarOrdem(campo: 'nome' | 'criada') {
        setOrdem((prev) => prev.campo === campo ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' });
    }

    const campo = 'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900';
    const rotulo = 'mb-1.5 block text-xs font-medium text-neutral-500';
    const carregandoLista = autorizado === null || (carregando && redes.length === 0);

    if (autorizado === false) return null;

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Painel SaaS</h1>
                    <p className="mt-1 text-sm text-neutral-500 sm:text-base">
                        {carregandoLista ? 'Redes, clínicas e usuários da plataforma.' : (
                            <>
                                <span className="tabular-nums text-neutral-900">{metricas.redes}</span> {metricas.redes === 1 ? 'rede' : 'redes'}
                                {' · '}
                                <span className="tabular-nums text-neutral-900">{metricas.clinicas}</span> {metricas.clinicas === 1 ? 'clínica' : 'clínicas'}
                                {' · '}
                                <span className="tabular-nums text-neutral-900">{metricas.usuarios}</span> {metricas.usuarios === 1 ? 'usuário' : 'usuários'}
                            </>
                        )}
                    </p>
                </div>
                <button type="button" onClick={abrirModal} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800">
                    <Plus size={16} /> Novo cliente
                </button>
            </div>

            {erro && !modalOpen && (
                <p className="flex shrink-0 items-center gap-2 text-sm text-rose-600">
                    <AlertTriangle size={14} /> {erro}
                </p>
            )}

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="shrink-0 px-3 pt-3">
                    <h2 className="text-base font-semibold text-neutral-900">Redes</h2>
                </div>
                {carregandoLista ? (
                    <div className="space-y-2 p-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-50" />
                        ))}
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <table className="w-full min-w-[420px] text-sm">
                            <thead>
                                <tr className="border-b border-black/5">
                                    {([
                                        ['nome', 'Rede'],
                                        ['criada', 'Criada em'],
                                    ] as const).map(([campoOrdem, label]) => (
                                        <th key={campoOrdem} className="px-4 py-2 text-left sm:px-5">
                                            <button type="button" onClick={() => alternarOrdem(campoOrdem)} className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-neutral-900">
                                                {label}
                                                <ArrowUpDown size={12} className={ordem.campo === campoOrdem ? 'text-neutral-900' : 'text-neutral-300'} />
                                            </button>
                                        </th>
                                    ))}
                                    <th className="px-4 py-2 text-right text-xs font-medium text-neutral-400 sm:px-5">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {redesOrdenadas.length === 0 && (
                                    <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-neutral-400">Nenhuma rede cadastrada.</td></tr>
                                )}
                                {redesOrdenadas.map((r) => (
                                    <tr key={String(r.id)} className="border-b border-black/5 last:border-0 hover:bg-neutral-50/60">
                                        <td className="px-4 py-2.5 sm:px-5">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f4f1] text-[11px] font-medium text-neutral-500">
                                                    {r.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                                                </span>
                                                <span className="font-medium text-neutral-900">{r.nome}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-neutral-600 sm:px-5">{fmtData(r.created_at)}</td>
                                        <td className="px-4 py-2.5 text-right sm:px-5">
                                            <div className="inline-flex items-center justify-end gap-1.5">
                                                <button type="button" onClick={() => abrirEdicao(r)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50" aria-label="Editar"><Pencil size={14}/></button>
                                                <button type="button" onClick={() => apagarRede(r)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600" aria-label="Apagar"><Trash2 size={14}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditando(null); }} maxWidth="lg" hideCloseButton panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <form onSubmit={salvar} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
                        <div>
                            <h2 className="text-lg font-semibold text-neutral-900">{editando ? 'Editar cliente' : 'Novo cliente'}</h2>
                            <p className="mt-0.5 text-xs font-medium text-neutral-400">Rede, clínica e acesso do dono.</p>
                        </div>
                        <button type="button" onClick={() => { setModalOpen(false); setEditando(null); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={16}/></button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    {erro && (
                        <p className="mb-3 flex items-center gap-2 text-xs font-medium text-rose-600">
                            <AlertTriangle size={14} /> {erro}
                        </p>
                    )}
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
                        <label className="flex items-center gap-3 sm:col-span-2">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-white text-neutral-400">
                                {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-cover" /> : <Building2 size={18} />}
                            </span>
                            <span>
                                <span className={rotulo}>Foto da clínica</span>
                                <span className="text-xs text-neutral-400">JPG, PNG ou WebP até 2MB</span>
                            </span>
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { escolherFoto(e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                        <label className="sm:col-span-2">
                            <span className={rotulo}>Nome da rede <span className="text-red-500">*</span></span>
                            <input value={form.nomeRede} onChange={(e) => setForm({ ...form, nomeRede: e.target.value })} className={campo} placeholder="Ex.: Clínica Sorrir" required />
                        </label>
                        <label>
                            <span className={rotulo}>Clínica inicial <span className="text-red-500">*</span></span>
                            <input value={form.nomeMatriz} onChange={(e) => setForm({ ...form, nomeMatriz: e.target.value })} className={campo} placeholder="Ex.: Sorrir Centro" required />
                        </label>
                        <label>
                            <span className={rotulo}>Telefone</span>
                            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={campo} placeholder="(11) 99999-0000" />
                        </label>
                        <label>
                            <span className={rotulo}>CEP</span>
                            <input inputMode="numeric" value={form.cep} onChange={(e) => {
                                const cep = mascaraCep(e.target.value);
                                setForm((atual) => ({ ...atual, cep }));
                                const digitos = cep.replace(/\D/g, '');
                                if (digitos.length !== 8) return;
                                fetch(`https://viacep.com.br/ws/${digitos}/json/`).then((r) => r.json()).then((data) => {
                                    if (!data || data.erro) return;
                                    setForm((atual) => ({
                                        ...atual,
                                        cep,
                                        rua: data.logradouro || atual.rua,
                                        bairro: data.bairro || atual.bairro,
                                        cidade: data.localidade || atual.cidade,
                                        uf: data.uf || atual.uf,
                                    }));
                                }).catch(() => {});
                            }} className={campo} placeholder="00000-000" />
                        </label>
                        <div>
                            <span className={rotulo}>UF</span>
                            <CustomSelect value={form.uf} onChange={(uf) => setForm((atual) => ({ ...atual, uf }))} options={UF_OPTIONS.filter((op) => op.value)} placeholder="Selecione..." size="md" />
                        </div>
                        <label className="sm:col-span-2">
                            <span className={rotulo}>Rua</span>
                            <input value={form.rua} onChange={(e) => setForm({ ...form, rua: e.target.value })} className={campo} />
                        </label>
                        <label>
                            <span className={rotulo}>Número</span>
                            <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={campo} />
                        </label>
                        <label>
                            <span className={rotulo}>Complemento</span>
                            <input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className={campo} />
                        </label>
                        <label>
                            <span className={rotulo}>Bairro</span>
                            <input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className={campo} />
                        </label>
                        <label>
                            <span className={rotulo}>Cidade</span>
                            <input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className={campo} />
                        </label>
                        <label>
                            <span className={rotulo}>Nome do dono <span className="text-red-500">*</span></span>
                            <input value={form.nomeDono} onChange={(e) => setForm({ ...form, nomeDono: e.target.value })} className={campo} placeholder="Ex.: Dr. João Silva" required />
                        </label>
                        <label>
                            <span className={rotulo}>E-mail do dono <span className="text-red-500">*</span></span>
                            <input type="email" value={form.emailDono} onChange={(e) => setForm({ ...form, emailDono: e.target.value })} className={campo} placeholder="dono@clinica.com" required />
                        </label>
                    </div>
                    </div>
                    <div className="flex shrink-0 justify-end gap-2 border-t border-black/5 px-5 py-4 sm:px-6">
                        <button type="button" onClick={() => { setModalOpen(false); setEditando(null); }} className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50">Cancelar</button>
                        <button type="submit" disabled={salvando || carregandoEdicao} className="inline-flex h-9 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                            {salvando ? <Loader2 size={15} className="animate-spin" /> : (editando ? 'Salvar' : 'Criar')}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!credenciais} onClose={() => setCredenciais(null)} maxWidth="md" hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                {credenciais && (
                    <div className="px-5 py-4 sm:px-6 sm:py-5">
                        <div className="mb-5 flex items-start justify-between gap-3 border-b border-black/5 pb-4">
                            <div>
                                <h2 className="text-lg font-semibold text-neutral-900">Cliente criado</h2>
                                <p className="mt-0.5 text-xs font-medium text-neutral-400">{credenciais.rede}. Envie o acesso ao dono.</p>
                            </div>
                            <button type="button" onClick={() => setCredenciais(null)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={18}/></button>
                        </div>
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-neutral-500">E-mail</p>
                                    <p className="truncate text-sm text-neutral-900">{credenciais.email}</p>
                                </div>
                                <button type="button" onClick={() => copiar('email')} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-50" aria-label="Copiar e-mail">
                                    {copiado === 'email' ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2">
                                <div>
                                    <p className="text-xs font-medium text-neutral-500">Senha temporária</p>
                                    <p className="font-mono text-sm text-neutral-900">{credenciais.senha}</p>
                                </div>
                                <button type="button" onClick={() => copiar('senha')} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-50" aria-label="Copiar senha">
                                    {copiado === 'senha' ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                            </div>
                            <p className="text-xs text-neutral-500">No primeiro acesso o dono troca a senha.</p>
                        </div>
                        <div className="mt-5 flex items-center justify-between gap-2 border-t border-black/5 pt-4">
                            <button type="button" onClick={() => copiar('tudo')} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                                {copiado === 'tudo' ? <Check size={14} /> : <Copy size={14} />}
                                {copiado === 'tudo' ? 'Copiado' : 'Copiar mensagem'}
                            </button>
                            <button type="button" onClick={() => setCredenciais(null)} className="inline-flex h-9 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800">
                                Concluir
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
