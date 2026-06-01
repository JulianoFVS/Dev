-- =====================================================================
-- Cadastro Completo de Pacientes: Endereço detalhado, Plano/Convênio, Responsável
-- =====================================================================

-- 1. Criar tabela de Planos/Convênios
CREATE TABLE IF NOT EXISTS planos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT REFERENCES clinicas(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) DEFAULT 'particular' CHECK (tipo IN ('particular', 'convenio', 'sus')),
    ativo BOOLEAN DEFAULT true,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar plano padrão "Particular" para todas as clínicas existentes
INSERT INTO planos (clinica_id, nome, tipo, ativo)
SELECT id, 'Particular', 'particular', true FROM clinicas
WHERE NOT EXISTS (SELECT 1 FROM planos WHERE planos.clinica_id = clinicas.id AND planos.tipo = 'particular');

-- Comentários
COMMENT ON TABLE planos IS 'Cadastro de planos de saúde e convênios aceitos pela clínica';
COMMENT ON COLUMN planos.tipo IS 'Tipo: particular (sem convênio), convenio (plano de saúde), sus';

-- 2. Adicionar colunas de endereço detalhado na tabela pacientes
ALTER TABLE pacientes
    ADD COLUMN IF NOT EXISTS sexo VARCHAR(10) CHECK (sexo IN ('masculino', 'feminino', 'outro', 'nao_informar')),
    ADD COLUMN IF NOT EXISTS cep VARCHAR(9),
    ADD COLUMN IF NOT EXISTS rua VARCHAR(255),
    ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
    ADD COLUMN IF NOT EXISTS complemento VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bairro VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cidade VARCHAR(100),
    ADD COLUMN IF NOT EXISTS uf VARCHAR(2),
    ADD COLUMN IF NOT EXISTS plano_id UUID REFERENCES planos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(150),
    ADD COLUMN IF NOT EXISTS responsavel_parentesco VARCHAR(50),
    ADD COLUMN IF NOT EXISTS responsavel_telefone VARCHAR(20);

-- Comentários das novas colunas
COMMENT ON COLUMN pacientes.sexo IS 'Sexo biológico ou identidade de gênero do paciente';
COMMENT ON COLUMN pacientes.cep IS 'CEP do endereço (formato: 00000-000)';
COMMENT ON COLUMN pacientes.rua IS 'Logradouro (rua, avenida, alameda, etc.)';
COMMENT ON COLUMN pacientes.numero IS 'Número do endereço';
COMMENT ON COLUMN pacientes.complemento IS 'Apartamento, bloco, sala, etc.';
COMMENT ON COLUMN pacientes.bairro IS 'Bairro do endereço';
COMMENT ON COLUMN pacientes.cidade IS 'Cidade do endereço';
COMMENT ON COLUMN pacientes.uf IS 'Unidade Federativa (estado)';
COMMENT ON COLUMN pacientes.plano_id IS 'Plano de saúde/convênio do paciente (FK para planos)';
COMMENT ON COLUMN pacientes.responsavel_nome IS 'Nome do responsável (quando paciente for menor de idade)';
COMMENT ON COLUMN pacientes.responsavel_parentesco IS 'Grau de parentesco do responsável (pai, mãe, tutor, etc.)';
COMMENT ON COLUMN pacientes.responsavel_telefone IS 'Telefone do responsável';

-- 3. Atualizar RLS da tabela planos
ALTER TABLE planos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planos_select ON planos;
CREATE POLICY planos_select ON planos
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS planos_insert ON planos;
CREATE POLICY planos_insert ON planos
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS planos_update ON planos;
CREATE POLICY planos_update ON planos
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS planos_delete ON planos;
CREATE POLICY planos_delete ON planos
    FOR DELETE TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

-- 4. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_pacientes_plano_id ON pacientes(plano_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_cep ON pacientes(cep);
CREATE INDEX IF NOT EXISTS idx_planoss_clinica_id ON planos(clinica_id);

-- 5. Trigger para atualizar updated_at em planos
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_planoss_updated_at ON planos;
CREATE TRIGGER update_planoss_updated_at
    BEFORE UPDATE ON planos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
