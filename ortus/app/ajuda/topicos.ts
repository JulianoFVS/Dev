/**
 * Conteúdo da Ajuda: o guia técnico (o manual) e a lista de tutoriais em vídeo.
 *
 * O guia descreve o que as telas fazem hoje. Quem mudar um botão, um limite ou
 * uma regra em outra parte do sistema corrige o texto aqui na mesma entrega.
 *
 * Marcação do texto: **negrito** para nome de tela, botão ou campo.
 */

import { WHATSAPP_ATIVO } from '@/lib/whatsappCliente';

export type BlocoGuia =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'passos'; itens: string[] }
  | { tipo: 'lista'; itens: string[] }
  | { tipo: 'aviso'; texto: string };

export type SecaoGuia = {
  titulo: string;
  blocos: BlocoGuia[];
};

export type TopicoGuia = {
  id: string;
  grupo: string;
  titulo: string;
  resumo: string;
  /** Caminho no menu. Fica de fora quando a tela ainda não existe no sistema. */
  onde?: string;
  secoes: SecaoGuia[];
  /** Ids de outros assuntos que completam este. */
  relacionados?: string[];
  /** Termos que a pessoa digita na busca e que não aparecem no texto. */
  palavras?: string;
};

export type TopicoTutorial = {
  id: string;
  grupo: string;
  titulo: string;
  /** Id do vídeo no YouTube. Só entra vídeo gravado pela equipe do Ortus. */
  videoId: string;
};

const texto = (valor: string): BlocoGuia => ({ tipo: 'texto', texto: valor });
const passos = (...itens: string[]): BlocoGuia => ({ tipo: 'passos', itens });
const lista = (...itens: string[]): BlocoGuia => ({ tipo: 'lista', itens });
const aviso = (valor: string): BlocoGuia => ({ tipo: 'aviso', texto: valor });

const TODOS_OS_TOPICOS: TopicoGuia[] = [
  {
    id: 'acesso',
    grupo: 'Começar',
    titulo: 'Primeiro acesso e escolha da clínica',
    resumo: 'Você entra com e-mail e senha. No primeiro acesso, troca a senha temporária. Se trabalha em mais de uma clínica, escolhe a unidade antes de começar.',
    onde: 'Tela de entrada do Ortus, no navegador ou no aplicativo de computador.',
    palavras: 'login logar entrar senha provisória unidade filial trocar de clínica logout deslogar termos link de acesso assinei',
    secoes: [
      {
        titulo: 'Entrar',
        blocos: [
          passos(
            'Abra o Ortus no navegador ou no aplicativo de computador.',
            'Digite o e-mail e a senha que a clínica passou para você e toque em **Entrar**.',
            'Se o aparelho é só seu, marque **Lembrar meu e-mail neste dispositivo**.',
          ),
          texto('Esqueceu a senha? Toque em **Esqueci a senha**, embaixo do campo de senha, e informe o seu e-mail: chega um link para criar uma senha nova. Vale o link mais recente, uma vez só. No aplicativo de computador esse atalho não aparece: peça o link pelo site ou fale com o suporte do Ortus.'),
        ],
      },
      {
        titulo: 'Quem acabou de assinar',
        blocos: [
          texto('Depois do pagamento confirmado, o Ortus cria a clínica e envia um link de acesso para o e-mail da assinatura.'),
          passos(
            'Abra o link do e-mail. Aparece a tela **Confirmar e-mail e criar a senha**.',
            'Toque em **Continuar**.',
            'Defina a sua senha na tela seguinte, como na troca de senha descrita abaixo.',
          ),
          texto('O link expira e só funciona uma vez. Se ele não valer mais, toque em **Enviar novo link**: o novo vai para o mesmo e-mail.'),
        ],
      },
      {
        titulo: 'Trocar a senha temporária',
        blocos: [
          texto('Quem é cadastrado pela clínica recebe uma senha temporária. Na primeira entrada, o Ortus abre a tela **Defina sua nova senha** e não libera o restante do sistema antes da troca.'),
          passos(
            'Digite a nova senha: pelo menos 8 caracteres, com letras e números.',
            'Repita a senha em **Confirmar senha**.',
            'Marque que leu os **Termos de Uso** e a **Política de Privacidade**.',
            'Toque em **Salvar nova senha**.',
          ),
          texto('A senha temporária deixa de valer assim que a nova é salva.'),
        ],
      },
      {
        titulo: 'Escolher a clínica',
        blocos: [
          texto('Se a sua conta está em uma clínica só, o Ortus abre direto nela. Com mais de uma, aparece a tela de escolha da unidade.'),
          lista(
            'Toque no nome da unidade para trabalhar nela.',
            '**Todas as clínicas** soma as unidades em uma visão só e serve para consultar. Lançar no Financeiro, usar o WhatsApp, editar permissões e abrir Tratamentos pedem uma unidade específica.',
          ),
          texto('Para trocar depois, use o seletor de unidade: no computador ele fica no alto do menu lateral; no celular, no topo da tela.'),
        ],
      },
      {
        titulo: 'Sair',
        blocos: [
          texto('Abra **Meu perfil** e toque em **Sair**. A sessão termina neste aparelho.'),
        ],
      },
    ],
    relacionados: ['perfil', 'equipe', 'visao', 'assinatura'],
  },
  {
    id: 'visao',
    grupo: 'Começar',
    titulo: 'Visão geral',
    resumo: 'A tela de abertura. Mostra quem está em atendimento, a linha do dia, as tarefas com prazo e uma calculadora de taxas.',
    onde: 'Menu **Visão Geral**. No celular, o ícone de casa na barra de baixo.',
    palavras: 'dashboard início painel resumo hoje pesquisar atalho maquininha',
    secoes: [
      {
        titulo: 'O atendimento de agora',
        blocos: [
          texto('O cartão do alto mostra o paciente em atendimento. Se não há consulta em andamento, mostra a próxima do dia.'),
          lista(
            '**Concluir** marca a consulta como concluída.',
            '**Ficha** abre o resumo do paciente: telefone, alergias, saldo em aberto e próxima consulta. De lá, **Abrir prontuário** leva à ficha completa.',
            'Sem consulta em andamento, **Ver agenda** leva à Agenda.',
          ),
        ],
      },
      {
        titulo: 'Calendário e linha do dia',
        blocos: [
          texto('O calendário marca com um ponto os dias que têm consulta. Toque em um dia para ver a **Linha do dia**, com horário, paciente e procedimento de cada consulta.'),
          texto('Toque em uma consulta para abrir os detalhes: procedimento, status, telefone, valor, última visita, saldo e alergias. Dali você abre a **Ficha**, o **WhatsApp** do paciente e, se houver saldo, **Receber**.'),
          texto('**Novo agendamento** marca uma consulta sem sair da tela. O botão de setas ao lado atualiza os dados.'),
        ],
      },
      {
        titulo: 'Consultas do dia e tarefas',
        blocos: [
          texto('**Consultas do dia** mostra quantas consultas do dia escolhido já foram concluídas.'),
          texto('**Tarefas** lista as atrasadas, as que vencem hoje e as próximas. Toque no círculo para concluir uma tarefa. **Ver todas** abre a tela de Tarefas.'),
        ],
      },
      {
        titulo: 'Calculadora de taxas',
        blocos: [
          texto('Digite um valor e escolha o grupo de taxa: PIX e débito, crédito Visa/Master ou crédito Elo/Outros. Para cada forma de pagamento, a tabela mostra a parcela, quanto você recebe e quanto cobrar para receber o valor cheio.'),
          texto('As taxas vêm de **Configurações > Taxas**.'),
        ],
      },
      {
        titulo: 'Busca e atalhos',
        blocos: [
          lista(
            'No computador, os botões do alto abrem **Mensagens e notificações**, **Configurações** e a busca. A busca também abre com Ctrl+K.',
            'No celular, abra o menu (ícone de três linhas) e toque em **Pesquisar paciente, tela ou ação**.',
            'A busca acha pacientes por nome ou telefone e traz atalhos: **Novo agendamento**, **Novo paciente**, **Pacientes com débito** e **Sem consulta há 30 dias**.',
          ),
        ],
      },
    ],
    relacionados: ['agenda', 'tarefas', 'configuracoes'],
  },
  {
    id: 'agenda',
    grupo: 'Atendimento',
    titulo: 'Agenda',
    resumo: 'Mostra as consultas por dia, semana, mês, lista ou profissional. É onde você marca, remarca, conclui e cancela.',
    onde: 'Menu **Agenda**.',
    palavras: 'consulta marcar agendar remarcar horário encaixe calendário lembrete 24h confirmação fiado',
    secoes: [
      {
        titulo: 'Escolher a visão',
        blocos: [
          lista(
            '**Dia**: grade por hora do dia escolhido.',
            '**Semana**: grade dos sete dias. No celular, vira uma lista por dia.',
            '**Mês**: calendário com as consultas de cada dia. No celular, cada dia mostra pontos, e tocar no dia abre a visão Dia.',
            '**Lista**: as consultas do mês, em ordem de data.',
            '**Profissionais**: uma coluna por profissional, no dia escolhido. No celular, um bloco por profissional.',
          ),
          texto('As setas mudam o período e **Hoje** volta para a data atual. Nas grades, a linha vermelha marca a hora atual.'),
        ],
      },
      {
        titulo: 'Marcar uma consulta',
        blocos: [
          passos(
            'Toque em **Novo agendamento** (no celular, **Novo**) ou em um horário da grade.',
            'Escolha a **Clínica**, o **Paciente**, a **Data**, a **Hora** e o **Procedimento**. Se o paciente ainda não tem cadastro, **Novo**, ao lado do campo, abre o cadastro.',
            'O **Profissional** é opcional. Quem não é administrador marca na própria agenda.',
            'Confira **Valor** e **Desconto**. O valor vem da tabela de tratamentos, conforme o plano do paciente, e pode ser ajustado.',
            'Toque em **Salvar**.',
          ),
          aviso('Se o profissional tem horário cadastrado em Equipe, o Ortus recusa consulta em dia que ele não atende, fora do expediente, fora do intervalo entre horários ou acima do limite de atendimentos simultâneos.'),
        ],
      },
      {
        titulo: 'Alterar, concluir ou cancelar',
        blocos: [
          texto('Toque na consulta para abrir **Editar agendamento**.'),
          lista(
            'Mude data, hora, procedimento ou valor e salve.',
            'Troque o status para agendado, concluído, faltou ou cancelado. A consulta cancelada continua na agenda, riscada. Quem faltou ou cancelou e não remarcou aparece nas **Oportunidades** de Orçamentos.',
            '**Excluir** apaga a consulta. O Ortus pede confirmação.',
          ),
          texto('O status **Fiado** marca o atendimento feito com pagamento em aberto. Ele é resolvido na aba Débitos do prontuário ou no Financeiro.'),
        ],
      },
      {
        titulo: 'Achar uma consulta',
        blocos: [
          texto('Use a busca por paciente ou procedimento e os filtros **Status** e **Profissional**. O X vermelho limpa os filtros. No celular, a busca e os filtros abrem pelo botão de ajustes, ao lado de **Novo**.'),
        ],
      },
      {
        titulo: 'Lembretes',
        blocos: [
          texto('Quando há consultas marcadas para amanhã sem lembrete, a Agenda mostra o quadro **Lembretes 24h**. Abra o quadro e, em cada paciente, escolha **WhatsApp**, **E-mail** ou **SMS**. O Ortus abre a mensagem pronta, com o modelo da clínica, para você conferir e enviar. O paciente sai da lista assim que você escolhe o canal.'),
          texto('Os lembretes automáticos são configurados em outros lugares:'),
          lista(
            WHATSAPP_ATIVO
              ? 'Por WhatsApp: ligue **Lembrete da consulta** em **WhatsApp > Automáticas**. Só saem com o WhatsApp da clínica conectado.'
              : 'Por WhatsApp: só pelo aplicativo de computador, que tem a aba **WhatsApp**. Nele, ligue **Lembrete da consulta** em **WhatsApp > Automáticas**. Os lembretes saem com o aplicativo aberto e o WhatsApp da clínica conectado.',
            'Por e-mail e SMS: quando esses envios estão configurados na sua instalação, saem todos os dias às 10h (horário de Brasília) para as consultas do dia seguinte, com os modelos de **Configurações > Comunicação**.',
          ),
        ],
      },
    ],
    relacionados: ['equipe', 'whatsapp', 'tratamentos', 'prontuario'],
  },
  {
    id: 'pacientes',
    grupo: 'Atendimento',
    titulo: 'Pacientes',
    resumo: 'A lista de pacientes da clínica: busca, filtros, cadastro e atalhos para agendar ou abrir o prontuário.',
    onde: 'Menu **Pacientes**. No celular, o ícone de pessoas na barra de baixo.',
    palavras: 'cadastro cadastrar cliente ficha cpf telefone responsável menor filtro retorno convênio',
    secoes: [
      {
        titulo: 'Achar um paciente',
        blocos: [
          texto('Digite nome, CPF ou telefone na busca.'),
          texto('**Filtros** abre mais opções: **Clínica**, **Status** (ativo, agendado ou novo), **Sem consulta há** (de 30 dias a 1 ano), **Procedimento pendente** e **Com débito**. **Limpar** desfaz os filtros.'),
          texto('Os dois botões ao lado trocam entre lista e grade. Toque no paciente para abrir o prontuário.'),
        ],
      },
      {
        titulo: 'Cadastrar',
        blocos: [
          passos(
            'Toque em **Novo paciente**.',
            'Preencha nome, sexo e clínica.',
            'Informe o endereço: CEP, rua, número, bairro, cidade e UF. Ao digitar o CEP, o Ortus preenche o restante; sem internet, preencha à mão.',
            'Nascimento, CPF, WhatsApp e plano são opcionais.',
            'Toque em **Cadastrar**.',
          ),
          lista(
            'Para menor de 18 anos, o Ortus exige o responsável: nome, parentesco e telefone.',
            'Se o CPF ou o nome já existe na clínica, o Ortus avisa antes de gravar. Confira e, se for outra pessoa, use **Cadastrar mesmo assim**.',
            'A foto é opcional: JPG, PNG ou WebP, com até 8 MB. A imagem é recortada e reduzida antes de ser enviada.',
          ),
        ],
      },
      {
        titulo: 'Atalhos',
        blocos: [
          texto(`Na lista do computador e na grade, cada paciente tem três atalhos: o **WhatsApp**, que abre a conversa com ele ${WHATSAPP_ATIVO ? 'dentro do Ortus' : 'no WhatsApp do próprio aparelho, com a mensagem pronta'}, **Agendar consulta** e **Nova prótese**.`),
        ],
      },
    ],
    relacionados: ['prontuario', 'agenda', 'laboratorio'],
  },
  {
    id: 'prontuario',
    grupo: 'Atendimento',
    titulo: 'Prontuário',
    resumo: 'Tudo de um paciente em um lugar: dados, anamnese, odontograma, tratamentos, documentos, débitos, harmonização e histórico.',
    onde: 'Menu **Pacientes** e, depois, o paciente.',
    palavras: 'ficha clínica dente dentes cárie evolução receita atestado contrato anexo anexar recebimento pagar harmonização orofacial toxina link público questionário lgpd exportar',
    secoes: [
      {
        titulo: 'Como o prontuário se divide',
        blocos: [
          texto('As seções são **Dados**, **Anamnese**, **Odontograma**, **Tratamentos**, **Documentos**, **Débitos**, **HOF** e **Histórico**.'),
          texto('No alto ficam os botões de contato (**WhatsApp**, **E-mail** e **SMS**) e **LGPD**, que baixa os dados do paciente em um arquivo.'),
        ],
      },
      {
        titulo: 'Dados',
        blocos: [
          texto('Mostra identificação, contato, plano e endereço. Toque em **Editar**, altere e toque em **Salvar**.'),
          texto('Para menor de 18 anos, o responsável é obrigatório.'),
        ],
      },
      {
        titulo: 'Anamnese',
        blocos: [
          texto('**Nova anamnese** abre o questionário. Escolha o **Modelo**, a **Data** e quem preenche.'),
          lista(
            '**Profissional**: você responde na tela e toca em **Salvar**. **Imprimir** gera a ficha com espaço para as assinaturas.',
            '**Paciente**: o Ortus gera um link para o paciente responder no celular dele.',
          ),
          texto('Para mandar o questionário ao paciente:'),
          passos(
            'Em **Preenchido por**, escolha **Paciente** e selecione o modelo.',
            'Toque em **Gerar link** e depois em **Copiar**.',
            'Envie o link ao paciente pelo canal que preferir.',
            'O paciente responde e toca em **Enviar Anamnese**. As respostas entram em **Anamneses salvas**.',
          ),
          aviso('O link vale 72 horas e só pode ser respondido uma vez. Ele não pede senha: quem tiver o link consegue responder, então envie só ao paciente. Gerar o link precisa de internet.'),
          texto('A mesma seção guarda a **Ficha médica** (condições como diabetes ou alergia a anestésico), os **Medicamentos em uso** e as **Observações clínicas**. Digite e pressione Enter para adicionar. O Ortus salva sozinho.'),
          texto('Os modelos de questionário são criados em **Configurações > Anamnese**.'),
        ],
      },
      {
        titulo: 'Odontograma',
        blocos: [
          texto('Escolha a visão **Anatômica**, **Esquemática** ou **Texto livre**, e a arcada: **Permanentes** ou **De leite**.'),
          passos(
            'Escolha a ferramenta: **Hígido**, **Cárie**, **Restauração**, **Tratado**, **Coroa**, **Implante**, **Extração** ou **Ausente**.',
            'Toque no dente ou na face do dente.',
            'O Ortus salva sozinho. Aparece **Salvando** por um instante.',
          ),
          lista(
            'As marcações aparecem em lista abaixo da arcada. As que pedem tratamento ficam destacadas.',
            '**Tratar marcações** abre um novo tratamento com os dentes marcados. Tocar no número de um dente abre o tratamento só dele.',
            '**Vista 3D** mostra a arcada em três dimensões.',
            '**PDF** imprime a ficha clínica com o orçamento.',
            '**Limpar** apaga todas as marcações, depois de confirmar.',
          ),
          texto('Em **Texto livre**, você escreve as observações e o plano de tratamento. O texto é salvo junto e entra no PDF.'),
        ],
      },
      {
        titulo: 'Tratamentos e evoluções',
        blocos: [
          texto('**Evolução clínica**: escolha a data do atendimento, escreva o que foi feito, a conduta e os próximos passos, e toque em **Registrar**. Os registros anteriores ficam abaixo, com data e profissional. **PDF** imprime o prontuário de evolução.'),
          texto('**Tratamentos realizados**: toque em **Novo** para registrar um tratamento.'),
          passos(
            'Informe o **Dente** (se houver), a **Data**, o **Procedimento**, o **Status** (planejado, em andamento ou concluído) e o **Valor**.',
            'Se houver marcações no odontograma, escolha os dentes em **Do odontograma**. Com o status concluído, você pode marcar as cáries desses dentes como tratadas.',
            'Marque **Agendar consulta na agenda** para criar a consulta no dia e no horário escolhidos.',
            'Marque **Pagamento pendente** para mandar o valor para a aba Débitos.',
            'Toque em **Salvar**.',
          ),
          texto('A soma dos tratamentos aparece no fim da lista.'),
        ],
      },
      {
        titulo: 'Documentos',
        blocos: [
          lista(
            '**Enviar** anexa um arquivo ao prontuário: JPG, PNG, WEBP, GIF, PDF, DOC, DOCX ou TXT, com até 10 MB. Imagens são reduzidas antes do envio.',
            '**Emitir** gera **Receita**, **Atestado** ou **Contrato** a partir de um modelo: escolha o modelo, ajuste o texto e toque em **Imprimir**. O cabeçalho e o rodapé da clínica entram na impressão.',
            'Toque no nome para abrir o arquivo. Os ícones ao lado baixam ou excluem.',
          ),
          aviso('Anexar, abrir e baixar arquivos precisa de internet, inclusive no aplicativo de computador.'),
          texto('Os modelos de documento são criados em **Configurações > Docs**.'),
        ],
      },
      {
        titulo: 'Débitos',
        blocos: [
          texto('Mostra o que o paciente deve: consultas e tratamentos com pagamento pendente e débitos lançados à mão.'),
          passos(
            'Toque em **Receber** no débito.',
            'Em **Registrar recebimento**, escolha a forma: crédito, débito, PIX ou dinheiro. No crédito, escolha as parcelas.',
            'Para dividir o pagamento, toque em **Adicionar forma** (até cinco). A soma precisa fechar o total.',
            'Ligue **Repassar taxas** para somar a taxa da maquininha ao valor cobrado do paciente.',
            'Toque em **Confirmar**.',
          ),
          lista(
            'Débito de consulta: ao receber, a consulta passa a concluída e o valor entra no Financeiro. Se o profissional da consulta tem regra de comissão **Débito Recebido**, a comissão também é lançada.',
            'Débito lançado à mão ou vindo de um tratamento: é só marcado como pago. Ele não entra sozinho no Financeiro; para aparecer no caixa, lance a receita lá.',
          ),
          texto('**Adicionar** cria um débito: descreva e informe o valor, ou marque consultas e tratamentos como não pagos.'),
        ],
      },
      {
        titulo: 'HOF (harmonização orofacial)',
        blocos: [
          passos(
            'Escolha o rosto (**Feminino** ou **Masculino**) e o modo **Alterar**.',
            'Escolha o procedimento, como toxina botulínica, preenchimento ou bioestimulador, e toque no ponto do rosto.',
            'Informe a dose, o produto e uma observação, e salve o ponto.',
            'Confira a data em **Sessão** e toque em **Salvar procedimento HOF**. O Ortus oferece agendar o procedimento sem sair da tela.',
          ),
          lista(
            '**Protocolos** aplica conjuntos prontos de pontos. Doses e produtos continuam editáveis.',
            '**Termo** gera o termo de consentimento. **PDF** imprime o mapa da sessão.',
            '**Fotos da sessão**: envie as fotos frontal, de perfil e em 45°. O envio precisa de internet.',
            '**Aplicação atual** avisa quando a reaplicação de um procedimento está próxima ou vencida.',
          ),
          aviso('As vistas **Demonstração** e **Frontal** são ilustrações para mostrar ao paciente. Não são o resultado clínico.'),
        ],
      },
      {
        titulo: 'Histórico',
        blocos: [
          texto('Lista os atendimentos do paciente e, ao lado, a **Linha do tempo** com as consultas e os débitos lançados e recebidos. A busca filtra por procedimento.'),
        ],
      },
    ],
    relacionados: ['pacientes', 'agenda', 'financeiro', 'configuracoes', 'arquivos'],
  },
  {
    id: 'laboratorio',
    grupo: 'Atendimento',
    titulo: 'Laboratório de próteses',
    resumo: 'Um quadro com os pedidos de prótese. Cada coluna é uma etapa, e o pedido anda de coluna em coluna até a entrega.',
    onde: 'Menu **Laboratório**.',
    palavras: 'prótese protético kanban quadro etapa pedido coroa ppr protocolo checklist prova entrega',
    secoes: [
      {
        titulo: 'Como o quadro funciona',
        blocos: [
          texto('As etapas padrão são **Solicitado**, **No Laboratório**, **Em Prova Clínica**, **Aguardando Ajuste** e **Finalizado / Entregue**. A faixa **Fluxo do processo** mostra quantos pedidos há em cada etapa e leva até a coluna.'),
          lista(
            'No computador, arraste o pedido de uma coluna para outra.',
            'No celular, **Avançar** leva o pedido para a etapa seguinte.',
            'No menu de três pontos do pedido, **Mover para…** escolhe qualquer etapa e **Mudar status…** troca o status.',
          ),
          aviso('Um pedido só entra em **Finalizado / Entregue** com todas as provas marcadas. As provas são marcadas em **Editar**, no menu do pedido.'),
        ],
      },
      {
        titulo: 'Criar um pedido',
        blocos: [
          passos(
            'Toque em **Novo pedido**.',
            'Busque o paciente. Se ele não existe, o Ortus oferece cadastrar com o nome digitado.',
            'Escolha a categoria (**Removível** ou **Fixa**) e o tipo, como PPR, coroa ou protocolo.',
            'Preencha os detalhes: cor do dente, cor da gengiva, posição (superior, inferior ou ambas) e observações para o laboratório.',
            'Toque em **Criar Pedido**.',
          ),
          lista(
            'O Ortus cria a lista de provas conforme o tipo. Uma PPR com grampo, por exemplo, nasce com prova do grampo e prova do dente.',
            'Cada coluna também tem **Adicionar pedido**, que cria o pedido já naquela etapa.',
            'O **Status atual** (em espera, pronto no lab, pronto na clínica ou concluída) acompanha o pedido em qualquer coluna.',
            'Também dá para abrir um pedido pela lista de Pacientes, em **Nova prótese**.',
          ),
        ],
      },
      {
        titulo: 'Achar e organizar',
        blocos: [
          texto('A busca acha por paciente, tipo ou cor. Os filtros são **Período** (últimos 7, 30 ou 90 dias) e **Status**.'),
          texto('**Quadro** cria uma etapa nova, com nome, cor, ícone e a opção de mostrar o checklist nos cartões. O menu de cada coluna edita ou remove a etapa.'),
          aviso('Remover uma etapa remove também os pedidos que estão nela. O Ortus mostra quantos são antes de confirmar.'),
        ],
      },
    ],
    relacionados: ['pacientes', 'relatorios'],
  },
  {
    id: 'tarefas',
    grupo: 'Atendimento',
    titulo: 'Tarefas',
    resumo: 'Pendências da equipe com responsável, prazo e prioridade, em três status: a fazer, em andamento e concluído.',
    onde: 'Menu **Tarefas**.',
    palavras: 'pendência afazer lembrete interno prazo responsável prioridade kanban',
    secoes: [
      {
        titulo: 'Criar uma tarefa',
        blocos: [
          passos(
            'Toque em **Nova tarefa**.',
            'Escreva o **Título**, que é obrigatório, e a descrição, se quiser.',
            'Escolha **Responsável**, **Data limite**, **Prioridade** e **Status**. A tarefa pode ser ligada a um **Paciente**.',
            'Toque em **Salvar**.',
          ),
        ],
      },
      {
        titulo: 'Acompanhar',
        blocos: [
          lista(
            'No computador, as tarefas ficam em três colunas. As setas do cartão avançam ou voltam o status, e o lápis abre a edição.',
            'No celular, as abas **A fazer**, **Fazendo** e **Feitas** trocam a lista. O botão escuro do cartão avança o status (**Iniciar**, **Concluir**) e o da esquerda volta. Tocar na tarefa abre a edição.',
            'Tarefa com prazo vencido aparece em vermelho.',
            'Para excluir, abra a tarefa e toque em **Excluir**.',
          ),
          texto('A busca e o filtro de prioridade valem para todas as tarefas. No computador há também o filtro de status e a cor de cada coluna (ícone de conta-gotas). A cor vale só neste aparelho.'),
          texto('As tarefas atrasadas e as que vencem hoje também aparecem na Visão geral.'),
        ],
      },
    ],
    relacionados: ['visao'],
  },
  {
    id: 'orcamentos',
    grupo: 'Atendimento',
    titulo: 'Orçamentos e funil comercial',
    resumo: 'Orçamento de cada paciente, o funil dos que não foram para a frente e as oportunidades para chamar o paciente de volta.',
    onde: 'Menu **Orçamentos**, e a seção **Orçamentos** na aba de tratamentos da ficha do paciente.',
    palavras: 'orçamento proposta plano de tratamento funil comercial vendas venda aprovar recusar ligar retorno oportunidade avaliação',
    secoes: [
      {
        titulo: 'Criar um orçamento',
        blocos: [
          passos(
            'Toque em **Novo orçamento** (no menu Orçamentos ou na ficha do paciente).',
            'Escolha o **Paciente**, o **Profissional** e, se houver, a pessoa do **Comercial**.',
            'Inclua os procedimentos. O preço vem do catálogo de **Tratamentos** (ou da tabela do convênio do paciente) e pode ser ajustado.',
            'Confira o **Desconto** e a data em **Válido até** (30 dias por padrão) e toque em **Salvar**.',
          ),
          texto('O orçamento nasce como **Rascunho**. Abra-o para **Imprimir** (ou salvar em PDF), **Marcar como enviado** quando mandar ao paciente, ou **Apresentado** quando ele ficou parado depois de apresentado (fica **Em aberto**).'),
        ],
      },
      {
        titulo: 'Aprovar ou recusar',
        blocos: [
          lista(
            '**Aprovar** cria um tratamento planejado para cada procedimento, na ficha do paciente, e lança o valor final como **a receber** (aparece no Financeiro, em aberto).',
            '**Recusado** pede o motivo e guarda o histórico. O orçamento recusado pode ser **Reaberto**.',
            'Quando a validade passa sem aprovação nem recusa, o orçamento fica **Expirado** e sai do funil.',
          ),
          aviso('Orçamento aprovado não pode ser editado nem excluído: ele já virou tratamento.'),
        ],
      },
      {
        titulo: 'Funil e contato com o paciente',
        blocos: [
          texto('A aba **Funil** mostra os orçamentos em andamento em três colunas (Rascunho, Enviado, Em aberto), com telefone, valor, há quantos dias está parado e quando ligar de novo. **Só ligar hoje** filtra os que têm contato marcado para hoje ou antes.'),
          passos(
            'No cartão, toque no telefone para **Ligar** ou no balão para mandar **WhatsApp** com a mensagem pronta.',
            'Depois da conversa, registre em **Registrar contato**: como foi, o que foi conversado e quando ligar de novo.',
          ),
        ],
      },
      {
        titulo: 'Oportunidades',
        blocos: [
          texto('A aba **Oportunidades** junta quem vale a pena chamar de volta:'),
          lista(
            '**Avaliação sem orçamento**: consulta ou avaliação atendida nos últimos 60 dias sem orçamento depois dela. O que conta como avaliação é marcado em **Tratamentos** (os nomes com "avaliação" ou "consulta" já vêm marcados).',
            '**Faltou e não remarcou** e **Cancelou e não remarcou**: o último agendamento do paciente nos últimos 90 dias foi falta ou cancelamento, e não há nada marcado à frente.',
            '**Orçamento parado**: enviado ou em aberto, sem contato há 7 dias ou com a data de ligar de novo vencida.',
          ),
          texto('Dali dá para criar o orçamento ou registrar o contato. Registrar um contato tira o paciente da lista até a data combinada para ligar de novo.'),
        ],
      },
    ],
    relacionados: ['agenda', 'financeiro'],
  },
  {
    id: 'chamada-tv',
    grupo: 'Atendimento',
    titulo: 'Chamada na TV',
    resumo: 'A TV da sala de espera mostra (e fala) quem foi chamado e em qual consultório, pelo nome curto ou por senha.',
    onde: '**Configurações → Chamada na TV** (administrador), o botão **Chamar** na agenda e na Visão geral, e o botão **Senha** na agenda.',
    palavras: 'tv televisão painel chamada senha sala de espera recepção chamar paciente consultório guichê',
    secoes: [
      {
        titulo: 'Preparar a TV',
        blocos: [
          passos(
            'Em **Configurações → Chamada na TV**, escolha o que a TV mostra: **Nome curto** (primeiro nome e inicial do sobrenome, como "Maria S.") ou **Só a senha**.',
            'Liste os **Locais de atendimento** (consultórios, salas, guichês) e toque em **Salvar**.',
            'Em **TVs**, dê um nome e toque em **Criar link**. Copie o link: ele só aparece nessa hora.',
            'Abra o link no navegador da TV e toque uma vez em **Toque para ativar o som**.',
          ),
          aviso('Quem tiver o link vê as chamadas. Se ele vazar ou a TV for trocada, toque em **Revogar** e crie outro. O nome completo do paciente nunca aparece na TV.'),
        ],
      },
      {
        titulo: 'Chamar',
        blocos: [
          lista(
            'Na agenda, abra o agendamento de hoje e toque em **Chamar**. Na **Visão geral**, o cartão do atendimento também tem **Chamar**.',
            'Para quem chegou sem consulta, toque em **Senha** no topo da agenda: o Ortus gera a próxima senha do dia e chama.',
            'Com mais de um local cadastrado, o Ortus pergunta onde. A TV destaca a chamada, toca um aviso e, se a voz estiver ligada, fala o nome (ou a senha) e o local.',
          ),
          texto('A chamada precisa de internet, inclusive no aplicativo de computador. As senhas recomeçam todo dia.'),
        ],
      },
    ],
    relacionados: ['agenda'],
  },
  {
    id: 'google-agenda',
    grupo: 'Atendimento',
    titulo: 'Google Agenda',
    resumo: 'Cada profissional liga a própria agenda do Google: as consultas dele aparecem lá, e o que ele marcar direto no Google ocupa o horário no Ortus.',
    onde: '**Perfil → Google Agenda** (cada profissional, com a própria conta). A agenda do Ortus avisa quando uma consulta não chegou ao Google.',
    palavras: 'google agenda calendar calendário sincronizar integração celular compromisso bloqueio horário ocupado',
    secoes: [
      {
        titulo: 'Ligar',
        blocos: [
          passos(
            'Abra o seu **Perfil** e, em **Google Agenda**, toque em **Conectar Google Agenda**.',
            'Escolha a conta do Google e permita o acesso à agenda. Você volta ao Perfil com a conta conectada.',
            'Pronto: as consultas em que você é o profissional vão para essa agenda, e as mudanças (remarcar, trocar de profissional, cancelar) seguem sozinhas.',
          ),
          texto('No Google o evento leva só o **primeiro nome do paciente e o tipo da consulta**, como "Maria · Limpeza". Sobrenome, telefone, valores e observações não saem do Ortus.'),
        ],
      },
      {
        titulo: 'Horários ocupados',
        blocos: [
          texto('Com **"Compromissos marcados direto no Google ocupam o meu horário no Ortus"** ligado, o que você marcar no Google (fora do Ortus) aparece como ocupado e o Ortus avisa quando alguém tentar marcar por cima. O título do compromisso não vem para o Ortus. Desligue a opção para a agenda do Ortus voltar a ficar livre na hora.'),
        ],
      },
      {
        titulo: 'Se o Google falhar',
        blocos: [
          lista(
            'A consulta fica **salva no Ortus** do mesmo jeito. A agenda mostra a faixa "não foi enviada ao Google Agenda" e o popup da consulta, o aviso com **Tentar de novo**.',
            'O Ortus também tenta de novo sozinho, com espera cada vez maior.',
            'Se o acesso for retirado no Google, o Perfil avisa: toque em **Conectar de novo**.',
          ),
          texto('Para parar, toque em **Desligar** no Perfil. As consultas seguintes deixam de ir para o Google, e os eventos que já estão lá ficam.'),
        ],
      },
    ],
    relacionados: ['agenda', 'perfil'],
  },
  {
    id: 'conversas',
    grupo: 'Comunicação',
    titulo: 'Conversas da equipe',
    resumo: 'Chat interno da clínica: canal Geral e outros que a clínica criar, como recepção e comercial.',
    onde: 'Menu **Conversas**.',
    palavras: 'chat interno recado mensagem equipe canal grupo recepção comercial colega',
    secoes: [
      {
        titulo: 'Como funciona',
        blocos: [
          lista(
            'Toda clínica tem o canal **Geral**. O administrador cria outros em **Novo** (ex.: recepção, comercial) e pode **Arquivar** os que não usa mais; as mensagens de um canal arquivado ficam guardadas.',
            'Escreva no campo de baixo e toque no botão de enviar. No computador, Enter envia e Shift+Enter quebra a linha.',
            'Mensagens novas aparecem sozinhas em poucos segundos. O número ao lado de **Conversas** no menu mostra o que ainda não foi lido.',
            'Cada pessoa pode apagar as próprias mensagens.',
          ),
          aviso('As conversas são só da equipe da clínica: não chegam aos pacientes (isso é a aba **WhatsApp → Conversas**) nem à Ortus. Para falar com a Ortus, use **Ajuda → Contatar o suporte**.'),
          texto('As conversas precisam de internet. No aplicativo de computador sem conexão, a tela avisa e volta quando a conexão voltar.'),
        ],
      },
    ],
    relacionados: ['whatsapp'],
  },
  {
    id: 'whatsapp',
    grupo: 'Comunicação',
    titulo: 'WhatsApp',
    resumo: 'Liga o número da clínica ao Ortus: conversas, mensagens agendadas e automações. As mensagens saem pelo número da clínica.',
    onde: 'Menu **WhatsApp**. A aba só aparece nas instalações em que o WhatsApp do Ortus está ligado.',
    palavras: 'zap qr code escanear conectar aparelho celular dispositivo mensagem automática confirmação aniversário retorno agendar envio',
    secoes: [
      {
        titulo: 'Onde funciona',
        blocos: [
          texto('O WhatsApp do Ortus roda em um serviço que precisa ficar ligado. Esse serviço existe em dois lugares:'),
          lista(
            'no **aplicativo de computador**, que já traz o serviço. As mensagens só saem com o Ortus aberto naquele computador e com o WhatsApp conectado;',
            'em instalação com **servidor sempre ligado**, que o suporte configura.',
          ),
          texto('Quando você entra por um endereço que não tem nenhum dos dois, a tela avisa que o WhatsApp não funciona por aquele acesso. Ali não dá para conectar nem conversar. As abas **Automáticas**, **Agendadas** e **Histórico** continuam valendo: o que você liga ou agenda sai pelo aplicativo de computador da clínica, quando ele estiver aberto e conectado.'),
        ],
      },
      {
        titulo: 'Conectar: o que escanear',
        blocos: [
          passos(
            'Escolha a clínica no seletor de unidade. Cada clínica tem a própria conexão.',
            'Abra **WhatsApp** no menu e toque em **Gerar QR Code**.',
            'No celular que tem o WhatsApp da clínica, abra o WhatsApp, entre em **Dispositivos conectados** e toque em **Conectar dispositivo**. No Android, o caminho fica no menu de três pontos; no iPhone, em Configurações. Em versões antigas, o nome é **Aparelhos conectados**.',
            'Aponte a câmera desse celular para o código que aparece no Ortus.',
            'Feita a conexão, o alto da tela mostra o nome e o número conectados.',
          ),
          aviso('Escaneie só o código que aparece dentro do Ortus, e com o celular da clínica, não o seu pessoal. O aparelho que escaneia dá ao Ortus acesso às conversas daquele número.'),
          texto('Se o Ortus está aberto no próprio celular da clínica, abra o Ortus em outro aparelho para mostrar o código: é a câmera do celular da clínica que precisa ler.'),
          texto('A conexão fica guardada. No aplicativo, ela fica no computador: fechar o Ortus não desconecta. No servidor, volta sozinha quando ele reinicia. **Desconectar** encerra a conexão, e as mensagens automáticas e agendadas param até você escanear de novo.'),
        ],
      },
      {
        titulo: 'Conversas',
        blocos: [
          texto('Com o WhatsApp conectado, a aba **Conversas** lista os contatos. Toque em um para ver o histórico e responder.'),
          lista(
            'O botão **+** começa uma conversa nova: escolha um paciente ou digite um número com DDD.',
            '**Respostas prontas** insere um modelo de mensagem. Os modelos vêm de **Configurações > Comunicação**.',
            'O clipe anexa um arquivo: imagem, PDF, Word, Excel, áudio ou vídeo, com até 3 MB.',
            'Quando o contato é um paciente, **Ficha do paciente** abre o resumo dele.',
          ),
          texto('Os botões de WhatsApp do sistema (lista de pacientes, prontuário e lembretes da Agenda) abrem a conversa aqui, com a mensagem já escrita para você conferir e enviar. Nas instalações em que o WhatsApp do Ortus está desligado, eles abrem o WhatsApp do próprio aparelho.'),
        ],
      },
      {
        titulo: 'Automáticas',
        blocos: [
          texto('São cinco automações. Cada uma tem o próprio texto e uma chave de ligar.'),
          lista(
            '**Confirmação de agendamento**: sai logo depois que a consulta é marcada na agenda.',
            '**Lembrete da consulta**: sai antes do horário marcado. O padrão é 24 horas antes.',
            '**Pós-consulta**: agradece depois que a consulta é concluída na agenda.',
            '**Aniversário**: parabeniza o paciente no dia do aniversário.',
            '**Convite de retorno**: chama quem não vem há alguns meses e não tem consulta marcada.',
          ),
          texto('Em **Horário de envio**, você define o período em que as automações podem sair. O que cair fora espera o próximo horário permitido.'),
          texto('Use as variáveis no texto (nome do paciente, nome da clínica, data e hora da consulta) e confira o resultado na **Prévia**. **Salvar automações** grava tudo.'),
          aviso('Ligar a confirmação ou o pós-consulta vale dali para a frente: não dispara para consultas antigas. As automáticas só saem com o WhatsApp conectado.'),
        ],
      },
      {
        titulo: 'Agendadas e Histórico',
        blocos: [
          lista(
            '**Agendadas**: escreva uma mensagem para um ou vários pacientes, ou para um número avulso, escolha data e hora no futuro e agende. Enquanto a mensagem não saiu, dá para cancelar. Se o WhatsApp estiver desconectado na hora marcada, a mensagem fica guardada e sai quando ele for conectado.',
            '**Histórico**: mostra o que as automações enviaram e as falhas recentes.',
          ),
        ],
      },
    ],
    relacionados: ['agenda', 'configuracoes', 'aplicativo', 'mensagens'],
  },
  {
    id: 'mensagens',
    grupo: 'Comunicação',
    titulo: 'Mensagens e notificações',
    resumo: 'A caixa de avisos do Ortus: convites de equipe, mensagens e notificações da clínica. Não é canal de suporte.',
    onde: 'No computador, o sino no alto da Visão geral. No celular, **Mensagens** no menu.',
    palavras: 'aviso sino notificação convite aceitar recusar caixa de entrada link e-mail confirmar',
    secoes: [
      {
        titulo: 'O que aparece',
        blocos: [
          lista(
            '**Convites**: quando outra clínica convida você para a equipe dela.',
            '**Mensagens**: avisos enviados para você dentro do Ortus.',
            '**Notificações**: avisos da clínica, como os da agenda.',
          ),
          texto('Em cada painel, **Ativas** mostra o que está valendo e **Histórico**, o que já foi lido ou venceu. O menu de três pontos marca como lida ou exclui.'),
          texto('A tela abre para todas as pessoas da clínica, sem depender de módulo.'),
        ],
      },
      {
        titulo: 'Responder a um convite',
        blocos: [
          texto('O convite chega por e-mail e aparece aqui, no cartão **Convite de equipe**, com quem convidou, as unidades, a rede, o cargo e o prazo.'),
          passos(
            'Abra o e-mail do convite e toque em **Abrir o convite**. Se o Ortus pedir, entre com a conta do e-mail convidado: depois de entrar, você volta para o convite.',
            'Na tela **E-mail confirmado**, toque em **Responder ao convite**.',
            'No cartão do convite, toque em **Aceitar** ou **Recusar**.',
          ),
          lista(
            '**Aceitar**: você passa a ver aquelas unidades no seletor de clínica, sem perder as suas.',
            '**Recusar**: nada muda nos seus vínculos. Para recusar, o link do e-mail não é preciso.',
          ),
          aviso('Sem abrir o link do e-mail, o Ortus não aceita o convite: o link confirma que o e-mail é seu e só funciona com a conta desse e-mail. Se o e-mail não chegou, ou se a tela disser que o link é inválido ou foi substituído, peça a quem convidou para enviar de novo. Vale só o link do e-mail mais recente.'),
          texto('O convite vale 14 dias. Depois disso aparece como expirado, e quem convidou precisa enviar outro.'),
          aviso('Quem entra por convite de outra rede nunca é administrador na clínica que convidou, mesmo sendo administrador na própria.'),
        ],
      },
      {
        titulo: 'Não é suporte',
        blocos: [
          texto('Esta caixa não chega à equipe do Ortus. Para falar com o suporte, abra **Ajuda** e use **Contatar o suporte** ou **Reportar bugs ou sugerir funcionalidades**.'),
        ],
      },
    ],
    relacionados: ['equipe', 'whatsapp'],
  },
  {
    id: 'financeiro',
    grupo: 'Gestão',
    titulo: 'Financeiro',
    resumo: 'O caixa da clínica: o que entrou pelas consultas, o que foi lançado à mão, o que está em aberto e o que foi cancelado.',
    onde: 'Menu **Financeiro**.',
    palavras: 'caixa extrato receita despesa lançamento entrada saída fiado a receber a pagar csv exportar categoria taxa',
    secoes: [
      {
        titulo: 'Ler o extrato',
        blocos: [
          texto('No alto ficam quatro números do período: **Entradas** (o que já entrou), **Saídas** (o que já foi pago), **Resultado** (entradas menos saídas concluídas) e **Em aberto** (a receber e a pagar).'),
          texto('As abas separam **Concluídos**, **Em andamento** (no celular, **Em aberto**) e **Cancelados**.'),
          texto('Escolha o período por **Mês** ou **Intervalo**, filtre por **Entradas** ou **Saídas** e busque por descrição, paciente ou categoria. **Filtros** abre categoria, origem, forma, profissional, paciente, taxa de cartão e faixa de valor.'),
          texto('Com **Todas as clínicas** selecionada, o caixa soma as unidades. Para ver ou lançar em uma só, escolha a unidade.'),
        ],
      },
      {
        titulo: 'De onde vêm os lançamentos',
        blocos: [
          lista(
            'Consulta concluída na Agenda entra pelo valor final: valor menos desconto.',
            'Atendimento com pagamento pendente (fiado) fica em **Em andamento** até ser recebido.',
            'Receitas e despesas lançadas por você aparecem com a origem **Manual**.',
          ),
        ],
      },
      {
        titulo: 'Lançar receita ou despesa',
        blocos: [
          passos(
            'Escolha uma clínica específica e toque em **Novo lançamento**.',
            'Marque **Receita** ou **Despesa** e preencha **Descrição**, **Valor** e **Data**.',
            'Escolha a **Forma de pagamento** e, se for cartão, a **Taxa da maquininha**.',
            'Escolha a **Categoria** na lista ou digite uma livre, usada só nesse lançamento.',
            'Defina o **Status**: **Concluído** entra no saldo; **Em andamento** fica em aberto.',
            'Toque em **Salvar**.',
          ),
        ],
      },
      {
        titulo: 'Corrigir, cancelar e receber',
        blocos: [
          lista(
            'Só lançamento manual pode ser editado ou cancelado aqui. Consulta se corrige na Agenda.',
            '**Cancelar lançamento** pede o motivo. O lançamento vai para **Cancelados**, de onde pode ser restaurado ou excluído de vez.',
            'Nos lançamentos em andamento, você conclui um lançamento manual ou registra o recebimento de um fiado. No computador, as ações são os ícones no fim da linha; no celular, o botão do cartão e o menu de três pontos.',
            '**CSV** baixa o extrato com os filtros aplicados.',
            'Os débitos do paciente que não vêm de uma consulta (o valor de um orçamento aprovado, um débito lançado na ficha) também aparecem em aberto. Receber um deles guarda a forma de pagamento escolhida e a data.',
          ),
          aviso('Receber um fiado por aqui só registra a entrada: a forma de pagamento e a taxa da maquininha não são guardadas, e a comissão não é lançada. Para isso, receba pela aba Débitos do prontuário.'),
        ],
      },
      {
        titulo: 'Meta de vendas',
        blocos: [
          texto('No modo **Mês**, o cartão **Meta de vendas** mostra quanto já foi aprovado em orçamentos no mês, quanto falta para a meta e o ritmo: quanto era esperado até hoje e quanto o mês fecha se o ritmo continuar. À parte, mostra quanto **entrou no caixa** (consultas pagas, débitos recebidos e entradas manuais, pela data em que o dinheiro entrou).'),
          passos(
            'Com uma clínica escolhida no menu, o administrador toca em **Definir meta** (ou **Editar meta**).',
            'Preencha a meta da clínica e, se quiser, a de cada profissional. Campo vazio tira a meta.',
            'Toque em **Salvar**.',
          ),
          texto('**Por profissional** abre o aprovado de cada um contra a própria meta. O relatório **Metas de vendas**, em Relatórios, mostra os meses anteriores.'),
        ],
      },
    ],
    relacionados: ['prontuario', 'relatorios', 'configuracoes', 'equipe', 'orcamentos'],
  },
  {
    id: 'relatorios',
    grupo: 'Gestão',
    titulo: 'Relatórios',
    resumo: 'Leituras prontas do movimento da clínica, em quatro grupos: dinheiro, agenda, pacientes e laboratório. Aqui você consulta: nada é lançado nem alterado.',
    onde: 'Menu **Relatórios**.',
    palavras: 'indicador faturamento inadimplência comparecimento faltas ocupação produção ticket médio comissão pdf imprimir',
    secoes: [
      {
        titulo: 'Escolher o período',
        blocos: [
          texto('Use os atalhos **Hoje**, **7 dias**, **Mês**, **Trimestre** e **Ano**, ou **Intervalo** para datas exatas.'),
          lista(
            '**Comparar** mostra a variação em relação ao período anterior.',
            'Nos relatórios de agenda e em Pacientes novos, dá para filtrar por profissional.',
            'Com **Todas as clínicas** selecionada, os números somam as unidades.',
          ),
        ],
      },
      {
        titulo: 'Os relatórios',
        blocos: [
          lista(
            '**Dinheiro**: Faturamento, Inadimplência, Formas de pagamento e Fluxo do caixa.',
            '**Agenda**: Comparecimento, Ocupação, Produção por profissional, Procedimentos e Carga da agenda.',
            '**Pacientes**: Pacientes novos, Quem não volta, Particular e convênio e Planos.',
            '**Laboratório**: Próteses e Comissões.',
          ),
          texto('Toque em um relatório para abrir as tabelas. **PDF** imprime o que está na tela.'),
        ],
      },
      {
        titulo: 'Como ler alguns números',
        blocos: [
          lista(
            '**Inadimplência** considera todo o fiado em aberto da clínica, mesmo o de antes do período escolhido.',
            '**Ocupação** compara as consultas com o horário cadastrado de cada profissional. Sem horário cadastrado, o Ortus assume 10 horas em dias úteis e 30 minutos por consulta.',
            '**Fluxo do caixa**: realizado é consulta concluída; previsto é o que ainda está na agenda ou em fiado.',
            '**Formas de pagamento** só mostra a forma quando ela foi registrada com a taxa da maquininha. O restante aparece como não informado.',
            '**Comissões** lista só o que o sistema já lançou. O pagamento da comissão é controlado fora desta tela.',
          ),
        ],
      },
    ],
    relacionados: ['financeiro', 'agenda', 'equipe'],
  },
  {
    id: 'equipe',
    grupo: 'Gestão',
    titulo: 'Equipe',
    resumo: 'Onde o administrador cadastra pessoas, convida quem já usa o Ortus e define o que cada um acessa, os horários de atendimento e as comissões.',
    onde: 'Menu **Equipe**. Só administradores gerenciam a equipe.',
    palavras: 'funcionário colaborador usuário cadastrar convidar convite senha temporária provisória permissão módulo acesso administrador admin horário comissão dentista recepcionista',
    secoes: [
      {
        titulo: 'Adicionar uma pessoa',
        blocos: [
          passos(
            'Toque em **Adicionar**.',
            'Preencha **Nome**, **E-mail** e **Cargo**.',
            'Marque as **Unidades de acesso**. É preciso pelo menos uma.',
            'Toque em **Cadastrar**.',
          ),
          texto('O que acontece depois depende do e-mail:'),
          lista(
            '**E-mail sem conta no Ortus**: a conta é criada com uma **senha temporária**, que aparece na tela. Copie e entregue você mesmo à pessoa: a senha não vai por e-mail. No primeiro acesso, ela é obrigada a trocar.',
            '**E-mail que já tem conta no Ortus**: sai um **convite** por e-mail. Para aceitar, a pessoa abre o link desse e-mail com a conta dela no Ortus e depois responde em Mensagens. Nada muda na conta dela antes disso.',
          ),
          aviso('Anote a senha temporária antes de fechar a janela. O Ortus não mostra essa senha de novo.'),
          texto('Nos dois casos sai um e-mail para a pessoa, e a tela diz quando ele não sai. Na conta nova, o e-mail só avisa que o acesso existe: se falhar, avise a pessoa você mesmo. No convite, o e-mail é obrigatório: sem o link dele, a pessoa não consegue aceitar.'),
        ],
      },
      {
        titulo: 'Convites',
        blocos: [
          texto('O quadro **Convites de equipe** lista os convites enviados e o estado de cada um: pendente, aceito, recusado, cancelado ou expirado. Enquanto o convite está pendente, dá para **Cancelar**. O convite vale 14 dias.'),
          texto('Para mandar o e-mail do convite de novo, adicione a pessoa outra vez com o mesmo e-mail. O convite pendente ganha mais 14 dias e sai um e-mail com link novo; o link anterior deixa de valer. Se o último e-mail saiu há menos de 10 minutos, nenhum outro é enviado e o link dele continua valendo.'),
          aviso('Quem entra por convite pertence a outra rede e nunca é administrador na clínica que convidou, mesmo sendo administrador na de origem. A clínica que convidou ajusta só os módulos que a pessoa acessa ali. O perfil continua com a clínica de origem.'),
        ],
      },
      {
        titulo: 'Permissões por módulo',
        blocos: [
          passos(
            'Escolha uma clínica específica no seletor de unidade.',
            'Toque na pessoa. No computador, use **Editar**.',
            'Na aba **Permissões**, escolha o **Nível de acesso**: **Comum** ou **Admin**.',
            'Para o nível comum, ligue os módulos um a um ou use um dos **Perfis rápidos**: Recepcionista, Dentista, Financeiro, Gestor, Acesso completo ou Restrito.',
            'Toque em **Salvar**.',
          ),
          texto('O que cada módulo libera:'),
          lista(
            '**Agenda**: Agenda e Tarefas.',
            '**Ficha do Paciente**: Pacientes, prontuário e WhatsApp.',
            '**Controle de Próteses**: Laboratório.',
            '**Financeiro**: Financeiro.',
            '**Inteligência**: Relatórios.',
            '**Configurações**: Equipe, Tratamentos e Configurações.',
          ),
          texto('O administrador acessa tudo. **Mensagens e notificações** abre para todos, com ou sem módulo. **Estoque**, **Loja / Marketplace** e **Marketing** aparecem na lista, mas ainda não abrem nenhuma tela.'),
        ],
      },
      {
        titulo: 'Horários de atendimento',
        blocos: [
          texto('Na aba **Horários**, defina **Início**, **Término**, **Intervalo** entre consultas (em minutos), **Limite simultâneo** e os **Dias de atendimento**. Depois, toque em **Salvar**.'),
          texto('A Agenda passa a recusar consulta desse profissional fora dessas regras, e o relatório de Ocupação usa esse horário como capacidade.'),
        ],
      },
      {
        titulo: 'Comissões',
        blocos: [
          texto('Na aba **Comissão**, crie as regras do profissional. Cada regra tem um **Gatilho**, um **Tipo** (percentual ou valor fixo), um **Valor** e a chave **Regra ativa**. São dois gatilhos:'),
          lista(
            '**Débito Recebido**: a comissão é lançada quando o débito de uma consulta é recebido na aba Débitos do prontuário. Ela vai para o profissional da consulta e é calculada sobre o valor recebido, já sem a taxa da maquininha. Consulta sem profissional não gera comissão, e débito lançado à mão ou vindo de um tratamento também não.',
            '**Tratamento Finalizado**: a comissão é lançada quando um tratamento é salvo com o status concluído no prontuário. Ela vai para quem está usando o sistema naquele momento e é calculada sobre o valor do tratamento.',
          ),
          texto('Regra antiga com o gatilho **Orçamento Aprovado** continua na lista, marcada como **sem efeito**: nada no sistema lança comissão por esse gatilho. Para a regra valer, edite e troque o gatilho.'),
          texto('O quadro **Comissões**, na tela da Equipe, mostra as regras ativas da clínica e os lançamentos recentes.'),
          aviso('A comissão de tratamento é lançada uma vez, quando ele passa a concluído; editar um tratamento já concluído não gera outro lançamento. No aplicativo de computador sem internet, o débito recebido e o tratamento são salvos, mas a comissão não é lançada.'),
        ],
      },
    ],
    relacionados: ['mensagens', 'acesso', 'agenda', 'relatorios'],
  },
  {
    id: 'tratamentos',
    grupo: 'Gestão',
    titulo: 'Tratamentos e planos',
    resumo: 'O catálogo de procedimentos da clínica e o preço de cada um por plano. É daqui que a Agenda tira o valor da consulta.',
    onde: 'Menu **Tratamentos**. Escolha uma clínica específica.',
    palavras: 'procedimento preço tabela convênio particular especialidade tuss cobertura coberto catálogo valor custo',
    secoes: [
      {
        titulo: 'Como a tela se organiza',
        blocos: [
          texto('São três partes: os planos, as especialidades e a lista de tratamentos.'),
          texto('O plano **Particular** é o catálogo da clínica. É nele que você cria, edita e exclui tratamentos e especialidades. Os outros planos, de convênio, definem o que cada um cobre sobre esse catálogo.'),
          aviso('O plano **Particular** não pode ser excluído nem renomeado.'),
        ],
      },
      {
        titulo: 'Cadastrar um tratamento',
        blocos: [
          passos(
            'Selecione o plano **Particular**.',
            'Se a especialidade ainda não existe, crie em **Especialidade**.',
            'Toque em **Novo tratamento**.',
            'Preencha o **Nome** e a **Especialidade**, que são obrigatórios, e depois **Valor**, **Custo** e **Código TUSS**.',
            'Para levar o tratamento aos outros planos, deixe **Adicionar a todos os planos** ligada ou escolha os planos.',
            'Toque em **Salvar**.',
          ),
          lista(
            'A chave ao lado de cada tratamento liga e desliga: no Particular, **Ativo**; nos outros planos, **Coberto**.',
            'O Ortus não deixa repetir nome de especialidade, de tratamento ou de plano.',
          ),
          aviso('Ao editar um tratamento com **Adicionar a todos os planos** ligada, o valor, o custo e o código TUSS salvos substituem os desse tratamento em todos os planos. A chave já vem ligada.'),
        ],
      },
      {
        titulo: 'Criar um plano de convênio',
        blocos: [
          passos(
            'Toque em **Novo plano** e dê o nome.',
            'Escolha de onde vêm os tratamentos: **Com base no Particular** (copia tudo o que está ativo), **Vazio** ou **Tratamentos selecionados**.',
            'Toque em **Salvar**.',
            'Com o plano selecionado, ligue ou desligue **Coberto** em cada tratamento.',
          ),
          texto('No menu de três pontos do plano, **Editar** troca o nome e liga ou desliga a chave **Ativo**, e **Excluir** remove o plano.'),
        ],
      },
      {
        titulo: 'Onde o preço aparece',
        blocos: [
          texto('Ao marcar uma consulta, a Agenda preenche o valor conforme o plano do paciente: no Particular, o valor do catálogo; no convênio, o valor da tabela do plano. Para paciente de convênio, só aparecem os tratamentos cobertos pelo plano. O valor preenchido pode ser alterado na hora de agendar.'),
        ],
      },
      {
        titulo: 'Excluir',
        blocos: [
          lista(
            'Excluir um tratamento tira ele de todos os planos.',
            'Excluir uma especialidade exclui também os tratamentos dela.',
            'Excluir um plano apaga os preços dele. Os pacientes vinculados ficam sem plano.',
          ),
          texto('Em **Configurações > Geral**, **Exportar** baixa a tabela de tratamentos da clínica.'),
        ],
      },
    ],
    relacionados: ['agenda', 'configuracoes', 'pacientes'],
  },
  {
    id: 'configuracoes',
    grupo: 'Gestão',
    titulo: 'Configurações',
    resumo: 'Ajustes da clínica: unidades, horário, modelos de anamnese e de documentos, categorias financeiras, taxas da maquininha, modelos de mensagem e backups.',
    onde: 'Menu **Configurações**.',
    palavras: 'ajuste preferência unidade logo cnpj modelo template categoria taxa maquininha backup restaurar exportar importar tema cabeçalho rodapé',
    secoes: [
      {
        titulo: 'Geral',
        blocos: [
          texto('Guarda o que entra nos documentos impressos (nome para documentos, CNPJ, slogan, cabeçalho e rodapé), o horário de atendimento (abertura, fechamento, duração da consulta e dias) e a cor do tema. **Exportar** baixa a tabela de tratamentos.'),
          texto('As mudanças desta aba são gravadas na hora, sem botão de salvar.'),
          aviso('Só o administrador da clínica grava em Configurações. Quem tem o módulo Configurações sem ser administrador abre as abas e consulta, mas as mudanças são recusadas.'),
        ],
      },
      {
        titulo: 'Clínicas',
        blocos: [
          texto('Lista as unidades. **Nova clínica** cadastra uma unidade com nome, CNPJ, responsável, contato, horário, fuso e endereço. A logo é opcional: JPG, PNG ou WebP, com até 2 MB.'),
          aviso('Excluir uma clínica não tem volta. O Ortus pede confirmação e pode recusar quando há pacientes ou vínculos ligados à unidade.'),
        ],
      },
      {
        titulo: 'Anamnese',
        blocos: [
          texto('Modelos de questionário usados no prontuário. **Novo modelo** cria um. Cada pergunta pode ser de texto livre, sim ou não, sim ou não com texto, ou múltipla escolha. **Duplicar** copia um modelo para você adaptar. Os modelos padrão não podem ser excluídos.'),
        ],
      },
      {
        titulo: 'Docs',
        blocos: [
          texto('Modelos de contrato, receita, atestado e outros, usados em **Emitir**, na aba Documentos do prontuário. No texto, insira as variáveis (nome do paciente, CPF, data, nome da clínica) pelos botões do editor. A pré-visualização mostra o resultado.'),
        ],
      },
      {
        titulo: 'Categorias',
        blocos: [
          texto('Categorias de receita e de despesa do Financeiro, com nome, tipo e cor. As inativas não aparecem no Financeiro.'),
        ],
      },
      {
        titulo: 'Taxas',
        blocos: [
          texto('Taxa e prazo de recebimento de cada forma de pagamento: PIX, débito e crédito à vista ou parcelado, por bandeira. O Ortus usa essas taxas para calcular o valor líquido ao receber e na calculadora da Visão geral. Cada alteração é gravada na hora.'),
        ],
      },
      {
        titulo: 'Comunicação',
        blocos: [
          texto('Modelos de mensagem de WhatsApp, e-mail e SMS. São usados nos botões de contato, nas **Respostas prontas** do WhatsApp e nos lembretes por e-mail e SMS.'),
        ],
      },
      {
        titulo: 'Backup',
        blocos: [
          texto('Lista os backups. O Ortus gera backup automático duas vezes ao dia e guarda os 30 mais recentes. **Backup manual** gera um na hora.'),
          lista(
            'O ícone de download salva o backup em arquivo.',
            '**Exportar pacientes** baixa a lista de pacientes em CSV.',
            '**Exportar configurações** e **Importar configurações** levam preferências, categorias e modelos de um lugar para outro. Importar substitui as configurações atuais.',
          ),
          aviso('Restaurar um backup substitui os dados atuais pelos do backup e não pode ser desfeito: tudo o que foi lançado depois se perde. O Ortus pede que você digite RESTAURAR para confirmar. Gere um backup manual antes.'),
        ],
      },
    ],
    relacionados: ['prontuario', 'financeiro', 'whatsapp', 'tratamentos', 'aplicativo'],
  },
  {
    id: 'perfil',
    grupo: 'Conta e sistema',
    titulo: 'Meu perfil',
    resumo: 'Seus dados de acesso: nome, foto e senha. Também mostra o espaço de arquivos da clínica.',
    onde: 'No computador, **Meu perfil** no fim do menu lateral. No celular, a sua foto no topo da tela ou **Meu perfil** no menu.',
    palavras: 'conta usuário trocar senha alterar foto avatar nome cargo sair logout armazenamento',
    secoes: [
      {
        titulo: 'Seus dados',
        blocos: [
          lista(
            '**Nome**: como você aparece no sistema.',
            '**Cargo**: só administradores alteram.',
            '**E-mail**: é o seu login e não muda por aqui.',
            '**Foto**: toque na foto para trocar. JPG, PNG ou WebP, com até 8 MB. O Ortus recorta e reduz a imagem antes de enviar.',
          ),
          texto('Toque em **Salvar** para gravar o nome e o cargo.'),
        ],
      },
      {
        titulo: 'Trocar a senha',
        blocos: [
          passos(
            'Digite a senha nova em **Nova senha**.',
            'Toque em **Salvar**.',
          ),
          texto('Deixe o campo vazio para manter a senha atual.'),
        ],
      },
      {
        titulo: 'Armazenamento',
        blocos: [
          texto('Mostra quanto do espaço de fotos e documentos a clínica já usou, os seus envios de hoje e dos últimos 30 dias e o total da conta. A barra fica amarela a partir de 80% e vermelha perto do limite.'),
        ],
      },
      {
        titulo: 'Sair',
        blocos: [
          texto('**Sair** encerra a sessão neste aparelho.'),
        ],
      },
    ],
    relacionados: ['acesso', 'arquivos'],
  },
  {
    id: 'arquivos',
    grupo: 'Conta e sistema',
    titulo: 'Arquivos e espaço',
    resumo: 'O Ortus aceita só os tipos de arquivo de que a clínica precisa, com tamanho máximo por tipo, e controla o espaço por clínica e por pessoa.',
    onde: 'Os envios ficam no prontuário, em Configurações e em Meu perfil. O medidor de espaço fica em **Meu perfil**, na seção **Armazenamento**.',
    palavras: 'upload anexo foto imagem pdf documento tamanho limite cota armazenamento cheio megabyte mb gb extensão formato',
    secoes: [
      {
        titulo: 'Tipos e tamanhos aceitos',
        blocos: [
          lista(
            '**Documento do paciente**: JPG, PNG, WEBP, GIF, PDF, DOC, DOCX ou TXT, com até 10 MB.',
            '**Foto de HOF**: foto do celular ou da câmera. O Ortus reduz a imagem e grava em JPG, com até 5 MB.',
            '**Foto do paciente e foto de perfil**: JPG, PNG ou WebP, com até 8 MB no original. O Ortus recorta e reduz antes de gravar: o arquivo final tem até 1 MB.',
            '**Logo da clínica**: JPG, PNG ou WebP, com até 2 MB.',
            '**Anexo no WhatsApp**: imagem, PDF, Word, Excel, áudio ou vídeo, com até 3 MB.',
          ),
          texto('O Ortus confere se o conteúdo do arquivo é mesmo do tipo que o nome diz. Arquivo com a extensão trocada é recusado. Programas, scripts, HTML, SVG e arquivos compactados, como ZIP e RAR, não entram.'),
          texto('Imagem anexada como documento é reduzida e gravada em JPG.'),
        ],
      },
      {
        titulo: 'Espaço da clínica',
        blocos: [
          texto('Cada clínica tem uma cota de espaço. Quando ela enche, os envios novos são recusados até que alguém apague arquivos antigos ou o suporte aumente o limite.'),
          texto('A cota e o uso aparecem em **Meu perfil**, na seção **Armazenamento**. A linha **Conta inteira** mostra o teto geral da conta: ao chegar nele, os envios também param.'),
          texto('Excluir um documento no prontuário libera o espaço que ele ocupava.'),
        ],
      },
      {
        titulo: 'Limite por pessoa',
        blocos: [
          texto('Cada pessoa pode enviar até 500 MB a cada 24 horas e até 2 GB em 30 dias.'),
          lista(
            'Ao passar do limite das 24 horas, tente de novo no dia seguinte.',
            'Ao passar do limite de 30 dias, fale com o suporte se precisar de mais.',
            'Muitos envios seguidos em poucos minutos também são segurados por um tempo.',
          ),
        ],
      },
      {
        titulo: 'Sem internet',
        blocos: [
          texto('Enviar, abrir e baixar arquivos precisa de internet, inclusive no aplicativo de computador. O restante do prontuário continua funcionando.'),
        ],
      },
    ],
    relacionados: ['prontuario', 'perfil', 'aplicativo'],
  },
  {
    id: 'aplicativo',
    grupo: 'Conta e sistema',
    titulo: 'Aplicativo de computador e sincronização',
    resumo: 'O Ortus instalado no computador guarda uma cópia da clínica na máquina, funciona sem internet e envia tudo para a nuvem quando a conexão volta.',
    onde: 'Programa **Ortus** instalado no computador. O instalador é fornecido pela equipe do Ortus.',
    palavras: 'desktop programa instalar instalação instalador windows mac linux offline sem internet sincronizar sincronizado backup nuvem conflito atualizar',
    secoes: [
      {
        titulo: 'Site ou aplicativo',
        blocos: [
          lista(
            '**Site, no navegador**: nada a instalar, abre de qualquer lugar. Depende de internet.',
            '**Aplicativo**: instalado no computador da clínica. Funciona sem internet, sincroniza sozinho e traz o WhatsApp.',
          ),
          texto('Os dois usam a mesma conta e os mesmos dados.'),
        ],
      },
      {
        titulo: 'Instalar no Windows',
        blocos: [
          passos(
            'Abra o instalador. Se o Windows mostrar “O Windows protegeu o seu PC”, clique em **Mais informações** e em **Executar assim mesmo**.',
            'Siga o assistente. Não é preciso ser administrador do computador.',
            'Com a internet ligada, entre com e-mail e senha. O primeiro acesso sempre precisa de conexão.',
            'Espere a cópia inicial. O indicador no canto inferior direito mostra **Sincronizando** e depois **Sincronizado**.',
          ),
          aviso('Só passe pelo aviso do Windows com o instalador que você recebeu da equipe do Ortus. Comece a usar o programa depois que aparecer **Sincronizado**.'),
          texto('Requisitos: Windows 10 ou 11 de 64 bits, 4 GB de memória e cerca de 1,2 GB livres. Há versões para macOS 12 ou mais novo e para Linux.'),
          texto('Para atualizar, rode o instalador novo por cima. Os dados são mantidos.'),
        ],
      },
      {
        titulo: 'O indicador de sincronização',
        blocos: [
          texto('Fica no canto inferior direito, só no aplicativo. Toque nele para ver o último envio, quantas alterações aguardam envio e o botão **Sincronizar agora**.'),
          lista(
            '**Sincronizado**: o que você fez já está na nuvem.',
            '**Sincronizando**: o aplicativo está enviando ou baixando alterações.',
            '**Sem internet**: você continua trabalhando. As alterações ficam guardadas na máquina e sobem sozinhas quando a conexão volta.',
            '**Falha no backup**: o envio não deu certo. Confira a internet e toque em **Sincronizar agora**. Se continuar, fale com o suporte.',
            '**Entre para sincronizar**: a sessão venceu. Conecte a internet e entre de novo.',
          ),
          texto('Com internet, o aplicativo sincroniza a cada poucos segundos.'),
        ],
      },
      {
        titulo: 'O que funciona sem internet',
        blocos: [
          lista(
            'Funcionam com o que já está na máquina: agenda, pacientes, prontuário, débitos e tarefas, além da lista de conversas e do histórico do WhatsApp.',
            'Ficam na fila: mensagens de WhatsApp escritas sem conexão saem quando ela volta.',
            'Precisam de conexão: o primeiro login, convites de equipe, link de anamnese, SMS, comissões e tudo o que envia ou abre arquivo.',
          ),
        ],
      },
      {
        titulo: 'Conflitos',
        blocos: [
          texto('Um conflito acontece quando o mesmo registro é alterado em dois computadores antes de sincronizar. Vale a versão mais nova, pelo relógio do servidor: a hora do computador não decide. A outra versão não é apagada. Ela fica guardada para você decidir.'),
          passos(
            'Toque no indicador de sincronização. Havendo conflitos, aparece **Ver conflitos em Configurações**.',
            'O atalho abre a tela **Sincronização**, que fica em Configurações. Para cada conflito, ela mostra a versão deste computador (**Aqui**), a da nuvem (**Na nuvem**) e qual venceu.',
            'Escolha **Manter este computador** ou **Manter a nuvem** e confirme.',
          ),
          texto('Para ter menos conflitos, deixe cada computador conectado pelo menos algumas vezes por dia. Quanto mais tempo sem internet e mais gente mexendo nos mesmos registros, maior a chance.'),
        ],
      },
      {
        titulo: 'Vários computadores',
        blocos: [
          texto('O Ortus pode ser instalado em quantos computadores a clínica precisar. Com internet, o que é feito em um chega aos outros em poucos segundos, inclusive as exclusões.'),
          aviso('O banco de dados local, as fotos e a sessão do WhatsApp ficam na pasta de dados do Ortus no computador, e desinstalar o programa não apaga essa pasta. Como ali há dados de pacientes, proteja o computador com senha.'),
        ],
      },
    ],
    relacionados: ['whatsapp', 'arquivos', 'configuracoes'],
  },
  {
    id: 'assinatura',
    grupo: 'Conta e sistema',
    titulo: 'Assinatura e cobrança',
    resumo: 'O Ortus é pago por assinatura mensal. A assinatura é da rede: uma só cobre todas as clínicas dela. O administrador acompanha o plano e paga as faturas na tela Assinatura.',
    onde: 'Menu **Assinatura**. Só aparece para quem administra a clínica.',
    palavras: 'pagamento pagar fatura boleto pix cartão mensalidade vencimento atraso atrasada bloqueio bloqueado acesso suspenso modo de consulta somente leitura plano preço valor mercado pago faixa',
    secoes: [
      {
        titulo: 'A tela Assinatura',
        blocos: [
          lista(
            '**Plano**: o nome do plano e o valor por mês.',
            '**Próxima cobrança**: a data e o dia de vencimento de todo mês.',
            '**Situação**: se está tudo em dia, se há fatura em aberto ou vencida e, com atraso, a data em que o sistema entra em modo de consulta.',
            '**Faturas**: o mês, o vencimento, o valor e o estado de cada fatura. A fatura em aberto tem o botão **Pagar**.',
          ),
          texto('A fatura do mês aparece em **Faturas** e chega por e-mail 5 dias antes do vencimento. Rede com cobrança manual combina o pagamento direto com a equipe do Ortus.'),
        ],
      },
      {
        titulo: 'Pagar a fatura',
        blocos: [
          passos(
            'Abra **Assinatura** no menu.',
            'Na fatura em aberto, toque em **Pagar**.',
            'Pague por Pix ou cartão na página do Mercado Pago. O Ortus não guarda dados de cartão.',
            'De volta ao Ortus, a tela confere o pagamento sozinha. Se ele for recusado, a fatura mostra o aviso e, quando o Mercado Pago informa, o motivo.',
          ),
        ],
      },
      {
        titulo: 'Se a fatura atrasar',
        blocos: [
          lista(
            '**Do 1º ao 7º dia de atraso**: só aviso. Os administradores veem uma faixa no topo da tela com a data em que o sistema entra em modo de consulta e o botão **Ver fatura**. Tudo funciona normalmente.',
            '**A partir do 8º dia de atraso**: a rede entra em **modo de consulta**. Todas as pessoas entram e leem tudo, mas ninguém grava: não dá para agendar, cadastrar nem alterar. A faixa no topo avisa todo mundo.',
            '**Pagou**: assim que o pagamento é confirmado, o sistema volta ao normal em minutos.',
          ),
          aviso('Nada é apagado no modo de consulta. Prontuários, agenda, financeiro e arquivos ficam guardados e voltam como estavam.'),
          texto('O mesmo modo de consulta vale quando o suporte do Ortus suspende o acesso da clínica ou quando a assinatura é encerrada. A faixa no topo diz qual é o caso.'),
        ],
      },
      {
        titulo: 'O que fazer',
        blocos: [
          lista(
            'Se você é administrador e viu a faixa, toque em **Ver fatura** e pague a fatura em aberto.',
            'Se você não é administrador, avise quem administra a sua clínica.',
            'Pagou e o sistema não voltou depois de alguns minutos? Abra **Ajuda** e use **Contatar o suporte**.',
          ),
        ],
      },
    ],
    relacionados: ['equipe', 'acesso'],
  },
];

/** Com NEXT_PUBLIC_WHATSAPP_ATIVO=0 a aba do WhatsApp não existe neste endereço, e o assunto sai do guia. */
export const TOPICOS_GUIA: TopicoGuia[] = TODOS_OS_TOPICOS.filter((item) => WHATSAPP_ATIVO || item.id !== 'whatsapp');

/**
 * Os vídeos ainda não foram gravados. A lista fica vazia de propósito: a tela
 * de tutoriais mostra o aviso e manda para o guia técnico.
 * Para publicar um vídeo, acrescente aqui { id, grupo, titulo, videoId }.
 */
export const TOPICOS_TUTORIAL: TopicoTutorial[] = [];

export function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function palavrasDaBusca(termo: string): string[] {
  return normalizar(termo).split(/\s+/).filter(Boolean);
}

function textoDoBloco(bloco: BlocoGuia): string {
  return bloco.tipo === 'passos' || bloco.tipo === 'lista' ? bloco.itens.join(' ') : bloco.texto;
}

/** Texto de cada assunto já normalizado: a busca acha pelo conteúdo, não só pelo título. */
const INDICE_GUIA = TOPICOS_GUIA.map((item) => {
  const corpo = item.secoes
    .map((secao) => `${secao.titulo} ${secao.blocos.map(textoDoBloco).join(' ')}`)
    .join(' ')
    .replace(/\*\*/g, '');
  return {
    item,
    titulo: normalizar(`${item.grupo} ${item.titulo}`),
    chaves: normalizar(`${item.resumo} ${item.palavras ?? ''}`),
    corpo: normalizar(corpo),
  };
});

type AchadoGuia = { item: TopicoGuia; peso: number };

/** Assuntos que têm todas as palavras do termo. Peso 0 = achou no título; 1 = no resumo ou nos sinônimos; 2 = no texto. */
function acharNoGuia(termo: string): AchadoGuia[] {
  const palavras = palavrasDaBusca(termo);
  if (palavras.length === 0) return TOPICOS_GUIA.map((item) => ({ item, peso: 0 }));
  const achados: AchadoGuia[] = [];
  for (const entrada of INDICE_GUIA) {
    const comChaves = `${entrada.titulo} ${entrada.chaves}`;
    const tudo = `${comChaves} ${entrada.corpo}`;
    if (!palavras.every((palavra) => tudo.includes(palavra))) continue;
    const peso = palavras.every((palavra) => entrada.titulo.includes(palavra))
      ? 0
      : palavras.every((palavra) => comChaves.includes(palavra)) ? 1 : 2;
    achados.push({ item: entrada.item, peso });
  }
  // O sort é estável: dentro do mesmo peso, vale a ordem do índice.
  return achados.sort((a, b) => a.peso - b.peso);
}

/** Filtro do índice do guia. Termo vazio devolve tudo, na ordem do índice. */
export function buscarNoGuia(termo: string): TopicoGuia[] {
  return acharNoGuia(termo).map((achado) => achado.item);
}

/** Filtro da lista de tutoriais, por grupo e título. Termo vazio devolve tudo. */
export function buscarTutoriais(termo: string): TopicoTutorial[] {
  const palavras = palavrasDaBusca(termo);
  if (palavras.length === 0) return TOPICOS_TUTORIAL;
  return TOPICOS_TUTORIAL.filter((item) => {
    const alvo = normalizar(`${item.grupo} ${item.titulo}`);
    return palavras.every((palavra) => alvo.includes(palavra));
  });
}

export type ResultadoBusca = {
  tipo: 'guia' | 'tutorial';
  id: string;
  titulo: string;
  grupo: string;
  href: string;
};

/** Busca da página inicial da Ajuda: guia e tutoriais juntos, com o que bate no título primeiro. */
export function buscarAssuntos(termo: string, limite = 8): ResultadoBusca[] {
  if (palavrasDaBusca(termo).length === 0) return [];
  const doGuia = (achado: AchadoGuia): ResultadoBusca => ({
    tipo: 'guia',
    id: `guia-${achado.item.id}`,
    titulo: achado.item.titulo,
    grupo: achado.item.grupo,
    href: `/ajuda/guia?topico=${achado.item.id}`,
  });
  const guias = acharNoGuia(termo);
  const tutoriais: ResultadoBusca[] = buscarTutoriais(termo).map((item) => ({
    tipo: 'tutorial',
    id: `tutorial-${item.id}`,
    titulo: item.titulo,
    grupo: item.grupo,
    href: `/ajuda/tutoriais?topico=${item.id}`,
  }));
  return [
    ...guias.filter((achado) => achado.peso === 0).map(doGuia),
    ...tutoriais,
    ...guias.filter((achado) => achado.peso > 0).map(doGuia),
  ].slice(0, limite);
}
