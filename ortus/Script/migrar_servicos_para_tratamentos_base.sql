-- =============================================================================
-- ORTUS — Migração: servicos (legado) → tratamentos_base
-- Execute no SQL Editor do Supabase (projeto Ortus)
-- =============================================================================
-- Contexto:
--   A agenda passou a usar a tabela `tratamentos_base` em vez de `servicos`.
--   Este script:
--     0) Garante colunas esperadas em tratamentos_base (schema parcial/legado)
--     1) Adiciona coluna opcional `tratamento_base_id` em agendamentos
--     2) Migra registros de `servicos` para `tratamentos_base` (se existir)
--     3) Marca `servicos` como deprecated (sem remover dados)
-- =============================================================================

-- 0) Colunas que podem faltar se a tabela foi criada antes da migration completa
ALTER TABLE tratamentos_base ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE tratamentos_base ADD COLUMN IF NOT EXISTS aceita_faces BOOLEAN DEFAULT FALSE;
ALTER TABLE tratamentos_base ADD COLUMN IF NOT EXISTS valor_sugerido NUMERIC(12,2);
ALTER TABLE tratamentos_base ADD COLUMN IF NOT EXISTS custo_padrao NUMERIC(12,2);
ALTER TABLE tratamentos_base ADD COLUMN IF NOT EXISTS codigo_tuss_padrao VARCHAR(30);
ALTER TABLE tratamentos_base ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
ALTER TABLE tratamentos_base ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tratamentos_base ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tratamentos_base ADD COLUMN IF NOT EXISTS especialidade_id UUID;

-- 1) Vincular agendamentos ao catálogo de tratamentos (opcional, recomendado)
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS tratamento_base_id BIGINT REFERENCES tratamentos_base(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_tratamento_base
  ON agendamentos(tratamento_base_id);

COMMENT ON COLUMN agendamentos.tratamento_base_id IS
  'Referência opcional ao tratamento do catálogo (tratamentos_base).';

-- 2) Migrar servicos -> tratamentos_base
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'servicos'
  ) THEN
    INSERT INTO tratamentos_base (clinica_id, nome, valor_sugerido, custo_padrao, ativo)
    SELECT DISTINCT ON (c.id, lower(trim(s.nome)))
      c.id,
      trim(s.nome),
      COALESCE(s.valor, 0),
      COALESCE(s.valor, 0),
      true
    FROM servicos s
    CROSS JOIN clinicas c
    WHERE trim(coalesce(s.nome, '')) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM tratamentos_base tb
        WHERE tb.clinica_id = c.id
          AND lower(trim(tb.nome)) = lower(trim(s.nome))
      )
    ORDER BY c.id, lower(trim(s.nome)), s.id;

    RAISE NOTICE 'Migração concluída: servicos copiados para tratamentos_base por clínica.';
  ELSE
    RAISE NOTICE 'Tabela servicos não encontrada — nada a migrar.';
  END IF;
END $$;

-- 3) Tentar vincular agendamentos existentes pelo nome do procedimento
UPDATE agendamentos a
SET tratamento_base_id = tb.id
FROM tratamentos_base tb
WHERE a.tratamento_base_id IS NULL
  AND a.clinica_id = tb.clinica_id
  AND lower(trim(a.procedimento)) = lower(trim(tb.nome));

-- 4) Depreciar tabela legada (não remove dados)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'servicos'
  ) THEN
    COMMENT ON TABLE servicos IS
      'DEPRECATED — usar tratamentos_base. Migrado via Script/migrar_servicos_para_tratamentos_base.sql';
  END IF;
END $$;

-- =============================================================================
-- Verificação pós-execução (opcional):
--   SELECT count(*) FROM tratamentos_base;
--   SELECT count(*) FROM agendamentos WHERE tratamento_base_id IS NOT NULL;
-- =============================================================================
