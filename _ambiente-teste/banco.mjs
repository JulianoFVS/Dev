// Postgres local (PGlite) com a base reconstruída + as migrations do projeto.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ_ORTUS = path.join(AQUI, '..', 'ortus');
const PASTA_MIGRATIONS = path.join(RAIZ_ORTUS, 'supabase', 'migrations');

const GRUPOS = [
  ['20260514_super_admin.sql', '20260514_equipe_onboarding.sql', '20260514_rls_multi_tenant.sql', '20260514_rls_fix_recursion.sql'],
  ['20260601_permissoes_modulos.sql', '20260601_clinicas_completo.sql', '20260601_comissoes.sql', '20260601_fix_pacientes_rls.sql', '20260601_tarefas.sql'],
  ['20261114_seguranca_total.sql', '20261114_agenda_partes.sql', '20261114_equipe_convites.sql', '20261114_saas_painel.sql',
    '20261114_saas_auditoria.sql', '20261114_saas_clinicas.sql', '20261114_agenda_preservar.sql'],
];

/** Reordena só dentro dos grupos conhecidos; o resto fica na ordem do nome. */
export function ordenar(arquivos) {
  const saida = [...arquivos];
  for (const grupo of GRUPOS) {
    const posicoes = saida.map((a, i) => (grupo.includes(a) ? i : -1)).filter((i) => i >= 0);
    const presentes = grupo.filter((a) => saida.includes(a));
    posicoes.forEach((pos, k) => { saida[pos] = presentes[k]; });
  }
  return saida;
}

export function listarMigrations() {
  return fs.readdirSync(PASTA_MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
}

/**
 * Abre o banco. `dir` vazio = em memória (some ao fechar).
 * Devolve { db, erros } — erros lista as migrations que falharam.
 */
export async function abrirBanco({ dir = '', silencioso = false, ate = null } = {}) {
  const novo = !dir || !fs.existsSync(path.join(dir, 'PG_VERSION'));
  const db = new PGlite(dir || undefined);
  await db.waitReady;
  const erros = [];
  if (!novo) return { db, erros, novo };

  await db.exec(fs.readFileSync(path.join(AQUI, 'base.sql'), 'utf8'));

  const aplicar = async (arquivo) => {
    const sql = fs.readFileSync(path.join(PASTA_MIGRATIONS, arquivo), 'utf8');
    try {
      await db.exec(sql);
      return null;
    } catch (e) {
      // Uma migration que falha no meio deixa a transação aberta.
      await db.exec('ROLLBACK').catch(() => undefined);
      return { arquivo, erro: e.message, detalhe: e.detail || e.where || '' };
    }
  };

  // Ordem: nome de arquivo, exceto nos dias em que os arquivos dependem uns
  // dos outros fora da ordem alfabética. A do dia 14/11 é a do checklist de
  // docs/SEGURANCA.md; a de 14/05 segue as dependências (coluna antes da
  // função que a lê, função antes das policies que a chamam).
  const fila = ordenar(listarMigrations().filter((a) => !ate || a <= ate));
  for (const arquivo of fila) {
    const falha = await aplicar(arquivo);
    if (falha) {
      erros.push(falha);
      if (!silencioso) console.log('  FALHA', falha.arquivo, '→', falha.erro, falha.detalhe ? `(${falha.detalhe})` : '');
    } else if (!silencioso) console.log('  ok   ', arquivo);
  }
  return { db, erros, novo };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { db, erros } = await abrirBanco({ ate: process.argv[2] || null });
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
  console.log(`\ntabelas em public: ${rows[0].n} | migrations com erro: ${erros.length}`);
  await db.close();
  process.exit(erros.length ? 1 : 0);
}
