import { NextResponse } from 'next/server';
import {
  AVISOS_WHATSAPP,
  chamarWhatsappGateway,
  fraseDoServico,
  modoWhatsapp,
  type RespostaGateway,
} from '@/lib/whatsappGateway';
import { chaveTelefone } from '@/lib/whatsappTelefone';
import { consultarLocal, desktopAtivo, lerSessaoLocal } from '@/lib/local/ponte';
import { conteudoConfere, inicioDoBase64, tipoLimpo, tipoVerificavel } from '@/lib/assinaturaArquivo';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { ehAdminDaClinica, identificarChamador, temAcessoAClinica, type Chamador } from '@/lib/chamadorApi';
import { escritaBarrada } from '@/lib/escritaLiberada';
import { moduleForPath } from '@/lib/permissionPresets';
import type { ModuleName } from '@/lib/types/permissions';

/**
 * Tudo o que esta rota devolve em `erro` é frase escrita para a tela. Mensagem
 * de biblioteca, saída de processo e caminho de arquivo ficam no registro de
 * falhas (lib/registro.ts), inclusive quando chegam dentro da resposta do
 * serviço do WhatsApp.
 *
 * Quem pode o quê: o estado da sessão é de todo membro da clínica (outras
 * telas perguntam se está conectado); ler conversas e enviar pedem o módulo
 * da tela /whatsapp; iniciar, ver o QR e desconectar pedem o administrador
 * da clínica que não entrou por convite. Quem pareia o QR decide por qual
 * número saem as mensagens automáticas da clínica.
 */

type Admin = Chamador['admin'];
type PacienteResumo = { id: string; nome: string };
type Permissoes = { podeConectar: boolean; podeConversar: boolean };
type Acesso = Permissoes & {
  /** Cliente com service role; null no aplicativo de computador, onde o banco é o SQLite. */
  admin: Admin | null;
  /** Id canônico da clínica: a mesma chave na rota, no cache e no serviço. */
  clinicaId: string;
};

const ARQUIVO_MAXIMO_BASE64 = 4_200_000;
const cachePacientes = new Map<string, { em: number; mapa: Map<string, PacienteResumo> }>();
const ESTADOS_DA_SESSAO = new Set(['desconectado', 'iniciando', 'qr', 'conectado', 'falha']);
const LEITURAS = new Set(['conversas', 'mensagens', 'midia', 'resolver']);
const ultimaFalha = new Map<string, number>();
// O módulo que abre a tela /whatsapp (ROUTE_MODULE_MAP) é o mesmo que libera ler e enviar por esta rota.
const MODULO_DO_WHATSAPP: ModuleName = moduleForPath('/whatsapp') ?? 'ficha_paciente';
const SEM_ACESSO_AS_CONVERSAS = 'Você não tem acesso às conversas do WhatsApp desta clínica.';
const SO_O_ADMINISTRADOR = 'Só o administrador da clínica conecta ou desconecta o WhatsApp.';
const TUDO: Permissoes = { podeConectar: true, podeConversar: true };

/**
 * '012' e '12' são a mesma clínica no banco, mas seriam duas sessões (dois
 * navegadores) no serviço: só o id sem zero à esquerda passa. Até 12 dígitos
 * o Number é exato.
 */
function chaveDaClinica(id: string): string | null {
  return /^[1-9]\d{0,11}$/.test(id) ? String(Number(id)) : null;
}

/** A tela consulta esta rota a cada poucos segundos: a mesma falha entra no registro uma vez por minuto. */
async function registrar(etapa: string, clinicaId: string, erro: unknown) {
  const agora = Date.now();
  if (agora - (ultimaFalha.get(etapa) ?? 0) < 60_000) return;
  ultimaFalha.set(etapa, agora);
  await registrarFalha(
    { origem: 'api/whatsapp', clinicaId: chaveDaClinica(clinicaId), extra: { etapa } },
    erro,
  );
}

function negar(status: number, erro: string) {
  return { negado: NextResponse.json({ erro }, { status }) };
}

function usuarioDoToken(token: string): string | null {
  const parte = token.split('.')[1];
  if (!parte) return null;
  try {
    const json = Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

/** Permissões no aplicativo de computador, pelo SQLite. null = sem vínculo com a clínica. */
async function acessoPeloBancoLocal(token: string, clinicaId: string): Promise<Permissoes | null> {
  if (!desktopAtivo()) return null;
  const sessao = await lerSessaoLocal();
  if (!sessao?.user?.id) return null;
  const mesmoUsuario = token === sessao.access_token || usuarioDoToken(token) === sessao.user.id;
  if (!mesmoUsuario) return null;

  const profs = await consultarLocal<{ id: number; nivel_acesso?: string | null; is_super_admin?: boolean | null }>('profissionais', {
    filtros: [{ col: 'user_id', op: 'eq', valor: sessao.user.id }],
    limite: 1,
  });
  const prof = profs[0];
  if (prof?.is_super_admin === true) return TUDO;
  if (prof) {
    const vinculos = await consultarLocal<{ convidado?: boolean | null }>('profissionais_clinicas', {
      filtros: [
        { col: 'profissional_id', op: 'eq', valor: prof.id },
        { col: 'clinica_id', op: 'eq', valor: Number(clinicaId) },
      ],
      limite: 1,
    });
    const vinculo = vinculos[0];
    if (vinculo) {
      // Mesma regra da tela (ClinicaContext): só `true` marca o convidado. Linha
      // que desceu para o SQLite antes de a coluna existir chega com null.
      if (prof.nivel_acesso === 'admin' && vinculo.convidado !== true) return TUDO;
      const permissoes = await consultarLocal<{ pode_acessar?: boolean | null }>('permissoes_modulos', {
        filtros: [
          { col: 'profissional_id', op: 'eq', valor: prof.id },
          { col: 'clinica_id', op: 'eq', valor: Number(clinicaId) },
          { col: 'modulo', op: 'eq', valor: MODULO_DO_WHATSAPP },
        ],
        limite: 1,
      });
      return { podeConectar: false, podeConversar: permissoes[0]?.pode_acessar === true };
    }
  }
  // Perfil ou vínculo que ainda não desceu para o SQLite: a lista de clínicas do
  // login prova o vínculo, mas não diz cargo nem módulos. Falha fechada.
  if ((sessao.clinicas || []).some((c) => String(c.id) === clinicaId)) return { podeConectar: false, podeConversar: false };
  return null;
}

async function temModuloDoWhatsapp(chamador: Chamador, clinicaId: string) {
  const { data, error } = await chamador.admin
    .from('permissoes_modulos')
    .select('pode_acessar')
    .eq('profissional_id', chamador.prof.id)
    .eq('clinica_id', clinicaId)
    .eq('modulo', MODULO_DO_WHATSAPP)
    .maybeSingle();
  if (error) throw error;
  return data?.pode_acessar === true;
}

async function exigirClinica(req: Request, clinicaIdPedido: string): Promise<{ negado: NextResponse } | Acesso> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return negar(401, 'Não autenticado.');
  const clinicaId = chaveDaClinica(clinicaIdPedido);
  if (!clinicaId) return negar(400, 'Clínica inválida.');

  // No aplicativo o banco é o SQLite. A chave de administrador da nuvem não
  // vem no programa, então um fallback para ela derruba a tela do WhatsApp.
  if (desktopAtivo()) {
    let permissoes: Permissoes | null;
    try {
      permissoes = await acessoPeloBancoLocal(token, clinicaId);
    } catch (error) {
      await registrar('sessao_local', clinicaId, error);
      return negar(503, 'Não foi possível confirmar a sessão neste computador.');
    }
    if (!permissoes) return negar(403, 'Sem permissão para esta clínica.');
    return { admin: null, clinicaId, ...permissoes };
  }

  const chamador = await identificarChamador(req);
  if (!chamador) return negar(401, 'Sessão inválida.');
  // Administrador da clínica (regra de ehAdminDaClinica, a mesma do banco) enxerga todos os módulos, como na tela.
  if (await ehAdminDaClinica(chamador, clinicaId)) return { admin: chamador.admin, clinicaId, ...TUDO };
  if (!(await temAcessoAClinica(chamador, clinicaId))) return negar(403, 'Sem permissão para esta clínica.');
  return {
    admin: chamador.admin,
    clinicaId,
    podeConectar: false,
    podeConversar: await temModuloDoWhatsapp(chamador, clinicaId),
  };
}

async function pacientesPorTelefone(admin: Admin | null, clinicaId: string) {
  const cache = cachePacientes.get(clinicaId);
  if (cache && Date.now() - cache.em < 60_000) return cache.mapa;
  const mapa = new Map<string, PacienteResumo>();
  if (!admin) {
    const linhas = await consultarLocal<{ id: string; nome: string; telefone: string | null }>('pacientes', {
      filtros: [
        { col: 'clinica_id', op: 'eq', valor: Number(clinicaId) },
        { col: 'telefone', op: 'notnull' },
      ],
      limite: 5000,
    });
    for (const p of linhas) {
      const chave = chaveTelefone(p.telefone);
      if (chave && !mapa.has(chave)) mapa.set(chave, { id: p.id, nome: p.nome });
    }
    cachePacientes.set(clinicaId, { em: Date.now(), mapa });
    return mapa;
  }
  for (let inicio = 0; inicio < 20_000; inicio += 1000) {
    const { data } = await admin
      .from('pacientes')
      .select('id, nome, telefone')
      .eq('clinica_id', clinicaId)
      .not('telefone', 'is', null)
      .order('id')
      .range(inicio, inicio + 999);
    for (const p of data || []) {
      const chave = chaveTelefone(p.telefone);
      if (chave && !mapa.has(chave)) mapa.set(chave, { id: p.id, nome: p.nome });
    }
    if (!data || data.length < 1000) break;
  }
  cachePacientes.set(clinicaId, { em: Date.now(), mapa });
  return mapa;
}

function responder(resultado: RespostaGateway) {
  if (!resultado.ok) return NextResponse.json({ erro: resultado.dados.erro }, { status: resultado.status });
  const dados = resultado.dados;
  // Resposta que deu certo também pode trazer um campo `erro` (o estado da sessão traz).
  if (dados && typeof dados === 'object' && !Array.isArray(dados) && 'erro' in dados) {
    return NextResponse.json({ ...dados, erro: fraseDoServico((dados as { erro?: unknown }).erro) });
  }
  return NextResponse.json(dados);
}

/**
 * Só os campos que a tela usa. O texto de erro só passa se for frase escrita
 * para a tela. O QR só vai para quem pode conectar: quem o escaneia pareia o
 * próprio celular com a sessão da clínica.
 */
function resumoDaSessao(dados: unknown, podeConectar: boolean) {
  const d = (dados && typeof dados === 'object' ? dados : {}) as Record<string, unknown>;
  const status = typeof d.status === 'string' && ESTADOS_DA_SESSAO.has(d.status) ? d.status : 'desconectado';
  return {
    status,
    qr: podeConectar && status === 'qr' && typeof d.qr === 'string' && d.qr.startsWith('data:image/') ? d.qr : null,
    numero: typeof d.numero === 'string' ? d.numero.replace(/\D/g, '').slice(0, 20) : null,
    nome: typeof d.nome === 'string' ? d.nome.slice(0, 120) : null,
    erro: fraseDoServico(d.erro) || (d.erro ? AVISOS_WHATSAPP.servico : null),
    agendador: d.agendador !== false,
  };
}

async function falhaInesperada(metodo: string, clinicaId: string, erro: unknown) {
  await registrar(`inesperada_${metodo}`, clinicaId, erro);
  return NextResponse.json({ erro: ERRO_INTERNO }, { status: 500 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clinicaId = url.searchParams.get('clinicaId') || '';
  try {
    return await consultar(req, url, clinicaId);
  } catch (error) {
    return falhaInesperada('GET', clinicaId, error);
  }
}

async function consultar(req: Request, url: URL, clinicaIdPedido: string) {
  const acesso = await exigirClinica(req, clinicaIdPedido);
  if ('negado' in acesso) return acesso.negado;
  const { clinicaId } = acesso;
  const permissoes: Permissoes = { podeConectar: acesso.podeConectar, podeConversar: acesso.podeConversar };

  const acao = url.searchParams.get('acao') || 'status';
  if (LEITURAS.has(acao) && !acesso.podeConversar) {
    return NextResponse.json({ erro: SEM_ACESSO_AS_CONVERSAS }, { status: 403 });
  }
  const modo = modoWhatsapp();
  if (modo === 'indisponivel') {
    // Sem aplicativo de computador e sem processo sempre ligado não existe WhatsApp
    // neste endereço. A tela recebe isso como estado e explica, em vez de tentar conectar.
    if (acao === 'status') return NextResponse.json({ configurado: false, modo, status: 'desconectado', ...permissoes });
    return NextResponse.json({ erro: AVISOS_WHATSAPP.nao_configurado }, { status: 503 });
  }

  const base = `/sessoes/${clinicaId}`;

  if (acao === 'conversas') {
    const resultado = await chamarWhatsappGateway(`${base}/conversas`);
    if (!resultado.ok || !Array.isArray(resultado.dados)) return responder(resultado);
    let mapa = new Map<string, PacienteResumo>();
    try {
      mapa = await pacientesPorTelefone(acesso.admin, clinicaId);
    } catch (error) {
      // A lista abre mesmo sem o vínculo com a ficha; a consulta só é refeita daqui a um minuto.
      cachePacientes.set(clinicaId, { em: Date.now(), mapa });
      await registrar('pacientes_por_telefone', clinicaId, error);
    }
    const conversas = (resultado.dados as Array<{ telefone?: string | null }>).map((c) => {
      const paciente = c.telefone ? mapa.get(chaveTelefone(c.telefone) || '') : undefined;
      return { ...c, paciente: paciente || null };
    });
    return NextResponse.json(conversas);
  }
  if (acao === 'mensagens') {
    const chat = encodeURIComponent(url.searchParams.get('chat') || '');
    const lida = url.searchParams.get('lida') === '1' ? '&lida=1' : '';
    return responder(await chamarWhatsappGateway(`${base}/mensagens?chat=${chat}${lida}`));
  }
  if (acao === 'midia') {
    const msg = encodeURIComponent(url.searchParams.get('msg') || '');
    return responder(await chamarWhatsappGateway(`${base}/midia?msg=${msg}`));
  }
  if (acao === 'resolver') {
    const telefone = encodeURIComponent(url.searchParams.get('telefone') || '');
    return responder(await chamarWhatsappGateway(`${base}/resolver?telefone=${telefone}`));
  }

  // A tela consulta o estado sem parar: serviço fora do ar chega como estado, com a frase pronta.
  const resultado = await chamarWhatsappGateway(base, { tempoLimiteMs: 8_000 });
  if (!resultado.ok) {
    return NextResponse.json({ configurado: true, modo, status: 'offline', erro: resultado.dados.erro, ...permissoes });
  }
  return NextResponse.json({ configurado: true, modo, ...resumoDaSessao(resultado.dados, acesso.podeConectar), ...permissoes });
}

type CorpoDoPedido = {
  clinicaId?: string;
  acao?: string;
  chatId?: string;
  telefone?: string;
  texto?: string;
  arquivo?: { mimetype?: string; data?: string; nome?: string } | null;
};

export async function POST(req: Request) {
  const lido: unknown = await req.json().catch(() => null);
  const body = (lido && typeof lido === 'object' ? lido : {}) as CorpoDoPedido;
  const clinicaId = String(body.clinicaId || '');
  try {
    return await executar(req, body, clinicaId);
  } catch (error) {
    return falhaInesperada('POST', clinicaId, error);
  }
}

async function executar(req: Request, body: CorpoDoPedido, clinicaIdPedido: string) {
  const acesso = await exigirClinica(req, clinicaIdPedido);
  if ('negado' in acesso) return acesso.negado;
  if (body.acao !== 'iniciar' && body.acao !== 'desconectar' && body.acao !== 'enviar') {
    return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });
  }
  if (body.acao === 'enviar' ? !acesso.podeConversar : !acesso.podeConectar) {
    return NextResponse.json({ erro: body.acao === 'enviar' ? SEM_ACESSO_AS_CONVERSAS : SO_O_ADMINISTRADOR }, { status: 403 });
  }
  const modo = modoWhatsapp();
  if (modo === 'indisponivel') {
    return NextResponse.json({ erro: AVISOS_WHATSAPP.nao_configurado }, { status: 503 });
  }

  const base = `/sessoes/${acesso.clinicaId}`;
  if (body.acao === 'iniciar') {
    const resultado = await chamarWhatsappGateway(`${base}/iniciar`, { method: 'POST', body: {} });
    if (!resultado.ok) return responder(resultado);
    return NextResponse.json({
      configurado: true,
      modo,
      ...resumoDaSessao(resultado.dados, true),
      podeConectar: acesso.podeConectar,
      podeConversar: acesso.podeConversar,
    });
  }
  if (body.acao === 'desconectar') {
    return responder(await chamarWhatsappGateway(base, { method: 'DELETE' }));
  }

  // Enviar fala em nome da clínica e é serviço da assinatura, como o lembrete: em modo de
  // consulta não sai. O envio não grava no banco, então o gatilho não o barra. Ler, conectar
  // e desconectar seguem livres. No aplicativo de computador (admin null) não há chave da nuvem para conferir.
  if (acesso.admin) {
    const barrada = await escritaBarrada(acesso.admin, acesso.clinicaId, 'erro');
    if (barrada) return barrada;
  }

  const arquivo = body.arquivo && typeof body.arquivo.data === 'string' && typeof body.arquivo.mimetype === 'string'
    ? {
      mimetype: tipoLimpo(body.arquivo.mimetype),
      data: body.arquivo.data,
      nome: typeof body.arquivo.nome === 'string' ? body.arquivo.nome.replace(/[^\w.\- ]/g, '_').slice(0, 120) : undefined,
    }
    : null;
  if (arquivo && arquivo.data.length > ARQUIVO_MAXIMO_BASE64) {
    return NextResponse.json({ erro: 'Arquivo grande demais (máximo 3 MB).' }, { status: 413 });
  }
  if (arquivo && (!tipoVerificavel(arquivo.mimetype) || !conteudoConfere(inicioDoBase64(arquivo.data), arquivo.mimetype))) {
    return NextResponse.json({ erro: 'Tipo de arquivo não permitido ou conteúdo diferente do tipo informado.' }, { status: 415 });
  }
  return responder(await chamarWhatsappGateway(`${base}/enviar`, {
    method: 'POST',
    body: { chatId: body.chatId, telefone: body.telefone, texto: body.texto, arquivo },
  }));
}
