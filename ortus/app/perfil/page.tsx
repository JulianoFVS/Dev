'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  User,
  LogOut,
  Save,
  Loader2,
  Lock,
  Mail,
  Upload,
  Trash2,
  AlertTriangle,
  Download,
  ShieldCheck,
  Camera,
} from 'lucide-react';
import { bentoInput, bentoPrimaryBtn, bentoGhostBtn } from '@/lib/bentoUi';
import { useRouter } from 'next/navigation';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import {
  patchProfileSession,
  readProfileSession,
  clearProfileSession,
  writeProfileSession,
} from '@/lib/profileSession';
import { clearAuthCookies } from '@/lib/authCookies';

const cardShell = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';
const sectionPad = 'p-4 sm:p-5 md:p-6';

type ProfRow = {
  id: number;
  nome: string;
  cargo?: string | null;
  nivel_acesso?: string | null;
  foto_url?: string | null;
  created_at?: string;
  precisa_trocar_senha?: boolean | null;
};

function bootProf(): ProfRow | null {
  const snap = readProfileSession();
  if (!snap?.nome) return null;
  return {
    id: 0,
    nome: snap.nome,
    cargo: snap.cargo ?? '',
    nivel_acesso: snap.nivel_acesso ?? 'comum',
    foto_url: snap.foto_url ?? null,
  };
}

export default function Perfil() {
  const boot = bootProf();
  const jaCarregou = useRef(!!boot);
  const { activeClinic } = useClinica();
  const [loading, setLoading] = useState(() => !boot);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState(() => ({
    nome: boot?.nome ?? '',
    email: '',
    cargo: boot?.cargo ?? '',
    novaSenha: '',
  }));
  const [userId, setUserId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<ProfRow | null>(() => boot);
  const [fotoUrl, setFotoUrl] = useState<string | null>(() => boot?.foto_url ?? null);
  const router = useRouter();
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      jaCarregou.current = true;
      setLoading(false);
      return;
    }
    setUserId(user.id);
    const { data: prof } = await supabase
      .from('profissionais')
      .select('id, nome, cargo, nivel_acesso, foto_url, created_at, precisa_trocar_senha')
      .eq('user_id', user.id)
      .maybeSingle();

    if (prof) {
      const merged = {
        ...prof,
        foto_url: prof.foto_url ?? readProfileSession()?.foto_url ?? null,
      } as ProfRow;
      setPerfil(merged);
      setForm({
        nome: merged.nome,
        cargo: merged.cargo || '',
        email: user.email || '',
        novaSenha: '',
      });
      setFotoUrl(merged.foto_url ?? null);
      writeProfileSession({
        nome: merged.nome,
        cargo: merged.cargo || '',
        nivel_acesso: merged.nivel_acesso || 'comum',
        foto_url: merged.foto_url ?? null,
      });
    } else {
      setForm((f) => ({ ...f, email: user.email || '' }));
    }
    jaCarregou.current = true;
    setLoading(false);
  }

  async function handleFotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || !userId) return;
    setSalvando(true);
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop() || 'jpg';
    const filePath = `${userId}/avatar.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      const { error: updErr } = await supabase
        .from('profissionais')
        .update({ foto_url: publicUrl })
        .eq('user_id', userId);
      if (updErr) throw updErr;

      setFotoUrl(publicUrl);
      setPerfil((p) => (p ? { ...p, foto_url: publicUrl } : p));
      patchProfileSession({ foto_url: publicUrl, nome: form.nome, cargo: form.cargo });
      showAlert('Foto atualizada!', { type: 'success' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Falha no upload';
      showAlert('Erro no upload: ' + msg, { type: 'error' });
    } finally {
      setSalvando(false);
      e.target.value = '';
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSalvando(true);

    const updates: { nome: string; cargo?: string } = { nome: form.nome.trim() };
    if (perfil?.nivel_acesso === 'admin') {
      updates.cargo = form.cargo;
    }

    await supabase.from('profissionais').update(updates).eq('user_id', userId);

    if (form.novaSenha) {
      const { error } = await supabase.auth.updateUser({ password: form.novaSenha });
      if (error) showAlert('Erro ao mudar senha: ' + error.message, { type: 'error' });
      else showAlert('Senha atualizada com sucesso!', { type: 'success' });
    }

    setPerfil((p) => (p ? { ...p, ...updates } : p));
    patchProfileSession({
      nome: updates.nome,
      cargo: updates.cargo ?? form.cargo,
      foto_url: fotoUrl,
      nivel_acesso: perfil?.nivel_acesso ?? 'comum',
    });
    setForm((f) => ({ ...f, novaSenha: '' }));
    setSalvando(false);
    showAlert('Perfil atualizado!', { type: 'success' });
  }

  async function sair() {
    await supabase.auth.signOut();
    clearProfileSession();
    clearAuthCookies();
    localStorage.removeItem('ortus_clinica_id');
    router.push('/login');
  }

  function handleExportarMeusDados() {
    const dados = {
      exportado_em: new Date().toISOString(),
      finalidade: 'Portabilidade de dados conforme LGPD (Lei 13.709/2018)',
      profissional: {
        nome: perfil?.nome,
        email: form.email,
        cargo: perfil?.cargo,
        nivel_acesso: perfil?.nivel_acesso,
        criado_em: perfil?.created_at,
      },
    };
    const json = JSON.stringify(dados, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meus_dados_ortus_${(perfil?.nome || 'usuario').replace(/\s+/g, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showAlert('Seus dados foram exportados em formato JSON conforme a LGPD.', { type: 'success' });
  }

  async function handleSolicitarExclusao() {
    const confirmacao = prompt(
      'ATENÇÃO: Esta ação é irreversível.\n\n' +
        'Sua conta e todos os dados associados serão marcados para exclusão permanente em 30 dias.\n\n' +
        'Digite "EXCLUIR" para confirmar:',
    );
    if (confirmacao !== 'EXCLUIR') {
      showAlert('Exclusão cancelada. O texto digitado não confere.', { type: 'warning' });
      return;
    }
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('profissionais')
        .update({
          exclusao_solicitada_em: new Date().toISOString(),
          ativo: false,
        })
        .eq('user_id', userId);
      if (error) throw error;

      await showAlert(
        'Solicitação registrada com sucesso.\n\nSua conta será desativada imediatamente e os dados serão excluídos permanentemente em 30 dias.\n\nCaso mude de ideia, entre em contato com o suporte dentro desse prazo.',
        { type: 'success', title: 'Solicitação Registrada' },
      );
      await sair();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tente novamente.';
      showAlert('Erro ao processar solicitação: ' + msg, { type: 'error' });
    }
  }

  const isAdmin = perfil?.nivel_acesso === 'admin';
  const kpiLoading = loading && !jaCarregou.current;
  const temFoto = Boolean(fotoUrl);
  const labelAcesso = isAdmin ? 'Administrador' : 'Profissional';

  const iniciais = useMemo(() => {
    const n = (form.nome || perfil?.nome || '').trim();
    if (!n) return '—';
    return n
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
  }, [form.nome, perfil?.nome]);

  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Conta</p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Meu perfil</h1>
          <p className="mt-1 text-sm text-neutral-500 sm:text-base">
            {activeClinic ? getClinicLabel(activeClinic) : 'Sua conta'} · Dados pessoais e preferências
          </p>
        </div>
        <button
          type="button"
          onClick={sair}
          className={`${bentoGhostBtn} h-10 w-full border-red-200 text-red-700 hover:bg-red-50 sm:w-auto`}
        >
          <LogOut size={18} /> Sair
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        <section className={`${cardShell} p-4 sm:p-5`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-neutral-100 p-2 text-neutral-700"><User size={18} /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Conta</span>
          </div>
          <p className="text-xs font-medium text-neutral-500">Nome</p>
          {kpiLoading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded-xl bg-neutral-100" />
          ) : (
            <p className="mt-1 truncate text-lg font-semibold text-neutral-900 sm:text-xl">{form.nome || '—'}</p>
          )}
        </section>
        <section className={`${cardShell} p-4 sm:p-5`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><ShieldCheck size={18} /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Acesso</span>
          </div>
          <p className="text-xs font-medium text-neutral-500">Nível</p>
          {kpiLoading ? (
            <div className="mt-2 h-8 w-20 animate-pulse rounded-xl bg-neutral-100" />
          ) : (
            <p className="mt-1 text-lg font-semibold text-neutral-900 sm:text-xl">{labelAcesso}</p>
          )}
        </section>
        <section className={`${cardShell} p-4 sm:p-5`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-neutral-100 p-2 text-neutral-700"><Camera size={18} /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Avatar</span>
          </div>
          <p className="text-xs font-medium text-neutral-500">Foto</p>
          {kpiLoading ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
          ) : (
            <p className="mt-1 text-lg font-semibold text-neutral-900 sm:text-xl">{temFoto ? 'Configurada' : 'Pendente'}</p>
          )}
        </section>
        <section className="rounded-[1.35rem] border border-neutral-800 bg-neutral-950 p-4 text-white sm:rounded-[1.5rem] sm:p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c8f053] text-sm font-bold text-neutral-900">
              {iniciais}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">ID</span>
          </div>
          <p className="text-xs font-medium text-white/60">Cargo</p>
          {kpiLoading ? (
            <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-white/10" />
          ) : (
            <p className="mt-1 truncate text-lg font-semibold sm:text-xl">{form.cargo || '—'}</p>
          )}
        </section>
      </div>

      <div className={`${cardShell} overflow-hidden`}>
        <div className="divide-y divide-black/5">
          <section className={sectionPad}>
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
              <div className="flex shrink-0 flex-col items-center md:items-start">
                <div className="group relative h-28 w-28 overflow-hidden rounded-2xl bg-[#c8f053] ring-2 ring-black/5 sm:h-32 sm:w-32">
                  {fotoUrl ? (
                    <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-neutral-900">
                      {iniciais !== '—' ? iniciais : <User size={40} />}
                    </span>
                  )}
                  <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {salvando ? <Loader2 className="animate-spin" size={22} /> : <Upload size={22} />}
                    <span className="mt-1 text-[10px] font-semibold">Alterar foto</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFotoUpload} disabled={salvando} />
                  </label>
                </div>
                <p className="mt-2 max-w-[8rem] text-center text-[11px] text-neutral-500 md:text-left">
                  PNG ou JPG · aparece na barra lateral
                </p>
              </div>

              {kpiLoading ? (
                <div className="min-w-0 flex-1 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-11 animate-pulse rounded-xl bg-neutral-50" />
                  ))}
                </div>
              ) : (
                <form onSubmit={salvar} className="min-w-0 flex-1 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Nome</label>
                      <input
                        required
                        className={bentoInput}
                        value={form.nome}
                        onChange={(e) => setForm({ ...form, nome: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Cargo {!isAdmin && <Lock size={10} />}
                      </label>
                      <input
                        className={`${bentoInput} ${!isAdmin ? 'cursor-not-allowed bg-neutral-100 text-neutral-500' : ''}`}
                        value={form.cargo}
                        onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      <Mail size={12} /> E-mail
                    </label>
                    <input
                      type="email"
                      disabled
                      className={`${bentoInput} cursor-not-allowed bg-neutral-100 text-neutral-500`}
                      value={form.email}
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      <Lock size={12} /> Nova senha
                    </label>
                    <input
                      type="password"
                      placeholder="Opcional"
                      className={bentoInput}
                      value={form.novaSenha}
                      onChange={(e) => setForm({ ...form, novaSenha: e.target.value })}
                    />
                  </div>
                  <button type="submit" disabled={salvando} className={`${bentoPrimaryBtn} h-11 w-full sm:w-auto sm:min-w-[10rem] sm:px-8`}>
                    {salvando ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Salvar</>}
                  </button>
                </form>
              )}
            </div>
          </section>

          <section className={sectionPad}>
            <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 sm:text-lg">
              <AlertTriangle size={18} className="text-amber-600" /> Seus dados (LGPD)
            </h2>
            <p className="mt-1 text-xs text-neutral-500">Exportação e solicitação de exclusão conforme a Lei 13.709/2018.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={handleExportarMeusDados} className={`${bentoGhostBtn} h-11 justify-center sm:justify-start`}>
                <Download size={18} /> Exportar JSON
              </button>
              <button
                type="button"
                onClick={handleSolicitarExclusao}
                className={`${bentoGhostBtn} h-11 justify-center border-red-200 text-red-700 hover:bg-red-50 sm:justify-start`}
              >
                <Trash2 size={18} /> Solicitar exclusão
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
