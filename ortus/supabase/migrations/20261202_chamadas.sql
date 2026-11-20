-- =====================================================================
-- Chamada de pacientes por senha ou nome numa TV (pedido de 19/11/2026)
--
-- * chamadas_tv: os links das TVs da clínica. Só o hash do token fica no
--   banco; o link aparece uma vez, na criação. Vale até ser revogado.
-- * chamadas: cada chamada (paciente da agenda ou senha avulsa) e o local.
--   O nome que a TV mostra é montado AQUI, no banco: primeiro nome e
--   inicial do sobrenome, ou só a senha, conforme a clínica escolheu
--   (configuracoes_clinica, chave chamada_tv). O nome completo nunca sai.
-- * chamadas_senhas + chamada_proxima_senha: senha diária por clínica,
--   recomeça todo dia no fuso da clínica.
--
-- A TV lê pela rota pública /api/public/tv/[token] (service role); o anon
-- não lê nada destas tabelas. Só na nuvem (não vai para o desktop).
-- Pode rodar de novo sem estragar nada.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.chamadas_tv (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 60),
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_por BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revogado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chamadas_tv_clinica_idx ON public.chamadas_tv (clinica_id);

CREATE TABLE IF NOT EXISTS public.chamadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    agendamento_id BIGINT REFERENCES public.agendamentos(id) ON DELETE SET NULL,
    paciente_id UUID REFERENCES public.pacientes(id) ON DELETE SET NULL,
    senha INTEGER CHECK (senha IS NULL OR senha BETWEEN 1 AND 9999),
    nome_exibicao TEXT,
    local TEXT CHECK (local IS NULL OR length(local) <= 60),
    chamado_por BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (paciente_id IS NOT NULL OR senha IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS chamadas_clinica_idx ON public.chamadas (clinica_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chamadas_senhas (
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    dia DATE NOT NULL,
    ultimo INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (clinica_id, dia)
);

-- Link da TV: quem cria é quem está logado; o hash não muda depois.
CREATE OR REPLACE FUNCTION public.chamadas_tv_preparar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.nome := btrim(NEW.nome);
    IF TG_OP = 'INSERT' THEN
        IF coalesce(auth.role(), '') = 'authenticated' THEN
            NEW.criado_por := public.meu_profissional_id();
            NEW.created_at := now();
            NEW.ativo := true;
            NEW.revogado_em := NULL;
        END IF;
    ELSE
        NEW.clinica_id := OLD.clinica_id;
        NEW.token_hash := OLD.token_hash;
        NEW.criado_por := OLD.criado_por;
        NEW.created_at := OLD.created_at;
        -- Revogado não volta: "Novo link" cria outro.
        IF OLD.revogado_em IS NOT NULL THEN
            NEW.ativo := false;
            NEW.revogado_em := OLD.revogado_em;
        ELSIF NOT NEW.ativo THEN
            NEW.revogado_em := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chamadas_tv_preparar ON public.chamadas_tv;
CREATE TRIGGER trg_chamadas_tv_preparar
    BEFORE INSERT OR UPDATE ON public.chamadas_tv
    FOR EACH ROW EXECUTE FUNCTION public.chamadas_tv_preparar();

-- Chamada: paciente da clínica (ou da rede), nome curto montado aqui, autor e hora do banco.
CREATE OR REPLACE FUNCTION public.chamadas_preparar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rede UUID;
    v_paciente RECORD;
    v_modo TEXT;
    v_partes TEXT[];
BEGIN
    SELECT c.rede_id INTO v_rede FROM public.clinicas c WHERE c.id = NEW.clinica_id;

    IF NEW.agendamento_id IS NOT NULL THEN
        SELECT a.paciente_id INTO NEW.paciente_id
          FROM public.agendamentos a
         WHERE a.id = NEW.agendamento_id
           AND (a.clinica_id = NEW.clinica_id OR EXISTS (
                SELECT 1 FROM public.clinicas b WHERE b.id = a.clinica_id AND v_rede IS NOT NULL AND b.rede_id = v_rede));
        IF NEW.paciente_id IS NULL THEN
            RAISE EXCEPTION 'O agendamento não é desta clínica.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    v_modo := coalesce(
        (SELECT cc.valor ->> 'mostrar' FROM public.configuracoes_clinica cc
          WHERE cc.clinica_id = NEW.clinica_id AND cc.chave = 'chamada_tv' LIMIT 1),
        'nome');

    IF NEW.paciente_id IS NOT NULL THEN
        SELECT p.nome, p.clinica_id INTO v_paciente FROM public.pacientes p WHERE p.id = NEW.paciente_id;
        IF v_paciente.clinica_id IS NULL OR (v_paciente.clinica_id <> NEW.clinica_id AND NOT EXISTS (
            SELECT 1 FROM public.clinicas b WHERE b.id = v_paciente.clinica_id AND v_rede IS NOT NULL AND b.rede_id = v_rede)) THEN
            RAISE EXCEPTION 'O paciente não é desta clínica.' USING ERRCODE = 'P0001';
        END IF;
        IF v_modo = 'senha' AND NEW.senha IS NULL THEN
            NEW.senha := public.chamada_proxima_senha(NEW.clinica_id);
        END IF;
        IF v_modo = 'senha' THEN
            NEW.nome_exibicao := NULL;
        ELSE
            v_partes := regexp_split_to_array(btrim(coalesce(v_paciente.nome, '')), '\s+');
            NEW.nome_exibicao := initcap(lower(v_partes[1]))
                || CASE WHEN array_length(v_partes, 1) > 1
                        THEN ' ' || upper(left(v_partes[array_length(v_partes, 1)], 1)) || '.'
                        ELSE '' END;
        END IF;
    ELSE
        NEW.nome_exibicao := NULL;
    END IF;

    NEW.local := nullif(btrim(coalesce(NEW.local, '')), '');
    IF coalesce(auth.role(), '') = 'authenticated' THEN
        NEW.chamado_por := public.meu_profissional_id();
        NEW.created_at := now();
    END IF;
    RETURN NEW;
END;
$$;

-- Próxima senha do dia da clínica (no fuso dela). Trava a linha: duas
-- recepções ao mesmo tempo nunca recebem o mesmo número.
CREATE OR REPLACE FUNCTION public.chamada_proxima_senha(p_clinica BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dia DATE;
    v_numero INTEGER;
BEGIN
    IF coalesce(auth.role(), '') = 'authenticated' AND NOT public.user_has_clinic_access(p_clinica) THEN
        RAISE EXCEPTION 'Sem acesso a esta clínica.' USING ERRCODE = '42501';
    END IF;
    SELECT (now() AT TIME ZONE coalesce(nullif(c.fuso_horario, ''), 'America/Sao_Paulo'))::date
      INTO v_dia FROM public.clinicas c WHERE c.id = p_clinica;
    IF v_dia IS NULL THEN
        RAISE EXCEPTION 'Clínica não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.chamadas_senhas (clinica_id, dia, ultimo) VALUES (p_clinica, v_dia, 1)
    ON CONFLICT (clinica_id, dia) DO UPDATE SET ultimo = public.chamadas_senhas.ultimo + 1
    RETURNING ultimo INTO v_numero;
    RETURN v_numero;
END;
$$;

DROP TRIGGER IF EXISTS trg_chamadas_preparar ON public.chamadas;
CREATE TRIGGER trg_chamadas_preparar
    BEFORE INSERT ON public.chamadas
    FOR EACH ROW EXECUTE FUNCTION public.chamadas_preparar();

REVOKE ALL ON FUNCTION public.chamadas_tv_preparar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamadas_preparar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamada_proxima_senha(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chamada_proxima_senha(BIGINT) TO authenticated, service_role;

ALTER TABLE public.chamadas_tv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamadas_senhas ENABLE ROW LEVEL SECURITY;

-- Links da TV: só o administrador da clínica vê, cria e revoga.
DROP POLICY IF EXISTS chamadas_tv_select ON public.chamadas_tv;
DROP POLICY IF EXISTS chamadas_tv_insert ON public.chamadas_tv;
DROP POLICY IF EXISTS chamadas_tv_update ON public.chamadas_tv;
CREATE POLICY chamadas_tv_select ON public.chamadas_tv FOR SELECT TO authenticated
    USING (public.user_is_clinic_admin(clinica_id));
CREATE POLICY chamadas_tv_insert ON public.chamadas_tv FOR INSERT TO authenticated
    WITH CHECK (public.user_is_clinic_admin(clinica_id));
CREATE POLICY chamadas_tv_update ON public.chamadas_tv FOR UPDATE TO authenticated
    USING (public.user_is_clinic_admin(clinica_id)) WITH CHECK (public.user_is_clinic_admin(clinica_id));

-- Chamadas: quem trabalha na clínica chama e vê as do dia. Não se altera nem apaga.
DROP POLICY IF EXISTS chamadas_select ON public.chamadas;
DROP POLICY IF EXISTS chamadas_insert ON public.chamadas;
CREATE POLICY chamadas_select ON public.chamadas FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));
CREATE POLICY chamadas_insert ON public.chamadas FOR INSERT TO authenticated
    WITH CHECK (public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS chamadas_senhas_select ON public.chamadas_senhas;
CREATE POLICY chamadas_senhas_select ON public.chamadas_senhas FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(clinica_id));

REVOKE ALL ON TABLE public.chamadas_tv, public.chamadas, public.chamadas_senhas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.chamadas_tv TO authenticated;
GRANT SELECT, INSERT ON TABLE public.chamadas TO authenticated;
GRANT SELECT ON TABLE public.chamadas_senhas TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261202_chamadas')
ON CONFLICT (id) DO NOTHING;

COMMIT;
