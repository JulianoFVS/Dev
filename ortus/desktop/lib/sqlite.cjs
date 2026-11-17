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
 * ids de tabelas bigint criados offline.
 *
 * Precisam ser únicos entre MÁQUINAS diferentes que trabalham sem internet.
 * Layout: segundos desde 2020 (28 bits) << 20 | tag da máquina (12 bits) << 8
 * | contador. Assim duas máquinas nunca geram o mesmo número, e a sequência do
 * Postgres (só positivos) também nunca colide.
 */
let contadorLocal = 0;
function novoId(tabela, tagMaquina = 0) {
  const t = def(tabela);
  if (t.pkTipo === 'uuid') return crypto.randomUUID();
  const base = (Math.floor(Date.now() / 1000) << 20) | ((tagMaquina & 0xfff) << 8);
  contadorLocal = Math.max(base, contadorLocal + 1);
  return -contadorLocal;
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

  migrar();
  const cacheComando = new Map();

  // ---------------------------------------------------------------- schema
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
        ultimo_erro TEXT
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
        detectado_em TEXT NOT NULL,
        resolvido_em TEXT
      );
      CREATE INDEX IF NOT EXISTS sync_conflitos_pendentes ON sync_conflitos(resolvido_em);

      CREATE TABLE IF NOT EXISTS sync_cursor (
        tabela TEXT PRIMARY KEY,
        cursor TEXT
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

    for (const tabela of ORDEM_SYNC) {
      db.exec(sqlCriacao(tabela));
      const t = def(tabela);
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
          partes.push(`LOWER(${coluna}) LIKE LOWER(?)`);
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

  function enfileirar({ tabela, linhaId, clinicaId, op, payload, updatedAt }) {
    db.prepare(`
      INSERT INTO sync_outbox (tabela, linha_id, clinica_id, op, payload, updated_at, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(tabela, String(linhaId), clinicaId ?? null, op, payload ?? null, updatedAt, agoraISO());
  }

  const gerar = (tabela, { dados, op }) => {
    const t = def(tabela);
    const agora = agoraISO();
    const entrada = { ...dados };
    const id = entrada[t.pk] ?? novoId(tabela, tagMaquina);
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
    const entrada = { ...atual, ...dados };
    if ('updated_at' in t.colunas) entrada.updated_at = agora;
    const linha = paraLinha(tabela, dados);
    if ('updated_at' in t.colunas) linha.updated_at = agora;
    const colunas = Object.keys(linha).filter((c) => c !== t.pk);
    if (!colunas.length) return atual;
    db.prepare(`UPDATE "${tabela}" SET ${colunas.map((c) => `"${c}" = ?`).join(', ')} WHERE "${t.pk}" = ?`)
      .run(...colunas.map((c) => linha[c]), paraBanco(t.colunas[t.pk], id));
    return { ...entrada, ...paraApi(tabela, linha), updated_at: 'updated_at' in t.colunas ? agora : entrada.updated_at };
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
        enfileirar({ tabela, linhaId, clinicaId, op: 'delete', payload: null, updatedAt: agora });
      }
      return linhaApi;
    }

    if (op === 'update' || (op === 'upsert' && linhaId != null && obter(tabela, linhaId))) {
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
    const localUpdated = local?.updated_at || null;
    if (local && localUpdated && localUpdated > quando) {
      return { apagou: false, motivo: 'edicao-local-mais-nova' };
    }
    removerLinha(tabela, linhaId);
    registrarTumulo(tabela, linhaId, quando);
    // Escrita local pendente para essa linha perdeu: descarta.
    db.prepare('DELETE FROM sync_outbox WHERE tabela = ? AND linha_id = ?').run(String(tabela), String(linhaId));
    if (local) {
      registrarConflito({
        tabela,
        linhaId,
        clinicaId: local[t.clinicaCol || 'clinica_id'] ?? null,
        versaoLocal: local,
        versaoRemota: null,
        escolhido: 'remoto',
      });
    }
    void t;
    return { apagou: Boolean(local), motivo: 'excluido' };
  });

  /** Aplicar uma linha vinda da nuvem (não gera outbox). */
  const aplicarRemoto = db.transaction((tabela, linha) => {
    const t = def(tabela);
    const copia = { ...linha };
    if (copia[t.pk] == null) return null;

    // Nunca ressuscita o que já foi excluído (aqui ou em outra máquina).
    const tumulo = tumuloDe(tabela, copia[t.pk]);
    if (tumulo && (!copia.updated_at || String(copia.updated_at) <= tumulo)) {
      return null;
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

  // ------------------------------------------------------------ conflitos
  const registrarConflito = ({ tabela, linhaId, clinicaId, versaoLocal, versaoRemota, escolhido, resolucao = 'auto' }) => {
    db.prepare(`
      INSERT INTO sync_conflitos (tabela, linha_id, clinica_id, versao_local, versao_remota, escolhido, resolucao, detectado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tabela,
      String(linhaId),
      clinicaId ?? null,
      JSON.stringify(versaoLocal ?? null),
      JSON.stringify(versaoRemota ?? null),
      escolhido,
      resolucao,
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

  const resolverConflito = (id, escolha) => {
    const conflito = db.prepare('SELECT * FROM sync_conflitos WHERE id = ?').get(Number(id));
    if (!conflito) throw new Error('Conflito não encontrado.');
    const payload = escolha === 'local' ? conflito.versao_local : conflito.versao_remota;
    if (payload) {
      const linha = typeof payload === 'string' ? JSON.parse(payload) : payload;
      aplicarRemoto(conflito.tabela, linha);
      if (escolha === 'local') {
        // Reenvia a versão local para a nuvem.
        const t = def(conflito.tabela);
        enfileirar({
          tabela: conflito.tabela,
          linhaId: linha[t.pk],
          clinicaId: conflito.clinica_id,
          op: 'upsert',
          payload: JSON.stringify(linha),
          updatedAt: linha.updated_at || agoraISO(),
        });
      }
    }
    db.prepare("UPDATE sync_conflitos SET resolvido_em = ?, resolucao = 'manual' WHERE id = ?").run(agoraISO(), Number(id));
    return true;
  };

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

  return {
    bruto: db,
    arquivo,
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
    // outbox
    proximosOutbox,
    removerOutbox,
    marcarErroOutbox,
    contarOutbox,
    temPendencia,
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

module.exports = { criarBanco, paraBanco, doBanco, agoraISO, hojeISO, novoId, TIPOS_SQL, TABELAS };
