-- Adiciona campos de ícone e checklist configurável às colunas do Kanban
ALTER TABLE kanban_colunas ADD COLUMN IF NOT EXISTS icone text DEFAULT NULL;
ALTER TABLE kanban_colunas ADD COLUMN IF NOT EXISTS checklist_ativo boolean DEFAULT false;

-- Marca "Em Prova Clínica" como checklist ativo por padrão
UPDATE kanban_colunas SET checklist_ativo = true WHERE titulo = 'Em Prova Clínica' AND checklist_ativo = false;

-- Atualiza ícones padrão para colunas existentes
UPDATE kanban_colunas SET icone = 'clipboard-list' WHERE titulo = 'Solicitado' AND icone IS NULL;
UPDATE kanban_colunas SET icone = 'flask-conical'  WHERE titulo = 'No Laboratório' AND icone IS NULL;
UPDATE kanban_colunas SET icone = 'smile'           WHERE titulo = 'Em Prova Clínica' AND icone IS NULL;
UPDATE kanban_colunas SET icone = 'wrench'          WHERE titulo = 'Aguardando Ajuste' AND icone IS NULL;
UPDATE kanban_colunas SET icone = 'truck'           WHERE titulo = 'Finalizado / Entregue' AND icone IS NULL;
