'use client';
import { ArrowLeft } from 'lucide-react';

export default function Termos() {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white p-10 rounded-3xl shadow-sm border border-slate-200">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold mb-8 transition-colors"><ArrowLeft size={18}/> Voltar</button>

        <h1 className="text-3xl font-black text-slate-900 mb-2">Termos de Uso</h1>
        <p className="text-slate-400 font-medium mb-8">Última atualização: Maio de 2026</p>

        <div className="space-y-6 text-slate-600 font-medium leading-relaxed text-sm">

            <h2 className="text-lg font-black text-slate-800">1. Objeto e Aceitação</h2>
            <p>Estes Termos de Uso regulam a relação entre a <strong>Recode Systems Ltda.</strong> (&ldquo;Empresa&rdquo;) e a clínica ou profissional (&ldquo;Cliente&rdquo;) que utiliza a plataforma <strong>ORTUS</strong> — software de gestão clínica odontológica em modelo SaaS (Software as a Service).</p>
            <p>Ao acessar o sistema, o Cliente declara ter lido, compreendido e concordado integralmente com estes termos.</p>

            <h2 className="text-lg font-black text-slate-800">2. Licença de Uso</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li>A Empresa concede ao Cliente uma <strong>licença não exclusiva, intransferível e revogável</strong> para uso da plataforma durante a vigência da assinatura.</li>
                <li>O software é fornecido &ldquo;como está&rdquo; (<em>as-is</em>). A Empresa não garante que o sistema estará livre de interrupções ou erros em 100% do tempo.</li>
                <li>É vedado ao Cliente copiar, modificar, descompilar ou redistribuir qualquer parte do código-fonte.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">3. Responsabilidades da Clínica</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li>Manter credenciais de acesso em sigilo. Cada profissional deve possuir login individual.</li>
                <li>Garantir que os dados inseridos na plataforma respeitam a legislação vigente, incluindo a LGPD.</li>
                <li>Manter uma cópia dos prontuários em conformidade com a Resolução CFO 118/2012 (guarda mínima de 20 anos).</li>
                <li>Utilizar o sistema apenas para finalidades lícitas e compatíveis com a atividade profissional.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">4. Responsabilidades da Empresa</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li>Manter a infraestrutura de nuvem operacional com SLA mínimo de <strong>99,5% de disponibilidade mensal</strong>.</li>
                <li>Realizar backups automáticos dos dados ao menos 2 vezes por dia.</li>
                <li>Aplicar medidas de segurança compatíveis com o estado da arte (criptografia TLS, RLS no banco de dados, autenticação multi-fator quando disponível).</li>
                <li>Notificar o Cliente em até 72 horas em caso de incidente de segurança que afete dados pessoais.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">5. Disponibilidade e Manutenção</h2>
            <p>O sistema poderá ficar indisponível para manutenções programadas, preferencialmente realizadas em horários de baixo uso (madrugadas e finais de semana). Manutenções emergenciais poderão ocorrer a qualquer momento.</p>

            <h2 className="text-lg font-black text-slate-800">6. Retenção e Exclusão de Dados</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li>Enquanto a assinatura estiver ativa, todos os dados ficam disponíveis na plataforma.</li>
                <li>Após o cancelamento, os dados são mantidos por <strong>90 dias corridos</strong> para fins de portabilidade. Após esse período, são excluídos definitivamente.</li>
                <li>O Cliente pode solicitar a exportação integral de seus dados a qualquer momento via funcionalidade &ldquo;Exportar Prontuário (LGPD)&rdquo; ou por solicitação ao suporte.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">7. Pagamento e Cancelamento</h2>
            <p>O serviço é pré-pago mensalmente. O cancelamento pode ser solicitado a qualquer momento, sem multa rescisória. O acesso permanece ativo até o final do ciclo vigente já pago.</p>

            <h2 className="text-lg font-black text-slate-800">8. Propriedade Intelectual</h2>
            <p>Todo o código, design, marcas e materiais da plataforma ORTUS são de propriedade exclusiva da Recode Systems Ltda. Os dados clínicos inseridos pelo Cliente permanecem de propriedade do Cliente.</p>

            <h2 className="text-lg font-black text-slate-800">9. Limitação de Responsabilidade</h2>
            <p>A Empresa não se responsabiliza por danos indiretos, perda de receita ou lucros cessantes decorrentes do uso ou impossibilidade de uso do sistema. A responsabilidade total limita-se ao valor das mensalidades pagas nos últimos 12 meses.</p>

            <h2 className="text-lg font-black text-slate-800">10. Foro e Legislação Aplicável</h2>
            <p>Estes termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de São Paulo/SP para dirimir quaisquer controvérsias.</p>
        </div>

        <div className="mt-10 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-400">Dúvidas? Entre em contato com <a href="mailto:suporte@recodesystems.com" className="text-blue-600 hover:underline font-bold">suporte@recodesystems.com</a></p>
        </div>
      </div>
    </div>
  );
}