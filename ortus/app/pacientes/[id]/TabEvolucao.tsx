'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ClipboardList, Clock, Calendar, User, Trash2, Save, Loader2, Printer } from 'lucide-react';

type Props = {
    id: string;
    form: any;
    ficha: any;
    setFicha: (f: any) => void;
    evolucoes: any[];
    setEvolucoes: (e: any[]) => void;
};

export default function TabEvolucao({ id, form, ficha, setFicha, evolucoes, setEvolucoes }: Props) {
    const [novaEvolucao, setNovaEvolucao] = useState({ texto: '', data: new Date().toISOString().split('T')[0], profissional: '' });
    const [savingEvo, setSavingEvo] = useState(false);

    async function salvarEvolucao() {
        if (!novaEvolucao.texto.trim()) return alert('Preencha o texto da evolução.');
        setSavingEvo(true);
        const nova = { id: Date.now().toString(), texto: novaEvolucao.texto.trim(), data: novaEvolucao.data, profissional: novaEvolucao.profissional || 'Dr(a).', criado_em: new Date().toISOString() };
        const novaLista = [nova, ...evolucoes];
        const fichaMerged = { ...ficha, evolucoes: novaLista };
        const { error } = await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
        if (error) { alert('Erro: ' + error.message); setSavingEvo(false); return; }
        setEvolucoes(novaLista);
        setFicha(fichaMerged);
        setNovaEvolucao({ texto: '', data: new Date().toISOString().split('T')[0], profissional: novaEvolucao.profissional });
        setSavingEvo(false);
    }

    async function excluirEvolucao(eid: string) {
        if (!confirm('Excluir esta evolução?')) return;
        const novaLista = evolucoes.filter((e: any) => e.id !== eid);
        const fichaMerged = { ...ficha, evolucoes: novaLista };
        await supabase.from('pacientes').update({ ficha_medica: fichaMerged }).eq('id', id);
        setEvolucoes(novaLista);
        setFicha(fichaMerged);
    }

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-5"><ClipboardList size={20} className="text-teal-500"/> Evolução Clínica</h3>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Data do Atendimento</label>
                            <input type="date" value={novaEvolucao.data} onChange={e => setNovaEvolucao({ ...novaEvolucao, data: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Profissional</label>
                            <input placeholder="Ex: Dr(a). Silva" value={novaEvolucao.profissional} onChange={e => setNovaEvolucao({ ...novaEvolucao, profissional: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500"/>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Relato da Evolução</label>
                        <textarea rows={5} placeholder="Descreva o atendimento realizado, observações clínicas, conduta adotada, medicamentos prescritos, próximos passos..." value={novaEvolucao.texto} onChange={e => setNovaEvolucao({ ...novaEvolucao, texto: e.target.value })} className="w-full p-3 border border-slate-200 rounded-xl text-sm leading-relaxed outline-none focus:ring-2 focus:ring-teal-500 resize-none"/>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={salvarEvolucao} disabled={savingEvo || !novaEvolucao.texto.trim()} className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-all">
                            {savingEvo ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Registrar Evolução
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-sm font-black text-slate-600 flex items-center gap-2 uppercase tracking-wider"><Clock size={16} className="text-teal-500"/> Registros Anteriores ({evolucoes.length})</h3>
                    {evolucoes.length > 0 && (
                        <button onClick={() => {
                            const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Prontuário — ${form.nome}</title><script src="https://cdn.tailwindcss.com"><\/script><style>@media print{.no-print{display:none!important}body{background:white!important}}</style></head><body class="bg-slate-100 p-8"><div class="no-print text-center mb-4"><button onclick="window.print()" class="bg-teal-600 text-white px-6 py-2 rounded-lg font-bold text-sm">Imprimir</button></div><div class="max-w-[210mm] mx-auto bg-white p-10 shadow-lg rounded"><div class="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between"><div><h1 class="text-2xl font-black text-slate-800">ORTUS</h1><p class="text-xs text-slate-400 font-semibold uppercase tracking-widest">Prontuário de Evolução Clínica</p></div><div class="text-right text-xs text-slate-500"><div><b>Paciente:</b> ${form.nome}</div><div><b>CPF:</b> ${form.cpf || '-'}</div></div></div>${evolucoes.map((ev: any) => `<div class="mb-6 pb-6 border-b border-slate-100"><div class="flex justify-between mb-2"><span class="text-xs font-bold text-teal-700">${new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span><span class="text-xs text-slate-400">${ev.profissional}</span></div><p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">${ev.texto}</p></div>`).join('')}<div class="mt-12 pt-6 border-t border-slate-200 text-center"><div class="w-64 mx-auto border-t border-slate-400 pt-2 text-xs text-slate-500 font-semibold">Assinatura do Profissional</div></div></div></body></html>`;
                            const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); }
                        }} className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"><Printer size={12}/> Imprimir Prontuário</button>
                    )}
                </div>
                {evolucoes.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
                        <ClipboardList className="mx-auto mb-2 text-slate-300" size={36}/>
                        <p className="text-sm">Nenhuma evolução registrada.</p>
                        <p className="text-xs mt-1">Registre o relato de cada atendimento acima.</p>
                    </div>
                ) : (
                    <div className="relative border-l-2 border-teal-100 ml-3 space-y-6 pb-2">
                        {evolucoes.map((ev: any) => (
                            <div key={ev.id} className="ml-8 relative group">
                                <div className="absolute -left-[37px] top-1.5 w-4 h-4 rounded-full border-[3px] border-white bg-teal-500 shadow-sm"></div>
                                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60 hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                                            <span className="flex items-center gap-1 text-teal-700 bg-teal-50 px-2 py-0.5 rounded"><Calendar size={12}/> {new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                            <span className="flex items-center gap-1"><User size={12}/> {ev.profissional}</span>
                                        </div>
                                        <button onClick={() => excluirEvolucao(ev.id)} className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all" title="Excluir"><Trash2 size={13}/></button>
                                    </div>
                                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{ev.texto}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
