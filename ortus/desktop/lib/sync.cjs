'use strict';

const { ORDEM_SYNC, def } = require('./esquema.cjs');
const { instante } = require('./sqlite.cjs');
const log = require('./log.cjs');

/**
 * Motor de sincronização (processo principal do Electron).
 *
 * Modelo: o SQLite é a verdade local e a nuvem é o backup.
 *
 * Cada ciclo RECEBE antes de ENVIAR:
 *
 *  - PULL: a partir da posição guardada de cada tabela, baixa o que chegou
 *    de outro computador e aplica no SQLite.
 *  - CONFLITO: o pull trouxe uma linha que tem escrita local na fila, e a
 *    versão da nuvem não é mais aquela sobre a qual a escrita foi feita. As
 *    duas versões vão para `sync_conflitos`; vence, por ora, o carimbo mais
 *    novo, e quem decide de vez é a pessoa, em Configurações > Sincronização.
 *    Receber primeiro é o que faz o conflito aparecer: enviar primeiro
 *    gravaria por cima da nuvem sem ninguém ficar sabendo.
 *  - PUSH: o que sobrou na fila sobe em ordem (tabela pai antes da filha),
 *    com upsert idempotente no PostgREST usando o JWT do usuário — nunca
 *    service role. A linha leva o id criado aqui, então reenviar depois de
 *    uma queda de rede atualiza a mesma linha em vez de criar outra.
 *  - SEM REDE: nada é descartado; a fila fica no SQLite e o ciclo recomeça
 *    sozinho quando a conexão volta.
 *  - RECUSA: escrita que a nuvem nega (modo de consulta, RLS) não fica em
 *    laço de tentativas: sai da fila como conflito "recusado", com a versão
 *    daqui guardada, e aparece em Configurações > Sincronização.
 */

const INTERVALO_MS = 5_000;
const LOTE_PUSH = 80;
const PAGINA_PULL = 500;
const MAX_TENTATIVAS = 12;
// Conexão que aceita e não responde (rede de hotel, modem travado) não pode
// segurar a fila de sincronização para sempre.
const TEMPO_LIMITE_MS = 30_000;
// Teto de páginas por tabela em um ciclo (2 milhões de linhas): defesa contra
// um laço sem fim, não um limite de uso.
const MAX_PAGINAS = 4_000;

const RANK = Object.fromEntries(ORDEM_SYNC.map((tabela, indice) => [tabela, indice]));

function agoraISO() {
  return new Date().toISOString();
}

/** Sem rede, DNS fora ou conexão que não respondeu no prazo. */
function falhaDeRede(err) {
  if (err instanceof TypeError) return true;
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) return true;
  return /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(String(err?.message || ''));
}

/** Código do PostgREST (`42501`, `PT402`…) no corpo de uma resposta de erro. */
function codigoDoErro(texto) {
  try {
    const corpo = JSON.parse(texto);
    return corpo && typeof corpo.code === 'string' ? corpo.code : '';
  } catch {
    return '';
  }
}

/** Erro de uma escrita recusada, com o status HTTP e o código do PostgREST. */
function erroDaNuvem(operacao, tabela, status, texto) {
  return Object.assign(new Error(`${operacao} ${tabela}: ${status} ${texto.slice(0, 300)}`), {
    status,
    codigo: codigoDoErro(texto),
  });
}

/**
 * Recusa que repetir não resolve, e por isso vira na hora um conflito
 * "recusado" (sem gastar as tentativas):
 *  - 402 / PT402: a rede da clínica está em modo de consulta (assinatura
 *    suspensa) e a nuvem só aceita leitura;
 *  - 403 / 42501: a RLS ou um gatilho negou esta escrita a este usuário
 *    (comissão de quem não é administrador, envio do WhatsApp que não se
 *    apaga, link de anamnese prorrogado…).
 */
function recusaDefinitiva(err) {
  const status = Number(err?.status || 0);
  const codigo = String(err?.codigo || '');
  if (status === 402 || codigo === 'PT402') return 'consulta';
  if (status === 403 || codigo === '42501') return 'permissao';
  return null;
}

/** Os dois carimbos apontam para a mesma versão da linha? */
function mesmoInstante(a, b) {
  const x = instante(a);
  return x != null && x === instante(b);
}

/** Igualdade de valores já convertidos (JSON inclusive, sem depender da ordem das chaves). */
function igual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, i) => igual(item, b[i]));
  const chavesA = Object.keys(a);
  const chavesB = Object.keys(b);
  return chavesA.length === chavesB.length && chavesA.every((chave) => chave in b && igual(a[chave], b[chave]));
}

function criarSync({ banco, obterConfig, obterSessao, definirSessao, aoMudarEstado }) {
  let timer = null;
  let fila = Promise.resolve();

  // Um ciclo por vez. Quem chama no meio espera o que já está rodando,
  // em vez de receber "ocupado" e seguir com o banco ainda vazio.
  function enfileirar(trabalho) {
    const execucao = fila.then(trabalho, trabalho);
    fila = execucao.then(
      () => undefined,
      () => undefined,
    );
    return execucao;
  }

  const estado = {
    estado: 'iniciando', // iniciando | sincronizando | sincronizado | offline | erro | login
    pendentes: 0,
    conflitos: 0,
    ultimoEnvioOk: banco.obterMeta('ultimo_envio_ok') || null,
    ultimaTentativa: null,
    ultimoErro: null,
    online: null,
    bootstrap: banco.obterMeta('bootstrap_completo') === '1',
  };

  function publicar(mudanca) {
    Object.assign(estado, mudanca);
    if (typeof aoMudarEstado === 'function') {
      try {
        aoMudarEstado({ ...estado });
      } catch (err) {
        log.aviso('sync: falha ao publicar estado', err);
      }
    }
    return { ...estado };
  }

  function atualizarContadores() {
    estado.pendentes = banco.contarOutbox();
    estado.conflitos = banco.contarConflitosPendentes();
  }

  // ------------------------------------------------------------------ HTTP
  /**
   * Toda chamada à nuvem leva a chave pública do projeto e o JWT de quem está
   * logado: quem decide o que este computador lê e grava é a RLS do Postgres.
   */
  function cabecalhos(sessao) {
    const { anonKey } = obterConfig();
    return {
      apikey: anonKey,
      Authorization: `Bearer ${sessao.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  function pedir(url, opcoes = {}) {
    return fetch(url, { ...opcoes, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  }

  async function renovarSessao(sessao) {
    const { url, anonKey } = obterConfig();
    if (!sessao?.refresh_token) return null;
    let resposta;
    try {
      resposta = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: sessao.refresh_token }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    if (!dados?.access_token) return null;
    const nova = {
      ...sessao,
      access_token: dados.access_token,
      refresh_token: dados.refresh_token || sessao.refresh_token,
      expires_at: dados.expires_at || Math.floor(Date.now() / 1000) + Number(dados.expires_in || 3600),
    };
    definirSessao(nova);
    return nova;
  }

  function sessaoValida(sessao) {
    if (!sessao?.access_token) return false;
    const expira = Number(sessao.expires_at || 0);
    if (!expira) return true;
    return expira * 1000 > Date.now() + 60_000;
  }

  async function sessaoAtual() {
    let sessao = obterSessao();
    if (!sessao?.access_token) return null;
    if (!sessaoValida(sessao)) {
      const nova = await renovarSessao(sessao);
      if (!nova) return null;
      sessao = nova;
    }
    return sessao;
  }

  // ------------------------------------------------------------------ PUSH
  function consolidarOutbox() {
    const linhas = banco.bruto
      .prepare('SELECT * FROM sync_outbox ORDER BY seq ASC LIMIT 5000')
      .all();
    if (linhas.length <= 1) return linhas;

    // Só o estado mais recente de cada linha importa.
    const ultima = new Map();
    for (const linha of linhas) {
      const chave = `${linha.tabela}\u0000${linha.linha_id}`;
      const anterior = ultima.get(chave);
      if (anterior) banco.removerOutbox([anterior.seq]);
      ultima.set(chave, linha);
    }

    return Array.from(ultima.values()).sort((a, b) => {
      const rank = (RANK[a.tabela] ?? 99) - (RANK[b.tabela] ?? 99);
      return rank !== 0 ? rank : a.seq - b.seq;
    });
  }

  async function enviarLinha(sessao, item) {
    const { url } = obterConfig();
    const tabela = item.tabela;
    const t = def(tabela);

    if (item.op === 'delete') {
      const resposta = await pedir(
        `${url}/rest/v1/${tabela}?${encodeURIComponent(t.pk)}=eq.${encodeURIComponent(item.linha_id)}`,
        { method: 'DELETE', headers: { ...cabecalhos(sessao), Prefer: 'return=minimal' } },
      );
      if (!resposta.ok && resposta.status !== 404) {
        throw erroDaNuvem('delete', tabela, resposta.status, await resposta.text());
      }
      return;
    }

    const payload = item.payload ? JSON.parse(item.payload) : null;
    if (!payload) return;

    // `return=representation` devolve a linha como o SERVIDOR a gravou —
    // inclusive o `updated_at` dele. Aplicamos de volta para a máquina local
    // ficar com a mesma referência de tempo da nuvem (relógio do PC não manda).
    //
    // O upsert é pela chave primária, e a chave nasce aqui: se a resposta se
    // perder no caminho, o reenvio atualiza a mesma linha — não cria outra.
    const resposta = await pedir(`${url}/rest/v1/${tabela}`, {
      method: 'POST',
      headers: {
        ...cabecalhos(sessao),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([payload]),
    });
    if (!resposta.ok) {
      throw erroDaNuvem('upsert', tabela, resposta.status, await resposta.text());
    }
    const devolvidas = await resposta.json().catch(() => null);
    if (Array.isArray(devolvidas)) {
      for (const devolvida of devolvidas) {
        if (!devolvida || devolvida[t.pk] == null) continue;
        if (banco.temPendenciaDepois(tabela, devolvida[t.pk], item.seq)) {
          // A pessoa editou de novo enquanto este envio estava no ar: o que
          // está na tela é mais novo que a resposta, e aplicá-la desfaria a
          // edição. Só anotamos que a nuvem agora tem esta versão, para o
          // próximo pull não tomá-la por alteração de outro computador.
          banco.definirBaseDaPendencia(tabela, devolvida[t.pk], devolvida.updated_at);
        } else {
          banco.aplicarRemoto(tabela, devolvida);
        }
      }
    }
  }

  async function empurrar(sessao) {
    let enviados = 0;
    let tentativaExtra = 0;
    // O que a nuvem recusou neste ciclo só volta a ser tentado no próximo:
    // sem isto as 12 tentativas se gastavam em sequência, no mesmo segundo.
    const recusadosNesteCiclo = new Set();

    while (enviados < LOTE_PUSH) {
      const pendentes = consolidarOutbox().filter((item) => !recusadosNesteCiclo.has(item.seq));
      if (!pendentes.length) break;

      const lote = pendentes.slice(0, Math.min(20, LOTE_PUSH - enviados));
      let parar = false;

      for (const item of lote) {
        try {
          await enviarLinha(sessao, item);
          banco.removerOutbox([item.seq]);
          enviados += 1;
        } catch (err) {
          const status = Number(err?.status || 0);
          if (status === 401 && tentativaExtra === 0) {
            // Token venceu no meio do caminho: renova e recomeça o ciclo.
            tentativaExtra = 1;
            const nova = await renovarSessao(sessao);
            if (nova) {
              sessao.access_token = nova.access_token;
              sessao.refresh_token = nova.refresh_token;
              continue;
            }
            return { enviados, parado: 'sessao' };
          }
          if (status === 401 || status === 0) {
            return { enviados, parado: status === 401 ? 'sessao' : 'rede' };
          }
          const motivo = recusaDefinitiva(err);
          if (motivo || (status >= 400 && status < 500 && status !== 408 && status !== 429)) {
            // O pedido está errado para o servidor e repetir na hora não muda
            // nada. Um item assim não pode travar o backup dos demais. Modo de
            // consulta e permissão negada viram conflito "recusado" já na
            // primeira resposta; constraint, tabela ou coluna que a nuvem não
            // tem ficam para o próximo ciclo e, esgotadas as tentativas, viram
            // o mesmo conflito. Nos dois casos a versão daqui fica guardada e
            // a linha local não é apagada: quem decide é a pessoa, em
            // Configurações > Sincronização.
            recusadosNesteCiclo.add(item.seq);
            banco.marcarErroOutbox(item.seq, err.message);
            const tentativas = Number(banco.bruto.prepare('SELECT tentativas FROM sync_outbox WHERE seq = ?').get(item.seq)?.tentativas || 0);
            if (motivo || tentativas >= MAX_TENTATIVAS) {
              banco.registrarConflito({
                tabela: item.tabela,
                linhaId: item.linha_id,
                clinicaId: item.clinica_id,
                versaoLocal: item.payload ? JSON.parse(item.payload) : null,
                versaoRemota: null,
                escolhido: 'local',
                resolucao: 'recusado',
                motivo: motivo || 'rejeitado',
              });
              banco.removerOutbox([item.seq]);
            }
            log.aviso('sync: item rejeitado pelo servidor', err.message);
            continue;
          }
          // 5xx e afins: para o ciclo e tenta de novo depois.
          parar = true;
          return { enviados, parado: 'servidor', erro: err.message };
        }
      }

      if (parar) break;
      if (lote.length === 0) break;
    }

    if (enviados > 0) {
      estado.ultimoEnvioOk = agoraISO();
      banco.definirMeta('ultimo_envio_ok', estado.ultimoEnvioOk);
    }
    return { enviados, parado: null };
  }

  // ------------------------------------------------------------------ PULL
  /**
   * Lê uma tabela da nuvem em páginas, na ordem (carimbo, chave), a partir da
   * posição guardada.
   *
   * A posição tem o carimbo E a chave da última linha lida. Só o carimbo não
   * diz onde a leitura parou quando muitas linhas têm o mesmo — e têm: todas
   * as que existiam quando `updated_at` foi criada receberam o mesmo valor.
   * Com `carimbo >= cursor` e página de 500, uma tabela com mais de 500
   * linhas iguais nunca terminava de baixar (ou pulava o resto).
   *
   * Os valores vão sem aspas dentro de `or=(…)`: carimbo e chave não têm
   * vírgula nem parêntese, que são os únicos separadores dessa sintaxe.
   */
  async function lerPaginas(sessao, { tabela, select = '*', colTempo, colChave, aoLer }) {
    const { url } = obterConfig();
    let posicao = banco.obterPosicao(tabela);
    let lidas = 0;

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
      let filtro = '';
      if (posicao && posicao.id != null) {
        const aPartir = `(${colTempo}.gt.${posicao.t},and(${colTempo}.eq.${posicao.t},${colChave}.gt.${posicao.id}))`;
        filtro = `&or=${encodeURIComponent(aPartir)}`;
      } else if (posicao) {
        // Posição herdada de uma versão anterior (só o carimbo): inclui o
        // próprio carimbo, porque não se sabe quais linhas dele já vieram.
        filtro = `&${colTempo}=gte.${encodeURIComponent(posicao.t)}`;
      }
      const resposta = await pedir(
        `${url}/rest/v1/${tabela}?select=${select}${filtro}&order=${colTempo}.asc,${colChave}.asc&limit=${PAGINA_PULL}`,
        { headers: cabecalhos(sessao) },
      );

      if (resposta.status === 401) return { lidas, parado: 'sessao' };
      if (!resposta.ok) {
        const texto = (await resposta.text()).slice(0, 200);
        throw Object.assign(new Error(`pull ${tabela}: ${resposta.status} ${texto}`), { status: resposta.status });
      }

      const linhas = await resposta.json();
      if (!Array.isArray(linhas) || linhas.length === 0) break;

      const ultima = linhas[linhas.length - 1];
      const proxima = { t: ultima[colTempo], id: ultima[colChave] };
      // Sem carimbo ou sem chave não há como continuar de onde parou.
      const continuavel = proxima.t != null && proxima.id != null;
      // A nuvem devolveu de novo a última linha já lida: não está avançando.
      if (continuavel && posicao && posicao.id != null && posicao.t === proxima.t && String(posicao.id) === String(proxima.id)) {
        throw new Error(`pull ${tabela}: a leitura não avançou`);
      }
      // A página e a posição são gravadas juntas: se o programa fechar no
      // meio, a leitura recomeça exatamente de onde o banco parou.
      banco.emTransacao(() => {
        aoLer(linhas);
        if (continuavel) banco.definirPosicao(tabela, proxima);
      });
      lidas += linhas.length;
      if (!continuavel) break;
      posicao = proxima;
      if (linhas.length < PAGINA_PULL) break;
    }
    return { lidas, parado: null };
  }

  /** Os dois registros têm o mesmo conteúdo? Ignora o carimbo, que é do servidor. */
  function mesmoConteudo(tabela, a, b) {
    if (!a || !b) return false;
    const x = banco.paraApi(tabela, banco.paraLinha(tabela, a));
    const y = banco.paraApi(tabela, banco.paraLinha(tabela, b));
    delete x.updated_at;
    delete y.updated_at;
    return igual(x, y);
  }

  /**
   * Uma linha vinda da nuvem. Devolve o que aconteceu com ela:
   * 'aplicada', 'ignorada' ou 'conflito'.
   */
  function receberLinha(tabela, t, linha) {
    const linhaId = linha[t.pk];
    const pendencias = banco.pendenciasDe(tabela, linhaId);
    if (!pendencias.length) {
      banco.aplicarRemoto(tabela, linha);
      return 'aplicada';
    }

    const remotoUpdated = linha.updated_at || null;
    const ultima = pendencias[pendencias.length - 1];

    // A nuvem continua na versão sobre a qual a escrita daqui foi feita: nada
    // mudou do outro lado, a edição local segue para o envio.
    if (mesmoInstante(ultima.base, remotoUpdated)) return 'ignorada';

    // A nuvem tem exatamente o que este computador já mandou (a resposta do
    // envio se perdeu no caminho). Não é alteração de outra máquina.
    let jaEnviada = -1;
    pendencias.forEach((pendencia, indice) => {
      if (!pendencia.payload) return;
      try {
        if (mesmoConteudo(tabela, JSON.parse(pendencia.payload), linha)) jaEnviada = indice;
      } catch {
        /* payload ilegível: não serve de prova */
      }
    });
    if (jaEnviada >= 0) {
      banco.removerOutbox(pendencias.slice(0, jaEnviada + 1).map((pendencia) => pendencia.seq));
      if (jaEnviada === pendencias.length - 1) {
        banco.aplicarRemoto(tabela, linha);
        return 'aplicada';
      }
      banco.definirBaseDaPendencia(tabela, linhaId, remotoUpdated);
      return 'ignorada';
    }

    // Conflito de verdade: outro computador mudou a linha depois da versão que
    // este conhecia, e aqui há trabalho que ainda não subiu. As duas versões
    // ficam guardadas; o carimbo mais novo vale até a pessoa decidir.
    const local = banco.obter(tabela, linhaId);
    // Exclusão local não tem linha: vale a hora em que foi feita.
    const localMs = instante(local?.updated_at || ultima.updated_at);
    const remotoMs = instante(remotoUpdated);
    const venceuLocal = localMs != null && remotoMs != null ? localMs >= remotoMs : localMs != null;

    banco.registrarConflito({
      tabela,
      linhaId,
      clinicaId: linha[t.clinicaCol || 'clinica_id'] ?? null,
      versaoLocal: local,
      versaoRemota: linha,
      escolhido: venceuLocal ? 'local' : 'remoto',
    });

    if (venceuLocal) {
      // A escrita daqui continua na fila e agora conhece esta versão da nuvem.
      banco.definirBaseDaPendencia(tabela, linhaId, remotoUpdated);
      return 'conflito';
    }
    // A nuvem é mais nova: a escrita daqui sai da fila (está guardada no
    // conflito) e a linha passa a ser a da nuvem.
    banco.descartarPendencias(tabela, linhaId);
    banco.aplicarRemoto(tabela, linha);
    return 'conflito';
  }

  async function puxarTabela(sessao, tabela) {
    const t = def(tabela);
    let aplicados = 0;
    let conflitos = 0;

    const leitura = await lerPaginas(sessao, {
      tabela,
      colTempo: 'updated_at',
      colChave: t.pk,
      aoLer: (linhas) => {
        for (const linha of linhas) {
          if (linha[t.pk] == null) continue;
          try {
            const resultado = receberLinha(tabela, t, linha);
            if (resultado === 'aplicada') aplicados += 1;
            if (resultado === 'conflito') conflitos += 1;
          } catch (err) {
            // Uma linha que o banco local não aceita não pode segurar a tabela inteira.
            log.aviso('sync: linha não aplicada', tabela, String(linha[t.pk]), err instanceof Error ? err.message : err);
          }
        }
      },
    });

    return { aplicados, conflitos, parado: leitura.parado };
  }

  /**
   * Exclusões feitas em outras máquinas.
   *
   * Sem isso, um registro apagado no computador da recepção continuaria
   * aparecendo no consultório e poderia até ser reenviado (ressuscitando).
   */
  async function puxarExclusoes(sessao) {
    const TABELA = 'sync_exclusoes';
    let aplicados = 0;

    let leitura;
    try {
      leitura = await lerPaginas(sessao, {
        tabela: TABELA,
        select: 'id,tabela,linha_id,excluido_em',
        colTempo: 'excluido_em',
        colChave: 'id',
        aoLer: (linhas) => {
          for (const linha of linhas) {
            if (!linha.tabela || !linha.linha_id || !linha.excluido_em) continue;
            try {
              banco.aplicarTumulo(linha.tabela, linha.linha_id, linha.excluido_em);
              aplicados += 1;
            } catch (err) {
              log.aviso('sync: falha ao aplicar exclusão', linha.tabela, err instanceof Error ? err.message : err);
            }
          }
        },
      });
    } catch (err) {
      // Tabela ainda não migrada: não trava o resto da sincronização.
      if (err && (err.status === 404 || err.status === 400)) return { aplicados, parado: null };
      throw err;
    }
    return { aplicados, parado: leitura.parado };
  }

  /**
   * Recebe todas as tabelas. Uma tabela que a nuvem recusa (migration que
   * falta, por exemplo) não impede as outras de descer nem o envio de subir:
   * o erro é devolvido para aparecer no indicador.
   */
  async function puxar(sessao) {
    let aplicados = 0;
    let conflitos = 0;
    let erro = null;

    for (const tabela of ORDEM_SYNC) {
      try {
        const resultado = await puxarTabela(sessao, tabela);
        aplicados += resultado.aplicados;
        conflitos += resultado.conflitos;
        if (resultado.parado === 'sessao') return { aplicados, conflitos, parado: 'sessao', erro };
      } catch (err) {
        if (falhaDeRede(err)) throw err;
        log.aviso('sync: tabela não recebida', err instanceof Error ? err.message : err);
        erro = erro || (err instanceof Error ? err.message : String(err));
      }
    }

    try {
      const exclusoes = await puxarExclusoes(sessao);
      aplicados += exclusoes.aplicados;
      if (exclusoes.parado === 'sessao') return { aplicados, conflitos, parado: 'sessao', erro };
    } catch (err) {
      if (falhaDeRede(err)) throw err;
      log.aviso('sync: exclusões não recebidas', err instanceof Error ? err.message : err);
      erro = erro || (err instanceof Error ? err.message : String(err));
    }
    return { aplicados, conflitos, parado: null, erro };
  }

  // --------------------------------------------------------------- bootstrap
  /**
   * Cópia inicial: zera as posições e recebe tudo o que a RLS deixa este
   * usuário ver. Usa o mesmo caminho do pull, então uma escrita local que
   * já estivesse na fila continua valendo (e vira conflito se for o caso).
   */
  async function executarBootstrap({ doZero = false } = {}) {
    try {
      const sessao = await sessaoAtual();
      if (!sessao) {
        publicar({ estado: 'login', online: null });
        return { ok: false, motivo: 'sem-sessao' };
      }
      publicar({ estado: 'sincronizando', online: true });

      // Uma cópia que falhou no meio continua de onde parou. Recomeçar do zero
      // a cada ciclo baixaria a clínica inteira de novo, de 5 em 5 segundos.
      if (doZero || banco.obterMeta('bootstrap_em_andamento') !== '1') {
        banco.limparPosicoes();
        banco.definirMeta('bootstrap_em_andamento', '1');
      }
      const pull = await puxar(sessao);
      if (pull.parado === 'sessao') {
        publicar({ estado: 'login', online: true });
        return { ok: false, motivo: 'sem-sessao' };
      }
      // Cópia pela metade não libera o trabalho: a tela ficaria sem parte dos dados.
      if (pull.erro) throw new Error(pull.erro);

      banco.definirMeta('bootstrap_completo', '1');
      banco.definirMeta('bootstrap_em_andamento', null);
      banco.definirMeta('bootstrap_em', agoraISO());
      banco.definirMeta('bootstrap_usuario', sessao.user?.id || '');
      atualizarContadores();
      publicar({ estado: 'sincronizado', online: true, bootstrap: true, ultimoEnvioOk: agoraISO() });
      banco.definirMeta('ultimo_envio_ok', estado.ultimoEnvioOk);
      log.info(`sync: bootstrap concluído (${pull.aplicados} linhas)`);
      return { ok: true, linhas: pull.aplicados };
    } catch (err) {
      const semRede = falhaDeRede(err);
      log.erro('sync: falha no bootstrap', err);
      publicar({
        estado: semRede ? 'offline' : 'erro',
        online: !semRede,
        ultimoErro: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, motivo: err instanceof Error ? err.message : 'erro' };
    } finally {
      atualizarContadores();
    }
  }

  /** Pedido explícito de cópia completa: baixa tudo de novo, do começo. */
  function bootstrap() {
    return enfileirar(() => executarBootstrap({ doZero: true }));
  }

  // ------------------------------------------------------------------ ciclo
  async function executarCiclo() {
    estado.ultimaTentativa = agoraISO();
    try {
      const sessao = await sessaoAtual();
      if (!sessao) {
        publicar({ estado: 'login', online: null });
        atualizarContadores();
        return { ...estado };
      }

      if (banco.obterMeta('bootstrap_completo') !== '1') {
        await executarBootstrap();
        return { ...estado };
      }

      publicar({ estado: 'sincronizando', online: true, ultimoErro: null });

      // Recebe antes de enviar (ver o comentário no topo do arquivo).
      const pull = await puxar(sessao);
      if (pull.parado === 'sessao') {
        publicar({ estado: 'login', online: true });
        atualizarContadores();
        return { ...estado };
      }

      const push = await empurrar(sessao);
      if (push.parado === 'rede') {
        publicar({ estado: 'offline', online: false });
        atualizarContadores();
        return { ...estado };
      }
      if (push.parado === 'sessao') {
        publicar({ estado: 'login', online: true });
        atualizarContadores();
        return { ...estado };
      }
      const erro = push.parado === 'servidor' ? push.erro || 'A nuvem não aceitou o envio.' : pull.erro;
      if (erro) {
        publicar({ estado: 'erro', online: true, ultimoErro: erro });
        atualizarContadores();
        return { ...estado };
      }

      atualizarContadores();
      publicar({
        estado: estado.pendentes > 0 ? 'sincronizando' : 'sincronizado',
        online: true,
      });
      return { ...estado };
    } catch (err) {
      const semRede = falhaDeRede(err);
      log.aviso('sync: ciclo com erro', err instanceof Error ? err.message : err);
      publicar({
        estado: semRede ? 'offline' : 'erro',
        online: !semRede,
        ultimoErro: err instanceof Error ? err.message : String(err),
      });
      atualizarContadores();
      return { ...estado };
    }
  }

  // Quantos ciclos estão rodando ou esperando a vez.
  let ciclosNaFila = 0;

  function sincronizarAgora() {
    ciclosNaFila += 1;
    return enfileirar(() => executarCiclo()).finally(() => {
      ciclosNaFila -= 1;
    });
  }

  function iniciar() {
    atualizarContadores();
    publicar({});
    if (timer) return;
    timer = setInterval(() => {
      // Com a rede lenta um ciclo passa do intervalo: o relógio não empilha
      // outro atrás, senão a fila só cresce.
      if (ciclosNaFila === 0) void sincronizarAgora();
    }, INTERVALO_MS);
    if (typeof timer.unref === 'function') timer.unref();
    void sincronizarAgora();
  }

  function parar() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    estado: () => ({ ...estado }),
    sincronizarAgora,
    bootstrap,
    iniciar,
    parar,
  };
}

module.exports = { criarSync, INTERVALO_MS };
