# Ortus

Sistema de gestão para clínicas odontológicas (SaaS multi-tenant): agenda,
prontuário, odontograma, HOF, financeiro, relatórios, laboratório de próteses,
tarefas e comunicação com o paciente.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript estrito · Tailwind
CSS · Supabase (Postgres + Auth + Storage) · Cloudflare R2 (arquivos).

---

## Começando

```bash
npm install
cp .env.example .env.local   # preencha as chaves (veja abaixo)
npm run dev
```

Abra `http://localhost:3000`.

### Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | sim em produção | endereço público: links de e-mail, retorno do pagamento e webhook |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | chave pública (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | **somente servidor** — APIs e rotinas; nunca no aplicativo desktop |
| `DATABASE_URL` | só para os scripts | pooler do Supabase (porta 6543): `npm test`, `db:audit`, migrations, limpeza |
| `SUPABASE_PROJECT_REF` | não | identifica o projeto nos scripts |
| `CRON_SECRET` | sim em produção | protege `/api/lembretes/processar`, `/api/assinaturas/processar` e `/api/saude/vigia` (401 sem ela) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_PUBLICO` / `R2_BUCKET_PRIVADO` | não | arquivos no Cloudflare R2 (sem elas, cai no Storage do Supabase) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | sim para e-mail | e-mail pela Resend; remetente de domínio verificado |
| `ALERTA_EMAILS` | não | quem recebe relatos e alertas (vazio = donos da plataforma) |
| `PAGAMENTO_PROVEDOR` / `MERCADOPAGO_ACCESS_TOKEN` / `MERCADOPAGO_WEBHOOK_SECRET` | sim para vender pela página | assinatura com Pix ou cartão (Mercado Pago Checkout Pro) |
| `MERCADOPAGO_ACEITAR_TESTE` | só em homologação | `1` aceita pagamento de teste num servidor em modo produção; vazio em produção |
| `NEXT_PUBLIC_SUPORTE_WHATSAPP_1` / `_2` | sim para o suporte | números do suporte na Ajuda (só dígitos, com DDI) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | não | SMS |
| `NEXT_PUBLIC_WHATSAPP_ATIVO` | não | `0` esconde a aba WhatsApp |
| `WHATSAPP_GATEWAY_URL` / `WHATSAPP_GATEWAY_SECRET` / `WHATSAPP_GATEWAY_AUTOSTART` | não | WhatsApp em servidor — ver [`docs/WHATSAPP.md`](docs/WHATSAPP.md) |

O modelo completo, com comentários, está em [`.env.example`](.env.example).

Segurança, modelo de acesso e checklist de deploy: [`docs/SEGURANCA.md`](docs/SEGURANCA.md).
Operação (saúde, vigia, backup e custos): [`docs/OPERACAO.md`](docs/OPERACAO.md).
Publicação na Oracle Cloud (gratuito): [`docs/ORACLE.md`](docs/ORACLE.md).

## Desktop (Windows)

Além do site, o Ortus roda como aplicativo instalável na clínica (Electron +
NSIS), com **banco local** e **WhatsApp embutido** (whatsapp-web.js), sincronizando
com o Supabase quando há internet.

```bash
npm --prefix services/whatsapp ci
node scripts/desktop-chromium.mjs --atual
npm run desktop            # abre o shell em desenvolvimento
npm run desktop:teste      # testa a camada local (SQLite + outbox)
npm run desktop:build      # build standalone + config
npm run desktop:instalar   # gera o .exe (rodar no Windows/CI)
```

Documentação completa — arquitetura, sincronização, offline, segurança e roteiro
de teste: [`desktop/README.md`](desktop/README.md).
Passo a passo de instalação por sistema: [`docs/INSTALACAO.md`](docs/INSTALACAO.md).

## Scripts

```bash
npm run dev            # desenvolvimento
npm run build          # build de produção
npm run start          # servir o build
npm run lint           # ESLint

npm run db:migrate -- 20261114_seguranca_total.sql   # aplica uma migration
npm run db:audit       # inventário de tabelas, policies e buckets
npm run db:inventory   # inventário detalhado (e-mails mascarados)
npm test               # suíte de segurança do banco (roda em transação e desfaz tudo)
npm run db:types       # regenera tipos do Supabase (requer CLI)
npm run db:clean       # limpeza para o lançamento: sem parâmetros só mostra o inventário
node scripts/limpar-orfaos.mjs    # arquivos órfãos no R2/Storage: sem parâmetros só lista
```

## Estrutura

```
app/                 rotas (App Router) e APIs
  agenda/            agenda (dia, semana, mês, lista, por profissional)
  pacientes/         lista e ficha do paciente (prontuário, HOF, odontograma)
  financeiro/        caixa, lançamentos, cobranças
  relatorios/        indicadores e comparativos
  proteses/          kanban de laboratório
  tarefas/           tarefas da equipe
  ajustes/equipe     equipe, permissões, horários e comissões
  ajustes/tratamentos catálogo de procedimentos e preços
  configuracoes/     preferências, unidades, integrações
  mensagens/         caixa de mensagens, notificações e convites
  super-admin/       painel SaaS (exclusivo dos donos da plataforma)
  api/               rotas de servidor (service role, JWT obrigatório)

components/
  ui/                primitivos (Modal, CustomSelect, Tabs, Switch, ...)
  dashboard/         casca do app (sidebar, navegação mobile, troca de clínica)
  bento/             cartões e blocos do layout
  clinico/           odontograma e HOF
  landing/           site institucional

lib/                 regras de negócio, integrações e helpers
supabase/migrations/ DDL versionado — fonte de verdade do banco
scripts/             auditoria, migrations, testes de RLS, mídia
docs/                guias e documentação de segurança
```

## Banco de dados

As migrations em `supabase/migrations/` são a fonte de verdade. Aplique em
ordem cronológica:

```bash
node scripts/apply-migration.mjs <arquivo>.sql
```

Principais tabelas: `redes` → `clinicas` → `profissionais_clinicas` →
`profissionais`; dados clínicos em `pacientes`, `agendamentos`,
`paciente_tratamentos`, `paciente_anamneses`, `paciente_documentos`,
`paciente_evolucoes`, `paciente_debitos`; financeiro em `despesas`,
`comissoes_*`, `faturas`; configuração em `configuracoes_clinica`.

## Convenções

- **Multi-tenant:** todo dado é filtrado por `clinica_id` e a RLS reforça isso
  no banco. Nunca confie em um `clinica_id` vindo do cliente.
- **Permissões:** RBAC por módulo (`lib/modules.ts`) + nível de acesso
  (`admin` / `comum`) por clínica.
- **Multi-tenant no front:** use `useClinica()` para a clínica ativa e os
  helpers de `lib/clinicScoped.ts` para listas.
- **Tipagem:** TypeScript estrito, sem `any` novo.
- **UI:** Português do Brasil, PT-BR; mobile-first de verdade (reorganizar,
  não encolher); alvos de toque ≥ 44px.
- **Supabase no cliente:** sempre `try/catch`, estado de carregamento e
  `disabled` durante o envio.
