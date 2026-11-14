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
  HardDrive,
} from 'lucide-react';
import { bentoInput } from '@/lib/bentoUi';
import { prepararFotoPaciente } from '@/lib/prepararFotoPaciente';
import { useImagemSdr } from '@/lib/imagemSdr';
import { carregarUsoArmazenamento, enviarAvatarPerfil, EVENTO_ARMAZENAMENTO, formatarBytes, formatarBytesDecimais, type ResumoArmazenamento } from '@/lib/armazenamento';
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

const cardShell = 'rounded-xl border border-neutral-200 bg-white';
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
  const { activeClinic, activeClinicId } = useClinica();
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
  const fotoExibida = useImagemSdr(fotoUrl);
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

    try {
      const foto = await prepararFotoPaciente(file);
      const publicUrl = await enviarAvatarPerfil(userId, foto);

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

  const rotuloNivel = isAdmin ? 'Administrador' : 'Equipe';
  const nomeExibido = form.nome || perfil?.nome || 'Seu nome';

  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Conta</p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Meu perfil</h1>
          <p className="mt-1 text-sm text-neutral-500 sm:text-base">
            {activeClinic ? getClinicLabel(activeClinic) : 'Sua conta'} · Dados pessoais e preferências
          </p>
        </div>
        <button
          type="button"
          onClick={sair}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50 sm:h-10 sm:w-auto sm:rounded-md"
        >
          <LogOut size={18} /> Sair
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-3">
        {/* Cartão de identidade — avatar, nome e cargo em destaque */}
        <section className={`${cardShell} overflow-hidden`}>
          <div className="flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
            <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#c8f053] ring-2 ring-black/5 sm:h-24 sm:w-24">
              {fotoExibida ? (
                <img src={fotoExibida} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xl font-bold text-neutral-900 sm:text-2xl">
                  {iniciais !== '—' ? iniciais : <User size={32} />}
                </span>
              )}
              <label className="absolute inset-0 hidden cursor-pointer flex-col items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
                {salvando ? <Loader2 className="animate-spin" size={22} /> : <Upload size={22} />}
                <span className="mt-1 text-xs font-semibold">Alterar foto</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFotoUpload} disabled={salvando} />
              </label>
            </div>

            <div className="min-w-0 flex-1">
              {kpiLoading ? (
                <div className="space-y-2">
                  <div className="h-6 w-40 max-w-full animate-pulse rounded-lg bg-neutral-100" />
                  <div className="h-4 w-28 max-w-full animate-pulse rounded-lg bg-neutral-50" />
                </div>
              ) : (
                <>
                  <h2 className="truncate text-lg font-semibold text-neutral-900 sm:text-xl">{nomeExibido}</h2>
                  <p className="mt-0.5 truncate text-sm text-neutral-500">{perfil?.cargo || 'Cargo não informado'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">{rotuloNivel}</span>
                    {activeClinic && (
                      <span className="max-w-full truncate rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium text-neutral-600">
                        {getClinicLabel(activeClinic)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="border-t border-black/5 p-3 sm:hidden">
            <label className={`flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white text-sm font-medium text-neutral-800 ${salvando ? 'pointer-events-none opacity-60' : ''}`}>
              {salvando ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              Trocar foto
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFotoUpload} disabled={salvando} />
            </label>
            <p className="mt-1.5 text-center text-xs text-neutral-400">PNG ou JPG · aparece na barra lateral</p>
          </div>
        </section>

        {kpiLoading ? (
          <div className={`${cardShell} ${sectionPad} space-y-3`}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-neutral-50" />
            ))}
          </div>
        ) : (
          <form onSubmit={salvar} className="space-y-3">
            <section className={`${cardShell} ${sectionPad}`}>
              <div className="mb-4 flex items-center gap-2">
                <User size={16} className="text-neutral-500" />
                <h2 className="text-sm font-semibold text-neutral-900">Dados pessoais</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Nome</label>
                  <input
                    required
                    autoComplete="name"
                    className={`${bentoInput} h-11 sm:h-10`}
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Cargo {!isAdmin && <Lock size={12} />}
                  </label>
                  <input
                    className={`${bentoInput} h-11 sm:h-10 ${!isAdmin ? 'cursor-not-allowed bg-neutral-100 text-neutral-500' : ''}`}
                    value={form.cargo}
                    onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                    disabled={!isAdmin}
                  />
                  {!isAdmin && <p className="mt-1 text-xs text-neutral-400">Somente administradores alteram o cargo.</p>}
                </div>
              </div>
              <div className="mt-4 min-w-0">
                <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <Mail size={12} /> E-mail
                </label>
                <input
                  type="email"
                  disabled
                  className={`${bentoInput} h-11 cursor-not-allowed bg-neutral-100 text-neutral-500 sm:h-10`}
                  value={form.email}
                />
                <p className="mt-1 text-xs text-neutral-400">O e-mail é o login da conta e não pode ser alterado aqui.</p>
              </div>
            </section>

            <section className={`${cardShell} ${sectionPad}`}>
              <div className="mb-4 flex items-center gap-2">
                <Lock size={16} className="text-neutral-500" />
                <h2 className="text-sm font-semibold text-neutral-900">Segurança</h2>
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Nova senha</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Deixe em branco para manter a atual"
                  className={`${bentoInput} h-11 sm:h-10`}
                  value={form.novaSenha}
                  onChange={(e) => setForm({ ...form, novaSenha: e.target.value })}
                />
                <p className="mt-1 text-xs text-neutral-400">A senha é salva junto com os dados pessoais.</p>
              </div>
            </section>

            <div className="sticky bottom-[calc(4.6rem_+_env(safe-area-inset-bottom))] z-20 lg:static lg:bottom-auto">
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:bg-neutral-800 disabled:opacity-40 sm:h-12 lg:h-11 lg:w-auto lg:rounded-md lg:shadow-none"
              >
                {salvando ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Salvar alterações</>}
              </button>
            </div>
          </form>
        )}

        <section className={`${cardShell} overflow-hidden`}>
          <ArmazenamentoSecao clinicaId={activeClinicId && activeClinicId !== 'all' ? activeClinicId : null} />
        </section>
      </div>
    </div>
  );
}

function ArmazenamentoSecao({ clinicaId }: { clinicaId: string | null }) {
  const [resumo, setResumo] = useState<ResumoArmazenamento | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    const atualizar = () => {
      carregarUsoArmazenamento(clinicaId)
        .then((dados) => { if (ativo) { setResumo(dados); setErro(''); } })
        .catch((err: unknown) => { if (ativo) setErro(err instanceof Error ? err.message : 'Falha ao medir.'); });
    };
    atualizar();
    window.addEventListener(EVENTO_ARMAZENAMENTO, atualizar);
    return () => {
      ativo = false;
      window.removeEventListener(EVENTO_ARMAZENAMENTO, atualizar);
    };
  }, [clinicaId]);

  const usos = resumo?.clinicas ?? null;
  if (usos && usos.length === 0 && !erro) return null;

  return (
    <section className={sectionPad}>
      <div className="mb-3 flex items-center gap-2">
        <HardDrive size={16} className="text-neutral-500" />
        <h2 className="text-sm font-semibold text-neutral-900">Armazenamento</h2>
      </div>
      {erro ? (
        <p className="text-sm text-neutral-500">{erro}</p>
      ) : !usos ? (
        <div className="h-12 animate-pulse rounded-xl bg-neutral-50" />
      ) : (
        <div className="space-y-4">
          {usos.map((uso) => {
            const proporcao = uso.limite > 0 ? Math.min(1, uso.usado / uso.limite) : 1;
            const cor = proporcao >= 0.95 ? 'bg-red-500' : proporcao >= 0.8 ? 'bg-amber-500' : 'bg-neutral-900';
            return (
              <div key={uso.clinicaId}>
                <div className="mb-1.5 flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <span className="min-w-0 truncate font-medium text-neutral-800">{usos.length > 1 ? uso.nome : 'Fotos e documentos da clínica'}</span>
                  <span className="shrink-0 tabular-nums text-neutral-500">
                    {formatarBytes(uso.usado)} de {formatarBytes(uso.limite)}
                  </span>
                </div>
                <div
                  className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(proporcao * 100)}
                >
                  <div className={`h-full rounded-full transition-[width] duration-500 ${cor}`} style={{ width: `${Math.max(proporcao * 100, uso.usado > 0 ? 1 : 0)}%` }} />
                </div>
                {proporcao >= 0.8 && (
                  <p className={`mt-1.5 text-xs leading-relaxed ${proporcao >= 0.95 ? 'text-red-600' : 'text-amber-700'}`}>
                    {proporcao >= 1
                      ? 'Espaço esgotado: novos envios estão bloqueados. Apague arquivos antigos ou fale com o suporte.'
                      : 'Espaço quase no fim. Apague arquivos antigos ou fale com o suporte para aumentar o limite.'}
                  </p>
                )}
              </div>
            );
          })}
          {resumo && (
            <p className="text-xs leading-relaxed text-neutral-500">
              Conta inteira: {formatarBytesDecimais(resumo.total)} de {formatarBytesDecimais(resumo.teto)}. O envio para ao chegar nesse teto.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
