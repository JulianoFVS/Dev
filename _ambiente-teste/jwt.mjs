// JWT HS256 do ambiente local. As chaves "anon" e "service_role" são tokens
// assinados com o mesmo segredo, como no Supabase de verdade.
import crypto from 'node:crypto';

// Na demonstração pública o segredo vem do ambiente (gerado no servidor);
// localmente fica fixo, para as chaves não mudarem entre reinícios.
export const SEGREDO_JWT = process.env.SEGREDO_JWT || 'ambiente-local-de-teste-ortus-segredo-jwt-0001';

const b64 = (dado) => Buffer.from(dado).toString('base64url');

export function assinar(payload) {
  const cabecalho = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = b64(JSON.stringify(payload));
  const assinatura = crypto.createHmac('sha256', SEGREDO_JWT).update(`${cabecalho}.${corpo}`).digest('base64url');
  return `${cabecalho}.${corpo}.${assinatura}`;
}

export function verificar(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return null;
  const esperado = crypto.createHmac('sha256', SEGREDO_JWT).update(`${partes[0]}.${partes[1]}`).digest('base64url');
  const a = Buffer.from(esperado);
  const b = Buffer.from(partes[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const FIXO = { iss: 'supabase-local', iat: 1_700_000_000, exp: 4_102_444_800 };
export const CHAVE_ANON = assinar({ ...FIXO, role: 'anon' });
export const CHAVE_SERVICO = assinar({ ...FIXO, role: 'service_role' });

export function tokenDeUsuario(usuario, segundos = 3600) {
  const agora = Math.floor(Date.now() / 1000);
  return assinar({
    iss: 'supabase-local',
    aud: 'authenticated',
    role: 'authenticated',
    sub: usuario.id,
    email: usuario.email,
    iat: agora,
    exp: agora + segundos,
    app_metadata: { provider: 'email' },
    user_metadata: usuario.raw_user_meta_data || {},
  });
}
