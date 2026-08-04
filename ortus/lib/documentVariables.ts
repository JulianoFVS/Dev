export type DocumentoContexto = {
  paciente_nome?: string;
  paciente_cpf?: string;
  paciente_telefone?: string;
  paciente_email?: string;
  paciente_endereco?: string;
  clinica_nome?: string;
  clinica_cnpj?: string;
  clinica_telefone?: string;
  clinica_endereco?: string;
  responsavel_nome?: string;
  plano_nome?: string;
  valor_total?: string;
  data?: string;
  data_extenso?: string;
  data_consulta?: string;
  hora_consulta?: string;
};

export const DOCUMENTO_VARIAVEIS: { chave: keyof DocumentoContexto | string; label: string; exemplo: string }[] = [
  { chave: 'paciente_nome', label: 'Nome do paciente', exemplo: 'Maria Silva' },
  { chave: 'paciente_cpf', label: 'CPF do paciente', exemplo: '123.456.789-00' },
  { chave: 'paciente_telefone', label: 'Telefone do paciente', exemplo: '(11) 99999-0000' },
  { chave: 'paciente_email', label: 'E-mail do paciente', exemplo: 'maria@email.com' },
  { chave: 'paciente_endereco', label: 'Endereço do paciente', exemplo: 'Rua A, 100 — Centro' },
  { chave: 'clinica_nome', label: 'Nome da clínica', exemplo: 'Clínica Ortus' },
  { chave: 'clinica_cnpj', label: 'CNPJ da clínica', exemplo: '00.000.000/0001-00' },
  { chave: 'clinica_telefone', label: 'Telefone da clínica', exemplo: '(11) 3333-0000' },
  { chave: 'clinica_endereco', label: 'Endereço da clínica', exemplo: 'Av. Principal, 500' },
  { chave: 'responsavel_nome', label: 'Responsável (menor)', exemplo: 'João Silva' },
  { chave: 'plano_nome', label: 'Plano / convênio', exemplo: 'Particular' },
  { chave: 'valor_total', label: 'Valor total', exemplo: 'R$ 1.500,00' },
  { chave: 'data', label: 'Data (dd/mm/aaaa)', exemplo: new Date().toLocaleDateString('pt-BR') },
  { chave: 'data_extenso', label: 'Data por extenso', exemplo: '28 de julho de 2026' },
  { chave: 'data_consulta', label: 'Data da consulta', exemplo: '29/07/2026' },
  { chave: 'hora_consulta', label: 'Hora da consulta', exemplo: '14:30' },
];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataPorExtenso(data = new Date()): string {
  return `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()}`;
}

export function buildDocumentoContexto(parcial: Partial<DocumentoContexto> = {}): DocumentoContexto {
  const hoje = new Date();
  return {
    data: hoje.toLocaleDateString('pt-BR'),
    data_extenso: dataPorExtenso(hoje),
    paciente_nome: 'Nome do Paciente',
    paciente_cpf: '000.000.000-00',
    clinica_nome: 'Nome da Clínica',
    ...parcial,
  };
}

/** Token legível no editor: 【Nome do paciente】 */
export function tokenVariavelLabel(label: string): string {
  return `【${label}】`;
}

export function inserirTokenVariavel(conteudo: string, label: string): string {
  return `${conteudo}${tokenVariavelLabel(label)}`;
}

const LABEL_TO_CHAVE = Object.fromEntries(
  DOCUMENTO_VARIAVEIS.map(v => [v.label.toLowerCase(), String(v.chave)]),
) as Record<string, string>;

export function aplicarVariaveisDocumento(texto: string, ctx: DocumentoContexto): string {
  let out = texto;
  // Tokens legíveis 【Label】
  DOCUMENTO_VARIAVEIS.forEach(v => {
    const val = ctx[v.chave as keyof DocumentoContexto];
    if (val === undefined || val === null) return;
    out = out.replace(new RegExp(`【\\s*${escapeRegex(v.label)}\\s*】`, 'gi'), String(val));
  });
  // Legado {{chave}}
  Object.entries(ctx).forEach(([chave, valor]) => {
    if (valor === undefined || valor === null) return;
    out = out.replace(new RegExp(`\\{\\{\\s*${escapeRegex(chave)}\\s*\\}\\}`, 'gi'), String(valor));
  });
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

/** Converte conteúdo salvo (【Label】) para HTML com chips coloridos no editor. */
export function conteudoToEditorHtml(conteudo: string): string {
  if (!conteudo) return '';
  return conteudo.split(/(【[^】]+】)/g).map((part) => {
    const match = part.match(/^【([^】]+)】$/);
    if (match) {
      const label = match[1];
      return `<span class="doc-var-chip inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md bg-purple-100 text-purple-800 text-xs font-bold border border-purple-200 select-none align-middle" contenteditable="false" data-label="${escapeAttr(label)}">${escapeHtml(label)}</span>`;
    }
    return escapeHtml(part).replace(/\n/g, '<br>');
  }).join('');
}

/** Serializa o editor contentEditable de volta para 【Label】. */
export function editorHtmlToConteudo(root: HTMLElement): string {
  let out = '';
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || '';
    } else if (node.nodeName === 'BR') {
      out += '\n';
    } else if (node instanceof HTMLElement) {
      if (node.classList.contains('doc-var-chip')) {
        out += tokenVariavelLabel(node.dataset.label || node.textContent || '');
      } else {
        node.childNodes.forEach(walk);
        if (node.nodeName === 'DIV' && node !== root && node.nextSibling) out += '\n';
      }
    }
  }
  root.childNodes.forEach(walk);
  return out;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
