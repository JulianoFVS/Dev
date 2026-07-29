# Supabase — Ortus

## Conexão

Use a **connection string do pooler** (Transaction mode, porta 6543) no `.env.local`:

```env
DATABASE_URL=postgresql://postgres.SEU_REF:SENHA@aws-1-sa-east-1.pooler.supabase.com:6543/postgres
SUPABASE_PROJECT_REF=SEU_REF
NEXT_PUBLIC_SUPABASE_URL=https://SEU_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

> A conexão **Direct** (`db.xxx.supabase.co:5432`) pode falhar em redes sem IPv6. Prefira o pooler.

## Aplicar migrations

```bash
node scripts/apply-migration.mjs 20260729_lembretes_horarios_recebimento.sql
node scripts/apply-migration.mjs 20260730_ficha_relacional.sql
```

Gerar tipos TypeScript (requer Supabase CLI):

```bash
npm run db:types
```

Auditar schema:

```bash
node scripts/audit-db.mjs
```

## Estrutura

| Pasta | Conteúdo |
|-------|----------|
| `supabase/migrations/` | DDL versionado (fonte de verdade) |
| `scripts/` | Ferramentas de audit/apply |
| `lib/configClinica.ts` | Config JSON por clínica (`configuracoes_clinica`) |
| `lib/configKeys.ts` | Chaves tipadas de configuração |
| `lib/db/` | Repositórios do prontuário relacional (Fase 2) |
| `lib/fichaPaciente.ts` | Carrega prontuário completo (SQL + JSON clínico) |

## Tabelas principais

- **Core:** `clinicas`, `pacientes`, `agendamentos`, `profissionais`
- **Financeiro:** `despesas`, `comissoes_*`, colunas de taxa em `agendamentos`
- **Catálogo:** `tratamentos_base`, `planos`, `planos_tratamentos`
- **Operação:** `tarefas`, `lembretes_agenda`, `profissionais_horarios`
- **Prontuário (Fase 2):** `paciente_tratamentos`, `paciente_anamneses`, `paciente_documentos`, `paciente_evolucoes`
- **Config:** `configuracoes_clinica` (templates, categorias, preferências)

## Legado

- `servicos` — deprecated, usar `tratamentos_base`
- `ficha_medica` JSON — mantém só odontograma, HOF e campos gráficos
