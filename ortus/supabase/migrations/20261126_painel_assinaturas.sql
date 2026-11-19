-- =====================================================================
-- ORTUS — Assinaturas no painel SaaS (uso exclusivo dos donos)
--
-- O painel passa a mostrar, por rede: plano, valor, estado da assinatura
-- (em dia, em atraso, modo de consulta, suspensa, cancelada), próxima
-- cobrança, faturas com o estado do pagamento, pagamentos recebidos do
-- provedor, avisos de cobrança e a compra de origem. E ganha as ações:
-- ligar/desligar a cobrança automática, dar prazo extra antes do modo de
-- consulta, cancelar e reativar a assinatura, e dar por conferido um
-- pagamento que pedia revisão.
--
-- Toda ação passa por saas_exigir_dono() e fica em audit_log (gatilho
-- auditar_saas em redes, faturas e pagamento_eventos).
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Conferência de pagamento: o que o dono decidiu
-- ---------------------------------------------------------------------
ALTER TABLE public.pagamento_eventos
    ADD COLUMN IF NOT EXISTS resolucao TEXT;
COMMENT ON COLUMN public.pagamento_eventos.resolucao IS
    'Anotação do dono da plataforma ao dar o pagamento por conferido (ex.: "estornado no provedor em 20/11").';

DROP TRIGGER IF EXISTS trg_auditar_pagamento_eventos ON public.pagamento_eventos;
CREATE TRIGGER trg_auditar_pagamento_eventos
    AFTER UPDATE ON public.pagamento_eventos
    FOR EACH ROW
    WHEN (OLD.resolvido_em IS DISTINCT FROM NEW.resolvido_em)
    EXECUTE FUNCTION public.auditar_saas();

-- ---------------------------------------------------------------------
-- 2. Próxima cobrança de uma rede: assinatura_proxima_cobranca, definida em
--    20261124_assinaturas (a tela da clínica usa a mesma conta).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 3. Resumo de assinaturas (lista de redes e indicadores)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_assinaturas_resumo()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hoje DATE := public.hoje_br();
    v_redes JSONB;
BEGIN
    PERFORM public.saas_exigir_dono();

    SELECT coalesce(jsonb_object_agg(x.id, x.item), '{}'::jsonb) INTO v_redes
      FROM (
        SELECT r.id::text AS id, jsonb_build_object(
            'estado', public.assinatura_estado(r.ativa, r.cancelada_em IS NOT NULL, r.cobranca_automatica, r.divida_desde, r.bloqueio_suspenso_ate, v_hoje),
            'cobranca_automatica', r.cobranca_automatica,
            'divida_desde', r.divida_desde,
            'bloqueio_suspenso_ate', r.bloqueio_suspenso_ate,
            'proxima_cobranca', public.assinatura_proxima_cobranca(r.id, v_hoje),
            'ultimo_pagamento_em', (
                SELECT max(coalesce(f.pagamento_em, f.pago_em::timestamptz)) FROM public.faturas f
                 WHERE f.rede_id = r.id AND f.status = 'paga'
            )
        ) AS item
          FROM public.redes r
      ) x;

    RETURN jsonb_build_object(
        'redes', v_redes,
        'totais', jsonb_build_object(
            'cobranca_automatica', (SELECT count(*) FROM public.redes WHERE cobranca_automatica),
            'em_atraso', (SELECT count(*) FROM public.redes r
                WHERE public.assinatura_estado(r.ativa, r.cancelada_em IS NOT NULL, r.cobranca_automatica, r.divida_desde, r.bloqueio_suspenso_ate, v_hoje) = 'em_atraso'),
            'modo_consulta', (SELECT count(*) FROM public.redes r
                WHERE public.assinatura_estado(r.ativa, r.cancelada_em IS NOT NULL, r.cobranca_automatica, r.divida_desde, r.bloqueio_suspenso_ate, v_hoje) IN ('bloqueada', 'suspensa', 'cancelada')),
            'compras_aguardando', (SELECT count(*) FROM public.assinatura_pedidos WHERE status IN ('aguardando_pagamento', 'pago')),
            'compras_com_erro', (SELECT count(*) FROM public.assinatura_pedidos
                WHERE (status = 'pago' AND provisionamento_erro IS NOT NULL) OR (status = 'provisionado' AND email_acesso_em IS NULL)),
            'pagamentos_revisar', (SELECT count(*) FROM public.pagamento_eventos WHERE resultado = 'revisar' AND resolvido_em IS NULL),
            'avisos_com_erro', (SELECT count(*) FROM public.assinatura_avisos WHERE enviado_em IS NULL AND tentativas > 0),
            'recebido_30d_centavos', (SELECT coalesce(sum(valor_centavos), 0) FROM public.faturas
                WHERE status = 'paga' AND coalesce(pagamento_em, pago_em::timestamptz) >= now() - interval '30 days')
        )
    );
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Assinatura de uma rede (aba "Assinatura" do detalhe)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_rede_assinatura(p_rede UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hoje DATE := public.hoje_br();
    v_r public.redes%ROWTYPE;
    v_estado TEXT;
    v_bloqueio DATE;
BEGIN
    PERFORM public.saas_exigir_dono();
    SELECT * INTO v_r FROM public.redes WHERE id = p_rede;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rede não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    v_estado := public.assinatura_estado(v_r.ativa, v_r.cancelada_em IS NOT NULL, v_r.cobranca_automatica, v_r.divida_desde, v_r.bloqueio_suspenso_ate, v_hoje);
    IF v_r.divida_desde IS NOT NULL AND v_r.cobranca_automatica THEN
        v_bloqueio := greatest(
            v_r.divida_desde + public.assinatura_tolerancia_dias() + 1,
            coalesce(v_r.bloqueio_suspenso_ate + 1, v_r.divida_desde)
        );
    END IF;

    RETURN jsonb_build_object(
        'estado', v_estado,
        'plano', v_r.plano,
        'plano_nome', (SELECT pl.nome FROM public.planos_saas pl WHERE pl.codigo = v_r.plano),
        'valor_centavos', v_r.valor_mensal_centavos,
        'dia_vencimento', v_r.dia_vencimento,
        'ativa', v_r.ativa,
        'cobranca_automatica', v_r.cobranca_automatica,
        'inicio', v_r.assinatura_inicio,
        'divida_desde', v_r.divida_desde,
        'bloqueio_em', v_bloqueio,
        'bloqueada_em', v_r.bloqueada_em,
        'bloqueio_suspenso_ate', v_r.bloqueio_suspenso_ate,
        'cancelada_em', v_r.cancelada_em,
        'cancelamento_motivo', v_r.cancelamento_motivo,
        'tolerancia_dias', public.assinatura_tolerancia_dias(),
        'proxima_cobranca', public.assinatura_proxima_cobranca(p_rede, v_hoje),
        'hoje', v_hoje,
        'planos', (
            SELECT coalesce(jsonb_agg(jsonb_build_object('codigo', pl.codigo, 'nome', pl.nome, 'valor_centavos', pl.valor_centavos, 'publico', pl.publico) ORDER BY pl.ordem), '[]'::jsonb)
              FROM public.planos_saas pl WHERE pl.ativo
        ),
        'pagamentos', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'id', e.id, 'criado_em', e.criado_em, 'atualizado_em', e.atualizado_em, 'vezes', e.vezes,
                       'origem', e.origem, 'pagamento_ref', e.pagamento_ref, 'estado', e.estado, 'detalhe', e.detalhe,
                       'valor_centavos', e.valor_centavos, 'meio', e.meio, 'alvo', e.alvo, 'fatura_id', e.fatura_id,
                       'resultado', e.resultado, 'motivo', e.motivo, 'resolvido_em', e.resolvido_em, 'resolucao', e.resolucao
                   ) ORDER BY e.criado_em DESC), '[]'::jsonb)
              FROM (SELECT * FROM public.pagamento_eventos WHERE rede_id = p_rede ORDER BY criado_em DESC LIMIT 40) e
        ),
        'avisos', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'id', a.id, 'criado_em', a.criado_em, 'tipo', a.tipo, 'fatura_id', a.fatura_id,
                       'enviado_em', a.enviado_em, 'destinatarios', a.destinatarios, 'tentativas', a.tentativas, 'erro', a.erro
                   ) ORDER BY a.criado_em DESC), '[]'::jsonb)
              FROM (SELECT * FROM public.assinatura_avisos WHERE rede_id = p_rede ORDER BY criado_em DESC LIMIT 20) a
        ),
        'pedido', (
            SELECT jsonb_build_object(
                       'id', p.id, 'criado_em', p.criado_em, 'status', p.status, 'plano_nome', p.plano_nome,
                       'valor_centavos', p.valor_centavos, 'email', p.email, 'responsavel_nome', p.responsavel_nome,
                       'pagamento_meio', p.pagamento_meio, 'pagamento_em', p.pagamento_em,
                       'provisionado_em', p.provisionado_em, 'email_acesso_em', p.email_acesso_em, 'email_acesso_erro', p.email_acesso_erro
                   )
              FROM public.assinatura_pedidos p WHERE p.rede_id = p_rede ORDER BY p.criado_em DESC LIMIT 1
        )
    );
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Compras e pendências de pagamento da plataforma inteira
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_assinaturas_pendencias()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();
    RETURN jsonb_build_object(
        'pedidos', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'id', p.id, 'criado_em', p.criado_em, 'status', p.status, 'plano_nome', p.plano_nome,
                       'valor_centavos', p.valor_centavos, 'clinica_nome', p.clinica_nome, 'responsavel_nome', p.responsavel_nome,
                       'email', p.email, 'pagamento_status', p.pagamento_status, 'pagamento_detalhe', p.pagamento_detalhe,
                       'pagamento_meio', p.pagamento_meio, 'pagamento_em', p.pagamento_em, 'rede_id', p.rede_id,
                       'provisionado_em', p.provisionado_em, 'provisionamento_erro', p.provisionamento_erro,
                       'provisionamento_tentativas', p.provisionamento_tentativas,
                       'email_acesso_em', p.email_acesso_em, 'email_acesso_erro', p.email_acesso_erro
                   ) ORDER BY p.criado_em DESC), '[]'::jsonb)
              FROM (SELECT * FROM public.assinatura_pedidos ORDER BY criado_em DESC LIMIT 60) p
        ),
        'revisar', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'id', e.id, 'criado_em', e.criado_em, 'vezes', e.vezes, 'pagamento_ref', e.pagamento_ref,
                       'referencia', e.referencia, 'estado', e.estado, 'detalhe', e.detalhe, 'valor_centavos', e.valor_centavos,
                       'meio', e.meio, 'alvo', e.alvo, 'pedido_id', e.pedido_id, 'fatura_id', e.fatura_id, 'rede_id', e.rede_id,
                       'rede_nome', (SELECT r.nome FROM public.redes r WHERE r.id = e.rede_id), 'motivo', e.motivo
                   ) ORDER BY e.criado_em DESC), '[]'::jsonb)
              FROM public.pagamento_eventos e WHERE e.resultado = 'revisar' AND e.resolvido_em IS NULL
        ),
        'avisos_com_erro', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'id', a.id, 'criado_em', a.criado_em, 'tipo', a.tipo, 'rede_id', a.rede_id,
                       'rede_nome', (SELECT r.nome FROM public.redes r WHERE r.id = a.rede_id),
                       'tentativas', a.tentativas, 'erro', a.erro
                   ) ORDER BY a.criado_em DESC), '[]'::jsonb)
              FROM (SELECT * FROM public.assinatura_avisos WHERE enviado_em IS NULL AND tentativas > 0 ORDER BY criado_em DESC LIMIT 40) a
        )
    );
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Ações
-- ---------------------------------------------------------------------
-- Cobrança automática ligada ou desligada. Ligar exige valor maior que zero.
CREATE OR REPLACE FUNCTION public.saas_assinatura_cobranca(p_rede UUID, p_automatica BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_valor INTEGER;
BEGIN
    PERFORM public.saas_exigir_dono();
    SELECT valor_mensal_centavos INTO v_valor FROM public.redes WHERE id = p_rede FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rede não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    IF coalesce(p_automatica, false) AND coalesce(v_valor, 0) <= 0 THEN
        RAISE EXCEPTION 'Defina o valor mensal da rede antes de ligar a cobrança automática.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.redes SET
        cobranca_automatica = coalesce(p_automatica, false),
        assinatura_inicio = CASE WHEN coalesce(p_automatica, false) THEN coalesce(assinatura_inicio, public.hoje_br()) ELSE assinatura_inicio END,
        atualizado_em = now()
    WHERE id = p_rede;
    RETURN public.saas_rede_assinatura(p_rede);
END;
$$;

-- Prazo extra: até a data informada a rede em atraso não entra em modo de consulta.
CREATE OR REPLACE FUNCTION public.saas_assinatura_prazo(p_rede UUID, p_ate DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();
    IF p_ate IS NOT NULL AND (p_ate < public.hoje_br() OR p_ate > public.hoje_br() + 60) THEN
        RAISE EXCEPTION 'O prazo extra vai de hoje até 60 dias.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.redes SET bloqueio_suspenso_ate = p_ate, atualizado_em = now() WHERE id = p_rede;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rede não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    RETURN public.saas_rede_assinatura(p_rede);
END;
$$;

-- Cancelar a assinatura: a rede entra em modo de consulta e não recebe fatura nova. Nada é apagado.
CREATE OR REPLACE FUNCTION public.saas_assinatura_cancelar(p_rede UUID, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();
    IF coalesce(btrim(p_motivo), '') = '' THEN
        RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.redes SET
        cancelada_em = coalesce(cancelada_em, now()),
        cancelamento_motivo = left(btrim(p_motivo), 300),
        atualizado_em = now()
    WHERE id = p_rede;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rede não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    RETURN public.saas_rede_assinatura(p_rede);
END;
$$;

-- Reativar: desfaz o cancelamento. Se houver fatura vencida, a régua volta a valer normalmente.
CREATE OR REPLACE FUNCTION public.saas_assinatura_reativar(p_rede UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();
    UPDATE public.redes SET cancelada_em = NULL, cancelamento_motivo = NULL, ativa = true, atualizado_em = now()
     WHERE id = p_rede;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rede não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    RETURN public.saas_rede_assinatura(p_rede);
END;
$$;

-- Pagamento que pedia revisão dado por conferido, com a anotação do dono.
CREATE OR REPLACE FUNCTION public.saas_pagamento_resolver(p_evento BIGINT, p_resolucao TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();
    IF coalesce(btrim(p_resolucao), '') = '' THEN
        RAISE EXCEPTION 'Anote o que foi feito (ex.: estornado no provedor).' USING ERRCODE = '22023';
    END IF;
    UPDATE public.pagamento_eventos SET
        resolvido_em = now(), resolvido_por = auth.uid(), resolucao = left(btrim(p_resolucao), 300), atualizado_em = now()
    WHERE id = p_evento AND resultado = 'revisar' AND resolvido_em IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pagamento não encontrado ou já conferido.' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 7. Fatura manual: o painel também marca estornada e contestada
--    (redefine a de 20261114_saas_painel)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saas_fatura_status(p_id BIGINT, p_status TEXT, p_pago_em DATE DEFAULT NULL, p_metodo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();
    IF p_status NOT IN ('aberta', 'paga', 'cancelada', 'estornada', 'contestada') THEN
        RAISE EXCEPTION 'Situação da fatura inválida.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.faturas SET
        status = p_status,
        pago_em = CASE WHEN p_status = 'paga' THEN coalesce(p_pago_em, public.hoje_br())
                       WHEN p_status IN ('estornada', 'contestada') THEN pago_em ELSE NULL END,
        metodo = CASE WHEN p_status = 'paga' THEN coalesce(p_metodo, metodo)
                      WHEN p_status IN ('estornada', 'contestada') THEN metodo ELSE NULL END,
        estornado_em = CASE WHEN p_status = 'estornada' THEN coalesce(estornado_em, now()) ELSE estornado_em END,
        contestado_em = CASE WHEN p_status = 'contestada' THEN coalesce(contestado_em, now()) ELSE contestado_em END,
        atualizado_em = now()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fatura não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Lançar ou editar fatura pelo painel (redefine a de 20261114_saas_painel):
--   - "hoje" é o dia de Brasília, não o UTC do servidor;
--   - estornada e contestada só valem mantidas (vêm do provedor ou de
--     saas_fatura_status): editar a observação de uma delas não dá erro;
--   - fatura paga pelo provedor não muda de valor nem de situação por aqui;
--   - mudou o valor, o link de pagamento aberto deixa de valer.
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
    v_atual public.faturas%ROWTYPE;
    v_existe BOOLEAN;
    v_valor INTEGER := coalesce(p_valor_centavos, 0);
BEGIN
    PERFORM public.saas_exigir_dono();

    IF p_rede IS NULL OR p_competencia IS NULL OR p_vencimento IS NULL THEN
        RAISE EXCEPTION 'Rede, competência e vencimento são obrigatórios.' USING ERRCODE = '22023';
    END IF;
    IF v_valor < 0 THEN
        RAISE EXCEPTION 'Valor inválido.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_atual FROM public.faturas
     WHERE rede_id = p_rede AND competencia = p_competencia
     FOR UPDATE;
    v_existe := FOUND;

    IF p_status NOT IN ('aberta', 'paga', 'cancelada')
       AND NOT (v_existe AND p_status IN ('estornada', 'contestada') AND p_status = v_atual.status) THEN
        RAISE EXCEPTION 'Situação da fatura inválida.' USING ERRCODE = '22023';
    END IF;
    IF v_existe AND v_atual.status = 'paga' AND v_atual.pagamento_ref IS NOT NULL
       AND (p_status <> 'paga' OR v_valor <> v_atual.valor_centavos) THEN
        RAISE EXCEPTION 'Fatura paga pelo provedor: valor e situação não mudam por aqui. O estorno é feito no Mercado Pago.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.faturas (rede_id, competencia, vencimento, valor_centavos, status, observacao, pago_em, metodo)
    VALUES (p_rede, p_competencia, p_vencimento, v_valor, p_status, p_observacao,
            CASE WHEN p_status = 'paga' THEN coalesce(p_pago_em, public.hoje_br()) ELSE p_pago_em END, p_metodo)
    ON CONFLICT (rede_id, competencia) DO UPDATE SET
        vencimento = EXCLUDED.vencimento,
        valor_centavos = EXCLUDED.valor_centavos,
        status = EXCLUDED.status,
        observacao = EXCLUDED.observacao,
        pago_em = CASE WHEN EXCLUDED.status IN ('estornada', 'contestada') THEN public.faturas.pago_em ELSE EXCLUDED.pago_em END,
        metodo = CASE WHEN EXCLUDED.status IN ('estornada', 'contestada') THEN public.faturas.metodo ELSE EXCLUDED.metodo END,
        link_pagamento = CASE WHEN EXCLUDED.valor_centavos IS DISTINCT FROM public.faturas.valor_centavos THEN NULL ELSE public.faturas.link_pagamento END,
        link_expira_em = CASE WHEN EXCLUDED.valor_centavos IS DISTINCT FROM public.faturas.valor_centavos THEN NULL ELSE public.faturas.link_expira_em END,
        atualizado_em = now()
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id);
END;
$$;

-- O detalhe da rede passa a trazer, em cada fatura, a origem e o estado do pagamento.
-- (Só as colunas novas no item de fatura; o resto da função é o de 20261114_saas_painel.)
CREATE OR REPLACE FUNCTION public.saas_rede_faturas(p_rede UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.saas_exigir_dono();
    RETURN (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', f.id, 'competencia', f.competencia, 'vencimento', f.vencimento,
                   'valor_centavos', f.valor_centavos, 'status', f.status, 'pago_em', f.pago_em,
                   'metodo', f.metodo, 'observacao', f.observacao, 'origem', f.origem,
                   'pagamento_status', f.pagamento_status, 'pagamento_detalhe', f.pagamento_detalhe,
                   'pagamento_em', f.pagamento_em, 'estornado_em', f.estornado_em, 'contestado_em', f.contestado_em,
                   'tem_link', f.link_pagamento IS NOT NULL AND f.link_expira_em > now()
               ) ORDER BY f.competencia DESC, f.id DESC), '[]'::jsonb)
          FROM public.faturas f WHERE f.rede_id = p_rede
    );
END;
$$;

-- ---------------------------------------------------------------------
-- 8. Quem executa
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.assinatura_proxima_cobranca(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_proxima_cobranca(UUID, DATE) TO service_role;

REVOKE ALL ON FUNCTION public.saas_assinaturas_resumo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_rede_assinatura(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_assinaturas_pendencias() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_assinatura_cobranca(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_assinatura_prazo(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_assinatura_cancelar(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_assinatura_reativar(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_pagamento_resolver(BIGINT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_rede_faturas(UUID) FROM PUBLIC, anon;
-- As funções saas_* conferem o dono por dentro; authenticated precisa poder chamar.
GRANT EXECUTE ON FUNCTION public.saas_assinaturas_resumo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_rede_assinatura(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_assinaturas_pendencias() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_assinatura_cobranca(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_assinatura_prazo(UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_assinatura_cancelar(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_assinatura_reativar(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_pagamento_resolver(BIGINT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_rede_faturas(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_fatura_status(BIGINT, TEXT, DATE, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.saas_fatura_salvar(UUID, DATE, DATE, INTEGER, TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saas_fatura_salvar(UUID, DATE, DATE, INTEGER, TEXT, TEXT, DATE, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261126_painel_assinaturas')
ON CONFLICT (id) DO NOTHING;

COMMIT;
