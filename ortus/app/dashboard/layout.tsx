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
    <div className="h-screen w-full overflow-hidden bg-[#d8e0d4] p-3 font-poppins sm:p-4">
      <div className="mx-auto flex h-full w-full max-w-[1440px] overflow-hidden rounded-[2rem] border border-zinc-200 bg-white sm:rounded-[2.5rem] md:rounded-[3rem]">
        <div className="hidden h-full shrink-0 p-2 pl-3 sm:flex sm:pl-4 sm:pt-4 sm:pb-4">
          <DashboardSidebar />
        </div>

        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 md:p-5 md:pl-2">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2 sm:hidden">
            <img src="/landing/ortus-wordmark.svg" alt="ortus" className="h-5 w-auto" />
            <Link href="/agenda" className="rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white">
              + Agendar
            </Link>
          </div>
          <div className="mb-3 flex shrink-0 gap-1.5 overflow-x-auto sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <DashboardMobileNav />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}
