-- =====================================================================
-- Fase 2 — Prontuário relacional (tratamentos, anamneses, documentos, evoluções)
-- Migra dados de pacientes.ficha_medica JSON → tabelas
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS paciente_tratamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    clinica_id BIGINT REFERENCES clinicas(id) ON DELETE SET NULL,
    legacy_id TEXT,
    procedimento TEXT NOT NULL,
    dente TEXT,
    valor NUMERIC(12,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planejado',
    data DATE,
    observacoes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (paciente_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS paciente_anamneses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    legacy_id TEXT,
    modelo_id TEXT,
    modelo_nome TEXT,
    data DATE,
    preenchido_por TEXT DEFAULT 'profissional',
    respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
    perguntas_snapshot JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (paciente_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS paciente_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    legacy_id TEXT,
    nome TEXT NOT NULL,
    tipo TEXT,
    storage_path TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (paciente_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS paciente_evolucoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    legacy_id TEXT,
    texto TEXT NOT NULL,
    data DATE,
    profissional_nome TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (paciente_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_pac_trat_paciente ON paciente_tratamentos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_pac_anam_paciente ON paciente_anamneses(paciente_id);
CREATE INDEX IF NOT EXISTS idx_pac_doc_paciente ON paciente_documentos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_pac_evo_paciente ON paciente_evolucoes(paciente_id);

-- RLS
ALTER TABLE paciente_tratamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE paciente_anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE paciente_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE paciente_evolucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pac_trat_all ON paciente_tratamentos;
CREATE POLICY pac_trat_all ON paciente_tratamentos FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_id AND public.user_has_clinic_access(p.clinica_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_id AND public.user_has_clinic_access(p.clinica_id)));

DROP POLICY IF EXISTS pac_anam_all ON paciente_anamneses;
CREATE POLICY pac_anam_all ON paciente_anamneses FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_id AND public.user_has_clinic_access(p.clinica_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_id AND public.user_has_clinic_access(p.clinica_id)));

DROP POLICY IF EXISTS pac_doc_all ON paciente_documentos;
CREATE POLICY pac_doc_all ON paciente_documentos FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_id AND public.user_has_clinic_access(p.clinica_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_id AND public.user_has_clinic_access(p.clinica_id)));

DROP POLICY IF EXISTS pac_evo_all ON paciente_evolucoes;
CREATE POLICY pac_evo_all ON paciente_evolucoes FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_id AND public.user_has_clinic_access(p.clinica_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_id AND public.user_has_clinic_access(p.clinica_id)));

-- ---------------------------------------------------------------------
-- Migrar JSON legado (idempotente)
-- ---------------------------------------------------------------------
INSERT INTO paciente_tratamentos (paciente_id, clinica_id, legacy_id, procedimento, dente, valor, status, data, observacoes, criado_em)
SELECT
    p.id,
    p.clinica_id,
    t->>'id',
    COALESCE(NULLIF(trim(t->>'procedimento'), ''), 'Procedimento'),
    NULLIF(t->>'dente', ''),
    COALESCE(NULLIF(t->>'valor', '')::numeric, 0),
    COALESCE(NULLIF(t->>'status', ''), 'planejado'),
    NULLIF(t->>'data', '')::date,
    NULLIF(t->>'observacoes', ''),
    COALESCE(NULLIF(t->>'criado_em', '')::timestamptz, NOW())
FROM pacientes p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.ficha_medica->'tratamentos', '[]'::jsonb)) AS t
WHERE jsonb_array_length(COALESCE(p.ficha_medica->'tratamentos', '[]'::jsonb)) > 0
ON CONFLICT (paciente_id, legacy_id) DO NOTHING;

INSERT INTO paciente_anamneses (paciente_id, legacy_id, modelo_id, modelo_nome, data, preenchido_por, respostas, perguntas_snapshot, criado_em)
SELECT
    p.id,
    a->>'id',
    a->>'modelo_id',
    a->>'modelo_nome',
    NULLIF(a->>'data', '')::date,
    COALESCE(NULLIF(a->>'preenchido_por', ''), 'profissional'),
    COALESCE(a->'respostas', '{}'::jsonb),
    a->'perguntas_snapshot',
    COALESCE(NULLIF(a->>'criado_em', '')::timestamptz, NOW())
FROM pacientes p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.ficha_medica->'anamneses', '[]'::jsonb)) AS a
WHERE jsonb_array_length(COALESCE(p.ficha_medica->'anamneses', '[]'::jsonb)) > 0
ON CONFLICT (paciente_id, legacy_id) DO NOTHING;

INSERT INTO paciente_documentos (paciente_id, legacy_id, nome, tipo, storage_path, meta, criado_em)
SELECT
    p.id,
    d->>'id',
    COALESCE(NULLIF(trim(d->>'nome'), ''), 'Documento'),
    NULLIF(d->>'tipo', ''),
    COALESCE(NULLIF(d->>'storage_path', ''), NULLIF(d->>'storagePath', '')),
    jsonb_strip_nulls(jsonb_build_object(
        'isImg', d->'isImg',
        'dataUrl', d->'dataUrl',
        'tamanho', d->'tamanho'
    )),
    COALESCE(NULLIF(d->>'criado_em', '')::timestamptz, NOW())
FROM pacientes p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.ficha_medica->'documentos', '[]'::jsonb)) AS d
WHERE jsonb_array_length(COALESCE(p.ficha_medica->'documentos', '[]'::jsonb)) > 0
ON CONFLICT (paciente_id, legacy_id) DO NOTHING;

INSERT INTO paciente_evolucoes (paciente_id, legacy_id, texto, data, profissional_nome, criado_em)
SELECT
    p.id,
    e->>'id',
    COALESCE(NULLIF(trim(e->>'texto'), ''), '-'),
    NULLIF(e->>'data', '')::date,
    NULLIF(COALESCE(e->>'profissional', e->>'profissional_nome'), ''),
    COALESCE(NULLIF(e->>'criado_em', '')::timestamptz, NOW())
FROM pacientes p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.ficha_medica->'evolucoes', '[]'::jsonb)) AS e
WHERE jsonb_array_length(COALESCE(p.ficha_medica->'evolucoes', '[]'::jsonb)) > 0
ON CONFLICT (paciente_id, legacy_id) DO NOTHING;

-- Slim ficha_medica: mantém só dados clínicos gráficos
UPDATE pacientes
SET ficha_medica = (
    COALESCE(ficha_medica, '{}'::jsonb)
    - 'tratamentos'
    - 'anamneses'
    - 'documentos'
    - 'evolucoes'
)
WHERE ficha_medica IS NOT NULL
  AND (
    ficha_medica ? 'tratamentos'
    OR ficha_medica ? 'anamneses'
    OR ficha_medica ? 'documentos'
    OR ficha_medica ? 'evolucoes'
  );

INSERT INTO ortus_schema_migrations (id) VALUES ('20260730_ficha_relacional')
ON CONFLICT (id) DO NOTHING;

COMMIT;
