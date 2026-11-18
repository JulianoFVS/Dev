/**
 * Variáveis de ambiente dos scripts.
 *
 * Ordem: o que já está no ambiente do processo vence; o que faltar vem de
 * `.env.local`. Assim os scripts rodam igual na máquina de desenvolvimento
 * (arquivo), na VM (EnvironmentFile do systemd) e num banco de teste local
 * (variáveis passadas na linha de comando), sem editar arquivo nenhum.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function lerArquivo() {
  const arquivo = path.join(RAIZ, '.env.local');
  if (!fs.existsSync(arquivo)) return {};
  const saida = {};
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    saida[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return saida;
}

const DO_ARQUIVO = lerArquivo();

/** Valor da variável, ou '' quando não existe em lugar nenhum. */
export function env(nome) {
  return (process.env[nome] ?? DO_ARQUIVO[nome] ?? '').trim();
}

/** Igual a `env`, mas encerra o script com uma mensagem clara se faltar. */
export function exigir(...nomes) {
  const faltam = nomes.filter((nome) => !env(nome));
  if (faltam.length) {
    console.error(`Faltam variáveis: ${faltam.join(', ')}. Defina no ambiente ou em .env.local.`);
    process.exit(1);
  }
  return Object.fromEntries(nomes.map((nome) => [nome, env(nome)]));
}

/** Banco em 127.0.0.1/localhost é sempre um banco de teste: sem TLS. */
export function ehBancoLocal(url = env('DATABASE_URL')) {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

/** Configuração do `pg.Client` para a DATABASE_URL atual. */
export function conexaoPg() {
  const { DATABASE_URL } = exigir('DATABASE_URL');
  return {
    connectionString: DATABASE_URL,
    ssl: ehBancoLocal(DATABASE_URL) ? false : { rejectUnauthorized: false },
  };
}

/** Project ref do Supabase (ou "local" no banco de teste). Nunca é segredo. */
export function projectRef() {
  const direto = env('SUPABASE_PROJECT_REF');
  if (direto) return direto;
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (m) return m[1];
  return ehBancoLocal(url) ? 'local (ambiente de teste)' : '(desconhecido)';
}
