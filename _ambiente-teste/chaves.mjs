// Escreve na saída as duas chaves do Supabase falso, assinadas com o
// SEGREDO_JWT do ambiente. Uso no servidor de demonstração, direto para o
// arquivo de ambiente do app (nunca para a tela):
//   SEGREDO_JWT=... node chaves.mjs >> /etc/ortus-demo/web.env
import { CHAVE_ANON, CHAVE_SERVICO } from './jwt.mjs';

process.stdout.write(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${CHAVE_ANON}\nSUPABASE_SERVICE_ROLE_KEY=${CHAVE_SERVICO}\n`);
