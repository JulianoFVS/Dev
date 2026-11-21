// Roda `next build` (produção) com variáveis de mentira — nenhuma aponta para serviço real.
// O build do Next 16 não apaga .next/dev, então o servidor de desenvolvimento segue no ar.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORTUS = path.join(AQUI, '..', 'ortus');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_APP_URL: 'https://ortus.exemplo.com.br',
  NEXT_PUBLIC_SUPABASE_URL: 'https://exemplo.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chave-publica-de-mentira',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-de-mentira',
  CRON_SECRET: 'segredo-de-mentira',
  NEXT_PUBLIC_SUPORTE_WHATSAPP_1: '5511900000001',
  NEXT_PUBLIC_SUPORTE_WHATSAPP_2: '5511900000002',
  NEXT_PUBLIC_WHATSAPP_ATIVO: '1',
};
// Nada de endereço de teste nem .env.local: o build tem que passar sem eles.
for (const nome of Object.keys(env)) if (nome.startsWith('ORTUS_TESTE_URL_')) delete env[nome];

const filho = spawn(process.execPath, [path.join(ORTUS, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], { cwd: ORTUS, env, stdio: 'inherit' });
filho.on('exit', (codigo) => process.exit(codigo ?? 1));
