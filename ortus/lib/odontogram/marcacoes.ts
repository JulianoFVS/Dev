import { FACE_LABELS, ODONTO_TOOLS } from '@/lib/odontogram/constants';
import type { LegacyToothState, OdontoFace, OdontoFaceStatus } from '@/lib/odontogram/types';

export type MarcacaoDente = {
  num: number;
  cond: string;
  faces: Array<{ face: OdontoFace; status: OdontoFaceStatus }>;
  precisaTratamento: boolean;
  sugestao: string | null;
  resumo: string;
};

const FACE_STATUS_LABEL: Record<string, string> = {
  higido: 'hígido',
  carie: 'cárie',
  restaurado: 'restauração',
  tratado: 'tratado',
};

export function labelCondicao(key: string): string {
  return ODONTO_TOOLS.find((t) => t.key === key)?.label || key;
}

export function dentePrecisaTratamento(st: LegacyToothState): boolean {
  if (st.cond === 'extracao' || st.cond === 'coroa' || st.cond === 'implante') return true;
  return Object.values(st.faces || {}).some((v) => v === 'carie');
}

export function sugestaoProcedimento(st: LegacyToothState): string | null {
  if (st.cond === 'extracao') return 'Extração';
  if (st.cond === 'coroa') return 'Coroa';
  if (st.cond === 'implante') return 'Implante';
  if (Object.values(st.faces || {}).some((v) => v === 'carie')) return 'Restauração';
  return null;
}

export function resumoMarcacao(st: LegacyToothState): string {
  const partes: string[] = [];
  if (st.cond && st.cond !== 'normal') partes.push(labelCondicao(st.cond));
  const faces = Object.entries(st.faces || {})
    .filter(([, v]) => v && v !== 'higido')
    .map(([f, v]) => `${FACE_LABELS[f as OdontoFace] || f}: ${FACE_STATUS_LABEL[v as string] || v}`);
  if (faces.length) partes.push(faces.join(', '));
  return partes.join(' · ') || 'Marcado';
}

export function listarMarcacoesOdontograma(
  odontograma: Record<string, LegacyToothState>,
): MarcacaoDente[] {
  return Object.entries(odontograma)
    .map(([id, st]) => {
      const num = Number(id);
      const faces = Object.entries(st.faces || {})
        .filter(([, v]) => v && v !== 'higido')
        .map(([face, status]) => ({ face: face as OdontoFace, status: status as OdontoFaceStatus }));
      return {
        num,
        cond: st.cond || 'normal',
        faces,
        precisaTratamento: dentePrecisaTratamento(st),
        sugestao: sugestaoProcedimento(st),
        resumo: resumoMarcacao(st),
      };
    })
    .filter((m) => Number.isFinite(m.num) && (m.cond !== 'normal' || m.faces.length > 0))
    .sort((a, b) => a.num - b.num);
}

export function sugestaoUnica(marcacoes: MarcacaoDente[]): string {
  const sugestoes = [...new Set(marcacoes.map((m) => m.sugestao).filter(Boolean))] as string[];
  return sugestoes.length === 1 ? sugestoes[0] : '';
}

const OBS_MARK = '[Odontograma]';

export function blocoObservacaoOdontograma(marcacoes: MarcacaoDente[]): string {
  if (marcacoes.length === 0) return '';
  const linhas = marcacoes.map((m) => `#${m.num} — ${m.resumo}`);
  return `${OBS_MARK}\n${linhas.join('\n')}`;
}

export function mesclarObservacaoOdontograma(atual: string, marcacoes: MarcacaoDente[]): string {
  const bloco = blocoObservacaoOdontograma(marcacoes);
  const src = atual || '';
  const idx = src.indexOf(OBS_MARK);
  const semBloco = (idx >= 0 ? src.slice(0, idx) : src).trim();
  if (!bloco) return semBloco;
  return semBloco ? `${semBloco}\n\n${bloco}` : bloco;
}

export function parseDentesCampo(valor: string): number[] {
  return (valor || '')
    .split(/[,;\s]+/)
    .map((s) => Number(s.replace(/#/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function aplicarTratamentoNoSnapshot(
  snap: Record<string, LegacyToothState>,
  dentes: number[],
): { next: Record<string, LegacyToothState>; changed: boolean } {
  const next = { ...snap };
  let changed = false;
  for (const n of dentes) {
    const key = String(n);
    const st = next[key];
    if (!st) continue;
    const faces = { ...(st.faces || {}) };
    let local = false;
    if (st.cond === 'extracao') {
      next[key] = { ...st, cond: 'ausente', faces };
      local = true;
    }
    for (const [f, v] of Object.entries(faces)) {
      if (v === 'carie') {
        faces[f as OdontoFace] = 'tratado';
        local = true;
      }
    }
    if (local) {
      next[key] = { ...(next[key] || st), faces };
      changed = true;
    }
  }
  return { next, changed };
}
