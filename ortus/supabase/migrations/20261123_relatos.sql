-- =====================================================================
-- ORTUS — Relatos de bug e sugestão
--
-- A tela de Ajuda deixa qualquer pessoa da clínica relatar um problema ou
-- sugerir uma melhoria. O relato fica guardado aqui e aparece na fila do
-- painel SaaS. O e-mail para os donos da plataforma é só um aviso: se ele
-- não sair, o relato continua na fila (as colunas `email_*` contam o que
-- aconteceu com o aviso).
--
-- Quem grava é a rota POST /api/relatos, com service role, depois de
-- validar o login e o limite de envios por hora. Por isso não existe
-- policy de INSERT: pela API ninguém insere direto.
--
-- Pela API, o dono da plataforma só muda o `status` (e apaga). Toda
-- mudança de status e toda exclusão ficam em `audit_log`, gravadas pelo
-- banco — o mesmo desenho do gatilho `auditar_saas` do painel.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.relatos_suporte (
    id BIGSERIAL PRIMARY KEY,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    tipo TEXT NOT NULL CHECK (tipo IN ('bug', 'sugestao')),
    assunto TEXT NOT NULL CHECK (char_length(assunto) BETWEEN 1 AND 160),
    descricao TEXT NOT NULL CHECK (char_length(descricao) BETWEEN 1 AND 5000),
    -- Sem FK para auth.users de propósito: remover a conta de quem relatou
    -- não pode apagar o relato nem ser impedido por ele. O nome fica copiado.
    autor_user_id UUID NOT NULL,
    autor_profissional_id BIGINT,
    autor_nome TEXT,
    clinica_id BIGINT REFERENCES public.clinicas(id) ON DELETE SET NULL,
    -- Cópia do nome na hora do envio: a fila continua legível se a clínica sumir.
    clinica_nome TEXT,
    status TEXT NOT NULL DEFAULT 'aberto'
        CHECK (status IN ('aberto', 'em_analise', 'resolvido', 'descartado')),
    atualizado_em TIMESTAMPTZ,
    email_enviado_em TIMESTAMPTZ,
    email_erro TEXT
);

CREATE INDEX IF NOT EXISTS relatos_suporte_criado_idx ON public.relatos_suporte (criado_em DESC);
CREATE INDEX IF NOT EXISTS relatos_suporte_status_idx ON public.relatos_suporte (status, criado_em DESC);
-- A rota conta os envios de cada pessoa na última hora antes de aceitar outro.
CREATE INDEX IF NOT EXISTS relatos_suporte_autor_idx ON public.relatos_suporte (autor_user_id, criado_em DESC);

COMMENT ON TABLE public.relatos_suporte IS
    'Relatos de bug e sugestões enviados pela tela de Ajuda. Gravados só pelo servidor (POST /api/relatos); lidos por quem enviou e pelos donos da plataforma.';
COMMENT ON COLUMN public.relatos_suporte.atualizado_em IS
    'Última mudança de status, carimbada pelo banco. NULL = o relato nunca saiu de "aberto".';
COMMENT ON COLUMN public.relatos_suporte.email_enviado_em IS
    'Quando o aviso aos donos da plataforma foi aceito pela Resend. NULL = não saiu (veja email_erro).';
COMMENT ON COLUMN public.relatos_suporte.email_erro IS
    'Motivo curto de o aviso por e-mail não ter saído. O relato vale mesmo assim.';

-- ---------------------------------------------------------------------
-- RLS: quem enviou lê o próprio; o dono da plataforma lê, atualiza e apaga
-- ---------------------------------------------------------------------
ALTER TABLE public.relatos_suporte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relatos_suporte_select ON public.relatos_suporte;
CREATE POLICY relatos_suporte_select ON public.relatos_suporte
    FOR SELECT TO authenticated
    USING (autor_user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS relatos_suporte_update ON public.relatos_suporte;
CREATE POLICY relatos_suporte_update ON public.relatos_suporte
    FOR UPDATE TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS relatos_suporte_delete ON public.relatos_suporte;
CREATE POLICY relatos_suporte_delete ON public.relatos_suporte
    FOR DELETE TO authenticated
    USING (public.is_super_admin());

-- ---------------------------------------------------------------------
-- Mudança de status: hora carimbada pelo banco
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.relatos_suporte_carimbar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_relatos_suporte_carimbar ON public.relatos_suporte;
CREATE TRIGGER trg_relatos_suporte_carimbar
    BEFORE UPDATE ON public.relatos_suporte
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.relatos_suporte_carimbar();

-- ---------------------------------------------------------------------
-- Trilha: quem mudou o status ou apagou o relato
--
-- Não reaproveita `auditar_saas` porque ele copia a linha inteira. O texto
-- do relato é livre (pode trazer nome de paciente) e a trilha não se apaga:
-- aqui entram só o status de antes e de depois, o tipo e a clínica.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auditar_relato_suporte()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_nome TEXT;
    v_detalhes JSONB;
BEGIN
    IF v_user IS NOT NULL THEN
        SELECT p.nome INTO v_nome FROM public.profissionais p WHERE p.user_id = v_user LIMIT 1;
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('antes', jsonb_build_object(
            'status', OLD.status, 'tipo', OLD.tipo, 'clinica_id', OLD.clinica_id, 'criado_em', OLD.criado_em
        ));
    ELSE
        v_detalhes := jsonb_build_object(
            'antes', jsonb_build_object('status', OLD.status),
            'depois', jsonb_build_object('status', NEW.status),
            'tipo', NEW.tipo,
            'clinica_id', NEW.clinica_id
        );
    END IF;

    INSERT INTO public.audit_log (user_id, profissional_nome, acao, entidade, entidade_id, detalhes)
    VALUES (
        v_user,
        coalesce(v_nome, 'Painel SaaS'),
        lower(TG_OP),
        TG_TABLE_NAME,
        OLD.id::TEXT,
        v_detalhes
    );

    RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_auditar_relatos_status ON public.relatos_suporte;
CREATE TRIGGER trg_auditar_relatos_status
    AFTER UPDATE ON public.relatos_suporte
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.auditar_relato_suporte();

DROP TRIGGER IF EXISTS trg_auditar_relatos_exclusao ON public.relatos_suporte;
CREATE TRIGGER trg_auditar_relatos_exclusao
    AFTER DELETE ON public.relatos_suporte
    FOR EACH ROW EXECUTE FUNCTION public.auditar_relato_suporte();

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
REVOKE ALL ON public.relatos_suporte FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.relatos_suporte TO authenticated;
-- UPDATE só na coluna do status: a RLS diz QUEM altera (o dono), o grant diz
-- O QUÊ. O texto do relato não é reescrito pela API e nenhuma alteração
-- escapa da trilha acima. (O REVOKE da tabela também limpa grant de coluna
-- antigo: reexecutar a migration sempre termina neste estado.)
GRANT UPDATE (status) ON public.relatos_suporte TO authenticated;
GRANT ALL ON public.relatos_suporte TO service_role;
REVOKE ALL ON SEQUENCE public.relatos_suporte_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.relatos_suporte_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.relatos_suporte_carimbar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auditar_relato_suporte() FROM PUBLIC, anon, authenticated;

-- Visitante não executa nada do schema public (ver 20261121_seguranca_reforco).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261123_relatos')
ON CONFLICT (id) DO NOTHING;

COMMIT;
