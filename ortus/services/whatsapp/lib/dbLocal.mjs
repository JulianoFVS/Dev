/**
 * Cliente da API de dados do Ortus Desktop.
 *
 * O SQLite pertence ao processo principal do Electron (desktop/lib/dbApi.cjs).
 * O gateway do WhatsApp é um processo filho separado e fala com essa API por
 * HTTP em 127.0.0.1 — abrir o arquivo .db direto aqui exigiria o módulo nativo
 * `better-sqlite3` compilado para o ABI do Electron, coisa que este processo
 * (Node puro) não consegue carregar.
 *
 * Contrato usado:
 *   POST /consulta  { tabela, filtros: [{col, op, valor}], ordem: [{col, asc}], limite, offset } → { dados }
 *   POST /contar    { tabela, filtros } → { total }
 *   POST /gravar    { tabela, op: 'insert'|'update'|'upsert'|'delete', dados, id } → { dados }
 *   GET  /saude     → { ok: true }
 *
 * Todas as chamadas levam `x-ortus-db-secret: ORTUS_DB_SEGREDO`.
 * A API carimba `updated_at` e enfileira a linha para sincronização sozinha,
 * então nada disso é feito aqui.
 */

const TEMPO_LIMITE = 12_000;

function urlBase() {
  return String(process.env.ORTUS_DB_URL || '').replace(/\/$/, '');
}

function segredo() {
  return String(process.env.ORTUS_DB_SEGREDO || '');
}

/** O processo roda como filho do Electron com banco local? */
export function dbLocalAtivo() {
  return String(process.env.ORTUS_LOCAL_DB || '') === '1';
}

/** Modo local ligado e com endereço/segredo para falar com a API de dados. */
export function dbLocalConfigurado() {
  return dbLocalAtivo() && Boolean(urlBase()) && Boolean(segredo());
}

function erroHttp(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

async function chamar(caminho, { metodo = 'GET', corpo } = {}) {
  const base = urlBase();
  const chave = segredo();
  if (!base || !chave) {
    throw erroHttp(503, 'Banco local não configurado (ORTUS_DB_URL/ORTUS_DB_SEGREDO).');
  }

  let resposta;
  try {
    resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        'x-ortus-db-secret': chave,
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE),
    });
  } catch (err) {
    const expirou = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw erroHttp(503, expirou ? 'O banco local não respondeu.' : 'Não foi possível falar com o banco local.');
  }

  const texto = await resposta.text();
  let dados = {};
  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      throw erroHttp(502, 'Resposta inválida do banco local.');
    }
  }
  if (!resposta.ok) {
    // 401/403 aqui é a credencial do gateway com a API de dados, não a do
    // cliente que chamou o gateway: devolve como falha de serviço (502).
    if (resposta.status === 401 || resposta.status === 403) {
      throw erroHttp(502, 'O banco local recusou a credencial do gateway.');
    }
    throw erroHttp(resposta.status, dados?.erro || 'Falha no banco local.');
  }
  return dados;
}

/**
 * @param {string} tabela
 * @param {{ filtros?: Array<{col: string, op: string, valor?: unknown}>, ordem?: Array<{col: string, asc?: boolean}>, limite?: number, offset?: number }} [opcoes]
 */
export async function localConsultar(tabela, { filtros = [], ordem = [], limite, offset } = {}) {
  const corpo = { tabela, filtros, ordem };
  if (Number.isInteger(limite) && limite > 0) corpo.limite = limite;
  if (Number.isInteger(offset) && offset > 0) corpo.offset = offset;
  const { dados } = await chamar('/consulta', { metodo: 'POST', corpo });
  return Array.isArray(dados) ? dados : [];
}

export async function localContar(tabela, filtros = []) {
  const { total } = await chamar('/contar', { metodo: 'POST', corpo: { tabela, filtros } });
  return Number(total || 0);
}

/**
 * @param {{ tabela: string, op?: 'insert'|'update'|'upsert'|'delete', dados?: Record<string, unknown>, id?: string|number|null }} operacao
 */
export async function localGravar(operacao) {
  const { dados } = await chamar('/gravar', { metodo: 'POST', corpo: operacao });
  return dados ?? null;
}

export async function localSaude() {
  await chamar('/saude');
}
