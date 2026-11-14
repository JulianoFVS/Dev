-- =====================================================================
-- ORTUS — Painel SaaS (uso exclusivo dos donos da plataforma)
--
-- O painel é gerencial: redes de clínicas, filiais, funcionários,
-- vínculos entre redes e situação financeira (fatura em aberto, paga,
-- vencida). TUDO passa por funções SECURITY DEFINER que exigem
-- `is_super_admin()` — não existe caminho de leitura para quem não é
-- dono, nem pela API pública do Supabase.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Dados comerciais da rede
-- ---------------------------------------------------------------------
ALTER TABLE public.redes
    ADD COLUMN IF NOT EXISTS plano TEXT NOT NULL DEFAULT 'essencial',
    ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS valor_mensal_centavos INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dia_vencimento SMALLINT NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS cnpj TEXT,
    ADD COLUMN IF NOT EXISTS contato_nome TEXT,
    ADD COLUMN IF NOT EXISTS contato_email TEXT,
    ADD COLUMN IF NOT EXISTS contato_telefone TEXT,
    ADD COLUMN IF NOT EXISTS observacao TEXT,
    ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

DO $checks$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'redes_dia_vencimento_check') THEN
        ALTER TABLE public.redes
            ADD CONSTRAINT redes_dia_vencimento_check
            CHECK (dia_vencimento BETWEEN 1 AND 28);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'redes_valor_check') THEN
        ALTER TABLE public.redes
            ADD CONSTRAINT redes_valor_check CHECK (valor_mensal_centavos >= 0);
    END IF;
END
$checks$;

-- ---------------------------------------------------------------------
-- 2. Faturas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faturas (
    id BIGSERIAL PRIMARY KEY,
    rede_id UUID NOT NULL REFERENCES public.redes(id) ON DELETE CASCADE,
    competencia DATE NOT NULL,
    vencimento DATE NOT NULL,
    valor_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_centavos >= 0),
    status TEXT NOT NULL DEFAULT 'aberta'
        CHECK (status IN ('aberta', 'paga', 'cancelada')),
    pago_em DATE,
    metodo TEXT,
    observacao TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (rede_id, competencia)
);

CREATE INDEX IF NOT EXISTS faturas_rede_idx ON public.faturas (rede_id, vencimento DESC);
CREATE INDEX IF NOT EXISTS faturas_abertas_idx ON public.faturas (vencimento) WHERE status = 'aberta';

ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faturas_select ON public.faturas;
CREATE POLICY faturas_select ON public.faturas
    FOR SELECT TO authenticated USING (public.is_super_admin());

REVOKE ALL ON TABLE public.faturas FROM anon;
GRANT SELECT ON TABLE public.faturas TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.faturas_id_seq TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Situação financeira da rede (derivada das faturas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rede_status_financeiro(p_rede UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN NOT coalesce((SELECT r.ativa FROM public.redes r WHERE r.id = p_rede), TRUE) THEN 'suspensa'
        WHEN EXISTS (
            SELECT 1 FROM public.faturas f
            WHERE f.rede_id = p_rede AND f.status = 'aberta' AND f.vencimento < CURRENT_DATE
        ) THEN 'inadimplente'
        WHEN EXISTS (
            SELECT 1 FROM public.faturas f
            WHERE f.rede_id = p_rede AND f.status = 'aberta'
        ) THEN 'em_aberto'
        WHEN EXISTS (
            SELECT 1 FROM public.faturas f WHERE f.rede_id = p_rede
        ) THEN 'em_dia'
        ELSE 'sem_fatura'
    END;
$$;

-- ---------------------------------------------------------------------
-- 4. Guarda de acesso: tudo abaixo é só para dono da plataforma
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_exigir_dono()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso restrito aos administradores da plataforma.' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Visão geral (lista de redes + métricas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_visao_geral()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_redes JSONB;
    v_totais JSONB;
BEGIN
    PERFORM public.saas_exigir_dono();

    SELECT coalesce(jsonb_agg(item ORDER BY item->>'nome'), '[]'::jsonb)
      INTO v_redes
      FROM (
        SELECT jsonb_build_object(
            'id', r.id,
            'nome', r.nome,
            'plano', r.plano,
            'ativa', r.ativa,
            'valor_mensal_centavos', r.valor_mensal_centavos,
            'dia_vencimento', r.dia_vencimento,
            'cnpj', r.cnpj,
            'contato_nome', r.contato_nome,
            'contato_email', r.contato_email,
            'contato_telefone', r.contato_telefone,
            'observacao', r.observacao,
            'created_at', r.created_at,
            'status_financeiro', public.rede_status_financeiro(r.id),
            'clinicas', (SELECT count(*) FROM public.clinicas c WHERE c.rede_id = r.id),
            'profissionais', (
                SELECT count(DISTINCT pc.profissional_id)
                  FROM public.profissionais_clinicas pc
                  JOIN public.clinicas c ON c.id = pc.clinica_id
                 WHERE c.rede_id = r.id
            ),
            'faturas_abertas', (
                SELECT count(*) FROM public.faturas f
                 WHERE f.rede_id = r.id AND f.status = 'aberta'
            ),
            'vencido_centavos', (
                SELECT coalesce(sum(f.valor_centavos), 0) FROM public.faturas f
                 WHERE f.rede_id = r.id AND f.status = 'aberta' AND f.vencimento < CURRENT_DATE
            ),
            'proximo_vencimento', (
                SELECT min(f.vencimento) FROM public.faturas f
                 WHERE f.rede_id = r.id AND f.status = 'aberta'
            ),
            'armazenamento_bytes', (
                SELECT coalesce(sum(public.armazenamento_uso_clinica(c.id)), 0)
                  FROM public.clinicas c WHERE c.rede_id = r.id
            )
        ) AS item
        FROM public.redes r
    ) sub;

    SELECT jsonb_build_object(
        'redes', (SELECT count(*) FROM public.redes),
        'redes_ativas', (SELECT count(*) FROM public.redes WHERE ativa),
        'redes_inadimplentes', (
            SELECT count(*) FROM public.redes r WHERE public.rede_status_financeiro(r.id) = 'inadimplente'
        ),
        'clinicas', (SELECT count(*) FROM public.clinicas),
        'clinicas_sem_rede', (SELECT count(*) FROM public.clinicas WHERE rede_id IS NULL),
        'profissionais', (SELECT count(*) FROM public.profissionais),
        'vinculos', (SELECT count(*) FROM public.profissionais_clinicas),
        'faturas_abertas', (SELECT count(*) FROM public.faturas WHERE status = 'aberta'),
        'vencido_centavos', (
            SELECT coalesce(sum(valor_centavos), 0) FROM public.faturas
             WHERE status = 'aberta' AND vencimento < CURRENT_DATE
        ),
        'recebido_centavos', (
            SELECT coalesce(sum(valor_centavos), 0) FROM public.faturas WHERE status = 'paga'
        )
    ) INTO v_totais;

    RETURN jsonb_build_object(
        'redes', v_redes,
        'totais', v_totais,
        'sem_rede', (
            SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'is_matriz', c.is_matriz) ORDER BY c.nome), '[]'::jsonb)
              FROM public.clinicas c WHERE c.rede_id IS NULL
        )
    );
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Detalhe de uma rede: filiais, funcionários, vínculos e faturas
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
                    'id', p.id, 'nome', p.nome, 'cargo', p.cargo, 'nivel_acesso', p.nivel_acesso,
                    'is_super_admin', p.is_super_admin, 'ativo', p.ativo, 'email', u.email,
                    'telefone', p.telefone, 'created_at', p.created_at,
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

-- ---------------------------------------------------------------------
-- 7. Escrita (dados comerciais)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_rede_salvar(p_id UUID, p_dados JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();

    UPDATE public.redes SET
        nome = coalesce(nullif(btrim(p_dados->>'nome'), ''), nome),
        plano = coalesce(nullif(btrim(p_dados->>'plano'), ''), plano),
        ativa = coalesce((p_dados->>'ativa')::BOOLEAN, ativa),
        valor_mensal_centavos = coalesce((p_dados->>'valor_mensal_centavos')::INTEGER, valor_mensal_centavos),
        dia_vencimento = coalesce((p_dados->>'dia_vencimento')::SMALLINT, dia_vencimento),
        cnpj = CASE WHEN p_dados ? 'cnpj' THEN nullif(btrim(p_dados->>'cnpj'), '') ELSE cnpj END,
        contato_nome = CASE WHEN p_dados ? 'contato_nome' THEN nullif(btrim(p_dados->>'contato_nome'), '') ELSE contato_nome END,
        contato_email = CASE WHEN p_dados ? 'contato_email' THEN nullif(btrim(p_dados->>'contato_email'), '') ELSE contato_email END,
        contato_telefone = CASE WHEN p_dados ? 'contato_telefone' THEN nullif(btrim(p_dados->>'contato_telefone'), '') ELSE contato_telefone END,
        observacao = CASE WHEN p_dados ? 'observacao' THEN nullif(btrim(p_dados->>'observacao'), '') ELSE observacao END,
        atualizado_em = now()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rede não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_rede_criar(p_nome TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    PERFORM public.saas_exigir_dono();

    IF coalesce(btrim(p_nome), '') = '' THEN
        RAISE EXCEPTION 'Informe o nome da rede.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.redes (nome) VALUES (btrim(p_nome)) RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id, 'nome', btrim(p_nome));
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_clinica_mover(p_clinica BIGINT, p_rede UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();

    IF p_rede IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.redes WHERE id = p_rede) THEN
        RAISE EXCEPTION 'Rede não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    IF p_rede IS NOT NULL AND (
        SELECT count(*) FROM public.clinicas WHERE rede_id = p_rede AND id <> p_clinica
    ) >= 10 THEN
        RAISE EXCEPTION 'Limite de 10 unidades por rede.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.clinicas SET rede_id = p_rede WHERE id = p_clinica;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Clínica não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 8. Escrita (faturas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_fatura_salvar(
    p_rede UUID,
    p_competencia DATE,
    p_vencimento DATE,
    p_valor_centavos INTEGER,
    p_status TEXT DEFAULT 'aberta',
    p_observacao TEXT DEFAULT NULL,
    p_pago_em DATE DEFAULT NULL,
    p_metodo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id BIGINT;
BEGIN
    PERFORM public.saas_exigir_dono();

    IF p_rede IS NULL OR p_competencia IS NULL OR p_vencimento IS NULL THEN
        RAISE EXCEPTION 'Rede, competência e vencimento são obrigatórios.' USING ERRCODE = '22023';
    END IF;
    IF p_status NOT IN ('aberta', 'paga', 'cancelada') THEN
        RAISE EXCEPTION 'Situação da fatura inválida.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.faturas (rede_id, competencia, vencimento, valor_centavos, status, observacao, pago_em, metodo)
    VALUES (p_rede, p_competencia, p_vencimento, coalesce(p_valor_centavos, 0), p_status, p_observacao,
            CASE WHEN p_status = 'paga' THEN coalesce(p_pago_em, CURRENT_DATE) ELSE p_pago_em END, p_metodo)
    ON CONFLICT (rede_id, competencia) DO UPDATE SET
        vencimento = EXCLUDED.vencimento,
        valor_centavos = EXCLUDED.valor_centavos,
        status = EXCLUDED.status,
        observacao = EXCLUDED.observacao,
        pago_em = EXCLUDED.pago_em,
        metodo = EXCLUDED.metodo,
        atualizado_em = now()
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_fatura_status(p_id BIGINT, p_status TEXT, p_pago_em DATE DEFAULT NULL, p_metodo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();
    IF p_status NOT IN ('aberta', 'paga', 'cancelada') THEN
        RAISE EXCEPTION 'Situação da fatura inválida.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.faturas SET
        status = p_status,
        pago_em = CASE WHEN p_status = 'paga' THEN coalesce(p_pago_em, CURRENT_DATE) ELSE NULL END,
        metodo = CASE WHEN p_status = 'paga' THEN p_metodo ELSE NULL END,
        atualizado_em = now()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fatura não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rede_status_financeiro(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_exigir_dono() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_visao_geral() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_rede_detalhe(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_rede_salvar(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_rede_criar(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_clinica_mover(BIGINT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_fatura_salvar(UUID, DATE, DATE, INTEGER, TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_fatura_status(BIGINT, TEXT, DATE, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rede_status_financeiro(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_visao_geral() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_rede_detalhe(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_rede_salvar(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_rede_criar(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_clinica_mover(BIGINT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_fatura_salvar(UUID, DATE, DATE, INTEGER, TEXT, TEXT, DATE, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_fatura_status(BIGINT, TEXT, DATE, TEXT) TO authenticated, service_role;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261114_saas_painel')
ON CONFLICT (id) DO NOTHING;

COMMIT;
