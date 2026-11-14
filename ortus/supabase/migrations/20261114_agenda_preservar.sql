-- =====================================================================
-- ORTUS — Agenda multipartes: preservar histórico financeiro ao editar
--
-- A primeira versão de `agendamento_salvar_partes` apagava e recriava as
-- partes. Isso zerava `data_pagamento`, `taxa_*`, `valor_bruto`,
-- `valor_liquido` e `tratamento_base_id` — dados que o financeiro usa.
--
-- Agora a função ATUALIZA as partes existentes (na ordem de `parte_indice`)
-- e só insere o que faltar / apaga o que sobrar. Também aceita
-- `p_id_existente` para transformar um agendamento avulso em grupo sem
-- perder o histórico.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.agendamento_salvar_partes(
    UUID, BIGINT, UUID, BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB
);

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
    p_partes JSONB,
    p_id_existente BIGINT DEFAULT NULL
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
    v_existentes BIGINT[];
    v_qtd_existentes SMALLINT := 0;
    v_id BIGINT;
    v_sobras BIGINT[];
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

    -- Partes que já existem neste grupo (ordem estável).
    IF p_grupo_id IS NOT NULL THEN
        SELECT array_agg(id ORDER BY parte_indice, id)
          INTO v_existentes
          FROM public.agendamentos
         WHERE grupo_id = p_grupo_id AND clinica_id = p_clinica_id;

        v_qtd_existentes := COALESCE(array_length(v_existentes, 1), 0);
    END IF;

    FOR v_parte IN SELECT * FROM jsonb_array_elements(p_partes)
    LOOP
        IF v_indice < v_qtd_existentes THEN
            -- Reaproveita a linha: pagamento, taxas e vínculo com tratamento
            -- ficam intactos.
            v_id := v_existentes[v_indice + 1];
            UPDATE public.agendamentos SET
                grupo_id = v_grupo,
                parte_indice = v_indice,
                parte_total = v_total,
                parte_titulo = NULLIF(v_parte->>'titulo', ''),
                paciente_id = p_paciente_id,
                profissional_id = p_profissional_id,
                procedimento = p_procedimento,
                cor = COALESCE(NULLIF(v_parte->>'cor', ''), p_cor, 'blue'),
                status = COALESCE(NULLIF(v_parte->>'status', ''), p_status, 'agendado'),
                data_hora = (v_parte->>'data_hora')::TIMESTAMPTZ,
                duracao_minutos = COALESCE(NULLIF(v_parte->>'duracao', '')::INT, 60),
                valor = COALESCE(p_valor, 0),
                desconto = COALESCE(p_desconto, 0),
                valor_final = COALESCE(p_valor, 0) - COALESCE(p_desconto, 0),
                observacoes = p_observacoes
            WHERE id = v_id AND clinica_id = p_clinica_id;
        ELSIF v_indice = 0 AND p_id_existente IS NOT NULL THEN
            -- Avulso virando grupo: atualiza a própria linha original.
            UPDATE public.agendamentos SET
                grupo_id = v_grupo,
                parte_indice = 0,
                parte_total = v_total,
                parte_titulo = NULLIF(v_parte->>'titulo', ''),
                paciente_id = p_paciente_id,
                profissional_id = p_profissional_id,
                procedimento = p_procedimento,
                cor = COALESCE(NULLIF(v_parte->>'cor', ''), p_cor, 'blue'),
                status = COALESCE(NULLIF(v_parte->>'status', ''), p_status, 'agendado'),
                data_hora = (v_parte->>'data_hora')::TIMESTAMPTZ,
                duracao_minutos = COALESCE(NULLIF(v_parte->>'duracao', '')::INT, 60),
                valor = COALESCE(p_valor, 0),
                desconto = COALESCE(p_desconto, 0),
                valor_final = COALESCE(p_valor, 0) - COALESCE(p_desconto, 0),
                observacoes = p_observacoes
            WHERE id = p_id_existente AND clinica_id = p_clinica_id
            RETURNING id INTO v_id;

            IF v_id IS NULL THEN
                -- Linha sumiu no meio do caminho: cria do zero.
                INSERT INTO public.agendamentos (
                    grupo_id, parte_indice, parte_total, parte_titulo,
                    clinica_id, paciente_id, profissional_id,
                    procedimento, cor, status, data_hora, duracao_minutos,
                    valor, desconto, valor_final, observacoes, tipo_registro
                ) VALUES (
                    v_grupo, 0, v_total, NULLIF(v_parte->>'titulo', ''),
                    p_clinica_id, p_paciente_id, p_profissional_id,
                    p_procedimento,
                    COALESCE(NULLIF(v_parte->>'cor', ''), p_cor, 'blue'),
                    COALESCE(NULLIF(v_parte->>'status', ''), p_status, 'agendado'),
                    (v_parte->>'data_hora')::TIMESTAMPTZ,
                    COALESCE(NULLIF(v_parte->>'duracao', '')::INT, 60),
                    COALESCE(p_valor, 0), COALESCE(p_desconto, 0),
                    COALESCE(p_valor, 0) - COALESCE(p_desconto, 0),
                    p_observacoes, 'agendamento'
                )
                RETURNING id INTO v_id;
            END IF;
        ELSE
            INSERT INTO public.agendamentos (
                grupo_id, parte_indice, parte_total, parte_titulo,
                clinica_id, paciente_id, profissional_id,
                procedimento, cor, status, data_hora, duracao_minutos,
                valor, desconto, valor_final, observacoes, tipo_registro
            ) VALUES (
                v_grupo, v_indice, v_total, NULLIF(v_parte->>'titulo', ''),
                p_clinica_id, p_paciente_id, p_profissional_id,
                p_procedimento,
                COALESCE(NULLIF(v_parte->>'cor', ''), p_cor, 'blue'),
                COALESCE(NULLIF(v_parte->>'status', ''), p_status, 'agendado'),
                (v_parte->>'data_hora')::TIMESTAMPTZ,
                COALESCE(NULLIF(v_parte->>'duracao', '')::INT, 60),
                COALESCE(p_valor, 0), COALESCE(p_desconto, 0),
                COALESCE(p_valor, 0) - COALESCE(p_desconto, 0),
                p_observacoes, 'agendamento'
            )
            RETURNING id INTO v_id;
        END IF;

        v_ids := array_append(v_ids, v_id);
        v_indice := v_indice + 1;
    END LOOP;

    -- Partes que sobraram (o atendimento encolheu).
    IF v_qtd_existentes > v_total THEN
        SELECT array_agg(id) INTO v_sobras
          FROM public.agendamentos
         WHERE id = ANY (v_existentes[v_total + 1 : v_qtd_existentes]);
        IF v_sobras IS NOT NULL THEN
            DELETE FROM public.agendamentos WHERE id = ANY (v_sobras);
        END IF;
    END IF;

    RETURN jsonb_build_object('grupo_id', v_grupo, 'ids', to_jsonb(v_ids), 'partes', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.agendamento_salvar_partes(
    UUID, BIGINT, UUID, BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB, BIGINT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendamento_salvar_partes(
    UUID, BIGINT, UUID, BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB, BIGINT
) TO authenticated, service_role;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261114_agenda_preservar')
ON CONFLICT (id) DO NOTHING;

COMMIT;
