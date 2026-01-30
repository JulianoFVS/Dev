const fs = require('fs');
const path = require('path');

console.log('💊 Corrigindo lógica do Prontuário (Status e Valores)...');

const prontuarioCode = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Phone, Calendar, FileText, ChevronLeft, Activity, Upload, Paperclip, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Prontuario() {
  const params = useParams();
  const router = useRouter();
  const [paciente, setPaciente] = useState<any>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [arquivos, setArquivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    carregarDados();
  }, [params.id]);

  async function carregarDados() {
    // 1. Paciente
    const { data: pac } = await supabase.from('pacientes').select('*').eq('id', params.id).single();
    if (!pac) return router.push('/pacientes');
    setPaciente(pac);

    // 2. Histórico Completo
    const { data: agenda } = await supabase
      .from('agendamentos')
      .select('*')
      .eq('paciente_id', params.id)
      .order('data_hora', { ascending: false }); // Mais recentes primeiro
    
    if (agenda) setHistorico(agenda);

    // 3. Arquivos
    const { data: arq } = await supabase
      .from('anexos')
      .select('*')
      .eq('paciente_id', params.id)
      .order('created_at', { ascending: false });
    
    if (arq) setArquivos(arq);
    
    setLoading(false);
  }

  async function handleFileUpload(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);

    const fileExt = file.name.split('.').pop();
    const fileName = \`\${Date.now()}.\${fileExt}\`;
    const filePath = \`\${params.id}/\${fileName}\`;

    const { error: uploadError } = await supabase.storage.from('arquivos').upload(filePath, file);
    
    if (uploadError) {
        alert('Erro no upload: ' + uploadError.message);
    } else {
        const { data: publicUrl } = supabase.storage.from('arquivos').getPublicUrl(filePath);
        await supabase.from('anexos').insert([{
            paciente_id: params.id,
            nome_arquivo: file.name,
            url: publicUrl.publicUrl,
            tipo: fileExt
        }]);
        carregarDados();
    }
    setUploading(false);
  }

  async function deletarArquivo(id: number) {
    if(!confirm('Excluir arquivo?')) return;
    await supabase.from('anexos').delete().eq('id', id);
    carregarDados();
  }

  if (loading) return <div className="p-8 text-center text-slate-400">Carregando...</div>;

  // LÓGICA CORRIGIDA:
  // Futuro = Data futura E Status "agendado" (ou seja, ainda não foi resolvido)
  // Histórico = Tudo que já foi Concluído, Cancelado, OU datas passadas
  const agora = new Date();
  
  const agendamentosFuturos = historico.filter(h => 
    new Date(h.data_hora) > agora && h.status === 'agendado'
  ).reverse(); // Inverte para mostrar o mais próximo primeiro

  const agendamentosPassados = historico.filter(h => 
    new Date(h.data_hora) <= agora || h.status === 'concluido' || h.status === 'cancelado'
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-10">
      <Link href="/pacientes" className="inline-flex items-center text-slate-500 hover:text-teal-600 transition-colors font-medium text-sm">
        <ChevronLeft size={16} className="mr-1"/> Voltar para Lista
      </Link>

      {/* Header Perfil */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-start">
        <div className="w-24 h-24 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold text-3xl shrink-0">
            {paciente.nome.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-800">{paciente.nome}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-slate-500 text-sm">
                <div className="flex items-center gap-1"><Phone size={14}/> {paciente.telefone}</div>
                <div className="flex items-center gap-1"><Activity size={14}/> {historico.length} registros</div>
            </div>
            <a 
                href={\`https://wa.me/55\${paciente.telefone.replace(/[^0-9]/g, '')}\`} 
                target="_blank"
                className="mt-4 inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-100 transition-colors border border-green-200"
            >
                <Phone size={14} /> WhatsApp
            </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Esquerda: Próximas + Arquivos */}
        <div className="md:col-span-1 space-y-6">
            
            {/* Próximas */}
            <div className="space-y-2">
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                    <Clock size={16}/> Em Aberto
                </h3>
                {agendamentosFuturos.length === 0 ? (
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400">
                        Nada pendente.
                    </div>
                ) : (
                    agendamentosFuturos.map(item => (
                        <div key={item.id} className="bg-white p-3 rounded-xl border-l-4 border-l-blue-500 shadow-sm border border-slate-100">
                            <p className="font-bold text-slate-800 text-sm">{new Date(item.data_hora).toLocaleDateString('pt-BR')}</p>
                            <p className="text-xs text-blue-600 font-bold mb-1">
                                {new Date(item.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                            </p>
                            <p className="text-sm text-slate-600">{item.procedimento}</p>
                        </div>
                    ))
                )}
                
                <Link href="/agenda" className="block w-full text-center bg-teal-50 text-teal-700 py-2 rounded-lg font-bold text-xs hover:bg-teal-100 transition-colors">
                    + Agendar
                </Link>
            </div>

            {/* Arquivos */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm"><Paperclip size={16}/> Anexos</h3>
                    <label className="cursor-pointer text-teal-600 hover:text-teal-700 bg-teal-50 p-1.5 rounded-lg transition-colors">
                        <Upload size={16} />
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                </div>
                
                {uploading && <p className="text-xs text-teal-600 animate-pulse mb-2">Enviando...</p>}

                <div className="space-y-2">
                    {arquivos.length === 0 && <p className="text-xs text-slate-400 text-center py-2">Sem arquivos.</p>}
                    {arquivos.map(arq => (
                        <div key={arq.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg text-xs border border-slate-100 group">
                            <a href={arq.url} target="_blank" className="flex items-center gap-2 text-slate-600 hover:text-teal-600 font-medium truncate flex-1">
                                <FileText size={14} className="shrink-0"/> <span className="truncate">{arq.nome_arquivo}</span>
                            </a>
                            <button onClick={() => deletarArquivo(arq.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                        </div>
                    ))}
                </div>
            </div>

        </div>

        {/* Direita: Histórico (Concluídos e Passados) */}
        <div className="md:col-span-2 space-y-4">
            <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                <FileText size={16}/> Histórico Completo
            </h3>
            
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {agendamentosPassados.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        Nenhum histórico registrado.
                    </div>
                ) : (
                    agendamentosPassados.map(item => {
                        const isConcluido = item.status === 'concluido';
                        const isCancelado = item.status === 'cancelado';
                        
                        return (
                            <div key={item.id} className={\`p-4 hover:bg-slate-50 transition-colors flex gap-4 \${isCancelado ? 'opacity-60' : ''}\`}>
                                <div className="flex flex-col items-center min-w-[50px]">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(item.data_hora).toLocaleString('pt-BR', {month:'short'}).replace('.','')}</span>
                                    <span className="text-lg font-bold text-slate-700 leading-none">{new Date(item.data_hora).getDate()}</span>
                                    <span className="text-[10px] text-slate-400">{new Date(item.data_hora).getFullYear()}</span>
                                </div>
                                
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className={\`font-bold text-sm \${isCancelado ? 'text-slate-500 line-through' : 'text-slate-800'}\`}>
                                                {item.procedimento}
                                            </h4>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                {new Date(item.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            {isConcluido && (
                                                <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
                                                    <CheckCircle size={12}/> Concluído
                                                </span>
                                            )}
                                            {isCancelado && (
                                                <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100">
                                                    <XCircle size={12}/> Cancelado
                                                </span>
                                            )}
                                            {!isConcluido && !isCancelado && (
                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                                                    Pendente
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Observações */}
                                    {item.observacoes && (
                                        <div className="mt-2 bg-yellow-50 p-2 rounded-lg text-xs text-yellow-800 border border-yellow-100 italic">
                                            📝 {item.observacoes}
                                        </div>
                                    )}

                                    {/* VALOR PAGO (Só mostra se for concluído) */}
                                    {isConcluido && (
                                        <div className="mt-2 flex justify-end">
                                            <span className="text-sm font-bold text-slate-700">
                                                Valor Pago: <span className="text-green-600">R$ {Number(item.valor || 0).toFixed(2)}</span>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>

      </div>
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
fs.writeFileSync(targetPath, prontuarioCode.trim());

console.log('✅ Prontuário corrigido com sucesso!');