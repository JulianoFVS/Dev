import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();
const supabase = createClient(url, key);

const TABLES = [
  'clinicas', 'pacientes', 'agendamentos', 'profissionais', 'configuracoes_clinica',
  'comissoes_regras', 'comissoes_lancamentos', 'tarefas', 'tratamentos_base', 'planos',
  'permissoes_modulos', 'especialidades', 'planos_tratamentos', 'audit_log', 'servicos',
  'lembretes_agenda', 'profissionais_horarios',
];

console.log('=== REST API audit (service role) ===\n');
for (const table of TABLES) {
  const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`${table}: ${error.code || 'ERR'} — ${error.message.slice(0, 80)}`);
  } else {
    console.log(`${table}: OK`);
  }
}

const { data: keys } = await supabase.from('configuracoes_clinica').select('chave').limit(100);
console.log('\nconfig keys:', [...new Set((keys || []).map((k) => k.chave))].join(', ') || '(none)');

const { data: agSample } = await supabase.from('agendamentos').select('*').limit(1);
if (agSample?.[0]) {
  console.log('\nagendamentos sample columns:', Object.keys(agSample[0]).join(', '));
}
