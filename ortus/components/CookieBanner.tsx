'use client';
import { useState, useEffect } from 'react';
import { Shield, X } from 'lucide-react';

const COOKIE_CONSENT_KEY = 'ortus_cookie_consent';

type ConsentLevel = 'essential' | 'analytics' | 'all';

interface ConsentState {
    level: ConsentLevel;
    accepted_at: string;
}

/**
 * Cookie Banner LGPD-compliant com opt-in.
 * Bloqueia cookies não-essenciais até aceite ativo.
 * Caixas NÃO pré-marcadas (exigência legal).
 */
export default function CookieBanner() {
    const [visible, setVisible] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [analytics, setAnalytics] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (!stored) {
            setVisible(true);
        }
    }, []);

    function salvar(level: ConsentLevel) {
        const consent: ConsentState = {
            level,
            accepted_at: new Date().toISOString(),
        };
        localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
        setVisible(false);
    }

    function aceitarTodos() {
        salvar('all');
    }

    function aceitarSelecionados() {
        salvar(analytics ? 'analytics' : 'essential');
    }

    function recusarOpcional() {
        salvar('essential');
    }

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 inset-x-0 z-[9999] p-4 animate-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/10 p-5">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <Shield size={20} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-800 text-sm">Privacidade e Cookies</h3>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            Utilizamos cookies <strong>essenciais</strong> para o funcionamento do sistema (autenticação e sessão).
                            Cookies opcionais de analytics só são ativados com seu consentimento explícito.
                        </p>

                        {expanded && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2.5 animate-in fade-in duration-200">
                                <label className="flex items-center gap-3 cursor-not-allowed">
                                    <input type="checkbox" checked disabled className="h-4 w-4 rounded accent-blue-600" />
                                    <div>
                                        <span className="text-xs font-bold text-slate-700">Essenciais</span>
                                        <span className="text-[10px] text-slate-400 ml-2">Sempre ativos — sessão e autenticação</span>
                                    </div>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={analytics}
                                        onChange={(e) => setAnalytics(e.target.checked)}
                                        className="h-4 w-4 rounded accent-blue-600"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-slate-700">Analytics</span>
                                        <span className="text-[10px] text-slate-400 ml-2">Dados de uso anônimos para melhoria do sistema</span>
                                    </div>
                                </label>
                            </div>
                        )}
                    </div>
                    <button onClick={recusarOpcional} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 shrink-0" title="Recusar opcionais">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex items-center gap-2 mt-4 justify-end">
                    {!expanded ? (
                        <>
                            <button
                                onClick={() => setExpanded(true)}
                                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                            >
                                Personalizar
                            </button>
                            <button
                                onClick={recusarOpcional}
                                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Apenas Essenciais
                            </button>
                            <button
                                onClick={aceitarTodos}
                                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                            >
                                Aceitar Todos
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setExpanded(false)}
                                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                            >
                                Voltar
                            </button>
                            <button
                                onClick={aceitarSelecionados}
                                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                            >
                                Salvar Preferências
                            </button>
                        </>
                    )}
                </div>

                <p className="text-[10px] text-slate-400 mt-3 text-center">
                    Saiba mais na nossa{' '}
                    <a href="/privacidade" target="_blank" className="text-blue-500 hover:underline font-bold">Política de Privacidade</a>.
                </p>
            </div>
        </div>
    );
}
