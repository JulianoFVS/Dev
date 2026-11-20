# Segurança do Ortus

Documento vivo. Explica o modelo de acesso, o que já foi endurecido, como
verificar e o que exige atenção no deploy.

---

## 1. Modelo de dados

```
rede (redes)
 └── clínica (clinicas)          ← cada clínica é um "tenant"
      ├── vínculo (profissionais_clinicas) ← profissional_id + clinica_id
      └── dados (pacientes, agendamentos, financeiro, ...)

profissional (profissionais)     ← 1 por usuário do Supabase Auth (user_id)
```

Regras centrais:

- **Todo dado clínico pertence a uma clínica** (`clinica_id`) ou a um
  paciente, que por sua vez pertence a uma clínica.
- **O acesso é sempre derivado de `auth.uid()`** → `profissionais.user_id`
  → `profissionais_clinicas.clinica_id`. Nunca de um id vindo do cliente.
- **`is_super_admin = true` é o único caminho para a visão global.** Hoje
  existem exatamente dois: os donos da plataforma.

## 2. Camadas de proteção

| Camada | O que faz | Onde |
|---|---|---|
| RLS | Toda tabela do schema `public` tem RLS ligada e policies explícitas por comando | `supabase/migrations/20261114_seguranca_total.sql` |
| Funções `SECURITY DEFINER` | Operações sensíveis (convites, SaaS, agenda multipartes) validam quem chamou dentro do banco | migrations `..._equipe_convites`, `..._saas_painel`, `..._agenda_partes` |
| Grants | `anon` não tem `SELECT/INSERT/UPDATE/DELETE` em nenhuma tabela, sequência ou função do domínio | `20261114_seguranca_total.sql` |
| Storage | Os três buckets são privados; leitura só por caminho autorizado ou pelo proxy do Ortus | idem |
| APIs (`/api/*`) | Verificam o JWT do Supabase no servidor (`auth.getUser`) e revalidam o perfil com service role | `lib/chamadorApi.ts`, `lib/armazenamentoServidor.ts` |
| Proxy (antigo middleware) | Bloqueia rotas protegidas sem sessão e aplica o módulo do RBAC | `proxy.ts` (Next 16) |
| Cabeçalhos | `nosniff`, `SAMEORIGIN`, `Referrer-Policy`, HSTS, `Permissions-Policy` | `next.config.ts` |
| Auditoria | Ações do painel SaaS gravam antes/depois em `audit_log` | `20261114_saas_auditoria.sql` |

### Papéis

| Papel | Como é identificado | Alcance |
|---|---|---|
| Dono da plataforma | `profissionais.is_super_admin = true` | todas as redes, clínicas e faturas |
| Administrador da clínica | `nivel_acesso = 'admin'` **e** vínculo com a clínica | configura a clínica, gerencia equipe, exclui pacientes |
| Membro | vínculo com a clínica | lê e escreve dados clínicos da clínica |
| Visitante (`anon`) | sem sessão | apenas rotas públicas e o proxy de mídia pública |

## 3. Brechas encontradas e corrigidas

Auditoria completa em 14/11/2026 (`node scripts/audit-db.mjs` + inspeção de
`pg_policies`, `pg_proc`, `storage.buckets`).

| # | Problema | Impacto | Correção |
|---|---|---|---|
| 1 | `anon` tinha `SELECT/INSERT/UPDATE/DELETE` em 41 tabelas | qualquer visitante podia tentar ler/escrever (a RLS segurava, mas sem margem) | `REVOKE ALL ... FROM anon` + `ALTER DEFAULT PRIVILEGES` |
| 2 | Policies `FOR ALL` conviviam com policies por comando | `pacientes_all` anulava `pacientes_delete`: **qualquer membro excluía pacientes** | policies explícitas por comando, exclusão só para admin |
| 3 | Buckets `arquivos`, `arquivos_ortus` e `avatars` eram **públicos** | fotos e documentos de pacientes acessíveis por URL direta, sem login | buckets privados + policies por caminho |
| 4 | Policy "Public Access" no bucket legado `arquivos` | listagem pública de objetos | removida; bucket sem policy = negação total |
| 5 | `notificacoes.UPDATE` sem `WITH CHECK` | reatribuir notificação para outro usuário | `WITH CHECK (user_id = auth.uid())` |
| 6 | `audit_log.INSERT` com `CHECK (true)` | forjar registros de auditoria | `WITH CHECK (user_id = auth.uid())` |
| 7 | `servicos_select USING (true)` | catálogo legado legível por qualquer logado | leitura para logados, escrita só super admin |
| 8 | `especialidades` com policy `TO public` lendo tudo | catálogo de outras clínicas | policy por clínica |
| 9 | `configuracoes_clinica` escrita por qualquer membro | membro comum alterava configurações | escrita só para admin da clínica |
| 10 | `/api/lembretes/processar` aberta quando `CRON_SECRET` não existia | qualquer um disparava SMS/e-mail pagos | exige `CRON_SECRET` sempre (falha fechada) |
| 11 | `/api/comunicacao/status` pública | revelava integrações ativas | exigiu super admin; em 18/11/2026 a rota saiu (sem chamador; o estado das integrações fica no painel SaaS) |
| 12 | `v_tarefas_completo` sem `security_invoker` | vazamento entre tenants pela view | `security_invoker=true` + grants |
| 13 | Tabelas de controle (`armazenamento_*`) com grant para logados | tentativa de escrita em contadores | acesso só por service role |
| 14 | `profissionais.INSERT` aberto | criação de perfis fora do fluxo | só super admin / service role |
| 15 | Telas com `zoom` calculado pela altura da janela | em telas baixas tudo ficava minúsculo (não é responsividade) | removido; layout fluido |

## 4. Storage

- Buckets: `arquivos_ortus` (10 MB/objeto), `avatars` (1 MB, só JPEG),
  `arquivos` (legado, vazio para o app).
- Upload passa por `/api/armazenamento` → valida caminho, tipo, tamanho,
  cota da clínica e do projeto, e devolve URL assinada ou URL do R2.
- Leitura privada: `/api/armazenamento/arquivo?caminho=...` (exige JWT e
  confere o vínculo com a clínica do paciente).
- Leitura pública: `/api/public/midia/...` serve **apenas** a logo da clínica
  (`clinicas/<id>/logo-<ts>.png|jpg|jpeg|webp`) e a foto do profissional
  (`avatares/<uid>/avatar.jpg`), no formato exato e em minúsculas; com R2,
  só o que está registrado em `armazenamento_objetos` (o resto é 404 sem
  consultar o Storage).
- Foto de paciente (`pacientes/<uuid>/avatar.jpg`), documento e foto de HOF
  ficam no bucket privado e só abrem por `/api/armazenamento/arquivo`
  (login + vínculo com a clínica). A ficha mostra a foto como objectURL
  (`hooks/useFotoPaciente.ts`), sem cache público. Fotos antigas que ainda
  estão no bucket público: `node scripts/mover-fotos-pacientes.mjs`
  (simulação) e depois `--aplicar`.
- O banco recusa documento que aponte para arquivo de outro paciente ou que
  leve conteúdo embutido que não seja imagem (`20261128_ajustes_finais`).

## 5. Como verificar

```bash
# Estrutura: tabelas, RLS, policies, funções, buckets
npm run db:audit

# Suíte de segurança (roda em transação com ROLLBACK, não altera dados)
npm run test:rls

# Tudo de uma vez
npm test
```

A suíte (257 verificações em 18/11/2026, no banco local de teste) cobre:
RLS ligada em toda tabela, nenhuma policy para visitante, buckets privados,
`anon` sem acesso a tabela nem a função, isolamento entre clínicas, privilégios
dentro da clínica (exclusão de paciente só para administrador), forja de
notificação, escalada para dono da plataforma, painel SaaS, convites (com o
link do e-mail exigido no aceite), agenda, arquivos e tabelas internas,
assinatura e cobrança (régua de atraso, modo de consulta, pagamento repetido,
criação da conta), relatos ao suporte, os achados da revisão de 18/11 e a regra
de matriz e filial. As verificações novas foram rodadas também num banco SEM as
migrations de correção, para provar que cada uma acusa o buraco que fecha.

## 6. Variáveis de ambiente

A lista completa, com o que cada uma faz, está em [`.env.example`](../.env.example)
e na tabela do [`README.md`](../README.md). O que importa para a segurança:

- `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CRON_SECRET`, `RESEND_API_KEY`,
  `MERCADOPAGO_*`, `TWILIO_*`, `R2_*` e `WHATSAPP_GATEWAY_SECRET` ficam só no
  servidor. O build do aplicativo desktop recusa qualquer uma delas.
- Sem `CRON_SECRET` as três rotinas do agendador respondem 401 (falha fechada).
- Sem `MERCADOPAGO_WEBHOOK_SECRET` o webhook recusa todo aviso de pagamento.
- Credencial de teste do Mercado Pago (`TEST-…`) com o servidor em produção
  trava a venda, e pagamento marcado como teste (`live_mode=false`) não cria
  conta nem quita fatura: vai para conferência no painel. Só um servidor de
  homologação usa `MERCADOPAGO_ACEITAR_TESTE=1`.
- Rotas que abrem sem login (compra, link de acesso, "Esqueci a senha")
  aceitam só corpo JSON da própria origem e têm limite de tentativas no banco
  (`limite_publico_consumir`, atômico). IP e e-mail entram só como hash com
  segredo; IPv6 conta pelo bloco /64.
- A compra pela página nunca é reaproveitada, alterada ou cancelada por quem
  só sabe o e-mail: cada envio é uma compra nova, e o identificador de uma
  compra paga não volta para requisição anônima.
- O R2 usa `R2_BUCKET_PUBLICO` (logo e foto de perfil) e `R2_BUCKET_PRIVADO`
  (prontuário, documentos, HOF e foto de paciente); `R2_BUCKET` e `R2_ENDPOINT`
  não existem mais.

## 7. Checklist de deploy

- [ ] Rodar as migrations em ordem (as de 14/11 na ordem abaixo; as demais pela data):
      `20261114_seguranca_total`,
      `20261114_agenda_partes`,
      `20261114_equipe_convites`,
      `20261114_saas_painel`,
      `20261114_saas_auditoria`,
      `20261114_saas_clinicas`,
      `20261114_agenda_preservar`,
      `20261115_normalizar_urls`,
      `20261117_desktop_sync`,
      `20261118_sync_multimaquina`,
      `20261119_offline_completo`,
      `20261120_armazenamento_usuario`,
      `20261121_seguranca_reforco`,
      `20261122_operacao`,
      `20261123_relatos`,
      `20261124_assinaturas`,
      `20261125_seguranca_revisao`,
      `20261126_painel_assinaturas`,
      `20261127_seguranca_rede`,
      `20261128_ajustes_finais`,
      `20261129_orcamentos`,
      `20261130_metas_vendas`,
      `20261201_conversas`,
      `20261202_chamadas`.
      Atenção: `20261114_seguranca_total` não pode ser reexecutada depois de
      `20261120` (concede EXECUTE numa assinatura antiga de função).
- [ ] `npm test` com 100% OK. Com `ORTUS_SUPER_ADMINS="email1,email2"` ela
      confere também que só os donos têm `is_super_admin`.
- [ ] `CRON_SECRET` definido no servidor e o agendador chamando as três rotinas
      (lembretes, assinaturas e vigia) — ver `docs/ORACLE.md` ou `vercel.json`.
- [ ] Confirmar que `SUPABASE_SERVICE_ROLE_KEY` existe **apenas** no servidor.
- [ ] Conferir no painel do Supabase que os buckets estão privados.
- [ ] SMTP do Supabase Auth apontado para a Resend (confirmação de conta e
      redefinição de senha saem do mesmo domínio verificado).
- [ ] Webhook do Mercado Pago cadastrado com a assinatura secreta.
- [ ] Conferir que apenas os donos têm `is_super_admin = true`.

---

## 8. Ortus Desktop (.exe)

O aplicativo Windows roda na máquina da clínica com banco local. O modelo de
segurança muda de "tudo na nuvem" para "dado na máquina + backup na nuvem".

### O que o instalador **não** leva

| Segredo | Por quê |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ignora RLS; com ela, um .exe extraído daria acesso total |
| `DATABASE_URL` | conexão direta ao Postgres |
| `.env.local` | arquivo de desenvolvimento |
| `CRON_SECRET`, `RESEND_API_KEY`, `TWILIO_*` | rotinas do servidor do site |

`scripts/desktop-config.mjs` decodifica o JWT da chave e **recusa o build** se
a chave for `service_role`. Só a chave anônima (pública, a mesma do navegador)
vai em `resources/config.json`.

### Superfície de rede

- Os três processos escutam **somente em 127.0.0.1**, em portas escolhidas em
  runtime (nada fixo, nada exposto na rede da clínica).
- A janela fala só com o Next local. O Next fala com o WhatsApp local. A API
  de dados (SQLite) só aceita requisição **sem cabeçalho `Origin`**, com o
  `Host` local e o segredo dela: navegador não alcança, só os processos locais
  (`desktop/lib/dbApi.cjs`).
- O Next local só atende a janela do Ortus: cada requisição prova a origem
  com o `Host` local, `Origin`/`Sec-Fetch-Site` do próprio aplicativo e o
  segredo desta execução, que o processo principal injeta
  (`desktop/lib/origemLocal.cjs`). Outro site aberto na máquina, outro
  programa e DNS rebinding ficam de fora.
- Next ⇄ API de dados e Next ⇄ WhatsApp usam segredos de 32 bytes gerados na
  instalação e guardados em `userData/segredos.json` (fora do .exe). Eles nunca
  chegam ao renderer.

### Sincronização

- Usa o **JWT do usuário** logado; toda escrita passa pelas policies que já
  exigem `user_has_clinic_access`.
- Onde o gateway antes gravava com service role, agora grava no SQLite e o
  sincronizador envia com o token do usuário.
- `updated_at` é carimbado por gatilho no Postgres, então edições vindas do
  site também entram na fila do pull.

### Limites conhecidos

- O banco local é por máquina e por usuário do Windows: quem tem sessão aberta
  no sistema operacional tem acesso aos dados da clínica naquele computador.
  Proteja a máquina com senha e disco criptografado (BitLocker).
- Sessão em cache permite abrir sem internet; ela é apagada no logout.
