-- RLS nas duas tabelas que o advisor marcava como públicas sem proteção.
-- paciente_debitos é lida pelo app (usuário autenticado da clínica).
-- anamnese_links só é usada pelas rotas de servidor (service role ignora RLS).
-- O papel anon não lê o hash do link.

ALTER TABLE public.paciente_debitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnese_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paciente_debitos_all ON public.paciente_debitos;
CREATE POLICY paciente_debitos_all ON public.paciente_debitos
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.pacientes p
            WHERE p.id = paciente_debitos.paciente_id
              AND public.user_has_clinic_access(p.clinica_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.pacientes p
            WHERE p.id = paciente_debitos.paciente_id
              AND public.user_has_clinic_access(p.clinica_id)
        )
    );

DROP POLICY IF EXISTS anamnese_links_all ON public.anamnese_links;
CREATE POLICY anamnese_links_all ON public.anamnese_links
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.pacientes p
            WHERE p.id = anamnese_links.paciente_id
              AND public.user_has_clinic_access(p.clinica_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.pacientes p
            WHERE p.id = anamnese_links.paciente_id
              AND public.user_has_clinic_access(p.clinica_id)
        )
    );

REVOKE ALL ON TABLE public.anamnese_links FROM anon;
REVOKE ALL ON TABLE public.paciente_debitos FROM anon;
