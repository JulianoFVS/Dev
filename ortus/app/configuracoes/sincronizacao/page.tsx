'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, Check, Cloud, Database, Loader2, RefreshCw, ShieldCheck, WifiOff,
} from 'lucide-react';
import Aviso from '@/components/ui/Aviso';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
  estadoSyncUI, lerSessaoCacheUI, listarConflitosUI, resolverConflitoUI, sincronizarAgoraUI,
  type ConflitoSyncUI as ConflitoSync, type EstadoSyncUI,
} from '@/lib/local/cliente';

/**
 * Configurações → Sincronização.
 *
 * Existe só dentro do Ortus Desktop. Mostra o estado do backup na nuvem e a
 * lista de conflitos — duas edições do mesmo registro em computadores
 * diferentes. Vence, por ora, o carimbo mais novo; as duas versões ficam
 * guardadas aqui e quem decide de vez é a pessoa. A escolha vale para todos
 * os computadores: a versão escolhida é enviada para a nuvem.
 *
 * Também aparecem aqui as alterações que a nuvem recusou (modo de consulta,
 * permissão): saíram da fila de envio, mas continuam neste computador.
 */

const ROTULO: Record<EstadoSyncUI['estado'], string> = {
  iniciando: 'Iniciando',
  sincronizando: 'Sincronizando',
  sincronizado: 'Sincronizado',
  offline: 'Sem internet',
  erro: 'Falha no backup',
  login: 'Entre para sincronizar',
};

/** Nome que a clínica reconhece para cada tabela sincronizada. */
const ROTULO_TABELA: Record<string, string> = {
  pacientes: 'Paciente',
  agendamentos: 'Agendamento',
  paciente_tratamentos: 'Tratamento do paciente',
  paciente_anamneses: 'Anamnese',
  paciente_evolucoes: 'Evolução',
  paciente_documentos: 'Documento',
  paciente_debitos: 'Débito',
  orcamentos: 'Orçamento',
  orcamento_itens: 'Item de orçamento',
  orcamento_contatos: 'Contato do comercial',
  tarefas: 'Tarefa',
  despesas: 'Lançamento financeiro',
  kanban_colunas: 'Coluna de próteses',
  kanban_cartoes: 'Pedido de prótese',
  configuracoes_clinica: 'Configuração da clínica',
  especialidades: 'Especialidade',
  planos: 'Plano',
  tratamentos_base: 'Tratamento',
  planos_tratamentos: 'Preço do plano',
  profissionais: 'Profissional',
  profissionais_clinicas: 'Vínculo com a clínica',
  profissionais_horarios: 'Horário do profissional',
  permissoes_modulos: 'Permissão',
  comissoes_regras: 'Regra de comissão',
  comissoes_lancamentos: 'Comissão',
  lembretes_agenda: 'Lembrete',
  notificacoes: 'Notificação',
  anamnese_links: 'Link de anamnese',
  convites_equipe: 'Convite',
  clinicas: 'Clínica',
  whatsapp_agendadas: 'Mensagem agendada',
  whatsapp_envios: 'Envio do WhatsApp',
  whatsapp_mensagens: 'Mensagem do WhatsApp',
};

const ROTULO_CAMPO: Record<string, string> = {
  nome: 'Nome',
  titulo: 'Título',
  telefone: 'Telefone',
  email: 'E-mail',
  procedimento: 'Procedimento',
  descricao: 'Descrição',
  observacoes: 'Observações',
  texto: 'Texto',
  status: 'Situação',
  valor: 'Valor',
  data: 'Data',
  data_hora: 'Data e hora',
  data_limite: 'Prazo',
  chave: 'Chave',
};

/** Campos que identificam o registro quando só existe um dos lados. */
const CAMPOS_DE_REFERENCIA = ['nome', 'titulo', 'procedimento', 'descricao', 'texto', 'chave', 'status'];
/** Carimbos mudam em toda gravação: não ajudam a decidir. */
const CAMPOS_IGNORADOS = new Set(['updated_at', 'created_at', 'criado_em', 'atualizado_em']);

type Versao = Record<string, unknown> | null;

function quando(iso?: string | null): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function textoDoValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '(vazio)';
  const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  return texto.length > 80 ? `${texto.slice(0, 80)}…` : texto;
}

/** O que mudou entre os dois lados; sem um deles, os campos que dizem qual é o registro. */
function camposParaMostrar(local: Versao, remota: Versao): string[] {
  if (local && remota) {
    const diferentes = Array.from(new Set([...Object.keys(local), ...Object.keys(remota)])).filter(
      (campo) => !CAMPOS_IGNORADOS.has(campo) && JSON.stringify(local[campo] ?? null) !== JSON.stringify(remota[campo] ?? null),
    );
    if (diferentes.length) return diferentes.slice(0, 5);
  }
  const existente = local || remota;
  if (!existente) return [];
  return CAMPOS_DE_REFERENCIA.filter((campo) => existente[campo] !== undefined && existente[campo] !== null).slice(0, 3);
}

function resumo(versao: Versao, campos: string[]): string {
  if (!versao) return 'Registro excluído';
  const partes = campos.map((campo) => `${ROTULO_CAMPO[campo] ?? campo}: ${textoDoValor(versao[campo])}`);
  return partes.join(' · ') || '(sem campos de referência)';
}

/** Nome do registro em disputa, para a pessoa saber do que se trata. */
function identificacao(conflito: ConflitoSync): string {
  const versao = conflito.versao_local || conflito.versao_remota;
  const campo = ['nome', 'titulo', 'procedimento', 'descricao'].find((c) => versao && versao[c]);
  return campo && versao ? String(versao[campo]) : '';
}

/**
 * Por que a nuvem recusou. O texto é sempre este, fixo: a resposta do
 * servidor fica só no log do programa.
 */
const RECUSA: Record<string, { situacao: string; explicacao: string }> = {
  consulta: {
    situacao: 'Recusada: modo de consulta',
    explicacao: 'A assinatura da clínica está suspensa e a nuvem só aceita leitura. Depois de regularizar em Assinatura, tente enviar de novo.',
  },
  permissao: {
    situacao: 'Recusada por permissão',
    explicacao: 'A nuvem não deixa este usuário fazer esta alteração (por exemplo, comissões só o administrador altera).',
  },
  rejeitado: {
    situacao: 'A nuvem recusou esta alteração',
    explicacao: 'A nuvem não aceitou os dados desta alteração.',
  },
};

/** Textos de cada conflito: muda quando um lado é exclusão ou quando a nuvem recusou a escrita. */
function textosDoConflito(conflito: ConflitoSync) {
  if (conflito.resolucao === 'recusado') {
    const recusa = RECUSA[conflito.motivo ?? ''] ?? RECUSA.rejeitado;
    return {
      situacao: recusa.situacao,
      explicacao: recusa.explicacao,
      local: 'Tentar enviar de novo',
      remoto: 'Descartar a alteração daqui',
      confirmarLocal: 'Tentar enviar de novo? Se a nuvem recusar outra vez, o conflito volta para esta lista.',
      confirmarRemoto: 'Descartar a alteração que a nuvem recusou? Este computador volta a mostrar o que estiver na nuvem.',
    };
  }
  const excluir = 'Este lado é a exclusão do registro. Confirmar exclui o registro neste computador e na nuvem.';
  return {
    situacao: `Venceu por ora: ${conflito.escolhido === 'local' ? 'este computador' : 'a nuvem'}`,
    explicacao: '',
    local: conflito.versao_local ? 'Manter este computador' : 'Manter excluído',
    remoto: conflito.versao_remota ? 'Manter a nuvem' : 'Manter excluído',
    confirmarLocal: conflito.versao_local
      ? 'Manter a versão deste computador? Ela será enviada para a nuvem e para os outros computadores.'
      : excluir,
    confirmarRemoto: conflito.versao_remota
      ? 'Manter a versão da nuvem? A alteração feita aqui será substituída.'
      : excluir,
  };
}

export default function SincronizacaoPage() {
  const { showAlert, showConfirm } = useCustomAlert();
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<EstadoSyncUI | null>(null);
  const [conflitos, setConflitos] = useState<ConflitoSync[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [forcando, setForcando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoTimer = useRef<number | null>(null);

  function avisar(mensagem: string) {
    setAviso(mensagem);
    if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 2600);
  }

  useEffect(() => () => {
    if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
  }, []);

  const carregar = useCallback(async () => {
    const status = await estadoSyncUI();
    setEstado(status);
    const lista = await listarConflitosUI();
    setConflitos(lista);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const sessao = await lerSessaoCacheUI().catch(() => null);
      const resposta = await fetch('/api/local/status', { cache: 'no-store' }).catch(() => null);
      const dados = resposta && resposta.ok ? ((await resposta.json()) as { desktop?: boolean }) : null;
      if (!vivo) return;
      const ehDesktop = Boolean(dados?.desktop) || Boolean(sessao);
      setDesktop(ehDesktop);
      if (ehDesktop) await carregar();
      if (vivo) setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [carregar]);

  useEffect(() => {
    if (!desktop) return;
    const timer = window.setInterval(() => void carregar(), 8_000);
    return () => window.clearInterval(timer);
  }, [desktop, carregar]);

  async function forcar() {
    setForcando(true);
    const proximo = await sincronizarAgoraUI();
    if (proximo) setEstado(proximo);
    await carregar();
    setForcando(false);
  }

  async function resolver(conflito: ConflitoSync, escolha: 'local' | 'remoto') {
    const textos = textosDoConflito(conflito);
    const ok = await showConfirm(escolha === 'local' ? textos.confirmarLocal : textos.confirmarRemoto, {
      type: 'warning',
      title: 'Resolver conflito',
      confirmLabel: escolha === 'local' ? textos.local : textos.remoto,
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    try {
      await resolverConflitoUI(conflito.id, escolha);
      await carregar();
      if (conflito.resolucao !== 'recusado') avisar('Conflito resolvido. A escolha será enviada para a nuvem.');
      else if (escolha === 'local') avisar('A alteração voltou para a fila de envio.');
      else avisar('Alteração descartada. O que está na nuvem volta no próximo ciclo.');
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : 'Falha ao resolver.', { type: 'error' });
    }
  }

  // Em modo de consulta cada alteração feita aqui é recusada à parte; depois
  // de regularizar a assinatura, todas voltam para a fila de uma vez.
  const recusadasPorConsulta = conflitos.filter((c) => c.resolucao === 'recusado' && c.motivo === 'consulta');

  async function reenviarRecusadas() {
    const lista = recusadasPorConsulta;
    if (!lista.length || reenviando) return;
    const ok = await showConfirm(
      `Tentar enviar de novo as ${lista.length} alterações recusadas pelo modo de consulta? Faça isso depois de regularizar a assinatura. Se a nuvem recusar outra vez, elas voltam para esta lista.`,
      { type: 'warning', title: 'Tentar enviar de novo', confirmLabel: 'Tentar enviar de novo', cancelLabel: 'Cancelar' },
    );
    if (!ok) return;

    setReenviando(true);
    let falhas = 0;
    for (const conflito of lista) {
      try {
        await resolverConflitoUI(conflito.id, 'local');
      } catch {
        falhas += 1;
      }
    }
    await carregar();
    setReenviando(false);
    if (falhas) {
      await showAlert(`${falhas} de ${lista.length} alterações não voltaram para a fila. Tente de novo em instantes.`, { type: 'error' });
    } else {
      avisar(`${lista.length} alterações voltaram para a fila de envio.`);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-3 sm:px-5 sm:py-4">
      <Aviso mensagem={aviso} />
      <header className="flex flex-col gap-2">
        <Link
          href="/configuracoes"
          className="inline-flex min-h-10 w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 sm:min-h-0"
        >
          <ArrowLeft size={13} /> Configurações
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Sincronização</h1>
        <p className="text-sm text-neutral-500">
          O trabalho do dia fica no banco desta máquina. Com internet, cada alteração sobe para a nuvem
          como backup — e o que for feito em outro computador desce para cá.
        </p>
      </header>

      {carregando && (
        <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          <Loader2 size={16} className="animate-spin" /> Lendo o estado do backup…
        </div>
      )}

      {!carregando && desktop === false && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-6">
          <p className="flex items-center gap-2 text-sm font-medium text-neutral-800">
            <ShieldCheck size={16} /> Recurso do aplicativo desktop
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            No navegador o Ortus fala direto com a nuvem. O banco local e o backup automático existem
            apenas na versão instalada na clínica.
          </p>
        </div>
      )}

      {!carregando && desktop !== false && (
        <>
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Situação</p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-neutral-900">
                  {estado?.estado === 'sincronizado' ? <Check size={17} className="text-emerald-600" /> : null}
                  {estado?.estado === 'offline' ? <WifiOff size={17} className="text-amber-600" /> : null}
                  {estado?.estado === 'erro' ? <AlertTriangle size={17} className="text-rose-600" /> : null}
                  {estado?.estado === 'sincronizando' ? <Loader2 size={17} className="animate-spin text-neutral-500" /> : null}
                  {estado ? ROTULO[estado.estado] : '—'}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Último envio bem-sucedido: <span className="tabular-nums">{quando(estado?.ultimoEnvioOk)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void forcar()}
                disabled={forcando}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {forcando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Sincronizar agora
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-[#fafaf8] px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-neutral-400">Aguardando envio</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">{estado?.pendentes ?? 0}</dd>
              </div>
              <div className="rounded-lg bg-[#fafaf8] px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-neutral-400">Conflitos</dt>
                <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${(estado?.conflitos ?? 0) > 0 ? 'text-amber-700' : 'text-neutral-900'}`}>
                  {estado?.conflitos ?? 0}
                </dd>
              </div>
              <div className="rounded-lg bg-[#fafaf8] px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-neutral-400">Cópia inicial</dt>
                <dd className="mt-0.5 flex items-center gap-1 text-sm font-medium text-neutral-900">
                  {estado?.bootstrap ? <><Database size={13} /> Baixada</> : <><Cloud size={13} /> Pendente</>}
                </dd>
              </div>
            </dl>

            {estado?.estado === 'offline' && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Sem internet agora. A clínica continua trabalhando normalmente: as alterações ficam
                guardadas nesta máquina e sobem sozinhas quando a conexão voltar.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
              <h2 className="text-base font-semibold text-neutral-900">Conflitos</h2>
              <div className="flex flex-wrap items-center gap-2">
                {recusadasPorConsulta.length > 1 && (
                  <button
                    type="button"
                    onClick={() => void reenviarRecusadas()}
                    disabled={reenviando}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 sm:h-9"
                  >
                    {reenviando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Tentar enviar as {recusadasPorConsulta.length} de novo
                  </button>
                )}
                <span className="text-xs text-neutral-400">{conflitos.length} pendente(s)</span>
              </div>
            </div>

            {conflitos.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-500">
                Nenhum conflito. Quando o mesmo registro for alterado em dois computadores, ou a nuvem
                recusar uma alteração feita aqui, ela aparece nesta lista para você decidir.
              </p>
            ) : (
              <ul className="divide-y divide-black/5">
                {conflitos.map((conflito) => {
                  const textos = textosDoConflito(conflito);
                  const campos = camposParaMostrar(conflito.versao_local, conflito.versao_remota);
                  const nome = identificacao(conflito);
                  const recusado = conflito.resolucao === 'recusado';
                  return (
                    <li key={conflito.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                          {ROTULO_TABELA[conflito.tabela] ?? conflito.tabela}
                        </span>
                        <span className="text-[11px] text-neutral-400">{quando(conflito.detectado_em)}</span>
                        <span className={`ml-auto text-[11px] font-medium ${recusado ? 'text-rose-700' : 'text-neutral-500'}`}>
                          {textos.situacao}
                        </span>
                      </div>
                      {nome ? <p className="mt-1.5 break-words text-sm font-medium text-neutral-900">{nome}</p> : null}
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-neutral-200 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Aqui</p>
                          <p className="mt-0.5 break-words text-xs text-neutral-700">{resumo(conflito.versao_local, campos)}</p>
                        </div>
                        <div className="rounded-lg border border-neutral-200 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Na nuvem</p>
                          <p className="mt-0.5 break-words text-xs text-neutral-700">
                            {recusado ? textos.explicacao : resumo(conflito.versao_remota, campos)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void resolver(conflito, 'local')}
                          className="inline-flex h-10 items-center rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 sm:h-9"
                        >
                          {textos.local}
                        </button>
                        <button
                          type="button"
                          onClick={() => void resolver(conflito, 'remoto')}
                          className="inline-flex h-10 items-center rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 sm:h-9"
                        >
                          {textos.remoto}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
