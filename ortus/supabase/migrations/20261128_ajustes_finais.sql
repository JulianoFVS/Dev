-- =====================================================================
-- ORTUS — Ajustes finais do lançamento
--
--   1. `configuracoes_clinica`: a chave `lancamentos_meta` guarda dado do
--      caixa (forma de pagamento, taxa, divisão e cancelamento dos
--      lançamentos), não configuração. Quem trabalha na clínica grava essa
--      chave; as outras continuam só do administrador. Sem isso, a recepção
--      e o financeiro perdiam a forma e a taxa ao receber ou lançar.
--   2. `paciente_documentos`: a linha só aponta para arquivo do próprio
--      paciente, e o `meta` não leva endereço nem conteúdo executável (o
--      visualizador da ficha já recusa; isto é a segunda trava, no banco).
--   3. `limites_publicos`: limite de tentativas atômico para as rotas que
--      abrem sem login (compra, link de acesso, "Esqueci a senha").
--   4. Tarefas: "atrasada" pelo dia de Brasília e paciente/responsável da
--      mesma clínica (ou rede).
--   5. Limites dos planos: Básico 1 profissional e 1 unidade; Profissional
--      até 3 profissionais e 1 unidade; Clínica sem limite. Conferidos ao
--      vincular alguém, ao convidar e ao criar unidade.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Dado do caixa em configuracoes_clinica
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS configuracoes_clinica_insert ON public.configuracoes_clinica;
CREATE POLICY configuracoes_clinica_insert ON public.configuracoes_clinica
    FOR INSERT TO authenticated
    WITH CHECK (
        public.user_is_clinic_admin(clinica_id)
        OR (chave = 'lancamentos_meta' AND public.user_has_clinic_access(clinica_id))
    );

DROP POLICY IF EXISTS configuracoes_clinica_update ON public.configuracoes_clinica;
CREATE POLICY configuracoes_clinica_update ON public.configuracoes_clinica
    FOR UPDATE TO authenticated
    USING (
        public.user_is_clinic_admin(clinica_id)
        OR (chave = 'lancamentos_meta' AND public.user_has_clinic_access(clinica_id))
    )
    WITH CHECK (
        public.user_is_clinic_admin(clinica_id)
        OR (chave = 'lancamentos_meta' AND public.user_has_clinic_access(clinica_id))
    );

-- ---------------------------------------------------------------------
-- 2. Documento do paciente aponta só para arquivo dele
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.paciente_documentos_conferir_arquivo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_padrao TEXT;
BEGIN
    -- Servidor (service role) e sincronização com a chave de serviço passam.
    IF coalesce(auth.role(), '') <> 'authenticated' THEN
        RETURN NEW;
    END IF;
    -- Linha antiga editada só no nome: não é barrada pelo que já tinha.
    IF TG_OP = 'UPDATE'
       AND NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path
       AND NEW.meta IS NOT DISTINCT FROM OLD.meta THEN
        RETURN NEW;
    END IF;

    v_padrao := '^pacientes/' || NEW.paciente_id::text || '/documentos/[A-Za-z0-9_.-]{1,160}$';
    IF coalesce(NEW.storage_path, '') <> '' AND NEW.storage_path !~ v_padrao THEN
        RAISE EXCEPTION 'Caminho de arquivo inválido para este paciente.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(NEW.meta -> 'storagePath') = 'string' AND NEW.meta ->> 'storagePath' !~ v_padrao THEN
        RAISE EXCEPTION 'Caminho de arquivo inválido para este paciente.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(NEW.meta -> 'dataUrl') = 'string'
       AND NEW.meta ->> 'dataUrl' !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' THEN
        RAISE EXCEPTION 'Documento embutido só pode ser imagem JPEG, PNG ou WebP.' USING ERRCODE = '22023';
    END IF;
    IF NEW.meta ?| ARRAY['previewUrl', 'url'] THEN
        RAISE EXCEPTION 'Campo não permitido no documento.' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paciente_documentos_arquivo ON public.paciente_documentos;
CREATE TRIGGER trg_paciente_documentos_arquivo
    BEFORE INSERT OR UPDATE ON public.paciente_documentos
    FOR EACH ROW EXECUTE FUNCTION public.paciente_documentos_conferir_arquivo();

REVOKE ALL ON FUNCTION public.paciente_documentos_conferir_arquivo() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Limite de tentativas das rotas públicas (compra, link de acesso,
--    "Esqueci a senha"). Conta e registra numa única operação travada pela
--    chave: duas requisições ao mesmo tempo não passam as duas do limite.
--    A chave é um resumo (hash) feito pelo servidor; e-mail e IP não ficam
--    guardados aqui. Linhas com mais de 2 dias são apagadas no caminho.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.limites_publicos (
    id BIGSERIAL PRIMARY KEY,
    chave TEXT NOT NULL CHECK (char_length(chave) BETWEEN 3 AND 120),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS limites_publicos_chave_idx ON public.limites_publicos (chave, criado_em DESC);
CREATE INDEX IF NOT EXISTS limites_publicos_criado_idx ON public.limites_publicos (criado_em);
ALTER TABLE public.limites_publicos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limites_publicos FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.limites_publicos TO service_role;
REVOKE ALL ON SEQUENCE public.limites_publicos_id_seq FROM PUBLIC, anon, authenticated;

-- true = pode seguir (e a tentativa fica contada); false = passou do limite.
CREATE OR REPLACE FUNCTION public.limite_publico_consumir(p_chave TEXT, p_maximo INTEGER, p_janela_segundos INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usadas INTEGER;
BEGIN
    IF coalesce(p_chave, '') = '' OR p_maximo IS NULL OR p_maximo < 1 OR p_janela_segundos IS NULL OR p_janela_segundos < 1 THEN
        RAISE EXCEPTION 'Limite inválido.' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('limite_publico:' || p_chave));
    SELECT count(*) INTO v_usadas
      FROM public.limites_publicos
     WHERE chave = p_chave AND criado_em > now() - make_interval(secs => p_janela_segundos);
    IF v_usadas >= p_maximo THEN
        RETURN false;
    END IF;
    INSERT INTO public.limites_publicos (chave) VALUES (left(p_chave, 120));
    -- Faxina oportunista: nada aqui precisa de mais de 2 dias.
    IF random() < 0.02 THEN
        DELETE FROM public.limites_publicos WHERE criado_em < now() - interval '2 days';
    END IF;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.limite_publico_consumir(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limite_publico_consumir(TEXT, INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------------------------------
-- 4. Tarefas
--    a) "atrasada" pelo dia de Brasília: o banco roda em UTC e, das 21h à
--       meia-noite, a tarefa do dia já aparecia atrasada. A view é recriada
--       (DROP + CREATE: `t.*` pode ter ganhado colunas desde 20260601, e o
--       CREATE OR REPLACE recusaria a mudança de posição).
--    b) A tarefa só aponta para paciente e responsável da mesma clínica (ou
--       da mesma rede), como já vale para agendamentos (20261125).
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_tarefas_completo;
CREATE VIEW public.v_tarefas_completo
WITH (security_invoker = true)
AS
SELECT
    t.*,
    p.nome AS responsavel_nome,
    p.user_id AS responsavel_user_id,
    pa.nome AS paciente_nome,
    pa.telefone AS paciente_telefone,
    CASE
        WHEN t.data_limite < (now() AT TIME ZONE 'America/Sao_Paulo')::date AND t.status != 'concluido' THEN 'atrasada'
        WHEN t.data_limite <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + 3 AND t.status != 'concluido' THEN 'proxima'
        ELSE 'normal'
    END AS alerta_data
FROM public.tarefas t
LEFT JOIN public.profissionais p ON t.responsavel_id = p.id
LEFT JOIN public.pacientes pa ON t.paciente_id = pa.id;
REVOKE ALL ON public.v_tarefas_completo FROM PUBLIC, anon;
GRANT SELECT ON public.v_tarefas_completo TO authenticated;

CREATE OR REPLACE FUNCTION public.tarefas_validar_vinculos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rede UUID;
    v_clinica_paciente BIGINT;
BEGIN
    IF NEW.clinica_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.paciente_id IS NOT DISTINCT FROM OLD.paciente_id
       AND NEW.responsavel_id IS NOT DISTINCT FROM OLD.responsavel_id
       AND NEW.clinica_id IS NOT DISTINCT FROM OLD.clinica_id THEN
        RETURN NEW;
    END IF;
    SELECT c.rede_id INTO v_rede FROM public.clinicas c WHERE c.id = NEW.clinica_id;

    IF NEW.paciente_id IS NOT NULL THEN
        SELECT p.clinica_id INTO v_clinica_paciente FROM public.pacientes p WHERE p.id = NEW.paciente_id;
        IF v_clinica_paciente IS NOT NULL AND v_clinica_paciente <> NEW.clinica_id AND NOT EXISTS (
            SELECT 1 FROM public.clinicas b WHERE b.id = v_clinica_paciente AND v_rede IS NOT NULL AND b.rede_id = v_rede
        ) THEN
            RAISE EXCEPTION 'O paciente da tarefa não é desta clínica.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF NEW.responsavel_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
          JOIN public.clinicas c ON c.id = pc.clinica_id
         WHERE pc.profissional_id = NEW.responsavel_id
           AND (pc.clinica_id = NEW.clinica_id OR (v_rede IS NOT NULL AND c.rede_id = v_rede))
    ) THEN
        RAISE EXCEPTION 'O responsável pela tarefa não trabalha nesta clínica.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tarefas_validar_vinculos ON public.tarefas;
CREATE TRIGGER trg_tarefas_validar_vinculos
    BEFORE INSERT OR UPDATE ON public.tarefas
    FOR EACH ROW EXECUTE FUNCTION public.tarefas_validar_vinculos();
REVOKE ALL ON FUNCTION public.tarefas_validar_vinculos() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Limites dos planos (o que a vitrine promete)
--    Básico: 1 profissional e 1 unidade. Profissional: até 3 profissionais e
--    1 unidade. Clínica: sem limite de profissionais e várias unidades.
--    Planos combinados à mão (essencial, rede, enterprise) e rede sem plano:
--    sem limite. O limite vale para quem ENTRA: ninguém é removido quando a
--    rede passa de um plano maior para um menor.
--    Ocupa vaga: cada pessoa vinculada a alguma unidade da rede (própria ou
--    convidada), contada uma vez. O dono da plataforma não ocupa vaga.
--    Tirar alguém da equipe libera a vaga.
-- ---------------------------------------------------------------------
ALTER TABLE public.planos_saas
    ADD COLUMN IF NOT EXISTS limite_profissionais INTEGER CHECK (limite_profissionais IS NULL OR limite_profissionais > 0),
    ADD COLUMN IF NOT EXISTS limite_unidades INTEGER CHECK (limite_unidades IS NULL OR limite_unidades > 0);
COMMENT ON COLUMN public.planos_saas.limite_profissionais IS
    'Pessoas que podem ter acesso às unidades da rede (NULL = sem limite).';
COMMENT ON COLUMN public.planos_saas.limite_unidades IS
    'Unidades (clínicas) da rede (NULL = sem limite além do teto geral de 10).';
UPDATE public.planos_saas SET limite_profissionais = 1, limite_unidades = 1
 WHERE codigo = 'basico' AND limite_profissionais IS NULL AND limite_unidades IS NULL;
UPDATE public.planos_saas SET limite_profissionais = 3, limite_unidades = 1
 WHERE codigo = 'profissional' AND limite_profissionais IS NULL AND limite_unidades IS NULL;

CREATE OR REPLACE FUNCTION public.plano_frase_profissionais(p_plano TEXT, p_limite INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT format(
        'O plano %s permite %s. Para incluir mais pessoas na equipe, fale com o suporte do Ortus para mudar de plano.',
        coalesce(p_plano, 'desta clínica'),
        CASE WHEN p_limite = 1 THEN '1 profissional' ELSE 'até ' || p_limite || ' profissionais' END
    );
$$;

CREATE OR REPLACE FUNCTION public.plano_frase_unidades(p_plano TEXT, p_limite INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT format(
        'O plano %s permite %s. Para abrir outra unidade, fale com o suporte do Ortus para mudar para o plano Clínica.',
        coalesce(p_plano, 'desta clínica'),
        CASE WHEN p_limite = 1 THEN '1 unidade' ELSE 'até ' || p_limite || ' unidades' END
    );
$$;

-- Uso da rede: o plano, os limites e quanto já está ocupado.
CREATE OR REPLACE FUNCTION public.plano_uso_rede(p_rede UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'plano', r.plano,
        'plano_nome', pl.nome,
        'limite_profissionais', pl.limite_profissionais,
        'profissionais', (
            SELECT count(DISTINCT pc.profissional_id)::int
              FROM public.profissionais_clinicas pc
              JOIN public.clinicas c ON c.id = pc.clinica_id
              JOIN public.profissionais p ON p.id = pc.profissional_id
             WHERE c.rede_id = r.id AND NOT coalesce(p.is_super_admin, false)
        ),
        'limite_unidades', pl.limite_unidades,
        'unidades', (SELECT count(*)::int FROM public.clinicas c WHERE c.rede_id = r.id)
    )
      FROM public.redes r
      LEFT JOIN public.planos_saas pl ON pl.codigo = r.plano
     WHERE r.id = p_rede;
$$;

-- Vínculo novo (cadastro de funcionário, aceite de convite, vínculo pelo painel).
CREATE OR REPLACE FUNCTION public.plano_conferir_profissionais()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_antigo BIGINT;
    v_rede UUID;
    v_nome TEXT;
    v_limite INTEGER;
    v_usados INTEGER;
BEGIN
    IF NEW.clinica_id IS NULL OR NEW.profissional_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.clinica_id IS NOT DISTINCT FROM OLD.clinica_id AND NEW.profissional_id IS NOT DISTINCT FROM OLD.profissional_id THEN
            RETURN NEW;
        END IF;
        v_id_antigo := OLD.id;
    END IF;

    SELECT r.id, pl.nome, pl.limite_profissionais INTO v_rede, v_nome, v_limite
      FROM public.clinicas c
      JOIN public.redes r ON r.id = c.rede_id
      LEFT JOIN public.planos_saas pl ON pl.codigo = r.plano
     WHERE c.id = NEW.clinica_id;
    IF v_rede IS NULL OR v_limite IS NULL THEN
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = NEW.profissional_id AND p.is_super_admin) THEN
        RETURN NEW;
    END IF;

    -- Dois cadastros ao mesmo tempo na mesma rede não passam juntos do limite.
    PERFORM pg_advisory_xact_lock(hashtext('plano_profissionais:' || v_rede::text));

    -- Quem já trabalha em outra unidade da rede não ocupa vaga nova.
    IF EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
          JOIN public.clinicas c ON c.id = pc.clinica_id
         WHERE c.rede_id = v_rede AND pc.profissional_id = NEW.profissional_id
           AND (v_id_antigo IS NULL OR pc.id <> v_id_antigo)
    ) THEN
        RETURN NEW;
    END IF;

    SELECT count(DISTINCT pc.profissional_id) INTO v_usados
      FROM public.profissionais_clinicas pc
      JOIN public.clinicas c ON c.id = pc.clinica_id
      JOIN public.profissionais p ON p.id = pc.profissional_id
     WHERE c.rede_id = v_rede AND NOT coalesce(p.is_super_admin, false)
       AND (v_id_antigo IS NULL OR pc.id <> v_id_antigo);
    IF v_usados >= v_limite THEN
        RAISE EXCEPTION '%', public.plano_frase_profissionais(v_nome, v_limite) USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plano_conferir_profissionais ON public.profissionais_clinicas;
CREATE TRIGGER trg_plano_conferir_profissionais
    BEFORE INSERT OR UPDATE OF clinica_id, profissional_id ON public.profissionais_clinicas
    FOR EACH ROW EXECUTE FUNCTION public.plano_conferir_profissionais();

-- Convite novo: o administrador fica sabendo na hora que a equipe está completa
-- (o aceite confere de novo, pelo vínculo).
CREATE OR REPLACE FUNCTION public.plano_conferir_convite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinica BIGINT;
    v_rede UUID;
    v_nome TEXT;
    v_limite INTEGER;
    v_usados INTEGER;
BEGIN
    FOREACH v_clinica IN ARRAY coalesce(NEW.clinica_ids, ARRAY[]::BIGINT[]) LOOP
        SELECT r.id, pl.nome, pl.limite_profissionais INTO v_rede, v_nome, v_limite
          FROM public.clinicas c
          JOIN public.redes r ON r.id = c.rede_id
          LEFT JOIN public.planos_saas pl ON pl.codigo = r.plano
         WHERE c.id = v_clinica;
        IF v_rede IS NULL OR v_limite IS NULL THEN
            CONTINUE;
        END IF;
        IF NEW.convidado_profissional_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.profissionais_clinicas pc
              JOIN public.clinicas c ON c.id = pc.clinica_id
             WHERE c.rede_id = v_rede AND pc.profissional_id = NEW.convidado_profissional_id
        ) THEN
            CONTINUE;
        END IF;
        SELECT count(DISTINCT pc.profissional_id) INTO v_usados
          FROM public.profissionais_clinicas pc
          JOIN public.clinicas c ON c.id = pc.clinica_id
          JOIN public.profissionais p ON p.id = pc.profissional_id
         WHERE c.rede_id = v_rede AND NOT coalesce(p.is_super_admin, false);
        IF v_usados >= v_limite THEN
            RAISE EXCEPTION '%', public.plano_frase_profissionais(v_nome, v_limite) USING ERRCODE = 'P0001';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plano_conferir_convite ON public.convites_equipe;
CREATE TRIGGER trg_plano_conferir_convite
    BEFORE INSERT ON public.convites_equipe
    FOR EACH ROW EXECUTE FUNCTION public.plano_conferir_convite();

-- Unidade nova (ou unidade levada para outra rede).
CREATE OR REPLACE FUNCTION public.plano_conferir_unidades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_antigo BIGINT;
    v_nome TEXT;
    v_limite INTEGER;
    v_usadas INTEGER;
BEGIN
    IF NEW.rede_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.rede_id IS NOT DISTINCT FROM OLD.rede_id THEN
            RETURN NEW;
        END IF;
        v_id_antigo := OLD.id;
    END IF;
    SELECT pl.nome, pl.limite_unidades INTO v_nome, v_limite
      FROM public.redes r
      LEFT JOIN public.planos_saas pl ON pl.codigo = r.plano
     WHERE r.id = NEW.rede_id;
    IF v_limite IS NULL THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('plano_unidades:' || NEW.rede_id::text));
    SELECT count(*) INTO v_usadas
      FROM public.clinicas c
     WHERE c.rede_id = NEW.rede_id AND (v_id_antigo IS NULL OR c.id <> v_id_antigo);
    IF v_usadas >= v_limite THEN
        RAISE EXCEPTION '%', public.plano_frase_unidades(v_nome, v_limite) USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plano_conferir_unidades ON public.clinicas;
CREATE TRIGGER trg_plano_conferir_unidades
    BEFORE INSERT OR UPDATE OF rede_id ON public.clinicas
    FOR EACH ROW EXECUTE FUNCTION public.plano_conferir_unidades();

REVOKE ALL ON FUNCTION public.plano_uso_rede(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plano_uso_rede(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.plano_conferir_profissionais() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plano_conferir_convite() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plano_conferir_unidades() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plano_frase_profissionais(TEXT, INTEGER), public.plano_frase_unidades(TEXT, INTEGER) TO authenticated, service_role;

-- A tela Assinatura (administrador da matriz) mostra o uso do plano.
CREATE OR REPLACE FUNCTION public.assinatura_uso_do_plano(p_clinica BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rede UUID;
BEGIN
    IF auth.uid() IS NULL OR NOT (public.user_has_clinic_access(p_clinica) OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Sem acesso a esta clínica.' USING ERRCODE = '42501';
    END IF;
    SELECT c.rede_id INTO v_rede FROM public.clinicas c WHERE c.id = p_clinica;
    IF v_rede IS NULL OR NOT (public.user_is_rede_admin(v_rede) OR public.is_super_admin()) THEN
        RETURN NULL;
    END IF;
    RETURN public.plano_uso_rede(v_rede);
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_uso_do_plano(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assinatura_uso_do_plano(BIGINT) TO authenticated, service_role;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261128_ajustes_finais')
ON CONFLICT (id) DO NOTHING;

COMMIT;
