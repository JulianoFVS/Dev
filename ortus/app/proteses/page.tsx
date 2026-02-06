'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Plus, Trash2, Edit, Calendar, Smile, ArrowRight, ArrowLeft, X, Layout, GripVertical, Settings2, Loader2
} from 'lucide-react';

export default function KanbanProteses() {
    const [colunas, setColunas] = useState<any[]>([]);
    const [cartoes, setCartoes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [clinicaId, setClinicaId] = useState<string | null>(null);

    // --- DRAG AND DROP STATE ---
    const [draggedCartao, setDraggedCartao] = useState<any>(null);
    const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);

    // Modais
    const [modalColuna, setModalColuna] = useState(false);
    const [nomeColuna, setNomeColuna] = useState('');
    
    const [modalCartao, setModalCartao] = useState(false);
    const [formCartao, setFormCartao] = useState({ 
        id: '', coluna_id: '', paciente_nome: '', descricao: '', 
        tipo_protese: '', data_entrega: '', valor: '0' 
    });

    useEffect(() => {
        const id = typeof window !== 'undefined' ? localStorage.getItem('ortus_clinica_id') : null;
        setClinicaId(id);
        carregarQuadro(id);
    }, []);

    async function carregarQuadro(idClinica: string | null) {
        setLoading(true);
        try {
            let qCol = supabase.from('kanban_colunas').select('*').order('ordem', { ascending: true });
            if(idClinica) qCol = qCol.eq('clinica_id', idClinica);
            const { data: cols } = await qCol;

            let qCard = supabase.from('kanban_cartoes').select('*').order('created_at', { ascending: false });
            if(idClinica) qCard = qCard.eq('clinica_id', idClinica);
            const { data: cards } = await qCard;

            setColunas(cols || []);
            setCartoes(cards || []);
        } catch (e) { console.error("Erro ao carregar:", e); }
        setLoading(false);
    }

    // --- GERENCIAR COLUNAS ---
    async function criarColuna() {
        if (!nomeColuna) return;
        const novaOrdem = colunas.length + 1;
        const payload = { titulo: nomeColuna, ordem: novaOrdem, clinica_id: clinicaId };
        
        const { error } = await supabase.from('kanban_colunas').insert([payload]);
        if (error) alert('Erro ao criar: ' + error.message);
        else { setModalColuna(false); setNomeColuna(''); carregarQuadro(clinicaId); }
    }

    async function excluirColuna(id: number) {
        if(!confirm('Excluir esta etapa e todos os cartões nela?')) return;
        await supabase.from('kanban_colunas').delete().eq('id', id);
        carregarQuadro(clinicaId);
    }

    // --- GERENCIAR CARTÕES ---
    function abrirNovoCartao(idColuna?: string) {
        if (colunas.length === 0) return alert("Crie uma etapa primeiro!");
        setFormCartao({ 
            id: '', 
            coluna_id: idColuna || (colunas[0]?.id || ''), 
            paciente_nome: '', descricao: '', tipo_protese: '', data_entrega: '', valor: '0' 
        });
        setModalCartao(true);
    }

    async function salvarCartao() {
        if (!formCartao.paciente_nome || !formCartao.coluna_id) return alert('Preencha o paciente e a etapa.');
        
        const payload = {
            coluna_id: formCartao.coluna_id,
            clinica_id: clinicaId,
            paciente_nome: formCartao.paciente_nome,
            descricao: formCartao.descricao,
            tipo_protese: formCartao.tipo_protese,
            data_entrega: formCartao.data_entrega || null,
            valor: parseFloat(formCartao.valor)
        };

        const { error } = formCartao.id 
            ? await supabase.from('kanban_cartoes').update(payload).eq('id', formCartao.id)
            : await supabase.from('kanban_cartoes').insert([payload]);

        if (error) alert('Erro ao salvar: ' + error.message);
        else { setModalCartao(false); carregarQuadro(clinicaId); }
    }

    // --- LÓGICA DRAG & DROP ---
    function handleOnDragOver(e: React.DragEvent, colunaId: number) {
        e.preventDefault(); 
        setDragOverColumn(colunaId);
    }

    async function handleOnDrop(e: React.DragEvent, colunaId: number) {
        e.preventDefault();
        setDragOverColumn(null);

        if (!draggedCartao) return;
        if (draggedCartao.coluna_id === colunaId) return;

        const novosCartoes = cartoes.map(c => 
            c.id === draggedCartao.id ? { ...c, coluna_id: colunaId } : c
        );
        setCartoes(novosCartoes);

        await supabase.from('kanban_cartoes').update({ coluna_id: colunaId }).eq('id', draggedCartao.id);
        setDraggedCartao(null);
    }

    async function moverCartaoClique(cartao: any, direcao: 'esq' | 'dir') {
        const indexAtual = colunas.findIndex(c => c.id === cartao.coluna_id);
        if (indexAtual === -1) return;
        const novoIndex = direcao === 'dir' ? indexAtual + 1 : indexAtual - 1;
        if (novoIndex < 0 || novoIndex >= colunas.length) return;
        
        const novaColuna = colunas[novoIndex];
        const novosCartoes = cartoes.map(c => c.id === cartao.id ? { ...c, coluna_id: novaColuna.id } : c);
        setCartoes(novosCartoes);
        await supabase.from('kanban_cartoes').update({ coluna_id: novaColuna.id }).eq('id', cartao.id);
    }

    async function excluirCartao(id: number) {
        if(!confirm('Excluir este trabalho?')) return;
        await supabase.from('kanban_cartoes').delete().eq('id', id);
        carregarQuadro(clinicaId);
    }

    return (
        // AQUI ESTÁ O TRUQUE: CSS INLINE PARA FORÇAR A ALTURA
        // calc(100vh - 100px) garante que sempre sobra espaço pro cabeçalho e não estoura.
        <div style={{ height: 'calc(100vh - 100px)' }} className="flex flex-col space-y-4 animate-fade-in relative overflow-hidden pb-2">
            
            {/* CABEÇALHO */}
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex-none z-10 relative">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <Smile className="text-pink-500" size={28}/> Controle de Prótese
                    </h1>
                    <p className="text-slate-500 font-medium text-sm mt-1">Gerencie o fluxo do laboratório.</p>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={() => setModalColuna(true)} className="px-4 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 flex items-center gap-2 transition-colors text-sm shadow-sm border border-slate-200">
                        <Layout size={18}/> <span className="hidden sm:inline">Nova Etapa</span>
                    </button>
                    <button onClick={() => abrirNovoCartao()} className="px-5 py-2.5 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 shadow-lg shadow-pink-200 flex items-center gap-2 transition-transform active:scale-95 text-sm">
                        <Plus size={18}/> Novo Trabalho
                    </button>
                </div>
            </div>

            {/* ÁREA DO KANBAN (QUADRO BRANCO) */}
            <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative flex flex-col min-h-0">
                
                <div className="p-3 border-b border-slate-50 bg-slate-50/30 flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider flex-none">
                    <Settings2 size={14}/> Quadro de Produção
                </div>

                {/* SCROLL HORIZONTAL */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar p-4">
                    <div className="flex gap-5 h-full min-w-max">
                        
                        {loading && (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <Loader2 className="animate-spin mr-2"/> Carregando quadro...
                            </div>
                        )}

                        {!loading && colunas.length === 0 && (
                            <div className="flex flex-col items-center justify-center w-full h-full text-slate-300 border-2 border-dashed border-slate-100 rounded-3xl m-auto max-w-lg min-h-[300px]">
                                <Layout size={64} className="mb-4 opacity-20"/>
                                <p className="font-bold text-lg">Seu quadro está vazio</p>
                                <p className="text-sm mb-6">Crie etapas para organizar o fluxo (ex: Enviado, Prova, Finalizado)</p>
                                <button onClick={() => setModalColuna(true)} className="text-blue-600 font-bold hover:underline">Criar primeira etapa</button>
                            </div>
                        )}

                        {colunas.map((coluna, index) => (
                            <div key={coluna.id} className="w-80 flex flex-col h-full max-h-full bg-slate-50 rounded-2xl border border-slate-100/80 shadow-sm flex-none">
                                
                                {/* TÍTULO DA COLUNA */}
                                <div className="p-3 flex justify-between items-center border-b border-slate-100/50 flex-none">
                                    <h3 className="font-black text-slate-700 uppercase text-xs tracking-wide flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
                                        {coluna.titulo} 
                                        <span className="bg-white text-slate-500 text-[10px] px-1.5 py-0.5 rounded-md border border-slate-100 shadow-sm">{cartoes.filter(c => c.coluna_id === coluna.id).length}</span>
                                    </h3>
                                    <button onClick={() => excluirColuna(coluna.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-white"><Trash2 size={14}/></button>
                                </div>

                                {/* ÁREA DE DROP (COLUNA) */}
                                <div 
                                    onDragOver={(e) => handleOnDragOver(e, coluna.id)}
                                    onDrop={(e) => handleOnDrop(e, coluna.id)}
                                    onDragLeave={() => setDragOverColumn(null)}
                                    className={`p-2 flex-1 overflow-y-auto custom-scrollbar space-y-2.5 transition-colors min-h-0 ${dragOverColumn === coluna.id ? 'bg-blue-50/50' : ''}`}
                                >
                                    {cartoes.filter(c => c.coluna_id === coluna.id).map(card => (
                                        <div 
                                            key={card.id}
                                            draggable
                                            onDragStart={() => setDraggedCartao(card)}
                                            onDragEnd={() => setDraggedCartao(null)}
                                            className={`bg-white p-3.5 rounded-xl border shadow-sm hover:shadow-md transition-all group relative cursor-grab active:cursor-grabbing ${draggedCartao?.id === card.id ? 'opacity-40 border-dashed border-slate-400 scale-95' : 'border-slate-200'}`}
                                        >
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                <button onClick={() => { setFormCartao(card); setModalCartao(true); }} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-500"><Edit size={12}/></button>
                                                <button onClick={() => excluirCartao(card.id)} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"><Trash2 size={12}/></button>
                                            </div>

                                            <div className="mb-1.5">
                                                <span className="text-[9px] font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-md uppercase tracking-wider">{card.tipo_protese || 'Geral'}</span>
                                            </div>
                                            <h4 className="font-bold text-slate-800 leading-snug mb-1">{card.paciente_nome}</h4>
                                            <p className="text-xs text-slate-500 line-clamp-2 mb-2">{card.descricao}</p>

                                            {card.data_entrega && (
                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                                    <Calendar size={10} className="text-orange-500"/> 
                                                    {new Date(card.data_entrega).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    
                                    <button onClick={() => abrirNovoCartao(coluna.id)} className="w-full py-2.5 border border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-[10px] hover:border-pink-300 hover:text-pink-500 hover:bg-pink-50/50 transition-all flex items-center justify-center gap-1 opacity-60 hover:opacity-100">
                                        <Plus size={12}/> Adicionar
                                    </button>
                                </div>
                            </div>
                        ))}
                        
                        {/* BOTÃO NOVA COLUNA (FINAL DA LISTA) */}
                        <div className="w-80 flex-none h-full p-2">
                            <button onClick={() => setModalColuna(true)} className="w-full h-12 bg-white border border-dashed border-slate-300 rounded-xl text-slate-400 font-bold flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                                <Plus size={18}/> Nova Etapa
                            </button>
                        </div>
                        
                    </div>
                </div>
            </div>

            {/* MODAL NOVA COLUNA */}
            {modalColuna && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm animate-in zoom-in-95">
                        <h3 className="font-bold text-lg mb-4 text-slate-800">Nova Etapa do Fluxo</h3>
                        <input autoFocus value={nomeColuna} onChange={e => setNomeColuna(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-pink-500" placeholder="Ex: Prova, Polimento..."/>
                        <div className="flex gap-2 mt-4">
                            <button onClick={() => setModalColuna(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Cancelar</button>
                            <button onClick={criarColuna} className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900">Criar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CARTÃO */}
            {modalCartao && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-slate-800">Detalhes do Trabalho</h3>
                            <button onClick={() => setModalCartao(false)}><X className="text-slate-400 hover:text-slate-600"/></button>
                        </div>
                        
                        <div className="space-y-4 overflow-y-auto flex-1 custom-scrollbar px-1">
                            <div><label className="text-xs font-bold text-slate-400 uppercase">Paciente</label><input value={formCartao.paciente_nome} onChange={e => setFormCartao({...formCartao, paciente_nome: e.target.value})} className="w-full p-3 border rounded-xl font-bold" placeholder="Nome do paciente"/></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-slate-400 uppercase">Etapa Atual</label><select value={formCartao.coluna_id} onChange={e => setFormCartao({...formCartao, coluna_id: e.target.value})} className="w-full p-3 border rounded-xl bg-white font-medium">{colunas.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}</select></div>
                                <div><label className="text-xs font-bold text-slate-400 uppercase">Tipo</label><input value={formCartao.tipo_protese} onChange={e => setFormCartao({...formCartao, tipo_protese: e.target.value})} className="w-full p-3 border rounded-xl font-medium" placeholder="Ex: PT Superior"/></div>
                            </div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase">Descrição / Observações</label><textarea rows={3} value={formCartao.descricao} onChange={e => setFormCartao({...formCartao, descricao: e.target.value})} className="w-full p-3 border rounded-xl font-medium" placeholder="Cor A2, dente 11 e 21..."/></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-slate-400 uppercase">Data Entrega</label><input type="date" value={formCartao.data_entrega || ''} onChange={e => setFormCartao({...formCartao, data_entrega: e.target.value})} className="w-full p-3 border rounded-xl font-medium"/></div>
                                <div><label className="text-xs font-bold text-slate-400 uppercase">Valor (R$)</label><input type="number" value={formCartao.valor} onChange={e => setFormCartao({...formCartao, valor: e.target.value})} className="w-full p-3 border rounded-xl font-medium"/></div>
                            </div>
                        </div>

                        <button onClick={salvarCartao} className="mt-6 w-full py-4 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 shadow-lg shadow-pink-200">Salvar Trabalho</button>
                    </div>
                </div>
            )}
        </div>
    );
}