const fs = require('fs');
const path = require('path');

// --- 👇 COLOQUE SUAS CHAVES DO SUPABASE AQUI 👇 ---
const SUPABASE_URL = "https://vjqeekvoxddxwvbazwlt.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcWVla3ZveGRkeHd2YmF6d2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MzE3MjUsImV4cCI6MjA4NTMwNzcyNX0.bpqlERIRoeMs4m1_oe_wfpvAaTgNsaLY2YpNosvqBDA"; 
// ---------------------------------------------------

const files = {
  // Cria o arquivo de variáveis de ambiente
  '.env.local': `NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_KEY}`,

  // Cria a conexão com o banco
  'lib/supabase.ts': `
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseKey);
`,

  // Cria o layout (Barra lateral)
  'app/layout.tsx': `
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
`,

  // Cria a Página Inicial (Dashboard)
  'app/page.tsx': `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, CalendarCheck } from 'lucide-react';

export default function Dashboard() {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function load() {
      // Conta quantos pacientes existem no banco
      const { count } = await supabase.from('pacientes').select('*', { count: 'exact', head: true });
      setTotal(count || 0);
    }
    load();
  }, []);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-slate-800">Visão Geral</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">Total de Pacientes</p>
            <h3 className="text-3xl font-bold text-slate-800">{total}</h3>
            <div className="mt-2 text-teal-600"><Users size={20}/></div>
        </div>
      </div>
    </div>
  );
}
`,

  // Cria a Página de Pacientes
  'app/pacientes/page.tsx': `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Plus } from 'lucide-react';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchPacientes() {
    setLoading(true);
    const { data } = await supabase.from('pacientes').select('*').order('created_at', { ascending: false });
    if (data) setPacientes(data);
    setLoading(false);
  }

  async function criarTeste() {
    const nome = prompt("Nome do Paciente:");
    if (!nome) return;
    
    await supabase.from('pacientes').insert([{ nome, telefone: '79 9999-0000' }]);
    fetchPacientes();
  }

  useEffect(() => { fetchPacientes(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Pacientes</h2>
        <button onClick={criarTeste} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 flex items-center gap-2">
            <Plus size={18}/> Novo Paciente
        </button>
      </div>

      {loading ? <p>Carregando...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pacientes.map((p: any) => (
            <div key={p.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600">
                    <User size={24} />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800">{p.nome}</h3>
                    <p className="text-sm text-slate-500">{p.telefone}</p>
                </div>
            </div>
            ))}
        </div>
      )}
    </div>
  )
}
`
};

// Código que escreve os arquivos no disco
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) return true;
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}
Object.keys(files).forEach(filePath => {
  ensureDirectoryExistence(filePath);
  fs.writeFileSync(filePath, files[filePath].trim());
  console.log('✅ Arquivo criado: ' + filePath);
});
console.log("\\n🚀 TUDO PRONTO! Agora rode: npm run dev");