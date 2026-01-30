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