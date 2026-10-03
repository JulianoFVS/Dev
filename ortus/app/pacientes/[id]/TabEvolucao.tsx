'use client';

import { useState, useEffect } from 'react';
import { Trash2, Save, Loader2, Printer } from 'lucide-react';
import CampoData from '@/components/ui/CampoData';

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

        <div className="space-y-5">
            <div>
                <h3 className="mb-3 text-base font-semibold text-neutral-900">Evolução clínica</h3>
                <div className="grid gap-3">
                    <div className="max-w-xs">
                        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Data do atendimento</label>
                        <CampoData value={novaEvolucao.data} onChange={v => setNovaEvolucao({ ...novaEvolucao, data: v })} />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Relato</label>
                        <textarea rows={4} placeholder="O que foi feito, conduta e próximos passos." value={novaEvolucao.texto} onChange={e => setNovaEvolucao({ ...novaEvolucao, texto: e.target.value })} className="w-full resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"/>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs font-medium text-neutral-500">{profissionalNome}</p>
                        <button onClick={salvarEvolucao} disabled={savingEvo || !novaEvolucao.texto.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                            {savingEvo ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Registrar
                        </button>
                    </div>
                </div>
            </div>



            <div className="border-t border-neutral-200 pt-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-neutral-900">Registros anteriores ({evolucoes.length})</h3>
                    {evolucoes.length > 0 && (
                        <button onClick={imprimirProntuario} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"><Printer size={12}/> PDF</button>
                    )}
                </div>

                {evolucoes.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-400">Nenhuma evolução registrada.</p>
                ) : (
                    <div>
                        {evolucoes.map((ev: any) => (
                            <div key={ev.id} className="group flex items-start justify-between gap-3 border-b border-neutral-100 py-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-neutral-500">
                                        {new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        {ev.profissional ? ` · ${ev.profissional}` : ''}
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-800">{ev.texto}</p>
                                </div>
                                <button type="button" onClick={() => excluirEvolucao(ev.id)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-rose-600" aria-label="Excluir"><Trash2 size={14}/></button>
                            </div>
                        ))}
                    </div>
                )}

            </div>

        </div>

    );

}

