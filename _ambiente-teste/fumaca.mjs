// Teste de fumaça do ambiente local com o supabase-js do próprio projeto.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(AQUI, '..', 'ortus', 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(path.join(AQUI, 'env.gerado'), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

const novo = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function entrar(email) {
  const c = novo();
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'Teste@1234' });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { c, user: data.user, token: data.session.access_token };
}

const ok = (nome, cond, extra = '') => console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${extra ? ` — ${extra}` : ''}`);

const bia = await entrar('bia.recepcao@maissorriso.test');
const dani = await entrar('dani.dentista@bemestar.test');
const ana = await entrar('ana.admin@maissorriso.test');

const pb = await bia.c.from('pacientes').select('id, nome, clinica_id, clinicas(nome), planos(nome, tipo)').order('nome');
ok('bia lista pacientes com junções', !pb.error && pb.data.length === 8 && pb.data[0].clinicas?.nome === 'Mais Sorriso', pb.error?.message || `${pb.data?.length} linhas`);
const pd = await dani.c.from('pacientes').select('id, clinica_id');
ok('dani só vê a própria clínica', !pd.error && pd.data.length === 5, `${pd.data?.length} linhas`);
const alvo = pb.data[0].id;
const cruz = await dani.c.from('pacientes').select('id').eq('id', alvo).maybeSingle();
ok('dani não lê paciente da outra clínica', !cruz.error && cruz.data === null, JSON.stringify(cruz.data));
const del = await bia.c.from('pacientes').delete().eq('id', alvo).select('id');
ok('bia (comum) não apaga paciente', !del.error && del.data.length === 0, del.error?.message || `${del.data?.length} apagados`);
const anon = await novo().from('pacientes').select('id');
ok('visitante sem login não lê pacientes', !!anon.error || anon.data.length === 0, anon.error?.message || 'vazio');

const ag = await ana.c.from('agendamentos').select('id, data_hora, procedimento, pacientes(nome), profissionais(nome)').in('status', ['agendado']).order('data_hora').limit(3);
ok('ana lista agenda com paciente e profissional', !ag.error && ag.data.length === 3 && !!ag.data[0].pacientes?.nome, ag.error?.message || '');
const cont = await ana.c.from('pacientes').select('*', { count: 'exact', head: true });
ok('contagem exata', cont.count === 8, String(cont.count));
const ins = await ana.c.from('tarefas').insert({ clinica_id: pb.data[0].clinica_id, titulo: 'Teste de fumaça', status: 'a_fazer' }).select('id, titulo').single();
ok('ana insere tarefa e recebe a linha', !ins.error && ins.data.titulo === 'Teste de fumaça', ins.error?.message || '');
const upd = await ana.c.from('tarefas').update({ status: 'concluido' }).eq('id', ins.data?.id).select('status').single();
ok('ana atualiza tarefa', !upd.error && upd.data.status === 'concluido', upd.error?.message || '');
const rm = await ana.c.from('tarefas').delete().eq('id', ins.data?.id);
ok('ana apaga tarefa', !rm.error, rm.error?.message || '');
const ups = await ana.c.from('configuracoes_clinica').upsert({ clinica_id: pb.data[0].clinica_id, chave: 'fumaca', valor: { a: 1 }, updated_at: new Date().toISOString() }, { onConflict: 'clinica_id,chave' });
ok('ana faz upsert de configuração', !ups.error, ups.error?.message || '');
const orq = await ana.c.from('agendamentos').select('id').or('tipo_registro.is.null,tipo_registro.eq.agenda').limit(2);
ok('filtro or()', !orq.error && orq.data.length === 2, orq.error?.message || '');
const rpc = await ana.c.rpc('saas_visao_geral');
ok('painel SaaS negado para admin de clínica', !!rpc.error, rpc.error?.message || 'passou!');
const gab = await entrar('gabriel@ortus.test');
const rpc2 = await gab.c.rpc('saas_visao_geral');
ok('painel SaaS liberado para dono', !rpc2.error && Array.isArray(rpc2.data?.redes), rpc2.error?.message || `${rpc2.data?.redes?.length} redes`);
const u = await admin.auth.getUser(bia.token);
ok('service role valida o JWT do usuário', !u.error && u.data.user.email === 'bia.recepcao@maissorriso.test', u.error?.message || '');
const uso = await admin.rpc('armazenamento_uso_projeto');
ok('rpc de armazenamento com service role', !uso.error, uso.error?.message || String(uso.data));
