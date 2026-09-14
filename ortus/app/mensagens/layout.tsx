'use client';

import BentoRouteScroll from '@/components/bento/BentoRouteScroll';

export default function MensagensLayout({ children }: { children: React.ReactNode }) {
  return <BentoRouteScroll>{children}</BentoRouteScroll>;
}
