-- =====================================================================
-- ORTUS — Limite de envio por pessoa (volume por dia e por 30 dias)
-- Os limites chegam pela aplicação; a clínica e o teto da conta seguem valendo.
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.armazenamento_reservar(TEXT, BIGINT, BIGINT, UUID, BIGINT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.armazenamento_reservar(
    p_caminho TEXT,
    p_clinica BIGINT,
    p_bytes BIGINT,
    p_usuario UUID,
    p_teto BIGINT,
    p_registrar BOOLEAN,
    p_limite_dia BIGINT,
    p_limite_mes BIGINT
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

    IF p_limite_dia > 0 AND COALESCE((
        SELECT SUM(bytes) FROM armazenamento_envios
        WHERE usuario_id = p_usuario AND criado_em > now() - INTERVAL '1 day'
    ), 0) + p_bytes > p_limite_dia THEN
        RETURN 'usuario_dia';
    END IF;
    IF p_limite_mes > 0 AND COALESCE((
        SELECT SUM(bytes) FROM armazenamento_envios
        WHERE usuario_id = p_usuario AND criado_em > now() - INTERVAL '30 days'
    ), 0) + p_bytes > p_limite_mes THEN
        RETURN 'usuario_mes';
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

REVOKE ALL ON FUNCTION public.armazenamento_reservar(TEXT, BIGINT, BIGINT, UUID, BIGINT, BOOLEAN, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.armazenamento_reservar(TEXT, BIGINT, BIGINT, UUID, BIGINT, BOOLEAN, BIGINT, BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.armazenamento_envios_usuario(p_usuario UUID)
RETURNS TABLE (dia BIGINT, mes BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(SUM(bytes) FILTER (WHERE criado_em > now() - INTERVAL '1 day'), 0)::BIGINT,
        COALESCE(SUM(bytes) FILTER (WHERE criado_em > now() - INTERVAL '30 days'), 0)::BIGINT
    FROM armazenamento_envios
    WHERE usuario_id = p_usuario;
$$;

REVOKE ALL ON FUNCTION public.armazenamento_envios_usuario(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.armazenamento_envios_usuario(UUID) TO service_role;

INSERT INTO ortus_schema_migrations (id) VALUES ('20261120_armazenamento_usuario')
ON CONFLICT (id) DO NOTHING;

COMMIT;
