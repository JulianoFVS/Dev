import type { Metadata } from "next";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";

export const metadata: Metadata = {
  title: "Ortus | Gestão Clínica",
  description: "Sistema de gerenciamento odontológico",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br">
      <body>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}