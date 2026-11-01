import { NextResponse } from 'next/server';
import { identificarChamador } from '@/lib/chamadorApi';

export async function POST(req: Request) {
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    const supabaseAdmin = chamador.admin;

    const { data: prof } = await supabaseAdmin
        .from('profissionais')
        .select('id, nome, cargo, foto_url, nivel_acesso, is_super_admin')
        .eq('id', chamador.prof.id)
        .single();

    // super admin vê todas as clínicas; os demais, só as vinculadas
    let clinicas: any[] = [];
    if (prof?.is_super_admin) {
        const { data: todas } = await supabaseAdmin
            .from('clinicas')
            .select('id, nome, endereco, rede_id, redes(id, nome)')
            .order('nome');
        clinicas = (todas || []).filter(Boolean);
    } else if (prof?.id) {
        const { data: vinculos, error: erroVinc } = await supabaseAdmin
            .from('profissionais_clinicas')
            .select('clinicas(id, nome, endereco, rede_id, redes(id, nome))')
            .eq('profissional_id', prof.id);

        if (erroVinc) {
            console.error('Erro ao buscar vínculos:', erroVinc);
            return NextResponse.json({ error: 'Erro ao buscar unidades do usuário.' }, { status: 500 });
        }

        clinicas = (vinculos || [])
            .map((v: any) => v.clinicas)
            .filter(Boolean)
            .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''));
    }

    return NextResponse.json({
        clinicas,
        usuario: prof || { nome: 'Usuário' }
    });

  } catch (error: any) {
    console.error('Erro Crítico API:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
