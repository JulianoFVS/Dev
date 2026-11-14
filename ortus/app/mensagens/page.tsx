'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, Bell, Calendar, Info, Mail } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import BentoNotificationFeed from '@/components/bento/BentoNotificationFeed';
import ConviteEquipeCard, { ConviteStatusBadge } from '@/components/forms/ConviteEquipeCard';
import { useClinica } from '@/app/context/ClinicaContext';
import {
  formatarDataConvite,
  listarMeusConvites,
  mensagemErroConvite,
  nomesClinicasConvite,
  obterStatusConvite,
  responderConviteEquipe,
  type MeuConvite,
} from '@/lib/convites';

const TIPOS_ALERTA = new Set(['agenda', 'alerta', 'sistema', 'aviso']);

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
  const { showConfirm } = useCustomAlert();

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelado) {
        if (!cancelado) setLoading(false);
        return;
      }
      const { data } = await supabase.from('notificacoes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
      if (!cancelado) {
        setTodos((data || []).filter((item) => modo === 'mensagem' ? item.tipo === 'mensagem' : TIPOS_ALERTA.has(String(item.tipo || ''))));
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

  async function marcarLida(id: any) {
    setTodos((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
  }

  async function excluir(id: any) {
    if (!(await showConfirm(`Apagar este item de ${titulo.toLowerCase()}?`, { title: 'Excluir', type: 'warning', confirmLabel: 'Apagar' }))) return;
    setTodos((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notificacoes').delete().eq('id', id);
  }

  return (
    <BentoNotificationFeed
      embedded
      title={titulo}
      subtitle={subtitulo}
      emptyTitle={vazio}
      emptyIcon={iconeVazio}
      escopo={escopo}
      onEscopo={setEscopo}
      loading={loading}
      items={visiveis}
      onMarkRead={marcarLida}
      onDelete={excluir}
      iconForItem={(n) => iconeItem(String((n as { tipo?: string }).tipo || ''))}
    />
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
    <section className="mb-3 flex max-h-[42vh] shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
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
          <p className="truncate text-xs text-neutral-500">
            {pendentes.length > 0
              ? 'Responda para participar de outra rede sem perder seus vínculos atuais.'
              : 'Seus convites já respondidos.'}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
                    <p className="truncate text-sm font-medium text-neutral-800">{nomesClinicasConvite(convite.clinicas)}</p>
                    <p className="truncate text-xs text-neutral-500">
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Mensagens e notificações</h1>
        <p className="mt-1 text-xs text-neutral-400">Equipe e avisos da clínica.</p>
      </header>
      <ConvitesPainel />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2">
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
