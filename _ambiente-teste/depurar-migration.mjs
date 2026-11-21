// Aplica uma migration seção por seção e mostra onde falha: node depurar-migration.mjs <arquivo.sql>
import fs from 'node:fs';
import path from 'node:path';
import { abrirBanco, RAIZ_ORTUS } from './banco.mjs';
const alvo = process.argv[2];
const anterior = fs.readdirSync(path.join(RAIZ_ORTUS, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql') && f < alvo).sort().pop();
const { db } = await abrirBanco({ silencioso: true, ate: anterior });
const sql = fs.readFileSync(path.join(RAIZ_ORTUS, 'supabase', 'migrations', alvo), 'utf8').replace(/\r\n/g, '\n');
const partes = sql.split(/\n(?=-- -{20,}\n-- \d+\.)/);
for (const [i, parte] of partes.entries()) {
  const titulo = (parte.match(/-- (\d+\. [^\n]*)/) || [])[1] || '(cabeçalho)';
  try { await db.exec(parte.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')); console.log('ok   ', titulo); }
  catch (e) { console.log('FALHA', titulo, '→', e.message, '| pos', e.position, '|', (e.where || '').slice(0, 300)); if (e.position) console.log('   perto de:', JSON.stringify(parte.slice(Math.max(0, e.position - 160), +e.position + 60))); break; }
}
await db.close();
