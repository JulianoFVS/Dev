/**
 * Recria Juliano com juliano.ancs@gmail.com espelhando o perfil Ortus existente.
 * Uso: node scripts/replicate-juliano.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

if (!url || !key) {
  console.error('Variáveis Supabase ausentes em .env.local');
  process.exit(1);
}

const EMAIL = 'juliano.ancs@gmail.com';
const CLINICA_ORTUS = 17;

function gerarSenha(tamanho = 10) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const buf = new Uint32Array(tamanho);
  crypto.getRandomValues(buf);
  for (let i = 0; i < tamanho; i++) out += alfabeto[buf[i] % alfabeto.length];
  return out;
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Verifica se já existe
const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const jaExiste = existingUsers?.users?.find((u) => u.email?.toLowerCase() === EMAIL);
if (jaExiste) {
  console.error('Usuário já existe:', EMAIL, '| id:', jaExiste.id);
  process.exit(1);
}

// Modelo: Juliano @ortus.com (profissional mantido)
const { data: profs } = await admin.from('profissionais').select('*').ilike('nome', 'Juliano%');
const ref = profs?.find((p) => p.email === 'juliano.ancs@ortus.com') || profs?.find((p) => String(p.id) === '15') || profs?.[0];

if (!ref) {
  console.error('Profissional modelo (Juliano C&O) não encontrado.');
  process.exit(1);
}

console.log('Modelo:', ref.nome, '| id', ref.id, '| super_admin', ref.is_super_admin);

const senha = gerarSenha(10);

const { data: authData, error: authErr } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: senha,
  email_confirm: true,
  user_metadata: { nome: ref.nome || 'Juliano' },
});

if (authErr || !authData.user) {
  console.error('Erro auth:', authErr?.message);
  process.exit(1);
}

const userId = authData.user.id;

const { data: prof, error: profErr } = await admin
  .from('profissionais')
  .insert({
    user_id: userId,
    nome: ref.nome || 'Juliano',
    email: EMAIL,
    cargo: ref.cargo || null,
    nivel_acesso: ref.nivel_acesso || 'admin',
    is_super_admin: true,
    precisa_trocar_senha: false,
    cpf: ref.cpf || null,
    cro: ref.cro || null,
    telefone: ref.telefone || null,
    conselho: ref.conselho || null,
    uf: ref.uf || null,
    sexo: ref.sexo || null,
    endereco: ref.endereco || null,
    foto_url: ref.foto_url || null,
  })
  .select('id')
  .single();

if (profErr || !prof) {
  await admin.auth.admin.deleteUser(userId);
  console.error('Erro profissional:', profErr?.message);
  process.exit(1);
}

await admin.from('profissionais_clinicas').insert({
  profissional_id: prof.id,
  clinica_id: CLINICA_ORTUS,
});

// Copiar permissões do modelo se existirem
const { data: perms } = await admin
  .from('permissoes_modulos')
  .select('*')
  .eq('profissional_id', ref.id);

if (perms?.length) {
  const copia = perms.map((p) => ({
    profissional_id: prof.id,
    clinica_id: p.clinica_id,
    modulo: p.modulo,
    pode_acessar: p.pode_acessar,
  }));
  await admin.from('permissoes_modulos').upsert(copia, { onConflict: 'profissional_id,clinica_id,modulo' });
}

console.log('\n✅ Usuário criado com sucesso\n');
console.log('E-mail:  ', EMAIL);
console.log('Senha:   ', senha);
console.log('Prof ID: ', prof.id);
console.log('User ID: ', userId);
console.log('Clínica: Ortus (', CLINICA_ORTUS, ')');
console.log('Super admin: sim');
console.log('\nGuarde a senha — ela não fica salva em lugar nenhum.');
