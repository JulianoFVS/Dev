const fs = require('fs');
const path = require('path');

console.log('👥 Instalando V29: CRM de Pacientes (Busca, Filtros e Visual Premium)...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Atualizado: ${caminhoRelativo}`);
}

const pacientesPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Search, Plus, Filter, LayoutGrid, List as ListIcon, 
    User, Phone, Calendar, MoreHorizontal, FileText, 
    Trash2, Edit, ChevronRight, Activity, Clock
} from 'lucide-react';
import Link from 'next/link';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visualizacao, setVisualizacao] = useState('cards'); // 'lista' ou 'cards'
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');

  // Modal e Formulários (Simplificado para focar na Lista)
  // Num cenário real, o botão "Novo" abriria o modal de cadastro que já temos

  useEffect(() => { carregarPacientes(); }, []);

  async function carregarPacientes() {
    setLoading(true);
    // Busca pacientes e seus últimos agendamentos para status
    const { data } = await supabase
        .from('pacientes')
        .select('*, agendamentos(data_hora, status)')
        .order('created_at', { ascending: false });
    
    if (data) {
        // Processa dados para enriquecer a lista
        const formatados = data.map(p => {
            const agendamentos = p.agendamentos || [];
            // Ordena agendamentos por data
            agendamentos.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));
            
            const ultimoAgendamento = agendamentos[0];
            const statusCalculado = ultimoAgendamento 
                ? (new Date(ultimoAgendamento.data_hora) > new Date() ? 'agendado' : 'ativo')
                : 'novo';

            return { ...p, status: statusCalculado, ultimo_atendimento: ultimoAgendamento?.data_hora };
        });
        setPacientes(formatados);
    }
    setLoading(false);
  }

  // --- LÓGICA DE FILTRO (CLIENT-SIDE PARA RAPIDEZ) ---
  const pacientesFiltrados = pacientes.filter(p => {
      const termo = busca.toLowerCase();
      const bateBusca = p.nome.toLowerCase().includes(termo) || 
                        (p.cpf || '').includes(termo) || 
                        (p.telefone || '').includes(termo);
      
      const bateStatus = filtroStatus === 'todos' ? true : p.status === filtroStatus;
      
      return bateBusca && bateStatus;
  });

  // Estatísticas Rápidas
  const stats = {
      total: pacientes.length,
      novos: pacientes.filter(p => {
          const dataCriacao = new Date(p.created_at);
          const hoje = new Date();
          return dataCriacao.getMonth() === hoje.getMonth() && dataCriacao.getFullYear() === hoje.getFullYear();
      }).length,
      ativos: pacientes.filter(p => p.status === 'ativo' || p.status === 'agendado').length
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* CABEÇALHO COM ESTATÍSTICAS */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Pacientes</h1>
            <p className="text-slate-500 font-medium">Gerencie o relacionamento com seus clientes.</p>
        </div>
        <Link href="/anamnese" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95">
            <Plus size={20}/> Novo Paciente
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase">Total Geral</span>
              <p className="text-2xl font-black text-slate-800 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Activity size={12} className="text-green-500"/> Ativos</span>
              <p className="text-2xl font-black text-slate-800 mt-1">{stats.ativos}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><User size={12} className="text-blue-500"/> Novos (Mês)</span>
              <p className="text-2xl font-black text-slate-800 mt-1">{stats.novos}</p>
          </div>
          {/* Espaço para futura métrica (ex: aniversariantes) */}
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 border-dashed flex items-center justify-center text-blue-400 text-sm font-bold">
              Em breve: Aniversariantes
          </div>
      </div>

      {/* BARRA DE FERRAMENTAS (BUSCA E FILTROS) */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
              <input 
                type="text" 
                placeholder="Buscar por nome, CPF ou telefone..." 
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium transition-all"
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
              <select 
                className="px-4 py-2.5 rounded-xl bg-slate-50 text-sm font-bold text-slate-600 outline-none cursor-pointer hover:bg-slate-100 border-r-8 border-transparent"
                value={filtroStatus}
                onChange={e => setFiltroStatus(e.target.value)}
              >
                  <option value="todos">Status: Todos</option>
                  <option value="ativo">Ativos</option>
                  <option value="novo">Novos</option>
                  <option value="agendado">Com Agendamento</option>
              </select>

              <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setVisualizacao('lista')} className={\`p-2 rounded-lg transition-all \${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}\`}><ListIcon size={20}/></button>
                  <button onClick={() => setVisualizacao('cards')} className={\`p-2 rounded-lg transition-all \${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}\`}><LayoutGrid size={20}/></button>
              </div>
          </div>
      </div>

      {/* CONTEÚDO PRINCIPAL (LISTA OU CARDS) */}
      {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2" size={32}/> Carregando pacientes...</div>
      ) : pacientesFiltrados.length === 0 ? (
          <div className="py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
              <User size={48} className="mx-auto mb-4 opacity-20"/>
              <p className="font-bold text-lg">Nenhum paciente encontrado.</p>
              <p className="text-sm">Tente mudar o termo de busca.</p>
          </div>
      ) : (
          visualizacao === 'lista' ? (
            // --- VISUALIZAÇÃO EM LISTA ---
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider pl-6">Nome</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Contato</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Última Visita</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right pr-6">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {pacientesFiltrados.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="p-4 pl-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 flex items-center justify-center font-bold border border-white shadow-sm">
                                            {p.nome.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-700">{p.nome}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">CPF: {p.cpf || '---'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                        <Phone size={14} className="text-slate-300"/> {p.telefone || 'Sem contato'}
                                    </div>
                                </td>
                                <td className="p-4 hidden md:table-cell">
                                    <div className="text-sm text-slate-500">
                                        {p.ultimo_atendimento ? new Date(p.ultimo_atendimento).toLocaleDateString('pt-BR') : 'Nunca'}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <StatusBadge status={p.status} />
                                </td>
                                <td className="p-4 text-right pr-6">
                                    <Link href={\`/pacientes/\${p.id}\`} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all"><ChevronRight size={20}/></Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          ) : (
            // --- VISUALIZAÇÃO EM CARDS ---
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pacientesFiltrados.map(p => (
                    <div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link href={\`/pacientes/\${p.id}\`} className="bg-white p-2 rounded-full shadow-sm text-slate-400 hover:text-blue-600 border border-slate-100"><Edit size={16}/></Link>
                        </div>
                        
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 flex items-center justify-center font-black text-xl shadow-inner">
                                {p.nome.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg leading-tight truncate w-40">{p.nome}</h3>
                                <StatusBadge status={p.status} />
                            </div>
                        </div>
                        
                        <div className="space-y-2 mb-4">
                            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-2 rounded-lg">
                                <Phone size={14} className="text-slate-400"/> {p.telefone || 'Sem telefone'}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-2 rounded-lg">
                                <Clock size={14} className="text-slate-400"/> Última: {p.ultimo_atendimento ? new Date(p.ultimo_atendimento).toLocaleDateString('pt-BR') : 'Nenhuma'}
                            </div>
                        </div>

                        <Link href="#" className="w-full block text-center py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors">
                            Ver Prontuário
                        </Link>
                    </div>
                ))}
            </div>
          )
      )}
    </div>
  );
}

function StatusBadge({ status }) {
    const styles = {
        ativo: 'bg-green-100 text-green-700 border-green-200',
        novo: 'bg-blue-100 text-blue-700 border-blue-200',
        agendado: 'bg-purple-100 text-purple-700 border-purple-200',
        inativo: 'bg-slate-100 text-slate-500 border-slate-200'
    };
    
    const labels = {
        ativo: 'Cliente Ativo',
        novo: 'Novo Cadastro',
        agendado: 'Agendado',
        inativo: 'Inativo'
    };

    return (
        <span className={\`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wide \${styles[status] || styles.inativo}\`}>
            {labels[status] || 'Desconhecido'}
        </span>
    );
}
`;

salvarArquivo('app/pacientes/page.tsx', pacientesPage);