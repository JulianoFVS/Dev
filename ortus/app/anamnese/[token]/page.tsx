'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ClipboardList, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { respostaInicial, type ModeloAnamnese, type RespostaAnamnese, type RespostaSimNaoTexto } from '@/lib/anamnese';

type FormData = {
  paciente_nome: string;
  modelo: Pick<ModeloAnamnese, 'id' | 'nome' | 'perguntas'>;
  expires_at: string;
};

export default function AnamnesePublicaPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [formData, setFormData] = useState<FormData | null>(null);
  const [respostas, setRespostas] = useState<Record<string, RespostaAnamnese>>({});
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/public/anamnese/${token}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Link inválido.');
        setFormData(body);
        const iniciais: Record<string, RespostaAnamnese> = {};
        body.modelo.perguntas.forEach((p: { id: string; tipo: string }) => {
          iniciais[p.id] = respostaInicial(p.tipo as any);
        });
        setRespostas(iniciais);
      } catch (e: any) {
        setErro(e.message || 'Não foi possível carregar o formulário.');
      }
      setLoading(false);
    })();
  }, [token]);

  async function enviar() {
    if (!token) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/public/anamnese/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respostas }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Erro ao enviar.');
      setEnviado(true);
    } catch (e: any) {
      setErro(e.message || 'Erro ao enviar formulário.');
    }
    setEnviando(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center text-slate-500">
          <Loader2 className="animate-spin mx-auto mb-3" size={32}/>
          <p className="font-semibold">Carregando formulário...</p>
        </div>
      </div>
    );
  }

  if (erro && !formData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <AlertCircle className="mx-auto text-rose-500 mb-3" size={40}/>
          <h1 className="text-lg font-black text-slate-800 mb-2">Formulário indisponível</h1>
          <p className="text-sm text-slate-500">{erro}</p>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-emerald-200 shadow-sm p-8 text-center">
          <CheckCircle className="mx-auto text-emerald-500 mb-3" size={48}/>
          <h1 className="text-xl font-black text-slate-800 mb-2">Anamnese enviada!</h1>
          <p className="text-sm text-slate-500">Obrigado por preencher. A clínica receberá suas respostas.</p>
        </div>
      </div>
    );
  }

  if (!formData) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-slate-50 py-6 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="Ortus" className="h-10 mx-auto mb-3"/>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800">{formData.modelo.nome}</h1>
          <p className="text-sm text-slate-500 mt-1">Paciente: <span className="font-bold text-slate-700">{formData.paciente_nome}</span></p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-100 bg-blue-50/50 flex items-center gap-2">
            <ClipboardList size={20} className="text-blue-600"/>
            <p className="text-sm font-bold text-slate-700">Preencha todas as perguntas abaixo</p>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {formData.modelo.perguntas.map((p, i) => (
              <div key={p.id} className="space-y-2">
                <label className="text-sm font-bold text-slate-800 flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-black flex-none">{i + 1}</span>
                  <span className="pt-0.5">{p.label}</span>
                </label>
                <div className="ml-8">
                  {p.tipo === 'texto' && (
                    <textarea
                      value={(respostas[p.id] as string) || ''}
                      onChange={(e) => setRespostas({ ...respostas, [p.id]: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={3}
                      placeholder="Sua resposta..."
                    />
                  )}
                  {p.tipo === 'sim_nao' && (
                    <div className="flex gap-2">
                      {['Sim', 'Não'].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setRespostas({ ...respostas, [p.id]: opt })}
                          className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${respostas[p.id] === opt ? (opt === 'Sim' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-emerald-50 border-emerald-300 text-emerald-700') : 'bg-white border-slate-200 text-slate-500'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {p.tipo === 'sim_nao_texto' && (() => {
                    const atual = (respostas[p.id] as RespostaSimNaoTexto) || { sim_nao: '', texto: '' };
                    return (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          {['Sim', 'Não'].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setRespostas({ ...respostas, [p.id]: { ...atual, sim_nao: opt, texto: opt === 'Não' ? '' : atual.texto } })}
                              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${atual.sim_nao === opt ? (opt === 'Sim' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-emerald-50 border-emerald-300 text-emerald-700') : 'bg-white border-slate-200 text-slate-500'}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        {atual.sim_nao === 'Sim' && (
                          <textarea
                            value={atual.texto || ''}
                            onChange={(e) => setRespostas({ ...respostas, [p.id]: { ...atual, texto: e.target.value } })}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            rows={2}
                            placeholder="Especifique..."
                          />
                        )}
                      </div>
                    );
                  })()}
                  {p.tipo === 'multipla' && (
                    <div className="flex flex-wrap gap-2">
                      {(p.opcoes || []).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setRespostas({ ...respostas, [p.id]: opt })}
                          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${respostas[p.id] === opt ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-5 sm:p-6 border-t border-slate-100 bg-slate-50">
            {erro && <p className="text-sm text-rose-600 font-semibold mb-3">{erro}</p>}
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              {enviando ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>}
              Enviar Anamnese
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-3">Link válido até {new Date(formData.expires_at).toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
