import { supabase } from '@/lib/supabase';

/**
 * Carrega uma configuração por chave para a clínica ativa.
 * Fallback para localStorage para retrocompatibilidade.
 */
export async function carregarConfig<T>(clinicaId: number | string, chave: string, fallbackLocal?: string, padrao?: T): Promise<T> {
    const { data } = await supabase
        .from('configuracoes_clinica')
        .select('valor')
        .eq('clinica_id', Number(clinicaId))
        .eq('chave', chave)
        .single();

    if (data?.valor !== undefined && data.valor !== null) {
        return data.valor as T;
    }

    // Fallback: ler do localStorage e migrar automaticamente
    if (fallbackLocal && typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem(fallbackLocal);
            if (raw) {
                const parsed = JSON.parse(raw) as T;
                // Migrar para Supabase em background
                salvarConfig(clinicaId, chave, parsed).catch(() => {});
                return parsed;
            }
        } catch {}
    }

    return padrao as T;
}

/**
 * Salva uma configuração no Supabase por clínica.
 */
export async function salvarConfig<T>(clinicaId: number | string, chave: string, valor: T): Promise<void> {
    await supabase
        .from('configuracoes_clinica')
        .upsert(
            { clinica_id: Number(clinicaId), chave, valor: valor as any, updated_at: new Date().toISOString() },
            { onConflict: 'clinica_id,chave' }
        );
}
