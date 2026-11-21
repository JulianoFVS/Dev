// Sobe o Next do Ortus em modo de desenvolvimento apontando para o ambiente
// local de teste. As variáveis vão pelo ambiente do processo, que vence
// qualquer .env.local: mesmo que o arquivo real apareça na pasta do projeto,
// esta execução nunca fala com produção.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORTUS = path.join(AQUI, '..', 'ortus');
const gerado = Object.fromEntries(
  fs.readFileSync(path.join(AQUI, 'env.gerado'), 'utf8').split('\n').filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const BASE = gerado.NEXT_PUBLIC_SUPABASE_URL;
const PORTA = process.env.PORT || '3000';

const env = {
  ...process.env,
  ...gerado,
  NODE_ENV: 'development',
  NEXT_PUBLIC_APP_URL: `http://localhost:${PORTA}`,
  CRON_SECRET: 'segredo-do-agendador-local',
  RESEND_API_KEY: 're_teste_local_0001',
  RESEND_FROM_EMAIL: 'Ortus <nao-responda@ortus.test>',
  ORTUS_TESTE_URL_RESEND: `${BASE}/resend`,
  R2_ACCOUNT_ID: 'local',
  R2_ACCESS_KEY_ID: 'local',
  R2_SECRET_ACCESS_KEY: 'local',
  R2_BUCKET_PUBLICO: 'ortus-publico',
  R2_BUCKET_PRIVADO: 'ortus-privado',
  ORTUS_TESTE_URL_R2: `${BASE}/s3`,
  PAGAMENTO_PROVEDOR: 'mercadopago',
  MERCADOPAGO_ACCESS_TOKEN: 'TEST-token-local-0001',
  MERCADOPAGO_WEBHOOK_SECRET: 'segredo-do-webhook-local',
  ORTUS_TESTE_URL_PAGAMENTO: `${BASE}/provedor`,
  // Google falso (google.mjs): o servidor e o navegador chegam no mesmo endereço aqui.
  ORTUS_TESTE_URL_GOOGLE: `${BASE}/google`,
  ORTUS_TESTE_URL_GOOGLE_PUBLICA: `${BASE}/google`,
  // Chave das credenciais cifradas (Integrações). Só deste ambiente local.
  ORTUS_CHAVE_CIFRA: 'chave-local-de-teste-das-integracoes-0001',
  NEXT_PUBLIC_SUPORTE_WHATSAPP_1: '5511900000001',
  NEXT_PUBLIC_SUPORTE_WHATSAPP_2: '5511900000002',
  NEXT_PUBLIC_WHATSAPP_ATIVO: process.env.NEXT_PUBLIC_WHATSAPP_ATIVO || '1',
  NEXT_TELEMETRY_DISABLED: '1',
};

const filho = spawn(process.execPath, [path.join(ORTUS, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', PORTA], {
  cwd: ORTUS,
  env,
  stdio: 'inherit',
});
filho.on('exit', (codigo) => process.exit(codigo ?? 0));
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => filho.kill());
