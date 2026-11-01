import { listarUso, tratarPost } from '@/lib/armazenamentoServidor';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return listarUso(req);
}

export async function POST(req: Request) {
  return tratarPost(req);
}
