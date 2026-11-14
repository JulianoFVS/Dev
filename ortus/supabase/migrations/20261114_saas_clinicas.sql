-- =====================================================================
-- ORTUS — Painel SaaS: cadastro de filiais e edição de clínica
--
-- O painel precisa cadastrar novas clínicas dentro de uma rede existente
-- (não só o onboarding inicial), além de corrigir endereço, contato e
-- limite de armazenamento. Tudo continua restrito aos donos: as funções
-- abaixo exigem `is_super_admin()` e ninguém mais executa.
--
-- Também devolve `user_id` na equipe da rede, para que o painel consiga
-- trocar o e-mail do dono pela API administrativa do Supabase.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Salvar (criar ou atualizar) uma clínica de uma rede
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_clinica_salvar(
    p_id BIGINT,
    p_rede UUID,
    p_dados JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id BIGINT;
    v_nome TEXT := nullif(btrim(coalesce(p_dados->>'nome', '')), '');
    v_limite INTEGER;
    v_total INTEGER;
BEGIN
    PERFORM public.saas_exigir_dono();

    IF p_rede IS NULL THEN
        RAISE EXCEPTION 'Informe a rede da clínica.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.redes WHERE id = p_rede) THEN
        RAISE EXCEPTION 'Rede não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    IF v_nome IS NULL THEN
        RAISE EXCEPTION 'Informe o nome da clínica.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_total
      FROM public.clinicas
     WHERE rede_id = p_rede AND (p_id IS NULL OR id <> p_id);

    IF v_total >= 10 THEN
        RAISE EXCEPTION 'Limite de 10 unidades por rede.' USING ERRCODE = '22023';
    END IF;

    v_limite := NULLIF(p_dados->>'limite_armazenamento_mb', '')::INTEGER;
    IF v_limite IS NOT NULL AND (v_limite < 100 OR v_limite > 1048576) THEN
        v_limite := NULL;
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.clinicas (
            nome, rede_id, is_matriz, telefone, email, cep, rua, numero,
            complemento, bairro, cidade, uf, limite_armazenamento_mb
        ) VALUES (
            v_nome, p_rede, false,
            nullif(btrim(coalesce(p_dados->>'telefone', '')), ''),
            nullif(btrim(coalesce(p_dados->>'email', '')), ''),
            nullif(btrim(coalesce(p_dados->>'cep', '')), ''),
            nullif(btrim(coalesce(p_dados->>'rua', '')), ''),
            nullif(btrim(coalesce(p_dados->>'numero', '')), ''),
            nullif(btrim(coalesce(p_dados->>'complemento', '')), ''),
            nullif(btrim(coalesce(p_dados->>'bairro', '')), ''),
            nullif(btrim(coalesce(p_dados->>'cidade', '')), ''),
            nullif(btrim(coalesce(p_dados->>'uf', '')), ''),
            coalesce(v_limite, 512)
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.clinicas SET
            nome = v_nome,
            telefone = CASE WHEN p_dados ? 'telefone' THEN nullif(btrim(p_dados->>'telefone'), '') ELSE telefone END,
            email = CASE WHEN p_dados ? 'email' THEN nullif(btrim(p_dados->>'email'), '') ELSE email END,
            cep = CASE WHEN p_dados ? 'cep' THEN nullif(btrim(p_dados->>'cep'), '') ELSE cep END,
            rua = CASE WHEN p_dados ? 'rua' THEN nullif(btrim(p_dados->>'rua'), '') ELSE rua END,
            numero = CASE WHEN p_dados ? 'numero' THEN nullif(btrim(p_dados->>'numero'), '') ELSE numero END,
            complemento = CASE WHEN p_dados ? 'complemento' THEN nullif(btrim(p_dados->>'complemento'), '') ELSE complemento END,
            bairro = CASE WHEN p_dados ? 'bairro' THEN nullif(btrim(p_dados->>'bairro'), '') ELSE bairro END,
            cidade = CASE WHEN p_dados ? 'cidade' THEN nullif(btrim(p_dados->>'cidade'), '') ELSE cidade END,
            uf = CASE WHEN p_dados ? 'uf' THEN nullif(btrim(p_dados->>'uf'), '') ELSE uf END,
            limite_armazenamento_mb = coalesce(v_limite, limite_armazenamento_mb)
        WHERE id = p_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Clínica não encontrada.' USING ERRCODE = 'P0002';
        END IF;
        v_id := p_id;
    END IF;

    RETURN jsonb_build_object('id', v_id, 'nome', v_nome, 'rede_id', p_rede);
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Remover uma filial (bloqueia se for a matriz ou a última da rede)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_clinica_excluir(p_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinica RECORD;
    v_restantes INTEGER;
BEGIN
    PERFORM public.saas_exigir_dono();

    SELECT id, nome, rede_id, is_matriz INTO v_clinica FROM public.clinicas WHERE id = p_id;
    IF v_clinica.id IS NULL THEN
        RAISE EXCEPTION 'Clínica não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    IF v_clinica.is_matriz THEN
        RAISE EXCEPTION 'A matriz da rede não pode ser removida por aqui.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_restantes FROM public.clinicas WHERE rede_id = v_clinica.rede_id AND id <> p_id;
    IF v_restantes = 0 THEN
        RAISE EXCEPTION 'A rede ficaria sem nenhuma unidade.' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.clinicas WHERE id = p_id;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Equipe da rede passa a trazer `user_id` (para trocar e-mail do dono)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_rede_detalhe(p_rede UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rede JSONB;
BEGIN
    PERFORM public.saas_exigir_dono();

    SELECT jsonb_build_object(
        'id', r.id, 'nome', r.nome, 'plano', r.plano, 'ativa', r.ativa,
        'valor_mensal_centavos', r.valor_mensal_centavos, 'dia_vencimento', r.dia_vencimento,
        'cnpj', r.cnpj, 'contato_nome', r.contato_nome, 'contato_email', r.contato_email,
        'contato_telefone', r.contato_telefone, 'observacao', r.observacao,
        'created_at', r.created_at, 'status_financeiro', public.rede_status_financeiro(r.id)
    ) INTO v_rede
    FROM public.redes r WHERE r.id = p_rede;

    IF v_rede IS NULL THEN
        RAISE EXCEPTION 'Rede não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'rede', v_rede,
        'clinicas', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'nome', c.nome, 'is_matriz', c.is_matriz, 'cidade', c.cidade, 'uf', c.uf,
                'email', c.email, 'telefone', c.telefone, 'logo_url', c.logo_url,
                'cep', c.cep, 'rua', c.rua, 'numero', c.numero, 'complemento', c.complemento,
                'bairro', c.bairro,
                'limite_armazenamento_mb', c.limite_armazenamento_mb,
                'armazenamento_bytes', public.armazenamento_uso_clinica(c.id),
                'profissionais', (SELECT count(*) FROM public.profissionais_clinicas pc WHERE pc.clinica_id = c.id),
                'pacientes', (SELECT count(*) FROM public.pacientes pa WHERE pa.clinica_id = c.id)
            ) ORDER BY c.is_matriz DESC, c.nome), '[]'::jsonb)
            FROM public.clinicas c WHERE c.rede_id = p_rede
        ),
        'profissionais', (
            SELECT coalesce(jsonb_agg(item ORDER BY item->>'nome'), '[]'::jsonb) FROM (
                SELECT jsonb_build_object(
                    'id', p.id, 'user_id', p.user_id, 'nome', p.nome, 'cargo', p.cargo,
                    'nivel_acesso', p.nivel_acesso, 'is_super_admin', p.is_super_admin,
                    'ativo', p.ativo, 'email', u.email, 'telefone', p.telefone, 'created_at', p.created_at,
                    'clinicas_rede', (
                        SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome) ORDER BY c.nome), '[]'::jsonb)
                          FROM public.profissionais_clinicas pc
                          JOIN public.clinicas c ON c.id = pc.clinica_id
                         WHERE pc.profissional_id = p.id AND c.rede_id = p_rede
                    ),
                    'outras_redes', (
                        SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('id', r2.id, 'nome', r2.nome)), '[]'::jsonb)
                          FROM public.profissionais_clinicas pc
                          JOIN public.clinicas c2 ON c2.id = pc.clinica_id
                          JOIN public.redes r2 ON r2.id = c2.rede_id
                         WHERE pc.profissional_id = p.id AND c2.rede_id IS DISTINCT FROM p_rede
                    ),
                    'clinicas_fora_da_rede', (
                        SELECT coalesce(jsonb_agg(jsonb_build_object('id', c3.id, 'nome', c3.nome) ORDER BY c3.nome), '[]'::jsonb)
                          FROM public.profissionais_clinicas pc
                          JOIN public.clinicas c3 ON c3.id = pc.clinica_id
                         WHERE pc.profissional_id = p.id AND c3.rede_id IS NULL
                    )
                ) AS item
                FROM public.profissionais p
                LEFT JOIN auth.users u ON u.id = p.user_id
                WHERE p.id IN (
                    SELECT pc.profissional_id
                      FROM public.profissionais_clinicas pc
                      JOIN public.clinicas c ON c.id = pc.clinica_id
                     WHERE c.rede_id = p_rede
                )
            ) s
        ),
        'faturas', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', f.id, 'competencia', f.competencia, 'vencimento', f.vencimento,
                'valor_centavos', f.valor_centavos, 'status', f.status, 'pago_em', f.pago_em,
                'metodo', f.metodo, 'observacao', f.observacao
            ) ORDER BY f.competencia DESC), '[]'::jsonb)
            FROM public.faturas f WHERE f.rede_id = p_rede
        ),
        'convites', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', cv.id, 'email', cv.convidado_email, 'status', cv.status,
                'criado_em', cv.criado_em, 'convidante', cv.convidante_nome, 'clinica_ids', cv.clinica_ids
            ) ORDER BY cv.criado_em DESC), '[]'::jsonb)
            FROM public.convites_equipe cv WHERE cv.rede_id = p_rede
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.saas_clinica_salvar(BIGINT, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_clinica_excluir(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_rede_detalhe(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.saas_clinica_salvar(BIGINT, UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_clinica_excluir(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_rede_detalhe(UUID) TO authenticated, service_role;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261114_saas_clinicas')
ON CONFLICT (id) DO NOTHING;

COMMIT;
