'use client';

import CustomSelect from '@/components/ui/CustomSelect';

export type ProcedimentoOption = {
  id: string | number;
  nome: string;
  valor_sugerido?: number | string | null;
  especialidade_id?: string | null;
};

type Props = {
  clinicaId: string | number | null | undefined;
  especialidades?: { id: string; nome: string }[];
  tratamentos: ProcedimentoOption[];
  value: string;
  onChange: (nome: string, tratamento?: ProcedimentoOption | null) => void;
  disabled?: boolean;
};

export default function ProcedureCombobox({
  clinicaId,
  tratamentos,
  value,
  onChange,
  disabled,
}: Props) {
  const selecionado = tratamentos.find((t) => t.nome === value);
  const opcoes = tratamentos.map((t) => ({ value: String(t.id), label: t.nome }));
  if (value && !selecionado) opcoes.unshift({ value: `__livre:${value}`, label: value });

  return (
    <CustomSelect
      searchable
      disabled={disabled || !clinicaId}
      value={selecionado ? String(selecionado.id) : value ? `__livre:${value}` : ''}
      onChange={(id) => {
        const tratamento = tratamentos.find((item) => String(item.id) === id);
        if (tratamento) onChange(tratamento.nome, tratamento);
      }}
      options={opcoes}
      placeholder={clinicaId ? 'Buscar procedimento' : 'Selecione a clínica primeiro'}
      size="md"
    />
  );
}
