-- =====================================================================
-- ORTUS — Segurança: RLS em ortus_schema_migrations
-- Tabela interna (scripts locais). Sem policies = bloqueada na API pública.
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

ALTER TABLE ortus_schema_migrations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ortus_schema_migrations IS
  'Controle interno de migrations aplicadas via scripts locais. RLS ativo sem policies — não acessível por anon/authenticated na API.';

INSERT INTO ortus_schema_migrations (id) VALUES ('20260731_rls_ortus_schema_migrations')
ON CONFLICT (id) DO NOTHING;

COMMIT;
