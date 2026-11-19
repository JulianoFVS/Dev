#!/usr/bin/env node
/**
 * Verificador do instalador: nenhum segredo vai dentro do pacote.
 *
 * Varre uma pasta inteira (a que o electron-builder vai empacotar, ou o build
 * standalone do Next) e falha quando encontra:
 *
 *  1. um arquivo de ambiente (`.env`, `.env.local`, `.env.production`,
 *     `electron-builder.env`…), solto ou dentro de um `.asar`;
 *  2. o VALOR de uma variável proibida que exista no ambiente de quem está
 *     gerando o build ou nos arquivos `.env*` da raiz do projeto;
 *  3. uma chave do Supabase com poder de servidor (JWT `service_role` ou
 *     `sb_secret_…`) ou uma conexão do Postgres com senha, venha de onde vier.
 *
 * O relatório mostra só o NOME da variável e o arquivo onde ela apareceu —
 * nunca o valor.
 *
 * Uso:
 *   node scripts/desktop-verificar.mjs                confere o que o desktop-build acabou de gerar
 *   node scripts/desktop-verificar.mjs <pasta> [...]  confere as pastas informadas
 *
 * O `desktop-build.mjs` roda este script depois do `next build`, e o
 * `desktop/afterpack.cjs` roda de novo sobre a pasta final, antes de o
 * instalador ser montado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Variáveis que nunca podem ir para a máquina da clínica. */
export const NOMES_PROIBIDOS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_JWT_SECRET',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'DATABASE_URL',
  'CRON_SECRET',
  'RESEND_API_KEY',
  'WHATSAPP_GATEWAY_SECRET',
  // Assinatura do instalador: usadas pelo electron-builder, nunca empacotadas.
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'AZURE_CLIENT_SECRET',
  'AZURE_CLIENT_CERTIFICATE_PASSWORD',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_API_KEY',
  'GH_TOKEN',
  'GITHUB_TOKEN',
];

/** Famílias inteiras de variáveis de serviços do servidor do site. */
export const PREFIXOS_PROIBIDOS = ['TWILIO_', 'R2_', 'MERCADOPAGO_'];

/**
 * Nomes dessas famílias cujo valor não é segredo e aparece legitimamente no
 * código (nome de bucket padrão, remetente, endereço público). Continuam fora
 * do pacote como arquivo `.env`, mas o valor não é procurado.
 */
const VALOR_PUBLICO = /(_BUCKET(_|$)|_PUBLIC_URL$|_FROM(_NUMBER|_EMAIL)?$|_ENDPOINT$|_REGION$)/;

/** Valor curto demais dá falso positivo (e não protege nada). */
const TAMANHO_MINIMO = 8;

/** Arquivos `.env*` que o Next, o Electron ou o electron-builder leem na raiz. */
const ARQUIVOS_ENV_DA_RAIZ = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local',
  'electron-builder.env',
];

export function nomeProibido(nome) {
  const texto = String(nome || '').toUpperCase();
  if (texto.startsWith('NEXT_PUBLIC_')) return false;
  return NOMES_PROIBIDOS.includes(texto) || PREFIXOS_PROIBIDOS.some((prefixo) => texto.startsWith(prefixo));
}

/** Nome de arquivo de ambiente (os de exemplo ficam de fora: não levam valor real). */
export function arquivoDeAmbiente(nome) {
  const texto = String(nome || '').toLowerCase();
  if (/\.(example|sample|template|dist)$/.test(texto)) return false;
  return texto === 'electron-builder.env' || texto === '.env' || texto.startsWith('.env.');
}

/** Lê um arquivo `.env` simples: `NOME=valor`, com ou sem aspas. */
export function lerArquivoEnv(caminho) {
  const pares = new Map();
  let texto = '';
  try {
    texto = fs.readFileSync(caminho, 'utf8');
  } catch {
    return pares;
  }
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim().replace(/^export\s+/, '');
    if (!limpa || limpa.startsWith('#')) continue;
    const igual = limpa.indexOf('=');
    if (igual <= 0) continue;
    const nome = limpa.slice(0, igual).trim();
    let valor = limpa.slice(igual + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    pares.set(nome, valor);
  }
  return pares;
}

/** Nomes definidos nos arquivos `.env*` da raiz (para o build neutralizar os que não são públicos). */
export function nomesNosArquivosEnv(raiz = RAIZ) {
  const nomes = new Set();
  for (const arquivo of ARQUIVOS_ENV_DA_RAIZ) {
    for (const nome of lerArquivoEnv(path.join(raiz, arquivo)).keys()) nomes.add(nome);
  }
  return nomes;
}

/**
 * Valores que não podem aparecer no pacote: os das variáveis proibidas
 * presentes no ambiente ou nos `.env*` de quem gera o build.
 * @returns {Array<{ nome: string, valor: string, origem: string }>}
 */
export function segredosDoConstrutor({ raiz = RAIZ, env = process.env } = {}) {
  const achados = new Map();
  const considerar = (nome, valor, origem) => {
    const texto = String(valor ?? '').trim();
    if (!nomeProibido(nome) || VALOR_PUBLICO.test(String(nome).toUpperCase())) return;
    if (texto.length < TAMANHO_MINIMO) return;
    const chave = `${nome}\u0000${texto}`;
    if (!achados.has(chave)) achados.set(chave, { nome, valor: texto, origem });
  };
  for (const [nome, valor] of Object.entries(env)) considerar(nome, valor, 'ambiente');
  for (const arquivo of ARQUIVOS_ENV_DA_RAIZ) {
    for (const [nome, valor] of lerArquivoEnv(path.join(raiz, arquivo))) considerar(nome, valor, arquivo);
  }
  // Segredo do gateway do WhatsApp usado em desenvolvimento.
  try {
    const gateway = fs.readFileSync(path.join(raiz, 'services', 'whatsapp', '.gateway-secret'), 'utf8').trim();
    considerar('WHATSAPP_GATEWAY_SECRET', gateway, 'services/whatsapp/.gateway-secret');
  } catch {
    /* arquivo opcional */
  }
  return [...achados.values()];
}

// ------------------------------------------------------- ambiente do build
/**
 * O que o `next build` do desktop pode receber do ambiente de quem está
 * gerando o instalador: o necessário para o Node rodar, rede (proxy e
 * certificado) e as variáveis públicas (`NEXT_PUBLIC_*`, que vão para o
 * navegador de qualquer forma). Todo o resto fica de fora — o que não entra
 * no build não vaza para o pacote. Os nomes são comparados sem diferenciar
 * maiúsculas (no Windows é `Path`, `SystemRoot`).
 */
const DO_SISTEMA = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'USERNAME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LANGUAGE', 'TZ', 'TERM', 'COLORTERM',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
  'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'CI', 'GITHUB_ACTIONS', 'FORCE_COLOR', 'NO_COLOR',
]);

/**
 * Monta o ambiente saneado do build.
 * @returns {{ env: Record<string, string>, neutralizadas: string[] }}
 */
export function ambienteDoBuild({ raiz = RAIZ, env: origem = process.env } = {}) {
  // Válvula de escape para máquina de build com alguma exigência própria:
  // ORTUS_BUILD_ENV_EXTRA=NOME1,NOME2 deixa essas variáveis passarem. Nome
  // proibido não passa nem por aqui.
  const extras = new Set(
    String(origem.ORTUS_BUILD_ENV_EXTRA || '').split(',').map((nome) => nome.trim().toUpperCase()).filter(Boolean),
  );
  const permitida = (nome) => {
    const maiuscula = String(nome).toUpperCase();
    if (nomeProibido(maiuscula)) return false;
    return DO_SISTEMA.has(maiuscula) || maiuscula.startsWith('NEXT_PUBLIC_') || maiuscula.startsWith('LC_') || extras.has(maiuscula);
  };

  const env = {};
  for (const [nome, valor] of Object.entries(origem)) {
    if (valor !== undefined && permitida(nome)) env[nome] = valor;
  }

  // O Next lê os `.env*` da raiz por conta própria, e é assim que a chave de
  // serviço do `.env.local` chegaria ao processo do build. Ele não sobrescreve
  // variável que já existe no ambiente, mesmo vazia: definimos vazia cada uma
  // que não é pública, e o valor do arquivo nunca é carregado.
  const neutralizadas = [];
  for (const nome of nomesNosArquivosEnv(raiz)) {
    if (permitida(nome)) continue;
    env[nome] = '';
    neutralizadas.push(nome);
  }

  Object.assign(env, {
    ORTUS_DESKTOP_BUILD: '1',
    // As páginas estáticas são renderizadas durante o build: com isto o HTML
    // já sai com o script de sessão offline do aplicativo (app/layout.tsx).
    ORTUS_DESKTOP: '1',
    NEXT_PUBLIC_WHATSAPP_ATIVO: '1',
    NEXT_TELEMETRY_DISABLED: '1',
  });
  return { env, neutralizadas: neutralizadas.sort() };
}

/**
 * O `next build` copia `.env` e `.env.production` da raiz para dentro do
 * standalone. O aplicativo recebe a configuração pelo Electron, não por
 * arquivo: essas cópias saem da pasta de build (os arquivos da raiz não são
 * tocados). Devolve os caminhos removidos, relativos à pasta.
 */
export function removerArquivosDeAmbiente(pasta, base = pasta, removidos = []) {
  let entradas = [];
  try {
    entradas = fs.readdirSync(pasta, { withFileTypes: true });
  } catch {
    return removidos;
  }
  for (const entrada of entradas) {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name !== 'node_modules') removerArquivosDeAmbiente(caminho, base, removidos);
    } else if (entrada.isFile() && arquivoDeAmbiente(entrada.name)) {
      fs.rmSync(caminho, { force: true });
      removidos.push(path.relative(base, caminho).split(path.sep).join('/'));
    }
  }
  return removidos;
}

// ---------------------------------------------------------------- varredura
const TEXTO =/\.(js|cjs|mjs|json|html|htm|txt|map|yml|yaml|env|rsc|body|meta|ts|tsx|css|svg|xml|toml|ini|conf|config|sh|bat|cmd|ps1)$/i;
const TEXTO_MAXIMO = 8 * 1024 * 1024;
const BLOCO = 4 * 1024 * 1024;

/** JWT do Supabase com papel de servidor? */
function jwtDeServidor(token) {
  try {
    const corpo = token.split('.')[1];
    const json = JSON.parse(Buffer.from(corpo.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return json && json.role === 'service_role';
  } catch {
    return false;
  }
}

/** Segredos reconhecíveis pelo formato, mesmo sem estarem no ambiente de quem faz o build. */
function padroesNoTexto(texto) {
  const achados = new Set();
  for (const m of texto.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) {
    if (jwtDeServidor(m[0])) achados.add('chave service_role do Supabase (JWT)');
  }
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(texto)) achados.add('chave secreta do Supabase (sb_secret_)');
  if (/postgres(?:ql)?:\/\/[^\s:@/"'`]+:[^\s@/"'`]{6,}@[^\s/"'`]*supabase/i.test(texto)) {
    achados.add('conexão do Postgres com senha (DATABASE_URL)');
  }
  return [...achados];
}

/** Nomes dos arquivos guardados num `.asar` (o cabeçalho é um JSON simples). */
function nomesNoAsar(caminho) {
  const nomes = [];
  let fd;
  try {
    fd = fs.openSync(caminho, 'r');
    const inicio = Buffer.alloc(16);
    if (fs.readSync(fd, inicio, 0, 16, 0) < 16) return nomes;
    const tamanho = inicio.readUInt32LE(12);
    if (!tamanho || tamanho > 256 * 1024 * 1024) return nomes;
    const json = Buffer.alloc(tamanho);
    fs.readSync(fd, json, 0, tamanho, 16);
    const andar = (no, prefixo) => {
      for (const [nome, filho] of Object.entries(no.files || {})) {
        const caminhoInterno = prefixo ? `${prefixo}/${nome}` : nome;
        if (filho && typeof filho === 'object' && filho.files) andar(filho, caminhoInterno);
        else nomes.push(caminhoInterno);
      }
    };
    andar(JSON.parse(json.toString('utf8')), '');
  } catch {
    /* não é um asar legível: a varredura de conteúdo ainda vale */
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return nomes;
}

function listarArquivos(pasta, saida = []) {
  let entradas = [];
  try {
    entradas = fs.readdirSync(pasta, { withFileTypes: true });
  } catch {
    return saida;
  }
  for (const entrada of entradas) {
    const caminho = path.join(pasta, entrada.name);
    // Atalho simbólico aponta para algo que já é visitado pelo caminho real.
    if (entrada.isSymbolicLink()) continue;
    if (entrada.isDirectory()) listarArquivos(caminho, saida);
    else if (entrada.isFile()) saida.push(caminho);
  }
  return saida;
}

/** Procura os valores em um arquivo, em blocos, sem carregar o arquivo inteiro. */
function valoresNoArquivo(caminho, agulhas) {
  const achados = new Set();
  if (!agulhas.length) return achados;
  const maior = Math.max(...agulhas.map((a) => a.bytes.length));
  const fd = fs.openSync(caminho, 'r');
  try {
    const bloco = Buffer.alloc(BLOCO + maior);
    let sobra = 0;
    let posicao = 0;
    for (;;) {
      const lidos = fs.readSync(fd, bloco, sobra, BLOCO, posicao);
      if (lidos <= 0) break;
      const janela = bloco.subarray(0, sobra + lidos);
      for (const agulha of agulhas) {
        if (!achados.has(agulha.nome) && janela.indexOf(agulha.bytes) !== -1) achados.add(agulha.nome);
      }
      posicao += lidos;
      // Guarda o fim do bloco: um valor pode estar partido entre dois blocos.
      sobra = Math.min(maior - 1, janela.length);
      janela.copy(bloco, 0, janela.length - sobra);
    }
  } finally {
    fs.closeSync(fd);
  }
  return achados;
}

/**
 * Varre uma pasta.
 * @param {string} pasta
 * @param {{ segredos?: Array<{ nome: string, valor: string }> }} [opcoes]
 */
export function verificarPasta(pasta, { segredos = segredosDoConstrutor() } = {}) {
  const base = path.resolve(pasta);
  const agulhas = segredos.map((s) => ({ nome: s.nome, bytes: Buffer.from(s.valor, 'utf8') }));
  const resultado = { pasta: base, arquivos: 0, bytes: 0, ambientes: [], vazamentos: [] };
  if (!fs.existsSync(base)) return resultado;

  const relativo = (caminho) => path.relative(base, caminho).split(path.sep).join('/') || path.basename(caminho);
  const arquivos = fs.statSync(base).isDirectory() ? listarArquivos(base) : [base];

  for (const caminho of arquivos) {
    let tamanho = 0;
    try {
      tamanho = fs.statSync(caminho).size;
    } catch {
      continue;
    }
    resultado.arquivos += 1;
    resultado.bytes += tamanho;
    const nome = path.basename(caminho);

    if (arquivoDeAmbiente(nome)) resultado.ambientes.push(relativo(caminho));
    if (/\.asar$/i.test(nome)) {
      for (const interno of nomesNoAsar(caminho)) {
        if (arquivoDeAmbiente(path.posix.basename(interno))) resultado.ambientes.push(`${relativo(caminho)}/${interno}`);
      }
    }

    for (const variavel of valoresNoArquivo(caminho, agulhas)) {
      resultado.vazamentos.push({ variavel, arquivo: relativo(caminho) });
    }

    // Dentro do asar os arquivos ficam em texto puro, um atrás do outro.
    const legivel = TEXTO.test(nome) || /\.asar$/i.test(nome) || arquivoDeAmbiente(nome);
    if (legivel && tamanho <= (/\.asar$/i.test(nome) ? 256 * 1024 * 1024 : TEXTO_MAXIMO)) {
      let texto = '';
      try {
        texto = fs.readFileSync(caminho, 'latin1');
      } catch {
        texto = '';
      }
      for (const variavel of padroesNoTexto(texto)) {
        resultado.vazamentos.push({ variavel, arquivo: relativo(caminho) });
      }
    }
  }
  return resultado;
}

/** Texto do relatório. Só nomes de variável e caminhos de arquivo. */
export function relatorio(resultados) {
  const linhas = [];
  let problemas = 0;
  for (const r of resultados) {
    const mb = (r.bytes / (1024 * 1024)).toFixed(1);
    linhas.push(`  ${r.pasta}  (${r.arquivos} arquivos, ${mb} MB)`);
    for (const arquivo of r.ambientes) {
      problemas += 1;
      linhas.push(`    ARQUIVO DE AMBIENTE  ${arquivo}`);
    }
    for (const v of r.vazamentos) {
      problemas += 1;
      linhas.push(`    SEGREDO  ${v.variavel}  em  ${v.arquivo}`);
    }
  }
  return { problemas, texto: linhas.join('\n') };
}

/**
 * Confere as pastas e lança erro se algo proibido estiver nelas.
 * @param {string[]} pastas
 */
export function exigirPacoteLimpo(pastas, opcoes = {}) {
  const segredos = opcoes.segredos || segredosDoConstrutor(opcoes);
  const resultados = pastas.map((pasta) => verificarPasta(pasta, { segredos }));
  const { problemas, texto } = relatorio(resultados);
  const procuradas = [...new Set(segredos.map((s) => s.nome))].sort();
  const cabecalho =
    `verificação de segredos: ${procuradas.length} variável(is) proibida(s) com valor no ambiente` +
    (procuradas.length ? ` (${procuradas.join(', ')})` : '') +
    ', mais os formatos conhecidos de chave';
  if (problemas) {
    throw new Error(
      `${cabecalho}\n${texto}\n\n` +
        `${problemas} problema(s): o pacote NÃO pode ser distribuído assim.\n` +
        'Tire o arquivo ou o valor da pasta de build (ou descubra por que ele foi parar lá) e gere de novo.',
    );
  }
  return { resultados, cabecalho, texto };
}

/** Pastas que o electron-builder leva (ver desktop/electron-builder.yml). */
export function pastasDoPacote(raiz = RAIZ) {
  return [
    path.join(raiz, '.next', 'standalone'),
    path.join(raiz, 'desktop'),
    path.join(raiz, 'services', 'whatsapp', 'server.mjs'),
    path.join(raiz, 'services', 'whatsapp', 'package.json'),
    path.join(raiz, 'services', 'whatsapp', 'lib'),
    path.join(raiz, 'services', 'whatsapp', 'node_modules'),
  ];
}

// --------------------------------------------------------------------- CLI
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const pastas = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  try {
    const { cabecalho, texto } = exigirPacoteLimpo(pastas.length ? pastas : pastasDoPacote());
    console.log(cabecalho);
    console.log(texto);
    console.log('nenhum arquivo de ambiente e nenhum segredo encontrado.');
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
