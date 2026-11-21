-- =====================================================================
-- Conversas (pedido de 19/11/2026)
--
-- 1. Chat da equipe da clínica: canal "Geral" e outros que a clínica
--    criar. Só quem trabalha na clínica lê e escreve. A equipe da Ortus
--    (super-admin) NÃO entra aqui: por isso a regra é
--    user_e_membro_da_clinica, e não user_has_clinic_access (que libera o
--    super-admin em tudo).
-- 2. Conversa da clínica com o suporte da Ortus: só a própria clínica e o
--    suporte veem. Fica fora do bloqueio de assinatura: clínica suspensa
--    precisa falar com o suporte.
--
-- Só na nuvem (as telas pedem internet): nada disto vai para o desktop.
-- Pode rodar de novo sem estragar nada.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_profissional_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id FROM public.profissionais p WHERE p.user_id = auth.uid() LIMIT 1;
$$;

-- Trabalha na clínica (vínculo, convidado incluído). Sem a exceção do super-admin.
CREATE OR REPLACE FUNCTION public.user_e_membro_da_clinica(p_clinica BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.profissionais_clinicas pc
          JOIN public.profissionais p ON p.id = pc.profissional_id
         WHERE pc.clinica_id = p_clinica AND p.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.meu_profissional_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_e_membro_da_clinica(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_profissional_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_e_membro_da_clinica(BIGINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Chat da equipe
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversa_canais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 60),
    geral BOOLEAN NOT NULL DEFAULT false,
    arquivado BOOLEAN NOT NULL DEFAULT false,
    criado_por BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversa_canais_geral_uidx ON public.conversa_canais (clinica_id) WHERE geral;
CREATE UNIQUE INDEX IF NOT EXISTS conversa_canais_nome_uidx ON public.conversa_canais (clinica_id, lower(btrim(nome))) WHERE NOT arquivado;

CREATE TABLE IF NOT EXISTS public.conversa_mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    canal_id UUID NOT NULL REFERENCES public.conversa_canais(id) ON DELETE CASCADE,
    autor_id BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL,
    texto TEXT NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversa_mensagens_canal_idx ON public.conversa_mensagens (canal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.conversa_leituras (
    canal_id UUID NOT NULL REFERENCES public.conversa_canais(id) ON DELETE CASCADE,
    profissional_id BIGINT NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    lido_ate TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (canal_id, profissional_id)
);

-- Canal: o nome e o "geral" vêm limpos; quem cria é quem está logado.
CREATE OR REPLACE FUNCTION public.conversa_canais_preparar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.nome := btrim(NEW.nome);
    IF TG_OP = 'INSERT' THEN
        IF coalesce(auth.role(), '') = 'authenticated' THEN
            NEW.geral := false;
            NEW.criado_por := public.meu_profissional_id();
        END IF;
    ELSE
        NEW.clinica_id := OLD.clinica_id;
        NEW.geral := OLD.geral;
        NEW.criado_por := OLD.criado_por;
        IF OLD.geral THEN
            NEW.arquivado := false;
        END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_conversa_canais_preparar ON public.conversa_canais;
CREATE TRIGGER trg_conversa_canais_preparar
    BEFORE INSERT OR UPDATE ON public.conversa_canais
    FOR EACH ROW EXECUTE FUNCTION public.conversa_canais_preparar();

-- Mensagem: o autor é quem está logado, a clínica é a do canal e o canal
-- não pode estar arquivado.
CREATE OR REPLACE FUNCTION public.conversa_mensagens_preparar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_canal RECORD;
BEGIN
    SELECT c.clinica_id, c.arquivado INTO v_canal FROM public.conversa_canais c WHERE c.id = NEW.canal_id;
    IF v_canal.clinica_id IS NULL THEN
        RAISE EXCEPTION 'Canal não encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF v_canal.arquivado THEN
        RAISE EXCEPTION 'Este canal foi arquivado.' USING ERRCODE = 'P0001';
    END IF;
    NEW.clinica_id := v_canal.clinica_id;
    NEW.texto := btrim(NEW.texto);
    IF coalesce(auth.role(), '') = 'authenticated' THEN
        NEW.autor_id := public.meu_profissional_id();
        NEW.created_at := now();
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_conversa_mensagens_preparar ON public.conversa_mensagens;
CREATE TRIGGER trg_conversa_mensagens_preparar
    BEFORE INSERT ON public.conversa_mensagens
    FOR EACH ROW EXECUTE FUNCTION public.conversa_mensagens_preparar();

-- Leitura: sempre da própria pessoa, na clínica do canal.
CREATE OR REPLACE FUNCTION public.conversa_leituras_preparar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    SELECT c.clinica_id INTO NEW.clinica_id FROM public.conversa_canais c WHERE c.id = NEW.canal_id;
    IF coalesce(auth.role(), '') = 'authenticated' THEN
        NEW.profissional_id := public.meu_profissional_id();
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_conversa_leituras_preparar ON public.conversa_leituras;
CREATE TRIGGER trg_conversa_leituras_preparar
    BEFORE INSERT OR UPDATE ON public.conversa_leituras
    FOR EACH ROW EXECUTE FUNCTION public.conversa_leituras_preparar();

REVOKE ALL ON FUNCTION public.conversa_canais_preparar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conversa_mensagens_preparar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conversa_leituras_preparar() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.conversa_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversa_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversa_leituras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversa_canais_select ON public.conversa_canais;
DROP POLICY IF EXISTS conversa_canais_insert ON public.conversa_canais;
DROP POLICY IF EXISTS conversa_canais_update ON public.conversa_canais;
CREATE POLICY conversa_canais_select ON public.conversa_canais FOR SELECT TO authenticated
    USING (public.user_e_membro_da_clinica(clinica_id));
CREATE POLICY conversa_canais_insert ON public.conversa_canais FOR INSERT TO authenticated
    WITH CHECK (public.user_e_membro_da_clinica(clinica_id) AND public.user_is_clinic_admin(clinica_id));
CREATE POLICY conversa_canais_update ON public.conversa_canais FOR UPDATE TO authenticated
    USING (public.user_e_membro_da_clinica(clinica_id) AND public.user_is_clinic_admin(clinica_id))
    WITH CHECK (public.user_e_membro_da_clinica(clinica_id) AND public.user_is_clinic_admin(clinica_id));

DROP POLICY IF EXISTS conversa_mensagens_select ON public.conversa_mensagens;
DROP POLICY IF EXISTS conversa_mensagens_insert ON public.conversa_mensagens;
DROP POLICY IF EXISTS conversa_mensagens_delete ON public.conversa_mensagens;
CREATE POLICY conversa_mensagens_select ON public.conversa_mensagens FOR SELECT TO authenticated
    USING (public.user_e_membro_da_clinica(clinica_id));
CREATE POLICY conversa_mensagens_insert ON public.conversa_mensagens FOR INSERT TO authenticated
    WITH CHECK (public.user_e_membro_da_clinica(clinica_id));
-- Cada um apaga só a própria mensagem.
CREATE POLICY conversa_mensagens_delete ON public.conversa_mensagens FOR DELETE TO authenticated
    USING (public.user_e_membro_da_clinica(clinica_id) AND autor_id = public.meu_profissional_id());

DROP POLICY IF EXISTS conversa_leituras_select ON public.conversa_leituras;
DROP POLICY IF EXISTS conversa_leituras_insert ON public.conversa_leituras;
DROP POLICY IF EXISTS conversa_leituras_update ON public.conversa_leituras;
CREATE POLICY conversa_leituras_select ON public.conversa_leituras FOR SELECT TO authenticated
    USING (profissional_id = public.meu_profissional_id() AND public.user_e_membro_da_clinica(clinica_id));
CREATE POLICY conversa_leituras_insert ON public.conversa_leituras FOR INSERT TO authenticated
    WITH CHECK (profissional_id = public.meu_profissional_id() AND public.user_e_membro_da_clinica(clinica_id));
CREATE POLICY conversa_leituras_update ON public.conversa_leituras FOR UPDATE TO authenticated
    USING (profissional_id = public.meu_profissional_id() AND public.user_e_membro_da_clinica(clinica_id))
    WITH CHECK (profissional_id = public.meu_profissional_id() AND public.user_e_membro_da_clinica(clinica_id));

REVOKE ALL ON TABLE public.conversa_canais, public.conversa_mensagens, public.conversa_leituras FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversa_canais TO authenticated;
REVOKE DELETE ON TABLE public.conversa_canais FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.conversa_mensagens TO authenticated;
REVOKE UPDATE ON TABLE public.conversa_mensagens FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversa_leituras TO authenticated;
REVOKE DELETE ON TABLE public.conversa_leituras FROM authenticated;

-- O chat da equipe segue o modo de consulta da assinatura (quem não paga lê, mas não escreve).
DROP TRIGGER IF EXISTS aaa_assinatura_escrita ON public.conversa_canais;
CREATE TRIGGER aaa_assinatura_escrita BEFORE INSERT OR UPDATE OR DELETE ON public.conversa_canais
    FOR EACH ROW EXECUTE FUNCTION public.assinatura_barrar_escrita('clinica');
DROP TRIGGER IF EXISTS aaa_assinatura_escrita ON public.conversa_mensagens;
CREATE TRIGGER aaa_assinatura_escrita BEFORE INSERT OR UPDATE OR DELETE ON public.conversa_mensagens
    FOR EACH ROW EXECUTE FUNCTION public.assinatura_barrar_escrita('clinica');

-- Canal "Geral" em cada clínica, agora e nas que forem criadas.
CREATE OR REPLACE FUNCTION public.conversa_criar_canal_geral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.conversa_canais (clinica_id, nome, geral)
    VALUES (NEW.id, 'Geral', true)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.conversa_criar_canal_geral() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_clinicas_canal_geral ON public.clinicas;
CREATE TRIGGER trg_clinicas_canal_geral
    AFTER INSERT ON public.clinicas
    FOR EACH ROW EXECUTE FUNCTION public.conversa_criar_canal_geral();

INSERT INTO public.conversa_canais (clinica_id, nome, geral)
SELECT c.id, 'Geral', true FROM public.clinicas c
 WHERE NOT EXISTS (SELECT 1 FROM public.conversa_canais g WHERE g.clinica_id = c.id AND g.geral);

-- Não lidas por canal, para quem está logado (RLS vale: SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.conversas_nao_lidas(p_clinica BIGINT)
RETURNS TABLE (canal_id UUID, nao_lidas INTEGER)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT c.id,
           (SELECT count(*)::int
              FROM public.conversa_mensagens m
             WHERE m.canal_id = c.id
               AND m.created_at > coalesce(l.lido_ate, '-infinity'::timestamptz)
               AND m.autor_id IS DISTINCT FROM public.meu_profissional_id())
      FROM public.conversa_canais c
      LEFT JOIN public.conversa_leituras l
        ON l.canal_id = c.id AND l.profissional_id = public.meu_profissional_id()
     WHERE c.clinica_id = p_clinica AND NOT c.arquivado;
$$;
REVOKE ALL ON FUNCTION public.conversas_nao_lidas(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversas_nao_lidas(BIGINT) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Conversa com o suporte da Ortus
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suporte_conversas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL UNIQUE REFERENCES public.clinicas(id) ON DELETE CASCADE,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultima_mensagem_em TIMESTAMPTZ,
    ultima_da_clinica_em TIMESTAMPTZ,
    ultima_da_ortus_em TIMESTAMPTZ,
    clinica_leu_ate TIMESTAMPTZ,
    ortus_leu_ate TIMESTAMPTZ,
    -- Último e-mail de aviso ao suporte (espaçamento entre avisos).
    avisado_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.suporte_mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id UUID NOT NULL REFERENCES public.suporte_conversas(id) ON DELETE CASCADE,
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    autor_user_id UUID,
    autor_nome TEXT,
    lado TEXT NOT NULL CHECK (lado IN ('clinica', 'ortus')),
    texto TEXT NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suporte_mensagens_conversa_idx ON public.suporte_mensagens (conversa_id, created_at DESC);

-- Quem da Ortus está com o painel de suporte aberto (batimento a cada 30 s).
CREATE TABLE IF NOT EXISTS public.suporte_presenca (
    user_id UUID PRIMARY KEY,
    visto_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mensagem: o lado, o autor e a clínica são definidos aqui, nunca pelo navegador.
CREATE OR REPLACE FUNCTION public.suporte_mensagens_preparar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinica BIGINT;
BEGIN
    SELECT c.clinica_id INTO v_clinica FROM public.suporte_conversas c WHERE c.id = NEW.conversa_id;
    IF v_clinica IS NULL THEN
        RAISE EXCEPTION 'Conversa não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    NEW.clinica_id := v_clinica;
    NEW.texto := btrim(NEW.texto);
    IF coalesce(auth.role(), '') = 'authenticated' THEN
        NEW.autor_user_id := auth.uid();
        NEW.created_at := now();
        SELECT p.nome INTO NEW.autor_nome FROM public.profissionais p WHERE p.user_id = auth.uid() LIMIT 1;
        IF public.user_e_membro_da_clinica(v_clinica) THEN
            NEW.lado := 'clinica';
        ELSIF public.is_super_admin() THEN
            NEW.lado := 'ortus';
        ELSE
            RAISE EXCEPTION 'Sem acesso a esta conversa.' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_suporte_mensagens_preparar ON public.suporte_mensagens;
CREATE TRIGGER trg_suporte_mensagens_preparar
    BEFORE INSERT ON public.suporte_mensagens
    FOR EACH ROW EXECUTE FUNCTION public.suporte_mensagens_preparar();

-- Depois da mensagem: a conversa guarda quando cada lado escreveu.
CREATE OR REPLACE FUNCTION public.suporte_mensagens_carimbar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.suporte_conversas
       SET ultima_mensagem_em = NEW.created_at,
           ultima_da_clinica_em = CASE WHEN NEW.lado = 'clinica' THEN NEW.created_at ELSE ultima_da_clinica_em END,
           ultima_da_ortus_em = CASE WHEN NEW.lado = 'ortus' THEN NEW.created_at ELSE ultima_da_ortus_em END,
           clinica_leu_ate = CASE WHEN NEW.lado = 'clinica' THEN NEW.created_at ELSE clinica_leu_ate END,
           ortus_leu_ate = CASE WHEN NEW.lado = 'ortus' THEN NEW.created_at ELSE ortus_leu_ate END
     WHERE id = NEW.conversa_id;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_suporte_mensagens_carimbar ON public.suporte_mensagens;
CREATE TRIGGER trg_suporte_mensagens_carimbar
    AFTER INSERT ON public.suporte_mensagens
    FOR EACH ROW EXECUTE FUNCTION public.suporte_mensagens_carimbar();

REVOKE ALL ON FUNCTION public.suporte_mensagens_preparar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suporte_mensagens_carimbar() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.suporte_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_presenca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suporte_conversas_select ON public.suporte_conversas;
CREATE POLICY suporte_conversas_select ON public.suporte_conversas FOR SELECT TO authenticated
    USING (public.user_e_membro_da_clinica(clinica_id) OR public.is_super_admin());

DROP POLICY IF EXISTS suporte_mensagens_select ON public.suporte_mensagens;
DROP POLICY IF EXISTS suporte_mensagens_insert ON public.suporte_mensagens;
CREATE POLICY suporte_mensagens_select ON public.suporte_mensagens FOR SELECT TO authenticated
    USING (public.user_e_membro_da_clinica(clinica_id) OR public.is_super_admin());
CREATE POLICY suporte_mensagens_insert ON public.suporte_mensagens FOR INSERT TO authenticated
    WITH CHECK (public.user_e_membro_da_clinica(clinica_id) OR public.is_super_admin());

DROP POLICY IF EXISTS suporte_presenca_select ON public.suporte_presenca;
CREATE POLICY suporte_presenca_select ON public.suporte_presenca FOR SELECT TO authenticated
    USING (public.is_super_admin());

-- A conversa e a presença só mudam pelas funções abaixo (e pelo servidor).
REVOKE ALL ON TABLE public.suporte_conversas, public.suporte_mensagens, public.suporte_presenca FROM anon, authenticated;
GRANT SELECT ON TABLE public.suporte_conversas TO authenticated;
GRANT SELECT, INSERT ON TABLE public.suporte_mensagens TO authenticated;
GRANT SELECT ON TABLE public.suporte_presenca TO authenticated;

-- Abre (ou devolve) a conversa da clínica com o suporte. Só quem trabalha na clínica.
CREATE OR REPLACE FUNCTION public.suporte_abrir(p_clinica BIGINT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT public.user_e_membro_da_clinica(p_clinica) THEN
        RAISE EXCEPTION 'Sem acesso a esta clínica.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.suporte_conversas (clinica_id) VALUES (p_clinica)
    ON CONFLICT (clinica_id) DO NOTHING;
    SELECT id INTO v_id FROM public.suporte_conversas WHERE clinica_id = p_clinica;
    RETURN v_id;
END;
$$;

-- Marca a conversa como lida por quem está olhando: a clínica ou a Ortus.
CREATE OR REPLACE FUNCTION public.suporte_marcar_lido(p_conversa UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinica BIGINT;
BEGIN
    SELECT clinica_id INTO v_clinica FROM public.suporte_conversas WHERE id = p_conversa;
    IF v_clinica IS NULL THEN
        RAISE EXCEPTION 'Conversa não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    IF public.user_e_membro_da_clinica(v_clinica) THEN
        UPDATE public.suporte_conversas SET clinica_leu_ate = now() WHERE id = p_conversa;
    ELSIF public.is_super_admin() THEN
        UPDATE public.suporte_conversas SET ortus_leu_ate = now() WHERE id = p_conversa;
        INSERT INTO public.suporte_presenca (user_id, visto_em) VALUES (auth.uid(), now())
        ON CONFLICT (user_id) DO UPDATE SET visto_em = now();
    ELSE
        RAISE EXCEPTION 'Sem acesso a esta conversa.' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- Batimento do painel de suporte da Ortus (enquanto a aba está aberta).
CREATE OR REPLACE FUNCTION public.suporte_presenca_bater()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Só a equipe da Ortus.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.suporte_presenca (user_id, visto_em) VALUES (auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE SET visto_em = now();
END;
$$;

REVOKE ALL ON FUNCTION public.suporte_abrir(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.suporte_marcar_lido(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.suporte_presenca_bater() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suporte_abrir(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suporte_marcar_lido(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suporte_presenca_bater() TO authenticated;

-- Quem trabalha na clínica: as conversas da equipe ficam abertas a todos.
INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar)
SELECT DISTINCT pm.profissional_id, pm.clinica_id, 'conversas', true
  FROM public.permissoes_modulos pm
ON CONFLICT (profissional_id, clinica_id, modulo) DO NOTHING;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261201_conversas')
ON CONFLICT (id) DO NOTHING;

COMMIT;
