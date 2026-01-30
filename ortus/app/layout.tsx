import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { LayoutDashboard, Users, Calendar, Settings } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });
export const metadata: Metadata = { title: "ORTUS | Gestão Odontológica" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className + " bg-slate-50 text-slate-800 flex h-screen overflow-hidden"}>
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col z-10">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-teal-600 tracking-tight">ORTUS</h1>
            <p className="text-xs text-slate-400">Clinic Management</p>
          </div>
          <nav className="flex-1 px-4 space-y-2">
            <NavItem href="/" icon={<LayoutDashboard size={20}/>} label="Dashboard" />
            <NavItem href="/pacientes" icon={<Users size={20}/>} label="Pacientes" />
          </nav>
        </aside>
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </body>
    </html>
  );
}
function NavItem({ href, icon, label }: any) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-teal-700 transition-all">
      {icon} <span className="text-sm font-medium">{label}</span>
    </Link>
  )
}