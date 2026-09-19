/** Cache leve + evento para foto/nome do profissional (sidebar sem refetch completo). */

export const PROFILE_SESSION_KEY = 'ortus:profile:v1';
export const PROFILE_PATCH_EVENT = 'ortus:profile-patch';

export type ProfileSessionSnapshot = {
  foto_url?: string | null;
  nome?: string;
  cargo?: string;
  nivel_acesso?: string;
};

function readRaw(): ProfileSessionSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PROFILE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ProfileSessionSnapshot;
  } catch {
    return null;
  }
}

export function readProfileSession(): ProfileSessionSnapshot | null {
  return readRaw();
}

export function writeProfileSession(patch: ProfileSessionSnapshot) {
  if (typeof sessionStorage === 'undefined') return;
  const prev = readRaw() || {};
  try {
    sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* quota */
  }
}

export function clearProfileSession() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PROFILE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function patchProfileSession(patch: ProfileSessionSnapshot) {
  writeProfileSession(patch);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROFILE_PATCH_EVENT, { detail: patch }));
  }
}

export function mergeProfilFromSession<T extends ProfileSessionSnapshot>(prof: T | null): T | null {
  if (!prof) return prof;
  const boot = readProfileSession();
  if (!boot) return prof;
  return {
    ...prof,
    foto_url: boot.foto_url ?? prof.foto_url,
    nome: boot.nome ?? prof.nome,
    cargo: boot.cargo ?? prof.cargo,
  };
}
