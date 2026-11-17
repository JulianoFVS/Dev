# Ortus Desktop

Aplicativo Windows (Electron + NSIS) que roda o Ortus na máquina da clínica,
com banco local e WhatsApp embutido. O site na Vercel continua existindo e
compartilha o mesmo Supabase — o desktop é uma camada em volta do produto
atual, não um sistema novo.

---

## Como funciona

```
┌───────────────────────── Ortus.exe (Electron) ─────────────────────────┐
│                                                                        │
│  janela (Chromium)  ──►  http://127.0.0.1:<porta next>                 │
│                              │                                         │
│                              │  Next local (filho, ELECTRON_RUN_AS_NODE)│
│                              ├── /api/*            (rotas do produto)   │
│                              ├── /api/local/*      (dados do desktop)   │
│                              └── /api/whatsapp ──► 127.0.0.1:<whatsapp>│
│                                                          │             │
│  processo principal ───────────────────────────────┐     │             │
│   • SQLite  userData/ortus.db                      │     ▼             │
│   • API de dados 127.0.0.1:<db>  ◄─────────────────┼── server.mjs       │
│   • motor de sincronização (outbox ⇄ Supabase)     │   (whatsapp-web.js)│
│   • sessão em cache, segredos, logs                │                    │
└────────────────────────────────────────────────────┼────────────────────┘
                                                     │ JWT do usuário
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

# 3. build do Next (standalone) + config.json
npm run desktop:build

# 4. instalador
npm run desktop:instalar                     # empacota para o sistema atual
```

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

- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `.env.local`
- `RESEND_API_KEY`, `TWILIO_*`, `CRON_SECRET` (ficam no servidor do site)

`scripts/desktop-config.mjs` decodifica o JWT da chave e **aborta o build** se
a chave informada for `service_role`.

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
  config.json            URL + chave anônima do Supabase
```

`userData` no Windows é `%APPDATA%\Ortus`. Nada disso é apagado ao instalar
uma versão nova — só ao desinstalar, e mesmo assim os dados permanecem
(`deleteAppDataOnUninstall: false`).

---

## Sincronização

- **Toda escrita local** entra em `sync_outbox` na mesma transação da escrita.
- A cada **5 segundos** (e sempre que o app abre) o motor:
  1. **empurra** a outbox em ordem (tabela pai antes da filha) via PostgREST,
     com o **JWT do usuário** — nunca service role;
  2. **puxa** o que mudou desde o cursor de cada tabela (`updated_at`);
- **Sem internet**, nada é descartado: a outbox fica no SQLite e o ciclo
  recomeça sozinho quando a rede volta.
- **Conflito** (mesma linha editada em dois computadores): vence o
  `updated_at` mais novo. A versão perdedora vai para `sync_conflitos` e
  aparece em **Configurações → Sincronização**.
- **Primeiro uso**: baixa a clínica inteira para o SQLite antes de liberar a
  tela (bootstrap). Instalação nova em outro PC, com login online, reconstrói
  o backup mais recente.

### Tabelas sincronizadas

`clinicas`, `profissionais` e `profissionais_clinicas` (referência, só leitura
no desktop — para nomes e vínculos aparecerem offline), `pacientes`, `agendamentos`,
`paciente_tratamentos`, `paciente_anamneses`, `paciente_evolucoes`,
`paciente_documentos`, `paciente_debitos`, `tarefas`, `configuracoes_clinica`,
`whatsapp_agendadas`, `whatsapp_envios`, `whatsapp_mensagens`.

Todas têm `updated_at` (migration `20261117_desktop_sync.sql`, com gatilho) e
espelho no SQLite (`desktop/lib/esquema.cjs`).

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
| Login | só com sessão válida em cache |
| Super-admin, convites, SMS, link de anamnese | ❌ (precisa de rede) |

---

## Operação

**Logs:** `<userData>/logs/ortus.log`.

**Resetar tudo:** feche o Ortus e apague a pasta `userData`. Isso apaga o
banco local (o backup na nuvem continua no Supabase).

**Reconectar o WhatsApp:** na aba WhatsApp, “Desconectar” e leia o QR de novo.
Fechar o programa **não** desloga.

**Portas:** escolhidas em runtime (nenhuma fixa). O log mostra as três ao
subir.

---

## Roteiro de teste (aceite)

1. **Instalar** o `Ortus-Setup-<versão>.exe` numa máquina Windows limpa.
2. Abrir o Ortus e **fazer login online** com um usuário da clínica.
3. Esperar a **cópia inicial** terminar (indicação “Sincronizado” no canto).
4. **Desligar a internet**.
5. Criar um **paciente** e um **agendamento**.
6. **Religar a internet** e esperar ~10 s.
7. Conferir no **Supabase** (Table Editor) que o paciente e o agendamento
   chegaram.
8. Na aba **WhatsApp**, ler o **QR Code** com o celular da clínica.
9. Enviar uma mensagem para um número de teste.
10. **Fechar o Ortus** e abrir de novo: o WhatsApp deve voltar **conectado**,
    sem pedir QR.
11. **Desligar a internet** e abrir a aba WhatsApp: a lista e o histórico das
    conversas já gravadas devem continuar visíveis.
12. Digitar uma mensagem sem rede: ela deve ficar na fila e sair quando a
    conexão voltar.

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Abre e fecha na hora | `ELECTRON_RUN_AS_NODE` definido, ou falta `resources/config.json` |
| “Este instalador não veio com a configuração do Supabase” | `desktop:build` rodou sem as variáveis públicas |
| WhatsApp não sobe | falta `services/whatsapp/node_modules` ou `resources/chromium` |
| Indicador preso em “Entre para sincronizar” | sessão expirada e sem rede: conecte e entre de novo |
| Muitos conflitos | uso simultâneo de dois computadores na mesma clínica |
