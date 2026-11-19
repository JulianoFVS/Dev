'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarDataHora, mensagemDeErro } from '@/lib/saas';
import { ErroInline, SkeletonBloco } from './Feedback';

/**
 * Aba "Operação" do painel SaaS: alertas abertos pelo vigia, último sinal de
 * cada rotina agendada e falhas do servidor nas últimas 24 horas. Tudo lido
 * com o login do dono (as tabelas só abrem para is_super_admin). É para onde
 * leva o botão do e-mail de alerta.
 */

const ROTINAS: { id: string; rotulo: string; toleranciaHoras: number }[] = [
  { id: 'lembretes', rotulo: 'Lembretes de consulta', toleranciaHoras: 26 },
  { id: 'assinaturas', rotulo: 'Assinaturas e cobranças', toleranciaHoras: 26 },
  { id: 'vigia', rotulo: 'Vigia da operação', toleranciaHoras: 26 },
];

type Alerta = { chave: string; parado_desde: string; avisado_em: string | null; detalhe: string | null };
type Execucao = { rotina: string; iniciou_em: string; terminou_em: string | null; ok: boolean | null };
type Falha = { origem: string; criado_em: string; mensagem: string };

export default function PainelOperacao() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [ultimas, setUltimas] = useState<Record<string, Execucao | null>>({});
  const [falhas, setFalhas] = useState<Falha[]>([]);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const [a, f, ...execucoes] = await Promise.all([
        supabase.from('alertas_operacao').select('chave, parado_desde, avisado_em, detalhe').order('parado_desde', { ascending: false }),
        supabase.from('falhas_servidor').select('origem, criado_em, mensagem').gte('criado_em', desde).order('criado_em', { ascending: false }).limit(200),
        ...ROTINAS.map((r) =>
          supabase.from('rotinas_execucoes').select('rotina, iniciou_em, terminou_em, ok').eq('rotina', r.id).order('iniciou_em', { ascending: false }).limit(1),
        ),
      ]);
      if (a.error) throw a.error;
      if (f.error) throw f.error;
      setAlertas((a.data || []) as Alerta[]);
      setFalhas((f.data || []) as Falha[]);
      const mapa: Record<string, Execucao | null> = {};
      ROTINAS.forEach((r, i) => {
        const linha = execucoes[i]?.data?.[0];
        mapa[r.id] = linha ? (linha as Execucao) : null;
      });
      setUltimas(mapa);
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível carregar a operação.'));
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Falhas agrupadas por origem: quantas e a mais recente (a mensagem já vem limpa de dado pessoal).
  const porOrigem = falhas.reduce<Record<string, { n: number; ultima: Falha }>>((acc, f) => {
    if (!acc[f.origem]) acc[f.origem] = { n: 0, ultima: f };
    acc[f.origem].n += 1;
    return acc;
  }, {});

  const estadoRotina = (r: (typeof ROTINAS)[number]) => {
    const e = ultimas[r.id];
    if (!e) return { texto: 'Nunca rodou', tom: 'text-rose-700' };
    const horas = (Date.now() - new Date(e.iniciou_em).getTime()) / 3_600_000;
    if (e.ok === false) return { texto: `Falhou em ${formatarDataHora(e.iniciou_em)}`, tom: 'text-rose-700' };
    if (!e.terminou_em) return { texto: `Não terminou (começou ${formatarDataHora(e.iniciou_em)})`, tom: 'text-amber-700' };
    if (horas > r.toleranciaHoras) return { texto: `Sem sinal desde ${formatarDataHora(e.iniciou_em)}`, tom: 'text-rose-700' };
    return { texto: `Ok em ${formatarDataHora(e.iniciou_em)}`, tom: 'text-emerald-700' };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          O vigia confere as rotinas, as falhas do servidor, o WhatsApp em servidor e a Resend, e avisa os donos por e-mail. Detalhes em docs/OPERACAO.md.
        </p>
        <button
          type="button"
          onClick={() => {
            setCarregando(true);
            void carregar();
          }}
          aria-label="Atualizar operação"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-white"
        >
          <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />
        </button>
      </div>
      <ErroInline mensagem={erro} />

      {carregando && !Object.keys(ultimas).length ? (
        <SkeletonBloco className="h-40 w-full" />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-3">
            <section aria-labelledby="titulo-alertas" className="rounded-xl border border-neutral-200 bg-white">
              <h2 id="titulo-alertas" className="border-b border-neutral-100 px-3 py-3 text-base font-semibold text-neutral-900">
                Alertas abertos
              </h2>
              {alertas.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-emerald-700">Nenhum alerta aberto.</p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {alertas.map((a) => (
                    <li key={a.chave} className="px-3 py-2.5 text-xs">
                      <p className="font-medium text-rose-700">{a.chave.replace(/^rotina:/, 'Rotina: ').replace(/_/g, ' ')}</p>
                      <p className="mt-0.5 text-neutral-600">{a.detalhe || 'Sem detalhe.'}</p>
                      <p className="mt-0.5 text-neutral-500">
                        Desde {formatarDataHora(a.parado_desde)} · {a.avisado_em ? `aviso enviado em ${formatarDataHora(a.avisado_em)}` : 'aviso por e-mail ainda não saiu'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="titulo-rotinas" className="rounded-xl border border-neutral-200 bg-white">
              <h2 id="titulo-rotinas" className="border-b border-neutral-100 px-3 py-3 text-base font-semibold text-neutral-900">
                Rotinas agendadas
              </h2>
              <ul className="divide-y divide-neutral-100">
                {ROTINAS.map((r) => {
                  const estado = estadoRotina(r);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
                      <span className="font-medium text-neutral-900">{r.rotulo}</span>
                      <span className={estado.tom}>{estado.texto}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <section aria-labelledby="titulo-falhas" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <h2 id="titulo-falhas" className="shrink-0 border-b border-neutral-100 px-3 py-3 text-base font-semibold text-neutral-900">
              Falhas do servidor nas últimas 24 h
            </h2>
            {Object.keys(porOrigem).length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-neutral-500">Nenhuma falha registrada.</p>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto overscroll-contain">
                {Object.entries(porOrigem)
                  .sort((x, y) => y[1].n - x[1].n)
                  .map(([origem, { n, ultima }]) => (
                    <li key={origem} className="px-3 py-2.5 text-xs">
                      <p className="flex justify-between gap-2">
                        <span className="font-medium text-neutral-900">{origem}</span>
                        <span className="tabular-nums text-neutral-500">{n}×</span>
                      </p>
                      <p className="mt-0.5 break-words text-neutral-600">{ultima.mensagem}</p>
                      <p className="mt-0.5 text-neutral-500">Última em {formatarDataHora(ultima.criado_em)}</p>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
