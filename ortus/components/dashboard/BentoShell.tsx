'use client';

import { useEffect, useState } from 'react';
import DashboardSidebar, { type DashboardSidebarNavOptions } from '@/components/dashboard/DashboardSidebar';
import MobileAppChrome from '@/components/dashboard/MobileAppChrome';

/**
 * Altura em que o layout do computador cabe inteiro.
 * Só vale para monitor e notebook. Celular não reduz essa tela: ele tem o próprio app.
 */
const ALTURA_DESENHO = 800;
const LARGURA_COMPUTADOR = 1024;

function useEscalaTela() {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const aplicar = () => {
      if (window.innerWidth < LARGURA_COMPUTADOR) {
        setZoom(1);
        return;
      }
      const proximo = Math.min(1, window.innerHeight / ALTURA_DESENHO);
      setZoom(Number(proximo.toFixed(3)));
    };
    aplicar();
    window.addEventListener('resize', aplicar);
    return () => window.removeEventListener('resize', aplicar);
  }, []);

  return zoom;
}

export default function BentoShell({
  children,
  sidebarNav,
}: {
  children: React.ReactNode;
  sidebarNav?: DashboardSidebarNavOptions;
}) {
  const zoom = useEscalaTela();
  const reduzir = zoom < 0.999;

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#f3f4f1] lg:bg-[#dfe5df]">
      <div
        className="flex h-full w-full flex-col bg-[#f3f4f1] lg:flex-row lg:gap-2 lg:bg-[#dfe5df] lg:p-2"
        style={
          reduzir
            ? {
                zoom,
                width: `calc(100vw / ${zoom})`,
                height: `calc(100vh / ${zoom})`,
              }
            : undefined
        }
      >
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
