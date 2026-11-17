'use strict';

const { ORDEM_SYNC, def } = require('./esquema.cjs');
const log = require('./log.cjs');

/**
 * Motor de sincronização (processo principal do Electron).
 *
 * Modelo: o SQLite é a verdade local e a nuvem é o backup.
 *
 *  - PUSH: cada escrita local vira uma linha na outbox. A cada ciclo a outbox
 *    é esvaziada em ordem (tabela pai antes da filha), com upsert idempotente
 *    no PostgREST usando o JWT do usuário — nunca service role.
 *  - PULL: desde o último cursor de cada tabela, baixa o que chegou de outro
 *    computador e aplica no SQLite.
 *  - CONFLITO: se o pull traz uma linha que também está na outbox, vence o
 *    `updated_at` mais novo e a versão perdedora vai para `sync_conflitos`.
 *  - SEM REDE: nada é descartado; a outbox fica no SQLite e o ciclo recomeça
 *    sozinho quando a conexão volta.
 */

const INTERVALO_MS = 5_000;
const LOTE_PUSH = 80;
const PAGINA_PULL = 500;
const MAX_TENTATIVAS = 12;

const RANK = Object.fromEntries(ORDEM_SYNC.map((tabela, indice) => [tabela, indice]));

function agoraISO() {
  return new Date().toISOString();
}

function maisNovo(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return a >= b ? a : b;
}

function criarSync({ banco, obterConfig, obterSessao, definirSessao, aoMudarEstado }) {
  let timer = null;
  let rodando = false;
  let emCiclo = false;

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
  function cabecalhos(sessao) {
    const { anonKey } = obterConfig();
    return {
      apikey: anonKey,
      Authorization: `Bearer ${sessao.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  async function renovarSessao(sessao) {
    const { url, anonKey } = obterConfig();
    if (!sessao?.refresh_token) return null;
    const resposta = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: sessao.refresh_token }),
    });
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
      const resposta = await fetch(
        `${url}/rest/v1/${tabela}?${encodeURIComponent(t.pk)}=eq.${encodeURIComponent(item.linha_id)}`,
        { method: 'DELETE', headers: { ...cabecalhos(sessao), Prefer: 'return=minimal' } },
      );
      if (!resposta.ok && resposta.status !== 404) {
        throw Object.assign(new Error(`delete ${tabela}: ${resposta.status} ${(await resposta.text()).slice(0, 200)}`), {
          status: resposta.status,
        });
      }
      return;
    }

    const payload = item.payload ? JSON.parse(item.payload) : null;
    if (!payload) return;

    const resposta = await fetch(`${url}/rest/v1/${tabela}`, {
      method: 'POST',
      headers: {
        ...cabecalhos(sessao),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([payload]),
    });
    if (!resposta.ok) {
      const texto = (await resposta.text()).slice(0, 300);
      throw Object.assign(new Error(`upsert ${tabela}: ${resposta.status} ${texto}`), { status: resposta.status });
    }
  }

  async function empurrar(sessao) {
    let enviados = 0;
    let tentativaExtra = 0;

    while (enviados < LOTE_PUSH) {
      const pendentes = consolidarOutbox();
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
          if (status === 403 || status === 409 || status === 400) {
            // RLS/constraint: não adianta repetir. Registra e libera a fila.
            banco.marcarErroOutbox(item.seq, err.message);
            const tentativas = Number(banco.bruto.prepare('SELECT tentativas FROM sync_outbox WHERE seq = ?').get(item.seq)?.tentativas || 0);
            if (tentativas >= MAX_TENTATIVAS) {
              banco.registrarConflito({
                tabela: item.tabela,
                linhaId: item.linha_id,
                clinicaId: item.clinica_id,
                versaoLocal: item.payload ? JSON.parse(item.payload) : null,
                versaoRemota: null,
                escolhido: 'local',
                resolucao: 'auto',
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
  async function puxarTabela(sessao, tabela) {
    const { url } = obterConfig();
    const t = def(tabela);
    let cursor = banco.obterCursor(tabela);
    let aplicados = 0;
    let conflitos = 0;

    for (let volta = 0; volta < 200; volta += 1) {
      const filtro = cursor ? `&updated_at=gte.${encodeURIComponent(cursor)}` : '';
      const resposta = await fetch(
        `${url}/rest/v1/${tabela}?select=*${filtro}&order=updated_at.asc&limit=${PAGINA_PULL}`,
        { headers: cabecalhos(sessao) },
      );

      if (resposta.status === 401) return { aplicados, conflitos, parado: 'sessao' };
      if (!resposta.ok) {
        const texto = (await resposta.text()).slice(0, 200);
        throw Object.assign(new Error(`pull ${tabela}: ${resposta.status} ${texto}`), { status: resposta.status });
      }

      const linhas = await resposta.json();
      if (!Array.isArray(linhas) || linhas.length === 0) break;

      let maior = cursor;
      for (const linha of linhas) {
        const remotoUpdated = linha.updated_at || null;
        maior = maisNovo(maior, remotoUpdated);

        const linhaId = linha[t.pk];
        if (linhaId == null) continue;

        if (banco.temPendencia(tabela, linhaId)) {
          const local = banco.obter(tabela, linhaId);
          const localUpdated = local?.updated_at || null;
          const venceuLocal = localUpdated && remotoUpdated ? localUpdated >= remotoUpdated : Boolean(localUpdated);

          banco.registrarConflito({
            tabela,
            linhaId,
            clinicaId: linha[t.clinicaCol || 'clinica_id'] ?? null,
            versaoLocal: local,
            versaoRemota: linha,
            escolhido: venceuLocal ? 'local' : 'remoto',
          });
          conflitos += 1;

          if (venceuLocal) {
            // Mantém a versão local; ela já está na outbox e será enviada.
            continue;
          }
          // Remoto é mais novo: aplica e descarta a escrita local antiga.
          banco.bruto
            .prepare('DELETE FROM sync_outbox WHERE tabela = ? AND linha_id = ? AND updated_at <= ?')
            .run(tabela, String(linhaId), remotoUpdated);
          if (banco.temPendencia(tabela, linhaId)) continue; // ainda há algo mais novo local
        }

        banco.aplicarRemoto(tabela, linha);
        aplicados += 1;
      }

      if (linhas.length < PAGINA_PULL) {
        if (maior) banco.definirCursor(tabela, maior);
        break;
      }

      if (!maior || maior === cursor) {
        // Página cheia sem avanço de tempo: empurra 1ms para não travar.
        const proximo = new Date(new Date(cursor || agoraISO()).getTime() + 1).toISOString();
        banco.definirCursor(tabela, proximo);
        cursor = proximo;
      } else {
        banco.definirCursor(tabela, maior);
        cursor = maior;
      }
    }

    return { aplicados, conflitos, parado: null };
  }

  async function puxar(sessao) {
    let aplicados = 0;
    let conflitos = 0;
    for (const tabela of ORDEM_SYNC) {
      const resultado = await puxarTabela(sessao, tabela);
      aplicados += resultado.aplicados;
      conflitos += resultado.conflitos;
      if (resultado.parado === 'sessao') return { aplicados, conflitos, parado: 'sessao' };
    }
    return { aplicados, conflitos, parado: null };
  }

  // --------------------------------------------------------------- bootstrap
  async function bootstrap() {
    if (rodando) return { ok: false, motivo: 'ocupado' };
    rodando = true;
    try {
      const sessao = await sessaoAtual();
      if (!sessao) {
        publicar({ estado: 'login', online: null });
        return { ok: false, motivo: 'sem-sessao' };
      }
      const { url } = obterConfig();
      publicar({ estado: 'sincronizando', online: true });

      // Primeiro limpa cursores: baixamos tudo desde o início.
      banco.bruto.prepare('DELETE FROM sync_cursor').run();

      let total = 0;
      for (const tabela of ORDEM_SYNC) {
        const t = def(tabela);
        let cursor = null;
        for (;;) {
          const filtro = cursor ? `&updated_at=gte.${encodeURIComponent(cursor)}` : '';
          const resposta = await fetch(
            `${url}/rest/v1/${tabela}?select=*${filtro}&order=updated_at.asc&limit=${PAGINA_PULL}`,
            { headers: cabecalhos(sessao) },
          );
          if (!resposta.ok) {
            throw new Error(`bootstrap ${tabela}: ${resposta.status} ${(await resposta.text()).slice(0, 200)}`);
          }
          const linhas = await resposta.json();
          if (!Array.isArray(linhas) || linhas.length === 0) break;
          for (const linha of linhas) {
            if (linha[t.pk] == null) continue;
            banco.aplicarRemoto(tabela, linha);
            cursor = maisNovo(cursor, linha.updated_at || null);
            total += 1;
          }
          if (cursor) banco.definirCursor(tabela, cursor);
          if (linhas.length < PAGINA_PULL) break;
          if (!cursor) cursor = agoraISO();
        }
      }

      banco.definirMeta('bootstrap_completo', '1');
      banco.definirMeta('bootstrap_em', agoraISO());
      banco.definirMeta('bootstrap_usuario', sessao.user?.id || '');
      atualizarContadores();
      publicar({ estado: 'sincronizado', online: true, bootstrap: true, ultimoEnvioOk: agoraISO() });
      banco.definirMeta('ultimo_envio_ok', estado.ultimoEnvioOk);
      log.info(`sync: bootstrap concluído (${total} linhas)`);
      return { ok: true, linhas: total };
    } catch (err) {
      log.erro('sync: falha no bootstrap', err);
      publicar({ estado: 'erro', online: false, ultimoErro: err instanceof Error ? err.message : String(err) });
      return { ok: false, motivo: err instanceof Error ? err.message : 'erro' };
    } finally {
      rodando = false;
      atualizarContadores();
    }
  }

  // ------------------------------------------------------------------ ciclo
  async function sincronizarAgora() {
    if (emCiclo) return { ...estado };
    emCiclo = true;
    estado.ultimaTentativa = agoraISO();
    try {
      const sessao = await sessaoAtual();
      if (!sessao) {
        publicar({ estado: 'login', online: null });
        atualizarContadores();
        return { ...estado };
      }

      if (banco.obterMeta('bootstrap_completo') !== '1') {
        emCiclo = false;
        await bootstrap();
        return { ...estado };
      }

      publicar({ estado: 'sincronizando', online: true, ultimoErro: null });

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
      if (push.parado === 'servidor') {
        publicar({ estado: 'erro', online: true, ultimoErro: push.erro || null });
        atualizarContadores();
        return { ...estado };
      }

      const pull = await puxar(sessao);
      if (pull.parado === 'sessao') {
        publicar({ estado: 'login', online: true });
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
      const semRede = err instanceof TypeError || /fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(String(err?.message || ''));
      log.aviso('sync: ciclo com erro', err instanceof Error ? err.message : err);
      publicar({
        estado: semRede ? 'offline' : 'erro',
        online: !semRede,
        ultimoErro: err instanceof Error ? err.message : String(err),
      });
      atualizarContadores();
      return { ...estado };
    } finally {
      emCiclo = false;
    }
  }

  function iniciar() {
    atualizarContadores();
    publicar({});
    if (timer) return;
    timer = setInterval(() => {
      void sincronizarAgora();
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
