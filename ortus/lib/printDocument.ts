/**
 * Impressão ORTUS — preview dedicado (não imprime a tela do app), layout Bento A4.
 */

export type PrintMetaItem = { label: string; value: string };
export type PrintKpiVariant = 'entrada' | 'saida' | 'saldo' | 'andamento' | 'neutral' | 'info' | 'resultado';
export type PrintKpi = { label: string; value: string; variant?: PrintKpiVariant };

export function escapePrintHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const PRINT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

  @page { size: A4; margin: 12mm 11mm; }
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Poppins', system-ui, -apple-system, sans-serif;
    color: #171717;
    margin: 0;
    background: #f3f4f1;
    line-height: 1.55;
    font-size: 11px;
    font-weight: 400;
  }

  .ortus-print-toolbar {
    position: sticky; top: 0; z-index: 50;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(0,0,0,0.06);
    padding: 12px 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    flex-wrap: wrap;
  }
  .ortus-print-toolbar-copy { min-width: 0; }
  .ortus-print-toolbar-title { font-size: 14px; font-weight: 600; color: #171717; letter-spacing: -0.02em; }
  .ortus-print-toolbar-hint { font-size: 11px; color: #737373; margin-top: 2px; }
  .ortus-print-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .ortus-print-btn {
    background: #171717; color: #fff; border: none; border-radius: 9999px;
    padding: 10px 18px; font-size: 12px; font-weight: 600; cursor: pointer;
    font-family: inherit;
  }
  .ortus-print-btn:hover { background: #262626; }
  .ortus-print-btn-ghost {
    background: #fff; color: #404040; border: 1px solid rgba(0,0,0,0.1); border-radius: 9999px;
    padding: 10px 16px; font-size: 12px; font-weight: 500; cursor: pointer;
    font-family: inherit;
  }
  .ortus-print-btn-ghost:hover { background: #fafafa; }

  .ortus-sheet {
    max-width: 210mm; margin: 20px auto 32px;
    background: #fff;
    border-radius: 18px;
    border: 1px solid rgba(0,0,0,0.06);
    box-shadow: 0 24px 48px -20px rgba(0,0,0,0.18);
    overflow: hidden;
  }
  .ortus-sheet-inner { padding: 14mm 13mm 16mm; }

  .ortus-brand-row {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;
    padding-bottom: 16px; margin-bottom: 18px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .ortus-brand { flex: 1; min-width: 0; }
  .ortus-brand-logo { height: 22px; width: auto; display: block; margin-bottom: 10px; }
  .ortus-brand-kicker {
    font-size: 9px; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: #a3a3a3; margin-bottom: 6px;
  }
  .ortus-brand h1 {
    margin: 0; font-size: 18px; font-weight: 600; color: #171717;
    letter-spacing: -0.03em; line-height: 1.25;
  }
  .ortus-brand-sub { margin: 6px 0 0; font-size: 11px; color: #737373; font-weight: 400; }

  .ortus-meta-box {
    text-align: right; font-size: 10px; color: #737373; line-height: 1.65; flex-shrink: 0;
    background: #f9f9f8; border: 1px solid rgba(0,0,0,0.05); border-radius: 14px;
    padding: 10px 12px; min-width: 140px;
  }
  .ortus-meta-box strong { color: #525252; font-weight: 600; }

  .ortus-doc-head {
    margin-bottom: 18px; padding: 14px 16px;
    background: linear-gradient(135deg, #171717 0%, #262626 55%, #404040 100%);
    border-radius: 14px; color: #fff;
  }
  .ortus-doc-title {
    margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.02em;
  }
  .ortus-doc-subtitle {
    margin: 6px 0 0; font-size: 11px; color: rgba(255,255,255,0.65); font-weight: 400;
  }
  .ortus-doc-accent {
    display: inline-block; margin-top: 10px; font-size: 9px; font-weight: 600;
    letter-spacing: 0.12em; text-transform: uppercase; color: #c8f053;
  }

  .ortus-patient-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 14px;
    background: #f9f9f8; border: 1px solid rgba(0,0,0,0.05); border-radius: 14px;
    padding: 14px 16px; margin-bottom: 20px;
  }
  .ortus-field-label {
    display: block; font-size: 9px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: #a3a3a3; margin-bottom: 3px;
  }
  .ortus-field-value { font-size: 12px; font-weight: 600; color: #171717; word-break: break-word; }

  .ortus-kpis {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0 0 20px;
  }
  .ortus-kpi {
    border-radius: 14px; border: 1px solid rgba(0,0,0,0.06);
    padding: 12px 10px; background: #fff;
  }
  .ortus-kpi .lbl {
    font-size: 8px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.08em; color: #a3a3a3;
  }
  .ortus-kpi .val {
    font-size: 16px; font-weight: 600; margin-top: 5px; line-height: 1.2;
    letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
  }
  .ortus-kpi.entrada { background: #f0fdf4; border-color: #bbf7d0; }
  .ortus-kpi.entrada .val { color: #15803d; }
  .ortus-kpi.saida { background: #fef2f2; border-color: #fecaca; }
  .ortus-kpi.saida .val { color: #b91c1c; }
  .ortus-kpi.andamento { background: #fffbeb; border-color: #fde68a; }
  .ortus-kpi.andamento .val { color: #b45309; }
  .ortus-kpi.info { background: #f5f5f4; border-color: #e7e5e4; }
  .ortus-kpi.info .val { color: #44403c; }
  .ortus-kpi.neutral { background: #fafafa; }
  .ortus-kpi.neutral .val { color: #171717; }
  .ortus-kpi.saldo, .ortus-kpi.resultado {
    background: #0a0a0a; border-color: #262626;
  }
  .ortus-kpi.saldo .lbl, .ortus-kpi.resultado .lbl { color: rgba(255,255,255,0.5); }
  .ortus-kpi.saldo .val, .ortus-kpi.resultado .val { color: #c8f053; }

  .ortus-section-title {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.1em; color: #525252;
    margin: 22px 0 10px; padding-bottom: 6px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .ortus-section-title:first-child { margin-top: 0; }

  .ortus-table-wrap {
    border: 1px solid rgba(0,0,0,0.06); border-radius: 14px; overflow: hidden;
    margin-top: 4px;
  }
  .ortus-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .ortus-table th {
    text-align: left; padding: 9px 10px; background: #f3f4f1; color: #525252;
    font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .ortus-table td {
    padding: 8px 10px; border-bottom: 1px solid rgba(0,0,0,0.04);
    vertical-align: top; color: #262626;
  }
  .ortus-table tbody tr:last-child td { border-bottom: none; }
  .ortus-table .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .ortus-table .entrada { color: #15803d; font-weight: 600; }
  .ortus-table .saida { color: #b91c1c; font-weight: 600; }

  .ortus-prose {
    font-size: 12px; line-height: 1.85; color: #262626;
    text-align: justify; white-space: pre-wrap; margin-bottom: 24px;
  }
  .ortus-prose-serif {
    font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 2;
  }
  .ortus-q { margin-bottom: 14px; page-break-inside: avoid; }
  .ortus-q strong {
    display: block; font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: #525252; margin-bottom: 4px;
  }
  .ortus-q .r {
    border-bottom: 1px dotted #d4d4d4; padding: 6px 0; min-height: 22px;
    font-size: 12px; color: #171717;
  }

  .ortus-tag {
    display: inline-block; background: #f3f4f1; color: #404040;
    padding: 2px 8px; border-radius: 9999px; font-size: 9px; font-weight: 600;
    border: 1px solid rgba(0,0,0,0.05);
  }

  .ortus-evolution-item {
    margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid rgba(0,0,0,0.06);
    page-break-inside: avoid;
  }
  .ortus-evolution-meta {
    display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    font-size: 10px; font-weight: 600; color: #737373; margin-bottom: 6px;
  }
  .ortus-evolution-date {
    color: #171717; background: #f3f4f1; padding: 2px 8px; border-radius: 9999px; font-size: 9px;
  }
  .ortus-evolution-text { font-size: 11px; line-height: 1.75; color: #404040; white-space: pre-wrap; }

  .ortus-signatures {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 28px;
    margin-top: 40px; page-break-inside: avoid;
  }
  .ortus-sign-line {
    border-top: 1px solid #404040; padding-top: 8px; text-align: center;
    font-size: 10px; font-weight: 500; color: #737373;
  }

  .ortus-footer {
    margin-top: 28px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.06);
    text-align: center; font-size: 9px; color: #a3a3a3; line-height: 1.55;
  }

  .page-break { page-break-before: always; }
  .ortus-face-map { max-width: 260px; margin: 14px auto; aspect-ratio: 3/4; }
  .ortus-legend { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 10px; }
  .ortus-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 600; color: #737373; }
  .ortus-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .ortus-photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
  .ortus-photo-card { border: 1px solid rgba(0,0,0,0.06); border-radius: 12px; overflow: hidden; page-break-inside: avoid; }
  .ortus-photo-card img { width: 100%; height: 150px; object-fit: cover; display: block; }
  .ortus-photo-cap {
    padding: 4px 8px; font-size: 8px; font-weight: 600; color: #737373;
    text-transform: uppercase; background: #f9f9f8;
  }
  .ortus-status {
    display: inline-block; font-size: 8px; font-weight: 600; text-transform: uppercase;
    padding: 2px 8px; border-radius: 9999px;
  }
  .ortus-status.concluido { background: #dcfce7; color: #166534; }
  .ortus-status.andamento { background: #fef3c7; color: #92400e; }
  .ortus-status.planejado { background: #f3f4f1; color: #404040; }
  .ortus-total-row { background: #f0fdf4; font-weight: 600; }
  .ortus-total-row td { padding: 10px; color: #15803d; font-size: 12px; }
  tr.cancelado td { text-decoration: line-through; color: #a3a3a3; }

  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    .ortus-sheet {
      margin: 0; box-shadow: none; border-radius: 0; border: none; max-width: 100%;
    }
    .ortus-sheet-inner { padding: 0; }
    .ortus-doc-head { border-radius: 10px; }
  }
  @media (max-width: 640px) {
    .ortus-sheet { margin: 10px; border-radius: 14px; }
    .ortus-sheet-inner { padding: 12px 10px 16px; }
    .ortus-kpis { grid-template-columns: repeat(2, 1fr); }
    .ortus-patient-grid { grid-template-columns: 1fr; }
    .ortus-signatures { grid-template-columns: 1fr; }
    .ortus-photo-grid { grid-template-columns: repeat(2, 1fr); }
    .ortus-brand-row { flex-direction: column; }
    .ortus-meta-box { text-align: left; width: 100%; }
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
  brandKicker?: string;
  meta?: PrintMetaItem[];
  kpis?: PrintKpi[];
  bodyHtml: string;
  footerNote?: string;
  /** Abre o diálogo de impressão automaticamente (padrão: false — preview primeiro). */
  autoPrint?: boolean;
  showToolbar?: boolean;
  toolbarLabel?: string;
};

function kpiVariantClass(v?: PrintKpiVariant): string {
  if (!v) return 'neutral';
  return v;
}

export function buildPrintDocument(opts: BuildPrintDocumentOptions): string {
  const accent = opts.accentColor || '#171717';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logoUrl = origin ? `${origin}/landing/ortus-wordmark.svg` : '';
  const now = new Date();
  const emitted = `${now.toLocaleDateString('pt-BR')} · ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const kicker = opts.brandKicker || 'Documento · Sistema ORTUS';

  const metaHtml = opts.meta?.length
    ? `<div class="ortus-patient-grid">${opts.meta
        .map(
          (m) =>
            `<div><span class="ortus-field-label">${escapePrintHtml(m.label)}</span><span class="ortus-field-value">${escapePrintHtml(m.value)}</span></div>`,
        )
        .join('')}</div>`
    : '';

  const kpiHtml = opts.kpis?.length
    ? `<div class="ortus-kpis">${opts.kpis
        .map(
          (k) =>
            `<div class="ortus-kpi ${kpiVariantClass(k.variant)}"><div class="lbl">${escapePrintHtml(k.label)}</div><div class="val">${escapePrintHtml(k.value)}</div></div>`,
        )
        .join('')}</div>`
    : '';

  const toolbar =
    opts.showToolbar !== false
      ? `<div class="no-print ortus-print-toolbar">
        <div class="ortus-print-toolbar-copy">
          <div class="ortus-print-toolbar-title">${escapePrintHtml(opts.toolbarLabel || opts.title)}</div>
          <div class="ortus-print-toolbar-hint">Pré-visualização — use o botão para imprimir ou salvar como PDF.</div>
        </div>
        <div class="ortus-print-actions">
          <button type="button" class="ortus-print-btn-ghost" onclick="window.close()">Fechar</button>
          <button type="button" class="ortus-print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
        </div>
      </div>`
      : '';

  const autoPrintScript = opts.autoPrint
    ? `<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>`
    : '';

  const logoBlock = logoUrl
    ? `<img class="ortus-brand-logo" src="${escapePrintHtml(logoUrl)}" alt="ORTUS" />`
    : `<div class="ortus-brand-kicker">ORTUS</div>`;

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
    <div class="ortus-sheet-inner">
      <div class="ortus-brand-row">
        <div class="ortus-brand">
          ${logoBlock}
          <div class="ortus-brand-kicker">${escapePrintHtml(kicker)}</div>
          <h1>${escapePrintHtml(opts.clinicName || 'Clínica')}</h1>
          ${
            opts.clinicSubtitle
              ? `<p class="ortus-brand-sub">${escapePrintHtml(opts.clinicSubtitle)}</p>`
              : '<p class="ortus-brand-sub">Emitido pelo Sistema ORTUS</p>'
          }
        </div>
        <div class="ortus-meta-box">
          <div><strong>Emissão</strong><br/>${emitted}</div>
          ${opts.period ? `<div style="margin-top:8px"><strong>Período</strong><br/>${escapePrintHtml(opts.period)}</div>` : ''}
        </div>
      </div>

      <div class="ortus-doc-head">
        <h2 class="ortus-doc-title">${escapePrintHtml(opts.title)}</h2>
        ${opts.subtitle ? `<p class="ortus-doc-subtitle">${escapePrintHtml(opts.subtitle)}</p>` : ''}
        <span class="ortus-doc-accent">Confidencial · uso clínico</span>
      </div>

      ${metaHtml}
      ${kpiHtml}
      ${opts.bodyHtml}

      <div class="ortus-footer">
        ${escapePrintHtml(
          opts.footerNote ||
            'Documento gerado eletronicamente pelo Sistema ORTUS. Válido sem assinatura quando emitido pelo profissional responsável.',
        )}
      </div>
    </div>
  </div>
  ${autoPrintScript}
</body>
</html>`;
}

export function openPrintDocument(html: string, features = 'width=960,height=820'): Window | null {
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

export function printQaBlock(label: string, answer: string): string {
  return `<div class="ortus-q"><strong>${escapePrintHtml(label)}</strong><div class="r">${escapePrintHtml(answer) || '—'}</div></div>`;
}

export function printSignatureBlock(labels: string[] = ['Assinatura do profissional']): string {
  if (labels.length === 1) {
    return `<div class="ortus-signatures" style="grid-template-columns:1fr;max-width:260px;margin-left:auto;margin-right:auto;">
      <div class="ortus-sign-line">${escapePrintHtml(labels[0])}</div>
    </div>`;
  }
  return `<div class="ortus-signatures">${labels.map((l) => `<div class="ortus-sign-line">${escapePrintHtml(l)}</div>`).join('')}</div>`;
}

export function printTable(headers: string[], rows: string[][], options?: { numCols?: number[] }): string {
  const numSet = new Set(options?.numCols || []);
  const table = `<table class="ortus-table"><thead><tr>${headers.map((h) => `<th>${escapePrintHtml(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.length
      ? rows
          .map(
            (row) =>
              `<tr>${row.map((cell, i) => `<td class="${numSet.has(i) ? 'num' : ''}">${cell}</td>`).join('')}</tr>`,
          )
          .join('')
      : `<tr><td colspan="${headers.length}">Nenhum registro no período.</td></tr>`
  }</tbody></table>`;
  return `<div class="ortus-table-wrap">${table}</div>`;
}
