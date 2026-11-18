'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { dados as tabelas, usuarioDaSessao } from '@/lib/local/consulta';
import { AlertTriangle, Bell, Calendar, History, Info, Mail } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import MenuPontos from '@/components/ui/MenuPontos';
import ConviteEquipeCard, { ConviteStatusBadge } from '@/components/forms/ConviteEquipeCard';
import { useClinica } from '@/app/context/ClinicaContext';
import {
  formatarDataConvite,
  listarMeusConvites,
  mensagemErroConvite,
  nomesClinicasConvite,
  obterStatusConvite,
  responderConviteEquipe,
  avisarConvitePorEmail,
  type MeuConvite,
} from '@/lib/convites';

const TIPOS_ALERTA = new Set(['agenda', 'alerta', 'sistema', 'aviso']);

// 40px de altura no celular; no computador volta ao tamanho que já tinha.
function pilula(ativa: boolean) {
  return `inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors sm:h-auto sm:px-4 sm:py-2 ${
    ativa ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50'
  }`;
}

function Painel({
  titulo,
  subtitulo,
  vazio,
  iconeVazio,
  modo,
  iconeItem,
}: {
  titulo: string;
  subtitulo: string;
  vazio: string;
  iconeVazio: ReactNode;
  modo: 'mensagem' | 'alerta';
  iconeItem: (tipo: string) => ReactNode;
}) {
  const [todos, setTodos] = useState<any[]>([]);
  const [escopo, setEscopo] = useState<'ativas' | 'historico'>('ativas');
  const [loading, setLoading] = useState(true);
  // Leitura que falhou não pode parecer caixa vazia ("Nada por aqui").
  const [erroLeitura, setErroLeitura] = useState(false);
  const { showAlert, showConfirm } = useCustomAlert();

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      const user = await usuarioDaSessao();
      if (!user || cancelado) {
        if (!cancelado) setLoading(false);
        return;
      }
      const { data, error } = await tabelas.from('notificacoes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
      if (!cancelado) {
        setErroLeitura(!!error);
        setTodos((data || []).filter((item: { tipo?: string | null }) => modo === 'mensagem' ? item.tipo === 'mensagem' : TIPOS_ALERTA.has(String(item.tipo || ''))));
        setLoading(false);
      }
    }
    carregar();
    return () => { cancelado = true; };
  }, [modo]);

  const visiveis = useMemo(() => {
    const agora = Date.now();
    return todos.filter((item) => {
      const expira = item.expires_at ? new Date(item.expires_at).getTime() : null;
      const ativa = expira == null || expira > agora;
      if (escopo === 'ativas') return ativa;
      return !!item.lida || (expira != null && expira <= agora);
    });
  }, [todos, escopo]);

  // O resultado do banco era ignorado: recusa (ou zero linhas) parecia feita até recarregar a página.
  async function marcarLida(id: any) {
    setTodos((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    const { data, error } = await tabelas.from('notificacoes').update({ lida: true }).eq('id', id).select('id');
    if (error || !data?.length) {
      setTodos((prev) => prev.map((n) => (n.id === id ? { ...n, lida: false } : n)));
      void showAlert('Não foi possível marcar como lida. Confira a internet e tente de novo.', { type: 'error' });
    }
  }

  async function excluir(id: any) {
    if (!(await showConfirm(`Apagar este item de ${titulo.toLowerCase()}?`, { title: 'Excluir', type: 'warning', confirmLabel: 'Apagar' }))) return;
    // Sai da lista só depois que o banco apagou.
    const { data, error } = await tabelas.from('notificacoes').delete().eq('id', id).select('id');
    if (error || !data?.length) {
      void showAlert('Não foi possível apagar este item. Confira a internet e tente de novo.', { type: 'error' });
      return;
    }
    setTodos((prev) => prev.filter((n) => n.id !== id));
  }

  // A lista fica nesta página (e não mais no componente de feed) porque no celular ela não tem
  // rolagem própria: a página rola inteira; a caixa com rolagem por dentro vale só no computador.
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:min-h-0 lg:flex-1">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-black/5 px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{titulo}</h2>
          <p className="truncate text-xs text-neutral-500">{subtitulo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" aria-pressed={escopo === 'ativas'} className={pilula(escopo === 'ativas')} onClick={() => setEscopo('ativas')}>
            Ativas
          </button>
          <button type="button" aria-pressed={escopo === 'historico'} className={pilula(escopo === 'historico')} onClick={() => setEscopo('historico')}>
            <History size={14} />
            Histórico
          </button>
        </div>
      </div>
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              // No celular bastam dois: cinco blocos empurravam o outro painel para longe e a tela pulava ao carregar.
              <div key={i} className={`h-20 animate-pulse rounded-2xl bg-neutral-100 ${i > 1 ? 'hidden lg:block' : ''}`} />
            ))}
          </div>
        ) : erroLeitura ? (
          <div className="flex flex-col items-center justify-center px-6 py-8 text-center lg:py-20">
            <div className="mb-3 text-neutral-300">{iconeVazio}</div>
            <h3 className="font-semibold text-neutral-900">Não foi possível carregar</h3>
            <p className="mt-1 text-sm text-neutral-500">Confira a internet e recarregue a página.</p>
          </div>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-8 text-center lg:py-20">
            <div className="mb-3 text-neutral-300">{iconeVazio}</div>
            <h3 className="font-semibold text-neutral-900">{vazio}</h3>
            <p className="mt-1 text-sm text-neutral-500">Nada por aqui no momento.</p>
          </div>
        ) : (
          <ul className="divide-y divide-black/5">
            {visiveis.map((n) => (
              <li key={n.id} className={`flex gap-3 p-3 sm:gap-4 sm:p-5 ${!n.lida ? 'bg-[#f3f4f1]/80' : ''}`}>
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white">
                  {iconeItem(String(n.tipo || ''))}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="break-words font-semibold text-neutral-900">{n.titulo || 'Aviso'}</h4>
                  {n.mensagem ? <p className="mt-0.5 break-words text-sm text-neutral-600">{n.mensagem}</p> : null}
                  {n.created_at ? (
                    <p className="mt-1 text-[11px] text-neutral-400">
                      {new Date(n.created_at).toLocaleString('pt-BR')}
                    </p>
                  ) : null}
                </div>
                <MenuPontos
                  className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 sm:mr-0 sm:h-8 sm:w-8"
                  itens={[
                    ...(!n.lida ? [{ id: 'lida', label: 'Marcar como lida', onClick: () => { void marcarLida(n.id); } }] : []),
                    { id: 'excluir', label: 'Excluir', perigo: true, onClick: () => { void excluir(n.id); } },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

type RespostaConviteEmAndamento = { id: number; acao: 'aceitar' | 'recusar' };

function ConvitesPainel() {
  const { showAlert, showConfirm } = useCustomAlert();
  const { refreshClinics } = useClinica();
  const [convites, setConvites] = useState<MeuConvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondendo, setRespondendo] = useState<RespostaConviteEmAndamento | null>(null);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const lista = await listarMeusConvites();
        if (ativo) setConvites(lista);
      } catch (error) {
        if (ativo) {
          await showAlert(
            mensagemErroConvite(error, 'Não foi possível carregar seus convites.'),
            { title: 'Convites', type: 'error' },
          );
        }
      } finally {
        if (ativo) setLoading(false);
      }
    }
    void carregar();
    return () => { ativo = false; };
  }, [showAlert]);

  const pendentes = useMemo(
    () => convites.filter((convite) => obterStatusConvite(convite) === 'pendente'),
    [convites],
  );
  const respondidos = useMemo(
    () => convites.filter((convite) => obterStatusConvite(convite) !== 'pendente'),
    [convites],
  );

  async function responder(convite: MeuConvite, aceitar: boolean) {
    if (respondendo) return;

    if (!aceitar) {
      const confirmou = await showConfirm(
        `Recusar o convite de ${convite.convidante_nome || 'equipe'} para ${nomesClinicasConvite(convite.clinicas)}? Seus vínculos atuais continuam iguais.`,
        { title: 'Recusar convite', type: 'warning', confirmLabel: 'Recusar convite', cancelLabel: 'Voltar' },
      );
      if (!confirmou) return;
    }

    setRespondendo({ id: convite.id, acao: aceitar ? 'aceitar' : 'recusar' });
    try {
      const resultado = await responderConviteEquipe(convite.id, aceitar);
      setConvites((prev) => prev.map((item) => (
        item.id === convite.id ? { ...item, status: resultado.status } : item
      )));

      if (aceitar) {
        // Avisa por e-mail quem convidou. Não segura a tela: o aceite já está gravado.
        void avisarConvitePorEmail(convite.id, 'aceito');
        window.dispatchEvent(new CustomEvent('ortus:clinica-changed'));
        void refreshClinics().catch(() => {});
        await showAlert(
          `Convite aceito! Você agora também faz parte da equipe de ${nomesClinicasConvite(convite.clinicas)}.`,
          { title: 'Convite aceito', type: 'success' },
        );
      } else {
        await showAlert(
          'Convite recusado. Seus vínculos atuais continuam iguais.',
          { title: 'Convite recusado', type: 'success' },
        );
      }
    } catch (error) {
      await showAlert(
        mensagemErroConvite(error, 'Não foi possível responder ao convite.'),
        { title: 'Erro ao responder convite', type: 'error' },
      );
    } finally {
      setRespondendo(null);
    }
  }

  if (loading) return null;
  if (convites.length === 0) return null;

  return (
    <section className="mb-3 flex shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:max-h-[42vh]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/5 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-900">Convites</h2>
            {pendentes.length > 0 && (
              <span className="text-xs font-medium text-neutral-500">
                {pendentes.length} {pendentes.length === 1 ? 'pendente' : 'pendentes'}
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 sm:truncate">
            {pendentes.length > 0
              ? 'Responda para participar de outra rede sem perder seus vínculos atuais.'
              : 'Seus convites já respondidos.'}
          </p>
        </div>
      </div>

      <div className="p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {pendentes.length > 0 && (
          <div className="space-y-2">
            {pendentes.map((convite) => (
              <ConviteEquipeCard
                key={convite.id}
                convite={convite}
                respondendo={respondendo?.id === convite.id ? respondendo.acao : null}
                onAceitar={(item) => { void responder(item, true); }}
                onRecusar={(item) => { void responder(item, false); }}
              />
            ))}
          </div>
        )}

        {respondidos.length > 0 && (
          <div className={pendentes.length > 0 ? 'mt-3 border-t border-black/5 pt-2.5' : ''}>
            <h3 className="text-xs font-medium text-neutral-400">Histórico</h3>
            <ul className="mt-1.5 divide-y divide-black/5">
              {respondidos.map((convite) => (
                <li key={convite.id} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-neutral-800 sm:truncate">{nomesClinicasConvite(convite.clinicas)}</p>
                    <p className="break-words text-xs text-neutral-500 sm:truncate">
                      {convite.convidante_nome || 'Equipe'}
                      {convite.rede_nome ? ` · ${convite.rede_nome}` : ''}
                      {convite.cargo ? ` · ${convite.cargo}` : ''}
                      {` · ${formatarDataConvite(convite.criado_em)}`}
                    </p>
                  </div>
                  <ConviteStatusBadge status={obterStatusConvite(convite)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Mensagens() {
  return (
    // Abaixo de lg a página rola inteira (quem rola é a casca); a altura fixa com rolagem por dentro fica só no computador.
    <div className="flex shrink-0 flex-col px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5 lg:h-full lg:min-h-0 lg:shrink lg:overflow-hidden">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Mensagens e notificações</h1>
        <p className="mt-1 text-xs text-neutral-400">Equipe e avisos da clínica.</p>
      </header>
      <ConvitesPainel />
      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:overflow-hidden">
        <Painel
          titulo="Mensagens"
          subtitulo="Comunicação interna"
          vazio="Nenhuma mensagem"
          iconeVazio={<Mail size={32} />}
          modo="mensagem"
          iconeItem={() => <Mail size={18} className="text-neutral-700" />}
        />
        <Painel
          titulo="Notificações"
          subtitulo="Avisos da clínica"
          vazio="Nenhuma notificação"
          iconeVazio={<Bell size={32} />}
          modo="alerta"
          iconeItem={(tipo) => tipo === 'agenda'
            ? <Calendar size={18} className="text-neutral-700" />
            : tipo === 'alerta'
              ? <AlertTriangle size={18} className="text-amber-600" />
              : <Info size={18} className="text-neutral-400" />}
        />
      </div>
    </div>
  );
}
