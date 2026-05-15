-- =====================================================================
-- Fix: infinite recursion em profissionais policy
-- =====================================================================
-- A policy `profissionais_select` original tinha um EXISTS cru que fazia
-- SELECT em `profissionais`, disparando a mesma policy de novo →
-- recursão infinita (Postgres erro 42P17).
--
-- Solução: encapsular toda a lógica em uma função SECURITY DEFINER, que
-- executa com privilégios do owner e ignora RLS dentro do corpo. As
-- policies passam a chamar a função em vez de embutir subqueries.
-- ---------------------------------------------------------------------

-- Função: "este auth.uid() pode enxergar o profissional X?"
-- - É o próprio (user_id == auth.uid())
-- - É super admin
-- - Compartilha pelo menos uma clínica via profissionais_clinicas
CREATE OR REPLACE FUNCTION public.user_can_see_profissional(target_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (SELECT 1 FROM profissionais p WHERE p.id = target_id AND p.user_id = auth.uid())
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM profissionais_clinicas pc_alvo
            JOIN profissionais_clinicas pc_meu ON pc_meu.clinica_id = pc_alvo.clinica_id
            JOIN profissionais me ON me.id = pc_meu.profissional_id
            WHERE pc_alvo.profissional_id = target_id
              AND me.user_id = auth.uid()
        );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_see_profissional(BIGINT) TO authenticated;

-- Sobrecarga para chaves textuais/uuid (defensivo)
CREATE OR REPLACE FUNCTION public.user_can_see_profissional(target_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (SELECT 1 FROM profissionais p WHERE p.id::TEXT = target_id AND p.user_id = auth.uid())
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM profissionais_clinicas pc_alvo
            JOIN profissionais_clinicas pc_meu ON pc_meu.clinica_id = pc_alvo.clinica_id
            JOIN profissionais me ON me.id = pc_meu.profissional_id
            WHERE pc_alvo.profissional_id::TEXT = target_id
              AND me.user_id = auth.uid()
        );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_see_profissional(TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- Recria a policy de profissionais sem EXISTS embutido
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS profissionais_select ON profissionais;

CREATE POLICY profissionais_select ON profissionais
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.user_can_see_profissional(id)
    );

-- A policy de UPDATE da migration anterior já era simples (user_id =
-- auth.uid() OR is_super_admin), não precisa mexer.

-- =====================================================================
-- Verificação rápida (rode no SQL Editor logado como o usuário com
-- problema, depois de aplicar):
--   SELECT auth.uid();
--   SELECT id, nome FROM profissionais WHERE user_id = auth.uid();
-- Deve retornar 1 linha sem erro 42P17.
-- =====================================================================
