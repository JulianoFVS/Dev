-- =====================================================================
-- ORTUS — Armazenamento (parte 2): fecha o acesso aberto ao arquivos_ortus
-- Rodar SÓ depois do deploy em que os envios passam por /api/armazenamento.
-- Antes, qualquer usuário logado lia, trocava e apagava arquivos de
-- qualquer clínica. Agora vale arquivos_ortus_select/delete (só a própria
-- clínica) e os envios usam link assinado, que confere o limite antes.
-- Idempotente — seguro reexecutar
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "Give users authenticated access to folder h22aeu_0" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder h22aeu_1" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder h22aeu_2" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder h22aeu_3" ON storage.objects;

INSERT INTO ortus_schema_migrations (id) VALUES ('20261031_armazenamento_fechar')
ON CONFLICT (id) DO NOTHING;

COMMIT;
