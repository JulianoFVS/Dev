// Assinatura de ponta a ponta: página pública → provedor → webhook → conta → uso → atraso → modo de consulta → pagamento.
// Roda contra o app em http://localhost:3000 e o ambiente local (Supabase, Resend e Mercado Pago falsos).
import crypto from 'node:crypto';
import { SEGREDO_CRON, SENHA, api, emails, entrar, env, fim, limparEmails, novoCliente, ok, resendFalha, secao, sql } from './util.mjs';

const PROVEDOR = `${env.NEXT_PUBLIC_SUPABASE_URL}/provedor`;
const marca = crypto.randomBytes(3).toString('hex');
const provedor = async (caminho, corpo) => {
  const r = await fetch(`${PROVEDOR}/_teste/${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return r.json();
};
const pedidoDoBanco = async (id) => (await sql(`SELECT * FROM assinatura_pedidos WHERE id = $1`, [id]))[0];
const situacao = async (id) => (await api(null, `/api/public/assinatura/pedido?id=${id}`)).dados;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const rotina = (cab = { authorization: `Bearer ${SEGREDO_CRON}` }) => api(null, '/api/assinaturas/processar', { cabecalhos: cab });

await fetch(`${PROVEDOR}/_teste/estado`, { method: 'DELETE' });
await limparEmails();
await resendFalha(false);
// Os testes vêm todos do mesmo endereço: zera os limites por hora das rotas públicas.
await sql(`DELETE FROM limites_publicos`);

// ---------------------------------------------------------------------------
secao('Limite das rotas públicas');
const [lim] = await sql(`SELECT public.limite_publico_consumir('teste:e2e', 2, 60) AS a, public.limite_publico_consumir('teste:e2e', 2, 60) AS b, public.limite_publico_consumir('teste:e2e', 2, 60) AS c`);
ok('limite conta e barra na tentativa seguinte (2 passam, a 3ª não)', lim.a === true && lim.b === true && lim.c === false, JSON.stringify(lim));
await sql(`DELETE FROM limites_publicos WHERE chave = 'teste:e2e'`);
const deOutroSite = await fetch('http://localhost:3000/api/public/assinatura/checkout', {
  method: 'POST',
  headers: { 'content-type': 'text/plain' },
  body: JSON.stringify({ plano: 'basico' }),
});
ok('compra com corpo que não é JSON (formulário de outro site): recusada', deOutroSite.status === 415, String(deOutroSite.status));
const outraOrigem = await fetch('http://localhost:3000/api/public/assinatura/checkout', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://golpe.example' },
  body: JSON.stringify({ plano: 'basico' }),
});
ok('compra pedida por outra origem: recusada', outraOrigem.status === 403, String(outraOrigem.status));

// ---------------------------------------------------------------------------
secao('Vitrine');
const vitrine = await api(null, '/api/public/assinatura/planos');
const codigos = (vitrine.dados?.planos || []).map((p) => `${p.codigo}:${p.valor_centavos}`).join(',');
ok('página pública recebe os planos do servidor e a assinatura está disponível',
  vitrine.dados?.disponivel === true && codigos === 'basico:9700,profissional:19700,clinica:29700', JSON.stringify(vitrine.dados));

// ---------------------------------------------------------------------------
secao('Compra');
const emailNovo = `dona.${marca}@clinica-nova.test`;
const dados = { plano: 'profissional', clinica: `Clínica Sorriso Novo ${marca}`, responsavel: 'Helena Duarte', email: emailNovo, telefone: '(11) 98888-7777', aceite: true };
const semAceite = await api(null, '/api/public/assinatura/checkout', { metodo: 'POST', corpo: { ...dados, aceite: false } });
ok('sem aceitar os termos: recusado, apontando o campo', semAceite.status === 400 && semAceite.dados?.campo === 'aceite', JSON.stringify(semAceite.dados));
const planoFalso = await api(null, '/api/public/assinatura/checkout', { metodo: 'POST', corpo: { ...dados, plano: 'enterprise' } });
ok('plano fora da vitrine: recusado', planoFalso.status === 400 && planoFalso.dados?.campo === 'plano', JSON.stringify(planoFalso.dados));
const contaQueExiste = await api(null, '/api/public/assinatura/checkout', { metodo: 'POST', corpo: { ...dados, email: 'ana.admin@maissorriso.test' } });
ok('e-mail que já tem conta: recusado, sem criar cobrança', contaQueExiste.status === 409, JSON.stringify(contaQueExiste.dados));

const compra = await api(null, '/api/public/assinatura/checkout', { metodo: 'POST', corpo: { ...dados, valor: 1, valor_centavos: 1 } });
const pedidoId = compra.dados?.pedido;
ok('compra aberta: a resposta leva à página do provedor', compra.status === 200 && pedidoId && /\/provedor\/pagar\?pref=/.test(compra.dados?.url || ''), JSON.stringify(compra.dados));
let ped = await pedidoDoBanco(pedidoId);
ok('valor vem do catálogo, não do navegador (mandou 1 centavo)', ped?.valor_centavos === 19700 && ped?.plano === 'profissional', JSON.stringify(ped?.valor_centavos));
const prefs = (await provedor('estado')).preferencias;
ok('cobrança criada no provedor com o valor certo e referência do pedido',
  prefs.length === 1 && prefs[0].items[0].unit_price === 197 && prefs[0].external_reference === `pedido_${pedidoId.replace(/-/g, '')}`, JSON.stringify(prefs[0]?.items));
ok('cobrança aceita só Pix e cartão (boleto fora)', JSON.stringify(prefs[0]?.payment_methods || {}).includes('ticket'));
// Alguém que só sabe o e-mail tenta tomar a compra: outro nome, outro telefone, outro plano.
const intrusa = await api(null, '/api/public/assinatura/checkout', {
  metodo: 'POST',
  corpo: { ...dados, plano: 'basico', clinica: 'Ligue (11) 90000-0000 para ativar', telefone: '(11) 90000-0000' },
});
const pedidoIntruso = intrusa.dados?.pedido;
const original = await pedidoDoBanco(pedidoId);
ok('mesmo e-mail de novo: nasce outra compra, sem devolver o identificador da primeira',
  intrusa.status === 200 && pedidoIntruso && pedidoIntruso !== pedidoId, JSON.stringify(intrusa.dados));
ok('a primeira compra não muda nem é cancelada (nome, telefone, plano, situação)',
  original?.status === 'aguardando_pagamento' && original?.clinica_nome === dados.clinica && original?.telefone === '11988887777' && original?.plano === 'profissional',
  JSON.stringify({ status: original?.status, clinica: original?.clinica_nome, telefone: original?.telefone, plano: original?.plano }));
ok('ninguém de fora lê a compra sem o identificador', (await api(null, `/api/public/assinatura/pedido?id=${crypto.randomUUID()}`)).status === 404);
let sit = await situacao(pedidoId);
ok('página de retorno: aguardando pagamento, e-mail mascarado', sit?.status === 'aguardando_pagamento' && sit?.email === `d***@clinica-nova.test`, JSON.stringify(sit));

// ---------------------------------------------------------------------------
secao('Pagamento recusado e aviso forjado');
const recusa = await provedor('pagar', { referencia: `pedido_${pedidoId.replace(/-/g, '')}`, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', tipo: 'cartao' });
ok('o provedor avisou o Ortus e o aviso foi aceito', recusa.aviso?.status === 200, JSON.stringify(recusa.aviso));
sit = await situacao(pedidoId);
ok('recusa aparece na página de retorno, sem conta criada', sit?.status === 'aguardando_pagamento' && sit?.pagamento_status === 'recusado' && sit?.conta_criada === false, JSON.stringify(sit));
const semAssinatura = await api(null, '/api/pagamentos/webhook?data.id=1&type=payment', { metodo: 'POST', corpo: { type: 'payment', data: { id: '1' } } });
ok('aviso sem assinatura: 401', semAssinatura.status === 401);
const aprovadoFalso = await provedor('pagar', { referencia: `pedido_${pedidoId.replace(/-/g, '')}`, status: 'approved', assinatura: 'errada', tipo: 'pix' });
ok('aviso com assinatura errada: 401 e nada muda', aprovadoFalso.aviso?.status === 401 && (await pedidoDoBanco(pedidoId)).status === 'aguardando_pagamento', JSON.stringify(aprovadoFalso.aviso));
// O pagamento "aprovado" acima existe no provedor; só o aviso era falso. Para o teste seguir limpo, ele vira recusado.
await provedor('mudar', { id: aprovadoFalso.pagamento.id, status: 'rejected', avisar: false });

// ---------------------------------------------------------------------------
secao('Pagamento aprovado → conta nasce sozinha');
await limparEmails();
const pago = await provedor('pagar', { referencia: `pedido_${pedidoId.replace(/-/g, '')}`, status: 'approved', tipo: 'pix' });
ok('aviso de aprovação aceito', pago.aviso?.status === 200, JSON.stringify(pago.aviso));
ped = await pedidoDoBanco(pedidoId);
ok('compra provisionada', ped?.status === 'provisionado' && ped?.rede_id && ped?.clinica_id && ped?.user_id, JSON.stringify({ status: ped?.status, erro: ped?.provisionamento_erro }));
const [nasceu] = await sql(
  `SELECT r.cobranca_automatica, r.assinatura_status, r.valor_mensal_centavos, r.plano, c.nome AS clinica, c.is_matriz, p.nivel_acesso, p.precisa_trocar_senha, pc.convidado,
          (SELECT count(*)::int FROM faturas f WHERE f.rede_id = r.id) AS faturas,
          (SELECT f.status FROM faturas f WHERE f.rede_id = r.id LIMIT 1) AS fatura_status,
          (SELECT f.origem FROM faturas f WHERE f.rede_id = r.id LIMIT 1) AS fatura_origem
     FROM redes r JOIN clinicas c ON c.rede_id = r.id
     JOIN profissionais_clinicas pc ON pc.clinica_id = c.id JOIN profissionais p ON p.id = pc.profissional_id
    WHERE r.id = $1 AND p.user_id = $2`, [ped?.rede_id, ped?.user_id]);
ok('rede com cobrança automática, clínica matriz, administrador, vínculo próprio e 1ª fatura paga',
  nasceu?.cobranca_automatica === true && nasceu?.assinatura_status === 'ativa' && nasceu?.valor_mensal_centavos === 19700 && nasceu?.plano === 'profissional'
    && nasceu?.is_matriz === true && nasceu?.nivel_acesso === 'admin' && nasceu?.precisa_trocar_senha === true && nasceu?.convidado === false
    && nasceu?.faturas === 1 && nasceu?.fatura_status === 'paga' && nasceu?.fatura_origem === 'checkout', JSON.stringify(nasceu));
let caixa = await emails();
const boasVindas = caixa.find((e) => e.to?.[0] === emailNovo && /Pagamento confirmado/.test(e.subject || ''));
const linkAcesso = (boasVindas?.text || '').match(/http:\/\/localhost:3000\/acesso\?token=([^&\s]+)&pedido=([0-9a-f-]{36})/);
ok('e-mail "pagamento confirmado" saiu pela Resend com o link de criação de senha', boasVindas && linkAcesso && linkAcesso[2] === pedidoId, JSON.stringify(caixa.map((e) => [e.to, e.subject])));
ok('o e-mail não leva senha nenhuma', boasVindas && !/senha tempor|^\s*senha\s*:/im.test(boasVindas.text || ''), boasVindas?.text);
sit = await situacao(pedidoId);
ok('página de retorno: conta criada e e-mail enviado', sit?.status === 'provisionado' && sit?.conta_criada === true && sit?.email_acesso === 'enviado', JSON.stringify(sit));

// mesmo aviso de novo e outro aviso do mesmo pagamento: nada duplica
await provedor('avisar', { id: pago.pagamento.id });
await provedor('avisar', { id: pago.pagamento.id });
const [contagem] = await sql(
  `SELECT (SELECT count(*)::int FROM clinicas WHERE rede_id = $1) AS clinicas, (SELECT count(*)::int FROM faturas WHERE rede_id = $1) AS faturas,
          (SELECT count(*)::int FROM auth.users WHERE lower(email) = $2) AS contas, (SELECT count(*)::int FROM redes WHERE contato_email = $2) AS redes,
          (SELECT max(vezes)::int FROM pagamento_eventos WHERE pagamento_ref = $3) AS vezes`, [ped.rede_id, emailNovo, String(pago.pagamento.id)]);
ok('aviso repetido do provedor não cria segunda conta, clínica, rede nem fatura',
  contagem.clinicas === 1 && contagem.faturas === 1 && contagem.contas === 1 && contagem.redes === 1 && contagem.vezes === 3, JSON.stringify(contagem));
ok('e-mail de boas-vindas saiu uma vez só', (await emails()).filter((e) => e.to?.[0] === emailNovo).length === 1);
ok('pagou uma compra: as outras do mesmo e-mail se encerram', (await pedidoDoBanco(pedidoIntruso))?.status === 'cancelado', (await pedidoDoBanco(pedidoIntruso))?.status);
const pagouOutra = await provedor('pagar', { referencia: `pedido_${pedidoIntruso.replace(/-/g, '')}`, status: 'approved', tipo: 'pix' });
const [eventoOutra] = await sql(`SELECT resultado, motivo FROM pagamento_eventos WHERE pagamento_ref = $1`, [String(pagouOutra.pagamento.id)]);
const [contasDepois] = await sql(`SELECT count(*)::int AS n FROM auth.users WHERE lower(email) = $1`, [emailNovo]);
ok('a outra compra paga depois vai para conferência, sem segunda conta', eventoOutra?.resultado === 'revisar' && eventoOutra?.motivo === 'duplicado' && contasDepois.n === 1,
  JSON.stringify([eventoOutra, contasDepois]));
const sitIntrusa = await situacao(pedidoIntruso);
ok('a página dessa compra diz que o e-mail já tem assinatura (não diz que nada foi cobrado)', sitIntrusa?.status === 'cancelado' && sitIntrusa?.outra_compra_paga === true, JSON.stringify(sitIntrusa));

// ---------------------------------------------------------------------------
secao('Primeiro acesso, paciente e agenda — sem passo manual');
const novaDona = novoCliente();
const verificado = await novaDona.auth.verifyOtp({ token_hash: decodeURIComponent(linkAcesso?.[1] || ''), type: 'recovery' });
ok('o link do e-mail entra na conta', !verificado.error && verificado.data?.session, verificado.error?.message);
// Tocou no link e parou antes de criar a senha: a conta não pode ficar presa.
await sql(`UPDATE assinatura_pedidos SET email_acesso_tentado_em = now() - interval '3 minutes' WHERE id = $1`, [pedidoId]);
const antesDaSenha = await api(null, '/api/public/assinatura/reenviar-acesso', { metodo: 'POST', corpo: { pedido: pedidoId } });
ok('usou o link mas não criou a senha: ainda pode pedir outro link', antesDaSenha.status === 200 && antesDaSenha.dados?.enviado === true, JSON.stringify(antesDaSenha.dados));
const novaSenha = `Clinica#${marca}9`;
const trocou = await novaDona.auth.updateUser({ password: novaSenha });
ok('a pessoa escolhe a própria senha', !trocou.error, trocou.error?.message);
await novaDona.from('profissionais').update({ precisa_trocar_senha: false }).eq('user_id', ped.user_id);
const reuso = await novoCliente().auth.verifyOtp({ token_hash: decodeURIComponent(linkAcesso?.[1] || ''), type: 'recovery' });
ok('o mesmo link não entra uma segunda vez', Boolean(reuso.error));
const dona = await entrar(emailNovo, novaSenha);
ok('entra com e-mail e a senha nova', Boolean(dona.token));
const [clinicaNova] = await sql(`SELECT id FROM clinicas WHERE rede_id = $1`, [ped.rede_id]);
const paciente = await dona.c.from('pacientes').insert({ nome: 'Primeiro Paciente', telefone: '11977776666', clinica_id: clinicaNova.id }).select('id').single();
ok('cadastra o primeiro paciente', !paciente.error && paciente.data?.id, paciente.error?.message);
const amanha = new Date(Date.now() + 86_400_000).toISOString();
const agenda = await dona.c.from('agendamentos').insert({ paciente_id: paciente.data?.id, clinica_id: clinicaNova.id, data_hora: amanha, procedimento: 'Avaliação', status: 'agendado' }).select('id').single();
ok('agenda a primeira consulta', !agenda.error && agenda.data?.id, agenda.error?.message);
const deFora = await api(null, '/api/public/assinatura/reenviar-acesso', { metodo: 'POST', corpo: { pedido: pedidoId } });
ok('depois do primeiro acesso não se pede link novo (o caminho é a senha)', deFora.status === 409 && deFora.dados?.ja_acessou === true, JSON.stringify(deFora.dados));
const sitDona = await dona.c.rpc('assinatura_situacao', { p_clinica: clinicaNova.id, p_detalhe: true });
ok('Assinatura mostra plano, valor, próxima cobrança e a fatura paga',
  sitDona.data?.estado === 'ativa' && sitDona.data?.admin === true && sitDona.data?.valor_centavos === 19700 && sitDona.data?.proxima_cobranca && sitDona.data?.faturas?.length === 1,
  JSON.stringify(sitDona.data || sitDona.error));

// ---------------------------------------------------------------------------
secao('Limite do plano (Profissional: até 3 profissionais, 1 unidade)');
const cadastrar = (n) => api(dona, '/api/admin/criar-usuario', {
  metodo: 'POST',
  corpo: { nome: `Equipe ${n} ${marca}`, email: `equipe${n}.${marca}@clinica-nova.test`, cargo: 'Dentista', clinicas: [clinicaNova.id] },
});
const c1 = await cadastrar(1);
const c2 = await cadastrar(2);
ok('a dona cadastra mais duas pessoas (3 de 3)', c1.status === 200 && c2.status === 200, JSON.stringify([c1.status, c1.dados, c2.status, c2.dados]));
const c3 = await cadastrar(3);
const [loginDaQuarta] = await sql(`SELECT count(*)::int AS n FROM auth.users WHERE email = $1`, [`equipe3.${marca}@clinica-nova.test`]);
ok('a quarta é recusada com a frase do plano, sem criar login', c3.status === 409 && /plano Profissional permite até 3 profissionais/.test(c3.dados?.error || '') && loginDaQuarta.n === 0,
  JSON.stringify([c3.status, c3.dados, loginDaQuarta]));
const usoDona = await dona.c.rpc('assinatura_uso_do_plano', { p_clinica: clinicaNova.id });
ok('a tela Assinatura recebe o uso do plano (3 de 3, 1 de 1 unidade)',
  usoDona.data?.profissionais === 3 && usoDona.data?.limite_profissionais === 3 && usoDona.data?.unidades === 1 && usoDona.data?.limite_unidades === 1, JSON.stringify(usoDona.data || usoDona.error));
const segundaUnidade = await dona.c.from('clinicas').insert({ nome: `Filial ${marca}`, rede_id: ped.rede_id }).select('id');
ok('segunda unidade no plano Profissional: recusada com a frase do plano', /plano Profissional permite 1 unidade/.test(segundaUnidade.error?.message || ''), JSON.stringify(segundaUnidade.error || segundaUnidade.data));

// ---------------------------------------------------------------------------
secao('Mensalidade: fatura do mês, atraso, modo de consulta e pagamento');
const semSegredo = await rotina({});
ok('rotina das assinaturas sem o segredo: 401', semSegredo.status === 401);
// "Avança o calendário": gera a competência seguinte como se faltassem 5 dias para o vencimento.
const [geracao] = await sql(`SELECT public.assinatura_gerar_competencias((current_date + interval '1 month')::date - 5, $1) AS r`, [ped.rede_id]);
const faturaId = geracao.r?.criadas?.[0]?.fatura_id;
ok('a fatura do mês seguinte nasce 5 dias antes do vencimento', Number.isInteger(faturaId), JSON.stringify(geracao.r));
const [repete] = await sql(`SELECT public.assinatura_gerar_competencias((current_date + interval '1 month')::date - 2, $1) AS r`, [ped.rede_id]);
ok('rodar de novo não cobra a mesma competência duas vezes', (repete.r?.criadas || []).length === 0);
await limparEmails();
// A fatura passa 9 dias do vencimento (e a régua, que começou na compra, "já valia" havia um mês).
await sql(`UPDATE faturas SET vencimento = current_date - 9 WHERE id = $1`, [faturaId]);
await sql(`UPDATE redes SET regua_desde = current_date - 30 WHERE id = $1`, [ped.rede_id]);
const rodou = await rotina();
ok('rotina com o segredo roda e só devolve contagens', rodou.status === 200 && rodou.dados?.ok === true && !JSON.stringify(rodou.dados).includes(emailNovo), JSON.stringify(rodou.dados));
const bloq = await dona.c.rpc('assinatura_situacao', { p_clinica: clinicaNova.id, p_detalhe: false });
ok('9 dias de atraso: modo de consulta', bloq.data?.estado === 'bloqueada' && bloq.data?.pode_gravar === false, JSON.stringify(bloq.data));
caixa = await emails();
ok('avisos de cobrança saíram por e-mail para a dona', caixa.some((e) => e.to?.includes(emailNovo) && /modo de consulta/i.test(e.subject || '')), JSON.stringify(caixa.map((e) => [e.to, e.subject])));
const bloqueado = await dona.c.from('pacientes').insert({ nome: 'Paciente bloqueado', telefone: '11900000000', clinica_id: clinicaNova.id });
ok('em modo de consulta não grava, com mensagem clara', /Assinatura suspensa/.test(bloqueado.error?.message || ''), JSON.stringify(bloqueado.error));
const lembreteBloqueado = await api(null, `/api/lembretes/processar?clinica_id=${clinicaNova.id}`, { cabecalhos: { authorization: `Bearer ${SEGREDO_CRON}` } });
ok('clínica em modo de consulta não entra na fila de lembretes',
  lembreteBloqueado.dados?.clinicas_em_modo_consulta === 1 && lembreteBloqueado.dados?.agendamentos_amanha === 0, JSON.stringify(lembreteBloqueado.dados));
const leitura = await dona.c.from('pacientes').select('id').eq('clinica_id', clinicaNova.id);
const agendaLida = await dona.c.from('agendamentos').select('id').eq('clinica_id', clinicaNova.id);
ok('prontuário e agenda continuam legíveis e nada foi apagado', leitura.data?.length === 1 && agendaLida.data?.length === 1, JSON.stringify([leitura.data?.length, agendaLida.data?.length]));
const ana = await entrar('ana.admin@maissorriso.test');
const alheia = await api(ana, '/api/assinatura/pagar', { metodo: 'POST', corpo: { fatura_id: faturaId } });
ok('administrador de outra rede não abre pagamento da fatura alheia', alheia.status === 404, JSON.stringify(alheia.dados));
const abrir = await api(dona, '/api/assinatura/pagar', { metodo: 'POST', corpo: { fatura_id: faturaId } });
ok('a dona abre o pagamento da mensalidade', abrir.status === 200 && /\/provedor\/pagar\?pref=/.test(abrir.dados?.url || ''), JSON.stringify(abrir.dados));
const abrirDeNovo = await api(dona, '/api/assinatura/pagar', { metodo: 'POST', corpo: { fatura_id: faturaId } });
ok('pedir de novo devolve a mesma cobrança', abrirDeNovo.dados?.url === abrir.dados?.url);
const prefFatura = (await provedor('estado')).preferencias.find((p) => p.external_reference === `fatura_${faturaId}`);
ok('cobrança da mensalidade com o valor da fatura', prefFatura?.items?.[0]?.unit_price === 197, JSON.stringify(prefFatura?.items));
await limparEmails();
const mensalidade = await provedor('pagar', { pref: prefFatura?.id, status: 'approved', tipo: 'cartao' });
ok('pagamento da mensalidade avisado e aceito', mensalidade.aviso?.status === 200, JSON.stringify(mensalidade.aviso));
const reaberta = await dona.c.rpc('assinatura_situacao', { p_clinica: clinicaNova.id, p_detalhe: true });
ok('pagou: a clínica sai do modo de consulta', reaberta.data?.estado === 'ativa' && reaberta.data?.pode_gravar === true, JSON.stringify(reaberta.data?.estado));
const voltou = await dona.c.from('pacientes').insert({ nome: 'Paciente depois do pagamento', telefone: '11911112222', clinica_id: clinicaNova.id });
ok('volta a gravar', !voltou.error, voltou.error?.message);
const lembreteLiberado = await api(null, `/api/lembretes/processar?clinica_id=${clinicaNova.id}`, { cabecalhos: { authorization: `Bearer ${SEGREDO_CRON}` } });
ok('pagou: a consulta de amanhã volta para a fila de lembretes',
  lembreteLiberado.dados?.clinicas_em_modo_consulta === 0 && lembreteLiberado.dados?.agendamentos_amanha === 1, JSON.stringify(lembreteLiberado.dados));
ok('e-mail de liberação saiu', (await emails()).some((e) => e.to?.includes(emailNovo) && /liberado/i.test(e.subject || '')));
const dobro = await provedor('pagar', { pref: prefFatura?.id, status: 'approved', tipo: 'pix' });
const [fat] = await sql(`SELECT status, pagamento_ref FROM faturas WHERE id = $1`, [faturaId]);
const [revisar] = await sql(`SELECT resultado, motivo FROM pagamento_eventos WHERE pagamento_ref = $1`, [String(dobro.pagamento.id)]);
ok('segundo pagamento da mesma fatura não quita de novo e fica para conferência',
  fat?.pagamento_ref === String(mensalidade.pagamento.id) && revisar?.resultado === 'revisar' && revisar?.motivo === 'duplicado', JSON.stringify([fat, revisar]));
const conferir = await api(dona, '/api/assinatura/conferir', { metodo: 'POST', corpo: { fatura_id: faturaId } });
ok('conferir na volta do provedor responde sem erro', conferir.status === 200, JSON.stringify(conferir.dados));

secao('Estorno');
await provedor('mudar', { id: mensalidade.pagamento.id, status: 'refunded' });
const [estornada] = await sql(`SELECT status, estornado_em FROM faturas WHERE id = $1`, [faturaId]);
ok('estorno informado pelo provedor volta a fatura para dívida', estornada?.status === 'estornada' && estornada?.estornado_em, JSON.stringify(estornada));
const sitEstorno = await dona.c.rpc('assinatura_situacao', { p_clinica: clinicaNova.id, p_detalhe: false });
ok('a fatura estornada aparece como pendente na Assinatura', sitEstorno.data?.fatura_pendente?.status === 'estornada', JSON.stringify(sitEstorno.data?.fatura_pendente));

// ---------------------------------------------------------------------------
secao('Webhook perdido e e-mail que não saiu');
const email2 = `dono.${marca}@outra-clinica.test`;
const compra2 = await api(null, '/api/public/assinatura/checkout', { metodo: 'POST', corpo: { ...dados, email: email2, plano: 'basico', clinica: `Consultório ${marca}` } });
const pedido2 = compra2.dados?.pedido;
await resendFalha(true);
await provedor('pagar', { referencia: `pedido_${pedido2.replace(/-/g, '')}`, status: 'approved', tipo: 'pix', avisar: false });
const sit2 = await situacao(pedido2);
ok('sem webhook, a página de retorno confere com o provedor e a conta nasce', sit2?.status === 'provisionado' && sit2?.conta_criada === true, JSON.stringify(sit2));
ok('Resend recusou: a página diz que o e-mail não saiu (não finge)', sit2?.email_acesso === 'falhou', JSON.stringify(sit2?.email_acesso));
await resendFalha(false);
await sql(`UPDATE assinatura_pedidos SET email_acesso_tentado_em = now() - interval '3 minutes' WHERE id = $1`, [pedido2]);
const reenvio = await api(null, '/api/public/assinatura/reenviar-acesso', { metodo: 'POST', corpo: { pedido: pedido2 } });
ok('pedir o link de novo envia, com o e-mail mascarado', reenvio.status === 200 && reenvio.dados?.enviado === true && reenvio.dados?.email === 'd***@outra-clinica.test', JSON.stringify(reenvio.dados));
const logo = await api(null, '/api/public/assinatura/reenviar-acesso', { metodo: 'POST', corpo: { pedido: pedido2 } });
ok('segundo pedido em seguida espera dois minutos', logo.status === 429, JSON.stringify(logo.dados));

// ---------------------------------------------------------------------------
secao('Convive com a cobrança manual');
const [antes] = await sql(`SELECT r.assinatura_status, (SELECT count(*)::int FROM faturas f WHERE f.rede_id = r.id) AS faturas FROM redes r JOIN clinicas c ON c.rede_id = r.id WHERE c.nome = 'Mais Sorriso'`);
await sql(`INSERT INTO faturas (rede_id, competencia, vencimento, valor_centavos, status) SELECT c.rede_id, date_trunc('month', current_date - 40)::date, current_date - 40, 15000, 'aberta' FROM clinicas c WHERE c.nome = 'Mais Sorriso' ON CONFLICT DO NOTHING`);
await rotina();
const [depois] = await sql(`SELECT r.assinatura_status, (SELECT count(*)::int FROM faturas f WHERE f.rede_id = r.id) AS faturas FROM redes r JOIN clinicas c ON c.rede_id = r.id WHERE c.nome = 'Mais Sorriso'`);
ok('rede de cobrança manual: fatura vencida não bloqueia e a rotina não cria fatura', depois.assinatura_status === 'sem_cobranca' && depois.faturas === antes.faturas + 1, JSON.stringify([antes, depois]));
const [clinA] = await sql(`SELECT id FROM clinicas WHERE nome = 'Mais Sorriso'`);
const anaGrava = await ana.c.from('pacientes').insert({ nome: `Teste manual ${marca}`, telefone: '11933334444', clinica_id: clinA.id }).select('id').single();
ok('e a clínica continua gravando', !anaGrava.error, anaGrava.error?.message);
// O dono liga a cobrança automática nessa rede com a fatura de 40 dias em aberto: começa a contar hoje.
await sql(`UPDATE redes r SET cobranca_automatica = true FROM clinicas c WHERE c.rede_id = r.id AND c.nome = 'Mais Sorriso'`);
const ligada = await ana.c.rpc('assinatura_situacao', { p_clinica: clinA.id, p_detalhe: false });
const [regua] = await sql(`SELECT r.regua_desde::text AS regua, r.divida_desde::text AS divida, public.hoje_br()::text AS hoje FROM redes r JOIN clinicas c ON c.rede_id = r.id WHERE c.nome = 'Mais Sorriso'`);
ok('ligar a cobrança com fatura antiga em aberto não bloqueia na hora (a dívida conta de hoje)',
  ligada.data?.pode_gravar === true && ligada.data?.estado !== 'bloqueada' && regua.regua === regua.hoje && regua.divida === regua.hoje, JSON.stringify([ligada.data, regua]));
await sql(`UPDATE redes r SET cobranca_automatica = false, regua_desde = NULL FROM clinicas c WHERE c.rede_id = r.id AND c.nome = 'Mais Sorriso'`);
await sql(`DELETE FROM assinatura_avisos a USING clinicas c WHERE c.rede_id = a.rede_id AND c.nome = 'Mais Sorriso'`);

// ---------------------------------------------------------------------------
secao('Régua: mês lançado adiantado, volta de bloqueio e próxima cobrança');
const [rt1] = await sql(`INSERT INTO redes (nome, plano, valor_mensal_centavos, dia_vencimento, cobranca_automatica, assinatura_inicio) VALUES ($1, 'basico', 9700, 3, true, '2026-09-01') RETURNING id`, [`Rede régua A ${marca}`]);
await sql(`INSERT INTO faturas (rede_id, competencia, vencimento, valor_centavos, status, pago_em) VALUES ($1, '2026-11-01', '2026-11-03', 9700, 'paga', '2026-11-02'), ($1, '2027-01-01', '2027-01-03', 9700, 'paga', '2026-11-20')`, [rt1.id]);
const [gerA] = await sql(`SELECT public.assinatura_gerar_competencias('2026-11-28', $1) AS r`, [rt1.id]);
ok('janeiro lançado à mão não faz pular dezembro', (gerA.r?.criadas || []).length === 1 && gerA.r.criadas[0].competencia === '2026-12-01' && gerA.r.criadas[0].vencimento === '2026-12-03', JSON.stringify(gerA.r));
await sql(`UPDATE faturas SET status = 'paga', pago_em = '2026-12-02' WHERE rede_id = $1 AND competencia = '2026-12-01'`, [rt1.id]);
const [proxA] = await sql(`SELECT public.assinatura_proxima_cobranca($1, '2026-12-10')::text AS d`, [rt1.id]);
ok('próxima cobrança pula o mês já pago adiantado (janeiro) e vai para fevereiro', proxA.d === '2027-02-03', JSON.stringify(proxA));
const [rt2] = await sql(`INSERT INTO redes (nome, plano, valor_mensal_centavos, dia_vencimento, cobranca_automatica, assinatura_inicio) VALUES ($1, 'basico', 9700, 3, true, '2026-09-01') RETURNING id`, [`Rede régua B ${marca}`]);
await sql(`INSERT INTO faturas (rede_id, competencia, vencimento, valor_centavos, status) VALUES ($1, '2026-10-01', '2026-10-03', 9700, 'aberta')`, [rt2.id]);
const [bloqB] = await sql(`SELECT public.assinatura_gerar_competencias('2026-11-28', $1) AS r`, [rt2.id]);
ok('rede em modo de consulta não recebe fatura nova', (bloqB.r?.criadas || []).length === 0, JSON.stringify(bloqB.r));
await sql(`UPDATE faturas SET status = 'paga', pago_em = '2026-11-28' WHERE rede_id = $1`, [rt2.id]);
const [volta1] = await sql(`SELECT public.assinatura_gerar_competencias('2026-11-28', $1) AS r`, [rt2.id]);
const [volta2] = await sql(`SELECT public.assinatura_gerar_competencias('2026-11-29', $1) AS r`, [rt2.id]);
ok('pagou o atraso no fim do mês: uma fatura só (dezembro), não duas com um dia de diferença',
  (volta1.r?.criadas || []).length === 1 && volta1.r.criadas[0].competencia === '2026-12-01' && (volta2.r?.criadas || []).length === 0, JSON.stringify([volta1.r, volta2.r]));
await sql(`DELETE FROM assinatura_avisos WHERE rede_id IN ($1, $2)`, [rt1.id, rt2.id]);
await sql(`DELETE FROM faturas WHERE rede_id IN ($1, $2)`, [rt1.id, rt2.id]);
await sql(`DELETE FROM redes WHERE id IN ($1, $2)`, [rt1.id, rt2.id]);

// ---------------------------------------------------------------------------
secao('Compra abandonada expira');
const email3 = `abandono.${marca}@clinica.test`;
const compra3 = await api(null, '/api/public/assinatura/checkout', { metodo: 'POST', corpo: { ...dados, email: email3 } });
await sql(`UPDATE assinatura_pedidos SET criado_em = now() - interval '5 days', conciliado_em = NULL WHERE id = $1`, [compra3.dados?.pedido]);
await rotina();
ok('compra sem pagamento há mais de 4 dias expira na rotina', (await pedidoDoBanco(compra3.dados?.pedido))?.status === 'expirado');

// ---------------------------------------------------------------------------
// desfaz o que este teste criou fora das contas novas
await sql(`DELETE FROM pacientes WHERE nome = $1`, [`Teste manual ${marca}`]);
await sql(`DELETE FROM faturas f USING clinicas c WHERE c.rede_id = f.rede_id AND c.nome = 'Mais Sorriso' AND f.valor_centavos = 15000`);
await espera(10);
fim();
