'use client';

import DashboardSidebar, { type DashboardSidebarNavOptions } from '@/components/dashboard/DashboardSidebar';
import MobileAppChrome from '@/components/dashboard/MobileAppChrome';

/**
 * Casca do app.
 *
 * Antes existia um `zoom` calculado pela altura da janela para "espremer"
 * o desenho de 800px em qualquer monitor. Isso é exatamente o que o
 * cliente não quer: em telas baixas tudo ficava menor (fonte ilegível,
 * alvos de toque minúsculos). Agora o layout é fluido de verdade:
 *
 *  - o menu lateral ocupa a altura real da janela;
 *  - cada página rola dentro do próprio painel;
 *  - em telas estreitas o app usa a navegação mobile (barra inferior).
 */
export default function BentoShell({
  children,
  sidebarNav,
}: {
  children: React.ReactNode;
  sidebarNav?: DashboardSidebarNavOptions;
}) {
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#f3f4f1] lg:bg-neutral-950">
      <div className="flex h-full w-full flex-col bg-[#f3f4f1] lg:flex-row lg:gap-2 lg:bg-neutral-950 lg:p-2">
        <div className="hidden h-full shrink-0 overflow-visible lg:block">
          <DashboardSidebar {...sidebarNav} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f3f4f1] lg:rounded-[2.25rem] lg:shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          <MobileAppChrome {...sidebarNav}>{children}</MobileAppChrome>
        </div>
      </div>
    </div>
  );
}
