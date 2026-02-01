'use client';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Lock, CreditCard, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function Checkout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const plano = searchParams.get('plano') || 'Profissional';
  const valor = searchParams.get('valor') || '197';
  
  const [loading, setLoading] = useState(false);
  const [etapa, setEtapa] = useState('pagamento'); // pagamento | processando | sucesso

  async function processarPagamento(e: any) {
      e.preventDefault();
      setLoading(true);
      
      // SIMULAÇÃO DE PROCESSAMENTO DE CARTÃO
      setTimeout(() => {
          setLoading(false);
          setEtapa('sucesso');
          
          // Redireciona para cadastro após 2 segundos de sucesso
          setTimeout(() => {
             router.push(`/cadastro?plano=${plano}&status=pago`);
          }, 2000);
      }, 2000);
  }

  if (etapa === 'sucesso') {
      return (
          <div className="min-h-screen bg-white flex items-center justify-center p-6">
              <div className="text-center space-y-4 animate-in zoom-in">
                  <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle size={48}/>
                  </div>
                  <h1 className="text-3xl font-black text-slate-800">Pagamento Aprovado!</h1>
                  <p className="text-slate-500 font-medium">Redirecionando para configurar sua conta...</p>
                  <Loader2 className="animate-spin mx-auto text-blue-600" size={24}/>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      
      {/* COLUNA DA ESQUERDA: RESUMO DO PEDIDO */}
      <div className="w-full md:w-1/2 bg-slate-900 text-white p-8 md:p-20 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600 rounded-full blur-3xl opacity-20 translate-x-1/2 -translate-y-1/2"></div>
          
          <div>
              <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-10 font-bold"><ArrowLeft size={18}/> Voltar</Link>
              <div className="flex items-center gap-3 mb-6">
                  <img src="/logo.png" className="h-8 brightness-0 invert opacity-80"/>
                  <span className="font-bold text-lg tracking-widest">ORTUS</span>
              </div>
              <p className="text-slate-400 font-medium uppercase tracking-wider text-xs mb-2">Você está assinando:</p>
              <h1 className="text-4xl font-black mb-4">Plano {plano}</h1>
              <div className="flex items-end gap-1 mb-8">
                  <span className="text-5xl font-bold">R$ {valor}</span>
                  <span className="text-slate-400 font-medium mb-2">/mês</span>
              </div>
              <ul className="space-y-3 text-slate-300 font-medium">
                  <li className="flex items-center gap-3"><CheckCircle size={18} className="text-blue-400"/> Acesso imediato ao sistema</li>
                  <li className="flex items-center gap-3"><CheckCircle size={18} className="text-blue-400"/> Cancelamento a qualquer momento</li>
                  <li className="flex items-center gap-3"><CheckCircle size={18} className="text-blue-400"/> 7 dias de garantia</li>
              </ul>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-800 text-xs text-slate-500 flex items-center gap-2">
              <ShieldCheck size={14}/> Pagamento 100% seguro via SSL
          </div>
      </div>

      {/* COLUNA DA DIREITA: FORMULÁRIO */}
      <div className="w-full md:w-1/2 bg-white p-8 md:p-20 flex items-center justify-center">
          <div className="w-full max-w-md space-y-8">
              <div>
                  <h2 className="text-2xl font-black text-slate-800">Dados de Pagamento</h2>
                  <p className="text-slate-500 font-medium">Complete seus dados para liberar o acesso.</p>
              </div>

              <form onSubmit={processarPagamento} className="space-y-5">
                  <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nome no Cartão</label>
                      <input required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="COMO NO CARTAO" />
                  </div>

                  <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase ml-1">Número do Cartão</label>
                      <div className="relative">
                          <CreditCard className="absolute left-4 top-4 text-slate-300" size={20}/>
                          <input required maxLength={19} className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="0000 0000 0000 0000" />
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-400 uppercase ml-1">Validade</label>
                          <input required maxLength={5} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="MM/AA" />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-400 uppercase ml-1">CVV</label>
                          <input required maxLength={3} type="password" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder:text-slate-300" placeholder="123" />
                      </div>
                  </div>

                  <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex justify-center items-center gap-2 mt-6">
                      {loading ? <Loader2 className="animate-spin" /> : `Pagar R$ ${valor}`}
                  </button>
                  
                  <div className="flex justify-center gap-4 opacity-50 grayscale">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/0/04/Visa.svg" className="h-6"/>
                      <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" className="h-6"/>
                  </div>
              </form>
          </div>
      </div>
    </div>
  );
}