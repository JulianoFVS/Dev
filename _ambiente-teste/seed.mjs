// Dados de exemplo do ambiente local. Nomes e e-mails são inventados
// (domínio .test, que não existe na internet).
// Na demonstração pública a senha das contas de exemplo vem do ambiente (SENHA_DEMO).
export const SENHA_PADRAO = process.env.SENHA_DEMO || 'Teste@1234';

export const USUARIOS = {
  gabriel: { email: 'gabriel@ortus.test', nome: 'Gabriel Dono', cargo: 'Fundador', nivel: 'admin', superAdmin: true },
  juliano: { email: 'juliano@ortus.test', nome: 'Juliano Dono', cargo: 'Fundador', nivel: 'admin', superAdmin: true },
  ana: { email: 'ana.admin@maissorriso.test', nome: 'Ana Prado', cargo: 'Dentista responsável', nivel: 'admin' },
  bia: { email: 'bia.recepcao@maissorriso.test', nome: 'Bia Nunes', cargo: 'Recepcionista', nivel: 'comum' },
  caio: { email: 'caio.admin@bemestar.test', nome: 'Caio Lima', cargo: 'Dentista responsável', nivel: 'admin' },
  dani: { email: 'dani.dentista@bemestar.test', nome: 'Dani Rocha', cargo: 'Dentista', nivel: 'comum' },
};

function diaHora(deslocDias, hora, minuto = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocDias);
  d.setHours(hora, minuto, 0, 0);
  return d.toISOString();
}

export async function semear(sql, hashSenha) {
  const ja = await sql('SELECT count(*)::int AS n FROM auth.users');
  if (ja.rows[0].n > 0) return;

  const um = async (texto, params = []) => (await sql(texto, params)).rows[0];

  const redeA = await um(`INSERT INTO public.redes (nome) VALUES ('Rede Mais Sorriso') RETURNING id`);
  const redeB = await um(`INSERT INTO public.redes (nome) VALUES ('Rede Bem Estar') RETURNING id`);
  const redeO = await um(`INSERT INTO public.redes (nome) VALUES ('Ortus') RETURNING id`);

  const clinica = async (nome, rede, matriz, cidade) => um(
    `INSERT INTO public.clinicas (nome, rede_id, is_matriz, cidade, uf, telefone, email, endereco)
     VALUES ($1, $2, $3, $4, 'SP', '(11) 4000-0000', $5, $6) RETURNING id`,
    [nome, rede.id, matriz, cidade, `contato@${nome.toLowerCase().replace(/[^a-z]/g, '')}.test`, `Rua das Flores, 100 — ${cidade}`],
  );
  const cA = await clinica('Mais Sorriso', redeA, true, 'São Paulo');
  const cA2 = await clinica('Mais Sorriso Centro', redeA, false, 'Campinas');
  const cB = await clinica('Clínica Bem Estar', redeB, true, 'Santos');
  const cO = await clinica('Ortus', redeO, true, 'São Paulo');

  const ids = {};
  for (const [chave, u] of Object.entries(USUARIOS)) {
    // Id fixo por e-mail: reiniciar o ambiente não invalida a sessão aberta no navegador.
    const auth = await um(
      `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       VALUES (md5($1)::uuid, $1, $2, now(), $3::jsonb) RETURNING id`,
      [u.email, hashSenha(SENHA_PADRAO), JSON.stringify({ nome: u.nome })],
    );
    const prof = await um(
      `INSERT INTO public.profissionais (user_id, nome, cargo, nivel_acesso, is_super_admin, email, telefone, precisa_trocar_senha)
       VALUES ($1, $2, $3, $4, $5, $6, '(11) 90000-0000', false) RETURNING id`,
      [auth.id, u.nome, u.cargo, u.nivel, u.superAdmin === true, u.email],
    );
    ids[chave] = { user: auth.id, prof: prof.id };
  }

  const vincular = (chave, c) => sql(`INSERT INTO public.profissionais_clinicas (profissional_id, clinica_id) VALUES ($1, $2)`, [ids[chave].prof, c.id]);
  await vincular('gabriel', cO); await vincular('juliano', cO);
  await vincular('ana', cA); await vincular('ana', cA2); await vincular('bia', cA);
  await vincular('caio', cB); await vincular('dani', cB);

  // Permissões da recepção (membro comum): agenda, ficha do paciente e orçamentos.
  for (const modulo of ['agenda', 'ficha_paciente', 'configuracoes', 'controle_protese', 'financeiro', 'inteligencia', 'marketing', 'estoque', 'loja', 'orcamentos', 'conversas']) {
    await sql(
      `INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [ids.bia.prof, cA.id, modulo, ['agenda', 'ficha_paciente', 'inteligencia', 'orcamentos', 'conversas'].includes(modulo)],
    );
    await sql(
      `INSERT INTO public.permissoes_modulos (profissional_id, clinica_id, modulo, pode_acessar) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [ids.dani.prof, cB.id, modulo, ['agenda', 'ficha_paciente', 'controle_protese', 'inteligencia', 'orcamentos', 'conversas'].includes(modulo)],
    );
  }

  const nomesA = ['Marina Souza Alves', 'Pedro Henrique Costa', 'Luiza Fernandes', 'Rafael Monteiro', 'Camila Duarte Reis', 'João Vitor Mendes', 'Helena Barros', 'Otávio Pires'];
  const nomesB = ['Sofia Carvalho', 'Bruno Teixeira', 'Isabela Moraes', 'Thiago Antunes', 'Laura Pacheco'];
  const pacientes = { a: [], b: [] };
  const paciente = async (nome, c, i) => um(
    `INSERT INTO public.pacientes (nome, telefone, email, clinica_id, data_nascimento, cpf, cidade, uf)
     VALUES ($1, $2, $3, $4, $5, $6, 'São Paulo', 'SP') RETURNING id`,
    [nome, `(11) 9${String(8000 + i).padStart(4, '0')}-${String(1000 + i * 37).slice(0, 4)}`, `${nome.split(' ')[0].toLowerCase()}${i}@paciente.test`, c.id,
      `19${70 + (i * 3) % 30}-0${1 + (i % 9)}-1${i % 9}`, `000.000.00${i}-0${i % 10}`],
  );
  for (let i = 0; i < nomesA.length; i += 1) pacientes.a.push(await paciente(nomesA[i], cA, i));
  for (let i = 0; i < nomesB.length; i += 1) pacientes.b.push(await paciente(nomesB[i], cB, i + 20));

  const procedimentos = ['Avaliação', 'Limpeza', 'Restauração', 'Canal', 'Clareamento', 'Manutenção de aparelho', 'Extração', 'Prótese — prova'];
  const agendar = (c, pac, prof, dias, hora, min, proc, status, valor) => sql(
    `INSERT INTO public.agendamentos (paciente_id, clinica_id, profissional_id, data_hora, duracao_minutos, procedimento, status, valor, valor_final, cor)
     VALUES ($1, $2, $3, $4, 40, $5, $6, $7, $7, 'blue')`,
    [pac.id, c.id, prof, diaHora(dias, hora, min), proc, status, valor],
  );
  let k = 0;
  for (const dias of [-2, -1, 0, 0, 0, 0, 1, 1, 1, 2, 3, 5]) {
    const pac = pacientes.a[k % pacientes.a.length];
    const status = dias < 0 ? 'concluido' : 'agendado';
    await agendar(cA, pac, ids.ana.prof, dias, 8 + (k % 9), (k % 2) * 30, procedimentos[k % procedimentos.length], status, 120 + k * 35);
    k += 1;
  }
  for (const dias of [-1, 0, 0, 1, 1, 2]) {
    const pac = pacientes.b[k % pacientes.b.length];
    await agendar(cB, pac, ids.caio.prof, dias, 9 + (k % 7), 0, procedimentos[k % procedimentos.length], dias < 0 ? 'concluido' : 'agendado', 150 + k * 20);
    k += 1;
  }

  // Catálogo mínimo, tarefas, despesas e quadro de próteses na clínica A.
  const planoA = await um(`INSERT INTO public.planos (clinica_id, nome, tipo, ativo) VALUES ($1, 'Particular', 'particular', true) RETURNING id`, [cA.id]);
  await sql(`INSERT INTO public.planos (clinica_id, nome, tipo, ativo) VALUES ($1, 'Particular', 'particular', true)`, [cB.id]);
  await sql(`INSERT INTO public.planos (clinica_id, nome, tipo, ativo) VALUES ($1, 'Convênio Sorrir', 'convenio', true)`, [cA.id]);
  const esp = await um(`INSERT INTO public.especialidades (clinica_id, nome, ativo) VALUES ($1, 'Clínica geral', true) RETURNING id`, [cA.id]);
  const catalogo = {};
  for (const [nome, valor, avaliacao] of [['Avaliação', 0, true], ['Limpeza', 180, false], ['Restauração em resina', 260, false], ['Clareamento', 900, false], ['Tratamento de canal', 1200, false]]) {
    catalogo[nome] = await um(
      `INSERT INTO public.tratamentos_base (clinica_id, especialidade_id, nome, valor_sugerido, ativo, avaliacao) VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
      [cA.id, esp.id, nome, valor, avaliacao],
    );
  }
  await sql(`UPDATE public.pacientes SET plano_id = $1 WHERE clinica_id = $2`, [planoA.id, cA.id]);

  for (const [titulo, prio, dias] of [['Confirmar consultas de amanhã', 'alta', 0], ['Ligar para o laboratório', 'media', 1], ['Repor luvas e máscaras', 'baixa', 4]]) {
    await sql(
      `INSERT INTO public.tarefas (clinica_id, titulo, prioridade, status, data_limite, responsavel_id) VALUES ($1, $2, $3, 'a_fazer', (now() + ($4 || ' days')::interval)::date, $5)`,
      [cA.id, titulo, prio, String(dias), ids.bia.prof],
    );
  }
  for (const [desc, valor, tipo] of [['Aluguel', 3500, 'saida'], ['Material de consumo', 820.5, 'saida'], ['Laboratório de prótese', 1450, 'saida']]) {
    await sql(`INSERT INTO public.despesas (clinica_id, descricao, valor, data, categoria, tipo, status) VALUES ($1, $2, $3, current_date, 'Operacional', $4, 'pago')`, [cA.id, desc, valor, tipo]);
  }
  const colunas = [];
  for (const [i, titulo] of ['Solicitado', 'No Laboratório', 'Em Prova Clínica', 'Aguardando Ajuste', 'Finalizado / Entregue'].entries()) {
    colunas.push(await um(`INSERT INTO public.kanban_colunas (clinica_id, titulo, ordem) VALUES ($1, $2, $3) RETURNING id`, [String(cA.id), titulo, i]));
  }
  for (const [i, pac] of pacientes.a.slice(0, 4).entries()) {
    await sql(
      `INSERT INTO public.kanban_cartoes (coluna_id, clinica_id, paciente_nome, paciente_id, descricao, tipo_protese, status, data_entrega)
       VALUES ($1, $2, $3, $4, 'Prótese em andamento', 'Coroa sobre dente', 'espera', current_date + $5::int)`,
      [colunas[i % colunas.length].id, String(cA.id), nomesA[i], pac.id, i + 2],
    );
  }
  await sql(
    `INSERT INTO public.paciente_debitos (paciente_id, clinica_id, descricao, valor, status) VALUES ($1, $2, 'Restauração em resina', 260, 'pendente')`,
    [pacientes.a[0].id, cA.id],
  );
  await sql(
    `INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo, lida) VALUES ($1, 'Bem-vinda ao Ortus', 'Seu acesso está ativo.', 'mensagem', false)`,
    [ids.ana.user],
  );

  await semearOrcamentos({ sql, um, cA, cB, ids, pacientes, catalogo, paciente, agendar });

  // Google Agenda: a integração vem ligada com o cliente de teste ("teste-…"),
  // que só fala com o Google falso do ambiente. Credenciais reais coladas em
  // Painel SaaS → Integrações trocam para o Google de verdade.
  await sql(`INSERT INTO public.plataforma_integracoes (chave, ativo, config) VALUES ('google', true, '{"client_id":"teste-ortus"}'::jsonb) ON CONFLICT (chave) DO NOTHING`);
}

// Orçamentos e funil comercial (pedido de 19/11/2026): um orçamento em cada
// status e um exemplo de cada oportunidade, para a demonstração já abrir cheia.
async function semearOrcamentos({ sql, um, cA, cB, ids, pacientes, catalogo, paciente, agendar }) {
  const [marina, pedro, luiza, rafael, camila, , helena, otavio] = pacientes.a;
  const orcamento = async ({ pac, c = cA, status, dias, itens, desconto = 0, validadeDias = 30, comercial = ids.bia.prof, prof = ids.ana.prof, extra = {} }) => {
    const total = itens.reduce((s, [, qtd, valor]) => s + qtd * valor, 0) - desconto;
    const o = await um(
      `INSERT INTO public.orcamentos (clinica_id, paciente_id, profissional_id, comercial_id, status, validade, valor_total, desconto,
         status_desde, created_at, enviado_em, aprovado_em, recusado_em, motivo_recusa, proximo_contato, ultimo_contato_em, criado_por)
       VALUES ($1, $2, $3, $4, $5, (now() + ($6 || ' days')::interval)::date, $7, $8,
         now() - ($9 || ' days')::interval, now() - ($9 || ' days')::interval,
         $10::timestamptz, $11::timestamptz, $12::timestamptz, $13, $14::date, $15::timestamptz, $3)
       RETURNING id`,
      [c.id, pac.id, prof, comercial, status, String(validadeDias - dias), total, desconto, String(dias),
        extra.enviado_em ?? null, extra.aprovado_em ?? null, extra.recusado_em ?? null, extra.motivo_recusa ?? null,
        extra.proximo_contato ?? null, extra.ultimo_contato_em ?? null],
    );
    const criados = [];
    for (const [i, [nome, qtd, valor]] of itens.entries()) {
      criados.push(await um(
        `INSERT INTO public.orcamento_itens (clinica_id, orcamento_id, tratamento_base_id, procedimento, quantidade, valor_unitario, valor_total, ordem)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [c.id, o.id, c === cA ? catalogo[nome]?.id ?? null : null, nome, qtd, valor, qtd * valor, i],
      ));
    }
    return { ...o, itens: criados, total };
  };
  const diasAtras = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
  const hoje = new Date().toISOString().slice(0, 10);

  // Em aberto (apresentado ontem): Marina fez avaliação e já tem orçamento.
  await orcamento({ pac: marina, status: 'em_aberto', dias: 1, itens: [['Restauração em resina', 2, 260], ['Limpeza', 1, 180]] });
  // Enviado há 9 dias sem contato: aparece em "Orçamento parado".
  await orcamento({ pac: pedro, status: 'enviado', dias: 9, itens: [['Clareamento', 1, 900]], extra: { enviado_em: diasAtras(9) } });
  // Enviado, com contato combinado para hoje: "ligar hoje".
  const orcLuiza = await orcamento({
    pac: luiza, status: 'enviado', dias: 4, desconto: 60, itens: [['Tratamento de canal', 1, 1200], ['Restauração em resina', 1, 260]],
    extra: { enviado_em: diasAtras(4), proximo_contato: hoje, ultimo_contato_em: diasAtras(2) },
  });
  await sql(
    `INSERT INTO public.orcamento_contatos (clinica_id, paciente_id, orcamento_id, motivo, canal, resumo, proximo_contato, feito_por, created_at)
     VALUES ($1, $2, $3, 'orcamento', 'whatsapp', 'Vai conversar com a família e responde até hoje.', current_date, $4, now() - interval '2 days')`,
    [cA.id, luiza.id, orcLuiza.id, ids.bia.prof],
  );
  // Aprovado há 2 dias: já virou tratamento planejado e valor a receber.
  const orcRafael = await orcamento({ pac: rafael, status: 'aprovado', dias: 6, itens: [['Limpeza', 1, 180], ['Restauração em resina', 1, 260]], extra: { enviado_em: diasAtras(6), aprovado_em: diasAtras(2) } });
  for (const [i, item] of orcRafael.itens.entries()) {
    const [nome, , valor] = [['Limpeza', 1, 180], ['Restauração em resina', 1, 260]][i];
    const trat = await um(
      `INSERT INTO public.paciente_tratamentos (paciente_id, clinica_id, legacy_id, procedimento, valor, status, data, observacoes, orcamento_id, profissional_id)
       VALUES ($1, $2, $3, $4, $5, 'planejado', current_date - 2, 'Do orçamento aprovado.', $6, $7) RETURNING id`,
      [rafael.id, cA.id, `seed-orc-${i}`, nome, valor, orcRafael.id, ids.ana.prof],
    );
    await sql(`UPDATE public.orcamento_itens SET tratamento_id = $1 WHERE id = $2`, [trat.id, item.id]);
  }
  await sql(
    `INSERT INTO public.paciente_debitos (paciente_id, clinica_id, descricao, valor, status, orcamento_id, created_at)
     VALUES ($1, $2, 'Orçamento aprovado (2 itens)', $3, 'pendente', $4, now() - interval '2 days')`,
    [rafael.id, cA.id, orcRafael.total, orcRafael.id],
  );
  // Recusado, com motivo.
  await orcamento({ pac: helena, status: 'recusado', dias: 12, itens: [['Clareamento', 1, 900]], extra: { enviado_em: diasAtras(12), recusado_em: diasAtras(10), motivo_recusa: 'Achou caro neste momento' } });
  // Rascunho de hoje.
  await orcamento({ pac: otavio, status: 'rascunho', dias: 0, itens: [['Tratamento de canal', 1, 1200]] });
  // Vencido: enviado há 40 dias, validade de 30.
  await orcamento({ pac: camila, status: 'enviado', dias: 40, itens: [['Limpeza', 1, 180]], extra: { enviado_em: diasAtras(40) } });
  // Outra clínica (Bem Estar): não aparece para a Mais Sorriso.
  await orcamento({ pac: pacientes.b[0], c: cB, status: 'enviado', dias: 3, prof: ids.caio.prof, comercial: null, itens: [['Avaliação', 1, 150]], extra: { enviado_em: diasAtras(3) } });

  // Meta de vendas do mês corrente: total da clínica e a da Ana.
  await sql(`INSERT INTO public.metas_vendas (clinica_id, mes, profissional_id, valor) VALUES ($1, date_trunc('month', current_date)::date, NULL, 10000)`, [cA.id]);
  await sql(`INSERT INTO public.metas_vendas (clinica_id, mes, profissional_id, valor) VALUES ($1, date_trunc('month', current_date)::date, $2, 6000)`, [cA.id, ids.ana.prof]);

  // Oportunidades: quem faltou, quem cancelou e quem fez avaliação sem orçamento.
  const renata = await paciente('Renata Lopes', cA, 40);
  const gustavo = await paciente('Gustavo Rezende', cA, 41);
  const patricia = await paciente('Patrícia Gomes', cA, 42);
  await agendar(cA, renata, ids.ana.prof, -6, 10, 0, 'Limpeza', 'faltou', 180);
  await agendar(cA, gustavo, ids.ana.prof, -10, 15, 30, 'Restauração em resina', 'cancelado', 260);
  await agendar(cA, patricia, ids.ana.prof, -12, 9, 0, 'Avaliação', 'concluido', 0);
}
