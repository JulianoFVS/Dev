-- =====================================================================
-- ORTUS — Reforço de segurança (revisão geral de 18/11/2026)
--
-- Brechas fechadas aqui:
--
--   1. "Administrador" valia para o perfil inteiro. Quem era administrador
--      da própria clínica e aceitava um convite de OUTRA clínica passava a
--      ser administrador lá também: podia excluir pacientes, mudar
--      configurações, convidar gente e mexer na equipe da clínica que o
--      convidou. Agora o vínculo criado por convite é marcado como
--      `convidado` e nunca dá poder de administrador naquela clínica.
--
--   2. O administrador de uma clínica podia editar e até APAGAR o perfil
--      de um convidado (que pertence a outra rede), e mudar o nível de
--      acesso dele — o que valia também na clínica de origem da pessoa.
--      Agora só a clínica de origem (vínculo não convidado) gerencia o
--      perfil. A clínica que convidou só remove o próprio vínculo e ajusta
--      as permissões de módulo dela.
--
--   3. Funções criadas depois de 14/11 nasciam executáveis pelo visitante
--      (`anon`): o `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public REVOKE
--      ... FROM PUBLIC` da migration de segurança total não tem efeito,
--      porque o privilégio de PUBLIC em funções é global, não por schema.
--      Esta migration revoga de novo em tudo que existe. Toda migration
--      nova que criar função precisa terminar com o mesmo REVOKE (a suíte
--      `npm test` acusa quando alguém esquecer).
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Vínculo de convidado
-- ---------------------------------------------------------------------
ALTER TABLE public.profissionais_clinicas
    ADD COLUMN IF NOT EXISTS convidado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profissionais_clinicas.convidado IS
    'true = a pessoa entrou nesta clínica por convite e pertence a outra rede. Nunca é administradora aqui, mesmo que seja na clínica de origem.';

-- Vínculos que já nasceram de um convite aceito. O filtro de data evita
-- marcar um vínculo que a pessoa já tinha antes de o convite existir.
UPDATE public.profissionais_clinicas pc
   SET convidado = true
  FROM public.convites_equipe c
 WHERE c.status = 'aceito'
   AND c.convidado_profissional_id = pc.profissional_id
   AND pc.clinica_id = ANY (c.clinica_ids)
   AND pc.convidado = false
   AND (pc.created_at IS NULL OR pc.created_at >= c.criado_em - INTERVAL '1 minute');

-- ---------------------------------------------------------------------
-- 2. Administrador é por vínculo, não por perfil
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_clinic_admin(p_clinica BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR EXISTS (
        SELECT 1
        FROM public.profissionais_clinicas pc
        JOIN public.profissionais p ON p.id = pc.profissional_id
        WHERE pc.clinica_id = p_clinica
          AND pc.convidado = false
          AND p.user_id = auth.uid()
          AND p.nivel_acesso = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.user_is_rede_admin(p_rede UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR (p_rede IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.clinicas c
        JOIN public.profissionais_clinicas pc ON pc.clinica_id = c.id
        JOIN public.profissionais p ON p.id = pc.profissional_id
        WHERE c.rede_id = p_rede
          AND pc.convidado = false
          AND p.user_id = auth.uid()
          AND p.nivel_acesso = 'admin'
    ));
$$;

-- Quem pode editar/apagar o PERFIL de um profissional: a própria pessoa
-- (tratada na policy), o dono da plataforma, ou o administrador de uma
-- clínica de ORIGEM dela. Clínica que só convidou não entra.
CREATE OR REPLACE FUNCTION public.user_gerencia_profissional(p_profissional BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR EXISTS (
        SELECT 1
        FROM public.profissionais_clinicas pc
        WHERE pc.profissional_id = p_profissional
          AND pc.convidado = false
          AND public.user_is_clinic_admin(pc.clinica_id)
    );
$$;

DROP POLICY IF EXISTS profissionais_update ON public.profissionais;
CREATE POLICY profissionais_update ON public.profissionais
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR public.user_gerencia_profissional(id))
    WITH CHECK (user_id = auth.uid() OR public.user_gerencia_profissional(id));

DROP POLICY IF EXISTS profissionais_delete ON public.profissionais;
CREATE POLICY profissionais_delete ON public.profissionais
    FOR DELETE TO authenticated
    USING (public.user_gerencia_profissional(id));

CREATE OR REPLACE FUNCTION public.proteger_profissionais()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_super_admin() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF COALESCE(OLD.is_super_admin, FALSE) THEN
            RAISE EXCEPTION 'Sem permissão para remover este usuário.' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF COALESCE(OLD.is_super_admin, FALSE) AND OLD.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Sem permissão para alterar este usuário.' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Sem permissão para alterar o acesso deste usuário.' USING ERRCODE = '42501';
    END IF;
    -- O nível de acesso vale na clínica de origem da pessoa: só o
    -- administrador de lá muda. Antes bastava ser administrador de qualquer
    -- clínica em que ela tivesse vínculo, inclusive por convite.
    IF NEW.nivel_acesso IS DISTINCT FROM OLD.nivel_acesso
       AND NOT public.user_gerencia_profissional(OLD.id) THEN
        RAISE EXCEPTION 'Só um administrador da clínica de origem pode mudar o nível de acesso.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- Ninguém transforma um vínculo de convidado em vínculo comum por conta
-- própria: só o dono da plataforma (pelo painel) ou o servidor.
--
-- SECURITY INVOKER de propósito: `current_user` precisa mostrar quem está
-- gravando. Pela API é `authenticated`; dentro de `equipe_responder_convite`
-- (SECURITY DEFINER) é o dono da função, que pode marcar o convidado.
CREATE OR REPLACE FUNCTION public.proteger_vinculo_convidado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        -- Vínculo criado por um administrador para a própria equipe.
        NEW.convidado := false;
        RETURN NEW;
    END IF;
    IF NEW.convidado IS DISTINCT FROM OLD.convidado
       OR NEW.profissional_id IS DISTINCT FROM OLD.profissional_id
       OR NEW.clinica_id IS DISTINCT FROM OLD.clinica_id THEN
        RAISE EXCEPTION 'Sem permissão para alterar este vínculo.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_vinculo_convidado ON public.profissionais_clinicas;
CREATE TRIGGER trg_proteger_vinculo_convidado
    BEFORE INSERT OR UPDATE ON public.profissionais_clinicas
    FOR EACH ROW EXECUTE FUNCTION public.proteger_vinculo_convidado();

-- O profissional já pertence (vínculo de origem) a alguma clínica da rede?
CREATE OR REPLACE FUNCTION public.profissional_e_da_rede(p_profissional BIGINT, p_rede UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_rede IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.profissionais_clinicas pc
        JOIN public.clinicas c ON c.id = pc.clinica_id
        WHERE pc.profissional_id = p_profissional
          AND pc.convidado = false
          AND c.rede_id = p_rede
    );
$$;

-- Vínculo novo só para quem já é da casa. Sem isso, o administrador de uma
-- clínica inseria direto o vínculo de qualquer profissional que conseguisse
-- enxergar (um convidado, por exemplo) em outra unidade, sem convite.
DROP POLICY IF EXISTS profissionais_clinicas_insert ON public.profissionais_clinicas;
CREATE POLICY profissionais_clinicas_insert ON public.profissionais_clinicas
    FOR INSERT TO authenticated
    WITH CHECK (
        (
            public.user_is_clinic_admin(clinica_id)
            OR public.user_is_rede_admin(public.clinica_rede(clinica_id))
        )
        AND (
            public.user_gerencia_profissional(profissional_id)
            OR public.profissional_e_da_rede(profissional_id, public.clinica_rede(clinica_id))
        )
    );

-- ---------------------------------------------------------------------
-- 3. Aceitar convite: vínculo de convidado + permissões de módulo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipe_responder_convite(p_id BIGINT, p_aceitar BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_convite RECORD;
    v_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_prof BIGINT;
    v_clinicas BIGINT[];
    v_cargo TEXT;
    v_modulos TEXT[];
BEGIN
    SELECT * INTO v_convite FROM public.convites_equipe WHERE id = p_id FOR UPDATE;
    IF v_convite.id IS NULL THEN
        RAISE EXCEPTION 'Convite não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    IF v_convite.status <> 'pendente' THEN
        RAISE EXCEPTION 'Este convite já foi respondido.' USING ERRCODE = '22023';
    END IF;

    IF v_convite.expires_at < now() THEN
        UPDATE public.convites_equipe SET status = 'expirado', respondido_em = now() WHERE id = p_id;
        RAISE EXCEPTION 'Este convite expirou.' USING ERRCODE = '22023';
    END IF;

    IF NOT (v_convite.convidado_user_id = auth.uid() OR lower(v_convite.convidado_email) = v_email) THEN
        RAISE EXCEPTION 'Este convite não é seu.' USING ERRCODE = '42501';
    END IF;

    IF NOT p_aceitar THEN
        UPDATE public.convites_equipe
           SET status = 'recusado', respondido_em = now()
         WHERE id = p_id;
        UPDATE public.notificacoes
           SET lida = true
         WHERE user_id = auth.uid() AND tipo = 'convite' AND lida = false
           AND mensagem LIKE '%Convite para nova rede%';
        RETURN jsonb_build_object('status', 'recusado');
    END IF;

    SELECT p.id INTO v_prof FROM public.profissionais p WHERE p.user_id = auth.uid();
    IF v_prof IS NULL THEN
        RAISE EXCEPTION 'Perfil profissional não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    v_clinicas := v_convite.clinica_ids;

    INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id, permissao, convidado)
    SELECT v_prof, cid, 'funcionario', true
      FROM unnest(v_clinicas) AS cid
     WHERE NOT EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
        WHERE pc.profissional_id = v_prof AND pc.clinica_id = cid
     );

    -- O convidado entra com os módulos do cargo informado no convite (os
    -- mesmos conjuntos de lib/permissionPresets.ts). Sem isso ele abria a
    -- clínica nova sem enxergar nada até alguém ajustar na tela de Equipe.
    v_cargo := lower(coalesce(v_convite.cargo, ''));
    v_modulos := CASE
        WHEN v_cargo LIKE '%recep%' THEN ARRAY['agenda', 'ficha_paciente']
        WHEN v_cargo LIKE '%dent%' OR v_cargo LIKE '%ortod%' OR v_cargo LIKE '%implant%'
            THEN ARRAY['agenda', 'ficha_paciente', 'controle_protese']
        WHEN v_cargo LIKE '%financ%' OR v_cargo LIKE '%contab%' THEN ARRAY['financeiro', 'inteligencia', 'ficha_paciente']
        WHEN v_cargo LIKE '%gestor%' OR v_cargo LIKE '%admin%' OR v_cargo LIKE '%sócio%' OR v_cargo LIKE '%socio%'
            THEN ARRAY['agenda', 'ficha_paciente', 'controle_protese', 'financeiro', 'inteligencia']
        WHEN v_cargo LIKE '%auxiliar%' OR v_cargo LIKE '%protét%' OR v_cargo LIKE '%prote%'
            THEN ARRAY['agenda', 'ficha_paciente', 'controle_protese']
        ELSE ARRAY['agenda', 'ficha_paciente']
    END;

    INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar)
    SELECT v_prof, cid, m.modulo, m.modulo = ANY (v_modulos)
      FROM unnest(v_clinicas) AS cid
     CROSS JOIN (VALUES ('agenda'), ('configuracoes'), ('controle_protese'), ('estoque'), ('ficha_paciente'),
                        ('financeiro'), ('inteligencia'), ('loja'), ('marketing')) AS m(modulo)
     WHERE NOT EXISTS (
        SELECT 1 FROM public.permissoes_modulos pm
        WHERE pm.profissional_id = v_prof AND pm.clinica_id = cid
     )
    ON CONFLICT (profissional_id, clinica_id, modulo) DO NOTHING;

    UPDATE public.convites_equipe
       SET status = 'aceito', respondido_em = now(), convidado_profissional_id = v_prof
     WHERE id = p_id;

    -- Avisa quem convidou.
    IF v_convite.convidante_profissional_id IS NOT NULL THEN
        INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo)
        SELECT p.user_id, 'Convite aceito',
               coalesce(v_convite.convidado_nome, v_convite.convidado_email) || ' aceitou o convite e agora participa da equipe.',
               'mensagem'
          FROM public.profissionais p
         WHERE p.id = v_convite.convidante_profissional_id AND p.user_id IS NOT NULL;
    END IF;

    RETURN jsonb_build_object('status', 'aceito', 'clinicas', to_jsonb(v_clinicas));
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Funções: visitante não executa nada do schema public
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

GRANT EXECUTE ON FUNCTION public.user_gerencia_profissional(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profissional_e_da_rede(BIGINT, UUID) TO authenticated, service_role;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261121_seguranca_reforco')
ON CONFLICT (id) DO NOTHING;

COMMIT;
