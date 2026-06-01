-- =====================================================================
-- Correção de Segurança: Remover user_metadata das RLS de pacientes
-- =====================================================================

-- A política antiga "Usuários pertencentes a clínica podem ver seus pacientes"
-- usava user_metadata que é editável pelo usuário (inseguro).
-- Esta migration substitui por verificação via profissionais_clinicas.

-- 1. Dropar políticas antigas que usam user_metadata (INSEGURO)
DROP POLICY IF EXISTS "Usuarios pertencentes a clinica podem ver seus pacientes" ON pacientes;
DROP POLICY IF EXISTS "Usuários pertencentes a clínica podem ver seus pacientes" ON pacientes;
DROP POLICY IF EXISTS "Usuários pertencentes a clínica podem ver pacientes" ON pacientes;

-- 2. Criar política segura usando apenas auth.uid() e tabelas de relacionamento
CREATE POLICY pacientes_select ON pacientes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 
            FROM profissionais_clinicas pc
            JOIN profissionais p ON pc.profissional_id = p.id
            WHERE pc.clinica_id = pacientes.clinica_id
            AND p.user_id = auth.uid()
        )
        OR public.is_super_admin()
    );

-- 3. Garantir que outras operações também esteam protegidas
DROP POLICY IF EXISTS pacientes_insert ON pacientes;
CREATE POLICY pacientes_insert ON pacientes
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 
            FROM profissionais_clinicas pc
            JOIN profissionais p ON pc.profissional_id = p.id
            WHERE pc.clinica_id = pacientes.clinica_id
            AND p.user_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS pacientes_update ON pacientes;
CREATE POLICY pacientes_update ON pacientes
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 
            FROM profissionais_clinicas pc
            JOIN profissionais p ON pc.profissional_id = p.id
            WHERE pc.clinica_id = pacientes.clinica_id
            AND p.user_id = auth.uid()
        )
        OR public.is_super_admin()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 
            FROM profissionais_clinicas pc
            JOIN profissionais p ON pc.profissional_id = p.id
            WHERE pc.clinica_id = pacientes.clinica_id
            AND p.user_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS pacientes_delete ON pacientes;
CREATE POLICY pacientes_delete ON pacientes
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 
            FROM profissionais_clinicas pc
            JOIN profissionais p ON pc.profissional_id = p.id
            WHERE pc.clinica_id = pacientes.clinica_id
            AND p.user_id = auth.uid()
            AND p.nivel_acesso = 'admin'
        )
        OR public.is_super_admin()
    );

COMMIT;
