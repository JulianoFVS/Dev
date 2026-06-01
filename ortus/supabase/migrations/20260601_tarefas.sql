-- =====================================================================
-- Módulo de Tarefas/Kanban
-- =====================================================================

-- 1. Criar tabela de tarefas
CREATE TABLE IF NOT EXISTS tarefas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT REFERENCES clinicas(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    responsavel_id BIGINT REFERENCES profissionais(id) ON DELETE SET NULL,
    prioridade VARCHAR(10) DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
    status VARCHAR(15) DEFAULT 'a_fazer' CHECK (status IN ('a_fazer', 'em_andamento', 'concluido')),
    data_limite DATE,
    paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários
COMMENT ON TABLE tarefas IS 'Tarefas da clínica com sistema Kanban';
COMMENT ON COLUMN tarefas.prioridade IS 'baixa, media ou alta';
COMMENT ON COLUMN tarefas.status IS 'a_fazer, em_andamento, concluido';
COMMENT ON COLUMN tarefas.paciente_id IS 'Vinculo opcional a um paciente específico';

-- 2. Trigger para updated_at
DROP TRIGGER IF EXISTS update_tarefas_updated_at ON tarefas;
CREATE TRIGGER update_tarefas_updated_at
    BEFORE UPDATE ON tarefas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. RLS Policies
ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tarefas_select ON tarefas;
CREATE POLICY tarefas_select ON tarefas
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS tarefas_insert ON tarefas;
CREATE POLICY tarefas_insert ON tarefas
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS tarefas_update ON tarefas;
CREATE POLICY tarefas_update ON tarefas
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS tarefas_delete ON tarefas;
CREATE POLICY tarefas_delete ON tarefas
    FOR DELETE TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_tarefas_clinica ON tarefas(clinica_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel ON tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_status ON tarefas(status);
CREATE INDEX IF NOT EXISTS idx_tarefas_data_limite ON tarefas(data_limite);

-- 5. View para tarefas com dados relacionados (útil para a lista)
-- SECURITY INVOKER garante que as RLS policies do usuário que consulta sejam respeitadas
CREATE OR REPLACE VIEW v_tarefas_completo
WITH (security_invoker = true)
AS
SELECT 
    t.*,
    p.nome as responsavel_nome,
    p.user_id as responsavel_user_id,
    pa.nome as paciente_nome,
    pa.telefone as paciente_telefone,
    CASE 
        WHEN t.data_limite < CURRENT_DATE AND t.status != 'concluido' THEN 'atrasada'
        WHEN t.data_limite <= CURRENT_DATE + INTERVAL '3 days' AND t.status != 'concluido' THEN 'proxima'
        ELSE 'normal'
    END as alerta_data
FROM tarefas t
LEFT JOIN profissionais p ON t.responsavel_id = p.id
LEFT JOIN pacientes pa ON t.paciente_id = pa.id;

COMMIT;
