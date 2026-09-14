'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import DashboardSidebar, { DashboardMobileNav } from '@/components/dashboard/DashboardSidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('ortus-dashboard-fixed');
    body.classList.add('ortus-dashboard-fixed', 'ortus-dashboard-canvas');
    return () => {
      html.classList.remove('ortus-dashboard-fixed');
      body.classList.remove('ortus-dashboard-fixed', 'ortus-dashboard-canvas');
    };
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center overflow-hidden bg-[#e2e8e4] font-poppins">
      <div className="flex h-[96vh] w-[98vw] max-w-[1600px] overflow-hidden rounded-[2rem] bg-white shadow-2xl sm:rounded-[2.5rem]">
        <div className="hidden shrink-0 p-2 pl-2.5 sm:flex sm:py-2.5">
          <DashboardSidebar />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-r-[2rem] bg-slate-50 sm:rounded-r-[2.5rem]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2.5 sm:hidden">
            <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-5 w-auto" />
            <Link
              href="/agenda"
              className="rounded-full bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-700"
            >
              + Agendar
            </Link>
          </div>
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-100 bg-white px-3 py-2 sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <DashboardMobileNav />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5 md:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
