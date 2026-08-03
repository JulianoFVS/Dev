import type { ModuleName } from '@/lib/types/permissions';

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
