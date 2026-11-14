'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarTelefone } from '@/lib/whatsappTelefone';
import type { PacienteBusca } from './api';

type Props = {
  clinicaId: string;
  onEscolher: (paciente: PacienteBusca) => void;
  ignorar?: string[];
  autoFocus?: boolean;
};

export default function BuscaPaciente({ clinicaId, onEscolher, ignorar = [], autoFocus }: Props) {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<PacienteBusca[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const busca = termo.trim();
    if (busca.length < 2) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from('pacientes')
        .select('id, nome, telefone')
        .eq('clinica_id', clinicaId)
        .not('telefone', 'is', null)
        .ilike('nome', `%${busca.replace(/[%_]/g, '')}%`)
        .order('nome')
        .limit(12);
      if (cancelado) return;
      setResultados((data || []) as PacienteBusca[]);
      setBuscando(false);
    }, 250);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [termo, clinicaId]);

  const visiveis = resultados.filter((p) => !ignorar.includes(p.id));

  return (
    <div className="relative">
      <div className="flex h-10 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3">
        <Search size={15} className="shrink-0 text-neutral-400" />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          autoFocus={autoFocus}
          placeholder="Buscar paciente pelo nome"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
        />
        {buscando && <Loader2 size={14} className="shrink-0 animate-spin text-neutral-400" />}
      </div>
      {termo.trim().length >= 2 && !buscando && (
        <div className="mt-1 max-h-60 overflow-y-auto rounded-md border border-neutral-200 bg-white">
          {visiveis.length === 0 && <p className="px-3 py-2.5 text-sm text-neutral-400">Nenhum paciente com telefone encontrado.</p>}
          {visiveis.map((paciente) => (
            <button
              key={paciente.id}
              type="button"
              onClick={() => {
                onEscolher(paciente);
                setTermo('');
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-neutral-50"
            >
              <span className="truncate text-sm text-neutral-900">{paciente.nome}</span>
              <span className="shrink-0 text-xs text-neutral-400">{formatarTelefone(paciente.telefone)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
