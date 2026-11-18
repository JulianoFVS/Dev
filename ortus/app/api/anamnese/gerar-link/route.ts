import { NextResponse } from 'next/server';
import { gerarTokenAnamnese, hashTokenAnamnese } from '@/lib/anamneseLinks';
import { identificarChamador, temAcessoAClinica } from '@/lib/chamadorApi';
import { escritaBarrada } from '@/lib/escritaLiberada';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { origemDoApp } from '@/lib/origemApp';

const LINK_VALIDADE_HORAS = 72;

export async function POST(req: Request) {
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { paciente_id, modelo_id } = body as { paciente_id?: string | number; modelo_id?: string };
    if (!paciente_id || !modelo_id) {
      return NextResponse.json({ error: 'paciente_id e modelo_id são obrigatórios.' }, { status: 400 });
    }

    const { data: paciente, error: pacErr } = await chamador.admin
      .from('pacientes')
      .select('id, clinica_id')
      .eq('id', paciente_id)
      .maybeSingle();

    // A clínica do link é a do PACIENTE, lida no banco. Antes o corpo podia
    // informar outra clínica: quem trabalhava na clínica A passava o próprio
    // id e gerava link (e lia o nome) de um paciente da clínica B.
    // Paciente inexistente e paciente de outra clínica respondem igual, para
    // não confirmar a quem pergunta que aquele id existe.
    const clinicaDoPaciente = paciente?.clinica_id ?? null;
    if (pacErr || !paciente || clinicaDoPaciente == null || !(await temAcessoAClinica(chamador, clinicaDoPaciente))) {
      return NextResponse.json({ error: 'Paciente não encontrado.' }, { status: 404 });
    }

    // anamnese_links é barrada pelo gatilho do modo de consulta, mas a chave de serviço passa por ele.
    const barrada = await escritaBarrada(chamador.admin, clinicaDoPaciente);
    if (barrada) return barrada;

    const plainToken = gerarTokenAnamnese();
    const expiresAt = new Date(Date.now() + LINK_VALIDADE_HORAS * 60 * 60 * 1000).toISOString();

    const { error: insertErr } = await chamador.admin.from('anamnese_links').insert({
      paciente_id: paciente.id,
      clinica_id: clinicaDoPaciente,
      modelo_id: String(modelo_id).slice(0, 80),
      token_hash: hashTokenAnamnese(plainToken),
      expires_at: expiresAt,
    });
    if (insertErr) {
      await registrarFalha({ origem: 'api/anamnese/gerar-link', clinicaId: clinicaDoPaciente }, insertErr);
      return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
    }

    return NextResponse.json({ url: `${origemDoApp(req)}/anamnese/${plainToken}`, expires_at: expiresAt });
  } catch (err) {
    await registrarFalha({ origem: 'api/anamnese/gerar-link' }, err);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
