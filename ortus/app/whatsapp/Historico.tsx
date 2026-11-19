'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dados as tabelas } from '@/lib/local/consulta';
import { modoDados, listar } from '@/lib/local/cliente';
import { formatarTelefone } from '@/lib/whatsappTelefone';
import { erroDeEnvio, mensagemDeErro } from './api';

type Props = { clinicaId: string };

type Envio = {
  id: number;
  tipo: string;
  nome: string | null;
  telefone: string | null;
  texto: string | null;
  status: 'enviando' | 'enviada' | 'falha';
  erro: string | null;
  created_at: string;
};

const TIPOS: Record<string, string> = {
  confirmacao: 'Confirmação',
  lembrete: 'Lembrete',
  pos_consulta: 'Pós-consulta',
  aniversario: 'Aniversário',
  retorno: 'Retorno',
};

const STATUS: Record<Envio['status'], { rotulo: string; classe: string }> = {
  enviando: { rotulo: 'Enviando', classe: 'bg-amber-50 text-amber-700' },
  enviada: { rotulo: 'Enviada', classe: 'bg-emerald-50 text-emerald-700' },
  falha: { rotulo: 'Falhou', classe: 'bg-rose-50 text-rose-700' },
};

export default function Historico({ clinicaId }: Props) {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [aberto, setAberto] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (await modoDados() === 'local') {
      try {
        const linhas = await listar<Envio>('whatsapp_envios', {
          filtros: [{ col: 'clinica_id', op: 'eq', valor: Number(clinicaId) }],
          ordem: [{ col: 'created_at', asc: false }],
          limite: 300,
        });
        setErro('');
        setEnvios(linhas);
      } catch (err) {
        setErro(mensagemDeErro(err, 'Não foi possível carregar o histórico.'));
      }
      setCarregando(false);
      return;
    }

    const { data, error } = await tabelas.from('whatsapp_envios')
      .select('id, tipo, nome, telefone, texto, status, erro, created_at')
      .eq('clinica_id', clinicaId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) setErro('Não foi possível carregar o histórico. Tente de novo em instantes.');
    else {
      setErro('');
      setEnvios((data || []) as Envio[]);
    }
    setCarregando(false);
  }, [clinicaId]);

  useEffect(() => {
    setCarregando(true);
    void carregar();
    const id = window.setInterval(() => { void carregar(); }, 30_000);
    return () => window.clearInterval(id);
  }, [carregar]);

  const visiveis = useMemo(() => (tipo === 'todos' ? envios : envios.filter((e) => e.tipo === tipo)), [envios, tipo]);
  const hoje = new Date().toDateString();
  const enviadasHoje = envios.filter((e) => e.status === 'enviada' && new Date(e.created_at).toDateString() === hoje).length;
  const falhas = envios.filter((e) => e.status === 'falha').length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 pb-4 lg:pb-6">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[1.25rem] border border-black/[0.06] bg-white p-4">
          <p className="text-xs text-neutral-500">Enviadas hoje</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{enviadasHoje}</p>
        </div>
        <div className="rounded-[1.25rem] border border-black/[0.06] bg-white p-4">
          <p className="text-xs text-neutral-500">Falhas recentes</p>
          <p className={`mt-1 text-2xl font-semibold ${falhas ? 'text-rose-600' : 'text-neutral-900'}`}>{falhas}</p>
        </div>
      </div>

      <section className="rounded-[1.25rem] border border-black/[0.06] bg-white p-4">
        <div className="flex flex-wrap gap-1.5 text-[13px] sm:text-xs">
          {['todos', ...Object.keys(TIPOS)].map((chave) => (
            <button
              key={chave}
              type="button"
              onClick={() => setTipo(chave)}
              aria-pressed={tipo === chave}
              className={`inline-flex h-10 items-center rounded-full px-3.5 sm:h-auto sm:px-2.5 sm:py-1 ${tipo === chave ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
            >
              {chave === 'todos' ? 'Todas' : TIPOS[chave]}
            </button>
          ))}
        </div>

        {carregando ? (
          <div aria-busy="true" aria-label="Carregando o histórico" className="mt-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-neutral-50" />)}
          </div>
        ) : erro ? (
          <p className="mt-4 text-sm text-rose-600">{erro}</p>
        ) : visiveis.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">Nenhuma mensagem automática enviada ainda.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/[0.05]">
            {visiveis.map((envio) => {
              const status = STATUS[envio.status];
              const motivo = erroDeEnvio(envio.erro);
              return (
                <li key={envio.id}>
                  <button type="button" onClick={() => setAberto(aberto === envio.id ? null : envio.id)} aria-expanded={aberto === envio.id} className="w-full py-3 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* No celular o nome quebra em vez de cortar. */}
                        <p className="break-words text-sm font-medium text-neutral-900 sm:truncate">{envio.nome || formatarTelefone(envio.telefone)}</p>
                        <p className="text-xs text-neutral-400">
                          {TIPOS[envio.tipo] || envio.tipo} · {new Date(envio.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.classe}`}>{status.rotulo}</span>
                    </div>
                    {aberto === envio.id && (
                      <>
                        {envio.texto && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-700">{envio.texto}</p>}
                        {motivo && <p className="mt-1.5 text-xs text-rose-600">{motivo}</p>}
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
