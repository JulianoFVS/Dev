import { listarUso, tratarPost } from '@/lib/armazenamentoServidor';
import { listarUsoDesktop, tratarPostDesktop } from '@/lib/arquivosDesktop';
import { desktopAtivo } from '@/lib/local/ponte';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (desktopAtivo()) return listarUsoDesktop(req);
  return listarUso(req);
}

export async function POST(req: Request) {
  if (desktopAtivo()) return tratarPostDesktop(req);
  return tratarPost(req);
}
