/** Redefine senha de um usuário pelo e-mail (admin). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email) {
  console.error('Uso: node scripts/reset-user-password.mjs email@exemplo.com');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

const admin = createClient(url, key, { auth: { persistSession: false } });

function gerarSenha(t = 10) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const b = new Uint32Array(t);
  crypto.getRandomValues(b);
  for (let i = 0; i < t; i++) s += a[b[i] % a.length];
  return s;
}

const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error('Usuário não encontrado:', email);
  process.exit(1);
}

const senha = gerarSenha(10);
const { error } = await admin.auth.admin.updateUserById(user.id, { password: senha });
if (error) {
  console.error('Erro:', error.message);
  process.exit(1);
}

console.log('Senha redefinida para', email);
console.log('Nova senha:', senha);
console.log('\nEntre em http://localhost:3000/login com e-mail e senha (ignore links de e-mail).');
