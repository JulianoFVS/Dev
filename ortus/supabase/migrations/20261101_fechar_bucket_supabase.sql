-- =====================================================================
-- ORTUS — Fecha o bucket antigo do Supabase
-- Rodar SÓ depois do deploy novo e de `npm run storage:r2`:
-- a partir daí fotos, logos e documentos abrem pelo Ortus (/api/...),
-- então ninguém mais precisa do link público do Supabase.
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

UPDATE storage.buckets SET public = FALSE WHERE id IN ('arquivos_ortus', 'avatars');

INSERT INTO ortus_schema_migrations (id) VALUES ('20261101_fechar_bucket_supabase')
ON CONFLICT (id) DO NOTHING;

COMMIT;
