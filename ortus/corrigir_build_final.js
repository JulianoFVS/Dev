const fs = require('fs');
const path = require('path');

console.log('🛠️ Corrigindo erro de "delete" no Prontuário...');

const prontuarioCorrigido = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Phone, Calendar, FileText, ChevronLeft, Activity, Upload, Paperclip, Trash2, HeartPulse, Save, Loader2, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Prontuario() {
  const params = useParams();
  const router = useRouter();
  
  const [paciente, setPaciente] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState<'historico' | 'anamnese'>('historico');

  const [historico, setHistorico] = useState<any[]>([]);
  const [arquivos, setArquivos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const [anamnese, setAnamnese] = useState({
    id: null,
    fuma: false, bebe: false, diabetico: false, hipertenso: false, cardiaco: false,
    alergias: '', medicamentos: '', cirurgias: '', observacoes_medicas: ''
  });
  const [salvandoAnamnese, setSalvandoAnamnese] = useState(false);

  useEffect(() => { carregarDados(); }, [params.id]);

  async function carregarDados() {
    const { data: pac } = await supabase.from('pacientes').select('*').eq('id', params.id).single();
    if (!pac) return router.push('/pacientes');
    setPaciente(pac);

    const { data: agenda } = await supabase.from('agendamentos').select('*').eq('paciente_id', params.id).order('data_hora', { ascending: false });
    if (agenda) setHistorico(agenda);

    const { data: arq } = await supabase.from('anexos').select('*').eq('paciente_id', params.id).order('created_at', { ascending: false });
    if (arq) setArquivos(arq);

    const { data: ana } = await supabase.from('anamneses').select('*').eq('paciente_id', params.id).single();
    if (ana) setAnamnese(ana);
    
    setLoading(false);
  }

  async function handleFileUpload(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fileName = \`\${Date.now()}.\${file.name.split('.').pop()}\`;
    const { error } = await supabase.storage.from('arquivos').upload(\`\${params.id}/\${fileName}\`, file);
    if (!error) {
        const { data } = supabase.storage.from('arquivos').getPublicUrl(\`\${params.id}/\${fileName}\`);
        await supabase.from('anexos').insert([{ paciente_id: params.id, nome_arquivo: file.name, url: data.publicUrl, tipo: file.type }]);
        carregarDados();
    } else { alert('Erro upload'); }
    setUploading(false);
  }
  async function deletarArquivo(id: number) { if(confirm('Apagar?')) { await supabase.from('anexos').delete().eq('id', id); carregarDados(); } }

  // CORREÇÃO AQUI: Lógica segura sem usar 'delete'
  async function salvarAnamnese() {
    setSalvandoAnamnese(true);
    
    // Separa o ID do resto dos dados
    const { id, ...dadosSemId } = { ...anamnese, paciente_id: params.id };
    
    // Se o ID existe (não é nulo), usamos ele. Se for nulo, enviamos só os dados (o banco cria o ID).
    const payload = id ? { id, ...dadosSemId } : dadosSemId;

    const { data, error } = await supabase.from('anamneses').upsert(payload).select().single();
    
    if (error) alert('Erro ao salvar: ' + error.message);
    else {
        setAnamnese(data);
        alert('Ficha médica atualizada com sucesso!');
    }
    setSalvandoAnamnese(false);
  }

  if (loading) return <div className="p-8 text-center text-slate-400">Carregando prontuário...</div>;

  const alertas = [
    anamnese.diabetico && 'Diabético',
    anamnese.hipertenso && 'Hipertenso',
    anamnese.cardiaco && 'Cardíaco',
    anamnese.alergias && 'Alergias'
  ].filter(Boolean);

  // Filtros de Histórico
  const agora = new Date();
  const agendamentosFuturos = historico.filter(h => new Date(h.data_hora) > agora && h.status === 'agendado').reverse();
  const agendamentosPassados = historico.filter(h => new Date(h.data_hora) <= agora || h.status === 'concluido' || h.status === 'cancelado');

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-20">
      
      <Link href="/pacientes" className="inline-flex items-center text-slate-500 hover:text-teal-600 transition-colors font-medium text-sm"><ChevronLeft size={16} className="mr-1"/> Voltar</Link>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-start relative overflow-hidden">
        {alertas.length > 0 && (
            <div className="absolute top-0 left-0 w-full bg-red-50 text-red-700 text-xs font-bold px-6 py-1 flex gap-4 justify-center md:justify-start">
                <span className="flex items-center gap-1"><AlertTriangle size={12}/> ATENÇÃO CLÍNICA:</span>{alertas.join(' • ')}
            </div>
        )}
        <div className="w-24 h-24 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold text-3xl shrink-0 mt-4 md:mt-0">{paciente.nome.charAt(0).toUpperCase()}</div>
        <div className="flex-1 mt-4 md:mt-0">
            <h1 className="text-2xl font-bold text-slate-800">{paciente.nome}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-slate-500 text-sm">
                <div className="flex items-center gap-1"><Phone size={14}/> {paciente.telefone}</div>
                <div className="flex items-center gap-1"><Activity size={14}/> {historico.length} consultas</div>
            </div>
            <a href={\`https://wa.me/55\${paciente.telefone.replace(/[^0-9]/g, '')}\`} target="_blank" className="mt-4 inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-100 transition-colors border border-green-200"><Phone size={14} /> WhatsApp</a>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setAbaAtiva('historico')} className={\`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 \${abaAtiva === 'historico' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'}\`}><FileText size={18}/> Histórico e Arquivos</button>
        <button onClick={() => setAbaAtiva('anamnese')} className={\`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 \${abaAtiva === 'anamnese' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'}\`}><HeartPulse size={18}/> Anamnese (Saúde)</button>
      </div>

      {abaAtiva === 'historico' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="md:col-span-1 space-y-4">
                {/* Próximas */}
                <div className="space-y-2">
                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2"><Clock size={16}/> Em Aberto</h3>
                    {agendamentosFuturos.length === 0 ? (<div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400">Nada pendente.</div>) : (agendamentosFuturos.map(item => (<div key={item.id} className="bg-white p-3 rounded-xl border-l-4 border-l-blue-500 shadow-sm border border-slate-100"><p className="font-bold text-slate-800 text-sm">{new Date(item.data_hora).toLocaleDateString('pt-BR')}</p><p className="text-xs text-blue-600 font-bold mb-1">{new Date(item.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p><p className="text-sm text-slate-600">{item.procedimento}</p></div>)))}
                    <Link href="/agenda" className="block w-full text-center bg-teal-50 text-teal-700 py-2 rounded-lg font-bold text-xs hover:bg-teal-100 transition-colors">+ Agendar</Link>
                </div>
                {/* Arquivos */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-3"><h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Paperclip size={16}/> Anexos</h3><label className="cursor-pointer text-teal-600 hover:bg-teal-50 p-1.5 rounded transition-colors"><Upload size={16} /><input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} /></label></div>
                    {uploading && <p className="text-xs text-teal-600 animate-pulse">Enviando...</p>}
                    <div className="space-y-2">{arquivos.length === 0 && <p className="text-xs text-slate-400 text-center py-2">Vazio.</p>}{arquivos.map(arq => (<div key={arq.id} className="flex justify-between p-2 bg-slate-50 rounded text-xs group"><a href={arq.url} target="_blank" className="truncate flex-1 hover:text-teal-600">{arq.nome_arquivo}</a><button onClick={() => deletarArquivo(arq.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={14}/></button></div>))}</div>
                </div>
            </div>
            <div className="md:col-span-2 space-y-4">
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2"><FileText size={16}/> Histórico Completo</h3>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
                    {agendamentosPassados.length === 0 ? <div className="p-8 text-center text-slate-400">Sem histórico.</div> : agendamentosPassados.map(item => {
                        const isConcluido = item.status === 'concluido';
                        const isCancelado = item.status === 'cancelado';
                        return (
                            <div key={item.id} className={\`p-4 hover:bg-slate-50 transition-colors flex gap-4 \${isCancelado ? 'opacity-60' : ''}\`}>
                                <div className="flex flex-col items-center min-w-[50px]"><span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(item.data_hora).toLocaleString('pt-BR', {month:'short'}).replace('.','')}</span><span className="text-lg font-bold text-slate-700 leading-none">{new Date(item.data_hora).getDate()}</span></div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div><h4 className={\`font-bold text-sm \${isCancelado ? 'text-slate-500 line-through' : 'text-slate-800'}\`}>{item.procedimento}</h4><p className="text-xs text-slate-400 mt-0.5">{new Date(item.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p></div>
                                        <div className="text-right">
                                            {isConcluido && (<span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100"><CheckCircle size={12}/> Concluído</span>)}
                                            {isCancelado && (<span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100"><XCircle size={12}/> Cancelado</span>)}
                                            {!isConcluido && !isCancelado && (<span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Pendente</span>)}
                                        </div>
                                    </div>
                                    {item.observacoes && <div className="mt-2 bg-yellow-50 p-2 rounded-lg text-xs text-yellow-800 border border-yellow-100 italic">📝 {item.observacoes}</div>}
                                    {isConcluido && (<div className="mt-2 flex justify-end"><span className="text-sm font-bold text-slate-700">Valor Pago: <span className="text-green-600">R$ {Number(item.valor || 0).toFixed(2)}</span></span></div>)}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
      )}

      {abaAtiva === 'anamnese' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-in fade-in slide-in-from-bottom-2">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-lg"><HeartPulse className="text-red-500"/> Ficha de Saúde</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100 pb-2">Condições Gerais</p>
                    <div className="grid grid-cols-2 gap-4">{[{ key: 'fuma', label: 'Fumante' }, { key: 'bebe', label: 'Consome Álcool' }, { key: 'diabetico', label: 'Diabético' }, { key: 'hipertenso', label: 'Hipertenso' }, { key: 'cardiaco', label: 'Cardíaco' }].map((item: any) => (<label key={item.key} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"><input type="checkbox" checked={anamnese[item.key as keyof typeof anamnese]} onChange={e => setAnamnese({...anamnese, [item.key]: e.target.checked})} className="w-5 h-5 text-teal-600 rounded focus:ring-teal-500"/><span className="text-sm font-medium text-slate-700">{item.label}</span></label>))}</div>
                </div>
                <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-400 uppercase border-b border-slate-100 pb-2">Detalhes Clínicos</p>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1">Alergias</label><input value={anamnese.alergias || ''} onChange={e => setAnamnese({...anamnese, alergias: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500" placeholder="Ex: Dipirona, Latex..." /></div>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1">Medicamentos em uso</label><input value={anamnese.medicamentos || ''} onChange={e => setAnamnese({...anamnese, medicamentos: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500" placeholder="Ex: Losartana..." /></div>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1">Cirurgias Prévias</label><input value={anamnese.cirurgias || ''} onChange={e => setAnamnese({...anamnese, cirurgias: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500" placeholder="Alguma internação?" /></div>
                </div>
            </div>
            <div><label className="block text-sm font-bold text-slate-700 mb-1">Observações Médicas Adicionais</label><textarea rows={4} value={anamnese.observacoes_medicas || ''} onChange={e => setAnamnese({...anamnese, observacoes_medicas: e.target.value})} className="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500" placeholder="Outras informações relevantes..." /></div>
            <div className="mt-6 flex justify-end"><button onClick={salvarAnamnese} disabled={salvandoAnamnese} className="bg-teal-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-teal-700 transition-all flex items-center gap-2 shadow-lg shadow-teal-200">{salvandoAnamnese ? <Loader2 className="animate-spin"/> : <Save size={20}/>} Salvar Ficha</button></div>
        </div>
      )}
    </div>
  );
}
`;

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) return true;
  fs.mkdirSync(dirname, { recursive: true });
}

const targetPath = path.join('app', 'pacientes', '[id]', 'page.tsx');
ensureDirectoryExistence(targetPath);
fs.writeFileSync(targetPath, prontuarioCorrigido.trim());

console.log('✅ Prontuário corrigido para o Build!');