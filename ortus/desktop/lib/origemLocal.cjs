'use strict';

/**
 * Prova de origem das requisições ao servidor local do Ortus Desktop.
 *
 * Escutar só em 127.0.0.1 não basta: qualquer site aberto no navegador da
 * mesma máquina consegue mandar requisição para http://127.0.0.1:<porta>
 * (um POST simples nem passa por preflight), e com DNS rebinding consegue até
 * ler a resposta. Por isso cada requisição precisa provar três coisas:
 *
 *  1. `Host` é o endereço local na porta do próprio servidor — derruba o DNS
 *     rebinding, em que o navegador manda o nome do domínio do atacante;
 *  2. `Origin` (quando existe) e `Sec-Fetch-Site` (quando existe) são do
 *     próprio aplicativo — derruba o site de terceiros e o iframe externo
 *     aberto dentro da janela;
 *  3. traz o segredo desta execução, que só o processo principal do Electron
 *     conhece e injeta nas requisições da janela — derruba outro programa da
 *     máquina e qualquer navegador comum.
 *
 * Sem dependências de propósito: o mesmo arquivo é usado pelo processo
 * principal, pelas rotas do Next e pelos testes.
 */

/** Cabeçalho que o processo principal injeta nas requisições da janela. */
const CABECALHO_JANELA = 'x-ortus-janela';

/** Tamanho do segredo em hexadecimal (32 bytes). */
const TAMANHO_SEGREDO = 64;

function portaValida(porta) {
  const numero = Number(porta);
  return Number.isInteger(numero) && numero > 0 && numero <= 65535 ? numero : 0;
}

/** Comparação em tempo constante, sem `node:crypto` (roda em qualquer runtime do Next). */
function iguaisSeguro(recebido, esperado) {
  const a = String(recebido == null ? '' : recebido);
  const b = String(esperado == null ? '' : esperado);
  let diferenca = a.length ^ b.length;
  for (let i = 0; i < b.length; i += 1) {
    diferenca |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

/** `Host` aceito: só o endereço local, na porta exata do servidor. */
function hostLocalValido(host, porta) {
  const numero = portaValida(porta);
  if (!numero) return false;
  const texto = String(host == null ? '' : host).trim().toLowerCase();
  return texto === `127.0.0.1:${numero}` || texto === `localhost:${numero}`;
}

/** Origem (esquema + host + porta) do aplicativo na porta informada. */
function origemLocal(porta) {
  const numero = portaValida(porta);
  return numero ? `http://127.0.0.1:${numero}` : '';
}

/**
 * A URL pertence ao servidor local nesta porta? Compara a origem inteira:
 * `http://127.0.0.1:3456` não pode valer para `http://127.0.0.1:34567` nem
 * para `http://127.0.0.1:3456@site-externo`.
 */
function urlEhLocal(url, porta) {
  const esperada = origemLocal(porta);
  if (!esperada) return false;
  try {
    return new URL(String(url)).origin === esperada;
  } catch {
    return false;
  }
}

/** `Origin` aceito: ausente (GET da própria página não manda) ou a origem do aplicativo. */
function origemValida(origin, porta) {
  if (origin === undefined || origin === null || origin === '') return true;
  const numero = portaValida(porta);
  if (!numero) return false;
  const texto = String(origin).trim().toLowerCase();
  return texto === `http://127.0.0.1:${numero}` || texto === `http://localhost:${numero}`;
}

/** `Sec-Fetch-Site` aceito: ausente (cliente que não é navegador), `same-origin` ou `none` (navegação direta). */
function siteValido(secFetchSite) {
  if (secFetchSite === undefined || secFetchSite === null || secFetchSite === '') return true;
  const texto = String(secFetchSite).trim().toLowerCase();
  return texto === 'same-origin' || texto === 'none';
}

/**
 * Lado do Electron: decide os cabeçalhos de uma requisição que a janela vai
 * fazer. O segredo só entra quando o destino é o servidor local E quem pediu
 * foi o próprio aplicativo (`iniciador` ausente = pedido do navegador, como o
 * carregamento inicial). Em qualquer outro caso o cabeçalho é retirado — vale
 * para o que a página tentar pôr por conta própria e para o que sobraria de
 * um redirecionamento para outro endereço.
 *
 * Devolve os cabeçalhos novos, ou `null` quando nada muda.
 *
 * @param {{ url: string, iniciador?: string | null, cabecalhos?: Record<string, string>, porta: number, segredo: string }} pedido
 * @returns {Record<string, string> | null}
 */
function cabecalhosDaJanela(pedido) {
  const cabecalhos = { ...(pedido.cabecalhos || {}) };
  let mudou = false;
  for (const nome of Object.keys(cabecalhos)) {
    if (nome.toLowerCase() === CABECALHO_JANELA) {
      delete cabecalhos[nome];
      mudou = true;
    }
  }
  const doAplicativo = !pedido.iniciador || urlEhLocal(pedido.iniciador, pedido.porta);
  if (pedido.segredo && doAplicativo && urlEhLocal(pedido.url, pedido.porta)) {
    cabecalhos[CABECALHO_JANELA] = pedido.segredo;
    mudou = true;
  }
  return mudou ? cabecalhos : null;
}

/**
 * Confere uma requisição. Falha fechada: sem porta ou sem segredo configurados
 * no servidor, nada passa.
 *
 * @param {{
 *   host?: string | null,
 *   origin?: string | null,
 *   secFetchSite?: string | null,
 *   segredoRecebido?: string | null,
 *   segredoEsperado?: string | null,
 *   porta?: string | number | null,
 * }} requisicao
 * @returns {{ ok: true } | { ok: false, motivo: 'configuracao' | 'host' | 'origem' | 'site' | 'segredo' }}
 */
function conferirRequisicaoLocal(requisicao) {
  const dados = requisicao || {};
  const esperado = String(dados.segredoEsperado == null ? '' : dados.segredoEsperado);
  if (!portaValida(dados.porta) || esperado.length < TAMANHO_SEGREDO) {
    return { ok: false, motivo: 'configuracao' };
  }
  if (!hostLocalValido(dados.host, dados.porta)) return { ok: false, motivo: 'host' };
  if (!origemValida(dados.origin, dados.porta)) return { ok: false, motivo: 'origem' };
  if (!siteValido(dados.secFetchSite)) return { ok: false, motivo: 'site' };
  if (!iguaisSeguro(dados.segredoRecebido, esperado)) return { ok: false, motivo: 'segredo' };
  return { ok: true };
}

module.exports = {
  CABECALHO_JANELA,
  TAMANHO_SEGREDO,
  cabecalhosDaJanela,
  conferirRequisicaoLocal,
  hostLocalValido,
  iguaisSeguro,
  origemLocal,
  origemValida,
  siteValido,
  urlEhLocal,
};
