/**
 * Repositório da nuvem (Supabase com service role), usado quando o gateway
 * NÃO roda dentro do desktop.
 *
 * Comportamento idêntico ao que o server.mjs tinha antes da camada de
 * repositório: o agendador lê `whatsapp_agendadas`, `agendamentos`, `pacientes`
 * e `configuracoes_clinica` pelo PostgREST. Em modo desktop este arquivo não é
 * usado — lá vale repositorioLocal.mjs.
 *
 * O gateway em nuvem continua sem persistir mensagens (elas vivem em memória
 * no server.mjs), por isso os métodos de mensagens são vazios.
 */

const PAGINA = 1000;
const LIMITE_PAGINACAO = 20_000;
const SELECT_AGENDAMENTO = 'id,data_hora,procedimento,created_at,pacientes(id,nome,telefone)';

function umPaciente(valor) {
  return Array.isArray(valor) ? valor[0] || null : valor || null;
}

/** Achata o embed `pacientes(...)` no formato único `agendamento.paciente`. */
function comPaciente(linhas) {
  return (linhas || []).map((linha) => {
    const { pacientes, ...resto } = linha;
    return { ...resto, paciente: umPaciente(pacientes) };
  });
}

export function criarRepositorioNuvem() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const configurado = Boolean(url && chave);

  async function db(caminho, { method = 'GET', body, prefer } = {}) {
    const resposta = await fetch(`${url}/rest/v1/${caminho}`, {
      method,
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        'content-type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
      // O corpo do erro traz a linha recusada em `details` (nome, telefone e
      // texto da mensagem). Só o código e a mensagem do banco entram no erro,
      // que acaba no log do serviço.
      let resumo = '';
      try {
        const corpo = JSON.parse(texto);
        resumo = [corpo?.code, corpo?.message].filter((parte) => typeof parte === 'string' && parte).join(' ');
      } catch {
        /* corpo que não é JSON não é repetido */
      }
      throw new Error(`Supabase ${resposta.status}${resumo ? `: ${resumo.slice(0, 200)}` : ''}`);
    }
    return texto ? JSON.parse(texto) : null;
  }

  async function dbTodos(caminho) {
    const linhas = [];
    for (let inicio = 0; inicio < LIMITE_PAGINACAO; inicio += PAGINA) {
      const separador = caminho.includes('?') ? '&' : '?';
      const pagina = await db(`${caminho}${separador}limit=${PAGINA}&offset=${inicio}`);
      linhas.push(...(pagina || []));
      if (!pagina || pagina.length < PAGINA) break;
    }
    return linhas;
  }

  /** O id chega canônico (só dígitos) do server.mjs. Sem banco configurado não dá para saber: null. */
  async function clinicaExiste(clinicaId) {
    if (!configurado) return null;
    const linhas = await db(`clinicas?id=eq.${clinicaId}&select=id&limit=1`);
    return Boolean(linhas?.length);
  }

  async function clinica(clinicaId) {
    const linhas = await db(`clinicas?id=eq.${clinicaId}&select=nome,telefone`);
    return linhas?.[0] || {};
  }

  async function configAutomacoes(clinicaId) {
    const config = await db(`configuracoes_clinica?clinica_id=eq.${clinicaId}&chave=eq.whatsapp_automacoes&select=valor`);
    return config?.[0]?.valor || null;
  }

  /**
   * A clínica pode gravar (assinatura em dia ou em atraso)? Em modo de consulta nada sai em nome
   * dela. Conta ao vivo no banco (`clinica_aceita_escrita`); erro sobe para o agendador, que
   * pula a clínica nesta rodada.
   */
  async function aceitaEscrita(clinicaId) {
    const resposta = await db('rpc/clinica_aceita_escrita', { method: 'POST', body: { p_clinica: Number(clinicaId) } });
    if (typeof resposta !== 'boolean') throw new Error('clinica_aceita_escrita sem resposta booleana');
    return resposta;
  }

  // Nuvem não persiste mensagens: o histórico continua só em memória.
  async function salvarMensagem() {
    return null;
  }

  async function listarMensagens() {
    return [];
  }

  async function listarConversas() {
    return [];
  }

  async function agendadasPendentes(clinicaId, agoraISO, limite = 20) {
    const fila = await db(
      `whatsapp_agendadas?clinica_id=eq.${clinicaId}&status=eq.pendente&enviar_em=lte.${encodeURIComponent(agoraISO)}&order=enviar_em.asc&limit=${limite}&select=id,nome,telefone,texto`,
    );
    return fila || [];
  }

  async function reservarAgendada(id) {
    const reservada = await db(`whatsapp_agendadas?id=eq.${id}&status=eq.pendente`, {
      method: 'PATCH',
      body: { status: 'enviando' },
      prefer: 'return=representation',
    });
    return Boolean(reservada?.length);
  }

  async function concluirAgendada(id, erro) {
    const body = erro
      ? { status: 'falha', erro: String(erro).slice(0, 500) }
      : { status: 'enviada', enviada_em: new Date().toISOString(), erro: null };
    await db(`whatsapp_agendadas?id=eq.${id}`, { method: 'PATCH', body });
  }

  async function reservarEnvio(clinicaId, chave, dados) {
    const linhas = await db('whatsapp_envios?on_conflict=clinica_id,chave', {
      method: 'POST',
      body: { clinica_id: Number(clinicaId), chave, status: 'enviando', ...dados },
      prefer: 'resolution=ignore-duplicates,return=representation',
    });
    return linhas?.[0] || null;
  }

  async function concluirEnvio(id, erro) {
    await db(`whatsapp_envios?id=eq.${id}`, {
      method: 'PATCH',
      body: erro ? { status: 'falha', erro: String(erro).slice(0, 500) } : { status: 'enviada', erro: null },
    });
  }

  async function agendamentosParaConfirmacao(clinicaId, desdeISO, ateISO, limite = 30) {
    const lista = await db(
      `agendamentos?clinica_id=eq.${clinicaId}&status=eq.agendado&created_at=gte.${encodeURIComponent(desdeISO)}&data_hora=gt.${encodeURIComponent(ateISO)}&order=created_at.asc&limit=${limite}&select=${SELECT_AGENDAMENTO}`,
    );
    return comPaciente(lista);
  }

  async function agendamentosParaLembrete(clinicaId, deISO, ateISO, limite = 60) {
    const lista = await db(
      `agendamentos?clinica_id=eq.${clinicaId}&status=eq.agendado&data_hora=gt.${encodeURIComponent(deISO)}&data_hora=lte.${encodeURIComponent(ateISO)}&order=data_hora.asc&limit=${limite}&select=${SELECT_AGENDAMENTO}`,
    );
    return comPaciente(lista);
  }

  async function agendamentosParaPosConsulta(clinicaId, deISO, ateISO, limite = 40) {
    const lista = await db(
      `agendamentos?clinica_id=eq.${clinicaId}&status=in.(concluido,fiado)&data_hora=gte.${encodeURIComponent(deISO)}&data_hora=lte.${encodeURIComponent(ateISO)}&order=data_hora.asc&limit=${limite}&select=${SELECT_AGENDAMENTO}`,
    );
    return comPaciente(lista);
  }

  async function agendamentosParaRetorno(clinicaId, inicioISO) {
    return dbTodos(
      `agendamentos?clinica_id=eq.${clinicaId}&status=in.(agendado,concluido,fiado)&data_hora=gte.${encodeURIComponent(inicioISO)}&paciente_id=not.is.null&select=id,paciente_id,data_hora,status&order=id.asc`,
    );
  }

  async function lembretesEnviados(clinicaId, agendamentoIds) {
    const ids = [...new Set((agendamentoIds || []).filter(Boolean).map(String))];
    if (!ids.length) return new Set();
    const linhas = await db(
      `lembretes_agenda?canal=eq.whatsapp&agendamento_id=in.(${ids.join(',')})&select=agendamento_id`,
    );
    return new Set((linhas || []).map((linha) => String(linha.agendamento_id)));
  }

  async function marcarLembrete(clinicaId, agendamentoId) {
    await db('lembretes_agenda?on_conflict=agendamento_id,canal', {
      method: 'POST',
      body: {
        agendamento_id: agendamentoId,
        clinica_id: Number(clinicaId),
        canal: 'whatsapp',
        enviado_em: new Date().toISOString(),
      },
      prefer: 'resolution=merge-duplicates',
    }).catch(() => {});
  }

  async function pacientesParaAniversario(clinicaId) {
    return dbTodos(
      `pacientes?clinica_id=eq.${clinicaId}&data_nascimento=not.is.null&telefone=not.is.null&select=id,nome,telefone,data_nascimento&order=id.asc`,
    );
  }

  async function pacientesPorIds(clinicaId, ids) {
    if (!ids?.length) return [];
    const lista = await db(`pacientes?id=in.(${ids.join(',')})&telefone=not.is.null&select=id,nome,telefone`);
    return lista || [];
  }

  async function chavesDeEnvio(clinicaId, tipo) {
    const enviados = await dbTodos(`whatsapp_envios?clinica_id=eq.${clinicaId}&tipo=eq.${tipo}&select=chave`);
    return new Set(enviados.map((linha) => String(linha.chave)));
  }

  return {
    modalidade: 'nuvem',
    configurado,
    agendadorAtivo: configurado,
    verificar: async () => {},
    clinicaExiste,
    clinica,
    configAutomacoes,
    aceitaEscrita,
    salvarMensagem,
    listarMensagens,
    listarConversas,
    agendadasPendentes,
    reservarAgendada,
    concluirAgendada,
    reservarEnvio,
    concluirEnvio,
    agendamentosParaConfirmacao,
    agendamentosParaLembrete,
    agendamentosParaPosConsulta,
    agendamentosParaRetorno,
    lembretesEnviados,
    marcarLembrete,
    pacientesParaAniversario,
    pacientesPorIds,
    chavesDeEnvio,
  };
}
