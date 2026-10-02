-- Foto de perfil do paciente. O arquivo em si fica no storage (JPEG comprimido);
-- aqui só a URL pública.
ALTER TABLE pacientes
    ADD COLUMN IF NOT EXISTS foto_url TEXT;

COMMENT ON COLUMN pacientes.foto_url IS 'URL pública da foto de perfil (JPEG quadrado, comprimido no cliente antes do upload).';
