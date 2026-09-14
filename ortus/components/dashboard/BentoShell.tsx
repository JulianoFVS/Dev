'use client';

import Link from 'next/link';
import DashboardSidebar, {
  DashboardMobileNav,
  type DashboardSidebarNavOptions,
} from '@/components/dashboard/DashboardSidebar';
import BentoClinicSwitcher from '@/components/dashboard/BentoClinicSwitcher';

export default function BentoShell({
  children,
  sidebarNav,
}: {
  children: React.ReactNode;
  sidebarNav?: DashboardSidebarNavOptions;
}) {
  return (
    <div className="flex h-screen w-full gap-1.5 overflow-hidden bg-[#dfe5df] p-1.5 font-poppins sm:gap-2 sm:p-2">
      <div className="hidden shrink-0 sm:block">
        <DashboardSidebar {...sidebarNav} />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] bg-[#f3f4f1] shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:rounded-[2rem] md:rounded-[2.25rem]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/5 bg-[#f3f4f1] px-3 py-2.5 sm:hidden">
          <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-5 w-auto" />
          <div className="flex shrink-0 items-center gap-2">
            <BentoClinicSwitcher collapsed className="shrink-0" />
            <Link href="/agenda" className="rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-medium text-white">
              + Agendar
            </Link>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-black/5 bg-[#f3f4f1] px-3 py-2 sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <DashboardMobileNav {...sidebarNav} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
