'use strict';

const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const { TABELAS, ORDEM_SYNC, def, sqlCriacao } = require('./esquema.cjs');

/**
 * Banco local (SQLite) do Ortus Desktop.
 *
 * Regras que este módulo garante:
 *  - toda escrita grava na tabela de domínio E na outbox de sincronização,
 *    na mesma transação (nenhum dado fica sem backup);
 *  - `updated_at` é sempre carimbado aqui, em ISO-8601 UTC, para o motor de
 *    sincronização resolver conflito por "quem é mais novo";
 *  - ids gerados localmente nunca colidem com os do Postgres: uuid v4 para
 *    chaves uuid e inteiros NEGATIVOS para chaves bigint (a sequence do
 *    Postgres só ocupa positivos).
 */

const TIPOS_SQL = {
  texto: 'TEXT',
  inteiro: 'INTEGER',
  real: 'REAL',
  data: 'TEXT',
  dia: 'TEXT',
  json: 'TEXT',
  bool: 'INTEGER',
};

const OPS_FILTRO = new Set(['eq', 'neq', 'in', 'is', 'notnull', 'gte', 'lte', 'gt', 'lt', 'like', 'ilike', 'or']);

function agoraISO() {
  return new Date().toISOString();
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Carimbo em milissegundos, ou `null`. Os carimbos chegam em dois formatos —
 * `…sssZ` (gravado aqui) e `…ssssss+00:00` (vindo do Postgres) — e comparar
 * os textos entre si erra dentro do mesmo milissegundo.
 */
function instante(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const ms = Date.parse(String(valor));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * ids de tabelas bigint criados neste computador.
 *
 * Precisam ser únicos entre MÁQUINAS diferentes que trabalham sem internet e
 * entre uma abertura do programa e a seguinte.
 * Layout: segundos desde 2020 × 2^20 + tag da máquina (12 bits) × 2^8 +
 * contador (8 bits), sempre negativo — a sequência do Postgres só ocupa
 * positivos.
 *
 * A conta é feita com multiplicação, não com `<<` e `|`: os operadores de bit
 * do JavaScript trabalham em 32 bits e cortavam os segundos, de modo que os
 * ids se repetiam a cada 68 minutos e, em metade do tempo, recomeçavam em -1 a
 * cada abertura do programa. O número cabe com folga no inteiro seguro do
 * JavaScript (2^53) e no bigint do Postgres.
 */
const EPOCA_DOS_IDS = Date.UTC(2020, 0, 1) / 1000;
let ultimoSegundo = 0;
let contadorNoSegundo = 0;
function novoId(tabela, tagMaquina = 0) {
  const t = def(tabela);
  if (t.pkTipo === 'uuid') return crypto.randomUUID();
  const agora = Math.floor(Date.now() / 1000) - EPOCA_DOS_IDS;
  if (agora > ultimoSegundo) {
    ultimoSegundo = agora;
    contadorNoSegundo = 0;
  } else {
    // Mesmo segundo, ou relógio do PC que voltou atrás: segue do último valor.
    contadorNoSegundo += 1;
    if (contadorNoSegundo > 0xff) {
      // Mais de 256 ids no mesmo segundo: adianta o relógio lógico em vez de
      // invadir os bits da tag da máquina.
      ultimoSegundo += 1;
      contadorNoSegundo = 0;
    }
  }
  return -(ultimoSegundo * 2 ** 20 + (tagMaquina & 0xfff) * 2 ** 8 + contadorNoSegundo);
}

/** Transforma o id da instalação em um número curto (12 bits). */
function tagDeInstalacao(instalacaoId) {
  let hash = 0;
  for (const caractere of String(instalacaoId || '')) {
    hash = ((hash << 5) - hash + caractere.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % 4096;
}

/** Converte um valor da API para o tipo físico do SQLite. */
function paraBanco(tipo, valor) {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  switch (tipo) {
    case 'json':
      if (typeof valor === 'string') return valor;
      return JSON.stringify(valor);
    case 'bool':
      return valor === true || valor === 1 || valor === 'true' || valor === '1' ? 1 : 0;
    case 'inteiro': {
      const n = Number(valor);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'real': {
      const n = Number(valor);
      return Number.isFinite(n) ? n : null;
    }
    case 'data': {
      const d = valor instanceof Date ? valor : new Date(String(valor));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'dia':
      return String(valor).slice(0, 10) || null;
    default:
      return String(valor);
  }
}

/** Converte um valor do SQLite para o tipo que a interface espera. */
function doBanco(tipo, valor) {
  if (valor === null || valor === undefined) return null;
  switch (tipo) {
    case 'json':
      try {
        return JSON.parse(valor);
      } catch {
        return null;
      }
    case 'bool':
      return valor === 1 || valor === '1' || valor === true;
    case 'inteiro':
      return Number(valor);
    case 'real':
      return Number(valor);
    default:
      return valor;
  }
}

function criarBanco(arquivo, opcoes = {}) {
  const tagMaquina = Number.isInteger(opcoes.maquinaTag)
    ? opcoes.maquinaTag
    : tagDeInstalacao(opcoes.instalacaoId);
  const db = new Database(arquivo);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = OFF');
  if (opcoes.somenteLeitura) db.pragma('query_only = ON');
  // LOWER() do SQLite só converte letras ASCII: 'Érica' não casava com 'érica'. A busca sem
  // maiúsculas (ilike) usa esta versão, que converte qualquer letra, como o ILIKE do Postgres.
  db.function('ortus_minusculas', { deterministic: true }, (valor) => (valor == null ? null : String(valor).toLowerCase()));

  migrar();
  const cacheComando = new Map();

  // ---------------------------------------------------------------- schema
  /**
   * `CREATE TABLE IF NOT EXISTS` não mexe em tabela que já existe. Num banco
   * criado por uma versão anterior do programa, a coluna nova precisa entrar
   * por `ALTER TABLE` — senão a primeira linha que a traz derruba o pull.
   */
  function garantirColunas(tabela, colunas) {
    const existentes = new Set(db.prepare(`PRAGMA table_info("${tabela}")`).all().map((c) => c.name));
    let acrescentou = false;
    for (const [coluna, tipoSql] of colunas) {
      if (existentes.has(coluna)) continue;
      db.exec(`ALTER TABLE "${tabela}" ADD COLUMN "${coluna}" ${tipoSql}`);
      acrescentou = true;
    }
    return acrescentou;
  }

  function migrar() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        seq         INTEGER PRIMARY KEY AUTOINCREMENT,
        tabela      TEXT NOT NULL,
        linha_id    TEXT NOT NULL,
        clinica_id  TEXT,
        op          TEXT NOT NULL,
        payload     TEXT,
        updated_at  TEXT NOT NULL,
        criado_em   TEXT NOT NULL,
        tentativas  INTEGER NOT NULL DEFAULT 0,
        ultimo_erro TEXT,
        base        TEXT
      );
      CREATE INDEX IF NOT EXISTS sync_outbox_ordem ON sync_outbox(seq);
      CREATE INDEX IF NOT EXISTS sync_outbox_linha ON sync_outbox(tabela, linha_id);

      CREATE TABLE IF NOT EXISTS sync_conflitos (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        tabela       TEXT NOT NULL,
        linha_id     TEXT NOT NULL,
        clinica_id   TEXT,
        versao_local TEXT,
        versao_remota TEXT,
        escolhido    TEXT NOT NULL,
        resolucao    TEXT NOT NULL DEFAULT 'auto',
        motivo       TEXT,
        detectado_em TEXT NOT NULL,
        resolvido_em TEXT
      );
      CREATE INDEX IF NOT EXISTS sync_conflitos_pendentes ON sync_conflitos(resolvido_em);

      CREATE TABLE IF NOT EXISTS sync_cursor (
        tabela  TEXT PRIMARY KEY,
        cursor  TEXT,
        posicao TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_tombstones (
        tabela      TEXT NOT NULL,
        linha_id    TEXT NOT NULL,
        excluido_em TEXT NOT NULL,
        PRIMARY KEY (tabela, linha_id)
      );

      CREATE TABLE IF NOT EXISTS sync_meta (
        chave TEXT PRIMARY KEY,
        valor TEXT
      );
    `);

    // Colunas de controle que versões anteriores não tinham.
    garantirColunas('sync_outbox', [['base', 'TEXT']]);
    garantirColunas('sync_cursor', [['posicao', 'TEXT']]);
    // Por que a nuvem recusou a escrita ('consulta', 'permissao', 'rejeitado').
    garantirColunas('sync_conflitos', [['motivo', 'TEXT']]);

    for (const tabela of ORDEM_SYNC) {
      db.exec(sqlCriacao(tabela));
      const t = def(tabela);
      const ganhouColuna = garantirColunas(
        tabela,
        Object.entries(t.colunas).map(([coluna, tipo]) => [coluna, TIPOS_SQL[tipo]]),
      );
      // As linhas já baixadas ficaram com a coluna nova vazia, e o pull
      // incremental só traz o que mudou depois: zera a posição para a tabela
      // descer inteira de novo no próximo ciclo.
      if (ganhouColuna) db.prepare('DELETE FROM sync_cursor WHERE tabela = ?').run(tabela);
      db.exec(`CREATE INDEX IF NOT EXISTS "${tabela}_updated" ON "${tabela}"(updated_at);`);
      if (t.clinicaCol) {
        db.exec(`CREATE INDEX IF NOT EXISTS "${tabela}_clinica" ON "${tabela}"(${t.clinicaCol});`);
      }
      const pai = t.pai;
      if (pai) {
        db.exec(`CREATE INDEX IF NOT EXISTS "${tabela}_pai" ON "${tabela}"(${pai.fk});`);
      }
    }
  }

  // ----------------------------------------------------------- conversões
  function paraLinha(tabela, objeto) {
    const t = def(tabela);
    const linha = {};
    for (const [coluna, tipo] of Object.entries(t.colunas)) {
      if (objeto[coluna] === undefined) continue;
      linha[coluna] = paraBanco(tipo, objeto[coluna]);
    }
    return linha;
  }

  function paraApi(tabela, linha) {
    if (!linha) return null;
    const t = def(tabela);
    const objeto = {};
    for (const [coluna, tipo] of Object.entries(t.colunas)) {
      objeto[coluna] = doBanco(tipo, linha[coluna]);
    }
    return objeto;
  }

  // --------------------------------------------------------------- queries
  function colunaValida(tabela, coluna) {
    const t = def(tabela);
    if (!(coluna in t.colunas)) throw new Error(`Coluna inválida em ${tabela}: ${coluna}`);
    return true;
  }

  function montarFiltros(tabela, filtros = []) {
    const partes = [];
    const valores = [];
    for (const filtro of filtros) {
      const { col, op, valor } = filtro || {};
      if (!op || !OPS_FILTRO.has(op)) continue;
      if (op === 'or') {
        const grupo = Array.isArray(valor) ? valor : [];
        const pedacos = [];
        for (const item of grupo) {
          const sub = montarFiltros(tabela, [item]);
          if (!sub.sql) continue;
          pedacos.push(sub.sql.replace(/^ WHERE /, ''));
          valores.push(...sub.valores);
        }
        if (pedacos.length) partes.push(`(${pedacos.join(' OR ')})`);
        continue;
      }
      if (!col) continue;
      colunaValida(tabela, col);
      const coluna = `"${col}"`;
      const tipo = def(tabela).colunas[col];
      switch (op) {
        case 'eq': {
          if (valor === null) {
            partes.push(`${coluna} IS NULL`);
          } else {
            partes.push(`${coluna} = ?`);
            valores.push(paraBanco(tipo, valor));
          }
          break;
        }
        case 'neq': {
          if (valor === null) {
            partes.push(`${coluna} IS NOT NULL`);
          } else {
            partes.push(`${coluna} <> ?`);
            valores.push(paraBanco(tipo, valor));
          }
          break;
        }
        case 'in': {
          const lista = Array.isArray(valor) ? valor : [];
          if (lista.length === 0) {
            partes.push('0 = 1');
            break;
          }
          if (lista.length > 900) throw new Error(`Lista grande demais em ${tabela}.${col} (${lista.length}).`);
          partes.push(`${coluna} IN (${lista.map(() => '?').join(', ')})`);
          for (const item of lista) valores.push(paraBanco(tipo, item));
          break;
        }
        case 'is':
          partes.push(valor === null ? `${coluna} IS NULL` : `${coluna} = ?`);
          if (valor !== null) valores.push(paraBanco(tipo, valor));
          break;
        case 'notnull':
          partes.push(`${coluna} IS NOT NULL`);
          break;
        case 'gte':
          partes.push(`${coluna} >= ?`);
          valores.push(paraBanco(tipo, valor));
          break;
        case 'lte':
          partes.push(`${coluna} <= ?`);
          valores.push(paraBanco(tipo, valor));
          break;
        case 'gt':
          partes.push(`${coluna} > ?`);
          valores.push(paraBanco(tipo, valor));
          break;
        case 'lt':
          partes.push(`${coluna} < ?`);
          valores.push(paraBanco(tipo, valor));
          break;
        case 'like':
          partes.push(`${coluna} LIKE ?`);
          valores.push(String(valor));
          break;
        case 'ilike':
          partes.push(`ortus_minusculas(${coluna}) LIKE ortus_minusculas(?)`);
          valores.push(String(valor));
          break;
        default:
          break;
      }
    }
    return { sql: partes.length ? ` WHERE ${partes.join(' AND ')}` : '', valores };
  }

  function montarOrdem(tabela, ordem = []) {
    if (!ordem.length) return '';
    const partes = ordem.map((item) => {
      colunaValida(tabela, item.col);
      return `"${item.col}" ${item.asc === false ? 'DESC' : 'ASC'}`;
    });
    return ` ORDER BY ${partes.join(', ')}`;
  }

  function consultar(tabela, opcoes = {}) {
    def(tabela);
    const chave = JSON.stringify(['s', tabela, opcoes]);
    let comando = cacheComando.get(chave);
    if (!comando) {
      const { sql, valores } = montarFiltros(tabela, opcoes.filtros);
      const ordem = montarOrdem(tabela, opcoes.ordem);
      let limite = '';
      if (Number.isInteger(opcoes.limite) && opcoes.limite > 0) {
        limite = ` LIMIT ${opcoes.limite}`;
        if (Number.isInteger(opcoes.offset) && opcoes.offset > 0) limite += ` OFFSET ${opcoes.offset}`;
      }
      const texto = `SELECT * FROM "${tabela}"${sql}${ordem}${limite}`;
      comando = { texto, valores };
      if (cacheComando.size > 300) cacheComando.clear();
      cacheComando.set(chave, comando);
    }
    const linhas = db.prepare(comando.texto).all(...comando.valores);
    return linhas.map((linha) => paraApi(tabela, linha));
  }

  function contar(tabela, opcoes = {}) {
    def(tabela);
    const { sql, valores } = montarFiltros(tabela, opcoes.filtros);
    const linha = db.prepare(`SELECT COUNT(*) AS total FROM "${tabela}"${sql}`).get(...valores);
    return Number(linha?.total || 0);
  }

  function obter(tabela, id) {
    const t = def(tabela);
    const linha = db.prepare(`SELECT * FROM "${tabela}" WHERE "${t.pk}" = ?`).get(paraBanco(t.colunas[t.pk], id));
    return paraApi(tabela, linha);
  }

  // ---------------------------------------------------------------- escrita
  function clinicDa(tabela, linhaApi) {
    const t = def(tabela);
    if (t.clinicaCol && linhaApi[t.clinicaCol] != null) return String(linhaApi[t.clinicaCol]);
    if (t.pai) {
      const paiApi = obter(t.pai.tabela, linhaApi[t.pai.fk]);
      const defPai = def(t.pai.tabela);
      if (paiApi && defPai.clinicaCol && paiApi[defPai.clinicaCol] != null) {
        return String(paiApi[defPai.clinicaCol]);
      }
    }
    return null;
  }

  /**
   * `base` é o carimbo da versão da nuvem sobre a qual a escrita foi feita.
   * É o que deixa o pull distinguir "a nuvem continua como eu a vi" (segue a
   * edição local) de "outro computador mexeu nesse meio tempo" (conflito).
   */
  function enfileirar({ tabela, linhaId, clinicaId, op, payload, updatedAt, base }) {
    db.prepare(`
      INSERT INTO sync_outbox (tabela, linha_id, clinica_id, op, payload, updated_at, criado_em, base)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tabela, String(linhaId), clinicaId ?? null, op, payload ?? null, updatedAt, agoraISO(), base ?? null);
  }

  /**
   * Base da próxima escrita na linha. Com edição já na fila, a base é a dela
   * (o `updated_at` local, nesse caso, é a hora do PC e não uma versão da
   * nuvem). Sem nada na fila, o `updated_at` local é o que o servidor carimbou.
   */
  function baseDaEscrita(tabela, linhaId, anterior) {
    const pendente = db
      .prepare('SELECT base FROM sync_outbox WHERE tabela = ? AND linha_id = ? ORDER BY seq DESC LIMIT 1')
      .get(tabela, String(linhaId));
    if (pendente) return pendente.base ?? null;
    return anterior?.updated_at ?? null;
  }

  /** O id já pertence a uma linha (ou a uma linha excluída) desta tabela? */
  function idEmUso(tabela, id) {
    const t = def(tabela);
    if (db.prepare(`SELECT 1 FROM "${tabela}" WHERE "${t.pk}" = ?`).get(paraBanco(t.colunas[t.pk], id))) return true;
    return Boolean(
      db.prepare('SELECT 1 FROM sync_tombstones WHERE tabela = ? AND linha_id = ?').get(tabela, String(id)),
    );
  }

  const gerar = (tabela, { dados, op }) => {
    const t = def(tabela);
    const agora = agoraISO();
    const entrada = { ...dados };
    let id = entrada[t.pk];
    if (id == null) {
      id = novoId(tabela, tagMaquina);
      // Relógio que voltou atrás ou programa reaberto no mesmo segundo: um id
      // já usado nunca é reaproveitado (o INSERT abaixo ignoraria a linha
      // nova e devolveria a antiga no lugar dela).
      while (t.pkTipo !== 'uuid' && idEmUso(tabela, id)) id = novoId(tabela, tagMaquina);
    }
    entrada[t.pk] = id;
    if ('created_at' in t.colunas && entrada.created_at == null) entrada.created_at = agora;
    if ('updated_at' in t.colunas) entrada.updated_at = agora;
    if ('criado_em' in t.colunas && entrada.criado_em == null) entrada.criado_em = agora;
    const linha = paraLinha(tabela, entrada);
    const colunas = Object.keys(linha);
    const sql = `INSERT INTO "${tabela}" (${colunas.map((c) => `"${c}"`).join(', ')})
                 VALUES (${colunas.map(() => '?').join(', ')})
                 ON CONFLICT("${t.pk}") DO ${op === 'upsert' ? `UPDATE SET ${colunas.filter((c) => c !== t.pk).map((c) => `"${c}" = excluded."${c}"`).join(', ')}` : 'NOTHING'}`;
    db.prepare(sql).run(...colunas.map((c) => linha[c]));
    return { id, linha: paraApi(tabela, { ...linha, [t.pk]: linha[t.pk] }) };
  };

  const atualizarLinha = (tabela, id, dados) => {
    const t = def(tabela);
    const atual = obter(tabela, id);
    if (!atual) return null;
    const agora = agoraISO();
    const linha = paraLinha(tabela, dados);
    if ('updated_at' in t.colunas) linha.updated_at = agora;
    const colunas = Object.keys(linha).filter((c) => c !== t.pk);
    if (!colunas.length) return atual;
    db.prepare(`UPDATE "${tabela}" SET ${colunas.map((c) => `"${c}" = ?`).join(', ')} WHERE "${t.pk}" = ?`)
      .run(...colunas.map((c) => linha[c]), paraBanco(t.colunas[t.pk], id));
    // Relê a linha inteira. Montar a resposta a partir de `paraApi(linha)`
    // devolvia `null` em toda coluna que não estava sendo alterada — inclusive
    // o id —, e era esse objeto que ia para a tela e para a fila de envio.
    return obter(tabela, id);
  };

  const removerLinha = (tabela, id) => {
    const t = def(tabela);
    const atual = obter(tabela, id);
    if (!atual) return null;
    db.prepare(`DELETE FROM "${tabela}" WHERE "${t.pk}" = ?`).run(paraBanco(t.colunas[t.pk], id));
    return atual;
  };

  /**
   * Ponto único de escrita. Sempre dentro de uma transação que grava a linha
   * e a entrada da outbox juntas.
   */
  const gravar = db.transaction((tabela, operacao, dados = {}, id) => {
    def(tabela);
    const t = def(tabela);
    let linhaApi = null;
    let op = operacao;
    let linhaId = id ?? dados[t.pk];
    // Antes de gravar: depois, o `updated_at` da linha já é a hora deste PC.
    const anterior = linhaId != null ? obter(tabela, linhaId) : null;
    const base = linhaId != null ? baseDaEscrita(tabela, linhaId, anterior) : null;

    if (op === 'delete') {
      if (linhaId == null) throw new Error('Excluir exige id.');
      linhaApi = removerLinha(tabela, linhaId);
      if (!linhaApi) return null;
      linhaId = linhaApi[t.pk];
      const clinicaId = clinicDa(tabela, linhaApi);
      const agora = agoraISO();
      // Túmulo local: impede que esta máquina "ressuscite" a linha ao aplicar
      // um pull antigo de outra máquina.
      registrarTumulo(tabela, linhaId, agora);
      if (!t.semFila) {
        enfileirar({ tabela, linhaId, clinicaId, op: 'delete', payload: null, updatedAt: agora, base });
      }
      return linhaApi;
    }

    if (op === 'update' || (op === 'upsert' && linhaId != null && anterior)) {
      if (linhaId == null) throw new Error('Atualizar exige id.');
      linhaApi = atualizarLinha(tabela, linhaId, dados);
      if (!linhaApi) return null;
      op = 'update';
    } else if (op === 'insert' || op === 'upsert') {
      const criada = gerar(tabela, { dados, op: 'insert' });
      linhaId = criada.id;
      linhaApi = obter(tabela, linhaId);
      op = 'insert';
    } else {
      throw new Error(`Operação inválida: ${operacao}`);
    }

    const clinicaId = clinicDa(tabela, linhaApi);
    if (!t.semFila) {
      enfileirar({
        tabela,
        linhaId,
        clinicaId,
        op,
        payload: JSON.stringify(linhaApi),
        updatedAt: linhaApi.updated_at || agoraISO(),
        base,
      });
    }
    return linhaApi;
  });

  // ------------------------------------------------------------- túmulos
  const registrarTumulo = (tabela, linhaId, quando) => {
    db.prepare(`
      INSERT INTO sync_tombstones (tabela, linha_id, excluido_em) VALUES (?, ?, ?)
      ON CONFLICT(tabela, linha_id) DO UPDATE SET excluido_em = MAX(excluido_em, excluded.excluido_em)
    `).run(String(tabela), String(linhaId), String(quando || agoraISO()));
  };

  const tumuloDe = (tabela, linhaId) => db
    .prepare('SELECT excluido_em FROM sync_tombstones WHERE tabela = ? AND linha_id = ?')
    .get(String(tabela), String(linhaId))?.excluido_em || null;

  const removerTumulo = (tabela, linhaId) => {
    db.prepare('DELETE FROM sync_tombstones WHERE tabela = ? AND linha_id = ?').run(String(tabela), String(linhaId));
  };

  /**
   * Exclusão vinda de outra máquina. Se a linha local foi editada DEPOIS do
   * túmulo, a edição é mais nova e prevalece (o conflito aparece na tela).
   * Caso contrário, apaga.
   */
  const aplicarTumulo = db.transaction((tabela, linhaId, quando) => {
    const t = def(tabela);
    const local = obter(tabela, linhaId);
    // Só é conflito quando havia trabalho local ainda não enviado. Exclusão
    // feita em outro computador sobre uma linha intocada aqui é o caso normal
    // e não pede decisão de ninguém.
    const tinhaPendencia = temPendencia(tabela, linhaId);
    const conflito = (escolhido) => registrarConflito({
      tabela,
      linhaId,
      clinicaId: local[t.clinicaCol || 'clinica_id'] ?? null,
      versaoLocal: local,
      versaoRemota: null,
      escolhido,
    });

    const localMs = instante(local?.updated_at);
    const quandoMs = instante(quando);
    if (local && localMs != null && quandoMs != null && localMs > quandoMs) {
      // A edição daqui é mais nova que a exclusão: fica, e sobe no próximo envio.
      if (tinhaPendencia) conflito('local');
      return { apagou: false, motivo: 'edicao-local-mais-nova' };
    }
    removerLinha(tabela, linhaId);
    registrarTumulo(tabela, linhaId, quando);
    // Escrita local pendente para essa linha perdeu: sai da fila, mas a
    // versão fica guardada no conflito.
    db.prepare('DELETE FROM sync_outbox WHERE tabela = ? AND linha_id = ?').run(String(tabela), String(linhaId));
    if (local && tinhaPendencia) conflito('remoto');
    return { apagou: Boolean(local), motivo: 'excluido' };
  });

  /** Aplicar uma linha vinda da nuvem (não gera outbox). */
  const aplicarRemoto = db.transaction((tabela, linha) => {
    const t = def(tabela);
    const copia = { ...linha };
    if (copia[t.pk] == null) return null;

    // Nunca ressuscita o que já foi excluído (aqui ou em outra máquina).
    const tumulo = tumuloDe(tabela, copia[t.pk]);
    if (tumulo) {
      const linhaMs = instante(copia.updated_at);
      const tumuloMs = instante(tumulo);
      if (linhaMs == null || tumuloMs == null || linhaMs <= tumuloMs) return null;
    }
    if ('updated_at' in t.colunas && copia.updated_at == null) copia.updated_at = agoraISO();
    const fisica = paraLinha(tabela, copia);
    const colunas = Object.keys(fisica);
    db.prepare(`
      INSERT INTO "${tabela}" (${colunas.map((c) => `"${c}"`).join(', ')})
      VALUES (${colunas.map(() => '?').join(', ')})
      ON CONFLICT("${t.pk}") DO UPDATE SET ${colunas.filter((c) => c !== t.pk).map((c) => `"${c}" = excluded."${c}"`).join(', ')}
    `).run(...colunas.map((c) => fisica[c]));
    return paraApi(tabela, fisica);
  });

  const removerRemoto = (tabela, id) => {
    const t = def(tabela);
    db.prepare(`DELETE FROM "${tabela}" WHERE "${t.pk}" = ?`).run(paraBanco(t.colunas[t.pk], id));
  };

  // ------------------------------------------------------------------ meta
  const obterMeta = (chave) => {
    const linha = db.prepare('SELECT valor FROM sync_meta WHERE chave = ?').get(String(chave));
    return linha ? linha.valor : null;
  };
  const definirMeta = (chave, valor) => {
    if (valor === null || valor === undefined) {
      db.prepare('DELETE FROM sync_meta WHERE chave = ?').run(String(chave));
      return;
    }
    db.prepare(`
      INSERT INTO sync_meta (chave, valor) VALUES (?, ?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
    `).run(String(chave), String(valor));
  };

  const obterCursor = (tabela) => {
    const linha = db.prepare('SELECT cursor FROM sync_cursor WHERE tabela = ?').get(String(tabela));
    return linha ? linha.cursor : null;
  };
  const definirCursor = (tabela, cursor) => {
    db.prepare(`
      INSERT INTO sync_cursor (tabela, cursor) VALUES (?, ?)
      ON CONFLICT(tabela) DO UPDATE SET cursor = excluded.cursor
    `).run(String(tabela), String(cursor));
  };

  /**
   * Posição do pull: carimbo E chave da última linha lida.
   *
   * Só o carimbo não basta, porque muitas linhas podem ter o mesmo (todas as
   * que já existiam quando a coluna `updated_at` foi criada, por exemplo).
   * `cursor` continua gravado com o carimbo para uma versão anterior do
   * programa conseguir ler o banco; se ela mexer no cursor, a posição deixa
   * de valer e a leitura recomeça do carimbo, incluindo-o.
   */
  const obterPosicao = (tabela) => {
    const linha = db.prepare('SELECT cursor, posicao FROM sync_cursor WHERE tabela = ?').get(String(tabela));
    if (!linha || !linha.cursor) return null;
    try {
      const posicao = linha.posicao ? JSON.parse(linha.posicao) : null;
      if (posicao && posicao.t === linha.cursor && posicao.id != null) return { t: posicao.t, id: posicao.id };
    } catch {
      /* posição ilegível: vale o cursor */
    }
    return { t: linha.cursor, id: null };
  };
  const definirPosicao = (tabela, posicao) => {
    db.prepare(`
      INSERT INTO sync_cursor (tabela, cursor, posicao) VALUES (?, ?, ?)
      ON CONFLICT(tabela) DO UPDATE SET cursor = excluded.cursor, posicao = excluded.posicao
    `).run(String(tabela), String(posicao.t), JSON.stringify({ t: String(posicao.t), id: posicao.id }));
  };
  const limparPosicoes = () => {
    db.prepare('DELETE FROM sync_cursor').run();
  };

  // --------------------------------------------------------------- outbox
  const proximosOutbox = (limite = 50) => db
    .prepare('SELECT * FROM sync_outbox ORDER BY seq ASC LIMIT ?')
    .all(Math.max(1, Math.min(500, limite)));

  const removerOutbox = (seqs) => {
    if (!seqs.length) return;
    const stmt = db.prepare('DELETE FROM sync_outbox WHERE seq = ?');
    const remover = db.transaction((lista) => lista.forEach((seq) => stmt.run(seq)));
    remover(seqs);
  };

  const marcarErroOutbox = (seq, erro) => {
    db.prepare('UPDATE sync_outbox SET tentativas = tentativas + 1, ultimo_erro = ? WHERE seq = ?')
      .run(String(erro || '').slice(0, 500), seq);
  };

  const contarOutbox = () => Number(db.prepare('SELECT COUNT(*) AS total FROM sync_outbox').get()?.total || 0);

  /** Existe alteração local pendente para esta linha? */
  const temPendencia = (tabela, linhaId) => Boolean(
    db.prepare('SELECT 1 FROM sync_outbox WHERE tabela = ? AND linha_id = ? LIMIT 1')
      .get(tabela, String(linhaId)),
  );

  /** As escritas da linha que ainda não subiram, da mais antiga para a mais nova. */
  const pendenciasDe = (tabela, linhaId) => db
    .prepare('SELECT seq, op, payload, updated_at, base FROM sync_outbox WHERE tabela = ? AND linha_id = ? ORDER BY seq ASC')
    .all(tabela, String(linhaId));

  /** Ficou alguma escrita na fila para esta linha depois da entrada `seq`? */
  const temPendenciaDepois = (tabela, linhaId, seq) => Boolean(
    db.prepare('SELECT 1 FROM sync_outbox WHERE tabela = ? AND linha_id = ? AND seq > ? LIMIT 1')
      .get(tabela, String(linhaId), Number(seq)),
  );

  /** As pendências da linha passam a se apoiar nesta versão da nuvem. */
  const definirBaseDaPendencia = (tabela, linhaId, base) => {
    db.prepare('UPDATE sync_outbox SET base = ? WHERE tabela = ? AND linha_id = ?')
      .run(base == null ? null : String(base), tabela, String(linhaId));
  };

  const descartarPendencias = (tabela, linhaId) => {
    db.prepare('DELETE FROM sync_outbox WHERE tabela = ? AND linha_id = ?').run(tabela, String(linhaId));
  };

  // ------------------------------------------------------------ conflitos
  const registrarConflito = ({ tabela, linhaId, clinicaId, versaoLocal, versaoRemota, escolhido, resolucao = 'auto', motivo = null }) => {
    db.prepare(`
      INSERT INTO sync_conflitos (tabela, linha_id, clinica_id, versao_local, versao_remota, escolhido, resolucao, motivo, detectado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tabela,
      String(linhaId),
      clinicaId ?? null,
      JSON.stringify(versaoLocal ?? null),
      JSON.stringify(versaoRemota ?? null),
      escolhido,
      resolucao,
      motivo ?? null,
      agoraISO(),
    );
  };

  const listarConflitos = (opcoes = {}) => {
    const somentePendentes = opcoes.pendentes !== false;
    const sql = somentePendentes
      ? 'SELECT * FROM sync_conflitos WHERE resolvido_em IS NULL ORDER BY detectado_em DESC LIMIT ?'
      : 'SELECT * FROM sync_conflitos ORDER BY detectado_em DESC LIMIT ?';
    return db.prepare(sql).all(opcoes.limite || 200).map((linha) => ({
      ...linha,
      versao_local: linha.versao_local ? JSON.parse(linha.versao_local) : null,
      versao_remota: linha.versao_remota ? JSON.parse(linha.versao_remota) : null,
    }));
  };

  /**
   * A pessoa escolheu qual versão fica. A escolha é gravada aqui e sobe para
   * a nuvem, qualquer que tenha sido o vencedor automático — é assim que os
   * outros computadores recebem a decisão. Um lado sem versão significa
   * "excluído": escolhê-lo exclui o registro.
   */
  const resolverConflito = db.transaction((id, escolha) => {
    const conflito = db.prepare('SELECT * FROM sync_conflitos WHERE id = ?').get(Number(id));
    if (!conflito) throw new Error('Conflito não encontrado.');
    if (conflito.resolvido_em) return true;

    const tabela = conflito.tabela;
    const t = def(tabela);
    const ler = (texto) => {
      try {
        return texto ? JSON.parse(texto) : null;
      } catch {
        return null;
      }
    };
    const local = ler(conflito.versao_local);
    const remota = ler(conflito.versao_remota);
    const escolhida = escolha === 'local' ? local : remota;
    const linhaId = (local || remota)?.[t.pk] ?? conflito.linha_id;
    // A decisão se apoia na versão da nuvem que este computador conhece AGORA
    // (pode ser mais nova que a do conflito, se a linha já foi enviada ou
    // recebida depois dele).
    const baseNova = baseDaEscrita(tabela, linhaId, obter(tabela, linhaId));
    // A nuvem recusou a escrita daqui e não sabemos o que ela guarda.
    const recusado = conflito.resolucao === 'recusado';

    descartarPendencias(tabela, linhaId);

    if (escolhida) {
      // A decisão de quem resolve vale mais que uma exclusão anterior.
      removerTumulo(tabela, linhaId);
      gravar(tabela, 'upsert', escolhida, linhaId);
      definirBaseDaPendencia(tabela, linhaId, baseNova);
    } else if (recusado && escolha === 'remoto') {
      // Desiste do que foi recusado: tira a linha daqui e baixa a tabela de
      // novo, para ficar igual ao que a nuvem tiver.
      removerTumulo(tabela, linhaId);
      removerLinha(tabela, linhaId);
      db.prepare('DELETE FROM sync_cursor WHERE tabela = ?').run(tabela);
    } else {
      removerLinha(tabela, linhaId);
      const agora = agoraISO();
      registrarTumulo(tabela, linhaId, agora);
      if (!t.semFila) {
        enfileirar({ tabela, linhaId, clinicaId: conflito.clinica_id, op: 'delete', payload: null, updatedAt: agora, base: baseNova });
      }
    }

    db.prepare("UPDATE sync_conflitos SET resolvido_em = ?, resolucao = 'manual' WHERE id = ?").run(agoraISO(), Number(id));
    return true;
  });

  const contarConflitosPendentes = () => Number(
    db.prepare('SELECT COUNT(*) AS total FROM sync_conflitos WHERE resolvido_em IS NULL').get()?.total || 0,
  );

  // ------------------------------------------------------------- utilidades
  const estatisticas = () => ({
    tabelas: Object.fromEntries(ORDEM_SYNC.map((tabela) => [tabela, contar(tabela)])),
    outbox: contarOutbox(),
    conflitos: contarConflitosPendentes(),
    caminho: arquivo,
  });

  const fechar = () => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      /* ignora */
    }
    db.close();
  };

  /** Roda `trabalho` numa transação só (tudo ou nada). Pode ser aninhada. */
  const emTransacao = (trabalho) => db.transaction(trabalho)();

  return {
    bruto: db,
    arquivo,
    emTransacao,
    // leitura
    consultar,
    contar,
    obter,
    // escrita
    gravar,
    aplicarRemoto,
    removerRemoto,
    // meta / cursor
    obterMeta,
    definirMeta,
    obterCursor,
    definirCursor,
    obterPosicao,
    definirPosicao,
    limparPosicoes,
    // outbox
    proximosOutbox,
    removerOutbox,
    marcarErroOutbox,
    contarOutbox,
    temPendencia,
    pendenciasDe,
    temPendenciaDepois,
    definirBaseDaPendencia,
    descartarPendencias,
    enfileirar,
    // túmulos (exclusões compartilhadas)
    registrarTumulo,
    tumuloDe,
    removerTumulo,
    aplicarTumulo,
    // conflitos
    registrarConflito,
    listarConflitos,
    resolverConflito,
    contarConflitosPendentes,
    // utilidades
    estatisticas,
    fechar,
    paraApi,
    paraLinha,
    tagMaquina,
    agoraISO,
    hojeISO,
    novoId,
  };
}

module.exports = { criarBanco, paraBanco, doBanco, agoraISO, hojeISO, novoId, instante, TIPOS_SQL, TABELAS };
