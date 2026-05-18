import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';
import { ClinicaProvider } from '@/app/context/ClinicaContext';
import CookieBanner from '@/components/CookieBanner';
import { CustomAlertProvider } from '@/components/ui/CustomAlert';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ORTUS - Sistema de Gestão Odontológica',
  description: 'Gestão completa para clínicas odontológicas. Agenda, prontuário e financeiro.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <CustomAlertProvider>
          <ClinicaProvider>
            <AuthGuard>{children}</AuthGuard>
          </ClinicaProvider>
          <CookieBanner />
        </CustomAlertProvider>
      </body>
    </html>
  );
}