-- =====================================================================
-- Sistema de Comissões por Profissional
-- =====================================================================

-- 1. Criar tabela de regras de comissão
CREATE TABLE IF NOT EXISTS comissoes_regras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id BIGINT REFERENCES profissionais(id) ON DELETE CASCADE,
    clinica_id BIGINT REFERENCES clinicas(id) ON DELETE CASCADE,
    gatilho VARCHAR(30) NOT NULL CHECK (gatilho IN ('tratamento_finalizado', 'debito_recebido', 'orcamento_aprovado')),
    tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('percentual', 'valor_fixo')),
    valor DECIMAL(10,2) NOT NULL CHECK (valor >= 0),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários
COMMENT ON TABLE comissoes_regras IS 'Regras de comissão por profissional e clínica';
COMMENT ON COLUMN comissoes_regras.gatilho IS 'Momento de liberação: tratamento_finalizado, debito_recebido, orcamento_aprovado';
COMMENT ON COLUMN comissoes_regras.tipo IS 'Tipo de cálculo: percentual (%) ou valor_fixo (R$)';
COMMENT ON COLUMN comissoes_regras.valor IS 'Valor da comissão (percentual 0-100 ou valor em reais)';

-- 2. Criar tabela de lançamentos de comissão (histórico)
CREATE TABLE IF NOT EXISTS comissoes_lancamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id BIGINT REFERENCES profissionais(id) ON DELETE CASCADE,
    clinica_id BIGINT REFERENCES clinicas(id) ON DELETE CASCADE,
    paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    agendamento_id BIGINT REFERENCES agendamentos(id) ON DELETE SET NULL,
    regra_id UUID REFERENCES comissoes_regras(id) ON DELETE SET NULL,
    descricao TEXT,
    valor_base DECIMAL(10,2) NOT NULL, -- Valor sobre o qual calculou a comissão
    percentual_comissao DECIMAL(5,2), -- Percentual aplicado (se houver)
    valor_comissao DECIMAL(10,2) NOT NULL, -- Valor final da comissão
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
    data_pagamento DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE comissoes_lancamentos IS 'Histórico de comissões geradas e pagas';
COMMENT ON COLUMN comissoes_lancamentos.valor_base IS 'Valor recebido naquele pagamento/parcela (base do cálculo)';
COMMENT ON COLUMN comissoes_lancamentos.valor_comissao IS 'Valor final da comissão (proporcional ao recebido)';

-- 3. Triggers para updated_at
DROP TRIGGER IF EXISTS update_comissoes_regras_updated_at ON comissoes_regras;
CREATE TRIGGER update_comissoes_regras_updated_at
    BEFORE UPDATE ON comissoes_regras
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_comissoes_lancamentos_updated_at ON comissoes_lancamentos;
CREATE TRIGGER update_comissoes_lancamentos_updated_at
    BEFORE UPDATE ON comissoes_lancamentos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS Policies - Comissões Regras
ALTER TABLE comissoes_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissoes_regras_select ON comissoes_regras;
CREATE POLICY comissoes_regras_select ON comissoes_regras
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS comissoes_regras_insert ON comissoes_regras;
CREATE POLICY comissoes_regras_insert ON comissoes_regras
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS comissoes_regras_update ON comissoes_regras;
CREATE POLICY comissoes_regras_update ON comissoes_regras
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS comissoes_regras_delete ON comissoes_regras;
CREATE POLICY comissoes_regras_delete ON comissoes_regras
    FOR DELETE TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

-- 5. RLS Policies - Comissões Lançamentos
ALTER TABLE comissoes_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissoes_lancamentos_select ON comissoes_lancamentos;
CREATE POLICY comissoes_lancamentos_select ON comissoes_lancamentos
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS comissoes_lancamentos_insert ON comissoes_lancamentos;
CREATE POLICY comissoes_lancamentos_insert ON comissoes_lancamentos
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS comissoes_lancamentos_update ON comissoes_lancamentos;
CREATE POLICY comissoes_lancamentos_update ON comissoes_lancamentos
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

-- 6. Índices
CREATE INDEX IF NOT EXISTS idx_comissoes_regras_profissional ON comissoes_regras(profissional_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_regras_clinica ON comissoes_regras(clinica_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_lancamentos_profissional ON comissoes_lancamentos(profissional_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_lancamentos_status ON comissoes_lancamentos(status);

COMMIT;
