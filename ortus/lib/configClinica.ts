import { dados as tabelas } from '@/lib/local/consulta';

/**
 * Carrega uma configuração por chave para a clínica ativa.
 * Fallback para localStorage para retrocompatibilidade.
 */
export async function carregarConfig<T>(clinicaId: number | string, chave: string, fallbackLocal?: string, padrao?: T): Promise<T> {
    const { data } = await tabelas.from('configuracoes_clinica')
        .select('valor')
        .eq('clinica_id', Number(clinicaId))
        .eq('chave', chave)
        .maybeSingle();

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

export const ERRO_CONFIG_SEM_PERMISSAO = 'Não foi salvo: só o administrador da clínica altera esta configuração.';
export const ERRO_CONFIG_FALHA = 'Não foi possível salvar a configuração. Confira a internet e tente de novo.';
export const ERRO_CONFIG_LEITURA = 'Não foi possível carregar a configuração desta unidade. Confira a internet e recarregue a página.';

/**
 * Lê só do banco, sem o localStorage e sem migrar nada, e lança quando a
 * leitura falha. Para a tela de Configurações: com o erro escondido ela
 * mostraria o padrão e gravaria o padrão por cima do que a clínica tem.
 */
export async function carregarConfigComErro<T>(clinicaId: number | string, chave: string, padrao: T): Promise<T> {
    const { data, error } = await tabelas.from('configuracoes_clinica')
        .select('valor')
        .eq('clinica_id', Number(clinicaId))
        .eq('chave', chave)
        .maybeSingle();
    if (error) throw new Error(ERRO_CONFIG_LEITURA, { cause: error });
    return data?.valor !== undefined && data.valor !== null ? (data.valor as T) : padrao;
}

/** Frase para a tela a partir de um erro destas funções; qualquer outro texto vira a frase genérica. */
export function mensagemErroConfig(err: unknown): string {
    const texto = err instanceof Error ? err.message : '';
    return [ERRO_CONFIG_SEM_PERMISSAO, ERRO_CONFIG_FALHA, ERRO_CONFIG_LEITURA].includes(texto) ? texto : ERRO_CONFIG_FALHA;
}

/**
 * Salva uma configuração no Supabase por clínica.
 * Lança quando o banco recusa: a RLS só deixa o administrador gravar, e sem o
 * erro quem tinha só o módulo via "salvo" sem nada gravado. A mensagem do erro
 * já é a frase da tela; o retorno do banco fica em `cause`.
 */
export async function salvarConfig<T>(clinicaId: number | string, chave: string, valor: T): Promise<void> {
    const { error } = await tabelas.from('configuracoes_clinica')
        .upsert(
            { clinica_id: Number(clinicaId), chave, valor: valor as any, updated_at: new Date().toISOString() },
            { onConflict: 'clinica_id,chave' }
        );
    if (error) {
        throw new Error(error.code === '42501' ? ERRO_CONFIG_SEM_PERMISSAO : ERRO_CONFIG_FALHA, { cause: error });
    }
}
