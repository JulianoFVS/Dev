// Chamada na TV — ponta a ponta (precisa do app em :3000).
import { createHash, randomBytes } from 'node:crypto';
import { APP, entrar, fim, ok, secao, sql } from './util.mjs';

const ana = await entrar('ana.admin@maissorriso.test');
const bia = await entrar('bia.recepcao@maissorriso.test');
const dani = await entrar('dani.dentista@bemestar.test');
const [clinA] = await sql(`SELECT id FROM clinicas WHERE nome = 'Mais Sorriso'`);
const cA = Number(clinA.id);
const tv = async (token, depois) => {
  const r = await fetch(`${APP}/api/public/tv/${token}${depois ? `?depois=${encodeURIComponent(depois)}` : ''}`);
  return { status: r.status, dados: await r.json().catch(() => null) };
};

secao('Link da TV');
const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');
const criado = await ana.c.from('chamadas_tv').insert({ clinica_id: cA, nome: 'e2e TV recepção', token_hash: hash }).select('id').single();
ok('o administrador cria o link da TV', !criado.error, criado.error?.message);
const daBia = await bia.c.from('chamadas_tv').insert({ clinica_id: cA, nome: 'e2e bia', token_hash: createHash('sha256').update('x').digest('hex') });
ok('membro comum não cria link de TV', Boolean(daBia.error));
const listaBia = await bia.c.from('chamadas_tv').select('id').eq('clinica_id', cA);
ok('membro comum não vê os links', !listaBia.error && listaBia.data.length === 0);
const vazia = await tv(token);
ok('a TV abre sem login pelo link', vazia.status === 200 && typeof vazia.dados?.clinica === 'string', JSON.stringify(vazia.dados));
ok('token inventado dá 404', (await tv(randomBytes(32).toString('base64url'))).status === 404);
ok('token fora do formato dá 404', (await tv('abc')).status === 404);

secao('Chamar');
await sql(`DELETE FROM configuracoes_clinica WHERE clinica_id = $1 AND chave = 'chamada_tv'`, [cA]);
const [ag] = await sql(`SELECT a.id, p.nome FROM agendamentos a JOIN pacientes p ON p.id = a.paciente_id WHERE a.clinica_id = $1 ORDER BY a.data_hora DESC LIMIT 1`, [cA]);
const chamada = await bia.c.from('chamadas').insert({ clinica_id: cA, agendamento_id: ag.id, local: 'Consultório 1', nome_exibicao: 'NOME COMPLETO FORJADO' }).select('nome_exibicao, paciente_id').single();
const partes = ag.nome.trim().split(/\s+/);
const esperado = `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
ok('a recepção chama o paciente da agenda', !chamada.error, chamada.error?.message);
ok('o banco monta o nome curto (o navegador não escolhe)', chamada.data?.nome_exibicao === esperado, `${chamada.data?.nome_exibicao} ≠ ${esperado}`);
const naTv = await tv(token);
const ultima = naTv.dados?.chamadas?.at(-1);
ok('a TV recebe a chamada com nome curto e local', ultima?.nome_exibicao === esperado && ultima?.local === 'Consultório 1', JSON.stringify(ultima));
ok('a TV nunca recebe o nome completo nem o paciente', !JSON.stringify(naTv.dados).includes(ag.nome) && !('paciente_id' in (ultima || {})), JSON.stringify(ultima));
const depois = await tv(token, ultima?.created_at);
ok('com "depois", só vêm as novas', depois.status === 200 && depois.dados.chamadas.length === 0, JSON.stringify(depois.dados?.chamadas));

const s1 = await bia.c.rpc('chamada_proxima_senha', { p_clinica: cA });
const s2 = await bia.c.rpc('chamada_proxima_senha', { p_clinica: cA });
ok('a senha do dia sobe de um em um', !s1.error && Number(s2.data) === Number(s1.data) + 1, JSON.stringify([s1.data, s2.data]));
const avulsa = await bia.c.from('chamadas').insert({ clinica_id: cA, senha: s2.data, local: 'Guichê' }).select('senha, nome_exibicao').single();
ok('senha avulsa chamada sem nome', !avulsa.error && avulsa.data.nome_exibicao === null && avulsa.data.senha === s2.data, JSON.stringify(avulsa.error || avulsa.data));
const alheia = await dani.c.rpc('chamada_proxima_senha', { p_clinica: cA });
ok('outra clínica não gera senha aqui', Boolean(alheia.error));
const invade = await dani.c.from('chamadas').insert({ clinica_id: cA, senha: 1, local: 'x' });
ok('outra clínica não chama na TV daqui', Boolean(invade.error));

await sql(`INSERT INTO configuracoes_clinica (clinica_id, chave, valor) VALUES ($1, 'chamada_tv', '{"mostrar":"senha","locais":["Consultório 1"],"voz":false}'::jsonb)
           ON CONFLICT (clinica_id, chave) DO UPDATE SET valor = EXCLUDED.valor`, [cA]);
const soSenha = await bia.c.from('chamadas').insert({ clinica_id: cA, agendamento_id: ag.id, local: 'Consultório 1' }).select('nome_exibicao, senha').single();
ok('com "só a senha", o paciente da agenda recebe senha e nenhum nome', !soSenha.error && soSenha.data.nome_exibicao === null && soSenha.data.senha > 0, JSON.stringify(soSenha.error || soSenha.data));
ok('a TV sabe que a voz está desligada', (await tv(token)).dados?.voz === false);

secao('Revogar');
const rev = await ana.c.from('chamadas_tv').update({ ativo: false }).eq('id', criado.data.id).select('revogado_em').single();
ok('o administrador revoga o link', !rev.error && rev.data.revogado_em, JSON.stringify(rev.error || rev.data));
ok('link revogado dá 404 na TV', (await tv(token)).status === 404);
const volta = await ana.c.from('chamadas_tv').update({ ativo: true }).eq('id', criado.data.id).select('ativo').single();
ok('revogado não volta a valer', volta.data?.ativo === false && (await tv(token)).status === 404, JSON.stringify(volta.data));

// Limpeza.
await sql(`DELETE FROM chamadas WHERE clinica_id = $1`, [cA]);
await sql(`DELETE FROM chamadas_tv WHERE nome LIKE 'e2e%'`);
await sql(`DELETE FROM chamadas_senhas WHERE clinica_id = $1`, [cA]);
await sql(`DELETE FROM configuracoes_clinica WHERE clinica_id = $1 AND chave = 'chamada_tv'`, [cA]);
fim();
