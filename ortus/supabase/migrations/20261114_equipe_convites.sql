-- =====================================================================
-- ORTUS — Convites de equipe entre redes
--
-- Modelo de negócio:
--   rede 1..N clínicas 1..N funcionários (profissionais_clinicas)
--
-- Quando o administrador cadastra um funcionário com um e-mail que já
-- existe em OUTRA rede, o sistema não pode simplesmente sequestrar a
-- conta: cria um convite. O convidado vê o convite em destaque na caixa
-- de mensagens e decide aceitar (entra na clínica/rede que o convidou) ou
-- recusar. Aceitar não remove vínculos antigos: a pessoa passa a
-- participar de mais de uma rede.
--
-- Toda a escrita passa por funções SECURITY DEFINER com checagem
-- explícita de quem chamou — nada de INSERT direto na tabela.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.convites_equipe (
    id BIGSERIAL PRIMARY KEY,
    rede_id UUID REFERENCES public.redes(id) ON DELETE CASCADE,
    clinica_ids BIGINT[] NOT NULL,
    convidado_user_id UUID,
    convidado_profissional_id BIGINT REFERENCES public.profissionais(id) ON DELETE CASCADE,
    convidado_email TEXT NOT NULL,
    convidado_nome TEXT,
    convidante_profissional_id BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL,
    convidante_nome TEXT,
    cargo TEXT,
    mensagem TEXT,
    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'aceito', 'recusado', 'cancelado', 'expirado')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    respondido_em TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days'
);

CREATE INDEX IF NOT EXISTS convites_equipe_convidado_idx
    ON public.convites_equipe (convidado_user_id, status);
CREATE INDEX IF NOT EXISTS convites_equipe_email_idx
    ON public.convites_equipe (lower(convidado_email), status);
CREATE INDEX IF NOT EXISTS convites_equipe_rede_idx
    ON public.convites_equipe (rede_id, status);

-- Um convite pendente por (rede, e-mail).
CREATE UNIQUE INDEX IF NOT EXISTS convites_equipe_pendente_unico
    ON public.convites_equipe (coalesce(rede_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(convidado_email))
    WHERE status = 'pendente';

ALTER TABLE public.convites_equipe ENABLE ROW LEVEL SECURITY;

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

-- Sem INSERT/UPDATE/DELETE direto: use as funções abaixo.

-- ---------------------------------------------------------------------
-- Auxiliares internas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convite_pode_gerenciar(p_clinica_ids BIGINT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR (
        coalesce(array_length(p_clinica_ids, 1), 0) > 0
        AND NOT EXISTS (
            SELECT 1 FROM unnest(p_clinica_ids) AS cid
            WHERE NOT public.user_is_clinic_admin(cid)
        )
    );
$$;

-- ---------------------------------------------------------------------
-- Convidar: o dono da clínica chama com o e-mail da pessoa.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipe_convidar(
    p_email TEXT,
    p_clinica_ids BIGINT[],
    p_cargo TEXT DEFAULT NULL,
    p_mensagem TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := lower(btrim(coalesce(p_email, '')));
    v_meu RECORD;
    v_convidado RECORD;
    v_clinicas BIGINT[];
    v_rede UUID;
    v_convite_id BIGINT;
    v_ja_vinculado BOOLEAN;
BEGIN
    IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Informe um e-mail válido.' USING ERRCODE = '22023';
    END IF;

    SELECT p.id, p.nome, p.nivel_acesso, p.is_super_admin
      INTO v_meu
      FROM public.profissionais p
     WHERE p.user_id = auth.uid();

    IF v_meu.id IS NULL THEN
        RAISE EXCEPTION 'Perfil não encontrado.' USING ERRCODE = '42501';
    END IF;

    IF NOT (v_meu.is_super_admin OR v_meu.nivel_acesso = 'admin') THEN
        RAISE EXCEPTION 'Apenas administradores podem convidar pessoas.' USING ERRCODE = '42501';
    END IF;

    SELECT array_agg(DISTINCT cid ORDER BY cid) INTO v_clinicas
      FROM unnest(coalesce(p_clinica_ids, ARRAY[]::BIGINT[])) AS cid;

    IF v_clinicas IS NULL OR array_length(v_clinicas, 1) = 0 THEN
        RAISE EXCEPTION 'Selecione pelo menos uma unidade.' USING ERRCODE = '22023';
    END IF;

    IF NOT public.convite_pode_gerenciar(v_clinicas) THEN
        RAISE EXCEPTION 'Você só pode convidar para as suas clínicas.' USING ERRCODE = '42501';
    END IF;

    SELECT (array_agg(DISTINCT c.rede_id))[1] INTO v_rede
      FROM public.clinicas c
     WHERE c.id = ANY (v_clinicas);

    -- A pessoa precisa ter conta no Ortus. Se não tiver, o dono cria o
    -- funcionário normalmente (senha temporária) em vez de convidar.
    SELECT u.id AS user_id, p.id AS profissional_id, p.nome
      INTO v_convidado
      FROM auth.users u
      LEFT JOIN public.profissionais p ON p.user_id = u.id
     WHERE lower(u.email) = v_email
     LIMIT 1;

    IF v_convidado.user_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma conta Ortus usa este e-mail. Cadastre a pessoa como novo funcionário.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_convidado.profissional_id = v_meu.id THEN
        RAISE EXCEPTION 'Você já participa desta equipe.' USING ERRCODE = '22023';
    END IF;

    IF v_convidado.profissional_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.profissionais_clinicas pc
            WHERE pc.profissional_id = v_convidado.profissional_id
              AND pc.clinica_id = ANY (v_clinicas)
        ) INTO v_ja_vinculado;

        IF v_ja_vinculado THEN
            RAISE EXCEPTION 'Esta pessoa já faz parte da equipe desta unidade.' USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT id INTO v_convite_id
      FROM public.convites_equipe
     WHERE status = 'pendente'
       AND lower(convidado_email) = v_email
       AND coalesce(rede_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(v_rede, '00000000-0000-0000-0000-000000000000'::uuid)
     LIMIT 1;

    IF v_convite_id IS NOT NULL THEN
        UPDATE public.convites_equipe
           SET clinica_ids = v_clinicas,
               convidante_profissional_id = v_meu.id,
               convidante_nome = v_meu.nome,
               convidado_user_id = v_convidado.user_id,
               convidado_profissional_id = v_convidado.profissional_id,
               convidado_nome = v_convidado.nome,
               cargo = p_cargo,
               mensagem = p_mensagem,
               criado_em = now(),
               expires_at = now() + INTERVAL '14 days'
         WHERE id = v_convite_id;
    ELSE
        INSERT INTO public.convites_equipe (
            rede_id, clinica_ids, convidado_user_id, convidado_profissional_id,
            convidado_email, convidado_nome, convidante_profissional_id,
            convidante_nome, cargo, mensagem
        ) VALUES (
            v_rede, v_clinicas, v_convidado.user_id, v_convidado.profissional_id,
            v_email, v_convidado.nome, v_meu.id, v_meu.nome, p_cargo, p_mensagem
        )
        RETURNING id INTO v_convite_id;
    END IF;

    -- Reaproveita a notificação pendente em vez de empilhar duplicatas.
    UPDATE public.notificacoes
       SET titulo = 'Convite para nova rede',
           mensagem = v_meu.nome || ' convidou você para participar de ' ||
               (SELECT string_agg(c.nome, ', ' ORDER BY c.nome) FROM public.clinicas c WHERE c.id = ANY (v_clinicas)) ||
               '. Abra para aceitar ou recusar.',
           lida = false,
           expires_at = now() + INTERVAL '14 days',
           created_at = now()
     WHERE user_id = v_convidado.user_id AND tipo = 'convite' AND lida = false;

    IF NOT FOUND THEN
        INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, expires_at)
        VALUES (
            v_convidado.user_id,
            'Convite para nova rede',
            v_meu.nome || ' convidou você para participar de ' ||
                (SELECT string_agg(c.nome, ', ' ORDER BY c.nome) FROM public.clinicas c WHERE c.id = ANY (v_clinicas)) ||
                '. Abra para aceitar ou recusar.',
            'convite',
            now() + INTERVAL '14 days'
        );
    END IF;

    RETURN jsonb_build_object('id', v_convite_id, 'rede_id', v_rede, 'clinicas', to_jsonb(v_clinicas));
END;
$$;

-- ---------------------------------------------------------------------
-- Responder: o convidado aceita ou recusa.
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

    INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id, permissao)
    SELECT v_prof, cid, 'funcionario'
      FROM unnest(v_clinicas) AS cid
     WHERE NOT EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
        WHERE pc.profissional_id = v_prof AND pc.clinica_id = cid
     );

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
-- Cancelar: quem convidou (ou admin da clínica/rede) desfaz o convite.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipe_cancelar_convite(p_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_convite RECORD;
BEGIN
    SELECT * INTO v_convite FROM public.convites_equipe WHERE id = p_id FOR UPDATE;
    IF v_convite.id IS NULL THEN
        RAISE EXCEPTION 'Convite não encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT (public.is_super_admin() OR public.user_is_rede_admin(v_convite.rede_id) OR public.convite_pode_gerenciar(v_convite.clinica_ids)) THEN
        RAISE EXCEPTION 'Sem permissão para cancelar este convite.' USING ERRCODE = '42501';
    END IF;
    IF v_convite.status <> 'pendente' THEN
        RAISE EXCEPTION 'Este convite já foi respondido.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.convites_equipe SET status = 'cancelado', respondido_em = now() WHERE id = p_id;
    DELETE FROM public.notificacoes
     WHERE user_id = v_convite.convidado_user_id AND tipo = 'convite' AND lida = false;

    RETURN jsonb_build_object('status', 'cancelado');
END;
$$;

-- ---------------------------------------------------------------------
-- Lista de convites do usuário logado (para a caixa de mensagens).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meus_convites()
RETURNS TABLE (
    id BIGINT,
    status TEXT,
    criado_em TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    convidante_nome TEXT,
    cargo TEXT,
    mensagem TEXT,
    clinicas JSONB,
    rede_nome TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        c.id,
        c.status,
        c.criado_em,
        c.expires_at,
        c.convidante_nome,
        c.cargo,
        c.mensagem,
        (
            SELECT coalesce(jsonb_agg(jsonb_build_object('id', cl.id, 'nome', cl.nome) ORDER BY cl.nome), '[]'::jsonb)
              FROM public.clinicas cl WHERE cl.id = ANY (c.clinica_ids)
        ) AS clinicas,
        (SELECT r.nome FROM public.redes r WHERE r.id = c.rede_id) AS rede_nome
    FROM public.convites_equipe c
    WHERE (c.convidado_user_id = auth.uid()
           OR lower(c.convidado_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      AND c.status IN ('pendente', 'aceito', 'recusado')
    ORDER BY c.criado_em DESC
    LIMIT 50;
$$;

-- ---------------------------------------------------------------------
-- Grants (o visitante nem enxerga estas funções)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.convite_pode_gerenciar(BIGINT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipe_convidar(TEXT, BIGINT[], TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipe_responder_convite(BIGINT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipe_cancelar_convite(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meus_convites() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.equipe_convidar(TEXT, BIGINT[], TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipe_responder_convite(BIGINT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipe_cancelar_convite(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.meus_convites() TO authenticated, service_role;

REVOKE ALL ON TABLE public.convites_equipe FROM anon;
GRANT SELECT ON TABLE public.convites_equipe TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.convites_equipe_id_seq TO authenticated;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261114_equipe_convites')
ON CONFLICT (id) DO NOTHING;

COMMIT;
