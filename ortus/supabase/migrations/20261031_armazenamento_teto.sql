-- =====================================================================
-- ORTUS — Teto da conta: 9,5 GB (abaixo dos 10 GB grátis do R2)
-- Foto de perfil entra na conta com clinica_id nulo.
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

ALTER TABLE public.armazenamento_objetos ALTER COLUMN clinica_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.armazenamento_uso_projeto()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
    SELECT (
        COALESCE((SELECT SUM(o.bytes) FROM public.armazenamento_objetos o), 0)
        + COALESCE((
            SELECT SUM(COALESCE((s.metadata->>'size')::BIGINT, 0))
            FROM storage.objects s
            WHERE s.bucket_id = 'arquivos_ortus'
              AND NOT EXISTS (SELECT 1 FROM public.armazenamento_objetos o WHERE o.caminho = s.name)
        ), 0)
        + COALESCE((
            SELECT SUM(COALESCE((s.metadata->>'size')::BIGINT, 0))
            FROM storage.objects s
            WHERE s.bucket_id = 'avatars'
              AND NOT EXISTS (
                  SELECT 1 FROM public.armazenamento_objetos o WHERE o.caminho = 'avatares/' || s.name
              )
        ), 0)
    )::BIGINT;
$$;

REVOKE ALL ON FUNCTION public.armazenamento_uso_projeto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.armazenamento_uso_projeto() TO service_role;

INSERT INTO ortus_schema_migrations (id) VALUES ('20261031_armazenamento_teto')
ON CONFLICT (id) DO NOTHING;

COMMIT;
