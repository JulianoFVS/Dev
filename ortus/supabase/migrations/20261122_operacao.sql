-- =====================================================================
-- ORTUS — Operação: falhas do servidor, rotinas agendadas e alertas
--
-- Até aqui não havia registro de erro nem jeito de saber que o agendador
-- de lembretes tinha parado. Três tabelas, todas escritas só pelo
-- servidor (service role) e lidas só pelos donos da plataforma:
--
--   falhas_servidor    uma linha por erro de rota ou rotina, já sem dado
--                      pessoal, clínico ou segredo (lib/registro.ts limpa
--                      a mensagem antes de gravar).
--   rotinas_execucoes  um batimento por execução de rotina agendada
--                      (lembretes, assinaturas, vigia). É assim que o
--                      painel e o monitor sabem que a rotina parou.
--   alertas_operacao   o que o vigia já avisou por e-mail, para avisar uma
--                      vez quando para e outra quando volta.
--
-- Também marca, no convite de equipe, quando o e-mail saiu.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Falhas do servidor
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.falhas_servidor (
    id BIGSERIAL PRIMARY KEY,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    origem TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    codigo TEXT,
    tipo TEXT,
    onde TEXT,
    clinica_id BIGINT,
    extra JSONB
);
CREATE INDEX IF NOT EXISTS falhas_servidor_criado_idx ON public.falhas_servidor (criado_em DESC);
CREATE INDEX IF NOT EXISTS falhas_servidor_origem_idx ON public.falhas_servidor (origem, criado_em DESC);

COMMENT ON TABLE public.falhas_servidor IS
    'Erros do servidor, sem dado pessoal nem segredo. Guardados por 30 dias (a rotina do vigia apaga os antigos).';

ALTER TABLE public.falhas_servidor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS falhas_servidor_select ON public.falhas_servidor;
CREATE POLICY falhas_servidor_select ON public.falhas_servidor
    FOR SELECT TO authenticated USING (public.is_super_admin());

-- ---------------------------------------------------------------------
-- Batimento das rotinas agendadas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rotinas_execucoes (
    id BIGSERIAL PRIMARY KEY,
    rotina TEXT NOT NULL,
    iniciou_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    terminou_em TIMESTAMPTZ,
    ok BOOLEAN,
    resumo JSONB
);
CREATE INDEX IF NOT EXISTS rotinas_execucoes_rotina_idx ON public.rotinas_execucoes (rotina, iniciou_em DESC);

COMMENT ON TABLE public.rotinas_execucoes IS
    'Uma linha por execução de rotina agendada. `resumo` traz só contagens, nunca nome de paciente.';

ALTER TABLE public.rotinas_execucoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rotinas_execucoes_select ON public.rotinas_execucoes;
CREATE POLICY rotinas_execucoes_select ON public.rotinas_execucoes
    FOR SELECT TO authenticated USING (public.is_super_admin());

-- ---------------------------------------------------------------------
-- O que o vigia já avisou
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alertas_operacao (
    chave TEXT PRIMARY KEY,
    parado_desde TIMESTAMPTZ NOT NULL DEFAULT now(),
    avisado_em TIMESTAMPTZ,
    detalhe TEXT
);

ALTER TABLE public.alertas_operacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alertas_operacao_select ON public.alertas_operacao;
CREATE POLICY alertas_operacao_select ON public.alertas_operacao
    FOR SELECT TO authenticated USING (public.is_super_admin());

-- Só o servidor escreve nas três.
REVOKE ALL ON public.falhas_servidor, public.rotinas_execucoes, public.alertas_operacao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.falhas_servidor, public.rotinas_execucoes, public.alertas_operacao TO authenticated;
GRANT ALL ON public.falhas_servidor, public.rotinas_execucoes, public.alertas_operacao TO service_role;
REVOKE ALL ON SEQUENCE public.falhas_servidor_id_seq, public.rotinas_execucoes_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.falhas_servidor_id_seq, public.rotinas_execucoes_id_seq TO service_role;

-- ---------------------------------------------------------------------
-- Convite de equipe: quando o e-mail saiu
-- ---------------------------------------------------------------------
ALTER TABLE public.convites_equipe
    ADD COLUMN IF NOT EXISTS email_convite_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_aceite_em TIMESTAMPTZ;

COMMENT ON COLUMN public.convites_equipe.email_convite_em IS 'Quando o e-mail do convite foi aceito pela Resend. NULL = ainda não saiu.';
COMMENT ON COLUMN public.convites_equipe.email_aceite_em IS 'Quando o aviso de convite aceito foi aceito pela Resend. NULL = ainda não saiu.';

-- Visitante não executa nada do schema public (ver 20261121_seguranca_reforco).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261122_operacao')
ON CONFLICT (id) DO NOTHING;

COMMIT;
