-- =====================================================================
-- ORTUS — Organização: lembretes, horários profissionais, recebimentos
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

-- Controle de migrations aplicadas pelo script local
CREATE TABLE IF NOT EXISTS ortus_schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Recebimentos / taxas em agendamentos (substitui lancamentos_meta JSON)
-- ---------------------------------------------------------------------
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor_bruto NUMERIC(12,2);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(12,2);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS taxa_id TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS taxa_nome TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS taxa_percentual NUMERIC(5,2);

COMMENT ON COLUMN agendamentos.valor_bruto IS 'Valor bruto no recebimento (antes da taxa da maquininha)';
COMMENT ON COLUMN agendamentos.valor_liquido IS 'Valor líquido creditado após taxa';

-- ---------------------------------------------------------------------
-- Lembretes de agenda (substitui lembretes_enviados em configuracoes_clinica)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lembretes_agenda (
    id BIGSERIAL PRIMARY KEY,
    agendamento_id BIGINT NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
    clinica_id BIGINT NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    canal VARCHAR(20) NOT NULL CHECK (canal IN ('whatsapp', 'email', 'sms', 'manual')),
    enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agendamento_id, canal)
);

CREATE INDEX IF NOT EXISTS idx_lembretes_agenda_clinica ON lembretes_agenda(clinica_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_agenda_agendamento ON lembretes_agenda(agendamento_id);

ALTER TABLE lembretes_agenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lembretes_agenda_all ON lembretes_agenda;
CREATE POLICY lembretes_agenda_all ON lembretes_agenda
    FOR ALL TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

-- ---------------------------------------------------------------------
-- Horários de atendimento por profissional (substitui JSON em config)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profissionais_horarios (
    id BIGSERIAL PRIMARY KEY,
    profissional_id BIGINT NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
    clinica_id BIGINT NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    inicio TIME NOT NULL DEFAULT '08:00',
    fim TIME NOT NULL DEFAULT '18:00',
    intervalo_minutos INT NOT NULL DEFAULT 30,
    limite_simultaneo INT NOT NULL DEFAULT 1,
    dias_semana JSONB NOT NULL DEFAULT '{"seg":true,"ter":true,"qua":true,"qui":true,"sex":true,"sab":false,"dom":false}'::jsonb,
    observacoes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (profissional_id, clinica_id)
);

CREATE INDEX IF NOT EXISTS idx_prof_horarios_clinica ON profissionais_horarios(clinica_id);

ALTER TABLE profissionais_horarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profissionais_horarios_all ON profissionais_horarios;
CREATE POLICY profissionais_horarios_all ON profissionais_horarios
    FOR ALL TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

-- ---------------------------------------------------------------------
-- Legado servicos
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'servicos') THEN
    COMMENT ON TABLE servicos IS 'DEPRECATED — usar tratamentos_base';
  END IF;
END $$;

INSERT INTO ortus_schema_migrations (id) VALUES ('20260729_lembretes_horarios_recebimento')
ON CONFLICT (id) DO NOTHING;

COMMIT;
