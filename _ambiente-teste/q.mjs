// Consulta rápida pelo endpoint de teste: node q.mjs "SQL"
const r = await fetch('http://127.0.0.1:54321/_teste/sql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: process.argv[2], params: [] }) });
const d = await r.json();
if (!r.ok) { console.log('ERRO:', d.erro); process.exit(1); }
for (const l of d.linhas) console.log(Object.values(l).map((v) => (v === null ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' | '));
console.log(`(${d.linhas.length} linhas)`);
