'use client';

/**
 * O painel tem dois modos de altura:
 * - até `lg`: o conteúdo flui e o layout é a área rolável (celular e tablet);
 * - `lg+`: a tela fica presa à altura disponível e lista/detalhe rolam por dentro.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:overflow-hidden">
      {children}
    </div>
  );
}
