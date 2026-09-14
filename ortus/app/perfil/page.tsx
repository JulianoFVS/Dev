'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User, LogOut, Save, Loader2, Lock, Mail, Upload, Trash2, AlertTriangle, Download } from 'lucide-react';
import BentoPageShell from '@/components/bento/BentoPageShell';
import { bentoCard, bentoInput, bentoPrimaryBtn, bentoGhostBtn } from '@/lib/bentoUi';
import { useRouter } from 'next/navigation';
import { useCustomAlert } from '@/components/ui/CustomAlert';

export default function Perfil() {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', cargo: '', novaSenha: '' });
  const [user, setUser] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null); // Guardar dados completos do perfil
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const router = useRouter();
  const { showAlert } = useCustomAlert();

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser();
    if(user) {
        setUser(user);
        const { data: prof } = await supabase.from('profissionais').select('*').eq('user_id', user.id).single();
        if(prof) {
            setPerfil(prof);
            setForm({ nome: prof.nome, cargo: prof.cargo, email: user.email || '', novaSenha: '' });
            setFotoUrl(prof.foto_url);
        }
    }
    setLoading(false);
  }

  async function handleFotoUpload(e: any) {
      if (!e.target.files || e.target.files.length === 0) return;
      setSalvando(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      try {
          const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
          const publicUrl = urlData.publicUrl;

          await supabase.from('profissionais').update({ foto_url: publicUrl }).eq('user_id', user.id);
          setFotoUrl(publicUrl);
          showAlert('Foto atualizada!', { type: 'success' });
      } catch (error: any) {
          showAlert('Erro no upload: ' + error.message, { type: 'error' });
      }
      setSalvando(false);
  }

  async function salvar(e: any) {
      e.preventDefault();
      setSalvando(true);
      
      const updates: any = { nome: form.nome };
      
      // Só atualiza cargo se for admin
      if (perfil?.nivel_acesso === 'admin') {
          updates.cargo = form.cargo;
      }

      await supabase.from('profissionais').update(updates).eq('user_id', user.id);

      if (form.novaSenha) {
          const { error } = await supabase.auth.updateUser({ password: form.novaSenha });
          if (error) showAlert('Erro ao mudar senha: ' + error.message, { type: 'error' });
          else showAlert('Senha atualizada com sucesso!', { type: 'success' });
      }

      setSalvando(false);
      showAlert('Perfil atualizado!', { type: 'success' });
  }

  async function sair() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function handleExportarMeusDados() {
      const dados = {
          exportado_em: new Date().toISOString(),
          finalidade: 'Portabilidade de dados conforme LGPD (Lei 13.709/2018)',
          profissional: {
              nome: perfil?.nome,
              email: user?.email,
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
          'Digite "EXCLUIR" para confirmar:'
      );
      if (confirmacao !== 'EXCLUIR') {
          showAlert('Exclusão cancelada. O texto digitado não confere.', { type: 'warning' });
          return;
      }
      try {
          // Marca a conta para exclusão (soft-delete com data de expiração)
          const { error } = await supabase
              .from('profissionais')
              .update({
                  exclusao_solicitada_em: new Date().toISOString(),
                  ativo: false,
              })
              .eq('user_id', user.id);
          if (error) throw error;

          await showAlert(
              'Solicitação registrada com sucesso.\n\nSua conta será desativada imediatamente e os dados serão excluídos permanentemente em 30 dias.\n\nCaso mude de ideia, entre em contato com o suporte dentro desse prazo.', { type: 'success', title: 'Solicitação Registrada' }
          );
          await supabase.auth.signOut();
          router.push('/login');
      } catch (err: any) {
          showAlert('Erro ao processar solicitação: ' + (err?.message || 'Tente novamente.'), { type: 'error' });
      }
  }

  const isAdmin = perfil?.nivel_acesso === 'admin';

  return (
    <BentoPageShell
      title="Meu perfil"
      subtitle="Dados da conta e preferências pessoais"
      maxWidthClass="max-w-2xl"
      actions={
        <button type="button" onClick={sair} className={`${bentoGhostBtn} text-red-600 hover:bg-red-50`}>
          <LogOut size={18} /> Sair
        </button>
      }
    >
      <div className={`${bentoCard} space-y-6 border border-black/5 p-5 sm:p-8`}>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-neutral-400" />
          </div>
        ) : (
          <>
            <div className="relative flex flex-col items-center">
              <div className="group relative mb-3 h-28 w-28 overflow-hidden rounded-2xl bg-[#c8f053] ring-2 ring-neutral-900/10">
                {fotoUrl ? (
                  <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-neutral-900">
                    <User size={48} />
                  </span>
                )}
                <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Upload size={22} />
                  <span className="mt-1 text-[10px] font-semibold">Alterar foto</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFotoUpload} />
                </label>
              </div>
            </div>

            <form onSubmit={salvar} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Nome</label>
                  <input required className={bentoInput} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
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
                <input type="email" disabled className={`${bentoInput} cursor-not-allowed bg-neutral-100 text-neutral-500`} value={form.email} />
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
              <button type="submit" disabled={salvando} className={`${bentoPrimaryBtn} w-full py-3`}>
                {salvando ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Salvar</>}
              </button>
            </form>
          </>
        )}
      </div>

      <div className={`${bentoCard} mt-4 border border-black/5 p-5 sm:p-6`}>
        <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
          <AlertTriangle size={18} className="text-amber-600" /> Seus dados (LGPD)
        </h2>
        <p className="mt-1 text-xs text-neutral-500">Exportação e solicitação de exclusão conforme a Lei 13.709/2018.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" onClick={handleExportarMeusDados} className={`${bentoGhostBtn} justify-start p-4`}>
            <Download size={18} /> Exportar JSON
          </button>
          <button
            type="button"
            onClick={handleSolicitarExclusao}
            className={`${bentoGhostBtn} justify-start border-red-200 p-4 text-red-700 hover:bg-red-50`}
          >
            <Trash2 size={18} /> Solicitar exclusão
          </button>
        </div>
      </div>
    </BentoPageShell>
  );
}