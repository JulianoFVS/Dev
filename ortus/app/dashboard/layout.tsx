'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import DashboardSidebar, { DashboardMobileNav } from '@/components/dashboard/DashboardSidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('ortus-dashboard-fixed');
    body.classList.add('ortus-dashboard-fixed');
    return () => {
      html.classList.remove('ortus-dashboard-fixed');
      body.classList.remove('ortus-dashboard-fixed');
    };
  }, []);

  return (
    <div className="flex h-screen w-full gap-1.5 overflow-hidden bg-[#dfe5df] p-1.5 font-poppins sm:gap-2 sm:p-2">
      <div className="hidden shrink-0 sm:block">
        <DashboardSidebar />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] bg-[#f3f4f1] shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:rounded-[2rem] md:rounded-[2.25rem]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/5 bg-[#f3f4f1] px-3 py-2.5 sm:hidden">
          <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-5 w-auto" />
          <Link
            href="/agenda"
            className="rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-medium text-white"
          >
            + Agendar
          </Link>
        </div>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-black/5 bg-[#f3f4f1] px-3 py-2 sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <DashboardMobileNav />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
