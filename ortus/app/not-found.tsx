import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-md">
            <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-2xl flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32}/></div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Página não encontrada</h2>
            <p className="text-slate-500 font-medium mb-8">O link que você tentou acessar não existe ou foi removido.</p>
            <Link href="/" className="block w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors">Voltar para o Início</Link>
        </div>
    </div>
  );
}