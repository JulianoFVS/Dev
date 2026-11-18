export type TopicoGuia = {
  id: string;
  grupo: string;
  titulo: string;
  resumo: string;
  cartoes: { titulo: string; texto: string }[];
  texto: string;
};

export type TopicoTutorial = {
  id: string;
  grupo: string;
  titulo: string;
  videoId: string;
};

export const TOPICOS_GUIA: TopicoGuia[] = [
  {
    id: 'visao',
    grupo: 'Começar',
    titulo: 'Visão geral',
    resumo: 'O Ortus separa o dia da clínica em áreas. Cada uma guarda só o que aquela clínica precisa ver.',
    cartoes: [
      { titulo: 'Agenda', texto: 'Horários do dia, da semana e a grade por profissional.' },
      { titulo: 'Pacientes', texto: 'Ficha, foto, documentos e o histórico clínico.' },
      { titulo: 'Arquivos', texto: 'Fotos e documentos ficam na nuvem, com limite por clínica.' },
    ],
    texto: 'O menu lateral no computador, e a barra de baixo no celular, levam para essas áreas. A clínica ativa define o que aparece.',
  },
  {
    id: 'acesso',
    grupo: 'Começar',
    titulo: 'Primeiro acesso',
    resumo: 'Quem entra com senha provisória troca a senha antes de usar o restante.',
    cartoes: [
      { titulo: 'Senha', texto: 'A troca é obrigatória. A senha antiga deixa de valer.' },
      { titulo: 'Clínica', texto: 'Se houver mais de uma, a escolha acontece logo depois.' },
      { titulo: 'Perfil', texto: 'Nome e foto ficam em Meu perfil, no fim do menu.' },
    ],
    texto: 'Sair encerra a sessão neste aparelho. Na próxima entrada, o login pede a senha nova.',
  },
  {
    id: 'agenda',
    grupo: 'Clínica',
    titulo: 'Agenda',
    resumo: 'A grade mostra o período escolhido. Um clique no horário vazio abre o agendamento.',
    cartoes: [
      { titulo: 'Visões', texto: 'Dia, semana, mês, lista e, por último, profissionais.' },
      { titulo: 'Agora', texto: 'Na visão de profissionais, a linha vermelha marca o minuto atual.' },
      { titulo: 'Filtro', texto: 'Status e profissional reduzem a grade sem trocar a clínica.' },
    ],
    texto: 'O botão Novo agendamento abre o mesmo formulário do clique na grade.',
  },
  {
    id: 'pacientes',
    grupo: 'Clínica',
    titulo: 'Pacientes',
    resumo: 'A lista começa em ordem alfabética. O cabeçalho da coluna muda a ordem.',
    cartoes: [
      { titulo: 'Ficha', texto: 'Dados, plano e o que já foi feito com o paciente.' },
      { titulo: 'Foto', texto: 'Se não houver foto, aparece a inicial do nome.' },
      { titulo: 'Anexos', texto: 'Imagem, PDF e documento de texto, conferidos antes de gravar.' },
    ],
    texto: 'Os filtros de status e débito servem para achar quem precisa de retorno.',
  },
  {
    id: 'arquivos',
    grupo: 'Referência',
    titulo: 'Arquivos',
    resumo: 'Cada envio conta no espaço da clínica e no teto da conta.',
    cartoes: [
      { titulo: 'Limite da clínica', texto: 'Quando enche, o envio novo para até alguém apagar arquivo.' },
      { titulo: 'Limite da pessoa', texto: 'Há um teto por dia e outro a cada 30 dias.' },
      { titulo: 'Conferência', texto: 'O arquivo precisa ser o tipo que o nome diz. Executável não entra.' },
    ],
    texto: 'O medidor fica em Meu perfil. A barra muda de cor quando o espaço aperta.',
  },
];

export const TOPICOS_TUTORIAL: TopicoTutorial[] = [
  { id: 'visao', grupo: 'Começar', titulo: 'Visão geral', videoId: 'aqz-KE-bpKQ' },
  { id: 'acesso', grupo: 'Começar', titulo: 'Primeiro acesso', videoId: 'jNQXAC9IVRw' },
  { id: 'agenda', grupo: 'Clínica', titulo: 'Agenda', videoId: 'eRsGyueVLvQ' },
  { id: 'pacientes', grupo: 'Clínica', titulo: 'Pacientes', videoId: 'eRsGyueVLvQ' },
  { id: 'whatsapp', grupo: 'Dia a dia', titulo: 'WhatsApp', videoId: 'LXb3EKWsInQ' },
];

export function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export type ResultadoBusca = {
  tipo: 'guia' | 'tutorial';
  id: string;
  titulo: string;
  href: string;
};

export function buscarAssuntos(termo: string): ResultadoBusca[] {
  const n = normalizar(termo.trim());
  if (!n) return [];
  const guias = TOPICOS_GUIA.filter((item) => normalizar(`${item.grupo} ${item.titulo}`).includes(n)).map((item) => ({
    tipo: 'guia' as const,
    id: `guia-${item.id}`,
    titulo: item.titulo,
    href: `/ajuda/guia?topico=${item.id}`,
  }));
  const tutoriais = TOPICOS_TUTORIAL.filter((item) => normalizar(`${item.grupo} ${item.titulo}`).includes(n)).map((item) => ({
    tipo: 'tutorial' as const,
    id: `tutorial-${item.id}`,
    titulo: item.titulo,
    href: `/ajuda/tutoriais?topico=${item.id}`,
  }));
  return [...guias, ...tutoriais];
}
