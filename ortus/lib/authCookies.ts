import type { ModuleName } from '@/lib/types/permissions';
import { buildModuleAccessMap } from '@/lib/modules';

export const COOKIE_AUTH = 'ortus_auth';
export const COOKIE_MODULES = 'ortus_modules';
const MAX_AGE = 60 * 60 * 24 * 7;

function setCookie(name: string, value: string, maxAge = MAX_AGE) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export function encodeModulesCookie(
  access: Record<ModuleName, boolean> | 'all',
): string {
  if (access === 'all') return '*';
  return Object.entries(access)
    .filter(([, allowed]) => allowed)
    .map(([modulo]) => modulo)
    .join(',');
}

export function decodeModulesCookie(value: string | undefined): Set<string> | 'all' {
  if (!value || value === '*') return 'all';
  return new Set(decodeURIComponent(value).split(',').filter(Boolean));
}

export function setAuthMarkerCookie() {
  setCookie(COOKIE_AUTH, '1');
}

export function syncModuleAccessCookie(access: Record<ModuleName, boolean> | 'all') {
  setAuthMarkerCookie();
  setCookie(COOKIE_MODULES, encodeModulesCookie(access));
}

export function clearAuthCookies() {
  deleteCookie(COOKIE_AUTH);
  deleteCookie(COOKIE_MODULES);
}

const SUPER_ADMIN_CACHE = 'ortus_super_admin';

/** Hidrata permissões do cookie no primeiro paint (sidebar sem delay). */
export function readModuleAccessMapFromCookie(fallback = false): Record<ModuleName, boolean> {
  const map = buildModuleAccessMap(fallback);
  if (typeof document === 'undefined') return map;
  const match = document.cookie.split(';').find((c) => c.trim().startsWith(`${COOKIE_MODULES}=`));
  if (!match) return map;
  const raw = match.trim().slice(COOKIE_MODULES.length + 1);
  const decoded = decodeModulesCookie(decodeURIComponent(raw));
  if (decoded === 'all') return buildModuleAccessMap(true);
  decoded.forEach((mod) => {
    if (mod in map) map[mod as ModuleName] = true;
  });
  return map;
}

export function readSuperAdminCache(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(SUPER_ADMIN_CACHE) === '1';
}

export function writeSuperAdminCache(isSuperAdmin: boolean) {
  if (typeof sessionStorage === 'undefined') return;
  if (isSuperAdmin) sessionStorage.setItem(SUPER_ADMIN_CACHE, '1');
  else sessionStorage.removeItem(SUPER_ADMIN_CACHE);
}

export function clearSuperAdminCache() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(SUPER_ADMIN_CACHE);
}
