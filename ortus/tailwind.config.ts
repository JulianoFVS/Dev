import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // O fundo das telas é #f3f4f1 (quente). O cinza 50 padrão (#fafafa) lê azulado
        // ao lado dele. Este passo é o mesmo tom do fundo, só um pouco mais escuro.
        neutral: { 50: '#e8eae3' },
        teal: { 50: '#f0fdfa', 100: '#ccfbf1', 600: '#0d9488', 700: '#0f766e' },
        slate: { 50: '#f8fafc', 100: '#f1f5f9', 800: '#1e293b' },
        // Paleta da identidade ORTUS, amostrada da arte do logotipo.
        ortus: {
          blue: '#0D4F9A',
          blueDark: '#0A3D78',
          navy: '#1A2F4A',
          sky: '#cfe2fa',
          mist: '#eaf2fd',
        },
      },
      fontFamily: {
        poppins: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;