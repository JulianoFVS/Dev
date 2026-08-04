'use client';

import { useState, useEffect } from 'react';
import { ClipboardList, Clock, Calendar, User, Trash2, Save, Loader2, Printer } from 'lucide-react';

import { supabase } from '@/lib/supabase';

import { useCustomAlert } from '@/components/ui/CustomAlert';

import { criarEvolucao, excluirEvolucao as excluirEvolucaoDb } from '@/lib/db/evolucoes';

import { printDocument, printSignatureBlock, escapePrintHtml } from '@/lib/printDocument';



type Props = {

    id: string;

    form: any;

    ficha: any;

    setFicha: (f: any) => void;

    evolucoes: any[];

    setEvolucoes: (e: any[]) => void;

};



export default function TabEvolucao({ id, form, evolucoes, setEvolucoes }: Props) {

    const [novaEvolucao, setNovaEvolucao] = useState({ texto: '', data: new Date().toISOString().split('T')[0] });

    const [profissionalNome, setProfissionalNome] = useState('Dr(a).');

    const [savingEvo, setSavingEvo] = useState(false);

    const { showAlert, showConfirm } = useCustomAlert();



    useEffect(() => {

        (async () => {

            const { data: { user } } = await supabase.auth.getUser();

            if (!user) return;

            const { data: prof } = await supabase.from('profissionais').select('nome').eq('user_id', user.id).maybeSingle();

            if (prof?.nome) setProfissionalNome(prof.nome);

        })();

    }, []);



    async function salvarEvolucao() {

        if (!novaEvolucao.texto.trim()) { await showAlert('Preencha o texto da evolução.', { type: 'warning' }); return; }

        setSavingEvo(true);

        try {

            const salva = await criarEvolucao(String(id), {

                texto: novaEvolucao.texto.trim(),

                data: novaEvolucao.data,

                profissional: profissionalNome,

            });

            setEvolucoes([salva, ...evolucoes]);

            setNovaEvolucao({ texto: '', data: new Date().toISOString().split('T')[0] });

        } catch (error: any) {

            await showAlert('Erro: ' + error.message, { type: 'error' });

        }

        setSavingEvo(false);

    }



    async function excluirEvolucao(eid: string) {

        if (!(await showConfirm('Excluir esta evolução?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;

        try {

            await excluirEvolucaoDb(eid);

            setEvolucoes(evolucoes.filter((e: any) => e.id !== eid));

        } catch (e: any) {

            await showAlert('Erro ao excluir: ' + (e.message || e), { type: 'error' });

        }

    }



    function imprimirProntuario() {

        const bodyHtml = evolucoes.map((ev: any) => `

            <div class="ortus-evolution-item">

                <div class="ortus-evolution-meta">

                    <span class="ortus-evolution-date">${escapePrintHtml(new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR'))}</span>

                    <span>${escapePrintHtml(ev.profissional)}</span>

                </div>

                <div class="ortus-evolution-text">${escapePrintHtml(ev.texto)}</div>

            </div>

        `).join('') + printSignatureBlock(['Assinatura do Profissional']);



        printDocument({

            title: 'Prontuário de Evolução Clínica',

            accentColor: '#0d9488',

            toolbarLabel: `Prontuário — ${form.nome}`,

            meta: [

                { label: 'Paciente', value: form.nome || '—' },

                { label: 'CPF', value: form.cpf || '—' },

                { label: 'Registros', value: String(evolucoes.length) },

            ],

            bodyHtml,

        });

    }



    return (

        <div className="space-y-6 animate-in fade-in">

            <div className="bg-white p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm">

                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-5"><ClipboardList size={20} className="text-teal-500"/> Evolução Clínica</h3>

                <div className="space-y-4">

                    <div>

                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Data do Atendimento</label>

                        <input type="date" value={novaEvolucao.data} onChange={e => setNovaEvolucao({ ...novaEvolucao, data: e.target.value })} className="w-full max-w-xs p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500"/>

                    </div>

                    <div>

                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Relato da Evolução</label>

                        <textarea rows={5} placeholder="Descreva o atendimento realizado, observações clínicas, conduta adotada, medicamentos prescritos, próximos passos..." value={novaEvolucao.texto} onChange={e => setNovaEvolucao({ ...novaEvolucao, texto: e.target.value })} className="w-full p-3 border border-slate-200 rounded-xl text-sm leading-relaxed outline-none focus:ring-2 focus:ring-teal-500 resize-none"/>

                    </div>

                    <div className="flex items-center justify-between gap-3 flex-wrap">

                        <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5"><User size={13}/> Profissional: <span className="text-slate-700">{profissionalNome}</span></p>

                        <button onClick={salvarEvolucao} disabled={savingEvo || !novaEvolucao.texto.trim()} className="w-full sm:w-auto px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-all touch-target">

                            {savingEvo ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Registrar Evolução

                        </button>

                    </div>

                </div>

            </div>



            <div className="bg-white p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm">

                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">

                    <h3 className="text-sm font-black text-slate-600 flex items-center gap-2 uppercase tracking-wider"><Clock size={16} className="text-teal-500"/> Registros Anteriores ({evolucoes.length})</h3>

                    {evolucoes.length > 0 && (

                        <button onClick={imprimirProntuario} className="w-full sm:w-auto px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center gap-1 touch-target"><Printer size={12}/> Imprimir Prontuário</button>

                    )}

                </div>

                {evolucoes.length === 0 ? (

                    <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">

                        <ClipboardList className="mx-auto mb-2 text-slate-300" size={36}/>

                        <p className="text-sm">Nenhuma evolução registrada.</p>

                        <p className="text-xs mt-1">Registre o relato de cada atendimento acima.</p>

                    </div>

                ) : (

                    <div className="relative border-l-2 border-teal-100 ml-1 sm:ml-3 space-y-6 pb-2">

                        {evolucoes.map((ev: any) => (

                            <div key={ev.id} className="ml-6 sm:ml-8 relative group">

                                <div className="absolute -left-[29px] sm:-left-[37px] top-1.5 w-4 h-4 rounded-full border-[3px] border-white bg-teal-500 shadow-sm"></div>

                                <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200/60 hover:shadow-md transition-shadow">

                                    <div className="flex justify-between items-start mb-2 gap-2">

                                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-bold text-slate-500 min-w-0">

                                            <span className="flex items-center gap-1 text-teal-700 bg-teal-50 px-2 py-0.5 rounded"><Calendar size={12}/> {new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>

                                            <span className="flex items-center gap-1 truncate"><User size={12}/> {ev.profissional}</span>

                                        </div>

                                        <button onClick={() => excluirEvolucao(ev.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0 touch-target" title="Excluir"><Trash2 size={13}/></button>

                                    </div>

                                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{ev.texto}</p>

                                </div>

                            </div>

                        ))}

                    </div>

                )}

            </div>

        </div>

    );

}

