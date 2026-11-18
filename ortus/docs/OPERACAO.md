# Operação: saúde, vigia, backup e custos

Para os donos da plataforma. Diz como saber que algo parou, o que o backup
faz de verdade, por quanto tempo um dado apagado continua nas cópias e onde
ver o uso e a cobrança do R2 na Cloudflare.

Código citado: `lib/vigia.ts`, `app/api/saude/route.ts`,
`app/api/saude/vigia/route.ts`, `lib/rotinas.ts`, `lib/registro.ts`,
`lib/backup.ts`, `vercel.json` e `deploy/oracle/`. A instalação na VM está em
`docs/ORACLE.md`; o WhatsApp, em `docs/WHATSAPP.md`.

Escrito em 18/11/2026. Onde aparece **conferir**, a informação não foi
confirmada na fonte (painel ou documentação do fornecedor) ou pode ter mudado.

---

## 1. Quem percebe o quê

| O que para | Quem percebe | Como você fica sabendo |
|---|---|---|
| O site inteiro (VM desligada, publicação quebrada) | monitor externo em `GET /api/saude` | e-mail do monitor |
| Banco (Supabase) | `GET /api/saude` responde 503; o vigia também | e-mail do monitor; e-mail do vigia só para `ALERTA_EMAILS` (seção 3.3) |
| O agendador inteiro (nenhuma rotina roda, nem o vigia) | `GET /api/saude`: `"agendador": "atrasado"` e 503 | e-mail do monitor |
| Lembretes ou assinaturas | vigia: sem execução dentro da tolerância, execução com erro ou que não terminou | e-mail do vigia |
| Muitas falhas de servidor | vigia: mais de 20 na última hora | e-mail do vigia |
| Gateway do WhatsApp (modo servidor) | vigia: o `/saude` do gateway falha duas vezes seguidas | e-mail do vigia |
| E-mail (Resend) sem configuração | vigia | fica registrado; sem Resend nenhum e-mail sai |

O vigia não confere a si mesmo. Se ele parar, quem percebe é o
`GET /api/saude` — e só se houver um monitor externo chamando essa rota.
Sem monitor externo, uma VM desligada não avisa ninguém.

---

## 2. `GET /api/saude` — para o monitor externo

Pública (o `proxy.ts` libera `/api/saude`), sem segredo e sem login.

```json
{"ok":true,"banco":"ok","configuracao":"ok","agendador":"ok","versao":"0.1.0","verificado_em":"2026-11-18T06:30:00.000Z"}
```

| Campo | Valores | O que quer dizer |
|---|---|---|
| `banco` | `ok`, `erro` | uma consulta trivial (uma linha de `ortus_schema_migrations`, limite de 5 s) respondeu ou não |
| `configuracao` | `ok`, `incompleta` | existem as variáveis sem as quais o site ou as rotinas não funcionam: as três do Supabase, `CRON_SECRET` e, em produção, `NEXT_PUBLIC_APP_URL`. A resposta nunca diz qual falta |
| `agendador` | `ok`, `atrasado`, `falhou`, `sem_registro`, `desconhecido` | último batimento do vigia em `rotinas_execucoes`: dentro da tolerância; fora dela; terminou com erro ou não terminou; o vigia nunca rodou; não deu para ler |
| `versao` | ex.: `0.1.0` ou `0.1.0+abc1234` | `version` do `package.json`; na Vercel, mais os 7 primeiros caracteres do commit |
| `ok` | `true`, `false` | `banco`, `configuracao` e `agendador` em `ok` |

Tolerância do vigia: 1 h na VM (o timer roda a cada 15 minutos;
`ROTINAS.vigia` em `lib/rotinas.ts`) e 26 h na Vercel (o `vercel.json` chama
o vigia uma vez por dia; `TOLERANCIA_VIGIA_DIARIO_HORAS` em `lib/vigia.ts`).

| Status | Quando |
|---|---|
| 200 | o banco respondeu e o vigia não está atrasado nem falhando. Pode vir com `"ok": false`: falta configuração, o vigia nunca rodou ou o batimento não pôde ser lido |
| 503 | o banco não respondeu; ou o vigia, que já rodou alguma vez, está atrasado ou falhou |

- Nunca traz dado de clínica, e-mail, contagem nem nome ou valor de variável.
- `Cache-Control: no-store`. Chamadas em rajada reaproveitam a mesma medição
  por 10 segundos: o banco não é consultado a cada chamada.
- `HEAD /api/saude` devolve o mesmo status, sem corpo.
- Logo depois da primeira publicação, até o vigia rodar uma vez, a resposta é
  200 com `"agendador": "sem_registro"` e `"ok": false`.
- Quando o banco não responde, a falha vai para o stderr (journal na VM, logs
  na Vercel); a resposta continua sendo só o 503.

Testar:

```
curl -sS -w '\nHTTP %{http_code}\n' https://ortus.exemplo.com.br/api/saude
```

### 2.1 Monitor externo

A configuração é a da seção 13 do `docs/ORACLE.md`:

- tipo HTTP(S), endereço `https://<seu domínio>/api/saude`;
- intervalo de 5 minutos;
- fora do ar = qualquer resposta que não seja 2xx, ou nenhuma resposta;
- aviso por e-mail para os donos.

Se o plano do monitor tiver verificação de palavra-chave, exija também
`"ok":true` no corpo: assim ele pega configuração incompleta e vigia que nunca
rodou, casos que respondem 200. **Conferir** se o plano gratuito do serviço
escolhido (UptimeRobot, Better Stack ou outro) inclui palavra-chave: as
páginas de preço não concordam entre si.

Como ler o aviso do monitor: abra a rota no navegador.

| Corpo | O que parou |
|---|---|
| sem resposta | o site (VM, Nginx, processo `ortus`, publicação na Vercel) |
| `"banco":"erro"` | o Supabase, ou as credenciais dele no ambiente |
| `"banco":"ok"` e `"agendador":"atrasado"` | o site está de pé, mas as rotinas pararam (seção 4) |
| `"agendador":"falhou"` | o vigia roda, mas quebra no meio: veja `falhas_servidor`, origem `rotina/vigia` |

---

## 3. `GET /api/saude/vigia` — o vigia

Só o agendador chama: `Authorization: Bearer <CRON_SECRET>`. Sem o
cabeçalho certo a resposta é 401; sem a variável no ambiente, 401 para
qualquer um. Na VM roda a cada 15 minutos; na Vercel, uma vez por dia
(seção 4).

### 3.1 O que confere

| Chave do alerta | Abre quando | Fecha quando |
|---|---|---|
| `rotina:lembretes` e `rotina:assinaturas` | o último batimento em `rotinas_execucoes` não existe, é mais velho que a tolerância (26 h para as duas), terminou com `ok = false`, ou começou há mais de 20 min e não terminou | o último batimento está dentro da tolerância e não falhou |
| `falhas` | mais de 20 linhas em `falhas_servidor` na última hora | 10 ou menos (a folga evita abrir e fechar a cada execução) |
| `whatsapp` | o `GET /saude` do gateway falha duas vezes seguidas (3 s entre as tentativas, 5 s de limite em cada) | o gateway responde |
| `email` | falta `RESEND_API_KEY` ou `RESEND_FROM_EMAIL` | as duas existem |

Detalhes:

- **Batimento** é uma linha em `rotinas_execucoes`, gravada por
  `executarRotina` (`lib/rotinas.ts`) a cada chamada de
  `/api/lembretes/processar` e de `/api/assinaturas/processar`, inclusive a
  simulação (sem `enviar=true` ou com `simular=true`). Uma simulação feita à
  mão conta como execução. A rotina de lembretes termina com `ok = false`
  quando algum envio deu erro (`resumo.erros > 0`).
- **Gateway** só é conferido quando `modoWhatsapp()` é `servidor` e
  `NEXT_PUBLIC_WHATSAPP_ATIVO` não é `0`. Numa VM sem gateway (o
  `ortus.env.exemplo` vem com `WHATSAPP_GATEWAY_SECRET` vazio), o modo é
  `indisponivel` e não há alerta de gateway. No aplicativo de computador
  também não. Em desenvolvimento (`npm run dev`) o site sobe o serviço como
  processo filho, o que conta como `servidor`: o vigia tenta subir o serviço
  e, sem as dependências de `services/whatsapp` instaladas, abre o alerta
  "o serviço não está instalado neste servidor".
- **Falhas** contam todas as origens, inclusive as do próprio vigia (uma
  recusa da Resend, por exemplo). A descrição traz as três origens mais
  frequentes, que são nomes de rota, sem dado pessoal.

### 3.2 Alertas e e-mails

- `alertas_operacao` guarda só o que está aberto: uma linha por chave, e a
  chave é a primária — dois vigias rodando juntos não duplicam o alerta.
  Fechar é apagar a linha. O histórico fica nos e-mails, em
  `rotinas_execucoes` e em `falhas_servidor`.
- **Quando um alerta abre:** um e-mail "[Ortus] Atenção: N itens parados",
  com a descrição de cada item novo. Antes de enviar, o vigia marca
  `avisado_em`: com duas execuções ao mesmo tempo, só uma manda.
- **Se a Resend recusar ou não responder:** o alerta continua aberto,
  `avisado_em` volta a vazio, a resposta traz `"nao_enviados": 1` em `email`
  e o motivo em `avisos`, e a recusa vai para `falhas_servidor`. A execução
  seguinte tenta de novo.
- **Quando um alerta fecha** e o aviso de abertura tinha saído: "[Ortus] Tudo
  voltou ao normal" se nada mais estiver aberto; "[Ortus] De volta ao normal:
  <item>", com a lista do que continua com problema, se ainda houver alerta
  aberto. Alerta que fecha sem nunca ter sido avisado não gera e-mail de
  volta. O e-mail de volta que falha não é repetido (a linha já foi apagada);
  a resposta e `falhas_servidor` registram.
- **Para quem:** `ALERTA_EMAILS` (separados por vírgula); com ela vazia, o
  e-mail de login de cada profissional com `is_super_admin = true`.
- **O que o e-mail leva:** nome do item, horário, contagens e nomes de rota.
  Nada de clínica nem de paciente.
- O botão do e-mail aponta para `/super-admin?aba=operacao`. Enquanto o
  painel SaaS não tiver essa aba, use as consultas da seção 5.

### 3.3 Banco fora

Com o banco fora, o vigia não lê nem grava nada: responde 503 e não deixa
batimento. O e-mail dos donos mora no banco, então o aviso só sai para quem
estiver em `ALERTA_EMAILS` — **defina essa variável** para receber esse
e-mail. O processo do site lembra que já avisou (na VM, até o site
reiniciar) e, quando o banco volta, "Banco de dados" entra no e-mail de volta
ao normal. Na Vercel cada chamada pode cair num processo novo; com o vigia
diário, isso dá no máximo um e-mail por dia. O caminho que não depende de nada
disso é o monitor externo, que recebe 503 em `/api/saude`.

### 3.4 Limpeza

A cada execução o vigia apaga as linhas de `falhas_servidor` com mais de 30
dias e as de `rotinas_execucoes` com mais de 90. Se o vigia parar, a limpeza
para junto.

### 3.5 Resposta

| Campo | O que é |
|---|---|
| `ok` | o vigia conferiu tudo (banco de pé, sem exceção) |
| `banco` | o banco respondeu |
| `tudo_normal` | nenhum alerta aberto depois desta execução |
| `alertas_abertos`, `alertas_novos`, `alertas_fechados` | contagens desta execução |
| `email.configurado`, `email.destinatarios`, `email.enviados`, `email.nao_enviados` | Resend configurada; quantos destinatários (só contados quando havia e-mail a mandar); e-mails que saíram; e-mails que deviam ter saído e não saíram |
| `conferido.rotinas`, `conferido.whatsapp`, `conferido.falhas_ultima_hora` | quantas rotinas foram olhadas, se o gateway foi conferido, falhas na última hora |
| `limpeza.falhas_apagadas`, `limpeza.execucoes_apagadas` | linhas apagadas pela limpeza |
| `itens` | alertas abertos: `chave`, `rotulo`, `detalhe`, `desde`, `avisado` |
| `avisos` | frases sobre o que não deu certo (e-mail que não saiu, banco fora) |

| Status | Quando |
|---|---|
| 200 | conferiu, com ou sem alerta aberto |
| 401 | sem o segredo do agendador |
| 500 | parou no meio; o motivo está em `falhas_servidor`, origem `rotina/vigia` |
| 503 | o banco não respondeu; nada foi gravado |

Na VM, o `ortus-chamar-rotina` leva para o journal só os números e os
verdadeiro/falso dessa resposta (por exemplo `alertas_abertos=1
email.enviados=1 itens[]=1`). O texto dos itens não vai para o journal.

### 3.6 Primeira execução

Logo depois de publicar, uma rotina que ainda não rodou aparece como
"nenhuma execução registrada" e abre alerta. Para não receber esse e-mail,
rode cada rotina uma vez antes de ligar o vigia (na VM,
`sudo systemctl start ortus-assinaturas.service` e, para os lembretes, a
simulação da seção 10.3 do `docs/ORACLE.md`), ou aceite o primeiro aviso: o
"voltou ao normal" chega quando a rotina rodar no horário dela.

### 3.7 Rodar à mão

Na VM (o script lê o segredo do arquivo de ambiente; não ponha o segredo na
linha de comando):

```
sudo systemctl start ortus-vigia.service
```

```
sudo journalctl -u ortus-vigia.service -n 5 --no-pager
```

Na Vercel: o CLI `vercel crons` lista e dispara os crons do projeto
(**conferir** a sintaxe em https://vercel.com/docs/cli/crons).

---

## 4. Agendador

Use um agendador só: ou os crons da Vercel, ou os timers da VM. Os dois
juntos não duplicam lembrete, fatura nem alerta (cada lembrete é reservado no
banco, a fatura é única por competência e o alerta é único por chave), mas
rodam tudo duas vezes. Ao ligar os timers da VM, desligue os crons da Vercel
(botão **Disable Cron Jobs**, seção 4.2).

### 4.1 Na VM (`deploy/oracle/`)

| Rotina | Rota | Quando | Unidades |
|---|---|---|---|
| Lembretes de consulta | `/api/lembretes/processar?enviar=true` | todo dia 13:00 UTC (10h de Brasília) | `ortus-lembretes` |
| Assinaturas e cobranças | `/api/assinaturas/processar` | todo dia 09:00 UTC (6h de Brasília) | `ortus-assinaturas` |
| Vigia da operação | `/api/saude/vigia` | a cada 15 minutos e 3 minutos depois do boot | `ortus-vigia` |

Instalar e ligar: `docs/ORACLE.md`, seção 10. Conferir:

```
systemctl list-timers 'ortus-*' --no-pager
```

```
sudo journalctl -u ortus-lembretes.service -u ortus-assinaturas.service -u ortus-vigia.service --since "2 days ago" --no-pager
```

### 4.2 Na Vercel (`vercel.json`)

| Rotina | Rota | `schedule` (UTC) |
|---|---|---|
| Lembretes | `/api/lembretes/processar?enviar=true` | `0 13 * * *` |
| Assinaturas | `/api/assinaturas/processar` | `0 9 * * *` |
| Vigia | `/api/saude/vigia` | `0 16 * * *` |

Limites por plano, segundo
https://vercel.com/docs/cron-jobs/usage-and-pricing (página de 15/07/2026,
lida em 18/11/2026):

| Plano | Crons por projeto | Intervalo mínimo | Precisão |
|---|---|---|---|
| Hobby (gratuito) | 100 | uma vez por dia | dentro da hora marcada (até 59 min depois) |
| Pro | 100 | uma vez por minuto | dentro do minuto marcado |

No Hobby, uma expressão que roda mais de uma vez por dia **faz a publicação
falhar**. Por isso o vigia está diário no `vercel.json`.

Por que às 16:00 UTC (13h de Brasília): com a folga de até 59 minutos, o vigia
roda entre 16:00 e 16:59, depois dos lembretes (13:00 a 13:59) e das
assinaturas (09:00 a 09:59). Se uma das duas não rodou no dia, o último
batimento dela já passou de 26 h nessa hora, e o alerta sai no mesmo dia.

O que se perde com o vigia diário: a contagem de falhas olha só a hora
anterior à execução; o gateway é conferido uma vez por dia; e um agendador
inteiro parado só aparece no `/api/saude` depois de 26 h.

No Pro, troque o `schedule` do vigia para `*/15 * * * *`. O `/api/saude`
continua com 26 h de tolerância na Vercel; para 1 h, mude
`TOLERANCIA_VIGIA_DIARIO_HORAS` em `lib/vigia.ts`.

Na Vercel, segundo https://vercel.com/docs/cron-jobs/manage-cron-jobs (página
de 11/08/2026):

- `CRON_SECRET` nas variáveis do projeto, ambiente Production. A Vercel manda
  o valor sozinha, como `Authorization: Bearer <valor>`. Trocou o valor:
  publique de novo, porque cada publicação guarda a cópia que tinha.
- Cron só roda na publicação de produção, nunca em preview.
- Cron que falha não é repetido.
- Logs: projeto → **Schedules** → aba **Cron Jobs** → **View Logs**.
- **Disable Cron Jobs**, na mesma aba, desliga todos e vale até alguém
  religar.
- A Vercel chama os Cron Jobs de recurso legado, com migração prevista para
  "Schedules". **Conferir** antes de mexer no `vercel.json`.

---

## 5. Onde ver falhas, batimentos e alertas

As três tabelas são escritas só pelo servidor (service role) e lidas só por
super-admin logado (`supabase/migrations/20261122_operacao.sql`). No SQL
Editor do Supabase, estas consultas só leem:

Alertas abertos:

```sql
SELECT chave, parado_desde, avisado_em, detalhe FROM alertas_operacao ORDER BY parado_desde;
```

Último batimento de cada rotina:

```sql
SELECT DISTINCT ON (rotina) rotina, iniciou_em, terminou_em, ok, resumo
  FROM rotinas_execucoes ORDER BY rotina, iniciou_em DESC;
```

Falhas das últimas 24 h, por origem:

```sql
SELECT origem, count(*) AS falhas, max(criado_em) AS ultima
  FROM falhas_servidor WHERE criado_em > now() - interval '24 hours'
 GROUP BY origem ORDER BY falhas DESC;
```

As falhas mais recentes de uma origem:

```sql
SELECT criado_em, mensagem, codigo, tipo, onde, clinica_id, extra
  FROM falhas_servidor WHERE origem = 'rotina/lembretes' ORDER BY criado_em DESC LIMIT 20;
```

O que há em `falhas_servidor`: origem (rota ou rotina), mensagem, código,
tipo e a linha do código onde quebrou. `registrarFalha` (`lib/registro.ts`)
troca e-mail, CPF, CNPJ, telefone, token, chave, URL do banco e UUID por
marcadores antes de gravar, e nunca grava o objeto de erro inteiro.
`clinica_id` é o número interno da clínica, quando houver.

Cada falha também vai para o stderr, numa linha JSON com `"nivel":"erro"`:

- VM: `sudo journalctl -u ortus -n 200 --no-pager | grep '"nivel":"erro"'`
- Vercel: projeto → **Logs**, busca por `"nivel":"erro"` (**conferir** o nome
  do menu).

### 5.1 Quando chega um alerta

| Alerta | Onde olhar primeiro |
|---|---|
| Lembretes ou assinaturas sem execução | VM: `systemctl list-timers 'ortus-*'` e `journalctl -u ortus-lembretes.service -n 50` (ou `ortus-assinaturas`). Vercel: **View Logs** do cron; um 401 ali é `CRON_SECRET` diferente entre o projeto e a publicação |
| Execução que terminou com erro | o `resumo` do batimento (consulta da seção 5) e `falhas_servidor` com origem `rotina/<nome>` ou a da rota |
| Execução que não terminou | o processo foi interrompido: tempo limite (`maxDuration` de 60 s na Vercel; `TimeoutStartSec` na VM) ou site reiniciado no meio |
| Falhas do servidor | a consulta por origem da seção 5 |
| Gateway do WhatsApp | `systemctl status ortus-whatsapp`, `curl -s http://127.0.0.1:3920/saude` e `docs/WHATSAPP.md`, seções 7 e 8 |
| E-mail (Resend) | `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no ambiente; reinicie o site depois de mudar |
| Banco de dados | https://status.supabase.com, o painel do projeto e as credenciais no ambiente |

---

## 6. Backup

Há três camadas, e nenhuma delas é configurada pelo código para os arquivos:

1. o backup interno do Ortus (tabela `backups`, no próprio banco);
2. o backup do Supabase, que depende do plano;
3. a cópia do que mora só na VM (`docs/ORACLE.md`, seção 17).

### 6.1 O backup interno (`lib/backup.ts` e as funções do banco)

**O que copia.** `criar_backup_completo`
(`supabase/migrations/20261031_seguranca_geral.sql:299-329`) monta um JSON
com seis tabelas inteiras, de **todas as clínicas juntas**: `pacientes`,
`agendamentos`, `despesas`, `clinicas`, `profissionais` e `servicos`. Não
entram: tratamentos, evoluções, anamneses, documentos e débitos dos
pacientes; vínculos da equipe (`profissionais_clinicas`), permissões,
configurações, planos, tarefas, comissões; redes, assinaturas e faturas;
WhatsApp; contas de acesso (`auth.users`); e nenhum arquivo.

**Onde guarda.** Na coluna `dados` da tabela `public.backups`, **no mesmo
banco** que ela protege. Se o banco se perder, as cópias vão junto: não é
backup contra perda do banco.

**Quantas cópias.** Depois de cada cópia, a função apaga o excedente: ficam as
30 mais recentes de tipo `automatico…` e as 10 mais recentes dos outros tipos
(manual). É contagem, não prazo em dias.

**Quem dispara.**

- O botão **Backup manual** em Configurações → Backup, que só aparece para
  super-admin.
- `verificarBackupAutomatico()` (`lib/backup.ts:82-101`), chamada pelo
  `components/AuthGuard.tsx` no navegador de **qualquer** pessoa logada. Ela
  olha no máximo uma vez por hora por navegador (guarda a hora em
  `localStorage`, chave `ortus_ultimo_backup_check`) e cria uma cópia se a
  última tiver mais de 12 horas. Só funciona para super-admin: para os
  outros, a RLS esconde a lista e a função recusa com 42501. Na prática, só há
  cópia automática nos dias em que um dono da plataforma abre o sistema, e no
  máximo duas por dia.
- Não há agendamento no banco: nenhuma migration usa `pg_cron`, apesar do
  comentário em `lib/backup.ts`. **Conferir** no painel do Supabase se alguém
  criou um job à mão (Database → extensões/Cron).
- No aplicativo de computador, a leitura da última cópia vai ao banco local,
  que não tem a tabela `backups`; pela leitura do código, um super-admin no
  aplicativo dispararia uma cópia a cada checagem de hora em hora (não
  testado).

**Quem vê, baixa e apaga.** Só super-admin (RLS de `backups`). **Baixar**
salva no computador um JSON com os dados de todas as clínicas, sem cifra e sem
registro. **Excluir** apaga a cópia da tabela.

**Restauração.** `restaurar_backup`
(`supabase/migrations/20261031_seguranca_geral.sql:331-359`) apaga
`agendamentos`, `despesas`, `pacientes`, `servicos`,
`profissionais_clinicas`, `profissionais` e `clinicas` de **todas as
clínicas** e regrava o que está na cópia. Provado em 18/11/2026 num Postgres
em memória com a base reconstruída do ambiente de teste e todas as migrations
(o banco real pode ter colunas e chaves a mais):

| Situação | Resultado |
|---|---|
| Restaurar pela tela (super-admin logado) | conclui |
| Paciente eliminado depois da cópia | **volta** |
| Paciente criado depois da cópia | some |
| Evolução de um paciente que nunca foi apagado | **some e não volta** (a exclusão de `pacientes` leva em cascata tratamentos, evoluções, anamneses, documentos e débitos, que não estão na cópia) |
| Configurações da clínica | somem (cascata da exclusão de `clinicas`) |
| Vínculos da equipe | **ficam zerados**: ninguém fica ligado a clínica nenhuma |
| Cada linha apagada pela restauração | entra em `sync_exclusoes`, o registro que os computadores com o aplicativo usam para apagar a cópia local (o efeito nos computadores não foi testado) |
| Restaurar pela tela com alguma rede em modo de consulta | **falha inteira** (PT402) e nada muda |
| Restaurar pelo SQL Editor (sem papel de usuário) | conclui, mesmo com rede em modo de consulta |

A tela de restauração já avisa a maior parte disso (Configurações →
Backup → Restaurar). Como a cópia está no mesmo banco e a restauração apaga o
prontuário de todas as clínicas, **não restaure por esse caminho** para
recuperar um dado perdido: use o backup do Supabase (6.2), de preferência
restaurado num projeto separado, e copie de lá só o que faltar.

**Promessa que o código não cumpre.** A Política de Privacidade
(`app/privacidade/page.tsx:52`) e os Termos (`app/termos/page.tsx:37`) falam
em backup automático "ao menos 2 vezes por dia" com "30 versões". O código não
garante nenhuma das duas coisas (veja "Quem dispara").

### 6.2 O backup do Supabase

Segundo https://supabase.com/docs/guides/platform/backups (lida em
18/11/2026):

| Plano | Backup diário | Recuperação a um ponto no tempo (PITR) |
|---|---|---|
| Free | a página não lista backup para o Free; recomenda exportar com o CLI (`supabase db dump`) | não |
| Pro | últimos 7 dias | complemento pago, 7, 14 ou 28 dias |
| Team | últimos 14 dias | complemento pago, 7, 14 ou 28 dias |
| Enterprise | até 30 dias | complemento pago, 7, 14 ou 28 dias |

- Ligar o PITR desliga os backups diários.
- O backup é só do banco: **não inclui os arquivos** guardados pelo Storage
  (o banco guarda só os metadados deles).
- Restaurar deixa o projeto fora do ar enquanto dura, e o tempo cresce com o
  tamanho do banco. Restaurar com PITR substitui o estado atual: para não
  perder o que foi feito depois, restaure num projeto novo.
- A página traz o preço do PITR por período; consulte lá antes de contratar.

O que conferir no painel (o plano deste projeto não está no repositório):

1. O plano da organização (configurações da organização → cobrança;
   **conferir** o nome do menu).
2. **Database → Backups**: se aparece a lista de backups diários e de quantos
   dias.
3. **Database → Backups → Point in Time**: se o PITR está ligado e com quantos
   dias.
4. Se o plano for o Free: não há cópia do fornecedor. Exporte o banco com
   frequência pelo CLI do Supabase (`supabase db dump`; **conferir** as
   opções em https://supabase.com/docs/reference/cli). O arquivo tem o
   prontuário de todas as clínicas: cifre (como na seção 17 do
   `docs/ORACLE.md`) e guarde fora do repositório.
5. Uma vez, restaure um backup num projeto de teste e confira que abre. Backup
   que nunca foi restaurado não está provado.

### 6.3 Arquivos e o que mora na VM

- **R2:** o código apaga o objeto na hora (`DeleteObjectCommand`,
  `lib/r2.ts:132-149`) e não liga versão nem replicação. A página de
  compatibilidade S3 do R2 lista `PutBucketVersioning` como não implementado
  (**conferir** em https://developers.cloudflare.com/r2/api/s3/api/). Arquivo
  apagado no R2 não volta, e nenhum backup do Supabase o cobre.
- **Storage do Supabase** (arquivos antigos): também fora do backup do banco.
- **VM:** variáveis, sessões do WhatsApp, certificado e configuração do Nginx
  — `docs/ORACLE.md`, seção 17.

### 6.4 Por quanto tempo um dado apagado continua nas cópias

| Onde | Até quando |
|---|---|
| Cópias internas (tabela `backups`) | até a cópia sair pela rotação: depois de mais 30 cópias automáticas (uns 15 dias, com duas por dia; para sempre, se nenhum super-admin entrar) ou mais 10 manuais; ou até um super-admin excluir a cópia |
| JSON baixado pela tela | para sempre, fora do alcance do sistema |
| Backups diários do Supabase | 7 (Pro), 14 (Team) ou até 30 dias (Enterprise) depois do último backup que ainda continha o dado. Como esses backups levam junto a tabela `backups`, o prazo real é a soma: rotação das cópias internas + retenção do plano |
| PITR | a janela contratada (7, 14 ou 28 dias), somada da mesma forma |
| R2 | sem versão: o objeto some quando é apagado. Mas o código não apaga os arquivos de paciente excluído (`docs/LGPD-INVENTARIO.md`, 7.2): eles ficam |
| Computadores com o aplicativo | a exclusão viaja e apaga a linha local, mas a versão apagada é copiada para `sync_conflitos` (`docs/LGPD-INVENTARIO.md`, 7.2) |
| `falhas_servidor` e `rotinas_execucoes` | 30 e 90 dias (limpeza do vigia). Não guardam dado pessoal |
| Logs (journal da VM, logs da Vercel) | conforme a configuração de cada um (**conferir**) |

---

## 7. Uso e cobrança do R2 na Cloudflare

**Uso por bucket:** painel da Cloudflare → **R2 Object Storage** →
**Overview** → escolha o bucket (`R2_BUCKET_PUBLICO` e `R2_BUCKET_PRIVADO`,
por padrão `ortus-publico` e `ortus-privado`) → aba **Metrics**. O total da
conta só sai pela API GraphQL
(https://developers.cloudflare.com/r2/platform/metrics-analytics/).

**Cobrança:** **Manage Account** → **Billing** → **Billable Usage**. Mostra o
uso total, o que passou do gratuito e o custo acumulado no ciclo, por produto
(filtre por R2). Só para contas Pay-as-you-go e para quem tem permissão de
leitura de Billing
(https://developers.cloudflare.com/billing/manage/billable-usage/). Dá para
criar alerta de orçamento a partir desse painel; passo a passo em
https://developers.cloudflare.com/billing/manage/budget-alerts/. As faturas
ficam em **Billing** (**conferir** o nome da aba).

**Gratuito por mês**, só na classe Standard (não vale para Infrequent
Access), segundo https://developers.cloudflare.com/r2/pricing/ (página de
30/10/2026, lida em 18/11/2026):

| Item | Gratuito por mês | Acima disso (Standard) |
|---|---|---|
| Armazenamento | 10 GB-mês | US$ 0,015 por GB-mês |
| Operações Classe A | 1 milhão | US$ 4,50 por milhão |
| Operações Classe B | 10 milhões | US$ 0,36 por milhão |
| Saída para a internet | grátis | grátis |

O armazenamento é a média dos picos diários no ciclo de 30 dias. O que o
Ortus gasta de cada classe (`lib/r2.ts`):

- **Classe A:** cada envio de arquivo (`PutObject`, pelo link assinado).
- **Classe B:** cada leitura (`GetObject`, inclusive a leitura parcial que
  confere o tipo do arquivo) e cada conferência de tamanho (`HeadObject`).
- **Grátis:** apagar (`DeleteObject`).

---

## 8. O que ficou para conferir

1. **Produção:** se a migration `20261122_operacao` está aplicada, se
   `CRON_SECRET` e `ALERTA_EMAILS` estão definidas e quem são os
   super-admins (são eles que recebem os alertas quando `ALERTA_EMAILS` está
   vazia).
2. **Plano do Supabase**, backup diário e PITR (6.2).
3. **Plano da Vercel** (4.2) e se os três crons apareceram em Schedules →
   Cron Jobs depois da publicação.
4. **Monitor externo** apontado para `/api/saude`, e se o plano dele tem
   palavra-chave (2.1).
5. **Aba Operação do painel SaaS:** o e-mail de alerta aponta para
   `/super-admin?aba=operacao`.
6. **Testado só no ambiente local:** abertura, repetição, volta ao normal,
   Resend fora, duas execuções juntas, limpeza e o 503 de agendador atrasado
   foram provados contra o ambiente de teste local. O caminho de banco fora
   (3.3) e o gateway num servidor de verdade não foram executados.
7. **Restauração do backup interno** foi provada num banco reconstruído, não
   no banco real (6.1).

---

## 9. Assinaturas: o que o dono confere

### 9.1 Pagamentos "a conferir" (painel SaaS → Assinaturas)

O sistema nunca devolve dinheiro sozinho. Quando um pagamento não pode ser
aplicado com segurança, ele fica na lista "a conferir" com o motivo. O que
fazer em cada caso:

| Motivo | O que aconteceu | O que fazer |
|---|---|---|
| `duplicado` | a mesma fatura ou a mesma pessoa foi paga duas vezes (inclusive uma contestação decidida a favor depois de a clínica pagar de novo) | estornar um dos pagamentos no Mercado Pago e dar por conferido com a anotação |
| `email_em_uso` | o e-mail da compra ganhou conta por outro caminho (ex.: convite) antes de o pagamento chegar; nenhuma conta nova foi criada | falar com a pessoa; estornar ou ligar a assinatura à rede certa à mão |
| `valor_divergente` | o valor pago não bate com o da compra ou da fatura | conferir no Mercado Pago; estornar e pedir o pagamento certo |
| `contestacao_atualizada` | a contestação (chargeback/mediação) mudou de fase | ver o desfecho no Mercado Pago; se o dinheiro ficou com o Ortus, marcar a fatura como paga no painel |
| `estorno_parcial` | o provedor devolveu parte do valor | decidir se a fatura fica paga ou volta a ficar em aberto |
| `pagamento_de_teste` | pagamento feito em ambiente de teste chegou ao servidor de produção | conferir a configuração do Mercado Pago (credencial de produção) |
| `sem_alvo` / `fatura_cancelada` | pagamento sem compra/fatura conhecida, ou de fatura cancelada | estornar |

### 9.2 Compras pela página

Cada envio do formulário é uma compra nova (ninguém toma a compra de outra
pessoa só sabendo o e-mail). Quando uma compra é paga, as outras ainda sem
pagamento do mesmo e-mail são encerradas; se outra delas também for paga, cai
em `duplicado`. A rotina diária confere com o provedor, por 10 dias, até as
compras encerradas que tinham cobrança aberta (Pix ou link pago depois).

Quem pagou e não terminou de criar a senha pode pedir outro link na página de
retorno ou usar "Esqueci a senha" na tela de login; o painel também reenvia.

### 9.3 Rede em modo de consulta

No modo de consulta nada é gravado pelo aplicativo, nem pelo dono da
plataforma: corrigir um dado, atender um pedido de exclusão (LGPD) ou apagar o
perfil de um ex-funcionário com horários, comissões ou tarefas dá o aviso de
assinatura suspensa. Para essas tarefas, dê um **prazo extra** curto na aba
Assinatura da rede (a gravação volta na hora), faça o que precisa e remova o
prazo. Desvincular um funcionário funciona sem isso.

Ligar a cobrança automática, reativar uma assinatura cancelada ou religar uma
rede suspensa faz a dívida antiga contar a partir daquele dia: com fatura
antiga em aberto, a rede fica "em atraso" a partir do dia seguinte, recebe o
aviso e só entra em modo de consulta depois dos 7 dias de tolerância.

O aplicativo de computador grava no banco local e a nuvem recusa na
sincronização; a recusa aparece em Configurações → Sincronização e pode ser
reenviada depois do pagamento.

### 9.4 Limites dos planos

Básico: 1 profissional e 1 unidade. Profissional: até 3 profissionais e 1
unidade. Clínica: sem limite de profissionais e várias unidades. Planos
combinados (essencial, rede, enterprise): sem limite. Os números ficam em
`planos_saas.limite_profissionais` e `limite_unidades` (NULL = sem limite).
Para liberar uma rede, mude o plano dela no painel. Quem já está na equipe
nunca é removido por causa do plano; o limite vale para quem entra.

---

## 10. Homologação (build de produção contra serviços falsos)

Em produção (`NODE_ENV=production`) o site ignora as variáveis
`ORTUS_TESTE_URL_RESEND`, `ORTUS_TESTE_URL_R2` e `ORTUS_TESTE_URL_PAGAMENTO`:
um servidor publicado nunca troca o endereço da Resend, do R2 ou do Mercado
Pago por descuido. Um servidor de homologação, que roda o build de produção
contra serviços falsos, liga a exceção com as três juntas:

| Variável | Valor | Para quê |
|---|---|---|
| `ORTUS_HOMOLOGACAO` | `1` | aceita as `ORTUS_TESTE_URL_*` no build de produção (`lib/servicosExternos.ts`) |
| `ORTUS_TESTE_URL_*` | endereço do serviço falso | e-mail, arquivos e pagamento vão para lá |
| `MERCADOPAGO_ACEITAR_TESTE` | `1` | pagamento de teste cria a conta, como em produção faria o de verdade |

Na produção de verdade, nenhuma das três existe no arquivo de ambiente.

A demonstração da preparação do lançamento roda assim numa VPS (relatório,
item 20): `https://ortus.trinityforce.duckdns.org`, com banco PGlite em
memória e Supabase, R2, Resend e Mercado Pago falsos.
