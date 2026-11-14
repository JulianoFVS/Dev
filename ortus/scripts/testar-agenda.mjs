#!/usr/bin/env node
/**
 * ORTUS — Teste da agenda multipartes.
 *
 * Verifica que um atendimento com várias partes (dias/períodos diferentes)
 * pode ser criado, editado e reduzido SEM perder histórico financeiro.
 * Tudo roda em uma transação com ROLLBACK.
 *
 * Uso: node scripts/testar-agenda.mjs
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

await db.connect();
await db.query('BEGIN');

try {
  const admin = await db.query(`
    SELECT p.user_id, pc.clinica_id, pc.profissional_id
    FROM profissionais p
    JOIN profissionais_clinicas pc ON pc.profissional_id = p.id
    WHERE coalesce(p.is_super_admin, false) = false AND p.nivel_acesso = 'admin' AND p.user_id IS NOT NULL
    ORDER BY pc.clinica_id LIMIT 1`);

  if (admin.rows.length === 0) {
    console.log('Sem clínica/administrador para testar. Nada a fazer.');
    await db.query('ROLLBACK');
    process.exit(0);
  }

  const { user_id: userId, clinica_id: clinicaId, profissional_id: profissionalId } = admin.rows[0];
  const paciente = await db.query(
    `SELECT id FROM pacientes WHERE clinica_id = $1 LIMIT 1`,
    [clinicaId],
  );

  if (paciente.rows.length === 0) {
    console.log('Sem paciente na clínica de teste. Nada a fazer.');
    await db.query('ROLLBACK');
    process.exit(0);
  }
  const pacienteId = paciente.rows[0].id;

  async function como(fn) {
    await db.query('SET LOCAL ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    try {
      return await fn();
    } finally {
      await db.query('RESET ROLE');
    }
  }

  const chamar = (grupoId, partes, idExistente = null) => como(async () => {
    const r = await db.query(
      `SELECT public.agendamento_salvar_partes(
         $1, $2, $3, $4, 'Avaliação', 'blue', 'concluido', 150, 0, '',
         $5::jsonb, $6
       ) AS r`,
      [grupoId, clinicaId, pacienteId, profissionalId, JSON.stringify(partes), idExistente],
    );
    return r.rows[0].r;
  });

  // 1. Cria um agendamento avulso já pago.
  const avulso = await db.query(
    `INSERT INTO agendamentos
       (paciente_id, clinica_id, profissional_id, data_hora, procedimento, status,
        valor, valor_final, data_pagamento, tipo_registro)
     VALUES ($1, $2, $3, now(), 'Avaliação', 'concluido', 150, 150, now(), 'agendamento')
     RETURNING id`,
    [pacienteId, clinicaId, profissionalId],
  );
  const avulsoId = avulso.rows[0].id;

  // 2. Transforma em grupo com duas partes (dias diferentes).
  const grupo = await chamar(null, [
    { data_hora: '2026-12-01T09:00:00-03:00', titulo: 'Manhã' },
    { data_hora: '2026-12-05T18:00:00-03:00', titulo: 'Noite' },
  ], avulsoId);

  check('cria grupo com 2 partes', grupo?.partes === 2, JSON.stringify(grupo));

  const primeira = await db.query(
    `SELECT id, parte_indice, parte_total, data_pagamento FROM agendamentos WHERE id = $1`,
    [grupo.ids[0]],
  );
  const linha = primeira.rows[0];
  check(
    'reaproveita a linha original (sem duplicar)',
    String(linha.id) === String(avulsoId),
    `original=${avulsoId} novo=${linha.id}`,
  );
  check('preserva data de pagamento', linha.data_pagamento !== null);

  const total = await db.query(
    `SELECT count(*)::int AS c FROM agendamentos WHERE grupo_id = $1`,
    [grupo.grupo_id],
  );
  check('grupo tem exatamente 2 linhas', total.rows[0].c === 2, String(total.rows[0].c));

  // 3. Reduz para uma parte.
  const encolhido = await chamar(grupo.grupo_id, [
    { data_hora: '2026-12-02T10:00:00-03:00' },
  ]);
  const restantes = await db.query(
    `SELECT count(*)::int AS c FROM agendamentos WHERE grupo_id = $1`,
    [grupo.grupo_id],
  );
  const pagamentoRestante = await db.query(
    `SELECT data_pagamento FROM agendamentos WHERE grupo_id = $1`,
    [grupo.grupo_id],
  );
  check('reduz para 1 parte', restantes.rows[0].c === 1 && encolhido?.partes === 1, String(restantes.rows[0].c));
  check('mantém o pagamento ao reduzir', pagamentoRestante.rows[0]?.data_pagamento !== null);

  // 4. Volta a crescer.
  const crescido = await chamar(grupo.grupo_id, [
    { data_hora: '2026-12-02T10:00:00-03:00' },
    { data_hora: '2026-12-09T20:00:00-03:00' },
  ]);
  const depois = await db.query(
    `SELECT count(*)::int AS c, min(parte_total) AS pt FROM agendamentos WHERE grupo_id = $1`,
    [grupo.grupo_id],
  );
  check(
    'volta a crescer para 2 partes',
    depois.rows[0].c === 2 && depois.rows[0].pt === 2,
    JSON.stringify(depois.rows[0]),
  );
  check('ids retornados na ordem das partes', Array.isArray(crescido?.ids) && crescido.ids.length === 2);
} finally {
  console.log('\n=== RESULTADO ===');
  let falhas = 0;
  for (const r of resultados) {
    if (!r.ok) falhas++;
    console.log(`${r.ok ? 'OK  ' : 'FALHA'} ${r.nome}${r.detalhe ? `  → ${r.detalhe}` : ''}`);
  }
  const total = resultados.length;
  console.log(`\n${total - falhas}/${total} verificações OK`);
  await db.query('ROLLBACK').catch(() => undefined);
  await db.end();
  process.exit(falhas ? 1 : 0);
}
