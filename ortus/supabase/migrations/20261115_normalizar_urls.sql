-- =====================================================================
-- ORTUS — Normaliza URLs de arquivo salvas no formato público antigo
--
-- Quando os buckets ficaram privados (20261114_seguranca_total), os links
-- no formato antigo
--   https://<projeto>.supabase.co/storage/v1/object/public/<bucket>/<caminho>
-- passaram a responder 400, e as fotos já cadastradas pararam de aparecer.
--
-- O app agora publica arquivos pelo próprio domínio, via proxy autenticado
-- (`/api/public/midia/<caminho>`), que é justamente o que `urlProxyPublica`
-- gera nos uploads novos. Esta migration converte os registros antigos para
-- esse formato — nenhuma mudança de código, nenhuma mudança visual.
--
-- Idempotente — seguro reexecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Fotos de paciente (bucket arquivos_ortus → caminho "pacientes/...")
-- ---------------------------------------------------------------------
UPDATE public.pacientes
   SET foto_url = regexp_replace(
        foto_url,
        '^https?://[^/]+/storage/v1/object/public/arquivos_ortus/',
        '/api/public/midia/'
   )
 WHERE foto_url ~ '^https?://[^/]+/storage/v1/object/public/arquivos_ortus/';

-- ---------------------------------------------------------------------
-- Logos de clínica (bucket arquivos_ortus → caminho "clinicas/...")
-- ---------------------------------------------------------------------
UPDATE public.clinicas
   SET logo_url = regexp_replace(
        logo_url,
        '^https?://[^/]+/storage/v1/object/public/arquivos_ortus/',
        '/api/public/midia/'
   )
 WHERE logo_url ~ '^https?://[^/]+/storage/v1/object/public/arquivos_ortus/';

-- ---------------------------------------------------------------------
-- Fotos de perfil do profissional (bucket avatars → caminho "avatares/...")
-- ---------------------------------------------------------------------
UPDATE public.profissionais
   SET foto_url = '/api/public/midia/avatares/' ||
        regexp_replace(foto_url, '^https?://[^/]+/storage/v1/object/public/avatars/', '')
 WHERE foto_url ~ '^https?://[^/]+/storage/v1/object/public/avatars/';

-- ---------------------------------------------------------------------
-- Documentos de paciente gravados com URL pública (não devem existir, mas
-- se aparecerem o caminho interno é o que o proxy autenticado entende)
-- ---------------------------------------------------------------------
UPDATE public.paciente_documentos
   SET storage_path = regexp_replace(
        storage_path,
        '^https?://[^/]+/storage/v1/object/public/arquivos_ortus/',
        ''
   )
 WHERE storage_path ~ '^https?://[^/]+/storage/v1/object/public/arquivos_ortus/';

INSERT INTO public.ortus_schema_migrations (id) VALUES ('20261115_normalizar_urls')
ON CONFLICT (id) DO NOTHING;

COMMIT;
