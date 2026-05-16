import { supabase } from './supabase';

export type AuditAcao = 'visualizou' | 'editou' | 'excluiu' | 'exportou' | 'login' | 'logout' | 'criou';
export type AuditEntidade = 'paciente' | 'agendamento' | 'profissional' | 'backup' | 'odontograma' | 'tratamento' | 'documento' | 'configuracao';

interface AuditParams {
    acao: AuditAcao;
    entidade: AuditEntidade;
    entidade_id?: string;
    detalhes?: Record<string, any>;
}

/**
 * Registra uma ação no audit log.
 * Chamada fire-and-forget (não bloqueia a UX).
 */
export async function registrarAudit({ acao, entidade, entidade_id, detalhes }: AuditParams) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Buscar nome do profissional (cache futuro se necessário)
        const { data: prof } = await supabase
            .from('profissionais')
            .select('nome')
            .eq('user_id', user.id)
            .single();

        await supabase.from('audit_log').insert({
            user_id: user.id,
            profissional_nome: prof?.nome || 'Desconhecido',
            acao,
            entidade,
            entidade_id: entidade_id || null,
            detalhes: detalhes || null,
        });
    } catch (err) {
        // Silencioso — audit não deve quebrar a UX
        console.warn('[AuditLog] Falha ao registrar:', err);
    }
}
