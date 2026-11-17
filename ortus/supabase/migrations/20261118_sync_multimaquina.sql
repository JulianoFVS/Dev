-- =====================================================================
-- ORTUS — Sincronização entre várias máquinas da mesma clínica
--
-- Cenário: três funcionários, três computadores, todos sem internet.
-- Cada um cria pacientes, edita a agenda e apaga registros. Quando a rede
-- volta, tudo precisa convergir sem perder trabalho.
--
-- O que faltava para isso ser seguro:
--
-- 1. EXCLUSÃO NÃO VIAJAVA. Se a máquina A apagasse um agendamento, a B
--    (que já tinha baixado) continuaria mostrando — e poderia reenvirar a
--    linha, ressuscitando. Agora um gatilho registra a exclusão em
--    `sync_exclusoes`, e as outras máquinas recebem o "túmulo" pelo pull.
--
-- 2. RELÓGIO. O `updated_at` vinha do relógio de cada máquina; um PC com
--    hora errada ganharia todos os conflitos. Agora o SERVIDOR carimba
--    `updated_at` em INSERT e UPDATE — a hora da clínica não decide mais
--    nada.
--
-- 3. ORIGEM. `sync_conflitos` (criado no desktop) e `sync_exclusoes`
--    guardam quem apagou/alterou, para a tela de conflitos conseguir
--    mostrar de qual computador veio.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tabela de exclusões (tombstones) compartilhada
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_exclusoes (
    id          BIGSERIAL PRIMARY KEY,
    tabela      TEXT NOT NULL,
    linha_id    TEXT NOT NULL,
    clinica_id  BIGINT,
    usuario_id  UUID,
    excluido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sync_exclusoes_unica
    ON public.sync_exclusoes (tabela, linha_id);

CREATE INDEX IF NOT EXISTS sync_exclusoes_data
    ON public.sync_exclusoes (excluido_em);

ALTER TABLE public.sync_exclusoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_exclusoes_select ON public.sync_exclusoes;
CREATE POLICY sync_exclusoes_select ON public.sync_exclusoes
    FOR SELECT TO authenticated
    USING (clinica_id IS NULL OR public.user_has_clinic_access(clinica_id));

REVOKE ALL ON TABLE public.sync_exclusoes FROM anon;
GRANT SELECT ON TABLE public.sync_exclusoes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.sync_exclusoes_id_seq TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Gatilho que registra toda exclusão
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_exclusao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_linha JSONB := to_jsonb(OLD);
    v_id TEXT := v_linha ->> 'id';
    v_clinica BIGINT := NULLIF(v_linha ->> 'clinica_id', '')::BIGINT;
BEGIN
    IF v_id IS NULL THEN
        RETURN OLD;
    END IF;

    -- Tabelas filhas não têm clinica_id: descobre pelo paciente.
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

DO $gatilhos$
DECLARE
    tabela TEXT;
    tabelas TEXT[] := ARRAY[
        'pacientes', 'agendamentos', 'paciente_tratamentos', 'paciente_anamneses',
        'paciente_evolucoes', 'paciente_documentos', 'paciente_debitos', 'tarefas',
        'whatsapp_agendadas', 'whatsapp_mensagens'
    ];
BEGIN
    FOREACH tabela IN ARRAY tabelas LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tabela) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_registrar_exclusao ON public.%I', tabela);
            EXECUTE format(
                'CREATE TRIGGER trg_registrar_exclusao AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.registrar_exclusao()',
                tabela);
        END IF;
    END LOOP;
END
$gatilhos$;

-- ---------------------------------------------------------------------
-- 3. O servidor é o único relógio: updated_at em INSERT e UPDATE
-- ---------------------------------------------------------------------
DO $relogio$
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
            EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at_insert ON public.%I', tabela);
            EXECUTE format(
                'CREATE TRIGGER trg_updated_at_insert BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at()',
                tabela);
        END IF;
    END LOOP;
END
$relogio$;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261118_sync_multimaquina')
ON CONFLICT (id) DO NOTHING;

COMMIT;
