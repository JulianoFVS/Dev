'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Plus, Search, Filter, Calendar, AlertCircle, CheckCircle, 
    User, Loader2, X, Save, Trash2, CheckSquare, ArrowRight, ArrowLeft,
    Clock, ChevronUp, ChevronDown, Building2, MoreVertical
} from 'lucide-react';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Tarefa {
    id: string;
    titulo: string;
    descricao: string;
    responsavel_id: number | null;
    prioridade: 'baixa' | 'media' | 'alta';
    status: 'a_fazer' | 'em_andamento' | 'concluido';
    data_limite: string | null;
    paciente_id: string | null;
    created_at: string;
    responsavel_nome?: string;
    paciente_nome?: string;
    paciente_telefone?: string;
    alerta_data?: 'atrasada' | 'proxima' | 'normal';
}

interface Profissional {
    id: number;
    nome: string;
}

interface Paciente {
    id: string;
    nome: string;
    telefone: string | null;
}

export default function Tarefas() {
    const { activeClinicId } = useClinica();
    const { showAlert, showConfirm } = useCustomAlert();
    const router = useRouter();
    
    const [tarefas, setTarefas] = useState<Tarefa[]>([]);
    const [profissionais, setProfissionais] = useState<Profissional[]>([]);
    const [pacientes, setPacientes] = useState<Paciente[]>([]);
    const [loading, setLoading] = useState(true);
    const [clinicas, setClinicas] = useState<any[]>([]);

    // Filtros
    const [filtroStatus, setFiltroStatus] = useState<string>('todos');
    const [filtroPrioridade, setFiltroPrioridade] = useState<string>('todos');
    const [filtroBusca, setFiltroBusca] = useState('');
    const [showFiltros, setShowFiltros] = useState(false);
    
    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [tarefaEditando, setTarefaEditando] = useState<Tarefa | null>(null);
    const [salvando, setSalvando] = useState(false);
    
    const [form, setForm] = useState({
        titulo: '',
        descricao: '',
        responsavel_id: '',
        prioridade: 'media' as 'baixa' | 'media' | 'alta',
        status: 'a_fazer' as 'a_fazer' | 'em_andamento' | 'concluido',
        data_limite: '',
        paciente_id: ''
    });

    useEffect(() => {
        carregarDados();
    }, [activeClinicId]);

    async function carregarDados() {
        setLoading(true);
        
        const listaClinicas = await fetchUserClinicas();
        setClinicas(listaClinicas);
        
        const clinicasIds = listaClinicas.map(c => c.id);
        
        if (clinicasIds.length === 0) {
            setLoading(false);
            return;
        }
        
        // Carregar tarefas
        const { data: tarefasData } = await supabase
            .from('v_tarefas_completo')
            .select('*')
            .in('clinica_id', clinicasIds)
            .order('data_limite', { ascending: true });
        
        setTarefas(tarefasData || []);
        
        // Carregar profissionais
        const { data: vinculosData } = await supabase
            .from('profissionais_clinicas')
            .select('profissional_id')
            .in('clinica_id', clinicasIds);
        
        const profissionalIds = [...new Set((vinculosData || []).map(v => v.profissional_id))];
        
        const { data: profsData } = profissionalIds.length > 0
            ? await supabase.from('profissionais').select('id, nome').in('id', profissionalIds)
            : { data: [] };
        
        setProfissionais(profsData || []);
        
        // Carregar pacientes (para o select)
        const { data: pacsData } = await supabase
            .from('pacientes')
            .select('id, nome, telefone')
            .in('clinica_id', clinicasIds)
            .order('nome');
        
        setPacientes(pacsData || []);
        setLoading(false);
    }

    function abrirNovaTarefa() {
        setTarefaEditando(null);
        setForm({
            titulo: '',
            descricao: '',
            responsavel_id: '',
            prioridade: 'media',
            status: 'a_fazer',
            data_limite: '',
            paciente_id: ''
        });
        setModalOpen(true);
    }

    function abrirEditarTarefa(t: Tarefa) {
        setTarefaEditando(t);
        setForm({
            titulo: t.titulo,
            descricao: t.descricao || '',
            responsavel_id: t.responsavel_id?.toString() || '',
            prioridade: t.prioridade,
            status: t.status,
            data_limite: t.data_limite || '',
            paciente_id: t.paciente_id?.toString() || ''
        });
        setModalOpen(true);
    }

    async function salvarTarefa() {
        if (!form.titulo.trim()) {
            showAlert('Título é obrigatório', { type: 'warning' });
            return;
        }

        const clinicasIds = clinicas.map(c => c.id);
        const clinicaId = activeClinicId && activeClinicId !== 'all' 
            ? activeClinicId 
            : clinicasIds[0];
        
        if (!clinicaId) {
            showAlert('Selecione uma clínica', { type: 'warning' });
            return;
        }

        setSalvando(true);

        const payload = {
            clinica_id: clinicaId,
            titulo: form.titulo.trim(),
            descricao: form.descricao.trim() || null,
            responsavel_id: form.responsavel_id ? parseInt(form.responsavel_id) : null,
            prioridade: form.prioridade,
            status: form.status,
            data_limite: form.data_limite || null,
            paciente_id: form.paciente_id ? parseInt(form.paciente_id) : null
        };

        if (tarefaEditando) {
            const { error } = await supabase
                .from('tarefas')
                .update(payload)
                .eq('id', tarefaEditando.id);
            
            if (error) showAlert('Erro ao atualizar: ' + error.message, { type: 'error' });
            else showAlert('Tarefa atualizada!', { type: 'success' });
        } else {
            const { error } = await supabase.from('tarefas').insert([payload]);
            if (error) showAlert('Erro ao criar: ' + error.message, { type: 'error' });
            else showAlert('Tarefa criada!', { type: 'success' });
        }

        setSalvando(false);
        setModalOpen(false);
        carregarDados();
    }

    async function excluirTarefa(id: string) {
        if (!(await showConfirm('Excluir esta tarefa?', { title: 'Excluir', type: 'warning' }))) return;
        
        const { error } = await supabase.from('tarefas').delete().eq('id', id);
        if (error) showAlert('Erro ao excluir: ' + error.message, { type: 'error' });
        else {
            showAlert('Tarefa excluída!', { type: 'success' });
            carregarDados();
        }
    }

    async function moverStatus(id: string, novoStatus: 'a_fazer' | 'em_andamento' | 'concluido') {
        const { error } = await supabase.from('tarefas').update({ status: novoStatus }).eq('id', id);
        if (error) showAlert('Erro ao mover: ' + error.message, { type: 'error' });
        else carregarDados();
    }

    // Filtrar tarefas
    const tarefasFiltradas = tarefas.filter(t => {
        if (filtroStatus !== 'todos' && t.status !== filtroStatus) return false;
        if (filtroPrioridade !== 'todos' && t.prioridade !== filtroPrioridade) return false;
        if (filtroBusca) {
            const busca = filtroBusca.toLowerCase();
            return t.titulo.toLowerCase().includes(busca) ||
                   (t.descricao?.toLowerCase().includes(busca)) ||
                   (t.paciente_nome?.toLowerCase().includes(busca));
        }
        return true;
    });

    const contagemTarefas = {
        a_fazer: tarefas.filter(t => t.status === 'a_fazer').length,
        em_andamento: tarefas.filter(t => t.status === 'em_andamento').length,
        concluido: tarefas.filter(t => t.status === 'concluido').length,
        atrasadas: tarefas.filter(t => t.alerta_data === 'atrasada' && t.status !== 'concluido').length,
        proximas: tarefas.filter(t => t.alerta_data === 'proxima' && t.status !== 'concluido').length
    };

    function getPrioridadeCor(p: string) {
        switch (p) {
            case 'alta': return 'bg-red-100 text-red-700 border-red-200';
            case 'media': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'baixa': return 'bg-blue-100 text-blue-700 border-blue-200';
            default: return 'bg-slate-100 text-slate-600';
        }
    }

    function getStatusLabel(s: string) {
        switch (s) {
            case 'a_fazer': return 'A Fazer';
            case 'em_andamento': return 'Em Andamento';
            case 'concluido': return 'Concluído';
            default: return s;
        }
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-800">Tarefas</h1>
                    <p className="text-sm text-slate-500">Organize as atividades da clínica.</p>
                </div>
                <button onClick={abrirNovaTarefa} className="flex-1 sm:flex-none bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2 text-sm">
                    <Plus size={18}/> Nova Tarefa
                </button>
            </div>

            {/* Alertas */}
            {(contagemTarefas.atrasadas > 0 || contagemTarefas.proximas > 0) && (
                <div className="flex flex-wrap gap-3">
                    {contagemTarefas.atrasadas > 0 && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
                            <AlertCircle size={18}/>
                            <span className="font-bold">{contagemTarefas.atrasadas} tarefa(s) atrasada(s)</span>
                        </div>
                    )}
                    {contagemTarefas.proximas > 0 && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl flex items-center gap-2">
                            <Clock size={18}/>
                            <span className="font-bold">{contagemTarefas.proximas} vencendo em breve</span>
                        </div>
                    )}
                </div>
            )}

            {/* Kanban Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-600">A Fazer</span>
                        <span className="bg-slate-200 text-slate-700 text-xs font-black px-2 py-1 rounded-full">{contagemTarefas.a_fazer}</span>
                    </div>
                </div>
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-blue-700">Em Andamento</span>
                        <span className="bg-blue-200 text-blue-700 text-xs font-black px-2 py-1 rounded-full">{contagemTarefas.em_andamento}</span>
                    </div>
                </div>
                <div className="bg-green-50 p-4 rounded-2xl border border-green-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-green-700">Concluído</span>
                        <span className="bg-green-200 text-green-700 text-xs font-black px-2 py-1 rounded-full">{contagemTarefas.concluido}</span>
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
                        <input 
                            type="text" 
                            placeholder="Buscar tarefas..." 
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                            value={filtroBusca}
                            onChange={e => setFiltroBusca(e.target.value)}
                        />
                    </div>
                    <button onClick={() => setShowFiltros(!showFiltros)} className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${showFiltros ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                        <Filter size={16}/> Filtros
                    </button>
                </div>
                
                {showFiltros && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-3 animate-in fade-in">
                        <select 
                            value={filtroStatus} 
                            onChange={e => setFiltroStatus(e.target.value)}
                            className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold"
                        >
                            <option value="todos">Todos os status</option>
                            <option value="a_fazer">A Fazer</option>
                            <option value="em_andamento">Em Andamento</option>
                            <option value="concluido">Concluído</option>
                        </select>
                        <select 
                            value={filtroPrioridade} 
                            onChange={e => setFiltroPrioridade(e.target.value)}
                            className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold"
                        >
                            <option value="todos">Todas as prioridades</option>
                            <option value="alta">Alta</option>
                            <option value="media">Média</option>
                            <option value="baixa">Baixa</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Lista de Tarefas */}
            {loading ? (
                <div className="py-20 text-center text-slate-400">
                    <Loader2 className="animate-spin mx-auto mb-2"/> Carregando...
                </div>
            ) : tarefasFiltradas.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <CheckCircle size={48} className="mx-auto mb-4 opacity-50"/>
                    <p className="font-bold">Nenhuma tarefa encontrada</p>
                    <p className="text-sm">Crie uma nova tarefa para começar</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tarefasFiltradas.map(t => (
                        <div 
                            key={t.id} 
                            className={`bg-white p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all ${
                                t.alerta_data === 'atrasada' && t.status !== 'concluido' 
                                    ? 'border-red-300 bg-red-50/30' 
                                    : t.alerta_data === 'proxima' && t.status !== 'concluido'
                                        ? 'border-amber-300 bg-amber-50/30'
                                        : 'border-slate-200'
                            }`}
                        >
                            <div className="flex items-start gap-4">
                                {/* Status indicator */}
                                <div className="flex flex-col gap-1 pt-1">
                                    {t.status !== 'concluido' && (
                                        <button 
                                            onClick={() => moverStatus(t.id, t.status === 'a_fazer' ? 'em_andamento' : 'concluido')}
                                            className="p-1.5 bg-slate-100 hover:bg-blue-100 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"
                                            title="Avançar status"
                                        >
                                            <ChevronUp size={16}/>
                                        </button>
                                    )}
                                    {t.status !== 'a_fazer' && (
                                        <button 
                                            onClick={() => moverStatus(t.id, t.status === 'concluido' ? 'em_andamento' : 'a_fazer')}
                                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                                            title="Voltar status"
                                        >
                                            <ChevronDown size={16}/>
                                        </button>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <h3 className={`font-bold text-slate-800 ${t.status === 'concluido' ? 'line-through text-slate-400' : ''}`}>
                                            {t.titulo}
                                        </h3>
                                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border ${getPrioridadeCor(t.prioridade)}`}>
                                            {t.prioridade}
                                        </span>
                                    </div>
                                    
                                    {t.descricao && (
                                        <p className="text-sm text-slate-500 mb-3">{t.descricao}</p>
                                    )}

                                    <div className="flex flex-wrap items-center gap-3 text-xs">
                                        {t.responsavel_nome && (
                                            <span className="flex items-center gap-1 text-slate-600">
                                                <User size={12}/> {t.responsavel_nome}
                                            </span>
                                        )}
                                        {t.data_limite && (
                                            <span className={`flex items-center gap-1 ${
                                                t.alerta_data === 'atrasada' && t.status !== 'concluido' 
                                                    ? 'text-red-600 font-bold' 
                                                    : t.alerta_data === 'proxima' && t.status !== 'concluido'
                                                        ? 'text-amber-600 font-bold'
                                                        : 'text-slate-500'
                                            }`}>
                                                <Calendar size={12}/> 
                                                {new Date(t.data_limite).toLocaleDateString('pt-BR')}
                                                {t.alerta_data === 'atrasada' && t.status !== 'concluido' && ' (Atrasada)'}
                                            </span>
                                        )}
                                        {t.paciente_nome && (
                                            <Link 
                                                href={`/pacientes/${t.paciente_id}`}
                                                className="flex items-center gap-1 text-blue-600 hover:underline"
                                            >
                                                <Building2 size={12}/> {t.paciente_nome}
                                            </Link>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => abrirEditarTarefa(t)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Editar"
                                    >
                                        <MoreVertical size={16}/>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal Criar/Editar */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 border border-slate-100">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-white rounded-t-3xl">
                            <h3 className="font-black text-xl text-slate-800">
                                {tarefaEditando ? 'Editar Tarefa' : 'Nova Tarefa'}
                            </h3>
                            <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">
                                <X size={20}/>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Título *</label>
                                <input 
                                    value={form.titulo}
                                    onChange={e => setForm({...form, titulo: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"
                                    placeholder="Nome da tarefa"
                                />
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Descrição</label>
                                <textarea 
                                    value={form.descricao}
                                    onChange={e => setForm({...form, descricao: e.target.value})}
                                    rows={3}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 resize-none"
                                    placeholder="Detalhes da tarefa..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Responsável</label>
                                    <select 
                                        value={form.responsavel_id}
                                        onChange={e => setForm({...form, responsavel_id: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                                    >
                                        <option value="">Sem responsável</option>
                                        {profissionais.map(p => (
                                            <option key={p.id} value={p.id}>{p.nome}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Data Limite</label>
                                    <input 
                                        type="date"
                                        value={form.data_limite}
                                        onChange={e => setForm({...form, data_limite: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Prioridade</label>
                                    <select 
                                        value={form.prioridade}
                                        onChange={e => setForm({...form, prioridade: e.target.value as 'baixa' | 'media' | 'alta'})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                                    >
                                        <option value="baixa">Baixa</option>
                                        <option value="media">Média</option>
                                        <option value="alta">Alta</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Status</label>
                                    <select 
                                        value={form.status}
                                        onChange={e => setForm({...form, status: e.target.value as 'a_fazer' | 'em_andamento' | 'concluido'})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                                    >
                                        <option value="a_fazer">A Fazer</option>
                                        <option value="em_andamento">Em Andamento</option>
                                        <option value="concluido">Concluído</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Vincular Paciente (opcional)</label>
                                <select 
                                    value={form.paciente_id}
                                    onChange={e => setForm({...form, paciente_id: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                                >
                                    <option value="">Nenhum paciente</option>
                                    {pacientes.map(p => (
                                        <option key={p.id} value={p.id}>{p.nome}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 rounded-b-3xl">
                            {tarefaEditando && (
                                <button 
                                    onClick={() => excluirTarefa(tarefaEditando.id)}
                                    className="px-4 py-3 text-red-600 font-bold hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
                                >
                                    <Trash2 size={18}/> Excluir
                                </button>
                            )}
                            <button onClick={() => setModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-colors">
                                Cancelar
                            </button>
                            <button 
                                onClick={salvarTarefa}
                                disabled={salvando}
                                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                            >
                                {salvando ? <Loader2 className="animate-spin"/> : <><Save size={18}/> Salvar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
