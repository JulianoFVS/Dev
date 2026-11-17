-- =====================================================================
-- ORTUS — Suporte ao Ortus Desktop (sincronização e histórico de WhatsApp)
--
-- 1. Toda tabela sincronizada passa a ter `updated_at` (criada onde falta)
--    e um gatilho que a mantém atualizada em qualquer UPDATE — inclusive
--    quando a edição vem do site.
-- 2. Cria `whatsapp_mensagens`: histórico do chat que o app da clínica
--    mantém local e sobe como backup. Guarda metadados e o caminho da
--    mídia, nunca o binário.
-- 3. Índices para o pull incremental (updated_at) do sincronizador.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. updated_at nas tabelas que ainda não têm
-- ---------------------------------------------------------------------
ALTER TABLE public.pacientes            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.agendamentos         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.paciente_anamneses   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.paciente_evolucoes   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.paciente_documentos  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.paciente_debitos     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.whatsapp_agendadas   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.whatsapp_envios      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- Tabelas de referência que o desktop espelha só para exibir nomes offline.
ALTER TABLE public.clinicas             ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.profissionais        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.profissionais_clinicas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Já existiam, mas garantimos o default para linhas antigas:
UPDATE public.paciente_tratamentos SET updated_at = now() WHERE updated_at IS NULL;
UPDATE public.tarefas              SET updated_at = now() WHERE updated_at IS NULL;
UPDATE public.configuracoes_clinica SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE public.paciente_tratamentos  ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.tarefas               ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.configuracoes_clinica ALTER COLUMN updated_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.tocar_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DO $triggers$
DECLARE
    tabela TEXT;
    tabelas TEXT[] := ARRAY[
        'pacientes', 'agendamentos', 'paciente_tratamentos', 'paciente_anamneses',
        'paciente_evolucoes', 'paciente_documentos', 'paciente_debitos', 'tarefas',
        'configuracoes_clinica', 'whatsapp_agendadas', 'whatsapp_envios', 'whatsapp_mensagens',
        'clinicas', 'profissionais', 'profissionais_clinicas'
    ];
BEGIN
    FOREACH tabela IN ARRAY tabelas LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tabela) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON public.%I', tabela);
            EXECUTE format(
                'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at()',
                tabela);
        END IF;
    END LOOP;
END
$triggers$;

-- ---------------------------------------------------------------------
-- 2. Histórico de conversas do WhatsApp
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id       BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    chat_id          TEXT NOT NULL,
    wwebjs_id        TEXT,
    texto            TEXT,
    tipo             TEXT,
    de_mim           BOOLEAN NOT NULL DEFAULT FALSE,
    em               TIMESTAMPTZ,
    ack              SMALLINT,
    contato_nome     TEXT,
    contato_telefone TEXT,
    midia_caminho    TEXT,
    midia_tipo       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_mensagens_unica
    ON public.whatsapp_mensagens (clinica_id, wwebjs_id)
    WHERE wwebjs_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_mensagens_chat
    ON public.whatsapp_mensagens (clinica_id, chat_id, em DESC);

CREATE INDEX IF NOT EXISTS whatsapp_mensagens_updated
    ON public.whatsapp_mensagens (updated_at);

ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_mensagens_select ON public.whatsapp_mensagens;
CREATE POLICY whatsapp_mensagens_select ON public.whatsapp_mensagens
    FOR SELECT TO authenticated USING (public.user_has_clinic_access(clinica_id));
DROP POLICY IF EXISTS whatsapp_mensagens_insert ON public.whatsapp_mensagens;
CREATE POLICY whatsapp_mensagens_insert ON public.whatsapp_mensagens
    FOR INSERT TO authenticated WITH CHECK (public.user_has_clinic_access(clinica_id));
DROP POLICY IF EXISTS whatsapp_mensagens_update ON public.whatsapp_mensagens;
CREATE POLICY whatsapp_mensagens_update ON public.whatsapp_mensagens
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));
DROP POLICY IF EXISTS whatsapp_mensagens_delete ON public.whatsapp_mensagens;
CREATE POLICY whatsapp_mensagens_delete ON public.whatsapp_mensagens
    FOR DELETE TO authenticated USING (public.user_has_clinic_access(clinica_id));

REVOKE ALL ON TABLE public.whatsapp_mensagens FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_mensagens TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Índices do pull incremental
-- ---------------------------------------------------------------------
DO $indices$
DECLARE
    tabela TEXT;
    tabelas TEXT[] := ARRAY[
        'pacientes', 'agendamentos', 'paciente_tratamentos', 'paciente_anamneses',
        'paciente_evolucoes', 'paciente_documentos', 'paciente_debitos', 'tarefas',
        'configuracoes_clinica', 'whatsapp_agendadas', 'whatsapp_envios', 'clinicas', 'profissionais',
        'profissionais_clinicas'
    ];
BEGIN
    FOREACH tabela IN ARRAY tabelas LOOP
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON public.%I (updated_at)',
            tabela || '_updated_at_idx', tabela);
    END LOOP;
END
$indices$;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261117_desktop_sync')
ON CONFLICT (id) DO NOTHING;

COMMIT;
