export type ModuleName =
  | 'agenda'
  | 'configuracoes'
  | 'controle_protese'
  | 'estoque'
  | 'ficha_paciente'
  | 'financeiro'
  | 'inteligencia'
  | 'loja'
  | 'marketing';

export interface PermissaoModulo {
  id: string;
  profissional_id: number;
  clinica_id: number;
  modulo: ModuleName;
  pode_acessar: boolean;
  created_at: string;
  updated_at: string;
}

export type CommissionTrigger =
  | 'tratamento_finalizado'
  | 'debito_recebido'
  | 'orcamento_aprovado';

export type CommissionType = 'percentual' | 'valor_fixo';

export interface ComissaoRegra {
  id: string;
  profissional_id: number;
  clinica_id: number;
  gatilho: CommissionTrigger;
  tipo: CommissionType;
  valor: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}
