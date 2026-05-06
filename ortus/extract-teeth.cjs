const fs = require('fs');
const c = fs.readFileSync('node_modules/react-odontogram/dist/index.mjs', 'utf8');

const re = /name:"([^"]+)",type:"([^"]+)",outlinePath:"([^"]+)",shadowPath:"([^"]+)",lineHighlightPath:(\[[^\]]*\]|"[^"]*")/g;
const teeth = [];
let m;
while ((m = re.exec(c)) !== null) {
  let lhp;
  try { lhp = JSON.parse(m[5]); } catch { lhp = m[5]; }
  teeth.push({ name: m[1], type: m[2], outlinePath: m[3], shadowPath: m[4], lineHighlightPath: lhp });
}

// Use proper SVG path bbox computation (handles all SVG path commands correctly)
const { svgPathBbox } = require('svg-path-bbox');
function bbox(path) {
  try {
    const [x1, y1, x2, y2] = svgPathBbox(path);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  } catch (e) {
    return { x: 0, y: 0, w: 0, h: 0, err: e.message };
  }
}

teeth.forEach(t => {
  t.bbox = bbox(t.outlinePath);
});

// First 8 = upper, next 8 = lower (lib data structure)
const upper = teeth.slice(0, 8);
const lower = teeth.slice(8, 16);

console.log('Upper teeth:');
upper.forEach((t, i) => console.log(`  pos${i + 1} (${t.type}): bbox=`, t.bbox));
console.log('Lower teeth:');
lower.forEach((t, i) => console.log(`  pos${i + 1} (${t.type}): bbox=`, t.bbox));

// Generate TS module for importing in app
const tsContent = `// Auto-gerado pelo extract-teeth.cjs - paths SVG extraídos do react-odontogram (MIT)
// Não editar manualmente. Rode \`node extract-teeth.cjs\` para regenerar.

export interface ToothLibData {
  name: string;
  type: string;
  outlinePath: string;
  shadowPath: string;
  lineHighlightPath: string | string[];
  bbox: { x: number; y: number; w: number; h: number };
}

export const TEETH_UPPER: ToothLibData[] = ${JSON.stringify(upper, null, 2)};

export const TEETH_LOWER: ToothLibData[] = ${JSON.stringify(lower, null, 2)};
`;
fs.writeFileSync('lib/teeth-data.ts', tsContent);
console.log('Written lib/teeth-data.ts (', tsContent.length, 'chars)');

// Remove tmp JSON
try { fs.unlinkSync('lib-teeth.json'); } catch {}
