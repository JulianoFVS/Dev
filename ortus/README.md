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
| `NEXT_PUBLIC_SUPABASE_URL` | sim | projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | chave pública (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | **somente servidor** — APIs e rotinas |
| `DATABASE_URL` | sim | pooler do Supabase (porta 6543), usado pelos scripts |
| `SUPABASE_PROJECT_REF` | não | geração de tipos |
| `CRON_SECRET` | sim em produção | protege `/api/lembretes/processar` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_ENDPOINT` | não | armazenamento em Cloudflare R2 |
| `RESEND_API_KEY` | não | e-mail |
| `TWILIO_*` | não | SMS |
| `WHATSAPP_GATEWAY_SECRET` | não | gateway do WhatsApp |

Segurança, modelo de acesso e checklist de deploy: [`docs/SEGURANCA.md`](docs/SEGURANCA.md).

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
npm run db:inventory   # inventário detalhado
node scripts/testar-rls.mjs                          # suíte de segurança (rollback)
npm run db:types       # regenera tipos do Supabase (requer CLI)
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
