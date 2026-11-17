import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';
import { ClinicaProvider } from '@/app/context/ClinicaContext';
import CookieBanner from '@/components/CookieBanner';
import { CustomAlertProvider } from '@/components/ui/CustomAlert';
import ThemeProvider from '@/components/ThemeProvider';
import BentoHoverTooltip from '@/components/bento/BentoHoverTooltip';
import { SCRIPT_SESSAO_DESKTOP } from '@/lib/local/scriptSessaoDesktop';

const inter = Inter({ subsets: ['latin'] });

// Geométrica arredondada da identidade, usada na landing page.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'ORTUS - Sistema de Gestão Odontológica',
  description: 'Gestão completa para clínicas odontológicas. Agenda, prontuário e financeiro.',
  icons: {
    icon: [
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-icon.png',
    shortcut: '/favicon-32.png',
  },
};

export const viewport: Viewport = {
  colorScheme: 'only light',
  themeColor: '#f3f4f1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      {process.env.ORTUS_DESKTOP === '1' ? (
        <head>
          <Script id="ortus-sessao-desktop" strategy="beforeInteractive">
            {SCRIPT_SESSAO_DESKTOP}
          </Script>
        </head>
      ) : null}
      <body className={`${inter.className} ${poppins.variable} h-full min-h-0`}>
        <CustomAlertProvider>
          <ClinicaProvider>
            <ThemeProvider>
              <AuthGuard>{children}</AuthGuard>
            </ThemeProvider>
          </ClinicaProvider>
          <CookieBanner />
          <BentoHoverTooltip />
        </CustomAlertProvider>
      </body>
    </html>
  );
}