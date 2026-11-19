/**
 * Escolhe onde o gateway do WhatsApp lê e grava dados.
 *
 *   ORTUS_LOCAL_DB=1  → SQLite da clínica (offline-first, via API do Electron)
 *   caso contrário    → Supabase com service role (gateway em nuvem, como antes)
 *
 * O server.mjs só conhece o contrato abaixo; nenhuma regra de negócio fica
 * duplicada entre os dois lados.
 *
 * Contrato:
 *   modalidade: 'local' | 'nuvem'
 *   configurado: boolean            há banco configurado neste processo?
 *   agendadorAtivo: boolean         liga/desliga rodarAgendador
 *   verificar(): Promise<void>      teste de saúde no boot (nuvem é no-op)
 *
 *   clinicaExiste(clinicaId) → boolean|null   null = sem banco neste processo
 *   clinica(clinicaId) → { nome, telefone }
 *   configAutomacoes(clinicaId) → objeto|null
 *   aceitaEscrita(clinicaId) → boolean      false = modo de consulta: nada sai em nome dela
 *
 *   salvarMensagem(clinicaId, mensagem) → linha|null
 *   listarMensagens(clinicaId, chatId, limite) → mensagem[]
 *   listarConversas(clinicaId) → conversa[]
 *
 *   agendadasPendentes(clinicaId, agoraISO, limite)
 *   reservarAgendada(id) → boolean
 *   concluirAgendada(id, erro)
 *   reservarEnvio(clinicaId, chave, dados) → { id }|null
 *   concluirEnvio(id, erro)
 *
 *   agendamentosParaConfirmacao(clinicaId, desdeISO, ateISO, limite)
 *   agendamentosParaLembrete(clinicaId, deISO, ateISO, limite)
 *   agendamentosParaPosConsulta(clinicaId, deISO, ateISO, limite)
 *   agendamentosParaRetorno(clinicaId, inicioISO)
 *   lembretesEnviados(clinicaId, agendamentoIds) → Set<string>
 *   marcarLembrete(clinicaId, agendamentoId)
 *   pacientesParaAniversario(clinicaId)
 *   pacientesPorIds(clinicaId, ids)
 *   chavesDeEnvio(clinicaId, tipo) → Set<string>
 *
 * Os agendamentos vêm sempre normalizados como `{ ...agendamento, paciente }`.
 */

import { criarRepositorioLocal } from './repositorioLocal.mjs';
import { criarRepositorioNuvem } from './repositorioNuvem.mjs';

export function criarRepositorio() {
  return String(process.env.ORTUS_LOCAL_DB || '') === '1'
    ? criarRepositorioLocal()
    : criarRepositorioNuvem();
}
