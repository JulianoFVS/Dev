-- =====================================================================
-- Multi-Tenant Hard Boundary — Row Level Security (RLS)
-- =====================================================================
-- Esta migration ativa RLS em todas as tabelas sensíveis e cria policies
-- que restringem cada `auth.uid()` aos dados das clínicas em que ele tem
-- vínculo via `profissionais_clinicas`. Super admins (`is_super_admin`)
-- têm bypass intencional para o backoffice.
--
-- ATENÇÃO: depois de aplicar esta migration, qualquer query feita com a
-- chave anônima (front-end) que não combinar com as policies retornará
-- vazio. As rotas que usam SERVICE_ROLE_KEY (server-side) ignoram RLS e
-- continuam funcionando — é onde o onboarding e o admin de equipe vivem.
-- ---------------------------------------------------------------------

-- =========================
-- Helper functions (SECURITY DEFINER)
-- =========================
-- Centralizam a lógica de "este auth.uid() tem acesso à clínica X" para
-- ser reaproveitada por todas as policies. Marcadas STABLE para que o
-- planner possa cachear dentro de uma query.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM profissionais p
        WHERE p.user_id = auth.uid()
          AND p.is_super_admin = true
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_clinic_access(target_clinica_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM profissionais_clinicas pc
            JOIN profissionais p ON p.id = pc.profissional_id
            WHERE pc.clinica_id = target_clinica_id
              AND p.user_id = auth.uid()
        );
$$;

-- Sobrecarga para chaves textuais (caso alguma tabela use TEXT/UUID)
CREATE OR REPLACE FUNCTION public.user_has_clinic_access(target_clinica_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM profissionais_clinicas pc
            JOIN profissionais p ON p.id = pc.profissional_id
            WHERE pc.clinica_id::TEXT = target_clinica_id
              AND p.user_id = auth.uid()
        );
$$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_clinic_access(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_clinic_access(TEXT) TO authenticated;

-- =========================
-- 1. clinicas
-- =========================
ALTER TABLE clinicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinicas_select ON clinicas;
CREATE POLICY clinicas_select ON clinicas
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(id));

DROP POLICY IF EXISTS clinicas_insert ON clinicas;
CREATE POLICY clinicas_insert ON clinicas
    FOR INSERT TO authenticated
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS clinicas_update ON clinicas;
CREATE POLICY clinicas_update ON clinicas
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(id))
    WITH CHECK (public.user_has_clinic_access(id));

DROP POLICY IF EXISTS clinicas_delete ON clinicas;
CREATE POLICY clinicas_delete ON clinicas
    FOR DELETE TO authenticated
    USING (public.is_super_admin());

-- =========================
-- 2. pacientes
-- =========================
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pacientes_all ON pacientes;
CREATE POLICY pacientes_all ON pacientes
    FOR ALL TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

-- =========================
-- 3. agendamentos
-- =========================
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agendamentos_all ON agendamentos;
CREATE POLICY agendamentos_all ON agendamentos
    FOR ALL TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

-- =========================
-- 4. kanban_cartoes
-- =========================
-- Estratégia: como kanban_cartoes pode não ter clinica_id direto, usa o
-- vínculo via paciente → clinica.
ALTER TABLE kanban_cartoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kanban_cartoes_all ON kanban_cartoes;
CREATE POLICY kanban_cartoes_all ON kanban_cartoes
    FOR ALL TO authenticated
    USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM pacientes pa
            WHERE pa.id = kanban_cartoes.paciente_id
              AND public.user_has_clinic_access(pa.clinica_id)
        )
        OR (
            -- Se o cartão tem coluna direta clinica_id, também aceita.
            kanban_cartoes.clinica_id IS NOT NULL
            AND public.user_has_clinic_access(kanban_cartoes.clinica_id)
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM pacientes pa
            WHERE pa.id = kanban_cartoes.paciente_id
              AND public.user_has_clinic_access(pa.clinica_id)
        )
        OR (
            kanban_cartoes.clinica_id IS NOT NULL
            AND public.user_has_clinic_access(kanban_cartoes.clinica_id)
        )
    );

-- =========================
-- 5. despesas
-- =========================
ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS despesas_all ON despesas;
CREATE POLICY despesas_all ON despesas
    FOR ALL TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));

-- =========================
-- Bônus recomendado: tabelas auxiliares de tenant
-- =========================
-- Estes blocos são opcionais mas fortemente recomendados para fechar
-- todas as portas. Comente se sua schema diferir.

-- profissionais: cada usuário só lê o próprio registro; super admin lê todos.
ALTER TABLE profissionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profissionais_select ON profissionais;
CREATE POLICY profissionais_select ON profissionais
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_super_admin()
        OR EXISTS (
            -- Admins de uma clínica enxergam os colegas da mesma clínica
            SELECT 1
            FROM profissionais_clinicas pc1
            JOIN profissionais_clinicas pc2 ON pc1.clinica_id = pc2.clinica_id
            JOIN profissionais me ON me.id = pc1.profissional_id
            WHERE me.user_id = auth.uid()
              AND pc2.profissional_id = profissionais.id
        )
    );

DROP POLICY IF EXISTS profissionais_update_self ON profissionais;
CREATE POLICY profissionais_update_self ON profissionais
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- INSERT/DELETE de profissionais ficam com SERVICE_ROLE (rotas /api/admin
-- e /api/super-admin), então não precisamos de policy para authenticated.

-- profissionais_clinicas: leitura pelos próprios e por colegas da clínica.
ALTER TABLE profissionais_clinicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profissionais_clinicas_select ON profissionais_clinicas;
CREATE POLICY profissionais_clinicas_select ON profissionais_clinicas
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_clinic_access(clinica_id)
    );

-- redes: cada usuário enxerga só a rede das suas clínicas; super admin vê tudo.
ALTER TABLE redes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS redes_select ON redes;
CREATE POLICY redes_select ON redes
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM clinicas c
            WHERE c.rede_id = redes.id
              AND public.user_has_clinic_access(c.id)
        )
    );

-- =====================================================================
-- Resultado: a partir daqui, mesmo um `select * from clinicas` no
-- frontend só devolve as clínicas autorizadas; o mesmo vale para
-- pacientes, agendamentos, kanban e despesas. Super admins continuam
-- com visão global. As rotas server-side com SERVICE_ROLE_KEY não são
-- afetadas.
-- =====================================================================
