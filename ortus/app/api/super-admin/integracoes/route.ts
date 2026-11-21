import { NextResponse } from 'next/server';
import { ehSuperAdmin, identificarChamador } from '@/lib/chamadorApi';
import { cifraDisponivel, cifrar, decifrar, SemChaveDeCifra } from '@/lib/cifra';
import { ehClienteDeTeste, urlDeRetorno } from '@/lib/googleAgenda';
import { origemDoApp } from '@/lib/origemApp';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENT_ID = /^[A-Za-z0-9._-]{6,200}$/;

/**
 * Integrações da plataforma (só a equipe da Ortus).
 *
 * GET: como está o Google (ligado, Client ID, se o segredo existe e os 4
 * últimos caracteres, a URL de retorno para cadastrar no Google Cloud).
 * O segredo nunca volta ao navegador.
 *
 * POST { ativo, clientId, clientSecret? }: grava. Segredo vazio mantém o
 * atual; o novo é cifrado com ORTUS_CHAVE_CIFRA antes de ir ao banco.
 */
export async function GET(req: Request) {
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    if (!ehSuperAdmin(chamador)) return NextResponse.json({ error: 'Só a equipe da Ortus.' }, { status: 403 });
    const { data } = await chamador.admin.from('plataforma_integracoes').select('ativo, config, segredo_cifrado, updated_at').eq('chave', 'google').maybeSingle();
    const clientId = String((data?.config as { client_id?: string } | null)?.client_id || '');
    let final = '';
    if (data?.segredo_cifrado) {
      try { final = decifrar(String(data.segredo_cifrado)).slice(-4); } catch { final = '????'; }
    }
    return NextResponse.json({
      google: {
        ativo: Boolean(data?.ativo),
        clientId,
        segredoDefinido: Boolean(data?.segredo_cifrado),
        segredoFinal: final,
        modoTeste: ehClienteDeTeste(clientId),
        atualizadoEm: data?.updated_at ?? null,
        urlRetorno: urlDeRetorno(origemDoApp(req)),
      },
      cifraDisponivel: cifraDisponivel(),
    });
  } catch (erro) {
    await registrarFalha({ origem: 'api/super-admin/integracoes' }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    if (!ehSuperAdmin(chamador)) return NextResponse.json({ error: 'Só a equipe da Ortus.' }, { status: 403 });
    const corpo = (await req.json().catch(() => null)) as { ativo?: unknown; clientId?: unknown; clientSecret?: unknown } | null;
    const clientId = typeof corpo?.clientId === 'string' ? corpo.clientId.trim() : '';
    const segredo = typeof corpo?.clientSecret === 'string' ? corpo.clientSecret.trim() : '';
    const ativo = corpo?.ativo === true;
    if (clientId && !CLIENT_ID.test(clientId)) return NextResponse.json({ error: 'O Client ID não parece válido.' }, { status: 400 });
    if (ativo && !clientId) return NextResponse.json({ error: 'Para ligar, informe o Client ID.' }, { status: 400 });
    if (segredo && segredo.length > 300) return NextResponse.json({ error: 'O Client Secret é longo demais.' }, { status: 400 });

    const { data: atual } = await chamador.admin.from('plataforma_integracoes').select('segredo_cifrado').eq('chave', 'google').maybeSingle();
    let segredoCifrado: string | null = atual?.segredo_cifrado ? String(atual.segredo_cifrado) : null;
    if (segredo) {
      try {
        segredoCifrado = cifrar(segredo);
      } catch (e) {
        if (e instanceof SemChaveDeCifra) return NextResponse.json({ error: e.message }, { status: 409 });
        throw e;
      }
    }
    if (ativo && !segredoCifrado && !ehClienteDeTeste(clientId)) {
      return NextResponse.json({ error: 'Para ligar, informe também o Client Secret.' }, { status: 400 });
    }
    const { error } = await chamador.admin.from('plataforma_integracoes').upsert({
      chave: 'google',
      ativo,
      config: { client_id: clientId },
      segredo_cifrado: segredoCifrado,
      atualizado_por: chamador.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chave' });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (erro) {
    await registrarFalha({ origem: 'api/super-admin/integracoes' }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
