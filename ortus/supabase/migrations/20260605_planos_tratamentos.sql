-- =============================================================
-- Fase 4 - Gestão de Planos e Tabela TUSS
-- Catálogo de Especialidades, Tratamentos base e valores por plano
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS especialidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    nome VARCHAR(120) NOT NULL,
    descricao TEXT,
    ordem INT DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT especialidades_nome_unique UNIQUE (clinica_id, nome)
);

-- Garantir colunas obrigatórias quando a tabela já existia com outro esquema
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'especialidades') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'especialidades' AND column_name = 'clinica_id'
        ) THEN
            ALTER TABLE especialidades ADD COLUMN clinica_id BIGINT REFERENCES clinicas(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'especialidades' AND column_name = 'descricao'
        ) THEN
            ALTER TABLE especialidades ADD COLUMN descricao TEXT;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'especialidades' AND column_name = 'ordem'
        ) THEN
            ALTER TABLE especialidades ADD COLUMN ordem INT DEFAULT 0;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'especialidades' AND column_name = 'ativo'
        ) THEN
            ALTER TABLE especialidades ADD COLUMN ativo BOOLEAN DEFAULT TRUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'especialidades' AND column_name = 'created_at'
        ) THEN
            ALTER TABLE especialidades ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'especialidades' AND column_name = 'updated_at'
        ) THEN
            ALTER TABLE especialidades ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS tratamentos_base (
    id BIGSERIAL PRIMARY KEY,
    clinica_id BIGINT NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    especialidade_id UUID REFERENCES especialidades(id) ON DELETE SET NULL,
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    aceita_faces BOOLEAN DEFAULT FALSE,
    valor_sugerido NUMERIC(12,2),
    custo_padrao NUMERIC(12,2),
    codigo_tuss_padrao VARCHAR(30),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT tratamentos_base_nome_unique UNIQUE (clinica_id, nome)
);

ALTER TABLE tratamentos_base
    ADD COLUMN IF NOT EXISTS custo_padrao NUMERIC(12,2);

CREATE TABLE IF NOT EXISTS planos_tratamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    plano_id UUID NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    tratamento_id BIGINT NOT NULL REFERENCES tratamentos_base(id) ON DELETE CASCADE,
    valor NUMERIC(12,2),
    custo NUMERIC(12,2),
    codigo_tuss VARCHAR(30),
    aceita_faces BOOLEAN DEFAULT FALSE,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT planos_tratamentos_unique UNIQUE (plano_id, tratamento_id)
);

-- Índices para filtros principais
CREATE INDEX IF NOT EXISTS idx_especialidades_clinica ON especialidades(clinica_id);
CREATE INDEX IF NOT EXISTS idx_tratamentos_base_clinica ON tratamentos_base(clinica_id);
CREATE INDEX IF NOT EXISTS idx_tratamentos_base_especialidade ON tratamentos_base(especialidade_id);
CREATE INDEX IF NOT EXISTS idx_planos_tratamentos_plano ON planos_tratamentos(plano_id);
CREATE INDEX IF NOT EXISTS idx_planos_tratamentos_tratamento ON planos_tratamentos(tratamento_id);

-- Triggers de updated_at (reutiliza função global se já existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_especialidades_updated ON especialidades;
CREATE TRIGGER tg_especialidades_updated
    BEFORE UPDATE ON especialidades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tg_tratamentos_base_updated ON tratamentos_base;
CREATE TRIGGER tg_tratamentos_base_updated
    BEFORE UPDATE ON tratamentos_base
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tg_planos_tratamentos_updated ON planos_tratamentos;
CREATE TRIGGER tg_planos_tratamentos_updated
    BEFORE UPDATE ON planos_tratamentos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE especialidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE tratamentos_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE planos_tratamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS especialidades_select ON especialidades;
CREATE POLICY especialidades_select ON especialidades
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS especialidades_insert ON especialidades;
CREATE POLICY especialidades_insert ON especialidades
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS especialidades_update ON especialidades;
CREATE POLICY especialidades_update ON especialidades
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS especialidades_delete ON especialidades;
CREATE POLICY especialidades_delete ON especialidades
    FOR DELETE TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS tratamentos_base_select ON tratamentos_base;
CREATE POLICY tratamentos_base_select ON tratamentos_base
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS tratamentos_base_insert ON tratamentos_base;
CREATE POLICY tratamentos_base_insert ON tratamentos_base
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS tratamentos_base_update ON tratamentos_base;
CREATE POLICY tratamentos_base_update ON tratamentos_base
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS tratamentos_base_delete ON tratamentos_base;
CREATE POLICY tratamentos_base_delete ON tratamentos_base
    FOR DELETE TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS planos_tratamentos_select ON planos_tratamentos;
CREATE POLICY planos_tratamentos_select ON planos_tratamentos
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS planos_tratamentos_insert ON planos_tratamentos;
CREATE POLICY planos_tratamentos_insert ON planos_tratamentos
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS planos_tratamentos_update ON planos_tratamentos;
CREATE POLICY planos_tratamentos_update ON planos_tratamentos
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS planos_tratamentos_delete ON planos_tratamentos;
CREATE POLICY planos_tratamentos_delete ON planos_tratamentos
    FOR DELETE TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

COMMIT;
