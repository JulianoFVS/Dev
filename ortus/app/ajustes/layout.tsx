'use client';

import { usePathname } from 'next/navigation';
import BentoRouteScroll from '@/components/bento/BentoRouteScroll';

export default function AjustesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith('/ajustes/equipe')) {
    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>;
  }
  return <BentoRouteScroll>{children}</BentoRouteScroll>;
}
