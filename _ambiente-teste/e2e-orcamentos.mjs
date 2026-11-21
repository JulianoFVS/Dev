// Orçamentos, funil e oportunidades — ponta a ponta.
// Regras puras direto de ortus/lib/orcamentos.ts (o Node lê TypeScript simples)
// e as gravações que a tela faz, pela API do banco, como cada pessoa do seed.
import { entrar, fim, ok, secao, sql } from './util.mjs';
import * as orc from '../ortus/lib/orcamentos.ts';

const ana = await entrar('ana.admin@maissorriso.test');
const bia = await entrar('bia.recepcao@maissorriso.test');
const dani = await entrar('dani.dentista@bemestar.test');
const [clinA] = await sql(`SELECT id FROM clinicas WHERE nome = 'Mais Sorriso'`);
const [profAna] = await sql(`SELECT id FROM profissionais WHERE email = 'ana.admin@maissorriso.test'`);
const [profBia] = await sql(`SELECT id FROM profissionais WHERE email = 'bia.recepcao@maissorriso.test'`);
const cA = Number(clinA.id);

secao('Regras puras');
const ontem = orc.somarDias(new Date().toISOString().slice(0, 10), -1);
const hoje = new Date().toISOString().slice(0, 10);
ok('enviado com validade vencida conta como expirado', orc.statusEfetivo({ status: 'enviado', validade: ontem }, hoje) === 'expirado');
ok('aprovado não expira', orc.statusEfetivo({ status: 'aprovado', validade: ontem }, hoje) === 'aprovado');
ok('expirado sai do funil em andamento', !orc.emAndamento({ status: 'em_aberto', validade: ontem }, hoje));
ok('valor final = itens − desconto', orc.valorFinal([{ quantidade: 2, valor_unitario: 260 }, { quantidade: 1, valor_unitario: 180 }], 50) === 650);
ok('desconto maior que a soma não deixa valor negativo', orc.valorFinal([{ quantidade: 1, valor_unitario: 100 }], 500) === 0);
ok('somar dias atravessa o mês', orc.somarDias('2026-02-27', 2) === '2026-03-01');
ok('ligar hoje: contato vencido em orçamento em andamento', orc.ligarHoje({ status: 'enviado', validade: null, proximo_contato: ontem }, hoje));
ok('ligar hoje: não vale para recusado', !orc.ligarHoje({ status: 'recusado', validade: null, proximo_contato: ontem }, hoje));
const u1 = await orc.uuidDerivado('orcamento-item:abc');
const u2 = await orc.uuidDerivado('orcamento-item:abc');
ok('id do tratamento derivado do item é estável e tem forma de uuid', u1 === u2 && /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u1), u1);

secao('Gravações como na tela');
const [pac] = await sql(`SELECT id FROM pacientes WHERE nome = 'Otávio Pires'`);
const novo = await ana.c.from('orcamentos').insert({
  id: crypto.randomUUID(), clinica_id: cA, paciente_id: pac.id, profissional_id: Number(profAna.id), comercial_id: Number(profBia.id),
  status: 'rascunho', valor_total: 440, desconto: 0, validade: orc.somarDias(hoje, 30), criado_por: Number(profAna.id),
}).select('*').single();
ok('ana cria orçamento', !novo.error, novo.error?.message);
const orcId = novo.data?.id;
const itens = [];
for (const [i, [nome, valor]] of [['Limpeza', 180], ['Restauração em resina', 260]].entries()) {
  const r = await ana.c.from('orcamento_itens').insert({ id: crypto.randomUUID(), clinica_id: cA, orcamento_id: orcId, procedimento: nome, quantidade: 1, valor_unitario: valor, valor_total: valor, ordem: i }).select('*').single();
  if (!r.error) itens.push(r.data);
}
ok('ana grava os dois itens', itens.length === 2);

// Os mesmos passos de aprovarOrcamento (lib/db/orcamentos.ts), duas vezes: a segunda não pode duplicar nada.
async function aprovar() {
  for (const item of itens) {
    const tid = await orc.uuidDerivado(`orcamento-item:${item.id}`);
    const existe = await ana.c.from('paciente_tratamentos').select('id').eq('id', tid).maybeSingle();
    if (existe.error) throw new Error(existe.error.message);
    if (!existe.data) {
      const t = await ana.c.from('paciente_tratamentos').insert({
        id: tid, paciente_id: pac.id, clinica_id: cA, legacy_id: `e2e-${item.id}`, procedimento: item.procedimento,
        valor: item.valor_total, status: 'planejado', data: hoje, orcamento_id: orcId, profissional_id: Number(profAna.id),
      });
      if (t.error) throw new Error(t.error.message);
    }
    const l = await ana.c.from('orcamento_itens').update({ tratamento_id: tid }).eq('id', item.id);
    if (l.error) throw new Error(l.error.message);
  }
  const deb = await ana.c.from('paciente_debitos').select('id').eq('orcamento_id', orcId).limit(1);
  if (deb.error) throw new Error(deb.error.message);
  if (!deb.data.length) {
    const d = await ana.c.from('paciente_debitos').insert({ paciente_id: pac.id, clinica_id: cA, descricao: 'Orçamento aprovado (2 itens)', valor: 440, status: 'pendente', orcamento_id: orcId });
    if (d.error) throw new Error(d.error.message);
  }
  const s = await ana.c.from('orcamentos').update({ status: 'aprovado', aprovado_em: new Date().toISOString(), status_desde: new Date().toISOString() }).eq('id', orcId);
  if (s.error) throw new Error(s.error.message);
}
let erroAprovar = null;
try { await aprovar(); await aprovar(); } catch (e) { erroAprovar = e.message; }
ok('aprovar duas vezes passa pelas regras do banco', !erroAprovar, erroAprovar || '');
const [contagem] = await sql(
  `SELECT (SELECT count(*)::int FROM paciente_tratamentos WHERE orcamento_id = $1) AS trat,
          (SELECT count(*)::int FROM paciente_debitos WHERE orcamento_id = $1) AS deb,
          (SELECT count(*)::int FROM orcamento_itens WHERE orcamento_id = $1 AND tratamento_id IS NOT NULL) AS ligados,
          (SELECT status FROM orcamentos WHERE id = $1) AS status`, [orcId]);
ok('um tratamento por item, um débito, itens ligados e status aprovado',
  contagem.trat === 2 && contagem.deb === 1 && contagem.ligados === 2 && contagem.status === 'aprovado', JSON.stringify(contagem));

const [pedro] = await sql(`SELECT o.id, o.paciente_id FROM orcamentos o JOIN pacientes p ON p.id = o.paciente_id WHERE p.nome = 'Pedro Henrique Costa'`);
const contato = await bia.c.from('orcamento_contatos').insert({
  id: crypto.randomUUID(), clinica_id: cA, paciente_id: pedro.paciente_id, orcamento_id: pedro.id, motivo: 'orcamento', canal: 'ligacao',
  resumo: 'Pediu para ligar de novo semana que vem.', proximo_contato: orc.somarDias(hoje, 7), feito_por: Number(profBia.id),
});
ok('a recepção (membro comum) registra o contato do orçamento', !contato.error, contato.error?.message);
const atualiza = await bia.c.from('orcamentos').update({ ultimo_contato_em: new Date().toISOString(), proximo_contato: orc.somarDias(hoje, 7) }).eq('id', pedro.id).select('id');
ok('e marca o próximo contato no orçamento', !atualiza.error && atualiza.data?.length === 1, atualiza.error?.message);

secao('Isolamento');
const deFora = await dani.c.from('orcamentos').select('id').eq('clinica_id', cA);
ok('quem é de outra clínica não vê os orçamentos', !deFora.error && deFora.data.length === 0, JSON.stringify(deFora.error || deFora.data?.length));
const invade = await dani.c.from('orcamentos').insert({ clinica_id: cA, paciente_id: pac.id, status: 'rascunho' });
ok('nem cria orçamento na clínica alheia', Boolean(invade.error), 'gravou');

secao('Dados do funil no seed');
const ops = await sql(`
  SELECT p.nome, a.status FROM agendamentos a JOIN pacientes p ON p.id = a.paciente_id
   WHERE p.nome IN ('Renata Lopes', 'Gustavo Rezende', 'Patrícia Gomes') ORDER BY p.nome`);
ok('seed tem falta, cancelamento e avaliação sem orçamento', ops.map((o) => `${o.nome}:${o.status}`).join(',') === 'Gustavo Rezende:cancelado,Patrícia Gomes:concluido,Renata Lopes:faltou', JSON.stringify(ops));

// Limpeza: o orçamento de teste e o que nasceu dele (o seed volta igual ao reiniciar).
await sql(`DELETE FROM paciente_debitos WHERE orcamento_id = $1`, [orcId]);
await sql(`DELETE FROM orcamento_itens WHERE orcamento_id = $1`, [orcId]);
await sql(`DELETE FROM paciente_tratamentos WHERE orcamento_id = $1`, [orcId]);
await sql(`DELETE FROM orcamentos WHERE id = $1`, [orcId]);
fim();
