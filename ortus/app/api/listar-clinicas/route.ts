import { NextResponse } from 'next/server';
import { identificarChamador } from '@/lib/chamadorApi';
import { consultarLocal, desktopAtivo } from '@/lib/local/ponte';
import { exigirSessaoLocal } from '@/lib/local/rota';

type ProfissionalLocal = {
  id: number;
  nome: string | null;
  cargo: string | null;
  foto_url: string | null;
  nivel_acesso: string | null;
  is_super_admin: boolean | null;
};

async function listarNoDesktop(req: Request) {
  const acesso = await exigirSessaoLocal(req);
  if ('resposta' in acesso) return acesso.resposta;
  const userId = acesso.sessao.user?.id;
  if (!userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const profs = await consultarLocal<ProfissionalLocal>('profissionais', {
    filtros: [{ col: 'user_id', op: 'eq', valor: userId }],
    limite: 1,
  });
  const prof = profs[0];
  if (!prof) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });

  let clinicas: Record<string, unknown>[] = [];
  if (prof.is_super_admin) {
    clinicas = await consultarLocal('clinicas', { ordem: [{ col: 'nome', asc: true }] });
  } else {
    const vinculos = await consultarLocal<{ clinica_id: number | null }>('profissionais_clinicas', {
      filtros: [{ col: 'profissional_id', op: 'eq', valor: prof.id }],
    });
    const ids = [...new Set(vinculos.map((v) => v.clinica_id).filter((id) => id != null))];
    if (ids.length) {
      clinicas = await consultarLocal('clinicas', {
        filtros: [{ col: 'id', op: 'in', valor: ids }],
        ordem: [{ col: 'nome', asc: true }],
      });
    }
  }

  return NextResponse.json({
    clinicas,
    usuario: {
      id: prof.id,
      nome: prof.nome,
      cargo: prof.cargo,
      foto_url: prof.foto_url,
      nivel_acesso: prof.nivel_acesso,
      is_super_admin: prof.is_super_admin,
    },
  });
}

export async function POST(req: Request) {
  if (desktopAtivo()) {
    try {
      return await listarNoDesktop(req);
    } catch (error) {
      console.error('Erro ao listar clínicas no desktop:', error);
      return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
    }
  }

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
