// E-mail de convite, de convite aceito e rota de anamnese — ponta a ponta.
import { api, emails, entrar, fim, limparEmails, ok, resendFalha, secao, sql } from './util.mjs';

const ana = await entrar('ana.admin@maissorriso.test');
const bia = await entrar('bia.recepcao@maissorriso.test');
const caio = await entrar('caio.admin@bemestar.test');
const dani = await entrar('dani.dentista@bemestar.test');
const [clinA] = await sql(`SELECT id FROM clinicas WHERE nome = 'Mais Sorriso'`);
const [clinB] = await sql(`SELECT id FROM clinicas WHERE nome = 'Clínica Bem Estar'`);

secao('Convite por e-mail');
await limparEmails();
const convite = await ana.c.rpc('equipe_convidar', { p_email: caio.email, p_clinica_ids: [Number(clinA.id)], p_cargo: 'Dentista', p_mensagem: 'Vem trabalhar com a gente às quintas.' });
ok('ana convida caio (outra rede)', !convite.error && convite.data?.id, convite.error?.message);
const id = convite.data?.id;

const semLogin = await api(null, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'convite' } });
ok('sem sessão: 401', semLogin.status === 401, String(semLogin.status));
const alheio = await api(dani, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'convite' } });
ok('quem não tem nada com o convite recebe 404', alheio.status === 404, JSON.stringify(alheio.dados));
const comum = await api(bia, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'convite' } });
ok('membro comum da clínica não dispara o e-mail', comum.status === 404, JSON.stringify(comum.dados));

await resendFalha(true);
const recusado = await api(ana, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'convite' } });
ok('Resend recusa → enviado=false com o motivo', recusado.dados?.enviado === false && /Resend recusou/.test(recusado.dados?.erro || ''), JSON.stringify(recusado.dados));
ok('nada na caixa de saída quando a Resend recusa', (await emails()).length === 0);
await resendFalha(false);

const enviado = await api(ana, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'convite' } });
ok('ana dispara o e-mail do convite', enviado.dados?.enviado === true, JSON.stringify(enviado.dados));
let caixa = await emails();
ok('um e-mail para o convidado', caixa.length === 1 && caixa[0].to[0] === caio.email, JSON.stringify(caixa.map((e) => e.to)));
ok('assunto e texto citam quem convidou e a clínica', /Ana Prado/.test(caixa[0]?.subject || '') && /Mais Sorriso/.test(caixa[0]?.text || '') && /quintas/.test(caixa[0]?.text || ''), caixa[0]?.subject);
ok('link do e-mail aponta para o endereço configurado, não para o Origin', /http:\/\/localhost:3000\/convite\?id=/.test(caixa[0]?.text || ''), caixa[0]?.text?.slice(0, 400));
const repetido = await api(ana, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'convite' } });
ok('segundo clique em menos de 10 min não manda outro', repetido.dados?.repetido === true && (await emails()).length === 1, JSON.stringify(repetido.dados));

secao('Aceite exige o link do e-mail');
const link = (caixa[0]?.text || '').match(/https?:\/\/\S+\/convite\?id=(\d+)&chave=([\w-]+)/);
ok('o e-mail do convite traz o link de confirmação', link && Number(link[1]) === Number(id), (caixa[0]?.text || '').slice(0, 600));
const [linhaConvite] = await sql(`SELECT aceite_hash FROM convites_equipe WHERE id = $1`, [id]);
ok('no banco fica só o resumo da chave, não a chave', linhaConvite?.aceite_hash && link && !String(linhaConvite.aceite_hash).includes(link[2]), JSON.stringify(linhaConvite));
const chave = link ? link[2] : '';
const cedoDemais = await caio.c.rpc('equipe_responder_convite', { p_id: id, p_aceitar: true });
ok('aceitar sem abrir o link é recusado com explicação', /link do convite/.test(cedoDemais.error?.message || ''), cedoDemais.error?.message || 'aceitou');
const alheia = await dani.c.rpc('equipe_confirmar_email', { p_convite: id, p_chave: chave });
ok('outra pessoa não usa o link do convite alheio', Boolean(alheia.error), 'confirmou');
const errada = await caio.c.rpc('equipe_confirmar_email', { p_convite: id, p_chave: 'chave-inventada' });
ok('chave inventada não confirma', Boolean(errada.error), 'confirmou');
const confirmado = await caio.c.rpc('equipe_confirmar_email', { p_convite: id, p_chave: chave });
ok('o convidado confirma pelo link do e-mail', !confirmado.error && confirmado.data?.confirmado === true, confirmado.error?.message);

secao('Aviso de convite aceito');
const cedo = await api(caio, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'aceito' } });
ok('aviso de aceite antes de aceitar: recusado', cedo.status === 409, JSON.stringify(cedo.dados));
const aceite = await caio.c.rpc('equipe_responder_convite', { p_id: id, p_aceitar: true });
ok('caio aceita o convite', !aceite.error && aceite.data?.status === 'aceito', aceite.error?.message);
const outro = await api(dani, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'aceito' } });
ok('terceiro não dispara o aviso de aceite', outro.status === 404, String(outro.status));
const avisado = await api(caio, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'aceito' } });
ok('caio dispara o aviso de aceite', avisado.dados?.enviado === true, JSON.stringify(avisado.dados));
caixa = await emails();
ok('quem convidou recebe o e-mail', caixa.length === 2 && caixa[1].to[0] === ana.email && /aceitou/.test(caixa[1].subject), JSON.stringify(caixa.map((e) => [e.to, e.subject])));
const denovo = await api(caio, '/api/convites/notificar', { metodo: 'POST', corpo: { conviteId: id, evento: 'aceito' } });
ok('aviso de aceite sai uma vez só', denovo.dados?.repetido === true && (await emails()).length === 2);

secao('Convidado na clínica que convidou (pelas APIs)');
const [pacA] = await sql(`SELECT id FROM pacientes WHERE clinica_id = $1 ORDER BY nome LIMIT 1`, [clinA.id]);
const [pacB] = await sql(`SELECT id FROM pacientes WHERE clinica_id = $1 ORDER BY nome LIMIT 1`, [clinB.id]);
const criaComoConvidado = await api(caio, '/api/admin/criar-usuario', { metodo: 'POST', corpo: { nome: 'Fulano', email: 'fulano@teste.test', cargo: 'Dentista', clinicas: [clinA.id] } });
ok('convidado (admin em casa) NÃO cria funcionário na clínica que o convidou', criaComoConvidado.status === 403, JSON.stringify(criaComoConvidado.dados));
const criaEmCasa = await api(caio, '/api/admin/criar-usuario', { metodo: 'POST', corpo: { nome: 'Fulano Teste', email: 'fulano@teste.test', cargo: 'Recepcionista', clinicas: [clinB.id] } });
ok('o mesmo administrador cria funcionário na própria clínica', criaEmCasa.status === 200 && criaEmCasa.dados?.senha_temporaria, JSON.stringify(criaEmCasa.dados?.error));
const comumCria = await api(bia, '/api/admin/criar-usuario', { metodo: 'POST', corpo: { nome: 'X', email: 'x@teste.test', clinicas: [clinA.id] } });
ok('membro comum não cria funcionário', comumCria.status === 403, String(comumCria.status));

secao('Link de anamnese');
const linkOk = await api(ana, '/api/anamnese/gerar-link', { metodo: 'POST', corpo: { paciente_id: pacA.id, modelo_id: 'padrao' } });
ok('ana gera link para paciente da própria clínica', linkOk.status === 200 && /\/anamnese\//.test(linkOk.dados?.url || ''), JSON.stringify(linkOk.dados));
const furo = await api(dani, '/api/anamnese/gerar-link', { metodo: 'POST', corpo: { paciente_id: pacA.id, modelo_id: 'padrao', clinica_id: clinB.id } });
ok('dani NÃO gera link de paciente alheio informando a própria clínica', furo.status === 404, `${furo.status} ${JSON.stringify(furo.dados)}`);
const inexistente = await api(dani, '/api/anamnese/gerar-link', { metodo: 'POST', corpo: { paciente_id: '00000000-0000-0000-0000-000000000000', modelo_id: 'padrao' } });
ok('paciente inexistente e paciente alheio respondem igual', inexistente.status === 404 && JSON.stringify(inexistente.dados) === JSON.stringify(furo.dados));
const proprio = await api(dani, '/api/anamnese/gerar-link', { metodo: 'POST', corpo: { paciente_id: pacB.id, modelo_id: 'padrao' } });
ok('dani gera link para paciente da própria clínica', proprio.status === 200, JSON.stringify(proprio.dados));

// desfaz o que este teste criou
await sql(`DELETE FROM auth.users WHERE email = 'fulano@teste.test'`);
await sql(`DELETE FROM profissionais_clinicas WHERE convidado = true`);
await sql(`DELETE FROM convites_equipe`);
await sql(`DELETE FROM anamnese_links`);
fim();
