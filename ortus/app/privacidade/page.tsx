'use client';
import { ArrowLeft } from 'lucide-react';

export default function Privacidade() {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white p-10 rounded-3xl shadow-sm border border-slate-200">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold mb-8 transition-colors"><ArrowLeft size={18}/> Voltar</button>

        <h1 className="text-3xl font-black text-slate-900 mb-2">Política de Privacidade</h1>
        <p className="text-slate-400 font-medium mb-8">Última atualização: Maio de 2026</p>

        <div className="space-y-6 text-slate-600 font-medium leading-relaxed text-sm">

            <h2 className="text-lg font-black text-slate-800">1. Introdução</h2>
            <p>A <strong>Recode Systems Ltda.</strong> (&ldquo;Nós&rdquo;) respeita a privacidade dos usuários e pacientes cujos dados são processados pela plataforma <strong>ORTUS</strong>. Esta política descreve como coletamos, usamos, armazenamos e protegemos informações pessoais em conformidade com a <strong>Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD)</strong>.</p>

            <h2 className="text-lg font-black text-slate-800">2. Papel do ORTUS: Operador de Dados</h2>
            <p>No contexto da LGPD:</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Controlador</strong>: a clínica ou profissional que utiliza o ORTUS. É ela quem decide quais dados coletar e com qual finalidade.</li>
                <li><strong>Operador</strong>: o ORTUS (Recode Systems). Processamos os dados exclusivamente conforme as instruções do Controlador, fornecendo a infraestrutura tecnológica segura.</li>
            </ul>
            <p>Não utilizamos dados de pacientes para finalidades próprias, marketing ou compartilhamento com terceiros.</p>

            <h2 className="text-lg font-black text-slate-800">3. Dados Coletados</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Dados do profissional/clínica</strong>: nome, e-mail, telefone, CRO, endereço comercial — necessários para operação da conta.</li>
                <li><strong>Dados de pacientes</strong> (inseridos pela clínica): nome, CPF, telefone, e-mail, histórico odontológico, odontograma, anamneses, tratamentos, documentos clínicos.</li>
                <li><strong>Dados técnicos</strong>: logs de acesso (IP, horário, ações) para fins de auditoria e segurança.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">4. Segurança dos Dados</h2>
            <p>Adotamos medidas técnicas e organizacionais para proteger os dados:</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Criptografia em trânsito</strong>: todas as comunicações utilizam TLS 1.3.</li>
                <li><strong>Criptografia em repouso</strong>: banco de dados com criptografia AES-256 gerenciada pela infraestrutura Supabase/AWS.</li>
                <li><strong>Row Level Security (RLS)</strong>: cada clínica acessa exclusivamente seus próprios dados. Não há visibilidade cruzada entre clientes.</li>
                <li><strong>Autenticação segura</strong>: senhas armazenadas com hash bcrypt + salt. Sessões com JWT de curta duração.</li>
                <li><strong>Backups automáticos</strong>: snapshots realizados ao menos 2 vezes por dia, com retenção de 30 versões.</li>
                <li><strong>Monitoramento</strong>: logs de auditoria para rastreabilidade de acessos e modificações.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">5. Infraestrutura em Nuvem</h2>
            <p>Os dados são armazenados em servidores gerenciados pela <strong>Supabase</strong> (infraestrutura AWS), com data centers localizados nos Estados Unidos. A transferência internacional de dados é amparada pelas cláusulas contratuais padrão da AWS e pelo artigo 33 da LGPD.</p>

            <h2 className="text-lg font-black text-slate-800">6. Direitos dos Titulares</h2>
            <p>Conforme a LGPD, os titulares dos dados (pacientes) possuem os seguintes direitos, que podem ser exercidos junto à clínica (Controladora):</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Acesso</strong>: solicitar cópia de todos os dados pessoais armazenados.</li>
                <li><strong>Correção</strong>: solicitar a retificação de dados incorretos ou desatualizados.</li>
                <li><strong>Eliminação</strong>: solicitar a exclusão de dados, observadas obrigações legais de guarda.</li>
                <li><strong>Portabilidade</strong>: receber os dados em formato estruturado (JSON) via funcionalidade &ldquo;Exportar Prontuário (LGPD)&rdquo;.</li>
                <li><strong>Revogação de consentimento</strong>: retirar autorização a qualquer tempo.</li>
                <li><strong>Informação</strong>: saber com quem os dados foram compartilhados.</li>
            </ul>
            <p>O ORTUS fornece ferramentas técnicas para que a clínica possa atender a essas solicitações de forma autônoma.</p>

            <h2 className="text-lg font-black text-slate-800">7. Retenção de Dados</h2>
            <ul className="list-disc pl-5 space-y-1">
                <li>Durante a assinatura ativa: dados armazenados integralmente.</li>
                <li>Após cancelamento: dados mantidos por <strong>90 dias</strong> para portabilidade, depois excluídos permanentemente.</li>
                <li>Exceção: dados que a legislação exija guarda obrigatória (ex.: prontuários odontológicos — 20 anos conforme CFO).</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">8. Compartilhamento de Dados</h2>
            <p>Não vendemos, alugamos ou compartilhamos dados pessoais com terceiros, exceto:</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>Provedores de infraestrutura essenciais à operação (Supabase, Vercel) — sob contratos de proteção de dados.</li>
                <li>Quando exigido por ordem judicial ou autoridade regulatória competente.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">9. Cookies e Dados de Navegação</h2>
            <p>O ORTUS utiliza apenas cookies essenciais para manutenção da sessão autenticada. Não utilizamos cookies de rastreamento, analytics de terceiros ou pixels de remarketing.</p>

            <h2 className="text-lg font-black text-slate-800">10. Incidentes de Segurança</h2>
            <p>Em caso de incidente que comprometa dados pessoais, nos comprometemos a:</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>Notificar a clínica afetada em até <strong>72 horas</strong>.</li>
                <li>Comunicar à Autoridade Nacional de Proteção de Dados (ANPD) conforme exigido pelo art. 48 da LGPD.</li>
                <li>Adotar medidas corretivas imediatas para mitigar danos.</li>
            </ul>

            <h2 className="text-lg font-black text-slate-800">11. Contato do Encarregado (DPO)</h2>
            <p>Para questões relacionadas à proteção de dados, entre em contato:</p>
            <p className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <strong>E-mail:</strong> <a href="mailto:privacidade@recodesystems.com" className="text-blue-600 hover:underline">privacidade@recodesystems.com</a><br/>
                <strong>Responsável:</strong> Encarregado de Proteção de Dados — Recode Systems Ltda.
            </p>

            <h2 className="text-lg font-black text-slate-800">12. Alterações nesta Política</h2>
            <p>Esta política pode ser atualizada periodicamente. Alterações significativas serão comunicadas por e-mail ou notificação dentro do sistema com antecedência mínima de 15 dias.</p>
        </div>

        <div className="mt-10 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-400">Dúvidas? Entre em contato com <a href="mailto:privacidade@recodesystems.com" className="text-blue-600 hover:underline font-bold">privacidade@recodesystems.com</a></p>
        </div>
      </div>
    </div>
  );
}
