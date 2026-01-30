const fs = require('fs');

const files = {
  // 1. Configura o Tailwind para olhar a pasta 'app'
  'tailwind.config.ts': `
import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
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

  // 2. Garante que o PostCSS está ativo
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

  // 3. Conecta o CSS Global
  'app/globals.css': `
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-slate-50 text-slate-800;
}
`
};

Object.keys(files).forEach(path => {
  fs.writeFileSync(path, files[path].trim());
  console.log('✅ Cores configuradas: ' + path);
});