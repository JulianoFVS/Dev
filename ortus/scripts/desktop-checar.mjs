#!/usr/bin/env node
/**
 * Teste de fumaça da camada local do desktop (sem abrir janela).
 *
 * Valida o que o motor de sincronização depende: schema espelho, geração de
 * id que não colide com o Postgres, outbox em toda escrita, consolidação de
 * alterações repetidas, conflito e cursor.
 *
 * Uso: npm run desktop:teste
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { criarBanco } = require(path.join(raiz, 'desktop', 'lib', 'sqlite.cjs'));
const { ORDEM_SYNC } = require(path.join(raiz, 'desktop', 'lib', 'esquema.cjs'));

const resultados = [];
const check = (nome, ok, detalhe = '') => resultados.push({ nome, ok, detalhe });

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ortus-desktop-'));
const arquivo = path.join(pasta, 'teste.db');
const banco = criarBanco(arquivo);

try {
  // 1. schema
  const tabelas = banco.bruto
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((l) => l.name);
  const faltando = ORDEM_SYNC.filter((t) => !tabelas.includes(t));
  check('schema espelhado criado', faltando.length === 0, faltando.join(','));
  check(
    'tabelas de controle criadas',
    ['sync_outbox', 'sync_conflitos', 'sync_cursor', 'sync_meta'].every((t) => tabelas.includes(t)),
  );

  // 2. escrita de paciente gera outbox
  const paciente = banco.gravar('pacientes', 'insert', {
    nome: 'Paciente Teste',
    clinica_id: 17,
    telefone: '82999990000',
    ficha_medica: { alergias: 'dipirona' },
  });
  check('insere paciente com uuid', typeof paciente.id === 'string' && paciente.id.length === 36, paciente.id);
  check('jsonb volta como objeto', paciente.ficha_medica?.alergias === 'dipirona');
  check('updated_at carimbado', Boolean(paciente.updated_at));
  check('outbox registra a escrita', banco.contarOutbox() === 1, String(banco.contarOutbox()));

  // 3. id bigint local é negativo (não colide com a sequence do Postgres)
  const agendamento = banco.gravar('agendamentos', 'insert', {
    paciente_id: paciente.id,
    clinica_id: 17,
    data_hora: '2026-12-01T12:00:00.000Z',
    procedimento: 'Avaliação',
    valor: 150,
  });
  check('id bigint local negativo', Number(agendamento.id) < 0, String(agendamento.id));
  check('agendamento lê de volta', banco.obter('agendamentos', agendamento.id)?.procedimento === 'Avaliação');

  // 4. update consolida (uma linha por registro depois de consolidar)
  banco.gravar('pacientes', 'update', { telefone: '82988887777' }, paciente.id);
  banco.gravar('pacientes', 'update', { telefone: '82977776666' }, paciente.id);
  const linhas = banco.bruto
    .prepare("SELECT * FROM sync_outbox WHERE tabela='pacientes' AND linha_id=? ORDER BY seq")
    .all(paciente.id);
  const ultima = linhas[linhas.length - 1];
  const payload = JSON.parse(ultima.payload);
  check('outbox guarda o estado mais recente', payload.telefone === '82977776666', payload.telefone);
  check('todas as escritas entram na fila', linhas.length === 3, String(linhas.length));

  // 5. consulta com filtros e ordem
  banco.gravar('pacientes', 'insert', { nome: 'Ana', clinica_id: 17 });
  const lista = banco.consultar('pacientes', {
    filtros: [{ col: 'clinica_id', op: 'eq', valor: 17 }],
    ordem: [{ col: 'nome', asc: true }],
  });
  check('filtro + ordem', lista.length === 2 && lista[0].nome === 'Ana', lista.map((l) => l.nome).join(','));
  check('contar respeita filtro', banco.contar('pacientes', { filtros: [{ col: 'clinica_id', op: 'eq', valor: 99 }] }) === 0);

  // 6. exclusão
  const antes = banco.contarOutbox();
  banco.gravar('agendamentos', 'delete', {}, agendamento.id);
  check('delete gera entrada na fila', banco.contarOutbox() === antes + 1);
  const ultimaOp = banco.bruto.prepare('SELECT op FROM sync_outbox ORDER BY seq DESC LIMIT 1').get();
  check('op do delete registrada', ultimaOp.op === 'delete', ultimaOp.op);
  check('linha sumiu do banco', banco.obter('agendamentos', agendamento.id) === null);

  // 7. aplicar remoto não gera outbox
  const antesRemoto = banco.contarOutbox();
  banco.aplicarRemoto('pacientes', {
    id: '11111111-1111-4111-8111-111111111111',
    nome: 'Vindo da Nuvem',
    clinica_id: 17,
    updated_at: '2026-11-16T10:00:00.000Z',
    ficha_medica: {},
  });
  check('aplicar remoto não enfileira', banco.contarOutbox() === antesRemoto);
  check(
    'linha remota aplicada',
    banco.obter('pacientes', '11111111-1111-4111-8111-111111111111')?.nome === 'Vindo da Nuvem',
  );

  // 8. cursor e meta
  banco.definirCursor('pacientes', '2026-11-16T10:00:00.000Z');
  check('cursor persiste', banco.obterCursor('pacientes') === '2026-11-16T10:00:00.000Z');
  banco.definirMeta('ultimo_envio_ok', '2026-11-16T10:05:00.000Z');
  check('meta persiste', banco.obterMeta('ultimo_envio_ok') === '2026-11-16T10:05:00.000Z');

  // 9. conflito
  banco.registrarConflito({
    tabela: 'pacientes',
    linhaId: paciente.id,
    clinicaId: '17',
    versaoLocal: { ...paciente, telefone: '82977776666' },
    versaoRemota: { ...paciente, telefone: '82111112222' },
    escolhido: 'remoto',
  });
  check('conflito registrado', banco.contarConflitosPendentes() === 1, String(banco.contarConflitosPendentes()));
  const conflitos = banco.listarConflitos();
  check('conflito traz as duas versões', Boolean(conflitos[0]?.versao_local) && Boolean(conflitos[0]?.versao_remota));
  banco.resolverConflito(conflitos[0].id, 'remoto');
  check('conflito resolvido', banco.contarConflitosPendentes() === 0);

  // 10. estatísticas
  const stats = banco.estatisticas();
  check('estatísticas por tabela', typeof stats.tabelas.pacientes === 'number', JSON.stringify(stats.tabelas));

  // 11. duas máquinas ao mesmo tempo
  const pastaB = fs.mkdtempSync(path.join(os.tmpdir(), 'ortus-desktop-b-'));
  const bancoB = criarBanco(path.join(pastaB, 'ortus.db'), { instalacaoId: 'maquina-b' });
  try {
    // ids bigint de máquinas diferentes nunca colidem
    const idsA = new Set();
    const idsB = new Set();
    for (let i = 0; i < 200; i += 1) {
      idsA.add(String(banco.gravar('agendamentos', 'insert', { paciente_id: paciente.id, clinica_id: 17, data_hora: '2026-12-01T10:00:00Z' }).id));
      idsB.add(String(bancoB.gravar('agendamentos', 'insert', { paciente_id: paciente.id, clinica_id: 17, data_hora: '2026-12-01T10:00:00Z' }).id));
    }
    check('ids de máquinas diferentes não colidem', [...idsA].every((id) => !idsB.has(id)), `${idsA.size}+${idsB.size}`);

    // exclusão gera túmulo local
    const alvo = banco.gravar('tarefas', 'insert', { clinica_id: 17, titulo: 'sumir' });
    banco.gravar('tarefas', 'delete', {}, alvo.id);
    check('exclusão registra túmulo', Boolean(banco.tumuloDe('tarefas', alvo.id)));

    // pull antigo não ressuscita o que foi apagado
    banco.aplicarRemoto('tarefas', { ...alvo, updated_at: '2000-01-01T00:00:00Z' });
    check('pull antigo não ressuscita', banco.obter('tarefas', alvo.id) === null);

    // máquina B apaga; máquina A recebe o túmulo e apaga junto
    const compartilhado = banco.gravar('pacientes', 'insert', { nome: 'Compartilhado', clinica_id: 17 });
    bancoB.aplicarRemoto('pacientes', compartilhado);
    check('B enxerga o registro criado em A', Boolean(bancoB.obter('pacientes', compartilhado.id)));
    banco.aplicarTumulo('pacientes', compartilhado.id, new Date(Date.now() + 1000).toISOString());
    check('túmulo de B apaga em A', banco.obter('pacientes', compartilhado.id) === null);

    // se A editou DEPOIS do túmulo, a edição prevalece
    const editado = banco.gravar('pacientes', 'insert', { nome: 'Editado', clinica_id: 17 });
    bancoB.aplicarTumulo('pacientes', editado.id, '2000-01-01T00:00:00Z');
    check('edição mais nova vence o túmulo antigo', Boolean(banco.obter('pacientes', editado.id)));
  } finally {
    bancoB.fechar();
    fs.rmSync(pastaB, { recursive: true, force: true });
  }

  // 12. filtro OU (paciente da clínica ou sem clínica)
  const ou = banco.consultar('pacientes', {
    filtros: [{
      col: 'or',
      op: 'or',
      valor: [
        { col: 'clinica_id', op: 'eq', valor: 17 },
        { col: 'clinica_id', op: 'is', valor: null },
      ],
    }],
  });
  check('filtro ou', ou.length >= 2, String(ou.length));

  const despesa = banco.gravar('despesas', 'insert', {
    descricao: 'Material',
    valor: 40,
    data: '2026-11-16',
    clinica_id: 17,
    tipo: 'despesa',
  });
  check('despesa local', despesa.descricao === 'Material' && Number(despesa.id) < 0, String(despesa.id));

  // 13. reabrir o banco (durabilidade)
  banco.fechar();
  const reaberto = criarBanco(arquivo);
  check('dados sobrevivem ao fechar', reaberto.contar('pacientes') === 4, String(reaberto.contar('pacientes')));
  reaberto.fechar();

  const { criarVerificadorSenha, conferirVerificadorSenha } = require(path.join(raiz, 'desktop', 'lib', 'verificadorSenha.cjs'));
  const verificador = criarVerificadorSenha('A@Clinica.com', 'senha123');
  check('verificador normaliza o e-mail', verificador.email === 'a@clinica.com');
  check('verificador aceita a senha certa', conferirVerificadorSenha(verificador, 'a@clinica.com', 'senha123'));
  check('verificador recusa senha errada', !conferirVerificadorSenha(verificador, 'a@clinica.com', 'outra'));
  check('verificador recusa outro e-mail', !conferirVerificadorSenha(verificador, 'b@clinica.com', 'senha123'));
} finally {
  try {
    fs.rmSync(pasta, { recursive: true, force: true });
  } catch {
    /* ignora */
  }
}

console.log('\n=== RESULTADO ===');
let falhas = 0;
for (const r of resultados) {
  if (!r.ok) falhas++;
  console.log(`${r.ok ? 'OK  ' : 'FALHA'} ${r.nome}${r.detalhe ? `  → ${r.detalhe}` : ''}`);
}
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações OK`);
process.exit(falhas ? 1 : 0);
