/**
 * Modelos dos e-mails que o Ortus manda. Cada função devolve assunto, texto
 * puro e HTML — o texto puro é o que os filtros de spam leem primeiro e o que
 * aparece quando o cliente de e-mail não desenha HTML.
 *
 * HTML de e-mail é de tabela e estilo em linha: os clientes ignoram <style>,
 * flex e grid. Largura fixa de 520 px, que cabe no celular sem zoom.
 */

export type EmailPronto = { assunto: string; texto: string; html: string };

type Bloco = {
  titulo: string;
  paragrafos: string[];
  botao?: { rotulo: string; url: string } | null;
  /** Linha pequena no fim (ex.: "Se não foi você, ignore este e-mail."). */
  nota?: string;
};

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Só http(s): um `javascript:` ou `data:` nunca vira link de e-mail. */
function urlSegura(url: string): string | null {
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
}

function montar(assunto: string, bloco: Bloco): EmailPronto {
  const url = bloco.botao ? urlSegura(bloco.botao.url) : null;
  const texto = [
    bloco.titulo,
    '',
    ...bloco.paragrafos,
    ...(url && bloco.botao ? ['', `${bloco.botao.rotulo}: ${url}`] : []),
    ...(bloco.nota ? ['', bloco.nota] : []),
    '',
    'Ortus — gestão para clínicas odontológicas',
  ].join('\n');

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f3f4f1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f1;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
<tr><td style="padding:28px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:.08em;color:#171717;">ORTUS</td></tr>
<tr><td style="padding:8px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:26px;font-weight:bold;color:#171717;">${escapar(bloco.titulo)}</td></tr>
${bloco.paragrafos.map((p) => `<tr><td style="padding:12px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#404040;">${escapar(p).replace(/\n/g, '<br/>')}</td></tr>`).join('\n')}
${url && bloco.botao ? `<tr><td style="padding:22px 28px 0 28px;"><a href="${escapar(url)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:999px;">${escapar(bloco.botao.rotulo)}</a></td></tr>
<tr><td style="padding:10px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#737373;word-break:break-all;">Se o botão não abrir, copie este endereço: ${escapar(url)}</td></tr>` : ''}
${bloco.nota ? `<tr><td style="padding:18px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#737373;">${escapar(bloco.nota)}</td></tr>` : ''}
<tr><td style="padding:24px 28px 26px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#a3a3a3;border-top:1px solid #f0f0f0;">Ortus — gestão para clínicas odontológicas</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { assunto, texto, html };
}

const primeiroNome = (nome?: string | null) => (nome || '').trim().split(/\s+/)[0] || '';
const real = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

/** Mensagem cujo texto vem pronto (ex.: lembrete escrito pela clínica). Parágrafos separados por linha em branco. */
export function emailLivre(d: { assunto: string; titulo: string; texto: string }): EmailPronto {
  const paragrafos = d.texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return montar(d.assunto, { titulo: d.titulo, paragrafos: paragrafos.length ? paragrafos : [d.texto] });
}

/** Convite para participar de uma clínica (a pessoa já tem conta no Ortus). */
export function emailConviteClinica(d: { convidadoNome?: string | null; convidanteNome: string; clinicas: string[]; cargo?: string | null; mensagem?: string | null; linkConvite: string | null }): EmailPronto {
  const onde = d.clinicas.join(', ') || 'uma clínica';
  return montar(`${d.convidanteNome} convidou você para ${onde} no Ortus`, {
    titulo: primeiroNome(d.convidadoNome) ? `${primeiroNome(d.convidadoNome)}, você recebeu um convite` : 'Você recebeu um convite',
    paragrafos: [
      `${d.convidanteNome} convidou você para participar de ${onde}${d.cargo ? `, como ${d.cargo}` : ''}.`,
      ...(d.mensagem ? [`Mensagem de ${primeiroNome(d.convidanteNome) || 'quem convidou'}: "${d.mensagem.slice(0, 500)}"`] : []),
      'Para aceitar, abra o convite pelo botão abaixo, já com a sua conta do Ortus: o link confirma que este e-mail é seu e só funciona com ele. Depois é só responder em Mensagens. O convite vale por 14 dias, e aceitar não remove você das clínicas em que já trabalha.',
    ],
    botao: d.linkConvite ? { rotulo: 'Abrir o convite', url: d.linkConvite } : null,
    nota: 'Se você não conhece quem enviou, basta recusar ou ignorar este e-mail.',
  });
}

/** Aviso para quem convidou: o convite foi aceito. */
export function emailConviteAceito(d: { convidanteNome?: string | null; convidadoNome: string; clinicas: string[]; origem: string }): EmailPronto {
  const onde = d.clinicas.join(', ') || 'a clínica';
  return montar(`${d.convidadoNome} aceitou o seu convite`, {
    titulo: 'Convite aceito',
    paragrafos: [
      `${d.convidadoNome} aceitou o convite e agora participa de ${onde}.`,
      'A pessoa entra com os módulos do cargo informado no convite. Para ajustar o que ela pode ver, abra Equipe e escolha as permissões.',
    ],
    botao: d.origem ? { rotulo: 'Abrir a equipe', url: `${d.origem}/ajustes/equipe` } : null,
  });
}

/** Aviso para o funcionário novo. A senha temporária NUNCA vai por e-mail: quem entrega é o administrador. */
export function emailAcessoCriado(d: { nome: string; clinicas: string[]; administradorNome?: string | null; origem: string }): EmailPronto {
  const onde = d.clinicas.join(', ') || 'a clínica';
  return montar(`Seu acesso ao Ortus em ${onde}`, {
    titulo: `${primeiroNome(d.nome) || 'Olá'}, seu acesso foi criado`,
    paragrafos: [
      `${d.administradorNome || 'O administrador da clínica'} criou um acesso ao Ortus para você em ${onde}.`,
      'A senha temporária é entregue pessoalmente por quem criou o acesso — ela não vem neste e-mail. No primeiro acesso o sistema pede uma senha nova, só sua.',
    ],
    botao: d.origem ? { rotulo: 'Entrar no Ortus', url: `${d.origem}/login` } : null,
    nota: 'Se você não trabalha nesta clínica, ignore este e-mail e avise a clínica.',
  });
}

/**
 * Assinatura confirmada pelo provedor: a conta da clínica nasceu. Este é o
 * e-mail de confirmação da conta — o link prova que a pessoa é dona do
 * endereço e leva à tela em que ela escolhe a senha.
 */
export function emailAssinaturaAtiva(d: { nome: string; clinica: string; plano: string; valorCentavos: number; proximoVencimento: string | null; linkAcesso: string | null }): EmailPronto {
  return montar(`Pagamento confirmado — crie sua senha do Ortus`, {
    titulo: 'Pagamento confirmado',
    paragrafos: [
      `${primeiroNome(d.nome) || 'Olá'}, recebemos o pagamento do plano ${d.plano} (${real(d.valorCentavos)} por mês). A clínica ${d.clinica} já está criada e você é a pessoa administradora.`,
      d.linkAcesso
        ? 'Para entrar, confirme este e-mail e escolha a sua senha pelo botão abaixo. O link vale por tempo limitado e só funciona uma vez; se expirar, a própria página oferece o envio de outro.'
        : 'Falta só criar a sua senha: abra a página de retorno do pagamento e peça o link de acesso.',
      ...(d.proximoVencimento ? [`A próxima cobrança vence em ${dataBr(d.proximoVencimento)}. As faturas ficam em Assinatura, dentro do sistema.`] : []),
    ],
    botao: d.linkAcesso ? { rotulo: 'Confirmar e criar minha senha', url: d.linkAcesso } : null,
    nota: 'Se você não fez esta assinatura, responda a este e-mail ou fale com o suporte do Ortus.',
  });
}

/** Novo link de acesso, pedido por quem não usou o primeiro a tempo. */
export function emailLinkDeAcesso(d: { nome?: string | null; clinica: string; linkAcesso: string }): EmailPronto {
  return montar('Seu link para criar a senha do Ortus', {
    titulo: 'Crie sua senha',
    paragrafos: [
      `${primeiroNome(d.nome) ? `${primeiroNome(d.nome)}, este` : 'Este'} é o novo link para confirmar o e-mail e escolher a senha de acesso à clínica ${d.clinica}.`,
      'O link vale por tempo limitado e só funciona uma vez. Os links anteriores deixam de valer.',
    ],
    botao: { rotulo: 'Criar minha senha', url: d.linkAcesso },
    nota: 'Se você não pediu este e-mail, ignore: ninguém entra sem abrir o link.',
  });
}

/** "Esqueci a senha": link de uso único que abre /acesso?tipo=senha. A senha atual não muda até a pessoa criar outra. */
export function emailRedefinirSenha(d: { nome?: string | null; linkAcesso: string }): EmailPronto {
  return montar('Seu link para criar uma nova senha do Ortus', {
    titulo: 'Criar uma nova senha',
    paragrafos: [
      `${primeiroNome(d.nome) ? `${primeiroNome(d.nome)}, recebemos` : 'Recebemos'} um pedido para criar uma nova senha de acesso ao Ortus para este e-mail.`,
      'O link vale por tempo limitado e só funciona uma vez. Se você pediu mais de um, use o do e-mail mais recente: os anteriores deixam de valer.',
    ],
    botao: { rotulo: 'Criar nova senha', url: d.linkAcesso },
    nota: 'Se você não pediu este e-mail, ignore: a sua senha atual continua valendo e ninguém entra sem abrir o link.',
  });
}

/** Fatura do mês gerada. O pagamento é feito dentro do sistema, em Assinatura. */
export function emailFaturaGerada(d: { nome?: string | null; rede: string; competencia: string; valorCentavos: number; vencimento: string; origem: string }): EmailPronto {
  return montar(`Fatura do Ortus de ${d.competencia} — vence em ${dataBr(d.vencimento)}`, {
    titulo: `Fatura de ${d.competencia}`,
    paragrafos: [
      `${primeiroNome(d.nome) ? `${primeiroNome(d.nome)}, a` : 'A'} fatura do Ortus de ${d.rede} referente a ${d.competencia} está disponível.`,
      `Valor: ${real(d.valorCentavos)}. Vencimento: ${dataBr(d.vencimento)}. O pagamento é por Pix ou cartão, na página segura do provedor, aberta a partir de Assinatura.`,
    ],
    botao: d.origem ? { rotulo: 'Ver e pagar a fatura', url: `${d.origem}/assinatura` } : null,
    nota: 'Se você já pagou, desconsidere: a confirmação pode levar alguns minutos.',
  });
}

/** Fatura vencida: aviso antes do modo de consulta. */
export function emailFaturaAtrasada(d: { rede: string; competencia: string; valorCentavos: number; diasAtraso: number; bloqueioEm: string | null; origem: string }): EmailPronto {
  const dias = `${d.diasAtraso} ${d.diasAtraso === 1 ? 'dia' : 'dias'}`;
  return montar(`Fatura do Ortus em atraso${d.diasAtraso > 0 ? ` há ${dias}` : ''}`, {
    titulo: 'Fatura em atraso',
    paragrafos: [
      `A fatura do Ortus de ${d.rede} referente a ${d.competencia} (${real(d.valorCentavos)}) está vencida${d.diasAtraso > 0 ? ` há ${dias}` : ''}.`,
      d.bloqueioEm
        ? `O sistema segue normal até ${dataBr(d.bloqueioEm)}. A partir dessa data ele entra em modo de consulta: tudo continua disponível para leitura, mas não dá para agendar, cadastrar nem alterar até o pagamento.`
        : 'Sem o pagamento o sistema entra em modo de consulta: tudo continua disponível para leitura, mas não dá para agendar, cadastrar nem alterar.',
      'Nenhum dado é apagado: prontuários, agenda, financeiro e arquivos ficam guardados.',
    ],
    botao: d.origem ? { rotulo: 'Ver e pagar a fatura', url: `${d.origem}/assinatura` } : null,
  });
}

/** Modo de consulta por falta de pagamento. */
export function emailAcessoBloqueado(d: { rede: string; valorCentavos: number; origem: string }): EmailPronto {
  return montar('Ortus em modo de consulta por falta de pagamento', {
    titulo: 'Sistema em modo de consulta',
    paragrafos: [
      `O Ortus de ${d.rede} entrou em modo de consulta porque há fatura vencida${d.valorCentavos > 0 ? ` (${real(d.valorCentavos)} em aberto)` : ''}.`,
      'A equipe continua entrando e consultando prontuários, agenda, financeiro e arquivos. O que fica suspenso é a gravação: novos pacientes, agendamentos e alterações.',
      'Nada foi apagado. A gravação volta sozinha em poucos minutos depois que o provedor confirmar o pagamento.',
    ],
    botao: d.origem ? { rotulo: 'Pagar e voltar a gravar', url: `${d.origem}/assinatura` } : null,
  });
}

/** Pagamento confirmado depois do modo de consulta. */
export function emailAcessoReaberto(d: { rede: string; origem: string }): EmailPronto {
  return montar('Pagamento confirmado — Ortus liberado', {
    titulo: 'Sistema liberado',
    paragrafos: [`Recebemos o pagamento de ${d.rede}. O Ortus voltou a gravar normalmente, com tudo como estava.`],
    botao: d.origem ? { rotulo: 'Entrar no Ortus', url: `${d.origem}/login` } : null,
  });
}

/** Relato de bug ou sugestão, para os donos da plataforma. O texto do relato vai inteiro: é para eles lerem. */
export function emailRelato(d: { tipo: 'bug' | 'sugestao'; assunto: string; descricao: string; autor: string; clinica: string; origem: string }): EmailPronto {
  const rotulo = d.tipo === 'bug' ? 'Bug' : 'Sugestão';
  return montar(`[Ortus] ${rotulo}: ${d.assunto.slice(0, 120)}`, {
    titulo: `${rotulo} enviado por ${d.autor}`,
    paragrafos: [`Clínica: ${d.clinica}`, `Assunto: ${d.assunto}`, d.descricao.slice(0, 4000)],
    botao: d.origem ? { rotulo: 'Abrir a fila no painel', url: `${d.origem}/super-admin?aba=relatos` } : null,
    nota: 'O relato fica guardado no painel SaaS mesmo que este e-mail não chegue.',
  });
}

/** Alerta para os donos: algo do servidor parou (ou voltou). Sem dado de clínica. */
export function emailAlertaOperacao(d: { voltou: boolean; itens: string[]; origem: string }): EmailPronto {
  return montar(d.voltou ? '[Ortus] Tudo voltou ao normal' : `[Ortus] Atenção: ${d.itens.length} ${d.itens.length === 1 ? 'item parado' : 'itens parados'}`, {
    titulo: d.voltou ? 'Operação normalizada' : 'Algo parou no servidor',
    paragrafos: d.voltou ? ['Os itens que estavam parados voltaram a responder.'] : d.itens,
    botao: d.origem ? { rotulo: 'Abrir a saúde do sistema', url: `${d.origem}/super-admin?aba=operacao` } : null,
    nota: 'Você recebe este aviso uma vez quando algo para e outra quando volta.',
  });
}

/**
 * Aviso aos donos: a clínica escreveu no chat de suporte e ninguém da Ortus
 * estava olhando. Sem o texto da mensagem (pode ter dado de paciente):
 * só a clínica e o link da conversa.
 */
export function emailSuporteMensagem(d: { clinica: string; url: string }): EmailPronto {
  return montar(`[Ortus] Nova mensagem no suporte: ${d.clinica.slice(0, 80)}`, {
    titulo: `${d.clinica} escreveu no suporte`,
    paragrafos: ['Uma clínica mandou mensagem no chat de suporte e ninguém da equipe estava com o painel aberto.'],
    botao: d.url ? { rotulo: 'Abrir a conversa', url: d.url } : null,
    nota: 'O texto da mensagem fica só no painel. Novas mensagens da mesma clínica geram no máximo um aviso a cada 15 minutos.',
  });
}
