import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

type Admin = ReturnType<typeof createSupabaseAdmin>;
type Profissional = { id: number; is_super_admin: boolean | null };

const BUCKET = 'arquivos_ortus';
const MB = 1024 * 1024;
const ARQUIVO_MAXIMO = 10 * MB;
const CAMINHO_PACIENTE = /^pacientes\/([0-9a-f-]{36})\/[\w.\-/]+$/i;
const CAMINHO_CLINICA = /^clinicas\/(\d+)\/[\w.\-]+$/;

async function identificar(req: Request): Promise<{ negado: NextResponse } | { admin: Admin; prof: Profissional }> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { negado: NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 }) };
  const admin = createSupabaseAdmin();
  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller?.user) return { negado: NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 }) };
  const { data: prof } = await admin
    .from('profissionais')
    .select('id, is_super_admin')
    .eq('user_id', caller.user.id)
    .maybeSingle();
  if (!prof) return { negado: NextResponse.json({ erro: 'Perfil não encontrado.' }, { status: 403 }) };
  return { admin, prof: prof as Profissional };
}

async function temAcesso(admin: Admin, prof: Profissional, clinicaId: number) {
  if (prof.is_super_admin) return true;
  const { data } = await admin
    .from('profissionais_clinicas')
    .select('clinica_id')
    .eq('profissional_id', prof.id)
    .eq('clinica_id', clinicaId)
    .maybeSingle();
  return !!data;
}

async function usoDaClinica(admin: Admin, clinicaId: number) {
  const [{ data: usado, error }, { data: clinica }] = await Promise.all([
    admin.rpc('armazenamento_uso_clinica', { p_clinica: clinicaId }),
    admin.from('clinicas').select('id, nome, limite_armazenamento_mb').eq('id', clinicaId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  return {
    clinicaId: String(clinicaId),
    nome: clinica?.nome || 'Clínica',
    usado: Number(usado || 0),
    limite: Number(clinica?.limite_armazenamento_mb || 1024) * MB,
  };
}

function formatar(bytes: number) {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1).replace('.', ',')} GB`;
  return `${Math.max(0, Math.round(bytes / MB))} MB`;
}

/** GET — uso de armazenamento da clínica informada, ou de todas as clínicas do usuário. */
export async function GET(req: Request) {
  const quem = await identificar(req);
  if ('negado' in quem) return quem.negado;
  const { admin, prof } = quem;

  const pedida = new URL(req.url).searchParams.get('clinicaId');
  let ids: number[];
  if (pedida && /^\d+$/.test(pedida)) {
    if (!(await temAcesso(admin, prof, Number(pedida)))) {
      return NextResponse.json({ erro: 'Sem permissão para esta clínica.' }, { status: 403 });
    }
    ids = [Number(pedida)];
  } else {
    const { data } = await admin.from('profissionais_clinicas').select('clinica_id').eq('profissional_id', prof.id).limit(20);
    ids = (data || []).map((v) => Number(v.clinica_id));
  }

  try {
    return NextResponse.json(await Promise.all(ids.map((id) => usoDaClinica(admin, id))));
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'Falha ao medir o armazenamento.' }, { status: 500 });
  }
}

/** POST — confere o limite da clínica e devolve um link assinado para enviar o arquivo. */
export async function POST(req: Request) {
  const quem = await identificar(req);
  if ('negado' in quem) return quem.negado;
  const { admin, prof } = quem;

  const body = await req.json().catch(() => ({})) as { caminho?: string; tamanho?: number; upsert?: boolean };
  const caminho = String(body.caminho || '');
  const tamanho = Number(body.tamanho);
  const upsert = body.upsert === true;

  if (caminho.includes('..') || caminho.includes('//')) {
    return NextResponse.json({ erro: 'Caminho inválido.' }, { status: 400 });
  }
  if (!Number.isFinite(tamanho) || tamanho <= 0) {
    return NextResponse.json({ erro: 'Arquivo vazio.' }, { status: 400 });
  }
  if (tamanho > ARQUIVO_MAXIMO) {
    return NextResponse.json({ erro: 'Arquivo grande demais. O limite é 10 MB por arquivo.' }, { status: 413 });
  }

  let clinicaId: number | null = null;
  const paciente = caminho.match(CAMINHO_PACIENTE);
  const clinica = caminho.match(CAMINHO_CLINICA);
  if (paciente) {
    const { data } = await admin.from('pacientes').select('clinica_id').eq('id', paciente[1]).maybeSingle();
    clinicaId = data?.clinica_id != null ? Number(data.clinica_id) : null;
  } else if (clinica) {
    clinicaId = Number(clinica[1]);
  }
  if (clinicaId == null) return NextResponse.json({ erro: 'Caminho inválido.' }, { status: 400 });
  if (!(await temAcesso(admin, prof, clinicaId))) {
    return NextResponse.json({ erro: 'Sem permissão para esta clínica.' }, { status: 403 });
  }

  let uso: Awaited<ReturnType<typeof usoDaClinica>>;
  try {
    uso = await usoDaClinica(admin, clinicaId);
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'Falha ao medir o armazenamento.' }, { status: 500 });
  }

  let substituido = 0;
  if (upsert) {
    const pasta = caminho.slice(0, caminho.lastIndexOf('/'));
    const nome = caminho.slice(caminho.lastIndexOf('/') + 1);
    const { data: existentes } = await admin.storage.from(BUCKET).list(pasta, { search: nome, limit: 5 });
    const existente = existentes?.find((item) => item.name === nome);
    substituido = Number(existente?.metadata?.size || 0);
  }

  if (uso.usado - substituido + tamanho > uso.limite) {
    return NextResponse.json({
      erro: `O armazenamento da clínica está cheio (${formatar(uso.usado)} de ${formatar(uso.limite)}). Apague arquivos antigos ou fale com o suporte para aumentar o limite.`,
    }, { status: 413 });
  }

  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(caminho, { upsert });
  if (error || !data) {
    return NextResponse.json({ erro: error?.message || 'Não foi possível liberar o envio.' }, { status: 500 });
  }
  return NextResponse.json({ caminho: data.path, token: data.token });
}
