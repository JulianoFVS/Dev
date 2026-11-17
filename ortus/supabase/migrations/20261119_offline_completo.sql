-- =====================================================================
-- ORTUS — O restante do dia a dia entra na sincronização do desktop
--
-- Financeiro, próteses, catálogo, horários, permissões, comissões,
-- notificações, lembretes e links de anamnese passam a ter `updated_at`
-- carimbado pelo servidor e exclusão compartilhada entre máquinas.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

ALTER TABLE public.despesas              ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.kanban_colunas        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.kanban_cartoes        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.lembretes_agenda      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.notificacoes          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.anamnese_links        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.convites_equipe       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.audit_log             ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- clinica_id de algumas tabelas é texto. O cast não pode derrubar o DELETE.
CREATE OR REPLACE FUNCTION public.registrar_exclusao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_linha JSONB := to_jsonb(OLD);
    v_id TEXT := COALESCE(v_linha ->> 'id', v_linha ->> 'caminho');
    v_clinica BIGINT := NULL;
BEGIN
    IF v_id IS NULL THEN
        RETURN OLD;
    END IF;

    BEGIN
        v_clinica := NULLIF(v_linha ->> 'clinica_id', '')::BIGINT;
    EXCEPTION WHEN invalid_text_representation THEN
        v_clinica := NULL;
    END;

    IF v_clinica IS NULL AND (v_linha ? 'paciente_id') THEN
        SELECT p.clinica_id INTO v_clinica
          FROM public.pacientes p
         WHERE p.id::TEXT = (v_linha ->> 'paciente_id');
    END IF;

    INSERT INTO public.sync_exclusoes (tabela, linha_id, clinica_id, usuario_id, excluido_em)
    VALUES (TG_TABLE_NAME, v_id, v_clinica, auth.uid(), now())
    ON CONFLICT (tabela, linha_id) DO UPDATE
        SET excluido_em = now(),
            clinica_id = COALESCE(EXCLUDED.clinica_id, public.sync_exclusoes.clinica_id),
            usuario_id = COALESCE(EXCLUDED.usuario_id, public.sync_exclusoes.usuario_id);

    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_exclusao() FROM PUBLIC, anon, authenticated;

DO $offline$
DECLARE
    tabela TEXT;
    tabelas TEXT[] := ARRAY[
        'especialidades', 'planos', 'tratamentos_base', 'planos_tratamentos',
        'profissionais_horarios', 'permissoes_modulos', 'despesas',
        'kanban_colunas', 'kanban_cartoes', 'lembretes_agenda',
        'comissoes_regras', 'comissoes_lancamentos', 'notificacoes', 'anamnese_links',
        'convites_equipe', 'audit_log'
    ];
BEGIN
    FOREACH tabela IN ARRAY tabelas LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tabela
        ) THEN
            CONTINUE;
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = tabela AND column_name = 'updated_at'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON public.%I', tabela);
            EXECUTE format(
                'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at()',
                tabela);
            EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at_insert ON public.%I', tabela);
            EXECUTE format(
                'CREATE TRIGGER trg_updated_at_insert BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at()',
                tabela);
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON public.%I (updated_at)',
                tabela || '_updated_at_idx', tabela);
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = tabela AND column_name = 'id'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_registrar_exclusao ON public.%I', tabela);
            EXECUTE format(
                'CREATE TRIGGER trg_registrar_exclusao AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.registrar_exclusao()',
                tabela);
        END IF;
    END LOOP;
END
$offline$;

DROP POLICY IF EXISTS convites_equipe_select ON public.convites_equipe;
CREATE POLICY convites_equipe_select ON public.convites_equipe
    FOR SELECT TO authenticated
    USING (
        convidado_user_id = auth.uid()
        OR lower(convidado_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR EXISTS (
            SELECT 1 FROM unnest(convites_equipe.clinica_ids) AS cid
            WHERE public.user_is_clinic_admin(cid)
        )
        OR public.user_is_rede_admin(convites_equipe.rede_id)
        OR public.is_super_admin()
    );

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261119_offline_completo')
ON CONFLICT (id) DO NOTHING;

COMMIT;
