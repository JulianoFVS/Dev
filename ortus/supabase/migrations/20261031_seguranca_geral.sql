-- =====================================================================
-- ORTUS — Segurança geral
-- 1. Remove regras abertas (visitante sem login lia e alterava pacientes,
--    agendamentos, profissionais e vínculos; qualquer logado editava tudo).
-- 2. Impede virar super admin, trocar nível ou mexer no limite de espaço.
-- 3. Backups e restauração só para super admin.
-- 4. Reserva de espaço atômica, com ritmo por usuário e teto mensal.
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_clinic_admin(p_clinica BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR EXISTS (
        SELECT 1
        FROM profissionais_clinicas pc
        JOIN profissionais p ON p.id = pc.profissional_id
        WHERE pc.clinica_id = p_clinica
          AND p.user_id = auth.uid()
          AND p.nivel_acesso = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.user_is_rede_admin(p_rede UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR (p_rede IS NOT NULL AND EXISTS (
        SELECT 1
        FROM clinicas c
        JOIN profissionais_clinicas pc ON pc.clinica_id = c.id
        JOIN profissionais p ON p.id = pc.profissional_id
        WHERE c.rede_id = p_rede
          AND p.user_id = auth.uid()
          AND p.nivel_acesso = 'admin'
    ));
$$;

CREATE OR REPLACE FUNCTION public.clinica_rede(p_clinica BIGINT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT rede_id FROM clinicas WHERE id = p_clinica;
$$;

REVOKE ALL ON FUNCTION public.user_is_clinic_admin(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_is_rede_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clinica_rede(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_clinic_admin(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_rede_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clinica_rede(BIGINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Regras abertas a visitantes e a qualquer logado
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso Total" ON public.agendamentos;
DROP POLICY IF EXISTS "Acesso Total" ON public.pacientes;
DROP POLICY IF EXISTS "Acesso total cartoes" ON public.kanban_cartoes;
DROP POLICY IF EXISTS "Acesso total colunas" ON public.kanban_colunas;
DROP POLICY IF EXISTS "Publico" ON public.prontuarios;

DROP POLICY IF EXISTS "Acesso Total" ON public.profissionais;
DROP POLICY IF EXISTS "Editar Profissionais Completo" ON public.profissionais;
DROP POLICY IF EXISTS "Publico" ON public.profissionais;
DROP POLICY IF EXISTS "Ver Tudo (Recuperacao)" ON public.profissionais;

DROP POLICY IF EXISTS "Acesso Total" ON public.profissionais_clinicas;
DROP POLICY IF EXISTS "Editar Vinculos (Recuperacao)" ON public.profissionais_clinicas;
DROP POLICY IF EXISTS "Publico" ON public.profissionais_clinicas;
DROP POLICY IF EXISTS "Publico Delete" ON public.profissionais_clinicas;
DROP POLICY IF EXISTS "Publico Insert" ON public.profissionais_clinicas;
DROP POLICY IF EXISTS "Ver Vinculos (Recuperacao)" ON public.profissionais_clinicas;

DROP POLICY IF EXISTS "Editar Clinicas (Recuperacao)" ON public.clinicas;
DROP POLICY IF EXISTS "Permitir tudo para usuarios logados" ON public.clinicas;
DROP POLICY IF EXISTS "Publico" ON public.clinicas;
DROP POLICY IF EXISTS "Ver Clinicas (Recuperacao)" ON public.clinicas;

DROP POLICY IF EXISTS "Atualizacao permitida para usuarios logados" ON public.redes;
DROP POLICY IF EXISTS "Exclusao permitida para usuarios logados" ON public.redes;
DROP POLICY IF EXISTS "Insercao permitida para usuarios logados" ON public.redes;
DROP POLICY IF EXISTS "Leitura permitida para usuarios logados" ON public.redes;

DROP POLICY IF EXISTS "Acesso Total Servicos" ON public.servicos;
DROP POLICY IF EXISTS "Gerir procedimentos" ON public.tipos_procedimentos;
DROP POLICY IF EXISTS "Ver procedimentos" ON public.tipos_procedimentos;

DROP POLICY IF EXISTS "Sistema cria notificacoes" ON public.notificacoes;

-- ---------------------------------------------------------------------
-- Regras por clínica que substituem as abertas
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS kanban_colunas_select ON public.kanban_colunas;
CREATE POLICY kanban_colunas_select ON public.kanban_colunas
    FOR SELECT TO authenticated
    USING (clinica_id IS NULL OR public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS kanban_colunas_escrita ON public.kanban_colunas;
CREATE POLICY kanban_colunas_escrita ON public.kanban_colunas
    FOR ALL TO authenticated
    USING (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id))
    WITH CHECK (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id));

DROP POLICY IF EXISTS prontuarios_clinica ON public.prontuarios;
CREATE POLICY prontuarios_clinica ON public.prontuarios
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pacientes pa WHERE pa.id = prontuarios.paciente_id AND public.user_has_clinic_access(pa.clinica_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.pacientes pa WHERE pa.id = prontuarios.paciente_id AND public.user_has_clinic_access(pa.clinica_id)));

DROP POLICY IF EXISTS profissionais_update_admin ON public.profissionais;
CREATE POLICY profissionais_update_admin ON public.profissionais
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
        WHERE pc.profissional_id = profissionais.id AND public.user_is_clinic_admin(pc.clinica_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
        WHERE pc.profissional_id = profissionais.id AND public.user_is_clinic_admin(pc.clinica_id)
    ));

DROP POLICY IF EXISTS profissionais_delete_admin ON public.profissionais;
CREATE POLICY profissionais_delete_admin ON public.profissionais
    FOR DELETE TO authenticated
    USING (public.is_super_admin() OR EXISTS (
        SELECT 1 FROM public.profissionais_clinicas pc
        WHERE pc.profissional_id = profissionais.id AND public.user_is_clinic_admin(pc.clinica_id)
    ));

DROP POLICY IF EXISTS profissionais_clinicas_insert ON public.profissionais_clinicas;
CREATE POLICY profissionais_clinicas_insert ON public.profissionais_clinicas
    FOR INSERT TO authenticated
    WITH CHECK (
        public.user_is_clinic_admin(clinica_id)
        OR public.user_is_rede_admin(public.clinica_rede(clinica_id))
    );

DROP POLICY IF EXISTS profissionais_clinicas_delete ON public.profissionais_clinicas;
CREATE POLICY profissionais_clinicas_delete ON public.profissionais_clinicas
    FOR DELETE TO authenticated
    USING (public.user_is_clinic_admin(clinica_id));

DROP POLICY IF EXISTS clinicas_update ON public.clinicas;
CREATE POLICY clinicas_update ON public.clinicas
    FOR UPDATE TO authenticated
    USING (public.user_is_clinic_admin(id))
    WITH CHECK (public.user_is_clinic_admin(id));

DROP POLICY IF EXISTS clinicas_delete ON public.clinicas;
CREATE POLICY clinicas_delete ON public.clinicas
    FOR DELETE TO authenticated
    USING (public.user_is_clinic_admin(id));

DROP POLICY IF EXISTS clinicas_insert_rede ON public.clinicas;
CREATE POLICY clinicas_insert_rede ON public.clinicas
    FOR INSERT TO authenticated
    WITH CHECK (public.user_is_rede_admin(rede_id));

DROP POLICY IF EXISTS clinicas_select_rede ON public.clinicas;
CREATE POLICY clinicas_select_rede ON public.clinicas
    FOR SELECT TO authenticated
    USING (public.user_is_rede_admin(rede_id));

DROP POLICY IF EXISTS servicos_select ON public.servicos;
CREATE POLICY servicos_select ON public.servicos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS servicos_super_admin ON public.servicos;
CREATE POLICY servicos_super_admin ON public.servicos FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS tipos_procedimentos_select ON public.tipos_procedimentos;
CREATE POLICY tipos_procedimentos_select ON public.tipos_procedimentos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS tipos_procedimentos_super_admin ON public.tipos_procedimentos;
CREATE POLICY tipos_procedimentos_super_admin ON public.tipos_procedimentos FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Notificações: o app só cria para si; os gatilhos de agenda criam para o profissional.
DROP POLICY IF EXISTS notificacoes_insert_propria ON public.notificacoes;
CREATE POLICY notificacoes_insert_propria ON public.notificacoes
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notificacoes_delete_propria ON public.notificacoes;
CREATE POLICY notificacoes_delete_propria ON public.notificacoes
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

ALTER FUNCTION public.notificar_cancelamento() SECURITY DEFINER;
ALTER FUNCTION public.notificar_cancelamento() SET search_path = public;
ALTER FUNCTION public.notificar_novo_agendamento() SECURITY DEFINER;
ALTER FUNCTION public.notificar_novo_agendamento() SET search_path = public;
ALTER FUNCTION public.process_audit_log() SET search_path = public;

-- ---------------------------------------------------------------------
-- Ninguém vira super admin, troca o dono do login ou o próprio nível
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proteger_profissionais()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_super_admin() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF COALESCE(OLD.is_super_admin, FALSE) THEN
            RAISE EXCEPTION 'Sem permissão para remover este usuário.' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF COALESCE(OLD.is_super_admin, FALSE) AND OLD.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Sem permissão para alterar este usuário.' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Sem permissão para alterar o acesso deste usuário.' USING ERRCODE = '42501';
    END IF;
    IF NEW.nivel_acesso IS DISTINCT FROM OLD.nivel_acesso AND NOT EXISTS (
        SELECT 1 FROM profissionais_clinicas pc
        WHERE pc.profissional_id = OLD.id AND public.user_is_clinic_admin(pc.clinica_id)
    ) THEN
        RAISE EXCEPTION 'Só um administrador da clínica pode mudar o nível de acesso.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_profissionais ON public.profissionais;
CREATE TRIGGER trg_proteger_profissionais
    BEFORE UPDATE OR DELETE ON public.profissionais
    FOR EACH ROW EXECUTE FUNCTION public.proteger_profissionais();

-- ---------------------------------------------------------------------
-- Limite de espaço e rede só mudam pelo super admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proteger_clinicas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_super_admin() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.limite_armazenamento_mb := 512;
        IF (SELECT count(*) FROM clinicas WHERE rede_id = NEW.rede_id) >= 10 THEN
            RAISE EXCEPTION 'Limite de 10 unidades por rede. Fale com o suporte.' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.limite_armazenamento_mb IS DISTINCT FROM OLD.limite_armazenamento_mb
       OR NEW.rede_id IS DISTINCT FROM OLD.rede_id THEN
        RAISE EXCEPTION 'Só o suporte pode mudar a rede ou o limite de armazenamento.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_clinicas ON public.clinicas;
CREATE TRIGGER trg_proteger_clinicas
    BEFORE INSERT OR UPDATE ON public.clinicas
    FOR EACH ROW EXECUTE FUNCTION public.proteger_clinicas();

-- ---------------------------------------------------------------------
-- Backups: copiam todas as clínicas juntas, então só o super admin
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS backups_select_admin ON public.backups;
DROP POLICY IF EXISTS backups_delete_admin ON public.backups;
DROP POLICY IF EXISTS backups_select_super_admin ON public.backups;
CREATE POLICY backups_select_super_admin ON public.backups
    FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS backups_delete_super_admin ON public.backups;
CREATE POLICY backups_delete_super_admin ON public.backups
    FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.criar_backup_completo(p_tipo TEXT DEFAULT 'automatico'::TEXT, p_obs TEXT DEFAULT NULL::TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE novo_id BIGINT; snapshot JSONB;
BEGIN
  IF auth.role() IN ('anon', 'authenticated') AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o suporte do Ortus pode criar backups.' USING ERRCODE = '42501';
  END IF;
  snapshot := jsonb_build_object(
    'pacientes', (SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) FROM pacientes p),
    'agendamentos', (SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb) FROM agendamentos a),
    'despesas', (SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb) FROM despesas d),
    'clinicas', (SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb) FROM clinicas c),
    'profissionais', (SELECT COALESCE(jsonb_agg(row_to_json(pr)), '[]'::jsonb) FROM profissionais pr),
    'servicos', (SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) FROM servicos s)
  );
  INSERT INTO backups (tipo, dados, observacao, tamanho_kb)
  VALUES (p_tipo, snapshot, p_obs, LENGTH(snapshot::text)/1024)
  RETURNING id INTO novo_id;
  DELETE FROM backups WHERE id IN (
    SELECT id FROM backups WHERE tipo LIKE 'automatico%' ORDER BY criado_em DESC OFFSET 30
  );
  DELETE FROM backups WHERE id IN (
    SELECT id FROM backups WHERE tipo NOT LIKE 'automatico%' ORDER BY criado_em DESC OFFSET 10
  );
  RETURN novo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurar_backup(p_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE snap JSONB;
BEGIN
  IF auth.role() IN ('anon', 'authenticated') AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o suporte do Ortus pode restaurar backups.' USING ERRCODE = '42501';
  END IF;
  SELECT dados INTO snap FROM backups WHERE id = p_id;
  IF snap IS NULL THEN RAISE EXCEPTION 'Backup % não encontrado', p_id; END IF;
  DELETE FROM agendamentos;
  DELETE FROM despesas;
  DELETE FROM pacientes;
  DELETE FROM servicos;
  DELETE FROM profissionais_clinicas;
  DELETE FROM profissionais;
  DELETE FROM clinicas;
  IF snap ? 'clinicas' THEN INSERT INTO clinicas SELECT * FROM jsonb_populate_recordset(NULL::clinicas, snap->'clinicas'); END IF;
  IF snap ? 'profissionais' THEN INSERT INTO profissionais SELECT * FROM jsonb_populate_recordset(NULL::profissionais, snap->'profissionais'); END IF;
  IF snap ? 'servicos' THEN INSERT INTO servicos SELECT * FROM jsonb_populate_recordset(NULL::servicos, snap->'servicos'); END IF;
  IF snap ? 'pacientes' THEN INSERT INTO pacientes SELECT * FROM jsonb_populate_recordset(NULL::pacientes, snap->'pacientes'); END IF;
  IF snap ? 'agendamentos' THEN INSERT INTO agendamentos SELECT * FROM jsonb_populate_recordset(NULL::agendamentos, snap->'agendamentos'); END IF;
  IF snap ? 'despesas' THEN INSERT INTO despesas SELECT * FROM jsonb_populate_recordset(NULL::despesas, snap->'despesas'); END IF;
  RETURN 'Restauração concluída do backup #' || p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_backup_completo(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurar_backup(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_backup_completo(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurar_backup(BIGINT) TO authenticated, service_role;

-- Visitante sem login não precisa de nada além do que as regras liberam.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Foto de perfil no Supabase: um arquivo por pessoa, sem pasta livre
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS avatars_insert ON storage.objects;
CREATE POLICY avatars_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::TEXT || '/avatar.jpg');

DROP POLICY IF EXISTS avatars_update ON storage.objects;
CREATE POLICY avatars_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND name = auth.uid()::TEXT || '/avatar.jpg')
    WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::TEXT || '/avatar.jpg');

UPDATE storage.buckets SET file_size_limit = 1048576 WHERE id = 'avatars';

-- ---------------------------------------------------------------------
-- Armazenamento: reserva atômica antes de liberar qualquer envio
-- ---------------------------------------------------------------------
ALTER TABLE public.armazenamento_objetos DROP CONSTRAINT IF EXISTS armazenamento_objetos_clinica_id_fkey;
ALTER TABLE public.armazenamento_objetos
    ADD CONSTRAINT armazenamento_objetos_clinica_id_fkey
    FOREIGN KEY (clinica_id) REFERENCES public.clinicas(id) ON DELETE SET NULL;
ALTER TABLE public.armazenamento_objetos ADD COLUMN IF NOT EXISTS confirmado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.armazenamento_objetos ADD COLUMN IF NOT EXISTS usuario_id UUID;
CREATE INDEX IF NOT EXISTS armazenamento_objetos_pendentes_idx
    ON public.armazenamento_objetos (atualizado_em) WHERE NOT confirmado;

CREATE TABLE IF NOT EXISTS public.armazenamento_envios (
    id BIGSERIAL PRIMARY KEY,
    usuario_id UUID NOT NULL,
    caminho TEXT NOT NULL,
    bytes BIGINT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS armazenamento_envios_usuario_idx ON public.armazenamento_envios (usuario_id, criado_em);
CREATE INDEX IF NOT EXISTS armazenamento_envios_data_idx ON public.armazenamento_envios (criado_em);
ALTER TABLE public.armazenamento_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.armazenamento_envios FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.armazenamento_envios_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.armazenamento_reservar(
    p_caminho TEXT,
    p_clinica BIGINT,
    p_bytes BIGINT,
    p_usuario UUID,
    p_teto BIGINT,
    p_registrar BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    v_antigo BIGINT;
    v_limite BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('ortus_armazenamento'));

    DELETE FROM armazenamento_envios WHERE criado_em < now() - INTERVAL '40 days';

    IF (SELECT count(*) FROM armazenamento_envios
        WHERE usuario_id = p_usuario AND criado_em > now() - INTERVAL '10 minutes') >= 40
       OR (SELECT count(*) FROM armazenamento_envios
        WHERE usuario_id = p_usuario AND criado_em > now() - INTERVAL '1 day') >= 400 THEN
        RETURN 'ritmo';
    END IF;
    IF (SELECT count(*) FROM armazenamento_envios WHERE criado_em >= date_trunc('month', now())) >= 200000 THEN
        RETURN 'mes';
    END IF;

    SELECT o.bytes INTO v_antigo FROM armazenamento_objetos o WHERE o.caminho = p_caminho;
    IF v_antigo IS NULL THEN
        SELECT COALESCE((s.metadata->>'size')::BIGINT, 0) INTO v_antigo
        FROM storage.objects s
        WHERE (s.bucket_id = 'arquivos_ortus' AND s.name = p_caminho)
           OR (s.bucket_id = 'avatars' AND 'avatares/' || s.name = p_caminho)
        LIMIT 1;
    END IF;
    v_antigo := COALESCE(v_antigo, 0);

    IF p_clinica IS NOT NULL THEN
        SELECT c.limite_armazenamento_mb::BIGINT * 1048576 INTO v_limite FROM clinicas c WHERE c.id = p_clinica;
        IF v_limite IS NULL OR public.armazenamento_uso_clinica(p_clinica) - v_antigo + p_bytes > v_limite THEN
            RETURN 'clinica';
        END IF;
    END IF;

    IF public.armazenamento_uso_projeto() - v_antigo + p_bytes > p_teto THEN
        RETURN 'projeto';
    END IF;

    INSERT INTO armazenamento_envios (usuario_id, caminho, bytes) VALUES (p_usuario, p_caminho, p_bytes);

    IF p_registrar THEN
        INSERT INTO armazenamento_objetos (caminho, clinica_id, bytes, confirmado, usuario_id, atualizado_em)
        VALUES (p_caminho, p_clinica, GREATEST(p_bytes, v_antigo), FALSE, p_usuario, now())
        ON CONFLICT (caminho) DO UPDATE SET
            bytes = GREATEST(EXCLUDED.bytes, armazenamento_objetos.bytes),
            clinica_id = COALESCE(EXCLUDED.clinica_id, armazenamento_objetos.clinica_id),
            confirmado = FALSE,
            usuario_id = EXCLUDED.usuario_id,
            atualizado_em = now();
    END IF;

    RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.armazenamento_reservar(TEXT, BIGINT, BIGINT, UUID, BIGINT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.armazenamento_reservar(TEXT, BIGINT, BIGINT, UUID, BIGINT, BOOLEAN) TO service_role;

INSERT INTO ortus_schema_migrations (id) VALUES ('20261031_seguranca_geral')
ON CONFLICT (id) DO NOTHING;

COMMIT;
