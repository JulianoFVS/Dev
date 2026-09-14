'use client';

import { useEffect } from 'react';

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

  return <>{children}</>;
}
