-- =====================================================================
-- Google Agenda por profissional e a tela de Integrações (pedido de 19/11/2026)
--
-- * plataforma_integracoes: credenciais que a equipe da Ortus cola na tela
--   de Integrações (Client ID e o segredo CIFRADO pelo servidor). Ninguém
--   lê pela API: só o servidor (service role).
-- * google_conexoes: a agenda do Google de cada profissional (refresh token
--   cifrado). Só o servidor lê; o profissional vê o próprio estado pela
--   função google_minha_conexao().
-- * google_oauth_estados: o "state" do OAuth (só o hash), 10 minutos.
-- * google_fila: o que mudou na agenda e precisa ir ao Google. Quem enche é
--   um gatilho em agendamentos — pega a tela, a ficha, o desktop e tudo o
--   mais que grava agendamento. Só entra na fila o profissional que ligou
--   a agenda dele.
-- * google_eventos: o estado de cada consulta no Google (para a agenda
--   avisar quando não foi enviada). Fora de agendamentos de propósito: o
--   estado muda sem mexer no updated_at da consulta (sincronização).
-- * google_bloqueios: compromissos marcados direto no Google que ocupam o
--   horário do profissional na Ortus. Sem título nem descrição.
--
-- Só na nuvem: nada disto vai para o desktop. Pode rodar de novo.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.plataforma_integracoes (
    chave TEXT PRIMARY KEY CHECK (chave ~ '^[a-z_]{2,40}$'),
    ativo BOOLEAN NOT NULL DEFAULT false,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    segredo_cifrado TEXT,
    atualizado_por UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_conexoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id BIGINT NOT NULL UNIQUE REFERENCES public.profissionais(id) ON DELETE CASCADE,
    usuario_id UUID,
    email_google TEXT,
    calendario_id TEXT NOT NULL DEFAULT 'primary',
    refresh_token_cifrado TEXT NOT NULL,
    bloquear_horarios BOOLEAN NOT NULL DEFAULT true,
    ativo BOOLEAN NOT NULL DEFAULT true,
    sync_token TEXT,
    ultima_leitura_em TIMESTAMPTZ,
    ultimo_erro TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_oauth_estados (
    estado_hash TEXT PRIMARY KEY CHECK (estado_hash ~ '^[0-9a-f]{64}$'),
    profissional_id BIGINT NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL,
    volta TEXT,
    expira_em TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes'
);

CREATE TABLE IF NOT EXISTS public.google_fila (
    id BIGSERIAL PRIMARY KEY,
    agendamento_id BIGINT NOT NULL,
    clinica_id BIGINT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    tentativas INTEGER NOT NULL DEFAULT 0,
    ultimo_erro TEXT
);
CREATE INDEX IF NOT EXISTS google_fila_proxima_idx ON public.google_fila (proxima_tentativa_em);
CREATE INDEX IF NOT EXISTS google_fila_agendamento_idx ON public.google_fila (agendamento_id);

CREATE TABLE IF NOT EXISTS public.google_eventos (
    agendamento_id BIGINT NOT NULL,
    profissional_id BIGINT NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    google_event_id TEXT,
    estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'enviado', 'falha', 'removido')),
    ultimo_erro TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (agendamento_id, profissional_id)
);
CREATE INDEX IF NOT EXISTS google_eventos_clinica_idx ON public.google_eventos (clinica_id, estado);

CREATE TABLE IF NOT EXISTS public.google_bloqueios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id BIGINT NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
    google_event_id TEXT NOT NULL,
    inicio TIMESTAMPTZ NOT NULL,
    fim TIMESTAMPTZ NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (profissional_id, google_event_id)
);
CREATE INDEX IF NOT EXISTS google_bloqueios_periodo_idx ON public.google_bloqueios (profissional_id, inicio, fim);

-- ---------------------------------------------------------------------
-- Gatilho: o que mudou em agendamentos e importa ao Google entra na fila
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.google_enfileirar_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id BIGINT;
    v_clinica BIGINT;
    v_profs BIGINT[];
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_id := OLD.id;
        v_clinica := OLD.clinica_id;
        v_profs := ARRAY[OLD.profissional_id];
    ELSE
        -- Débito manual não é consulta.
        IF NEW.tipo_registro = 'debito_manual' OR NEW.observacoes = 'Débito manual' THEN
            RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE'
           AND NEW.data_hora IS NOT DISTINCT FROM OLD.data_hora
           AND NEW.duracao_minutos IS NOT DISTINCT FROM OLD.duracao_minutos
           AND NEW.profissional_id IS NOT DISTINCT FROM OLD.profissional_id
           AND NEW.paciente_id IS NOT DISTINCT FROM OLD.paciente_id
           AND NEW.procedimento IS NOT DISTINCT FROM OLD.procedimento
           AND (coalesce(NEW.status, '') = 'cancelado') = (coalesce(OLD.status, '') = 'cancelado') THEN
            RETURN NEW;
        END IF;
        v_id := NEW.id;
        v_clinica := NEW.clinica_id;
        v_profs := CASE WHEN TG_OP = 'UPDATE' THEN ARRAY[NEW.profissional_id, OLD.profissional_id] ELSE ARRAY[NEW.profissional_id] END;
    END IF;

    -- Só quem ligou a agenda do Google (ou tem evento lá) interessa.
    IF EXISTS (SELECT 1 FROM public.google_conexoes g WHERE g.ativo AND g.profissional_id = ANY (v_profs))
       OR EXISTS (SELECT 1 FROM public.google_eventos e WHERE e.agendamento_id = v_id AND e.estado <> 'removido') THEN
        INSERT INTO public.google_fila (agendamento_id, clinica_id) VALUES (v_id, v_clinica);
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.google_enfileirar_agendamento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_google_agendamentos ON public.agendamentos;
CREATE TRIGGER trg_google_agendamentos
    AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
    FOR EACH ROW EXECUTE FUNCTION public.google_enfileirar_agendamento();

-- ---------------------------------------------------------------------
-- O que o profissional vê da própria conexão (sem token)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.google_minha_conexao()
RETURNS TABLE (email_google TEXT, bloquear_horarios BOOLEAN, ativo BOOLEAN, ultimo_erro TEXT, conectado_em TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT g.email_google, g.bloquear_horarios, g.ativo, g.ultimo_erro, g.created_at
      FROM public.google_conexoes g
     WHERE g.profissional_id = public.meu_profissional_id();
$$;
REVOKE ALL ON FUNCTION public.google_minha_conexao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.google_minha_conexao() TO authenticated;

-- "Tentar de novo" da agenda: põe a consulta com falha de volta na fila.
-- Função (e não a rota do site) para valer também no aplicativo de computador,
-- que fala direto com o banco da nuvem; a rotina rápida envia em até 2 min, e
-- a web ainda cutuca /api/google/empurrar para enviar na hora.
CREATE OR REPLACE FUNCTION public.google_tentar_de_novo(p_agendamento BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinica BIGINT;
BEGIN
    SELECT a.clinica_id INTO v_clinica FROM public.agendamentos a WHERE a.id = p_agendamento;
    IF v_clinica IS NULL OR NOT public.user_has_clinic_access(v_clinica) THEN
        RAISE EXCEPTION 'Consulta não encontrada.' USING ERRCODE = '42501';
    END IF;
    -- Só o que falhou, e uma vez: o botão não enche a fila.
    IF NOT EXISTS (SELECT 1 FROM public.google_eventos e WHERE e.agendamento_id = p_agendamento AND e.estado = 'falha') THEN
        RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM public.google_fila f WHERE f.agendamento_id = p_agendamento AND f.proxima_tentativa_em <= now()) THEN
        RETURN true;
    END IF;
    INSERT INTO public.google_fila (agendamento_id, clinica_id) VALUES (p_agendamento, v_clinica);
    RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.google_tentar_de_novo(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.google_tentar_de_novo(BIGINT) TO authenticated;
-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.plataforma_integracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_conexoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_oauth_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_fila ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_bloqueios ENABLE ROW LEVEL SECURITY;

-- Credenciais, conexões, estados e fila: nenhum acesso pela API. As
-- políticas abaixo existem para o padrão do projeto (toda tabela tem
-- política), mas sem GRANT ninguém chega nelas.
DROP POLICY IF EXISTS plataforma_integracoes_select ON public.plataforma_integracoes;
CREATE POLICY plataforma_integracoes_select ON public.plataforma_integracoes FOR SELECT TO authenticated
    USING (public.is_super_admin());
DROP POLICY IF EXISTS google_conexoes_select ON public.google_conexoes;
CREATE POLICY google_conexoes_select ON public.google_conexoes FOR SELECT TO authenticated
    USING (profissional_id = public.meu_profissional_id());
DROP POLICY IF EXISTS google_oauth_estados_select ON public.google_oauth_estados;
CREATE POLICY google_oauth_estados_select ON public.google_oauth_estados FOR SELECT TO authenticated
    USING (usuario_id = auth.uid());
DROP POLICY IF EXISTS google_fila_select ON public.google_fila;
CREATE POLICY google_fila_select ON public.google_fila FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));
REVOKE ALL ON TABLE public.plataforma_integracoes, public.google_conexoes, public.google_oauth_estados, public.google_fila FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.google_fila_id_seq FROM anon, authenticated;

-- Estado dos eventos: quem trabalha na clínica lê (a agenda avisa as falhas).
DROP POLICY IF EXISTS google_eventos_select ON public.google_eventos;
CREATE POLICY google_eventos_select ON public.google_eventos FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));
REVOKE ALL ON TABLE public.google_eventos FROM anon, authenticated;
GRANT SELECT ON TABLE public.google_eventos TO authenticated;

-- Bloqueios: quem enxerga o profissional enxerga os horários ocupados dele (sem título).
DROP POLICY IF EXISTS google_bloqueios_select ON public.google_bloqueios;
CREATE POLICY google_bloqueios_select ON public.google_bloqueios FOR SELECT TO authenticated
    USING (public.user_can_see_profissional(profissional_id));
REVOKE ALL ON TABLE public.google_bloqueios FROM anon, authenticated;
GRANT SELECT ON TABLE public.google_bloqueios TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261203_google_agenda')
ON CONFLICT (id) DO NOTHING;

COMMIT;
