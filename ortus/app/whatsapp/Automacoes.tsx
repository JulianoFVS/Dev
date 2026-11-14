'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, Cake, Clock, HeartHandshake, Loader2, RotateCcw } from 'lucide-react';
import Switch from '@/components/ui/Switch';
import CampoHora from '@/components/ui/CampoHora';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import {
  AUTOMACOES_PADRAO,
  CHAVE_AUTOMACOES_WHATSAPP,
  VARIAVEIS_WHATSAPP,
  aplicarVariaveisWhatsapp,
  normalizarAutomacoes,
  type AutomacoesWhatsapp,
  type TipoAutomacao,
} from '@/lib/whatsappAutomacoes';

type Props = { clinicaId: string; clinicaNome: string };

const EXEMPLO = {
  paciente_nome: 'Maria',
  clinica_telefone: '(11) 3333-0000',
  data_consulta: '05/11',
  hora_consulta: '14:30',
  procedimento: 'Limpeza',
};

const CARTOES: { tipo: TipoAutomacao; titulo: string; descricao: string; icone: typeof Clock; consulta: boolean }[] = [
  { tipo: 'confirmacao', titulo: 'Confirmação de agendamento', descricao: 'Sai logo depois que a consulta é marcada na agenda.', icone: CalendarCheck, consulta: true },
  { tipo: 'lembrete', titulo: 'Lembrete da consulta', descricao: 'Lembra o paciente antes do horário marcado.', icone: Clock, consulta: true },
  { tipo: 'pos_consulta', titulo: 'Pós-consulta', descricao: 'Agradece depois que a consulta é concluída na agenda.', icone: HeartHandshake, consulta: true },
  { tipo: 'aniversario', titulo: 'Aniversário', descricao: 'Parabeniza pacientes no dia do aniversário.', icone: Cake, consulta: false },
  { tipo: 'retorno', titulo: 'Convite de retorno', descricao: 'Chama de volta quem não vem há alguns meses e não tem consulta marcada.', icone: RotateCcw, consulta: false },
];

function CampoNumero({ valor, onChange, min, max, sufixo }: { valor: number; onChange: (v: number) => void; min: number; max: number; sufixo: string }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-sm">
      <input
        type="number"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="w-12 bg-transparent text-neutral-900 outline-none"
      />
      <span className="text-neutral-500">{sufixo}</span>
    </label>
  );
}

export default function Automacoes({ clinicaId, clinicaNome }: Props) {
  const [config, setConfig] = useState<AutomacoesWhatsapp | null>(null);
  const [salvo, setSalvo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');
  const campos = useRef<Partial<Record<TipoAutomacao, HTMLTextAreaElement | null>>>({});

  useEffect(() => {
    let cancelado = false;
    setConfig(null);
    carregarConfig<unknown>(clinicaId, CHAVE_AUTOMACOES_WHATSAPP, undefined, null).then((valor) => {
      if (cancelado) return;
      const normalizado = normalizarAutomacoes(valor);
      setConfig(normalizado);
      setSalvo(JSON.stringify(normalizado));
    });
    return () => { cancelado = true; };
  }, [clinicaId]);

  if (!config) {
    return <div className="flex flex-1 items-center justify-center py-16 text-neutral-400"><Loader2 size={20} className="animate-spin" /></div>;
  }

  const alterado = JSON.stringify(config) !== salvo;

  function atualizar<T extends TipoAutomacao>(tipo: T, parcial: Partial<AutomacoesWhatsapp[T]>) {
    setConfig((atual) => (atual ? { ...atual, [tipo]: { ...atual[tipo], ...parcial } } : atual));
    setAviso('');
  }

  function alternar(tipo: TipoAutomacao, ativo: boolean) {
    if (tipo === 'confirmacao' || tipo === 'pos_consulta') {
      // Só vale para o que acontecer daqui pra frente; ligar não dispara para o histórico.
      atualizar(tipo, { ativo, desde: ativo ? new Date().toISOString() : null });
      return;
    }
    atualizar(tipo, { ativo });
  }

  function inserirVariavel(tipo: TipoAutomacao, chave: string) {
    const campo = campos.current[tipo];
    const atual = config![tipo].texto;
    const token = `{{${chave}}}`;
    const inicio = campo?.selectionStart ?? atual.length;
    const fim = campo?.selectionEnd ?? atual.length;
    atualizar(tipo, { texto: `${atual.slice(0, inicio)}${token}${atual.slice(fim)}` });
    window.setTimeout(() => {
      campo?.focus();
      campo?.setSelectionRange(inicio + token.length, inicio + token.length);
    }, 0);
  }

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    try {
      await salvarConfig(clinicaId, CHAVE_AUTOMACOES_WHATSAPP, config);
      setSalvo(JSON.stringify(config));
      setAviso('Automações salvas.');
    } catch {
      setAviso('Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 pb-28 lg:pb-6">
      <section className="rounded-[1.25rem] border border-black/[0.06] bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Horário de envio</h2>
        <p className="mt-0.5 text-xs text-neutral-500">As automações só saem dentro deste horário. O que cair fora espera o próximo horário permitido.</p>
        <div className="mt-3 grid max-w-xs grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[11px] text-neutral-500">De</p>
            <CampoHora value={config.janela.inicio} onChange={(inicio) => setConfig({ ...config, janela: { ...config.janela, inicio } })} passo={15} />
          </div>
          <div>
            <p className="mb-1 text-[11px] text-neutral-500">Até</p>
            <CampoHora value={config.janela.fim} onChange={(fim) => setConfig({ ...config, janela: { ...config.janela, fim } })} passo={15} />
          </div>
        </div>
      </section>

      {CARTOES.map(({ tipo, titulo, descricao, icone: Icone, consulta }) => {
        const regra = config[tipo];
        return (
          <section key={tipo} className="rounded-[1.25rem] border border-black/[0.06] bg-white p-4">
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${regra.ativo ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                <Icone size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-neutral-900">{titulo}</h2>
                <p className="mt-0.5 text-xs text-neutral-500">{descricao}</p>
              </div>
              <Switch checked={regra.ativo} onChange={(v) => alternar(tipo, v)} />
            </div>

            {regra.ativo && (
              <div className="mt-4 space-y-3">
                {tipo === 'lembrete' && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                    Enviar
                    <CampoNumero valor={config.lembrete.horasAntes} onChange={(horasAntes) => atualizar('lembrete', { horasAntes })} min={1} max={72} sufixo="horas antes" />
                  </div>
                )}
                {tipo === 'pos_consulta' && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                    Enviar
                    <CampoNumero valor={config.pos_consulta.horasDepois} onChange={(horasDepois) => atualizar('pos_consulta', { horasDepois })} min={1} max={72} sufixo="horas depois" />
                  </div>
                )}
                {tipo === 'aniversario' && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                    Enviar às
                    <div className="w-28"><CampoHora value={config.aniversario.hora} onChange={(hora) => atualizar('aniversario', { hora })} passo={15} /></div>
                  </div>
                )}
                {tipo === 'retorno' && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                    Sem visita há
                    <CampoNumero valor={config.retorno.meses} onChange={(meses) => atualizar('retorno', { meses })} min={1} max={36} sufixo="meses" />
                    no máximo
                    <CampoNumero valor={config.retorno.limiteDia} onChange={(limiteDia) => atualizar('retorno', { limiteDia })} min={1} max={100} sufixo="por dia" />
                  </div>
                )}

                <div>
                  <textarea
                    ref={(el) => { campos.current[tipo] = el; }}
                    value={regra.texto}
                    onChange={(e) => atualizar(tipo, { texto: e.target.value })}
                    rows={3}
                    className="w-full resize-y rounded-md border border-neutral-200 px-3 py-2 text-sm leading-5 outline-none focus:border-neutral-400"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {VARIAVEIS_WHATSAPP.filter((v) => consulta || !v.soConsulta).map((v) => (
                      <button
                        key={v.chave}
                        type="button"
                        onClick={() => inserirVariavel(tipo, v.chave)}
                        className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
                      >
                        + {v.label}
                      </button>
                    ))}
                    {regra.texto !== AUTOMACOES_PADRAO[tipo].texto && (
                      <button
                        type="button"
                        onClick={() => atualizar(tipo, { texto: AUTOMACOES_PADRAO[tipo].texto })}
                        className="rounded-full px-2.5 py-1 text-[11px] text-neutral-400 hover:text-neutral-700"
                      >
                        Restaurar texto
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
                  <p className="text-[11px] font-medium text-neutral-400">Prévia</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-700">
                    {aplicarVariaveisWhatsapp(regra.texto, { ...EXEMPLO, clinica_nome: clinicaNome || 'Clínica' })}
                  </p>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <div className="sticky bottom-24 flex items-center justify-end gap-3 lg:bottom-2">
        {aviso && <span className="rounded-full bg-white px-3 py-1 text-xs text-neutral-600 shadow-sm">{aviso}</span>}
        <button
          type="button"
          onClick={salvar}
          disabled={!alterado || salvando}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] disabled:opacity-40"
        >
          {salvando && <Loader2 size={15} className="animate-spin" />}
          Salvar automações
        </button>
      </div>
    </div>
  );
}
