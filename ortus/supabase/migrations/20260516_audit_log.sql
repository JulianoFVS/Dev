-- ============================================
-- AUDIT LOG — Registro de acessos e modificações em dados pessoais
-- Exigência LGPD: rastreabilidade de quem acessou/modificou dados
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id),
    profissional_nome TEXT,
    acao TEXT NOT NULL,           -- 'visualizou', 'editou', 'excluiu', 'exportou', 'login', 'logout'
    entidade TEXT NOT NULL,       -- 'paciente', 'agendamento', 'profissional', 'backup', etc.
    entidade_id TEXT,             -- ID do registro afetado
    detalhes JSONB,              -- Informações extras (campos alterados, etc.)
    ip TEXT,
    user_agent TEXT
);

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_audit_log_criado ON audit_log (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entidade ON audit_log (entidade, entidade_id);

-- RLS: apenas super_admin pode ler os logs
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_insert_authenticated" ON audit_log
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "audit_log_select_super_admin" ON audit_log
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profissionais
            WHERE profissionais.user_id = auth.uid()
            AND profissionais.is_super_admin = true
        )
    );

-- Coluna de soft-delete na tabela profissionais (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profissionais' AND column_name = 'exclusao_solicitada_em') THEN
        ALTER TABLE profissionais ADD COLUMN exclusao_solicitada_em TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profissionais' AND column_name = 'ativo') THEN
        ALTER TABLE profissionais ADD COLUMN ativo BOOLEAN DEFAULT true;
    END IF;
END $$;
