import { supabase } from './supabase';

const KEY_ULTIMO = 'ortus_ultimo_backup_check';
const HORAS_12_MS = 12 * 60 * 60 * 1000;

export async function obterUltimoBackup() {
    try {
        const { data } = await supabase
            .from('backups')
            .select('id, criado_em, tipo, observacao, tamanho_kb')
            .order('criado_em', { ascending: false })
            .limit(1)
            .single();
        return data;
    } catch { return null; }
}

export async function listarBackups(limite = 50) {
    try {
        const { data } = await supabase
            .from('backups')
            .select('id, criado_em, tipo, observacao, tamanho_kb')
            .order('criado_em', { ascending: false })
            .limit(limite);
        return data || [];
    } catch { return []; }
}

export async function criarBackupAgora(tipo = 'manual', observacao?: string) {
    try {
        const { data, error } = await supabase.rpc('criar_backup_completo', { p_tipo: tipo, p_obs: observacao });
        if (error) throw error;
        return { ok: true, id: data };
    } catch (e: any) {
        return { ok: false, erro: e.message };
    }
}

export async function baixarBackupComoJson(id: number) {
    try {
        const { data, error } = await supabase.from('backups').select('*').eq('id', id).single();
        if (error || !data) throw error || new Error('Backup não encontrado');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const dataStr = new Date(data.criado_em).toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `ortus_backup_${data.tipo}_${dataStr}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        return true;
    } catch (e: any) {
        alert('Erro ao baixar: ' + e.message);
        return false;
    }
}

export async function restaurarBackup(id: number) {
    try {
        const { data, error } = await supabase.rpc('restaurar_backup', { p_id: id });
        if (error) throw error;
        return { ok: true, msg: data };
    } catch (e: any) {
        return { ok: false, erro: e.message };
    }
}

export async function excluirBackup(id: number) {
    try {
        const { error } = await supabase.from('backups').delete().eq('id', id);
        if (error) throw error;
        return true;
    } catch (e: any) {
        alert('Erro ao excluir: ' + e.message);
        return false;
    }
}

/**
 * Verifica se faz mais de 12h desde o último backup. Se sim, dispara um backup automático.
 * Funciona como fallback caso o pg_cron não esteja configurado.
 * Sempre que um usuário usar o sistema, mantém os snapshots em dia.
 */
export async function verificarBackupAutomatico() {
    if (typeof window === 'undefined') return;

    // Throttle local: não checa mais de 1x/hora por sessão
    const ultimoCheck = parseInt(localStorage.getItem(KEY_ULTIMO) || '0');
    const agora = Date.now();
    if (agora - ultimoCheck < 60 * 60 * 1000) return;
    localStorage.setItem(KEY_ULTIMO, String(agora));

    const ultimo = await obterUltimoBackup();
    const ultimoMs = ultimo ? new Date(ultimo.criado_em).getTime() : 0;

    if (agora - ultimoMs >= HORAS_12_MS) {
        const horaLocal = new Date().getHours();
        const slot = horaLocal < 12 ? 'automatico_manha' : 'automatico_tarde';
        const r = await criarBackupAgora(slot, `Backup automático disparado em ${new Date().toLocaleString('pt-BR')}`);
        if (r.ok) console.info('[ORTUS] Backup automático criado: #' + r.id);
        else console.warn('[ORTUS] Backup automático falhou:', r.erro);
    }
}
