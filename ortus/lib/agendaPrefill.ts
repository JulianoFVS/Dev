const CHAVE = 'ortus-agenda-prefill';

export type AgendaPrefill = {
  pacienteId: string;
  procedimento: string;
  observacoes: string;
  data?: string;
};

export function guardarPrefillAgenda(dados: AgendaPrefill) {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    /* o modal abre só com o paciente se o navegador bloquear o armazenamento */
  }
}

export function lerPrefillAgenda(): AgendaPrefill | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as AgendaPrefill;
    if (!dados?.pacienteId || !dados.procedimento) return null;
    return dados;
  } catch {
    return null;
  }
}

export function limparPrefillAgenda() {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* ignore */
  }
}
