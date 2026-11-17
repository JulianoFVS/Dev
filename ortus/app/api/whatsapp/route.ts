import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { chamarWhatsappGateway, whatsappGatewayConfigurado } from '@/lib/whatsappGateway';
import { chaveTelefone } from '@/lib/whatsappTelefone';
import { consultarLocal, desktopAtivo, lerSessaoLocal } from '@/lib/local/ponte';

type Admin = ReturnType<typeof createSupabaseAdmin>;
type PacienteResumo = { id: string; nome: string };

const ARQUIVO_MAXIMO_BASE64 = 4_200_000;
const cachePacientes = new Map<string, { em: number; mapa: Map<string, PacienteResumo> }>();

function clinicaValida(id: string) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
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

async function acessoPeloBancoLocal(token: string, clinicaId: string) {
  if (!desktopAtivo()) return false;
  const sessao = await lerSessaoLocal();
  if (!sessao?.user?.id) return false;
  const mesmoUsuario = token === sessao.access_token || usuarioDoToken(token) === sessao.user.id;
  if (!mesmoUsuario) return false;

  const profs = await consultarLocal<{ id: number; is_super_admin?: boolean }>('profissionais', {
    filtros: [{ col: 'user_id', op: 'eq', valor: sessao.user.id }],
    limite: 1,
  });
  const prof = profs[0];
  if (prof?.is_super_admin) return true;
  if (prof) {
    const vinculos = await consultarLocal('profissionais_clinicas', {
      filtros: [
        { col: 'profissional_id', op: 'eq', valor: prof.id },
        { col: 'clinica_id', op: 'eq', valor: Number(clinicaId) },
      ],
      limite: 1,
    });
    if (vinculos.length > 0) return true;
  }
  return (sessao.clinicas || []).some((c) => String(c.id) === String(clinicaId));
}

async function exigirClinica(req: Request, clinicaId: string): Promise<{ negado: NextResponse } | { admin: Admin | null }> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { negado: NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 }) };
  if (!clinicaValida(clinicaId)) return { negado: NextResponse.json({ erro: 'Clínica inválida.' }, { status: 400 }) };

  // No aplicativo o banco é o SQLite. A chave de administrador da nuvem não
  // vem no programa, então um fallback para ela derruba a tela do WhatsApp.
  if (desktopAtivo()) {
    try {
      if (await acessoPeloBancoLocal(token, clinicaId)) return { admin: null };
    } catch (error) {
      console.error('WhatsApp: sessão local', error);
      return { negado: NextResponse.json({ erro: 'Não foi possível confirmar a sessão neste computador.' }, { status: 503 }) };
    }
    return { negado: NextResponse.json({ erro: 'Sem permissão para esta clínica.' }, { status: 403 }) };
  }

  const admin = createSupabaseAdmin();
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return { negado: NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 }) };

  const { data: prof } = await admin
    .from('profissionais')
    .select('id, is_super_admin')
    .eq('user_id', caller.user.id)
    .maybeSingle();

  if (!prof?.is_super_admin) {
    const { data: vinculo } = await admin
      .from('profissionais_clinicas')
      .select('clinica_id')
      .eq('profissional_id', prof?.id)
      .eq('clinica_id', clinicaId)
      .maybeSingle();
    if (!vinculo) return { negado: NextResponse.json({ erro: 'Sem permissão para esta clínica.' }, { status: 403 }) };
  }

  return { admin };
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

function responder(resultado: { ok: boolean; status: number; dados: unknown }) {
  return NextResponse.json(resultado.dados, { status: resultado.ok ? 200 : resultado.status });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clinicaId = url.searchParams.get('clinicaId') || '';
  const acesso = await exigirClinica(req, clinicaId);
  if ('negado' in acesso) return acesso.negado;
  if (!whatsappGatewayConfigurado()) {
    return NextResponse.json({ configurado: false, status: 'desconectado' });
  }

  const base = `/sessoes/${clinicaId}`;
  const acao = url.searchParams.get('acao') || 'status';

  if (acao === 'conversas') {
    const resultado = await chamarWhatsappGateway(`${base}/conversas`);
    if (!resultado.ok || !Array.isArray(resultado.dados)) return responder(resultado);
    const mapa = await pacientesPorTelefone(acesso.admin, clinicaId);
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

  const resultado = await chamarWhatsappGateway(base);
  if (!resultado.ok && resultado.status === 503) {
    return NextResponse.json({ configurado: true, status: 'offline', erro: (resultado.dados as { erro?: string }).erro });
  }
  return NextResponse.json({ configurado: true, ...(resultado.dados as object) }, { status: resultado.ok ? 200 : resultado.status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as {
    clinicaId?: string;
    acao?: string;
    chatId?: string;
    telefone?: string;
    texto?: string;
    arquivo?: { mimetype?: string; data?: string; nome?: string } | null;
  };
  const clinicaId = String(body.clinicaId || '');
  const acesso = await exigirClinica(req, clinicaId);
  if ('negado' in acesso) return acesso.negado;
  if (!whatsappGatewayConfigurado()) {
    return NextResponse.json({ erro: 'Gateway do WhatsApp não configurado.' }, { status: 503 });
  }

  const base = `/sessoes/${clinicaId}`;
  if (body.acao === 'iniciar') {
    const resultado = await chamarWhatsappGateway(`${base}/iniciar`, { method: 'POST', body: {} });
    return NextResponse.json({ configurado: true, ...(resultado.dados as object) }, { status: resultado.ok ? 200 : resultado.status });
  }
  if (body.acao === 'desconectar') {
    return responder(await chamarWhatsappGateway(base, { method: 'DELETE' }));
  }
  if (body.acao === 'enviar') {
    const arquivo = body.arquivo && typeof body.arquivo.data === 'string' && typeof body.arquivo.mimetype === 'string'
      ? { mimetype: body.arquivo.mimetype, data: body.arquivo.data, nome: body.arquivo.nome || undefined }
      : null;
    if (arquivo && arquivo.data.length > ARQUIVO_MAXIMO_BASE64) {
      return NextResponse.json({ erro: 'Arquivo grande demais (máximo 3 MB).' }, { status: 413 });
    }
    return responder(await chamarWhatsappGateway(`${base}/enviar`, {
      method: 'POST',
      body: { chatId: body.chatId, telefone: body.telefone, texto: body.texto, arquivo },
    }));
  }

  return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });
}
