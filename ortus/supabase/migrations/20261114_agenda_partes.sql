-- =====================================================================
-- ORTUS — Agenda com atendimentos em várias partes
--
-- Um mesmo atendimento pode acontecer em mais de um dia (segunda e
-- sábado) ou em mais de um período do mesmo dia (manhã e noite).
-- Modelo: cada parte é uma linha em `agendamentos`, e todas as partes
-- compartilham o mesmo `grupo_id`. Isso mantém compatibilidade total com
-- financeiro, prontuário, lembretes e relatórios (que continuam lendo
-- `agendamentos`), e a agenda desenha cada parte no seu horário real.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

ALTER TABLE public.agendamentos
    ADD COLUMN IF NOT EXISTS grupo_id UUID,
    ADD COLUMN IF NOT EXISTS parte_indice SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS parte_total SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS parte_titulo TEXT;

COMMENT ON COLUMN public.agendamentos.grupo_id IS
    'Agrupa as partes de um mesmo atendimento (vários dias e/ou vários períodos).';
COMMENT ON COLUMN public.agendamentos.parte_indice IS 'Posição da parte dentro do atendimento (0-based).';
COMMENT ON COLUMN public.agendamentos.parte_total IS 'Quantidade total de partes do atendimento.';
COMMENT ON COLUMN public.agendamentos.parte_titulo IS 'Rótulo opcional da parte (ex.: "Manhã", "Retorno").';

DO $constraints$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'agendamentos_partes_check' AND conrelid = 'public.agendamentos'::regclass
    ) THEN
        ALTER TABLE public.agendamentos
            ADD CONSTRAINT agendamentos_partes_check
            CHECK (parte_total >= 1 AND parte_indice >= 0 AND parte_indice < parte_total);
    END IF;
END
$constraints$;

ALTER TABLE public.agendamentos
    ALTER COLUMN duracao_minutos SET DEFAULT 60;

-- Cor própria do profissional na agenda (colunas por profissional).
ALTER TABLE public.profissionais
    ADD COLUMN IF NOT EXISTS cor_agenda TEXT;

CREATE INDEX IF NOT EXISTS agendamentos_grupo_idx
    ON public.agendamentos (grupo_id) WHERE grupo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agendamentos_clinica_data_idx
    ON public.agendamentos (clinica_id, data_hora);
CREATE INDEX IF NOT EXISTS agendamentos_prof_data_idx
    ON public.agendamentos (profissional_id, data_hora);
CREATE INDEX IF NOT EXISTS agendamentos_paciente_data_idx
    ON public.agendamentos (paciente_id, data_hora DESC);

-- ---------------------------------------------------------------------
-- Cria/atualiza um atendimento inteiro (todas as partes) de uma vez,
-- com validação de vínculo do profissional e consistência de clínica.
-- SECURITY INVOKER: as policies continuam valendo linha a linha.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agendamento_salvar_partes(
    p_grupo_id UUID,
    p_clinica_id BIGINT,
    p_paciente_id UUID,
    p_profissional_id BIGINT,
    p_procedimento TEXT,
    p_cor TEXT,
    p_status TEXT,
    p_valor NUMERIC,
    p_desconto NUMERIC,
    p_observacoes TEXT,
    p_partes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_grupo UUID := COALESCE(p_grupo_id, gen_random_uuid());
    v_total SMALLINT;
    v_parte JSONB;
    v_indice SMALLINT := 0;
    v_ids BIGINT[] := ARRAY[]::BIGINT[];
    v_id BIGINT;
BEGIN
    IF p_partes IS NULL OR jsonb_typeof(p_partes) <> 'array' OR jsonb_array_length(p_partes) = 0 THEN
        RAISE EXCEPTION 'Informe pelo menos uma parte do atendimento.' USING ERRCODE = '22023';
    END IF;

    v_total := jsonb_array_length(p_partes);

    IF NOT public.user_has_clinic_access(p_clinica_id) THEN
        RAISE EXCEPTION 'Sem acesso a esta clínica.' USING ERRCODE = '42501';
    END IF;

    IF p_profissional_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
        WHERE pc.profissional_id = p_profissional_id AND pc.clinica_id = p_clinica_id
    ) THEN
        RAISE EXCEPTION 'O profissional não atende nesta clínica.' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.pacientes pa
        WHERE pa.id = p_paciente_id AND pa.clinica_id = p_clinica_id
    ) THEN
        RAISE EXCEPTION 'O paciente não é desta clínica.' USING ERRCODE = '22023';
    END IF;

    -- Regrava o grupo inteiro: remove partes antigas que não vieram agora.
    DELETE FROM public.agendamentos
    WHERE grupo_id = v_grupo
      AND clinica_id = p_clinica_id;

    FOR v_parte IN SELECT * FROM jsonb_array_elements(p_partes)
    LOOP
        INSERT INTO public.agendamentos (
            grupo_id, parte_indice, parte_total, parte_titulo,
            clinica_id, paciente_id, profissional_id,
            procedimento, cor, status, data_hora, duracao_minutos,
            valor, desconto, valor_final, observacoes, tipo_registro
        ) VALUES (
            v_grupo,
            v_indice,
            v_total,
            NULLIF(v_parte->>'titulo', ''),
            p_clinica_id,
            p_paciente_id,
            p_profissional_id,
            p_procedimento,
            COALESCE(NULLIF(v_parte->>'cor', ''), p_cor, 'blue'),
            COALESCE(NULLIF(v_parte->>'status', ''), p_status, 'agendado'),
            (v_parte->>'data_hora')::TIMESTAMPTZ,
            COALESCE(NULLIF(v_parte->>'duracao', '')::INT, 60),
            COALESCE(p_valor, 0),
            COALESCE(p_desconto, 0),
            COALESCE(p_valor, 0) - COALESCE(p_desconto, 0),
            p_observacoes,
            'agendamento'
        )
        RETURNING id INTO v_id;

        v_ids := array_append(v_ids, v_id);
        v_indice := v_indice + 1;
    END LOOP;

    RETURN jsonb_build_object('grupo_id', v_grupo, 'ids', to_jsonb(v_ids), 'partes', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.agendamento_salvar_partes(UUID, BIGINT, UUID, BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendamento_salvar_partes(UUID, BIGINT, UUID, BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated, service_role;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261114_agenda_partes')
ON CONFLICT (id) DO NOTHING;

COMMIT;
