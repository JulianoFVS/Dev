import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  CAMINHO_AVATAR,
  CAMINHO_CLINICA,
  CAMINHO_PACIENTE,
  ehCaminhoClinica,
  ehCaminhoPublico,
  regraDoCaminho,
  tipoSeguroParaServir,
  urlProxyPublica,
} from '@/lib/caminhosArquivo';
import { consultarLocal, PASTA_ARQUIVOS } from '@/lib/local/ponte';
import { exigirSessaoLocal } from '@/lib/local/rota';

const MB = 1024 * 1024;
const TETO = 9_500_000_000;

type Profissional = { id: number; is_super_admin?: boolean | null };
type Recusa = { erro: string; status: number };
type Lido = { bytes: Uint8Array; contentType: string };

function raizArquivos() {
  return PASTA_ARQUIVOS ? path.resolve(PASTA_ARQUIVOS) : '';
}

function destinoSeguro(caminho: string) {
  const raiz = raizArquivos();
  if (!raiz || !regraDoCaminho(caminho)) return null;
  const alvo = path.resolve(raiz, ...caminho.split('/'));
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return null;
  return alvo;
}

function tipoPelaExtensao(caminho: string) {
  const ext = caminho.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

async function bytesEm(abs: string): Promise<number> {
  try {
    const st = await fs.stat(abs);
    if (st.isFile()) return st.size;
    if (!st.isDirectory()) return 0;
    const entradas = await fs.readdir(abs, { withFileTypes: true });
    let total = 0;
    for (const ent of entradas) total += await bytesEm(path.join(abs, ent.name));
    return total;
  } catch {
    return 0;
  }
}

async function profissionalDaRequisicao(req: Request): Promise<{ userId: string; prof: Profissional } | { resposta: NextResponse }> {
  const acesso = await exigirSessaoLocal(req);
  if ('resposta' in acesso) return { resposta: acesso.resposta };
  const userId = acesso.sessao.user?.id;
  if (!userId) return { resposta: NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 }) };
  const profs = await consultarLocal<Profissional>('profissionais', {
    filtros: [{ col: 'user_id', op: 'eq', valor: userId }],
    limite: 1,
  });
  const prof = profs[0];
  if (!prof) return { resposta: NextResponse.json({ erro: 'Perfil não encontrado.' }, { status: 403 }) };
  return { userId, prof };
}

async function podeClinica(prof: Profissional, clinicaId: number) {
  if (prof.is_super_admin) return true;
  const vinculos = await consultarLocal('profissionais_clinicas', {
    filtros: [
      { col: 'profissional_id', op: 'eq', valor: prof.id },
      { col: 'clinica_id', op: 'eq', valor: clinicaId },
    ],
    limite: 1,
  });
  return vinculos.length > 0;
}

async function clinicaDoCaminho(caminho: string) {
  const paciente = caminho.match(CAMINHO_PACIENTE);
  const clinica = caminho.match(CAMINHO_CLINICA);
  if (paciente) {
    const linhas = await consultarLocal<{ clinica_id?: number | null }>('pacientes', {
      filtros: [{ col: 'id', op: 'eq', valor: paciente[1] }],
      limite: 1,
    });
    return linhas[0]?.clinica_id != null ? Number(linhas[0].clinica_id) : null;
  }
  if (clinica) return Number(clinica[1]);
  return null;
}

async function autorizar(prof: Profissional, userId: string, caminho: string): Promise<Recusa | { clinicaId: number | null }> {
  if (CAMINHO_AVATAR.test(caminho)) {
    const dono = caminho.match(CAMINHO_AVATAR)?.[1];
    if (!dono || dono.toLowerCase() !== userId.toLowerCase()) return { erro: 'Sem permissão para esta foto.', status: 403 };
    return { clinicaId: null };
  }
  if (!ehCaminhoClinica(caminho)) return { erro: 'Caminho inválido.', status: 400 };
  const clinicaId = await clinicaDoCaminho(caminho);
  if (clinicaId == null) return { erro: 'Caminho inválido.', status: 400 };
  if (!(await podeClinica(prof, clinicaId))) return { erro: 'Sem permissão para esta clínica.', status: 403 };
  return { clinicaId };
}

async function usoDaClinica(clinicaId: number) {
  const raiz = raizArquivos();
  const clinicas = await consultarLocal<{ nome?: string | null; limite_armazenamento_mb?: number | null }>('clinicas', {
    filtros: [{ col: 'id', op: 'eq', valor: clinicaId }],
    limite: 1,
  });
  const pacientes = await consultarLocal<{ id: string }>('pacientes', {
    filtros: [{ col: 'clinica_id', op: 'eq', valor: clinicaId }],
  });
  let usado = 0;
  if (raiz) {
    usado = await bytesEm(path.join(raiz, 'clinicas', String(clinicaId)));
    for (const paciente of pacientes) {
      usado += await bytesEm(path.join(raiz, 'pacientes', String(paciente.id)));
    }
  }
  const limiteMb = Number(clinicas[0]?.limite_armazenamento_mb || 0);
  return {
    clinicaId: String(clinicaId),
    nome: clinicas[0]?.nome || 'Clínica',
    usado,
    limite: limiteMb > 0 ? limiteMb * MB : TETO,
  };
}

function negar(recusa: Recusa) {
  return NextResponse.json({ erro: recusa.erro }, { status: recusa.status });
}

/** Não deixa uma foto que só existe na nuvem travar a tela quando o PC está sem rede. */
export function respostaOuPrazo(promessa: Promise<NextResponse>, ms = 2500) {
  return new Promise<NextResponse>((resolve) => {
    const timer = setTimeout(() => {
      resolve(NextResponse.json({ erro: 'Arquivo indisponível.' }, { status: 404 }));
    }, ms);
    promessa.then(
      (resposta) => {
        clearTimeout(timer);
        resolve(resposta);
      },
      () => {
        clearTimeout(timer);
        resolve(NextResponse.json({ erro: 'Arquivo indisponível.' }, { status: 404 }));
      },
    );
  });
}

async function lerDisco(caminho: string): Promise<Lido | null> {
  const alvo = destinoSeguro(caminho);
  if (!alvo) return null;
  try {
    const bytes = new Uint8Array(await fs.readFile(alvo));
    const contentType = tipoSeguroParaServir(caminho, tipoPelaExtensao(caminho)) || 'application/octet-stream';
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export async function lerPublicoDesktop(caminho: string): Promise<Lido | null> {
  if (!ehCaminhoPublico(caminho)) return null;
  return lerDisco(caminho);
}

export async function listarUsoDesktop(req: Request) {
  const quem = await profissionalDaRequisicao(req);
  if ('resposta' in quem) return quem.resposta;
  const pedida = new URL(req.url).searchParams.get('clinicaId');
  let ids: number[] = [];
  if (pedida && /^\d+$/.test(pedida)) {
    if (!(await podeClinica(quem.prof, Number(pedida)))) {
      return NextResponse.json({ erro: 'Sem permissão para esta clínica.' }, { status: 403 });
    }
    ids = [Number(pedida)];
  } else if (quem.prof.is_super_admin) {
    const todas = await consultarLocal<{ id: number }>('clinicas', { ordem: [{ col: 'nome', asc: true }], limite: 20 });
    ids = todas.map((c) => Number(c.id));
  } else {
    const vinculos = await consultarLocal<{ clinica_id: number }>('profissionais_clinicas', {
      filtros: [{ col: 'profissional_id', op: 'eq', valor: quem.prof.id }],
      limite: 20,
    });
    ids = vinculos.map((v) => Number(v.clinica_id));
  }
  const clinicas = [];
  for (const id of ids) clinicas.push(await usoDaClinica(id));
  const total = raizArquivos() ? await bytesEm(raizArquivos()) : 0;
  return NextResponse.json({ clinicas, total, teto: TETO });
}

type Corpo = { acao?: string; caminho?: string; caminhos?: string[]; tamanho?: number; contentType?: string };

export async function tratarPostDesktop(req: Request) {
  const quem = await profissionalDaRequisicao(req);
  if ('resposta' in quem) return quem.resposta;
  const body = (await req.json().catch(() => ({}))) as Corpo;
  const acao = body.acao || 'preparar';
  if (acao === 'apagar') return apagar(quem.prof, quem.userId, body);
  if (acao === 'confirmar') {
    const caminho = String(body.caminho || '');
    return NextResponse.json({ urlPublica: ehCaminhoPublico(caminho) ? urlProxyPublica(caminho) : null });
  }
  return preparar(quem.prof, quem.userId, body);
}

async function preparar(prof: Profissional, userId: string, body: Corpo) {
  const caminho = String(body.caminho || '');
  const tamanho = Number(body.tamanho);
  const contentType = String(body.contentType || '').toLowerCase();
  const invalido = validar(caminho, tamanho, contentType);
  if (invalido) return negar(invalido);
  const acesso = await autorizar(prof, userId, caminho);
  if ('erro' in acesso) return negar(acesso);
  const cheio = await estouraria(acesso.clinicaId, tamanho);
  if (cheio) return negar(cheio);
  return NextResponse.json({
    modo: 'local',
    caminho,
    urlPublica: ehCaminhoPublico(caminho) ? urlProxyPublica(caminho) : null,
  });
}

function validar(caminho: string, tamanho: number, contentType: string): Recusa | null {
  const regra = regraDoCaminho(caminho);
  if (!regra) return { erro: 'Caminho inválido.', status: 400 };
  if (!Number.isInteger(tamanho) || tamanho <= 0) return { erro: 'Arquivo vazio.', status: 400 };
  if (tamanho > regra.maximo) return { erro: 'Arquivo grande demais.', status: 413 };
  if (!regra.tipos.has(contentType)) return { erro: 'Tipo de arquivo não permitido.', status: 415 };
  return null;
}

async function estouraria(clinicaId: number | null, tamanho: number): Promise<Recusa | null> {
  if (clinicaId != null) {
    const uso = await usoDaClinica(clinicaId);
    if (uso.limite > 0 && uso.limite < TETO && uso.usado + tamanho > uso.limite) {
      return { erro: 'O armazenamento da clínica está cheio.', status: 413 };
    }
  }
  const total = raizArquivos() ? await bytesEm(raizArquivos()) : 0;
  if (total + tamanho > TETO) return { erro: 'O armazenamento deste computador chegou no limite.', status: 413 };
  return null;
}

async function apagar(prof: Profissional, userId: string, body: Corpo) {
  const caminhos = Array.isArray(body.caminhos) ? body.caminhos.map(String).slice(0, 50) : [];
  if (!caminhos.length) return NextResponse.json({ erro: 'Nenhum arquivo informado.' }, { status: 400 });
  for (const caminho of caminhos) {
    const acesso = await autorizar(prof, userId, caminho);
    if ('erro' in acesso) return negar(acesso);
    const alvo = destinoSeguro(caminho);
    if (!alvo) return NextResponse.json({ erro: 'Caminho inválido.' }, { status: 400 });
    await fs.rm(alvo, { force: true });
  }
  return NextResponse.json({ ok: true });
}

export async function lerPrivadoDesktop(req: Request) {
  const quem = await profissionalDaRequisicao(req);
  if ('resposta' in quem) return quem.resposta;
  const caminho = new URL(req.url).searchParams.get('caminho') || '';
  const acesso = await autorizar(quem.prof, quem.userId, caminho);
  if ('erro' in acesso) return negar(acesso);
  const arquivo = await lerDisco(caminho);
  if (!arquivo) return NextResponse.json({ erro: 'Arquivo indisponível.' }, { status: 404 });
  return new NextResponse(Buffer.from(arquivo.bytes), {
    headers: {
      'Content-Type': arquivo.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

export async function gravarPrivadoDesktop(req: Request) {
  const quem = await profissionalDaRequisicao(req);
  if ('resposta' in quem) return quem.resposta;
  const caminho = new URL(req.url).searchParams.get('caminho') || '';
  const contentType = String(req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const bytes = new Uint8Array(await req.arrayBuffer());
  const invalido = validar(caminho, bytes.byteLength, contentType);
  if (invalido) return negar(invalido);
  const acesso = await autorizar(quem.prof, quem.userId, caminho);
  if ('erro' in acesso) return negar(acesso);
  const cheio = await estouraria(acesso.clinicaId, bytes.byteLength);
  if (cheio) return negar(cheio);
  const alvo = destinoSeguro(caminho);
  if (!alvo) return NextResponse.json({ erro: 'Caminho inválido.' }, { status: 400 });
  await fs.mkdir(path.dirname(alvo), { recursive: true });
  await fs.writeFile(alvo, bytes);
  return NextResponse.json({
    ok: true,
    urlPublica: ehCaminhoPublico(caminho) ? urlProxyPublica(caminho) : null,
  });
}
