export type PacienteFormData = {
  nome?: string;
  sexo?: string;
  data_nascimento?: string | null;
  cep?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  plano_id?: string | null;
  responsavel_nome?: string;
  responsavel_parentesco?: string;
  responsavel_telefone?: string;
};

export function calcularIdade(dataNascimento?: string | null): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(`${dataNascimento}T12:00:00`);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const mes = hoje.getMonth() - nasc.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

export function isMenorDeIdade(dataNascimento?: string | null): boolean {
  const idade = calcularIdade(dataNascimento);
  return idade !== null && idade < 18;
}

export function validarPaciente(dados: PacienteFormData): string | null {
  if (!dados.nome?.trim()) return 'Informe o nome do paciente.';
  if (!dados.sexo) return 'Selecione o sexo do paciente.';

  const cep = dados.cep?.replace(/\D/g, '') || '';
  if (cep.length !== 8) return 'Informe um CEP válido (8 dígitos).';
  if (!dados.rua?.trim()) return 'Informe a rua/avenida.';
  if (!dados.numero?.trim()) return 'Informe o número do endereço.';
  if (!dados.bairro?.trim()) return 'Informe o bairro.';
  if (!dados.cidade?.trim()) return 'Informe a cidade.';
  if (!dados.uf?.trim()) return 'Selecione a UF.';

  if (isMenorDeIdade(dados.data_nascimento)) {
    if (!dados.responsavel_nome?.trim()) return 'Informe o nome do responsável (paciente menor de 18 anos).';
    if (!dados.responsavel_parentesco) return 'Informe o parentesco do responsável.';
    if (!dados.responsavel_telefone?.trim()) return 'Informe o telefone do responsável.';
  }

  return null;
}

export function abrirWhatsappPaciente(telefone?: string | null, mensagem?: string) {
  const numero = telefone?.replace(/\D/g, '');
  if (!numero) return false;
  const url = mensagem
    ? `https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/55${numero}`;
  window.open(url, '_blank');
  return true;
}
