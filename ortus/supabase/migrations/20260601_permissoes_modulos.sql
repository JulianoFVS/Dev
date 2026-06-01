-- =====================================================================
-- Permissões Granulares por Módulo
-- =====================================================================

-- 1. Criar tabela de permissões de módulos
CREATE TABLE IF NOT EXISTS permissoes_modulos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id BIGINT REFERENCES profissionais(id) ON DELETE CASCADE,
    clinica_id BIGINT REFERENCES clinicas(id) ON DELETE CASCADE,
    modulo VARCHAR(30) NOT NULL CHECK (modulo IN ('agenda', 'configuracoes', 'controle_protese', 'estoque', 'ficha_paciente', 'financeiro', 'inteligencia', 'loja', 'marketing')),
    pode_acessar BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profissional_id, clinica_id, modulo)
);

-- Comentários
COMMENT ON TABLE permissoes_modulos IS 'Controle granular de acesso aos módulos do sistema por profissional e clínica';
COMMENT ON COLUMN permissoes_modulos.modulo IS 'Nome do módulo: agenda, configuracoes, controle_protese, estoque, ficha_paciente, financeiro, inteligencia, loja, marketing';

-- 2. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_permissoes_modulos_updated_at ON permissoes_modulos;
CREATE TRIGGER update_permissoes_modulos_updated_at
    BEFORE UPDATE ON permissoes_modulos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. RLS Policies
ALTER TABLE permissoes_modulos ENABLE ROW LEVEL SECURITY;

-- Select: usuário vê suas próprias permissões ou admin vê todas da clínica
DROP POLICY IF EXISTS permissoes_select ON permissoes_modulos;
CREATE POLICY permissoes_select ON permissoes_modulos
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profissionais p
            WHERE p.id = permissoes_modulos.profissional_id
            AND p.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM profissionais p
            JOIN profissionais_clinicas pc ON p.id = pc.profissional_id
            WHERE pc.clinica_id = permissoes_modulos.clinica_id
            AND p.user_id = auth.uid()
            AND p.nivel_acesso = 'admin'
        )
    );

-- Insert: apenas admins da clínica
DROP POLICY IF EXISTS permissoes_insert ON permissoes_modulos;
CREATE POLICY permissoes_insert ON permissoes_modulos
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profissionais p
            JOIN profissionais_clinicas pc ON p.id = pc.profissional_id
            WHERE pc.clinica_id = permissoes_modulos.clinica_id
            AND p.user_id = auth.uid()
            AND p.nivel_acesso = 'admin'
        )
    );

-- Update: apenas admins da clínica
DROP POLICY IF EXISTS permissoes_update ON permissoes_modulos;
CREATE POLICY permissoes_update ON permissoes_modulos
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profissionais p
            JOIN profissionais_clinicas pc ON p.id = pc.profissional_id
            WHERE pc.clinica_id = permissoes_modulos.clinica_id
            AND p.user_id = auth.uid()
            AND p.nivel_acesso = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profissionais p
            JOIN profissionais_clinicas pc ON p.id = pc.profissional_id
            WHERE pc.clinica_id = permissoes_modulos.clinica_id
            AND p.user_id = auth.uid()
            AND p.nivel_acesso = 'admin'
        )
    );

-- Delete: apenas admins da clínica
DROP POLICY IF EXISTS permissoes_delete ON permissoes_modulos;
CREATE POLICY permissoes_delete ON permissoes_modulos
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profissionais p
            JOIN profissionais_clinicas pc ON p.id = pc.profissional_id
            WHERE pc.clinica_id = permissoes_modulos.clinica_id
            AND p.user_id = auth.uid()
            AND p.nivel_acesso = 'admin'
        )
    );

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_permissoes_profissional ON permissoes_modulos(profissional_id);
CREATE INDEX IF NOT EXISTS idx_permissoes_clinica ON permissoes_modulos(clinica_id);

COMMIT;
