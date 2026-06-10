-- Notificações: validade (expires_at) e índices para histórico
BEGIN;

ALTER TABLE notificacoes
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Define um default de 30 dias para novas notificações (pode ser ajustado depois via app)
ALTER TABLE notificacoes
    ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 days');

-- Índices recomendados para consultas de badge e histórico
CREATE INDEX IF NOT EXISTS idx_notificacoes_user_lida ON notificacoes(user_id, lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_user_expires ON notificacoes(user_id, expires_at);

COMMIT;
