const fs = require('fs');

const files = {
  // 1. Configuração do Tailwind (Define onde estão os arquivos para estilizar)
  'tailwind.config.ts': `
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: { 50: '#f0fdfa', 100: '#ccfbf1', 600: '#0d9488', 700: '#0f766e' },
        slate: { 50: '#f8fafc', 100: '#f1f5f9', 800: '#1e293b' }
      }
    },
  },
  plugins: [],
};
export default config;
`,

  // 2. Configuração do PostCSS (O motor que processa o CSS)
  'postcss.config.mjs': `
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
export default config;
`,

  // 3. Garante o CSS Global correto
  'app/globals.css': `
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #f8fafc; /* Slate-50 */
  color: #1e293b; /* Slate-800 */
}
`
};

// Escreve os arquivos
Object.keys(files).forEach(path => {
  fs.writeFileSync(path, files[path].trim());
  console.log('✅ Arquivo restaurado: ' + path);
});
console.log("\\n🎨 Visual restaurado! Agora reinicie o servidor.");