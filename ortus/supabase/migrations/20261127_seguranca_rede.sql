-- =====================================================================
-- ORTUS — Administrador de rede é o administrador da matriz
--
-- Achado da revisão de 18/11: `user_is_rede_admin` valia para administrador
-- de QUALQUER unidade da rede. Um administrador de filial podia se vincular
-- sozinho à matriz (o vínculo nascia como "da casa"), virar administrador de
-- lá e apagar ou rebaixar o dono.
--
-- Regra a partir de agora (decisão do coordenador do lançamento):
--   - administrador da REDE = administrador (perfil admin, vínculo próprio,
--     não convidado) da clínica MATRIZ. Rede sem matriz marcada usa a
--     clínica mais antiga como matriz.
--   - administrador de filial administra só a própria unidade.
--   - a matriz nunca fica sem administrador: o último não é desvinculado,
--     rebaixado nem apagado (só o dono da plataforma faz isso).
--
-- E duas funções auxiliares deixam de responder sobre clínicas e redes de
-- outras pessoas; exclusões sincronizadas sem clínica só são lidas por quem
-- apagou.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Matriz da rede (a marcada; senão, a mais antiga)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rede_matriz(p_rede UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT c.id FROM public.clinicas c
     WHERE c.rede_id = p_rede
     ORDER BY c.is_matriz DESC, c.id
     LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- 2. Administrador da rede = administrador da matriz
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_rede_admin(p_rede UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR (p_rede IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.profissionais_clinicas pc
          JOIN public.profissionais p ON p.id = pc.profissional_id
         WHERE pc.clinica_id = public.rede_matriz(p_rede)
           AND pc.convidado = false
           AND p.user_id = auth.uid()
           AND p.nivel_acesso = 'admin'
    ));
$$;

-- ---------------------------------------------------------------------
-- 3. Funções auxiliares só respondem a quem é da rede
-- ---------------------------------------------------------------------
-- A rede de uma clínica: só para quem trabalha (vínculo próprio) em alguma
-- clínica da mesma rede, tem acesso à clínica, ou é dono da plataforma.
-- As policies continuam funcionando: quem administra já é da rede.
CREATE OR REPLACE FUNCTION public.clinica_rede(p_clinica BIGINT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT c.rede_id FROM public.clinicas c
     WHERE c.id = p_clinica
       AND (
            public.is_super_admin()
            OR public.user_has_clinic_access(p_clinica)
            OR EXISTS (
                SELECT 1
                  FROM public.clinicas c2
                  JOIN public.profissionais_clinicas pc ON pc.clinica_id = c2.id AND pc.convidado = false
                  JOIN public.profissionais p ON p.id = pc.profissional_id
                 WHERE c2.rede_id = c.rede_id AND p.user_id = auth.uid()
            )
       );
$$;

CREATE OR REPLACE FUNCTION public.profissional_e_da_rede(p_profissional BIGINT, p_rede UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_rede IS NOT NULL
       AND (public.is_super_admin() OR public.user_is_rede_admin(p_rede) OR EXISTS (
            SELECT 1
              FROM public.clinicas c
              JOIN public.profissionais_clinicas pc ON pc.clinica_id = c.id AND pc.convidado = false
              JOIN public.profissionais p ON p.id = pc.profissional_id
             WHERE c.rede_id = p_rede AND p.user_id = auth.uid() AND p.nivel_acesso = 'admin'
       ))
       AND EXISTS (
            SELECT 1
              FROM public.profissionais_clinicas pc
              JOIN public.clinicas c ON c.id = pc.clinica_id
             WHERE pc.profissional_id = p_profissional
               AND pc.convidado = false
               AND c.rede_id = p_rede
       );
$$;

-- ---------------------------------------------------------------------
-- 4. A matriz nunca fica sem administrador
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.matriz_admins_restantes(p_clinica BIGINT, p_sem_profissional BIGINT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT count(*)::int
      FROM public.profissionais_clinicas pc
      JOIN public.profissionais p ON p.id = pc.profissional_id
     WHERE pc.clinica_id = p_clinica
       AND pc.convidado = false
       AND p.nivel_acesso = 'admin'
       AND p.id <> p_sem_profissional;
$$;

CREATE OR REPLACE FUNCTION public.proteger_admin_da_matriz_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rede UUID;
    v_admin BOOLEAN;
BEGIN
    -- Só vale para pedido de pessoa logada; servidor e dono da plataforma passam.
    IF coalesce(auth.role(), '') <> 'authenticated' OR public.is_super_admin() OR OLD.convidado THEN
        RETURN coalesce(NEW, OLD);
    END IF;
    SELECT c.rede_id INTO v_rede FROM public.clinicas c WHERE c.id = OLD.clinica_id;
    IF v_rede IS NULL OR public.rede_matriz(v_rede) IS DISTINCT FROM OLD.clinica_id THEN
        RETURN coalesce(NEW, OLD);
    END IF;
    SELECT p.nivel_acesso = 'admin' INTO v_admin FROM public.profissionais p WHERE p.id = OLD.profissional_id;
    IF coalesce(v_admin, false)
       AND (TG_OP = 'DELETE' OR NEW.clinica_id IS DISTINCT FROM OLD.clinica_id OR NEW.profissional_id IS DISTINCT FROM OLD.profissional_id OR NEW.convidado)
       AND public.matriz_admins_restantes(OLD.clinica_id, OLD.profissional_id) = 0 THEN
        RAISE EXCEPTION 'A matriz precisa de pelo menos um administrador. Promova outra pessoa antes de tirar esta.' USING ERRCODE = '42501';
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_admin_da_matriz_vinculo ON public.profissionais_clinicas;
CREATE TRIGGER trg_proteger_admin_da_matriz_vinculo
    BEFORE UPDATE OR DELETE ON public.profissionais_clinicas
    FOR EACH ROW EXECUTE FUNCTION public.proteger_admin_da_matriz_vinculo();

CREATE OR REPLACE FUNCTION public.proteger_admin_da_matriz_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinica BIGINT;
BEGIN
    IF coalesce(auth.role(), '') <> 'authenticated' OR public.is_super_admin() OR OLD.nivel_acesso IS DISTINCT FROM 'admin' THEN
        RETURN coalesce(NEW, OLD);
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.nivel_acesso IS NOT DISTINCT FROM 'admin' THEN
        RETURN NEW;
    END IF;
    -- Matrizes em que esta pessoa é a última administradora.
    FOR v_clinica IN
        SELECT pc.clinica_id
          FROM public.profissionais_clinicas pc
          JOIN public.clinicas c ON c.id = pc.clinica_id
         WHERE pc.profissional_id = OLD.id AND pc.convidado = false
           AND c.rede_id IS NOT NULL AND public.rede_matriz(c.rede_id) = pc.clinica_id
    LOOP
        IF public.matriz_admins_restantes(v_clinica, OLD.id) = 0 THEN
            RAISE EXCEPTION 'A matriz precisa de pelo menos um administrador. Promova outra pessoa antes de rebaixar ou apagar esta.' USING ERRCODE = '42501';
        END IF;
    END LOOP;
    RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_admin_da_matriz_perfil ON public.profissionais;
CREATE TRIGGER trg_proteger_admin_da_matriz_perfil
    BEFORE UPDATE OF nivel_acesso OR DELETE ON public.profissionais
    FOR EACH ROW EXECUTE FUNCTION public.proteger_admin_da_matriz_perfil();

-- ---------------------------------------------------------------------
-- 5. Exclusões sincronizadas sem clínica: só quem apagou lê
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS sync_exclusoes_select ON public.sync_exclusoes;
CREATE POLICY sync_exclusoes_select ON public.sync_exclusoes
    FOR SELECT TO authenticated
    USING (
        (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id))
        OR (clinica_id IS NULL AND usuario_id = auth.uid())
    );

-- ---------------------------------------------------------------------
-- 5b. Avisos de cobrança vão para quem responde pela rede: o contato
--     comercial e os administradores da matriz (não os de filial, que não
--     veem valores nem pagam a assinatura). Redefine 20261124.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assinatura_destinatarios(p_rede UUID)
RETURNS TABLE (email TEXT, nome TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT ON (lower(x.email)) lower(x.email), x.nome
      FROM (
        SELECT r.contato_email AS email, r.contato_nome AS nome, 0 AS ordem
          FROM public.redes r WHERE r.id = p_rede
        UNION ALL
        SELECT u.email::text, p.nome, 1
          FROM public.profissionais p
          JOIN auth.users u ON u.id = p.user_id
          JOIN public.profissionais_clinicas pc ON pc.profissional_id = p.id AND pc.convidado = false
         WHERE pc.clinica_id = public.rede_matriz(p_rede)
           AND p.nivel_acesso = 'admin' AND coalesce(p.ativo, true)
      ) x
     WHERE x.email IS NOT NULL AND x.email LIKE '%@%'
     ORDER BY lower(x.email), x.ordem;
$$;

-- ---------------------------------------------------------------------
-- 6. Quem executa
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.assinatura_destinatarios(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_destinatarios(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.rede_matriz(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.matriz_admins_restantes(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proteger_admin_da_matriz_vinculo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proteger_admin_da_matriz_perfil() FROM PUBLIC, anon, authenticated;
-- rede_matriz é usada dentro de user_is_rede_admin (SECURITY DEFINER), que roda como dono;
-- authenticated não precisa chamar direto.
REVOKE ALL ON FUNCTION public.rede_matriz(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rede_matriz(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.matriz_admins_restantes(BIGINT, BIGINT) TO service_role;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261127_seguranca_rede')
ON CONFLICT (id) DO NOTHING;

COMMIT;
