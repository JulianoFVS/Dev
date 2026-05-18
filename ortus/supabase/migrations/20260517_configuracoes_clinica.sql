-- Tabela para persistir configurações que antes ficavam em localStorage
-- Agora ficam por clínica, compartilhadas entre todos os usuários da clínica
CREATE TABLE IF NOT EXISTS configuracoes_clinica (
    id BIGSERIAL PRIMARY KEY,
    clinica_id BIGINT NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    chave TEXT NOT NULL,
    valor JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clinica_id, chave)
);

-- RLS
ALTER TABLE configuracoes_clinica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da clínica podem ler/escrever configurações"
    ON configuracoes_clinica FOR ALL
    USING (
        clinica_id IN (
            SELECT pc.clinica_id FROM profissionais_clinicas pc
            JOIN profissionais p ON p.id = pc.profissional_id
            WHERE p.user_id = auth.uid()
        )
    )
    WITH CHECK (
        clinica_id IN (
            SELECT pc.clinica_id FROM profissionais_clinicas pc
            JOIN profissionais p ON p.id = pc.profissional_id
            WHERE p.user_id = auth.uid()
        )
    );
