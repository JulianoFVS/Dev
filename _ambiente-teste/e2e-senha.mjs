// "Esqueci a senha" de ponta a ponta: pedido → e-mail → link → senha nova → entrar.
// Roda contra o app em http://localhost:3000 e o ambiente local (Supabase e Resend falsos).
import { SENHA, emails, entrar, fim, limparEmails, novoCliente, ok, resendFalha, secao, sql } from './util.mjs';

const APP = process.env.APP || 'http://localhost:3000';
const pedir = async (email, cabecalhos = {}) => {
  const r = await fetch(`${APP}/api/public/recuperar-senha`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cabecalhos },
    body: JSON.stringify({ email }),
  });
  return { status: r.status, dados: await r.json().catch(() => null) };
};

const QUEM = 'bia.recepcao@maissorriso.test';
await sql(`DELETE FROM limites_publicos`);
await limparEmails();
await resendFalha(false);

secao('Pedido');
const semConta = await pedir('ninguem.aqui@nao-existe.test');
const comConta = await pedir(QUEM);
ok('com e sem conta a resposta é a mesma (não revela quem tem cadastro)',
  semConta.status === 200 && comConta.status === 200 && JSON.stringify(semConta.dados) === JSON.stringify(comConta.dados), JSON.stringify([semConta, comConta]));
let caixa = await emails();
const doPedido = caixa.filter((e) => (e.to || []).includes(QUEM));
const link = (doPedido[0]?.text || '').match(/http:\/\/localhost:3000\/acesso\?token=([^&\s]+)&tipo=senha/);
ok('o e-mail saiu só para quem tem conta, com o link de uso único', doPedido.length === 1 && Boolean(link)
  && !caixa.some((e) => (e.to || []).includes('ninguem.aqui@nao-existe.test')), JSON.stringify(caixa.map((e) => [e.to, e.subject])));
ok('o e-mail não leva senha (só o link)', doPedido[0] && !/senha\s*(temporária|provisória)|senha\s*:\s*(?!https?:\/\/)\S/i.test(doPedido[0].text || ''), doPedido[0]?.text);
const repetido = await pedir(QUEM);
ok('pedir de novo em seguida: espera (429)', repetido.status === 429, JSON.stringify(repetido));
const deFora = await pedir(QUEM, { origin: 'https://golpe.example' });
ok('pedido de outro site: recusado', deFora.status === 403, String(deFora.status));

secao('Link e senha nova');
const cliente = novoCliente();
const verificado = await cliente.auth.verifyOtp({ token_hash: decodeURIComponent(link?.[1] || ''), type: 'recovery' });
ok('o link abre a sessão da conta', !verificado.error && verificado.data?.session?.user?.email === QUEM, verificado.error?.message);
const novaSenha = 'Recupera2026x';
const trocou = await cliente.auth.updateUser({ password: novaSenha });
ok('a pessoa grava a senha nova', !trocou.error, trocou.error?.message);
const reuso = await novoCliente().auth.verifyOtp({ token_hash: decodeURIComponent(link?.[1] || ''), type: 'recovery' });
ok('o mesmo link não entra de novo', Boolean(reuso.error));
const comNova = await entrar(QUEM, novaSenha);
ok('entra com a senha nova', Boolean(comNova.token));

secao('E-mail que não sai');
await sql(`DELETE FROM limites_publicos`);
await resendFalha(true);
const falhou = await pedir(QUEM);
await resendFalha(false);
ok('Resend recusou: a resposta diz que não saiu (não finge), sem detalhe técnico',
  falhou.status === 502 && /não saiu/i.test(falhou.dados?.error || '') && !/resend|api|key/i.test(falhou.dados?.error || ''), JSON.stringify(falhou));

// devolve a senha do seed para os outros testes
const volta = novoCliente();
await volta.auth.signInWithPassword({ email: QUEM, password: novaSenha });
await volta.auth.updateUser({ password: SENHA });
await sql(`DELETE FROM limites_publicos`);
fim();
