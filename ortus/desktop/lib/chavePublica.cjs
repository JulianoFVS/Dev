'use strict';

/**
 * A única chave do Supabase que o aplicativo pode carregar é a pública
 * (anônima / "publishable"). A chave de servidor ignora a RLS: dentro de um
 * instalador, qualquer pessoa a extrairia e teria acesso a todas as clínicas.
 *
 * O Supabase tem dois formatos de chave:
 *  - JWT antigo, com o papel no corpo (`anon` ou `service_role`);
 *  - chave nova, com prefixo (`sb_publishable_…` ou `sb_secret_…`).
 */

/** Papel declarado num JWT do Supabase, ou '' quando a chave não é JWT. */
function papelDoJwt(chave) {
  try {
    const corpo = String(chave || '').split('.')[1];
    if (!corpo) return '';
    const json = JSON.parse(Buffer.from(corpo.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.role === 'string' ? json.role : '';
  } catch {
    return '';
  }
}

/** A chave dá poder de servidor (ignora a RLS)? */
function chaveDeServidor(chave) {
  const texto = String(chave || '').trim();
  if (!texto) return false;
  if (/^sb_secret_/i.test(texto)) return true;
  return papelDoJwt(texto) === 'service_role';
}

module.exports = { chaveDeServidor, papelDoJwt };
