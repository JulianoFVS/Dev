// Google Agenda — ponta a ponta (precisa do app em :3000 e do ambiente de teste
// com o Google falso em /google). Cobre a tela de Integrações, conectar pelo
// consentimento, enviar/remarcar/cancelar, Google fora do ar, horários
// ocupados lidos do Google e desligar.
import { APP, SEGREDO_CRON, api, entrar, env, fim, ok, secao, sql } from './util.mjs';

const GOOGLE = `${env.NEXT_PUBLIC_SUPABASE_URL}/google`;
const google = async (caminho, opcoes) => (await fetch(`${GOOGLE}${caminho}`, opcoes)).json();
const estadoGoogle = () => google('/_teste/estado');
const falhaGoogle = (ligar) => google(`/_teste/falha?ligar=${ligar ? 1 : 0}`);
const rotinaRapida = async () => {
  const r = await fetch(`${APP}/api/rotinas/rapida`, { method: 'POST', headers: { authorization: `Bearer ${SEGREDO_CRON}` } });
  return { status: r.status, dados: await r.json().catch(() => null) };
};
const CONTA = 'ana.e2e@google.test';
const eventosDaConta = async () => (await estadoGoogle()).eventos?.[CONTA] || [];
const eventoDe = async (agendamentoId) => (await eventosDaConta()).find((e) => e.extendedProperties?.private?.ortus_agendamento === String(agendamentoId));
const diaUtc = (dias, hora, minuto = 0) => {
  const d = new Date(Date.now() + dias * 86_400_000);
  d.setUTCHours(hora, minuto, 0, 0);
  return d.toISOString();
};

const ana = await entrar('ana.admin@maissorriso.test');
const bia = await entrar('bia.recepcao@maissorriso.test');
const dani = await entrar('dani.dentista@bemestar.test');
const gabriel = await entrar('gabriel@ortus.test');
const [clinA] = await sql(`SELECT id FROM clinicas WHERE nome = 'Mais Sorriso'`);
const cA = Number(clinA.id);
const [profAna] = await sql(`SELECT id FROM profissionais WHERE user_id = $1`, [ana.user.id]);
const profAnaId = Number(profAna.id);
const [pac] = await sql(`SELECT id, nome FROM pacientes WHERE clinica_id = $1 AND nome LIKE '% %' ORDER BY id LIMIT 1`, [cA]);
const [primeiroNome, ...resto] = pac.nome.trim().split(/\s+/);
const criados = [];

async function esvaziarFila(quem = ana) {
  let ultimo = null;
  for (let i = 0; i < 20; i += 1) {
    ultimo = await api(quem, '/api/google/empurrar', { metodo: 'POST', corpo: {} });
    const [{ n }] = await sql(`SELECT count(*)::int AS n FROM google_fila WHERE clinica_id = $1 AND proxima_tentativa_em <= now()`, [cA]);
    if (Number(n) === 0) break;
  }
  return ultimo;
}
async function marcar(dados) {
  const r = await bia.c.from('agendamentos').insert({
    clinica_id: cA, paciente_id: pac.id, profissional_id: profAnaId, status: 'agendado', cor: 'blue', ...dados,
  }).select('id').single();
  if (r.data?.id) criados.push(r.data.id);
  return r;
}

try {
  secao('Integrações (Painel SaaS)');
  const cfg = await api(gabriel, '/api/super-admin/integracoes');
  ok('a equipe da Ortus vê a integração do Google ligada com o cliente de teste',
    cfg.status === 200 && cfg.dados?.google?.clientId === 'teste-ortus' && cfg.dados.google.ativo === true && cfg.dados.google.modoTeste === true, JSON.stringify(cfg.dados));
  ok('a tela mostra a URI de retorno para cadastrar no Google', /\/api\/google\/retorno$/.test(cfg.dados?.google?.urlRetorno || ''), cfg.dados?.google?.urlRetorno);
  ok('o servidor tem a chave para cifrar o segredo', cfg.dados?.cifraDisponivel === true);
  ok('administrador de clínica não vê as credenciais', (await api(ana, '/api/super-admin/integracoes')).status === 403);
  ok('administrador de clínica não troca as credenciais',
    (await api(ana, '/api/super-admin/integracoes', { metodo: 'POST', corpo: { ativo: true, clientId: '1-a.apps.googleusercontent.com', clientSecret: 'x' } })).status === 403);
  ok('sem login, nada', (await api(null, '/api/super-admin/integracoes')).status === 401);
  const semSegredo = await api(gabriel, '/api/super-admin/integracoes', { metodo: 'POST', corpo: { ativo: true, clientId: '123-abc.apps.googleusercontent.com' } });
  ok('credencial real sem o segredo é recusada', semSegredo.status === 400, JSON.stringify(semSegredo.dados));
  const comSegredo = await api(gabriel, '/api/super-admin/integracoes', { metodo: 'POST', corpo: { ativo: true, clientId: 'teste-ortus', clientSecret: 'segredo-e2e-ABCD' } });
  const depoisCfg = await api(gabriel, '/api/super-admin/integracoes');
  const [linhaCfg] = await sql(`SELECT segredo_cifrado FROM plataforma_integracoes WHERE chave = 'google'`);
  ok('o segredo vai cifrado ao banco e só os 4 últimos voltam à tela',
    comSegredo.status === 200 && depoisCfg.dados?.google?.segredoFinal === 'ABCD' && !JSON.stringify(depoisCfg.dados).includes('segredo-e2e')
    && String(linhaCfg?.segredo_cifrado || '').startsWith('v1:') && !String(linhaCfg.segredo_cifrado).includes('segredo-e2e'), JSON.stringify(depoisCfg.dados));
  const mantem = await api(gabriel, '/api/super-admin/integracoes', { metodo: 'POST', corpo: { ativo: true, clientId: 'teste-ortus', clientSecret: '' } });
  const [linhaMantida] = await sql(`SELECT segredo_cifrado FROM plataforma_integracoes WHERE chave = 'google'`);
  ok('salvar com o segredo vazio mantém o guardado', mantem.status === 200 && linhaMantida.segredo_cifrado === linhaCfg.segredo_cifrado);

  secao('Conectar');
  const st0 = await api(ana, '/api/google/status');
  ok('o perfil mostra a integração ligada e a agenda desconectada', st0.status === 200 && st0.dados.integracao === true && st0.dados.conectado === false, JSON.stringify(st0.dados));
  const recusa = await api(ana, '/api/google/conectar', { metodo: 'POST', corpo: {} });
  const estadoRecusa = new URL(recusa.dados.url).searchParams.get('state');
  const voltaRecusa = await fetch(`${APP}/api/google/retorno?error=access_denied&state=${estadoRecusa}`, { redirect: 'manual' });
  ok('recusar no Google volta ao perfil avisando', voltaRecusa.status === 303 && /\/perfil\?google=recusado$/.test(voltaRecusa.headers.get('location') || ''), voltaRecusa.headers.get('location'));

  const con = await api(ana, '/api/google/conectar', { metodo: 'POST', corpo: {} });
  const urlAuth = new URL(con.dados?.url || 'http://x/');
  const estado = urlAuth.searchParams.get('state') || '';
  ok('conectar devolve o consentimento do Google com state, acesso offline e escopo só de eventos',
    con.status === 200 && estado.length >= 32 && urlAuth.searchParams.get('scope') === 'openid email https://www.googleapis.com/auth/calendar.events'
    && urlAuth.searchParams.get('access_type') === 'offline' && urlAuth.searchParams.get('redirect_uri') === `${APP}/api/google/retorno`, con.dados?.url);
  const [estadoGuardado] = await sql(`SELECT count(*)::int AS n FROM google_oauth_estados WHERE estado_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')`, [estado]);
  const [estadoClaro] = await sql(`SELECT count(*)::int AS n FROM google_oauth_estados WHERE estado_hash = $1`, [estado]);
  ok('o state fica guardado só em hash', estadoGuardado.n === 1 && estadoClaro.n === 0);
  ok('estado inventado não conecta', /google=erro/.test((await fetch(`${APP}/api/google/retorno?code=abc&state=${'x'.repeat(43)}`, { redirect: 'manual' })).headers.get('location') || ''));
  const tokensAntes = (await estadoGoogle()).tokens;
  const consentimento = await fetch(`${con.dados.url}&auto=1&conta=${encodeURIComponent(CONTA)}`, { redirect: 'manual' });
  const voltaGoogle = consentimento.headers.get('location') || '';
  ok('o Google devolve o código para a URI cadastrada', consentimento.status === 302 && voltaGoogle.startsWith(`${APP}/api/google/retorno?`), voltaGoogle);
  const retorno = await fetch(voltaGoogle, { redirect: 'manual' });
  ok('o retorno conecta e volta ao perfil', retorno.status === 303 && /\/perfil\?google=conectado$/.test(retorno.headers.get('location') || ''), `${retorno.status} ${retorno.headers.get('location')}`);
  const repetido = await fetch(voltaGoogle, { redirect: 'manual' });
  ok('o mesmo retorno não serve duas vezes', /google=erro/.test(repetido.headers.get('location') || ''), repetido.headers.get('location'));
  const st1 = await api(ana, '/api/google/status');
  ok('o perfil mostra a conta conectada', st1.dados?.conectado === true && st1.dados.ativo === true && st1.dados.email === CONTA, JSON.stringify(st1.dados));
  const [conexao] = await sql(`SELECT refresh_token_cifrado FROM google_conexoes WHERE profissional_id = $1`, [profAnaId]);
  ok('o token do Google fica cifrado no banco', String(conexao?.refresh_token_cifrado || '').startsWith('v1:') && !String(conexao.refresh_token_cifrado).includes('teste-'));
  ok('o Google entregou um token de renovação', (await estadoGoogle()).tokens === tokensAntes + 1);
  const statusBia = await api(bia, '/api/google/status');
  ok('a conexão é de cada profissional: a recepção continua desconectada', statusBia.dados?.conectado === false, JSON.stringify(statusBia.dados));

  secao('Enviar, remarcar e cancelar');
  const [{ n: enfileirados }] = await sql(`SELECT count(*)::int AS n FROM google_fila WHERE clinica_id = $1`, [cA]);
  ok('ao conectar, as próximas consultas da Ana entram na fila', enfileirados > 0, String(enfileirados));
  await esvaziarFila();
  const [{ n: enviadosSeed }] = await sql(`SELECT count(*)::int AS n FROM google_eventos WHERE profissional_id = $1 AND estado = 'enviado'`, [profAnaId]);
  ok('as consultas já marcadas foram para o Google', enviadosSeed > 0 && (await eventosDaConta()).length === enviadosSeed, `${enviadosSeed} / ${(await eventosDaConta()).length}`);

  const inicio = diaUtc(1, 12, 50);
  const novo = await marcar({ data_hora: inicio, duracao_minutos: 45, procedimento: 'Limpeza', observacoes: 'e2e: alergia a dipirona', valor: 987.65, valor_final: 987.65 });
  ok('a recepção marca a consulta da Ana', !novo.error, novo.error?.message);
  const [{ n: naFila }] = await sql(`SELECT count(*)::int AS n FROM google_fila WHERE agendamento_id = $1`, [novo.data.id]);
  ok('a consulta nova entra na fila do Google', naFila === 1, String(naFila));
  const empurrao = await esvaziarFila(bia);
  const ev = await eventoDe(novo.data.id);
  ok('a tela cutuca e a consulta vai para o Google da Ana', empurrao?.status === 200 && Boolean(ev), JSON.stringify(empurrao?.dados));
  ok('o evento leva só o primeiro nome e o tipo da consulta', ev?.summary === `${primeiroNome} · Limpeza` && ev?.description === 'Consulta marcada no Ortus.', JSON.stringify(ev));
  const textoEvento = JSON.stringify(ev || {});
  ok('sem sobrenome, observação ou valor no Google',
    !resto.some((parte) => parte.length > 2 && textoEvento.includes(parte)) && !textoEvento.includes('dipirona') && !textoEvento.includes('987'), textoEvento);
  ok('o evento tem a duração da consulta', ev && Date.parse(ev.end.dateTime) - Date.parse(ev.start.dateTime) === 45 * 60_000, JSON.stringify(ev?.start));
  const [estadoEnvio] = await sql(`SELECT estado FROM google_eventos WHERE agendamento_id = $1`, [novo.data.id]);
  ok('a agenda sabe que foi enviado', estadoEnvio?.estado === 'enviado');

  await bia.c.from('agendamentos').update({ observacoes: 'e2e: só uma nota nova' }).eq('id', novo.data.id);
  const [{ n: soNota }] = await sql(`SELECT count(*)::int AS n FROM google_fila WHERE agendamento_id = $1`, [novo.data.id]);
  ok('mudar só a observação não mexe no Google', soNota === 0, String(soNota));

  const novaHora = diaUtc(2, 13, 50);
  await bia.c.from('agendamentos').update({ data_hora: novaHora }).eq('id', novo.data.id);
  await esvaziarFila(bia);
  const remarcado = await eventoDe(novo.data.id);
  ok('remarcar muda o evento no Google (o mesmo evento)', remarcado?.id === ev?.id && Date.parse(remarcado.start.dateTime) === Date.parse(novaHora), JSON.stringify(remarcado?.start));

  await bia.c.from('agendamentos').update({ status: 'cancelado' }).eq('id', novo.data.id);
  await esvaziarFila(bia);
  const cancelado = await eventoDe(novo.data.id);
  const [estadoCancelado] = await sql(`SELECT estado FROM google_eventos WHERE agendamento_id = $1`, [novo.data.id]);
  ok('cancelar tira o evento do Google', cancelado?.status === 'cancelled' && estadoCancelado?.estado === 'removido', JSON.stringify({ g: cancelado?.status, e: estadoCancelado }));

  secao('Google fora do ar');
  await falhaGoogle(true);
  const outro = await marcar({ data_hora: diaUtc(3, 12, 50), duracao_minutos: 30, procedimento: 'Avaliação' });
  const comFalha = await api(bia, '/api/google/empurrar', { metodo: 'POST', corpo: {} });
  const [salvo] = await sql(`SELECT id, status FROM agendamentos WHERE id = $1`, [outro.data?.id]);
  const [evFalha] = await sql(`SELECT estado, ultimo_erro FROM google_eventos WHERE agendamento_id = $1`, [outro.data?.id]);
  ok('com o Google fora do ar, a consulta fica salva na Ortus', !outro.error && salvo?.status === 'agendado', outro.error?.message);
  ok('e a agenda fica sabendo que não foi enviada', comFalha.status === 200 && comFalha.dados?.falhas >= 1 && evFalha?.estado === 'falha' && /503/.test(evFalha.ultimo_erro || ''), JSON.stringify({ r: comFalha.dados, evFalha }));
  const vistoBia = await bia.c.from('google_eventos').select('estado').eq('agendamento_id', outro.data.id);
  ok('a recepção lê a falha (o aviso da agenda)', vistoBia.data?.[0]?.estado === 'falha', JSON.stringify(vistoBia));
  const vistoDani = await dani.c.from('google_eventos').select('estado').eq('agendamento_id', outro.data.id);
  ok('outra clínica não lê', !vistoDani.error && vistoDani.data.length === 0);
  const [espera] = await sql(`SELECT tentativas, proxima_tentativa_em > now() AS depois FROM google_fila WHERE agendamento_id = $1`, [outro.data.id]);
  ok('a fila espera um pouco antes de tentar sozinha de novo', espera?.tentativas === 1 && espera.depois === true, JSON.stringify(espera));
  await falhaGoogle(false);
  const alheio = await dani.c.rpc('google_tentar_de_novo', { p_agendamento: outro.data.id });
  ok('outra clínica não pede "tentar de novo" daqui', Boolean(alheio.error), JSON.stringify(alheio));
  const semFalha = await bia.c.rpc('google_tentar_de_novo', { p_agendamento: novo.data.id });
  ok('o que não falhou não volta para a fila', semFalha.data === false, JSON.stringify(semFalha));
  const pedido = await bia.c.rpc('google_tentar_de_novo', { p_agendamento: outro.data.id });
  const [{ n: naFilaDeNovo }] = await sql(`SELECT count(*)::int AS n FROM google_fila WHERE agendamento_id = $1 AND proxima_tentativa_em <= now()`, [outro.data.id]);
  ok('"Tentar de novo" põe a consulta na fila na hora (vale no aplicativo também)', pedido.data === true && naFilaDeNovo === 1, JSON.stringify({ pedido, naFilaDeNovo }));
  const denovo = await api(bia, '/api/google/empurrar', { metodo: 'POST', corpo: {} });
  const [evDenovo] = await sql(`SELECT estado, ultimo_erro FROM google_eventos WHERE agendamento_id = $1`, [outro.data.id]);
  ok('e a tela, cutucando, envia na hora', denovo.status === 200 && evDenovo?.estado === 'enviado' && evDenovo.ultimo_erro === null && Boolean(await eventoDe(outro.data.id)), JSON.stringify({ r: denovo.dados, evDenovo }));

  secao('Horários ocupados no Google');
  const inicioExt = diaUtc(4, 17, 0);
  const fimExt = diaUtc(4, 18, 30);
  await google('/_teste/externo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: CONTA, inicio: inicioExt, fim: fimExt, summary: 'Médico (pessoal)' }) });
  await sql(`UPDATE google_conexoes SET ultima_leitura_em = NULL WHERE profissional_id = $1`, [profAnaId]);
  const rot = await rotinaRapida();
  const bloq = await bia.c.from('google_bloqueios').select('inicio, fim, google_event_id').eq('profissional_id', profAnaId);
  ok('a rotina rápida lê o Google', rot.status === 200, JSON.stringify(rot.dados));
  ok('o compromisso marcado direto no Google ocupa o horário na Ortus',
    !bloq.error && bloq.data.length === 1 && Date.parse(bloq.data[0].inicio) === Date.parse(inicioExt) && Date.parse(bloq.data[0].fim) === Date.parse(fimExt), JSON.stringify(bloq.data));
  ok('os eventos que a própria Ortus criou não viram bloqueio', bloq.data?.length === 1);
  const blDani = await dani.c.from('google_bloqueios').select('id').eq('profissional_id', profAnaId);
  ok('outra clínica não vê os horários da Ana', !blDani.error && blDani.data.length === 0);
  const [{ sync }] = await sql(`SELECT sync_token IS NOT NULL AS sync FROM google_conexoes WHERE profissional_id = $1`, [profAnaId]);
  const inicioExt2 = diaUtc(5, 17, 0);
  await google('/_teste/externo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: CONTA, inicio: inicioExt2, fim: diaUtc(5, 18, 0) }) });
  await sql(`UPDATE google_conexoes SET ultima_leitura_em = NULL WHERE profissional_id = $1`, [profAnaId]);
  await rotinaRapida();
  const [{ n: doisBloq }] = await sql(`SELECT count(*)::int AS n FROM google_bloqueios WHERE profissional_id = $1`, [profAnaId]);
  ok('as leituras seguintes são só do que mudou (syncToken) e somam', sync === true && doisBloq === 2, JSON.stringify({ sync, doisBloq }));
  const pref = await api(ana, '/api/google/preferencias', { metodo: 'POST', corpo: { bloquear_horarios: false } });
  const [{ n: semBloq }] = await sql(`SELECT count(*)::int AS n FROM google_bloqueios WHERE profissional_id = $1`, [profAnaId]);
  ok('desligar "ocupar meu horário" libera a agenda na hora', pref.status === 200 && semBloq === 0, String(semBloq));
  await sql(`UPDATE google_conexoes SET ultima_leitura_em = NULL WHERE profissional_id = $1`, [profAnaId]);
  await rotinaRapida();
  const [{ n: aindaSem }] = await sql(`SELECT count(*)::int AS n FROM google_bloqueios WHERE profissional_id = $1`, [profAnaId]);
  ok('e a rotina não volta a bloquear', aindaSem === 0, String(aindaSem));

  secao('Desligar');
  const des = await api(ana, '/api/google/desconectar', { metodo: 'POST', corpo: {} });
  const st2 = await api(ana, '/api/google/status');
  const [{ n: semConexao }] = await sql(`SELECT count(*)::int AS n FROM google_conexoes WHERE profissional_id = $1`, [profAnaId]);
  ok('desligar apaga a conexão', des.status === 200 && st2.dados?.conectado === false && semConexao === 0, JSON.stringify(st2.dados));
  ok('e revoga o acesso no Google', (await estadoGoogle()).tokens === tokensAntes, String((await estadoGoogle()).tokens));
  const depoisDeDesligar = await marcar({ data_hora: diaUtc(6, 12, 50), procedimento: 'Limpeza' });
  const [{ n: filaDepois }] = await sql(`SELECT count(*)::int AS n FROM google_fila WHERE agendamento_id = $1`, [depoisDeDesligar.data?.id]);
  ok('as consultas seguintes não vão mais para o Google', !depoisDeDesligar.error && filaDepois === 0, String(filaDepois));

  secao('Conectar de novo com outra conta');
  const CONTA2 = 'ana.outra@google.test';
  const con2 = await api(ana, '/api/google/conectar', { metodo: 'POST', corpo: {} });
  const ida2 = await fetch(`${con2.dados.url}&auto=1&conta=${encodeURIComponent(CONTA2)}`, { redirect: 'manual' });
  const volta2 = await fetch(ida2.headers.get('location') || `${APP}/`, { redirect: 'manual' });
  ok('a Ana conecta outra conta do Google', /google=conectado/.test(volta2.headers.get('location') || '') && (await api(ana, '/api/google/status')).dados?.email === CONTA2);
  const terceira = await marcar({ data_hora: diaUtc(7, 12, 50), procedimento: 'Limpeza' });
  // A rotina rápida é outra rota (outra cópia do módulo) e leu a conta antiga há pouco.
  const rotina2 = await rotinaRapida();
  const daTerceira = (e) => e.extendedProperties?.private?.ortus_agendamento === String(terceira.data?.id);
  const naNova = ((await estadoGoogle()).eventos?.[CONTA2] || []).some(daTerceira);
  const naVelha = (await eventosDaConta()).some(daTerceira);
  ok('a consulta nova vai para a conta nova, nunca para a antiga (sem token velho guardado)', rotina2.status === 200 && naNova && !naVelha, JSON.stringify({ r: rotina2.dados?.resumo, naNova, naVelha }));
  const desliga2 = await api(ana, '/api/google/desconectar', { metodo: 'POST', corpo: {} });
  ok('e desliga de novo', desliga2.status === 200 && (await estadoGoogle()).tokens === tokensAntes);
} finally {
  await falhaGoogle(false).catch(() => undefined);
  if (criados.length) {
    await sql(`DELETE FROM google_fila WHERE agendamento_id = ANY($1::bigint[])`, [criados]);
    await sql(`DELETE FROM google_eventos WHERE agendamento_id = ANY($1::bigint[])`, [criados]);
    await sql(`DELETE FROM agendamentos WHERE id = ANY($1::bigint[])`, [criados]);
  }
  await sql(`DELETE FROM google_conexoes WHERE profissional_id = $1`, [profAnaId]);
  await sql(`DELETE FROM google_bloqueios WHERE profissional_id = $1`, [profAnaId]);
  await sql(`DELETE FROM google_fila WHERE clinica_id = $1`, [cA]);
  await sql(`UPDATE plataforma_integracoes SET ativo = true, config = '{"client_id":"teste-ortus"}'::jsonb, segredo_cifrado = NULL WHERE chave = 'google'`);
}
fim();
