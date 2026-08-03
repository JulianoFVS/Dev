import type { ModuleName } from '@/lib/types/permissions';
import { moduleForPath, ROUTE_MODULE_MAP } from '@/lib/permissionPresets';

/** Verifica se o usuário pode acessar um módulo (client-side). */
export function canAccessModulePath(
  pathname: string,
  moduleAccess: Record<ModuleName, boolean>,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  const modulo = moduleForPath(pathname);
  if (!modulo) return true;
  return !!moduleAccess[modulo];
}

export { ROUTE_MODULE_MAP, moduleForPath };
