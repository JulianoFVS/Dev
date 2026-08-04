-- Alterações PDF 03.08

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS tipo_registro VARCHAR(30) DEFAULT 'agenda';
COMMENT ON COLUMN agendamentos.tipo_registro IS 'agenda | debito_manual';

ALTER TABLE paciente_anamneses ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS paciente_debitos (
  id BIGSERIAL PRIMARY KEY,
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  clinica_id BIGINT REFERENCES clinicas(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  agendamento_id BIGINT REFERENCES agendamentos(id) ON DELETE SET NULL,
  tratamento_id UUID REFERENCES paciente_tratamentos(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  data_pagamento TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paciente_debitos_paciente ON paciente_debitos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_paciente_debitos_status ON paciente_debitos(paciente_id, status);

CREATE TABLE IF NOT EXISTS anamnese_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  clinica_id BIGINT,
  modelo_id TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anamnese_links_token ON anamnese_links(token_hash);
