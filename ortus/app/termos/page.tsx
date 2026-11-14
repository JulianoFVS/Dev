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

            <h2 className="text-lg font-black text-slate-800">5. Usos Proibidos</h2>
            <p>É expressamente vedado ao Cliente:</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>Utilizar o sistema para armazenar conteúdo ilícito, discriminatório ou que viole direitos de terceiros.</li>
                <li>Compartilhar credenciais de acesso entre diferentes pessoas ou permitir acesso não autorizado.</li>
                <li>Realizar engenharia reversa, scraping, mineração de dados ou qualquer tentativa de extrair o código-fonte.</li>
                <li>Utilizar bots, scripts automatizados ou sobrecarregar intencionalmente a infraestrutura.</li>
                <li>Revender, sublicenciar ou redistribuir o acesso ao sistema a terceiros não autorizados.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">6. Suspensão e Rescisão</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li>A Empresa reserva-se o direito de <strong>suspender temporariamente</strong> o acesso em caso de uso irregular, tentativa de fraude ou inadimplência superior a 15 dias.</li>
                <li>Antes da suspensão, o Cliente será notificado por e-mail com prazo de <strong>5 dias úteis</strong> para regularização.</li>
                <li>Em caso de rescisão, os dados permanecerão disponíveis para exportação conforme a cláusula de retenção.</li>
                <li>O Cliente pode rescindir o contrato a qualquer momento sem multa, conforme cláusula 9.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">7. Disponibilidade e Manutenção</h2>
            <p>O sistema poderá ficar indisponível para manutenções programadas, preferencialmente realizadas em horários de baixo uso (madrugadas e finais de semana). Manutenções emergenciais poderão ocorrer a qualquer momento. O Cliente será notificado com antecedência mínima de 24 horas para manutenções programadas que excedam 30 minutos.</p>

            <h2 className="text-lg font-black text-slate-800">8. Retenção e Exclusão de Dados</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li>Enquanto a assinatura estiver ativa, todos os dados ficam disponíveis na plataforma.</li>
                <li>Após o cancelamento, os dados são mantidos por <strong>90 dias corridos</strong> para fins de portabilidade. Após esse período, são excluídos definitivamente.</li>
                <li>O Cliente pode solicitar a exportação integral de seus dados a qualquer momento via funcionalidade &ldquo;Exportar Prontuário (LGPD)&rdquo; ou por solicitação ao suporte.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">9. Pagamento e Cancelamento</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li>O serviço é pré-pago mensalmente por meio de cartão de crédito, PIX ou boleto bancário.</li>
                <li>O cancelamento pode ser solicitado a qualquer momento, sem multa rescisória.</li>
                <li>O acesso permanece ativo até o final do ciclo vigente já pago.</li>
                <li>Não há reembolso proporcional por dias não utilizados dentro do ciclo pago.</li>
                <li>Em caso de inadimplência superior a 15 dias, o acesso poderá ser suspenso conforme cláusula 6.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">10. Propriedade Intelectual</h2>
            <p>Todo o código-fonte, design, marcas, logotipos e materiais da plataforma ORTUS são de propriedade exclusiva da Recode Systems Ltda., protegidos pela Lei 9.610/98 (Direitos Autorais) e Lei 9.279/96 (Propriedade Industrial). Os dados clínicos inseridos pelo Cliente permanecem de propriedade exclusiva do Cliente.</p>

            <h2 className="text-lg font-black text-slate-800">11. Acordo de Processamento de Dados (DPA)</h2>
            <p>Ao utilizar o ORTUS, o Cliente (Controlador) e a Recode Systems (Operador) firmam acordo de processamento de dados nos termos do art. 39 da LGPD:</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>O Operador processará dados pessoais <strong>exclusivamente</strong> conforme instruções documentadas do Controlador.</li>
                <li>O Operador manterá registros das operações de tratamento realizadas (art. 37 LGPD).</li>
                <li>O Operador implementará medidas técnicas e organizacionais adequadas para garantir a segurança dos dados.</li>
                <li>Subprocessadores (Supabase/AWS, Vercel) estão vinculados por cláusulas contratuais equivalentes.</li>
                <li>Ao término do contrato, o Operador eliminará os dados conforme cláusula 8, salvo obrigação legal de retenção.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">12. Serviços de Terceiros</h2>
            <p>O ORTUS utiliza serviços de terceiros essenciais à sua operação:</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Supabase (AWS)</strong> — banco de dados, autenticação e armazenamento de arquivos.</li>
                <li><strong>Vercel</strong> — hospedagem e distribuição da aplicação web.</li>
                <li><strong>Stripe / Gateway de pagamento</strong> — processamento de cobranças (os dados de cartão são processados diretamente pelo gateway, sem trafegar pelo ORTUS).</li>
            </ul>
            <p>A Empresa não se responsabiliza por indisponibilidades causadas exclusivamente por falhas nesses provedores, desde que tome as providências cabíveis para mitigar o impacto.</p>

            <h2 className="text-lg font-black text-slate-800">13. Indenização</h2>
            <p>O Cliente concorda em indenizar e isentar a Empresa de quaisquer reclamações, perdas ou danos decorrentes de: (a) uso indevido do sistema; (b) violação destes termos; (c) dados inseridos na plataforma pelo Cliente ou seus colaboradores.</p>

            <h2 className="text-lg font-black text-slate-800">14. Limitação de Responsabilidade</h2>
            <p>A Empresa não se responsabiliza por danos indiretos, incidentais, perda de receita ou lucros cessantes decorrentes do uso ou impossibilidade de uso do sistema. A responsabilidade total da Empresa, em qualquer hipótese, limita-se ao valor das mensalidades efetivamente pagas pelo Cliente nos últimos 12 meses.</p>

            <h2 className="text-lg font-black text-slate-800">15. Força Maior</h2>
            <p>Nenhuma das partes será responsável por atrasos ou falhas no cumprimento de suas obrigações quando decorrentes de eventos fora de seu controle razoável, incluindo, mas não se limitando a: desastres naturais, pandemias, ataques cibernéticos em massa, falhas generalizadas de infraestrutura de internet, atos governamentais ou guerras.</p>

            <h2 className="text-lg font-black text-slate-800">16. Disposições Gerais</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li>A tolerância de qualquer das partes quanto a descumprimento de qualquer cláusula não implicará renúncia ao direito de exigir o cumprimento posterior.</li>
                <li>Se qualquer cláusula for considerada inválida, as demais permanecem em pleno vigor.</li>
                <li>Estes termos constituem o acordo integral entre as partes, substituindo quaisquer entendimentos anteriores.</li>
                <li>Alterações nestes termos serão comunicadas com antecedência mínima de <strong>15 dias</strong> por e-mail ou notificação no sistema.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">17. Foro e Legislação Aplicável</h2>
            <p>Estes termos são regidos exclusivamente pela legislação da República Federativa do Brasil. Fica eleito o foro da comarca de São Paulo/SP para dirimir quaisquer controvérsias oriundas deste contrato, com exclusão de qualquer outro, por mais privilegiado que seja.</p>
        </div>

        <div className="mt-10 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-400">Dúvidas? Entre em contato com <a href="mailto:suporte@recodesystems.com" className="text-blue-600 hover:underline font-bold">suporte@recodesystems.com</a></p>
        </div>
      </div>
    </div>
  );
}