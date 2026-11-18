#!/usr/bin/env node
/**
 * ORTUS — Limpeza do banco para o lançamento.
 *
 * Deixa o banco só com os donos da plataforma (contas indicadas em --manter)
 * e apaga o resto: logins, perfis, redes, clínicas, pacientes, prontuário,
 * agenda, financeiro, convites, notificações, assinaturas, relatos, registros
 * internos e os arquivos do R2 e do Storage do Supabase. Não toca no esquema,
 * nas migrations (ortus_schema_migrations) nem no catálogo de planos.
 *
 * SEM PARÂMETROS É SÓ INVENTÁRIO: mostra o projeto, os donos da plataforma
 * com os e-mails, o que mais existe e o que seria apagado. Nada muda.
 *
 * Para apagar, as três coisas juntas (para não rodar no banco errado nem
 * apagar quem deveria ficar):
 *   node scripts/clean-db.mjs --apagar --projeto=<project ref mostrado no inventário> --manter=email1,email2
 *
 * Opções: --sem-arquivos (não mexe no R2/Storage).
 * Variáveis: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * e, para os arquivos, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_PUBLICO, R2_BUCKET_PRIVADO (do ambiente ou de .env.local).
 *
 * Irreversível. Antes de --apagar, confira o backup do Supabase
 * (Database > Backups) e baixe o que quiser guardar.
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { conexaoPg, env, exigir, projectRef } from './_env.mjs';

const args = process.argv.slice(2);
const arg = (nome) => args.find((a) => a.startsWith(`--${nome}=`))?.split('=').slice(1).join('=') ?? null;
const APAGAR = args.includes('--apagar');
const SEM_ARQUIVOS = args.includes('--sem-arquivos');
const manterArg = (arg('manter') || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const projetoArg = arg('projeto');

/** Tabelas que ficam: estrutura do sistema, não dado de cliente. */
const FICAM = new Set(['ortus_schema_migrations', 'planos_saas', 'profissionais']);

exigir('DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
const db = new pg.Client(conexaoPg());
const supa = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const mascarar = (email) => String(email || '').replace(/^(.{2}).*(@.*)$/, '$1***$2');

function clienteR2() {
  const conta = env('R2_ACCOUNT_ID');
  const chave = env('R2_ACCESS_KEY_ID');
  const segredo = env('R2_SECRET_ACCESS_KEY');
  if (!conta || !chave || !segredo) return null;
  const teste = process.env.NODE_ENV !== 'production' ? env('ORTUS_TESTE_URL_R2') : '';
  return new S3Client({
    region: 'auto',
    endpoint: teste || `https://${conta}.r2.cloudflarestorage.com`,
    forcePathStyle: Boolean(teste),
    credentials: { accessKeyId: chave, secretAccessKey: segredo },
  });
}

async function listarR2(s3, bucket) {
  const chaves = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of r.Contents || []) chaves.push({ chave: o.Key, bytes: Number(o.Size || 0) });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return chaves;
}

async function listarStorage(bucket, prefixo = '', saida = [], profundidade = 0) {
  if (profundidade > 6) return saida;
  const { data, error } = await supa.storage.from(bucket).list(prefixo, { limit: 1000 });
  if (error) throw new Error(`Storage ${bucket}: ${error.message}`);
  for (const item of data || []) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
    if (item.id) saida.push({ chave: caminho, bytes: Number(item.metadata?.size || 0) });
    else await listarStorage(bucket, caminho, saida, profundidade + 1);
  }
  return saida;
}

const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const todas = async (sql, p = []) => (await db.query(sql, p)).rows;

let s3 = null;

/** Sai pelo fim do arquivo (fechando o banco e o R2): process.exit() no meio derruba o Node no Windows. */
async function principal() {
  const ref = projectRef() || '(desconhecido)';
  console.log('=== ORTUS — limpeza do banco ===');
  console.log(`Projeto Supabase: ${ref}`);
  console.log(APAGAR ? 'MODO: APAGAR\n' : 'MODO: só inventário (nada é apagado)\n');

  // ---------------------------------------------------------------- donos
  const donos = await todas(`
    SELECT p.id, p.nome, p.user_id, lower(u.email) AS email
      FROM public.profissionais p LEFT JOIN auth.users u ON u.id = p.user_id
     WHERE p.is_super_admin = true ORDER BY p.nome`);
  const parecidos = await todas(`
    SELECT p.nome, lower(u.email) AS email, p.is_super_admin
      FROM public.profissionais p LEFT JOIN auth.users u ON u.id = p.user_id
     WHERE (p.nome ILIKE 'gabriel%' OR p.nome ILIKE 'juliano%') AND NOT coalesce(p.is_super_admin, false)
     ORDER BY p.nome`);
  console.log('Donos da plataforma (is_super_admin):');
  if (!donos.length) console.log('  nenhum');
  for (const d of donos) console.log(`  ${d.nome} — ${d.email || '(sem login)'}`);
  if (parecidos.length) {
    console.log('Outras contas com nome Gabriel/Juliano (NÃO são donos da plataforma):');
    for (const d of parecidos) console.log(`  ${d.nome} — ${d.email || '(sem login)'}`);
  }

  // ---------------------------------------------------------------- inventário
  const tabelas = (await todas(`
    SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`)).map((r) => r.t);
  const contagem = {};
  for (const t of tabelas) contagem[t] = Number((await um(`SELECT count(*)::bigint AS n FROM public."${t}"`)).n);
  const logins = Number((await um(`SELECT count(*)::int AS n FROM auth.users`)).n);
  console.log('\nO que existe hoje:');
  console.log(`  logins (auth.users): ${logins}`);
  for (const t of ['profissionais', 'redes', 'clinicas', 'pacientes', 'agendamentos', 'paciente_evolucoes', 'paciente_documentos', 'paciente_debitos', 'despesas', 'faturas', 'convites_equipe', 'notificacoes', 'armazenamento_objetos']) {
    if (t in contagem) console.log(`  ${t}: ${contagem[t]}`);
  }
  const clinicas = await todas(`SELECT c.id, c.nome, r.nome AS rede FROM public.clinicas c LEFT JOIN public.redes r ON r.id = c.rede_id ORDER BY c.id`);
  if (clinicas.length) {
    console.log('  clínicas:');
    for (const c of clinicas) console.log(`    [${c.id}] ${c.nome}${c.rede ? ` (rede ${c.rede})` : ''}`);
  }

  const arquivos = { r2: {}, storage: {} };
  if (!SEM_ARQUIVOS) {
    s3 = clienteR2();
    for (const bucket of [env('R2_BUCKET_PUBLICO'), env('R2_BUCKET_PRIVADO')].filter(Boolean)) {
      try {
        arquivos.r2[bucket] = s3 ? await listarR2(s3, bucket) : null;
      } catch (e) {
        arquivos.r2[bucket] = { erro: e.message };
      }
    }
    for (const bucket of ['arquivos_ortus', 'avatars']) {
      try {
        arquivos.storage[bucket] = await listarStorage(bucket);
      } catch (e) {
        arquivos.storage[bucket] = { erro: e.message };
      }
    }
    console.log('  arquivos:');
    for (const [tipo, grupo] of Object.entries(arquivos)) {
      for (const [bucket, lista] of Object.entries(grupo)) {
        if (lista === null) console.log(`    ${tipo} ${bucket}: R2 não configurado neste ambiente`);
        else if (lista.erro) console.log(`    ${tipo} ${bucket}: não deu para listar (${lista.erro})`);
        else console.log(`    ${tipo} ${bucket}: ${lista.length} objetos, ${(lista.reduce((s, o) => s + o.bytes, 0) / 1048576).toFixed(1)} MB`);
      }
    }
  }

  // ---------------------------------------------------------------- o que sairia
  const manterUsers = new Set(donos.filter((d) => manterArg.includes(d.email)).map((d) => d.user_id));
  const apagarTabelas = tabelas.filter((t) => !FICAM.has(t));
  console.log('\nSeria apagado:');
  console.log(`  logins: ${logins - manterUsers.size} (ficam ${manterUsers.size}${manterArg.length ? `: ${manterArg.map(mascarar).join(', ')}` : ' — informe --manter'})`);
  console.log(`  perfis (profissionais): ${contagem.profissionais - manterUsers.size}`);
  console.log(`  ${apagarTabelas.length} tabelas esvaziadas: ${apagarTabelas.join(', ')}`);
  console.log('  ficam: esquema, migrations (ortus_schema_migrations), catálogo de planos (planos_saas) e os perfis dos donos mantidos.');
  if (!SEM_ARQUIVOS) console.log('  arquivos: todos os objetos listados acima, menos a foto de perfil dos donos mantidos.');

  if (!APAGAR) {
    console.log('\nNada foi apagado. Para apagar, rode de novo com:');
    console.log(`  --apagar --projeto=${ref} --manter=${donos.map((d) => d.email).filter(Boolean).join(',') || 'email1,email2'}`);
    return 0;
  }

  // ---------------------------------------------------------------- travas
  if (projetoArg !== ref) {
    console.error(`\nRecusado: --projeto=${projetoArg || '(vazio)'} não confere com o projeto deste banco (${ref}).`);
    return 2;
  }
  if (!manterArg.length) {
    console.error('\nRecusado: informe --manter com os e-mails dos donos que ficam.');
    return 2;
  }
  const naoEncontrados = manterArg.filter((e) => !donos.some((d) => d.email === e));
  if (naoEncontrados.length) {
    console.error(`\nRecusado: ${naoEncontrados.join(', ')} não é dono da plataforma neste banco. Só donos (is_super_admin) podem ficar.`);
    return 2;
  }

  // ---------------------------------------------------------------- banco
  console.log('\nApagando...');
  await db.query('BEGIN');
  try {
    if (apagarTabelas.length) await db.query(`TRUNCATE ${apagarTabelas.map((t) => `public."${t}"`).join(', ')} CASCADE`);
    await db.query(`DELETE FROM public.profissionais WHERE user_id IS NULL OR NOT (user_id = ANY($1::uuid[]))`, [[...manterUsers]]);
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
  console.log(`  ✓ ${apagarTabelas.length} tabelas esvaziadas e perfis apagados`);

  // ---------------------------------------------------------------- logins (API do Auth)
  const usuarios = await todas(`SELECT id FROM auth.users WHERE NOT (id = ANY($1::uuid[]))`, [[...manterUsers]]);
  let ok = 0;
  const falhas = [];
  for (const u of usuarios) {
    const { error } = await supa.auth.admin.deleteUser(u.id);
    if (error) falhas.push(error.message);
    else ok += 1;
  }
  console.log(`  ✓ logins apagados: ${ok}${falhas.length ? ` (${falhas.length} falharam: ${[...new Set(falhas)].join('; ')})` : ''}`);

  // ---------------------------------------------------------------- arquivos
  if (!SEM_ARQUIVOS) {
    const fotoDeDono = new Set([...manterUsers].flatMap((id) => [`avatares/${id}/avatar.jpg`, `${id}/avatar.jpg`]));
    for (const [bucket, lista] of Object.entries(arquivos.r2)) {
      if (!Array.isArray(lista) || !s3) continue;
      const alvo = lista.filter((o) => !fotoDeDono.has(o.chave));
      let apagados = 0;
      let falharam = 0;
      for (const o of alvo) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.chave }));
          apagados += 1;
        } catch {
          falharam += 1;
        }
      }
      console.log(`  ✓ R2 ${bucket}: ${apagados} objetos apagados${falharam ? ` (${falharam} falharam: rode de novo)` : ''}`);
    }
    for (const [bucket, lista] of Object.entries(arquivos.storage)) {
      if (!Array.isArray(lista)) continue;
      const alvo = lista.map((o) => o.chave).filter((c) => !fotoDeDono.has(c));
      for (let i = 0; i < alvo.length; i += 100) {
        const { error } = await supa.storage.from(bucket).remove(alvo.slice(i, i + 100));
        if (error) console.warn(`  ⚠ Storage ${bucket}: ${error.message}`);
      }
      console.log(`  ✓ Storage ${bucket}: ${alvo.length} objetos apagados`);
    }
  }

  // Registro da própria limpeza (a trilha antiga foi esvaziada junto com o resto).
  await db.query(
    `INSERT INTO public.audit_log (profissional_nome, acao, entidade, detalhes) VALUES ('Limpeza do banco', 'excluiu', 'banco', $1::jsonb)`,
    [JSON.stringify({ projeto: ref, mantidos: manterArg.map(mascarar), tabelas: apagarTabelas.length, logins_apagados: ok, quando: new Date().toISOString() })],
  ).catch(() => undefined);

  const restante = await um(`SELECT (SELECT count(*)::int FROM auth.users) AS logins, (SELECT count(*)::int FROM public.profissionais) AS perfis, (SELECT count(*)::int FROM public.clinicas) AS clinicas, (SELECT count(*)::int FROM public.pacientes) AS pacientes`);
  console.log(`\nPronto. Ficou: ${restante.logins} logins, ${restante.perfis} perfis, ${restante.clinicas} clínicas, ${restante.pacientes} pacientes.`);
  return 0;
}

await db.connect();
try {
  process.exitCode = await principal();
} catch (e) {
  console.error('\nERRO:', e.message);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => undefined);
  s3?.destroy();
}
