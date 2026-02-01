'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import { User, Phone, Edit, ArrowLeft, Save, Loader2, FileText, Clock, Trash2, Calendar, Pill, AlertTriangle, Stethoscope, X, Check, Building2, Printer, MessageCircle } from 'lucide-react';
import Link from 'next/link';

export default function PacienteDetalhe() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  // MODOS DE TELA
  const [abaAtiva, setAbaAtiva] = useState('dados'); 
  const [modoEdicao, setModoEdicao] = useState(false); 
  const [modalDoc, setModalDoc] = useState(false); // Modal de Documentos
  const [tipoDoc, setTipoDoc] = useState('receita'); // receita | atestado
  const [textoDoc, setTextoDoc] = useState('');
  
  const [form, setForm] = useState<any>({});
  const [ficha, setFicha] = useState<any>({}); 
  const [historico, setHistorico] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);

  useEffect(() => { if(id) carregar(); }, [id]);

  async function carregar() {
      setLoading(true);
      const { data: listaClinicas } = await supabase.from('clinicas').select('*');
      if (listaClinicas) setClinicas(listaClinicas);

      const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
      if (data) {
          setForm(data);
          setFicha(data.ficha_medica || {});
      }
      const { data: hist } = await supabase.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false });
      setHistorico(hist || []);
      setLoading(false);
  }

  async function salvarTudo() {
      const payload = { ...form, ficha_medica: ficha };
      await supabase.from('pacientes').update(payload).eq('id', id);
      setModoEdicao(false);
      alert('Dados salvos com sucesso!');
  }

  const toggleCheck = (campo: string) => {
      setFicha((prev: any) => ({ ...prev, [campo]: !prev[campo] }));
  };

  async function excluir() {
      if(!confirm('Cuidado: Isso apagará o paciente e todo o histórico. Continuar?')) return;
      await supabase.from('agendamentos').delete().eq('paciente_id', id);
      await supabase.from('pacientes').delete().eq('id', id);
      router.push('/pacientes');
  }

  // FUNÇÃO DE WHATSAPP
  function abrirWhatsapp() {
      if (!form.telefone) return alert('Paciente sem telefone cadastrado.');
      const numero = form.telefone.replace(/\D/g, '');
      window.open(`https://wa.me/55${numero}`, '_blank');
  }

  // FUNÇÃO DE IMPRESSÃO DE DOCUMENTOS
  function imprimirDocumento() {
      const janela = window.open('', '', 'width=800,height=600');
      const dataHoje = new Date().toLocaleDateString('pt-BR');
      
      const conteudo = `
        <html>
          <head>
            <title>Impressão de Documento</title>
            <style>
              body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; }
              .header { text-align: center; margin-bottom: 50px; border-bottom: 2px solid #333; padding-bottom: 20px; }
              .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
              .header p { margin: 5px 0; font-size: 14px; color: #666; }
              .titulo { text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 40px; text-decoration: underline; }
              .conteudo { font-size: 16px; line-height: 1.8; margin-bottom: 60px; text-align: justify; }
              .assinatura { margin-top: 100px; text-align: center; }
              .linha { border-top: 1px solid #000; width: 300px; margin: 0 auto 10px auto; }
              .footer { position: fixed; bottom: 20px; width: 100%; text-align: center; font-size: 10px; color: #999; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>ORTUS CLINIC</h1>
              <p>Odontologia Especializada</p>
            </div>

            <div class="titulo">${tipoDoc === 'receita' ? 'RECEITUÁRIO' : 'ATESTADO MÉDICO'}</div>

            <div class="conteudo">
              ${tipoDoc === 'atestado' ? `Atesto para os devidos fins que o(a) Sr(a). <strong>${form.nome}</strong> esteve sob meus cuidados profissionais nesta data, necessitando de repouso por ____ dias.` : ''}
              ${textoDoc.replace(/\n/g, '<br>')}
            </div>

            <div class="assinatura">
              <div class="linha"></div>
              <p>Assinatura e Carimbo do Profissional</p>
            </div>

            <div class="footer">
              Gerado em ${dataHoje} via Sistema ORTUS
            </div>
            <script>window.print();</script>
          </body>
        </html>
      `;
      
      janela?.document.write(conteudo);
      janela?.document.close();
      setModalDoc(false);
  }

  // Preenche texto padrão ao trocar tipo
  useEffect(() => {
      if (tipoDoc === 'receita') setTextoDoc('Uso Oral:\n\n1. Amoxicilina 500mg ---------------- 1 caixa\n   Tomar 1 comprimido de 8 em 8 horas por 7 dias.\n\n2. Dipirona 500mg ------------------ 1 caixa\n   Tomar 1 comprimido em caso de dor.');
      else setTextoDoc('');
  }, [tipoDoc]);

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Carregando Prontuário...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-6 animate-in slide-in-from-right-4 duration-500">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4">
                <Link href="/pacientes" className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"><ArrowLeft size={20}/></Link>
                <div>
                    <h1 className="text-2xl font-black text-slate-800">{form.nome}</h1>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide flex items-center gap-2"><User size={12}/> Prontuário Digital</p>
                </div>
            </div>
            <div className="flex gap-2 flex-wrap">
                <button onClick={() => setModalDoc(true)} className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-black transition-colors flex items-center gap-2 shadow-lg"><Printer size={16}/> Documentos</button>
                <button onClick={abrirWhatsapp} className="px-4 py-2 bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 transition-colors flex items-center gap-2 shadow-lg shadow-green-200"><MessageCircle size={16}/> WhatsApp</button>
                {modoEdicao ? (
                    <>
                        <button onClick={() => setModoEdicao(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                        <button onClick={salvarTudo} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 transition-all active:scale-95"><Save size={18}/> Salvar</button>
                    </>
                ) : (
                    <button onClick={() => setModoEdicao(true)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"><Edit size={18}/> Editar</button>
                )}
            </div>
        </div>

        {/* MODAL DE DOCUMENTOS */}
        {modalDoc && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Printer size={20}/> Emitir Documento</h3>
                        <button onClick={() => setModalDoc(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20}/></button>
                    </div>
                    
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                        <button onClick={() => setTipoDoc('receita')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${tipoDoc === 'receita' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Receita</button>
                        <button onClick={() => setTipoDoc('atestado')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${tipoDoc === 'atestado' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Atestado</button>
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase">Conteúdo do Documento</label>
                        <textarea 
                            value={textoDoc} 
                            onChange={(e) => setTextoDoc(e.target.value)} 
                            className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium resize-none"
                            placeholder="Digite aqui a prescrição ou observações do atestado..."
                        ></textarea>
                    </div>

                    <button onClick={imprimirDocumento} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black transition-all shadow-lg mt-6 flex justify-center items-center gap-2">
                        <Printer size={20}/> Gerar PDF para Impressão
                    </button>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* MENU LATERAL */}
            <div className="lg:col-span-1 space-y-2">
                <button onClick={() => setAbaAtiva('dados')} className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${abaAtiva === 'dados' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}`}><User size={20}/> Dados Pessoais</button>
                <button onClick={() => setAbaAtiva('anamnese')} className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${abaAtiva === 'anamnese' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}`}><FileText size={20}/> Anamnese</button>
                <button onClick={() => setAbaAtiva('historico')} className={`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all ${abaAtiva === 'historico' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}`}><Clock size={20}/> Histórico</button>
            </div>

            {/* CONTEÚDO PRINCIPAL (Mantido igual à versão anterior, apenas a estrutura de abas) */}
            <div className="lg:col-span-3">
                {abaAtiva === 'dados' && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><User size={20} className="text-blue-500"/> Informações do Paciente</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-2 md:col-span-1"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Clínica</label><div className="relative"><Building2 className="absolute left-3 top-3 text-slate-400" size={18}/><select disabled={!modoEdicao} className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none font-bold text-slate-700 appearance-none ${modoEdicao ? 'bg-white border-blue-300 ring-2 ring-blue-100 cursor-pointer' : 'bg-slate-50 border-slate-200'}`} value={form.clinica_id || ''} onChange={e => setForm({...form, clinica_id: e.target.value})}><option value="">Sem Clínica Definida</option>{clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none font-bold text-slate-700 ${modoEdicao ? 'bg-white border-blue-300 ring-2 ring-blue-100' : 'bg-slate-50 border-slate-200'}`} value={form.nome || ''} onChange={e => setForm({...form, nome: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">CPF</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.cpf || ''} onChange={e => setForm({...form, cpf: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Telefone</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.telefone || ''} onChange={e => setForm({...form, telefone: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data Nascimento</label><input type="date" disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.data_nascimento || ''} onChange={e => setForm({...form, data_nascimento: e.target.value})} /></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} /></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Endereço</label><input disabled={!modoEdicao} className={`w-full p-3 rounded-xl border outline-none ${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}`} value={form.endereco || ''} onChange={e => setForm({...form, endereco: e.target.value})} /></div>
                        </div>
                    </div>
                )}

                {abaAtiva === 'anamnese' && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"><h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Stethoscope size={20} className="text-pink-500"/> Ficha Médica</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-4">{['Diabetes', 'Hipertensão', 'Cardiopatia', 'Asma/Bronquite', 'Alergia Antibiótico', 'Alergia Anestésico', 'Gestante', 'Fumante', 'Uso de Anticoagulante'].map(item => (<label key={item} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${ficha[item] ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100 hover:border-slate-300'} ${!modoEdicao && 'pointer-events-none opacity-80'}`}><div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${ficha[item] ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-slate-300'}`}>{ficha[item] && <Check size={14}/>}</div><input type="checkbox" className="hidden" checked={ficha[item] || false} onChange={() => toggleCheck(item)} disabled={!modoEdicao}/><span className={`text-sm font-bold ${ficha[item] ? 'text-red-700' : 'text-slate-600'}`}>{item}</span></label>))}</div></div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"><h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Pill size={20} className="text-purple-500"/> Medicamentos em Uso</h3><textarea disabled={!modoEdicao} value={ficha.medicamentos || ''} onChange={e => setFicha({...ficha, medicamentos: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-200 h-24 resize-none" placeholder="Liste os medicamentos contínuos..." /></div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"><h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle size={20} className="text-amber-500"/> Observações Clínicas</h3><textarea disabled={!modoEdicao} value={form.anamnese || ''} onChange={e => setForm({...form, anamnese: e.target.value})} className="w-full p-4 bg-yellow-50 border border-yellow-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-300 h-40 resize-none text-slate-700" placeholder="Histórico detalhado, queixas principais e evolução..." /></div>
                    </div>
                )}

                {abaAtiva === 'historico' && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in"><h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Clock size={20} className="text-blue-500"/> Histórico de Atendimentos</h3>{historico.length === 0 ? (<div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">Nenhum atendimento registrado.</div>) : (<div className="relative border-l-2 border-blue-100 ml-4 space-y-8 pb-4">{historico.map((h: any) => (<div key={h.id} className="ml-8 relative"><div className="absolute -left-[41px] top-1 w-6 h-6 rounded-full border-4 border-white bg-blue-500 shadow-sm"></div><div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60"><div className="flex justify-between items-start mb-2"><span className="font-bold text-slate-800 text-lg">{h.procedimento}</span><span className="text-xs font-bold bg-white px-2 py-1 rounded border border-slate-200 text-slate-500 uppercase">{h.status}</span></div><div className="flex items-center gap-4 text-xs text-slate-500 font-bold mb-3"><span className="flex items-center gap-1"><Calendar size={14}/> {new Date(h.data_hora).toLocaleDateString('pt-BR')}</span><span className="flex items-center gap-1"><Clock size={14}/> {new Date(h.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span><span className="flex items-center gap-1"><User size={14}/> {h.profissionais?.nome || 'Dr(a).'}</span></div>{h.observacoes && <p className="text-sm text-slate-600 bg-white p-3 rounded-xl border border-slate-100 italic">"{h.observacoes}"</p>}</div></div>))}</div>)}</div>
                )}
            </div>
        </div>
    </div>
  );
}