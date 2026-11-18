# Ortus Desktop

Aplicativo Windows (Electron + NSIS) que roda o Ortus na máquina da clínica,
com banco local e WhatsApp embutido. O site continua existindo e compartilha
o mesmo Supabase — o desktop é uma camada em volta do produto atual, não um
sistema novo.

---

## Como funciona

```
┌───────────────────────── Ortus.exe (Electron) ─────────────────────────┐
│                                                                        │
│  janela (Chromium)  ──►  http://127.0.0.1:<porta next>                 │
│   + cabeçalho x-ortus-janela │                                         │
│     (só o processo principal │  Next local (filho, ELECTRON_RUN_AS_NODE)│
│      conhece o valor)        ├── /api/*            (rotas do produto)   │
│                              ├── /api/local/*      (dados do desktop)   │
│                              └── /api/whatsapp ──► 127.0.0.1:<whatsapp>│
│                                                          │             │
│  processo principal ───────────────────────────────┐     │             │
│   • SQLite  userData/ortus.db                      │     ▼             │
│   • API de dados 127.0.0.1:<db>  ◄─────────────────┼── server.mjs       │
│   • motor de sincronização (outbox ⇄ Supabase)     │   (whatsapp-web.js)│
│   • sessão em cache, segredos, logs                │                    │
└────────────────────────────────────────────────────┼────────────────────┘
                                                     │ chave pública + JWT do usuário
                                                     ▼
                                              Supabase (backup)
```

Três processos, todos em `127.0.0.1`:

| Processo | Responsabilidade |
|---|---|
| **principal** (Electron) | dono do SQLite, do motor de sincronização, dos segredos e da API de dados |
| **Next local** | serve a interface e as rotas `/api/*`; conversa com a API de dados e com o WhatsApp |
| **WhatsApp** | `services/whatsapp/server.mjs` (whatsapp-web.js + LocalAuth + Puppeteer) |

O SQLite pertence a **um** processo de propósito: um módulo nativo em dois
processos geraria conflito de escrita e cache divergente. Por isso o Next e o
WhatsApp falam com a API de dados (HTTP + segredo) em vez de abrir o arquivo.

---

## Desenvolvimento

```bash
npm install
npm --prefix services/whatsapp ci          # whatsapp-web.js + puppeteer
node scripts/desktop-chromium.mjs --atual  # Chromium local para o Puppeteer
npm run desktop                            # abre o shell
npm run desktop:teste                      # testes do desktop (sem abrir janela)
```

> **Atenção:** se a variável `ELECTRON_RUN_AS_NODE` estiver definida no seu
> terminal (comum em IDEs/CI), o Electron roda como Node puro e o app não
> abre. Use `env -u ELECTRON_RUN_AS_NODE npm run desktop`.

Em desenvolvimento os dados ficam em
`~/Library/Application Support/OrtusDesktopDev` (macOS) ou
`%APPDATA%\OrtusDesktopDev` (Windows) — separado de uma instalação real.

---

## Gerar o instalador

O mesmo código gera instalador para **Windows, macOS e Linux** — cada sistema
empacota o seu (o binário do Electron e o Chromium são por plataforma).

| Sistema | Comando | Saída |
|---|---|---|
| Windows x64 | `npm run desktop:win` | `dist-desktop/Ortus-Setup-<versão>.exe` (NSIS) |
| macOS (arm64 + x64) | `npm run desktop:mac` | `dist-desktop/Ortus-<versão>-<arch>.dmg` e `.zip` |
| Linux x64 | `npm run desktop:linux` | `dist-desktop/Ortus-<versão>-x64.AppImage` e `.deb` |

> O **.exe do Windows precisa ser gerado no Windows ou no CI**. O macOS só
> consegue montar NSIS com wine instalado. Para os outros dois, rode no
> próprio sistema.

### Passo a passo (no sistema alvo)

```bash
# 1. variáveis públicas do Supabase (as mesmas do site)
export NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 2. dependências do WhatsApp e Chromium da plataforma
npm --prefix services/whatsapp ci
node scripts/desktop-chromium.mjs            # baixa o Chrome desta máquina
#    (para empacotar Windows a partir do macOS: --plataforma=win64)

# 3 + 4. build do Next (standalone) + config.json + verificação de segredos,
#        e o instalador (Windows: veja "Assinatura digital" logo abaixo)
ORTUS_ASSINATURA=nenhuma npm run desktop:win  # teste local, sem assinatura, declarado
npm run desktop:instalar                     # empacota para o sistema atual
```

No PowerShell a variável vai antes, em outra instrução:
`$env:ORTUS_ASSINATURA = 'nenhuma'; npm run desktop:win`. Só o build, sem
instalador: `npm run desktop:build`.

`npm run desktop:build` faz, nesta ordem: gera `desktop/config.json`, roda o
`next build` com o ambiente saneado, copia `public/` e `.next/static` para o
standalone, tira dele as cópias de `.env` e confere a pasta com o verificador
de segredos. Qualquer etapa que falhe para o build.

**Assinatura no macOS:** sem isso o sistema encerra o app na abertura, mesmo
sem Gatekeeper. O `desktop/afterpack.cjs` assina ad-hoc automaticamente a cada
build. Para distribuir fora da clínica é preciso conta Apple Developer
(Developer ID + notarização); aí basta definir `CSC_LINK`/`CSC_KEY_PASSWORD` e
a assinatura ad-hoc deixa de ser usada.

**Empacotamento — armadilhas já tratadas:** o matcher do electron-builder
ignora `node_modules` quando copia uma pasta inteira, então o Next standalone e
o serviço do WhatsApp entram em entradas separadas de `extraResources`; e o
extrator do Puppeteer às vezes deixa o `.app` do Chromium incompleto — o
`desktop-chromium.mjs` valida e refaz a extração com `ditto`/`unzip`/`tar`.

### O que entra no .exe

| Caminho | Conteúdo |
|---|---|
| `resources/app/` | servidor Next autocontido (`output: 'standalone'`) |
| `resources/whatsapp/` | `server.mjs` + `node_modules` (whatsapp-web.js, qrcode) |
| `resources/chromium/` | Chrome for Testing do Puppeteer |
| `resources/config.json` | URL + chave **anônima** do Supabase |
| `app.asar` | shell Electron + `better-sqlite3` (binários NAPI por plataforma) |

### O que **não** entra — e não pode entrar

Nenhum segredo do servidor do site e nenhum arquivo `.env*` (os de exemplo,
`.env.example`, não contam):

- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`,
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `DATABASE_URL`
- `CRON_SECRET`, `RESEND_API_KEY`, `WHATSAPP_GATEWAY_SECRET`
- tudo que começa com `TWILIO_`, `R2_` e `MERCADOPAGO_`
- os segredos da assinatura (`CSC_*`, `WIN_CSC_*`, `AZURE_CLIENT_SECRET`…) e
  `GH_TOKEN`/`GITHUB_TOKEN`

Três barreiras, cada uma com teste em `npm run desktop:teste`:

1. **`scripts/desktop-config.mjs`** só grava a chave pública: recusa JWT com
   papel `service_role`, chave no formato `sb_secret_…` e chave pública que
   tenha o mesmo valor de uma variável proibida. O aplicativo aplica a mesma
   regra ao abrir (`desktop/lib/chavePublica.cjs`) e não roda com chave de
   servidor.
2. **Ambiente saneado no `next build`** (`ambienteDoBuild`, em
   `scripts/desktop-verificar.mjs`): passam só as variáveis do sistema, de
   rede (proxy e certificado) e as `NEXT_PUBLIC_*`. Os nomes que não são
   públicos e estão nos `.env*` da raiz entram **vazios**, e o Next não
   sobrescreve variável que já existe — o valor do arquivo nunca é carregado.
   Máquina de build com exigência própria: `ORTUS_BUILD_ENV_EXTRA=NOME1,NOME2`
   (nome proibido não passa nem por aí).
3. **Verificador** (`scripts/desktop-verificar.mjs`): procura arquivos `.env*`
   (soltos ou dentro do `app.asar`), os **valores** das variáveis proibidas
   presentes no ambiente ou nos `.env*` de quem faz o build e os formatos
   conhecidos de chave (JWT `service_role`, `sb_secret_…`, conexão do Postgres
   com senha). O relatório mostra só o nome da variável e o arquivo, nunca o
   valor. Roda duas vezes: no fim do `desktop:build` (sobre o standalone, a
   pasta `desktop/` e o serviço do WhatsApp) e no `desktop/afterpack.cjs`
   (sobre a pasta final do aplicativo, antes de o instalador ser montado).
   Achou alguma coisa, o build para. Para rodar à mão:
   `node scripts/desktop-verificar.mjs [pasta ...]`.

O que o Next 16 faz por conta própria, conferido no código instalado:

- com `output: 'standalone'`, o `next build` **copia `.env` e `.env.production`
  da raiz para dentro de `.next/standalone`** (`writeStandaloneDirectory`, em
  `node_modules/next/dist/build/index.js`), e o servidor autocontido os lê ao
  subir. O `desktop:build` apaga essas cópias e o verificador confere.
  `.env.local` não é copiado;
- valor sem o prefixo `NEXT_PUBLIC_` não vai para o JavaScript do navegador,
  mas pode ficar gravado no que o build gera no servidor: páginas renderizadas
  durante o build (HTML e RSC em `.next/server`) que leiam a variável, e a
  chave `env` do `next.config` (o `next.config.ts` do Ortus não a usa). Por
  isso o build roda com o ambiente saneado.

---

## Assinatura digital (Windows)

**Sem assinatura** o Windows mostra *"O Windows protegeu o seu PC"* e
*Fornecedor desconhecido*; a pessoa precisa clicar em **Mais informações →
Executar assim mesmo**, e antivírus corporativo pode bloquear o arquivo.
Serve para teste, não para distribuir.

**Com assinatura** o nome da empresa aparece como fornecedor verificado e
qualquer alteração no arquivo quebra a assinatura. Mas a assinatura **não
some com o SmartScreen na hora**: o aviso depende da reputação, que se forma
com o volume de instalações sem denúncia ao longo de semanas, e é preciso
assinar todas as versões com a mesma identidade para não recomeçar. A Microsoft
deixou, em 2024, de dar reputação imediata ao certificado EV — hoje OV, EV e
Trusted Signing começam do mesmo jeito. Confira a página atual da Microsoft
sobre reputação do SmartScreen antes de comprar.

### As duas opções

| | Certificado de assinatura de código (OV ou EV) | Azure Trusted Signing |
|---|---|---|
| Quem emite | autoridade certificadora (Sectigo, DigiCert, GlobalSign, SSL.com…), direto ou por revenda no Brasil | Microsoft, dentro de uma assinatura do Azure |
| Custo aproximado | OV: US$ 200 a 400 por ano; EV: US$ 300 a 700 por ano (preço de revenda varia; o token entra no pacote ou é cobrado à parte) | US$ 9,99 por mês no plano básico (5.000 assinaturas); US$ 99,99 no premium |
| Validação | da empresa (CNPJ e documentos); EV é mais rigorosa | da empresa, pela Microsoft |
| Onde fica a chave | desde junho de 2023 só em hardware (token USB ou HSM na nuvem da autoridade): certificado novo **não vem mais como arquivo .pfx** | na Microsoft; o certificado tem validade curta e é renovado sozinho |
| Roda no GitHub Actions? | só com `.pfx` antigo ou exportável; com token, o build tem de rodar no Windows onde o token está espetado (o computador do responsável ou um runner próprio) | sim, com uma credencial de aplicativo do Azure (service principal) |
| Cuidado | o PIN do token é pedido na assinatura | a validação de identidade pública foi aberta só para empresas de alguns países (Estados Unidos, Canadá, União Europeia e Reino Unido, com 3 anos de existência); na última conferência o Brasil não estava na lista — confirme antes de contar com ela |
| SmartScreen | reputação construída com o tempo | reputação construída com o tempo |

Para uma empresa brasileira, o caminho que funciona hoje costuma ser o
**certificado OV em token**, assinando na máquina Windows onde o token está.

### Como ligar

A configuração mora em `desktop/assinatura.cjs`, que o
`desktop/electron-builder.yml` herda (`extends`). Ela é calculada na hora do
build, a partir do ambiente: nenhum certificado, senha ou conta fica no
repositório.

| Variável | Para quê |
|---|---|
| `ORTUS_ASSINATURA` | `certificado`, `azure` ou `nenhuma` |
| `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` | certificado em arquivo `.pfx` (caminho ou base64) e a senha dele |
| `ORTUS_ASSINATURA_SUJEITO` ou `ORTUS_ASSINATURA_SHA1` | certificado em token ou no repositório de certificados do Windows (nome do titular ou impressão digital) |
| `ORTUS_ASSINATURA_CARIMBO` | servidor de carimbo de tempo RFC 3161 (opcional; sem ela vale o padrão do electron-builder) |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | credencial do aplicativo no Azure |
| `ORTUS_AZURE_ENDPOINT`, `ORTUS_AZURE_CONTA`, `ORTUS_AZURE_PERFIL`, `ORTUS_AZURE_PUBLICADOR` | endpoint da região, conta de assinatura, perfil de certificado e nome do publicador |

- **No GitHub Actions** (`.github/workflows/desktop-windows.yml`): variável do
  repositório `ORTUS_ASSINATURA`; segredos `WIN_CSC_LINK`,
  `WIN_CSC_KEY_PASSWORD`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET`; variáveis `ORTUS_AZURE_*`. Ao rodar à mão, a entrada
  *assinatura* troca a variável do repositório. Os segredos de assinatura só
  existem no passo que monta o instalador, e o artefato sem assinatura sai com
  o nome `ortus-desktop-windows-SEM-ASSINATURA`.
- **Na sua máquina**: as mesmas variáveis no terminal ou no arquivo
  `electron-builder.env` na raiz (o electron-builder carrega sozinho e não o
  empacota). Esse arquivo **não pode ir para o repositório**. Com token USB:
  `ORTUS_ASSINATURA=certificado ORTUS_ASSINATURA_SUJEITO="Nome da Empresa" npm run desktop:win`.

### O que acontece em cada caso

| `ORTUS_ASSINATURA` | Ambiente | Resultado |
|---|---|---|
| vazia | nenhum dado de assinatura | instalador **sem assinatura**, com aviso no terminal |
| vazia | todos os dados de uma opção | assina, e a assinatura passa a ser obrigatória |
| vazia | metade dos dados (ex.: `.pfx` sem senha) | o build **para** e lista o que falta |
| `nenhuma` | qualquer | sem assinatura, de propósito (nem com certificado no ambiente) |
| `certificado` ou `azure` | falta algum dado | o build **para antes de compilar**, com o nome de cada variável que falta |
| `certificado` ou `azure` | completo | assina; `forceCodeSigning` faz o build falhar se um arquivo ficar sem assinar, e no fim o `.exe` é conferido com `Get-AuthenticodeSignature` — estado diferente de `Valid` derruba o build |

Conferir à mão: botão direito no `.exe` → **Propriedades → Assinaturas
Digitais**, ou `Get-AuthenticodeSignature .\Ortus-Setup-<versão>.exe` no
PowerShell.

---

## Segurança na máquina da clínica

**Rede.** O Next local, a API de dados e o gateway do WhatsApp escutam só em
`127.0.0.1`, em portas escolhidas a cada abertura (a API de dados pede a porta
ao sistema no próprio `listen`). O gateway nunca sai do `127.0.0.1`, nem que o
ambiente do Windows traga `WHATSAPP_GATEWAY_EXPOSE`. O log mostra as três
portas ao subir.

**Segredos internos.** `segredos.json`, no `userData`, guarda dois valores de
32 bytes gerados na primeira execução: o da API de dados e o do gateway do
WhatsApp (valor fora do formato é trocado). Eles seguem só por variável de
ambiente para os processos filhos — nunca para a janela. O segredo da prova
de janela nasce a cada abertura e não vai para o disco.

**Janela.** `contextIsolation`, `sandbox`, sem `nodeIntegration`, sem
`preload` e sem `<webview>`: a página não tem nenhuma API do Node. Navegação
para fora do endereço local abre no navegador padrão (só `http`, `https` e
`mailto`). Janela nova: em branco (impressão) ou endereço do próprio app abre
dentro, com as mesmas proteções; o resto vai para o navegador. Permissões
(câmera, microfone, localização…): as páginas do app têm todas; conteúdo de
fora embutido (vídeo de tutorial) só ganha tela cheia.

**Prova de origem das rotas `/api/local/*`.** Escutar em `127.0.0.1` não
basta: um site aberto no navegador da mesma máquina alcança esse endereço, e
com DNS rebinding consegue até ler a resposta. Cada requisição precisa provar
(`desktop/lib/origemLocal.cjs` e `lib/local/janela.ts`):

1. `Host` igual a `127.0.0.1:<porta>` ou `localhost:<porta>` — derruba o DNS
   rebinding;
2. `Origin` ausente ou a do próprio app, e `Sec-Fetch-Site` ausente,
   `same-origin` ou `none` — derruba site de terceiros e iframe externo;
3. cabeçalho `x-ortus-janela` com o segredo desta execução. Quem põe é o
   processo principal (`session.webRequest.onBeforeSendHeaders`), só em
   requisição ao endereço local iniciada pelo próprio app; de qualquer outra
   ele retira. O JavaScript da página não enxerga o valor;
4. nas rotas que leem corpo (`db`, `sessao`, `entrar`, `conflitos`),
   `Content-Type: application/json` — formulário e `text/plain`, que outra
   página manda sem preflight, recebem 415.

Sem a prova a resposta é 403, e sem o segredo configurado no servidor nada
passa. `/api/local/sessao/restaurar` e `/api/local/entrar`, que devolvem o
token de renovação, só respondem com a prova. Ao abrir, o programa confere uma
vez que o servidor local aceitou a janela; se não aceitou, avisa em vez de
cair calado no modo site. Hoje **só as rotas `/api/local/*`** conferem a
prova; as páginas e as outras rotas do Next local ainda não.

A **API de dados** do processo principal recusa qualquer `Origin` (navegador
nunca fala com ela), `Host` que não seja o da porta dela, e pedido sem o
segredo `db`.

Erro inesperado numa rota local volta para a tela como frase fixa; o detalhe
(texto do SQLite ou da nuvem) fica no log do programa.

---

## Dados na máquina da clínica

```
<userData>/
  ortus.db               banco local (SQLite, WAL)
  arquivos/              fotos, documentos e mídia do WhatsApp
  wwebjs/session-<clinica_id>/   sessão do WhatsApp por clínica
  segredos.json          segredos internos (API de dados e WhatsApp)
  sessao.json            sessão do Supabase em cache (login offline)
  logs/ortus.log         log do processo principal (2 MB, 1 backup)
```

A configuração pública do Supabase vem dentro do instalador
(`resources/config.json`), não do `userData`.

`userData` no Windows é `%APPDATA%\Ortus`. Nada disso é apagado ao instalar
uma versão nova — só ao desinstalar, e mesmo assim os dados permanecem
(`deleteAppDataOnUninstall: false`).

---

## Sincronização

- **Toda escrita local** entra em `sync_outbox` na mesma transação da escrita.
- A cada **5 segundos** (e sempre que o app abre) o motor:
  1. **recebe** o que mudou desde a posição guardada de cada tabela
     (`updated_at` + chave da última linha lida);
  2. **envia** a outbox em ordem (tabela pai antes da filha), com upsert pela
     chave primária no PostgREST, levando a **chave pública e o JWT do
     usuário** — nunca service role. Quem decide o que este computador lê e
     grava são as policies por clínica da nuvem.
  Receber antes de enviar é o que faz o conflito aparecer: enviar primeiro
  gravaria por cima da nuvem sem ninguém ficar sabendo.
- **Sem internet**, nada é descartado: a outbox fica no SQLite e o ciclo
  recomeça sozinho quando a rede volta. A linha leva o id criado aqui, então
  reenviar depois de uma queda (até com a resposta perdida no caminho)
  atualiza a mesma linha em vez de criar outra.
- **Conflito** (a nuvem mudou a linha depois da versão sobre a qual a escrita
  daqui foi feita): as **duas versões** vão para `sync_conflitos`; vence por
  ora o carimbo mais novo, e quem decide de vez é a pessoa, em
  **Configurações → Sincronização**. A escolha sobe para a nuvem e chega aos
  outros computadores. Nenhum lado é apagado sozinho.
- **Recusa da nuvem**: escrita que a nuvem nega não fica em laço de
  tentativas. Sai da fila como conflito *recusado*, com a versão daqui
  guardada e a linha local intacta:
  - **402 / PT402** — a rede está em **modo de consulta** (fatura vencida há
    mais de 7 dias): na hora, na primeira resposta. A leitura continua;
  - **403 / 42501** — a RLS ou um gatilho negou a este usuário (comissão de
    quem não é administrador, `whatsapp_envios` não se apaga pela API, link
    de anamnese não é prorrogado nem reaberto…): na hora;
  - outro 4xx (constraint, coluna ou tabela que a nuvem não tem): tenta uma
    vez por ciclo e vira conflito depois de 12 tentativas;
  - 5xx ou sem rede: para o ciclo e tenta de novo depois.
  Na tela, cada recusa diz o motivo com texto fixo e oferece **Tentar enviar
  de novo** ou **Descartar a alteração daqui** (que volta a mostrar o que
  está na nuvem). Recusas do modo de consulta podem ser reenviadas todas de
  uma vez, depois de regularizar a assinatura.
- **Exclusão viaja**: um gatilho `AFTER DELETE` no Postgres grava em
  `sync_exclusoes`; as outras máquinas baixam esse "túmulo" e apagam local.
  Sem isso, um registro apagado na recepção voltaria a aparecer no consultório.
- **Relógio único**: `updated_at` é carimbado por gatilho no servidor, em
  INSERT e UPDATE. A hora do PC da clínica nunca decide conflito.
- **Primeiro uso**: baixa a clínica inteira para o SQLite antes de liberar a
  tela (bootstrap). Instalação nova em outro PC, com login online, reconstrói
  o backup mais recente.
- **Espelho e colunas novas**: o espelho de cada tabela está em
  `desktop/lib/esquema.cjs`. Coluna que a nuvem tem e o espelho não conhece é
  ignorada no pull (e o envio não a apaga, porque só manda as colunas do
  espelho). Banco local de uma versão anterior ganha as colunas novas ao abrir
  (`ALTER TABLE`) e a tabela desce inteira de novo — é assim que
  `profissionais_clinicas.convidado` (migration `20261121`) chega às linhas que
  já existiam.

### Tabelas sincronizadas

`clinicas`, `profissionais`, `profissionais_clinicas`, `especialidades`,
`planos`, `tratamentos_base`, `planos_tratamentos`, `permissoes_modulos`,
`profissionais_horarios`, `pacientes`, `configuracoes_clinica`,
`agendamentos`, `lembretes_agenda`, `despesas`, `kanban_colunas`,
`kanban_cartoes`, `paciente_tratamentos`, `paciente_anamneses`,
`paciente_evolucoes`, `paciente_documentos`, `paciente_debitos`, `tarefas`,
`comissoes_regras`, `comissoes_lancamentos`, `notificacoes`,
`anamnese_links`, `convites_equipe`, `whatsapp_agendadas`, `whatsapp_envios`,
`whatsapp_mensagens` — nesta ordem (`ORDEM_SYNC`). `audit_log` fica só no
computador: não entra na fila de envio.

Todas têm `updated_at` (migrations `20261117_desktop_sync.sql` em diante, com
gatilho) e espelho no SQLite.

### Ids

- tabelas com chave `uuid` → uuid v4 gerado aqui;
- tabelas com chave `bigint` → **inteiros negativos**, que nunca colidem com
  a sequence do Postgres.

---

## Funciona sem internet?

| Recurso | Offline |
|---|---|
| Agenda, pacientes, prontuário, débitos, tarefas | ✅ |
| Histórico de WhatsApp já gravado | ✅ |
| Enviar mensagem no WhatsApp | ⏳ fica na fila e sai quando conectar |
| Caixa de mensagens do WhatsApp (lista) | ✅ (do SQLite) |
| Login | com a conta já usada neste computador e a mesma senha |
| Super-admin, convites, SMS, link de anamnese | ❌ (precisa de rede) |

---

## Operação

**Logs:** `<userData>/logs/ortus.log`.

**Resetar tudo:** feche o Ortus e apague a pasta `userData`. Isso apaga o
banco local (o backup na nuvem continua no Supabase) — antes, confira em
Configurações → Sincronização que nada está aguardando envio.

**Reconectar o WhatsApp:** na aba WhatsApp, “Desconectar” e leia o QR de novo.
Fechar o programa **não** desloga.

**Portas:** escolhidas em runtime (nenhuma fixa). O log mostra as três ao
subir (`tudo pronto: next=… db=… whatsapp=…`).

---

## Testes automáticos

`npm run desktop:teste` (sem abrir janela, sem internet e sem o Supabase real)
roda três conjuntos:

| Script | O que prova |
|---|---|
| `scripts/desktop-checar.mjs` | banco local (schema, ids, outbox, conflito, túmulo), prova de origem do lado do Electron e do servidor, verificador de segredos com pasta de mentira, ambiente saneado do build e plano de assinatura |
| `scripts/desktop-sync-teste.mjs` | o motor de sincronização de verdade contra uma nuvem de mentira em `127.0.0.1`: cópia inicial com milhares de linhas de mesmo carimbo, offline e volta sem duplicar (inclusive com resposta perdida), conflito entre dois computadores, exclusão compartilhada, recusa por permissão (403) e por modo de consulta (402) sem laço de tentativas, constraint (409) com 12 tentativas, banco antigo ganhando `convidado` e `motivo`, coluna desconhecida da nuvem, e que toda chamada levou só a chave pública e o JWT do usuário |
| `scripts/desktop-rotas-teste.mjs` | os arquivos `route.ts` de `/api/local/*` de verdade, ligados à API de dados e a um SQLite: a janela é atendida (inclusive sem token, como no login offline); site externo, DNS rebinding, outro programa e iframe externo recebem 403 em todas as rotas; corpo que não é JSON recebe 415; erro interno volta como frase fixa; e o mesmo por **HTTP de verdade** em `127.0.0.1` (sem o cabeçalho, `Host` trocado, `Origin` de outro site, `text/plain`), além da API de dados |

O `better-sqlite3` 13 traz binários NAPI prontos (`node_modules/better-sqlite3/prebuilds`),
então os testes rodam no Node sem compilar nada. O teste das rotas precisa de
um Node que rode TypeScript direto (22.18 ou mais novo); em Node mais antigo
ele avisa e pula.

---

## Roteiro de teste real (aceite)

Marcação de cada passo:
**[auto]** provado por `npm run desktop:teste`;
**[leitura]** conferido lendo o código;
**[instalador]** só se confirma rodando o `.exe` numa máquina Windows.

1. **Gerar o instalador** com `ORTUS_ASSINATURA=nenhuma npm run desktop:win`
   (ou pelo GitHub Actions). O build termina com *nenhum arquivo de ambiente e
   nenhum segredo encontrado*, nas duas varreduras. **[auto]** verificador e ambiente do
   build com pasta de mentira; **[instalador]** o build de verdade.
2. **Instalar** o `Ortus-Setup-<versão>.exe` numa máquina Windows limpa. Sem
   assinatura, o SmartScreen avisa (*Mais informações → Executar assim
   mesmo*); assinado, **Propriedades → Assinaturas Digitais** mostra a
   empresa. **[instalador]**
3. **Entrar** com internet, com um usuário da clínica. O log
   (`%APPDATA%\Ortus\logs\ortus.log`) mostra
   `janela: prova de origem aceita pelo servidor local` e nenhum aviso aparece.
   **[auto]** as rotas atendem a janela; **[leitura]** o cabeçalho é injetado
   pelo processo principal; **[instalador]** a janela de verdade.
4. **Ver "Sincronizado"** no indicador do canto, depois da cópia inicial.
   **[auto]** cópia inicial completa e sem laço; **[instalador]** o indicador.
5. **Ficar offline** (tirar o cabo ou desligar o Wi-Fi). O indicador mostra
   *Sem internet*. **[auto]** estado offline e fila preservada;
   **[instalador]** o indicador.
6. **Alterar sem internet**: criar um paciente e um agendamento para ele;
   editar o telefone do paciente duas vezes. *Aguardando envio* mostra as
   alterações. Fechar e abrir o Ortus ainda sem internet: entra com a mesma
   conta e senha, e os dados continuam lá. **[auto]** fila, login offline com
   o verificador da senha; **[instalador]** as telas.
7. **Voltar a internet** e esperar uns 10 segundos: *Sincronizado* e
   *Aguardando envio* 0. No site (ou no Table Editor do Supabase), o paciente
   aparece **uma vez só**, com o último telefone, e o agendamento também.
   **[auto]** sem duplicar, inclusive quando a resposta do envio se perde;
   **[instalador]** conferir na nuvem.
8. **Forçar um conflito**: com o Ortus offline, mudar o nome de um paciente;
   no site (ou em outro computador), mudar o telefone do mesmo paciente;
   voltar a internet no Ortus. Em **Configurações → Sincronização** aparece o
   conflito, com *Aqui* e *Na nuvem* e *Venceu por ora: a nuvem*. Escolher
   **Manter este computador** e confirmar: em instantes o site mostra o nome
   dado no Ortus. Nenhum dos lados foi apagado sem a escolha. **[auto]**
   conflito, as duas versões guardadas, a decisão chegando ao outro
   computador; **[instalador]** a tela.
9. **Recusa da nuvem** (num ambiente de teste): com uma rede em modo de
   consulta, alterar um paciente no Ortus. Em Conflitos aparece *Recusada:
   modo de consulta*, a alteração continua na tela e nada é reenviado em laço
   (o log não repete o envio). Depois de regularizar, **Tentar enviar de
   novo** sobe a alteração. **[auto]** 402 e 403 viram recusa na primeira
   resposta, leitura continua, reenvio depois; **[instalador]** a tela.
10. **Prova de origem na máquina**: com o Ortus aberto, pegar a porta do Next
    no log (`tudo pronto: next=<porta>`) e abrir no Chrome
    `http://127.0.0.1:<porta>/api/local/sessao/restaurar`. A resposta é 403
    (*Este endereço só atende a janela do aplicativo Ortus.*) e não traz
    token. **[auto]** por HTTP de verdade; **[instalador]** na máquina.
11. **WhatsApp**: na aba WhatsApp, ler o QR Code com o celular da clínica e
    enviar uma mensagem para um número de teste. Fechar e abrir o Ortus: volta
    **conectado**, sem pedir QR. Sem internet, a lista e o histórico continuam
    visíveis e a mensagem digitada fica na fila até a conexão voltar.
    **[instalador]**
12. **Atualizar**: instalar a versão nova por cima. Dados, sessão e WhatsApp
    continuam; o banco antigo ganha as colunas novas sem perder linhas.
    **[auto]** banco antigo ganhando `convidado` e `motivo`; **[instalador]**
    a atualização de verdade.

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Abre e fecha na hora | `ELECTRON_RUN_AS_NODE` definido, ou falta `resources/config.json` |
| “Este instalador não veio com a configuração do Supabase” | `desktop:build` rodou sem as variáveis públicas, ou a chave era de servidor (o app recusa) |
| “O servidor local não reconheceu esta janela” | a prova de origem foi recusada: feche e abra; se voltar, mande o log |
| Build para em “verificação de segredos” | um `.env` ou o valor de uma variável proibida foi parar na pasta do instalador: o relatório diz o nome e o arquivo |
| Build para em “A assinatura digital foi pedida” | falta o segredo listado; para teste, `ORTUS_ASSINATURA=nenhuma` |
| WhatsApp não sobe | falta `services/whatsapp/node_modules` ou `resources/chromium` |
| Indicador preso em “Entre para sincronizar” | sessão expirada e sem rede: conecte e entre de novo |
| Muitos conflitos “Recusada: modo de consulta” | assinatura suspensa: regularize em Assinatura e use “Tentar enviar de novo” |
| Muitos conflitos | uso simultâneo de dois computadores nos mesmos registros |

---

## Várias máquinas na mesma clínica

Pode instalar em quantos computadores a clínica precisar. Cada um tem o seu
`ortus.db`; o Supabase é o ponto de encontro.

### Três garantias

1. **Ids nunca colidem.** Chaves `uuid` usam uuid v4. Chaves `bigint` usam um
   inteiro **negativo** montado com segundos desde 2020 + **tag da máquina** +
   contador (`desktop/lib/sqlite.cjs`). A sequence do Postgres só ocupa
   positivos, então não há colisão nem com a nuvem nem entre PCs.
2. **Um único relógio.** O `updated_at` é carimbado por gatilho no Postgres,
   tanto em INSERT quanto em UPDATE. Um computador com a hora errada **não
   ganha conflito** por isso. Depois do envio, a máquina aplica de volta a linha
   como o servidor gravou (`Prefer: return=representation`).
3. **Exclusão é compartilhada.** `AFTER DELETE` grava `sync_exclusoes` com
   tabela, id da linha e clínica. O pull baixa esses túmulos e apaga local —
   inclusive descartando uma escrita antiga que tentaria ressuscitar a linha.

### Cenários

| Situação | O que acontece |
|---|---|
| Duas pessoas criam registros diferentes | os dois convivem |
| Uma edita o paciente A, outra o paciente B | idem |
| Uma apaga, a outra não tocou | apaga nas duas |
| As duas editam **o mesmo** registro | vence o `updated_at` mais novo; as duas versões ficam nos conflitos |
| Uma apaga e a outra editou **depois** | a edição mais nova prevalece e o conflito aparece |
| Uma apaga e a outra editou **antes** | a exclusão vale; a edição fica guardada no conflito e pode ser recuperada |
| Um PC com relógio errado | não influencia: o servidor carimba |
| Sem internet por horas | a outbox acumula e sobe em ordem quando a rede volta |

### Conflitos

**Configurações → Sincronização** lista cada conflito com as duas versões
(este computador × nuvem) e botões para escolher. Nada é descartado sem
decisão: as versões ficam em `sync_conflitos`.

### Recomendação

Cada máquina deve ter internet ao menos algumas vezes por dia. O app tolera
dias offline, mas quanto maior o tempo desconectado (e mais gente mexendo nos
mesmos registros), maior a chance de conflito — e conflito sempre pede uma
decisão humana.
