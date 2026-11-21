'use client';

/**
 * Um orçamento aberto: itens, valores, status e o que fazer com ele
 * (enviar, apresentar, aprovar, recusar, reabrir, imprimir, contato).
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Pencil, Printer, RotateCcw, Send, Trash2, UserRound, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import ContatoRapido from '@/components/orcamentos/ContatoRapido';
import ModalContato from '@/components/orcamentos/ModalContato';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import {
  aprovarOrcamento,
  excluirOrcamento,
  listarContatos,
  listarItens,
  mudarStatus,
  reabrirOrcamento,
  recusarOrcamento,
} from '@/lib/db/orcamentos';
import {
  COR_STATUS_ORCAMENTO,
  ROTULO_CANAL,
  ROTULO_STATUS_ORCAMENTO,
  VALIDADE_PADRAO_DIAS,
  diasParado,
  formatarDia,
  formatarDinheiro,
  primeiroNome,
  somarDias,
  somarItens,
  statusEfetivo,
  telefoneDoPaciente,
  type ContatoComercial,
  type Orcamento,
  type OrcamentoItem,
} from '@/lib/orcamentos';
import { imprimirOrcamento } from '@/lib/orcamentoImpressao';
import { hojeNoFuso } from '@/lib/fuso';
import type { ProfissionalEquipe } from '@/lib/clinicScoped';

type Props = {
  open: boolean;
  onClose: () => void;
  orcamento: Orcamento | null;
  equipe: ProfissionalEquipe[];
  clinicaNome: string | null;
  meuProfissionalId: number | null;
  onEditar: (orc: Orcamento, itens: OrcamentoItem[]) => void;
  onMudou: () => void;
};

export function mensagemDoOrcamento(orc: Orcamento, clinicaNome: string | null): string {
  const nome = primeiroNome(orc.pacientes?.nome);
  return `Olá${nome ? `, ${nome}` : ''}! Aqui é da ${clinicaNome || 'clínica'}. Passando para saber se ficou alguma dúvida sobre o orçamento que preparamos (${formatarDinheiro(orc.valor_total)}). Podemos agendar o início do tratamento?`;
}

export default function DetalheOrcamento({ open, onClose, orcamento, equipe, clinicaNome, meuProfissionalId, onEditar, onMudou }: Props) {
  const { showAlert, showConfirm } = useCustomAlert();
  const { openPatient } = usePatientSlideOver();
  const [itens, setItens] = useState<OrcamentoItem[]>([]);
  const [contatos, setContatos] = useState<ContatoComercial[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [acao, setAcao] = useState<string | null>(null);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [contato, setContato] = useState<{ canal: 'ligacao' | 'whatsapp' } | null>(null);

  const carregar = useCallback(async () => {
    if (!orcamento) return;
    setCarregando(true);
    try {
      const [mapa, lista] = await Promise.all([
        listarItens([orcamento.id]),
        listarContatos({ clinicaIds: [orcamento.clinica_id], orcamentoId: orcamento.id }),
      ]);
      setItens(mapa.get(orcamento.id) || []);
      setContatos(lista);
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível abrir o orçamento.', { type: 'error' });
    } finally {
      setCarregando(false);
    }
  }, [orcamento, showAlert]);

  useEffect(() => {
    if (!open) return;
    setRecusando(false);
    setMotivo('');
    void carregar();
  }, [open, carregar]);

  if (!orcamento) return null;
  const hoje = hojeNoFuso();
  const status = statusEfetivo(orcamento, hoje);
  const nomeDe = (id: number | null) => (id == null ? null : equipe.find((p) => Number(p.id) === id)?.nome ?? null);
  const aprovado = status === 'aprovado';
  const encerrado = status === 'recusado' || status === 'expirado';
  const telefone = telefoneDoPaciente(orcamento.pacientes);

  async function executar(nome: string, fn: () => Promise<void>, sucesso: string) {
    setAcao(nome);
    try {
      await fn();
      void showAlert(sucesso, { type: 'success' });
      onMudou();
      return true;
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível concluir.', { type: 'error' });
      return false;
    } finally {
      setAcao(null);
    }
  }

  async function aprovar() {
    const ok = await showConfirm(
      'Aprovar cria um tratamento planejado para cada procedimento e lança o valor final como "a receber" do paciente.',
      { title: 'Aprovar orçamento?', confirmLabel: 'Aprovar' },
    );
    if (!ok) return;
    const feito = await executar('aprovar', () => aprovarOrcamento(orcamento!, itens), 'Orçamento aprovado. Os tratamentos e o valor a receber já estão na ficha.');
    if (feito) onClose();
  }

  async function recusar() {
    const feito = await executar('recusar', () => recusarOrcamento(orcamento!, motivo), 'Orçamento recusado. O histórico continua guardado.');
    if (feito) onClose();
  }

  async function excluir() {
    const ok = await showConfirm('O orçamento e os itens serão apagados. Os contatos registrados continuam no histórico do paciente.', {
      title: 'Excluir orçamento?',
      confirmLabel: 'Excluir',
      type: 'warning',
    });
    if (!ok) return;
    const feito = await executar('excluir', () => excluirOrcamento(orcamento!), 'Orçamento excluído.');
    if (feito) onClose();
  }

  const botao = 'inline-flex h-11 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-40 sm:h-9';

  return (
    <>
      <Modal open={open} onClose={onClose} maxWidth="2xl" hideCloseButton panelClassName="flex max-h-[90dvh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-neutral-900">{orcamento.pacientes?.nome || 'Paciente'}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_STATUS_ORCAMENTO[status]}`}>{ROTULO_STATUS_ORCAMENTO[status]}</span>
            </div>
            <p className="mt-0.5 text-sm text-neutral-500">
              {formatarDinheiro(orcamento.valor_total)} · válido até {formatarDia(orcamento.validade)}
              {!aprovado && !encerrado && ` · parado há ${diasParado(orcamento)} ${diasParado(orcamento) === 1 ? 'dia' : 'dias'}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs font-medium text-neutral-500">Profissional</p><p className="truncate text-neutral-900">{nomeDe(orcamento.profissional_id) || '—'}</p></div>
            <div><p className="text-xs font-medium text-neutral-500">Comercial</p><p className="truncate text-neutral-900">{nomeDe(orcamento.comercial_id) || '—'}</p></div>
            <div><p className="text-xs font-medium text-neutral-500">Telefone</p><p className="truncate text-neutral-900">{telefone || '—'}</p></div>
            <div><p className="text-xs font-medium text-neutral-500">Ligar de novo</p><p className="text-neutral-900">{formatarDia(orcamento.proximo_contato)}</p></div>
          </div>

          <div>
            <p className="mb-2 text-base font-semibold text-neutral-900">Procedimentos</p>
            {carregando ? (
              <div className="h-16 animate-pulse rounded-md bg-neutral-100" />
            ) : (
              <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {itens.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-neutral-900">
                      {item.procedimento}
                      {item.dente ? <span className="text-neutral-500"> · dente {item.dente}</span> : null}
                      {item.quantidade > 1 ? <span className="text-neutral-500"> · {item.quantidade}x</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-neutral-700">{formatarDinheiro(item.valor_total)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between px-3 py-2 text-sm text-neutral-500">
                  <span>Subtotal {formatarDinheiro(somarItens(itens))} · desconto {formatarDinheiro(orcamento.desconto)}</span>
                  <span className="font-semibold tabular-nums text-neutral-900">{formatarDinheiro(orcamento.valor_total)}</span>
                </li>
              </ul>
            )}
            {orcamento.observacoes && <p className="mt-2 text-sm text-neutral-600">{orcamento.observacoes}</p>}
            {status === 'recusado' && orcamento.motivo_recusa && (
              <p className="mt-2 text-sm text-red-700">Motivo da recusa: {orcamento.motivo_recusa}</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-base font-semibold text-neutral-900">Contatos</p>
            {contatos.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhum contato registrado ainda.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {contatos.map((c) => (
                  <li key={c.id} className="rounded-md bg-neutral-50 px-3 py-2 text-sm">
                    <p className="text-xs text-neutral-500">
                      {formatarDia(c.created_at)} · {ROTULO_CANAL[c.canal]}{nomeDe(c.feito_por) ? ` · ${nomeDe(c.feito_por)}` : ''}
                      {c.proximo_contato ? ` · ligar em ${formatarDia(c.proximo_contato)}` : ''}
                    </p>
                    {c.resumo && <p className="mt-0.5 text-neutral-800">{c.resumo}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {recusando && (
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
              <label>
                <span className="mb-1.5 block text-xs font-medium text-neutral-600">Por que o paciente recusou?</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900" placeholder="Ex.: achou caro, vai fazer em outro lugar" />
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setRecusando(false)} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-white sm:h-9">Voltar</button>
                <button type="button" onClick={recusar} disabled={acao !== null} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 sm:h-9">
                  {acao === 'recusar' && <Loader2 size={14} className="animate-spin" />} Confirmar recusa
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-black/5 px-5 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <ContatoRapido
              telefone={telefone}
              nome={orcamento.pacientes?.nome}
              pacienteId={orcamento.paciente_id}
              clinicaId={orcamento.clinica_id}
              mensagem={mensagemDoOrcamento(orcamento, clinicaNome)}
              onContato={(canal) => setContato({ canal })}
            />
            <button type="button" onClick={() => setContato({ canal: 'ligacao' })} className={botao}>Registrar contato</button>
            <button type="button" onClick={() => imprimirOrcamento({ orcamento, itens, clinicaNome, profissionalNome: nomeDe(orcamento.profissional_id) })} className={botao} title="Imprimir ou salvar em PDF">
              <Printer size={14} /> Imprimir
            </button>
            <button type="button" onClick={() => openPatient(orcamento.paciente_id)} className={botao}>
              <UserRound size={14} /> Ficha
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {!aprovado && (
                <button type="button" onClick={excluir} disabled={acao !== null} className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 sm:h-9">
                  <Trash2 size={14} /> Excluir
                </button>
              )}
              {!aprovado && !encerrado && (
                <button type="button" onClick={() => onEditar(orcamento, itens)} disabled={acao !== null} className={botao}>
                  <Pencil size={14} /> Editar
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {status === 'rascunho' && (
                <button type="button" disabled={acao !== null} onClick={() => executar('enviar', () => mudarStatus(orcamento, 'enviado'), 'Orçamento marcado como enviado.')} className={botao}>
                  {acao === 'enviar' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Marcar como enviado
                </button>
              )}
              {(status === 'rascunho' || status === 'enviado') && (
                <button type="button" disabled={acao !== null} onClick={() => executar('apresentar', () => mudarStatus(orcamento, 'em_aberto'), 'Orçamento marcado como apresentado (em aberto).')} className={botao}>
                  {acao === 'apresentar' && <Loader2 size={14} className="animate-spin" />} Apresentado
                </button>
              )}
              {encerrado && (
                <button type="button" disabled={acao !== null} onClick={() => executar('reabrir', () => reabrirOrcamento(orcamento, somarDias(hoje, VALIDADE_PADRAO_DIAS)), 'Orçamento reaberto com nova validade.')} className={botao}>
                  {acao === 'reabrir' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reabrir
                </button>
              )}
              {!aprovado && !encerrado && (
                <button type="button" disabled={acao !== null} onClick={() => setRecusando(true)} className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 sm:h-9">
                  Recusado
                </button>
              )}
              {!aprovado && status !== 'recusado' && (
                <button type="button" disabled={acao !== null || carregando || itens.length === 0} onClick={aprovar} className="inline-flex h-11 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">
                  {acao === 'aprovar' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aprovar
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ModalContato
        open={contato !== null}
        onClose={() => setContato(null)}
        clinicaId={orcamento.clinica_id}
        pacienteId={orcamento.paciente_id}
        pacienteNome={orcamento.pacientes?.nome ?? null}
        orcamentoId={orcamento.id}
        motivo="orcamento"
        canalInicial={contato?.canal}
        feitoPor={meuProfissionalId}
        onSalvo={() => { void carregar(); onMudou(); }}
      />
    </>
  );
}
