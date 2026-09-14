'use client';

export default function RelatoriosLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>;
}
