const fs = require('fs');
const path = require('path');

console.log('💊 Criando o Prontuário Eletrônico...');

const prontuarioCode = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Phone, Calendar, Clock, FileText, ChevronLeft, MapPin, Activity } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Prontuario() {
  const params = useParams();
  const router = useRouter();
  const [paciente, setPaciente] = useState<any>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregarDados() {
      // 1. Busca dados do Paciente
      const { data: pac, error } = await supabase
        .from('pacientes')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error || !pac) {
        alert('Paciente não encontrado!');
        router.push('/pacientes');
        return;
      }
      setPaciente(pac);

      // 2. Busca histórico de agendamentos dele
      const { data: agenda } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('paciente_id', params.id)
        .order('data_hora', { ascending: false }); // Do mais recente para o antigo

      if (agenda) setHistorico(agenda);
      setLoading(false);
    }

    carregarDados();
  }, [params.id, router]);

  if (loading) return <div className="p-8 text-center text-slate-400">Carregando prontuário...</div>;

  // Separa o que é futuro do que é passado
  const agora = new Date();
  const agendamentosFuturos = historico.filter(h => new Date(h.data_hora) > agora);
  const agendamentosPassados = historico.filter(h => new Date(h.data_hora) <= agora);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-10">
      
      {/* Botão Voltar */}
      <Link href="/pacientes" className="inline-flex items-center text-slate-500 hover:text-teal-600 transition-colors font-medium text-sm">
        <ChevronLeft size={16} className="mr-1"/> Voltar para Lista
      </Link>

      {/* Cartão de Perfil */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-start">
        <div className="w-24 h-24 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold text-3xl shrink-0">
            {paciente.nome.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-800">{paciente.nome}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-slate-500 text-sm">
                <div className="flex items-center gap-1"><Phone size={14}/> {paciente.telefone}</div>
                <div className="flex items-center gap-1"><Calendar size={14}/> Cadastrado em {new Date(paciente.created_at).toLocaleDateString('pt-BR')}</div>
                <div className="flex items-center gap-1"><Activity size={14}/> {historico.length} consultas registradas</div>
            </div>
            {/* Botão de WhatsApp Rápido */}
            <a 
                href={\`https://wa.me/55\${paciente.telefone.replace(/[^0-9]/g, '')}\`} 
                target="_blank"
                className="mt-4 inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-100 transition-colors border border-green-200"
            >
                <Phone size={14} /> Chamar no WhatsApp
            </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Coluna da Esquerda: Próximos Agendamentos */}
        <div className="md:col-span-1 space-y-4">
            <h3 className="font-bold text-slate-700 flex items-center gap-2"><Calendar size={18}/> Próximas Consultas</h3>
            {agendamentosFuturos.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-sm text-slate-400">
                    Nada agendado.
                </div>
            ) : (
                agendamentosFuturos.map(item => (
                    <div key={item.id} className="bg-white p-4 rounded-xl border-l-4 border-l-teal-500 shadow-sm border border-slate-100">
                        <p className="font-bold text-slate-800">{new Date(item.data_hora).toLocaleDateString('pt-BR')}</p>
                        <p className="text-sm text-teal-600 font-bold mb-1">{new Date(item.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p>
                        <p className="text-sm text-slate-600">{item.procedimento}</p>
                    </div>
                ))
            )}
            
            <Link href="/agenda" className="block w-full text-center bg-teal-50 text-teal-700 py-2 rounded-lg font-bold text-sm hover:bg-teal-100 transition-colors">
                + Novo Agendamento
            </Link>
        </div>

        {/* Coluna da Direita: Histórico Clínico (Timeline) */}
        <div className="md:col-span-2 space-y-4">
            <h3 className="font-bold text-slate-700 flex items-center gap-2"><FileText size={18}/> Histórico Clínico</h3>
            
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {agendamentosPassados.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        Nenhum atendimento realizado anteriormente.
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {agendamentosPassados.map(item => (
                            <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex gap-4">
                                <div className="flex flex-col items-center min-w-[60px]">
                                    <span className="text-xs font-bold text-slate-400 uppercase">{new Date(item.data_hora).toLocaleString('pt-BR', {month:'short'}).replace('.','')}</span>
                                    <span className="text-xl font-bold text-slate-700">{new Date(item.data_hora).getDate()}</span>
                                    <span className="text-xs text-slate-400">{new Date(item.data_hora).getFullYear()}</span>
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-slate-800">{item.procedimento}</h4>
                                        <span className={\`text-xs px-2 py-0.5 rounded-full border \${item.status === 'concluido' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}\`}>
                                            {item.status || 'Agendado'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-1">Realizado às {new Date(item.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p>
                                    {item.observacoes && (
                                        <div className="mt-2 bg-yellow-50 p-2 rounded-lg text-sm text-yellow-800 border border-yellow-100">
                                            📝 {item.observacoes}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
}
`;

// Função auxiliar para criar diretórios recursivamente
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

const targetPath = path.join('app', 'pacientes', '[id]', 'page.tsx');
ensureDirectoryExistence(targetPath);
fs.writeFileSync(targetPath, prontuarioCode.trim());

console.log('✅ Prontuário Instalado! Agora clique em um paciente na lista.');