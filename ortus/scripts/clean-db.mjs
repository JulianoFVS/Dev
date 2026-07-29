/**
 * Limpeza de dados de teste no Supabase (ORTUS)
 *
 * USO:
 *   node scripts/clean-db.mjs                          # simulação (padrão)
 *   node scripts/clean-db.mjs --confirm                # apaga TUDO exceto contas mantidas
 *   node scripts/clean-db.mjs --confirm --keep-emails=voce@clinica.com,outro@email.com
 *   node scripts/clean-db.mjs --confirm --keep-clinica-ids=17,29
 *   node scripts/clean-db.mjs --confirm --keep-super-admins
 *
 * ATENÇÃO: operação irreversível. Faça backup no Supabase Dashboard antes.
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env.local'), 'utf8');

function envVar(key) {
  const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m?.[1]?.trim() || null;
}

const DATABASE_URL = envVar('DATABASE_URL');
const SUPABASE_URL = envVar('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = envVar('SUPABASE_SERVICE_ROLE_KEY');

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const keepSuperAdmins = args.includes('--keep-super-admins');
const keepEmailsArg = args.find((a) => a.startsWith('--keep-emails='));
const keepClinicaIdsArg = args.find((a) => a.startsWith('--keep-clinica-ids='));
const keepRedeIdsArg = args.find((a) => a.startsWith('--keep-rede-ids='));

const keepEmails = new Set(
  (keepEmailsArg?.split('=')[1] || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const keepClinicaIds = new Set(
  (keepClinicaIdsArg?.split('=')[1] || '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((n) => !Number.isNaN(n)),
);

const keepRedeIds = new Set(
  (keepRedeIdsArg?.split('=')[1] || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltam DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Tabelas operacionais — limpas antes de clínicas/redes/usuários */
const TABELAS_LIMPAR_GERAL = [
  'lembretes_agenda',
  'comissoes_lancamentos',
  'paciente_tratamentos',
  'paciente_anamneses',
  'paciente_documentos',
  'paciente_evolucoes',
  'agendamentos',
  'kanban_cartoes',
  'kanban_colunas',
  'tarefas',
  'despesas',
  'comissoes_regras',
  'planos_tratamentos',
  'planos',
  'pacientes',
  'tratamentos_base',
  'especialidades',
  'tipos_procedimentos',
  'servicos',
  'configuracoes_clinica',
  'profissionais_horarios',
  'permissoes_modulos',
  'notificacoes',
  'audit_log',
  'audit_logs',
  'backups',
  'anexos',
  'anamneses',
  'prontuarios',
];

async function contar(client, tabela) {
  try {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${tabela}"`);
    return rows[0].n;
  } catch {
    return null;
  }
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('=== ORTUS — Limpeza de dados de teste ===\n');
  console.log(confirm ? '⚠️  MODO EXECUÇÃO (--confirm)' : 'ℹ️  MODO SIMULAÇÃO (adicione --confirm para apagar)\n');

  // --- Inventário ---
  const { rows: clinicas } = await client.query('SELECT id, nome, rede_id FROM clinicas ORDER BY id');
  const { rows: redes } = await client.query('SELECT id, nome FROM redes ORDER BY id');
  const { rows: profs } = await client.query(`
    SELECT p.id, p.nome, p.email, p.user_id, COALESCE(p.is_super_admin, false) AS is_super_admin
    FROM profissionais p ORDER BY p.id
  `);
  const { rows: authUsers } = await client.query(`
    SELECT id, email, COALESCE(raw_user_meta_data->>'nome', '') AS nome
    FROM auth.users ORDER BY created_at
  `);

  // Expandir clínicas a manter via rede
  if (keepRedeIds.size) {
    for (const c of clinicas) {
      if (c.rede_id != null && keepRedeIds.has(String(c.rede_id))) {
        keepClinicaIds.add(Number(c.id));
      }
    }
  }

  const authById = new Map(authUsers.map((u) => [u.id, u]));

  function emailDoProf(p) {
    const direto = (p.email || '').toLowerCase();
    if (direto) return direto;
    return (authById.get(p.user_id)?.email || '').toLowerCase();
  }

  const clinicasRemover = clinicas.filter((c) => !keepClinicaIds.has(Number(c.id)));
  const redesRemover = redes.filter((r) => {
    if (keepRedeIds.has(String(r.id))) return false;
    const clinicasDaRede = clinicas.filter((c) => String(c.rede_id) === String(r.id));
    if (clinicasDaRede.length === 0) return true;
    return clinicasDaRede.every((c) => !keepClinicaIds.has(Number(c.id)));
  });

  const profsManter = profs.filter((p) => {
    if (keepEmails.has(emailDoProf(p))) return true;
    if (keepSuperAdmins && p.is_super_admin) return true;
    return false;
  });
  const profIdsManter = new Set(profsManter.map((p) => p.id));
  const userIdsManter = new Set(profsManter.map((p) => p.user_id).filter(Boolean));

  // Manter auth users listados em --keep-emails mesmo sem profissional
  for (const u of authUsers) {
    if (keepEmails.has((u.email || '').toLowerCase())) userIdsManter.add(u.id);
  }

  const profsRemover = profs.filter((p) => !profIdsManter.has(p.id));
  const authRemover = authUsers.filter((u) => !userIdsManter.has(u.id));

  console.log('--- Clínicas ---');
  clinicas.forEach((c) => {
    const tag = keepClinicaIds.has(Number(c.id)) ? 'MANTER' : 'APAGAR';
    console.log(`  [${c.id}] ${c.nome} → ${tag}`);
  });

  console.log('\n--- Redes ---');
  redes.forEach((r) => {
    const tag = redesRemover.some((x) => x.id === r.id) ? 'APAGAR' : 'MANTER';
    console.log(`  [${r.id}] ${r.nome} → ${tag}`);
  });

  console.log('\n--- Profissionais ---');
  profs.forEach((p) => {
    const tag = profIdsManter.has(p.id) ? 'MANTER' : 'APAGAR';
    const sa = p.is_super_admin ? ' [super-admin]' : '';
    console.log(`  [${p.id}] ${p.nome} (${emailDoProf(p) || 'sem email'})${sa} → ${tag}`);
  });

  console.log('\n--- Logins (auth.users) ---');
  authUsers.forEach((u) => {
    const tag = userIdsManter.has(u.id) ? 'MANTER' : 'APAGAR';
    const masked = u.email ? u.email.replace(/(.{2}).+(@.+)/, '$1***$2') : '(sem email)';
    console.log(`  ${masked} → ${tag}`);
  });

  console.log('\n--- Tabelas operacionais (serão esvaziadas) ---');
  for (const t of TABELAS_LIMPAR_GERAL) {
    const n = await contar(client, t);
    if (n != null) console.log(`  ${t}: ${n} registros`);
  }

  if (!confirm) {
    console.log('\n✅ Simulação concluída. Nada foi apagado.');
    console.log('\nExemplos:');
    console.log('  node scripts/clean-db.mjs --confirm --keep-emails=seu@email.com --keep-super-admins');
    console.log('  node scripts/clean-db.mjs --confirm --keep-clinica-ids=17,29');
    await client.end();
    return;
  }

  console.log('\n🗑️  Iniciando limpeza...\n');

  await client.query('BEGIN');
  try {
    // 1. Dados operacionais
    for (const t of TABELAS_LIMPAR_GERAL) {
      const n = await contar(client, t);
      if (n != null && n > 0) {
        await client.query(`DELETE FROM "${t}"`);
        console.log(`  ✓ ${t} (${n} removidos)`);
      }
    }

    // 2. Vínculos profissional-clínica
    if (keepClinicaIds.size) {
      const ids = [...keepClinicaIds];
      await client.query(
        `DELETE FROM profissionais_clinicas WHERE clinica_id NOT IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`,
        ids,
      );
    } else {
      await client.query('DELETE FROM profissionais_clinicas');
    }
    console.log('  ✓ profissionais_clinicas');

    // 3. Clínicas
    if (clinicasRemover.length) {
      const ids = clinicasRemover.map((c) => c.id);
      await client.query(
        `DELETE FROM clinicas WHERE id = ANY($1::bigint[])`,
        [ids],
      );
      console.log(`  ✓ clinicas (${ids.length} removidas)`);
    }

    // 4. Profissionais
    if (profsRemover.length) {
      const ids = profsRemover.map((p) => p.id);
      await client.query(`DELETE FROM profissionais WHERE id = ANY($1::bigint[])`, [ids]);
      console.log(`  ✓ profissionais (${ids.length} removidos)`);
    }

    // 5. Redes órfãs / marcadas
    if (redesRemover.length) {
      const ids = redesRemover.map((r) => r.id);
      await client.query(`DELETE FROM redes WHERE id = ANY($1::uuid[])`, [ids]);
      console.log(`  ✓ redes (${ids.length} removidas)`);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }

  // 6. Auth users (fora da transação SQL — API Admin)
  let authOk = 0;
  let authFail = 0;
  for (const u of authRemover) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) {
      console.warn(`  ⚠ auth: não removeu ${u.email?.replace(/(.{2}).+(@.+)/, '$1***$2')}: ${error.message}`);
      authFail++;
    } else {
      authOk++;
    }
  }
  console.log(`  ✓ auth.users (${authOk} removidos${authFail ? `, ${authFail} falhas` : ''})`);

  // 7. Garantir vínculo dos profissionais mantidos com clínicas mantidas
  if (profIdsManter.size && keepClinicaIds.size) {
    for (const pid of profIdsManter) {
      for (const cid of keepClinicaIds) {
        await client.query(
          `INSERT INTO profissionais_clinicas (profissional_id, clinica_id)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM profissionais_clinicas
             WHERE profissional_id = $1 AND clinica_id = $2
           )`,
          [pid, cid],
        );
      }
    }
    console.log(`  ✓ profissionais_clinicas (vínculos Ortus restaurados)`);
  }

  console.log('\n✅ Limpeza concluída.');
  console.log('Dica: limpe arquivos no Storage (bucket arquivos_ortus) pelo Dashboard se necessário.');

  await client.end();
}

main().catch((e) => {
  console.error('\n❌ ERRO:', e.message);
  process.exit(1);
});
