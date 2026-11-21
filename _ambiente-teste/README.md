# Ambiente de teste do Ortus

Tudo roda em 127.0.0.1. Um servidor (`servidor.mjs`) imita o Supabase (login,
dados no estilo PostgREST, storage), o R2, a Resend, o Mercado Pago e o Google
(OAuth e Agenda). O banco é PGlite em memória, refeito do zero a cada início
com `base.sql`, todas as migrations de `ortus/supabase/migrations` e o
`seed.mjs`. Nada daqui fala com serviço externo nem com o banco real.

## Subir

```bash
cd _ambiente-teste
npm ci                 # só na primeira vez (PGlite)
bash reiniciar.sh      # serviços em :54321 e Postgres em :54322; grava env.gerado
node dev.mjs           # o Ortus em http://localhost:3000, apontando para cá
```

As dependências do app (`ortus/node_modules`) também precisam estar
instaladas: os testes usam o `supabase-js` e o `pg` de lá. `bash parar.sh 54321
54322` desliga os serviços. As variáveis do `dev.mjs` vão pelo ambiente do
processo e vencem qualquer `.env.local`.

Contas de exemplo (senha `Teste@1234`):

| E-mail | Papel |
|---|---|
| `gabriel@ortus.test`, `juliano@ortus.test` | donos da plataforma (Painel SaaS) |
| `ana.admin@maissorriso.test` | administradora da Mais Sorriso |
| `bia.recepcao@maissorriso.test` | recepção da Mais Sorriso |
| `caio.admin@bemestar.test` | administrador da Bem Estar |
| `dani.dentista@bemestar.test` | dentista da Bem Estar |

## Testes

Com o ambiente no ar. Os de ponta a ponta e o `paginas.mjs` precisam também
do `node dev.mjs`.

| Comando | O que confere |
|---|---|
| `cd ortus && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test` | permissões e RLS (`ortus/scripts/testar-rls.mjs`), tudo em ROLLBACK |
| `node e2e-assinatura.mjs` | compra → provedor → webhook → conta → atraso → modo de consulta → pagamento |
| `node e2e-email.mjs` | e-mails de convite e a rota da anamnese |
| `node e2e-senha.mjs` | "Esqueci a senha" do pedido até entrar com a senha nova |
| `node e2e-orcamentos.mjs` | orçamentos, funil e oportunidades |
| `node e2e-conversas.mjs` | conversas da equipe e chat com o suporte |
| `node e2e-chamadas.mjs` | chamada na TV |
| `node e2e-google.mjs` | Google Agenda e a tela de Integrações |
| `node paginas.mjs` | todas as páginas abrem, para visitante e para quem está logado |
| `node fumaca.mjs` | fumaça do ambiente com o supabase-js do projeto |
| `node build.mjs` | `next build` de produção com variáveis de mentira |

**Atenção:** o PGlite atende uma conexão só, dividida entre o app e os testes.
Uma tela aberta que consulta o banco de tempos em tempos (conversas, suporte,
TV, contadores do menu) encerra a transação do `npm test` ("ROLLBACK TO
SAVEPOINT can only be used in transaction blocks"). Antes de rodar a suíte,
deixe o navegador fora do app, por exemplo em http://127.0.0.1:54321/_teste/emails.

## Controles de teste

- `http://127.0.0.1:54321/_teste/emails`: e-mails enviados (DELETE limpa).
- `POST /_teste/sql`: SQL direto no banco (usado pelos testes, por `q.mjs` e por `psql.mjs`).
- `/_teste/resend-falha?ligar=1`: a Resend falsa passa a falhar.
- `/google/_teste/estado`, `/google/_teste/falha?ligar=1` e `POST /google/_teste/externo`: o Google falso.

No Google falso, só Client ID que começa com `teste-` funciona; o seed já liga a
integração com `teste-ortus`.

## Utilitários

- `node q.mjs "SQL"`: consulta rápida.
- `node psql.mjs "SQL" [--como email]`: consulta no Postgres local, se quiser como uma das contas.
- `node depurar-migration.mjs <arquivo.sql>`: aplica uma migration por seções e mostra onde falha.

## Demonstração pública

`vps/` tem o kit da demonstração: build de produção contra estes serviços falsos,
com `ORTUS_HOMOLOGACAO=1` e `DEMO_PUBLICA=1`. Veja `vps/README.md` e
`fumaca-demo.mjs`. Com `DEMO_PUBLICA=1` o servidor não sobe sem `SEGREDO_JWT`,
`SENHA_DEMO` e as chaves do S3 no ambiente, porque a senha das contas de
exemplo e o segredo fixo do `jwt.mjs` são públicos.

Ficam fora do repositório (`.gitignore`): `env.gerado` (chaves do ambiente,
geradas ao subir), logs, `node_modules`, `edicoes/` e a senha da demonstração
(`vps/acesso-demo.txt`, `vps/senha-demo.txt`).
