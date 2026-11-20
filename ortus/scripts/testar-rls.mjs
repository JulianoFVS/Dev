#!/usr/bin/env node
/**
 * ORTUS — Suíte de verificação de segurança do banco.
 *
 * Roda tudo dentro de UMA transação e faz ROLLBACK no final: nenhum dado
 * real é criado, alterado ou apagado. Os personagens do teste (duas redes,
 * duas clínicas, administradores, um membro comum, um convidado e pacientes)
 * são criados dentro da própria transação e somem com ela — por isso a suíte
 * vale igual num banco cheio e num banco só com os donos da plataforma.
 *
 * Cada ação é feita no papel `authenticated` com as claims do JWT, exatamente
 * como o PostgREST faz, então quem responde é a RLS de verdade.
 *
 * Uso:  npm test
 *       ORTUS_SUPER_ADMINS="a@x.com,b@y.com" npm test   (confere os donos)
 * Sai com código 1 se qualquer verificação falhar.
 */
import pg from 'pg';
import crypto from 'node:crypto';
import { conexaoPg, env, projectRef } from './_env.mjs';

const db = new pg.Client(conexaoPg());
const resultados = [];
const check = (grupo, nome, ok, detalhe = '') => resultados.push({ grupo, nome, ok: Boolean(ok), detalhe });
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const mascarar = (email) => String(email || '').replace(/^(.{2}).*(@.*)$/, '$1***$2');

async function limparClaims() {
  await db.query('RESET ROLE').catch(() => undefined);
  await db.query(`SELECT set_config('request.jwt.claims', '', true)`).catch(() => undefined);
}

/**
 * Executa fn como o usuário. Por padrão desfaz o que fn gravou (savepoint),
 * para um teste não contaminar o seguinte; `manter` deixa o efeito na
 * transação (que ainda termina em ROLLBACK geral).
 */
async function como(user, fn, { manter = false } = {}) {
  await db.query('SAVEPOINT sp');
  try {
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user.sub, email: user.email, role: 'authenticated' }),
    ]);
    await db.query('SET LOCAL ROLE authenticated');
    const r = await fn();
    await limparClaims();
    await db.query(manter ? 'RELEASE SAVEPOINT sp' : 'ROLLBACK TO SAVEPOINT sp');
    return r;
  } catch (e) {
    await db.query('ROLLBACK TO SAVEPOINT sp');
    await limparClaims();
    return { erro: e.message, codigo: e.code };
  }
}

/** true quando a ação falha OU não atinge nenhuma linha. */
async function barrado(user, sql, params = []) {
  const r = await como(user, async () => (await db.query(sql, params)).rowCount);
  return Boolean(r?.erro) || r === 0;
}
async function linhas(user, sql, params = [], opcoes) {
  return como(user, async () => (await db.query(sql, params)).rowCount, opcoes);
}

await db.connect();
console.log(`Projeto: ${projectRef()}\n`);
await db.query('BEGIN');

try {
  // ==================================================================
  // 1. Estrutura
  // ==================================================================
  const G1 = 'Estrutura';
  const semRls = await rows(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity ORDER BY 1`);
  check(G1, 'RLS ligada em todas as tabelas de public', semRls.length === 0, semRls.map((r) => r.relname).join(', '));

  // Tabela com RLS e sem policy = ninguém acessa pela API. Só é aceitável
  // nas tabelas internas, que o app só toca pelo servidor (service role).
  const INTERNAS = new Set(['armazenamento_envios', 'armazenamento_objetos', 'ortus_schema_migrations', 'limites_publicos']);
  const semPolicy = await rows(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) ORDER BY 1`);
  const inesperadas = semPolicy.map((r) => r.relname).filter((t) => !INTERNAS.has(t));
  check(G1, 'só tabelas internas ficam sem policy', inesperadas.length === 0, inesperadas.join(', '));

  const abertas = await rows(`
    SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND cmd <> 'SELECT'
      AND (coalesce(qual, '') = 'true' OR coalesce(with_check, '') = 'true')`);
  check(G1, 'nenhuma policy de escrita com "true"', abertas.length === 0, abertas.map((p) => `${p.tablename}.${p.policyname}`).join(', '));

  const paraVisitante = await rows(`
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname IN ('public', 'storage') AND (roles::text LIKE '%anon%' OR roles::text = '{public}')`);
  check(G1, 'nenhuma policy vale para visitante', paraVisitante.length === 0, paraVisitante.map((p) => `${p.tablename}.${p.policyname}`).join(', '));

  const bucketsPublicos = await rows(`SELECT id FROM storage.buckets WHERE public = true`);
  check(G1, 'nenhum bucket público', bucketsPublicos.length === 0, bucketsPublicos.map((r) => r.id).join(', '));

  const grantsAnon = await rows(`
    SELECT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public' GROUP BY 1 ORDER BY 1`);
  check(G1, 'anon sem acesso a tabelas do domínio', grantsAnon.length === 0, grantsAnon.map((r) => r.table_name).join(', '));

  const execAnon = await rows(`
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE') ORDER BY 1`);
  check(G1, 'anon sem EXECUTE em funções', execAnon.length === 0, execAnon.map((r) => r.proname).join(', '));

  const definerSolto = await rows(`
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%') ORDER BY 1`);
  check(G1, 'toda função SECURITY DEFINER fixa o search_path', definerSolto.length === 0, definerSolto.map((r) => r.proname).join(', '));

  const viewsDefiner = await rows(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND NOT coalesce(c.reloptions::text, '') LIKE '%security_invoker=true%' ORDER BY 1`);
  check(G1, 'views respeitam a RLS de quem consulta', viewsDefiner.length === 0, viewsDefiner.map((r) => r.relname).join(', '));

  const criaObjeto = await rows(`
    SELECT r FROM unnest(ARRAY['anon', 'authenticated']) AS r WHERE has_schema_privilege(r, 'public', 'CREATE')`);
  check(G1, 'ninguém cria objeto em public pela API', criaObjeto.length === 0, criaObjeto.map((r) => r.r).join(', '));

  // Donos da plataforma: sempre lista (mascarado); confere quando informado.
  const donos = await rows(`
    SELECT lower(u.email) AS email FROM public.profissionais p LEFT JOIN auth.users u ON u.id = p.user_id
    WHERE p.is_super_admin = true ORDER BY 1`);
  const esperados = env('ORTUS_SUPER_ADMINS').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).sort();
  const atuais = donos.map((d) => d.email || '(sem login)');
  if (esperados.length) {
    check(G1, 'is_super_admin só nos donos informados', JSON.stringify(atuais) === JSON.stringify(esperados),
      `no banco: ${atuais.map(mascarar).join(', ') || 'nenhum'}`);
  } else {
    check(G1, `super-admins no banco: ${atuais.length} (${atuais.map(mascarar).join(', ') || 'nenhum'})`, atuais.length > 0,
      'defina ORTUS_SUPER_ADMINS para conferir os e-mails');
  }

  // ==================================================================
  // 2. Personagens (existem só dentro desta transação)
  // ==================================================================
  const marca = crypto.randomBytes(4).toString('hex');
  const um = async (sql, params = []) => (await db.query(sql, params)).rows[0];

  async function criarPessoa(apelido, nivel, superAdmin = false) {
    const id = crypto.randomUUID();
    const email = `rls-${apelido}-${marca}@ortus.invalid`;
    await db.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
      [id, email],
    );
    // Se o banco tiver um gatilho que já cria o perfil, reaproveita.
    let prof = await um(`SELECT id FROM public.profissionais WHERE user_id = $1`, [id]);
    if (prof) {
      await db.query(`UPDATE public.profissionais SET nome = $2, nivel_acesso = $3, is_super_admin = $4 WHERE id = $1`, [prof.id, `RLS ${apelido}`, nivel, superAdmin]);
    } else {
      prof = await um(
        `INSERT INTO public.profissionais (user_id, nome, cargo, nivel_acesso, is_super_admin) VALUES ($1, $2, 'Dentista', $3, $4) RETURNING id`,
        [id, `RLS ${apelido}`, nivel, superAdmin],
      );
    }
    return { sub: id, email, prof: Number(prof.id) };
  }

  const redeX = await um(`INSERT INTO public.redes (nome) VALUES ($1) RETURNING id`, [`RLS Rede X ${marca}`]);
  const redeY = await um(`INSERT INTO public.redes (nome) VALUES ($1) RETURNING id`, [`RLS Rede Y ${marca}`]);
  const clinX = Number((await um(`INSERT INTO public.clinicas (nome, rede_id) VALUES ($1, $2) RETURNING id`, [`RLS Clínica X ${marca}`, redeX.id])).id);
  const clinY = Number((await um(`INSERT INTO public.clinicas (nome, rede_id) VALUES ($1, $2) RETURNING id`, [`RLS Clínica Y ${marca}`, redeY.id])).id);

  const adminX = await criarPessoa('admin-x', 'admin');
  const comumX = await criarPessoa('comum-x', 'comum');
  const adminY = await criarPessoa('admin-y', 'admin');
  const comumY = await criarPessoa('comum-y', 'comum');
  const dono = await criarPessoa('dono', 'admin', true);
  const semClinica = await criarPessoa('sem-clinica', 'admin');

  for (const [pessoa, clinica] of [[adminX, clinX], [comumX, clinX], [adminY, clinY], [comumY, clinY]]) {
    await db.query(`INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id) VALUES ($1, $2)`, [pessoa.prof, clinica]);
  }
  const pacX = (await um(`INSERT INTO public.pacientes (nome, telefone, clinica_id) VALUES ('RLS Paciente X', '11999990000', $1) RETURNING id`, [clinX])).id;
  const pacY = (await um(`INSERT INTO public.pacientes (nome, telefone, clinica_id) VALUES ('RLS Paciente Y', '11999990001', $1) RETURNING id`, [clinY])).id;
  const agX = Number((await um(
    `INSERT INTO public.agendamentos (paciente_id, clinica_id, profissional_id, data_hora, procedimento, status)
     VALUES ($1, $2, $3, now() + interval '1 day', 'RLS', 'agendado') RETURNING id`, [pacX, clinX, adminX.prof])).id);
  const agY = Number((await um(
    `INSERT INTO public.agendamentos (paciente_id, clinica_id, profissional_id, data_hora, procedimento, status)
     VALUES ($1, $2, $3, now() + interval '1 day', 'RLS', 'agendado') RETURNING id`, [pacY, clinY, adminY.prof])).id);

  // ==================================================================
  // 3. Isolamento entre clínicas
  // ==================================================================
  const G3 = 'Isolamento entre clínicas';
  const vistos = await como(comumX, () => rows(`SELECT DISTINCT clinica_id FROM public.pacientes`));
  check(G3, 'membro só vê pacientes da própria clínica', !vistos.erro && vistos.length === 1 && Number(vistos[0].clinica_id) === clinX, JSON.stringify(vistos));
  const clinicasVistas = await como(comumX, () => rows(`SELECT id FROM public.clinicas`));
  check(G3, 'membro só vê as próprias clínicas', !clinicasVistas.erro && clinicasVistas.length === 1 && Number(clinicasVistas[0].id) === clinX, JSON.stringify(clinicasVistas));
  const alheio = await como(adminX, () => rows(`SELECT id FROM public.pacientes WHERE id = $1`, [pacY]));
  check(G3, 'administrador não lê paciente de outra clínica', !alheio.erro && alheio.length === 0, JSON.stringify(alheio));
  check(G3, 'administrador não altera paciente de outra clínica', await barrado(adminX, `UPDATE public.pacientes SET nome = 'x' WHERE id = $1`, [pacY]));
  check(G3, 'administrador não apaga paciente de outra clínica', await barrado(adminX, `DELETE FROM public.pacientes WHERE id = $1`, [pacY]));
  check(G3, 'ninguém cadastra paciente em clínica alheia', await barrado(adminX, `INSERT INTO public.pacientes (nome, telefone, clinica_id) VALUES ('x', '1', $1)`, [clinY]));
  check(G3, 'ninguém move o próprio paciente para clínica alheia', await barrado(adminX, `UPDATE public.pacientes SET clinica_id = $2 WHERE id = $1`, [pacX, clinY]));
  for (const tabela of ['paciente_tratamentos', 'paciente_anamneses', 'paciente_documentos', 'paciente_evolucoes', 'paciente_debitos']) {
    const r = await como(adminX, () => rows(`SELECT 1 FROM public.${tabela} WHERE paciente_id = $1`, [pacY]));
    check(G3, `prontuário alheio fechado (${tabela})`, !r.erro && r.length === 0, r.erro || '');
  }
  check(G3, 'ninguém grava evolução em paciente alheio', await barrado(adminX, `INSERT INTO public.paciente_evolucoes (paciente_id, texto, data) VALUES ($1, 'x', current_date)`, [pacY]));
  check(G3, 'ninguém grava débito em paciente alheio', await barrado(adminX, `INSERT INTO public.paciente_debitos (paciente_id, clinica_id, descricao, valor, status) VALUES ($1, $2, 'x', 1, 'pendente')`, [pacY, clinY]));
  check(G3, 'conta sem clínica não lê nenhum paciente', (await como(semClinica, () => rows(`SELECT id FROM public.pacientes`))).length === 0);

  const equipeAlheia = await como(adminX, () => rows(`SELECT id FROM public.profissionais WHERE id = $1`, [adminY.prof]));
  check(G3, 'não enxerga a equipe de outra rede', !equipeAlheia.erro && equipeAlheia.length === 0, JSON.stringify(equipeAlheia));

  // ==================================================================
  // 4. Privilégios dentro da clínica
  // ==================================================================
  const G4 = 'Privilégios dentro da clínica';
  check(G4, 'membro comum NÃO exclui paciente da própria clínica', await barrado(comumX, `DELETE FROM public.pacientes WHERE id = $1`, [pacX]));
  check(G4, 'administrador exclui paciente da própria clínica', (await linhas(adminX, `DELETE FROM public.pacientes WHERE id = $1`, [pacX])) === 1);
  check(G4, 'membro comum não escreve em configuracoes_clinica',
    await barrado(comumX, `INSERT INTO public.configuracoes_clinica (clinica_id, chave, valor) VALUES ($1, 'teste_rls', '{}'::jsonb)`, [clinX]));
  check(G4, 'administrador escreve em configuracoes_clinica',
    (await linhas(adminX, `INSERT INTO public.configuracoes_clinica (clinica_id, chave, valor) VALUES ($1, 'teste_rls', '{}'::jsonb)`, [clinX])) === 1);
  check(G4, 'membro comum não escreve no catálogo global', await barrado(comumX, `INSERT INTO public.servicos (nome) VALUES ('teste')`));
  check(G4, 'membro comum não muda permissões de módulo',
    await barrado(comumX, `INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar) VALUES ($1, $2, 'financeiro', true)`, [comumX.prof, clinX]));
  check(G4, 'membro comum não se vincula a outra clínica',
    await barrado(comumX, `INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id) VALUES ($1, $2)`, [comumX.prof, clinY]));
  check(G4, 'administrador não se vincula a clínica de outra rede',
    await barrado(adminX, `INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id) VALUES ($1, $2)`, [adminX.prof, clinY]));
  check(G4, 'ninguém muda o limite de armazenamento da clínica',
    await barrado(adminX, `UPDATE public.clinicas SET limite_armazenamento_mb = 999999 WHERE id = $1`, [clinX]));
  check(G4, 'ninguém move a clínica para outra rede',
    await barrado(adminX, `UPDATE public.clinicas SET rede_id = $2 WHERE id = $1`, [clinX, redeY.id]));

  // ==================================================================
  // 5. Forja e escalada
  // ==================================================================
  const G5 = 'Forja e escalada';
  check(G5, 'ninguém forja notificação para terceiro',
    await barrado(comumX, `INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo) VALUES ($1, 'x', 'y', 'mensagem')`, [adminY.sub]));
  check(G5, 'ninguém se promove a super-admin', await barrado(comumX, `UPDATE public.profissionais SET is_super_admin = true WHERE user_id = auth.uid()`));
  check(G5, 'administrador não se promove a super-admin', await barrado(adminX, `UPDATE public.profissionais SET is_super_admin = true WHERE user_id = auth.uid()`));
  check(G5, 'membro comum não se promove a administrador', await barrado(comumX, `UPDATE public.profissionais SET nivel_acesso = 'admin' WHERE user_id = auth.uid()`));
  check(G5, 'ninguém troca o login dono do próprio perfil', await barrado(comumX, `UPDATE public.profissionais SET user_id = $1 WHERE user_id = auth.uid()`, [adminX.sub]));
  check(G5, 'ninguém cria perfil profissional pela API',
    await barrado(adminX, `INSERT INTO public.profissionais (nome, nivel_acesso, is_super_admin) VALUES ('x', 'admin', true)`));
  check(G5, 'ninguém altera o perfil de um dono da plataforma', await barrado(adminX, `UPDATE public.profissionais SET nome = 'x' WHERE id = $1`, [dono.prof]));
  check(G5, 'ninguém forja registro de auditoria em nome de outro',
    await barrado(comumX, `INSERT INTO public.audit_log (user_id, acao, entidade) VALUES ($1, 'x', 'y')`, [adminX.sub]));
  check(G5, 'ninguém apaga a trilha de auditoria', await barrado(adminX, `DELETE FROM public.audit_log`));

  // ==================================================================
  // 6. Painel SaaS (só donos)
  // ==================================================================
  const G6 = 'Painel SaaS';
  check(G6, 'saas_visao_geral bloqueada para administrador de clínica', Boolean((await como(adminX, () => db.query(`SELECT public.saas_visao_geral()`))).erro));
  check(G6, 'saas_rede_detalhe bloqueada para administrador de clínica', Boolean((await como(adminX, () => db.query(`SELECT public.saas_rede_detalhe($1)`, [redeX.id]))).erro));
  check(G6, 'administrador de clínica não lê faturas', (await como(adminX, () => rows(`SELECT id FROM public.faturas`))).length === 0);
  check(G6, 'administrador de clínica não cria fatura', await barrado(adminX, `INSERT INTO public.faturas (rede_id, competencia, vencimento, valor_centavos) VALUES ($1, current_date, current_date, 100)`, [redeX.id]));
  check(G6, 'administrador de clínica não cria rede', await barrado(adminX, `INSERT INTO public.redes (nome) VALUES ('x')`));
  check(G6, 'backup completo negado para administrador de clínica', Boolean((await como(adminX, () => db.query(`SELECT public.criar_backup_completo('manual', 'x')`))).erro));
  check(G6, 'restauração negada para administrador de clínica', Boolean((await como(adminX, () => db.query(`SELECT public.restaurar_backup(1)`))).erro));
  const visao = await como(dono, () => rows(`SELECT public.saas_visao_geral() AS v`));
  check(G6, 'saas_visao_geral liberada para dono', !visao.erro && Array.isArray(visao[0]?.v?.redes), visao.erro || '');
  const fat = await como(dono, () => rows(`SELECT count(*)::int AS c FROM public.faturas`));
  check(G6, 'dono lê faturas', !fat.erro, fat.erro || '');

  // ==================================================================
  // 7. Convites de equipe e vínculo de convidado
  // ==================================================================
  const G7 = 'Convites';
  check(G7, 'membro comum não convida equipe', Boolean((await como(comumX, () => db.query(`SELECT public.equipe_convidar($1, $2::bigint[])`, [adminY.email, [clinX]]))).erro));
  check(G7, 'administrador não convida para clínica alheia', Boolean((await como(adminX, () => db.query(`SELECT public.equipe_convidar($1, $2::bigint[])`, [comumY.email, [clinY]]))).erro));
  check(G7, 'ninguém responde convite que não existe', Boolean((await como(comumX, () => db.query(`SELECT public.equipe_responder_convite(999999999, true)`))).erro));

  // adminY convida adminX (que é administrador na rede X) para a clínica Y.
  const convite = await como(adminY, () => rows(`SELECT public.equipe_convidar($1, $2::bigint[], 'Dentista', 'teste') AS c`, [adminX.email, [clinY]]), { manter: true });
  const conviteId = convite?.[0]?.c?.id;
  check(G7, 'administrador convida pessoa de outra rede', !convite.erro && conviteId != null, convite.erro || '');
  if (conviteId != null) {
    check(G7, 'terceiro não aceita convite alheio', Boolean((await como(comumX, () => db.query(`SELECT public.equipe_responder_convite($1, true)`, [conviteId]))).erro));
    // O e-mail do convite leva uma chave; no banco fica só o resumo (como a rota de aviso faz).
    const chave = crypto.randomBytes(24).toString('base64url');
    // Banco sem a migration de 25/11 não tem a coluna: o teste segue e as verificações abaixo acusam o buraco.
    await db.query('SAVEPOINT chave');
    try {
      await db.query(`UPDATE public.convites_equipe SET aceite_hash = encode(sha256(convert_to($2, 'UTF8')), 'hex') WHERE id = $1`, [conviteId, chave]);
      await db.query('RELEASE SAVEPOINT chave');
    } catch {
      await db.query('ROLLBACK TO SAVEPOINT chave');
    }
    const semLink = await como(adminX, () => db.query(`SELECT public.equipe_responder_convite($1, true)`, [conviteId]));
    check(G7, 'convidado não aceita sem abrir o link do e-mail', /link do convite/.test(semLink?.erro || ''), semLink?.erro || 'aceitou sem o link');
    check(G7, 'chave errada não confirma o convite',
      Boolean((await como(adminX, () => db.query(`SELECT public.equipe_confirmar_email($1, $2)`, [conviteId, 'chave-errada']))).erro));
    check(G7, 'outra pessoa não confirma convite alheio, nem com a chave certa',
      Boolean((await como(comumX, () => db.query(`SELECT public.equipe_confirmar_email($1, $2)`, [conviteId, chave]))).erro));
    check(G7, 'convidado não se dá a confirmação por UPDATE direto',
      await barrado(adminX, `UPDATE public.convites_equipe SET email_confirmado_por = auth.uid() WHERE id = $1`, [conviteId]));
    const confirmou = await como(adminX, () => db.query(`SELECT public.equipe_confirmar_email($1, $2)`, [conviteId, chave]), { manter: true });
    check(G7, 'convidado confirma o convite com o link do e-mail', !confirmou?.erro, confirmou?.erro || '');
    const aceite = await como(adminX, () => rows(`SELECT public.equipe_responder_convite($1, true) AS r`, [conviteId]), { manter: true });
    check(G7, 'convidado aceita o próprio convite', !aceite.erro && aceite[0]?.r?.status === 'aceito', aceite.erro || '');
    // to_jsonb: se a coluna ainda não existir (migration de reforço não aplicada), o teste falha em vez de abortar.
    const vinculo = await um(`SELECT to_jsonb(pc) ->> 'convidado' AS convidado FROM public.profissionais_clinicas pc WHERE profissional_id = $1 AND clinica_id = $2`, [adminX.prof, clinY]);
    check(G7, 'vínculo nasce marcado como convidado', vinculo?.convidado === 'true', JSON.stringify(vinculo));
    const modulos = await rows(`SELECT modulo FROM public.permissoes_modulos WHERE profissional_id = $1 AND clinica_id = $2 AND pode_acessar`, [adminX.prof, clinY]);
    check(G7, 'convidado recebe os módulos do cargo', modulos.length > 0, modulos.map((m) => m.modulo).join(', '));

    const leY = await como(adminX, () => rows(`SELECT id FROM public.pacientes WHERE id = $1`, [pacY]));
    check(G7, 'convidado passa a ler os pacientes da clínica que o convidou', !leY.erro && leY.length === 1, leY.erro || '');
    check(G7, 'convidado (admin em casa) NÃO exclui paciente da clínica que o convidou', await barrado(adminX, `DELETE FROM public.pacientes WHERE id = $1`, [pacY]));
    check(G7, 'convidado NÃO muda configuração da clínica que o convidou',
      await barrado(adminX, `INSERT INTO public.configuracoes_clinica (clinica_id, chave, valor) VALUES ($1, 'teste_rls', '{}'::jsonb)`, [clinY]));
    check(G7, 'convidado NÃO muda permissões na clínica que o convidou',
      await barrado(adminX, `UPDATE public.permissoes_modulos SET pode_acessar = true WHERE profissional_id = $1 AND clinica_id = $2`, [adminX.prof, clinY]));
    check(G7, 'convidado NÃO convida gente para a clínica que o convidou',
      Boolean((await como(adminX, () => db.query(`SELECT public.equipe_convidar($1, $2::bigint[])`, [comumX.email, [clinY]]))).erro));
    check(G7, 'convidado NÃO remove colegas da clínica que o convidou',
      await barrado(adminX, `DELETE FROM public.profissionais_clinicas WHERE profissional_id = $1 AND clinica_id = $2`, [comumY.prof, clinY]));
    check(G7, 'convidado NÃO vira membro comum por conta própria',
      await barrado(adminX, `UPDATE public.profissionais_clinicas SET convidado = false WHERE profissional_id = $1 AND clinica_id = $2`, [adminX.prof, clinY]));
    check(G7, 'convidado NÃO edita o perfil de quem o convidou', await barrado(adminX, `UPDATE public.profissionais SET nome = 'x' WHERE id = $1`, [adminY.prof]));

    check(G7, 'quem convidou NÃO edita o perfil do convidado', await barrado(adminY, `UPDATE public.profissionais SET nome = 'x' WHERE id = $1`, [adminX.prof]));
    check(G7, 'quem convidou NÃO rebaixa o convidado na clínica de origem', await barrado(adminY, `UPDATE public.profissionais SET nivel_acesso = 'comum' WHERE id = $1`, [adminX.prof]));
    check(G7, 'quem convidou NÃO apaga o perfil do convidado', await barrado(adminY, `DELETE FROM public.profissionais WHERE id = $1`, [adminX.prof]));
    check(G7, 'quem convidou NÃO transforma o convidado em membro da casa',
      await barrado(adminY, `UPDATE public.profissionais_clinicas SET convidado = false WHERE profissional_id = $1 AND clinica_id = $2`, [adminX.prof, clinY]));
    check(G7, 'quem convidou remove o vínculo do convidado',
      (await linhas(adminY, `DELETE FROM public.profissionais_clinicas WHERE profissional_id = $1 AND clinica_id = $2`, [adminX.prof, clinY])) === 1);
    check(G7, 'convidado continua administrador na clínica de origem',
      (await linhas(adminX, `DELETE FROM public.pacientes WHERE id = $1`, [pacX])) === 1);
  }

  // ==================================================================
  // 8. Agenda
  // ==================================================================
  const G8 = 'Agenda';
  check(G8, 'membro não lê agenda de outra clínica', (await como(comumX, () => rows(`SELECT id FROM public.agendamentos WHERE id = $1`, [agY]))).length === 0);
  check(G8, 'membro não agenda em clínica alheia',
    await barrado(comumX, `INSERT INTO public.agendamentos (paciente_id, clinica_id, data_hora, procedimento, status) VALUES ($1, $2, now(), 'x', 'agendado')`, [pacY, clinY]));
  check(G8, 'membro não altera agendamento de outra clínica', await barrado(comumX, `UPDATE public.agendamentos SET status = 'cancelado' WHERE id = $1`, [agY]));
  check(G8, 'membro não move agendamento para clínica alheia', await barrado(comumX, `UPDATE public.agendamentos SET clinica_id = $2 WHERE id = $1`, [agX, clinY]));
  check(G8, 'membro agenda na própria clínica',
    (await linhas(comumX, `INSERT INTO public.agendamentos (paciente_id, clinica_id, data_hora, procedimento, status) VALUES ($1, $2, now() + interval '2 days', 'x', 'agendado')`, [pacX, clinX])) === 1);
  check(G8, 'agenda em partes não grava em clínica alheia',
    Boolean((await como(comumX, () => db.query(`SELECT public.agendamento_salvar_partes(
      NULL, $1, gen_random_uuid(), NULL, 'x', 'blue', 'agendado', 0, 0, '', '[{"data_hora":"2026-01-01T09:00:00-03:00"}]'::jsonb)`, [clinY]))).erro));
  check(G8, 'lembrete de outra clínica não é lido', (await como(comumX, () => rows(`SELECT id FROM public.lembretes_agenda WHERE clinica_id = $1`, [clinY]))).length === 0);

  // ==================================================================
  // 9. Arquivos e tabelas internas
  // ==================================================================
  const G9 = 'Arquivos e tabelas internas';
  const caminhoY = `pacientes/${pacY}/documentos/laudo.pdf`;
  const caminhoX = `pacientes/${pacX}/documentos/laudo.pdf`;
  const permY = await como(comumX, () => rows(`SELECT public.storage_caminho_permitido($1) AS ok`, [caminhoY]));
  check(G9, 'caminho de arquivo de paciente alheio é negado', !permY.erro && permY[0]?.ok === false, permY.erro || JSON.stringify(permY));
  const permX = await como(comumX, () => rows(`SELECT public.storage_caminho_permitido($1) AS ok`, [caminhoX]));
  check(G9, 'caminho de arquivo do próprio paciente é aceito', !permX.erro && permX[0]?.ok === true, permX.erro || JSON.stringify(permX));
  for (const tabela of ['armazenamento_objetos', 'armazenamento_envios', 'ortus_schema_migrations']) {
    check(G9, `tabela interna ${tabela} inacessível pela API`, Boolean((await como(adminX, () => db.query(`SELECT * FROM public.${tabela} LIMIT 1`))).erro));
  }
  check(G9, 'cota não é reservada direto pelo cliente',
    Boolean((await como(adminX, () => db.query(`SELECT public.armazenamento_uso_projeto()`))).erro));
  check(G9, 'link público de anamnese não é lido por outra clínica',
    (await como(adminX, () => rows(`SELECT id FROM public.anamnese_links WHERE clinica_id = $1`, [clinY]))).length === 0);

  // ==================================================================
  // 12. Achados da revisão de segurança de 18/11 (migration 20261125)
  // ==================================================================
  const G12 = 'Revisão de 18/11';
  const politicasStorage = await rows(
    `SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND policyname IN ('arquivos_ortus_insert', 'arquivos_ortus_update')`);
  check(G12, 'bucket de arquivos sem envio direto pela API (só por link assinado do servidor)', politicasStorage.length === 0,
    politicasStorage.map((p) => p.policyname).join(', '));
  check(G12, 'ninguém grava arquivo direto no bucket, nem no caminho do próprio paciente',
    await barrado(comumX, `INSERT INTO storage.objects (bucket_id, name) VALUES ('arquivos_ortus', $1)`, [`pacientes/${pacX}/documentos/rls.pdf`]));

  check(G12, 'cartão de prótese não vai para o quadro de outra clínica, nem com paciente próprio',
    await barrado(adminX, `INSERT INTO public.kanban_cartoes (clinica_id, paciente_id, paciente_nome) VALUES ($1::text, $2, 'RLS')`, [clinY, pacX]));
  check(G12, 'cartão de prótese não junta paciente de outra clínica',
    await barrado(adminX, `INSERT INTO public.kanban_cartoes (clinica_id, paciente_id, paciente_nome) VALUES ($1::text, $2, 'RLS')`, [clinX, pacY]));
  check(G12, 'cartão de prótese da própria clínica é aceito',
    (await linhas(comumX, `INSERT INTO public.kanban_cartoes (clinica_id, paciente_id, paciente_nome) VALUES ($1::text, $2, 'RLS')`, [clinX, pacX])) === 1);

  check(G12, 'membro comum não cria regra de comissão',
    await barrado(comumX, `INSERT INTO public.comissoes_regras (profissional_id, clinica_id, gatilho, tipo, valor, ativo) VALUES ($1, $2, 'debito_recebido', 'percentual', 100, true)`, [comumX.prof, clinX]));
  check(G12, 'administrador cria regra de comissão',
    (await linhas(adminX, `INSERT INTO public.comissoes_regras (profissional_id, clinica_id, gatilho, tipo, valor, ativo) VALUES ($1, $2, 'debito_recebido', 'percentual', 10, true)`, [comumX.prof, clinX])) === 1);
  const lancamento = await um(
    `INSERT INTO public.comissoes_lancamentos (profissional_id, clinica_id, descricao, valor_base, valor_comissao, status) VALUES ($1, $2, 'RLS', 100, 10, 'pendente') RETURNING id`,
    [comumX.prof, clinX]);
  check(G12, 'membro comum não marca a própria comissão como paga',
    await barrado(comumX, `UPDATE public.comissoes_lancamentos SET status = 'pago' WHERE id = $1`, [lancamento.id]));
  check(G12, 'membro comum não apaga lançamento de comissão',
    await barrado(comumX, `DELETE FROM public.comissoes_lancamentos WHERE id = $1`, [lancamento.id]));
  check(G12, 'administrador marca a comissão como paga',
    (await linhas(adminX, `UPDATE public.comissoes_lancamentos SET status = 'pago' WHERE id = $1`, [lancamento.id])) === 1);

  await db.query(`INSERT INTO public.whatsapp_envios (clinica_id, chave, tipo, status) VALUES ($1, $2, 'lembrete', 'enviada')`, [clinX, `rls:${marca}`]);
  check(G12, 'registro de mensagem enviada não se apaga pela API (o lembrete sairia de novo)',
    await barrado(adminX, `DELETE FROM public.whatsapp_envios WHERE chave = $1`, [`rls:${marca}`]));

  const tokenLink = crypto.randomBytes(16).toString('hex');
  check(G12, 'link de anamnese não é gravado com a clínica de outro',
    await barrado(adminX, `INSERT INTO public.anamnese_links (paciente_id, clinica_id, token_hash, expires_at, modelo_id) VALUES ($1, $2, $3, now() + interval '1 day', 'padrao')`, [pacX, clinY, `a${tokenLink}`]));
  check(G12, 'link de anamnese não é gravado com validade de anos',
    await barrado(adminX, `INSERT INTO public.anamnese_links (paciente_id, clinica_id, token_hash, expires_at, modelo_id) VALUES ($1, $2, $3, now() + interval '10 years', 'padrao')`, [pacX, clinX, `b${tokenLink}`]));
  const linkCerto = await linhas(adminX,
    `INSERT INTO public.anamnese_links (paciente_id, clinica_id, token_hash, expires_at, modelo_id) VALUES ($1, $2, $3, now() + interval '72 hours', 'padrao')`,
    [pacX, clinX, `c${tokenLink}`], { manter: true });
  check(G12, 'link de anamnese da própria clínica, por 72 h, é aceito', linkCerto === 1, JSON.stringify(linkCerto));
  check(G12, 'link de anamnese não é prorrogado depois de criado',
    await barrado(adminX, `UPDATE public.anamnese_links SET expires_at = expires_at + interval '30 days' WHERE token_hash = $1`, [`c${tokenLink}`]));

  check(G12, 'agendamento não leva paciente de outra rede',
    await barrado(comumX, `INSERT INTO public.agendamentos (paciente_id, clinica_id, data_hora, procedimento, status) VALUES ($1, $2, now() + interval '4 days', 'x', 'agendado')`, [pacY, clinX]));
  check(G12, 'tarefa não leva paciente de outra rede',
    await barrado(comumX, `INSERT INTO public.tarefas (clinica_id, titulo, paciente_id) VALUES ($1, 'RLS tarefa', $2)`, [clinX, pacY]));
  check(G12, 'tarefa não vai para responsável de outra rede',
    await barrado(comumX, `INSERT INTO public.tarefas (clinica_id, titulo, responsavel_id) VALUES ($1, 'RLS tarefa', $2)`, [clinX, adminY.prof]));
  const tarefaCerta = await como(comumX, () => db.query(
    `INSERT INTO public.tarefas (clinica_id, titulo, paciente_id, responsavel_id, data_limite) VALUES ($1, 'RLS tarefa certa', $2, $3, public.hoje_br())`, [clinX, pacX, adminX.prof]), { manter: true });
  const alertaHoje = await como(comumX, () => um(`SELECT alerta_data FROM public.v_tarefas_completo WHERE titulo = 'RLS tarefa certa'`));
  check(G12, 'tarefa com paciente e responsável da clínica grava, e o prazo de hoje (Brasília) não aparece atrasado',
    !tarefaCerta?.erro && tarefaCerta?.rowCount === 1 && alertaHoje?.alerta_data === 'proxima', JSON.stringify([tarefaCerta?.erro, alertaHoje]));

  check(G12, 'logado não consulta a situação financeira de outra rede',
    Boolean((await como(comumX, () => db.query(`SELECT public.rede_status_financeiro($1)`, [redeY.id]))).erro));

  // ==================================================================
  // 10. Assinatura e cobrança
  // ==================================================================
  const G10 = 'Assinatura e cobrança';
  const H = 'public.hoje_br()';
  const estadoDe = async (args) => (await um(`SELECT public.assinatura_estado(${args}) AS e`)).e;
  const redeAgora = async (id) => um(`SELECT assinatura_status, cobranca_automatica FROM public.redes WHERE id = $1`, [id]);
  const faturaAgora = async (id) => um(`SELECT status, pagamento_status, pagamento_ref FROM public.faturas WHERE id = $1`, [id]);
  const avisos = async (rede, tipo) => Number((await um(`SELECT count(*)::int AS n FROM public.assinatura_avisos WHERE rede_id = $1 AND tipo = $2`, [rede, tipo])).n);
  const novoPaciente = (quem, clinica) => como(quem, () => db.query(
    `INSERT INTO public.pacientes (nome, telefone, clinica_id) VALUES ('RLS assinatura', '11999990009', $1)`, [clinica]));
  const gravou = (r) => !r?.erro && r?.rowCount === 1;
  const barradoPelaAssinatura = (r) => r?.codigo === 'PT402' && /Assinatura suspensa/.test(r?.erro || '');

  check(G10, 'régua: cobrança manual nunca bloqueia sozinha', (await estadoDe(`true, false, false, ${H} - 90, NULL, ${H}`)) === 'sem_cobranca');
  check(G10, 'régua: no dia do vencimento ainda está em dia', (await estadoDe(`true, false, true, ${H}, NULL, ${H}`)) === 'ativa');
  check(G10, 'régua: do 1º ao 7º dia de atraso é só aviso',
    (await estadoDe(`true, false, true, ${H} - 1, NULL, ${H}`)) === 'em_atraso' && (await estadoDe(`true, false, true, ${H} - 7, NULL, ${H}`)) === 'em_atraso');
  check(G10, 'régua: no 8º dia entra em modo de consulta', (await estadoDe(`true, false, true, ${H} - 8, NULL, ${H}`)) === 'bloqueada');
  check(G10, 'régua: prazo extra dado pelo dono adia o bloqueio', (await estadoDe(`true, false, true, ${H} - 30, ${H} + 2, ${H}`)) === 'em_atraso');
  check(G10, 'régua: rede desligada ou cancelada fica em modo de consulta',
    (await estadoDe(`false, false, true, NULL, NULL, ${H}`)) === 'suspensa' && (await estadoDe(`true, true, true, NULL, NULL, ${H}`)) === 'cancelada');

  // Rede que já existia: cobrança manual. Fatura vencida há dois meses não muda nada.
  await db.query(
    `INSERT INTO public.faturas (rede_id, competencia, vencimento, valor_centavos, status)
     VALUES ($1, date_trunc('month', ${H} - 60)::date, ${H} - 60, 19700, 'aberta')`, [redeY.id]);
  check(G10, 'rede com cobrança manual e fatura vencida continua gravando',
    (await redeAgora(redeY.id)).assinatura_status === 'sem_cobranca' && gravou(await novoPaciente(adminY, clinY)));

  // O dono liga a cobrança automática nessa rede: a fatura de 60 dias não bloqueia na hora.
  await db.query(`UPDATE public.redes SET cobranca_automatica = true WHERE id = $1`, [redeY.id]);
  const ligadaY = await um(`SELECT assinatura_status, divida_desde = ${H} AS divida_hoje, regua_desde = ${H} AS regua_hoje FROM public.redes WHERE id = $1`, [redeY.id]);
  check(G10, 'ligar a cobrança com fatura antiga em aberto não bloqueia na hora (a dívida conta da ativação)',
    ligadaY.assinatura_status === 'ativa' && ligadaY.divida_hoje === true && ligadaY.regua_hoje === true && gravou(await novoPaciente(adminY, clinY)), JSON.stringify(ligadaY));
  const ligadaY8 = (await um(`SELECT public.assinatura_recalcular($1, ${H} + 8) AS r`, [redeY.id])).r;
  check(G10, 'e só entra em modo de consulta depois da tolerância contada da ativação', ligadaY8.depois === 'bloqueada', JSON.stringify(ligadaY8));
  await db.query(`UPDATE public.redes SET cobranca_automatica = false WHERE id = $1`, [redeY.id]);
  await db.query(`SELECT public.assinatura_recalcular($1, NULL)`, [redeY.id]);
  await db.query(`DELETE FROM public.assinatura_avisos WHERE rede_id = $1`, [redeY.id]);

  // Rede com cobrança automática: atraso de 3 dias. A régua já valia havia meses (data simulada).
  await db.query(`UPDATE public.redes SET cobranca_automatica = true, valor_mensal_centavos = 19700, plano = 'profissional' WHERE id = $1`, [redeX.id]);
  await db.query(`UPDATE public.redes SET regua_desde = ${H} - 120 WHERE id = $1`, [redeX.id]);
  const fatX = Number((await um(
    `INSERT INTO public.faturas (rede_id, competencia, vencimento, valor_centavos, status, origem)
     VALUES ($1, date_trunc('month', ${H} - 3)::date, ${H} - 3, 19700, 'aberta', 'automatica') RETURNING id`, [redeX.id])).id);
  check(G10, 'fatura vencida há 3 dias deixa a rede em atraso', (await redeAgora(redeX.id)).assinatura_status === 'em_atraso');
  check(G10, 'em atraso a clínica ainda grava', gravou(await novoPaciente(adminX, clinX)));
  check(G10, 'aviso de atraso entra uma vez na caixa de saída', (await avisos(redeX.id, 'fatura_atrasada')) === 1);

  // Atraso de 9 dias: modo de consulta.
  await db.query(`UPDATE public.faturas SET vencimento = ${H} - 9 WHERE id = $1`, [fatX]);
  const totalAntes = Number((await um(`SELECT count(*)::int AS n FROM public.pacientes WHERE clinica_id = $1`, [clinX])).n);
  check(G10, 'fatura vencida há 9 dias bloqueia a rede', (await redeAgora(redeX.id)).assinatura_status === 'bloqueada');
  const tentativa = await novoPaciente(adminX, clinX);
  check(G10, 'modo de consulta: não cadastra paciente e o aviso é legível', barradoPelaAssinatura(tentativa), JSON.stringify(tentativa));
  check(G10, 'modo de consulta: não altera paciente',
    barradoPelaAssinatura(await como(adminX, () => db.query(`UPDATE public.pacientes SET nome = 'x' WHERE id = $1`, [pacX]))));
  check(G10, 'modo de consulta: não apaga paciente',
    barradoPelaAssinatura(await como(adminX, () => db.query(`DELETE FROM public.pacientes WHERE id = $1`, [pacX]))));
  check(G10, 'modo de consulta: não grava evolução no prontuário',
    barradoPelaAssinatura(await como(adminX, () => db.query(`INSERT INTO public.paciente_evolucoes (paciente_id, texto, data) VALUES ($1, 'x', current_date)`, [pacX]))));
  check(G10, 'modo de consulta: não agenda',
    barradoPelaAssinatura(await como(comumX, () => db.query(
      `INSERT INTO public.agendamentos (paciente_id, clinica_id, data_hora, procedimento, status) VALUES ($1, $2, now() + interval '3 days', 'x', 'agendado')`, [pacX, clinX]))));
  const partes = await como(comumX, () => db.query(`SELECT public.agendamento_salvar_partes(
    NULL, $1, $2, NULL, 'x', 'blue', 'agendado', 0, 0, '', '[{"data_hora":"2031-01-01T09:00:00-03:00"}]'::jsonb)`, [clinX, pacX]));
  check(G10, 'modo de consulta: função de agenda em partes também é barrada', barradoPelaAssinatura(partes), JSON.stringify(partes));
  const leitura = await como(comumX, () => rows(`SELECT id FROM public.pacientes WHERE clinica_id = $1`, [clinX]));
  const agendaLida = await como(comumX, () => rows(`SELECT id FROM public.agendamentos WHERE id = $1`, [agX]));
  check(G10, 'modo de consulta: prontuário e agenda continuam legíveis e inteiros',
    !leitura.erro && leitura.length === totalAntes && agendaLida.length === 1, `${leitura.length}/${totalAntes}`);
  check(G10, 'bloqueio de uma rede não atinge a outra', gravou(await novoPaciente(adminY, clinY)));
  check(G10, 'servidor (lembrete, arquivos, limpeza) não é barrado',
    (await db.query(`UPDATE public.pacientes SET telefone = telefone WHERE id = $1`, [pacX])).rowCount === 1);
  check(G10, 'aviso de bloqueio entra na caixa de saída', (await avisos(redeX.id, 'acesso_bloqueado')) === 1);

  // Pagamento informado pelo provedor.
  const pagar = async (ref, referencia, estadoPg, valor, extra = {}) => (await um(
    `SELECT public.pagamento_aplicar('mercadopago', $1, $2, $3, $4, $5, $6, 'BRL', now(), 'pix', 'teste') AS r`,
    [ref, referencia, estadoPg, extra.estadoProvedor || estadoPg, extra.detalhe || '', valor])).r;
  const errado = await pagar(`rls-${marca}-0`, `fatura_${fatX}`, 'aprovado', 100, { estadoProvedor: 'approved' });
  check(G10, 'pagamento com valor diferente não quita a fatura',
    errado.resultado === 'revisar' && errado.motivo === 'valor_divergente' && (await faturaAgora(fatX)).status === 'aberta', JSON.stringify(errado));
  const recusa = await pagar(`rls-${marca}-r`, `fatura_${fatX}`, 'recusado', 19700, { estadoProvedor: 'rejected', detalhe: 'cc_rejected_other_reason' });
  check(G10, 'pagamento recusado aparece na fatura, que segue aberta',
    recusa.resultado === 'aplicado' && (await faturaAgora(fatX)).status === 'aberta' && (await faturaAgora(fatX)).pagamento_status === 'recusado');
  const pago = await pagar(`rls-${marca}-1`, `fatura_${fatX}`, 'aprovado', 19700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  check(G10, 'pagamento confirmado quita a fatura e reabre a rede',
    pago.resultado === 'aplicado' && (await faturaAgora(fatX)).status === 'paga' && (await redeAgora(redeX.id)).assinatura_status === 'ativa', JSON.stringify(pago));
  check(G10, 'depois de pagar a clínica volta a gravar', gravou(await novoPaciente(adminX, clinX)));
  check(G10, 'aviso de reabertura entra na caixa de saída', (await avisos(redeX.id, 'acesso_reaberto')) === 1);
  const repetido = await pagar(`rls-${marca}-1`, `fatura_${fatX}`, 'aprovado', 19700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  const trilha = await um(`SELECT count(*)::int AS n, max(vezes) AS vezes FROM public.pagamento_eventos WHERE pagamento_ref = $1`, [`rls-${marca}-1`]);
  check(G10, 'o mesmo aviso de pagamento entregue duas vezes não muda nada',
    repetido.resultado === 'ignorado' && trilha.n === 1 && Number(trilha.vezes) === 2, JSON.stringify([repetido, trilha]));
  const dobro = await pagar(`rls-${marca}-2`, `fatura_${fatX}`, 'aprovado', 19700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  check(G10, 'segundo pagamento da mesma fatura fica para conferência, sem quitar de novo',
    dobro.resultado === 'revisar' && dobro.motivo === 'duplicado' && (await faturaAgora(fatX)).pagamento_ref === `rls-${marca}-1`, JSON.stringify(dobro));
  const estorno = await pagar(`rls-${marca}-1`, `fatura_${fatX}`, 'estornado', 19700, { estadoProvedor: 'refunded' });
  const amanha = (await um(`SELECT public.assinatura_recalcular($1, ${H} + 1) AS r`, [redeX.id])).r;
  const depois = (await um(`SELECT public.assinatura_recalcular($1, ${H} + 8) AS r`, [redeX.id])).r;
  check(G10, 'estorno volta a contar como dívida e bloqueia depois da tolerância',
    estorno.resultado === 'aplicado' && (await faturaAgora(fatX)).status === 'estornada' && amanha.depois === 'em_atraso' && depois.depois === 'bloqueada',
    JSON.stringify([estorno, amanha, depois]));
  await db.query(`SELECT public.assinatura_recalcular($1, NULL)`, [redeX.id]);

  // Fatura do mês (data simulada, só na rede criada para isto).
  const redeZ = await um(
    `INSERT INTO public.redes (nome, cobranca_automatica, valor_mensal_centavos, dia_vencimento, plano)
     VALUES ($1, true, 9700, 10, 'basico') RETURNING id`, [`RLS Rede Z ${marca}`]);
  const gerar = async (dia) => ((await um(`SELECT public.assinatura_gerar_competencias($1::date, $2) AS r`, [dia, redeZ.id])).r.criadas || []);
  const faturasZ = async () => rows(`SELECT id, competencia::text, vencimento::text, status, origem FROM public.faturas WHERE rede_id = $1 ORDER BY competencia`, [redeZ.id]);
  check(G10, 'antes da antecedência de 5 dias nada é gerado', (await gerar('2031-03-04')).length === 0);
  const g1 = await gerar('2031-03-05');
  check(G10, 'fatura do mês nasce 5 dias antes do vencimento',
    g1.length === 1 && g1[0].competencia === '2031-03-01' && g1[0].vencimento === '2031-03-10', JSON.stringify(g1));
  check(G10, 'rodar a rotina de novo não cobra a mesma competência duas vezes',
    (await gerar('2031-03-05')).length === 0 && (await gerar('2031-03-09')).length === 0 && (await faturasZ()).length === 1);
  check(G10, 'aviso de fatura gerada entra uma vez na caixa de saída', (await avisos(redeZ.id, 'fatura_gerada')) === 1);
  await db.query(`UPDATE public.faturas SET status = 'paga', pago_em = DATE '2031-03-08' WHERE rede_id = $1`, [redeZ.id]);
  await db.query(
    `INSERT INTO public.faturas (rede_id, competencia, vencimento, valor_centavos, status) VALUES ($1, DATE '2031-04-15', DATE '2031-04-20', 9700, 'aberta')`, [redeZ.id]);
  check(G10, 'fatura manual do mesmo mês conta: a automática não duplica',
    (await gerar('2031-04-05')).length === 0 && (await faturasZ()).filter((f) => f.competencia.startsWith('2031-04')).length === 1);
  check(G10, 'rede em modo de consulta não acumula fatura nova', (await gerar('2031-06-05')).length === 0 && (await faturasZ()).length === 2);
  await db.query(`UPDATE public.faturas SET status = 'paga', pago_em = DATE '2031-06-04' WHERE rede_id = $1 AND status = 'aberta'`, [redeZ.id]);
  const retomada = await gerar('2031-06-05');
  check(G10, 'pagou: o ciclo retoma no mês corrente, sem cobrar os meses parados',
    retomada.length === 1 && retomada[0].competencia === '2031-06-01' && retomada[0].vencimento === '2031-06-10', JSON.stringify(retomada));

  // Compra pela página pública: do pagamento à conta de administrador.
  const emailNovo = `rls-novo-${marca}@ortus.invalid`;
  const pedido = await um(
    `INSERT INTO public.assinatura_pedidos (plano, plano_nome, valor_centavos, clinica_nome, responsavel_nome, email, telefone, aceite_termos_em)
     VALUES ('profissional', 'Profissional', 19700, $1, 'RLS Nova Dona', $2, '11999990002', now()) RETURNING id`, [`RLS Clínica Nova ${marca}`, emailNovo]);
  const refPedido = `pedido_${pedido.id.replace(/-/g, '')}`;
  const pedidoAgora = async () => um(`SELECT status, pagamento_status, rede_id, clinica_id, fatura_id FROM public.assinatura_pedidos WHERE id = $1`, [pedido.id]);
  const tentar = async (sql, params) => {
    await db.query('SAVEPOINT tentar');
    try {
      const r = await db.query(sql, params);
      await db.query('ROLLBACK TO SAVEPOINT tentar');
      return { erro: null, linhas: r.rows };
    } catch (err) {
      await db.query('ROLLBACK TO SAVEPOINT tentar');
      return { erro: err.message };
    }
  };
  const recusado = await pagar(`rls-${marca}-p0`, refPedido, 'recusado', 19700, { estadoProvedor: 'rejected', detalhe: 'cc_rejected_insufficient_amount' });
  let ped = await pedidoAgora();
  check(G10, 'compra recusada fica visível e não cria conta',
    recusado.resultado === 'aplicado' && recusado.provisionar === false && ped.status === 'aguardando_pagamento' && ped.pagamento_status === 'recusado', JSON.stringify(recusado));
  const userNovo = crypto.randomUUID();
  // Como o servidor faz: o usuário da compra nasce marcado com o pedido (app_metadata.pedido_assinatura).
  await db.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data) VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3::jsonb)`,
    [userNovo, emailNovo, JSON.stringify({ pedido_assinatura: pedido.id })]);
  const cedo = await tentar(`SELECT public.assinatura_provisionar($1, $2)`, [pedido.id, userNovo]);
  check(G10, 'conta não nasce antes do pagamento', Boolean(cedo.erro), 'criou sem pagamento');
  const aprovado = await pagar(`rls-${marca}-p1`, refPedido, 'aprovado', 19700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  check(G10, 'compra aprovada marca o pedido como pago e pede a criação da conta',
    aprovado.resultado === 'aplicado' && aprovado.provisionar === true && (await pedidoAgora()).status === 'pago', JSON.stringify(aprovado));
  const reserva1 = (await um(`SELECT public.assinatura_pedido_reservar($1) AS r`, [pedido.id])).r;
  const reserva2 = (await um(`SELECT public.assinatura_pedido_reservar($1) AS r`, [pedido.id])).r;
  check(G10, 'só uma execução por vez cria a conta', Boolean(reserva1) && reserva2 === null);
  const prov = (await um(`SELECT public.assinatura_provisionar($1, $2) AS r`, [pedido.id, userNovo])).r;
  ped = await pedidoAgora();
  const nasceu = await um(
    `SELECT r.cobranca_automatica, r.assinatura_status, r.valor_mensal_centavos, r.plano, c.is_matriz, p.nivel_acesso, p.precisa_trocar_senha,
            pc.convidado, f.status AS fatura_status, f.origem AS fatura_origem, f.valor_centavos AS fatura_valor
       FROM public.redes r
       JOIN public.clinicas c ON c.rede_id = r.id
       JOIN public.profissionais_clinicas pc ON pc.clinica_id = c.id
       JOIN public.profissionais p ON p.id = pc.profissional_id
       JOIN public.faturas f ON f.rede_id = r.id
      WHERE r.id = $1 AND p.user_id = $2`, [prov.rede_id, userNovo]);
  check(G10, 'conta nasce completa: rede, clínica, administrador, vínculo e primeira fatura paga',
    ped.status === 'provisionado' && nasceu && nasceu.cobranca_automatica === true && nasceu.assinatura_status === 'ativa'
      && nasceu.valor_mensal_centavos === 19700 && nasceu.plano === 'profissional' && nasceu.is_matriz === true
      && nasceu.nivel_acesso === 'admin' && nasceu.precisa_trocar_senha === true && nasceu.convidado === false
      && nasceu.fatura_status === 'paga' && nasceu.fatura_origem === 'checkout' && nasceu.fatura_valor === 19700,
    JSON.stringify(nasceu));
  const prov2 = (await um(`SELECT public.assinatura_provisionar($1, $2) AS r`, [pedido.id, userNovo])).r;
  const contagem = await um(
    `SELECT (SELECT count(*)::int FROM public.clinicas WHERE rede_id = $1) AS clinicas,
            (SELECT count(*)::int FROM public.faturas WHERE rede_id = $1) AS faturas,
            (SELECT count(*)::int FROM public.profissionais WHERE user_id = $2) AS perfis`, [prov.rede_id, userNovo]);
  check(G10, 'criar a conta duas vezes não duplica nada',
    prov2.ja_existia === true && contagem.clinicas === 1 && contagem.faturas === 1 && contagem.perfis === 1, JSON.stringify(contagem));
  const repetePedido = await pagar(`rls-${marca}-p1`, refPedido, 'aprovado', 19700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  check(G10, 'aviso repetido do pagamento da compra não recria a conta', repetePedido.resultado === 'ignorado' && repetePedido.provisionar === false);
  const novaDona = { sub: userNovo, email: emailNovo };
  const clinNova = Number(prov.clinica_id);
  const pacNovo = await como(novaDona, () => um(
    `INSERT INTO public.pacientes (nome, telefone, clinica_id) VALUES ('RLS Primeiro Paciente', '11999990003', $1) RETURNING id`, [clinNova]), { manter: true });
  const agNovo = pacNovo?.id ? await como(novaDona, () => db.query(
    `INSERT INTO public.agendamentos (paciente_id, clinica_id, data_hora, procedimento, status) VALUES ($1, $2, now() + interval '2 days', 'Avaliação', 'agendado')`,
    [pacNovo.id, clinNova])) : null;
  check(G10, 'quem acabou de assinar cadastra paciente e agenda sem passo manual', Boolean(pacNovo?.id) && gravou(agNovo), JSON.stringify([pacNovo, agNovo?.erro]));
  const sit = (await como(novaDona, () => um(`SELECT public.assinatura_situacao($1, true) AS s`, [clinNova])))?.s;
  check(G10, 'administrador vê a própria assinatura, a próxima cobrança e as faturas',
    sit && sit.estado === 'ativa' && sit.pode_gravar === true && sit.admin === true && sit.valor_centavos === 19700
      && Boolean(sit.proxima_cobranca) && Array.isArray(sit.faturas) && sit.faturas.length === 1, JSON.stringify(sit));
  const estornoCompra = await pagar(`rls-${marca}-p1`, refPedido, 'contestado', 19700, { estadoProvedor: 'charged_back' });
  ped = await pedidoAgora();
  check(G10, 'contestação da compra marca pedido e fatura, sem apagar a conta',
    estornoCompra.resultado === 'aplicado' && ped.status === 'contestado' && (await faturaAgora(ped.fatura_id)).status === 'contestada'
      && Number((await um(`SELECT count(*)::int AS n FROM public.pacientes WHERE clinica_id = $1`, [clinNova])).n) === 1);
  const evento = async (ref, estadoProvedor, detalhe) => um(
    `SELECT resultado, motivo FROM public.pagamento_eventos WHERE pagamento_ref = $1 AND estado_provedor = $2 AND detalhe = $3`, [ref, estadoProvedor, detalhe]);
  const fase = await pagar(`rls-${marca}-p1`, refPedido, 'contestado', 19700, { estadoProvedor: 'charged_back', detalhe: 'reimbursed' });
  check(G10, 'contestação que muda de fase vai para conferência (não é ignorada)',
    fase.resultado === 'revisar' && fase.motivo === 'contestacao_atualizada' && (await evento(`rls-${marca}-p1`, 'charged_back', 'reimbursed'))?.resultado === 'revisar',
    JSON.stringify(fase));
  // A clínica paga de novo a fatura contestada e, depois, a contestação é decidida a favor (o 1º pagamento volta).
  const pagouDeNovo = await pagar(`rls-${marca}-p2`, `fatura_${ped.fatura_id}`, 'aprovado', 19700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  const revertida = await pagar(`rls-${marca}-p1`, refPedido, 'aprovado', 19700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  const eventoRevertida = await evento(`rls-${marca}-p1`, 'approved', 'accredited');
  check(G10, 'contestação revertida depois de a clínica pagar de novo: dinheiro em dobro vai para conferência',
    pagouDeNovo.resultado === 'aplicado' && revertida.resultado === 'revisar' && revertida.motivo === 'duplicado'
      && eventoRevertida?.resultado === 'revisar' && eventoRevertida?.motivo === 'duplicado' && (await faturaAgora(ped.fatura_id)).pagamento_ref === `rls-${marca}-p2`,
    JSON.stringify([pagouDeNovo, revertida, eventoRevertida]));
  // Segunda compra paga com o mesmo e-mail (já virou conta): conferência, sem segunda conta.
  const pedidoDuplo = await um(
    `INSERT INTO public.assinatura_pedidos (plano, plano_nome, valor_centavos, clinica_nome, responsavel_nome, email, aceite_termos_em)
     VALUES ('basico', 'Básico', 9700, 'RLS Segunda Compra', 'RLS Nova Dona', $1, now()) RETURNING id`, [emailNovo]);
  const duplo = await pagar(`rls-${marca}-p3`, `pedido_${pedidoDuplo.id.replace(/-/g, '')}`, 'aprovado', 9700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  check(G10, 'segunda compra paga com o mesmo e-mail vai para conferência, sem criar outra conta',
    duplo.resultado === 'revisar' && duplo.motivo === 'duplicado' && duplo.provisionar === false
      && (await um(`SELECT status FROM public.assinatura_pedidos WHERE id = $1`, [pedidoDuplo.id])).status === 'aguardando_pagamento', JSON.stringify(duplo));
  // E-mail que ganhou conta por outro caminho (convite) antes de a compra ser paga.
  const pedidoConvidado = await um(
    `INSERT INTO public.assinatura_pedidos (plano, plano_nome, valor_centavos, clinica_nome, responsavel_nome, email, aceite_termos_em)
     VALUES ('basico', 'Básico', 9700, 'RLS Compra de Quem Já Tem Conta', 'RLS Comum', $1, now()) RETURNING id`, [comumX.email]);
  const emUso = await pagar(`rls-${marca}-p4`, `pedido_${pedidoConvidado.id.replace(/-/g, '')}`, 'aprovado', 9700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  check(G10, 'compra paga de e-mail que já tem conta vai para conferência (não vira segunda conta)',
    emUso.resultado === 'revisar' && emUso.motivo === 'email_em_uso' && emUso.provisionar === false, JSON.stringify(emUso));
  // Compras ainda sem pagamento do mesmo e-mail: várias podem existir; pagar uma encerra as outras.
  const emailVarias = `rls-varias-${marca}@ortus.invalid`;
  const [compraA, compraB] = await Promise.all([1, 2].map(() => um(
    `INSERT INTO public.assinatura_pedidos (plano, plano_nome, valor_centavos, clinica_nome, responsavel_nome, email, aceite_termos_em)
     VALUES ('basico', 'Básico', 9700, 'RLS Várias', 'RLS Várias', $1, now()) RETURNING id`, [emailVarias])));
  const pagaA = await pagar(`rls-${marca}-p5`, `pedido_${compraA.id.replace(/-/g, '')}`, 'aprovado', 9700, { estadoProvedor: 'approved', detalhe: 'accredited' });
  const statusB = (await um(`SELECT status FROM public.assinatura_pedidos WHERE id = $1`, [compraB.id])).status;
  check(G10, 'duas compras sem pagamento do mesmo e-mail convivem; pagar uma encerra a outra',
    pagaA.resultado === 'aplicado' && pagaA.provisionar === true && statusB === 'cancelado', JSON.stringify([pagaA, statusB]));

  // Quem trabalha em outra clínica não vira administrador comprando com o próprio e-mail.
  const pedidoEsperto = await um(
    `INSERT INTO public.assinatura_pedidos (plano, plano_nome, valor_centavos, clinica_nome, responsavel_nome, email, aceite_termos_em, status, pagamento_ref, pagamento_status)
     VALUES ('basico', 'Básico', 9700, 'RLS Atalho', 'RLS Comum', $1, now(), 'pago', $2, 'aprovado') RETURNING id`, [comumX.email, `rls-${marca}-e`]);
  const atalho = await tentar(`SELECT public.assinatura_provisionar($1, $2)`, [pedidoEsperto.id, comumX.sub]);
  check(G10, 'membro de uma clínica não vira administrador comprando com o próprio e-mail', Boolean(atalho.erro), 'provisionou conta já existente');

  // O que o cliente não alcança.
  for (const [nome, chamada] of [
    ['pagamento_aplicar', `SELECT public.pagamento_aplicar('mercadopago', 'x', 'fatura_1', 'aprovado', 'approved', '', 1, 'BRL', now(), 'pix', 'x')`],
    ['assinatura_provisionar', `SELECT public.assinatura_provisionar(gen_random_uuid(), gen_random_uuid())`],
    ['assinatura_pedido_reservar', `SELECT public.assinatura_pedido_reservar(gen_random_uuid())`],
    ['assinatura_recalcular', `SELECT public.assinatura_recalcular(gen_random_uuid(), NULL)`],
    ['assinatura_recalcular_todas', `SELECT public.assinatura_recalcular_todas(NULL)`],
    ['assinatura_gerar_competencias', `SELECT public.assinatura_gerar_competencias(NULL, NULL)`],
    ['assinatura_usuario_por_email', `SELECT public.assinatura_usuario_por_email('a@b.c')`],
    ['assinatura_destinatarios', `SELECT * FROM public.assinatura_destinatarios(gen_random_uuid())`],
  ]) {
    check(G10, `cliente não executa ${nome}`, Boolean((await como(adminX, () => db.query(chamada))).erro));
  }
  for (const tabela of ['assinatura_pedidos', 'pagamento_eventos', 'assinatura_avisos', 'faturas']) {
    const lido = await como(adminX, () => rows(`SELECT 1 FROM public.${tabela}`));
    check(G10, `administrador de clínica não lê ${tabela} direto`, Boolean(lido.erro) || lido.length === 0, `${lido.length} linhas`);
    check(G10, `administrador de clínica não apaga em ${tabela}`, await barrado(adminX, `DELETE FROM public.${tabela}`));
  }
  const pedidosDoDono = await como(dono, () => rows(`SELECT id FROM public.assinatura_pedidos WHERE id = $1`, [pedido.id]));
  check(G10, 'dono da plataforma lê os pedidos de assinatura', !pedidosDoDono.erro && pedidosDoDono.length === 1);
  check(G10, 'dados comerciais da rede não chegam à equipe da clínica',
    Boolean((await como(adminX, () => db.query(`SELECT observacao FROM public.redes`))).erro)
      && Boolean((await como(adminX, () => db.query(`SELECT valor_mensal_centavos, contato_email FROM public.redes`))).erro));
  const redesVistas = await como(comumX, () => rows(`SELECT id, nome FROM public.redes`));
  check(G10, 'equipe enxerga só o nome da própria rede', !redesVistas.erro && redesVistas.length === 1 && redesVistas[0].id === redeX.id, JSON.stringify(redesVistas));
  check(G10, 'cliente não mexe na cobrança da própria rede',
    await barrado(adminX, `UPDATE public.redes SET cobranca_automatica = false, ativa = true, divida_desde = NULL WHERE id = $1`, [redeX.id]));
  check(G10, 'cliente não altera o catálogo de planos', await barrado(adminX, `UPDATE public.planos_saas SET valor_centavos = 1 WHERE codigo = 'profissional'`));
  const sitComum = (await como(comumX, () => um(`SELECT public.assinatura_situacao($1, true) AS s`, [clinX])))?.s;
  check(G10, 'membro comum recebe só o estado, sem valores nem faturas',
    sitComum && sitComum.admin === false && typeof sitComum.pode_gravar === 'boolean' && !('valor_centavos' in sitComum) && !('faturas' in sitComum), JSON.stringify(sitComum));
  check(G10, 'assinatura de outra clínica não é consultada',
    Boolean((await como(comumX, () => db.query(`SELECT public.assinatura_situacao($1, true)`, [clinY]))).erro));

  // ==================================================================
  // 11. Relatos ao suporte
  // ==================================================================
  const G11 = 'Relatos ao suporte';
  const relato = Number((await um(
    `INSERT INTO public.relatos_suporte (tipo, assunto, descricao, autor_user_id, autor_profissional_id, autor_nome, clinica_id, clinica_nome)
     VALUES ('bug', 'RLS relato', 'descrição de teste', $1, $2, 'RLS comum-x', $3, 'RLS Clínica X') RETURNING id`, [comumX.sub, comumX.prof, clinX])).id);
  const verRelato = async (quem) => como(quem, () => rows(`SELECT id FROM public.relatos_suporte WHERE id = $1`, [relato]));
  check(G11, 'quem enviou lê o próprio relato', (await verRelato(comumX)).length === 1);
  check(G11, 'colega da mesma clínica não lê o relato alheio', (await verRelato(adminX)).length === 0);
  check(G11, 'outra clínica não lê o relato', (await verRelato(adminY)).length === 0);
  check(G11, 'dono da plataforma lê a fila', (await verRelato(dono)).length === 1);
  check(G11, 'ninguém grava relato direto pela API (só pelo servidor)',
    await barrado(comumX, `INSERT INTO public.relatos_suporte (tipo, assunto, descricao, autor_user_id) VALUES ('bug', 'x', 'x', $1)`, [comumX.sub]));
  check(G11, 'autor não muda o andamento do próprio relato', await barrado(comumX, `UPDATE public.relatos_suporte SET status = 'resolvido' WHERE id = $1`, [relato]));
  check(G11, 'autor não apaga o relato', await barrado(comumX, `DELETE FROM public.relatos_suporte WHERE id = $1`, [relato]));
  check(G11, 'nem o dono reescreve o texto do relato', await barrado(dono, `UPDATE public.relatos_suporte SET descricao = 'outro texto' WHERE id = $1`, [relato]));
  const andamento = await linhas(dono, `UPDATE public.relatos_suporte SET status = 'em_analise' WHERE id = $1`, [relato], { manter: true });
  const trilhaRelato = await um(
    `SELECT count(*)::int AS n FROM public.audit_log WHERE entidade = 'relatos_suporte' AND entidade_id = $1 AND user_id = $2`, [String(relato), dono.sub]);
  check(G11, 'dono muda o andamento e a mudança fica na trilha', andamento === 1 && trilhaRelato.n === 1, JSON.stringify([andamento, trilhaRelato]));
  // ==================================================================
  // 13. Painel SaaS: assinaturas
  // ==================================================================
  const G13 = 'Painel SaaS: assinaturas';
  for (const [nome, chamada] of [
    ['saas_assinaturas_resumo', `SELECT public.saas_assinaturas_resumo()`],
    ['saas_assinaturas_pendencias', `SELECT public.saas_assinaturas_pendencias()`],
    ['saas_rede_assinatura', `SELECT public.saas_rede_assinatura('${redeX.id}')`],
    ['saas_rede_faturas', `SELECT public.saas_rede_faturas('${redeX.id}')`],
    ['saas_assinatura_cobranca', `SELECT public.saas_assinatura_cobranca('${redeX.id}', false)`],
    ['saas_assinatura_prazo', `SELECT public.saas_assinatura_prazo('${redeX.id}', current_date + 10)`],
    ['saas_assinatura_cancelar', `SELECT public.saas_assinatura_cancelar('${redeX.id}', 'x')`],
    ['saas_assinatura_reativar', `SELECT public.saas_assinatura_reativar('${redeX.id}')`],
    ['saas_pagamento_resolver', `SELECT public.saas_pagamento_resolver(1, 'x')`],
    ['assinatura_proxima_cobranca', `SELECT public.assinatura_proxima_cobranca('${redeX.id}', NULL)`],
  ]) {
    check(G13, `administrador de clínica não executa ${nome}`, Boolean((await como(adminX, () => db.query(chamada))).erro));
  }

  const resumoDono = await como(dono, () => um(`SELECT public.saas_assinaturas_resumo() AS r`));
  check(G13, 'dono vê o resumo de assinaturas de todas as redes',
    resumoDono?.r?.redes?.[redeX.id]?.estado && resumoDono?.r?.redes?.[redeY.id]?.estado === 'sem_cobranca' && typeof resumoDono?.r?.totais?.pagamentos_revisar === 'number',
    JSON.stringify(resumoDono?.r?.totais || resumoDono));

  const semValor = await como(dono, () => db.query(`SELECT public.saas_assinatura_cobranca($1, true)`, [redeY.id]));
  check(G13, 'cobrança automática não liga em rede sem valor mensal', /valor mensal/.test(semValor?.erro || ''), semValor?.erro || 'ligou');

  const cancelou = await como(dono, () => um(`SELECT public.saas_assinatura_cancelar($1, 'teste de cancelamento') AS r`, [redeY.id]), { manter: true });
  check(G13, 'dono cancela a assinatura da rede', cancelou?.r?.estado === 'cancelada', JSON.stringify(cancelou));
  const gravaCancelada = await como(adminY, () => db.query(`INSERT INTO public.pacientes (nome, telefone, clinica_id) VALUES ('RLS cancelada', '1', $1)`, [clinY]));
  check(G13, 'rede cancelada fica em modo de consulta', gravaCancelada?.codigo === 'PT402', JSON.stringify(gravaCancelada));
  const leCancelada = await como(adminY, () => rows(`SELECT id FROM public.pacientes WHERE id = $1`, [pacY]));
  check(G13, 'rede cancelada continua lendo os pacientes', !leCancelada.erro && leCancelada.length === 1);
  const reativou = await como(dono, () => um(`SELECT public.saas_assinatura_reativar($1) AS r`, [redeY.id]), { manter: true });
  check(G13, 'dono reativa e a rede volta a gravar',
    reativou?.r?.estado === 'sem_cobranca'
      && (await linhas(adminY, `INSERT INTO public.pacientes (nome, telefone, clinica_id) VALUES ('RLS reativada', '1', $1)`, [clinY])) === 1,
    JSON.stringify(reativou));
  const trilhaRede = await um(
    `SELECT count(*)::int AS n FROM public.audit_log WHERE entidade = 'redes' AND entidade_id = $1 AND user_id = $2`, [String(redeY.id), dono.sub]);
  check(G13, 'cancelar e reativar ficam na auditoria com o autor', trilhaRede.n >= 2, JSON.stringify(trilhaRede));

  const prazoLongo = await como(dono, () => db.query(`SELECT public.saas_assinatura_prazo($1, current_date + 90)`, [redeX.id]));
  check(G13, 'prazo extra não passa de 60 dias', /60 dias/.test(prazoLongo?.erro || ''), prazoLongo?.erro || 'aceitou');

  const revisar = await um(`SELECT id FROM public.pagamento_eventos WHERE resultado = 'revisar' AND resolvido_em IS NULL AND rede_id = $1 LIMIT 1`, [redeX.id]);
  if (revisar) {
    const semNota = await como(dono, () => db.query(`SELECT public.saas_pagamento_resolver($1, '')`, [revisar.id]));
    check(G13, 'conferir pagamento exige anotação', Boolean(semNota?.erro));
    const resolveu = await como(dono, () => db.query(`SELECT public.saas_pagamento_resolver($1, 'conferido no teste')`, [revisar.id]), { manter: true });
    const trilhaPagamento = await um(`SELECT count(*)::int AS n FROM public.audit_log WHERE entidade = 'pagamento_eventos' AND entidade_id = $1`, [String(revisar.id)]);
    check(G13, 'dono dá o pagamento por conferido e fica na auditoria', !resolveu?.erro && trilhaPagamento.n === 1, JSON.stringify([resolveu?.erro, trilhaPagamento]));
  } else {
    check(G13, 'há pagamento a conferir para o teste (do grupo 10)', false, 'nenhum evento revisar na rede X');
  }

  // ==================================================================
  // 14. Rede com matriz e filial (migration 20261127)
  // ==================================================================
  const G14 = 'Rede com matriz e filial';
  const redeW = await um(`INSERT INTO public.redes (nome) VALUES ($1) RETURNING id`, [`RLS Rede W ${marca}`]);
  const clinM = Number((await um(`INSERT INTO public.clinicas (nome, rede_id, is_matriz) VALUES ($1, $2, true) RETURNING id`, [`RLS Matriz ${marca}`, redeW.id])).id);
  const clinF = Number((await um(`INSERT INTO public.clinicas (nome, rede_id, is_matriz) VALUES ($1, $2, false) RETURNING id`, [`RLS Filial ${marca}`, redeW.id])).id);
  const adminM = await criarPessoa('admin-m', 'admin');
  const adminF = await criarPessoa('admin-f', 'admin');
  const comumF = await criarPessoa('comum-f', 'comum');
  for (const [pessoa, clinica] of [[adminM, clinM], [adminF, clinF], [comumF, clinF]]) {
    await db.query(`INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id) VALUES ($1, $2)`, [pessoa.prof, clinica]);
  }

  check(G14, 'administrador da filial não se vincula sozinho à matriz',
    await barrado(adminF, `INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id) VALUES ($1, $2)`, [adminF.prof, clinM]));
  check(G14, 'administrador da filial não cria unidade na rede',
    await barrado(adminF, `INSERT INTO public.clinicas (nome, rede_id) VALUES ('RLS nova unidade', $1)`, [redeW.id]));
  check(G14, 'administrador da filial não mexe no perfil do dono da matriz',
    await barrado(adminF, `UPDATE public.profissionais SET nivel_acesso = 'comum' WHERE id = $1`, [adminM.prof]));
  check(G14, 'administrador da filial não apaga o perfil do dono da matriz',
    await barrado(adminF, `DELETE FROM public.profissionais WHERE id = $1`, [adminM.prof]));
  check(G14, 'administrador da matriz cria unidade na rede',
    (await linhas(adminM, `INSERT INTO public.clinicas (nome, rede_id) VALUES ('RLS unidade da matriz', $1)`, [redeW.id])) === 1);
  check(G14, 'administrador da matriz vincula gente da filial à matriz',
    (await linhas(adminM, `INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id) VALUES ($1, $2)`, [comumF.prof, clinM])) === 1);
  check(G14, 'administrador da filial administra a própria unidade',
    (await linhas(adminF, `UPDATE public.clinicas SET telefone = '11999990000' WHERE id = $1`, [clinF])) === 1);

  const sairUltimo = await como(adminM, () => db.query(`DELETE FROM public.profissionais_clinicas WHERE profissional_id = $1 AND clinica_id = $2`, [adminM.prof, clinM]));
  check(G14, 'o último administrador da matriz não sai do vínculo', /pelo menos um administrador/.test(sairUltimo?.erro || ''), sairUltimo?.erro || 'saiu');
  const rebaixar = await como(adminM, () => db.query(`UPDATE public.profissionais SET nivel_acesso = 'comum' WHERE id = $1`, [adminM.prof]));
  check(G14, 'o último administrador da matriz não se rebaixa', /pelo menos um administrador/.test(rebaixar?.erro || ''), rebaixar?.erro || 'rebaixou');
  check(G14, 'o dono da plataforma ainda consegue desvincular',
    (await linhas(dono, `DELETE FROM public.profissionais_clinicas WHERE profissional_id = $1 AND clinica_id = $2`, [adminM.prof, clinM])) === 1);

  const redeAlheia = await como(adminX, () => um(`SELECT public.clinica_rede($1) AS r`, [clinM]));
  check(G14, 'quem é de outra rede não descobre a rede de uma clínica', redeAlheia && redeAlheia.r === null, JSON.stringify(redeAlheia));
  const daRede = await como(adminX, () => um(`SELECT public.profissional_e_da_rede($1, $2) AS r`, [adminM.prof, redeW.id]));
  check(G14, 'quem é de outra rede não confirma quem trabalha nela', daRede && daRede.r === false, JSON.stringify(daRede));
  const propria = await como(adminF, () => um(`SELECT public.clinica_rede($1) AS r`, [clinM]));
  check(G14, 'quem é da rede continua resolvendo a rede (as policies dependem disso)', propria?.r === redeW.id, JSON.stringify(propria));

  await db.query(`INSERT INTO public.sync_exclusoes (tabela, linha_id, clinica_id, usuario_id) VALUES ('notificacoes', $1, NULL, $2)`, [`rls-${marca}`, adminY.sub]);
  const exclusaoAlheia = await como(comumX, () => rows(`SELECT id FROM public.sync_exclusoes WHERE linha_id = $1`, [`rls-${marca}`]));
  check(G14, 'exclusão sem clínica não é lida por outra pessoa', !exclusaoAlheia.erro && exclusaoAlheia.length === 0, JSON.stringify(exclusaoAlheia));
  const exclusaoPropria = await como(adminY, () => rows(`SELECT id FROM public.sync_exclusoes WHERE linha_id = $1`, [`rls-${marca}`]));
  check(G14, 'quem apagou continua lendo a própria exclusão', !exclusaoPropria.erro && exclusaoPropria.length === 1, JSON.stringify(exclusaoPropria));
  // ==================================================================
  // 15. Ajustes finais (migration 20261128)
  // ==================================================================
  const G15 = 'Ajustes finais';
  check(G15, 'membro comum grava o dado do caixa (lancamentos_meta)',
    (await linhas(comumX, `INSERT INTO public.configuracoes_clinica (clinica_id, chave, valor) VALUES ($1, 'lancamentos_meta', '{}'::jsonb)`, [clinX])) === 1);
  check(G15, 'membro comum não grava configuração da clínica',
    await barrado(comumX, `INSERT INTO public.configuracoes_clinica (clinica_id, chave, valor) VALUES ($1, 'preferencias', '{}'::jsonb)`, [clinX]));
  check(G15, 'ninguém grava o dado do caixa de outra clínica',
    await barrado(comumX, `INSERT INTO public.configuracoes_clinica (clinica_id, chave, valor) VALUES ($1, 'lancamentos_meta', '{}'::jsonb)`, [clinY]));

  const docOk = await linhas(comumX,
    `INSERT INTO public.paciente_documentos (paciente_id, nome, tipo, storage_path, meta) VALUES ($1, 'laudo.pdf', 'application/pdf', $2, '{"isPdf": true, "tamanho": 10}'::jsonb)`,
    [pacX, `pacientes/${pacX}/documentos/1_laudo.pdf`]);
  check(G15, 'documento com arquivo do próprio paciente é aceito', docOk === 1, JSON.stringify(docOk));
  check(G15, 'documento não aponta para arquivo de outro paciente',
    await barrado(comumX, `INSERT INTO public.paciente_documentos (paciente_id, nome, storage_path, meta) VALUES ($1, 'x.pdf', $2, '{}'::jsonb)`,
      [pacX, `pacientes/${pacY}/documentos/1_x.pdf`]));
  check(G15, 'documento não leva HTML embutido',
    await barrado(comumX, `INSERT INTO public.paciente_documentos (paciente_id, nome, meta) VALUES ($1, 'x.pdf', $2::jsonb)`,
      [pacX, JSON.stringify({ isPdf: true, dataUrl: 'data:text/html,<script>alert(1)</script>' })]));
  check(G15, 'documento não leva endereço de prévia',
    await barrado(comumX, `INSERT INTO public.paciente_documentos (paciente_id, nome, meta) VALUES ($1, 'x.png', $2::jsonb)`,
      [pacX, JSON.stringify({ isImg: true, previewUrl: 'https://exemplo.com/x.png' })]));
  check(G15, 'imagem embutida em base64 continua aceita',
    (await linhas(comumX, `INSERT INTO public.paciente_documentos (paciente_id, nome, meta) VALUES ($1, 'x.png', $2::jsonb)`,
      [pacX, JSON.stringify({ isImg: true, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' })])) === 1);

  // ==================================================================
  // 16. Limites dos planos (o que a vitrine promete)
  // ==================================================================
  const G16 = 'Limites dos planos';
  const tentarLimite = async (sql, params) => {
    await db.query('SAVEPOINT limite');
    try {
      await db.query(sql, params);
      await db.query('RELEASE SAVEPOINT limite');
      return null;
    } catch (err) {
      await db.query('ROLLBACK TO SAVEPOINT limite');
      return err.message;
    }
  };
  const novaRede = async (plano) => {
    const rede = await um(`INSERT INTO public.redes (nome, plano) VALUES ($1, $2) RETURNING id`, [`RLS Plano ${plano} ${marca}`, plano]);
    const clinica = Number((await um(`INSERT INTO public.clinicas (nome, rede_id, is_matriz) VALUES ($1, $2, true) RETURNING id`, [`RLS Unidade ${plano} ${marca}`, rede.id])).id);
    return { rede: rede.id, clinica };
  };
  const vincular = (pessoa, clinica) => tentarLimite(`INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id) VALUES ($1, $2)`, [pessoa.prof, clinica]);
  const pessoas = [];
  for (let i = 0; i < 5; i += 1) pessoas.push(await criarPessoa(`plano-${i}`, i === 0 ? 'admin' : 'comum'));

  const basico = await novaRede('basico');
  check(G16, 'Básico: a primeira pessoa entra', (await vincular(pessoas[1], basico.clinica)) === null);
  const segunda = await vincular(pessoas[2], basico.clinica);
  check(G16, 'Básico: a segunda pessoa é recusada com a frase do plano', /plano Básico permite 1 profissional/.test(segunda || ''), segunda || 'entrou');
  check(G16, 'o dono da plataforma não ocupa vaga', (await vincular(dono, basico.clinica)) === null);
  const segundaUnidade = await tentarLimite(`INSERT INTO public.clinicas (nome, rede_id) VALUES ('RLS segunda unidade', $1)`, [basico.rede]);
  check(G16, 'Básico: a segunda unidade é recusada', /plano Básico permite 1 unidade/.test(segundaUnidade || ''), segundaUnidade || 'criou');
  const conviteCheio = await tentarLimite(
    `INSERT INTO public.convites_equipe (rede_id, clinica_ids, convidado_email, status) VALUES ($1, ARRAY[$2]::bigint[], $3, 'pendente')`,
    [basico.rede, basico.clinica, pessoas[2].email]);
  check(G16, 'Básico com a equipe completa: convite novo é recusado na hora', /plano Básico permite 1 profissional/.test(conviteCheio || ''), conviteCheio || 'convidou');
  await db.query(`DELETE FROM public.profissionais_clinicas WHERE profissional_id = $1 AND clinica_id = $2`, [pessoas[1].prof, basico.clinica]);
  check(G16, 'tirar alguém da equipe libera a vaga', (await vincular(pessoas[2], basico.clinica)) === null);

  const profissional = await novaRede('profissional');
  const tres = [];
  for (let i = 0; i < 3; i += 1) tres.push(await vincular(pessoas[i], profissional.clinica));
  const quarta = await vincular(pessoas[3], profissional.clinica);
  check(G16, 'Profissional: três pessoas entram e a quarta é recusada',
    tres.every((r) => r === null) && /plano Profissional permite até 3 profissionais/.test(quarta || ''), JSON.stringify([tres, quarta]));
  const uso = (await um(`SELECT public.plano_uso_rede($1) AS u`, [profissional.rede])).u;
  check(G16, 'uso do plano: 3 de 3 profissionais, 1 de 1 unidade',
    uso?.profissionais === 3 && uso?.limite_profissionais === 3 && uso?.unidades === 1 && uso?.limite_unidades === 1, JSON.stringify(uso));

  const clinicaPlano = await novaRede('clinica');
  const semLimite = [];
  for (let i = 0; i < 5; i += 1) semLimite.push(await vincular(pessoas[i], clinicaPlano.clinica));
  const outraUnidade = await tentarLimite(`INSERT INTO public.clinicas (nome, rede_id) VALUES ('RLS filial do plano Clínica', $1)`, [clinicaPlano.rede]);
  check(G16, 'Clínica: cinco pessoas e uma segunda unidade entram', semLimite.every((r) => r === null) && outraUnidade === null, JSON.stringify([semLimite, outraUnidade]));

  const combinado = await novaRede('essencial');
  const semPlano = [];
  for (let i = 0; i < 4; i += 1) semPlano.push(await vincular(pessoas[i], combinado.clinica));
  check(G16, 'plano combinado à mão (essencial): sem limite', semPlano.every((r) => r === null), JSON.stringify(semPlano));

  const usoAdmin = await como(pessoas[0], () => um(`SELECT public.assinatura_uso_do_plano($1) AS u`, [profissional.clinica]));
  const usoComum = await como(pessoas[2], () => um(`SELECT public.assinatura_uso_do_plano($1) AS u`, [profissional.clinica]));
  check(G16, 'administrador da matriz vê o uso do plano; membro comum não',
    usoAdmin?.u?.profissionais === 3 && usoComum && usoComum.u === null, JSON.stringify([usoAdmin, usoComum]));
  check(G16, 'cliente não executa plano_uso_rede direto', Boolean((await como(adminX, () => db.query(`SELECT public.plano_uso_rede($1)`, [redeX.id]))).erro));


  // ==================================================================
  // 17. Orçamentos e funil comercial (20261129_orcamentos)
  // ==================================================================
  const G17 = 'Orçamentos';
  const orcX = (await um(`INSERT INTO public.orcamentos (clinica_id, paciente_id, profissional_id, status, valor_total) VALUES ($1, $2, $3, 'enviado', 500) RETURNING id`, [clinX, pacX, adminX.prof])).id;
  const orcY = (await um(`INSERT INTO public.orcamentos (clinica_id, paciente_id, profissional_id, status, valor_total) VALUES ($1, $2, $3, 'enviado', 700) RETURNING id`, [clinY, pacY, adminY.prof])).id;
  await db.query(`INSERT INTO public.orcamento_itens (clinica_id, orcamento_id, procedimento, valor_unitario, valor_total) VALUES ($1, $2, 'RLS item Y', 700, 700)`, [clinY, orcY]);
  const pacX2 = (await um(`INSERT INTO public.pacientes (nome, telefone, clinica_id) VALUES ('RLS Paciente X2', '11999990002', $1) RETURNING id`, [clinX])).id;

  check(G17, 'membro comum cria orçamento para paciente da própria clínica',
    (await linhas(comumX, `INSERT INTO public.orcamentos (clinica_id, paciente_id) VALUES ($1, $2)`, [clinX, pacX])) === 1);
  // adminX é convidado aceito da clínica Y desde os testes de convite (G7): quem testa o isolamento é comumX.
  check(G17, 'ninguém lê orçamento de outra clínica',
    (await como(comumX, () => rows(`SELECT id FROM public.orcamentos WHERE id = $1`, [orcY]))).length === 0);
  check(G17, 'ninguém lê itens de orçamento de outra clínica',
    (await como(comumX, () => rows(`SELECT id FROM public.orcamento_itens WHERE orcamento_id = $1`, [orcY]))).length === 0);
  check(G17, 'ninguém cria orçamento em clínica alheia',
    await barrado(comumX, `INSERT INTO public.orcamentos (clinica_id, paciente_id) VALUES ($1, $2)`, [clinY, pacY]));
  check(G17, 'orçamento não aceita paciente de outra clínica',
    await barrado(adminX, `INSERT INTO public.orcamentos (clinica_id, paciente_id) VALUES ($1, $2)`, [clinX, pacY]));
  check(G17, 'orçamento não aceita profissional nem comercial de outra clínica',
    await barrado(adminX, `INSERT INTO public.orcamentos (clinica_id, paciente_id, profissional_id) VALUES ($1, $2, $3)`, [clinX, pacX, adminY.prof])
    && await barrado(adminX, `INSERT INTO public.orcamentos (clinica_id, paciente_id, comercial_id) VALUES ($1, $2, $3)`, [clinX, pacX, adminY.prof]));
  check(G17, 'item não aponta para orçamento de outra clínica',
    await barrado(adminX, `INSERT INTO public.orcamento_itens (clinica_id, orcamento_id, procedimento) VALUES ($1, $2, 'x')`, [clinX, orcY]));
  check(G17, 'contato fica no paciente do próprio orçamento',
    await barrado(adminX, `INSERT INTO public.orcamento_contatos (clinica_id, paciente_id, orcamento_id, resumo) VALUES ($1, $2, $3, 'x')`, [clinX, pacX2, orcX]));
  check(G17, 'quem é de outra clínica não registra contato aqui',
    await barrado(adminY, `INSERT INTO public.orcamento_contatos (clinica_id, paciente_id, resumo) VALUES ($1, $2, 'x')`, [clinX, pacX]));
  check(G17, 'tratamento não aponta para orçamento de outro paciente',
    await barrado(adminX, `INSERT INTO public.paciente_tratamentos (paciente_id, clinica_id, procedimento, orcamento_id) VALUES ($1, $2, 'x', $3)`, [pacX2, clinX, orcX]));
  check(G17, 'débito não aponta para orçamento de outro paciente',
    await barrado(adminX, `INSERT INTO public.paciente_debitos (paciente_id, clinica_id, descricao, valor, status, orcamento_id) VALUES ($1, $2, 'x', 1, 'pendente', $3)`, [pacX2, clinX, orcX]));
  check(G17, 'o desktop reenvia o orçamento inteiro sem mudar nada',
    (await linhas(adminX, `UPDATE public.orcamentos SET paciente_id = paciente_id, profissional_id = profissional_id, status = status WHERE id = $1`, [orcX])) === 1);
  check(G17, 'outra clínica não muda o status do orçamento',
    await barrado(adminY, `UPDATE public.orcamentos SET status = 'aprovado' WHERE id = $1`, [orcX]));
  await db.query('SAVEPOINT modulo');
  let moduloInvalido = false;
  try {
    await db.query(`INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar) VALUES ($1, $2, 'modulo_inventado', true)`, [comumX.prof, clinX]);
  } catch {
    moduloInvalido = true;
  }
  await db.query('ROLLBACK TO SAVEPOINT modulo');
  await db.query('SAVEPOINT modulo');
  let modulosNovos = false;
  try {
    const r = await db.query(
      `INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar) VALUES ($1, $2, 'orcamentos', true), ($1, $2, 'conversas', true)
       ON CONFLICT (profissional_id, clinica_id, modulo) DO UPDATE SET pode_acessar = true`, [comumX.prof, clinX]);
    modulosNovos = r.rowCount === 2;
  } catch {
    modulosNovos = false;
  }
  await db.query('ROLLBACK TO SAVEPOINT modulo');
  check(G17, 'permissão aceita os módulos orcamentos e conversas e recusa nome inventado', moduloInvalido && modulosNovos);

  // ==================================================================
  // 18. Meta de vendas (20261130_metas_vendas)
  // ==================================================================
  const G18 = 'Meta de vendas';
  const metaY = (await um(`INSERT INTO public.metas_vendas (clinica_id, mes, valor) VALUES ($1, date_trunc('month', current_date)::date, 9000) RETURNING id`, [clinY])).id;
  check(G18, 'administrador define a meta da própria clínica',
    (await linhas(adminX, `INSERT INTO public.metas_vendas (clinica_id, mes, valor) VALUES ($1, date_trunc('month', current_date)::date, 5000)`, [clinX])) === 1);
  check(G18, 'membro comum não define meta',
    await barrado(comumX, `INSERT INTO public.metas_vendas (clinica_id, mes, valor) VALUES ($1, date_trunc('month', current_date)::date, 5000)`, [clinX]));
  check(G18, 'membro comum lê a meta da clínica',
    !(await como(comumX, () => rows(`SELECT id FROM public.metas_vendas WHERE clinica_id = $1`, [clinX]))).erro);
  check(G18, 'ninguém lê a meta de outra clínica',
    (await como(comumX, () => rows(`SELECT id FROM public.metas_vendas WHERE id = $1`, [metaY]))).length === 0);
  check(G18, 'meta não aceita profissional de outra clínica',
    await barrado(adminX, `INSERT INTO public.metas_vendas (clinica_id, mes, profissional_id, valor) VALUES ($1, date_trunc('month', current_date)::date, $2, 100)`, [clinX, adminY.prof]));
  check(G18, 'meta só no primeiro dia do mês e uma total por mês',
    await barrado(adminX, `INSERT INTO public.metas_vendas (clinica_id, mes, valor) VALUES ($1, date_trunc('month', current_date)::date + 3, 100)`, [clinX])
    && await barrado(adminY, `INSERT INTO public.metas_vendas (clinica_id, mes, valor) VALUES ($1, date_trunc('month', current_date)::date, 100)`, [clinY]));

  // ==================================================================
  // 19. Conversas da equipe e suporte (20261201_conversas)
  // ==================================================================
  const G19 = 'Conversas';
  const geralX = (await um(`SELECT id FROM public.conversa_canais WHERE clinica_id = $1 AND geral`, [clinX]))?.id;
  const geralY = (await um(`SELECT id FROM public.conversa_canais WHERE clinica_id = $1 AND geral`, [clinY]))?.id;
  check(G19, 'toda clínica nasce com o canal Geral', Boolean(geralX && geralY));
  await db.query(`INSERT INTO public.conversa_mensagens (clinica_id, canal_id, autor_id, texto) VALUES ($1, $2, $3, 'RLS recado X')`, [clinX, geralX, adminX.prof]);

  check(G19, 'quem trabalha na clínica lê o canal Geral',
    (await como(comumX, () => rows(`SELECT id FROM public.conversa_mensagens WHERE canal_id = $1`, [geralX]))).length === 1);
  check(G19, 'quem é de outra clínica não lê o chat da equipe',
    (await como(comumY, () => rows(`SELECT id FROM public.conversa_mensagens WHERE canal_id = $1`, [geralX]))).length === 0);
  check(G19, 'dono da plataforma NÃO lê o chat da equipe das clínicas',
    (await como(dono, () => rows(`SELECT id FROM public.conversa_mensagens WHERE clinica_id = $1`, [clinX]))).length === 0
    && (await como(dono, () => rows(`SELECT id FROM public.conversa_canais WHERE clinica_id = $1`, [clinX]))).length === 0);
  check(G19, 'dono da plataforma não escreve no chat da equipe',
    await barrado(dono, `INSERT INTO public.conversa_mensagens (clinica_id, canal_id, texto) VALUES ($1, $2, 'x')`, [clinX, geralX]));
  const autor = await como(comumX, () => rows(
    `INSERT INTO public.conversa_mensagens (clinica_id, canal_id, autor_id, texto) VALUES ($1, $2, $3, 'oi') RETURNING autor_id`, [clinX, geralX, adminX.prof]));
  check(G19, 'o autor da mensagem é sempre quem está logado', !autor.erro && Number(autor[0]?.autor_id) === comumX.prof, JSON.stringify(autor));
  check(G19, 'membro comum não cria canal; administrador cria',
    await barrado(comumX, `INSERT INTO public.conversa_canais (clinica_id, nome) VALUES ($1, 'comercial')`, [clinX])
    && (await linhas(adminX, `INSERT INTO public.conversa_canais (clinica_id, nome) VALUES ($1, 'comercial')`, [clinX])) === 1);
  check(G19, 'dono da plataforma não cria canal em clínica',
    await barrado(dono, `INSERT INTO public.conversa_canais (clinica_id, nome) VALUES ($1, 'ortus')`, [clinX]));
  check(G19, 'ninguém apaga a mensagem de outra pessoa',
    await barrado(comumX, `DELETE FROM public.conversa_mensagens WHERE canal_id = $1 AND autor_id = $2`, [geralX, adminX.prof]));
  const leituraCanal = await como(comumX, () => rows(
    `INSERT INTO public.conversa_leituras (canal_id, profissional_id, clinica_id) VALUES ($1, $2, $3) RETURNING profissional_id`, [geralX, adminX.prof, clinX]));
  check(G19, 'a leitura gravada é sempre de quem está logado', !leituraCanal.erro && Number(leituraCanal[0]?.profissional_id) === comumX.prof, JSON.stringify(leituraCanal));

  const abriu = await como(comumX, () => rows(`SELECT public.suporte_abrir($1) AS id`, [clinX]), { manter: true });
  const suporteX = abriu?.[0]?.id;
  check(G19, 'quem trabalha na clínica abre a conversa com o suporte', Boolean(suporteX), JSON.stringify(abriu));
  check(G19, 'ninguém abre a conversa de suporte de outra clínica',
    Boolean((await como(comumY, () => db.query(`SELECT public.suporte_abrir($1)`, [clinX]))).erro));
  const lado = await como(comumX, () => rows(
    `INSERT INTO public.suporte_mensagens (conversa_id, clinica_id, lado, texto) VALUES ($1, $2, 'ortus', 'socorro') RETURNING lado`, [suporteX, clinY]), { manter: true });
  check(G19, 'a clínica não se passa pela Ortus: o lado é definido pelo banco', !lado.erro && lado[0]?.lado === 'clinica', JSON.stringify(lado));
  check(G19, 'dono da plataforma lê a conversa de suporte',
    (await como(dono, () => rows(`SELECT id FROM public.suporte_mensagens WHERE conversa_id = $1`, [suporteX]))).length === 1);
  check(G19, 'outra clínica não lê a conversa de suporte',
    (await como(comumY, () => rows(`SELECT id FROM public.suporte_mensagens WHERE conversa_id = $1`, [suporteX]))).length === 0);
  const resposta = await como(dono, () => rows(
    `INSERT INTO public.suporte_mensagens (conversa_id, lado, texto) VALUES ($1, 'clinica', 'olá, aqui é a Ortus') RETURNING lado`, [suporteX]));
  check(G19, 'resposta do dono sai como Ortus', !resposta.erro && resposta[0]?.lado === 'ortus', JSON.stringify(resposta));
  check(G19, 'ninguém altera nem apaga mensagem de suporte',
    await barrado(comumX, `UPDATE public.suporte_mensagens SET texto = 'x' WHERE conversa_id = $1`, [suporteX])
    && await barrado(dono, `DELETE FROM public.suporte_mensagens WHERE conversa_id = $1`, [suporteX]));
  check(G19, 'presença e conversa só mudam pelas funções',
    await barrado(dono, `INSERT INTO public.suporte_presenca (user_id) VALUES ($1)`, [dono.sub])
    && await barrado(comumX, `UPDATE public.suporte_conversas SET ortus_leu_ate = now() WHERE id = $1`, [suporteX]));
  check(G19, 'só a Ortus bate presença no painel de suporte',
    Boolean((await como(comumX, () => db.query(`SELECT public.suporte_presenca_bater()`))).erro)
    && !(await como(dono, () => db.query(`SELECT public.suporte_presenca_bater()`))).erro);

  // Rede Y em modo de consulta (rede inativa = suspensa, como no grupo de assinaturas).
  await db.query('SAVEPOINT suspensa');
  await db.query(`UPDATE public.redes SET ativa = false WHERE id = $1`, [redeY.id]);
  const statusY = (await um(`SELECT public.clinica_aceita_escrita($1) AS ok`, [clinY]))?.ok === false ? 'bloqueada' : 'ativa';
  const suporteY = (await como(comumY, () => rows(`SELECT public.suporte_abrir($1) AS id`, [clinY]), { manter: true }))?.[0]?.id;
  const escreveSuporte = await linhas(comumY, `INSERT INTO public.suporte_mensagens (conversa_id, lado, texto) VALUES ($1, 'clinica', 'estamos bloqueados')`, [suporteY]);
  const escreveEquipe = await como(comumY, () => db.query(`INSERT INTO public.conversa_mensagens (clinica_id, canal_id, texto) VALUES ($1, $2, 'x')`, [clinY, geralY]));
  await db.query('ROLLBACK TO SAVEPOINT suspensa');
  check(G19, 'clínica em modo de consulta ainda escreve ao suporte, mas não no chat da equipe',
    statusY === 'bloqueada' && escreveSuporte === 1 && escreveEquipe?.codigo === 'PT402',
    JSON.stringify({ statusY, escreveSuporte, equipe: escreveEquipe?.codigo || escreveEquipe?.rowCount }));

} catch (e) {
  check('Suíte', 'a suíte rodou até o fim', false, e.message);
} finally {
  await db.query('ROLLBACK').catch(() => undefined);
  console.log('=== RESULTADO ===');
  let falhas = 0;
  let grupoAtual = '';
  for (const r of resultados) {
    if (r.grupo !== grupoAtual) { grupoAtual = r.grupo; console.log(`\n${grupoAtual}`); }
    if (!r.ok) falhas += 1;
    console.log(`  ${r.ok ? 'OK   ' : 'FALHA'} ${r.nome}${r.detalhe && !r.ok ? `  → ${r.detalhe}` : ''}`);
  }
  console.log(`\n${resultados.length - falhas}/${resultados.length} verificações OK. Nada foi gravado (ROLLBACK).`);
  await db.end();
  process.exit(falhas ? 1 : 0);
}
