'use client';

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip overflow-y-hidden">{children}</div>;
}
