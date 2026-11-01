-- =====================================================================
-- ORTUS — Uso de armazenamento contado na aplicação (vale para o R2)
-- O restante que ainda está só no Supabase continua entrando na conta,
-- sem contar duas vezes o mesmo caminho.
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.armazenamento_objetos (
    caminho TEXT PRIMARY KEY,
    clinica_id BIGINT NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    bytes BIGINT NOT NULL CHECK (bytes >= 0),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS armazenamento_objetos_clinica_idx
    ON public.armazenamento_objetos (clinica_id);

ALTER TABLE public.armazenamento_objetos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.armazenamento_objetos FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.armazenamento_uso_clinica(p_clinica BIGINT)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
    SELECT (
        COALESCE((
            SELECT SUM(o.bytes)
            FROM public.armazenamento_objetos o
            WHERE o.clinica_id = p_clinica
        ), 0)
        +
        COALESCE((
            SELECT SUM(COALESCE((s.metadata->>'size')::BIGINT, 0))
            FROM storage.objects s
            WHERE s.bucket_id = 'arquivos_ortus'
              AND NOT EXISTS (
                  SELECT 1 FROM public.armazenamento_objetos o WHERE o.caminho = s.name
              )
              AND (
                (split_part(s.name, '/', 1) = 'clinicas' AND split_part(s.name, '/', 2) = p_clinica::TEXT)
                OR (
                  split_part(s.name, '/', 1) = 'pacientes'
                  AND split_part(s.name, '/', 2) IN (
                      SELECT pa.id::TEXT FROM public.pacientes pa WHERE pa.clinica_id = p_clinica
                  )
                )
              )
        ), 0)
    )::BIGINT;
$$;

REVOKE ALL ON FUNCTION public.armazenamento_uso_clinica(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.armazenamento_uso_clinica(BIGINT) TO service_role;

INSERT INTO ortus_schema_migrations (id) VALUES ('20261031_armazenamento_r2')
ON CONFLICT (id) DO NOTHING;

COMMIT;
