/** Cache leve por rota/clínica (sessionStorage) — bootstrap síncrono no useState inicial. */

type Entry<T> = { scope: string; data: T; at: number };

export function readRouteCache<T>(key: string, scope: string): T | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (parsed.scope !== scope) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeRouteCache<T>(key: string, scope: string, data: T) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const payload: Entry<T> = { scope, data, at: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function clinicScope(activeClinicId: string | 'all' | null | undefined): string {
  return activeClinicId == null ? 'none' : String(activeClinicId);
}
