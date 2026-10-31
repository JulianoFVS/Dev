-- =====================================================================
-- ORTUS — WhatsApp: mensagens agendadas e histórico de envios automáticos
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

-- Usado pela automação de confirmação (só agendamentos criados depois de ligar a automação).
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ---------------------------------------------------------------------
-- Mensagens agendadas manualmente pela clínica
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_agendadas (
    id BIGSERIAL PRIMARY KEY,
    clinica_id BIGINT NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    nome TEXT,
    telefone VARCHAR(20) NOT NULL,
    texto TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 4000),
    enviar_em TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviando', 'enviada', 'falha', 'cancelada')),
    erro TEXT,
    enviada_em TIMESTAMPTZ,
    criado_por UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_agendadas_fila ON whatsapp_agendadas(clinica_id, status, enviar_em);

ALTER TABLE whatsapp_agendadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_agendadas_all ON whatsapp_agendadas;
CREATE POLICY whatsapp_agendadas_all ON whatsapp_agendadas
    FOR ALL TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

-- ---------------------------------------------------------------------
-- Histórico de envios automáticos. A chave impede mandar a mesma
-- automação duas vezes (ex.: lembrete:123, aniversario:<paciente>:2026).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_envios (
    id BIGSERIAL PRIMARY KEY,
    clinica_id BIGINT NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    chave TEXT NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    nome TEXT,
    telefone VARCHAR(20),
    texto TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'enviando' CHECK (status IN ('enviando', 'enviada', 'falha')),
    erro TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (clinica_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_clinica ON whatsapp_envios(clinica_id, created_at DESC);

ALTER TABLE whatsapp_envios ENABLE ROW LEVEL SECURITY;

-- Escrita só pelo serviço do WhatsApp (service role); a equipe só consulta.
DROP POLICY IF EXISTS whatsapp_envios_select ON whatsapp_envios;
CREATE POLICY whatsapp_envios_select ON whatsapp_envios
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

INSERT INTO ortus_schema_migrations (id) VALUES ('20261031_whatsapp')
ON CONFLICT (id) DO NOTHING;

COMMIT;
