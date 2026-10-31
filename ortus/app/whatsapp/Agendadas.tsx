'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CampoData from '@/components/ui/CampoData';
import CampoHora from '@/components/ui/CampoHora';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { VARIAVEIS_WHATSAPP } from '@/lib/whatsappAutomacoes';
import { formatarTelefone } from '@/lib/whatsappTelefone';
import BuscaPaciente from './BuscaPaciente';
import type { PacienteBusca } from './api';

type Props = { clinicaId: string };

type Agendada = {
  id: number;
  nome: string | null;
  telefone: string;
  texto: string;
  enviar_em: string;
  status: 'pendente' | 'enviando' | 'enviada' | 'falha' | 'cancelada';
  erro: string | null;
};

type Destino = { chave: string; paciente_id: string | null; nome: string | null; telefone: string };

const STATUS: Record<Agendada['status'], { rotulo: string; classe: string }> = {
  pendente: { rotulo: 'Agendada', classe: 'bg-amber-50 text-amber-700' },
  enviando: { rotulo: 'Enviando', classe: 'bg-amber-50 text-amber-700' },
  enviada: { rotulo: 'Enviada', classe: 'bg-emerald-50 text-emerald-700' },
  falha: { rotulo: 'Falhou', classe: 'bg-rose-50 text-rose-700' },
  cancelada: { rotulo: 'Cancelada', classe: 'bg-neutral-100 text-neutral-500' },
};

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function proximaHora() {
  const d = new Date(Date.now() + 60 * 60_000);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

export default function Agendadas({ clinicaId }: Props) {
  const { showConfirm } = useCustomAlert();
  const [lista, setLista] = useState<Agendada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState('');
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [telefone, setTelefone] = useState('');
  const [data, setData] = useState(hojeIso);
  const [hora, setHora] = useState(proximaHora);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const campo = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(async () => {
    const { data: linhas, error } = await supabase
      .from('whatsapp_agendadas')
      .select('id, nome, telefone, texto, enviar_em, status, erro')
      .eq('clinica_id', clinicaId)
      .order('enviar_em', { ascending: false })
      .limit(150);
    if (error) {
      setErroLista('Não foi possível carregar. Confira se a migration do WhatsApp foi aplicada.');
    } else {
      setErroLista('');
      setLista((linhas || []) as Agendada[]);
    }
    setCarregando(false);
  }, [clinicaId]);

  useEffect(() => {
    setCarregando(true);
    void carregar();
    const id = window.setInterval(() => { void carregar(); }, 20_000);
    return () => window.clearInterval(id);
  }, [carregar]);

  function adicionarPaciente(p: PacienteBusca) {
    if (!p.telefone) return;
    setDestinos((atual) => (atual.some((d) => d.paciente_id === p.id) ? atual : [...atual, { chave: p.id, paciente_id: p.id, nome: p.nome, telefone: p.telefone! }]));
  }

  function adicionarTelefone() {
    const digitos = telefone.replace(/\D/g, '');
    if (digitos.length < 10) {
      setErro('Digite o telefone com DDD.');
      return;
    }
    setErro('');
    setDestinos((atual) => (atual.some((d) => d.telefone.replace(/\D/g, '') === digitos) ? atual : [...atual, { chave: `tel:${digitos}`, paciente_id: null, nome: null, telefone: digitos }]));
    setTelefone('');
  }

  function inserirVariavel(chave: string) {
    const token = `{{${chave}}}`;
    const inicio = campo.current?.selectionStart ?? texto.length;
    const fim = campo.current?.selectionEnd ?? texto.length;
    setTexto(`${texto.slice(0, inicio)}${token}${texto.slice(fim)}`);
    window.setTimeout(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(inicio + token.length, inicio + token.length);
    }, 0);
  }

  async function agendar() {
    const corpo = texto.trim();
    if (!destinos.length) return setErro('Escolha pelo menos um destinatário.');
    if (!corpo) return setErro('Escreva a mensagem.');
    const quando = new Date(`${data}T${hora}:00`);
    if (Number.isNaN(quando.getTime()) || quando.getTime() < Date.now() - 60_000) return setErro('Escolha uma data e hora no futuro.');
    setSalvando(true);
    setErro('');
    const { error } = await supabase.from('whatsapp_agendadas').insert(
      destinos.map((d) => ({
        clinica_id: Number(clinicaId),
        paciente_id: d.paciente_id,
        nome: d.nome,
        telefone: d.telefone,
        texto: corpo,
        enviar_em: quando.toISOString(),
      })),
    );
    setSalvando(false);
    if (error) {
      setErro('Não foi possível agendar. Confira se a migration do WhatsApp foi aplicada.');
      return;
    }
    setDestinos([]);
    setTexto('');
    void carregar();
  }

  async function cancelar(item: Agendada) {
    if (!(await showConfirm('Cancelar esta mensagem agendada?', { title: 'Cancelar envio', type: 'warning', confirmLabel: 'Cancelar envio' }))) return;
    await supabase.from('whatsapp_agendadas').update({ status: 'cancelada' }).eq('id', item.id).eq('status', 'pendente');
    void carregar();
  }

  const pendentes = lista.filter((item) => item.status === 'pendente' || item.status === 'enviando');
  const anteriores = lista.filter((item) => item.status !== 'pendente' && item.status !== 'enviando');

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-3 pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pb-6">
      <section className="h-fit rounded-[1.25rem] border border-black/[0.06] bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Agendar mensagem</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Para um ou vários pacientes. Sai no horário escolhido pelo número conectado.</p>

        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-neutral-500">Para</p>
            <BuscaPaciente clinicaId={clinicaId} onEscolher={adicionarPaciente} ignorar={destinos.map((d) => d.paciente_id || '')} />
            <div className="flex gap-2">
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarTelefone(); } }}
                inputMode="tel"
                placeholder="Ou um número: (11) 99999-0000"
                className="h-10 min-w-0 flex-1 rounded-md border border-neutral-200 px-3 text-sm outline-none focus:border-neutral-400"
              />
              <button type="button" onClick={adicionarTelefone} className="h-10 shrink-0 rounded-md border border-neutral-200 px-3 text-sm text-neutral-700 hover:bg-neutral-50">
                Adicionar
              </button>
            </div>
            {destinos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {destinos.map((d) => (
                  <span key={d.chave} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-1 pl-2.5 pr-1 text-xs text-neutral-700">
                    {d.nome || formatarTelefone(d.telefone)}
                    <button type="button" onClick={() => setDestinos((atual) => atual.filter((x) => x.chave !== d.chave))} aria-label="Remover" className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-neutral-500">Data</p>
              <CampoData value={data} onChange={setData} />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-neutral-500">Hora</p>
              <CampoHora value={hora} onChange={setHora} passo={5} />
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium text-neutral-500">Mensagem</p>
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              placeholder="Olá {{paciente_nome}}, ..."
              className="w-full resize-y rounded-md border border-neutral-200 px-3 py-2 text-sm leading-5 outline-none focus:border-neutral-400"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {VARIAVEIS_WHATSAPP.filter((v) => !v.soConsulta).map((v) => (
                <button key={v.chave} type="button" onClick={() => inserirVariavel(v.chave)} className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50">
                  + {v.label}
                </button>
              ))}
            </div>
          </div>

          {erro && <p className="text-xs text-rose-600">{erro}</p>}
          <button
            type="button"
            onClick={agendar}
            disabled={salvando}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-medium text-white disabled:opacity-40"
          >
            {salvando && <Loader2 size={15} className="animate-spin" />}
            Agendar{destinos.length > 1 ? ` para ${destinos.length} pessoas` : ''}
          </button>
        </div>
      </section>

      <section className="min-w-0 rounded-[1.25rem] border border-black/[0.06] bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Próximos envios</h2>
        {carregando ? (
          <div className="flex justify-center py-8 text-neutral-400"><Loader2 size={18} className="animate-spin" /></div>
        ) : erroLista ? (
          <p className="mt-3 text-sm text-rose-600">{erroLista}</p>
        ) : (
          <>
            {pendentes.length === 0 && <p className="mt-3 text-sm text-neutral-400">Nada agendado.</p>}
            <ul className="mt-2 divide-y divide-black/[0.05]">
              {pendentes.map((item) => <Linha key={item.id} item={item} onCancelar={() => cancelar(item)} />)}
            </ul>
            {anteriores.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-medium text-neutral-400">Anteriores</h3>
                <ul className="mt-1 divide-y divide-black/[0.05]">
                  {anteriores.map((item) => <Linha key={item.id} item={item} />)}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Linha({ item, onCancelar }: { item: Agendada; onCancelar?: () => void }) {
  const status = STATUS[item.status];
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900">{item.nome || formatarTelefone(item.telefone)}</p>
          <p className="text-xs text-neutral-400">
            {new Date(item.enviar_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.classe}`}>{status.rotulo}</span>
          {onCancelar && item.status === 'pendente' && (
            <button type="button" onClick={onCancelar} className="text-xs text-neutral-400 hover:text-rose-600">Cancelar</button>
          )}
        </div>
      </div>
      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-neutral-600">{item.texto}</p>
      {item.erro && <p className="mt-1 text-xs text-rose-600">{item.erro}</p>}
    </li>
  );
}
