-- =====================================================================
-- Meta de vendas (pedido de 19/11/2026)
--
-- metas_vendas: quanto a clínica quer aprovar em orçamentos no mês, no
-- total (profissional_id vazio) e, se quiser, por profissional. Leitura
-- para quem trabalha na clínica; só o administrador define.
--
-- Pode rodar de novo sem estragar nada.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.metas_vendas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    mes DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
    profissional_id BIGINT REFERENCES public.profissionais(id) ON DELETE CASCADE,
    valor NUMERIC(12, 2) NOT NULL CHECK (valor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma meta total e uma por profissional em cada mês.
CREATE UNIQUE INDEX IF NOT EXISTS metas_vendas_total_uidx
    ON public.metas_vendas (clinica_id, mes) WHERE profissional_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metas_vendas_profissional_uidx
    ON public.metas_vendas (clinica_id, mes, profissional_id) WHERE profissional_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS metas_vendas_updated_at_idx ON public.metas_vendas (updated_at);

-- O profissional da meta trabalha na clínica (ou na rede). Compara OLD e
-- NEW: o desktop reenvia a linha inteira.
CREATE OR REPLACE FUNCTION public.metas_vendas_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rede UUID;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.profissional_id IS NOT DISTINCT FROM OLD.profissional_id
       AND NEW.clinica_id IS NOT DISTINCT FROM OLD.clinica_id THEN
        RETURN NEW;
    END IF;
    IF NEW.profissional_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT c.rede_id INTO v_rede FROM public.clinicas c WHERE c.id = NEW.clinica_id;
    IF NOT EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
          JOIN public.clinicas c ON c.id = pc.clinica_id
         WHERE pc.profissional_id = NEW.profissional_id
           AND (pc.clinica_id = NEW.clinica_id OR (v_rede IS NOT NULL AND c.rede_id = v_rede))
    ) THEN
        RAISE EXCEPTION 'O profissional da meta não trabalha nesta clínica.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_metas_vendas_validar ON public.metas_vendas;
CREATE TRIGGER trg_metas_vendas_validar
    BEFORE INSERT OR UPDATE ON public.metas_vendas
    FOR EACH ROW EXECUTE FUNCTION public.metas_vendas_validar();
REVOKE ALL ON FUNCTION public.metas_vendas_validar() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.metas_vendas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS metas_vendas_select ON public.metas_vendas;
DROP POLICY IF EXISTS metas_vendas_insert ON public.metas_vendas;
DROP POLICY IF EXISTS metas_vendas_update ON public.metas_vendas;
DROP POLICY IF EXISTS metas_vendas_delete ON public.metas_vendas;
CREATE POLICY metas_vendas_select ON public.metas_vendas FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));
CREATE POLICY metas_vendas_insert ON public.metas_vendas FOR INSERT TO authenticated
    WITH CHECK (public.user_is_clinic_admin(clinica_id));
CREATE POLICY metas_vendas_update ON public.metas_vendas FOR UPDATE TO authenticated
    USING (public.user_is_clinic_admin(clinica_id)) WITH CHECK (public.user_is_clinic_admin(clinica_id));
CREATE POLICY metas_vendas_delete ON public.metas_vendas FOR DELETE TO authenticated
    USING (public.user_is_clinic_admin(clinica_id));
REVOKE ALL ON TABLE public.metas_vendas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.metas_vendas TO authenticated;

-- Sincronização do desktop e modo de consulta da assinatura.
DROP TRIGGER IF EXISTS trg_updated_at ON public.metas_vendas;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.metas_vendas
    FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();
DROP TRIGGER IF EXISTS trg_updated_at_insert ON public.metas_vendas;
CREATE TRIGGER trg_updated_at_insert BEFORE INSERT ON public.metas_vendas
    FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();
DROP TRIGGER IF EXISTS trg_registrar_exclusao ON public.metas_vendas;
CREATE TRIGGER trg_registrar_exclusao AFTER DELETE ON public.metas_vendas
    FOR EACH ROW EXECUTE FUNCTION public.registrar_exclusao();
DROP TRIGGER IF EXISTS aaa_assinatura_escrita ON public.metas_vendas;
CREATE TRIGGER aaa_assinatura_escrita BEFORE INSERT OR UPDATE OR DELETE ON public.metas_vendas
    FOR EACH ROW EXECUTE FUNCTION public.assinatura_barrar_escrita('clinica');

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261130_metas_vendas')
ON CONFLICT (id) DO NOTHING;

COMMIT;
