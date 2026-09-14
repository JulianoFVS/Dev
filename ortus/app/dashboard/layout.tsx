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
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-poppins">
      <div className="hidden shrink-0 py-2 pl-2 sm:block md:py-2.5 md:pl-2.5">
        <DashboardSidebar />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:hidden">
          <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-5 w-auto" />
          <Link
            href="/agenda"
            className="rounded-full bg-ortus-blue px-3 py-1.5 text-[11px] font-medium text-white hover:bg-ortus-blueDark"
          >
            + Agendar
          </Link>
        </div>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <DashboardMobileNav />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
