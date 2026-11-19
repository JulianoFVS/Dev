# Ortus na Oracle Cloud (Always Free)

Passo a passo para tirar o site do Ortus da Vercel e rodar numa VM gratuita da
Oracle Cloud, do zero até o domínio abrir com HTTPS.

**O que muda:** o Next deixa de ser serverless. Passa a ser um processo Node
sempre ligado (`next start`), atrás de um Nginx com HTTPS. O cron da Vercel
vira timer do systemd. O gateway do WhatsApp, que não vive em serverless, pode
rodar na mesma VM.

**O que não muda:** o banco e o login continuam no Supabase e os arquivos no
Cloudflare R2. Nada disso vai para a VM.

**Como este guia foi feito:** escrito em 18/11/2026 lendo o código do
repositório. Os comandos **não foram executados numa VM da Oracle**. O script
das rotinas (`chamar-rotina.sh`) foi testado contra um servidor de mentira, no
Windows com Git Bash; os arquivos do systemd, do Nginx e do Caddy não foram
testados. Onde eu não tinha como confirmar está escrito **conferir**, e a
lista completa está na [seção 18](#18-o-que-ficou-para-conferir).

Rode os blocos na ordem, na mesma sessão SSH. Cada bloco é um comando só (os
poucos que mostram saída esperada ou conteúdo de arquivo estão avisados no
texto). O domínio de exemplo é `ortus.exemplo.com.br`; troque pelo seu.
Marcadores como `<IP_PUBLICO_DA_VM>` são para você preencher.

## Mapa do que vai existir na VM

| Peça | Onde fica | Escuta em | Unidade do systemd |
|---|---|---|---|
| Site (Next, `next start`) | `/opt/ortus` | `127.0.0.1:3500` | `ortus.service` |
| Gateway do WhatsApp (opcional) | código em `/opt/ortus/services/whatsapp`, dados em `/var/lib/ortus/whatsapp` | `127.0.0.1:3920` | `ortus-whatsapp.service` |
| Nginx | `/etc/nginx/sites-available/ortus` | `80` e `443`, públicas | `nginx.service` |
| Rotinas agendadas | `/usr/local/bin/ortus-chamar-rotina` | não escuta | `ortus-lembretes`, `ortus-assinaturas`, `ortus-vigia` (`.timer` + `.service`) |
| Variáveis e segredos | `/etc/ortus/ortus.env` (root, grupo `ortus`, `0640`) | | |
| Usuário dos processos | `ortus`, sem shell de login, pasta em `/var/lib/ortus` | | |

Da internet só chegam as portas 22, 80 e 443. As portas 3500 e 3920 nunca são
abertas.

Os arquivos que o guia manda copiar estão em [`deploy/oracle/`](../deploy/oracle/).

---

## 1. Antes de começar: os limites reais do Always Free

Leia antes de decidir. Os números vieram da página
[Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
da Oracle em 18/11/2026. A Oracle já mudou esses números; confira a página
antes de contar com eles.

1. **Cartão de crédito.** O cadastro exige um cartão para verificar a
   identidade. A Oracle faz uma autorização de valor pequeno e estorna. Cartão
   pré-pago ou virtual costuma ser recusado.
2. **Região de origem.** Você escolhe no cadastro e não troca depois. Os
   recursos Always Free só existem nessa região.
3. **ARM costuma estar sem vaga.** Ao criar a instância Ampere A1 é comum o
   erro "Out of host capacity". A Oracle chama de falta temporária e manda
   tentar outro domínio de disponibilidade ou esperar. Em região com um
   domínio só, resta tentar em outros horários, às vezes por dias. Não há fila
   nem previsão.
4. **Tamanho.** Hoje a página diz: na forma A1 (ARM), 1.500 horas de OCPU e
   9.000 GB-hora por mês, "o equivalente a 2 OCPUs e 12 GB de memória"; na
   forma `VM.Standard.E2.1.Micro` (AMD), até duas instâncias de 1/8 de OCPU e
   1 GB; 200 GB de disco somando tudo; 10 TB de saída de rede por mês.
   Tutorial antigo fala em 4 OCPUs e 24 GB na A1: não vale mais.
5. **Instância parada por ociosidade.** A página diz que a Oracle pode tomar
   de volta instância Always Free ociosa. Conta como ociosa se, num período de
   7 dias, valerem as três coisas: uso de CPU no percentil 95 abaixo de 20%,
   uso de rede abaixo de 20% e uso de memória abaixo de 20% (a de memória só
   vale para a A1). Um Ortus com poucas clínicas deve ficar abaixo disso (não
   medi). Pela regra, a sua VM pode ser parada.
   No aviso que a Oracle mandou aos clientes em 2023, a instância ociosa era
   parada, não apagada; dava para religar se houvesse vaga da mesma forma na
   região; e converter a conta para Pay As You Go tirava a instância dessa
   regra, sem cobrança enquanto o uso ficasse dentro do Always Free. Eu não
   achei essas três frases na página atual: **conferir** antes de contar com
   isso.
6. **A Micro AMD de 1 GB é apertada.** Não aguenta `next build` sem swap, e
   com swap o build fica lento (não medi quanto). O navegador do gateway do
   WhatsApp mais o site não cabem com folga em 1 GB. Use a Micro só para o
   site, sem WhatsApp, ou enquanto a A1 não sai.
7. **Não há número de clínicas garantido.** O site sozinho é leve. O gateway
   do WhatsApp abre um navegador inteiro por clínica conectada
   (`services/whatsapp/server.mjs`, um `new Client` por clínica), e a memória
   cresce junto. Meça na sua VM (seção 16) antes de prometer capacidade a
   alguém.
8. **Trate a VM como descartável.** Não há contrato de disponibilidade no
   plano grátis, e há relatos de contas gratuitas suspensas (não é regra
   documentada e eu não tenho número). O que importa tem que existir fora
   dela: banco no Supabase, arquivos no R2, código no git, e o que só mora na
   VM no backup da seção 17.

---

## 2. Criar a conta e a VM

Os nomes dos menus do console da Oracle mudam; os de baixo são os que eu
conheço. **Conferir** na tela.

1. Crie a conta em <https://www.oracle.com/cloud/free/>. Escolha a região de
   origem com cuidado (item 2 da seção anterior).
2. Tenha uma chave SSH no seu computador. Serve uma que você já usa. Para
   criar outra:

   ```
   ssh-keygen -t ed25519 -f <CAMINHO_DA_SUA_CHAVE> -C "ortus-oracle"
   ```

3. No console: **Compute → Instances → Create instance**.
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** Ampere `VM.Standard.A1.Flex` com 2 OCPUs e 12 GB (o teto
     gratuito de hoje). Se der "Out of host capacity", tente outro domínio de
     disponibilidade e outros horários. Sem vaga, use
     `VM.Standard.E2.1.Micro` e leia o item 6 da seção 1.
   - **Networking:** crie uma VCN nova com sub-rede pública e marque para
     receber IPv4 público.
   - **SSH keys:** cole a chave pública (o arquivo `.pub`). Não habilite senha.
   - **Boot volume:** o tamanho padrão basta.
4. Anote o IP público. Pela documentação da Oracle, o IP "efêmero" que a
   instância ganha só se perde quando ela é apagada; um IP reservado evita
   trocar o DNS se você tiver que recriar a instância. **Conferir** o limite
   de IPs reservados do plano grátis.
5. Entre na VM. O usuário da imagem Ubuntu é `ubuntu`:

   ```
   ssh -i <CAMINHO_DA_SUA_CHAVE> ubuntu@<IP_PUBLICO_DA_VM>
   ```

6. Confirme a arquitetura e o sistema:

   ```
   uname -m
   ```

   Esperado: `aarch64` na A1, `x86_64` na Micro.

   ```
   lsb_release -ds
   ```

   Esperado: `Ubuntu 24.04` e alguma coisa.

---

## 3. Rede e firewall

A Oracle tem **duas** camadas. Liberar só uma não adianta.

### 3.1 Camada 1: Security List da VCN (no console)

**Networking → Virtual cloud networks → (sua VCN) → Security Lists → Default
Security List → Add Ingress Rules.** Crie duas regras:

| Source CIDR | IP Protocol | Destination Port Range |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

A regra da porta 22 já vem criada. Se o seu IP de casa ou do escritório for
fixo, troque a origem dela para esse IP.

**Não crie regra para 3500 nem para 3920.** O site e o gateway do WhatsApp só
escutam em `127.0.0.1`; quem fala com a internet é o Nginx.

### 3.2 Camada 2: iptables dentro da VM

A imagem Ubuntu da Oracle já vem com regras de iptables que recusam tudo o que
chega, menos SSH. A cadeia `INPUT` termina com uma regra `REJECT`; as regras
novas têm que entrar **antes** dela.

Não use `ufw` e não dê `iptables -F`. As regras da imagem incluem as que
mantêm o disco de boot acessível, e a própria Oracle documenta que a instância
pode não voltar de um reboot depois de `ufw`
([Known Issues](https://docs.oracle.com/en-us/iaas/Content/Compute/known-issues.htm)).

Veja as regras atuais:

```
sudo iptables -L INPUT -n --line-numbers
```

Libere a porta 80, inserindo na posição da regra `REJECT` (ela desce uma
linha):

```
sudo iptables -I INPUT "$(sudo iptables -L INPUT -n --line-numbers | awk '$2 == "REJECT" { print $1; exit }')" -p tcp -m state --state NEW --dport 80 -j ACCEPT
```

Libere a 443 do mesmo jeito:

```
sudo iptables -I INPUT "$(sudo iptables -L INPUT -n --line-numbers | awk '$2 == "REJECT" { print $1; exit }')" -p tcp -m state --state NEW --dport 443 -j ACCEPT
```

Se o comando reclamar do número da regra, a sua cadeia não tem `REJECT`: olhe
a listagem antes de mexer em mais alguma coisa.

Confira: as duas regras novas têm que aparecer acima da `REJECT`.

```
sudo iptables -L INPUT -n --line-numbers
```

Grave para valer depois do reboot (escreve em `/etc/iptables/rules.v4`, o
arquivo que a Oracle manda manter):

```
sudo netfilter-persistent save
```

Se você ligou IPv6 na VCN, repita as regras com `ip6tables`.

### 3.3 SSH só por chave

A imagem já vem sem login por senha. Deixe isso explícito num arquivo que é
lido antes dos da imagem:

```
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' | sudo tee /etc/ssh/sshd_config.d/00-ortus.conf
```

Confira a sintaxe (não pode imprimir nada):

```
sudo sshd -t
```

Aplique:

```
sudo systemctl reload ssh
```

Confira o que está valendo:

```
sudo sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '
```

Esperado: as três linhas terminando em `no`.

Antes de fechar esta sessão, abra **outra** janela e entre de novo por SSH. Se
a nova não entrar, você ainda tem a primeira para consertar.

---

## 4. Preparar a máquina

### 4.1 Atualizar

```
sudo apt-get update
```

```
sudo apt-get -y upgrade
```

Se existir o arquivo `/var/run/reboot-required`, reinicie e entre de novo:

```
sudo reboot
```

Pacotes básicos:

```
sudo apt-get install -y git curl ca-certificates openssl
```

### 4.2 Swap

Obrigatório na Micro de 1 GB (sem swap o build morre por falta de memória).
Na A1 é opcional.

Veja se já existe (saída vazia = não existe):

```
swapon --show
```

Crie 4 GB:

```
sudo fallocate -l 4G /swapfile
```

```
sudo chmod 600 /swapfile
```

```
sudo mkswap /swapfile
```

```
sudo swapon /swapfile
```

Ligue no boot:

```
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Confira:

```
free -h
```

### 4.3 Usuário e pastas

Usuário de sistema `ortus`, sem shell de login, com a pasta em `/var/lib/ortus`:

```
sudo useradd --system --user-group --home-dir /var/lib/ortus --create-home --shell /usr/sbin/nologin ortus
```

Pasta do clone:

```
sudo install -d -o ortus -g ortus -m 0755 /opt/ortus-repo
```

Pasta das variáveis:

```
sudo install -d -o root -g ortus -m 0750 /etc/ortus
```

### 4.4 Node

O `package.json` não fixa a versão do Node. O Next 16.1.6 pede 20.9 ou mais
novo. Este guia usa a linha **24 (LTS "Krypton")**: é a que o projeto roda
hoje na máquina de desenvolvimento e tem suporte até abril de 2028.

A LTS mais nova é a 26 ("Lithium", LTS desde 28/10/2026). Ela atende ao
requisito do Next, mas eu não rodei o projeto nela: se quiser usá-la, troque
`24` por `26` no comando abaixo e trate como **conferir**.

O Node do `apt` do Ubuntu 24.04 é o 18, velho demais. Use o repositório da
NodeSource. Baixe o instalador:

```
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
```

Rode. Ele cadastra o repositório da NodeSource no `apt`:

```
sudo -E bash /tmp/nodesource_setup.sh
```

Instale:

```
sudo apt-get install -y nodejs
```

Confira:

```
node --version
```

Esperado: `v24.` e alguma coisa.

Não use Docker nem pm2: quem mantém os processos de pé é o systemd.

---

## 5. Baixar o código e instalar

### 5.1 Onde o código fica

No repositório, o projeto está dentro da pasta `ortus/` (a raiz do git só tem
`.gitignore` e `ortus/`). Para o código ficar em `/opt/ortus`, o clone vai
para `/opt/ortus-repo` e `/opt/ortus` é um atalho para `/opt/ortus-repo/ortus`.
Se um dia o projeto subir para a raiz do repositório, clone direto em
`/opt/ortus` e apague o atalho.

Os comandos com `sudo -u ortus` têm que ser dados de uma pasta que o usuário
`ortus` consiga ler. A sua pasta `/home/ubuntu` não serve. Vá para `/opt`:

```
cd /opt
```

### 5.2 Acesso ao repositório

**Repositório público:** pule para o 5.3 e use o endereço `https://`.

**Repositório privado:** crie uma chave de deploy só de leitura.

```
sudo install -d -o ortus -g ortus -m 0700 /var/lib/ortus/.ssh
```

```
sudo -u ortus -H ssh-keygen -t ed25519 -N "" -C "ortus-vm" -f /var/lib/ortus/.ssh/id_ed25519
```

Mostre a chave **pública**:

```
sudo cat /var/lib/ortus/.ssh/id_ed25519.pub
```

No GitHub: repositório → **Settings → Deploy keys → Add deploy key**. Cole a
linha e deixe "Allow write access" desmarcado.

Teste. Na primeira vez o SSH mostra a impressão digital do GitHub; compare com
a lista oficial em
<https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints>
antes de responder `yes`.

```
sudo -u ortus -H ssh -T git@github.com
```

Esperado: `Hi <SEU_USUARIO>/<SEU_REPOSITORIO>! You've successfully authenticated, but GitHub does not provide shell access.`

### 5.3 Clonar

Privado:

```
sudo -u ortus -H git clone git@github.com:<SEU_USUARIO>/<SEU_REPOSITORIO>.git /opt/ortus-repo
```

Público:

```
sudo -u ortus -H git clone https://github.com/<SEU_USUARIO>/<SEU_REPOSITORIO>.git /opt/ortus-repo
```

Crie o atalho:

```
sudo ln -sfn /opt/ortus-repo/ortus /opt/ortus
```

Confira:

```
ls /opt/ortus/package.json
```

### 5.4 Instalar as dependências do site

```
cd /opt/ortus
```

```
sudo -u ortus -H npm ci --ignore-scripts --include=dev
```

Por que essas duas opções:

- **`--ignore-scripts`**: a raiz tem `better-sqlite3`, que compila código
  nativo na instalação. Só o aplicativo desktop usa: o único arquivo que
  carrega o pacote é `desktop/lib/sqlite.cjs` (linha 3). Do site, a única
  coisa que vem da pasta `desktop/` é `desktop/lib/verificadorSenha.cjs`
  (importado por `app/api/local/entrar/route.ts` e
  `app/api/local/sessao/route.ts`), que só usa `node:crypto`. O build do site
  não toca no `better-sqlite3`, então a VM não precisa de compilador.
  Os binários de que o build precisa (`@next/swc-linux-arm64-gnu`,
  `@next/swc-linux-x64-gnu`) vêm prontos e estão no `package-lock.json`.
- **`--include=dev`**: o build usa TypeScript e Tailwind, que são
  dependências de desenvolvimento. Sem a opção, um `NODE_ENV=production` no
  ambiente faria o npm pular essas dependências.

**Não rode `npm prune --omit=dev` depois do build.** O `next start` precisa do
pacote `typescript` para ler o `next.config.ts`
(`node_modules/next/dist/build/next-config-ts/transpile-config.js`). Se não
achar, ele tenta instalar o pacote na hora de subir, e a unidade do site roda
com o sistema só-leitura.

O gateway do WhatsApp instala separado, na seção 11.

---

## 6. Arquivo de ambiente

As variáveis ficam em `/etc/ortus/ortus.env`, fora do git, e os serviços
carregam com `EnvironmentFile=`.

Copie o modelo:

```
sudo install -o root -g ortus -m 0640 /opt/ortus/deploy/oracle/ortus.env.exemplo /etc/ortus/ortus.env
```

Gere um segredo para as rotinas (rode de novo para o do gateway do WhatsApp,
se for usar). Não cole o resultado em conversa, e-mail ou captura de tela:

```
openssl rand -hex 32
```

Edite e preencha:

```
sudoedit /etc/ortus/ortus.env
```

As regras de formato estão no começo do próprio arquivo. As principais: uma
variável por linha, sem aspas, sem comentário na mesma linha do valor.

| Variável | Para quê |
|---|---|
| `NODE_ENV=production`, `PORT=3500` | processo do site. O Nginx e os timers contam com a 3500 |
| `HOSTNAME=127.0.0.1` | fica por registro. O `next start` não lê; o endereço é fixado na unidade (seção 8) |
| `NEXT_PUBLIC_APP_URL` | endereço público, com `https://` e sem barra no fim. Obrigatória na VM (veja abaixo) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | projeto Supabase (vão para o navegador) |
| `SUPABASE_SERVICE_ROLE_KEY` | só servidor. Ignora a RLS |
| `DATABASE_URL` | só os scripts de banco usam. Deixe vazia se não for rodar script da VM |
| `CRON_SECRET` | protege as rotinas agendadas |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | e-mail (lembrete, convite, alerta) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | só se usar SMS |
| `WHATSAPP_GATEWAY_URL=http://127.0.0.1:3920`, `WHATSAPP_GATEWAY_SECRET` | gateway do WhatsApp nesta VM |
| `NEXT_PUBLIC_WHATSAPP_ATIVO` | `1` quando o gateway roda na VM, `0` quando não existe |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_PUBLICO=ortus-publico`, `R2_BUCKET_PRIVADO=ortus-privado`, `R2_PUBLIC_URL` (opcional) | arquivos no Cloudflare R2 |
| `PAGAMENTO_PROVEDOR=mercadopago`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | cobrança |
| `NEXT_PUBLIC_SUPORTE_WHATSAPP_1`, `NEXT_PUBLIC_SUPORTE_WHATSAPP_2` | números de suporte mostrados no site: só dígitos, com DDI (`lib/suporte.ts`) |
| `ALERTA_EMAILS` (opcional) | e-mails que recebem os avisos aos donos, separados por vírgula. Vazia = o e-mail de login de cada dono da plataforma (`app/api/relatos/route.ts`) |

Duas variáveis que o código conhece e que **não** se usam na VM:
`WHATSAPP_GATEWAY_AUTOSTART` (faria o site subir o gateway como processo
filho) e `WHATSAPP_GATEWAY_EXPOSE` (tiraria o gateway de `127.0.0.1`). As
unidades tiram as duas do ambiente mesmo que alguém escreva no arquivo.

Três coisas que pegam:

- **`NEXT_PUBLIC_*` entram no build.** O valor é copiado para dentro do
  código na hora do `npm run build`. Mudou uma delas: rode o build de novo
  (seção 7) e reinicie. Só reiniciar não muda nada.
- **`NEXT_PUBLIC_APP_URL` é obrigatória aqui.** Atrás do Nginx, o Next monta
  a URL da própria requisição com o endereço em que ele escuta
  (`127.0.0.1:3500`). Sem a variável, o e-mail sai sem link
  (`origemParaEmail` em `lib/origemApp.ts`) e o link de anamnese depende do
  cabeçalho `Origin` de quem chamou; na falta dele sai com o endereço interno.
- **Mudou qualquer linha: reinicie o serviço.** O systemd só lê o arquivo
  quando o processo sobe.

Confira dono e permissão:

```
sudo stat -c '%U:%G %a %n' /etc/ortus/ortus.env
```

Esperado: `root:ortus 640 /etc/ortus/ortus.env`.

Confira que não sobrou marcador (não pode imprimir nada):

```
sudo grep -nE '^[^#]*<(SEU|SUA)' /etc/ortus/ortus.env
```

Veja quais variáveis estão preenchidas, sem mostrar nenhum valor:

```
sudo awk -F= '/^[A-Z0-9_]+=/ { printf "%-34s %s\n", $1, (length($0) > length($1) + 1 ? "preenchida" : "VAZIA") }' /etc/ortus/ortus.env
```

Não crie `.env.local` em `/opt/ortus`. O Next e o gateway do WhatsApp leem
esse arquivo se ele existir, e você passa a ter dois lugares com segredo.

**Enquanto o site ainda estiver na Vercel**, as mesmas variáveis têm que
existir lá (Project → Settings → Environment Variables). O código novo usa
`CRON_SECRET`, `NEXT_PUBLIC_APP_URL` e `RESEND_FROM_EMAIL`, que podem não
estar cadastradas.

---

## 7. Build

O build precisa das variáveis (as `NEXT_PUBLIC_*` entram nele). Este comando
roda `npm run build` como usuário `ortus`, lendo o arquivo de ambiente do
mesmo jeito que o serviço vai ler:

```
sudo systemd-run --pipe --wait --collect --quiet --uid=ortus --gid=ortus --working-directory=/opt/ortus --property=EnvironmentFile=/etc/ortus/ortus.env --setenv=NEXT_TELEMETRY_DISABLED=1 /usr/bin/npm run build
```

Por que não `source` do arquivo num shell: o shell interpreta `$`, `&` e `#`
dentro dos valores e o systemd não. Com `systemd-run` o build recebe
exatamente os valores que o site vai receber.

O build confere os tipos do TypeScript. Erro de tipo para o build.

Confira que saiu:

```
ls -l /opt/ortus/.next/BUILD_ID
```

Eu não rodei este build em Linux ARM nem na Micro: **conferir**. Se morrer na
Micro com "heap out of memory", confirme o swap (seção 4.2) e acrescente
`--setenv=NODE_OPTIONS=--max-old-space-size=2048` antes de `/usr/bin/npm`.

---

## 8. Serviço do site (systemd)

Instale a unidade:

```
sudo install -o root -g root -m 0644 /opt/ortus/deploy/oracle/ortus.service /etc/systemd/system/ortus.service
```

```
sudo systemctl daemon-reload
```

Ligue agora e em todo boot:

```
sudo systemctl enable --now ortus.service
```

Veja o estado:

```
systemctl status ortus.service --no-pager
```

Esperado: `active (running)`.

O site responde na própria máquina:

```
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3500/login
```

Esperado: `200`.

Ele escuta só em `127.0.0.1`:

```
sudo ss -ltnp | grep ':3500 '
```

Esperado: uma linha com `127.0.0.1:3500`. Se aparecer `0.0.0.0:3500` ou
`*:3500`, pare e confira a linha `ExecStart` da unidade.

O que a unidade faz, para você saber onde mexer:

- Roda `next start --hostname 127.0.0.1` (o que `npm run start` roda, mais o
  endereço). O `next start` **não lê** a variável `HOSTNAME`; sem a opção ele
  escutaria em todas as interfaces. A porta vem de `PORT`.
- `Restart=always`: se o processo cair, volta em 5 segundos.
- Enxerga o sistema como só-leitura (`ProtectSystem=strict`). Só grava em
  `/opt/ortus/.next/cache`.
- Não recebe `DATABASE_URL` (o site não lê).
- Não sobe o gateway do WhatsApp. O site tem um modo em que ele mesmo abre o
  gateway como processo filho (`lib/whatsappGateway.ts`): vale em
  desenvolvimento e, em produção, só com `WHATSAPP_GATEWAY_AUTOSTART=1`. Na VM
  quem sobe o gateway é o serviço `ortus-whatsapp`; os dois disputariam a
  porta 3920. A unidade tira essa variável do ambiente e esconde a pasta
  `services/whatsapp` do processo do site. A segunda trava cobre também uma
  versão anterior do código, que subia o gateway sozinha em produção. O site
  continua falando com o gateway por HTTP.

---

## 9. HTTPS: Nginx + Certbot

```
sudo apt-get install -y nginx certbot
```

O arquivo `deploy/oracle/nginx-ortus.conf` aponta para o certificado, então o
certificado vem primeiro. Escolha **um** dos dois caminhos.

### 9.1 Caminho A — domínio novo, ou que já pode apontar para a VM

Crie o registro DNS do tipo A do domínio com o IP público da VM e espere
propagar. Depois peça o certificado. O Nginx recém-instalado serve
`/var/www/html` na porta 80, e é por ali que o Let's Encrypt confere:

```
sudo certbot certonly --webroot -w /var/www/html -d ortus.exemplo.com.br --deploy-hook "systemctl reload nginx"
```

O Certbot pergunta um e-mail e pede para aceitar os termos.

### 9.2 Caminho B — domínio em uso na Vercel

O Let's Encrypt só confere por HTTP se o domínio já apontar para a VM. Para
ter o certificado **antes** de virar o DNS, use a conferência por DNS:

```
sudo certbot certonly --manual --preferred-challenges dns -d ortus.exemplo.com.br
```

O Certbot mostra um valor e espera. Crie no painel do seu DNS um registro TXT
chamado `_acme-challenge.ortus.exemplo.com.br` com esse valor. Em outra
janela, confira que ele já responde (se faltar o `dig`:
`sudo apt-get install -y dnsutils`):

```
dig +short TXT _acme-challenge.ortus.exemplo.com.br @1.1.1.1
```

Só então volte e aperte Enter.

Isso importa porque o site manda HSTS (`next.config.ts`): o navegador de quem
já visitou o Ortus não deixa ignorar um erro de certificado. Virar o DNS sem
certificado pronto deixaria esses usuários sem acesso até o certificado sair.

Este certificado **não se renova sozinho**. Você troca a renovação para HTTP
logo depois da virada (seção 14, passo 6). Ele vence em 90 dias.

### 9.3 Instalar o site no Nginx

Copie o arquivo trocando o domínio de exemplo pelo seu:

```
sudo sed 's/ortus\.exemplo\.com\.br/<SEU_DOMINIO>/g' /opt/ortus/deploy/oracle/nginx-ortus.conf | sudo tee /etc/nginx/sites-available/ortus > /dev/null
```

Ative:

```
sudo ln -sfn /etc/nginx/sites-available/ortus /etc/nginx/sites-enabled/ortus
```

Tire o site padrão (o arquivo do Ortus já traz o próprio "servidor padrão"):

```
sudo rm -f /etc/nginx/sites-enabled/default
```

Teste a configuração:

```
sudo nginx -t
```

Esperado: `syntax is ok` e `test is successful`.

Aplique:

```
sudo systemctl reload nginx
```

Teste de dentro da VM, sem depender do DNS:

```
curl -sS -o /dev/null -w '%{http_code}\n' --resolve ortus.exemplo.com.br:443:127.0.0.1 https://ortus.exemplo.com.br/login
```

Esperado: `200`.

No caminho A, teste a renovação:

```
sudo certbot renew --dry-run
```

O que o arquivo do Nginx faz:

- Redireciona HTTP para HTTPS e deixa passar só o desafio do Let's Encrypt.
- Repassa `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`,
  `X-Forwarded-Host` e `X-Forwarded-Port`.
- Aceita corpo de até 5 MB. O maior que o site recebe é o envio de arquivo
  pelo WhatsApp: 4.200.000 caracteres em base64 (`ARQUIVO_MAXIMO_BASE64` em
  `app/api/whatsapp/route.ts`). Foto e documento de paciente sobem
  direto do navegador para o R2 e não passam pelo Nginx. O padrão do Nginx
  (1 MB) quebraria o envio pelo WhatsApp.
- Fecha `/api/local/*` (rotas do aplicativo desktop) com 404. A exceção é
  `/api/local/status`, que o Nginx responde com `{"desktop":false}`: toda tela
  consulta esse endereço ao abrir (`lib/local/cliente.ts`), e o site
  responderia a mesma coisa.
- Recusa caminho com `\`. O Node lê `\` como `/`, e sem essa regra
  `/api\local/db` passaria pelo bloqueio.
- Grava o registro de acesso **sem** a parte depois do `?`, porque o app
  manda telefone de paciente na query string. O registro de erro do Nginx
  (`/var/log/nginx/ortus.error.log`) ainda guarda a linha inteira da
  requisição quando há erro.
- Não acrescenta cabeçalho de segurança: os do `next.config.ts` já saem do
  Next.
- Pedido que chega pelo IP, sem o nome do domínio, é derrubado sem resposta.

Se usar também `www.`, acrescente o nome em `server_name` e no `-d` do
Certbot.

Depois de instalado, mexa em `/etc/nginx/sites-available/ortus`. O Certbot não
altera esse arquivo.

### 9.4 Alternativa curta: Caddy

O Caddy tira e renova o certificado sozinho, mas para isso o domínio já tem
que apontar para a VM. (A conferência por DNS exige um Caddy montado com o
plugin do seu provedor de DNS, que este guia não cobre.) Para quem está saindo
da Vercel com usuários no ar, o caminho B do Nginx é o que evita o intervalo
sem certificado.

Instale pelo repositório oficial (comandos da página
<https://caddyserver.com/docs/install>):

```
sudo apt install --yes debian-keyring debian-archive-keyring apt-transport-https curl
```

```
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```

```
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
```

```
sudo apt update
```

```
sudo apt install caddy
```

Copie o `Caddyfile` trocando o domínio:

```
sudo sed 's/ortus\.exemplo\.com\.br/<SEU_DOMINIO>/g' /opt/ortus/deploy/oracle/Caddyfile | sudo tee /etc/caddy/Caddyfile > /dev/null
```

```
sudo caddy validate --config /etc/caddy/Caddyfile
```

```
sudo systemctl reload caddy
```

Não rode Nginx e Caddy juntos: os dois querem as portas 80 e 443.

---

## 10. Rotinas agendadas (timers)

O cron da Vercel vira timer do systemd. Cada timer chama o próprio site em
`http://127.0.0.1:3500`, sem passar pelo Nginx, com
`Authorization: Bearer <CRON_SECRET>`.

| Rotina | Rota | Quando | Unidades |
|---|---|---|---|
| Lembretes de consulta | `GET /api/lembretes/processar?enviar=true` | todo dia 13:00 UTC (10h de Brasília), igual ao `vercel.json` | `ortus-lembretes` |
| Assinaturas (gera competência, marca atraso, bloqueia e reabre) | `GET /api/assinaturas/processar` | todo dia 09:00 UTC | `ortus-assinaturas` |
| Vigia (confere rotinas, falhas do servidor, gateway do WhatsApp e Resend; avisa os donos por e-mail — `docs/OPERACAO.md`, seção 3) | `GET /api/saude/vigia` | a cada 15 minutos | `ortus-vigia` |

`GET /api/saude` é pública, não tem timer e serve ao monitor externo (seção 13).

As três rotas existem no código (`app/api/lembretes/processar`,
`app/api/assinaturas/processar`, `app/api/saude/vigia`) e respondem 401 sem o
`CRON_SECRET`. As três podem rodar mais de uma vez no dia sem duplicar nada:
lembrete tem reserva por agendamento e canal, fatura é uma por competência e
alerta aberto não é reaberto. A de assinaturas devolve só contagens
(`faturas_geradas`, `mudancas_de_estado`, `avisos_enviados`, …) e para sozinha
perto de 45 s; o que sobrar fica para a próxima chamada.

### 10.1 Instalar

O script que os timers rodam:

```
sudo install -o root -g root -m 0755 /opt/ortus/deploy/oracle/chamar-rotina.sh /usr/local/bin/ortus-chamar-rotina
```

As unidades:

```
sudo install -o root -g root -m 0644 /opt/ortus/deploy/oracle/ortus-lembretes.service /opt/ortus/deploy/oracle/ortus-lembretes.timer /opt/ortus/deploy/oracle/ortus-assinaturas.service /opt/ortus/deploy/oracle/ortus-assinaturas.timer /opt/ortus/deploy/oracle/ortus-vigia.service /opt/ortus/deploy/oracle/ortus-vigia.timer /etc/systemd/system/
```

```
sudo systemctl daemon-reload
```

### 10.2 Por que o segredo não vai na linha de comando

Os argumentos de um processo ficam visíveis para qualquer usuário da máquina
em `ps` e em `/proc/<pid>/cmdline` enquanto ele roda, e o systemd grava a
linha de comando no journal quando o serviço falha. Um
`curl -H "Authorization: Bearer ..."` deixaria o `CRON_SECRET` nos dois
lugares.

O script lê só as linhas `CRON_SECRET` e `PORT` de `/etc/ortus/ortus.env` e
entrega o cabeçalho ao curl pela entrada padrão (`curl --config -`). As
unidades dos timers não usam `EnvironmentFile=`: as outras chaves do arquivo
nem entram no ambiente desses processos.

No journal fica uma linha por chamada: código HTTP, tempo, tamanho e um resumo
só com números e verdadeiro/falso da resposta. O corpo nunca é gravado, e
nenhum texto da resposta entra no resumo. O serviço sai com erro quando a
resposta não é 2xx.

A rota de lembretes trabalha por cerca de 50 segundos por chamada e devolve
`interrompido_por_tempo: true` quando sobra lembrete
(`lib/lembretesServidor.ts`). A unidade `ortus-lembretes.service` chama de
novo enquanto vier esse aviso, até 6 vezes (`ROTINA_REPETICOES=6`). Não
duplica envio: cada lembrete é reservado no banco antes de sair, com chave
única por agendamento e canal.

### 10.3 Testar antes de ligar

Sem o segredo, toda rota agendada responde 401:

```
curl -sS -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3500/api/lembretes/processar?enviar=true'
```

```
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3500/api/assinaturas/processar
```

```
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3500/api/saude/vigia
```

Com segredo errado também:

```
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer errado' 'http://127.0.0.1:3500/api/lembretes/processar?enviar=true'
```

Esperado nos quatro: `401`. Um `404` quer dizer que a rota ainda não existe
nesta versão do código.

Simulação dos lembretes: sem `enviar=true` a rota só conta o que sairia. Não
envia e não reserva lembrete; fica registrada como uma execução da rotina.

```
cd /opt/ortus
```

```
sudo -u ortus /usr/local/bin/ortus-chamar-rotina lembretes-teste /api/lembretes/processar
```

Esperado: uma linha começando com `rotina=lembretes-teste chamada=1 http=200`
e, no resumo, `enviados_email=0 enviados_sms=0`.

### 10.4 Ligar

Se o site ainda roda na Vercel, **não ligue agora**: ligue na virada
(seção 14), para não ter dois agendadores.

```
sudo systemctl enable --now ortus-lembretes.timer ortus-assinaturas.timer ortus-vigia.timer
```

Veja a próxima execução de cada um:

```
systemctl list-timers 'ortus-*' --no-pager
```

Para rodar uma rotina agora, à mão (o vigia pode mandar e-mail de alerta):

```
sudo systemctl start ortus-vigia.service
```

```
sudo journalctl -u ortus-vigia.service -n 5 --no-pager
```

---

## 11. Gateway do WhatsApp (opcional)

O WhatsApp do Ortus usa `whatsapp-web.js`, que controla um navegador com o
WhatsApp Web aberto. Isso não vive em serverless. Para cada clínica há duas
saídas:

- a clínica usa o **aplicativo desktop**, que traz o WhatsApp embutido; ou
- existe um **processo sempre ligado** que faz esse papel. É este serviço.

**Não conecte a mesma clínica nos dois.** O agendador do aplicativo lê o
banco local e o do servidor lê o Supabase, sem reserva em comum durante a
sincronização: os dois podem mandar a mesma mensagem automática (conferido no
código; ver `docs/WHATSAPP.md`, seção 9).

Se nenhuma clínica vai usar o WhatsApp pelo site, pule esta seção, deixe
`NEXT_PUBLIC_WHATSAPP_ATIVO=0` (esconde a aba) e `WHATSAPP_GATEWAY_SECRET`
vazia. Sem o segredo o site trata o WhatsApp como indisponível
(`modoWhatsapp` em `lib/whatsappGateway.ts`) e não tenta conectar.

### 11.1 Navegador

O gateway precisa de um navegador instalado no sistema. O que o Puppeteer
baixa sozinho é x86-64 e não roda na A1 (ARM).

No Ubuntu 24.04, **não** use `apt install chromium-browser`: esse pacote
instala o Chromium como snap. O snap roda confinado: não grava a pasta de
sessão fora de `/home` e não sobe com o `NoNewPrivileges` desta unidade. (É o
comportamento conhecido do snap; eu não testei aqui.)

Use o Google Chrome oficial, que tem pacote `.deb` para AMD64 e, desde julho
de 2026, para ARM64. Em 18/11/2026 conferi que os dois arquivos existem e que
o repositório do Google publica o `google-chrome-stable` para `arm64`. Não
testei numa VM: **conferir**.

```
curl -fsSLo /tmp/google-chrome.deb "https://dl.google.com/linux/direct/google-chrome-stable_current_$(dpkg --print-architecture).deb"
```

```
sudo apt-get install -y /tmp/google-chrome.deb
```

Confira:

```
google-chrome-stable --version
```

Teste se ele abre sem tela, como usuário `ortus`:

```
sudo -u ortus env HOME=/tmp/ortus-teste-chrome /usr/bin/google-chrome-stable --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --user-data-dir=/tmp/ortus-teste-chrome/perfil --dump-dom about:blank
```

Esperado: uma linha `<html><head></head><body></body></html>` (avisos sobre
D-Bus antes dela não importam). Se faltar biblioteca, o erro aparece aqui.

Apague a pasta do teste:

```
sudo rm -rf /tmp/ortus-teste-chrome
```

Alternativa: o pacote `chromium` do PPA `xtradeb/apps`, mantido por
voluntários (não é da Canonical nem do Google). Em 18/11/2026 ele publicava o
Chromium 156 para o Ubuntu 24.04 em `arm64` e `amd64`.

```
sudo add-apt-repository -y ppa:xtradeb/apps
```

```
sudo apt-get install -y chromium
```

Confira onde o executável ficou (o esperado é `/usr/bin/chromium`):

```
command -v chromium
```

Depois de instalar a unidade (11.4), aponte-a para esse caminho com
`sudo systemctl edit ortus-whatsapp.service` e estas duas linhas:

```
[Service]
Environment=PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

E reinicie o gateway:

```
sudo systemctl restart ortus-whatsapp.service
```

### 11.2 Dependências do gateway

Só dentro de `services/whatsapp`. `PUPPETEER_SKIP_DOWNLOAD` evita baixar o
navegador do Puppeteer (o `Dockerfile` do gateway faz o mesmo):

```
cd /opt/ortus
```

```
sudo -u ortus -H env PUPPETEER_SKIP_DOWNLOAD=true npm --prefix /opt/ortus/services/whatsapp ci --omit=dev
```

### 11.3 Variáveis

Em `/etc/ortus/ortus.env`:

- `WHATSAPP_GATEWAY_SECRET`: gere com `openssl rand -hex 32`. Sem ele o
  gateway se recusa a subir. O site e o gateway leem o mesmo valor deste
  arquivo: se trocar, reinicie os dois.
- `WHATSAPP_GATEWAY_URL=http://127.0.0.1:3920`.
- `NEXT_PUBLIC_WHATSAPP_ATIVO=1`.

`NEXT_PUBLIC_WHATSAPP_ATIVO` entra no build. Se ela estava `0`, rode o build
de novo (seção 7) e reinicie o site:

```
sudo systemctl restart ortus.service
```

### 11.4 Serviço

```
sudo install -o root -g root -m 0644 /opt/ortus/deploy/oracle/ortus-whatsapp.service /etc/systemd/system/ortus-whatsapp.service
```

```
sudo systemctl daemon-reload
```

```
sudo systemctl enable --now ortus-whatsapp.service
```

```
sudo journalctl -u ortus-whatsapp.service -n 20 --no-pager
```

Esperado: `WhatsApp Ortus em http://127.0.0.1:3920`.

Saúde do gateway:

```
curl -sS http://127.0.0.1:3920/saude
```

Esperado: `{"ok":true}`. Essa rota só diz que o processo está de pé: não
devolve conversa, número, QR nem estado de sessão (é a única rota sem segredo
do `server.mjs`, e o corpo é fixo). Todo o resto exige o segredo:

```
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3920/sessoes/1
```

Esperado: `401`.

Ele escuta só em `127.0.0.1`:

```
sudo ss -ltnp | grep ':3920 '
```

Esperado: `127.0.0.1:3920`. **A porta 3920 nunca entra na Security List nem no
iptables.**

Por que a unidade fixa endereço e porta: o `server.mjs` de hoje já escuta só
em `127.0.0.1:3920` por padrão e só sai de `127.0.0.1` com
`WHATSAPP_GATEWAY_EXPOSE=1`. A unidade define `WHATSAPP_GATEWAY_HOST=127.0.0.1`
e `WHATSAPP_GATEWAY_PORT=3920` e tira do ambiente do gateway
`WHATSAPP_GATEWAY_EXPOSE` e o `PORT=3500` do arquivo (que é do site). Isso
vale também para uma versão anterior do `server.mjs`, em que `PORT` virava a
porta do gateway e o fazia escutar em todas as interfaces. Se você fizer
deploy de um commit antigo, a unidade continua segurando o gateway em
`127.0.0.1:3920`.

### 11.5 Conectar uma clínica

1. A clínica entra no Ortus pelo site, abre a aba **WhatsApp** e clica em
   **Conectar**. Aparece um QR Code.
2. No celular da clínica: **WhatsApp > Aparelhos conectados > Conectar um
   aparelho** (em versões recentes o menu aparece como "Dispositivos
   conectados" > "Conectar dispositivo"). Aponte para o QR.
3. Pronto. A sessão fica gravada na VM.

### 11.6 Onde a sessão fica

A sessão pertence à máquina que gerou o QR. Ela é uma pasta de perfil do
navegador:

```
/var/lib/ortus/whatsapp/sessao/session-<id da clínica>/
```

O padrão do código é `services/whatsapp/.wwebjs_auth`, dentro do clone
(`PASTA_SESSAO` em `server.mjs`). A unidade muda para fora com
`WHATSAPP_DATA_DIR`, para que nenhum comando de git ou clone novo apague a
sessão.

- **Inclua essa pasta no backup** (seção 17).
- **Nunca apague `/var/lib/ortus/whatsapp` num deploy.** Sem a pasta, toda
  clínica tem que escanear o QR de novo.
- O botão **Desconectar** do Ortus apaga a pasta daquela clínica (é o
  `logout` do `whatsapp-web.js`). Para voltar, QR de novo.
- Quem copia essa pasta consegue agir como o WhatsApp da clínica. Ela é `0700`
  do usuário `ortus`; trate o backup dela como segredo.

### 11.7 Se o processo cair

- As mensagens agendadas e automáticas **param**: quem envia é um laço dentro
  do gateway, a cada 60 segundos (`rodarAgendador` em `server.mjs`).
- `Restart=always` religa em 10 segundos. Ao subir, o gateway reabre sozinho
  cada sessão salva (`restaurarSessoesSalvas`), sem QR.
- Se o WhatsApp tiver invalidado a sessão (aparelho removido no celular,
  celular muito tempo sem conexão), a clínica escaneia de novo.
- O vigia (seção 10) é quem deve avisar por e-mail que o gateway parou.
  **Conferir** quando a rota existir.

### 11.8 Limites e riscos

- Um navegador por clínica conectada. Cada um costuma ocupar algumas centenas
  de MB; eu não medi nesta aplicação. Veja o consumo real:

  ```
  systemctl status ortus-whatsapp.service --no-pager
  ```

- A unidade tem `OOMScoreAdjust=300`: se faltar memória, o kernel derruba
  primeiro o navegador do WhatsApp, não o site. Há uma linha `MemoryMax`
  comentada para você pôr um teto depois de medir.
- O navegador roda com `--no-sandbox` (fixo no `server.mjs`) e herda o
  ambiente do processo Node. Por isso a unidade roda com usuário sem
  privilégio, sistema só-leitura, sem acesso a `/home`, e tira do ambiente as
  chaves que o gateway não usa (R2, Resend, Twilio, Mercado Pago,
  `DATABASE_URL`, `CRON_SECRET`). A `SUPABASE_SERVICE_ROLE_KEY` continua lá: o
  gateway precisa dela.
- Depois de atualizar o navegador pelo `apt`, reinicie o gateway:

  ```
  sudo systemctl restart ortus-whatsapp.service
  ```

---

## 12. Conferir

Rode de dentro da VM. O `--resolve` faz o curl falar com o Nginx local usando
o nome certo, então funciona antes e depois de virar o DNS.

**Cabeçalhos de segurança** (os do `next.config.ts`):

```
curl -sS -I --resolve ortus.exemplo.com.br:443:127.0.0.1 https://ortus.exemplo.com.br/login | grep -iE '^(HTTP|x-content-type-options|x-frame-options|referrer-policy|strict-transport-security|permissions-policy)'
```

Esperado (a ordem pode variar):

```
HTTP/2 200
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(self), microphone=(self), geolocation=(), payment=()
strict-transport-security: max-age=63072000; includeSubDomains; preload
```

Cada cabeçalho tem que aparecer **uma vez**. Duas vezes quer dizer que alguém
repetiu o cabeçalho no Nginx.

**HTTP vira HTTPS:**

```
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve ortus.exemplo.com.br:80:127.0.0.1 http://ortus.exemplo.com.br/login
```

Esperado: `301 https://ortus.exemplo.com.br/login`.

**Página protegida sem sessão manda para o login:**

```
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve ortus.exemplo.com.br:443:127.0.0.1 https://ortus.exemplo.com.br/agenda
```

Esperado: `307 https://ortus.exemplo.com.br/login?redirect=%2Fagenda`.

**API sem sessão responde 401:**

```
curl -sS -o /dev/null -w '%{http_code}\n' --resolve ortus.exemplo.com.br:443:127.0.0.1 https://ortus.exemplo.com.br/api/armazenamento
```

Esperado: `401`.

**Rota agendada sem segredo responde 401, também por fora:**

```
curl -sS -o /dev/null -w '%{http_code}\n' --resolve ortus.exemplo.com.br:443:127.0.0.1 'https://ortus.exemplo.com.br/api/lembretes/processar?enviar=true'
```

Esperado: `401`.

**Rotas do aplicativo desktop fechadas:**

```
curl -sS -o /dev/null -w '%{http_code}\n' --resolve ortus.exemplo.com.br:443:127.0.0.1 https://ortus.exemplo.com.br/api/local/db
```

Esperado: `404`.

```
curl -sS --resolve ortus.exemplo.com.br:443:127.0.0.1 https://ortus.exemplo.com.br/api/local/status
```

Esperado: `{"desktop":false}`.

**Saúde:**

```
curl -sS -o /dev/null -w '%{http_code}\n' --resolve ortus.exemplo.com.br:443:127.0.0.1 https://ortus.exemplo.com.br/api/saude
```

Esperado: `200` com o banco de pé e o vigia em dia; `503` com o banco fora ou
com o vigia sem sinal há mais de 1 h (`docs/OPERACAO.md`, seção 2). Antes da
primeira execução do vigia: `200` com `"ok": false`.

**Do seu computador, não da VM** — as portas internas têm que estar fechadas.
Os dois comandos têm que falhar por tempo esgotado:

```
curl --max-time 5 http://<IP_PUBLICO_DA_VM>:3500/
```

```
curl --max-time 5 http://<IP_PUBLICO_DA_VM>:3920/saude
```

**No navegador, antes de virar o DNS (caminho B):** ponha no arquivo `hosts`
do seu computador uma linha `<IP_PUBLICO_DA_VM> ortus.exemplo.com.br`, abra o
site, entre, abra a agenda e a ficha de um paciente. Tire a linha depois.

---

## 13. Monitor externo

O vigia roda dentro da VM: se a VM inteira parar, ele para junto e ninguém é
avisado. Por isso existe `GET /api/saude`: pública, sem segredo, sem dado de
clínica. Responde `200` quando está tudo de pé e `503` quando não.

Aponte um monitor de uptime gratuito para ela. Qualquer serviço que faça uma
requisição HTTP periódica e avise por e-mail serve (UptimeRobot, Better Stack
e outros; **conferir** o que o plano gratuito de cada um inclui hoje). A
configuração é a mesma em todos:

- tipo: HTTP(S);
- endereço: `https://ortus.exemplo.com.br/api/saude`;
- intervalo: 5 minutos;
- considerar fora do ar: qualquer resposta que não seja 2xx, ou sem resposta;
- avisar: o e-mail dos donos.

Crie o monitor depois da virada do DNS. Antes disso ele mediria a Vercel.

---

## 14. Virada do DNS e saída da Vercel

Faça fora do horário das rotinas (13:00 UTC e 09:00 UTC) e fora do horário de
atendimento das clínicas.

1. **Um dia antes:** baixe o TTL do registro DNS do domínio para 300 segundos.
2. **Confira a VM** com a seção 12 inteira, incluindo o teste no navegador
   pelo arquivo `hosts`.
3. **Aponte o DNS para a VM.** Troque o registro do domínio para um registro A
   com o IP público da VM. Se hoje ele é um CNAME para a Vercel, apague o
   CNAME. Se existir registro AAAA apontando para a Vercel, apague também.
4. **Confirme que abriu.** O nome tem que resolver para o IP da VM:

   ```
   dig +short ortus.exemplo.com.br @1.1.1.1
   ```

   E o site tem que responder por fora, do seu computador:

   ```
   curl -sS -o /dev/null -w '%{http_code}\n' https://ortus.exemplo.com.br/login
   ```

   Esperado: `200`. Entre no site pelo navegador e confira uma tela com dados.

5. **Tire a Vercel do ar.** Mudar o DNS **não** desliga o cron dela: o cron
   chama a implantação da Vercel, não o domínio. Enquanto o projeto existir,
   há duas origens gravando no mesmo banco e duas rotinas de lembrete. Em duas
   etapas:
   - **Agora:** desligue o cron (**Settings → Cron Jobs**) e desconecte o
     repositório do projeto (**Settings → Git**). O `vercel.json` do
     repositório ainda declara o cron, e um novo deploy na Vercel o ligaria
     de novo.
   - **Depois que o TTL antigo passou** (ninguém mais resolve para a Vercel):
     apague o projeto (**Settings → General → Delete Project**). No mínimo,
     remova os domínios (**Settings → Domains**); mas enquanto o projeto
     existir, o endereço `*.vercel.app` dele continua sendo uma segunda
     origem com acesso ao mesmo banco.

6. **Só no caminho B: troque a renovação do certificado para HTTP.** Agora que
   o domínio aponta para a VM:

   ```
   sudo certbot reconfigure --cert-name ortus.exemplo.com.br --authenticator webroot --webroot-path /var/www/html --deploy-hook "systemctl reload nginx"
   ```

   O `reconfigure` existe do Certbot 2.3 em diante (o do Ubuntu 24.04 é mais
   novo) e faz um ensaio antes de gravar. Eu não executei: **conferir**. Se
   ele recusar, peça o certificado de novo pelo caminho novo:

   ```
   sudo certbot certonly --webroot -w /var/www/html -d ortus.exemplo.com.br --deploy-hook "systemctl reload nginx" --force-renewal
   ```

   Nos dois casos, prove que a renovação automática funciona:

   ```
   sudo certbot renew --dry-run
   ```

   Apague o registro TXT `_acme-challenge` do DNS.

7. **Ligue os timers** (seção 10.4), se ainda não ligou.
8. **Supabase Auth.** Em **Authentication → URL Configuration**, confira
   **Site URL** e **Redirect URLs**. Se o domínio é o mesmo de antes, nada
   muda. Se havia endereço `*.vercel.app` ali, troque pelo domínio.
9. **Provedor de pagamento.** No painel do Mercado Pago, confira a URL do
   webhook da aplicação: `https://ortus.exemplo.com.br/api/pagamentos/webhook`.
   Se apontava para `*.vercel.app`, troque. O segredo de assinatura mostrado
   ali é o `MERCADOPAGO_WEBHOOK_SECRET`. Marque o evento **Pagamentos**. A rota
   (`app/api/pagamentos/webhook/route.ts`) confere a assinatura `x-signature`
   e responde 401 a aviso sem assinatura válida; o corpo do aviso só diz qual
   pagamento reler, e o estado é sempre consultado na API do Mercado Pago.
10. **Monitor externo** (seção 13).
11. **Textos legais.** Os Termos e a Política de Privacidade citam a Vercel
    como hospedagem (procure "Vercel" em `app/termos/page.tsx` e
    `app/privacidade/page.tsx`). Depois da virada o texto certo é Oracle
    Cloud. É mudança de código: entra no próximo deploy.
12. **Suba o TTL** de volta depois de uns dias estável.

Para voltar atrás enquanto o projeto da Vercel ainda existe: desligue os
timers da VM (`sudo systemctl disable --now` nos três), reaponte o DNS para a
Vercel e religue o cron lá.

---

## 15. Atualizar para uma versão nova

O build reescreve a pasta `.next` que o site no ar está usando. Por isso o
roteiro para o site, atualiza e sobe de novo. **O site fica fora do ar durante
a instalação e o build** (o Nginx responde 502). Faça fora do horário de
atendimento. O gateway do WhatsApp **não** é tocado: as sessões continuam
conectadas.

```
cd /opt/ortus
```

Veja o que vai entrar:

```
sudo -u ortus -H git fetch --prune
```

```
sudo -u ortus -H git log --oneline HEAD..origin/main
```

Pare o site:

```
sudo systemctl stop ortus.service
```

Baixe:

```
sudo -u ortus -H git pull --ff-only
```

Veja se veio arquivo novo em `supabase/migrations/`:

```
sudo -u ortus -H git diff --stat 'HEAD@{1}' HEAD -- supabase/migrations
```

Se veio, aplique **antes** de subir o site, um arquivo por vez, na ordem dos
nomes. Pode ser da sua máquina de desenvolvimento
(`node scripts/apply-migration.mjs <ARQUIVO>.sql`) ou daqui, se
`DATABASE_URL` estiver preenchida no arquivo de ambiente:

```
sudo systemd-run --pipe --wait --collect --quiet --uid=ortus --gid=ortus --working-directory=/opt/ortus --property=EnvironmentFile=/etc/ortus/ortus.env /usr/bin/node scripts/apply-migration.mjs <ARQUIVO_DA_MIGRATION>.sql
```

Esperado: `OK — migration aplicada.`

Instale:

```
sudo -u ortus -H npm ci --ignore-scripts --include=dev
```

Build:

```
sudo systemd-run --pipe --wait --collect --quiet --uid=ortus --gid=ortus --working-directory=/opt/ortus --property=EnvironmentFile=/etc/ortus/ortus.env --setenv=NEXT_TELEMETRY_DISABLED=1 /usr/bin/npm run build
```

Suba:

```
sudo systemctl start ortus.service
```

Confira:

```
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3500/login
```

Se o build falhar, o site continua parado. Volte para a versão anterior
(`sudo -u ortus -H git checkout --detach <COMMIT_ANTERIOR>`), instale, faça o
build e suba. Na atualização seguinte, volte para a `main` antes do `pull`
(`sudo -u ortus -H git checkout main`).

**O gateway do WhatsApp só reinicia se o código dele mudou.** Veja:

```
sudo -u ortus -H git diff --stat 'HEAD@{1}' HEAD -- services/whatsapp
```

Saída vazia: não faça nada. Se mudou, reinstale as dependências dele e
reinicie. As sessões voltam sozinhas, sem QR:

```
sudo -u ortus -H env PUPPETEER_SKIP_DOWNLOAD=true npm --prefix /opt/ortus/services/whatsapp ci --omit=dev
```

```
sudo systemctl restart ortus-whatsapp.service
```

**Se mudou algo em `deploy/oracle/`,** copie de novo o que mudou (os comandos
`install` das seções 8, 10.1 e 11.4), rode `sudo systemctl daemon-reload` e
reinicie o serviço correspondente. Veja o que mudou:

```
sudo -u ortus -H git diff --stat 'HEAD@{1}' HEAD -- deploy/oracle
```

O que **nunca** entra num deploy:

- `git clean -fdx` em `/opt/ortus-repo` (apaga `node_modules` e o build);
- apagar `/var/lib/ortus/whatsapp` (apaga as sessões do WhatsApp);
- apagar e clonar de novo sem antes parar os serviços.

---

## 16. Logs e o que fazer se cair

Tudo vai para o journal do systemd.

Site, ao vivo:

```
sudo journalctl -u ortus.service -f
```

Site, última hora:

```
sudo journalctl -u ortus.service --since "1 hour ago" --no-pager
```

Só as falhas que o site registrou. Cada uma é uma linha JSON já sem dado
pessoal nem segredo (`lib/registro.ts`):

```
sudo journalctl -u ortus.service --since today --no-pager | grep '"nivel":"erro"'
```

Gateway do WhatsApp:

```
sudo journalctl -u ortus-whatsapp.service -n 100 --no-pager
```

Rotinas (uma linha por chamada):

```
sudo journalctl -u ortus-lembretes.service -u ortus-assinaturas.service -u ortus-vigia.service --since "2 days ago" --no-pager
```

Quando cada timer rodou e quando roda de novo:

```
systemctl list-timers 'ortus-*' --no-pager
```

O que está em falha:

```
systemctl --failed
```

Nginx:

```
sudo tail -n 50 /var/log/nginx/ortus.error.log
```

Memória e disco:

```
free -h
```

```
df -h /
```

O kernel matou alguém por falta de memória?

```
sudo journalctl -k --since "1 day ago" --no-pager | grep -i 'out of memory'
```

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Site mostra "502 Bad Gateway" | o processo do site está parado ou subindo | `systemctl status ortus.service`; leia o journal |
| Journal do site diz `Could not find a production build` | falta o build | seção 7, depois `sudo systemctl restart ortus.service` |
| Unidade falha com `status=200/CHDIR` | a pasta de trabalho não existe (`/opt/ortus`, o atalho) | confira a seção 5.3 |
| Unidade falha com `status=203/EXEC` | o Node não está em `/usr/bin/node` | seção 4.4; `command -v node` |
| Unidade falha com `status=217/USER` | o usuário `ortus` não existe | seção 4.3 |
| Journal do site diz `EADDRINUSE` na 3500 | outra coisa usa a porta | `sudo ss -ltnp \| grep 3500` |
| Rotina com `http=401` | o `CRON_SECRET` do arquivo mudou e o site não foi reiniciado | `sudo systemctl restart ortus.service` |
| Rotina com `http=404` | a rota não existe nesta versão do código | atualize o código ou desligue o timer |
| Rotina diz `nada escutando em 127.0.0.1:3500` | site parado | `systemctl status ortus.service` |
| Mudei uma `NEXT_PUBLIC_*` e nada mudou | ela entra no build | build de novo (seção 7) e reinicie |
| `ortus-whatsapp` não sobe e o status mostra falha em `ExecStartPre` | não há navegador no caminho de `PUPPETEER_EXECUTABLE_PATH` | `ls -l /usr/bin/google-chrome-stable`; seção 11.1 |
| WhatsApp: `Failed to launch the browser process` | falta biblioteca ou o navegador é de outra arquitetura | rode o teste da seção 11.1 |
| WhatsApp pede QR de novo | o WhatsApp invalidou a sessão, ou a pasta de sessão sumiu | escaneie de novo; confira o backup |
| Aba WhatsApp diz "ainda está abrindo" e depois "O serviço do WhatsApp parou" | o gateway não está rodando | `systemctl status ortus-whatsapp.service` |
| Aba WhatsApp diz "O serviço do WhatsApp recusou este servidor" | site e gateway estão com `WHATSAPP_GATEWAY_SECRET` diferentes (um deles não foi reiniciado depois da troca) | reinicie `ortus.service` e `ortus-whatsapp.service` |
| Aba WhatsApp avisa que o WhatsApp não está configurado neste servidor | `WHATSAPP_GATEWAY_URL` ou `WHATSAPP_GATEWAY_SECRET` vazia no arquivo de ambiente | seção 11.3 |
| A VM sumiu (SSH não responde) | parada pela Oracle por ociosidade, ou outro problema da conta | console → Instances → Start; leia o e-mail da Oracle; seção 1, item 5 |

Depois de um reboot não há nada a fazer: o site, o Nginx, o gateway e os
timers sobem sozinhos, e o gateway reabre as sessões salvas.

---

## 17. Backup do que mora na VM

Quase nada mora só na VM. O banco está no Supabase, os arquivos no R2 e o
código no git. O que se perde junto com a VM:

| O quê | Onde | Se perder |
|---|---|---|
| Variáveis e segredos | `/etc/ortus/ortus.env` | dá para refazer nos painéis de cada serviço, com trabalho |
| Sessões do WhatsApp | `/var/lib/ortus/whatsapp/sessao/` | cada clínica escaneia o QR de novo |
| Certificado | `/etc/letsencrypt/` | pede outro (seção 9) |
| Ajustes locais das unidades | `/etc/systemd/system/*.service.d/` | refaz com `systemctl edit` |
| Configuração do Nginx | `/etc/nginx/sites-available/ortus` | copia de novo de `deploy/oracle/` |

Para a cópia das sessões sair inteira, pare o gateway por alguns segundos:

```
sudo systemctl stop ortus-whatsapp.service
```

Empacote e cifre de uma vez. O `openssl` pede uma senha; guarde-a num
gerenciador de senhas. O arquivo sai na sua pasta, já cifrado:

```
sudo tar -C / -cz etc/ortus var/lib/ortus/whatsapp/sessao etc/letsencrypt etc/nginx/sites-available/ortus | openssl enc -aes-256-cbc -pbkdf2 -salt -out ~/ortus-vm-backup.tar.gz.enc
```

Se você não usa o gateway, tire `var/lib/ortus/whatsapp/sessao` da linha e
pule os comandos de parar e religar. Com Caddy no lugar do Nginx, troque
`etc/letsencrypt etc/nginx/sites-available/ortus` por `etc/caddy`.

Religue o gateway:

```
sudo systemctl start ortus-whatsapp.service
```

**Do seu computador**, baixe o arquivo:

```
scp -i <CAMINHO_DA_SUA_CHAVE> ubuntu@<IP_PUBLICO_DA_VM>:ortus-vm-backup.tar.gz.enc .
```

De volta na VM, apague a cópia:

```
rm ~/ortus-vm-backup.tar.gz.enc
```

Para restaurar numa VM nova: siga o guia até a seção 5, restaure, e continue
da seção 7 (na seção 9 o certificado já está lá: pule o pedido). O comando de
restauração:

```
openssl enc -d -aes-256-cbc -pbkdf2 -in ortus-vm-backup.tar.gz.enc | sudo tar -C / -xz
```

O `tar` guarda dono e permissão pelo nome do usuário, então o usuário `ortus`
tem que existir antes.

Dois avisos honestos:

- O backup tem a chave de serviço do Supabase e sessões de WhatsApp. Quem abre
  esse arquivo entra em tudo. Não deixe cópia sem cifra em lugar nenhum.
- Sessão de WhatsApp restaurada de uma cópia antiga pode ser recusada pelo
  WhatsApp. Eu não testei a restauração. O pior caso é a clínica escanear o QR
  de novo.

Faça o backup depois de conectar ou desconectar uma clínica e depois de mudar
o arquivo de ambiente.

---

## 18. O que ficou para conferir

1. **Nenhum comando deste guia rodou numa VM da Oracle.** As unidades do
   systemd, o `nginx-ortus.conf` e o `Caddyfile` não passaram por
   `systemctl`, `nginx -t` nem `caddy validate`.
2. **Rotas novas** (`/api/assinaturas/processar`, `/api/saude`,
   `/api/saude/vigia`, `/api/pagamentos/webhook`) foram escritas depois da
   primeira versão deste guia e testadas no ambiente local; o caminho completo
   na VM (timer → rota → banco real) não rodou.
3. **Pagamento:** `PAGAMENTO_PROVEDOR`, `MERCADOPAGO_ACCESS_TOKEN` e
   `MERCADOPAGO_WEBHOOK_SECRET` são lidas por `lib/pagamentos/`. O fluxo foi
   provado contra um Mercado Pago falso; falta um teste com a conta de teste
   (sandbox) do Mercado Pago real antes de vender.
4. **Build em Linux ARM e na Micro** não executado nem medido.
5. **Node 26.** O guia usa a linha 24. A 26 não foi testada com o projeto.
6. **Google Chrome para ARM64 com o `whatsapp-web.js` 1.34.7** não testado, e
   as restrições da unidade `ortus-whatsapp.service` não foram testadas com o
   navegador.
7. **Vigia sem gateway:** com `NEXT_PUBLIC_WHATSAPP_ATIVO=0`, ou sem
   `WHATSAPP_GATEWAY_SECRET` (modo indisponível), o vigia não confere o
   gateway e não manda alerta dele (`lib/vigia.ts`, `conferirGateway`).
8. **Aplicativo desktop e gateway da VM na mesma clínica:** as mensagens
   automáticas podem sair em dobro (confirmado no código). Uma clínica, um
   lugar.
9. **Memória por clínica conectada** não medida.
10. **Always Free:** os números da seção 1 são os da página da Oracle em
    18/11/2026. As frases sobre instância parada (não apagada), religar e
    Pay As You Go vêm de um aviso de 2023 e não estão na página atual.
11. **`certbot reconfigure`** (seção 14, passo 6) não executado.
12. **Nomes de menu** do console da Oracle, da Vercel, do Supabase e do
    Mercado Pago podem ter mudado.
13. **Restauração do backup** das sessões do WhatsApp não testada.
