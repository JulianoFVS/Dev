-- =====================================================================
-- ORTUS — Armazenamento: limite por clínica e acesso aos arquivos por clínica
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS limite_armazenamento_mb INTEGER NOT NULL DEFAULT 1024
    CHECK (limite_armazenamento_mb > 0);

COMMENT ON COLUMN clinicas.limite_armazenamento_mb IS 'Espaço máximo para arquivos da clínica (fotos, documentos, logos), em MB.';

-- ---------------------------------------------------------------------
-- Uso em bytes dos arquivos de uma clínica no bucket arquivos_ortus.
-- Caminhos: pacientes/<paciente_id>/... e clinicas/<clinica_id>/...
-- Só a service role (rotas da API) chama esta função.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.armazenamento_uso_clinica(p_clinica BIGINT)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
    SELECT COALESCE(SUM(COALESCE((o.metadata->>'size')::BIGINT, 0)), 0)::BIGINT
    FROM storage.objects o
    WHERE o.bucket_id = 'arquivos_ortus'
      AND (
        (split_part(o.name, '/', 1) = 'clinicas' AND split_part(o.name, '/', 2) = p_clinica::TEXT)
        OR (
          split_part(o.name, '/', 1) = 'pacientes'
          AND split_part(o.name, '/', 2) IN (SELECT pa.id::TEXT FROM public.pacientes pa WHERE pa.clinica_id = p_clinica)
        )
      );
$$;

REVOKE ALL ON FUNCTION public.armazenamento_uso_clinica(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.armazenamento_uso_clinica(BIGINT) TO service_role;

-- ---------------------------------------------------------------------
-- O usuário logado pode mexer neste arquivo? (paciente ou clínica dele)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_caminho_permitido(p_nome TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE split_part(p_nome, '/', 1)
        WHEN 'pacientes' THEN EXISTS (
            SELECT 1 FROM public.pacientes pa
            WHERE pa.id::TEXT = split_part(p_nome, '/', 2)
              AND public.user_has_clinic_access(pa.clinica_id)
        )
        WHEN 'clinicas' THEN split_part(p_nome, '/', 2) ~ '^[0-9]+$'
            AND public.user_has_clinic_access(split_part(p_nome, '/', 2)::BIGINT)
        ELSE public.is_super_admin()
    END;
$$;

GRANT EXECUTE ON FUNCTION public.storage_caminho_permitido(TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- arquivos_ortus: leitura e exclusão só da própria clínica.
-- As regras antigas (abertas a qualquer usuário logado) saem em
-- 20261031_armazenamento_fechar.sql, depois do deploy do envio pela API.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS arquivos_ortus_select ON storage.objects;
CREATE POLICY arquivos_ortus_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'arquivos_ortus' AND public.storage_caminho_permitido(name));

DROP POLICY IF EXISTS arquivos_ortus_delete ON storage.objects;
CREATE POLICY arquivos_ortus_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'arquivos_ortus' AND public.storage_caminho_permitido(name));

-- ---------------------------------------------------------------------
-- avatars: antes até visitantes sem login podiam apagar ou trocar fotos.
-- Agora cada usuário só mexe na própria pasta (<user_id>/...).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso Total Avatars" ON storage.objects;

DROP POLICY IF EXISTS avatars_select ON storage.objects;
CREATE POLICY avatars_select ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_insert ON storage.objects;
CREATE POLICY avatars_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS avatars_update ON storage.objects;
CREATE POLICY avatars_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS avatars_delete ON storage.objects;
CREATE POLICY avatars_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- Bucket legado "arquivos": o sistema não envia mais nada para ele; fecha o envio anônimo.
DROP POLICY IF EXISTS "Public Insert" ON storage.objects;

-- Teto por arquivo (documentos já são limitados a 8 MB na tela).
UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'arquivos_ortus';
UPDATE storage.buckets SET file_size_limit = 5242880 WHERE id = 'avatars';

INSERT INTO ortus_schema_migrations (id) VALUES ('20261031_armazenamento')
ON CONFLICT (id) DO NOTHING;

COMMIT;
