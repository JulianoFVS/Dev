-- Data de pagamento em agendamentos (histórico de atendimentos)

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMPTZ;
COMMENT ON COLUMN agendamentos.data_pagamento IS 'Data/hora em que o atendimento foi marcado como pago';
