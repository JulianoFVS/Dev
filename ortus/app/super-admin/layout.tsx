'use client';

import BentoRouteScroll from '@/components/bento/BentoRouteScroll';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <BentoRouteScroll>{children}</BentoRouteScroll>;
}
