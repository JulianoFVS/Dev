import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function Termos() {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white p-10 rounded-3xl shadow-sm border border-slate-200">
        <Link href="/site" className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold mb-8 transition-colors"><ArrowLeft size={18}/> Voltar para o site</Link>
        
        <h1 className="text-3xl font-black text-slate-900 mb-2">Termos de Uso e Privacidade</h1>
        <p className="text-slate-400 font-medium mb-8">Última atualização: Fevereiro de 2026</p>

        <div className="prose prose-slate max-w-none text-slate-600 font-medium">
            <p>Bem-vindo ao <strong>ORTUS</strong>. Ao utilizar nosso sistema, você concorda com os termos descritos abaixo.</p>
            
            <h3 className="text-slate-800 font-bold mt-6 mb-2">1. Sobre o Serviço</h3>
            <p>O ORTUS é um software de gestão para clínicas odontológicas (SaaS) que oferece ferramentas de agendamento, prontuário eletrônico e controle financeiro.</p>

            <h3 className="text-slate-800 font-bold mt-6 mb-2">2. Proteção de Dados (LGPD)</h3>
            <p>Levamos a privacidade a sério. Os dados dos seus pacientes são de sua propriedade exclusiva. O ORTUS atua como operador, garantindo a segurança e criptografia dessas informações, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

            <h3 className="text-slate-800 font-bold mt-6 mb-2">3. Responsabilidades</h3>
            <p>O usuário é responsável por manter sua senha segura e por todas as atividades que ocorram em sua conta. O sistema realiza backups automáticos, mas recomendamos a exportação periódica de dados críticos.</p>

            <h3 className="text-slate-800 font-bold mt-6 mb-2">4. Pagamento e Cancelamento</h3>
            <p>O serviço é pré-pago mensalmente. Você pode cancelar a qualquer momento sem multa, mantendo o acesso até o fim do ciclo vigente.</p>
        </div>

        <div className="mt-10 pt-10 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-400">Dúvidas? Entre em contato com <a href="mailto:suporte@recodesystems.com" className="text-blue-600 hover:underline">suporte@recodesystems.com</a></p>
        </div>
      </div>
    </div>
  );
}