-- =====================================================================
-- ORTUS — Assinatura, cobrança e modo de consulta por falta de pagamento
--
-- O que esta migration cria:
--   1. `planos_saas`: catálogo de planos. O preço cobrado sai DAQUI, nunca
--      do navegador.
--   2. Colunas de assinatura em `redes` e de pagamento em `faturas`.
--   3. `assinatura_pedidos` (compra feita pela página pública),
--      `pagamento_eventos` (trilha de tudo o que o provedor informou) e
--      `assinatura_avisos` (caixa de saída dos e-mails de cobrança).
--   4. A régua: fatura vence em V; de V+1 a V+7 a rede fica "em atraso"
--      (aviso); a partir de V+8 fica "bloqueada" = MODO DE CONSULTA: lê
--      tudo, não grava nada. Nenhum dado é apagado. Pagou, reabre.
--   5. Gatilho que barra a gravação nas tabelas da clínica enquanto a rede
--      estiver bloqueada, suspensa ou cancelada.
--
-- Regras de convivência com o que já existia:
--   - Rede que já existe continua com `cobranca_automatica = false` e
--     estado `sem_cobranca`: nada é cobrado nem bloqueado sozinho. A fatura
--     manual do painel segue valendo.
--   - `UNIQUE (rede_id, competencia)` continua sendo a trava de uma fatura
--     por competência; a geração automática ainda confere o mês inteiro.
--   - ATENÇÃO: a chave "Rede ativa" do painel passa a valer de verdade.
--     Rede com `ativa = false` entra em modo de consulta.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Catálogo de planos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planos_saas (
    codigo TEXT PRIMARY KEY CHECK (codigo ~ '^[a-z0-9_]{2,40}$'),
    nome TEXT NOT NULL,
    descricao TEXT,
    valor_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_centavos >= 0),
    recursos JSONB NOT NULL DEFAULT '[]'::jsonb,
    destaque BOOLEAN NOT NULL DEFAULT false,
    -- publico = aparece na página de preços e pode ser comprado sozinho.
    publico BOOLEAN NOT NULL DEFAULT false,
    ativo BOOLEAN NOT NULL DEFAULT true,
    ordem INTEGER NOT NULL DEFAULT 0,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.planos_saas IS
    'Catálogo de planos do Ortus. O valor cobrado no checkout e na fatura automática é lido daqui, no servidor.';

-- Sementes: os três planos da página pública e os códigos que o painel já
-- usava (fora da vitrine). ON CONFLICT DO NOTHING: preço ajustado depois
-- não volta ao valor da semente.
INSERT INTO public.planos_saas (codigo, nome, descricao, valor_centavos, recursos, destaque, publico, ordem) VALUES
    ('basico', 'Básico', 'Para quem atende sozinho.', 9700,
        '["1 profissional", "Agenda", "Prontuário simples"]'::jsonb, false, true, 10),
    ('profissional', 'Profissional', 'Para consultórios com equipe pequena.', 19700,
        '["Até 3 profissionais", "Financeiro completo", "Anamnese personalizada", "Suporte prioritário"]'::jsonb, true, true, 20),
    ('clinica', 'Clínica', 'Para clínicas com várias cadeiras ou unidades.', 29700,
        '["Profissionais ilimitados", "Multiclínicas", "Gestão avançada"]'::jsonb, false, true, 30),
    ('essencial', 'Essencial', 'Plano combinado direto com a equipe do Ortus.', 0, '[]'::jsonb, false, false, 40),
    ('rede', 'Rede multiunidade', 'Plano combinado direto com a equipe do Ortus.', 0, '[]'::jsonb, false, false, 50),
    ('enterprise', 'Enterprise', 'Plano combinado direto com a equipe do Ortus.', 0, '[]'::jsonb, false, false, 60)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.planos_saas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planos_saas_select ON public.planos_saas;
CREATE POLICY planos_saas_select ON public.planos_saas
    FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE public.planos_saas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.planos_saas TO authenticated;
GRANT ALL ON TABLE public.planos_saas TO service_role;

-- ---------------------------------------------------------------------
-- 2. Rede: dados da assinatura
-- ---------------------------------------------------------------------
ALTER TABLE public.redes
    ADD COLUMN IF NOT EXISTS cobranca_automatica BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS assinatura_status TEXT NOT NULL DEFAULT 'sem_cobranca',
    ADD COLUMN IF NOT EXISTS assinatura_inicio DATE,
    ADD COLUMN IF NOT EXISTS divida_desde DATE,
    ADD COLUMN IF NOT EXISTS bloqueio_suspenso_ate DATE,
    ADD COLUMN IF NOT EXISTS bloqueada_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelamento_motivo TEXT,
    ADD COLUMN IF NOT EXISTS regua_desde DATE;

COMMENT ON COLUMN public.redes.regua_desde IS
    'Dia em que a régua de atraso passou a valer (cobrança automática ligada, assinatura reativada ou rede reativada). Fatura antiga em aberto conta como dívida a partir deste dia, não do vencimento original: ligar a cobrança nunca bloqueia na hora.';
COMMENT ON COLUMN public.redes.cobranca_automatica IS
    'true = o sistema gera a fatura do mês, cobra pelo provedor e aplica a régua de atraso. false = cobrança manual pelo painel, sem bloqueio automático.';
COMMENT ON COLUMN public.redes.assinatura_status IS
    'Cópia do estado calculado por assinatura_estado(). Quem decide se a clínica grava é a conta ao vivo (clinica_aceita_escrita), não esta coluna.';
COMMENT ON COLUMN public.redes.divida_desde IS
    'Vencimento da fatura não paga mais antiga (ou a data do estorno/contestação). NULL = nada em aberto.';
COMMENT ON COLUMN public.redes.bloqueio_suspenso_ate IS
    'Prazo extra dado pelo dono da plataforma: até esta data a rede em atraso não entra em modo de consulta.';

DO $checks$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'redes_assinatura_status_check') THEN
        ALTER TABLE public.redes
            ADD CONSTRAINT redes_assinatura_status_check
            CHECK (assinatura_status IN ('sem_cobranca', 'ativa', 'em_atraso', 'bloqueada', 'suspensa', 'cancelada'));
    END IF;
END
$checks$;

-- Notas internas e dados comerciais da rede não são para a equipe da clínica.
-- A policy `redes_select` deixa o membro ler a linha da própria rede; o grant
-- por coluna limita essa leitura ao que as telas usam (id e nome). O resto
-- chega por função: painel (`saas_*`) e `assinatura_situacao`.
REVOKE SELECT ON TABLE public.redes FROM authenticated;
GRANT SELECT (id, nome, created_at) ON TABLE public.redes TO authenticated;
-- Ninguém grava em `redes` pela API: o painel usa as funções `saas_*` e o
-- servidor usa o service role. (A RLS já negava por falta de policy; o grant
-- sai para a negativa não depender só dela.)
REVOKE INSERT, UPDATE, DELETE ON TABLE public.redes FROM authenticated;

-- ---------------------------------------------------------------------
-- 3. Fatura: origem e pagamento pelo provedor
-- ---------------------------------------------------------------------
ALTER TABLE public.faturas
    ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS provedor TEXT,
    ADD COLUMN IF NOT EXISTS provedor_ref TEXT,
    ADD COLUMN IF NOT EXISTS link_pagamento TEXT,
    ADD COLUMN IF NOT EXISTS link_expira_em TIMESTAMPTZ,
    -- Valor da cobrança aberta no provedor: fatura corrigida depois não reaproveita o link antigo.
    ADD COLUMN IF NOT EXISTS link_valor_centavos INTEGER,
    ADD COLUMN IF NOT EXISTS pagamento_ref TEXT,
    ADD COLUMN IF NOT EXISTS pagamento_status TEXT,
    ADD COLUMN IF NOT EXISTS pagamento_detalhe TEXT,
    ADD COLUMN IF NOT EXISTS pagamento_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS estornado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS contestado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS conciliado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.faturas.origem IS
    'manual = lançada no painel; automatica = gerada pela rotina do mês; checkout = primeira fatura de quem assinou pela página pública.';
COMMENT ON COLUMN public.faturas.provedor_ref IS 'Identificador da cobrança no provedor (preferência do checkout).';
COMMENT ON COLUMN public.faturas.pagamento_ref IS 'Identificador do pagamento que quitou (ou tentou quitar) a fatura.';

DO $status$
DECLARE
    c RECORD;
BEGIN
    -- O CHECK original aceitava só aberta/paga/cancelada. Remove pelo conteúdo,
    -- não pelo nome: em banco criado pelo painel o nome pode ser outro.
    FOR c IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'public.faturas'::regclass AND contype = 'c'
           AND conname <> 'faturas_status_check_v2'
           AND pg_get_constraintdef(oid) ILIKE '%status%'
           AND pg_get_constraintdef(oid) ILIKE '%aberta%'
    LOOP
        EXECUTE format('ALTER TABLE public.faturas DROP CONSTRAINT %I', c.conname);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faturas_status_check_v2') THEN
        ALTER TABLE public.faturas ADD CONSTRAINT faturas_status_check_v2
            CHECK (status IN ('aberta', 'paga', 'cancelada', 'estornada', 'contestada'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faturas_origem_check') THEN
        ALTER TABLE public.faturas ADD CONSTRAINT faturas_origem_check
            CHECK (origem IN ('manual', 'automatica', 'checkout'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faturas_pagamento_status_check') THEN
        ALTER TABLE public.faturas ADD CONSTRAINT faturas_pagamento_status_check
            CHECK (pagamento_status IS NULL OR pagamento_status IN ('pendente', 'aprovado', 'recusado', 'estornado', 'contestado', 'cancelado'));
    END IF;
END
$status$;

-- O mesmo pagamento nunca quita duas faturas.
CREATE UNIQUE INDEX IF NOT EXISTS faturas_pagamento_ref_uidx
    ON public.faturas (provedor, pagamento_ref) WHERE pagamento_ref IS NOT NULL AND status = 'paga';
CREATE INDEX IF NOT EXISTS faturas_em_divida_idx
    ON public.faturas (rede_id, vencimento) WHERE status IN ('aberta', 'estornada', 'contestada');

-- ---------------------------------------------------------------------
-- 4. Pedido de assinatura (compra pela página pública)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assinatura_pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    plano TEXT NOT NULL REFERENCES public.planos_saas(codigo),
    plano_nome TEXT NOT NULL,
    -- Valor copiado do catálogo na hora da compra; é o que o pagamento precisa bater.
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    clinica_nome TEXT NOT NULL CHECK (char_length(clinica_nome) BETWEEN 2 AND 120),
    responsavel_nome TEXT NOT NULL CHECK (char_length(responsavel_nome) BETWEEN 2 AND 120),
    email TEXT NOT NULL CHECK (email = lower(email) AND char_length(email) BETWEEN 5 AND 254),
    telefone TEXT CHECK (telefone IS NULL OR char_length(telefone) <= 30),
    aceite_termos_em TIMESTAMPTZ NOT NULL,
    -- Resumo (hash com segredo) do endereço de quem pediu: só para limitar abuso.
    origem_hash TEXT,
    status TEXT NOT NULL DEFAULT 'aguardando_pagamento'
        CHECK (status IN ('aguardando_pagamento', 'pago', 'provisionado', 'expirado', 'estornado', 'contestado', 'cancelado')),
    provedor TEXT,
    provedor_ref TEXT,
    link_pagamento TEXT,
    link_expira_em TIMESTAMPTZ,
    pagamento_ref TEXT,
    pagamento_status TEXT
        CHECK (pagamento_status IS NULL OR pagamento_status IN ('pendente', 'aprovado', 'recusado', 'estornado', 'contestado', 'cancelado')),
    pagamento_detalhe TEXT,
    pagamento_meio TEXT,
    pagamento_em TIMESTAMPTZ,
    conciliado_em TIMESTAMPTZ,
    rede_id UUID REFERENCES public.redes(id) ON DELETE SET NULL,
    clinica_id BIGINT REFERENCES public.clinicas(id) ON DELETE SET NULL,
    -- Sem FK para auth.users: apagar a conta não pode apagar o registro da compra.
    user_id UUID,
    fatura_id BIGINT REFERENCES public.faturas(id) ON DELETE SET NULL,
    provisionando_em TIMESTAMPTZ,
    provisionado_em TIMESTAMPTZ,
    provisionamento_erro TEXT,
    provisionamento_tentativas INTEGER NOT NULL DEFAULT 0,
    email_acesso_em TIMESTAMPTZ,
    email_acesso_erro TEXT,
    email_acesso_envios INTEGER NOT NULL DEFAULT 0,
    email_acesso_tentado_em TIMESTAMPTZ
);

COMMENT ON TABLE public.assinatura_pedidos IS
    'Compra de assinatura feita pela página pública. Gravada só pelo servidor. Quando o provedor confirma o pagamento, vira rede + clínica + conta de administrador.';

-- Um e-mail tem no máximo uma compra PAGA (que vira conta). Compras ainda sem
-- pagamento podem ser várias: a página pública nunca reaproveita, altera ou
-- cancela a compra de outra pessoa só porque o e-mail é igual. Quando uma
-- delas é paga, as outras do mesmo e-mail são encerradas; se outra também for
-- paga, o pagamento vai para conferência (duplicado).
DROP INDEX IF EXISTS public.assinatura_pedidos_email_vivo_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS assinatura_pedidos_email_pago_uidx
    ON public.assinatura_pedidos (email) WHERE status IN ('pago', 'provisionado');
CREATE INDEX IF NOT EXISTS assinatura_pedidos_email_idx ON public.assinatura_pedidos (email, criado_em DESC);
CREATE INDEX IF NOT EXISTS assinatura_pedidos_criado_idx ON public.assinatura_pedidos (criado_em DESC);
CREATE INDEX IF NOT EXISTS assinatura_pedidos_origem_idx ON public.assinatura_pedidos (origem_hash, criado_em DESC);
CREATE INDEX IF NOT EXISTS assinatura_pedidos_status_idx ON public.assinatura_pedidos (status, criado_em DESC);

-- ---------------------------------------------------------------------
-- 5. Trilha do que o provedor de pagamento informou
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pagamento_eventos (
    id BIGSERIAL PRIMARY KEY,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    vezes INTEGER NOT NULL DEFAULT 1,
    origem TEXT NOT NULL DEFAULT 'webhook',
    provedor TEXT NOT NULL,
    pagamento_ref TEXT NOT NULL,
    referencia TEXT,
    estado TEXT NOT NULL
        CHECK (estado IN ('pendente', 'aprovado', 'recusado', 'estornado', 'contestado', 'cancelado')),
    estado_provedor TEXT NOT NULL DEFAULT '',
    detalhe TEXT NOT NULL DEFAULT '',
    valor_centavos INTEGER,
    moeda TEXT,
    meio TEXT,
    alvo TEXT NOT NULL DEFAULT 'desconhecido' CHECK (alvo IN ('pedido', 'fatura', 'desconhecido')),
    pedido_id UUID,
    fatura_id BIGINT,
    rede_id UUID,
    resultado TEXT NOT NULL CHECK (resultado IN ('aplicado', 'ignorado', 'revisar')),
    motivo TEXT,
    resolvido_em TIMESTAMPTZ,
    resolvido_por UUID,
    UNIQUE (provedor, pagamento_ref, estado_provedor, detalhe)
);

COMMENT ON TABLE public.pagamento_eventos IS
    'Cada estado de pagamento informado pelo provedor e o que o sistema fez com ele. resultado = revisar pede conferência humana (valor diferente, pagamento em duplicidade, cobrança sem dono).';

CREATE INDEX IF NOT EXISTS pagamento_eventos_revisar_idx
    ON public.pagamento_eventos (criado_em DESC) WHERE resultado = 'revisar' AND resolvido_em IS NULL;
CREATE INDEX IF NOT EXISTS pagamento_eventos_rede_idx ON public.pagamento_eventos (rede_id, criado_em DESC);

-- ---------------------------------------------------------------------
-- 6. Caixa de saída dos avisos de cobrança
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assinatura_avisos (
    id BIGSERIAL PRIMARY KEY,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    rede_id UUID NOT NULL REFERENCES public.redes(id) ON DELETE CASCADE,
    fatura_id BIGINT REFERENCES public.faturas(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL
        CHECK (tipo IN ('fatura_gerada', 'fatura_atrasada', 'acesso_bloqueado', 'acesso_reaberto')),
    enviado_em TIMESTAMPTZ,
    destinatarios INTEGER,
    tentativas INTEGER NOT NULL DEFAULT 0,
    tentado_em TIMESTAMPTZ,
    -- Quem vai enviar reserva antes (webhook e rotina podem rodar juntos): o mesmo aviso não sai duas vezes.
    reservado_em TIMESTAMPTZ,
    erro TEXT
);
ALTER TABLE public.assinatura_avisos ADD COLUMN IF NOT EXISTS reservado_em TIMESTAMPTZ;

COMMENT ON TABLE public.assinatura_avisos IS
    'E-mails de cobrança a enviar. O banco registra o motivo do aviso na hora em que ele acontece; a rotina do servidor envia e marca. Aviso com erro continua aqui, à vista do painel.';

-- Aviso por fatura sai uma vez só.
CREATE UNIQUE INDEX IF NOT EXISTS assinatura_avisos_fatura_uidx
    ON public.assinatura_avisos (fatura_id, tipo) WHERE fatura_id IS NOT NULL AND tipo IN ('fatura_gerada', 'fatura_atrasada');
CREATE INDEX IF NOT EXISTS assinatura_avisos_pendentes_idx
    ON public.assinatura_avisos (criado_em) WHERE enviado_em IS NULL;

-- ---------------------------------------------------------------------
-- 7. RLS das tabelas novas: leitura só do dono da plataforma; escrita só
--    pelo servidor (service role) e pelas funções abaixo.
-- ---------------------------------------------------------------------
ALTER TABLE public.assinatura_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamento_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_avisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assinatura_pedidos_select ON public.assinatura_pedidos;
CREATE POLICY assinatura_pedidos_select ON public.assinatura_pedidos
    FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS pagamento_eventos_select ON public.pagamento_eventos;
CREATE POLICY pagamento_eventos_select ON public.pagamento_eventos
    FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS assinatura_avisos_select ON public.assinatura_avisos;
CREATE POLICY assinatura_avisos_select ON public.assinatura_avisos
    FOR SELECT TO authenticated USING (public.is_super_admin());

REVOKE ALL ON TABLE public.assinatura_pedidos, public.pagamento_eventos, public.assinatura_avisos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.assinatura_pedidos, public.pagamento_eventos, public.assinatura_avisos TO authenticated;
GRANT ALL ON TABLE public.assinatura_pedidos, public.pagamento_eventos, public.assinatura_avisos TO service_role;
REVOKE ALL ON SEQUENCE public.pagamento_eventos_id_seq, public.assinatura_avisos_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pagamento_eventos_id_seq, public.assinatura_avisos_id_seq TO service_role;

-- ---------------------------------------------------------------------
-- 8. A régua
-- ---------------------------------------------------------------------
-- "Hoje" da cobrança é o dia em Brasília, não o dia do servidor (UTC): em UTC
-- a fatura viraria atrasada às 21h do próprio dia do vencimento.
CREATE OR REPLACE FUNCTION public.hoje_br()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

-- Dias de tolerância depois do vencimento, antes do modo de consulta.
CREATE OR REPLACE FUNCTION public.assinatura_tolerancia_dias()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT 7;
$$;

-- Estado da assinatura. Função pura: a mesma conta serve para o gatilho que
-- barra a gravação, para a tela e para a rotina.
--   cancelada    → encerrada (modo de consulta)
--   suspensa     → chave "Rede ativa" desligada pelo dono (modo de consulta)
--   sem_cobranca → cobrança manual; nada automático
--   ativa        → nada vencido
--   em_atraso    → venceu há até 7 dias (ou há prazo extra): só aviso
--   bloqueada    → venceu há mais de 7 dias: modo de consulta
CREATE OR REPLACE FUNCTION public.assinatura_estado(
    p_ativa BOOLEAN,
    p_cancelada BOOLEAN,
    p_automatica BOOLEAN,
    p_divida DATE,
    p_suspenso DATE,
    p_hoje DATE
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN coalesce(p_cancelada, false) THEN 'cancelada'
        WHEN NOT coalesce(p_ativa, true) THEN 'suspensa'
        WHEN NOT coalesce(p_automatica, false) THEN 'sem_cobranca'
        WHEN p_divida IS NULL OR p_hoje <= p_divida THEN 'ativa'
        WHEN p_hoje <= p_divida + public.assinatura_tolerancia_dias() THEN 'em_atraso'
        WHEN p_suspenso IS NOT NULL AND p_hoje <= p_suspenso THEN 'em_atraso'
        ELSE 'bloqueada'
    END;
$$;

-- A clínica pode gravar? Conta ao vivo, pela data de hoje: o bloqueio não
-- depende de a rotina diária ter rodado.
CREATE OR REPLACE FUNCTION public.clinica_aceita_escrita(p_clinica BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NOT EXISTS (
        SELECT 1
          FROM public.clinicas c
          JOIN public.redes r ON r.id = c.rede_id
         WHERE c.id = p_clinica
           AND public.assinatura_estado(
                   r.ativa, r.cancelada_em IS NOT NULL, r.cobranca_automatica,
                   r.divida_desde, r.bloqueio_suspenso_ate, public.hoje_br()
               ) IN ('bloqueada', 'suspensa', 'cancelada')
    );
$$;

-- Recalcula a dívida mais antiga e o estado guardado da rede. Chamada pelo
-- gatilho de `faturas`, pelo gatilho de `redes` e pela rotina diária (que é
-- quem percebe a passagem dos dias). Quando o estado muda, deixa o aviso na
-- caixa de saída.
CREATE OR REPLACE FUNCTION public.assinatura_recalcular(p_rede UUID, p_hoje DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hoje DATE := coalesce(p_hoje, public.hoje_br());
    v_r public.redes%ROWTYPE;
    v_divida DATE;
    v_fatura BIGINT;
    v_antes TEXT;
    v_depois TEXT;
BEGIN
    SELECT * INTO v_r FROM public.redes WHERE id = p_rede FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Fatura estornada ou contestada volta a ser dívida, contada a partir do
    -- dia do estorno (não do vencimento antigo, que já passou há muito).
    -- E nenhuma dívida conta de antes de a régua valer (regua_desde): ligar a
    -- cobrança automática ou reativar a assinatura com fatura antiga em aberto
    -- começa em atraso, com os dias de tolerância, nunca direto em modo de consulta.
    SELECT d.ref, d.id INTO v_divida, v_fatura
      FROM (
        SELECT f.id,
               greatest(
                   CASE f.status
                       WHEN 'estornada' THEN greatest(f.vencimento, coalesce((f.estornado_em AT TIME ZONE 'America/Sao_Paulo')::date, f.vencimento))
                       WHEN 'contestada' THEN greatest(f.vencimento, coalesce((f.contestado_em AT TIME ZONE 'America/Sao_Paulo')::date, f.vencimento))
                       ELSE f.vencimento
                   END,
                   coalesce(v_r.regua_desde, f.vencimento)
               ) AS ref
          FROM public.faturas f
         WHERE f.rede_id = p_rede AND f.status IN ('aberta', 'estornada', 'contestada')
      ) d
     ORDER BY d.ref, d.id
     LIMIT 1;

    v_antes := v_r.assinatura_status;
    v_depois := public.assinatura_estado(
        v_r.ativa, v_r.cancelada_em IS NOT NULL, v_r.cobranca_automatica,
        v_divida, v_r.bloqueio_suspenso_ate, v_hoje
    );

    IF v_r.divida_desde IS DISTINCT FROM v_divida OR v_antes IS DISTINCT FROM v_depois THEN
        UPDATE public.redes SET
            divida_desde = v_divida,
            assinatura_status = v_depois,
            bloqueada_em = CASE WHEN v_depois = 'bloqueada' THEN coalesce(bloqueada_em, now()) ELSE NULL END
        WHERE id = p_rede;
    END IF;

    IF v_antes IS DISTINCT FROM v_depois AND v_r.cobranca_automatica THEN
        IF v_depois = 'em_atraso' AND v_antes <> 'bloqueada' AND v_fatura IS NOT NULL THEN
            INSERT INTO public.assinatura_avisos (rede_id, fatura_id, tipo)
            VALUES (p_rede, v_fatura, 'fatura_atrasada')
            ON CONFLICT DO NOTHING;
        ELSIF v_depois = 'bloqueada' THEN
            INSERT INTO public.assinatura_avisos (rede_id, fatura_id, tipo)
            VALUES (p_rede, v_fatura, 'acesso_bloqueado');
        ELSIF v_depois = 'ativa' AND v_antes = 'bloqueada' THEN
            INSERT INTO public.assinatura_avisos (rede_id, tipo) VALUES (p_rede, 'acesso_reaberto');
        END IF;
    END IF;

    RETURN jsonb_build_object('rede_id', p_rede, 'antes', v_antes, 'depois', v_depois, 'divida_desde', v_divida);
END;
$$;

-- Qualquer mudança em fatura refaz a conta da rede: marcar como paga no
-- painel reabre na hora, sem esperar a rotina.
CREATE OR REPLACE FUNCTION public.faturas_recalcular_assinatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.assinatura_recalcular(OLD.rede_id);
        RETURN OLD;
    END IF;
    PERFORM public.assinatura_recalcular(NEW.rede_id);
    IF TG_OP = 'UPDATE' AND OLD.rede_id IS DISTINCT FROM NEW.rede_id THEN
        PERFORM public.assinatura_recalcular(OLD.rede_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_faturas_assinatura ON public.faturas;
CREATE TRIGGER trg_faturas_assinatura
    AFTER INSERT OR UPDATE OR DELETE ON public.faturas
    FOR EACH ROW EXECUTE FUNCTION public.faturas_recalcular_assinatura();

-- Mudança nas chaves da rede (ativa, cobrança automática, prazo extra,
-- cancelamento) também refaz a conta. O UPDATE feito por assinatura_recalcular
-- não mexe nessas colunas, então o gatilho não se chama de novo.
CREATE OR REPLACE FUNCTION public.redes_recalcular_assinatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.assinatura_recalcular(NEW.id);
    RETURN NEW;
END;
$$;

-- Início da régua: quando a cobrança automática é ligada, a assinatura
-- cancelada é reativada ou a rede suspensa volta a ficar ativa, a dívida
-- antiga passa a contar de hoje (ver assinatura_recalcular).
CREATE OR REPLACE FUNCTION public.redes_inicio_da_regua()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.cobranca_automatica AND NEW.regua_desde IS NULL THEN
            NEW.regua_desde := coalesce(NEW.assinatura_inicio, public.hoje_br());
        END IF;
    ELSIF (NEW.cobranca_automatica AND NOT coalesce(OLD.cobranca_automatica, false))
       OR (OLD.cancelada_em IS NOT NULL AND NEW.cancelada_em IS NULL)
       OR (coalesce(NEW.ativa, true) AND NOT coalesce(OLD.ativa, true)) THEN
        NEW.regua_desde := public.hoje_br();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_redes_inicio_da_regua ON public.redes;
CREATE TRIGGER trg_redes_inicio_da_regua
    BEFORE INSERT OR UPDATE OF cobranca_automatica, cancelada_em, ativa ON public.redes
    FOR EACH ROW EXECUTE FUNCTION public.redes_inicio_da_regua();

DROP TRIGGER IF EXISTS trg_redes_assinatura ON public.redes;
CREATE TRIGGER trg_redes_assinatura
    AFTER UPDATE ON public.redes
    FOR EACH ROW
    WHEN (
        OLD.ativa IS DISTINCT FROM NEW.ativa
        OR OLD.cobranca_automatica IS DISTINCT FROM NEW.cobranca_automatica
        OR OLD.bloqueio_suspenso_ate IS DISTINCT FROM NEW.bloqueio_suspenso_ate
        OR OLD.cancelada_em IS DISTINCT FROM NEW.cancelada_em
    )
    EXECUTE FUNCTION public.redes_recalcular_assinatura();

DROP TRIGGER IF EXISTS trg_redes_assinatura_nova ON public.redes;
CREATE TRIGGER trg_redes_assinatura_nova
    AFTER INSERT ON public.redes
    FOR EACH ROW EXECUTE FUNCTION public.redes_recalcular_assinatura();

-- ---------------------------------------------------------------------
-- 9. Modo de consulta: barra a gravação nas tabelas da clínica
--
-- Gatilho (e não policy) por três motivos: a mensagem chega legível à tela;
-- vale também para as funções SECURITY DEFINER chamadas pela pessoa; e o
-- código PT402 faz o PostgREST responder HTTP 402.
--
-- Só barra pedido feito por pessoa logada. O servidor (service role), as
-- rotinas e as migrations passam: lembrete, sincronização de arquivos e a
-- limpeza do banco não dependem da assinatura.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assinatura_barrar_escrita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_linhas JSONB[];
    v_linha JSONB;
    v_txt TEXT;
    v_clinica BIGINT;
BEGIN
    IF coalesce(auth.role(), '') <> 'authenticated' THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    v_linhas := CASE TG_OP
        WHEN 'INSERT' THEN ARRAY[to_jsonb(NEW)]
        WHEN 'DELETE' THEN ARRAY[to_jsonb(OLD)]
        ELSE ARRAY[to_jsonb(OLD), to_jsonb(NEW)]
    END;

    FOREACH v_linha IN ARRAY v_linhas LOOP
        v_clinica := NULL;
        IF TG_ARGV[0] = 'paciente' THEN
            v_txt := v_linha ->> 'paciente_id';
            IF v_txt ~ '^[0-9a-fA-F-]{32,36}$' THEN
                SELECT p.clinica_id INTO v_clinica FROM public.pacientes p WHERE p.id = v_txt::uuid;
            END IF;
        ELSE
            v_txt := v_linha ->> 'clinica_id';
            IF v_txt ~ '^[0-9]{1,18}$' THEN
                v_clinica := v_txt::bigint;
            END IF;
        END IF;

        IF v_clinica IS NOT NULL AND NOT public.clinica_aceita_escrita(v_clinica) THEN
            RAISE EXCEPTION 'Assinatura suspensa: o sistema está em modo de consulta. Os dados continuam disponíveis para leitura; para voltar a gravar, regularize o pagamento em Assinatura.'
                USING ERRCODE = 'PT402', HINT = 'assinatura_bloqueada';
        END IF;
    END LOOP;

    RETURN coalesce(NEW, OLD);
END;
$$;

DO $gatilhos$
DECLARE
    v_tabela TEXT;
    -- Dados da clínica gravados pelas pessoas. Ficam de fora, de propósito:
    -- perfil e vínculos (profissionais, profissionais_clinicas, permissões),
    -- configurações, convites, notificações, relatos ao suporte, registros
    -- internos (auditoria, falhas, cota de arquivos, sincronização) e o
    -- histórico de mensagens recebidas pelo WhatsApp.
    v_por_clinica TEXT[] := ARRAY[
        'pacientes', 'agendamentos', 'paciente_tratamentos', 'paciente_debitos', 'anamnese_links',
        'despesas', 'comissoes_lancamentos', 'comissoes_regras', 'centros_custo',
        'kanban_cartoes', 'kanban_colunas', 'tarefas',
        'tratamentos_base', 'planos', 'planos_tratamentos', 'especialidades', 'profissionais_horarios',
        'whatsapp_agendadas', 'whatsapp_envios'
    ];
    v_por_paciente TEXT[] := ARRAY[
        'paciente_evolucoes', 'paciente_documentos', 'paciente_anamneses', 'anamneses', 'anexos', 'prontuarios'
    ];
BEGIN
    FOREACH v_tabela IN ARRAY v_por_clinica LOOP
        IF to_regclass('public.' || quote_ident(v_tabela)) IS NOT NULL AND EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = v_tabela AND column_name = 'clinica_id'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS aaa_assinatura_escrita ON public.%I', v_tabela);
            EXECUTE format(
                'CREATE TRIGGER aaa_assinatura_escrita BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
                'FOR EACH ROW EXECUTE FUNCTION public.assinatura_barrar_escrita(''clinica'')', v_tabela);
        END IF;
    END LOOP;

    FOREACH v_tabela IN ARRAY v_por_paciente LOOP
        IF to_regclass('public.' || quote_ident(v_tabela)) IS NOT NULL AND EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = v_tabela AND column_name = 'paciente_id'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS aaa_assinatura_escrita ON public.%I', v_tabela);
            EXECUTE format(
                'CREATE TRIGGER aaa_assinatura_escrita BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
                'FOR EACH ROW EXECUTE FUNCTION public.assinatura_barrar_escrita(''paciente'')', v_tabela);
        END IF;
    END LOOP;
END
$gatilhos$;

-- ---------------------------------------------------------------------
-- 10. Fatura do mês
--
-- Para cada rede com cobrança automática e em dia (ou em atraso): cria a
-- fatura da próxima competência 5 dias antes do vencimento. Rede bloqueada,
-- suspensa ou cancelada não acumula fatura nova.
-- Não duplica: confere o mês inteiro (fatura manual de qualquer dia conta,
-- inclusive cancelada: mês cancelado pelo dono não volta) e ainda respeita o
-- UNIQUE (rede_id, competencia).
-- Qual mês: o mês corrente, se ainda não tem fatura e o vencimento dele não
-- passou há mais de 10 dias; senão, o mês seguinte. Fatura lançada à mão para
-- um mês adiante não faz pular os meses do meio, e quem volta de um bloqueio
-- perto do fim do mês não recebe duas faturas com um dia de diferença.
-- ---------------------------------------------------------------------
-- p_rede limita a uma rede (ação "gerar fatura agora" do painel e testes).
DROP FUNCTION IF EXISTS public.assinatura_gerar_competencias(DATE);
CREATE OR REPLACE FUNCTION public.assinatura_gerar_competencias(p_hoje DATE DEFAULT NULL, p_rede UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hoje DATE := coalesce(p_hoje, public.hoje_br());
    v_antecedencia CONSTANT INTEGER := 5;
    v_atraso_maximo CONSTANT INTEGER := 10;
    r RECORD;
    v_dia INTEGER;
    v_mes DATE;
    v_comp DATE;
    v_venc DATE;
    v_id BIGINT;
    v_criadas JSONB := '[]'::jsonb;
BEGIN
    FOR r IN
        SELECT * FROM public.redes
         WHERE cobranca_automatica AND cancelada_em IS NULL AND ativa AND valor_mensal_centavos > 0
           AND (p_rede IS NULL OR id = p_rede)
         ORDER BY id
    LOOP
        IF public.assinatura_estado(r.ativa, false, true, r.divida_desde, r.bloqueio_suspenso_ate, v_hoje)
           NOT IN ('ativa', 'em_atraso') THEN
            CONTINUE;
        END IF;

        v_dia := least(greatest(r.dia_vencimento, 1), 28);
        v_mes := date_trunc('month', v_hoje)::date;
        v_comp := NULL;
        -- Mês corrente sem fatura e ainda a tempo de cobrar: é ele.
        IF NOT EXISTS (
            SELECT 1 FROM public.faturas f
             WHERE f.rede_id = r.id AND date_trunc('month', f.competencia)::date = v_mes
        ) AND v_hoje <= make_date(extract(year FROM v_mes)::int, extract(month FROM v_mes)::int, v_dia) + v_atraso_maximo THEN
            v_comp := v_mes;
        ELSE
            -- Senão, o mês seguinte (se ainda não tem fatura).
            v_mes := (v_mes + interval '1 month')::date;
            IF NOT EXISTS (
                SELECT 1 FROM public.faturas f
                 WHERE f.rede_id = r.id AND date_trunc('month', f.competencia)::date = v_mes
            ) THEN
                v_comp := v_mes;
            END IF;
        END IF;
        IF v_comp IS NULL THEN
            CONTINUE;
        END IF;
        v_venc := make_date(extract(year FROM v_comp)::int, extract(month FROM v_comp)::int, v_dia);

        IF v_hoje < v_venc - v_antecedencia THEN
            CONTINUE;
        END IF;
        -- Ciclo retomado (depois de um bloqueio, ou cobrança ligada no meio do
        -- mês): a fatura nunca nasce vencida nem com menos de 5 dias de prazo.
        IF v_venc < v_hoje + v_antecedencia THEN
            v_venc := v_hoje + v_antecedencia;
        END IF;

        v_id := NULL;
        INSERT INTO public.faturas (rede_id, competencia, vencimento, valor_centavos, status, origem)
        SELECT r.id, v_comp, v_venc, r.valor_mensal_centavos, 'aberta', 'automatica'
         WHERE NOT EXISTS (
            SELECT 1 FROM public.faturas f
             WHERE f.rede_id = r.id AND date_trunc('month', f.competencia)::date = v_comp
         )
        ON CONFLICT (rede_id, competencia) DO NOTHING
        RETURNING id INTO v_id;

        IF v_id IS NOT NULL THEN
            INSERT INTO public.assinatura_avisos (rede_id, fatura_id, tipo)
            VALUES (r.id, v_id, 'fatura_gerada')
            ON CONFLICT DO NOTHING;
            v_criadas := v_criadas || jsonb_build_object(
                'fatura_id', v_id, 'rede_id', r.id, 'competencia', v_comp, 'vencimento', v_venc
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('hoje', v_hoje, 'criadas', v_criadas);
END;
$$;

-- Passagem dos dias: refaz a conta de toda rede com cobrança automática.
CREATE OR REPLACE FUNCTION public.assinatura_recalcular_todas(p_hoje DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    v JSONB;
    v_mudancas JSONB := '[]'::jsonb;
    v_total INTEGER := 0;
BEGIN
    FOR r IN SELECT id FROM public.redes WHERE cobranca_automatica ORDER BY id LOOP
        v := public.assinatura_recalcular(r.id, p_hoje);
        v_total := v_total + 1;
        IF v IS NOT NULL AND (v ->> 'antes') IS DISTINCT FROM (v ->> 'depois') THEN
            v_mudancas := v_mudancas || v;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('redes', v_total, 'mudancas', v_mudancas);
END;
$$;

-- ---------------------------------------------------------------------
-- 11. Aplicar um pagamento informado pelo provedor
--
-- Entrada única para webhook, volta do checkout e conciliação. Tudo numa
-- transação, com a linha do alvo travada: duas entregas do mesmo aviso não
-- quitam duas vezes nem criam duas contas. O servidor sempre consulta o
-- estado ATUAL do pagamento no provedor antes de chamar; o corpo do webhook
-- nunca é a fonte.
--
-- p_referencia: 'pedido_<32 hex>' (compra nova) ou 'fatura_<id>' (mensalidade).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pagamento_aplicar(
    p_provedor TEXT,
    p_pagamento_ref TEXT,
    p_referencia TEXT,
    p_estado TEXT,
    p_estado_provedor TEXT,
    p_detalhe TEXT,
    p_valor_centavos INTEGER,
    p_moeda TEXT,
    p_quando TIMESTAMPTZ,
    p_meio TEXT,
    p_origem TEXT DEFAULT 'webhook'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_alvo TEXT := 'desconhecido';
    v_resultado TEXT := 'ignorado';
    v_motivo TEXT;
    v_quando TIMESTAMPTZ := coalesce(p_quando, now());
    v_p public.assinatura_pedidos%ROWTYPE;
    v_f public.faturas%ROWTYPE;
    v_pedido UUID;
    v_fatura BIGINT;
    v_rede UUID;
    v_provisionar BOOLEAN := false;
    v_valor_ok BOOLEAN;
BEGIN
    IF coalesce(btrim(p_provedor), '') = '' OR coalesce(btrim(p_pagamento_ref), '') = '' THEN
        RAISE EXCEPTION 'Provedor e identificador do pagamento são obrigatórios.' USING ERRCODE = '22023';
    END IF;
    IF p_estado NOT IN ('pendente', 'aprovado', 'recusado', 'estornado', 'contestado', 'cancelado') THEN
        RAISE EXCEPTION 'Estado de pagamento inválido.' USING ERRCODE = '22023';
    END IF;

    -- ------------------------------------------------------------ pedido
    IF p_referencia ~ '^pedido_[0-9a-f]{32}$' THEN
        v_alvo := 'pedido';
        v_pedido := substr(p_referencia, 8)::uuid;
        SELECT * INTO v_p FROM public.assinatura_pedidos WHERE id = v_pedido FOR UPDATE;

        IF NOT FOUND THEN
            v_resultado := 'revisar'; v_motivo := 'sem_alvo'; v_pedido := NULL;
        ELSE
            v_rede := v_p.rede_id;
            v_fatura := v_p.fatura_id;
            v_valor_ok := upper(coalesce(p_moeda, '')) = 'BRL' AND p_valor_centavos = v_p.valor_centavos;

            IF p_estado = 'aprovado' THEN
                IF NOT v_valor_ok THEN
                    v_resultado := 'revisar'; v_motivo := 'valor_divergente';
                ELSIF v_p.pagamento_ref = p_pagamento_ref AND v_p.status IN ('pago', 'provisionado') THEN
                    -- o mesmo pagamento de novo: nada muda; só reabre a criação da conta se ela ficou pela metade
                    v_resultado := 'ignorado'; v_motivo := 'ja_aplicado';
                    v_provisionar := v_p.status = 'pago';
                ELSIF v_p.pagamento_ref = p_pagamento_ref AND v_p.status = 'contestado' THEN
                    -- Contestação resolvida a favor: volta ao que era. Se, nesse meio-tempo,
                    -- a primeira fatura foi paga de novo (ou outra compra do mesmo e-mail
                    -- foi paga), o dinheiro entrou duas vezes: vai para conferência.
                    BEGIN
                        UPDATE public.assinatura_pedidos SET
                            status = CASE WHEN rede_id IS NULL THEN 'pago' ELSE 'provisionado' END,
                            pagamento_status = 'aprovado', pagamento_detalhe = p_detalhe, atualizado_em = now()
                        WHERE id = v_p.id;
                        v_resultado := 'aplicado'; v_motivo := 'contestacao_revertida';
                        v_provisionar := v_p.rede_id IS NULL;
                        IF v_p.fatura_id IS NOT NULL THEN
                            UPDATE public.faturas SET
                                status = 'paga', pagamento_status = 'aprovado', pagamento_detalhe = p_detalhe,
                                contestado_em = NULL, atualizado_em = now()
                            WHERE id = v_p.fatura_id AND pagamento_ref = p_pagamento_ref AND status = 'contestada';
                            IF NOT FOUND THEN
                                v_resultado := 'revisar'; v_motivo := 'duplicado';
                            END IF;
                        END IF;
                    EXCEPTION WHEN unique_violation THEN
                        v_resultado := 'revisar'; v_motivo := 'duplicado'; v_provisionar := false;
                    END;
                ELSIF v_p.status IN ('pago', 'provisionado', 'estornado', 'contestado') THEN
                    v_resultado := 'revisar'; v_motivo := 'duplicado';
                ELSIF EXISTS (
                    SELECT 1 FROM public.assinatura_pedidos o
                     WHERE o.email = v_p.email AND o.id <> v_p.id AND o.status IN ('pago', 'provisionado')
                ) THEN
                    -- A mesma pessoa pagou duas compras: uma já virou conta. Conferência para estornar esta.
                    v_resultado := 'revisar'; v_motivo := 'duplicado';
                ELSIF EXISTS (
                    SELECT 1 FROM auth.users u
                     WHERE lower(u.email) = v_p.email
                       AND coalesce(u.raw_app_meta_data ->> 'pedido_assinatura', '') <> v_p.id::text
                ) THEN
                    -- O e-mail ganhou conta por outro caminho (convite, outra compra) depois
                    -- do pedido: não nasce uma segunda conta. Conferência para estornar.
                    v_resultado := 'revisar'; v_motivo := 'email_em_uso';
                ELSE
                    -- aguardando_pagamento, expirado ou cancelado: quem pagou é atendido
                    BEGIN
                        UPDATE public.assinatura_pedidos SET
                            status = 'pago', provedor = p_provedor, pagamento_ref = p_pagamento_ref,
                            pagamento_status = 'aprovado', pagamento_detalhe = p_detalhe,
                            pagamento_meio = p_meio, pagamento_em = v_quando, atualizado_em = now()
                        WHERE id = v_p.id;
                        v_resultado := 'aplicado';
                        v_provisionar := true;
                        -- Uma conta por e-mail: as outras compras ainda sem pagamento do mesmo
                        -- e-mail se encerram. Se alguma delas também for paga, cai no "duplicado".
                        UPDATE public.assinatura_pedidos SET status = 'cancelado', atualizado_em = now()
                         WHERE email = v_p.email AND id <> v_p.id AND status = 'aguardando_pagamento';
                    EXCEPTION WHEN unique_violation THEN
                        -- outra compra do mesmo e-mail já foi paga
                        v_resultado := 'revisar'; v_motivo := 'duplicado'; v_provisionar := false;
                    END;
                END IF;

            ELSIF p_estado IN ('estornado', 'contestado') THEN
                IF v_p.pagamento_ref IS DISTINCT FROM p_pagamento_ref THEN
                    v_resultado := 'ignorado'; v_motivo := 'outro_pagamento';
                ELSIF v_p.status = p_estado AND p_estado = 'contestado' AND NOT EXISTS (
                    SELECT 1 FROM public.pagamento_eventos e
                     WHERE e.provedor = p_provedor AND e.pagamento_ref = p_pagamento_ref
                       AND e.estado_provedor = coalesce(p_estado_provedor, '') AND e.detalhe = coalesce(p_detalhe, '')
                ) THEN
                    -- A contestação mudou de fase (ex.: mediação virou chargeback, ou foi
                    -- decidida). O sentido de cada detalhe varia: o dono confere no provedor.
                    UPDATE public.assinatura_pedidos SET pagamento_detalhe = p_detalhe, atualizado_em = now() WHERE id = v_p.id;
                    v_resultado := 'revisar'; v_motivo := 'contestacao_atualizada';
                ELSIF v_p.status = p_estado THEN
                    v_resultado := 'ignorado'; v_motivo := 'ja_aplicado';
                ELSE
                    UPDATE public.assinatura_pedidos SET
                        status = p_estado, pagamento_status = p_estado, pagamento_detalhe = p_detalhe, atualizado_em = now()
                    WHERE id = v_p.id;
                    IF v_p.fatura_id IS NOT NULL THEN
                        UPDATE public.faturas SET
                            status = CASE p_estado WHEN 'estornado' THEN 'estornada' ELSE 'contestada' END,
                            pagamento_status = p_estado, pagamento_detalhe = p_detalhe,
                            estornado_em = CASE WHEN p_estado = 'estornado' THEN v_quando ELSE estornado_em END,
                            contestado_em = CASE WHEN p_estado = 'contestado' THEN v_quando ELSE contestado_em END,
                            atualizado_em = now()
                        WHERE id = v_p.fatura_id AND pagamento_ref = p_pagamento_ref;
                    END IF;
                    v_resultado := 'aplicado';
                END IF;

            ELSE
                -- pendente, recusado ou cancelado: só informa a tentativa; não desfaz pagamento aprovado
                IF v_p.pagamento_status = 'aprovado' OR v_p.status NOT IN ('aguardando_pagamento', 'expirado', 'cancelado') THEN
                    v_resultado := 'ignorado'; v_motivo := 'ja_pago';
                ELSE
                    UPDATE public.assinatura_pedidos SET
                        provedor = p_provedor, pagamento_ref = p_pagamento_ref, pagamento_status = p_estado,
                        pagamento_detalhe = p_detalhe, pagamento_meio = p_meio, atualizado_em = now()
                    WHERE id = v_p.id;
                    v_resultado := 'aplicado';
                END IF;
            END IF;
        END IF;

    -- ------------------------------------------------------------ fatura
    ELSIF p_referencia ~ '^fatura_[0-9]{1,18}$' THEN
        v_alvo := 'fatura';
        v_fatura := substr(p_referencia, 8)::bigint;
        SELECT * INTO v_f FROM public.faturas WHERE id = v_fatura FOR UPDATE;

        IF NOT FOUND THEN
            v_resultado := 'revisar'; v_motivo := 'sem_alvo'; v_fatura := NULL;
        ELSE
            v_rede := v_f.rede_id;
            v_valor_ok := upper(coalesce(p_moeda, '')) = 'BRL' AND p_valor_centavos = v_f.valor_centavos;

            IF p_estado = 'aprovado' THEN
                IF NOT v_valor_ok THEN
                    v_resultado := 'revisar'; v_motivo := 'valor_divergente';
                ELSIF v_f.status = 'paga' AND v_f.pagamento_ref = p_pagamento_ref THEN
                    v_resultado := 'ignorado'; v_motivo := 'ja_aplicado';
                ELSIF v_f.status = 'paga' THEN
                    -- já estava paga (por outro pagamento ou marcada à mão): dinheiro em dobro
                    v_resultado := 'revisar'; v_motivo := 'duplicado';
                ELSIF v_f.status = 'cancelada' THEN
                    v_resultado := 'revisar'; v_motivo := 'fatura_cancelada';
                ELSIF v_f.status = 'estornada' AND v_f.pagamento_ref = p_pagamento_ref THEN
                    v_resultado := 'ignorado'; v_motivo := 'ja_estornado';
                ELSE
                    BEGIN
                        UPDATE public.faturas SET
                            status = 'paga',
                            pago_em = (v_quando AT TIME ZONE 'America/Sao_Paulo')::date,
                            metodo = coalesce(p_meio, metodo),
                            provedor = p_provedor, pagamento_ref = p_pagamento_ref,
                            pagamento_status = 'aprovado', pagamento_detalhe = p_detalhe, pagamento_em = v_quando,
                            estornado_em = NULL, contestado_em = NULL, atualizado_em = now()
                        WHERE id = v_f.id;
                        v_resultado := 'aplicado';
                    EXCEPTION WHEN unique_violation THEN
                        -- este pagamento já quitou outra fatura
                        v_resultado := 'revisar'; v_motivo := 'duplicado';
                    END;
                END IF;

            ELSIF p_estado IN ('estornado', 'contestado') THEN
                IF v_f.pagamento_ref IS DISTINCT FROM p_pagamento_ref THEN
                    v_resultado := 'ignorado'; v_motivo := 'outro_pagamento';
                ELSIF p_estado = 'contestado' AND v_f.status = 'contestada' AND NOT EXISTS (
                    SELECT 1 FROM public.pagamento_eventos e
                     WHERE e.provedor = p_provedor AND e.pagamento_ref = p_pagamento_ref
                       AND e.estado_provedor = coalesce(p_estado_provedor, '') AND e.detalhe = coalesce(p_detalhe, '')
                ) THEN
                    -- Contestação mudou de fase: conferência no provedor (ver o caso do pedido).
                    UPDATE public.faturas SET pagamento_detalhe = p_detalhe, atualizado_em = now() WHERE id = v_f.id;
                    v_resultado := 'revisar'; v_motivo := 'contestacao_atualizada';
                ELSIF (p_estado = 'estornado' AND v_f.status = 'estornada')
                   OR (p_estado = 'contestado' AND v_f.status = 'contestada') THEN
                    v_resultado := 'ignorado'; v_motivo := 'ja_aplicado';
                ELSIF v_f.status NOT IN ('paga', 'estornada', 'contestada') THEN
                    v_resultado := 'ignorado'; v_motivo := 'fatura_nao_paga';
                ELSE
                    UPDATE public.faturas SET
                        status = CASE p_estado WHEN 'estornado' THEN 'estornada' ELSE 'contestada' END,
                        pagamento_status = p_estado, pagamento_detalhe = p_detalhe,
                        estornado_em = CASE WHEN p_estado = 'estornado' THEN v_quando ELSE estornado_em END,
                        contestado_em = CASE WHEN p_estado = 'contestado' THEN v_quando ELSE contestado_em END,
                        atualizado_em = now()
                    WHERE id = v_f.id;
                    v_resultado := 'aplicado';
                END IF;

            ELSE
                IF v_f.status <> 'aberta' OR v_f.pagamento_status = 'aprovado' THEN
                    v_resultado := 'ignorado'; v_motivo := 'fatura_fechada';
                ELSE
                    UPDATE public.faturas SET
                        provedor = p_provedor, pagamento_ref = p_pagamento_ref, pagamento_status = p_estado,
                        pagamento_detalhe = p_detalhe, atualizado_em = now()
                    WHERE id = v_f.id;
                    v_resultado := 'aplicado';
                END IF;
            END IF;
        END IF;

    ELSE
        v_resultado := 'revisar'; v_motivo := 'sem_alvo';
    END IF;

    -- Reembolso parcial: o provedor continua dizendo "aprovado". Fica para conferência.
    IF v_resultado <> 'revisar' AND p_estado = 'aprovado' AND coalesce(p_detalhe, '') = 'partially_refunded' THEN
        v_resultado := 'revisar'; v_motivo := 'estorno_parcial';
    END IF;

    INSERT INTO public.pagamento_eventos (
        origem, provedor, pagamento_ref, referencia, estado, estado_provedor, detalhe,
        valor_centavos, moeda, meio, alvo, pedido_id, fatura_id, rede_id, resultado, motivo
    ) VALUES (
        coalesce(p_origem, 'webhook'), p_provedor, p_pagamento_ref, left(p_referencia, 120), p_estado,
        coalesce(p_estado_provedor, ''), coalesce(p_detalhe, ''),
        p_valor_centavos, upper(p_moeda), p_meio, v_alvo, v_pedido, v_fatura, v_rede, v_resultado, v_motivo
    )
    ON CONFLICT (provedor, pagamento_ref, estado_provedor, detalhe) DO UPDATE SET
        vezes = public.pagamento_eventos.vezes + 1,
        atualizado_em = now(),
        -- "aplicado" não vira "ignorado" na segunda entrega; "revisar" continua pedindo conferência.
        -- E o mesmo estado que volta com outro desfecho (ex.: "aprovado" de novo depois de uma
        -- contestação, com a fatura já paga por outro pagamento) passa a pedir conferência.
        resultado = CASE
            WHEN EXCLUDED.resultado = 'revisar' THEN 'revisar'
            WHEN public.pagamento_eventos.resultado IN ('aplicado', 'revisar') THEN public.pagamento_eventos.resultado
            ELSE EXCLUDED.resultado
        END,
        motivo = CASE
            WHEN EXCLUDED.resultado = 'revisar' AND public.pagamento_eventos.resultado <> 'revisar' THEN EXCLUDED.motivo
            ELSE coalesce(public.pagamento_eventos.motivo, EXCLUDED.motivo)
        END;

    RETURN jsonb_build_object(
        'resultado', v_resultado, 'motivo', v_motivo, 'alvo', v_alvo,
        'pedido_id', v_pedido, 'fatura_id', v_fatura, 'rede_id', v_rede,
        'provisionar', v_provisionar
    );
END;
$$;

-- ---------------------------------------------------------------------
-- 12. Criar a conta de quem pagou
-- ---------------------------------------------------------------------
-- Existe conta com este e-mail? Só o servidor pergunta.
CREATE OR REPLACE FUNCTION public.assinatura_usuario_por_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(btrim(p_email)) LIMIT 1;
$$;

-- Reserva o pedido pago para UMA execução criar a conta. Devolve NULL quando
-- outra execução já está cuidando (ou quando não há o que fazer).
CREATE OR REPLACE FUNCTION public.assinatura_pedido_reservar(p_pedido UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v JSONB;
BEGIN
    UPDATE public.assinatura_pedidos p SET
        provisionando_em = now(),
        provisionamento_tentativas = p.provisionamento_tentativas + 1,
        atualizado_em = now()
    WHERE p.id = p_pedido
      AND p.status = 'pago'
      AND (p.provisionando_em IS NULL OR p.provisionando_em < now() - interval '3 minutes')
    RETURNING to_jsonb(p.*) INTO v;
    RETURN v;
END;
$$;

-- Rede + clínica + perfil de administrador + vínculo + primeira fatura (paga),
-- tudo numa transação. O usuário do Auth é criado antes, pelo servidor.
CREATE OR REPLACE FUNCTION public.assinatura_provisionar(p_pedido UUID, p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_p public.assinatura_pedidos%ROWTYPE;
    v_dia DATE;
    v_rede UUID;
    v_clinica BIGINT;
    v_prof BIGINT;
    v_fatura BIGINT;
BEGIN
    SELECT * INTO v_p FROM public.assinatura_pedidos WHERE id = p_pedido FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    IF v_p.status = 'provisionado' THEN
        RETURN jsonb_build_object(
            'ja_existia', true, 'rede_id', v_p.rede_id, 'clinica_id', v_p.clinica_id,
            'user_id', v_p.user_id, 'fatura_id', v_p.fatura_id
        );
    END IF;
    IF v_p.status <> 'pago' THEN
        RAISE EXCEPTION 'O pedido ainda não foi pago.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user AND lower(u.email) = v_p.email) THEN
        RAISE EXCEPTION 'A conta informada não confere com o e-mail do pedido.' USING ERRCODE = '22023';
    END IF;
    -- Não promove quem já trabalha em alguma clínica: virar administrador aqui
    -- mudaria o papel da pessoa nas clínicas em que ela já está.
    IF EXISTS (
        SELECT 1 FROM public.profissionais pr
          JOIN public.profissionais_clinicas pc ON pc.profissional_id = pr.id
         WHERE pr.user_id = p_user
    ) OR EXISTS (SELECT 1 FROM public.profissionais pr WHERE pr.user_id = p_user AND pr.is_super_admin) THEN
        RAISE EXCEPTION 'Este e-mail já tem cadastro no Ortus.' USING ERRCODE = '23505';
    END IF;

    v_dia := (coalesce(v_p.pagamento_em, now()) AT TIME ZONE 'America/Sao_Paulo')::date;

    INSERT INTO public.redes (
        nome, plano, valor_mensal_centavos, dia_vencimento, contato_nome, contato_email, contato_telefone,
        cobranca_automatica, assinatura_status, assinatura_inicio
    ) VALUES (
        v_p.clinica_nome, v_p.plano, v_p.valor_centavos, least(extract(day FROM v_dia)::int, 28),
        v_p.responsavel_nome, v_p.email, v_p.telefone, true, 'ativa', v_dia
    ) RETURNING id INTO v_rede;

    INSERT INTO public.clinicas (nome, rede_id, is_matriz, telefone, email, responsavel_nome)
    VALUES (v_p.clinica_nome, v_rede, true, v_p.telefone, v_p.email, v_p.responsavel_nome)
    RETURNING id INTO v_clinica;

    -- Perfil sem nenhum vínculo (criado por gatilho do Auth, se o banco tiver
    -- um) é reaproveitado; senão, nasce aqui.
    SELECT pr.id INTO v_prof FROM public.profissionais pr WHERE pr.user_id = p_user ORDER BY pr.id LIMIT 1;
    IF v_prof IS NULL THEN
        INSERT INTO public.profissionais (user_id, nome, cargo, nivel_acesso, precisa_trocar_senha, is_super_admin, telefone)
        VALUES (p_user, v_p.responsavel_nome, 'Dono(a) da Clínica', 'admin', true, false, v_p.telefone)
        RETURNING id INTO v_prof;
    ELSE
        UPDATE public.profissionais SET
            nome = v_p.responsavel_nome, cargo = 'Dono(a) da Clínica', nivel_acesso = 'admin',
            precisa_trocar_senha = true, telefone = coalesce(telefone, v_p.telefone)
        WHERE id = v_prof;
    END IF;

    INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id)
    VALUES (v_prof, v_clinica);

    INSERT INTO public.faturas (
        rede_id, competencia, vencimento, valor_centavos, status, pago_em, metodo, origem,
        provedor, provedor_ref, pagamento_ref, pagamento_status, pagamento_detalhe, pagamento_em, observacao
    ) VALUES (
        v_rede, date_trunc('month', v_dia)::date, v_dia, v_p.valor_centavos, 'paga', v_dia, v_p.pagamento_meio, 'checkout',
        v_p.provedor, v_p.provedor_ref, v_p.pagamento_ref, 'aprovado', v_p.pagamento_detalhe, v_p.pagamento_em,
        'Primeira mensalidade, paga na assinatura.'
    ) RETURNING id INTO v_fatura;

    UPDATE public.assinatura_pedidos SET
        status = 'provisionado', rede_id = v_rede, clinica_id = v_clinica, user_id = p_user, fatura_id = v_fatura,
        provisionado_em = now(), provisionamento_erro = NULL, atualizado_em = now()
    WHERE id = p_pedido;

    RETURN jsonb_build_object(
        'ja_existia', false, 'rede_id', v_rede, 'clinica_id', v_clinica,
        'profissional_id', v_prof, 'user_id', p_user, 'fatura_id', v_fatura
    );
END;
$$;

-- Quem recebe os avisos de cobrança de uma rede: o contato comercial e os
-- administradores (perfil admin com vínculo próprio, não convidado).
CREATE OR REPLACE FUNCTION public.assinatura_destinatarios(p_rede UUID)
RETURNS TABLE (email TEXT, nome TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT ON (lower(x.email)) lower(x.email), x.nome
      FROM (
        SELECT r.contato_email AS email, r.contato_nome AS nome, 0 AS ordem
          FROM public.redes r WHERE r.id = p_rede
        UNION ALL
        SELECT u.email::text, p.nome, 1
          FROM public.profissionais p
          JOIN auth.users u ON u.id = p.user_id
          JOIN public.profissionais_clinicas pc ON pc.profissional_id = p.id AND pc.convidado = false
          JOIN public.clinicas c ON c.id = pc.clinica_id
         WHERE c.rede_id = p_rede AND p.nivel_acesso = 'admin' AND coalesce(p.ativo, true)
      ) x
     WHERE x.email IS NOT NULL AND x.email LIKE '%@%'
     ORDER BY lower(x.email), x.ordem;
$$;

-- Próxima cobrança de uma rede (data ou NULL): a fatura em aberto mais antiga
-- ou, sem nada em aberto, o próximo vencimento de um mês que ainda não tem
-- fatura (mês pago adiantado ou cancelado pelo dono é pulado).
CREATE OR REPLACE FUNCTION public.assinatura_proxima_cobranca(p_rede UUID, p_hoje DATE DEFAULT NULL)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hoje DATE := coalesce(p_hoje, public.hoje_br());
    v_r public.redes%ROWTYPE;
    v_aberta DATE;
    v_dia INTEGER;
    v_mes DATE;
    v_data DATE;
BEGIN
    SELECT * INTO v_r FROM public.redes WHERE id = p_rede;
    IF NOT FOUND OR NOT v_r.cobranca_automatica OR v_r.cancelada_em IS NOT NULL OR NOT v_r.ativa THEN
        RETURN NULL;
    END IF;
    SELECT min(f.vencimento) INTO v_aberta
      FROM public.faturas f
     WHERE f.rede_id = p_rede AND f.status IN ('aberta', 'estornada', 'contestada');
    IF v_aberta IS NOT NULL THEN
        RETURN v_aberta;
    END IF;
    v_dia := least(greatest(v_r.dia_vencimento, 1), 28);
    v_mes := date_trunc('month', v_hoje)::date;
    FOR i IN 0..24 LOOP
        v_data := make_date(extract(year FROM v_mes)::int, extract(month FROM v_mes)::int, v_dia);
        IF v_data > v_hoje AND NOT EXISTS (
            SELECT 1 FROM public.faturas f
             WHERE f.rede_id = p_rede AND date_trunc('month', f.competencia)::date = v_mes
        ) THEN
            RETURN v_data;
        END IF;
        v_mes := (v_mes + interval '1 month')::date;
    END LOOP;
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- 13. O que a tela precisa saber da assinatura
--
-- Qualquer pessoa da clínica recebe o estado e se pode gravar (para a faixa
-- de aviso). Valores, datas e faturas só para o administrador da rede e para
-- o dono da plataforma.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assinatura_situacao(p_clinica BIGINT, p_detalhe BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_r public.redes%ROWTYPE;
    v_hoje DATE := public.hoje_br();
    v_estado TEXT;
    v_admin BOOLEAN;
    v_base JSONB;
    v_pendente JSONB;
    v_proxima DATE;
    v_bloqueio DATE;
BEGIN
    IF auth.uid() IS NULL OR NOT (public.user_has_clinic_access(p_clinica) OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Sem acesso a esta clínica.' USING ERRCODE = '42501';
    END IF;

    SELECT r.* INTO v_r
      FROM public.clinicas c JOIN public.redes r ON r.id = c.rede_id
     WHERE c.id = p_clinica;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('estado', 'sem_cobranca', 'pode_gravar', true, 'admin', false);
    END IF;

    v_estado := public.assinatura_estado(
        v_r.ativa, v_r.cancelada_em IS NOT NULL, v_r.cobranca_automatica,
        v_r.divida_desde, v_r.bloqueio_suspenso_ate, v_hoje
    );
    v_admin := public.user_is_rede_admin(v_r.id) OR public.is_super_admin();
    v_base := jsonb_build_object(
        'estado', v_estado,
        'pode_gravar', v_estado NOT IN ('bloqueada', 'suspensa', 'cancelada'),
        'admin', v_admin
    );
    IF NOT v_admin THEN
        RETURN v_base;
    END IF;

    SELECT jsonb_build_object(
               'id', f.id, 'competencia', f.competencia, 'vencimento', f.vencimento,
               'valor_centavos', f.valor_centavos, 'status', f.status,
               'pagamento_status', f.pagamento_status, 'pagamento_detalhe', f.pagamento_detalhe
           ), f.vencimento
      INTO v_pendente, v_proxima
      FROM public.faturas f
     WHERE f.rede_id = v_r.id AND f.status IN ('aberta', 'estornada', 'contestada')
     ORDER BY f.vencimento, f.id
     LIMIT 1;

    -- Sem fatura em aberto: o próximo vencimento de um mês ainda sem fatura.
    IF v_proxima IS NULL AND v_r.cobranca_automatica AND v_estado = 'ativa' THEN
        v_proxima := public.assinatura_proxima_cobranca(v_r.id, v_hoje);
    END IF;

    -- Primeiro dia em modo de consulta, se nada for pago.
    IF v_r.divida_desde IS NOT NULL AND v_r.cobranca_automatica THEN
        v_bloqueio := greatest(
            v_r.divida_desde + public.assinatura_tolerancia_dias() + 1,
            coalesce(v_r.bloqueio_suspenso_ate + 1, v_r.divida_desde)
        );
    END IF;

    v_base := v_base || jsonb_build_object(
        'rede_id', v_r.id,
        'rede_nome', v_r.nome,
        'plano', v_r.plano,
        'plano_nome', (SELECT pl.nome FROM public.planos_saas pl WHERE pl.codigo = v_r.plano),
        'valor_centavos', v_r.valor_mensal_centavos,
        'dia_vencimento', v_r.dia_vencimento,
        'cobranca_automatica', v_r.cobranca_automatica,
        'inicio', v_r.assinatura_inicio,
        'divida_desde', v_r.divida_desde,
        'bloqueio_em', v_bloqueio,
        'bloqueio_suspenso_ate', v_r.bloqueio_suspenso_ate,
        'tolerancia_dias', public.assinatura_tolerancia_dias(),
        'proxima_cobranca', v_proxima,
        'fatura_pendente', v_pendente,
        'hoje', v_hoje
    );

    IF coalesce(p_detalhe, false) THEN
        v_base := v_base || jsonb_build_object('faturas', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'id', f.id, 'competencia', f.competencia, 'vencimento', f.vencimento,
                       'valor_centavos', f.valor_centavos, 'status', f.status, 'pago_em', f.pago_em,
                       'metodo', f.metodo, 'origem', f.origem,
                       'pagamento_status', f.pagamento_status, 'pagamento_detalhe', f.pagamento_detalhe
                   ) ORDER BY f.competencia DESC, f.id DESC), '[]'::jsonb)
              FROM (
                SELECT * FROM public.faturas f2 WHERE f2.rede_id = v_r.id
                 ORDER BY f2.competencia DESC, f2.id DESC LIMIT 36
              ) f
        ));
    END IF;

    RETURN v_base;
END;
$$;

-- ---------------------------------------------------------------------
-- 14. Situação financeira usada pelo painel: estorno e contestação contam
--     como dívida. (Redefine a função de 20261114_saas_painel.)
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
            WHERE f.rede_id = p_rede AND f.status IN ('aberta', 'estornada', 'contestada') AND f.vencimento < public.hoje_br()
        ) THEN 'inadimplente'
        WHEN EXISTS (
            SELECT 1 FROM public.faturas f
            WHERE f.rede_id = p_rede AND f.status IN ('aberta', 'estornada', 'contestada')
        ) THEN 'em_aberto'
        WHEN EXISTS (
            SELECT 1 FROM public.faturas f WHERE f.rede_id = p_rede
        ) THEN 'em_dia'
        ELSE 'sem_fatura'
    END;
$$;

-- A trilha do painel passa a dizer quando a mudança foi do sistema (rotina,
-- webhook) e não de uma pessoa. (Redefine a função de 20261114_saas_auditoria.)
CREATE OR REPLACE FUNCTION public.auditar_saas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_nome TEXT;
    v_id TEXT;
    v_detalhes JSONB;
BEGIN
    IF v_user IS NOT NULL THEN
        SELECT p.nome INTO v_nome FROM public.profissionais p WHERE p.user_id = v_user LIMIT 1;
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_id := coalesce(to_jsonb(OLD) ->> 'id', to_jsonb(OLD) ->> 'codigo');
        v_detalhes := jsonb_build_object('antes', to_jsonb(OLD));
    ELSIF TG_OP = 'UPDATE' THEN
        v_id := coalesce(to_jsonb(NEW) ->> 'id', to_jsonb(NEW) ->> 'codigo');
        v_detalhes := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
    ELSE
        v_id := coalesce(to_jsonb(NEW) ->> 'id', to_jsonb(NEW) ->> 'codigo');
        v_detalhes := jsonb_build_object('depois', to_jsonb(NEW));
    END IF;

    INSERT INTO public.audit_log (user_id, profissional_nome, acao, entidade, entidade_id, detalhes)
    VALUES (
        v_user,
        coalesce(v_nome, CASE WHEN v_user IS NULL THEN 'Sistema (automático)' ELSE 'Painel SaaS' END),
        lower(TG_OP),
        TG_TABLE_NAME,
        v_id,
        v_detalhes
    );

    RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_auditar_planos_saas ON public.planos_saas;
CREATE TRIGGER trg_auditar_planos_saas
    AFTER INSERT OR UPDATE OR DELETE ON public.planos_saas
    FOR EACH ROW EXECUTE FUNCTION public.auditar_saas();

-- ---------------------------------------------------------------------
-- 15. Estado inicial das redes que já existem
-- ---------------------------------------------------------------------
DO $inicial$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.redes LOOP
        PERFORM public.assinatura_recalcular(r.id);
    END LOOP;
END
$inicial$;

-- ---------------------------------------------------------------------
-- 16. Quem executa o quê
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.hoje_br() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assinatura_tolerancia_dias() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assinatura_estado(BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clinica_aceita_escrita(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assinatura_situacao(BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hoje_br() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_tolerancia_dias() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_estado(BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clinica_aceita_escrita(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_situacao(BIGINT, BOOLEAN) TO authenticated, service_role;

-- Só o servidor.
REVOKE ALL ON FUNCTION public.assinatura_recalcular(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_recalcular_todas(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_gerar_competencias(DATE, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pagamento_aplicar(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_usuario_por_email(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_pedido_reservar(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_provisionar(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_destinatarios(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_proxima_cobranca(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_proxima_cobranca(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_recalcular(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_recalcular_todas(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_gerar_competencias(DATE, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.pagamento_aplicar(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_usuario_por_email(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_pedido_reservar(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_provisionar(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_destinatarios(UUID) TO service_role;

-- Funções de gatilho: ninguém chama direto.
REVOKE ALL ON FUNCTION public.faturas_recalcular_assinatura() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redes_recalcular_assinatura() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redes_inicio_da_regua() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_barrar_escrita() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auditar_saas() FROM PUBLIC, anon, authenticated;

-- Visitante não executa nada do schema public (ver 20261121_seguranca_reforco).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261124_assinaturas')
ON CONFLICT (id) DO NOTHING;

COMMIT;
