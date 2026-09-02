import { create } from 'zustand';
import { ODONTO_TOOLS } from '@/lib/odontogram/constants';
import type {
  LegacyToothState,
  OdontoFace,
  OdontoFaceStatus,
  OdontoTooth,
  OdontoToothStatus,
} from '@/lib/odontogram/types';

function createEmptyTooth(): OdontoTooth {
  return { status: 'normal', faces: {} };
}

function isEmptyTooth(tooth: OdontoTooth): boolean {
  return tooth.status === 'normal' && Object.keys(tooth.faces).length === 0;
}

function legacyToTooth(data: LegacyToothState): OdontoTooth {
  return {
    status: data.cond ?? 'normal',
    faces: { ...(data.faces ?? {}) },
  };
}

function toothToLegacy(tooth: OdontoTooth): LegacyToothState {
  return {
    cond: tooth.status,
    faces: { ...tooth.faces },
  };
}

interface OdontogramStore {
  teeth: Record<number, OdontoTooth>;
  activeTool: string;

  loadFromLegacy: (data: Record<string, LegacyToothState>) => void;
  getLegacySnapshot: () => Record<string, LegacyToothState>;
  resetAll: () => void;

  setActiveTool: (tool: string) => void;
  setToothStatus: (toothId: number, status: OdontoToothStatus) => void;
  toggleToothFace: (toothId: number, face: OdontoFace) => void;
  resetTooth: (toothId: number) => void;
  applyTool: (toothId: number, face?: OdontoFace | null) => void;
}

export const useOdontogramStore = create<OdontogramStore>((set, get) => ({
  teeth: {},
  activeTool: 'carie',

  loadFromLegacy: (data) => {
    const teeth: Record<number, OdontoTooth> = {};
    Object.entries(data || {}).forEach(([id, value]) => {
      const num = Number(id);
      if (!Number.isFinite(num) || !value) return;
      teeth[num] = legacyToTooth(value);
    });
    set({ teeth });
  },

  getLegacySnapshot: () => {
    const snapshot: Record<string, LegacyToothState> = {};
    Object.entries(get().teeth).forEach(([id, tooth]) => {
      snapshot[id] = toothToLegacy(tooth);
    });
    return snapshot;
  },

  resetAll: () => set({ teeth: {} }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setToothStatus: (toothId, status) => {
    set((state) => {
      const current = state.teeth[toothId] ?? createEmptyTooth();
      const updated: OdontoTooth = { ...current, status };
      const next = { ...state.teeth };
      if (isEmptyTooth(updated)) delete next[toothId];
      else next[toothId] = updated;
      return { teeth: next };
    });
  },

  toggleToothFace: (toothId, face) => {
    set((state) => {
      const current = state.teeth[toothId] ?? createEmptyTooth();
      const faces = { ...current.faces };
      const tool = ODONTO_TOOLS.find((t) => t.key === state.activeTool);

      if (faces[face]) {
        delete faces[face];
      } else if (tool?.tipo === 'face' && tool.key !== 'higido') {
        faces[face] = tool.key as OdontoFaceStatus;
      } else {
        faces[face] = 'carie';
      }

      const updated: OdontoTooth = { ...current, faces };
      const next = { ...state.teeth };
      if (isEmptyTooth(updated)) delete next[toothId];
      else next[toothId] = updated;
      return { teeth: next };
    });
  },

  resetTooth: (toothId) => {
    set((state) => {
      const next = { ...state.teeth };
      delete next[toothId];
      return { teeth: next };
    });
  },

  applyTool: (toothId, face = null) => {
    const tool = ODONTO_TOOLS.find((t) => t.key === get().activeTool);
    if (!tool) return;

    set((state) => {
      const current = state.teeth[toothId] ?? createEmptyTooth();
      let updated: OdontoTooth;

      if (tool.tipo === 'face' && face) {
        const faces = { ...current.faces };
        if (current.faces[face] === tool.key || tool.key === 'higido') {
          delete faces[face];
        } else {
          faces[face] = tool.key as OdontoFaceStatus;
        }
        updated = { ...current, faces };
      } else if (tool.tipo === 'cond') {
        updated = {
          ...current,
          status: current.status === tool.key ? 'normal' : (tool.key as OdontoToothStatus),
        };
      } else if (tool.tipo === 'face') {
        const isAlready =
          Object.values(current.faces).every((v) => v === tool.key) &&
          Object.keys(current.faces).length > 0;

        if (isAlready || tool.key === 'higido') {
          updated = { ...current, faces: {} };
        } else {
          updated = {
            ...current,
            faces: {
              V: tool.key as OdontoFaceStatus,
              M: tool.key as OdontoFaceStatus,
              D: tool.key as OdontoFaceStatus,
              L: tool.key as OdontoFaceStatus,
              O: tool.key as OdontoFaceStatus,
            },
          };
        }
      } else {
        return state;
      }

      const next = { ...state.teeth };
      if (isEmptyTooth(updated)) delete next[toothId];
      else next[toothId] = updated;
      return { teeth: next };
    });
  },
}));

/** Converte o estado do store para o formato usado pelos componentes 2D legados. */
export function selectLegacyOdontogram(
  teeth: Record<number, OdontoTooth>,
): Record<string, LegacyToothState> {
  const out: Record<string, LegacyToothState> = {};
  Object.entries(teeth).forEach(([id, tooth]) => {
    out[id] = toothToLegacy(tooth);
  });
  return out;
}
