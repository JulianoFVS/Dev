'use client';

export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>;
}
