export type PlanoConvenioTemplate = {
  id: string;
  nome: string;
  observacoes: string;
  /** Percentual sugerido de reajuste sobre o plano Particular ao copiar valores */
  reajustePercentSugerido?: number;
};

export const PLANO_CONVENIO_TEMPLATES: PlanoConvenioTemplate[] = [
  {
    id: 'particular_alt',
    nome: 'Particular Alternativo',
    observacoes: 'Tabela particular com valores diferenciados (promoções, pacotes).',
  },
  {
    id: 'unimed',
    nome: 'UNIMED',
    observacoes: 'Convênio UNIMED — revisar códigos TUSS e glosas antes de faturar.',
    reajustePercentSugerido: 12,
  },
  {
    id: 'amil',
    nome: 'Amil Dental',
    observacoes: 'Plano Amil — copia valores do Particular com reajuste sugerido.',
    reajustePercentSugerido: 10,
  },
  {
    id: 'sulamerica',
    nome: 'SulAmérica Odonto',
    observacoes: 'SulAmérica — validar cobertura por procedimento na tabela.',
    reajustePercentSugerido: 8,
  },
  {
    id: 'uniodonto',
    nome: 'Uniodonto',
    observacoes: 'Cooperativa Uniodonto — atenção a limites por especialidade.',
    reajustePercentSugerido: 15,
  },
  {
    id: 'bradesco',
    nome: 'Bradesco Dental',
    observacoes: 'Bradesco Dental — conferir autorização prévia quando exigido.',
    reajustePercentSugerido: 9,
  },
  {
    id: 'odontoprev',
    nome: 'Odontoprev',
    observacoes: 'Odontoprev — tabela nacional, ajustar TUSS por região se necessário.',
    reajustePercentSugerido: 11,
  },
  {
    id: 'personalizado',
    nome: '',
    observacoes: '',
  },
];
