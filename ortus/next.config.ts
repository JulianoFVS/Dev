import type { NextConfig } from 'next';

/**
 * Cabeçalhos de segurança aplicados a todas as respostas.
 * CSP fica de fora de propósito: o app usa muitos data:/blob: e estilos
 * inline, e uma política mal calibrada quebraria a interface.
 */
const CABECALHOS_SEGURANCA = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  // O build do .exe precisa de um servidor autocontido para rodar dentro do
  // Electron. O site na Vercel continua com o build normal.
  ...(process.env.ORTUS_DESKTOP_BUILD === '1' ? { output: 'standalone' as const } : {}),

  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,

  // O lucide-react exporta ~1500 ícones por um único barrel: sem isso, o
  // primeiro bundle carrega bem mais do que os ícones usados.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  compiler: {
    // Fora de desenvolvimento, remove console.* — menos bytes e menos ruído.
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: CABECALHOS_SEGURANCA,
      },
      {
        // Rotas de dados nunca devem ser cacheadas por intermediários.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
