-- =====================================================================
-- ORTUS — Auditoria das ações do painel SaaS
--
-- Toda alteração feita pelos donos da plataforma em redes, faturas e no
-- vínculo de clínicas fica registrada em `audit_log` com autor, antes e
-- depois. Serve para rastrear quem mudou o quê — inclusive quando a
-- alteração vem pelo service role (nesse caso o autor fica nulo, mas a
-- linha continua registrada).
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auditar_saas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_nome TEXT;
    v_id TEXT;
    v_detalhes JSONB;
BEGIN
    IF v_user IS NOT NULL THEN
        SELECT p.nome INTO v_nome FROM public.profissionais p WHERE p.user_id = v_user LIMIT 1;
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_id := (to_jsonb(OLD) ->> 'id');
        v_detalhes := jsonb_build_object('antes', to_jsonb(OLD));
    ELSIF TG_OP = 'UPDATE' THEN
        v_id := (to_jsonb(NEW) ->> 'id');
        v_detalhes := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
    ELSE
        v_id := (to_jsonb(NEW) ->> 'id');
        v_detalhes := jsonb_build_object('depois', to_jsonb(NEW));
    END IF;

    INSERT INTO public.audit_log (user_id, profissional_nome, acao, entidade, entidade_id, detalhes)
    VALUES (
        v_user,
        coalesce(v_nome, 'Painel SaaS'),
        lower(TG_OP),
        TG_TABLE_NAME,
        v_id,
        v_detalhes
    );

    RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_saas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auditar_redes ON public.redes;
CREATE TRIGGER trg_auditar_redes
    AFTER INSERT OR UPDATE OR DELETE ON public.redes
    FOR EACH ROW EXECUTE FUNCTION public.auditar_saas();

DROP TRIGGER IF EXISTS trg_auditar_faturas ON public.faturas;
CREATE TRIGGER trg_auditar_faturas
    AFTER INSERT OR UPDATE OR DELETE ON public.faturas
    FOR EACH ROW EXECUTE FUNCTION public.auditar_saas();

DROP TRIGGER IF EXISTS trg_auditar_convites ON public.convites_equipe;
CREATE TRIGGER trg_auditar_convites
    AFTER INSERT OR UPDATE ON public.convites_equipe
    FOR EACH ROW EXECUTE FUNCTION public.auditar_saas();

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261114_saas_auditoria')
ON CONFLICT (id) DO NOTHING;

COMMIT;
