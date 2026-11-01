import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function tentar(rotulo, sql, params = []) {
  await db.query('SAVEPOINT t');
  try {
    const r = await db.query(sql, params);
    const valor = r.rows[0] ? Object.values(r.rows[0])[0] : `${r.rowCount} linha(s)`;
    console.log(`  ${rotulo}: ${valor}`);
  } catch (err) {
    console.log(`  ${rotulo}: BLOQUEADO (${err.message.split('\n')[0]})`);
  }
  await db.query('ROLLBACK TO SAVEPOINT t');
}

await db.connect();
try {
  const { rows: [comum] } = await db.query(`
    SELECT p.id, p.user_id, pc.clinica_id
    FROM profissionais p JOIN profissionais_clinicas pc ON pc.profissional_id = p.id
    WHERE COALESCE(p.is_super_admin, false) = false AND p.user_id IS NOT NULL
    ORDER BY (p.nivel_acesso = 'admin') DESC LIMIT 1`);
  const { rows: [outra] } = await db.query(`
    SELECT id FROM clinicas WHERE id NOT IN (
      SELECT clinica_id FROM profissionais_clinicas WHERE profissional_id = $1) LIMIT 1`, [comum.id]);
  const { rows: [totais] } = await db.query(`SELECT (SELECT count(*) FROM pacientes) AS pacientes, (SELECT count(*) FROM pacientes WHERE clinica_id = $1) AS da_clinica`, [comum.clinica_id]);
  console.log(`Total de pacientes no banco: ${totais.pacientes}; na clínica do usuário de teste: ${totais.da_clinica}`);

  await db.query('BEGIN');

  console.log('\nVisitante sem login (chave pública):');
  await db.query(`SET LOCAL ROLE anon`);
  await db.query(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  for (const tabela of ['pacientes', 'agendamentos', 'profissionais', 'profissionais_clinicas', 'prontuarios', 'clinicas', 'redes', 'backups', 'armazenamento_objetos']) {
    await tentar(`ler ${tabela}`, `SELECT count(*) FROM ${tabela}`);
  }
  await tentar('apagar pacientes', `DELETE FROM pacientes`);
  await tentar('restaurar backup', `SELECT restaurar_backup(gen_random_uuid())`);
  await tentar('criar backup', `SELECT criar_backup_completo('x', 'manual')`);
  await tentar('reservar armazenamento', `SELECT armazenamento_reservar('x', 1, 1, gen_random_uuid(), 1, false)`);
  await db.query('RESET ROLE');

  console.log(`\nUsuário logado comum (profissional ${comum.id}, clínica ${comum.clinica_id}):`);
  await db.query(`SET LOCAL ROLE authenticated`);
  await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: comum.user_id, role: 'authenticated' })]);
  await tentar('pacientes visíveis', `SELECT count(*) FROM pacientes`);
  await tentar('virar super admin', `UPDATE profissionais SET is_super_admin = true WHERE user_id = auth.uid()`);
  await tentar('aumentar limite da clínica', `UPDATE clinicas SET limite_armazenamento_mb = 99999 WHERE id = $1`, [comum.clinica_id]);
  if (outra) {
    await tentar('se vincular a outra clínica', `INSERT INTO profissionais_clinicas (profissional_id, clinica_id) VALUES ($1, $2)`, [comum.id, outra.id]);
    await tentar('ler pacientes de outra clínica', `SELECT count(*) FROM pacientes WHERE clinica_id = $1`, [outra.id]);
  }
  await tentar('ler backups', `SELECT count(*) FROM backups`);
  await tentar('restaurar backup', `SELECT restaurar_backup(gen_random_uuid())`);
  await tentar('enviar avatar com nome livre', `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars', auth.uid()::text || '/x.jpg', auth.uid())`);
  await tentar('enviar em arquivos_ortus direto', `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('arquivos_ortus', 'pacientes/x/y.pdf', auth.uid())`);

  await db.query('ROLLBACK');
  console.log('\nNada foi gravado (transação desfeita).');
} finally {
  await db.end();
}
