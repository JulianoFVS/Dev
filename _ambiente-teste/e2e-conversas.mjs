// Conversas da equipe e suporte — ponta a ponta (precisa do app em :3000).
// Rode com o navegador fora das telas de conversa: o banco local é uma
// conexão só, e as telas consultam a cada 3 s.
import { api, emails, entrar, fim, limparEmails, ok, secao, sql } from './util.mjs';

const ana = await entrar('ana.admin@maissorriso.test');
const bia = await entrar('bia.recepcao@maissorriso.test');
const caio = await entrar('caio.admin@bemestar.test');
const dani = await entrar('dani.dentista@bemestar.test');
const gabriel = await entrar('gabriel@ortus.test');
const [clinA] = await sql(`SELECT id FROM clinicas WHERE nome = 'Mais Sorriso'`);
const [clinB] = await sql(`SELECT id FROM clinicas WHERE nome = 'Clínica Bem Estar'`);
const cA = Number(clinA.id);
const cB = Number(clinB.id);
await sql(`DELETE FROM suporte_presenca`);

secao('Chat da equipe');
const [geral] = (await ana.c.from('conversa_canais').select('id, nome').eq('clinica_id', cA).eq('geral', true)).data || [];
ok('ana vê o canal Geral', geral?.nome === 'Geral');
const enviada = await ana.c.from('conversa_mensagens').insert({ clinica_id: cA, canal_id: geral?.id, texto: 'e2e: reunião às 18h' }).select('id').single();
ok('ana manda recado no Geral', !enviada.error, enviada.error?.message);
const naoLidas = await bia.c.rpc('conversas_nao_lidas', { p_clinica: cA });
const doGeral = (naoLidas.data || []).find((r) => r.canal_id === geral?.id)?.nao_lidas || 0;
ok('bia vê mensagem nova no Geral', doGeral >= 1, JSON.stringify(naoLidas.data));
await bia.c.from('conversa_leituras').upsert({ canal_id: geral?.id, clinica_id: cA, profissional_id: 0, lido_ate: new Date().toISOString() }, { onConflict: 'canal_id,profissional_id' });
const depois = (await bia.c.rpc('conversas_nao_lidas', { p_clinica: cA })).data || [];
ok('depois de ler, o Geral zera para a bia', (depois.find((r) => r.canal_id === geral?.id)?.nao_lidas || 0) === 0, JSON.stringify(depois));
const deFora = await dani.c.from('conversa_mensagens').select('id').eq('clinica_id', cA);
ok('quem é de outra clínica não lê', !deFora.error && deFora.data.length === 0);
const doDono = await gabriel.c.from('conversa_mensagens').select('id').eq('clinica_id', cA);
ok('o dono da plataforma não lê o chat da equipe', !doDono.error && doDono.data.length === 0);
const canalBia = await bia.c.from('conversa_canais').insert({ clinica_id: cA, nome: 'e2e recepção' });
ok('membro comum não cria canal', Boolean(canalBia.error));
const canalAna = await ana.c.from('conversa_canais').insert({ clinica_id: cA, nome: 'e2e comercial' }).select('id').single();
ok('administrador cria canal', !canalAna.error, canalAna.error?.message);
const repetido = await ana.c.from('conversa_canais').insert({ clinica_id: cA, nome: 'E2E Comercial ' });
ok('nome repetido é recusado', repetido.error?.code === '23505', JSON.stringify(repetido.error));

secao('Suporte e aviso por e-mail');
await limparEmails();
const conv = await bia.c.rpc('suporte_abrir', { p_clinica: cA });
ok('bia abre a conversa de suporte', !conv.error && conv.data, conv.error?.message);
const conversaId = conv.data;
await sql(`UPDATE suporte_conversas SET avisado_em = NULL, ortus_leu_ate = now() WHERE id = $1`, [conversaId]);
const msg = await bia.c.from('suporte_mensagens').insert({ conversa_id: conversaId, lado: 'clinica', texto: 'e2e: dado sensível do paciente' }).select('lado').single();
ok('mensagem da clínica fica do lado da clínica', msg.data?.lado === 'clinica', JSON.stringify(msg.error || msg.data));
const aviso = await api(bia, '/api/suporte/avisar', { metodo: 'POST', corpo: { conversaId } });
ok('ninguém da Ortus olhando: o servidor avisa', aviso.status === 200 && aviso.dados?.avisado === true, JSON.stringify(aviso.dados));
const caixa = await emails();
ok('um e-mail para os donos, sem o texto da mensagem', caixa.length === 1 && !JSON.stringify(caixa[0]).includes('dado sensível'), JSON.stringify(caixa.map((e) => e.subject || e.assunto)));
await bia.c.from('suporte_mensagens').insert({ conversa_id: conversaId, lado: 'clinica', texto: 'e2e: mais uma' });
const segundo = await api(bia, '/api/suporte/avisar', { metodo: 'POST', corpo: { conversaId } });
ok('segunda mensagem logo em seguida não gera outro e-mail (15 min)', segundo.dados?.avisado === false && (await emails()).length === 1, JSON.stringify(segundo.dados));
const alheio = await api(dani, '/api/suporte/avisar', { metodo: 'POST', corpo: { conversaId } });
ok('quem é de outra clínica não dispara aviso da conversa alheia', alheio.status === 404, String(alheio.status));

const lida = await gabriel.c.from('suporte_mensagens').select('texto').eq('conversa_id', conversaId);
ok('o dono lê a conversa de suporte', !lida.error && lida.data.length >= 2);
const resposta = await gabriel.c.from('suporte_mensagens').insert({ conversa_id: conversaId, lado: 'clinica', texto: 'e2e: olá, aqui é a Ortus' }).select('lado').single();
ok('resposta do dono sai como Ortus', resposta.data?.lado === 'ortus', JSON.stringify(resposta.error || resposta.data));
const presenca = await gabriel.c.rpc('suporte_presenca_bater');
ok('o painel da Ortus registra presença', !presenca.error, presenca.error?.message);
await limparEmails();
const convB = (await caio.c.rpc('suporte_abrir', { p_clinica: cB })).data;
await caio.c.from('suporte_mensagens').insert({ conversa_id: convB, lado: 'clinica', texto: 'e2e: dúvida da Bem Estar' });
const comGente = await api(caio, '/api/suporte/avisar', { metodo: 'POST', corpo: { conversaId: convB } });
ok('com alguém da Ortus olhando, não sai e-mail', comGente.dados?.olhando === true && (await emails()).length === 0, JSON.stringify(comGente.dados));
const daniLe = await dani.c.from('suporte_mensagens').select('id').eq('conversa_id', conversaId);
ok('outra clínica não lê a conversa de suporte alheia', !daniLe.error && daniLe.data.length === 0);

// Limpeza (o seed volta igual ao reiniciar).
await sql(`DELETE FROM suporte_presenca`);
await sql(`DELETE FROM suporte_mensagens WHERE texto LIKE 'e2e:%'`);
await sql(`DELETE FROM conversa_mensagens WHERE texto LIKE 'e2e:%'`);
await sql(`DELETE FROM conversa_canais WHERE nome LIKE 'e2e%'`);
fim();
