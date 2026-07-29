import type { ModuleName } from '@/lib/types/permissions';
import { buildModuleAccessMap, MODULES } from '@/lib/modules';

export type PermissionPresetId = 'recepcionista' | 'dentista' | 'financeiro' | 'gestor' | 'completo' | 'restrito';

export const PERMISSION_PRESETS: {
  id: PermissionPresetId;
  label: string;
  description: string;
  modulos: ModuleName[];
}[] = [
  {
    id: 'recepcionista',
    label: 'Recepcionista',
    description: 'Agenda, pacientes e tarefas do dia.',
    modulos: ['agenda', 'ficha_paciente'],
  },
  {
    id: 'dentista',
    label: 'Dentista',
    description: 'Atendimento clínico, prontuário e próteses.',
    modulos: ['agenda', 'ficha_paciente', 'controle_protese'],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    description: 'Fluxo de caixa e relatórios.',
    modulos: ['financeiro', 'inteligencia', 'ficha_paciente'],
  },
  {
    id: 'gestor',
    label: 'Gestor',
    description: 'Visão ampla sem configurações sensíveis.',
    modulos: ['agenda', 'ficha_paciente', 'controle_protese', 'financeiro', 'inteligencia'],
  },
  {
    id: 'completo',
    label: 'Acesso completo',
    description: 'Todos os módulos (exceto admin do sistema).',
    modulos: MODULES.map((m) => m.id),
  },
  {
    id: 'restrito',
    label: 'Restrito',
    description: 'Nenhum módulo — ajuste manualmente.',
    modulos: [],
  },
];

export function buildPresetAccessMap(presetId: PermissionPresetId): Record<ModuleName, boolean> {
  const preset = PERMISSION_PRESETS.find((p) => p.id === presetId);
  const mapa = buildModuleAccessMap(false);
  if (!preset) return mapa;
  preset.modulos.forEach((modulo) => {
    mapa[modulo] = true;
  });
  return mapa;
}

/** Mapeia cargo informado no cadastro para preset de permissões padrão. */
export function presetIdFromCargo(cargo?: string | null): PermissionPresetId {
  const c = (cargo || '').toLowerCase();
  if (c.includes('recep')) return 'recepcionista';
  if (c.includes('dent') || c.includes('ortod') || c.includes('implant')) return 'dentista';
  if (c.includes('financ') || c.includes('contab')) return 'financeiro';
  if (c.includes('gestor') || c.includes('admin') || c.includes('sócio') || c.includes('socio')) return 'gestor';
  if (c.includes('auxiliar') || c.includes('protét') || c.includes('prote')) return 'dentista';
  return 'recepcionista';
}

export const ROUTE_MODULE_MAP: { prefix: string; module: ModuleName }[] = [
  { prefix: '/dashboard', module: 'inteligencia' },
  { prefix: '/agenda', module: 'agenda' },
  { prefix: '/pacientes', module: 'ficha_paciente' },
  { prefix: '/proteses', module: 'controle_protese' },
  { prefix: '/tarefas', module: 'agenda' },
  { prefix: '/financeiro', module: 'financeiro' },
  { prefix: '/relatorios', module: 'inteligencia' },
  { prefix: '/ajustes/equipe', module: 'configuracoes' },
  { prefix: '/ajustes/tratamentos', module: 'configuracoes' },
  { prefix: '/configuracoes', module: 'configuracoes' },
  { prefix: '/planos', module: 'configuracoes' },
  { prefix: '/inbox', module: 'marketing' },
];

export function moduleForPath(pathname: string): ModuleName | null {
  const match = ROUTE_MODULE_MAP.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return match?.module ?? null;
}
