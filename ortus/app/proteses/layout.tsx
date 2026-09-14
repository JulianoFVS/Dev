'use client';

export default function ProtesesLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>;
}
