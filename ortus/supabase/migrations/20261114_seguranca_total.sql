-- =====================================================================
-- ORTUS — Segurança total (RLS, grants, storage, policies explícitas)
--
-- Objetivo: fechar todas as brechas encontradas na auditoria completa do
-- banco, sem depender de sorte. Reconstruímos as policies do schema
-- `public` do zero, com regras explícitas por comando (SELECT/INSERT/
-- UPDATE/DELETE) em vez de `FOR ALL`, que OR-eia com as demais policies e
-- anulava as restrições mais finas (ex.: exclusão de paciente).
--
-- Correções principais:
--   1. `anon` tinha INSERT/SELECT/UPDATE/DELETE em quase todas as tabelas.
--   2. `FOR ALL` deixava qualquer membro da clínica excluir pacientes.
--   3. Buckets do Storage estavam públicos (fotos e documentos de
--      pacientes acessíveis por URL direta, sem login).
--   4. Bucket legado `arquivos` com policy de leitura pública.
--   5. `notificacoes.UPDATE` sem WITH CHECK (permitia reatribuir a outro
--      usuário).
--   6. `audit_log.INSERT` com CHECK true (permitia forjar auditoria).
--   7. `servicos` legado legível por qualquer logado.
--   8. Policies com role `public` (valiam para visitante).
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Pré-requisitos: tipo de retorno das funções auxiliares
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profissionais
        WHERE user_id = auth.uid() AND is_super_admin = true
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_clinic_access(target_clinica_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR EXISTS (
        SELECT 1
        FROM public.profissionais_clinicas pc
        JOIN public.profissionais p ON p.id = pc.profissional_id
        WHERE pc.clinica_id = target_clinica_id AND p.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_clinic_access(target_clinica_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR EXISTS (
        SELECT 1
        FROM public.profissionais_clinicas pc
        JOIN public.profissionais p ON p.id = pc.profissional_id
        WHERE pc.clinica_id::TEXT = target_clinica_id AND p.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.user_is_clinic_admin(p_clinica BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin() OR EXISTS (
        SELECT 1
        FROM public.profissionais_clinicas pc
        JOIN public.profissionais p ON p.id = pc.profissional_id
        WHERE pc.clinica_id = p_clinica
          AND p.user_id = auth.uid()
          AND p.nivel_acesso = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.clinica_rede(p_clinica BIGINT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT rede_id FROM public.clinicas WHERE id = p_clinica;
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
        FROM public.clinicas c
        JOIN public.profissionais_clinicas pc ON pc.clinica_id = c.id
        JOIN public.profissionais p ON p.id = pc.profissional_id
        WHERE c.rede_id = p_rede
          AND p.user_id = auth.uid()
          AND p.nivel_acesso = 'admin'
    ));
$$;

CREATE OR REPLACE FUNCTION public.user_can_see_profissional(target_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = target_id AND p.user_id = auth.uid())
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM public.profissionais_clinicas pc_alvo
            JOIN public.profissionais_clinicas pc_meu ON pc_meu.clinica_id = pc_alvo.clinica_id
            JOIN public.profissionais me ON me.id = pc_meu.profissional_id
            WHERE pc_alvo.profissional_id = target_id AND me.user_id = auth.uid()
        );
$$;

CREATE OR REPLACE FUNCTION public.user_can_see_profissional(target_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.user_can_see_profissional(NULLIF(target_id, '')::BIGINT);
$$;

-- ---------------------------------------------------------------------
-- 1. Varredura: remove TODAS as policies do schema public
--    (a fonte de verdade passa a ser este arquivo)
-- ---------------------------------------------------------------------
DO $limpeza$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END
$limpeza$;

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnese_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.armazenamento_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.armazenamento_objetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes_regras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_clinica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_colunas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lembretes_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ortus_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paciente_anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paciente_debitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paciente_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paciente_evolucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paciente_tratamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissoes_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planos_tratamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais_clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional_especialidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prontuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_procedimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tratamentos_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_agendadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 2. Tabelas "por clínica" — o padrão do sistema
--    sel/ins/upd: qualquer membro da clínica
--    del:        definido caso a caso
-- =====================================================================

-- ---------- pacientes (exclusão só por administrador da clínica) ----------
CREATE POLICY pacientes_select ON public.pacientes
    FOR SELECT TO authenticated USING (public.user_has_clinic_access(clinica_id));
CREATE POLICY pacientes_insert ON public.pacientes
    FOR INSERT TO authenticated WITH CHECK (public.user_has_clinic_access(clinica_id));
CREATE POLICY pacientes_update ON public.pacientes
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));
CREATE POLICY pacientes_delete ON public.pacientes
    FOR DELETE TO authenticated USING (public.user_is_clinic_admin(clinica_id));

-- ---------- agendamentos ----------
CREATE POLICY agendamentos_select ON public.agendamentos
    FOR SELECT TO authenticated USING (public.user_has_clinic_access(clinica_id));
CREATE POLICY agendamentos_insert ON public.agendamentos
    FOR INSERT TO authenticated WITH CHECK (public.user_has_clinic_access(clinica_id));
CREATE POLICY agendamentos_update ON public.agendamentos
    FOR UPDATE TO authenticated
    USING (public.user_has_clinic_access(clinica_id))
    WITH CHECK (public.user_has_clinic_access(clinica_id));
CREATE POLICY agendamentos_delete ON public.agendamentos
    FOR DELETE TO authenticated USING (public.user_has_clinic_access(clinica_id));

-- ---------- tabelas com clinica_id e sem regra especial ----------
DO $padrao$
DECLARE
    tabela TEXT;
    tabelas TEXT[] := ARRAY[
        'centros_custo',
        'comissoes_lancamentos',
        'comissoes_regras',
        'despesas',
        'especialidades',
        'lembretes_agenda',
        'planos',
        'planos_tratamentos',
        'profissionais_horarios',
        'tarefas',
        'tratamentos_base',
        'whatsapp_agendadas',
        'whatsapp_envios'
    ];
BEGIN
    FOREACH tabela IN ARRAY tabelas LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tabela
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_has_clinic_access(clinica_id))',
                tabela || '_select', tabela);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_has_clinic_access(clinica_id))',
                tabela || '_insert', tabela);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_has_clinic_access(clinica_id)) WITH CHECK (public.user_has_clinic_access(clinica_id))',
                tabela || '_update', tabela);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_has_clinic_access(clinica_id))',
                tabela || '_delete', tabela);
        END IF;
    END LOOP;
END
$padrao$;

-- ---------- configuracoes_clinica (escrita só para administrador) ----------
CREATE POLICY configuracoes_clinica_select ON public.configuracoes_clinica
    FOR SELECT TO authenticated USING (public.user_has_clinic_access(clinica_id));
CREATE POLICY configuracoes_clinica_insert ON public.configuracoes_clinica
    FOR INSERT TO authenticated WITH CHECK (public.user_is_clinic_admin(clinica_id));
CREATE POLICY configuracoes_clinica_update ON public.configuracoes_clinica
    FOR UPDATE TO authenticated
    USING (public.user_is_clinic_admin(clinica_id))
    WITH CHECK (public.user_is_clinic_admin(clinica_id));
CREATE POLICY configuracoes_clinica_delete ON public.configuracoes_clinica
    FOR DELETE TO authenticated USING (public.user_is_clinic_admin(clinica_id));

-- ---------- permissoes_modulos ----------
CREATE POLICY permissoes_modulos_select ON public.permissoes_modulos
    FOR SELECT TO authenticated
    USING (
        public.user_has_clinic_access(clinica_id)
        OR EXISTS (
            SELECT 1 FROM public.profissionais p
            WHERE p.id = permissoes_modulos.profissional_id AND p.user_id = auth.uid()
        )
    );
CREATE POLICY permissoes_modulos_insert ON public.permissoes_modulos
    FOR INSERT TO authenticated WITH CHECK (public.user_is_clinic_admin(clinica_id));
CREATE POLICY permissoes_modulos_update ON public.permissoes_modulos
    FOR UPDATE TO authenticated
    USING (public.user_is_clinic_admin(clinica_id))
    WITH CHECK (public.user_is_clinic_admin(clinica_id));
CREATE POLICY permissoes_modulos_delete ON public.permissoes_modulos
    FOR DELETE TO authenticated USING (public.user_is_clinic_admin(clinica_id));

-- ---------- kanban_colunas (clinica_id é TEXT e pode ser nulo = global) ----------
CREATE POLICY kanban_colunas_select ON public.kanban_colunas
    FOR SELECT TO authenticated
    USING (clinica_id IS NULL OR public.user_has_clinic_access(clinica_id));
CREATE POLICY kanban_colunas_insert ON public.kanban_colunas
    FOR INSERT TO authenticated
    WITH CHECK (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id));
CREATE POLICY kanban_colunas_update ON public.kanban_colunas
    FOR UPDATE TO authenticated
    USING (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id))
    WITH CHECK (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id));
CREATE POLICY kanban_colunas_delete ON public.kanban_colunas
    FOR DELETE TO authenticated
    USING (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id));

-- ---------- kanban_cartoes (pode vir por clínica ou pelo paciente) ----------
CREATE POLICY kanban_cartoes_select ON public.kanban_cartoes
    FOR SELECT TO authenticated
    USING (
        (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id))
        OR EXISTS (
            SELECT 1 FROM public.pacientes pa
            WHERE pa.id = kanban_cartoes.paciente_id AND public.user_has_clinic_access(pa.clinica_id)
        )
    );
CREATE POLICY kanban_cartoes_insert ON public.kanban_cartoes
    FOR INSERT TO authenticated
    WITH CHECK (
        (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id))
        OR EXISTS (
            SELECT 1 FROM public.pacientes pa
            WHERE pa.id = kanban_cartoes.paciente_id AND public.user_has_clinic_access(pa.clinica_id)
        )
    );
CREATE POLICY kanban_cartoes_update ON public.kanban_cartoes
    FOR UPDATE TO authenticated
    USING (
        (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id))
        OR EXISTS (
            SELECT 1 FROM public.pacientes pa
            WHERE pa.id = kanban_cartoes.paciente_id AND public.user_has_clinic_access(pa.clinica_id)
        )
    )
    WITH CHECK (
        (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id))
        OR EXISTS (
            SELECT 1 FROM public.pacientes pa
            WHERE pa.id = kanban_cartoes.paciente_id AND public.user_has_clinic_access(pa.clinica_id)
        )
    );
CREATE POLICY kanban_cartoes_delete ON public.kanban_cartoes
    FOR DELETE TO authenticated
    USING (
        (clinica_id IS NOT NULL AND public.user_has_clinic_access(clinica_id))
        OR EXISTS (
            SELECT 1 FROM public.pacientes pa
            WHERE pa.id = kanban_cartoes.paciente_id AND public.user_has_clinic_access(pa.clinica_id)
        )
    );

-- =====================================================================
-- 3. Tabelas filhas do paciente — acesso herdado do paciente
-- =====================================================================
DO $filhas$
DECLARE
    tabela TEXT;
    tabelas TEXT[] := ARRAY[
        'anamneses',
        'anexos',
        'paciente_anamneses',
        'paciente_debitos',
        'paciente_documentos',
        'paciente_evolucoes',
        'paciente_tratamentos',
        'prontuarios'
    ];
    regra TEXT;
BEGIN
    FOREACH tabela IN ARRAY tabelas LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tabela
        ) THEN
            CONTINUE;
        END IF;
        regra := format(
            'EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = %I.paciente_id AND public.user_has_clinic_access(p.clinica_id))',
            tabela);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
            tabela || '_select', tabela, regra);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
            tabela || '_insert', tabela, regra);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
            tabela || '_update', tabela, regra, regra);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
            tabela || '_delete', tabela, regra);
    END LOOP;
END
$filhas$;

CREATE POLICY anamnese_links_select ON public.anamnese_links
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = anamnese_links.paciente_id AND public.user_has_clinic_access(p.clinica_id)));
CREATE POLICY anamnese_links_insert ON public.anamnese_links
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = anamnese_links.paciente_id AND public.user_has_clinic_access(p.clinica_id)));
CREATE POLICY anamnese_links_update ON public.anamnese_links
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = anamnese_links.paciente_id AND public.user_has_clinic_access(p.clinica_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = anamnese_links.paciente_id AND public.user_has_clinic_access(p.clinica_id)));
CREATE POLICY anamnese_links_delete ON public.anamnese_links
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = anamnese_links.paciente_id AND public.user_has_clinic_access(p.clinica_id)));

-- =====================================================================
-- 4. Equipe, clínicas e redes
-- =====================================================================
CREATE POLICY profissionais_select ON public.profissionais
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.user_can_see_profissional(id));
CREATE POLICY profissionais_insert ON public.profissionais
    FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY profissionais_update ON public.profissionais
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.profissionais_clinicas pc
            WHERE pc.profissional_id = profissionais.id
              AND public.user_is_clinic_admin(pc.clinica_id)
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.profissionais_clinicas pc
            WHERE pc.profissional_id = profissionais.id
              AND public.user_is_clinic_admin(pc.clinica_id)
        )
    );
CREATE POLICY profissionais_delete ON public.profissionais
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.profissionais_clinicas pc
            WHERE pc.profissional_id = profissionais.id
              AND public.user_is_clinic_admin(pc.clinica_id)
        )
    );

CREATE POLICY profissionais_clinicas_select ON public.profissionais_clinicas
    FOR SELECT TO authenticated USING (public.user_has_clinic_access(clinica_id));
CREATE POLICY profissionais_clinicas_insert ON public.profissionais_clinicas
    FOR INSERT TO authenticated
    WITH CHECK (
        public.user_is_clinic_admin(clinica_id)
        OR public.user_is_rede_admin(public.clinica_rede(clinica_id))
    );
CREATE POLICY profissionais_clinicas_update ON public.profissionais_clinicas
    FOR UPDATE TO authenticated
    USING (
        public.user_is_clinic_admin(clinica_id)
        OR public.user_is_rede_admin(public.clinica_rede(clinica_id))
    )
    WITH CHECK (
        public.user_is_clinic_admin(clinica_id)
        OR public.user_is_rede_admin(public.clinica_rede(clinica_id))
    );
CREATE POLICY profissionais_clinicas_delete ON public.profissionais_clinicas
    FOR DELETE TO authenticated
    USING (
        public.user_is_clinic_admin(clinica_id)
        OR public.user_is_rede_admin(public.clinica_rede(clinica_id))
    );

CREATE POLICY profissional_especialidade_select ON public.profissional_especialidade
    FOR SELECT TO authenticated USING (public.user_can_see_profissional(profissional_id));
CREATE POLICY profissional_especialidade_insert ON public.profissional_especialidade
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = profissional_especialidade.profissional_id AND p.user_id = auth.uid())
        OR public.is_super_admin()
    );
CREATE POLICY profissional_especialidade_update ON public.profissional_especialidade
    FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = profissional_especialidade.profissional_id AND p.user_id = auth.uid())
        OR public.is_super_admin()
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = profissional_especialidade.profissional_id AND p.user_id = auth.uid())
        OR public.is_super_admin()
    );
CREATE POLICY profissional_especialidade_delete ON public.profissional_especialidade
    FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = profissional_especialidade.profissional_id AND p.user_id = auth.uid())
        OR public.is_super_admin()
    );

CREATE POLICY clinicas_select ON public.clinicas
    FOR SELECT TO authenticated
    USING (public.user_has_clinic_access(id) OR public.user_is_rede_admin(rede_id));
CREATE POLICY clinicas_insert ON public.clinicas
    FOR INSERT TO authenticated
    WITH CHECK (public.is_super_admin() OR public.user_is_rede_admin(rede_id));
CREATE POLICY clinicas_update ON public.clinicas
    FOR UPDATE TO authenticated
    USING (public.user_is_clinic_admin(id))
    WITH CHECK (public.user_is_clinic_admin(id));
CREATE POLICY clinicas_delete ON public.clinicas
    FOR DELETE TO authenticated USING (public.user_is_clinic_admin(id));

CREATE POLICY redes_select ON public.redes
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.clinicas c
            WHERE c.rede_id = redes.id AND public.user_has_clinic_access(c.id)
        )
    );

-- =====================================================================
-- 5. Notificações — só o dono lê, altera e apaga
-- =====================================================================
CREATE POLICY notificacoes_select ON public.notificacoes
    FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notificacoes_insert ON public.notificacoes
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY notificacoes_update ON public.notificacoes
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
CREATE POLICY notificacoes_delete ON public.notificacoes
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- =====================================================================
-- 6. Auditoria e backups — só donos da plataforma
-- =====================================================================
CREATE POLICY audit_log_insert ON public.audit_log
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY audit_log_select ON public.audit_log
    FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY audit_logs_select ON public.audit_logs
    FOR SELECT TO authenticated USING (public.is_super_admin());

CREATE POLICY backups_select ON public.backups
    FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY backups_delete ON public.backups
    FOR DELETE TO authenticated USING (public.is_super_admin());

-- =====================================================================
-- 7. Catálogos globais (sem clinica_id): leitura para logados,
--    escrita só para os donos da plataforma
-- =====================================================================
CREATE POLICY servicos_select ON public.servicos
    FOR SELECT TO authenticated USING (true);
CREATE POLICY servicos_admin ON public.servicos
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY tipos_procedimentos_select ON public.tipos_procedimentos
    FOR SELECT TO authenticated USING (true);
CREATE POLICY tipos_procedimentos_admin ON public.tipos_procedimentos
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- =====================================================================
-- 8. Tabelas internas: ninguém acessa direto (só service_role)
--    RLS ligada + nenhuma policy = negação total para anon/authenticated
-- =====================================================================
-- armazenamento_envios, armazenamento_objetos, ortus_schema_migrations,
-- audit_logs (somente SELECT super admin, acima)

-- =====================================================================
-- 9. Storage: buckets privados e acesso por caminho autorizado
-- =====================================================================
-- Limpa qualquer policy de storage.objects (inclusive sobras antigas)
DO $storage_limpeza$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
    END LOOP;
END
$storage_limpeza$;

UPDATE storage.buckets
   SET public = FALSE
 WHERE id IN ('arquivos', 'arquivos_ortus', 'avatars');

UPDATE storage.buckets
   SET file_size_limit = 1048576,
       allowed_mime_types = ARRAY['image/jpeg']
 WHERE id = 'avatars';

UPDATE storage.buckets
   SET file_size_limit = 10485760
 WHERE id = 'arquivos_ortus';

CREATE POLICY arquivos_ortus_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'arquivos_ortus' AND public.storage_caminho_permitido(name));
CREATE POLICY arquivos_ortus_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'arquivos_ortus' AND public.storage_caminho_permitido(name));
CREATE POLICY arquivos_ortus_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'arquivos_ortus' AND public.storage_caminho_permitido(name))
    WITH CHECK (bucket_id = 'arquivos_ortus' AND public.storage_caminho_permitido(name));
CREATE POLICY arquivos_ortus_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'arquivos_ortus' AND public.storage_caminho_permitido(name));

-- Foto de perfil: cada um enxerga e mantém apenas o próprio arquivo.
-- A exibição para colegas passa pelo proxy autenticado do Ortus.
CREATE POLICY avatars_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY avatars_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::TEXT || '/avatar.jpg');
CREATE POLICY avatars_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND name = auth.uid()::TEXT || '/avatar.jpg')
    WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::TEXT || '/avatar.jpg');
CREATE POLICY avatars_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND name = auth.uid()::TEXT || '/avatar.jpg');

-- =====================================================================
-- 10. Grants: visitante não toca em nada do domínio
-- =====================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Tabelas de controle interno não existem para o app: só service_role.
REVOKE ALL ON TABLE public.armazenamento_envios FROM authenticated;
REVOKE ALL ON TABLE public.armazenamento_objetos FROM authenticated;
REVOKE ALL ON TABLE public.ortus_schema_migrations FROM authenticated;
REVOKE ALL ON SEQUENCE public.armazenamento_envios_id_seq FROM authenticated;

-- Funções que as policies usam precisam de EXECUTE para quem consulta.
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_clinic_access(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_clinic_access(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_clinic_admin(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_rede_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clinica_rede(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_see_profissional(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_see_profissional(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_caminho_permitido(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_backup_completo(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurar_backup(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.armazenamento_reservar(TEXT, BIGINT, BIGINT, UUID, BIGINT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.armazenamento_uso_clinica(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.armazenamento_uso_projeto() TO service_role;

-- Novas funções/tabelas já nascem fechadas para o visitante.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- =====================================================================
-- 11. Endurece a view de tarefas (já é security_invoker) e o schema
-- =====================================================================
ALTER VIEW public.v_tarefas_completo SET (security_invoker = true);
REVOKE ALL ON public.v_tarefas_completo FROM anon;
GRANT SELECT ON public.v_tarefas_completo TO authenticated;

-- Ninguém cria objetos no schema public pelo PostgREST.
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261114_seguranca_total')
ON CONFLICT (id) DO NOTHING;

COMMIT;
