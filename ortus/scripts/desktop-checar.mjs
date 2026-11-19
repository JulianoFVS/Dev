#!/usr/bin/env node
/**
 * Teste de fumaça da camada local do desktop (sem abrir janela).
 *
 * Valida o que o motor de sincronização depende: schema espelho, geração de
 * id que não colide com o Postgres, outbox em toda escrita, consolidação de
 * alterações repetidas, conflito e cursor. Confere também as peças de
 * segurança que não precisam de janela: prova de origem, verificador de
 * segredos do instalador, ambiente do build e plano de assinatura.
 *
 * No fim roda os outros dois testes do desktop:
 *   scripts/desktop-sync-teste.mjs   motor de sincronização contra uma nuvem de mentira
 *   scripts/desktop-rotas-teste.mjs  rotas /api/local/* com o código de verdade
 *
 * Uso: npm run desktop:teste
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ambienteDoBuild, verificarPasta } from './desktop-verificar.mjs';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CAMINHO_SQLITE = path.join(raiz, 'desktop', 'lib', 'sqlite.cjs');
const { criarBanco } = require(CAMINHO_SQLITE);
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
  check(
    'id bigint local cabe no inteiro seguro e fica longe da faixa de 32 bits',
    Number.isSafeInteger(agendamento.id) && agendamento.id < -(2 ** 40),
    String(agendamento.id),
  );
  check('agendamento lê de volta', banco.obter('agendamentos', agendamento.id)?.procedimento === 'Avaliação');

  // 4. update consolida (uma linha por registro depois de consolidar)
  const editado = banco.gravar('pacientes', 'update', { telefone: '82988887777' }, paciente.id);
  check(
    'update devolve a linha inteira (não só o campo alterado)',
    editado.id === paciente.id && editado.nome === 'Paciente Teste' && editado.clinica_id === 17 && editado.telefone === '82988887777',
    JSON.stringify({ id: editado.id, nome: editado.nome }),
  );
  banco.gravar('pacientes', 'update', { telefone: '82977776666' }, paciente.id);
  const linhas = banco.bruto
    .prepare("SELECT * FROM sync_outbox WHERE tabela='pacientes' AND linha_id=? ORDER BY seq")
    .all(paciente.id);
  const ultima = linhas[linhas.length - 1];
  const payload = JSON.parse(ultima.payload);
  check('outbox guarda o estado mais recente', payload.telefone === '82977776666', payload.telefone);
  check('o que vai para a nuvem leva o id e os demais campos', payload.id === paciente.id && payload.nome === 'Paciente Teste', JSON.stringify({ id: payload.id, nome: payload.nome }));
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

  // 14. ids bigint entre aberturas do programa e ao longo do tempo
  {
    const relogioReal = Date.now;
    const recarregar = () => {
      delete require.cache[require.resolve(CAMINHO_SQLITE)];
      return require(CAMINHO_SQLITE);
    };
    try {
      // A conta antiga, em 32 bits, repetia o id a cada 4.096 s e, em metade
      // do tempo, recomeçava em -1 a cada abertura do programa.
      const inicio = Date.UTC(2026, 10, 18, 12, 0, 0);
      const gerados = [];
      for (const depois of [0, 1, 2048, 4096, 8192, 86_400, 365 * 86_400]) {
        Date.now = () => inicio + depois * 1000;
        gerados.push(recarregar().novoId('agendamentos', 123));
      }
      check('ids de aberturas diferentes do programa não se repetem', new Set(gerados).size === gerados.length, gerados.join(','));
      check('ids são sempre negativos e inteiros seguros', gerados.every((id) => id < 0 && Number.isSafeInteger(id)));
      Date.now = () => inicio;
      const mesmoSegundo = recarregar();
      const doSegundo = new Set(Array.from({ length: 600 }, () => mesmoSegundo.novoId('agendamentos', 123)));
      check('600 ids no mesmo segundo não colidem', doSegundo.size === 600, String(doSegundo.size));
      check('máquinas diferentes no mesmo segundo não colidem', recarregar().novoId('agendamentos', 1) !== recarregar().novoId('agendamentos', 2));

      // Programa reaberto no MESMO segundo, sobre o mesmo arquivo: o contador
      // recomeça, e o banco precisa notar que o id já está em uso.
      const pastaIds = fs.mkdtempSync(path.join(os.tmpdir(), 'ortus-desktop-ids-'));
      const arquivoIds = path.join(pastaIds, 'ortus.db');
      try {
        let aberto = recarregar().criarBanco(arquivoIds, { instalacaoId: 'maquina-x' });
        const primeira = aberto.gravar('despesas', 'insert', { descricao: 'antes de fechar', clinica_id: 17 });
        aberto.fechar();
        aberto = recarregar().criarBanco(arquivoIds, { instalacaoId: 'maquina-x' });
        const segunda = aberto.gravar('despesas', 'insert', { descricao: 'depois de reabrir', clinica_id: 17 });
        check('reabrir o programa não reaproveita id', primeira.id !== segunda.id && aberto.contar('despesas') === 2, `${primeira.id} / ${segunda.id}`);
        check('a linha nova é a que foi pedida', segunda.descricao === 'depois de reabrir', segunda.descricao);
        aberto.fechar();
      } finally {
        fs.rmSync(pastaIds, { recursive: true, force: true });
      }
    } finally {
      Date.now = relogioReal;
      recarregar();
    }
  }

  // 15. prova de origem das requisições locais
  {
    const { cabecalhosDaJanela, conferirRequisicaoLocal, urlEhLocal } = require(path.join(raiz, 'desktop', 'lib', 'origemLocal.cjs'));
    const segredo = 'a1'.repeat(32);

    // O que o processo principal injeta (e retira) em cada requisição da janela.
    const pedido = (url, iniciador, cabecalhos = { Accept: '*/*' }) => cabecalhosDaJanela({ url, iniciador, cabecalhos, porta: 4321, segredo });
    const APP = 'http://127.0.0.1:4321';
    check('carregamento inicial da janela leva o segredo', pedido(`${APP}/login`, undefined)?.['x-ortus-janela'] === segredo);
    check('requisição da própria página leva o segredo', pedido(`${APP}/api/local/db`, APP)?.['x-ortus-janela'] === segredo);
    check('conteúdo externo embutido na janela não recebe o segredo', pedido(`${APP}/api/local/db`, 'https://video.example') === null);
    check('quadro de origem opaca não recebe o segredo', pedido(`${APP}/api/local/db`, 'null') === null);
    check('requisição para fora nunca leva o segredo', pedido('https://projeto.supabase.co/rest/v1/pacientes', APP) === null);
    check(
      'o segredo é retirado depois de um redirecionamento para fora',
      JSON.stringify(pedido('https://site.example/', APP, { Accept: '*/*', 'X-Ortus-Janela': segredo })) === JSON.stringify({ Accept: '*/*' }),
    );
    check(
      'valor posto pela página é trocado pelo verdadeiro',
      pedido(`${APP}/api/local/db`, APP, { 'X-Ortus-Janela': 'forjado' })?.['x-ortus-janela'] === segredo
        && !('X-Ortus-Janela' in (pedido(`${APP}/api/local/db`, APP, { 'X-Ortus-Janela': 'forjado' }) || {})),
    );
    check('outra porta local não recebe o segredo', pedido('http://127.0.0.1:9999/api', APP) === null);
    const janela = { host: '127.0.0.1:4321', segredoRecebido: segredo, segredoEsperado: segredo, porta: 4321 };
    const motivo = (requisicao) => {
      const resultado = conferirRequisicaoLocal(requisicao);
      return resultado.ok ? 'ok' : resultado.motivo;
    };
    check('janela do aplicativo passa', motivo(janela) === 'ok' && motivo({ ...janela, origin: 'http://127.0.0.1:4321', secFetchSite: 'same-origin' }) === 'ok');
    check('sem o segredo da execução não passa', motivo({ ...janela, segredoRecebido: '' }) === 'segredo');
    check('Host de outro domínio (DNS rebinding) não passa', motivo({ ...janela, host: 'atacante.example:4321' }) === 'host');
    check('Origin de outro site não passa', motivo({ ...janela, origin: 'https://site.example' }) === 'origem');
    check('requisição marcada como de outro site não passa', motivo({ ...janela, secFetchSite: 'cross-site' }) === 'site');
    check('servidor sem segredo configurado recusa tudo', motivo({ ...janela, segredoEsperado: '', segredoRecebido: '' }) === 'configuracao');
    check(
      'endereço local é comparado pela origem inteira',
      urlEhLocal('http://127.0.0.1:4321/login', 4321) && !urlEhLocal('http://127.0.0.1:43210/', 4321) && !urlEhLocal('http://127.0.0.1:4321@site.example/', 4321),
    );
  }

  // 16. verificador de segredos do instalador
  {
    const pastaPacote = fs.mkdtempSync(path.join(os.tmpdir(), 'ortus-desktop-pacote-'));
    try {
      const valor = 'segredo-de-mentira-para-o-teste-0001';
      const b64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
      const jwtServidor = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role', iss: 'teste' })}.assinatura-de-mentira`;
      fs.mkdirSync(path.join(pastaPacote, 'limpo'), { recursive: true });
      fs.mkdirSync(path.join(pastaPacote, 'sujo', 'app', 'server'), { recursive: true });
      fs.writeFileSync(path.join(pastaPacote, 'limpo', 'server.js'), 'module.exports = 1;');
      fs.writeFileSync(path.join(pastaPacote, 'sujo', 'app', '.env.production'), 'X=1\n');
      fs.writeFileSync(path.join(pastaPacote, 'sujo', 'app', 'server', 'chunk.js'), `const k = "${valor}";`);
      fs.writeFileSync(path.join(pastaPacote, 'sujo', 'app', 'server', 'admin.js'), `const j = "${jwtServidor}";`);
      const segredos = [{ nome: 'CRON_SECRET', valor }];
      const limpo = verificarPasta(path.join(pastaPacote, 'limpo'), { segredos });
      const sujo = verificarPasta(path.join(pastaPacote, 'sujo'), { segredos });
      check('verificador: pasta limpa passa', limpo.ambientes.length === 0 && limpo.vazamentos.length === 0);
      check('verificador: acha arquivo .env dentro do pacote', sujo.ambientes.includes('app/.env.production'), sujo.ambientes.join(','));
      check('verificador: acha o valor de variável proibida', sujo.vazamentos.some((v) => v.variavel === 'CRON_SECRET' && v.arquivo === 'app/server/chunk.js'));
      check('verificador: acha chave service_role pelo formato', sujo.vazamentos.some((v) => /service_role/.test(v.variavel) && v.arquivo === 'app/server/admin.js'));
      check('verificador: o relatório não repete o valor', !JSON.stringify(sujo).includes(valor));

      // 17. ambiente do build: só o que o aplicativo precisa
      fs.writeFileSync(path.join(pastaPacote, '.env.local'), 'SUPABASE_SERVICE_ROLE_KEY=valor-no-arquivo\nNEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\n');
      const { env, neutralizadas } = ambienteDoBuild({
        raiz: pastaPacote,
        env: { PATH: process.env.PATH || process.env.Path || '', DATABASE_URL: 'postgres://x', TWILIO_AUTH_TOKEN: 'x', QUALQUER: 'x', NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' },
      });
      check('build: variável proibida do ambiente não passa', env.DATABASE_URL === undefined && env.TWILIO_AUTH_TOKEN === undefined && env.QUALQUER === undefined);
      check('build: segredo do .env.local é neutralizado (o Next não carrega)', env.SUPABASE_SERVICE_ROLE_KEY === '' && neutralizadas.includes('SUPABASE_SERVICE_ROLE_KEY'));
      check('build: variável pública passa', env.NEXT_PUBLIC_SUPABASE_URL === 'https://x.supabase.co' && !neutralizadas.includes('NEXT_PUBLIC_SUPABASE_URL'));
    } finally {
      fs.rmSync(pastaPacote, { recursive: true, force: true });
    }
  }

  // 18. assinatura do instalador: pedida sem segredo, o build para
  {
    const { planejar } = require(path.join(raiz, 'desktop', 'assinatura.cjs'));
    check('assinatura: sem nada no ambiente, sai sem assinar', planejar({}).modo === 'nenhuma');
    check('assinatura: certificado pedido sem arquivo lista o que falta', planejar({ ORTUS_ASSINATURA: 'certificado' }).faltam.length === 1);
    check('assinatura: .pfx sem senha lista o que falta', /WIN_CSC_KEY_PASSWORD/.test(planejar({ ORTUS_ASSINATURA: 'certificado', WIN_CSC_LINK: 'x.pfx' }).faltam.join()));
    check('assinatura: azure pedido sem segredo lista o que falta', planejar({ ORTUS_ASSINATURA: 'azure', AZURE_TENANT_ID: 't' }).faltam.includes('AZURE_CLIENT_SECRET'));
    check(
      'assinatura: com o certificado no ambiente, assina sozinho',
      planejar({ WIN_CSC_LINK: 'x.pfx', WIN_CSC_KEY_PASSWORD: 'y' }).modo === 'certificado' && planejar({ WIN_CSC_LINK: 'x.pfx', WIN_CSC_KEY_PASSWORD: 'y' }).faltam.length === 0,
    );
    check(
      'assinatura: dado pela metade, sem ORTUS_ASSINATURA, para o build',
      planejar({ WIN_CSC_LINK: 'x.pfx' }).faltam.length === 1 && planejar({ ORTUS_AZURE_CONTA: 'conta' }).faltam.length === 6,
    );
    check(
      'assinatura: AZURE_* sozinhas (de outro uso) não ligam a assinatura',
      planejar({ AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's' }).modo === 'nenhuma',
    );
    const configurar = require(path.join(raiz, 'desktop', 'assinatura.cjs'));
    const paraWindows = (env) => configurar(null, { env, argv: ['node', 'electron-builder', '--win'], plataforma: 'win32', avisar: () => {} });
    check(
      'assinatura: "nenhuma" declarada não assina nem com certificado no ambiente',
      paraWindows({ ORTUS_ASSINATURA: 'nenhuma', WIN_CSC_LINK: 'x.pfx', WIN_CSC_KEY_PASSWORD: 'y' }).win?.signExecutable === false,
    );
    check('assinatura: com certificado, arquivo sem assinatura derruba o build', paraWindows({ WIN_CSC_LINK: 'x.pfx', WIN_CSC_KEY_PASSWORD: 'y' }).win?.forceCodeSigning === true);
    let mensagem = '';
    try {
      paraWindows({ ORTUS_ASSINATURA: 'azure' });
    } catch (err) {
      mensagem = err instanceof Error ? err.message : String(err);
    }
    check('assinatura: pedida sem segredo, o build para com a lista do que falta', /AZURE_CLIENT_SECRET/.test(mensagem) && /ORTUS_ASSINATURA=nenhuma/.test(mensagem), mensagem.split('\n')[0]);
    check('assinatura: build de macOS ou Linux não é afetado', JSON.stringify(configurar(null, { env: { ORTUS_ASSINATURA: 'azure' }, argv: ['node', 'electron-builder', '--mac'], plataforma: 'darwin', avisar: () => {} })) === '{}');
  }
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

// Os outros dois testes do desktop, cada um no seu processo.
const semAvisos = ['MODULE_TYPELESS_PACKAGE_JSON', 'ExperimentalWarning']
  .filter(() => process.allowedNodeEnvironmentFlags.has('--disable-warning'))
  .map((aviso) => `--disable-warning=${aviso}`);
let outrosFalharam = 0;
for (const script of ['desktop-sync-teste.mjs', 'desktop-rotas-teste.mjs']) {
  const execucao = spawnSync(process.execPath, [...semAvisos, path.join(raiz, 'scripts', script)], { stdio: 'inherit', cwd: raiz });
  if (execucao.status !== 0) outrosFalharam += 1;
}

if (falhas || outrosFalharam) console.log('\nHÁ FALHAS nos testes do desktop (veja acima).');
else console.log('\nTodos os testes do desktop passaram.');
process.exit(falhas || outrosFalharam ? 1 : 0);
