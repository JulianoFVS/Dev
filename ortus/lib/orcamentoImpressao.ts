/** Impressão (ou PDF pelo navegador) de um orçamento, no modelo dos outros documentos do Ortus. */
import { escapePrintHtml, printDocument, printSignatureBlock, printTable } from '@/lib/printDocument';
import { formatarDia, formatarDinheiro, somarItens, type Orcamento, type OrcamentoItem } from '@/lib/orcamentos';

export function imprimirOrcamento(opts: {
  orcamento: Orcamento;
  itens: OrcamentoItem[];
  clinicaNome?: string | null;
  profissionalNome?: string | null;
}) {
  const { orcamento: o, itens } = opts;
  const linhas = itens.map((item) => [
    escapePrintHtml(item.procedimento),
    escapePrintHtml(item.dente || '—'),
    String(item.quantidade),
    escapePrintHtml(formatarDinheiro(item.valor_unitario)),
    escapePrintHtml(formatarDinheiro(item.valor_total)),
  ]);
  const subtotal = somarItens(itens);
  const corpo = `
    <div class="ortus-section-title">Procedimentos</div>
    ${printTable(['Procedimento', 'Dente', 'Qtd.', 'Valor unitário', 'Total'], linhas, { numCols: [2, 3, 4] })}
    <div class="ortus-section-title">Resumo</div>
    ${printTable(['', 'Valor'], [
      ['Subtotal', escapePrintHtml(formatarDinheiro(subtotal))],
      ['Desconto', escapePrintHtml(formatarDinheiro(o.desconto))],
      ['<strong>Total</strong>', `<strong>${escapePrintHtml(formatarDinheiro(o.valor_total))}</strong>`],
    ], { numCols: [1] })}
    ${o.observacoes ? `<div class="ortus-section-title">Observações</div><div class="ortus-prose">${escapePrintHtml(o.observacoes)}</div>` : ''}
    ${printSignatureBlock(['Assinatura do profissional', 'Assinatura do paciente'])}
  `;
  printDocument({
    title: 'Orçamento',
    documentTitle: `Orçamento — ${o.pacientes?.nome || 'Paciente'}`,
    clinicName: opts.clinicaNome || undefined,
    meta: [
      { label: 'Paciente', value: o.pacientes?.nome || '—' },
      { label: 'Profissional', value: opts.profissionalNome || '—' },
      { label: 'Emitido em', value: formatarDia(o.created_at) },
      { label: 'Válido até', value: formatarDia(o.validade) },
    ],
    kpis: [{ label: 'Total', value: formatarDinheiro(o.valor_total), variant: 'resultado' }],
    bodyHtml: corpo,
    footerNote: 'Valores sujeitos à avaliação clínica. Este orçamento vale até a data indicada.',
  });
}
