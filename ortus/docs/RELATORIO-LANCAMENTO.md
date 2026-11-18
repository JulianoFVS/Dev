# Ortus — relatório da preparação para o lançamento

Trabalho feito a partir do clone de `JulianoFVS/Dev` em 18/11/2026. Para cada
bloco: o que mudou, como foi provado e o que depende de conta ou segredo que
só os donos podem criar.

**Como ler a coluna "prova":**

- **banco local** = Postgres de teste montado nesta máquina com as 43
  migrations do repositório + as novas, dados inventados e um servidor que
  imita o Supabase. A RLS que responde é a de verdade (mesmo SQL), mas o
  esquema-base foi reconstruído a partir de `desktop/lib/esquema.cjs`, porque
  as tabelas originais foram criadas pelo painel e não estão em migration.
- **produção** = verificado no projeto Supabase real. Nesta entrega **nada**
  foi verificado em produção: o clone não traz `.env.local` e nenhuma
  credencial foi usada.
- **demonstração** = o build de produção no ar numa VPS, contra os mesmos
  serviços falsos, conferido pela internet (item 20).

O trabalho está no branch `preparacao-lancamento`. Nenhum PR foi aberto.

---

## 1. Código morto

### Como a ausência de uso foi provada

1. **Grafo de imports** a partir de todas as rotas (`page`, `layout`,
   `loading`, `route`, `not-found`), do `proxy.ts` e das configs: arquivo que
   nenhuma rota alcança é órfão.
2. **Serviço de linguagem do TypeScript** ("Find all references") em cada
   export de `app/`, `components/`, `lib/`, `hooks/` e `store/`: export sem
   nenhuma referência fora da própria declaração.
3. **`tsc --noUnusedLocals`** para imports, funções e variáveis locais nunca
   lidos.
4. **Busca textual** no repositório inteiro para arquivos estáticos, rotas e
   scripts (nome do arquivo, do caminho público e da rota).

Depois de cada remoção: `tsc --noEmit` limpo e grafo sem órfãos.

### O que saiu

| O quê | Por quê |
|---|---|
| `app/teste-3d/` | tela de experimento ("Dev only"), pública no proxy |
| `app/site/` | landing antiga duplicada; nenhum link apontava para ela |
| `app/inbox/` | só redirecionava para `/mensagens`; nenhum link no app |
| `app/api/criar-usuario/` | criava usuário **sem login** com nível `admin`; só era chamada pelo cadastro público falso e por um bloco morto |
| `app/api/editar-usuario/` | só o bloco morto de Configurações chamava |
| `app/api/comunicacao/status/` | nenhum chamador (o estado das integrações passa a aparecer no painel SaaS) |
| `app/pacientes/[id]/context.tsx` | nenhum import |
| `components/clinico/OdontogramaInterativo.tsx`, `teethPathsData.ts` | nenhum import (a ficha usa o odontograma de `page.tsx` e o 3D) |
| `components/forms/AppointmentForm.tsx`, `TreatmentForm.tsx` | nenhum import |
| `components/modals/QuickTratamentoModal.tsx` | nenhum import |
| `components/ui/Tabs.tsx` | nenhum import |
| `lib/checkModuleAccess.ts`, `lib/db/index.ts`, `lib/planoTemplates.ts`, `lib/teeth-data.ts`, `lib/agendaPrefill.ts` | nenhum import (o prefill da agenda tinha leitor e nenhum escritor) |
| Cadastro de profissionais dentro de `app/configuracoes/page.tsx` (estado, 6 funções e 2 modais, ~190 linhas) | nenhum botão abria os modais; a equipe é gerida em `/ajustes/equipe` |
| 24 exports sem referência (`useClinic`, `bentoTab`, `fetchUserClinicaIds`, `abrirEmailTemplate`, `marcarTratamentoNaoPago`, `MESH_TO_FDI`, …) | zero referências |
| Cache `ortus_super_admin` em `sessionStorage` | era gravado e nunca lido |
| 60 imports e ~20 funções/constantes locais nunca lidos | `tsc --noUnusedLocals` |
| `atualizacao.js`, `instalar_v108_fix_exclusao.js` | scripts que **sobrescrevem** telas com versões antigas |
| `extract-teeth.cjs`, `dev-landing.log`, `dentes-frontais.svg`, `referencia-sprite.svg`, `.tmp-shots/`, `Script/` | sobras; `Script/` era cópia idêntica de uma migration |
| `public/arcada.glb` (3,6 MB), `public/prot-ortus.pdf`, `public/assets/dev-seed.html`, `public/assets/dentes/debug.png`, 5 SVGs do create-next-app, 4 imagens de landing e `icon-square.png` | nenhuma referência; o PDF de protótipo e o `dev-seed.html` ("remova antes de publicar") ficavam servidos em público |
| `scripts/replicate-juliano.mjs`, `find-keep-users.mjs`, `audit-columns.mjs`, `audit-extra-tables.mjs`, `audit-rest.mjs`, `compare-landing.mjs`, `shot-landing.ps1`, `prepare-landing-assets.mjs` | avulsos, fora do `package.json` e dos docs; o primeiro recriava um super-admin com e-mail fixo |
| Exceção de `/mediapipe`, `.task` e `.wasm` no proxy e no `next.config.ts` | não existe MediaPipe no projeto; era superfície pública sem uso |

### Telas de experimento em produção

`proxy.ts` responde 404, em produção, a qualquer rota que comece com
`/teste`, `/experimento`, `/lab`, `/playground` ou `/demo` — mesmo que alguém
recrie a pasta. A regra está em `lib/rotasPublicas.ts`.

### O que ficou de propósito

- `handleExportarMeusDados` e `handleSolicitarExclusao` em `app/perfil/page.tsx`
  e os estados de consentimento em `app/pacientes/[id]/page.tsx`: não têm
  botão que os chame, mas são o rascunho do que a LGPD vai pedir. Estão na
  lista do item 6 como "parcial".
- Funções da ponte do desktop sem chamador (`gravarLoteLocal`,
  `estatisticasLocais`, `salvar`, `modoDadosSincrono`): área protegida pelo
  pedido ("não apague desktop").
- `docs/` (PDFs, guias de mudanças, mockups HTML): documentação histórica,
  não é código. Decisão de vocês.
- Dependência `svg-path-bbox` no `package.json`: só o `extract-teeth.cjs`
  (removido) usava. Tirar exige regravar o `package-lock.json`, e a regra é
  não rodar `npm install` na raiz. Para remover: `npm uninstall svg-path-bbox`
  numa máquina com o toolset C++.

### Banco: candidatos que **não** foram apagados

Tabela só sai com prova no banco, e não houve acesso a ele. O código não
referencia mais:

| Objeto | Situação no código |
|---|---|
| `servicos`, `tipos_procedimentos` | legado; `servicos` só aparece dentro das funções de backup |
| `anamneses`, `anexos`, `prontuarios` | substituídas por `paciente_anamneses`, `paciente_documentos`, `paciente_evolucoes` |
| `audit_logs` | substituída por `audit_log` |
| `centros_custo`, `profissional_especialidade` | nenhuma leitura ou escrita |
| função `agendamento_salvar_partes` e colunas `grupo_id`, `parte_*` de `agendamentos` | a tela de agenda em partes foi revertida; nada chama a função. A suíte de segurança ainda a cobre |

Antes de apagar qualquer uma: contar linhas, conferir chaves estrangeiras e
gatilhos que apontam para ela. Vai junto com o inventário da limpeza (item 8).

---

## 2. Segurança

### O que mudou

**Brechas fechadas (todas com teste):**

| Brecha | Correção |
|---|---|
| `/api/criar-usuario` criava conta de administrador **sem login** | rota removida (item 1); criar funcionário exige administrador da clínica (`/api/admin/criar-usuario`) |
| Link de anamnese gerado para paciente de outra clínica informando `clinica_id` no corpo | a clínica vem do paciente, lida no banco; paciente alheio e inexistente respondem igual (404) |
| `/privacidade` e `/anamnese/<token>` mandavam o visitante para o login | fonte única de rotas públicas (`lib/rotasPublicas.ts`) para o proxy e a casca |
| `/dashboard` em laço de redirecionamento para quem não tinha o módulo "Inteligência" | o dashboard é o destino do "acesso negado" e não exige módulo |
| API sem cookie recebia HTML de login com status 200 | 401 em JSON |
| Logout deixava caches no navegador | `lib/sessao.ts` limpa cookies, perfil, clínica, cache de clínicas, `sessionStorage` e as chaves por clínica |
| Convidado de outra rede virava administrador na clínica que convidou | `profissionais_clinicas.convidado` e regras de administrador que exigem vínculo próprio (`20261121`) |
| Funções novas executáveis por visitante | `REVOKE EXECUTE … FROM PUBLIC, anon` no fim de cada migration nova |
| Conta criada por um administrador com o e-mail de outra pessoa aceitava convite de outra rede e lia os pacientes dela | o aceite exige o link do e-mail do convite, com a chave guardada só como resumo (`20261125`) |
| Envio direto ao bucket `arquivos_ortus` sem cota nem tipo | policies de INSERT/UPDATE removidas; envio só por link assinado do servidor |
| Cartão de prótese no quadro de outra clínica; agendamento com paciente de outra rede | gatilhos: a clínica da linha manda; paciente tem que ser da mesma clínica/rede |
| Membro comum mudava a própria comissão para 100% e marcava como paga | regra de comissão e pagamento de lançamento só para administrador |
| Apagar o registro de mensagem enviada fazia o lembrete sair de novo | `whatsapp_envios` sem DELETE pela API |
| Link de anamnese com validade de anos, de clínica alheia ou reaberto | gatilho: clínica do paciente, até 72 h, sem prorrogar nem reabrir |
| Administrador de filial se vinculava à matriz e podia apagar o dono | administrador da rede = administrador da matriz; a matriz nunca fica sem administrador (`20261127`) |
| Funções auxiliares respondiam sobre clínicas e redes alheias; situação financeira de qualquer cliente legível | respostas só para quem é da rede; `rede_status_financeiro` só no servidor |
| Notas internas e dados comerciais da rede legíveis pela equipe | leitura de `redes` limitada a id e nome; o resto só pelo painel |
| Rotas públicas devolviam o texto cru do erro do banco | registro em `falhas_servidor` e frase fixa |
| XSS na ficha (documento com HTML embutido rodava na origem do Ortus) | visualizador só aceita arquivo do próprio paciente ou imagem conferida pelos bytes; o banco também recusa (`20261128`) — item 7 |
| Servidor local do aplicativo desktop atendia qualquer página da máquina | prova de origem por execução — item 16 |
| **Open redirect** no login e na seleção de unidade (`?redirect=/\golpe.example` mandava para outro site depois da senha) | `lib/destinoInterno.ts`: recusa contrabarra e caractere de controle e confere a origem depois de resolver |
| **Compra tomada por quem só sabia o e-mail** (pegava o identificador, trocava nome e telefone, cancelava a compra da vítima) | cada envio é uma compra nova; nada é reaproveitado, alterado ou cancelado por requisição anônima (item 5) |
| Rotas sem login aceitavam pedido de outro site e limite por IP contornável | só JSON da própria origem; limite atômico no banco (`limites_publicos`), IPv6 pelo bloco /64, teto geral por hora |
| Gravações feitas pelo servidor escapavam do modo de consulta (link de anamnese, WhatsApp, envio de arquivo) | conferência `clinica_aceita_escrita` antes de gravar — item 13 |

**Achados que ficaram abertos, com motivo:**

- Permissão de módulo continua só na tela para várias tabelas (despesas,
  evoluções, documentos): a RLS libera qualquer pessoa da clínica. Levar o
  módulo para a RLS é mudança de produto (quem pode apagar evolução?).
- `equipe_convidar` ainda diz se um e-mail tem conta (limitado a 30 convites
  por dia por pessoa). A página de compra também diz (409), agora contando no
  limite por endereço; captcha depende de conta externa (Cloudflare
  Turnstile).

### Como provei

- **Suíte de segurança** (`npm test`, banco local com todas as migrations):
  **257 de 257**. Roda em transação e desfaz tudo; cria duas redes, matriz e
  filial, administradores, membros comuns, convidado e um dono da plataforma.
- **Controle negativo:** os grupos novos rodaram também num banco SEM a
  migration de correção: sem a `20261125`, 15 falhas exatamente nos buracos;
  sem a `20261127`, 7. Os cenários da revisão do pagamento foram reproduzidos
  pelo revisor independente antes da correção (scripts guardados) e
  reexecutados depois.
- **Ponta a ponta contra o app:** ver itens 3, 5 e 19.
- `npm run db:audit` não rodou: precisa do `DATABASE_URL` do projeto real.

### Depende de vocês

- Rodar `npm test` e `npm run db:audit` no projeto real (com `.env.local`) e
  `ORTUS_SUPER_ADMINS="email1,email2" npm test` para conferir os donos.
- Aplicar as migrations `20261120` a `20261128` na ordem do checklist de
  `docs/SEGURANCA.md`.
- Supabase Auth: conferir no painel se o cadastro público (signup) está
  desligado, se a troca de e-mail exige confirmação, a política de senha e a
  duração da sessão. Nada disso está no código.

---

## 3. E-mail (Resend)

### O que mudou

- `lib/email.ts`: um único jeito de mandar e-mail, que devolve o motivo exato
  quando a Resend recusa ("A Resend recusou o envio (status): mensagem") ou
  quando falta `RESEND_API_KEY`/`RESEND_FROM_EMAIL`. Nenhuma tela diz "enviado"
  sem o aceite da Resend; as páginas sem login dizem que o e-mail não saiu sem
  expor configuração (o motivo fica no painel do dono).
- `lib/emailModelos.ts`: modelos em texto e HTML — convite, convite aceito,
  acesso criado, pagamento confirmado com o link de criar a senha, nova senha
  ("Esqueci a senha"), fatura do mês, fatura em atraso, modo de consulta,
  liberado de novo, relato, alerta da operação. Senha nunca vai por e-mail.
- **Confirmação de conta:** quem assina recebe o link que confirma o e-mail e
  leva à criação da senha (`/acesso` → `/primeiro-acesso`). O link só é gasto
  ao tocar "Continuar" (programa de e-mail que abre links não o queima) e, num
  navegador com outra conta aberta, sai dela antes.
- **"Esqueci a senha"** (não existia): link na tela de login, página
  `/recuperar-senha`, rota com limite por endereço e por e-mail e resposta
  igual exista ou não a conta, e `/redefinir-senha`.
- **Convite** e **convite aceito** saem de verdade (`/api/convites/notificar`);
  o destinatário sai do banco, nunca do corpo da requisição; o aceite exige o
  link do e-mail.
- **Lembrete de 24 h** por e-mail com o "responder para" da clínica, uma vez
  por agendamento (item 14).
- Link de e-mail usa só `NEXT_PUBLIC_APP_URL` (o cabeçalho da requisição podia
  ser forjado e levar o link para outro site).

### Como provei

Contra uma Resend falsa no ambiente local: e-mails saíram com assunto, texto e
link certos; com a Resend recusando, a resposta trouxe `enviado: false` com o
motivo e nada foi marcado como enviado (`e2e-email.mjs` e `e2e-assinatura.mjs`,
números no item 19).

### Depende de vocês

1. Conta na Resend, domínio verificado (SPF/DKIM no DNS) e as variáveis
   `RESEND_API_KEY` e `RESEND_FROM_EMAIL`.
2. **SMTP do Supabase → Resend** (e-mails que o próprio Supabase manda): no
   painel do Supabase, Authentication > Emails > SMTP Settings, ligar "Custom
   SMTP" com host `smtp.resend.com`, porta `465`, usuário `resend`, senha =
   uma chave de API da Resend, remetente do domínio verificado.
3. Mandar um e-mail de teste de cada tipo depois de configurar (os textos
   foram vistos só no ambiente local).

---

## 4. Responsividade, tela por tela

A regra seguida em todas: no celular não se encolhe a tela do computador; se
decide como a pessoa usa aquela área no telefone (outra hierarquia, outra
navegação). Alvo de toque com 40 a 44 px; título sem repetir a clínica; a barra
flutuante tem o espaço reservado pela casca; computador muda o mínimo.

| Tela | No celular |
|---|---|
| Agenda | abre em Dia com faixa da semana; filtros atrás de um botão (ponto quando ativos); Semana, Lista e Profissionais viram listas; lembretes começam fechados; modal em uma coluna com Salvar visível. Corrigido: a agenda lia a tabela inteira (o PostgREST corta em 1000 linhas) e passou a ler a janela do mês em blocos; o modal fechava como se tivesse salvo quando o banco recusava |
| Ficha do paciente | rola inteira com as abas presas no topo; cabeçalho em duas linhas com o nome inteiro; débitos, tratamentos, histórico, anamneses e documentos em cartões; odontograma rola de lado na própria caixa; 8 modais com cabeçalho e ações fixos |
| Dashboard e Pacientes | dias do calendário de 40 px; busca presa no topo, filtros em folha, linha inteira tocável; Novo paciente em tela cheia com rodapé fixo e nome/CPF repetido mantém o popup aberto |
| Financeiro | seletor de mês junto dos indicadores; Concluídos / Em aberto / Cancelados em abas; cartões com descrição inteira e ação escrita |
| Relatórios | tabelas viram itens de duas linhas; corrigido: data aparecia um dia antes |
| Laboratório (próteses) | cada etapa vira bloco sem rolagem própria; cartão com Avançar e Mudar status; provas marcáveis no popup (sem isso nenhum pedido novo chegava a Entregue) |
| Tarefas, Equipe, Tratamentos | abas de status com lista única; tabela vira lista tocável; nome do tratamento inteiro |
| Configurações, Mensagens, Perfil | a página rola inteira; abas de 44 px; listas viram cartões; popups com miolo rolável e rodapé fixo; convite com Aceitar e Recusar lado a lado |
| Assinatura, checkout, acesso, senha | uma coluna; lista de faturas com o Pagar alcançável; botões de 44 px |
| WhatsApp e Ajuda | abas de 40 px, conversa em tela cheia com Voltar, QR na largura; artigo com índice em gaveta e busca que acompanha o teclado |
| Painel SaaS | já era responsivo; as abas novas seguem o mesmo padrão |
| Componentes compartilhados | Modal, menus, seletor, calendário, chave, etiquetas, alerta e botões de contato corrigidos na fonte |

**Revisão independente das telas (segunda rodada).** Cinco revisores leram as
telas mexidas e as novas, e cada achado passou por um verificador separado
antes de virar correção. Confirmados e corrigidos, entre outros:

- **Assinatura no celular:** a lista de faturas e o botão Pagar ficavam com
  altura zero justamente em atraso e em modo de consulta; abaixo do `lg` a
  página rola como lista e o resumo fica compacto.
- **Painel SaaS:** as abas Assinaturas/Relatos não escondiam o bloco de Redes
  a partir de 768 px (conflito `hidden` × `md:grid`); faturas estornadas e
  contestadas sumiam dos totais e filtros; cancelar ou conferir com erro
  apagava o texto digitado.
- **Configurações:** editar uma clínica apagava e-mail, telefone, CNPJ, logo,
  horários e fuso (o formulário abria com o item resumido da lista); a tela
  lia e gravava a primeira clínica por ordem alfabética em vez da ativa (com
  convite, a de outra rede); gravação recusada aparecia como salva; o padrão
  podia ser gravado por cima antes de a tela carregar. Mensagens e Perfil
  passaram a conferir o banco (e os rótulos do Perfil, ao padrão).
- **Agenda:** convidado tratado como administrador; "Editar" abria com
  "Selecione…" porque os ids chegavam como número; setas do Mês pulavam
  fevereiro a partir do dia 29; lembretes e consultas da clínica anterior
  continuavam na tela durante a troca; menu de filtro atrás da barra do
  celular; erro de rede cru.
- **Financeiro:** Concluir/Cancelar/Restaurar diziam sucesso com o banco
  recusando; editar um lançamento apagava a taxa; "Receber" só trocava o
  status (agora registra data, forma, taxa e comissão, como a ficha); "hoje"
  e o mês padrão em UTC depois das 21 h.
- **Tarefas, Tratamentos, Laboratório e busca:** excluir não fechava o popup
  e salvar depois fingia gravar; falha de rede zerava a lista e o cache;
  tarefa do dia "atrasada" depois das 21 h (corrigido também na view do
  banco); tarefa ia para a primeira clínica em "Todas" (e o banco passou a
  recusar paciente/responsável de outra rede); catálogo e quadro da clínica
  anterior apareciam (e eram gravados no cache) da nova; a busca só via os 500
  primeiros pacientes e só achava telefone com a máscara exata.
- **Login e seleção:** open redirect (item 2). **Primeiro acesso** no padrão
  visual, sem spinner bloqueante nem erro do Supabase em inglês.

Cada correção foi provada com o código real rodando em teste (antes falhava,
depois passa) e typecheck; o resultado no navegador está no item 19.

**Ficou como decisão de produto (não mudei):** na visão Profissionais da
Agenda, quem não é administrador consegue marcar na coluna de outro
profissional; em "Todas as clínicas", quem tem clínicas próprias e é convidado
em outra continua visto como administrador nessa outra; no Laboratório,
"Todas as clínicas" pede uma clínica em vez de juntar quadros com etapas
diferentes.

---

## 5. Pagamento e assinatura

### O que mudou

- **Provedor:** Mercado Pago, Checkout Pro (`lib/pagamentos/`), atrás de uma
  interface. A pessoa paga na página do Mercado Pago (Pix ou cartão); **o
  Ortus não recebe nem guarda número de cartão nem CVV**. O pagamento falso
  (`setTimeout`) de `app/checkout` saiu.
- **Preço no servidor:** catálogo `planos_saas` (Básico R$ 97, Profissional
  R$ 197, Clínica R$ 297). O valor mandado pelo navegador é ignorado; o banco
  confere valor e moeda de cada pagamento. Sem o provedor configurado, a
  página não oferece "Assinar" e mostra o contato do suporte.
- **Webhook assinado** (`/api/pagamentos/webhook`): confere `x-signature`
  (HMAC), relê o pagamento na API do Mercado Pago e só então aplica, numa
  transação no banco (`pagamento_aplicar`). Aviso sem assinatura válida: 401.
- **A conta nasce sozinha:** pagamento aprovado → usuário do Auth (senha
  aleatória que ninguém vê) → rede com cobrança automática, clínica matriz,
  administrador, vínculo e a 1ª fatura paga, numa transação → e-mail com o
  link para confirmar o e-mail e criar a senha. A página de retorno e a rotina
  diária consultam o provedor, então a conta nasce mesmo se o webhook se
  perder.
- **Estados:** recusado (motivo do banco em português), pendente, pago,
  estornado e contestado, na página de retorno, na tela Assinatura e no painel.
- **Mensalidade:** a rotina diária (`/api/assinaturas/processar`, Bearer
  `CRON_SECRET`) gera a fatura 5 dias antes do vencimento, uma por
  competência, confere com o provedor as cobranças abertas, termina contas que
  pararam no meio e manda os e-mails de cobrança, com reserva para o mesmo
  e-mail não sair duas vezes. Fatura manual do painel conta como a do mês.
- **Régua (decisão minha, ajustável numa função):** vence no dia D; de D+1 a
  D+7 a rede fica "em atraso" (faixa de aviso e e-mail); a partir de D+8,
  **modo de consulta**: todo mundo entra e lê prontuário, agenda e financeiro,
  nada é gravado (o banco recusa com 402, inclusive nas gravações feitas pelo
  servidor). **Nada é apagado.** Pagou, volta na hora. Estorno e contestação
  voltam a contar como dívida a partir da data do evento. O dono pode dar
  prazo extra (até 60 dias), cancelar e reativar. Clínica em modo de consulta
  não recebe lembrete automático.
- **Convive com a cobrança manual:** rede que já existia começa sem cobrança
  automática; a Mais Sorriso continua como está. Ligar a cobrança automática
  (ou reativar) com fatura antiga em aberto faz a dívida contar a partir
  daquele dia — antes da revisão, bloqueava na hora.
- **Tela Assinatura** (menu, administrador da matriz): plano, valor, próxima
  cobrança, situação, quanto do plano está em uso e faturas com o botão Pagar.
- **Limites dos planos (decisão de vocês, aplicada):** Básico = 1 profissional
  e 1 unidade; Profissional = até 3 profissionais e 1 unidade; Clínica = sem
  limite de profissionais e várias unidades; planos combinados à mão
  (essencial, rede, enterprise) e rede sem plano = sem limite. Conta toda
  pessoa vinculada a alguma unidade da rede (própria ou convidada), uma vez;
  o dono da plataforma não ocupa vaga; tirar alguém da equipe libera a vaga. O
  banco confere ao vincular (cadastro de funcionário, aceite de convite,
  painel), ao criar convite e ao criar unidade, e responde com a frase do
  plano ("O plano Básico permite 1 profissional. Para incluir mais pessoas…").
  O cadastro de funcionário confere antes de criar o login. Equipe e
  Assinatura mostram "2 de 3 profissionais". Ninguém é removido quando a rede
  passa para um plano menor: só não entra mais ninguém. Os limites ficam em
  `planos_saas` (`limite_profissionais`, `limite_unidades`) e o dono muda o
  plano da rede no painel.

**Revisão independente do pagamento** (agente separado, com banco em memória e
scripts): não achou caminho para ganhar conta sem pagamento aprovado, pagar
menos ou quitar alvo errado. Achou e foi corrigido:

| Achado | Correção |
|---|---|
| Quem sabia o e-mail de um comprador tomava a compra (identificador, nome, telefone, cancelamento) | cada envio é uma compra nova; uma compra paga por e-mail; ao pagar uma, as outras do mesmo e-mail se encerram; se outra também for paga, vai para conferência |
| Ligar a cobrança automática com fatura manual antiga bloqueava na hora | `regua_desde`: a dívida antiga conta a partir da ativação/reativação |
| Pix antigo pago depois de trocar de plano: cobrado, sem conta, e a tela dizia "nada foi cobrado" | o pagamento é atendido; rotina e página de retorno conferem por 10 dias as compras encerradas; o texto não afirma mais que nada foi cobrado |
| Conta presa depois do 1º clique no link sem criar a senha; não existia "Esqueci a senha" | novo link vale enquanto a senha não foi escolhida (decide pelo perfil); "Esqueci a senha" criado |
| Link de pagamento antigo reaproveitado depois de corrigir o valor da fatura | o link guarda o valor; valor mudou, cobrança nova (e o painel invalida o link) |
| Contestação revertida depois de a clínica pagar de novo: cobrança em dobro sem alerta | vai para conferência como "duplicado"; o mesmo estado que volta com outro desfecho passa a pedir conferência |
| Contestação que muda de fase era ignorada | vai para conferência ("contestação atualizada") |
| Próxima cobrança ignorava mês pago adiantado; fatura manual adiantada fazia pular meses; volta de bloqueio no fim do mês gerava duas faturas com um dia de diferença | geração e "próxima cobrança" refeitas e testadas com datas simuladas |
| Rotas públicas devolviam detalhe de configuração; reenvio de link sem trava atômica; avisos de cobrança podiam sair duas vezes | frase fixa; reserva atômica; reserva do aviso antes de enviar |
| Credencial de teste em produção criaria contas com pagamento de mentira | credencial `TEST-` em produção trava a venda; pagamento de teste vai para conferência (`MERCADOPAGO_ACEITAR_TESTE=1` só em homologação) |
| Aviso no formato antigo (IPN) receberia 401 e seria repetido a cada 15 min | respondido com 200 sem processar (o formato novo e a conferência cobrem) |
| Administrador de filial via e pagava a assinatura e recebia e-mail de cobrança | só administrador da matriz (mesma regra do banco) |

### Como provei

- `e2e-assinatura.mjs` contra o app e um Mercado Pago falso que imita a API e
  o webhook assinado (número no item 19): vitrine, validações, valor
  manipulado ignorado, compra repetida com o mesmo e-mail sem tocar na
  primeira, recusa visível, aviso sem assinatura e com assinatura errada
  recusados, aprovação cria a conta completa, as outras compras do e-mail se
  encerram e a outra paga vai para conferência, aviso repetido três vezes não
  duplica nada, link do e-mail entra uma vez só, conta não fica presa antes da
  senha, a pessoa cria a senha, entra, cadastra paciente e agenda; fatura do
  mês, 9 dias de atraso → modo de consulta, pagamento reabre, segundo
  pagamento vai para conferência, estorno volta a dívida, webhook perdido
  resolvido pela página de retorno, Resend recusando dita na tela, ligar a
  cobrança com fatura antiga não bloqueia, mês adiantado e volta de bloqueio,
  compra abandonada expira, limites e origem das rotas públicas.
- Suíte do banco, grupo "Assinatura e cobrança": régua, modo de consulta em
  pacientes, prontuário, agenda e na função de agenda em partes, pagamento
  divergente, duplicado, estorno, contestação que muda de fase, contestação
  revertida com pagamento em dobro, compra paga de e-mail que já tem conta,
  várias compras do mesmo e-mail, geração mensal com datas simuladas e quem
  pode chamar cada função.
- No navegador: compra recusada → Pix aprovado → "Pagamento confirmado" →
  link do e-mail → senha criada → painel da clínica nova → Assinatura com o
  plano e a fatura paga (item 19).
- **Não provado:** nenhuma chamada ao Mercado Pago de verdade. O formato da
  assinatura do webhook e o sentido dos detalhes de contestação foram
  conferidos pela documentação e precisam de um teste com a conta de teste.

### Depende de vocês

1. Conta no Mercado Pago (pessoa jurídica), aplicação de Checkout Pro,
   credenciais de teste e de produção (`MERCADOPAGO_ACCESS_TOKEN`).
2. Webhook em Suas integrações > Webhooks: URL
   `<NEXT_PUBLIC_APP_URL>/api/pagamentos/webhook`, evento "Pagamentos"; a
   assinatura secreta vai em `MERCADOPAGO_WEBHOOK_SECRET`.
3. Um teste completo com as credenciais de teste (cartão aprovado e recusado,
   Pix, estorno) num servidor de homologação com `MERCADOPAGO_ACEITAR_TESTE=1`,
   antes de virar para produção.
4. Confirmar preços, régua (7 dias de tolerância, modo de consulta no 8º),
   o texto dos Termos sobre cobrança e cancelamento, e **os limites dos
   planos** (ver "Decisões para vocês" no fim).

---

## 6. LGPD — só a lista

`docs/LGPD-INVENTARIO.md`: 82 pontos em 18 temas (7 existem, 49 parciais, 25
ausentes; 1 não verificável pelo código), cada um com o que a lei pede, o que o
código faz hoje (arquivo e linha) e o que mudar, com esforço estimado. No fim,
a atualização de 18/11 com os dados novos desta entrega (compras, pagamentos,
limites das rotas públicas, relatos, registros de operação). **Nenhum código
foi mudado por causa da LGPD**; onde uma correção de outro item tocou um ponto
da lista, o ponto foi atualizado no texto. É levantamento técnico, não parecer
jurídico.

Os cinco mais urgentes, segundo o levantamento: Política e Termos prometem o
que o sistema não faz (backup duas vezes ao dia, exclusão em 90 dias,
"Stripe", hospedagem nos EUA, sem citar R2, Resend, Twilio, WhatsApp e
desktop); não existe caminho para apagar paciente nem conta; o backup interno
e a restauração mexem em todas as clínicas; o desktop guarda banco, sessão e
WhatsApp em claro; e quem lê o prontuário não fica registrado de forma útil.
Entrou na lista também: compras não pagas (nome, e-mail, telefone) sem prazo
de guarda.

---

## 7. Dados sensíveis

### O que mudou

- **Foto de paciente privada:** sai do bucket público; abre só por
  `/api/armazenamento/arquivo` (login + vínculo com a clínica), sem cache
  público; a tela mostra como objectURL (`hooks/useFotoPaciente.ts`). Trocar ou
  apagar a foto tira a cópia pública antiga. `scripts/mover-fotos-pacientes.mjs`
  move as fotos antigas (simulação por padrão).
- **Documento e HOF não são públicos:** abrem pela mesma rota com login e
  vínculo; o visualizador só aceita arquivo do próprio paciente ou imagem
  conferida pelos bytes, e só PDF vai para iframe (o XSS do item 2); o banco
  também recusa o registro (`20261128`). A impressão do HOF escapa tudo.
- **`/api/public/midia`** serve só logo da clínica e foto do profissional, no
  formato exato; o que não está registrado responde 404.
- **Logs sem dado clínico nem segredo:** `lib/registro.ts` limpa JWT, chaves,
  e-mail, CPF, CNPJ, telefone, UUID e URL de banco antes de gravar; as rotas
  devolvem frase fixa.
- **Cache por clínica, limpo no logout** (`lib/sessao.ts`); os modelos de
  anamnese deixaram de passar de um usuário para o próximo pelo navegador.

### Como provei

Ponta a ponta contra o app com dois usuários de redes diferentes: **65 de 65**
(antes: 24 de 39 — a foto ia para o bucket público e abria sem login). A
pessoa de outra rede recebe 403 na foto e no documento; visitante, 404;
documento com HTML gravado por um membro comum não vira iframe; suíte do banco
com os casos de documento.

### Depende de vocês

Depois do deploy: `node scripts/mover-fotos-pacientes.mjs` (lista) e depois
`--aplicar`.

---

## 8. Limpeza do banco — **parada antes do banco real**

### O que mudou

- `scripts/clean-db.mjs` reescrito (`npm run db:clean`). **Sem parâmetros só
  mostra o inventário**: o project ref, os donos da plataforma com os e-mails,
  quem mais tem nome Gabriel/Juliano sem ser dono, contagens (logins, perfis,
  redes, clínicas, pacientes, agendamentos, prontuário, financeiro, convites,
  notificações, compras) e os arquivos de cada bucket do R2 e do Storage.
- Para apagar são três travas juntas: `--apagar`, `--projeto=<ref>` igual ao
  do banco e `--manter=<e-mails>`, e só donos da plataforma podem ficar. Apaga
  logins, perfis e todas as tabelas de dados; mantém esquema, migrations e o
  catálogo de planos; apaga os arquivos do R2 e do Storage menos a foto de
  perfil dos donos; registra a própria limpeza na auditoria.
- `scripts/inventory-db.mjs` não rodava (variável inexistente) e mostrava o
  e-mail de todos: corrigido e mascarado.

### Como provei

Numa instância separada do banco de teste, com 6 logins, 4 clínicas, 13
pacientes e arquivos de mentira no R2 e no Storage: o inventário listou tudo;
projeto errado e "manter" quem não é dono foram recusados; a limpeza deixou os
2 donos, 0 clínicas, 0 pacientes, as migrations e os planos, e só a foto de
perfil do dono no R2.

### Onde parou

Sem o `.env.local`, o inventário do banco real **não foi mostrado** e nada foi
apagado (vocês pediram para seguir sem). Para ver o inventário (não apaga
nada):

    npm run db:clean

Só depois da confirmação de vocês, com o ref e os dois e-mails conferidos:

    npm run db:clean -- --apagar --projeto=<ref> --manter=<email do Gabriel>,<email do Juliano>

Antes: conferir o backup do Supabase (Database > Backups) e baixar o que
quiserem guardar. Até lá, a Mais Sorriso fica como está.

---

## 9. Painel SaaS

### O que mudou

- Abas **Redes**, **Assinaturas**, **Relatos** e **Operação** (o e-mail de
  relato e o de alerta abrem direto na aba certa).
- Por rede, aba **Assinatura**: plano, valor, estado (em dia, em atraso, modo
  de consulta, suspensa, cancelada), próxima cobrança, desde quando está em
  atraso, quando entra (ou entrou) em modo de consulta, prazo extra, a compra
  de origem com o estado do link de acesso, os pagamentos que o provedor
  informou e os e-mails de cobrança (enviado ou o motivo de não ter saído).
- **Ações:** ligar/desligar a cobrança automática, dar prazo extra, cancelar
  (com motivo) e reativar, dar um pagamento por conferido (com anotação),
  reenviar o link de acesso, refazer a criação de conta de uma compra paga,
  conferir uma cobrança no provedor, lançar/editar fatura e marcar como paga,
  cancelada, estornada ou contestada. Todas exigem dono da plataforma
  (`is_super_admin`, conferido no banco) e ficam em `audit_log` com o autor.
- Lista de redes com o estado da assinatura quando sai do normal; faturas com
  a origem (manual, automática, assinatura) e o estado do pagamento; fatura
  estornada ou contestada conta como em aberto e vencida nos totais e filtros;
  fatura paga pelo provedor não muda de valor nem de situação pelo painel.
- Aba **Assinaturas**: indicadores (em atraso, modo de consulta, pagamentos a
  conferir, compras com problema, e-mails que não saíram, recebido em 30
  dias), compras pela página e pagamentos que pedem conferência, com o motivo
  em português. O que fazer em cada motivo está em `docs/OPERACAO.md` (9.1).
- Aba **Relatos**: fila de bugs e sugestões (item 11). Aba **Operação**:
  alertas, batimento das rotinas e falhas (item 17).

### Como provei

Suíte do banco, grupo "Painel SaaS: assinaturas": quem não é dono não executa
nenhuma das funções; dono vê o resumo; cobrança automática não liga em rede
sem valor; cancelar põe a rede em modo de consulta; reativar devolve a
gravação; ações na auditoria com o autor; prazo extra limitado a 60 dias;
conferir pagamento exige anotação. No navegador, item 19.

---

## 10. Contato com o suporte

Cartão na Ajuda (`app/ajuda/CartaoSuporte.tsx`) com os dois números de
`NEXT_PUBLIC_SUPORTE_WHATSAPP_1` e `_2` (no pedido estavam como `[NÚMERO 1]` e
`[NÚMERO 2]`: os números reais são de vocês). Com o WhatsApp da clínica
conectado, tocar no número abre a conversa "Suporte Ortus" dentro do Ortus;
desconectado, sem serviço, fora do ar ou sem acesso às conversas, a tela diz
qual é o caso e mostra os números com o botão de copiar; com
`NEXT_PUBLIC_WHATSAPP_ATIVO=0`, mostra os números para chamar pelo celular;
sem as variáveis, diz que o contato não foi configurado (nenhum número
inventado). Não há chat interno.

**Depende de vocês:** os dois números (só dígitos, com DDI) no ambiente do
site e no build do aplicativo desktop.

---

## 11. Bugs e sugestões

Formulário na Ajuda (tipo, assunto, descrição; erro mantém o popup aberto,
sucesso avisa e fecha). Tabela `relatos_suporte` com RLS: quem enviou lê o
próprio; só os donos leem a fila, mudam o andamento e apagam; ninguém grava
direto pela API (só a rota, com limite por hora). Cada mudança de status vai
para a auditoria sem o texto livre. E-mail aos donos pela Resend com
"responder para" de quem relatou; **se a Resend falhar, o relato continua na
fila** e a coluna `email_erro` diz por quê.

**Como provei:** suíte do banco (grupo "Relatos ao suporte"), rota contra o
banco local com Resend falsa (aceite, 401, 400, 429 no sexto envio, Resend
fora do ar), typecheck.

---

## 12. Oracle Cloud (gratuito)

`docs/ORACLE.md` (passo a passo) e `deploy/oracle/`: unidades systemd do site,
do gateway do WhatsApp e dos três timers (lembretes 13:00 UTC, assinaturas
09:00 UTC, vigia a cada 15 min), `nginx-ortus.conf` e `Caddyfile` com HTTPS,
modelo do arquivo de ambiente fora do git (`/etc/ortus/ortus.env`) e
`chamar-rotina.sh` (lê o `CRON_SECRET` do arquivo, sem pôr o segredo na linha
de comando). O gateway fica em 127.0.0.1; o Nginx fecha `/api/local/*` e repassa
`X-Real-IP` (o limite das rotas públicas usa esse endereço); o log de acesso
não grava a busca. Inclui a saída da Vercel e os avisos reais do plano
gratuito.

**Como provei:** `chamar-rotina.sh` com 17 casos contra um servidor de mentira.
**Não provado:** nenhum comando rodou numa VM da Oracle; as unidades e as
configurações do Nginx/Caddy não passaram por `systemctl`, `nginx -t` nem
`caddy validate` (lista do que conferir na seção 18 do guia).

**Depende de vocês:** conta na Oracle, domínio e DNS.

---

## 13. WhatsApp em produção

- **Modo explícito:** `NEXT_PUBLIC_WHATSAPP_ATIVO=0` esconde a aba e os
  botões passam a abrir o wa.me; no site, sem `WHATSAPP_GATEWAY_URL` e
  `WHATSAPP_GATEWAY_SECRET`, a tela diz que o WhatsApp não está disponível
  neste endereço em vez de tentar conectar; em produção o site só sobe o
  serviço sozinho com `WHATSAPP_GATEWAY_AUTOSTART=1` (o padrão é a unidade
  systemd da Oracle ou o aplicativo desktop). Uma clínica, um lugar: aplicativo
  e servidor na mesma clínica mandariam as mensagens automáticas em dobro
  (documentado).
- Gateway só em 127.0.0.1 (outro endereço exige `WHATSAPP_GATEWAY_EXPOSE=1`
  e grava aviso); `GET /saude` sem conversa.
- **Erro cru do Node não aparece mais na tela:** frases fixas, detalhe em
  `falhas_servidor`.
- **Endurecimento (gravidade alta):** id de clínica não canônico (`012`,
  `0012`…) abria um Chromium novo a cada pedido e permitia parear uma
  sessão-fantasma; agora só `/^[1-9]\d{0,11}$/`, chave canônica, clínica tem
  que existir e há teto de sessões. Ler conversas e enviar exige o módulo da
  tela; conectar e desconectar exige administrador da clínica (não convidado).
- **Modo de consulta também no servidor** (achado da revisão do pagamento):
  o que o servidor grava com a chave de serviço passou a conferir a
  assinatura antes (`lib/escritaLiberada.ts`): enviar pelo WhatsApp, gerar
  link de anamnese e subir ou apagar arquivo da clínica respondem 402 com o
  aviso em modo de consulta (ler, baixar e conversar continuam). As mensagens
  automáticas do serviço (confirmação, lembrete, pós-consulta, aniversário,
  retorno, agendadas) param para a clínica em modo de consulta, como os
  lembretes do site. Falha ao conferir não libera em silêncio (503). Esses
  402 também acendem a faixa de assinatura na hora.

**Como provei:** serviço real com dublês do whatsapp-web.js (51 de 51; a
versão anterior falhava em 33), rota real contra o app com cinco perfis (43 de
43), caminho do aplicativo (21 de 21). **Não provado:** WhatsApp e Chromium de
verdade, leitura de QR real.

---

## 14. Ambiente, build e lembretes

### O que mudou

- `.env.example`, `README.md` e `docs/SEGURANCA.md` com a lista real de
  variáveis (saíram `R2_BUCKET` e `R2_ENDPOINT`, que o código não lia;
  entraram `NEXT_PUBLIC_APP_URL`, `RESEND_FROM_EMAIL`, `ALERTA_EMAILS`,
  `MERCADOPAGO_*`, `NEXT_PUBLIC_SUPORTE_WHATSAPP_*`, `WHATSAPP_GATEWAY_*`) e o
  checklist de migrations até `20261128`.
- `/api/lembretes/processar`: 401 sem `Bearer CRON_SECRET`; acha os
  agendamentos de amanhã no fuso de cada clínica (antes usava o cliente
  anônimo no servidor e nunca achava nada); reserva cada envio antes de mandar
  (`lembretes_agenda`, único por agendamento e canal) e desfaz a reserva se o
  provedor recusar; Resend ou Twilio ausentes não contam como "enviado"; a
  resposta não traz nome, telefone nem e-mail; pula clínica em modo de
  consulta e paciente de outra rede.
- `package.json`: saiu `landing:assets` (script removido); entrou `db:orfaos`.

### Como provei

401 sem o segredo; simulação achou os agendamentos de amanhã; um agendamento
→ um e-mail → a segunda chamada respondeu "já enviado"; com a Resend
recusando, erro registrado e nada marcado; clínica em modo de consulta fora da
fila e de volta depois do pagamento (`e2e-assinatura.mjs`). Typecheck e build
de produção no item 19.

### Depende de vocês

`.env.local`/ambiente do servidor com as variáveis da tabela do `README.md`,
`CRON_SECRET` e o agendador (timers da Oracle ou crons da Vercel).

---

## 15. Arquivos e cota

- Fluxo preparar → PUT → confirmar mantido; bytes mágicos conferidos;
  arquivo não confirmado responde 404; backup de configuração só `.json` de
  até 2 MB (a importação também passou a conferir cada seção e parou de
  apagar as taxas do Financeiro).
- Cotas mantidas (por clínica, 500 MB por pessoa em 24 h, 2 GB em 30 dias,
  teto de 9,5 GB da conta); um único medidor no Perfil, e a linha "conta
  inteira" só aparece para os donos.
- Envio direto ao bucket sem passar pela cota fechado no banco (`20261125`).
- **Mídia órfã:** `scripts/limpar-orfaos.mjs` (`npm run db:orfaos`) acha
  arquivo de paciente que não existe mais e arquivo da pasta `legado/` sem
  referência; simulação por padrão, apaga com `--apagar --projeto=<ref>`.
  Provado no banco de teste com fotos de HOF e o jpeg antigo do levantamento.
- **Originais no Supabase:** remover do Storage do Supabase só depois que o
  R2 estiver configurado em produção, `scripts/migrar-r2.mjs` tiver copiado
  tudo e a contagem bater (`npm run db:orfaos` sem nada a apagar e
  `node scripts/inspect-storage.mjs` igual dos dois lados). Até lá, o Storage
  do Supabase é a reserva de leitura.
- **Cobrança da Cloudflare:** painel da Cloudflare > R2 > visão geral e
  métricas (uso e operações por bucket); a fatura em Manage Account >
  Billing. Os limites gratuitos atuais estão em `docs/OPERACAO.md` (7).

---

## 16. Aplicativo desktop

- **Assinatura do instalador:** com certificado, o build assina sozinho
  (electron-builder e workflow do GitHub lendo segredos, nunca no
  repositório). `desktop/README.md` explica as duas opções reais —
  certificado OV/EV ou Azure Trusted Signing —, custo e efeito no SmartScreen.
  Build de lançamento com assinatura pedida e segredo faltando **falha**.
- **O instalador não leva segredo:** o build roda com ambiente saneado; um
  verificador (`scripts/desktop-verificar.mjs`, no build e no afterPack)
  procura `.env*` e os **valores** de service role, `DATABASE_URL`,
  `CRON_SECRET`, Resend, Twilio, R2, Mercado Pago e `WHATSAPP_GATEWAY_SECRET`
  dentro do que vai para o instalador e derruba o build.
- **Rede:** Next local, API de dados e gateway em 127.0.0.1 e portas sorteadas.
  Segredo de 32 bytes em userData, fora do .exe, sem chegar à página.
- **Prova de origem:** todo o servidor local só atende a janela do Ortus —
  `Host` local na porta certa, `Origin` próprio e um segredo por execução que
  o processo principal injeta nas requisições da janela. Site aberto no
  navegador da máquina, DNS rebinding e outro programa recebem 403.
- **Sincronização:** usa o JWT do usuário (nunca service role) e respeita as
  policies; conflito aparece em Configurações > Sincronização e nenhum lado é
  apagado sozinho; recusa definitiva do banco (modo de consulta 402,
  permissão 403) fica marcada com o motivo, sem laço de reenvio, e pode ser
  reenviada depois de pagar.

**Como provei:** `npm run desktop:teste` (79/79, 71/71, 50/50), rotas por HTTP
real (com e sem a prova), sincronização de ponta a ponta contra o banco local
(23 de 23), verificador com segredos de mentira, schema do electron-builder
validado. **Não provado:** o Electron aberto e o instalador gerado — o roteiro
de aceite está em `desktop/README.md`.

**Depende de vocês:** certificado de assinatura de código (ou conta no Azure
Trusted Signing) e gerar o instalador no Windows ou no CI.

---

## 17. Observabilidade e backup

- `lib/registro.ts` registra falha de servidor em `falhas_servidor` sem dado
  clínico nem segredo; limpa sozinho depois de 30 dias.
- `GET /api/saude` (pública, para monitor externo): banco, configuração e se o
  vigia está em dia; 503 quando o banco não responde ou o vigia sumiu.
- `GET /api/saude/vigia` (agendador, `CRON_SECRET`): batimento de cada
  rotina, falhas da última hora, gateway do WhatsApp em modo servidor e
  Resend; abre e fecha alerta sem duplicar e manda e-mail aos donos quando
  algo para e quando volta.
- Painel SaaS, aba **Operação**: alertas abertos, último sinal de cada rotina
  e falhas das últimas 24 horas.
- **Backup:** `docs/OPERACAO.md` descreve o que o backup interno faz de verdade
  (cópia de algumas tabelas no próprio banco; a restauração apaga e regrava
  **todas as clínicas**, por isso pede que se digite RESTAURAR e só aparece
  para os donos), o backup do próprio Supabase por plano e por quanto tempo um
  dado apagado continua nas cópias.

**Como provei:** 58 de 58 contra o app (saúde sem dado sensível, vigia 401 sem
segredo, alerta abre uma vez, e-mail sai uma vez, volta ao normal, Resend
fora, falhas acima do limite, limpeza por idade). **Depende de vocês:** conferir
no painel do Supabase o plano e os backups (Database > Backups) e cadastrar um
monitor externo apontado para `/api/saude`.

---

## 18. Ajuda

- Manual escrito a partir do código de cada tela: 18 assuntos com passos,
  listas e avisos, atualizado com assinatura (modo de consulta), convite pelo
  link do e-mail, comissões, Mensagens e limite de 10 MB.
- **Sem vídeo de exemplo:** a lista de tutoriais está vazia, com o aviso e um
  atalho para o guia (nenhum id de vídeo no código).
- Busca por título e por conteúdo, sem acento e sem caixa.
- Bugs corrigidos que o manual descrevia: a comissão de "Débito recebido"
  nunca era lançada; a de "Tratamento finalizado" duplicava a cada
  salvamento; o gatilho "Orçamento aprovado" aparecia e não fazia nada;
  Mensagens exigia um módulo que só o "acesso completo" tinha; salvar
  configuração sem ser administrador dizia "salvo" e não gravava.

---

## 19. Conferência final (navegador, testes) e `docs/SEGURANCA.md`

### Testes automatizados (última rodada, banco local refeito do zero com todas as migrations)

| Bateria | Resultado |
|---|---|
| Suíte de segurança (`npm test`) | **257 de 257** |
| Assinatura de ponta a ponta (compra, conta, limites do plano, régua, pagamento, estorno) | **77 de 77** |
| E-mail de ponta a ponta (convites, anamnese entre clínicas) | **30 de 30** |
| "Esqueci a senha" de ponta a ponta | **10 de 10** |
| Páginas (cada rota abre; públicas sem login, protegidas pedem login) | **67 de 67** |
| Vigia e saúde | **58 de 58** |
| Serviço do WhatsApp (com dublês) | **51 de 51** |
| Aplicativo desktop (`npm run desktop:teste`) | todas passaram |
| Typecheck (`tsc --noEmit`) | 0 erros |
| Build de produção | ok, 49 páginas |

Duas baterias antigas (WhatsApp e vigia) supõem dados que outros testes deixam
no banco (clínicas 5 a 7; um batimento recente da rotina de assinaturas). Num
banco recém-criado elas falham por isso; com as pré-condições recriadas,
passaram inteiras.

### No navegador (ambiente local; computador e celular de 360 a 375 px)

- **Compra de ponta a ponta:** pagamento recusado → Pix aprovado → "Pagamento
  confirmado" → link do e-mail → criação da senha → painel da clínica nova →
  Assinatura com o plano e a fatura paga.
- **"Esqueci a senha":** pedido, e-mail, link, aviso de senhas diferentes,
  senha nova salva e entrada no painel.
- **Open redirect:** `/login?redirect=/\golpe.example` e
  `/selecao?redirect=/\golpe.example` terminam no `/dashboard`.
- **Logout:** não sobra sessão, clínica, cache de lista nem modelo de anamnese.
- **Assinatura no celular (360×640):** em atraso e em modo de consulta, o
  Pagar aparece sem rolar, acima da barra de navegação.
- **Painel SaaS (1024 px):** na aba Assinaturas o bloco de Redes some; na aba
  Redes ele volta.
- **Configurações:** editar clínica abre com e-mail, telefone, cidade e
  horários reais.
- **Perfil:** rótulos no padrão, nada em maiúsculas.
- **Financeiro:** o popup novo "Registrar recebimento" cabe no celular;
  cancelar não recebe nada.
- **Varredura de 18 telas a 375 px** (Início, Agenda, Pacientes, Financeiro,
  Tarefas, Tratamentos, Laboratório, Configurações, Mensagens, Perfil,
  Assinatura, Painel SaaS, Relatórios, Ajuda, senha…): nenhuma com rolagem
  lateral. Nas sessões anteriores também foram percorridas a ficha do
  paciente, o popup de agendamento, Equipe, WhatsApp e checkout.

O painel do navegador desta sessão ficou oculto parte do tempo; a conferência
foi feita pelo texto da página, por medidas com script e por capturas
pontuais.

### O que não foi verificado

Nada em produção (sem `.env.local`), nenhuma chamada ao Mercado Pago, à Resend
ou à Cloudflare de verdade, o aplicativo Electron aberto, o instalador e o
WhatsApp/Chromium reais. O build de produção, esse sim, rodou de verdade: é a
demonstração do item 20.

### `docs/SEGURANCA.md`

Atualizado: checklist de deploy com as migrations até `20261128_ajustes_finais`
(na ordem), suíte com 257 verificações, variáveis de ambiente (incluindo
`MERCADOPAGO_ACEITAR_TESTE`), as proteções novas das rotas sem login e da
compra, e a nota de que nenhuma credencial de servidor vai no desktop.

---

## 20. Demonstração no ar (homologação)

O build de produção do Ortus está publicado numa VPS, contra serviços falsos.
Até aqui as baterias rodavam com o servidor de desenvolvimento e o build só era
compilado; agora o próprio `next start` atende pela internet, atrás do Nginx,
com as unidades de `deploy/oracle`.

| Endereço | O que é |
|---|---|
| https://ortus.trinityforce.duckdns.org | o Ortus |
| https://api.ortus.trinityforce.duckdns.org/caixa | caixa de e-mails da demonstração |
| https://tldr.ortus.trinityforce.duckdns.org | resumo das alterações (`docs/alteracoes-18-11-2026.html`) |

### Como funciona

- Banco PGlite em memória com todas as migrations até `20261128` e os dados
  de exemplo (Mais Sorriso com duas unidades, Bem Estar). Login, dados, R2,
  Resend e Mercado Pago são imitações no próprio servidor: nenhum e-mail,
  cobrança ou arquivo sai para a internet. Reiniciar a demonstração volta tudo
  ao estado inicial.
- O site roda com `ORTUS_HOMOLOGACAO=1` (novo, em `lib/servicosExternos.ts`;
  `docs/OPERACAO.md`, item 10), as `ORTUS_TESTE_URL_*` e
  `MERCADOPAGO_ACEITAR_TESTE=1`. Sem `ORTUS_HOMOLOGACAO`, o build de produção
  continua ignorando endereço trocado.
- WhatsApp desligado (`NEXT_PUBLIC_WHATSAPP_ATIVO=0`) e sem número de suporte.
- Contas de exemplo: ana.admin@maissorriso.test (administradora),
  bia.recepcao@maissorriso.test (recepção), caio.admin@bemestar.test,
  dani.dentista@bemestar.test, gabriel@ortus.test e juliano@ortus.test (donos
  da plataforma). A senha não fica no repositório. Qualquer pessoa pode testar
  a compra com um e-mail inventado e seguir o e-mail de acesso na caixa.

### Como provei (no ar, pela internet)

- **Compra de ponta a ponta (9 de 9):** vitrine com os três planos; compra
  pedida por outra origem recusada; tela do provedor com o valor do plano; Pix
  aprovado volta para o retorno do site; webhook assinado aceito, pagamento
  relido no provedor, conta criada; e-mail de acesso na caixa, com o link para
  o site publicado; caixa das contas de exemplo fechada.
- **Arquivo:** link de envio pedido ao app (`/api/armazenamento`) por uma conta
  de exemplo; o envio pela internet com o link certo passa; com outro tipo de
  arquivo, com a assinatura adulterada ou lendo o arquivo direto de fora, é
  recusado; confirmar e baixar pela rota do app devolve o mesmo conteúdo.
- **Rotinas** (assinaturas, lembretes, vigia) pelo
  `deploy/oracle/chamar-rotina.sh`: as três com HTTP 200; os lembretes geraram
  5 e-mails, que aparecem na caixa; o vigia respondeu "tudo normal".
  `/api/saude`: banco, configuração e agendador ok.
- **Kit da Oracle numa VM de verdade** (Ubuntu 24.04 ARM): `npm ci
  --ignore-scripts --include=dev` em 24 s, build em 1 min 7 s, `next start`
  com o endurecimento de `ortus.service` (sistema só-leitura), bloqueio de
  `/api/local/*` no Nginx e `chamar-rotina.sh` funcionaram sem ajuste.
- **No navegador:** login, compra e caixa de e-mails abrem sem erro no
  console; HSTS, `X-Frame-Options` e `noindex` nas respostas.

### Proteções da demonstração (por ser pública)

As rotas de teste (SQL, sementes, controles do provedor) não existem. O e-mail
falso, a API do pagamento e a administração do login só atendem a própria
máquina. Arquivo de fora só entra por PUT com link assinado de verdade (SigV4,
60 s), e ler, listar ou apagar só pelo site. A caixa de e-mails mostra um
endereço por vez e fica fechada para as contas de exemplo. Há limite de
pedidos por IP, teto de memória e de CPU, e `noindex`.

### O que a demonstração não prova

Nada fala com o Supabase, a Resend, o Mercado Pago ou a Cloudflare de verdade.
O banco é o PGlite, não o Postgres do Supabase, e o servidor falso atende um
pedido por vez.

---

## O que depende de vocês (lista única)

1. **`.env.local` / ambiente do servidor** com as variáveis do `README.md`
   (Supabase, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, Resend, Mercado Pago,
   suporte, R2, WhatsApp). Sem ele nada foi verificado em produção.
2. **Migrations** `20261120` a `20261128` na ordem do checklist de
   `docs/SEGURANCA.md`, e depois `npm test` e `npm run db:audit` no projeto
   real.
3. **Resend:** conta, domínio verificado (SPF/DKIM), chaves e o SMTP do
   Supabase apontado para a Resend.
4. **Mercado Pago:** conta PJ, Checkout Pro, credenciais, webhook com a
   assinatura secreta e um teste completo em homologação.
5. **Suporte:** os dois números de WhatsApp.
6. **Oracle:** conta, VM, domínio e DNS (guia em `docs/ORACLE.md`), ou manter
   a Vercel com os crons.
7. **Desktop:** certificado de assinatura de código (ou Azure Trusted Signing).
8. **Depois do deploy:** `mover-fotos-pacientes` (lista, depois `--aplicar`),
   `npm run db:orfaos` e, só com o R2 conferido, a remoção dos originais do
   Supabase.
9. **Limpeza do banco:** rodar `npm run db:clean` (só inventário), conferir e
   confirmar; só então a limpeza com as três travas (item 8).
10. **Monitor externo** em `/api/saude` e conferir o backup do Supabase.
11. `npm uninstall svg-path-bbox` numa máquina com o toolset C++ (dependência
    sem uso; a regra é não rodar `npm install` na raiz). No servidor do site, a
    instalação é `npm ci --ignore-scripts --include=dev` (o `better-sqlite3`
    só serve ao desktop; motivo em `docs/ORACLE.md`).

## Decisões para vocês

- **Limites dos planos — aplicados.** Antes da migration, confiram no painel
  o plano de cada rede que já existe: rede que alguém marcou à mão como Básico
  ou Profissional passa a ter limite (quem já está continua). As outras
  ("essencial", o padrão) seguem sem limite. "Financeiro completo",
  "Anamnese personalizada" e "Gestão avançada" continuam só texto da vitrine.
- **Régua:** 7 dias de tolerância e modo de consulta no 8º; prazo extra até 60
  dias.
- **Permissão de módulo na RLS** (item 2) e **prazo de guarda das compras não
  pagas** (item 6).
- **Agenda:** na visão Profissionais, quem não é administrador consegue marcar
  na coluna de outro profissional (pode ser o uso da recepção hoje); em "Todas
  as clínicas", quem tem clínica própria e é convidado em outra é tratado como
  administrador também nessa outra (item 4).
- **Modo de consulta:** a resposta de anamnese que o paciente envia por um link
  gerado antes do bloqueio é aceita (o dado é do paciente); as cores dos
  quadros do Laboratório só o administrador grava.
- **Taxas dos lançamentos (`lancamentos_meta`):** ficam num JSON único por
  clínica. As telas agora releem antes de gravar e nunca gravam por cima numa
  falha de leitura, mas duas gravações exatamente ao mesmo tempo ainda podem
  perder uma. A solução de vez é uma migration (gravar por lançamento, ou
  mesclar no banco); fica para depois do lançamento.
