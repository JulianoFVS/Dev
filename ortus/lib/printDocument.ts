/**
 * Sistema unificado de impressão ORTUS — layout profissional A4.
 */

export type PrintMetaItem = { label: string; value: string };
export type PrintKpiVariant = 'entrada' | 'saida' | 'saldo' | 'andamento' | 'neutral' | 'info';
export type PrintKpi = { label: string; value: string; variant?: PrintKpiVariant };

export function escapePrintHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const PRINT_STYLES = `
  @page { size: A4; margin: 14mm 12mm; }
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    background: #e2e8f0;
    line-height: 1.5;
    font-size: 12px;
  }
  .ortus-print-toolbar {
    position: sticky; top: 0; z-index: 50;
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #e2e8f0;
    padding: 12px 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    flex-wrap: wrap;
  }
  .ortus-print-toolbar-title { font-size: 13px; font-weight: 700; color: #475569; }
  .ortus-print-btn {
    background: #2563eb; color: #fff; border: none; border-radius: 10px;
    padding: 10px 18px; font-size: 13px; font-weight: 700; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .ortus-print-btn:hover { background: #1d4ed8; }
  .ortus-sheet {
    max-width: 210mm; min-height: 297mm; margin: 24px auto;
    background: #fff; padding: 16mm 14mm;
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.15);
    border-radius: 4px;
  }
  .ortus-brand-row {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    padding-bottom: 14px; margin-bottom: 20px;
    border-bottom: 3px solid var(--ortus-accent, #2563eb);
  }
  .ortus-brand { flex: 1; min-width: 0; }
  .ortus-brand-kicker {
    font-size: 9px; font-weight: 800; letter-spacing: 0.12em;
    text-transform: uppercase; color: #64748b; margin-bottom: 4px;
  }
  .ortus-brand h1 {
    margin: 0; font-size: 22px; font-weight: 900; color: #1e3a8a;
    letter-spacing: 0.04em; line-height: 1.2;
  }
  .ortus-brand-sub { margin: 4px 0 0; font-size: 11px; color: #64748b; }
  .ortus-meta-box {
    text-align: right; font-size: 10px; color: #64748b; line-height: 1.6; flex-shrink: 0;
  }
  .ortus-doc-title {
    font-size: 16px; font-weight: 900; text-transform: uppercase;
    letter-spacing: 0.08em; color: #0f172a; margin: 0 0 16px;
    text-align: center;
  }
  .ortus-doc-subtitle {
    text-align: center; color: #475569; font-weight: 600;
    text-transform: capitalize; margin: -8px 0 20px; font-size: 12px;
  }
  .ortus-patient-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 16px;
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
    padding: 14px 16px; margin-bottom: 22px;
  }
  .ortus-field-label {
    display: block; font-size: 9px; font-weight: 800; letter-spacing: 0.08em;
    text-transform: uppercase; color: #94a3b8; margin-bottom: 2px;
  }
  .ortus-field-value { font-size: 12px; font-weight: 700; color: #1e293b; word-break: break-word; }
  .ortus-kpis {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 22px;
  }
  .ortus-kpi {
    border-radius: 10px; border: 1px solid #e2e8f0; padding: 12px 10px;
  }
  .ortus-kpi .lbl {
    font-size: 8px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.08em; color: #94a3b8;
  }
  .ortus-kpi .val { font-size: 18px; font-weight: 900; margin-top: 4px; line-height: 1.2; }
  .ortus-kpi.entrada { background: #ecfdf5; border-color: #6ee7b7; } .ortus-kpi.entrada .val { color: #047857; }
  .ortus-kpi.saida { background: #fef2f2; border-color: #fca5a5; } .ortus-kpi.saida .val { color: #b91c1c; }
  .ortus-kpi.saldo { background: #eff6ff; border-color: #93c5fd; } .ortus-kpi.saldo .val { color: #1d4ed8; }
  .ortus-kpi.andamento { background: #fffbeb; border-color: #fcd34d; } .ortus-kpi.andamento .val { color: #b45309; }
  .ortus-kpi.info { background: #f0fdfa; border-color: #5eead4; } .ortus-kpi.info .val { color: #0f766e; }
  .ortus-kpi.neutral { background: #f8fafc; } .ortus-kpi.neutral .val { color: #334155; }
  .ortus-section-title {
    font-size: 11px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--ortus-accent, #2563eb);
    border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 24px 0 10px;
  }
  .ortus-prose {
    font-size: 13px; line-height: 1.85; color: #1e293b;
    text-align: justify; white-space: pre-wrap; margin-bottom: 32px;
  }
  .ortus-prose-serif {
    font-family: 'Times New Roman', Georgia, serif; font-size: 14px; line-height: 2;
  }
  .ortus-q { margin-bottom: 14px; page-break-inside: avoid; }
  .ortus-q strong {
    display: block; font-size: 11px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.04em; color: #475569; margin-bottom: 4px;
  }
  .ortus-q .r {
    border-bottom: 1px dotted #cbd5e1; padding: 6px 0; min-height: 22px;
    font-size: 13px; color: #0f172a;
  }
  .ortus-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
  .ortus-table th {
    text-align: left; padding: 8px 6px; background: #f1f5f9; color: #475569;
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 2px solid #cbd5e1;
  }
  .ortus-table td { padding: 7px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .ortus-table tr:nth-child(even) td { background: #fafafa; }
  .ortus-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .ortus-table .entrada { color: #047857; font-weight: 700; }
  .ortus-table .saida { color: #b91c1c; font-weight: 700; }
  .ortus-tag {
    display: inline-block; background: #e0e7ff; color: #3730a3;
    padding: 2px 7px; border-radius: 6px; font-size: 9px; font-weight: 700;
  }
  .ortus-evolution-item {
    margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;
    page-break-inside: avoid;
  }
  .ortus-evolution-meta {
    display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 6px;
  }
  .ortus-evolution-date { color: #0f766e; background: #f0fdfa; padding: 2px 8px; border-radius: 6px; }
  .ortus-evolution-text { font-size: 12px; line-height: 1.75; color: #334155; white-space: pre-wrap; }
  .ortus-signatures {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px;
    margin-top: 48px; page-break-inside: avoid;
  }
  .ortus-sign-line {
    border-top: 1px solid #334155; padding-top: 8px; text-align: center;
    font-size: 10px; font-weight: 600; color: #64748b;
  }
  .ortus-footer {
    margin-top: 36px; padding-top: 12px; border-top: 1px solid #e2e8f0;
    text-align: center; font-size: 9px; color: #94a3b8; line-height: 1.5;
  }
  .page-break { page-break-before: always; }
  .no-print { }
  .ortus-face-map { max-width: 280px; margin: 16px auto; aspect-ratio: 3/4; }
  .ortus-legend { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 10px; }
  .ortus-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; color: #64748b; }
  .ortus-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .ortus-photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
  .ortus-photo-card { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
  .ortus-photo-card img { width: 100%; height: 160px; object-fit: cover; display: block; }
  .ortus-photo-cap { padding: 4px 8px; font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; background: #f8fafc; }
  .ortus-status { display: inline-block; font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 6px; }
  .ortus-status.concluido { background: #d1fae5; color: #047857; }
  .ortus-status.andamento { background: #fef3c7; color: #b45309; }
  .ortus-status.planejado { background: #dbeafe; color: #1d4ed8; }
  .ortus-total-row { background: #ecfdf5; border-top: 2px solid #6ee7b7; font-weight: 900; }
  .ortus-total-row td { padding: 10px 6px; color: #047857; font-size: 14px; }
  tr.cancelado td { text-decoration: line-through; color: #94a3b8; }
  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    .ortus-sheet { margin: 0; box-shadow: none; border-radius: 0; max-width: 100%; min-height: auto; padding: 0; }
    .ortus-table tr:nth-child(even) td { background: #f8fafc; }
  }
  @media (max-width: 640px) {
    .ortus-sheet { margin: 12px; padding: 12mm 10mm; }
    .ortus-kpis { grid-template-columns: repeat(2, 1fr); }
    .ortus-patient-grid { grid-template-columns: 1fr; }
    .ortus-signatures { grid-template-columns: 1fr; }
    .ortus-photo-grid { grid-template-columns: repeat(2, 1fr); }
  }
`;

export type BuildPrintDocumentOptions = {
  title: string;
  documentTitle?: string;
  clinicName?: string;
  clinicSubtitle?: string;
  subtitle?: string;
  period?: string;
  accentColor?: string;
  meta?: PrintMetaItem[];
  kpis?: PrintKpi[];
  bodyHtml: string;
  footerNote?: string;
  autoPrint?: boolean;
  showToolbar?: boolean;
  toolbarLabel?: string;
};

export function buildPrintDocument(opts: BuildPrintDocumentOptions): string {
  const accent = opts.accentColor || '#2563eb';
  const now = new Date();
  const emitted = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  const metaHtml = opts.meta?.length
    ? `<div class="ortus-patient-grid">${opts.meta.map((m) =>
        `<div><span class="ortus-field-label">${escapePrintHtml(m.label)}</span><span class="ortus-field-value">${escapePrintHtml(m.value)}</span></div>`
      ).join('')}</div>`
    : '';

  const kpiHtml = opts.kpis?.length
    ? `<div class="ortus-kpis">${opts.kpis.map((k) =>
        `<div class="ortus-kpi ${k.variant || 'neutral'}"><div class="lbl">${escapePrintHtml(k.label)}</div><div class="val">${escapePrintHtml(k.value)}</div></div>`
      ).join('')}</div>`
    : '';

  const toolbar = opts.showToolbar !== false
    ? `<div class="no-print ortus-print-toolbar">
        <span class="ortus-print-toolbar-title">${escapePrintHtml(opts.toolbarLabel || opts.title)}</span>
        <button type="button" class="ortus-print-btn" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
      </div>`
    : '';

  const autoPrintScript = opts.autoPrint
    ? `<script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapePrintHtml(opts.documentTitle || opts.title)}</title>
  <style>:root{--ortus-accent:${accent};}${PRINT_STYLES}</style>
</head>
<body>
  ${toolbar}
  <div class="ortus-sheet">
    <div class="ortus-brand-row">
      <div class="ortus-brand">
        <div class="ortus-brand-kicker">Documento clínico</div>
        <h1>${escapePrintHtml(opts.clinicName || 'ORTUS CLINIC')}</h1>
        ${opts.clinicSubtitle ? `<p class="ortus-brand-sub">${escapePrintHtml(opts.clinicSubtitle)}</p>` : '<p class="ortus-brand-sub">Odontologia integrada · Sistema ORTUS</p>'}
      </div>
      <div class="ortus-meta-box">
        <div><strong>Emitido:</strong> ${emitted}</div>
        ${opts.period ? `<div><strong>Período:</strong> ${escapePrintHtml(opts.period)}</div>` : ''}
        <div>Sistema ORTUS</div>
      </div>
    </div>
    <h2 class="ortus-doc-title">${escapePrintHtml(opts.title)}</h2>
    ${opts.subtitle ? `<p class="ortus-doc-subtitle">${escapePrintHtml(opts.subtitle)}</p>` : ''}
    ${metaHtml}
    ${kpiHtml}
    ${opts.bodyHtml}
    <div class="ortus-footer">
      ${escapePrintHtml(opts.footerNote || 'Documento gerado eletronicamente pelo Sistema ORTUS. Válido sem assinatura quando emitido pelo profissional responsável.')}
    </div>
  </div>
  ${autoPrintScript}
</body>
</html>`;
}

export function openPrintDocument(html: string, features = 'width=920,height=780'): Window | null {
  const w = window.open('', '_blank', features);
  if (!w) return null;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return w;
}

export function printDocument(opts: BuildPrintDocumentOptions): Window | null {
  return openPrintDocument(buildPrintDocument(opts));
}

/** Bloco de perguntas/respostas (anamnese). */
export function printQaBlock(label: string, answer: string): string {
  return `<div class="ortus-q"><strong>${escapePrintHtml(label)}</strong><div class="r">${escapePrintHtml(answer) || '—'}</div></div>`;
}

/** Assinatura central ou dupla. */
export function printSignatureBlock(labels: string[] = ['Assinatura do Profissional']): string {
  if (labels.length === 1) {
    return `<div class="ortus-signatures" style="grid-template-columns:1fr;max-width:280px;margin-left:auto;margin-right:auto;">
      <div class="ortus-sign-line">${escapePrintHtml(labels[0])}</div>
    </div>`;
  }
  return `<div class="ortus-signatures">${labels.map((l) => `<div class="ortus-sign-line">${escapePrintHtml(l)}</div>`).join('')}</div>`;
}

/** Tabela HTML simples. */
export function printTable(headers: string[], rows: string[][], options?: { numCols?: number[] }): string {
  const numSet = new Set(options?.numCols || []);
  return `<table class="ortus-table"><thead><tr>${headers.map((h) => `<th>${escapePrintHtml(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.length
      ? rows.map((row) => `<tr>${row.map((cell, i) => `<td class="${numSet.has(i) ? 'num' : ''}">${cell}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`
  }</tbody></table>`;
}
