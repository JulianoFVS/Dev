import { NextResponse } from 'next/server';
import { ehSuperAdmin, identificarChamador } from '@/lib/chamadorApi';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { MODULES } from '@/lib/modules';
import { buildPresetAccessMap, presetIdFromCargo } from '@/lib/permissionPresets';
import type { ModuleName } from '@/lib/types/permissions';

/**
 * Troca as filiais de uma rede em que um funcionário entra.
 * Só o dono da plataforma. Não mexe em clínicas de outra rede.
 */
export async function POST(req: Request) {
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    if (!ehSuperAdmin(chamador)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const profissionalId = Number(body?.profissionalId);
    const redeId = typeof body?.redeId === 'string' ? body.redeId.trim() : '';
    const pedidos: unknown[] = Array.isArray(body?.clinicas) ? body.clinicas : [];
    const ids: number[] = [...new Set(pedidos.map((id) => Number(id)).filter((id): id is number => Number.isInteger(id) && id > 0))];

    if (!Number.isInteger(profissionalId) || profissionalId <= 0 || !/^[0-9a-f-]{36}$/i.test(redeId)) {
      return NextResponse.json({ error: 'Informe a pessoa e a clínica.' }, { status: 400 });
    }
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Selecione ao menos uma filial.' }, { status: 400 });
    }

    const admin = chamador.admin;
    const { data: unidades, error: unidadesErr } = await admin
      .from('clinicas')
      .select('id')
      .eq('rede_id', redeId);
    if (unidadesErr) {
      await registrarFalha({ origem: 'api/super-admin/acesso', extra: { etapa: 'unidades' } }, unidadesErr);
      return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
    }
    const daRede = new Set<number>((unidades || []).map((c) => Number(c.id)));
    if (ids.some((id) => !daRede.has(id))) {
      return NextResponse.json({ error: 'Só dá para marcar filiais desta clínica.' }, { status: 400 });
    }

    const { data: prof, error: profErr } = await admin
      .from('profissionais')
      .select('id, cargo, is_super_admin')
      .eq('id', profissionalId)
      .maybeSingle();
    if (profErr || !prof) return NextResponse.json({ error: 'Pessoa não encontrada.' }, { status: 404 });
    if (prof.is_super_admin === true) {
      return NextResponse.json({ error: 'O acesso de dono da plataforma não muda por aqui.' }, { status: 400 });
    }

    const { data: vinculos, error: vinculosErr } = await admin
      .from('profissionais_clinicas')
      .select('clinica_id')
      .eq('profissional_id', profissionalId)
      .in('clinica_id', [...daRede]);
    if (vinculosErr) {
      await registrarFalha({ origem: 'api/super-admin/acesso', extra: { etapa: 'vinculos' } }, vinculosErr);
      return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
    }
    const atuais = new Set<number>((vinculos || []).map((v) => Number(v.clinica_id)));
    if (atuais.size === 0) {
      return NextResponse.json({ error: 'Esta pessoa ainda não entra nesta clínica.' }, { status: 400 });
    }

    const entrar = ids.filter((id) => !atuais.has(id));
    const sair = [...atuais].filter((id) => !ids.includes(id));

    if (entrar.length) {
      const { error: insertErr } = await admin
        .from('profissionais_clinicas')
        .insert(entrar.map((clinica_id) => ({ profissional_id: profissionalId, clinica_id, convidado: false })));
      if (insertErr) {
        if (insertErr.code === 'P0001') return NextResponse.json({ error: insertErr.message }, { status: 409 });
        await registrarFalha({ origem: 'api/super-admin/acesso', extra: { etapa: 'entrar' } }, insertErr);
        return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
      }
      const mapa = buildPresetAccessMap(presetIdFromCargo(prof.cargo));
      const { error: permErr } = await admin.from('permissoes_modulos').upsert(
        entrar.flatMap((clinica_id) =>
          MODULES.map((modulo) => ({
            profissional_id: profissionalId,
            clinica_id,
            modulo: modulo.id as ModuleName,
            pode_acessar: mapa[modulo.id],
          })),
        ),
        { onConflict: 'profissional_id,clinica_id,modulo' },
      );
      if (permErr) await registrarFalha({ origem: 'api/super-admin/acesso', extra: { etapa: 'permissoes' } }, permErr);
    }

    if (sair.length) {
      const { error: permErr } = await admin
        .from('permissoes_modulos')
        .delete()
        .eq('profissional_id', profissionalId)
        .in('clinica_id', sair);
      if (permErr) await registrarFalha({ origem: 'api/super-admin/acesso', extra: { etapa: 'permissoes-sair' } }, permErr);
      const { error: delErr } = await admin
        .from('profissionais_clinicas')
        .delete()
        .eq('profissional_id', profissionalId)
        .in('clinica_id', sair);
      if (delErr) {
        await registrarFalha({ origem: 'api/super-admin/acesso', extra: { etapa: 'sair' } }, delErr);
        return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    await registrarFalha({ origem: 'api/super-admin/acesso' }, err);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
