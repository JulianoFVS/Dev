import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();
const supabase = createClient(url, key);

for (const table of ['lembretes_agenda', 'profissionais_horarios']) {
  const { data, error } = await supabase.from(table).select('*').limit(1);
  if (error) {
    console.log(table, 'ERR', error.message);
  } else if (data?.[0]) {
    console.log(table, 'cols', Object.keys(data[0]).join(', '));
  } else {
    console.log(table, 'empty — trying insert probe skipped');
    // infer from PostgREST error on bad column later
  }
}

// probe agendamentos recebimento cols
for (const col of ['valor_bruto', 'valor_liquido', 'taxa_id', 'taxa_nome', 'taxa_percentual']) {
  const { error } = await supabase.from('agendamentos').select(col).limit(1);
  console.log('agendamentos.' + col + ':', error ? 'MISSING' : 'OK');
}
