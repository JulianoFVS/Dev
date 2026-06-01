-- =====================================================================
-- Cadastro Completo de Clínicas: Endereço, Fiscal, Logo, Horários
-- =====================================================================

-- 1. Adicionar colunas na tabela clinicas
ALTER TABLE clinicas
    ADD COLUMN IF NOT EXISTS cnpj VARCHAR(18),
    ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(150),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS telefone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS horario_inicio TIME,
    ADD COLUMN IF NOT EXISTS horario_fim TIME,
    ADD COLUMN IF NOT EXISTS fuso_horario VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    ADD COLUMN IF NOT EXISTS emitir_notas_em_nome VARCHAR(100) DEFAULT 'clinica',
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    -- Endereço
    ADD COLUMN IF NOT EXISTS cep VARCHAR(9),
    ADD COLUMN IF NOT EXISTS rua VARCHAR(255),
    ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
    ADD COLUMN IF NOT EXISTS complemento VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bairro VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cidade VARCHAR(100),
    ADD COLUMN IF NOT EXISTS uf VARCHAR(2);

-- Comentários
COMMENT ON COLUMN clinicas.cnpj IS 'CNPJ da clínica para emissão de notas fiscais';
COMMENT ON COLUMN clinicas.responsavel_nome IS 'Nome do responsável técnico/legal';
COMMENT ON COLUMN clinicas.emitir_notas_em_nome IS 'Define em nome de quem as notas serão emitidas: clinica ou profissional';
COMMENT ON COLUMN clinicas.logo_url IS 'URL da logomarca no Storage para documentos timbrados';
COMMENT ON COLUMN clinicas.horario_inicio IS 'Horário de início do atendimento';
COMMENT ON COLUMN clinicas.horario_fim IS 'Horário de término do atendimento';
COMMENT ON COLUMN clinicas.fuso_horario IS 'Fuso horário da clínica (default America/Sao_Paulo)';

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_clinicas_cnpj ON clinicas(cnpj);

-- 3. Storage bucket para logos (criar via dashboard ou usar storage policies)
-- Nota: O bucket 'clinicas-logos' deve ser criado no Supabase Dashboard
-- com as policies apropriadas para upload/download

COMMIT;
