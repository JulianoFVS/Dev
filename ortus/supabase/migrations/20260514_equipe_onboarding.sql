-- =====================================================================
-- Onboarding customizado da equipe (Temporary Password Flow)
-- =====================================================================
-- Adiciona a flag que força a troca de senha no primeiro acesso.
-- Default true para todo novo registro; usuários antigos ficam em false.
-- ---------------------------------------------------------------------

ALTER TABLE profissionais
    ADD COLUMN IF NOT EXISTS precisa_trocar_senha BOOLEAN NOT NULL DEFAULT true;

-- Marca todos os profissionais já existentes como "já trocou" para não
-- forçar a tela de primeiro acesso em donos/admins que já operam o sistema.
UPDATE profissionais SET precisa_trocar_senha = false WHERE precisa_trocar_senha IS NULL OR precisa_trocar_senha = true;

COMMENT ON COLUMN profissionais.precisa_trocar_senha IS
  'Quando true, o usuário deve trocar a senha em /primeiro-acesso antes de usar o sistema.';
