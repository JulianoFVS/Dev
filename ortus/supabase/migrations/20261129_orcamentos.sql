-- =====================================================================
-- Orçamentos, funil comercial e oportunidades (pedido de 19/11/2026)
--
-- * orcamentos, orcamento_itens e orcamento_contatos: o orçamento de cada
--   paciente, seus itens e o que o comercial conversou com o paciente.
-- * Colunas novas: o tratamento e o débito lembram de qual orçamento vieram;
--   o tratamento passa a ter profissional; o débito guarda a forma de
--   pagamento; o catálogo marca o que é consulta/avaliação (funil de
--   oportunidades).
-- * Módulos novos de permissão: orcamentos e conversas.
--
-- Pode rodar de novo sem estragar nada.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orcamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
    profissional_id BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL,
    comercial_id BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'rascunho'
        CHECK (status IN ('rascunho', 'enviado', 'em_aberto', 'aprovado', 'recusado', 'expirado')),
    validade DATE,
    valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
    desconto NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
    observacoes TEXT CHECK (observacoes IS NULL OR length(observacoes) <= 4000),
    status_desde TIMESTAMPTZ NOT NULL DEFAULT now(),
    enviado_em TIMESTAMPTZ,
    aprovado_em TIMESTAMPTZ,
    recusado_em TIMESTAMPTZ,
    motivo_recusa TEXT CHECK (motivo_recusa IS NULL OR length(motivo_recusa) <= 1000),
    proximo_contato DATE,
    ultimo_contato_em TIMESTAMPTZ,
    criado_por BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orcamentos_clinica_status_idx ON public.orcamentos (clinica_id, status);
CREATE INDEX IF NOT EXISTS orcamentos_paciente_idx ON public.orcamentos (paciente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orcamentos_aprovado_idx ON public.orcamentos (clinica_id, aprovado_em) WHERE aprovado_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS orcamentos_updated_at_idx ON public.orcamentos (updated_at);

-- O tratamento de base não tem FK de propósito: o catálogo criado no desktop
-- sem internet ganha id provisório, e o item não pode travar a sincronização.
CREATE TABLE IF NOT EXISTS public.orcamento_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
    tratamento_base_id BIGINT,
    procedimento TEXT NOT NULL CHECK (length(btrim(procedimento)) BETWEEN 1 AND 300),
    dente TEXT CHECK (dente IS NULL OR length(dente) <= 60),
    quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade BETWEEN 1 AND 999),
    valor_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
    valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
    ordem INTEGER NOT NULL DEFAULT 0,
    tratamento_id UUID REFERENCES public.paciente_tratamentos(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orcamento_itens_orcamento_idx ON public.orcamento_itens (orcamento_id, ordem);
CREATE INDEX IF NOT EXISTS orcamento_itens_updated_at_idx ON public.orcamento_itens (updated_at);

CREATE TABLE IF NOT EXISTS public.orcamento_contatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
    orcamento_id UUID REFERENCES public.orcamentos(id) ON DELETE SET NULL,
    motivo TEXT NOT NULL DEFAULT 'orcamento'
        CHECK (motivo IN ('orcamento', 'avaliacao_sem_orcamento', 'faltou_sem_retorno', 'cancelou_sem_retorno', 'outro')),
    canal TEXT NOT NULL DEFAULT 'ligacao' CHECK (canal IN ('ligacao', 'whatsapp', 'presencial', 'outro')),
    resumo TEXT CHECK (resumo IS NULL OR length(resumo) <= 2000),
    proximo_contato DATE,
    feito_por BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orcamento_contatos_paciente_idx ON public.orcamento_contatos (clinica_id, paciente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orcamento_contatos_orcamento_idx ON public.orcamento_contatos (orcamento_id);
CREATE INDEX IF NOT EXISTS orcamento_contatos_updated_at_idx ON public.orcamento_contatos (updated_at);

-- ---------------------------------------------------------------------
-- 2. Colunas novas em tabelas que já existem
-- ---------------------------------------------------------------------
ALTER TABLE public.paciente_tratamentos ADD COLUMN IF NOT EXISTS orcamento_id UUID REFERENCES public.orcamentos(id) ON DELETE SET NULL;
ALTER TABLE public.paciente_tratamentos ADD COLUMN IF NOT EXISTS profissional_id BIGINT REFERENCES public.profissionais(id) ON DELETE SET NULL;
ALTER TABLE public.paciente_debitos ADD COLUMN IF NOT EXISTS orcamento_id UUID REFERENCES public.orcamentos(id) ON DELETE SET NULL;
ALTER TABLE public.paciente_debitos ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
ALTER TABLE public.tratamentos_base ADD COLUMN IF NOT EXISTS avaliacao BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS paciente_tratamentos_orcamento_idx ON public.paciente_tratamentos (orcamento_id) WHERE orcamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS paciente_debitos_orcamento_idx ON public.paciente_debitos (orcamento_id) WHERE orcamento_id IS NOT NULL;

-- Consulta e avaliação já cadastradas entram no funil de oportunidades.
-- A clínica pode desmarcar depois, em Tratamentos.
UPDATE public.tratamentos_base
   SET avaliacao = true
 WHERE avaliacao = false
   AND (nome ILIKE '%avalia%' OR nome ILIKE '%consulta%');

-- ---------------------------------------------------------------------
-- 3. Vínculos: o paciente, o profissional e o comercial precisam ser da
--    clínica (ou da mesma rede), como nas tarefas. Compara OLD e NEW: o
--    desktop reenvia a linha inteira e reenviar sem mudar precisa passar.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orcamentos_validar_vinculos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rede UUID;
    v_clinica_paciente BIGINT;
    v_prof BIGINT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.paciente_id IS NOT DISTINCT FROM OLD.paciente_id
       AND NEW.profissional_id IS NOT DISTINCT FROM OLD.profissional_id
       AND NEW.comercial_id IS NOT DISTINCT FROM OLD.comercial_id
       AND NEW.clinica_id IS NOT DISTINCT FROM OLD.clinica_id THEN
        RETURN NEW;
    END IF;
    SELECT c.rede_id INTO v_rede FROM public.clinicas c WHERE c.id = NEW.clinica_id;

    SELECT p.clinica_id INTO v_clinica_paciente FROM public.pacientes p WHERE p.id = NEW.paciente_id;
    IF v_clinica_paciente IS NOT NULL AND v_clinica_paciente <> NEW.clinica_id AND NOT EXISTS (
        SELECT 1 FROM public.clinicas b WHERE b.id = v_clinica_paciente AND v_rede IS NOT NULL AND b.rede_id = v_rede
    ) THEN
        RAISE EXCEPTION 'O paciente do orçamento não é desta clínica.' USING ERRCODE = 'P0001';
    END IF;

    FOREACH v_prof IN ARRAY ARRAY[NEW.profissional_id, NEW.comercial_id] LOOP
        IF v_prof IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.profissionais_clinicas pc
              JOIN public.clinicas c ON c.id = pc.clinica_id
             WHERE pc.profissional_id = v_prof
               AND (pc.clinica_id = NEW.clinica_id OR (v_rede IS NOT NULL AND c.rede_id = v_rede))
        ) THEN
            RAISE EXCEPTION 'O profissional escolhido não trabalha nesta clínica.' USING ERRCODE = 'P0001';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamentos_validar_vinculos ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_validar_vinculos
    BEFORE INSERT OR UPDATE ON public.orcamentos
    FOR EACH ROW EXECUTE FUNCTION public.orcamentos_validar_vinculos();

-- Itens e contatos: a clínica da linha é a do orçamento; o paciente do
-- contato é o do orçamento (quando houver) e é da clínica ou da rede.
CREATE OR REPLACE FUNCTION public.orcamento_filhos_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orc_clinica BIGINT;
    v_orc_paciente UUID;
    v_rede UUID;
    v_clinica_paciente BIGINT;
    v_orcamento UUID := NEW.orcamento_id;
BEGIN
    IF TG_TABLE_NAME = 'orcamento_itens' THEN
        IF TG_OP = 'UPDATE'
           AND NEW.orcamento_id IS NOT DISTINCT FROM OLD.orcamento_id
           AND NEW.clinica_id IS NOT DISTINCT FROM OLD.clinica_id
           AND NEW.tratamento_id IS NOT DISTINCT FROM OLD.tratamento_id THEN
            RETURN NEW;
        END IF;
    ELSE
        IF TG_OP = 'UPDATE'
           AND NEW.orcamento_id IS NOT DISTINCT FROM OLD.orcamento_id
           AND NEW.clinica_id IS NOT DISTINCT FROM OLD.clinica_id
           AND NEW.paciente_id IS NOT DISTINCT FROM OLD.paciente_id
           AND NEW.feito_por IS NOT DISTINCT FROM OLD.feito_por THEN
            RETURN NEW;
        END IF;
    END IF;

    IF v_orcamento IS NOT NULL THEN
        SELECT o.clinica_id, o.paciente_id INTO v_orc_clinica, v_orc_paciente
          FROM public.orcamentos o WHERE o.id = v_orcamento;
        IF v_orc_clinica IS NOT NULL AND v_orc_clinica <> NEW.clinica_id THEN
            RAISE EXCEPTION 'O orçamento não é desta clínica.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'orcamento_itens' THEN
        IF NEW.tratamento_id IS NOT NULL AND v_orc_paciente IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.paciente_tratamentos t
             WHERE t.id = NEW.tratamento_id AND t.paciente_id = v_orc_paciente
        ) THEN
            RAISE EXCEPTION 'O tratamento não é do paciente do orçamento.' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF v_orc_paciente IS NOT NULL AND v_orc_paciente <> NEW.paciente_id THEN
        RAISE EXCEPTION 'O contato precisa ser do mesmo paciente do orçamento.' USING ERRCODE = 'P0001';
    END IF;
    SELECT c.rede_id INTO v_rede FROM public.clinicas c WHERE c.id = NEW.clinica_id;
    SELECT p.clinica_id INTO v_clinica_paciente FROM public.pacientes p WHERE p.id = NEW.paciente_id;
    IF v_clinica_paciente IS NOT NULL AND v_clinica_paciente <> NEW.clinica_id AND NOT EXISTS (
        SELECT 1 FROM public.clinicas b WHERE b.id = v_clinica_paciente AND v_rede IS NOT NULL AND b.rede_id = v_rede
    ) THEN
        RAISE EXCEPTION 'O paciente do contato não é desta clínica.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.feito_por IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
          JOIN public.clinicas c ON c.id = pc.clinica_id
         WHERE pc.profissional_id = NEW.feito_por
           AND (pc.clinica_id = NEW.clinica_id OR (v_rede IS NOT NULL AND c.rede_id = v_rede))
    ) THEN
        RAISE EXCEPTION 'Quem registrou o contato não trabalha nesta clínica.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_itens_validar ON public.orcamento_itens;
CREATE TRIGGER trg_orcamento_itens_validar
    BEFORE INSERT OR UPDATE ON public.orcamento_itens
    FOR EACH ROW EXECUTE FUNCTION public.orcamento_filhos_validar();

DROP TRIGGER IF EXISTS trg_orcamento_contatos_validar ON public.orcamento_contatos;
CREATE TRIGGER trg_orcamento_contatos_validar
    BEFORE INSERT OR UPDATE ON public.orcamento_contatos
    FOR EACH ROW EXECUTE FUNCTION public.orcamento_filhos_validar();

-- Tratamento e débito que apontam para um orçamento: só um orçamento do
-- mesmo paciente. O profissional do tratamento precisa ser da clínica.
CREATE OR REPLACE FUNCTION public.orcamento_destino_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_paciente UUID;
    v_rede UUID;
    v_clinica BIGINT;
BEGIN
    IF TG_TABLE_NAME = 'paciente_tratamentos' THEN
        IF TG_OP = 'UPDATE'
           AND NEW.orcamento_id IS NOT DISTINCT FROM OLD.orcamento_id
           AND NEW.profissional_id IS NOT DISTINCT FROM OLD.profissional_id
           AND NEW.paciente_id IS NOT DISTINCT FROM OLD.paciente_id THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'UPDATE'
       AND NEW.orcamento_id IS NOT DISTINCT FROM OLD.orcamento_id
       AND NEW.paciente_id IS NOT DISTINCT FROM OLD.paciente_id THEN
        RETURN NEW;
    END IF;

    IF NEW.orcamento_id IS NOT NULL THEN
        SELECT o.paciente_id INTO v_paciente FROM public.orcamentos o WHERE o.id = NEW.orcamento_id;
        IF v_paciente IS NOT NULL AND v_paciente <> NEW.paciente_id THEN
            RAISE EXCEPTION 'O orçamento é de outro paciente.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Ramos separados por tabela: o PL/pgSQL prepara a expressão inteira, e
    -- paciente_debitos não tem profissional_id.
    IF TG_TABLE_NAME = 'paciente_tratamentos' THEN
        IF NEW.profissional_id IS NOT NULL THEN
            v_clinica := coalesce(NEW.clinica_id, (SELECT p.clinica_id FROM public.pacientes p WHERE p.id = NEW.paciente_id));
            SELECT c.rede_id INTO v_rede FROM public.clinicas c WHERE c.id = v_clinica;
            IF NOT EXISTS (
                SELECT 1 FROM public.profissionais_clinicas pc
                  JOIN public.clinicas c ON c.id = pc.clinica_id
                 WHERE pc.profissional_id = NEW.profissional_id
                   AND (pc.clinica_id = v_clinica OR (v_rede IS NOT NULL AND c.rede_id = v_rede))
            ) THEN
                RAISE EXCEPTION 'O profissional do tratamento não trabalha nesta clínica.' USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paciente_tratamentos_orcamento ON public.paciente_tratamentos;
CREATE TRIGGER trg_paciente_tratamentos_orcamento
    BEFORE INSERT OR UPDATE ON public.paciente_tratamentos
    FOR EACH ROW EXECUTE FUNCTION public.orcamento_destino_validar();

DROP TRIGGER IF EXISTS trg_paciente_debitos_orcamento ON public.paciente_debitos;
CREATE TRIGGER trg_paciente_debitos_orcamento
    BEFORE INSERT OR UPDATE ON public.paciente_debitos
    FOR EACH ROW EXECUTE FUNCTION public.orcamento_destino_validar();

REVOKE ALL ON FUNCTION public.orcamentos_validar_vinculos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orcamento_filhos_validar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orcamento_destino_validar() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS: quem trabalha na clínica lê e grava (uma política por comando)
-- ---------------------------------------------------------------------
DO $rls$
DECLARE
    v_tabela TEXT;
BEGIN
    FOREACH v_tabela IN ARRAY ARRAY['orcamentos', 'orcamento_itens', 'orcamento_contatos'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabela);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabela || '_select', v_tabela);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabela || '_insert', v_tabela);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabela || '_update', v_tabela);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabela || '_delete', v_tabela);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_has_clinic_access(clinica_id))',
                       v_tabela || '_select', v_tabela);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_has_clinic_access(clinica_id))',
                       v_tabela || '_insert', v_tabela);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_has_clinic_access(clinica_id)) WITH CHECK (public.user_has_clinic_access(clinica_id))',
                       v_tabela || '_update', v_tabela);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_has_clinic_access(clinica_id))',
                       v_tabela || '_delete', v_tabela);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_tabela);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_tabela);

        -- Sincronização do desktop e modo de consulta da assinatura.
        EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON public.%I', v_tabela);
        EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at()', v_tabela);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at_insert ON public.%I', v_tabela);
        EXECUTE format('CREATE TRIGGER trg_updated_at_insert BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at()', v_tabela);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_registrar_exclusao ON public.%I', v_tabela);
        EXECUTE format('CREATE TRIGGER trg_registrar_exclusao AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.registrar_exclusao()', v_tabela);
        EXECUTE format('DROP TRIGGER IF EXISTS aaa_assinatura_escrita ON public.%I', v_tabela);
        EXECUTE format('CREATE TRIGGER aaa_assinatura_escrita BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.assinatura_barrar_escrita(''clinica'')', v_tabela);
    END LOOP;
END;
$rls$;

-- ---------------------------------------------------------------------
-- 5. Módulos de permissão: orcamentos e conversas
-- ---------------------------------------------------------------------
DO $modulos$
DECLARE
    v_nome TEXT;
BEGIN
    -- A tabela pode ter nascido antes da migration de 01/06, com outro nome
    -- de restrição: procura qualquer CHECK que fale de "modulo".
    FOR v_nome IN
        SELECT c.conname
          FROM pg_constraint c
         WHERE c.conrelid = 'public.permissoes_modulos'::regclass
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%modulo%'
    LOOP
        EXECUTE format('ALTER TABLE public.permissoes_modulos DROP CONSTRAINT %I', v_nome);
    END LOOP;
END;
$modulos$;

ALTER TABLE public.permissoes_modulos
    ADD CONSTRAINT permissoes_modulos_modulo_check CHECK (modulo IN (
        'agenda', 'configuracoes', 'controle_protese', 'estoque', 'ficha_paciente',
        'financeiro', 'inteligencia', 'loja', 'marketing', 'orcamentos', 'conversas'
    ));

-- Quem já trabalha na clínica: orçamentos acompanham o acesso à ficha do
-- paciente; conversas da equipe ficam abertas para todos.
INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar)
SELECT pm.profissional_id, pm.clinica_id, 'orcamentos', coalesce(pm.pode_acessar, false)
  FROM public.permissoes_modulos pm
 WHERE pm.modulo = 'ficha_paciente'
ON CONFLICT (profissional_id, clinica_id, modulo) DO NOTHING;

INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar)
SELECT DISTINCT pm.profissional_id, pm.clinica_id, 'conversas', true
  FROM public.permissoes_modulos pm
ON CONFLICT (profissional_id, clinica_id, modulo) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. Aceite de convite: a lista de módulos e o cargo "Comercial"
--    (os mesmos conjuntos de lib/permissionPresets.ts)
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
    v_cargo TEXT;
    v_modulos TEXT[];
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

    INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id, permissao, convidado)
    SELECT v_prof, cid, 'funcionario', true
      FROM unnest(v_clinicas) AS cid
     WHERE NOT EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
        WHERE pc.profissional_id = v_prof AND pc.clinica_id = cid
     );

    -- O convidado entra com os módulos do cargo informado no convite (os
    -- mesmos conjuntos de lib/permissionPresets.ts).
    v_cargo := lower(coalesce(v_convite.cargo, ''));
    v_modulos := CASE
        WHEN v_cargo LIKE '%recep%' THEN ARRAY['agenda', 'ficha_paciente', 'orcamentos', 'conversas']
        WHEN v_cargo LIKE '%comerc%' OR v_cargo LIKE '%vend%'
            THEN ARRAY['agenda', 'ficha_paciente', 'orcamentos', 'conversas']
        WHEN v_cargo LIKE '%dent%' OR v_cargo LIKE '%ortod%' OR v_cargo LIKE '%implant%'
            THEN ARRAY['agenda', 'ficha_paciente', 'controle_protese', 'orcamentos', 'conversas']
        WHEN v_cargo LIKE '%financ%' OR v_cargo LIKE '%contab%'
            THEN ARRAY['financeiro', 'inteligencia', 'ficha_paciente', 'orcamentos', 'conversas']
        WHEN v_cargo LIKE '%gestor%' OR v_cargo LIKE '%admin%' OR v_cargo LIKE '%sócio%' OR v_cargo LIKE '%socio%'
            THEN ARRAY['agenda', 'ficha_paciente', 'controle_protese', 'financeiro', 'inteligencia', 'orcamentos', 'conversas']
        WHEN v_cargo LIKE '%auxiliar%' OR v_cargo LIKE '%protét%' OR v_cargo LIKE '%prote%'
            THEN ARRAY['agenda', 'ficha_paciente', 'controle_protese', 'orcamentos', 'conversas']
        ELSE ARRAY['agenda', 'ficha_paciente', 'orcamentos', 'conversas']
    END;

    INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar)
    SELECT v_prof, cid, m.modulo, m.modulo = ANY (v_modulos)
      FROM unnest(v_clinicas) AS cid
     CROSS JOIN (VALUES ('agenda'), ('configuracoes'), ('controle_protese'), ('estoque'), ('ficha_paciente'),
                        ('financeiro'), ('inteligencia'), ('loja'), ('marketing'),
                        ('orcamentos'), ('conversas')) AS m(modulo)
     WHERE NOT EXISTS (
        SELECT 1 FROM public.permissoes_modulos pm
        WHERE pm.profissional_id = v_prof AND pm.clinica_id = cid
     )
    ON CONFLICT (profissional_id, clinica_id, modulo) DO NOTHING;

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
REVOKE ALL ON FUNCTION public.equipe_responder_convite(BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipe_responder_convite(BIGINT, BOOLEAN) TO authenticated, service_role;

-- Visitante não executa nada do schema public (ver 20261121_seguranca_reforco).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261129_orcamentos')
ON CONFLICT (id) DO NOTHING;

COMMIT;
