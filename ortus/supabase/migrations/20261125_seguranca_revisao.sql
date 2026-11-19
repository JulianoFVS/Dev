-- =====================================================================
-- ORTUS — Correções da revisão de segurança de 18/11/2026
--
-- Cada bloco fecha um caminho que a revisão do código mostrou aberto.
-- Todos têm verificação correspondente em scripts/testar-rls.mjs.
--
--   1. Storage: envio direto ao bucket `arquivos_ortus` volta a ser fechado
--      (20261114_seguranca_total tinha reaberto INSERT e UPDATE). O envio
--      legítimo usa link assinado emitido pelo servidor, que confere cota,
--      tipo e ritmo.
--   2. `kanban_cartoes`: gravar exige a clínica da linha; o paciente, quando
--      informado, tem que ser dessa mesma clínica.
--   3. Comissões: regra só o administrador da clínica altera; lançamento só
--      o administrador marca como pago ou apaga.
--   4. `whatsapp_envios`: ninguém apaga pela API (apagar a chave de um
--      lembrete faria o agendador mandar a mensagem de novo).
--   5. `anamnese_links`: o link gravado pela API tem que ser da clínica do
--      paciente, com no máximo 72 h, e não é reaberto nem trocado depois.
--   6. `agendamentos`: o paciente tem que ser da mesma rede da clínica.
--   7. Convites: limite diário e tamanho dos textos; e o aceite exige o link
--      do e-mail do convite — conta criada por terceiro, com senha conhecida,
--      não aceita convite de outra rede sem a caixa de entrada da pessoa.
--   8. `rede_status_financeiro` deixa de ser chamável por qualquer logado.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Storage: sem envio nem troca direta no bucket de arquivos
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS arquivos_ortus_insert ON storage.objects;
DROP POLICY IF EXISTS arquivos_ortus_update ON storage.objects;

-- ---------------------------------------------------------------------
-- 2. Quadro de próteses: a clínica da linha manda
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS kanban_cartoes_insert ON public.kanban_cartoes;
CREATE POLICY kanban_cartoes_insert ON public.kanban_cartoes
    FOR INSERT TO authenticated
    WITH CHECK (
        clinica_id IS NOT NULL
        AND public.user_has_clinic_access(clinica_id)
        AND (
            paciente_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.pacientes pa
                 WHERE pa.id = kanban_cartoes.paciente_id
                   AND pa.clinica_id::text = kanban_cartoes.clinica_id::text
            )
        )
    );

-- O USING continua aceitando linha antiga sem clínica (pelo paciente), para
-- ela poder ser corrigida; o que se grava precisa sair com a clínica certa.
DROP POLICY IF EXISTS kanban_cartoes_update ON public.kanban_cartoes;
CREATE POLICY kanban_cartoes_update ON public.kanban_cartoes
    FOR UPDATE TO authenticated
    USING (
        (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id))
        OR (clinica_id IS NULL AND EXISTS (
            SELECT 1 FROM public.pacientes pa
             WHERE pa.id = kanban_cartoes.paciente_id AND public.user_has_clinic_access(pa.clinica_id)
        ))
    )
    WITH CHECK (
        clinica_id IS NOT NULL
        AND public.user_has_clinic_access(clinica_id)
        AND (
            paciente_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.pacientes pa
                 WHERE pa.id = kanban_cartoes.paciente_id
                   AND pa.clinica_id::text = kanban_cartoes.clinica_id::text
            )
        )
    );

-- ---------------------------------------------------------------------
-- 3. Comissões
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS comissoes_regras_insert ON public.comissoes_regras;
CREATE POLICY comissoes_regras_insert ON public.comissoes_regras
    FOR INSERT TO authenticated WITH CHECK (public.user_is_clinic_admin(clinica_id));
DROP POLICY IF EXISTS comissoes_regras_update ON public.comissoes_regras;
CREATE POLICY comissoes_regras_update ON public.comissoes_regras
    FOR UPDATE TO authenticated
    USING (public.user_is_clinic_admin(clinica_id)) WITH CHECK (public.user_is_clinic_admin(clinica_id));
DROP POLICY IF EXISTS comissoes_regras_delete ON public.comissoes_regras;
CREATE POLICY comissoes_regras_delete ON public.comissoes_regras
    FOR DELETE TO authenticated USING (public.user_is_clinic_admin(clinica_id));

-- Lançamento: qualquer pessoa da clínica gera (ao receber ou finalizar um
-- tratamento); mudar o estado (pago) e apagar é do administrador.
DROP POLICY IF EXISTS comissoes_lancamentos_update ON public.comissoes_lancamentos;
CREATE POLICY comissoes_lancamentos_update ON public.comissoes_lancamentos
    FOR UPDATE TO authenticated
    USING (public.user_is_clinic_admin(clinica_id)) WITH CHECK (public.user_is_clinic_admin(clinica_id));
DROP POLICY IF EXISTS comissoes_lancamentos_delete ON public.comissoes_lancamentos;
CREATE POLICY comissoes_lancamentos_delete ON public.comissoes_lancamentos
    FOR DELETE TO authenticated USING (public.user_is_clinic_admin(clinica_id));

-- ---------------------------------------------------------------------
-- 4. Registro de mensagens enviadas pelo WhatsApp: não se apaga pela API
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS whatsapp_envios_delete ON public.whatsapp_envios;
REVOKE DELETE ON TABLE public.whatsapp_envios FROM authenticated;

-- ---------------------------------------------------------------------
-- 5. Link de anamnese gravado pela API
--
-- Quem cria o link é a rota do servidor (service role), que não passa por
-- aqui. Este gatilho vale para a gravação direta com o token da pessoa
-- (inclusive a sincronização do aplicativo desktop).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anamnese_links_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinica BIGINT;
BEGIN
    IF coalesce(auth.role(), '') <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    SELECT p.clinica_id INTO v_clinica FROM public.pacientes p WHERE p.id = NEW.paciente_id;
    IF v_clinica IS NULL OR NEW.clinica_id IS DISTINCT FROM v_clinica THEN
        RAISE EXCEPTION 'O link de anamnese precisa ser da clínica do paciente.' USING ERRCODE = '42501';
    END IF;
    IF NEW.expires_at IS NULL OR NEW.expires_at > now() + interval '72 hours 5 minutes' THEN
        RAISE EXCEPTION 'O link de anamnese vale no máximo 72 horas.' USING ERRCODE = '22023';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.token_hash IS DISTINCT FROM OLD.token_hash
           OR NEW.paciente_id IS DISTINCT FROM OLD.paciente_id
           OR NEW.clinica_id IS DISTINCT FROM OLD.clinica_id
           OR NEW.modelo_id IS DISTINCT FROM OLD.modelo_id THEN
            RAISE EXCEPTION 'Um link de anamnese não é trocado depois de criado: gere outro.' USING ERRCODE = '42501';
        END IF;
        IF NEW.expires_at > OLD.expires_at OR (OLD.usado_em IS NOT NULL AND NEW.usado_em IS NULL) THEN
            RAISE EXCEPTION 'Um link de anamnese não é prorrogado nem reaberto: gere outro.' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anamnese_links_validar ON public.anamnese_links;
CREATE TRIGGER trg_anamnese_links_validar
    BEFORE INSERT OR UPDATE ON public.anamnese_links
    FOR EACH ROW EXECUTE FUNCTION public.anamnese_links_validar();

-- ---------------------------------------------------------------------
-- 6. Agendamento: paciente da mesma rede
--
-- A policy só olhava a clínica do agendamento; com o id de um paciente de
-- outra rede, o lembrete (enviado pelo servidor) seguiria para ele.
-- Paciente de outra unidade da MESMA rede continua valendo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agendamentos_validar_paciente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinica_paciente BIGINT;
BEGIN
    IF NEW.paciente_id IS NULL OR NEW.clinica_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.paciente_id IS NOT DISTINCT FROM OLD.paciente_id
       AND NEW.clinica_id IS NOT DISTINCT FROM OLD.clinica_id THEN
        RETURN NEW;
    END IF;

    SELECT p.clinica_id INTO v_clinica_paciente FROM public.pacientes p WHERE p.id = NEW.paciente_id;
    IF v_clinica_paciente IS NULL THEN
        RETURN NEW; -- paciente sem clínica ou removido: a chave estrangeira decide
    END IF;
    IF v_clinica_paciente = NEW.clinica_id THEN
        RETURN NEW;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.clinicas a JOIN public.clinicas b ON b.rede_id = a.rede_id
         WHERE a.id = NEW.clinica_id AND b.id = v_clinica_paciente AND a.rede_id IS NOT NULL
    ) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'O paciente não pertence a esta clínica.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamentos_validar_paciente ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_validar_paciente
    BEFORE INSERT OR UPDATE ON public.agendamentos
    FOR EACH ROW EXECUTE FUNCTION public.agendamentos_validar_paciente();

-- ---------------------------------------------------------------------
-- 7. Convites entre redes
-- ---------------------------------------------------------------------
-- 7a. Limite e tamanho. Vale para qualquer caminho que crie o convite.
CREATE OR REPLACE FUNCTION public.convites_equipe_limitar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.cargo := left(NEW.cargo, 80);
    NEW.mensagem := left(NEW.mensagem, 500);
    NEW.convidante_nome := left(NEW.convidante_nome, 120);
    NEW.convidado_nome := left(NEW.convidado_nome, 120);

    IF NEW.convidante_profissional_id IS NOT NULL AND (
        SELECT count(*) FROM public.convites_equipe c
         WHERE c.convidante_profissional_id = NEW.convidante_profissional_id
           AND c.criado_em > now() - interval '24 hours'
    ) >= 30 THEN
        RAISE EXCEPTION 'Limite de 30 convites por dia atingido. Tente de novo amanhã.' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_convites_equipe_limitar ON public.convites_equipe;
CREATE TRIGGER trg_convites_equipe_limitar
    BEFORE INSERT ON public.convites_equipe
    FOR EACH ROW EXECUTE FUNCTION public.convites_equipe_limitar();

-- 7b. Aceite com prova de que o convidado é dono do e-mail.
--
-- Uma conta pode ter sido criada por um administrador (que conhece a senha
-- temporária) com o e-mail de outra pessoa. Se outra rede convidar esse
-- e-mail, quem "aceita" é quem tem a senha — e passa a ler os pacientes da
-- clínica que convidou. Por isso o aceite exige a chave que só vai no link do
-- e-mail do convite: a pessoa abre o link logada e o convite fica confirmado
-- para aquela conta. Cada convite tem a sua chave; um e-mail novo troca a
-- chave e o link anterior para de valer.
ALTER TABLE public.convites_equipe
    ADD COLUMN IF NOT EXISTS aceite_hash TEXT,
    ADD COLUMN IF NOT EXISTS email_confirmado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_confirmado_por UUID;
COMMENT ON COLUMN public.convites_equipe.aceite_hash IS
    'SHA-256 da chave que vai no link do e-mail do convite. A chave em si não é guardada, e o resumo não permite montar o link.';
COMMENT ON COLUMN public.convites_equipe.email_confirmado_por IS
    'Conta que abriu o link do e-mail do convite. Só ela aceita o convite.';

CREATE OR REPLACE FUNCTION public.equipe_confirmar_email(p_convite BIGINT, p_chave TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_convite RECORD;
    v_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Entre na sua conta para confirmar o convite.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_convite FROM public.convites_equipe WHERE id = p_convite FOR UPDATE;
    -- Convite inexistente, de outra pessoa ou com chave errada respondem igual.
    IF v_convite.id IS NULL
       OR NOT (v_convite.convidado_user_id = auth.uid() OR lower(v_convite.convidado_email) = v_email)
       OR v_convite.aceite_hash IS NULL
       OR coalesce(p_chave, '') = ''
       OR v_convite.aceite_hash <> encode(sha256(convert_to(p_chave, 'UTF8')), 'hex') THEN
        RAISE EXCEPTION 'Link de confirmação inválido ou substituído por um e-mail mais novo. Peça a quem convidou para reenviar o convite.'
            USING ERRCODE = '22023';
    END IF;
    IF v_convite.status <> 'pendente' THEN
        RAISE EXCEPTION 'Este convite já foi respondido.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.convites_equipe
       SET email_confirmado_em = now(), email_confirmado_por = auth.uid()
     WHERE id = p_convite;
    RETURN jsonb_build_object('confirmado', true, 'convite', p_convite);
END;
$$;

-- O aceite feito pela pessoa (equipe_responder_convite) só passa com o
-- convite confirmado por ela. O servidor (service role) não é barrado.
CREATE OR REPLACE FUNCTION public.convites_equipe_exigir_confirmacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF coalesce(auth.role(), '') = 'authenticated'
       AND NEW.email_confirmado_por IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Antes de aceitar, abra o link do convite que chegou no seu e-mail. Ele confirma que este e-mail é seu.'
            USING ERRCODE = 'P0001', HINT = 'confirmar_email';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_convites_equipe_exigir_confirmacao ON public.convites_equipe;
CREATE TRIGGER trg_convites_equipe_exigir_confirmacao
    BEFORE UPDATE OF status ON public.convites_equipe
    FOR EACH ROW
    WHEN (OLD.status = 'pendente' AND NEW.status = 'aceito')
    EXECUTE FUNCTION public.convites_equipe_exigir_confirmacao();

-- ---------------------------------------------------------------------
-- 8. Funções internas fora do alcance do cliente
-- ---------------------------------------------------------------------
-- Só as funções `saas_*` (SECURITY DEFINER) usam; dizer se um cliente está
-- em dia ou inadimplente não é assunto de quem está logado.
REVOKE ALL ON FUNCTION public.rede_status_financeiro(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rede_status_financeiro(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.equipe_confirmar_email(BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipe_confirmar_email(BIGINT, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.anamnese_links_validar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agendamentos_validar_paciente() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convites_equipe_limitar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convites_equipe_exigir_confirmacao() FROM PUBLIC, anon, authenticated;

-- Visitante não executa nada do schema public (ver 20261121_seguranca_reforco).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261125_seguranca_revisao')
ON CONFLICT (id) DO NOTHING;

COMMIT;
