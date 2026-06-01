import type { ModuleName } from '@/lib/types/permissions';

export const MODULES: { id: ModuleName; label: string; description: string }[] = [
  { id: 'agenda', label: 'Agenda', description: 'Consultas, encaixes e confirmações' },
  { id: 'configuracoes', label: 'Configurações', description: 'Preferências do sistema e unidades' },
  { id: 'controle_protese', label: 'Controle de Próteses', description: 'Kanban inteligente de próteses' },
  { id: 'estoque', label: 'Estoque', description: 'Materiais, implantes e insumos' },
  { id: 'ficha_paciente', label: 'Ficha do Paciente', description: 'Dados clínicos, odontograma e anexos' },
  { id: 'financeiro', label: 'Financeiro', description: 'Fluxo de caixa, lançamentos e metas' },
  { id: 'inteligencia', label: 'Inteligência', description: 'Painel analítico e indicadores' },
  { id: 'loja', label: 'Loja / Marketplace', description: 'Aquisições e marketplace Ortus' },
  { id: 'marketing', label: 'Marketing', description: 'Campanhas e jornadas automatizadas' },
];

export function buildModuleAccessMap(defaultValue = false): Record<ModuleName, boolean> {
  return MODULES.reduce((acc, modulo) => {
    acc[modulo.id] = defaultValue;
    return acc;
  }, {} as Record<ModuleName, boolean>);
}
