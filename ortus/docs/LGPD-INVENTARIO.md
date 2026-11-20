# Ortus — inventário de adequação à LGPD (Lei 13.709/2018)

**Isto é um levantamento técnico, não um parecer jurídico.** Ele mostra o que o
código do Ortus faz hoje com dado pessoal e o que precisaria mudar. As bases
legais, os prazos e a leitura dos artigos são hipóteses de trabalho: precisam
de revisão de advogado e do encarregado antes de virar texto público, contrato
ou decisão. Nenhum código foi alterado para produzir este documento.

**Retrato.** Código lido em 18/11/2026, entre 01:30 e 02:10, na árvore de
trabalho — não no último commit: havia cerca de 145 arquivos alterados e
ainda não commitados, e outra frente de trabalho seguia mexendo no código
durante a leitura (e-mail, lembretes, rotinas agendadas, cobrança). Onde isso
importa, o item diz **em construção**. As linhas citadas valem para esse
momento, e parte do que aparece aqui como existente ainda não estava
commitada — por exemplo a limpeza do logout (`lib/sessao.ts`), o registro de
falhas (`lib/registro.ts`) e a migration `20261121_seguranca_reforco.sql`.
Nada foi executado nem verificado no banco de produção.
Migration no repositório não prova que foi aplicada, e as tabelas-base
(`pacientes`, `agendamentos`, `profissionais`, `clinicas`…) foram criadas pelo
painel do Supabase, fora das migrations — as colunas citadas vêm do espelho em
`desktop/lib/esquema.cjs`.

**Como ler.** Cada ponto traz **Lei** (o que se pede, em uma frase), **Hoje**
(o estado — existe, parcial ou ausente — com a evidência em `arquivo:linha` ou
`tabela.coluna`) e **Mudar** (o que precisaria ser feito). O esforço é
estimativa de desenvolvimento: pequeno = até uns dois dias ou só texto;
médio = de alguns dias a duas semanas; grande = mais que isso, ou depende de
decisão ou contrato de fora. Uma referência como `:120` depois de um arquivo
já citado é outra linha do mesmo arquivo. Onde a lei é citada com "conferir",
é porque o número ou o prazo não foi confirmado neste levantamento.

---

## Resumo

| Estado | Pontos |
|---|---|
| Existe | 7 |
| Parcial | 49 |
| Ausente | 25 |
| Não dá para ver no código | 1 |

São 82 pontos em 18 temas. O que existe é a base de segurança: isolamento
entre clínicas no banco, arquivos clínicos privados, APIs autenticadas. O que
está pela metade ou falta é o que a LGPD pede além disso: provar
consentimento, atender o titular, apagar de verdade, registrar quem acessou e
dizer nos textos públicos só o que o sistema faz.

**Os cinco mais urgentes**

1. **Os textos públicos prometem o que o sistema não faz** (5.3, 5.4, 3.2,
   11.1). Política e Termos falam em backup duas vezes ao dia, exclusão em 90
   dias, exportação completa do prontuário, logs com IP, autenticação em dois
   fatores e relatório de impacto — nada disso está no código. Dizem que os
   servidores ficam nos EUA, e os docs do repositório apontam para São Paulo.
   A lista de fornecedores deixa de fora Cloudflare R2, Resend, Twilio e
   WhatsApp. É barato de corrigir e é o que um cliente ou a ANPD leem
   primeiro.
2. **Não existe caminho para apagar** (6.3, 6.5, 6.6, 7.2, 7.3). Nenhuma tela
   apaga paciente; as funções de exportar e excluir a conta do profissional
   existem sem botão e, se tivessem, só marcariam uma coluna que ninguém lê;
   não há como a clínica levar tudo e encerrar a conta. O único "restaurar"
   da tela é o restore global do item 3.
3. **O backup interno e a restauração** (15.1 a 15.3). Cada backup é uma
   fotografia de todas as clínicas juntas dentro do mesmo banco. Restaurar,
   pela leitura do SQL, apaga e regrava todas as clínicas, perde os vínculos
   de equipe e o prontuário relacional e traz de volta quem foi apagado. O
   backup não tem prazo em dias e não é agendado.
4. **O aplicativo desktop deixa tudo em claro no computador da clínica**
   (13.1 a 13.5). Banco, fotos, documentos, tokens de sessão e a sessão do
   WhatsApp ficam sem criptografia e continuam lá depois de sair e de
   desinstalar; localmente não há controle de quem lê o quê.
5. **Quem lê o prontuário e como isso fica registrado** (2.1, 2.2, 9.1,
   16.6). A permissão por módulo vale só na tela — qualquer pessoa com
   vínculo lê todo o prontuário pela API; não há como remover alguém da
   equipe pela tela; o suporte do Ortus enxerga todas as clínicas; e a trilha
   de acesso é gravada pelo navegador, incompleta, e no desktop nem sai da
   máquina.

Logo atrás: nenhum procedimento de incidente (10.1); nenhum registro de
consentimento nem opção de não receber mensagem (4.2, 4.3); anamnese pública
sem identificar a clínica (4.5); consentimento do responsável por menor
(14.2); página de pagamento simulada que pede cartão (18.5).

---

## 1. Bases legais e finalidade de cada dado

### 1.1 Mapa de dados, finalidades e bases legais — **parcial** · esforço médio

- **Lei:** todo tratamento precisa de finalidade específica e de uma base
  legal (art. 7º; dado sensível, só nas hipóteses do art. 11), e o titular tem
  direito de saber quais são (art. 9º).
- **Hoje:** a Política lista categorias de dado e cinco bases de forma
  genérica (`app/privacidade/page.tsx:28-42`), sem dizer qual base vale para
  qual dado. Nada no repositório liga campo → finalidade → base. As tabelas
  abaixo são a primeira versão desse mapa, montadas a partir do código. Vale
  lembrar: para dado de saúde não servem "execução de contrato" nem "legítimo
  interesse" (não estão no art. 11).
- **Mudar:** validar as tabelas com advogado; publicar a versão resumida na
  Política; guardar a versão completa como registro de operações (9.4).

**Paciente** — controladora: a clínica; Ortus: operador.

| Dado | Onde fica | Finalidade | Base legal provável |
|---|---|---|---|
| Nome, CPF, nascimento, sexo | `pacientes.nome`, `.cpf`, `.data_nascimento`, `.sexo` | identificar o paciente; prontuário; receita, atestado, contrato | art. 7º, V (atendimento contratado) e II (dever de manter prontuário); dentro do prontuário, art. 11, II, "a" e "f" |
| Telefone, e-mail | `pacientes.telefone`, `.email` | contato; confirmação e lembrete de consulta | art. 7º, V; mensagem que não é do atendimento (aniversário, "volte"): consentimento (art. 7º, I) ou legítimo interesse com saída fácil (art. 7º, IX) — decidir com advogado |
| Endereço | `pacientes.cep`, `.rua`, `.numero`, `.complemento`, `.bairro`, `.cidade`, `.uf`, `.endereco` | cadastro e documentos | art. 7º, V ou II — rever a necessidade (hoje é obrigatório, 1.2) |
| Convênio | `pacientes.plano_id` → `planos` | preço e faturamento | art. 7º, V |
| Responsável pelo menor | `pacientes.responsavel_nome`, `.responsavel_parentesco`, `.responsavel_telefone` | representar o menor | art. 14; art. 7º, V |
| Foto de perfil | `pacientes.foto_url` + arquivo `pacientes/<id>/avatar.jpg` | reconhecer o paciente na tela | não é necessária ao atendimento: consentimento ou legítimo interesse — decidir (hoje abre por URL sem login, 2.4) |
| Anamnese | `paciente_anamneses.respostas`, `.perguntas_snapshot` | histórico de saúde para o atendimento | art. 11, II, "f" (tutela da saúde) e "a" (obrigação de prontuário) |
| Odontograma e texto livre | `pacientes.ficha_medica` (JSON: `odontograma`, `texto_livre`) | registro clínico | idem |
| HOF: marcações, produtos, doses | `pacientes.ficha_medica` (`marcacoes_hof`) | registro clínico da harmonização | idem |
| HOF: fotos do rosto | `pacientes.ficha_medica` (`hof_fotos`) + arquivos `pacientes/<id>/hof/*.jpg` | documentação clínica (antes e depois) | art. 11, II, "f" para documentar; divulgação ou uso científico: consentimento específico (art. 11, I) |
| Tratamentos | `paciente_tratamentos` | plano e histórico | art. 11, II, "f" e "a" |
| Evoluções | `paciente_evolucoes.texto`, `.profissional_nome` | evolução clínica | idem |
| Documentos e exames | `paciente_documentos` (+ `meta`) e arquivos `pacientes/<id>/documentos/*` | prontuário e documentos emitidos | idem; contrato: art. 7º, V |
| Agenda | `agendamentos` (procedimento, observações, status, valores) | marcar e registrar atendimento | art. 7º, V; o conteúdo clínico, art. 11, II, "f" |
| Débitos e recebimentos | `paciente_debitos`, `agendamentos.valor*`, `.data_pagamento`, `despesas.paciente_id`, `comissoes_lancamentos.paciente_id` | cobrança e financeiro da clínica | art. 7º, V; II (fiscal); VI, se houver cobrança em juízo |
| Pedido de prótese | `kanban_cartoes` (`paciente_nome`, descrição, cor do dente) | laboratório | art. 7º, V; art. 11, II, "f" |
| Tarefas ligadas ao paciente | `tarefas.paciente_id`, `.descricao` | rotina da clínica | art. 7º, V ou IX |
| Mensagens enviadas | `whatsapp_agendadas`, `whatsapp_envios` (nome, telefone, texto), `lembretes_agenda` | lembrete, confirmação, pós-consulta, aniversário, retorno | lembrete e confirmação: art. 7º, V; o resto, ver telefone |
| Conversas de WhatsApp | `whatsapp_mensagens` (texto, nome e telefone do contato) — só com o aplicativo desktop | histórico do atendimento por mensagem | depende do conteúdo; o paciente pode escrever dado de saúde; precisa de aviso — decidir com advogado (18.3) |
| Link de anamnese | `anamnese_links` (hash do token, validade, uso) | coletar a anamnese direto do paciente | acessório da anamnese |

**Profissional (usuário)** — a clínica é controladora dos dados do seu
funcionário; para conta de acesso, suporte e registros de uso, o Ortus é
controlador.

| Dado | Onde fica | Finalidade | Base legal provável |
|---|---|---|---|
| E-mail de login e senha | Supabase Auth (`auth.users`: e-mail, hash da senha, `user_metadata` com nome e cargo) | autenticar | art. 7º, V |
| Nome, cargo, nível, foto | `profissionais.nome`, `.cargo`, `.nivel_acesso`, `.is_super_admin`, `.foto_url` (arquivo `avatares/<user_id>/avatar.jpg`) | identificar na equipe; permissões; assinar evoluções | art. 7º, V |
| Conselho e CRO | `profissionais.cro`, `.conselho`, `.numero_conselho`, `.uf_conselho`, `.especialidade`, `.bio` | identificação profissional em documentos | art. 7º, V; II se o conselho exigir — conferir |
| CPF, telefone, e-mail de contato, sexo, endereço | `profissionais.cpf`, `.telefone`, `.email`, `.usuario_email`, `.sexo`, `.endereco`, `.cep`, `.cidade`, `.estado`, `.uf` | nenhuma tela atual grava; só `telefone` é lido | sem finalidade clara: candidato a eliminar (art. 6º, III) |
| Vínculos e permissões | `profissionais_clinicas` (+ `convidado`), `permissoes_modulos` | controle de acesso | art. 7º, V |
| Horários | `profissionais_horarios`, `profissionais.cor_agenda` | montar a agenda | art. 7º, V |
| Comissões | `comissoes_regras`, `comissoes_lancamentos` | remuneração | art. 7º, V |
| Convites | `convites_equipe` (e-mail, nome, cargo, mensagem) | entrar em outra clínica | art. 7º, V ou IX |
| Notificações | `notificacoes` | avisos do sistema | art. 7º, V |
| Registros de uso | `audit_log`, `sync_exclusoes.usuario_id`, `armazenamento_envios.usuario_id`, logs do Supabase Auth | segurança e prestação de contas | art. 7º, II e IX; o Marco Civil da Internet pede guarda de registros de acesso — conferir |
| Sessão no aparelho | navegador (item 12); desktop (`sessao.json`, item 13) | manter o login | art. 7º, V |

**Clínica (pessoa jurídica) e seu responsável** — controlador: Ortus.

| Dado | Onde fica | Finalidade | Base legal provável |
|---|---|---|---|
| Nome, CNPJ, endereço, telefone, e-mail, logo | `clinicas` (`nome`, `cnpj`, `cep`…`uf`, `telefone`, `email`, `logo_url`) | cadastro do cliente; cabeçalho de documentos | dado de empresa não é dado pessoal; e-mail e telefone podem ser de pessoa física: art. 7º, V |
| Responsável | `clinicas.responsavel_nome` | responsável técnico ou legal | art. 7º, V ou II |
| Contato e dados comerciais da rede | `redes.cnpj`, `.contato_nome`, `.contato_email`, `.contato_telefone`, `.plano`, `.valor_mensal_centavos`, `.observacao` | relação comercial e cobrança | art. 7º, V; II (fiscal) |
| Faturas | `faturas` | cobrança da assinatura | art. 7º, V e II; X se houver negativação — conferir |
| Pagamento | provedor de pagamento (ainda não está no código) | receber | art. 7º, V |
| Configurações | `configuracoes_clinica` (modelos de documento e de mensagem, taxas, automações) | operar o sistema | não é dado pessoal, salvo o que a clínica escrever nos modelos |
| Uso de armazenamento | `armazenamento_objetos`, `armazenamento_envios` | cota e limite de envio | art. 7º, V ou IX |

### 1.2 Minimização: campos obrigatórios e colunas sem uso — **parcial** · esforço pequeno

- **Lei:** tratar só o necessário para a finalidade (art. 6º, III).
- **Hoje:** o cadastro exige sexo e endereço completo de todo paciente
  (`lib/pacienteValidation.ts:33-43`), enquanto a Política diz que campos
  opcionais são identificados (`app/privacidade/page.tsx:66`). `profissionais`
  tem CPF, sexo e endereço (`desktop/lib/esquema.cjs:113-124`) que nenhuma
  tela atual grava nem usa — o cadastro antigo saiu como código morto
  (`docs/RELATORIO-LANCAMENTO.md:55`). Documentos antigos podem estar dentro
  do banco como `dataUrl`
  (`supabase/migrations/20260730_ficha_relacional.sql:135-139`). Tabelas
  legadas (`anamneses`, `anexos`, `prontuarios`, `audit_logs`) seguem no banco
  sem uso (`docs/RELATORIO-LANCAMENTO.md:94-97`).
- **Mudar:** decidir o que é obrigatório de fato; contar linhas e apagar
  colunas e tabelas sem uso; migrar `dataUrl` para arquivo.

---

## 2. Dados sensíveis de saúde

**Onde ficam.** No banco: as tabelas clínicas do item 1. Em arquivo: Cloudflare
R2 (`ortus-privado` e `ortus-publico`, `lib/r2.ts:16-22`) ou, sem R2, Supabase
Storage (`arquivos_ortus`, `avatars`). Em cópia: no navegador (12.3), no
computador da clínica (item 13), nos backups (item 15), nos arquivos
exportados (6.1, 18.6) e no papel impresso. O isolamento entre clínicas está
no 16.1.

### 2.1 Quem lê dentro da clínica (permissão por módulo) — **parcial** · esforço médio

- **Lei:** acesso só de quem precisa (art. 6º, III) como medida de segurança
  (art. 46).
- **Hoje:** a permissão por módulo (`permissoes_modulos`) vale só na tela. O
  `proxy.ts` decide pela lista do cookie `ortus_modules`, que o próprio
  navegador grava (`lib/authCookies.ts:8-11`, `37-40`). No banco, qualquer
  pessoa com vínculo lê e altera todo o prontuário da clínica: a regra das
  tabelas clínicas é só `user_has_clinic_access`
  (`supabase/migrations/20261114_seguranca_total.sql:215-222`, `374-409`).
  Uma recepcionista sem o módulo "Ficha do Paciente" não vê a tela, mas a API
  responde. Só excluir paciente é reservado ao administrador (`:223-224`).
- **Mudar:** levar a permissão de módulo para as policies (função do tipo
  `user_tem_modulo(clinica, modulo)` nas tabelas clínicas e financeiras) e
  cobrir na suíte `scripts/testar-rls.mjs`; decidir com a clínica quais
  papéis leem anamnese, evolução e documento.

### 2.2 Acesso do suporte do Ortus (super-admin) — **parcial** · esforço médio

- **Lei:** o operador trata o dado conforme a instrução do controlador
  (art. 39) e com acesso mínimo (art. 46).
- **Hoje:** `is_super_admin` passa em toda checagem de clínica
  (`supabase/migrations/20261114_seguranca_total.sql:43-56`). Os donos da
  plataforma leem e alteram o prontuário de qualquer clínica pela tela comum
  (`app/context/ClinicaContext.tsx:119-125`), sem pedido da clínica, sem
  prazo e sem registro obrigatório (a trilha depende da tela, 9.1). No
  desktop, o login de um super-admin baixaria todas as clínicas para o
  computador (13.2). As mudanças feitas pelo painel SaaS são auditadas (9.2).
- **Mudar:** separar "administrar a plataforma" de "ler prontuário": acesso
  de suporte por clínica, com pedido ou aceite do administrador da clínica,
  prazo e registro no banco; prever isso no contrato de operador (3.2).

### 2.3 Documentos e fotos de HOF — **existe** · esforço pequeno (ajuste)

- **Lei:** art. 46.
- **Hoje:** ficam em bucket privado e só saem pelo Ortus depois de conferir
  login e vínculo com a clínica do paciente
  (`lib/armazenamentoServidor.ts:28-42`, `74-80`, `390-396`;
  `app/api/armazenamento/arquivo/route.ts:13-27`). Documento e foto de HOF
  estão fora da lista de caminhos públicos (`lib/caminhosArquivo.ts:28-35`).
  O envio confere tipo, tamanho e os primeiros bytes
  (`lib/assinaturaArquivo.ts`) e a resposta sai com `no-store`.
- **Mudar:** o nome original do arquivo vai no caminho
  (`app/pacientes/[id]/page.tsx:2034`) — trocar por um id. O limite por
  módulo é o do 2.1; no desktop vale o item 13.

### 2.4 Foto de perfil do paciente aberta por URL — **feito em 18/11/2026** · falta só operação

- **Lei:** art. 46; a foto do rosto identifica a pessoa.
- **Hoje:** a foto do paciente fica no bucket privado e só abre por
  `/api/armazenamento/arquivo` (login + vínculo com a clínica), com
  `Cache-Control: no-store`; a ficha mostra como objectURL
  (`hooks/useFotoPaciente.ts`). A rota pública responde 404 para foto de
  paciente. A foto do profissional continua pública (decisão do pedido). A
  foto é recomprimida sem EXIF (`lib/prepararFotoPaciente.ts`).
- **Falta:** em produção, rodar `node scripts/mover-fotos-pacientes.mjs` e
  depois `--aplicar` para tirar as fotos antigas do bucket público.

---

## 3. Papéis: controlador e operador

### 3.1 Papéis declarados — **parcial** · esforço pequeno (texto)

- **Lei:** saber quem é controlador e quem é operador define quem responde
  pelo quê (art. 5º, VI e VII; art. 39).
- **Hoje:** a Política diz que a clínica é controladora e o Ortus, operador
  (`app/privacidade/page.tsx:18-24`). Não diz que, para conta de usuário,
  cobrança, suporte e registros de uso, o Ortus (Recode Systems) é
  controlador; não trata o profissional (a clínica também é controladora dos
  dados do funcionário); não trata duas clínicas acessando o mesmo prontuário
  (17.1).
- **Mudar:** reescrever a seção de papéis com as três situações e refletir no
  contrato.

### 3.2 Contrato de operador com a clínica (DPA) — **parcial** · esforço médio (jurídico)

- **Lei:** o operador trata segundo as instruções do controlador (art. 39);
  é o contrato que registra essas instruções.
- **Hoje:** existe como cláusula 11 dos Termos (`app/termos/page.tsx:82-90`),
  aceita "ao utilizar". A lista de suboperadores está incompleta (11.1); não
  descreve instruções, prazo operacional de aviso de incidente, auditoria,
  acesso de suporte (2.2), o desktop, nem devolução e eliminação com passos
  reais — o código não elimina (7.3). O aceite não fica registrado (4.1).
- **Mudar:** DPA como documento próprio, com versão e aceite registrado do
  administrador da clínica; lista de suboperadores com aviso de mudança;
  alinhar cada promessa com o que o sistema faz.

### 3.3 Uso próprio de dado de paciente pelo Ortus — **existe** · sem esforço

- **Lei:** o operador não usa o dado para finalidade própria (art. 39).
- **Hoje:** não há analytics, pixel, telemetria nem envio de dado de paciente
  a terceiro fora dos serviços do item 11 (busca por `gtag`, `analytics`,
  `sentry`, `posthog` e similares só encontra o texto do banner de cookies).
  O registro de erros do servidor troca e-mail, CPF, telefone e ids por
  marcadores (`lib/registro.ts:18-39`); a telemetria do Next é desligada no
  desktop (`desktop/lib/nextServer.cjs:69`).
- **Mudar:** manter e dizer isso no DPA.

---

## 4. Consentimento e registro

### 4.1 Aceite dos Termos e da Política pelo usuário — **parcial** · esforço pequeno

- **Lei:** quem alega aceite ou consentimento precisa conseguir provar
  (art. 8º, §2º).
- **Hoje:** `/primeiro-acesso` exige marcar "Eu li e concordo"
  (`app/primeiro-acesso/page.tsx:60`, `160-172`), mas nada é gravado: só
  `precisa_trocar_senha = false` (`:70-72`). Sem data, versão ou autor.
  Quem já existia em 14/05 nunca passou pela tela
  (`supabase/migrations/20260514_equipe_onboarding.sql:13`). `/login`,
  `/cadastro` e `/checkout` não mostram os textos.
- **Mudar:** tabela de aceites (usuário, documento, versão, data); pedir de
  novo quando a versão mudar; link no login.

### 4.2 Registro de consentimento do paciente — **ausente** · esforço médio

- **Lei:** quando a base é consentimento, ele tem de ser específico e
  destacado para dado sensível (art. 11, I), demonstrável (art. 8º, §2º) e
  revogável (art. 8º, §5º).
- **Hoje:** não existe tabela nem coluna de consentimento. Os estados
  `modalConsentimento` e `consentimentoAceito` da ficha nunca são usados
  (`app/pacientes/[id]/page.tsx:1658-1659`). O que existe é papel: o modelo
  "Termo de Consentimento Livre e Esclarecido"
  (`app/configuracoes/page.tsx:92`) e o termo de HOF impresso (4.4).
- **Mudar:** tabela `paciente_consentimentos` (paciente, finalidade, texto e
  versão, quem registrou, data, meio, revogado em) com tela na ficha e o
  termo assinado anexado.

### 4.3 Mensagens: WhatsApp, SMS e e-mail — **ausente** · esforço médio

- **Lei:** mensagem que não é do atendimento precisa de consentimento ou de
  legítimo interesse com saída fácil; o titular pode se opor e revogar
  (art. 18; art. 8º, §5º).
- **Hoje:** não há campo "não enviar" no paciente nem nas rotinas. O lembrete
  por e-mail e SMS vai para todo agendamento do dia seguinte que tenha contato
  (`lib/lembretesServidor.ts`, em construção). As automações de WhatsApp —
  confirmação, lembrete, pós-consulta, aniversário e "retorno" depois de N
  meses — vão para todo paciente com telefone
  (`services/whatsapp/server.mjs:1096-1221`). Nascem desligadas
  (`lib/whatsappAutomacoes.ts:14-43`) e a clínica liga sem nenhum aviso sobre
  consentimento. A mensagem não diz como sair. A Política joga o
  consentimento para a clínica (`app/privacidade/page.tsx:42`).
- **Mudar:** preferência por paciente e por canal (lembrete; relacionamento),
  respeitada em `lembretesServidor`, no serviço de WhatsApp e nos botões de
  contato; origem e data registradas (4.2); aviso ao ligar aniversário e
  retorno; texto de saída nessas mensagens.

### 4.4 Foto: perfil e imagens de HOF — **parcial** · esforço pequeno

- **Lei:** imagem do rosto pede base clara; uso fora do prontuário
  (divulgação, ciência) pede consentimento específico.
- **Hoje:** o termo de HOF impresso traz "Autorizo / Não autorizo o uso de
  fotografias" para marcar à mão (`app/pacientes/[id]/page.tsx:1746-1783`,
  linha `1777`); a resposta não entra no sistema. A foto de perfil é tirada
  sem pergunta e fica aberta por URL (2.4).
- **Mudar:** registrar a autorização de imagem como consentimento (4.2), com
  escopo (documentação ou divulgação); foto de perfil opcional e avisada.

### 4.5 Anamnese por link público — **parcial** · esforço pequeno

- **Lei:** na coleta, o titular tem de saber quem é o controlador, para quê e
  como exercer seus direitos (art. 9º).
- **Hoje:** a parte técnica é boa — token de 32 bytes guardado só como hash,
  72 horas, uso único (`lib/anamneseLinks.ts:3-9`;
  `app/api/anamnese/gerar-link/route.ts:7`, `36-45`;
  `app/api/public/anamnese/[token]/route.ts:96-105`). Mas a página mostra a
  marca do Ortus e o nome completo do paciente
  (`app/anamnese/[token]/page.tsx:103-105`), não diz qual clínica está
  perguntando, não tem aviso de privacidade nem contato, não confirma quem
  abriu e grava só `preenchido_por: 'paciente'`
  (`app/api/public/anamnese/[token]/route.ts:114`), sem data de aceite nem
  versão de aviso. Erro interno volta para o visitante (`:67`, `:121`,
  `:126`).
- **Mudar:** mostrar nome e contato da clínica e um aviso curto; confirmar um
  dado (data de nascimento, por exemplo) antes de mostrar o nome; gravar data
  e versão do aviso; mensagem de erro genérica. Para menor, ver 14.3.

---

## 5. Política de privacidade e Termos

### 5.1 Páginas publicadas — **existe** · esforço pequeno (ajuste)

- **Lei:** informação clara e acessível (art. 9º).
- **Hoje:** `/privacidade` e `/termos` abrem sem login
  (`lib/rotasPublicas.ts:8`), com link no rodapé da página inicial
  (`app/page.tsx:62-63`), no banner (`components/CookieBanner.tsx:139`) e no
  primeiro acesso.
- **Mudar:** link também no login e dentro do sistema — no desktop a página
  inicial nem aparece (`desktop/main.cjs:122-126`).

### 5.2 Quem responde, contato e versão — **parcial** · esforço pequeno

- **Lei:** identificar o controlador e dar um contato (art. 9º).
- **Hoje:** "Recode Systems Ltda." sem CNPJ nem endereço
  (`app/privacidade/page.tsx:16`; `app/termos/page.tsx:16`). Os contatos são
  de outro domínio — `privacidade@recodesystems.com`
  (`app/privacidade/page.tsx:111`) e `suporte@recodesystems.com`
  (`app/termos/page.tsx:123`) —, enquanto o site é `ortus.digital`
  (`docs/INSTALACAO.md:19`). A data é "Maio de 2026", sem dia nem versão
  (linha `11` dos dois arquivos). O encarregado não tem nome (8.1).
- **Mudar:** razão social, CNPJ, endereço, canal que funciona, data completa
  e número de versão.

### 5.3 A Política descreve o que o sistema faz? — **parcial** · esforço médio

- **Lei:** transparência sobre o tratamento real (art. 6º, VI; art. 9º).
- **Hoje:**
  - Prontuário: descrito (`app/privacidade/page.tsx:29-31`).
  - Arquivos: cita "documentos clínicos" e "fotografias faciais", não onde
    ficam (Cloudflare R2).
  - WhatsApp: aparece só como exemplo de consentimento (`:42`). Não diz que a
    clínica conecta o próprio WhatsApp, que há envio automático nem que as
    conversas são gravadas (18.3).
  - E-mail e SMS de lembrete (Resend, Twilio): não aparecem.
  - Aplicativo desktop, com cópia completa dos dados no computador da
    clínica: não aparece.
  - Link público de anamnese: não aparece.
  - Dados de conta e cobrança, em que o Ortus é controlador: não aparece.
  - Chamadas a ViaCEP, YouTube e Google Fonts (11.3): não aparecem.
- **Mudar:** reescrever a partir deste inventário.

### 5.4 Afirmações que o código não sustenta — **parcial** · esforço pequeno (texto, com advogado)

- **Lei:** informação verdadeira ao titular (art. 6º, VI).
- **Hoje:** na coluna "Onde", `privacidade:N` é `app/privacidade/page.tsx:N`
  e `termos:N` é `app/termos/page.tsx:N`.

| Afirmação | Onde | O que o código mostra |
|---|---|---|
| Servidores "nos Estados Unidos" | `privacidade:57` | os docs do repositório usam pooler `sa-east-1` (`supabase/README.md:8`); conferir no painel |
| "Cláusulas contratuais padrão firmadas com a AWS e Supabase" e país "com grau de proteção adequado" | `privacidade:60-61` | nenhum contrato no repositório; não afirmar adequação sem decisão que a sustente |
| Transferência amparada no "art. 33, III" | `privacidade:62` | o inciso citado não parece ser o de execução de contrato — conferir |
| Backup "ao menos 2 vezes por dia", "30 versões" | `privacidade:52`; `termos:37` | não é agendado; depende de um super-admin usar o sistema (15.1) |
| "logs de acesso (IP, horário, ações, user-agent)" | `privacidade:32` | IP e agente nunca são preenchidos (`lib/auditLog.ts:28-35`) |
| Portabilidade pelo "Exportar Prontuário (LGPD)" | `privacidade:77`; `termos:67` | exporta só parte do prontuário (6.1) |
| "ferramentas técnicas para que a clínica possa atender" os titulares | `privacidade:81` | não há como apagar paciente (6.3) |
| Após o cancelamento, 90 dias e exclusão definitiva | `privacidade:86`; `termos:66` | nenhuma rotina (7.3) |
| Aviso de incidente "em até 72 horas" | `privacidade:103`; `termos:39` | sem procedimento (10.1); conferir o prazo da ANPD |
| A empresa "mantém" relatório de impacto | `privacidade:116` | não está no repositório (9.5) |
| Fornecedores: "Supabase, Vercel"; "Stripe" | `privacidade:93`; `termos:88`, `95-97` | o código usa também R2, Resend, Twilio e WhatsApp; Stripe não existe (11.1) |
| "apenas cookies essenciais" | `privacidade:98` | o banner oferece "Analytics" (12.1) |
| "autenticação multi-fator quando disponível" | `termos:38` | não existe (16.3) |
| Prontuário por "20 anos (Resolução CFO 118/2012)" | `privacidade:40`, `87`; `termos:30` | conferir a fonte do prazo (7.1) |
| "TLS 1.3", "AES-256", "bcrypt", "99,5%" | `privacidade:48-51`; `termos:36` | dependem dos fornecedores; conferir antes de prometer |
| "Campos opcionais são claramente identificados" | `privacidade:66` | ver 1.2 |

- **Mudar:** cortar ou corrigir cada linha; só prometer o que existe.

### 5.5 Aviso de privacidade para o paciente — **ausente** · esforço pequeno

- **Lei:** quem informa o paciente é a clínica, no momento da coleta
  (art. 9º).
- **Hoje:** a Política do Ortus fala com a clínica. O sistema não oferece
  modelo de aviso para a recepção, para o link de anamnese, para o WhatsApp
  nem para os impressos, e `clinicas` não tem campo de contato de privacidade
  (8.2).
- **Mudar:** modelo de aviso da clínica, configurável, mostrado na anamnese
  pública e nos impressos.

### 5.6 Versão e histórico dos textos — **ausente** · esforço pequeno

- **Lei:** poder provar qual texto valia quando alguém aceitou — é prova do
  contrato e, onde houver consentimento, exigência do art. 8º, §2º.
- **Hoje:** texto fixo no código, sem número de versão nem histórico. Os dois
  textos prometem avisar mudança com 15 dias (`app/termos/page.tsx:115`;
  `app/privacidade/page.tsx:119`) e não há mecanismo para isso.
- **Mudar:** versão no texto, registro das versões, aviso no login e novo
  aceite (4.1).

---

## 6. Direitos do titular

### 6.1 Paciente: acesso e portabilidade — **parcial** · esforço médio

- **Lei:** art. 18 — confirmação, acesso e portabilidade, em prazo curto
  (art. 19; conferir os prazos).
- **Hoje:** o botão "LGPD" da ficha (`app/pacientes/[id]/page.tsx:2417`)
  baixa um JSON montado no navegador (`:1136-1168`) com identificação básica,
  anamneses, odontograma, tratamentos, marcações de HOF e a lista (sem os
  arquivos) dos documentos. Ficam de fora: evoluções, débitos e pagamentos,
  agendamentos, fotos de HOF, arquivos dos documentos, responsável, endereço
  detalhado, convênio, foto, mensagens enviadas e conversas. O ato fica na
  trilha (`:1166`).
- **Mudar:** exportação completa gerada no servidor (dados + arquivos, com
  versão legível para o paciente) e registrada; a mesma rotina serve ao 6.6.

### 6.2 Paciente: correção — **existe** · esforço pequeno (ajuste)

- **Lei:** art. 18 — corrigir dado incompleto, inexato ou desatualizado.
- **Hoje:** a ficha é editável (`salvarTudo`,
  `app/pacientes/[id]/page.tsx:1105-1134`) e a edição entra na trilha;
  anamnese e tratamento podem ser alterados; evolução e documento, só
  incluídos e excluídos (`lib/db/*.ts`).
- **Mudar:** guardar o que mudou — hoje o registro só diz que houve edição
  (9.1).

### 6.3 Paciente: eliminação — **ausente** · esforço médio

- **Lei:** art. 18 (eliminação quando cabível) e art. 16 (pode-se conservar o
  que a lei manda guardar — caso do prontuário).
- **Hoje:** nenhuma tela apaga paciente: não há exclusão em `pacientes` em
  `app/`, `components/` ou `lib/`. O banco permite ao administrador
  (`supabase/migrations/20261114_seguranca_total.sql:223-224`). Também não
  há "bloquear" ou "arquivar" para quando não se pode apagar por causa do
  prazo de guarda. O que sobraria se apagasse está no 7.2.
- **Mudar:** fluxo na ficha: registrar o pedido, conferir o prazo de guarda
  (7.1) e então bloquear (restringir acesso e parar mensagens) ou eliminar de
  verdade (banco, arquivos, filas), com registro de quem decidiu.

### 6.4 Profissional: exportar os próprios dados — **ausente** · esforço pequeno

- **Lei:** art. 18 — acesso e portabilidade; aqui o Ortus responde como
  controlador da conta.
- **Hoje:** `handleExportarMeusDados` existe
  (`app/perfil/page.tsx:183-206`) e nenhum botão a chama. Se chamasse,
  exportaria só nome, e-mail, cargo, nível e data de criação — sem telefone,
  conselho, vínculos, permissões, horários, comissões, convites e registros
  de uso.
- **Mudar:** botão em Perfil e exportação completa feita no servidor.

### 6.5 Profissional: apagar a conta — **ausente** · esforço médio

- **Lei:** art. 18 e art. 16 — eliminar ao fim do tratamento, salvo o que a
  lei manda guardar.
- **Hoje:** `handleSolicitarExclusao` (`app/perfil/page.tsx:208-237`) também
  não tem botão. Se tivesse, gravaria `exclusao_solicitada_em` e
  `ativo = false` (`:220-225`) e prometeria exclusão em 30 dias — mas nada lê
  essas colunas: não há rotina de exclusão e `ativo = false` não impede o
  login (o login não consulta a coluna, `app/login/page.tsx:306-323`). Apagar
  de verdade esbarra em: a conta do Supabase Auth só sai com chave de
  serviço; `audit_log.user_id` aponta para `auth.users` sem regra de exclusão
  (`supabase/migrations/20260516_audit_log.sql:9`), o que tende a travar a
  remoção do login; o nome do profissional nas evoluções deve ficar, porque
  faz parte do prontuário.
- **Mudar:** botão de pedido; fila visível para o suporte; rotina que,
  vencido o prazo, apaga login, perfil, foto e vínculos e anonimiza os
  registros de uso; login recusar conta desativada; definir o que fica.
  Distinto do restore de backup (15.2), que não serve para isso.

### 6.6 Clínica: exportar tudo e encerrar — **ausente** · esforço grande

- **Lei:** para atender a portabilidade dos pacientes (art. 18, V) e eliminar
  ao fim do tratamento (art. 16), a clínica precisa conseguir levar e apagar
  os dados; os Termos prometem "exportação integral"
  (`app/termos/page.tsx:67`).
- **Hoje:** em Configurações → Backup há um CSV de pacientes só com o
  cadastro (`app/configuracoes/page.tsx:402-421`), um JSON de configurações
  (`:423-440`) e a lista de backups internos. **O "Restaurar" dessa aba não é
  um caminho de titular nem de clínica**: chama `restaurar_backup`, que apaga
  e regrava dados de todas as clínicas (15.2). Não há exportação do
  prontuário completo nem exclusão da clínica pelo cliente; o painel SaaS
  apaga filial, não a matriz, e sem tratar arquivos
  (`supabase/migrations/20261114_saas_clinicas.sql:107-135`).
- **Mudar:** (1) "Exportar dados da clínica": pacote por clínica, com tabelas
  e arquivos, gerado no servidor, registrado e com link de vida curta;
  (2) "Encerrar conta", com carência e rotina de eliminação por clínica
  (banco, R2, filas de WhatsApp, cópias nos computadores — 13.5);
  (3) tirar o restore da tela da clínica.

### 6.7 Revogar consentimento e saber com quem o dado foi compartilhado — **ausente** · esforço médio

- **Lei:** art. 18 — revogação e informação sobre compartilhamento.
- **Hoje:** sem consentimento registrado (4.2) e sem opção de não receber
  mensagens (4.3), não há o que revogar. Sobre compartilhamento, existe só o
  histórico de envios (`whatsapp_envios`, `lembretes_agenda`); nada sobre
  acesso de outra clínica por convite (17.1) nem sobre fornecedores (11.1).
- **Mudar:** revogação na ficha; relatório por paciente com mensagens
  enviadas, quem acessou (9.1) e clínicas com acesso.

### 6.8 Canal e prazo para pedidos — **parcial** · esforço pequeno

- **Lei:** pedido gratuito e resposta em prazo definido (arts. 18 e 19); o
  operador ajuda o controlador a responder.
- **Hoje:** um e-mail na Política (`app/privacidade/page.tsx:111`). Nenhum
  registro de pedidos — nem para a clínica, que recebe o pedido do paciente,
  nem para o Ortus.
- **Mudar:** registro de solicitações por clínica (pedido, data, prazo,
  resposta) e fila no painel SaaS para pedidos dirigidos ao Ortus.

---

## 7. Retenção e descarte

### 7.1 Prazo de guarda do prontuário — **ausente** · esforço médio

- **Lei:** o prontuário tem guarda mínima obrigatória, e a LGPD permite
  conservar o dado para cumprir obrigação legal (art. 16, I). A Lei
  13.787/2018 trata da guarda do prontuário em meio digital e o Conselho
  Federal de Odontologia tem normas próprias. O prazo que costuma ser citado
  é de 20 anos a partir do último registro. **Conferir o prazo e a fonte com
  advogado e com o CRO antes de escrever número em tela ou contrato.**
- **Hoje:** os textos citam "20 anos (Resolução CFO 118/2012)"
  (`app/privacidade/page.tsx:40`, `87`; `app/termos/page.tsx:30`) — conferir
  se a fonte é essa. O sistema não conhece prazo: não calcula "último
  registro", não impede apagar antes, não avisa quando vence e não tem
  descarte programado. Qualquer membro da clínica apaga anamnese, evolução,
  documento e tratamento, um a um
  (`supabase/migrations/20261114_seguranca_total.sql:374-409`), sem que o
  conteúdo apagado fique guardado. Os Termos mandam a clínica "manter uma
  cópia" (`app/termos/page.tsx:30`) sem que exista exportação completa (6.6).
- **Mudar:** parâmetro de retenção por clínica; "último registro" por
  paciente; bloqueio ou aviso na exclusão; relatório de prontuários vencidos;
  definir o que acontece com o prontuário quando a clínica cancela (7.3).

### 7.2 Exclusão de paciente: o que apaga e o que sobra — **parcial** · esforço médio

- **Lei:** eliminação alcança todas as cópias (art. 16; art. 18).
- **Hoje**, se a linha de `pacientes` for apagada (o que hoje só se faz fora
  das telas, 6.3):
  - **Apaga em cascata:** `paciente_tratamentos`, `paciente_anamneses`,
    `paciente_documentos`, `paciente_evolucoes`
    (`supabase/migrations/20260730_ficha_relacional.sql:10`, `26`, `40`,
    `52`), `paciente_debitos` e `anamnese_links`
    (`supabase/migrations/20260804_alteracoes_03_08.sql:10`, `26`).
  - **Fica, só sem o vínculo:** `whatsapp_agendadas` e `whatsapp_envios`
    continuam com nome, telefone e texto
    (`supabase/migrations/20261031_whatsapp.sql:17-20`, `48-51`); `tarefas`
    e `comissoes_lancamentos` ficam com a descrição
    (`supabase/migrations/20260601_tarefas.sql:15`;
    `supabase/migrations/20260601_comissoes.sql:29`); `kanban_cartoes`
    guarda cópia do nome.
  - **Não tem ligação nenhuma:** `whatsapp_mensagens` (conversa por
    telefone), `audit_log` (id do paciente), `sync_exclusoes`.
  - **Arquivos:** nada apaga `pacientes/<id>/…` no R2 ou no Storage.
    Documentos e fotos de HOF viram órfãos — a API não os entrega mais, mas
    continuam guardados — e a foto de perfil **continua aberta por URL**: a
    rota pública não confere se o paciente existe
    (`lib/armazenamentoServidor.ts:398-431`) e a CDN guarda por 30 dias.
  - **Backups internos:** o paciente continua em até 40 fotografias (15.3).
  - **Computadores da clínica:** a exclusão viaja e apaga a linha local
    (`desktop/lib/sqlite.cjs:494-517`), mas a versão apagada é copiada para
    `sync_conflitos` (`:505-514`) e os arquivos em `arquivos/` ficam.
  - **Não dá para saber:** `agendamentos.paciente_id`, `despesas.paciente_id`
    e `kanban_cartoes.paciente_id` foram criados fora das migrations; se a
    exclusão bloqueia, anula ou apaga em cascata só se vê no banco.
- **Mudar:** uma rotina única "eliminar paciente" no servidor, que trate cada
  sobra acima (inclusive R2, filas de mensagem e cache público) e anonimize o
  que precisa ficar por obrigação fiscal.

### 7.3 Dados de quem cancela a assinatura — **ausente** · esforço grande

- **Lei:** terminado o tratamento, elimina-se, salvo guarda legal (arts. 15
  e 16); o contrato com a clínica precisa dizer o que acontece.
- **Hoje:** os textos prometem 90 dias e exclusão definitiva
  (`app/privacidade/page.tsx:86`; `app/termos/page.tsx:66`), com exceção do
  prontuário "por 20 anos" — duas regras que se chocam se o Ortus for o único
  lugar onde o prontuário está. No código não há cancelamento, contagem de
  prazo nem exclusão por clínica. A cobrança em construção vai no sentido
  contrário: os modelos de e-mail de fatura atrasada e de acesso bloqueado
  avisam que nada é apagado quando o acesso é bloqueado
  (`lib/emailModelos.ts`, `emailFaturaAtrasada` e `emailAcessoBloqueado`).
  Bloquear o acesso sem deixar exportar impede a clínica de cumprir os
  deveres dela com o paciente.
- **Mudar:** decidir a regra (quem guarda o prontuário depois do contrato) e
  implementar: estado da rede (ativa; bloqueada com exportação liberada;
  encerrada), contagem do prazo, exportação (6.6), eliminação e comprovante.

### 7.4 Registros auxiliares sem prazo — **parcial** · esforço pequeno

- **Lei:** guardar pelo tempo necessário à finalidade (art. 6º, III;
  art. 15).
- **Hoje:** com prazo — `armazenamento_envios`, 40 dias
  (`supabase/migrations/20261031_seguranca_geral.sql:429`);
  `falhas_servidor`, 30 dias, e `rotinas_execucoes`, 90 dias (limpeza do
  vigia, `lib/vigia.ts`); log do
  desktop, 2 MB mais um arquivo anterior (`desktop/lib/log.cjs:10-15`). Sem
  prazo — `audit_log`, `notificacoes` (somem da tela ao expirar, mas não são
  apagadas: `hooks/useInboxCounts.ts:28`), `anamnese_links` usados ou
  vencidos, `convites_equipe`, `whatsapp_agendadas`, `whatsapp_envios`,
  `whatsapp_mensagens`, `lembretes_agenda`, `sync_exclusoes`,
  `assinatura_pedidos`, `relatos_suporte` e, em cada computador,
  `sync_conflitos`.
- **Mudar:** tabela de prazos e uma rotina diária de limpeza.

---

## 8. Encarregado (DPO)

### 8.1 Encarregado do Ortus — **parcial** · esforço pequeno

- **Lei:** o controlador indica o encarregado e divulga identidade e contato,
  de preferência no site (art. 41). A ANPD tem regulamento sobre o
  encarregado e regra mais leve para agente de pequeno porte, que não costuma
  valer para quem trata dado de saúde em volume — conferir.
- **Hoje:** a seção 14 da Política traz um e-mail genérico e "Encarregado de
  Proteção de Dados — Recode Systems Ltda.", sem nome
  (`app/privacidade/page.tsx:108-113`). Não aparece no rodapé, dentro do
  sistema nem no desktop.
- **Mudar:** nomear pessoa ou empresa; publicar nome e contato na Política,
  no rodapé e na Ajuda; garantir que o canal é lido.

### 8.2 Contato de privacidade da clínica, visível ao paciente — **ausente** · esforço pequeno

- **Lei:** art. 41, para a clínica como controladora; art. 9º.
- **Hoje:** `clinicas` não tem campo para isso
  (`desktop/lib/esquema.cjs:45-78`); a anamnese pública e os impressos não
  mostram contato algum.
- **Mudar:** campo em Configurações → Clínica, exibido nos pontos de contato
  com o paciente (5.5).

---

## 9. Registro das operações de tratamento

### 9.1 Trilha de acesso e alteração (`audit_log`) — **parcial** · esforço grande

- **Lei:** manter registro das operações (art. 37) e conseguir rastrear
  acessos, como medida de segurança (art. 46). O Marco Civil da Internet
  também pede guarda de registros de acesso — conferir.
- **Hoje:** existe a tabela (`supabase/migrations/20260516_audit_log.sql:6-17`);
  cada um só grava em nome próprio, só super-admin lê
  (`supabase/migrations/20261114_seguranca_total.sql:554-557`) e ninguém
  apaga (testado em `scripts/testar-rls.mjs:258`). Limites:
  - Registra quatro eventos, todos disparados pela tela: login
    (`app/login/page.tsx:367`), abrir a ficha, editar a ficha e exportar
    (`app/pacientes/[id]/page.tsx:1086`, `1128`, `1166`). Não registra
    leitura pela lista, pelo painel lateral ou pelo dashboard; anamnese,
    documento e foto abertos; CSV de pacientes; download de backup;
    exclusões; logout; nem leitura direta pela API.
  - É "melhor esforço" no navegador (`lib/auditLog.ts:13-16`, `36-39`): falha
    em silêncio, e quem lê pela API não deixa rastro.
  - Não tem `clinica_id`: não dá para entregar à clínica a trilha dela, e não
    existe tela que leia a tabela.
  - `ip` e `user_agent` nunca são preenchidos (`lib/auditLog.ts:28-35`).
  - "Editou" não diz o quê.
  - **No desktop a trilha não sai do computador**: `audit_log` está fora da
    fila de envio (`desktop/lib/esquema.cjs:706-713`) e a API local permite
    alterar e apagar a tabela (`app/api/local/db/route.ts:112-157`).
- **Mudar:** registrar no banco, não na tela — gatilhos de escrita com antes
  e depois nas tabelas clínicas; leitura de ficha, anamnese, documento e
  exportação passando por função que registra; clínica, IP e agente no
  registro; tela "Histórico de acesso" por paciente para o administrador;
  sincronizar a trilha do desktop; prazo de guarda.

### 9.2 Auditoria do painel SaaS — **existe** · esforço pequeno (ampliar)

- **Lei:** art. 37.
- **Hoje:** o gatilho `auditar_saas` grava antes e depois de toda mudança em
  `redes`, `faturas` e `convites_equipe`
  (`supabase/migrations/20261114_saas_auditoria.sql:15-71`).
- **Mudar:** incluir `clinicas`, `profissionais`, `profissionais_clinicas` e
  a troca de e-mail do dono feita pelo suporte
  (`app/api/super-admin/rede/route.ts`, `PATCH`).

### 9.3 Registro de exclusões — **parcial** · esforço pequeno

- **Lei:** art. 37.
- **Hoje:** `sync_exclusoes` guarda tabela, id, clínica, usuário e data de
  cada exclusão nas tabelas sincronizadas
  (`supabase/migrations/20261118_sync_multimaquina.sql:32-39`, `61-92`;
  `supabase/migrations/20261119_offline_completo.sql:63-110`). Foi feito para
  sincronizar, mas serve de prova de quem apagou o quê. Não tem tela nem
  prazo.
- **Mudar:** aproveitar como parte da trilha (9.1) e dar prazo (7.4).

### 9.4 Registro das operações, como documento — **ausente** · esforço médio

- **Lei:** controlador e operador mantêm registro das operações de tratamento
  (art. 37).
- **Hoje:** não há nada no repositório; `docs/SEGURANCA.md` trata de
  segurança, não de tratamento.
- **Mudar:** partir das tabelas dos itens 1 e 11, manter versionado e
  oferecer à clínica um modelo do registro dela.

### 9.5 Relatório de impacto (RIPD) — **ausente** · esforço médio

- **Lei:** a ANPD pode pedir o relatório ao controlador (art. 38); quem trata
  dado de saúde em volume deve ter um.
- **Hoje:** a Política afirma que existe e que a clínica pode pedir cópia
  (`app/privacidade/page.tsx:115-116`). Não está no repositório.
- **Mudar:** elaborar — ou tirar a afirmação até existir.

---

## 10. Incidentes e comunicação

### 10.1 Procedimento de resposta e comunicação — **ausente** · esforço médio

- **Lei:** incidente que possa trazer risco ou dano relevante é comunicado à
  ANPD e ao titular pelo controlador (art. 48). A ANPD tem regulamento
  próprio, com prazo em dias úteis — conferir o texto vigente. O operador
  precisa avisar o controlador a tempo.
- **Hoje:** só as promessas de 72 horas (`app/privacidade/page.tsx:103-105`;
  `app/termos/page.tsx:39`). Não há roteiro, responsáveis, critério de
  gravidade, modelo de aviso nem lista de contatos de emergência das clínicas
  (existe `redes.contato_email`,
  `supabase/migrations/20261114_saas_painel.sql:24-26`). Dois casos em que
  quem tem de agir é a clínica, e hoje ela não seria orientada: computador
  roubado com o banco em claro (13.1) e WhatsApp da clínica tomado por
  terceiro (13.6).
- **Mudar:** plano escrito (quem decide, em quanto tempo, o que comunicar a
  quem), modelos de aviso às clínicas e de comunicação à ANPD, um ensaio; e
  um "o que fazer se o computador for roubado" para a clínica.

### 10.2 Detecção e monitoramento — **parcial** · esforço médio · em construção

- **Lei:** medidas aptas a detectar e conter (art. 46).
- **Hoje**, em construção no dia da leitura: registro de falhas do servidor
  sem dado pessoal (`lib/registro.ts`), tabelas `falhas_servidor`,
  `rotinas_execucoes` e `alertas_operacao`
  (`supabase/migrations/20261122_operacao.sql`) e batimento das rotinas
  (`lib/rotinas.ts`); a rota `/api/saude` e o vigia existem
  (`docs/OPERACAO.md`). Tudo isso é disponibilidade, não segurança: não
  há alerta para muitas falhas de login, exportação em massa, acesso de
  super-admin a prontuário, download de backup ou novo super-admin. A
  retenção dos logs do Supabase e da hospedagem depende do plano.
- **Mudar:** alertas de segurança em cima da trilha (9.1); guardar logs de
  autenticação por prazo definido; rever de tempos em tempos quem é
  super-admin (a suíte confere: `scripts/testar-rls.mjs:139-142`).

### 10.3 Registro de incidentes — **ausente** · esforço pequeno

- **Lei:** manter registro dos incidentes, inclusive dos que não forem
  comunicados (regulamento da ANPD — conferir).
- **Hoje:** não há.
- **Mudar:** registro restrito com data, o que houve, dados afetados, decisão
  e comunicações feitas.

---

## 11. Transferência internacional e fornecedores

| Serviço | Que dado vai | Onde processa | No código | Contrato ou cláusula |
|---|---|---|---|---|
| Supabase (Auth, Postgres, Storage) | tudo: prontuário, contas (e-mail, hash de senha), arquivos antigos, backups internos | **conferir**: os docs do repositório mostram pooler `aws-1-sa-east-1`, São Paulo (`supabase/README.md:8`); a Política diz EUA (`app/privacidade/page.tsx:57`) | `lib/supabase.ts`, `lib/supabaseAdmin.ts`, `desktop/lib/sync.cjs` | nenhum no repositório; a Política diz que existe |
| Cloudflare R2 | fotos de perfil e de HOF, documentos de paciente, logos | o endereço usado não fixa jurisdição (`lib/r2.ts:36-37`); o local depende de como o bucket foi criado — conferir no painel | `lib/r2.ts`, `lib/armazenamentoServidor.ts` | não citado em Política nem Termos |
| Vercel (hoje) | o que passa pelas rotas `/api/*` (arquivo privado em trânsito, anamnese pública, lembretes), endereço das requisições (18.4), IP | `vercel.json` não fixa região; o padrão costuma ser EUA — conferir | `vercel.json` | citado; contrato não verificável |
| Máquina virtual (Oracle Cloud, depois) | o mesmo, mais o serviço de WhatsApp em nuvem | a região não aparece no repositório — conferir | em construção: "VM" em comentário (`lib/registro.ts:13`) e a pasta `deploy/oracle/`, que surgiu durante a leitura | escolher região no Brasil e contrato |
| Resend (e-mail) | e-mail do destinatário; no lembrete, primeiro nome, data, hora e nome da clínica; em convites e avisos de conta, nome e clínica | empresa dos EUA — conferir | `lib/email.ts:89`; `lib/lembretesServidor.ts`; `app/api/convites/notificar/route.ts`; `app/api/admin/criar-usuario/route.ts` | não citado |
| Twilio (SMS, opcional) | telefone do paciente e texto do lembrete | empresa dos EUA — conferir | `lib/sms.ts:45` | não citado |
| WhatsApp / Meta | número e nome dos contatos, todo o conteúdo das conversas, mídias | Meta, fora do Brasil | `services/whatsapp/server.mjs`, com `whatsapp-web.js` (automação do WhatsApp Web, não é a API oficial); links `wa.me` (`lib/comunicacao.ts:165`; `app/dashboard/page.tsx:203`) | a conta é da clínica; o Ortus não tem contrato com a Meta — avaliar com advogado |
| Provedor de pagamento (Mercado Pago) | dados de quem paga a assinatura | conferir | **ainda não existe no código**: só o nome `PAGAMENTO` (`lib/servicosExternos.ts:11`) e rotas já liberadas no `proxy.ts`; os Termos citam "Stripe" (`app/termos/page.tsx:97`); o `/checkout` atual é simulação (18.5) | a definir |
| E-mails de conta do Supabase Auth | e-mail do usuário, links de confirmação e de senha | conforme o servidor de e-mail configurado no painel | configuração de painel | conferir |
| Google Fonts | IP e navegador de quem **imprime** um documento | Google | fontes do sistema: **servidas pelo próprio site** — `next/font/google` baixa na compilação (`app/layout.tsx:3`; os arquivos aparecem em `.next/dev/static/media/*.woff2`). Impressão: `@import` direto do Google (`lib/printDocument.ts:18`) | — |
| YouTube (domínio "nocookie") | IP e navegador do profissional que abre um tutorial | Google | `app/ajuda/tutoriais/page.tsx:80` | — |
| ViaCEP | CEP digitado (de paciente ou de clínica) e IP de quem digita | Brasil | `app/pacientes/[id]/page.tsx:2702`; `components/PatientActionModal.tsx:347`; `app/configuracoes/page.tsx:552`; `components/saas/ModalClinica.tsx:97`; `components/saas/ModalNovoCliente.tsx:148` | — |
| GitHub Actions | nenhum dado pessoal (só a chave anônima, que é pública) | — | `.github/workflows/desktop-windows.yml` | — |

### 11.1 Lista de fornecedores e contratos — **parcial** · esforço médio

- **Lei:** o titular tem direito de saber com quem o dado é compartilhado
  (art. 9º; art. 18), e o operador responde pelos suboperadores que escolhe.
- **Hoje:** Política e Termos citam Supabase, Vercel e "Stripe"
  (`app/privacidade/page.tsx:93`; `app/termos/page.tsx:88`, `95-97`). O
  código usa mais quatro (R2, Resend, Twilio, WhatsApp) e não usa Stripe.
  Nenhum contrato está no repositório.
- **Mudar:** manter a tabela acima como lista oficial; juntar o contrato de
  tratamento de dados de cada fornecedor; publicar a lista e avisar a clínica
  quando ela mudar.

### 11.2 Mecanismo de transferência para fora do país — **ausente** · esforço médio (jurídico)

- **Lei:** só se transfere dado para fora com uma das hipóteses do art. 33
  (arts. 33 a 36). A ANPD publicou regulamento de transferência
  internacional, com cláusulas-padrão — conferir texto e prazo de adaptação.
- **Hoje:** a Política invoca três fundamentos de uma vez
  (`app/privacidade/page.tsx:58-62`). Nenhum contrato, aditivo ou avaliação
  está no repositório.
- **Mudar:** decidir por fornecedor — manter no Brasil (Supabase em
  `sa-east-1`, máquina virtual no Brasil, R2 com jurisdição, se houver) ou
  documentar a hipótese; informar na Política e ao controlador.

### 11.3 Chamadas do navegador a terceiros — **parcial** · esforço pequeno

- **Lei:** necessidade e transparência (art. 6º).
- **Hoje:** as fontes do sistema não fazem o navegador falar com o Google
  (linha "Google Fonts" da tabela). Três chamadas saem do navegador do
  profissional: a fonte da impressão, o vídeo de tutorial e a consulta de
  CEP. Nenhuma leva dado de saúde; a de CEP leva o CEP do paciente.
- **Mudar:** servir a fonte da impressão pelo próprio site; consultar o CEP
  pelo servidor ou avisar na Política; manter o vídeo com aviso.

---

## 12. Cookies e sessão

**O que fica gravado no navegador**

| Onde | Chave | Conteúdo | Dura | Some no logout? |
|---|---|---|---|---|
| cookie | `ortus_auth` | `1` (marca de "logado") | 7 dias | sim |
| cookie | `ortus_modules` | módulos liberados, ou `*` | 7 dias | sim |
| `localStorage` | `sb-<projeto>-auth-token` | sessão do Supabase: token de acesso, token de renovação, id e e-mail | até sair ou a renovação vencer | sim |
| `localStorage` | `ortus_clinica_id`, `ortus_clinics_cache` | clínica ativa; lista de clínicas (id, nome, endereço, rede) | até sair | sim |
| `localStorage` e `sessionStorage` | `ortus:profile:v1` | nome, cargo, nível, foto, se é super-admin | até sair | sim |
| `localStorage` | `ortus_login_email` | e-mail digitado no login (opção marcada por padrão) | sem prazo | **não** |
| `localStorage` | `ortus_cookie_consent` | opção escolhida no banner e data | sem prazo | não |
| `localStorage` | `ortus_ultimo_backup_check` | hora da última checagem de backup | sem prazo | não |
| `localStorage` | `ortus_anamnese_modelos`, `ortus:cores-categoria`, `ortus:tarefas:cores`, `ortus-dashboard-sidebar` | modelos de anamnese da clínica e preferências de tela | sem prazo | não |
| `sessionStorage` | `ortus:pacientes-lista` | **a lista inteira de pacientes da clínica, com todas as colunas, inclusive `ficha_medica`** | até fechar a aba | sim |
| `sessionStorage` | `ortus:dashboard:v2` | agenda do dia com pacientes, tratamentos, saldo e a `ficha_medica` do paciente selecionado | até fechar a aba | sim |
| `sessionStorage` | `ortus:tarefas:v1`, `ortus:equipe:v1`, `ortus:equipe:convites:v1`, `ortus:equipe:comissoes:v2`, `ortus:relatorios:v2`, `ortus:tratamentos:v2`, `ortus:proteses-board` | tarefas (com nome e telefone de paciente), equipe, convites, comissões, relatórios, catálogo, cartões de prótese | até fechar a aba | sim |

Evidência: `lib/authCookies.ts:4-11`; `lib/supabase.ts:7-12`;
`lib/sessao.ts:7`, `17-30`; `lib/profileSession.ts:3`, `29-39`;
`app/login/page.tsx:205`, `270`; `components/CookieBanner.tsx:5`, `36`;
`lib/backup.ts:4`, `86-89`; `lib/anamnese.ts:43`;
`app/pacientes/page.tsx:243-246`, `272`; `app/dashboard/page.tsx:96-110`,
`690-704`; `lib/routeListCache.ts`.

### 12.1 O banner e o que o site faz — **parcial** · esforço pequeno

- **Lei:** transparência (art. 9º); pedir consentimento só quando ele é a
  base e tem efeito real (art. 8º). A ANPD tem guia sobre cookies — conferir.
- **Hoje:** o banner oferece "Analytics — dados de uso anônimos" e "Aceitar
  Todos" (`components/CookieBanner.tsx:64-65`, `85-86`, `112-117`), mas não
  existe analytics no código e ninguém lê a escolha além do próprio banner
  (`:25`, `:36`). A Política diz que só há cookies essenciais
  (`app/privacidade/page.tsx:98`). O texto fala em "cookies" e a sessão, de
  fato, fica em `localStorage`. O banner aparece em toda página, inclusive
  no desktop e na anamnese do paciente (`app/layout.tsx:58`).
- **Mudar:** enquanto não houver analytics, trocar por um aviso simples (ou
  tirar) e descrever na Política a tabela acima; se um dia houver, ligar a
  escolha ao carregamento do script.

### 12.2 O que some no logout — **parcial** · esforço pequeno

- **Lei:** art. 46.
- **Hoje:** `encerrarSessao` (`lib/sessao.ts:33-45`) derruba a sessão do
  Supabase e apaga cookies, perfil, clínica e todo o `sessionStorage`. Ficam
  o e-mail lembrado, a escolha do banner, a hora da checagem de backup, as
  preferências e os modelos de anamnese. No desktop, ver 13.4.
- **Mudar:** limpar o e-mail lembrado e os modelos no logout.

### 12.3 Dado clínico em cache no navegador — **parcial** · esforço pequeno

- **Lei:** necessidade e segurança (art. 6º, III; art. 46).
- **Hoje:** a lista de pacientes pede `*` e guarda o resultado inteiro
  (`app/pacientes/page.tsx:243-246`, `272`); o dashboard guarda a
  `ficha_medica` do paciente selecionado (`app/dashboard/page.tsx:690-704`).
  Fica em claro enquanto a aba está aberta, ao alcance de qualquer script da
  página — e não há política de conteúdo (CSP, `next.config.ts:3-7`).
- **Mudar:** guardar no cache só as colunas da lista; nunca `ficha_medica`.

### 12.4 Cookies de sessão — **parcial** · esforço pequeno

- **Lei:** art. 46.
- **Hoje:** `ortus_auth` e `ortus_modules` são gravados pelo JavaScript, sem
  `Secure` e sem `HttpOnly`, por 7 dias (`lib/authCookies.ts:6-11`), e o
  `proxy.ts` confia neles para liberar página e módulo. Não protegem dado —
  quem protege é o token do Supabase com a RLS —, mas quem editar o cookie
  abre qualquer tela, e o controle por módulo depende dele (2.1).
- **Mudar:** marcar `Secure`; tratar o cookie só como conveniência de tela.

---

## 13. O que o aplicativo desktop guarda no disco da clínica

Pasta de dados: `%APPDATA%\Ortus` no Windows
(`desktop/README.md:134-149`; `desktop/lib/caminhos.cjs:35-46`).

| Caminho | Conteúdo | Proteção |
|---|---|---|
| `ortus.db` (e os arquivos `-wal` e `-shm`) | cópia de **tudo o que o usuário logado pode ver na nuvem**: 31 tabelas — pacientes com `ficha_medica`, anamneses, evoluções, débitos, agenda, financeiro, equipe (a linha inteira de `profissionais`), conversas de WhatsApp —, mais fila de envio, conflitos e marcas de exclusão | SQLite sem criptografia (`desktop/lib/sqlite.cjs:120-125`) |
| `arquivos/` | fotos e documentos gravados neste computador | arquivos comuns (`lib/arquivosDesktop.ts:324-327`) |
| `wwebjs/session-<clínica>/` | perfil de navegador com a sessão do WhatsApp da clínica | nenhuma própria (`services/whatsapp/server.mjs:161`) |
| `sessao.json` | token de acesso e de renovação do Supabase, id e e-mail, **perfil completo do usuário**, lista de clínicas e um verificador da senha (scrypt) | JSON em claro; a permissão 0600 não tem efeito no Windows (`desktop/main.cjs:101-112`; `app/api/local/sessao/route.ts:55-73`; `app/login/page.tsx:337-360`) |
| `segredos.json` | segredos internos e id da instalação | JSON em claro (`desktop/lib/segredos.cjs:56-68`) |
| `logs/ortus.log` e `ortus.log.1` | log do aplicativo, do servidor local e do WhatsApp | texto, 2 MB cada |
| `config.json` | endereço e chave anônima do Supabase (públicos) | — |
| perfil do Electron | o mesmo da tabela do item 12 | — |

### 13.1 Criptografia em repouso — **ausente** · esforço grande

- **Lei:** art. 46.
- **Hoje:** nada no disco é cifrado pelo Ortus. `docs/SEGURANCA.md:186-188`
  assume o limite e recomenda senha no Windows e BitLocker, mas o aplicativo
  não confere nem avisa.
- **Mudar:** banco cifrado, com a chave no cofre do sistema operacional; o
  mesmo para `sessao.json` e `segredos.json`; arquivos cifrados ou, no
  mínimo, conferir o BitLocker e avisar; termo de responsabilidade da
  clínica sobre o computador.

### 13.2 O que é baixado para o computador — **parcial** · esforço médio

- **Lei:** necessidade (art. 6º, III).
- **Hoje:** o primeiro login baixa `select=*` de todas as tabelas, para tudo
  o que a RLS deixa aquele usuário ver (`desktop/lib/sync.cjs:424-480`):
  todas as clínicas dele, a linha inteira de cada colega em `profissionais`
  e — se for um super-admin — **todas as clínicas da plataforma**. Não há
  escolha de clínica nem de período.
- **Mudar:** baixar só a clínica ativa; colunas mínimas de `profissionais`;
  recusar o download inicial para super-admin.

### 13.3 Acesso aos dados locais — **parcial** · esforço médio

- **Lei:** art. 46.
- **Hoje**, o que está bem: os três processos escutam só em 127.0.0.1, em
  porta sorteada; a API de dados exige segredo de 32 bytes e recusa chamada
  com `Origin` (`desktop/lib/dbApi.cjs:82-95`); a janela não tem Node e roda
  isolada (`desktop/main.cjs:138-144`); o instalador recusa levar a chave de
  serviço (`scripts/desktop-config.mjs:50-56`). Fechado em 18/11/2026: todo o servidor local do aplicativo
  (`proxy.ts` com `ORTUS_DESKTOP=1`, e de novo em cada rota `/api/local/*`)
  exige a prova de janela — `Host` local na porta certa, `Origin` próprio e
  segredo por execução injetado pelo processo principal — e responde 403
  sem ela; `/sessao/restaurar` e `/entrar` só devolvem token à janela; corpo
  só em JSON (415). Continua: `/api/local/db` lê e grava qualquer tabela sem regra de clínica, papel ou
  módulo (`app/api/local/db/route.ts:112-157`) — localmente não existe RLS.
  O id de quem fez o download é gravado (`desktop/lib/sync.cjs:467`) e nunca
  conferido: outra pessoa que entre no mesmo usuário do Windows encontra o
  banco de quem usou antes.
- **Mudar:** exigir o token e conferir `Origin` e `Host` nas rotas locais;
  aplicar vínculo e módulo nas consultas locais; ao trocar de usuário,
  limpar ou separar o banco.

### 13.4 Logout — **parcial** · esforço pequeno

- **Lei:** art. 46.
- **Hoje:** sair apaga `sessao.json`
  (`app/api/local/sessao/route.ts:77-83`; `desktop/main.cjs:104-106`), a
  sessão do navegador e os caches (12.2). **Ficam** `ortus.db`, `arquivos/`,
  os logs e a sessão do WhatsApp — que continua conectado e recebendo
  mensagens com ninguém logado (`desktop/lib/whatsapp.cjs:15-18`). Sem
  sessão as rotas locais param de responder, mas os arquivos estão no disco.
- **Mudar:** opção "sair e apagar os dados deste computador"; dizer na tela
  que sair não remove a cópia local.

### 13.5 Desinstalação e descarte do computador — **ausente** · esforço pequeno

- **Lei:** eliminação ao fim do uso (art. 16) e segurança (art. 46).
- **Hoje:** `deleteAppDataOnUninstall: false`
  (`desktop/electron-builder.yml:117`). O manual confirma que os dados ficam
  e manda apagar a pasta à mão (`desktop/README.md:147-149`;
  `docs/INSTALACAO.md:69-73`). Não há comando no aplicativo para apagar tudo.
- **Mudar:** "Remover dados deste computador" no aplicativo (banco, arquivos,
  sessões, logs), pergunta no desinstalador e orientação para troca ou
  descarte de máquina.

### 13.6 Sessão do WhatsApp no disco — **parcial** · esforço pequeno

- **Lei:** art. 46.
- **Hoje:** a pasta `wwebjs/session-<clínica>` dá acesso total ao WhatsApp
  da clínica a quem a copiar. Sobrevive a logout, atualização e
  desinstalação; só "Desconectar" na tela encerra
  (`services/whatsapp/server.mjs:613-622`). O navegador embutido roda com
  `--no-sandbox` (`:165`).
- **Mudar:** desconectar junto com "apagar dados"; avisar a clínica; avaliar
  ligar o sandbox.

### 13.7 Logs locais — **parcial** · esforço pequeno

- **Lei:** necessidade (art. 6º, III).
- **Hoje:** `logs/ortus.log` recebe a saída do servidor local e do WhatsApp
  (`desktop/lib/nextServer.cjs:94-95`; `desktop/lib/whatsapp.cjs:172-173`) e
  os erros de sincronização, com até 300 caracteres da resposta do banco
  (`desktop/lib/sync.cjs:191-194`, `251`) — uma resposta de erro pode trazer
  o valor de um campo, por exemplo numa chave duplicada. O número do
  WhatsApp da clínica é impresso (`services/whatsapp/server.mjs:192`). O
  menu Ajuda abre a pasta (`desktop/main.cjs:199-202`).
- **Mudar:** passar as mensagens pelo mesmo filtro de `lib/registro.ts`
  antes de gravar.

### 13.8 Arquivo anexado no desktop fica só naquela máquina — **parcial** · esforço médio

- **Lei:** o art. 46 também cobre perda acidental.
- **Hoje:** no desktop o envio de arquivo grava em `arquivos/`
  (`lib/arquivosDesktop.ts:235-250`, `305-332`) e só a linha de
  `paciente_documentos` sincroniza. O conteúdo não sobe para a nuvem nem
  chega aos outros computadores: se a máquina quebrar, o documento ou a foto
  se perdem. É leitura de código — confirmar em teste.
- **Mudar:** fila de envio dos arquivos para o R2 com o token do usuário.

---

## 14. Menor de idade no prontuário

### 14.1 Responsável no cadastro — **parcial** · esforço pequeno

- **Lei:** o tratamento de dado de criança e de adolescente segue o melhor
  interesse deles; para criança, a lei pede consentimento específico e em
  destaque de um dos pais ou do responsável (art. 14, §1º). A ANPD já
  admitiu outras bases além do consentimento, mantido o melhor interesse —
  conferir com advogado.
- **Hoje:** quando a data de nascimento dá menos de 18 anos, o cadastro
  exige nome, parentesco e telefone do responsável
  (`lib/pacienteValidation.ts:28-31`, `45-49`; aviso na tela em
  `app/pacientes/[id]/page.tsx:2757` e
  `components/PatientActionModal.tsx:497`). Limites: a data de nascimento
  não é obrigatória, e sem ela não há checagem; a regra existe só na tela;
  o cadastro rápido do pedido de prótese cria paciente só com o nome
  (`components/proteses/ModalPedidoProtese.tsx:186-192`); não separa criança
  de adolescente; não pede documento do responsável.
- **Mudar:** data de nascimento obrigatória (ou confirmação de maioridade);
  regra também no banco; cadastro rápido marcado como incompleto.

### 14.2 Consentimento do responsável e registro — **ausente** · esforço médio

- **Lei:** art. 14, §1º; art. 8º, §2º (prova).
- **Hoje:** nenhum registro — mesma lacuna do 4.2. A Política joga a
  obtenção e a guarda para a clínica (`app/privacidade/page.tsx:68-69`). Os
  modelos de termo não têm campo de responsável, embora exista a variável
  para documentos (`lib/documentVariables.ts:11`, `30`).
- **Mudar:** ciência ou consentimento do responsável registrado (quem,
  parentesco, data, texto), termo com assinatura do responsável e alerta na
  ficha quando faltar.

### 14.3 Mensagens e anamnese de menor — **ausente** · esforço pequeno

- **Lei:** art. 14 — a informação deve chegar a quem responde pelo menor.
- **Hoje:** lembretes e automações usam `pacientes.telefone` e `.email`;
  `responsavel_telefone` não é usado em nenhum envio. O link de anamnese de
  um menor pode ser preenchido por qualquer pessoa, sem identificar quem
  responde. Mensagem de aniversário e de retorno vai igual para menor.
- **Mudar:** para menor, enviar ao responsável; a anamnese pública pedir
  nome e parentesco de quem preenche; nada de mensagem de relacionamento
  para menor sem aceite do responsável.

---

## 15. Backup e por quanto tempo ele conserva dado apagado

### 15.1 Backup interno (tabela `backups`) — **parcial** · esforço grande

- **Lei:** proteger contra perda e destruição (art. 46) sem guardar além do
  necessário (art. 6º, III).
- **Hoje** (`supabase/migrations/20261031_seguranca_geral.sql:299-329`;
  `lib/backup.ts`):
  - Cada backup é **uma fotografia inteira de seis tabelas — `pacientes`,
    `agendamentos`, `despesas`, `clinicas`, `profissionais`, `servicos` — de
    todas as clínicas juntas**, num JSON gravado em `backups.dados`, no
    **mesmo banco** (`:310-319`). Não protege contra a perda do banco e não
    inclui prontuário relacional (tratamentos, anamneses, evoluções,
    documentos, débitos), vínculos, configurações, WhatsApp nem arquivos.
  - Só super-admin cria, lê e apaga (`:307-309`;
    `supabase/migrations/20261114_seguranca_total.sql:561-564`). A função é
    chamada por todo usuário logado e recusada para quem não é super-admin
    (`components/AuthGuard.tsx:137-139`).
  - **Não é agendado.** Dispara quando um super-admin usa o sistema e o
    último backup tem mais de 12 horas, com checagem no máximo uma vez por
    hora por navegador (`lib/backup.ts:82-101`). Sem super-admin logado, não
    há backup. A tela e os textos dizem "automático 2 vezes ao dia"
    (`app/configuracoes/page.tsx:1202`; `app/privacidade/page.tsx:52`;
    `app/termos/page.tsx:37`).
  - Guarda os 30 automáticos e os 10 manuais mais recentes (`:321-326`):
    **é contagem, não prazo em dias.**
  - O super-admin pode baixar a fotografia inteira como JSON para o próprio
    computador (`lib/backup.ts:38-54`; botão em
    `app/configuracoes/page.tsx:1226`), sem registro.
  - A aba Backup aparece em Configurações para qualquer usuário que abra a
    tela; para quem não é super-admin a lista vem vazia e os botões falham.
- **Mudar:** backup de verdade fora do banco (15.4), com prazo em dias,
  cifrado e testado; aposentar a tabela `backups` ou reduzi-la a exportação
  por clínica; tirar o download do navegador; corrigir tela e textos.

### 15.2 Restauração — **parcial** · esforço médio

- **Lei:** integridade e disponibilidade (art. 46).
- **Hoje:** `restaurar_backup`
  (`supabase/migrations/20261031_seguranca_geral.sql:331-359`) apaga
  `agendamentos`, `despesas`, `pacientes`, `servicos`,
  `profissionais_clinicas`, `profissionais` e `clinicas` **de todas as
  clínicas** e regrava a partir da fotografia. Efeitos (executada em 18/11/2026 num banco reconstruído;
  `docs/OPERACAO.md`, 6.1: os efeitos 1 a 4 se confirmaram; além deles, pela
  tela a restauração falha inteira com PT402 se alguma rede estiver em modo
  de consulta, pelo SQL Editor conclui mesmo assim, e cada linha apagada
  entra em `sync_exclusoes`):
  1. tudo o que qualquer clínica fez depois da fotografia se perde;
  2. `profissionais_clinicas` é apagada (`:348`) e **não é regravada** — a
     fotografia não a contém —, de modo que ninguém fica vinculado a clínica
     nenhuma;
  3. apagar `pacientes` leva junto, em cascata, tratamentos, anamneses,
     evoluções, documentos e débitos (7.2), que **não voltam**; apagar
     `clinicas` leva configurações, catálogos e históricos ligados em
     cascata;
  4. pacientes eliminados a pedido voltam (15.3).

  Se alguma chave das tabelas-base impedir uma dessas exclusões, a função
  falha inteira e nada muda — também só se vê testando num banco de cópia.
  A tela pede digitar "RESTAURAR" (`app/configuracoes/page.tsx:237-250`,
  `1248-1305`) e avisa que apaga "todos os dados atuais" (`:1264`), sem
  dizer que é de todas as clínicas.
- **Mudar:** tirar da tela da clínica; restaurar só por procedimento do
  suporte, por clínica, em ambiente separado, com dupla aprovação e
  registro; nunca "apagar tudo e regravar".

### 15.3 Dado apagado dentro dos backups — **ausente** · esforço médio

- **Lei:** a eliminação tem de alcançar as cópias em prazo definido e
  informado (art. 16; art. 18).
- **Hoje:** um paciente (ou profissional) apagado continua em cada
  fotografia até ela "rodar para fora". Nas automáticas, são 30 backups: de
  uns 15 dias, se houver dois por dia, até prazo indefinido, se nenhum
  super-admin entrar. Nas manuais, até serem feitos outros 10 backups
  manuais — sem limite de tempo. Não há lista de eliminações para reaplicar
  depois de uma restauração.
- **Mudar:** prazo máximo em dias para qualquer cópia; registro de
  eliminações reaplicado depois de restaurar; informar o prazo na Política.

### 15.4 Backup do fornecedor (Supabase) e dos arquivos — **não verificável pelo código**

- **Lei:** art. 46.
- **Hoje:** não aparece no código. Backup diário e recuperação a um ponto no
  tempo dependem do plano contratado e da configuração do projeto; os
  arquivos no R2 não têm versão nem cópia configurada pelo código.
- **Conferir no painel:** plano, retenção em dias, recuperação a um ponto no
  tempo ligada ou não, onde ficam as cópias; no R2, versão e replicação.
  Esses prazos entram na conta do 15.3.

---

## 16. Segurança (art. 46)

### 16.1 Isolamento entre clínicas no banco — **existe** · esforço pequeno (rotina)

- **Lei:** art. 46.
- **Hoje:** RLS ligada em todas as tabelas de `public`, com regra por comando
  (`supabase/migrations/20261114_seguranca_total.sql:165-206`, `215-423`);
  visitante sem acesso a tabela, sequência ou função (`:654-657`;
  `supabase/migrations/20261121_seguranca_reforco.sql:338-339`); gatilhos
  contra escalada de privilégio
  (`supabase/migrations/20261031_seguranca_geral.sql:211-250`); suíte
  `scripts/testar-rls.mjs`, que cobre isolamento, exclusão de paciente,
  forja, painel SaaS, convites, agenda e arquivos, em transação desfeita no
  fim. Ressalvas: foi provada em banco de teste, não em produção
  (`docs/RELATORIO-LANCAMENTO.md:9-16`), e a migration de 18/11
  (`20261121_seguranca_reforco.sql`) pode não estar aplicada.
- **Mudar:** rodar a suíte contra produção a cada publicação e guardar o
  resultado.

### 16.2 Arquivos, APIs e cabeçalhos — **existe** · esforço médio (CSP)

- **Lei:** art. 46.
- **Hoje:** buckets privados
  (`supabase/migrations/20261114_seguranca_total.sql:608-610`); as rotas
  `/api/*` validam o token no servidor e reconferem o vínculo
  (`lib/chamadorApi.ts:14-28`; `lib/armazenamentoServidor.ts:28-42`); envio
  de arquivo com link de 60 segundos, tipo, tamanho, conteúdo e cota
  (`lib/r2.ts:61-75`; `lib/assinaturaArquivo.ts`); cabeçalhos `nosniff`,
  `SAMEORIGIN`, `Referrer-Policy`, HSTS e `Permissions-Policy`
  (`next.config.ts:8-15`); rotina de lembretes fechada por segredo
  (`lib/rotinas.ts:20-29`); chave de serviço fora do desktop. Falta a
  política de conteúdo (CSP), deixada de fora de propósito
  (`next.config.ts:3-7`).
- **Mudar:** CSP, ao menos em modo de relatório.

### 16.3 Segundo fator de autenticação — **ausente** · esforço médio

- **Lei:** art. 46 — medida esperada para dado de saúde.
- **Hoje:** o login é só e-mail e senha (`app/login/page.tsx:285`); não há
  nenhuma chamada de segundo fator no código; os Termos prometem
  "multi-fator quando disponível" (`app/termos/page.tsx:38`).
- **Mudar:** segundo fator do Supabase Auth, obrigatório para super-admin e
  para administrador de clínica.

### 16.4 Senha e recuperação — **parcial** · esforço pequeno

- **Lei:** art. 46.
- **Hoje:** mínimo de 8 caracteres com letra e número só na tela do primeiro
  acesso (`app/primeiro-acesso/page.tsx:48-52`); a troca em Perfil não
  valida nada nem pede a senha atual (`app/perfil/page.tsx:157-158`); a
  regra do servidor é a do painel do Supabase, que não dá para ver daqui.
  Não havia "esqueci a senha" no levantamento; **desde 18/11 há** (link na
  tela de entrada → `/recuperar-senha` → e-mail com link de uso único →
  `/redefinir-senha`, com limite de tentativas e a mesma resposta exista ou
  não a conta). Redefinir pelo suporte continua sendo um script com chave de
  serviço que imprime a senha nova (`scripts/reset-user-password.mjs`).
  Ponto bom: senha temporária entregue pelo administrador, com troca
  obrigatória. As contas nascem com e-mail dado como confirmado, sem
  verificação.
- **Mudar:** uma política só, no servidor; pedir a senha atual; recuperação
  por e-mail; bloquear senha vazada, se o fornecedor oferecer.

### 16.5 Sessão e computador compartilhado — **parcial** · esforço pequeno

- **Lei:** art. 46.
- **Hoje:** sessão persistente em `localStorage`, com renovação automática
  (`lib/supabase.ts:7-12`), e marca de 7 dias. Não há bloqueio por
  inatividade: na recepção, a ficha fica aberta. No desktop, um script
  estende a validade local por 12 horas para o programa funcionar sem
  internet (`lib/local/scriptSessaoDesktop.ts:9`). Não há "sair de todos os
  aparelhos".
- **Mudar:** bloqueio de tela por inatividade, tempo máximo de sessão e
  encerramento das sessões de quem sai da equipe.

### 16.6 Remover alguém da equipe — **ausente** · esforço pequeno

- **Lei:** art. 46 — tirar o acesso de quem não precisa mais.
- **Hoje:** não há na tela "remover da clínica". Ajustes → Equipe muda nível
  e módulos, e nenhuma tela apaga vínculo em `profissionais_clinicas`; o
  painel SaaS manda revogar justamente lá
  (`components/saas/RedeEquipe.tsx:167`). Quem sai da clínica continua com
  vínculo — e, pelo 2.1, com acesso pela API — até alguém apagar a linha no
  banco. O banco já permite a remoção pelo administrador (testado em
  `scripts/testar-rls.mjs`, grupo Convites). Esse arquivo estava sendo
  alterado durante a leitura — conferir.
- **Mudar:** botão "remover da clínica", que apaga vínculo e permissões e
  encerra as sessões da pessoa.

### 16.7 Criptografia em repouso e de campo — **parcial** · esforço médio

- **Lei:** art. 46.
- **Hoje:** o que há é a criptografia de disco dos fornecedores, afirmada na
  Política (`app/privacidade/page.tsx:49`) e não verificável pelo código.
  CPF, telefone, endereço e respostas de anamnese ficam em texto puro nas
  colunas; a busca por CPF compara o valor direto
  (`components/PatientActionModal.tsx:189-207`). Os backups internos são
  JSON puro. Para o desktop, ver 13.1.
- **Mudar:** avaliar cifra de campo para CPF (com índice por hash para a
  busca) e para anamnese e evolução; no mínimo, mascarar CPF em listas e
  exportações.

### 16.8 Testes e revisão de segurança — **parcial** · esforço médio

- **Lei:** art. 46 — medidas revistas e comprovadas.
- **Hoje:** suíte de RLS e auditorias de estrutura (`scripts/testar-rls.mjs`,
  `scripts/audit-db.mjs`, `scripts/audit-seguranca.mjs`) e histórico das
  brechas corrigidas em `docs/SEGURANCA.md`. Não há teste de invasão
  externo, varredura de dependências na integração contínua, nem assinatura
  digital do instalador (`docs/INSTALACAO.md:39-40`).
- **Mudar:** teste de invasão antes do lançamento; varredura de
  dependências; assinar o instalador.

### 16.9 WhatsApp por automação do WhatsApp Web — **parcial** · esforço grande

- **Lei:** art. 46.
- **Hoje:** `whatsapp-web.js` com Puppeteer controla o WhatsApp Web da
  clínica (`services/whatsapp/server.mjs:10`, `160-167`), com o navegador
  sem sandbox. Em nuvem, o serviço roda com a chave de serviço do Supabase
  (`services/whatsapp/lib/repositorioNuvem.mjs:30-33`). É uma sessão com
  acesso total às conversas, fora da API oficial.
- **Mudar:** avaliar a API oficial do WhatsApp para os envios automáticos;
  se ficar como está, isolar o processo, ligar o sandbox e documentar o
  risco para a clínica.

---

## 17. Compartilhamento entre clínicas

### 17.1 O convite entre redes abre os pacientes da clínica — **parcial** · esforço médio

- **Lei:** compartilhar dado com outro agente pede base legal, transparência
  ao titular e limite ao necessário; para dado de saúde há restrição própria
  ao compartilhamento entre controladores com fim econômico (art. 11, §4º —
  conferir o enquadramento).
- **Hoje:** um administrador convida, pelo e-mail, alguém que já tem conta
  em outra rede
  (`supabase/migrations/20261114_equipe_convites.sql:93-234`). Ao aceitar, a
  pessoa ganha vínculo marcado como convidado
  (`supabase/migrations/20261121_seguranca_reforco.sql:282-288`) e passa a
  ler **e alterar** todos os pacientes e prontuários da clínica que a
  convidou — é o comportamento desejado e está na suíte
  (`scripts/testar-rls.mjs:299`). O que já controla: o convite vence em 14
  dias, só o convidado aceita, o convidado nunca é administrador ali
  (`supabase/migrations/20261121_seguranca_reforco.sql:56-72`), entra com os
  módulos do cargo (`:290-315` — que valem só na tela, 2.1) e o convite é
  auditado (9.2). O que falta: o paciente não é informado; o vínculo não tem
  finalidade registrada nem prazo; não há tela para remover o convidado
  (16.6); nada impede que ele baixe a clínica inteira no desktop dele
  (13.2); a trilha não distingue acesso de convidado (9.1).
- **Mudar:** tratar o convidado como acesso de terceiro: escopo (os
  pacientes que ele atende), prazo com renovação, remoção na tela, trilha
  marcada, menção no aviso ao paciente e no contrato entre as clínicas.

### 17.2 Colegas leem a linha inteira uns dos outros — **parcial** · esforço pequeno

- **Lei:** necessidade (art. 6º, III).
- **Hoje:** a regra de leitura de `profissionais` libera a **linha inteira**
  a qualquer pessoa que divida uma clínica com o titular, convidados
  incluídos, nos dois sentidos
  (`supabase/migrations/20261114_seguranca_total.sql:118-135`, `428-430`).
  As telas pedem só nome, cargo, nível, telefone, foto e conselho
  (`lib/clinicScoped.ts:215`, `239`), mas a API entrega também `cpf`,
  `email`, `sexo`, `endereco`, `cep`, `cidade`, `is_super_admin` e
  `exclusao_solicitada_em` (`desktop/lib/esquema.cjs:96-132`), e o desktop
  copia tudo para cada computador (13.2). Nenhuma tela atual grava CPF ou
  endereço de profissional (1.2): o que há nessas colunas é o que já estava
  no banco — conferir.
- **Mudar:** visão com as colunas públicas (nome, cargo, foto, conselho)
  para colegas; linha completa só para a própria pessoa e para o
  administrador da clínica de origem; apagar as colunas sem uso.

### 17.3 O convite revela se um e-mail tem conta, e o nome do dono — **parcial** · esforço pequeno

- **Lei:** necessidade e segurança (art. 6º, III; art. 46).
- **Hoje:** `equipe_convidar` responde com erro diferente quando o e-mail
  não tem conta
  (`supabase/migrations/20261114_equipe_convites.sql:147-157`) e, quando
  tem, grava no convite o nome da pessoa (`:197-205`), legível por quem
  convidou (`:56-67`). Qualquer administrador de clínica consegue testar
  e-mails e obter nomes de usuários de outras redes. A rota de criar
  funcionário faz parecido ao dizer que já existe conta com aquele e-mail.
- **Mudar:** resposta única ("se houver conta, o convite foi enviado"); nome
  só depois do aceite; limite de tentativas.

---

## 18. Outros pontos encontrados no código

### 18.1 E-mail lembrado no navegador — **parcial** · esforço pequeno

- **Lei:** necessidade (art. 6º, III).
- **Hoje:** "Lembrar meu e-mail neste dispositivo" vem marcado
  (`app/login/page.tsx:205`, `502-510`), grava `ortus_login_email` em
  `localStorage` (`:270`) sem prazo e não é limpo no logout
  (`lib/sessao.ts:7`). Em computador de recepção, o próximo usuário vê o
  e-mail do anterior.
- **Mudar:** desmarcado por padrão; limpar no logout.

### 18.2 Dado do paciente dentro das mensagens — **parcial** · esforço pequeno

- **Lei:** necessidade (art. 6º, III); e-mail, SMS e WhatsApp saem do
  controle da clínica.
- **Hoje:** os modelos padrão levam primeiro nome, data, hora e nome da
  clínica (`lib/configDefaults.ts:41-115`; `lib/lembretesServidor.ts:193-199`)
  — um mínimo razoável. Mas a variável `procedimento` está disponível nas
  automações de WhatsApp (`lib/whatsappAutomacoes.ts:51`;
  `services/whatsapp/server.mjs:1092`) e os modelos são livres, sem aviso
  para não pôr informação clínica. O texto enviado fica guardado com nome e
  telefone (`whatsapp_envios`, `whatsapp_agendadas`). O e-mail passa pela
  Resend e o SMS pelo Twilio (item 11).
- **Mudar:** aviso no editor de modelos; tirar `procedimento` ou marcá-lo
  como sensível; prazo para o histórico de envios (7.4).

### 18.3 Conversas de WhatsApp gravadas e enviadas à nuvem — **parcial** · esforço médio

- **Lei:** finalidade, necessidade e transparência (art. 6º; art. 9º).
- **Hoje:** no desktop, toda mensagem recebida ou enviada pelo WhatsApp
  conectado — de qualquer contato, paciente ou não — é gravada em
  `whatsapp_mensagens`, com texto, nome e telefone
  (`services/whatsapp/server.mjs:213-222`, `581-587`;
  `services/whatsapp/lib/repositorioLocal.mjs:175-216`), e sobe para o
  Supabase como cópia de segurança
  (`supabase/migrations/20261117_desktop_sync.sql:78-94`). Qualquer membro
  da clínica lê (`:108-121`). Não há prazo, aviso a quem escreve nem
  separação de conversa pessoal. Na versão em nuvem as mensagens ficam só em
  memória (`services/whatsapp/lib/repositorioNuvem.mjs:72-83`).
- **Mudar:** decidir se o histórico precisa ir para a nuvem; guardar só
  conversa de contato que é paciente; prazo de retenção; aviso no primeiro
  contato; orientar a clínica a usar número exclusivo.

### 18.4 Dado pessoal em endereço (URL) — **parcial** · esforço pequeno

- **Lei:** art. 46 — o endereço fica no histórico do navegador e nos logs da
  hospedagem.
- **Hoje:** o botão de WhatsApp navega para
  `/whatsapp?telefone=…&nome=…&texto=…&paciente=…`
  (`components/PatientContactButtons.tsx:66-70`); a API recebe
  `?acao=resolver&telefone=…` (`app/api/whatsapp/route.ts`, bloco `acao=resolver`); o
  arquivo é pedido com o nome original no caminho
  (`app/pacientes/[id]/page.tsx:2034`); o token de anamnese vai no caminho
  (inevitável, e vale só 72 horas).
- **Mudar:** passar esses dados por estado da tela ou corpo da requisição;
  nome de arquivo por id; não registrar a parte de consulta do endereço.

### 18.5 Página de pagamento simulada que pede cartão — **ausente** · esforço pequeno

- **Lei:** não coletar dado sem finalidade (art. 6º, I e III).
- **Hoje:** `/checkout` é pública (`lib/rotasPublicas.ts:8`), pede nome,
  número, validade e código do cartão (`app/checkout/page.tsx:46-48`), não
  envia a lugar nenhum e simula "Pagamento Aprovado" com um temporizador
  (`:15-18`), sob o selo "Pagamento 100% seguro via SSL" (`:40`). Depois
  manda para
  `/cadastro`, que chama uma rota que não existe mais
  (`app/cadastro/page.tsx:24`). Nada vaza — os campos não saem do navegador
  —, mas é pedir cartão sem finalidade e fazer uma promessa falsa a quem
  digita.
- **Mudar:** tirar do ar até existir o provedor de pagamento; cartão só na
  página do provedor.

### 18.6 Exportação em massa pela tela — **parcial** · esforço pequeno

- **Lei:** art. 46 e art. 37.
- **Hoje:** "Exportar pacientes" gera um CSV com nome, CPF, RG, telefone,
  e-mail, nascimento, sexo e endereço de todas as clínicas do usuário
  (`app/configuracoes/page.tsx:402-421`), disponível a quem abre
  Configurações, sem confirmação e sem registro. O mesmo vale para o
  download de backup (15.1).
- **Mudar:** restringir a administrador, pedir confirmação, registrar na
  trilha e alertar (10.2).

---

## O que não deu para verificar pelo código

- **Produção.** Se as migrations estão aplicadas (em especial
  `20261114_seguranca_total`, `20261121_seguranca_reforco` e
  `20261122_operacao`) e o resultado da suíte de segurança contra o banco
  real.
- **Esquema real das tabelas-base**, criadas pelo painel: o que acontece com
  `agendamentos`, `despesas` e `kanban_cartoes` quando um paciente é apagado;
  se `pacientes.rg` existe (o CSV de pacientes pede essa coluna); o que há de
  fato nas colunas de CPF e endereço de `profissionais`; quantas linhas têm
  as tabelas legadas; os gatilhos de notificação criados fora das migrations.
- **Supabase:** região do projeto, plano, backup diário e recuperação a um
  ponto no tempo (e por quantos dias), criptografia em repouso, retenção de
  logs, configuração do Auth (tamanho mínimo de senha, senha vazada, segundo
  fator, duração de sessão, confirmação de e-mail, servidor de e-mail).
- **Cloudflare R2:** onde os buckets estão, se o público tem domínio aberto
  (`R2_PUBLIC_URL`), versão e logs.
- **Hospedagem:** região das funções na Vercel, retenção de logs, quem tem
  acesso ao projeto; a máquina virtual futura (região, disco cifrado, quem
  acessa); onde roda o serviço de WhatsApp em nuvem.
- **Contratos e documentos:** contrato de tratamento de dados com Supabase,
  Cloudflare, Vercel, Resend, Twilio e o provedor de pagamento;
  cláusulas-padrão; o relatório de impacto citado na Política; quem é o
  encarregado; CNPJ e endereço da Recode Systems; se as caixas
  `privacidade@` e `suporte@` existem e são lidas.
- **Ambiente de produção:** quais integrações estão ligadas (R2, Resend,
  Twilio, WhatsApp em nuvem), se o segredo do agendador está definido, quem
  são os super-admins.
- **Uso nas clínicas:** se o WhatsApp conectado é número exclusivo; se os
  computadores têm senha e disco cifrado; quantas máquinas por clínica.
- **Histórico do git:** não foi examinado. Se algum commit antigo guardou
  segredo ou dado pessoal (o relatório de lançamento cita um script removido
  que trazia um e-mail fixo, `docs/RELATORIO-LANCAMENTO.md:62`), isso
  continua no histórico.
- **Pontos de direito:** prazo e norma de guarda do prontuário odontológico;
  prazo de comunicação de incidente; se a empresa conta como agente de
  pequeno porte; base legal das mensagens de relacionamento; enquadramento
  do acesso de convidado de outra clínica; mecanismo de transferência
  internacional por fornecedor.
- **Comportamento em execução.** Nada foi rodado: nem o sistema, nem a
  restauração, nem a suíte. Quatro leituras merecem teste antes de virar
  decisão: o arquivo anexado no desktop
  que não sobe para a nuvem (13.8); a ausência de "remover da equipe"
  (16.6); e a checagem de backup dentro do desktop — a tabela `backups` não
  está no espelho local, então, pela leitura, um super-admin no desktop
  dispararia um backup a cada checagem, e não a cada 12 horas (15.1).
- **O que estava em construção no dia da leitura:** cobrança, assinaturas e
  provedor de pagamento; `/api/saude` e o "vigia"; e-mails de convite, de
  conta e de lembrete; a publicação em máquina virtual (`deploy/oracle/`).
  Reler os itens 4.3, 7.3, 10.2 e 11 quando estabilizar.

---

## Atualização de 18/11/2026, depois do levantamento

O levantamento acima foi feito entre 01:30 e 02:10. Durante o resto da
madrugada outras frentes do lançamento criaram ou mudaram lugares onde há dado
pessoal. Nada abaixo é implementação de LGPD (esta etapa é só a lista); são os
itens novos que entram no mapa de dados e as mudanças que afetam pontos já
listados. Reler os pontos citados quando o código estabilizar.

**Dados novos a incluir no mapa (1.1) e na política (5.3):**

- `assinatura_pedidos` — compra pela página pública: nome da clínica, nome,
  e-mail e telefone de quem assina, aceite dos termos (data), resumo com
  segredo do endereço de rede de quem pediu (`origem_hash`, só para limitar
  abuso; o endereço em si não é guardado) e o identificador do pagamento no
  provedor. Nenhum dado de cartão passa pelo Ortus: Pix e cartão são digitados
  na página do Mercado Pago. Não tem prazo de guarda nem rotina de limpeza;
  compra abandonada vira `expirado`, mas a linha fica. Desde a revisão do
  pagamento, cada envio do formulário é uma compra nova (para ninguém tomar a
  compra de outra pessoa só sabendo o e-mail), então a mesma pessoa pode
  deixar várias linhas não pagas: o prazo de guarda das não pagas precisa ser
  decidido (sugestão: apagar nome e telefone das expiradas/canceladas sem
  pagamento depois de 90 dias).
- `limites_publicos` — tentativas nas rotas sem login (compra, link de acesso,
  "Esqueci a senha"): só uma chave com hash e segredo do IP ou do e-mail e a
  hora. Apagada sozinha em até 2 dias.
- "Esqueci a senha" — o e-mail digitado não é guardado; o link vai só para
  ele, e a resposta é a mesma exista ou não a conta (exceto quando a Resend
  recusa o envio, caso em que a tela diz que o e-mail não saiu).
- `pagamento_eventos` — trilha do que o provedor informou: identificador,
  estado, valor e meio do pagamento. Sem nome nem e-mail.
- `assinatura_avisos` — fila dos e-mails de cobrança: só tipo, rede, fatura e
  resultado do envio. O destinatário é calculado na hora (contato comercial
  da rede e administradores) e não é guardado.
- `relatos_suporte` — bug e sugestão enviados pela Ajuda: texto livre digitado
  pelo usuário (pode conter dado de paciente) e o nome do autor copiado. Lido
  pelo autor e pelos donos da plataforma; o e-mail de aviso aos donos leva o
  texto inteiro. Sem prazo de guarda nem limpeza; a exclusão fica na trilha
  sem o texto.
- `orcamentos` e `orcamento_itens` — orçamento do paciente: procedimentos,
  dentes, valores, validade, status, motivo da recusa (texto livre) e quem
  é o profissional e o comercial. Dado de saúde (o procedimento diz o que o
  paciente vai tratar). Lido por quem trabalha na clínica; vai junto na
  sincronização do desktop. Apagado com o paciente.
- `orcamento_contatos` — o que o comercial conversou com o paciente (texto
  livre, pode conter dado de saúde), canal, data do próximo contato e quem
  registrou. Mesma regra de acesso e de exclusão do orçamento.
- `metas_vendas` — meta de vendas do mês da clínica e de cada profissional
  (só valores). Lida por quem trabalha na clínica; só o administrador grava.
- `falhas_servidor` — erro do servidor com o texto passado por
  `limparTexto` (troca JWT, chave, e-mail, CPF, CNPJ, telefone, UUID e URL de
  banco por marcadores). Limpa sozinha depois de 30 dias (vigia da operação).
- `rotinas_execucoes` e `alertas_operacao` — batimento das rotinas e alertas,
  só contagens. `rotinas_execucoes` limpa depois de 90 dias.
- `convites_equipe.aceite_hash` — resumo (SHA-256) da chave do link do
  e-mail do convite; a chave não é guardada.
- `redes` — colunas novas de assinatura (estado, datas de dívida, bloqueio e
  cancelamento, motivo do cancelamento). O contato comercial da rede passa a
  receber os e-mails de cobrança.

**Mudanças que afetam pontos da lista:**

- 2.4 e 4.4 (foto de perfil do paciente aberta por URL): em correção nesta
  mesma madrugada — a foto de paciente passa para leitura autenticada. Reler.
- 5.4 (afirmações sem sustentação): a página `/checkout` deixou de pedir
  número e CVV de cartão (agora leva à página do Mercado Pago), e `/cadastro`
  redireciona para ela. Os textos de Termos e Política continuam citando
  "Stripe", backup duas vezes ao dia e a Vercel: não foram mexidos.
- 7.x e 15.x (exclusão e backup): a limpeza do banco para o lançamento
  (`scripts/clean-db.mjs`) e a limpeza de arquivos órfãos
  (`scripts/limpar-orfaos.mjs`) apagam de verdade, mas só quando rodadas à mão
  com confirmação; não são o caminho de eliminação pedido pelo titular.
- Modo de consulta: clínica com assinatura vencida há mais de 7 dias continua
  lendo tudo, mas não grava; nenhum dado é apagado por falta de pagamento.
  Isso entra na Política (o que acontece com os dados quando a assinatura
  vence ou é cancelada) — hoje o texto não fala disso.
