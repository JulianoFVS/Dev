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
        slate: { 50: '#f8fafc', 100: '#f1f5f9', 800: '#1e293b' },
        // Paleta da identidade ORTUS, amostrada da arte do logotipo.
        ortus: {
          blue: '#1689fe',
          blueDark: '#0b74e2',
          navy: '#1c3559',
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