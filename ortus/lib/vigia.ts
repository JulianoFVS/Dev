import 'server-only';
import pacote from '@/package.json';
import { emailValido, enviarEmail, pendenciaDoEmail } from '@/lib/email';
import { emailAlertaOperacao, emailLivre, type EmailPronto } from '@/lib/emailModelos';
import { origemParaEmail } from '@/lib/origemApp';
import { registrarFalha } from '@/lib/registro';
import { ROTINAS, executarRotina, type NomeRotina } from '@/lib/rotinas';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { chamarWhatsappGateway, modoWhatsapp, type MotivoFalha } from '@/lib/whatsappGateway';

/**
 * Saúde do servidor e vigia da operação (passo a passo em docs/OPERACAO.md).
 *
 *   saudePublica()  GET /api/saude, para o monitor externo: se o banco
 *                   responde, se a configuração obrigatória existe, se o vigia
 *                   está dando sinal e a versão. Nada de clínica, e-mail,
 *                   contagem nem nome ou valor de variável.
 *   rodarVigia()    GET /api/saude/vigia, só o agendador: confere as rotinas,
 *                   as falhas da última hora, o gateway do WhatsApp e a Resend;
 *                   abre e fecha alertas em `alertas_operacao` e avisa os donos
 *                   por e-mail uma vez quando algo para e outra quando volta.
 */

type Admin = ReturnType<typeof createSupabaseAdmin>;

const ORIGEM = 'api/saude/vigia';
const CATEGORIA_EMAIL = 'alerta';
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
const TEMPO_CONSULTA_MS = 5_000;
const TEMPO_GATEWAY_MS = 5_000;
/** Falhas na última hora: o alerta abre acima de 20 e só fecha com 10 ou menos, para não abrir e fechar a cada execução. */
const FALHAS_ABRE = 20;
const FALHAS_FECHA = 10;
/** Cada chamada de rotina dura no máximo 2 min: começou há mais de 20 e não fechou, foi interrompida. */
const EXECUCAO_INTERROMPIDA_MS = 20 * 60_000;
const GUARDA_FALHAS_DIAS = 30;
const GUARDA_EXECUCOES_DIAS = 90;
/** Na Vercel o vercel.json chama o vigia uma vez por dia, o máximo do plano gratuito, com até 59 min de folga no horário. */
const TOLERANCIA_VIGIA_DIARIO_HORAS = 26;
const SAUDE_GUARDADA_MS = 10_000;
const SEM_DESTINATARIO = 'Sem destinatário para o alerta: defina ALERTA_EMAILS ou um dono da plataforma com e-mail de acesso.';

const ROTULOS: Record<string, string> = {
  banco: 'Banco de dados',
  falhas: 'Falhas do servidor',
  whatsapp: 'Gateway do WhatsApp',
  email: 'E-mail (Resend)',
};

const MOTIVOS_GATEWAY: Record<MotivoFalha, string> = {
  nao_configurado: 'falta o segredo do gateway neste servidor',
  nao_instalado: 'o serviço não está instalado neste servidor',
  abrindo: 'o serviço não respondeu',
  parou: 'o serviço não respondeu',
  recusou: 'o serviço recusou o segredo deste servidor',
  demorou: `o serviço não respondeu em ${TEMPO_GATEWAY_MS / 1000} segundos`,
  servico: 'o serviço respondeu com erro',
};

type AlertaLinha = { chave: string; parado_desde: string; avisado_em: string | null; detalhe: string | null };
type Batimento = { iniciou_em: string; terminou_em: string | null; ok: boolean | null };
type Situacao = { estado: 'ok' | 'sem_registro' } | { estado: 'parada' | 'falhou' | 'nao_terminou'; em: string };
type Leitura<T> = { ok: true; valor: T } | { ok: false; erro: unknown };

function rotuloDoAlerta(chave: string): string {
  const rotina = chave.startsWith('rotina:') ? chave.slice('rotina:'.length) : '';
  if (rotina && rotina in ROTINAS) return ROTINAS[rotina as NomeRotina].rotulo;
  return ROTULOS[chave] ?? chave;
}

function quando(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  const fuso = { timeZone: 'America/Sao_Paulo' } as const;
  const dia = data.toLocaleDateString('pt-BR', { ...fuso, day: '2-digit', month: '2-digit' });
  const hora = data.toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora} (Brasília)`;
}

function semRepetir(emails: string[]): string[] {
  return Array.from(new Map(emails.map((email) => [email.toLowerCase(), email])).values());
}

function emailsFixos(): string[] {
  return semRepetir((process.env.ALERTA_EMAILS || '').split(',').map((email) => email.trim()).filter(emailValido));
}

/** Quem recebe os alertas: ALERTA_EMAILS (separados por vírgula) ou, sem ela, o e-mail de login de cada dono da plataforma. */
export async function emailsDosDonos(admin: Admin): Promise<string[]> {
  const fixos = emailsFixos();
  if (fixos.length > 0) return fixos;
  const { data, error } = await admin.from('profissionais').select('user_id').eq('is_super_admin', true);
  if (error) {
    await registrarFalha({ origem: ORIGEM, extra: { etapa: 'destinatarios' } }, error);
    return [];
  }
  const emails = await Promise.all(
    ((data || []) as Array<{ user_id: string | null }>).map(async ({ user_id }) => {
      if (!user_id) return '';
      const { data: conta } = await admin.auth.admin.getUserById(user_id);
      return conta?.user?.email || '';
    }),
  );
  return semRepetir(emails.filter(emailValido));
}

/** Consulta trivial, com tempo limite: banco travado conta como banco fora. */
async function bancoResponde(admin: Admin): Promise<Leitura<true>> {
  try {
    const { error } = await admin
      .from('ortus_schema_migrations')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(TEMPO_CONSULTA_MS));
    return error ? { ok: false, erro: error } : { ok: true, valor: true };
  } catch (erro) {
    return { ok: false, erro };
  }
}

async function ultimoBatimento(admin: Admin, rotina: NomeRotina): Promise<Leitura<Batimento | null>> {
  try {
    const { data, error } = await admin
      .from('rotinas_execucoes')
      .select('iniciou_em, terminou_em, ok')
      .eq('rotina', rotina)
      .order('iniciou_em', { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(TEMPO_CONSULTA_MS));
    if (error) return { ok: false, erro: error };
    return { ok: true, valor: ((data || []) as Batimento[])[0] ?? null };
  } catch (erro) {
    return { ok: false, erro };
  }
}

/** Rotina sem batimento dentro da tolerância está parada; batimento com ok=false, falhou. */
function situacaoDaRotina(linha: Batimento | null, toleranciaHoras: number, agora: number): Situacao {
  if (!linha) return { estado: 'sem_registro' };
  const inicio = Date.parse(linha.iniciou_em);
  if (!Number.isFinite(inicio) || agora - inicio > toleranciaHoras * HORA_MS) return { estado: 'parada', em: linha.iniciou_em };
  if (linha.ok === false) return { estado: 'falhou', em: linha.iniciou_em };
  if (!linha.terminou_em && agora - inicio > EXECUCAO_INTERROMPIDA_MS) return { estado: 'nao_terminou', em: linha.iniciou_em };
  return { estado: 'ok' };
}

function descreverRotina(nome: NomeRotina, situacao: Situacao): string | null {
  const { rotulo, toleranciaHoras } = ROTINAS[nome];
  const esperado = `O vigia espera uma execução a cada ${toleranciaHoras} h no máximo; confira o agendador (cron da Vercel ou timer da VM).`;
  switch (situacao.estado) {
    case 'ok':
      return null;
    case 'sem_registro':
      return `${rotulo}: nenhuma execução registrada. ${esperado}`;
    case 'parada':
      return `${rotulo}: a última execução começou em ${quando(situacao.em)}. ${esperado}`;
    case 'falhou':
      return `${rotulo}: a execução de ${quando(situacao.em)} terminou com erro. O resumo fica em rotinas_execucoes e o motivo, nas falhas do servidor.`;
    case 'nao_terminou':
      return `${rotulo}: a execução que começou em ${quando(situacao.em)} não terminou (o processo foi interrompido, por exemplo por tempo limite).`;
  }
}

/** De quanto em quanto tempo o próprio vigia tem de dar sinal: na VM o timer roda a cada 15 min (ROTINAS.vigia). */
export function toleranciaDoVigiaHoras(): number {
  return process.env.VERCEL ? TOLERANCIA_VIGIA_DIARIO_HORAS : ROTINAS.vigia.toleranciaHoras;
}

// ---------------------------------------------------------------------
// GET /api/saude
// ---------------------------------------------------------------------

export type EstadoAgendador = 'ok' | 'atrasado' | 'falhou' | 'sem_registro' | 'desconhecido';

export type SaudePublica = {
  ok: boolean;
  banco: 'ok' | 'erro';
  configuracao: 'ok' | 'incompleta';
  agendador: EstadoAgendador;
  versao: string;
  verificado_em: string;
};

export type RespostaSaude = { status: number; corpo: SaudePublica };

/** Variáveis sem as quais o site ou as rotinas não funcionam. Daqui só sai o resultado, nunca o nome. */
function configuracaoCompleta(): boolean {
  const obrigatorias = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.CRON_SECRET,
    // Em produção, sem o endereço público os e-mails saem sem link (lib/origemApp.ts).
    ...(process.env.NODE_ENV === 'production' ? [process.env.NEXT_PUBLIC_APP_URL] : []),
  ];
  return obrigatorias.every((valor) => Boolean((valor || '').trim()));
}

function versao(): string {
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
  return commit ? `${pacote.version}+${commit}` : pacote.version;
}

function estadoDoVigia(situacao: Situacao): EstadoAgendador {
  if (situacao.estado === 'ok' || situacao.estado === 'sem_registro') return situacao.estado;
  return situacao.estado === 'parada' ? 'atrasado' : 'falhou';
}

async function medirSaude(agora: number): Promise<RespostaSaude> {
  const configuracao = configuracaoCompleta() ? 'ok' : 'incompleta';
  let banco: SaudePublica['banco'] = 'erro';
  let agendador: EstadoAgendador = 'desconhecido';
  try {
    const admin = createSupabaseAdmin();
    const [teste, vigia] = await Promise.all([bancoResponde(admin), ultimoBatimento(admin, 'vigia')]);
    // Sem await: com o banco travado, gravar a falha também travaria a resposta ao monitor.
    if (teste.ok) banco = 'ok';
    else void registrarFalha({ origem: 'api/saude', extra: { etapa: 'banco' } }, teste.erro);
    if (vigia.ok) agendador = estadoDoVigia(situacaoDaRotina(vigia.valor, toleranciaDoVigiaHoras(), agora));
  } catch (erro) {
    void registrarFalha({ origem: 'api/saude', extra: { etapa: 'inesperado' } }, erro);
  }
  const corpo: SaudePublica = {
    ok: banco === 'ok' && configuracao === 'ok' && agendador === 'ok',
    banco,
    configuracao,
    agendador,
    versao: versao(),
    verificado_em: new Date(agora).toISOString(),
  };
  // 503 quando o banco não responde ou quando o vigia, que já rodou, parou de dar sinal.
  const status = banco === 'erro' || agendador === 'atrasado' || agendador === 'falhou' ? 503 : 200;
  return { status, corpo };
}

let saudeGuardada: { ate: number; resposta: Promise<RespostaSaude> } | null = null;

/** A rota é pública: uma rajada de chamadas reaproveita a mesma medição por 10 s em vez de consultar o banco a cada uma. */
export function saudePublica(): Promise<RespostaSaude> {
  const agora = Date.now();
  if (saudeGuardada && saudeGuardada.ate > agora) return saudeGuardada.resposta;
  const resposta = medirSaude(agora);
  saudeGuardada = { ate: agora + SAUDE_GUARDADA_MS, resposta };
  return resposta;
}

// ---------------------------------------------------------------------
// GET /api/saude/vigia
// ---------------------------------------------------------------------

export type ItemVigia = { chave: string; rotulo: string; detalhe: string; desde: string; avisado: boolean };

/** Números e verdadeiro/falso no primeiro e no segundo nível: é o que o deploy/oracle/chamar-rotina.sh leva para o journal. */
export type RespostaVigia = {
  processado_em: string;
  /** O vigia conseguiu conferir tudo (banco de pé e nenhuma exceção). */
  ok: boolean;
  banco: boolean;
  tudo_normal: boolean;
  alertas_abertos: number;
  alertas_novos: number;
  alertas_fechados: number;
  email: { configurado: boolean; destinatarios: number; enviados: number; nao_enviados: number };
  conferido: { rotinas: number; whatsapp: boolean; falhas_ultima_hora: number };
  limpeza: { falhas_apagadas: number; execucoes_apagadas: number };
  itens: ItemVigia[];
  avisos: string[];
};

function respostaVazia(agora: Date): RespostaVigia {
  return {
    processado_em: agora.toISOString(),
    ok: false,
    banco: false,
    tudo_normal: false,
    alertas_abertos: 0,
    alertas_novos: 0,
    alertas_fechados: 0,
    email: { configurado: !pendenciaDoEmail(), destinatarios: 0, enviados: 0, nao_enviados: 0 },
    conferido: { rotinas: 0, whatsapp: false, falhas_ultima_hora: 0 },
    limpeza: { falhas_apagadas: 0, execucoes_apagadas: 0 },
    itens: [],
    avisos: [],
  };
}

/** Com o banco fora não há `alertas_operacao`: quem lembra se o aviso já saiu é este processo. */
let bancoForaDesde: string | null = null;
let bancoForaAvisado = false;

async function vigiaSemBanco(agora: Date, erro: unknown): Promise<{ status: number; corpo: RespostaVigia }> {
  void registrarFalha({ origem: ORIGEM, extra: { etapa: 'banco' } }, erro);
  const desde = bancoForaDesde ?? agora.toISOString();
  bancoForaDesde = desde;
  const corpo = respostaVazia(agora);
  const detalhe = `${ROTULOS.banco}: não respondeu ao vigia desde ${quando(desde)}.`;
  corpo.avisos.push('O banco não respondeu: nada foi conferido nem gravado nesta execução.');
  // O e-mail dos donos mora no banco: com ele fora, só a lista fixa serve.
  const para = emailsFixos();
  corpo.email.destinatarios = para.length;
  if (!bancoForaAvisado) {
    const pendencia = pendenciaDoEmail();
    if (pendencia) {
      corpo.email.nao_enviados = 1;
      corpo.avisos.push(`O e-mail de alerta não saiu: ${pendencia}.`);
    } else if (para.length === 0) {
      corpo.email.nao_enviados = 1;
      corpo.avisos.push('O e-mail de alerta não saiu: com o banco fora, só ALERTA_EMAILS diz para quem mandar.');
    } else {
      const envio = await enviarEmail({ para, ...emailAlertaOperacao({ voltou: false, itens: [detalhe], origem: origemParaEmail() }), categoria: CATEGORIA_EMAIL });
      bancoForaAvisado = envio.ok;
      if (envio.ok) corpo.email.enviados = 1;
      else {
        corpo.email.nao_enviados = 1;
        corpo.avisos.push(`O e-mail de alerta não saiu: ${envio.erro}`);
      }
    }
  }
  corpo.alertas_abertos = 1;
  corpo.itens.push({ chave: 'banco', rotulo: ROTULOS.banco, detalhe, desde, avisado: bancoForaAvisado });
  return { status: 503, corpo };
}

async function contarFalhas(admin: Admin, agora: number): Promise<{ total: number; principais: string }> {
  const { data, count, error } = await admin
    .from('falhas_servidor')
    .select('origem', { count: 'exact' })
    .gte('criado_em', new Date(agora - HORA_MS).toISOString())
    .order('criado_em', { ascending: false })
    .limit(500);
  if (error) throw error;
  const linhas = (data || []) as Array<{ origem: string | null }>;
  const porOrigem = new Map<string, number>();
  for (const { origem } of linhas) porOrigem.set(origem || '?', (porOrigem.get(origem || '?') ?? 0) + 1);
  const principais = [...porOrigem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([origem, n]) => `${origem} (${n})`)
    .join(', ');
  return { total: count ?? linhas.length, principais };
}

/** Só no modo servidor (processo sempre ligado) e com a aba ligada; no aplicativo e sem gateway não há o que vigiar. */
async function conferirGateway(): Promise<{ conferido: boolean; problema: string | null }> {
  if (modoWhatsapp() !== 'servidor' || process.env.NEXT_PUBLIC_WHATSAPP_ATIVO === '0') return { conferido: false, problema: null };
  let resposta = await chamarWhatsappGateway('/saude', { tempoLimiteMs: TEMPO_GATEWAY_MS });
  if (!resposta.ok) {
    // Um reinício do serviço leva poucos segundos: só conta como parado se falhar duas vezes seguidas.
    await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
    resposta = await chamarWhatsappGateway('/saude', { tempoLimiteMs: TEMPO_GATEWAY_MS });
  }
  if (resposta.ok) return { conferido: true, problema: null };
  return { conferido: true, problema: `${ROTULOS.whatsapp}: ${MOTIVOS_GATEWAY[resposta.motivo]} (duas tentativas seguidas em /saude).` };
}

type Levantamento = { problemas: Map<string, string>; rotinas: number; whatsapp: boolean; falhasUltimaHora: number };

async function levantarProblemas(admin: Admin, agora: number, abertos: Map<string, AlertaLinha>): Promise<Levantamento> {
  const problemas = new Map<string, string>();
  let rotinas = 0;
  for (const nome of Object.keys(ROTINAS) as NomeRotina[]) {
    // O vigia não confere a si mesmo: quem percebe que ele parou é o GET /api/saude.
    if (nome === 'vigia') continue;
    const lido = await ultimoBatimento(admin, nome);
    if (!lido.ok) throw lido.erro;
    rotinas += 1;
    const detalhe = descreverRotina(nome, situacaoDaRotina(lido.valor, ROTINAS[nome].toleranciaHoras, agora));
    if (detalhe) problemas.set(`rotina:${nome}`, detalhe);
  }

  const falhas = await contarFalhas(admin, agora);
  if (falhas.total > (abertos.has('falhas') ? FALHAS_FECHA : FALHAS_ABRE)) {
    problemas.set('falhas', `${ROTULOS.falhas}: ${falhas.total} na última hora (o alerta abre acima de ${FALHAS_ABRE}). Mais frequentes: ${falhas.principais}.`);
  }

  const gateway = await conferirGateway();
  if (gateway.problema) problemas.set('whatsapp', gateway.problema);

  const pendencia = pendenciaDoEmail();
  if (pendencia) {
    problemas.set('email', `${ROTULOS.email}: ${pendencia}. Sem ele não saem lembretes, convites, avisos de cobrança nem estes alertas.`);
  }
  return { problemas, rotinas, whatsapp: gateway.conferido, falhasUltimaHora: falhas.total };
}

/** Parte voltou e parte continua parada: o modelo do alerta diria "Tudo voltou ao normal", então vai o e-mail de texto pronto. */
function emailVoltouEmParte(voltaram: string[], continuam: string[]): EmailPronto {
  return emailLivre({
    assunto: `[Ortus] De volta ao normal: ${voltaram.length === 1 ? voltaram[0] : `${voltaram.length} itens`}`,
    titulo: 'Parte da operação voltou ao normal',
    texto: [
      `De volta ao normal: ${voltaram.join(', ')}.`,
      `Ainda com problema: ${continuam.join(', ')}. ${continuam.length === 1 ? 'O alerta continua aberto; outro aviso sai quando ele voltar.' : 'Os alertas continuam abertos; outro aviso sai quando cada um voltar.'}`,
    ].join('\n\n'),
  });
}

async function limparAntigos(admin: Admin, agora: number): Promise<RespostaVigia['limpeza']> {
  const [falhas, execucoes] = await Promise.all([
    admin.from('falhas_servidor').delete().lt('criado_em', new Date(agora - GUARDA_FALHAS_DIAS * DIA_MS).toISOString()).select('id'),
    admin.from('rotinas_execucoes').delete().lt('iniciou_em', new Date(agora - GUARDA_EXECUCOES_DIAS * DIA_MS).toISOString()).select('id'),
  ]);
  if (falhas.error) await registrarFalha({ origem: ORIGEM, extra: { etapa: 'limpar_falhas' } }, falhas.error);
  if (execucoes.error) await registrarFalha({ origem: ORIGEM, extra: { etapa: 'limpar_execucoes' } }, execucoes.error);
  return { falhas_apagadas: falhas.data?.length ?? 0, execucoes_apagadas: execucoes.data?.length ?? 0 };
}

async function verificar(admin: Admin, agoraData: Date): Promise<RespostaVigia> {
  const agora = agoraData.getTime();
  const corpo = respostaVazia(agoraData);
  corpo.banco = true;

  const lidos = await admin.from('alertas_operacao').select('chave, parado_desde, avisado_em, detalhe');
  if (lidos.error) throw lidos.error;
  const abertos = new Map(((lidos.data || []) as AlertaLinha[]).map((linha) => [linha.chave, linha]));

  const { problemas, rotinas, whatsapp, falhasUltimaHora } = await levantarProblemas(admin, agora, abertos);
  corpo.conferido = { rotinas, whatsapp, falhas_ultima_hora: falhasUltimaHora };

  // Abre o que parou agora; do que continua parado, só atualiza a descrição.
  const novos = new Set<string>();
  for (const [chave, detalhe] of problemas) {
    const atual = abertos.get(chave);
    if (atual) {
      if (atual.detalhe !== detalhe) {
        const { error } = await admin.from('alertas_operacao').update({ detalhe }).eq('chave', chave);
        if (error) await registrarFalha({ origem: ORIGEM, extra: { etapa: 'atualizar_alerta' } }, error);
      }
      continue;
    }
    const { error } = await admin.from('alertas_operacao').insert({ chave, detalhe, parado_desde: agoraData.toISOString() });
    // 23505: outra execução do vigia abriu o mesmo alerta agora há pouco.
    if (!error) novos.add(chave);
    else if (error.code !== '23505') await registrarFalha({ origem: ORIGEM, extra: { etapa: 'abrir_alerta' } }, error);
  }

  // Fecha o que voltou. O DELETE devolve a linha: só quem apagou avisa a volta, e só do que tinha sido avisado.
  const voltaram: string[] = [];
  for (const chave of abertos.keys()) {
    if (problemas.has(chave)) continue;
    const { data, error } = await admin.from('alertas_operacao').delete().eq('chave', chave).select('chave, avisado_em');
    if (error) {
      await registrarFalha({ origem: ORIGEM, extra: { etapa: 'fechar_alerta' } }, error);
      continue;
    }
    for (const linha of (data || []) as Array<Pick<AlertaLinha, 'chave' | 'avisado_em'>>) {
      corpo.alertas_fechados += 1;
      if (linha.avisado_em) voltaram.push(rotuloDoAlerta(linha.chave));
    }
  }
  if (bancoForaDesde) {
    if (bancoForaAvisado) voltaram.push(ROTULOS.banco);
    bancoForaDesde = null;
    bancoForaAvisado = false;
  }

  // E-mail de "parou": o que abriu agora e o que ficou sem aviso numa execução anterior (Resend fora, por exemplo).
  const pendencia = pendenciaDoEmail();
  const origem = origemParaEmail();
  const aAvisar = [...problemas.keys()].filter((chave) => novos.has(chave) || (abertos.has(chave) && !abertos.get(chave)?.avisado_em));
  // Os destinatários só são procurados quando há o que mandar: a lista dos donos custa uma consulta por dono.
  const para = !pendencia && (aAvisar.length > 0 || voltaram.length > 0) ? await emailsDosDonos(admin) : [];
  corpo.email.destinatarios = para.length;
  if (aAvisar.length > 0) {
    if (pendencia || para.length === 0) {
      corpo.email.nao_enviados += 1;
      corpo.avisos.push(`O alerta ficou registrado, mas o e-mail não saiu: ${pendencia ? `${pendencia}.` : SEM_DESTINATARIO}`);
    } else {
      // Reserva antes de enviar: com duas execuções juntas, só uma manda o e-mail de cada alerta.
      const reserva = await admin
        .from('alertas_operacao')
        .update({ avisado_em: agoraData.toISOString() })
        .in('chave', aAvisar)
        .is('avisado_em', null)
        .select('chave, detalhe');
      if (reserva.error) await registrarFalha({ origem: ORIGEM, extra: { etapa: 'reservar_aviso' } }, reserva.error);
      const reservados = (reserva.data || []) as Array<Pick<AlertaLinha, 'chave' | 'detalhe'>>;
      if (reservados.length > 0) {
        const pronto = emailAlertaOperacao({ voltou: false, itens: reservados.map((linha) => linha.detalhe || rotuloDoAlerta(linha.chave)), origem });
        const envio = await enviarEmail({ para, ...pronto, categoria: CATEGORIA_EMAIL });
        if (envio.ok) corpo.email.enviados += 1;
        else {
          corpo.email.nao_enviados += 1;
          corpo.avisos.push(`O alerta ficou registrado, mas o e-mail não saiu: ${envio.erro} A próxima execução tenta de novo.`);
          await admin.from('alertas_operacao').update({ avisado_em: null }).in('chave', reservados.map((linha) => linha.chave));
          await registrarFalha({ origem: ORIGEM, extra: { etapa: 'email_parou', status: envio.status ?? 0 } }, new Error(envio.erro));
        }
      }
    }
  }

  // E-mail de "voltou".
  if (voltaram.length > 0) {
    if (pendencia || para.length === 0) {
      corpo.email.nao_enviados += 1;
      corpo.avisos.push(`O alerta foi fechado, mas o e-mail de volta ao normal não saiu: ${pendencia ? `${pendencia}.` : SEM_DESTINATARIO}`);
    } else {
      const continuam = [...problemas.keys()].map(rotuloDoAlerta);
      const pronto = continuam.length === 0
        ? emailAlertaOperacao({ voltou: true, itens: voltaram, origem })
        : emailVoltouEmParte(voltaram, continuam);
      const envio = await enviarEmail({ para, ...pronto, categoria: CATEGORIA_EMAIL });
      if (envio.ok) corpo.email.enviados += 1;
      else {
        corpo.email.nao_enviados += 1;
        corpo.avisos.push(`O alerta foi fechado, mas o e-mail de volta ao normal não saiu: ${envio.erro}`);
        await registrarFalha({ origem: ORIGEM, extra: { etapa: 'email_voltou', status: envio.status ?? 0 } }, new Error(envio.erro));
      }
    }
  }

  corpo.limpeza = await limparAntigos(admin, agora);

  const depois = await admin.from('alertas_operacao').select('chave, parado_desde, avisado_em, detalhe').order('parado_desde', { ascending: true });
  if (depois.error) throw depois.error;
  corpo.itens = ((depois.data || []) as AlertaLinha[]).map((linha) => ({
    chave: linha.chave,
    rotulo: rotuloDoAlerta(linha.chave),
    detalhe: linha.detalhe || '',
    desde: linha.parado_desde,
    avisado: Boolean(linha.avisado_em),
  }));
  corpo.alertas_abertos = corpo.itens.length;
  corpo.alertas_novos = novos.size;
  corpo.tudo_normal = corpo.itens.length === 0;
  corpo.ok = true;
  return corpo;
}

/**
 * Uma passada do vigia. 200 quando conferiu (mesmo achando problema), 503
 * quando o banco não respondeu, 500 quando parou no meio.
 */
export async function rodarVigia(): Promise<{ status: number; corpo: RespostaVigia }> {
  const agora = new Date();
  let admin: Admin | null = null;
  try {
    admin = createSupabaseAdmin();
  } catch (erro) {
    return vigiaSemBanco(agora, erro);
  }
  const banco = await bancoResponde(admin);
  if (!banco.ok) return vigiaSemBanco(agora, banco.erro);

  const cliente = admin;
  const saida: { corpo?: RespostaVigia } = {};
  const resultado = await executarRotina(cliente, 'vigia', async () => {
    const corpo = await verificar(cliente, agora);
    saida.corpo = corpo;
    return {
      ok: true,
      resumo: {
        alertas_abertos: corpo.alertas_abertos,
        alertas_novos: corpo.alertas_novos,
        alertas_fechados: corpo.alertas_fechados,
        emails_enviados: corpo.email.enviados,
        emails_nao_enviados: corpo.email.nao_enviados,
        falhas_apagadas: corpo.limpeza.falhas_apagadas,
        execucoes_apagadas: corpo.limpeza.execucoes_apagadas,
      },
    };
  });
  if (resultado.ok && saida.corpo) return { status: 200, corpo: saida.corpo };
  const corpo = respostaVazia(agora);
  corpo.banco = true;
  corpo.avisos.push('O vigia parou com erro antes de terminar. O motivo está nas falhas do servidor (origem rotina/vigia).');
  return { status: 500, corpo };
}
