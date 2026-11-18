# WhatsApp no Ortus

Como o WhatsApp roda em produção, o que configurar, o que acontece quando o
processo cai e o que este recurso não garante.

---

## 1. O desenho, em uma frase

O WhatsApp do Ortus é o **WhatsApp Web automatizado**: a biblioteca
`whatsapp-web.js` abre um navegador sem tela (Chromium), entra no WhatsApp Web
com o QR que a clínica escaneia e fica com esse navegador aberto. Isso exige
**um processo que fica ligado** e uma **pasta em disco** para a sessão. Função
serverless (Vercel) não serve: ela nasce e morre a cada pedido.

O processo se chama **serviço do WhatsApp** (no código, "gateway"):
`services/whatsapp/server.mjs`. O site nunca fala com o WhatsApp direto; a rota
`/api/whatsapp` confere o login, a clínica e a permissão de quem pede (seção 5)
e repassa o pedido ao serviço.

```
navegador ──► /api/whatsapp (site, confere login, clínica e permissão)
                   │  HTTP em 127.0.0.1 + cabeçalho com o segredo
                   ▼
              serviço do WhatsApp (server.mjs)
                   │  uma sessão por clínica
                   ▼
              Chromium sem tela ──► WhatsApp Web
```

## 2. Os três modos de produção

| Modo | Quem sobe o serviço | O que configurar | A aba aparece? |
|---|---|---|---|
| **A. Aplicativo de computador** | o próprio Ortus instalado na clínica (Electron) | nada: o aplicativo escolhe a porta, gera o segredo e entrega os dois ao site local | sim |
| **B. Servidor sempre ligado** | o sistema da máquina (systemd numa VM) | `WHATSAPP_GATEWAY_URL` e `WHATSAPP_GATEWAY_SECRET` no ambiente do site, `NEXT_PUBLIC_WHATSAPP_ATIVO=1` | sim |
| **C. Nenhum dos dois** | ninguém | `NEXT_PUBLIC_WHATSAPP_ATIVO=0` | não |

O passo a passo do modo B numa VM (navegador, dependências, unidade do
systemd) está em `docs/ORACLE.md`, seção 11.

O código segue essa tabela (`lib/whatsappGateway.ts`):

- **Em produção o site não sobe o serviço.** Quem sobe é o systemd da VM ou o
  Electron. A única exceção é `WHATSAPP_GATEWAY_AUTOSTART=1`, que autoriza o
  site a abrir o serviço como processo filho (só com endereço local e nunca na
  Vercel). Em desenvolvimento (`npm run dev`) o site continua subindo sozinho.
- **Sem serviço configurado**, a rota responde
  `{ "configurado": false, "modo": "indisponivel" }` e a tela explica que o
  WhatsApp funciona no aplicativo de computador ou num servidor sempre ligado,
  com o caminho para a Ajuda. Não aparece botão de conectar.
- **Com serviço configurado mas fora do ar**, a rota responde
  `{ "configurado": true, "status": "offline", "erro": "<frase fixa>" }` e a
  tela mostra a frase com o botão "Tentar de novo".
- **Com `NEXT_PUBLIC_WHATSAPP_ATIVO=0`**, a aba sai do menu lateral e do menu
  do celular, a página `/whatsapp` explica que o recurso está desligado e o
  botão de WhatsApp da ficha, da lista de pacientes e dos lembretes da agenda
  abre a conversa no WhatsApp do próprio aparelho (`wa.me`), com a mensagem
  pronta.

### Atenção ao atualizar um servidor que já usava o WhatsApp

Até esta versão o site subia o serviço sozinho também em produção. Depois de
atualizar, escolha uma das duas:

1. (recomendado) instalar a unidade `deploy/oracle/ortus-whatsapp.service` e
   manter `WHATSAPP_GATEWAY_URL` e `WHATSAPP_GATEWAY_SECRET` no arquivo de
   ambiente;
2. definir `WHATSAPP_GATEWAY_AUTOSTART=1` no ambiente do site, para manter o
   comportamento antigo.

Sem uma das duas, a tela passa a mostrar "O serviço do WhatsApp parou" ou
"O WhatsApp não funciona por este acesso".

## 3. Variáveis

### No site (Next)

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_WHATSAPP_ATIVO` | `0` esconde a aba e troca os atalhos por `wa.me`. Qualquer outro valor mostra. É lida no build: mudou, rode o build de novo. |
| `WHATSAPP_GATEWAY_URL` | endereço do serviço, por exemplo `http://127.0.0.1:3920`. Em produção é obrigatória (modo B). |
| `WHATSAPP_GATEWAY_SECRET` | segredo compartilhado com o serviço. Gere com `openssl rand -hex 32`. Em produção é obrigatória (modo B). |
| `WHATSAPP_GATEWAY_AUTOSTART` | `1` autoriza o site a subir o serviço como processo filho em produção. Padrão: não sobe. |

Em desenvolvimento não precisa de nenhuma: o site gera o segredo em
`services/whatsapp/.gateway-secret` (fora do git) e sobe o serviço na primeira
vez que a tela do WhatsApp abre. Fora do desenvolvimento e do autostart, esse
arquivo é ignorado: o segredo vale só se vier do ambiente.

### No serviço (`server.mjs`)

| Variável | Para quê |
|---|---|
| `WHATSAPP_GATEWAY_SECRET` | obrigatória. Sem ela o processo encerra na hora. |
| `WHATSAPP_GATEWAY_PORT` | porta. Padrão `3920`. |
| `WHATSAPP_GATEWAY_HOST` | endereço de escuta. Padrão `127.0.0.1`. Só aceita outro endereço junto com a variável abaixo. |
| `WHATSAPP_GATEWAY_EXPOSE` | `1` autoriza sair do loopback. Sem ela, um `WHATSAPP_GATEWAY_HOST` diferente é ignorado e o log avisa. |
| `PORT` | porta que plataformas de contêiner entregam. Só vale com `WHATSAPP_GATEWAY_EXPOSE=1`. |
| `WHATSAPP_DATA_DIR` | pasta das sessões (veja a seção 6). |
| `WHATSAPP_MAX_SESSOES` | teto de sessões abertas no processo, cada uma com um navegador. Padrão `20` (seção 5). |
| `PUPPETEER_EXECUTABLE_PATH` | caminho do Chromium ou Chrome. Se o arquivo não existir, é ignorado e a conexão falha depois. |
| `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` | banco usado pelas mensagens automáticas e agendadas no modo B. Sem as duas, as conversas funcionam e o agendador fica desligado (a tela avisa). |
| `ORTUS_LOCAL_DB`, `ORTUS_DB_URL`, `ORTUS_DB_SEGREDO` | banco local do aplicativo (modo A). Quem define é o Electron. |

O serviço também lê o `.env.local` da raiz do projeto, se existir, para as
variáveis que não vieram do ambiente.

## 4. Rede e segredo

- O serviço escuta **só em `127.0.0.1`**. Para escutar em outro endereço é
  preciso definir **duas** variáveis (`WHATSAPP_GATEWAY_HOST` e
  `WHATSAPP_GATEWAY_EXPOSE=1`) e o log grava um aviso a cada partida.
- Fora do loopback, o segredo é a única barreira entre a rede e as conversas
  da clínica. Só faça isso em rede interna ou atrás de TLS, e nunca publique a
  porta na internet.
- **Contêiner** (`services/whatsapp/Dockerfile`): dentro do contêiner o
  serviço precisa escutar em `0.0.0.0`, então a imagem já define as duas
  variáveis. Quem decide o alcance é a publicação da porta. Na mesma máquina do
  site: `docker run -p 127.0.0.1:3920:3920 -v ortus-whatsapp:/data ...`.
- Toda rota, menos `/saude`, exige o cabeçalho `x-ortus-whatsapp-secret`. A
  comparação é em tempo constante (resumo SHA-256 dos dois lados).
- O segredo nunca é escrito em log. O log do serviço também não grava telefone
  (sequências longas de dígitos viram `[número]`) nem a consulta da URL.

## 5. Quem pode o quê

Antes de falar com o serviço, a rota confere o login, o vínculo com a clínica
e a permissão para a ação. A recusa vem com HTTP 403 e uma frase fixa.

| Ação | Quem pode | Quem não pode recebe |
|---|---|---|
| Ver o estado (conectado ou não, número, nome) | todo membro da clínica | "Sem permissão para esta clínica." (sem vínculo) |
| Ver o QR | quem pode conectar (linha abaixo) | o estado com `qr` vazio |
| Gerar o QR (`iniciar`) e desconectar | administrador da clínica que não entrou por convite, e o dono da plataforma | "Só o administrador da clínica conecta ou desconecta o WhatsApp." |
| Ler conversas, mensagens e mídia, abrir conversa por telefone e enviar | quem tem o módulo Ficha do Paciente (`ficha_paciente`) nesta clínica; administrador tem todos | "Você não tem acesso às conversas do WhatsApp desta clínica." |

- **Administrador** segue a regra do banco (`user_is_clinic_admin`) e de
  `ehAdminDaClinica` (`lib/chamadorApi.ts`): perfil `admin` com vínculo que não
  veio de convite. Quem entrou por convite de outra rede é membro comum nesta
  clínica, mesmo sendo administrador na de origem. A regra lê a coluna
  `convidado` (migration `20261121_seguranca_reforco`); num banco sem ela
  ninguém é tratado como administrador, e só lê as conversas quem tem o módulo.
- **O módulo** vem de `permissoes_modulos` e é o mesmo que abre a tela
  `/whatsapp` (`ROUTE_MODULE_MAP`, em `lib/permissionPresets.ts`).
- **Por que o QR é só de quem conecta:** quem escaneia o código pareia o
  próprio celular com a sessão da clínica, e as mensagens automáticas passam a
  sair pelo número dessa pessoa.
- O estado devolve também `podeConectar` e `podeConversar`. A tela esconde
  Gerar QR Code e Desconectar de quem não pode; o servidor confere de novo.
- **No aplicativo de computador** a conferência é a mesma, pelo banco local.
  Enquanto o perfil ou o vínculo da pessoa não desceu para o computador (os
  primeiros minutos depois da instalação), ela vê o estado, mas não conecta nem
  lê conversas.

### Id da clínica e teto de sessões

- Só passa o **id canônico**: de 1 a 12 dígitos, sem zero à esquerda. `012` é
  recusado (HTTP 400 na rota, 404 no serviço) e a sessão é guardada pelo mesmo
  id na rota, no serviço e na pasta `session-<id>`. Antes, `012` e `12` eram a
  mesma clínica no banco e duas sessões no serviço, cada uma com um navegador:
  dava para abrir dezenas de Chromium e parear outro celular com as
  automações da clínica.
- O serviço só abre sessão para **clínica que existe no banco** (`clinicas`;
  no aplicativo também vale um vínculo no banco local) e responde "Clínica não
  encontrada." para as outras. Sem banco no serviço (agendador desligado), só a
  rota confere.
- **`WHATSAPP_MAX_SESSOES`** (padrão 20) é o teto de sessões abertas no
  processo. Clínica que já tem sessão não conta de novo; a nova, passado o
  teto, recebe "Este servidor chegou ao limite de clínicas com o WhatsApp
  ligado. Avise o suporte." e o log registra o pedido.
- **Na partida**, a pasta `session-<nome>` cujo nome não é um id canônico (por
  exemplo `session-012`) ou que é de clínica que o banco não conhece fica
  fechada, com aviso no log. Apague essas pastas: elas podem estar pareadas
  com o celular de outra pessoa.

## 6. O que a clínica escaneia e onde a sessão fica

1. Aba **WhatsApp**, **Conversas**, botão **Gerar QR Code**.
2. No celular que tem o WhatsApp da clínica: **WhatsApp > Dispositivos
   conectados > Conectar dispositivo** (em versões antigas, "Aparelhos
   conectados > Conectar um aparelho"). No Android o caminho fica no menu de
   três pontos; no iPhone, em Configurações.
3. Apontar a câmera para o código na tela do Ortus.

O celular precisa ler o código em **outra tela**. Quem está com o Ortus aberto
no próprio celular da clínica abre o Ortus num computador ou em outro aparelho.

Cada clínica tem a própria sessão. **A sessão fica na máquina que gerou o
QR**, numa pasta `session-<id da clínica>`:

| Onde roda | Pasta das sessões |
|---|---|
| Aplicativo de computador (Windows) | `%APPDATA%\Ortus\wwebjs\` |
| Aplicativo de computador (macOS) | `~/Library/Application Support/Ortus/wwebjs/` |
| VM com `deploy/oracle/ortus-whatsapp.service` | `/var/lib/ortus/whatsapp/sessao/` |
| Contêiner | `/data/sessao/` (monte um volume em `/data`) |
| Padrão, sem `WHATSAPP_DATA_DIR` | `services/whatsapp/.wwebjs_auth/`, dentro da pasta do código |

Consequências:

- Conectar no aplicativo da recepção não conecta o site, e o contrário também
  não. São máquinas diferentes, sessões diferentes.
- Trocar de computador ou de VM, apagar a pasta ou subir um contêiner sem
  volume pede QR de novo.
- O padrão dentro da pasta do código some com um `git clean` ou um clone novo.
  Em servidor, defina `WHATSAPP_DATA_DIR` fora do clone (a unidade da VM faz
  isso).
- A pasta guarda a chave de acesso ao WhatsApp da clínica. Trate como senha:
  dono restrito, fora de backup aberto.

O serviço também grava `.wwebjs_cache/` na pasta de trabalho: é só uma cópia
da página do WhatsApp Web e pode ser apagada.

## 7. Se o processo cair

O que para:

- A tela de Conversas mostra "O WhatsApp não respondeu", com uma frase fixa, e
  volta sozinha quando o serviço responder (ela consulta a cada 3 segundos).
- **Mensagens agendadas e automáticas param.** As agendadas continuam
  guardadas no banco como "Agendada".
- A cópia das conversas que estava na memória do serviço se perde. No
  aplicativo o histórico volta do banco local; no servidor volta só o que o
  WhatsApp Web recarregar.

O que religa:

| Modo | Quem religa |
|---|---|
| Aplicativo | o Electron tenta de novo até 4 vezes, com 2 segundos de intervalo. Depois disso, só fechando e abrindo o Ortus. |
| VM (systemd) | `Restart=always`: o sistema sobe de novo sozinho (10 segundos na unidade do projeto). |
| Autostart ou desenvolvimento | o site sobe de novo no próximo pedido da tela do WhatsApp, esperando 30 segundos depois de uma queda. |

Ao subir, o serviço **reabre sozinho** cada sessão salva (pastas `session-*`),
sem QR, até o teto de sessões e só para clínica que o banco conhece (seção 5).
Em até um minuto depois de reconectar, o agendador volta: as agendadas
com horário vencido saem em seguida, em lotes de até 20 por clínica, com alguns
segundos entre uma e outra. As automáticas olham para trás só até certo
ponto: confirmação e pós-consulta cobrem as últimas 48 horas, lembrete vale
para consultas que ainda vão acontecer, e aniversário e retorno rodam uma vez
por dia dentro do horário de envio. O que ficou fora dessas janelas não sai.

Uma mensagem que estava **no meio do envio** quando o processo caiu fica como
"Enviando" e não é reenviada, para não chegar duas vezes. Confira no celular
e agende de novo se precisar.

Quando precisa escanear de novo:

- alguém clicou em **Desconectar** na tela (isso encerra a sessão de verdade);
- o aparelho foi removido no celular, em Dispositivos conectados;
- o WhatsApp encerrou a sessão por conta própria, o que acontece quando o
  celular fica muitos dias sem abrir o aplicativo (hoje, cerca de 14 dias);
- a pasta da sessão sumiu ou a máquina mudou (seção 6);
- a tela mostra "Não foi possível autenticar. Gere o QR de novo."

Fechar o Ortus ou reiniciar a VM **não** desconecta.

## 8. Saúde

| O que | Como | O que mostra |
|---|---|---|
| Processo de pé | `GET http://127.0.0.1:3920/saude`, sem segredo | `200 {"ok":true}` e mais nada |
| Estado de uma clínica | `GET /sessoes/<id da clínica>` com o cabeçalho `x-ortus-whatsapp-secret` | `status` (`desconectado`, `iniciando`, `qr`, `conectado`, `falha`), `numero`, `nome`, `erro`, `agendador` e, só durante a leitura, o `qr` |
| Estado visto pelo site | `GET /api/whatsapp?clinicaId=<id>`, com o login do usuário | `configurado`, `modo` (`aplicativo`, `servidor`, `indisponivel`), `podeConectar`, `podeConversar` e o mesmo estado acima, com `offline` quando o serviço não responde; o `qr` só vai para quem pode conectar |

`/saude` não devolve conversa, telefone, sessão nem QR, e não diz se alguma
clínica está conectada: responde `ok` mesmo com todas desconectadas. Serve para
o systemd, para um monitor e para o próprio site saberem que o processo existe.

```bash
curl -s http://127.0.0.1:3920/saude
systemctl status ortus-whatsapp
journalctl -u ortus-whatsapp -n 50
```

## 9. O que aparece na tela quando algo falha

O navegador só recebe frases fixas. Saída de processo, stack, caminho de
arquivo e nome de variável ficam no servidor: no registro de falhas do site
(`falhas_servidor` e stderr, origem `whatsapp/gateway` ou `api/whatsapp`) e no
log do serviço (journald na VM; `logs/ortus.log` na pasta de dados do
aplicativo).

| Frase na tela | O que quer dizer | Onde olhar |
|---|---|---|
| O WhatsApp não funciona por este acesso | não há serviço configurado neste endereço (modo C sem esconder a aba) | variáveis da seção 3 |
| O serviço do WhatsApp não está instalado neste servidor. | o site tentou subir o serviço e faltou `server.mjs` ou as dependências (`npm --prefix services/whatsapp ci`) | registro de falhas |
| O WhatsApp ainda está abrindo. Tente de novo em alguns segundos. | o serviço não respondeu ainda (partida ou reinício) | esperar; se durar, o item abaixo |
| O serviço do WhatsApp parou. Avise o suporte. | o serviço não responde há mais de 20 segundos, ou caiu ao abrir | `systemctl status ortus-whatsapp`, log do serviço |
| O WhatsApp deste computador parou. Feche o Ortus e abra de novo. | no aplicativo, o serviço não responde há mais de 90 segundos | `logs/ortus.log` |
| O serviço do WhatsApp recusou este servidor. Avise o suporte. | o segredo do site é diferente do segredo do serviço | arquivo de ambiente dos dois |
| O WhatsApp demorou para responder. Tente de novo. | o serviço está de pé, mas não respondeu a tempo | log do serviço |
| O WhatsApp não conseguiu concluir agora. Tente de novo. | erro interno do serviço ou do navegador | registro de falhas e log do serviço |
| Não foi possível abrir o WhatsApp. Tente de novo; se continuar, avise o suporte. | o Chromium não abriu (caminho errado, falta de memória, perfil em uso) | log do serviço |
| Só o administrador da clínica conecta ou desconecta o WhatsApp. | quem pediu não é administrador desta clínica, ou entrou nela por convite | seção 5 |
| Você não tem acesso às conversas do WhatsApp desta clínica. | falta o módulo Ficha do Paciente para essa pessoa nesta clínica | tela Equipe |
| Este servidor chegou ao limite de clínicas com o WhatsApp ligado. Avise o suporte. | o serviço já tem `WHATSAPP_MAX_SESSOES` sessões abertas | log do serviço (`sessão recusada`) |
| Clínica não encontrada. | o serviço não achou a clínica no banco | registro de falhas |

As frases do serviço que chegam à tela estão listadas em `FRASES_DO_SERVICO`
(`lib/whatsappGateway.ts`). Uma frase nova no `server.mjs` precisa entrar
nessa lista; fora dela o site mostra o aviso genérico.

## 10. Limites, sem enfeite

- **Não é a API oficial do WhatsApp.** É o WhatsApp Web operado por um
  programa. O WhatsApp pode derrubar a sessão, pedir QR de novo ou **bloquear
  o número** se entender que o uso é automatizado ou abusivo. Envio em massa
  aumenta esse risco. Não há contrato, garantia de entrega nem suporte do
  WhatsApp para este uso.
- **Pode parar de funcionar sem aviso** quando o WhatsApp muda o WhatsApp Web.
  O conserto depende de atualizar a biblioteca `whatsapp-web.js`.
- **Cada clínica conectada mantém um navegador aberto** no servidor. Meça a
  memória antes de conectar várias na mesma máquina e ajuste
  `WHATSAPP_MAX_SESSOES` ao que ela aguenta.
- **No servidor as conversas não são gravadas no banco**: a tela mostra o que
  o WhatsApp Web carrega. No aplicativo elas ficam no banco local.
- **O celular da clínica continua sendo o dono da conta.** Ele precisa abrir o
  WhatsApp de tempos em tempos e pode desconectar o Ortus a qualquer momento.
- **Envios automáticos saem um por vez**, com alguns segundos entre eles, só
  dentro do horário configurado e só com o WhatsApp conectado. Com o processo
  parado, nada sai.
- **Arquivos**: até 3 MB por envio. Texto: até 4000 caracteres.
- **Uma clínica, um lugar só.** Não conecte a mesma clínica no aplicativo de
  computador e no servidor ao mesmo tempo. Cada serviço tem o próprio
  agendador: o do aplicativo lê o banco local, o do servidor lê a nuvem, e a
  sincronização entre os dois leva alguns segundos. Nesse intervalo os dois
  podem enviar a mesma mensagem agendada ou automática.
- **Um serviço, um conjunto de sessões.** Dois serviços apontando para a mesma
  pasta de sessão brigam pelo mesmo navegador. Rode um só por pasta.

## 11. Onde está cada coisa no código

| Arquivo | Papel |
|---|---|
| `services/whatsapp/server.mjs` | o serviço: sessões, conversas, agendador, rotas HTTP |
| `services/whatsapp/lib/` | acesso ao banco (Supabase no servidor, SQLite pelo aplicativo) |
| `services/whatsapp/Dockerfile` | imagem do serviço para contêiner |
| `lib/whatsappGateway.ts` | modos, partida em desenvolvimento, chamada ao serviço, frases fixas |
| `app/api/whatsapp/route.ts` | rota do site: login, clínica, permissão por ação, limpeza das respostas |
| `lib/whatsappCliente.ts` | `WHATSAPP_ATIVO`, `situacaoWhatsapp()` (configurado, modo, estado, permissões) e `whatsappConectado()` para as outras telas |
| `app/whatsapp/` | a tela (Conversas, Automáticas, Agendadas, Histórico) |
| `desktop/lib/whatsapp.cjs` | partida do serviço dentro do aplicativo |
| `deploy/oracle/ortus-whatsapp.service` | unidade do systemd para a VM |
| `docs/ORACLE.md`, seção 11 | passo a passo de instalação do serviço na VM (navegador, dependências, unidade) |
