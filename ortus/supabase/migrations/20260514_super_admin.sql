-- =====================================================================
-- Painel Super Admin (Backoffice do SaaS)
-- =====================================================================
-- Concede a um profissional o papel de "dono do software" (super admin),
-- com acesso ao backoffice de onboarding de novas Redes (tenants).
-- ---------------------------------------------------------------------

ALTER TABLE profissionais
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profissionais.is_super_admin IS
  'Quando true, o profissional acessa /super-admin para gerenciar Redes/Tenants.';

-- Garante a flag de matriz nas clínicas para o fluxo de onboarding (cria
-- automaticamente uma matriz por rede). Se a coluna já existir, ignora.
ALTER TABLE clinicas
    ADD COLUMN IF NOT EXISTS is_matriz BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN clinicas.is_matriz IS
  'Marca a clínica matriz da rede (criada automaticamente no onboarding).';
