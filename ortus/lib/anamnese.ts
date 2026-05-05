// Helper para gerenciar Modelos de Anamnese (persistencia em localStorage)

export type TipoPergunta = "texto" | "sim_nao" | "multipla";

export interface PerguntaAnamnese {
  id: string;
  label: string;
  tipo: TipoPergunta;
  opcoes?: string[];
}

export interface ModeloAnamnese {
  id: string;
  nome: string;
  descricao?: string;
  perguntas: PerguntaAnamnese[];
  padrao?: boolean;
}

const STORAGE_KEY = "ortus_anamnese_modelos";

export const MODELOS_PADRAO: ModeloAnamnese[] = [
  {
    id: "geral",
    nome: "Anamnese Odontologica Geral",
    descricao: "Modelo padrao para primeira consulta.",
    padrao: true,
    perguntas: [
      { id: "q1", label: "Queixa principal", tipo: "texto" },
      { id: "q2", label: "Possui alguma doenca sistemica? (diabetes, hipertensao, etc)", tipo: "texto" },
      { id: "q3", label: "Faz uso continuo de medicamentos? Quais?", tipo: "texto" },
      { id: "q4", label: "Possui alergia a algum medicamento?", tipo: "texto" },
      { id: "q5", label: "Esta gestante?", tipo: "sim_nao" },
      { id: "q6", label: "Fuma?", tipo: "sim_nao" },
      { id: "q7", label: "Faz uso de bebida alcoolica?", tipo: "sim_nao" },
      { id: "q8", label: "Ja teve alguma reacao a anestesico?", tipo: "sim_nao" },
      { id: "q9", label: "Pressao arterial atual", tipo: "texto" },
      { id: "q10", label: "Historico de tratamentos odontologicos anteriores", tipo: "texto" }
    ]
  },
  {
    id: "pediatrica",
    nome: "Anamnese Pediatrica",
    descricao: "Modelo para criancas ate 12 anos.",
    padrao: true,
    perguntas: [
      { id: "q1", label: "Idade da primeira visita ao dentista", tipo: "texto" },
      { id: "q2", label: "Possui habitos (chupar dedo, mamadeira, chupeta)?", tipo: "texto" },
      { id: "q3", label: "Qual a frequencia de escovacao diaria?", tipo: "texto" },
      { id: "q4", label: "Faz uso de fluor?", tipo: "sim_nao" },
      { id: "q5", label: "Ja teve carie?", tipo: "sim_nao" },
      { id: "q6", label: "Possui alguma alergia?", tipo: "texto" },
      { id: "q7", label: "Acompanhamento medico atual", tipo: "texto" },
      { id: "q8", label: "Comportamento da crianca", tipo: "multipla", opcoes: ["Tranquilo", "Ansioso", "Agitado", "Cooperativo"] }
    ]
  },
  {
    id: "ortodontica",
    nome: "Anamnese Ortodontica",
    descricao: "Avaliacao para tratamento ortodontico.",
    padrao: true,
    perguntas: [
      { id: "q1", label: "Ja fez tratamento ortodontico antes?", tipo: "sim_nao" },
      { id: "q2", label: "Tem dificuldade para mastigar?", tipo: "sim_nao" },
      { id: "q3", label: "Sente dor na ATM?", tipo: "sim_nao" },
      { id: "q4", label: "Tem habito de ranger os dentes (bruxismo)?", tipo: "sim_nao" },
      { id: "q5", label: "Respira pela boca?", tipo: "sim_nao" },
      { id: "q6", label: "Possui historico familiar de problemas ortodonticos?", tipo: "texto" },
      { id: "q7", label: "Objetivo principal do tratamento", tipo: "texto" }
    ]
  }
];

export function carregarModelos(): ModeloAnamnese[] {
  if (typeof window === "undefined") return MODELOS_PADRAO;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ModeloAnamnese[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  localStorage.setItem(STORAGE_KEY, JSON.stringify(MODELOS_PADRAO));
  return MODELOS_PADRAO;
}

export function salvarModelos(modelos: ModeloAnamnese[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(modelos));
}

export function novoIdModelo(): string {
  return "m_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

export function novoIdPergunta(): string {
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}
