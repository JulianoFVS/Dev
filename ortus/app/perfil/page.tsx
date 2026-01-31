'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Mail, Shield, Building2, Camera, Save, Loader2, FileText, Hash, CheckCircle, AlertTriangle } from 'lucide-react';

export default function Perfil() {
  const [perfil, setPerfil] = useState(null);
  const [clinicas, setClinicas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const fileInputRef = useRef(null);
  const [sessionUser, setSessionUser] = useState(null);

  useEffect(() => { carregarPerfil(); }, []);

  async function carregarPerfil() {
    const { data: { user } } = await supabase.auth.getUser();
    setSessionUser(user);

    if (user) {
        // Tenta achar o profissional ligado a este login
        const { data: prof } = await supabase.from('profissionais')
            .select('*, profissionais_clinicas(clinicas(*))')
            .eq('user_id', user.id)
            .maybeSingle();
        
        if (prof) {
            setPerfil(prof);
            const listaClinicas = prof.profissionais_clinicas?.map((pc) => pc.clinicas) || [];
            setClinicas(listaClinicas);
        } else {
            setPerfil(null); 
        }
    }
    setLoading(false);
  }

  // --- FUNÇÃO DE CORREÇÃO (AGORA COM EMAIL) ---
  async function criarPerfilAdmin() {
      if(!sessionUser) return;
      setSalvando(true);

      // 1. Cria ou Atualiza o Perfil com o ID do Login
      const { data, error } = await supabase.from('profissionais').upsert({
          user_id: sessionUser.id,
          nome: sessionUser.user_metadata?.nome_completo || 'Administrador',
          cargo: 'Admin do Sistema',
          nivel_acesso: 'admin',
          email: sessionUser.email // AGORA VAI FUNCIONAR POIS CRIAMOS A COLUNA
      }, { onConflict: 'user_id' }).select().single();

      if (error) {
          alert('Erro ao criar perfil: ' + error.message);
      } else {
          // 2. Vincula à primeira clínica que achar
          const { data: cl } = await supabase.from('clinicas').select('id').limit(1).single();
          if (cl) {
              await supabase.from('profissionais_clinicas').insert({ profissional_id: data.id, clinica_id: cl.id });
          }
          alert('✅ SUCESSO! Perfil Admin ativado. A página será recarregada.');
          window.location.reload();
      }
      setSalvando(false);
  }

  async function handleAvatarUpload(e) {
      const file = e.target.files[0];
      if (!file || !perfil) return;
      
      setSalvando(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${perfil.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      
      if (uploadError) {
          alert('Erro no upload: ' + uploadError.message);
          setSalvando(false);
          return;
      }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);

      await supabase.from('profissionais').update({ foto_url: publicUrl }).eq('id', perfil.id);
      setPerfil({ ...perfil, foto_url: publicUrl });
      window.location.reload();
  }

  async function salvarDados() {
      if(!perfil) return;
      setSalvando(true);
      const { error } = await supabase.from('profissionais').update({
          nome: perfil.nome,
          cargo: perfil.cargo,
          cro: perfil.cro,
          especialidade: perfil.especialidade,
          bio: perfil.bio
      }).eq('id', perfil.id);

      if (error) alert('Erro: ' + error.message);
      else alert('Salvo com sucesso!');
      setSalvando(false);
  }

  if (loading) return <div className="h-screen flex justify-center items-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  // --- TELA DE ERRO / NÃO VINCULADO ---
  if (!perfil) {
      return (
          <div className="max-w-2xl mx-auto mt-10 p-8 bg-white rounded-3xl shadow-xl border border-red-100 text-center">
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle size={40}/>
              </div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Perfil Pendente</h2>
              <p className="text-slate-500 mb-8">Seu login foi criado, mas precisamos ativar suas permissões de administrador no banco de dados.</p>
              
              <button 
                  onClick={criarPerfilAdmin} 
                  disabled={salvando}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex justify-center items-center gap-2"
              >
                  {salvando ? <Loader2 className="animate-spin"/> : <Shield size={24}/>}
                  Ativar Acesso Admin
              </button>
          </div>
      );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-800">Meu Perfil</h2>
        <button onClick={salvarDados} disabled={salvando} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95">
            {salvando ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} Salvar
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100 relative">
        <div className="h-40 bg-gradient-to-r from-blue-600 to-indigo-600 relative"></div>
        <div className="px-8 pb-8">
            <div className="relative -mt-16 mb-6 flex flex-col md:flex-row justify-between items-end gap-4">
                <div className="relative group">
                    <div className="w-32 h-32 bg-white rounded-3xl p-1.5 shadow-lg overflow-hidden">
                        {perfil.foto_url ? (
                            <img src={perfil.foto_url} alt="Avatar" className="w-full h-full object-cover rounded-2xl bg-slate-100"/>
                        ) : (
                            <div className="w-full h-full bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400"><User size={48}/></div>
                        )}
                    </div>
                    <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-2 right-2 bg-blue-600 text-white p-2 rounded-full shadow-md hover:bg-blue-700 transition-transform hover:scale-110 group-hover:block" title="Alterar Foto"><Camera size={16}/></button>
                    <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} className="hidden" accept="image/*" />
                </div>

                <div className="flex-1 w-full md:w-auto">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nome</label>
                            <input value={perfil.nome || ''} onChange={e => setPerfil({...perfil, nome: e.target.value})} className="text-2xl font-bold text-slate-800 w-full bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none pb-1"/>
                        </div>
                        <div className="w-full md:w-64 space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Cargo</label>
                            <input value={perfil.cargo || ''} onChange={e => setPerfil({...perfil, cargo: e.target.value})} className="text-lg font-medium text-slate-600 w-full bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none pb-1"/>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-blue-500"/> Dados</h3>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Hash size={12}/> Registro (CRO)</label><input value={perfil.cro || ''} onChange={e => setPerfil({...perfil, cro: e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none font-semibold"/></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Shield size={12}/> Permissão</label><div className="w-full p-2 bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold uppercase text-xs flex items-center gap-2"><CheckCircle size={14}/> {perfil.nivel_acesso}</div></div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><User size={18} className="text-blue-500"/> Bio</h3>
                    <textarea value={perfil.bio || ''} onChange={e => setPerfil({...perfil, bio: e.target.value})} className="w-full h-[156px] p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"/>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}