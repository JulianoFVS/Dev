#!/usr/bin/env node
/**
 * ORTUS — Suíte de verificação de segurança do banco.
 *
 * Roda tudo dentro de uma transação e faz ROLLBACK no final: nenhum dado
 * real é alterado. Simula usuários reais com `SET LOCAL ROLE authenticated`
 * + `request.jwt.claims`, exatamente como o PostgREST faz.
 *
 * Uso:  node scripts/testar-rls.mjs
 * Sai com código 1 se qualquer verificação falhar.
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!url) {
  console.error('DATABASE_URL ausente em .env.local');
  process.exit(1);
}

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const resultados = [];
const check = (nome, ok, detalhe = '') => resultados.push({ nome, ok, detalhe });
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

/** Executa fn como se fosse o usuário autenticado (rollback automático do savepoint). */
async function como(user, fn) {
  await db.query('SAVEPOINT sp');
  try {
    await db.query('SET LOCAL ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ ...user, role: 'authenticated' }),
    ]);
    const r = await fn();
    await db.query('RESET ROLE');
    await db.query('RELEASE SAVEPOINT sp');
    return r;
  } catch (e) {
    await db.query('ROLLBACK TO SAVEPOINT sp');
    await db.query('RESET ROLE').catch(() => undefined);
    return { erro: e.message };
  }
}

const negado = async (user, fn) => {
  const r = await como(user, fn);
  return Boolean(r?.erro);
};

await db.connect();
// Tudo roda dentro de uma transação: nenhum teste altera dado real.
await db.query('BEGIN');
try {
  // Descobre usuários de teste a partir dos dados reais.
  const superAdmins = await rows(`
    SELECT user_id FROM profissionais WHERE is_super_admin = true AND user_id IS NOT NULL ORDER BY id LIMIT 1`);
  const comuns = await rows(`
    SELECT p.user_id, pc.clinica_id
    FROM profissionais p
    JOIN profissionais_clinicas pc ON pc.profissional_id = p.id
    WHERE coalesce(p.is_super_admin, false) = false AND p.nivel_acesso <> 'admin'
      AND p.user_id IS NOT NULL
    ORDER BY pc.clinica_id LIMIT 1`);
  const admins = await rows(`
    SELECT p.user_id, pc.clinica_id
    FROM profissionais p
    JOIN profissionais_clinicas pc ON pc.profissional_id = p.id
    WHERE coalesce(p.is_super_admin, false) = false AND p.nivel_acesso = 'admin'
      AND p.user_id IS NOT NULL
    ORDER BY pc.clinica_id LIMIT 1`);

  const superAdmin = superAdmins[0]?.user_id ? { sub: superAdmins[0].user_id } : null;
  const comum = comuns[0]?.user_id ? { sub: comuns[0].user_id, clinica: String(comuns[0].clinica_id) } : null;
  const admin = admins[0]?.user_id ? { sub: admins[0].user_id, clinica: String(admins[0].clinica_id) } : null;

  console.log(`Usuários de teste: super=${Boolean(superAdmin)} comum=${Boolean(comum)} admin=${Boolean(admin)}\n`);

  // ------------------------------------------------------------------
  // 1. Estrutura
  // ------------------------------------------------------------------
  const semRls = await rows(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1`);
  check('RLS ligada em todas as tabelas', semRls.length === 0, semRls.map((r) => r.relname).join(','));

  const bucketsPublicos = await rows(`SELECT id FROM storage.buckets WHERE public = true`);
  check('Nenhum bucket público', bucketsPublicos.length === 0, bucketsPublicos.map((r) => r.id).join(','));

  const grantsAnon = await rows(`
    SELECT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public' GROUP BY 1`);
  check('anon sem acesso a tabelas do domínio', grantsAnon.length === 0, grantsAnon.map((r) => r.table_name).join(','));

  const execAnon = await rows(`
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')`);
  check('anon sem EXECUTE em funções', execAnon.length === 0, execAnon.map((r) => r.proname).join(','));

  // ------------------------------------------------------------------
  // 2. Isolamento entre clínicas
  // ------------------------------------------------------------------
  if (comum) {
    const clinicasVisiveis = await como(comum, () => rows(`SELECT DISTINCT clinica_id FROM pacientes`));
    check(
      'membro só vê pacientes da própria clínica',
      !clinicasVisiveis.erro && clinicasVisiveis.every((r) => String(r.clinica_id) === comum.clinica),
      JSON.stringify(clinicasVisiveis),
    );

    const outrasClinicas = await como(comum, () => rows(`SELECT id FROM clinicas`));
    check(
      'membro só vê as próprias clínicas',
      !outrasClinicas.erro && outrasClinicas.every((r) => String(r.id) === comum.clinica),
      JSON.stringify(outrasClinicas),
    );
  }

  // ------------------------------------------------------------------
  // 3. Privilégios dentro da clínica
  // ------------------------------------------------------------------
  const alvo = await rows(`SELECT id FROM pacientes WHERE clinica_id IS NOT NULL LIMIT 1`);
  const pacienteAlvo = alvo[0]?.id;

  if (comum && pacienteAlvo) {
    const r = await como(comum, async () => (await db.query(`DELETE FROM pacientes WHERE id = $1`, [pacienteAlvo])).rowCount);
    check('membro comum não exclui paciente', r === 0, String(r));
  }
  if (admin && pacienteAlvo) {
    const r = await como(admin, async () => (await db.query(`DELETE FROM pacientes WHERE id = $1`, [pacienteAlvo])).rowCount);
    check('administrador da clínica exclui paciente', r === 1, String(r));
  }

  if (comum) {
    check(
      'ninguém forja notificação para terceiro',
      await negado(comum, () =>
        db.query(`INSERT INTO notificacoes (user_id, titulo, mensagem, tipo) VALUES (gen_random_uuid(), 'x', 'y', 'mensagem')`),
      ),
    );
    check(
      'ninguém se promove a super admin',
      await negado(comum, () => db.query(`UPDATE profissionais SET is_super_admin = true WHERE user_id = auth.uid()`)),
    );
    check(
      'membro comum não escreve em configuracoes_clinica',
      await negado(comum, () =>
        db.query(
          `INSERT INTO configuracoes_clinica (clinica_id, chave, valor) VALUES ($1, 'teste_rls', '{}'::jsonb)`,
          [comum.clinica],
        ),
      ),
    );
    check(
      'membro comum não escreve no catálogo global',
      await negado(comum, () => db.query(`INSERT INTO servicos (nome) VALUES ('teste')`)),
    );
  }

  // ------------------------------------------------------------------
  // 4. Painel SaaS (só donos)
  // ------------------------------------------------------------------
  if (comum) {
    check('saas_visao_geral bloqueada para cliente', await negado(comum, () => db.query(`SELECT public.saas_visao_geral()`)));
    const rede = await rows(`SELECT id FROM redes LIMIT 1`);
    if (rede[0]?.id) {
      check(
        'saas_rede_detalhe bloqueada para cliente',
        await negado(comum, () => db.query(`SELECT public.saas_rede_detalhe($1)`, [rede[0].id])),
      );
    }
  }
  if (superAdmin) {
    const r = await como(superAdmin, () => rows(`SELECT public.saas_visao_geral() AS v`));
    check('saas_visao_geral liberada para dono', !r.erro && Array.isArray(r[0]?.v?.redes), r.erro || 'ok');
    const faturas = await como(superAdmin, () => rows(`SELECT count(*)::int c FROM faturas`));
    check('dono lê faturas', !faturas.erro, faturas.erro || 'ok');
  }

  // ------------------------------------------------------------------
  // 5. Convites de equipe
  // ------------------------------------------------------------------
  if (comum) {
    check(
      'membro comum não convida equipe',
      await negado(comum, () =>
        db.query(`SELECT public.equipe_convidar('qualquer@exemplo.com', ARRAY[1]::BIGINT[])`),
      ),
    );
    check(
      'ninguém responde convite alheio',
      await negado(comum, () => db.query(`SELECT public.equipe_responder_convite(999999, true)`)),
    );
  }

  // ------------------------------------------------------------------
  // 6. Agenda multipartes
  // ------------------------------------------------------------------
  if (comum) {
    check(
      'membro não grava em clínica alheia',
      await negado(comum, () =>
        db.query(`SELECT public.agendamento_salvar_partes(
          NULL, 999999, gen_random_uuid(), NULL, 'x', 'blue', 'agendado', 0, 0, '',
          '[{"data_hora":"2026-01-01T09:00:00-03:00"}]'::jsonb)`),
      ),
    );
  }

  // ------------------------------------------------------------------
  // 7. Tabelas internas
  // ------------------------------------------------------------------
  for (const tabela of ['armazenamento_objetos', 'armazenamento_envios', 'ortus_schema_migrations']) {
    check(
      `tabela interna ${tabela} inacessível`,
      await negado(admin ?? comum ?? superAdmin ?? { sub: '00000000-0000-0000-0000-000000000000' }, () =>
        db.query(`SELECT * FROM ${tabela} LIMIT 1`),
      ),
    );
  }
} finally {
  console.log('\n=== RESULTADO ===');
  let falhas = 0;
  for (const r of resultados) {
    if (!r.ok) falhas++;
    console.log(`${r.ok ? 'OK  ' : 'FALHA'} ${r.nome}${r.detalhe ? `  → ${r.detalhe}` : ''}`);
  }
  console.log(`\n${resultados.length - falhas}/${resultados.length} verificações OK`);
  await db.query('ROLLBACK').catch(() => undefined);
  await db.end();
  process.exit(falhas ? 1 : 0);
}
