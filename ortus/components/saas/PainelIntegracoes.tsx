'use client';

/**
 * Painel SaaS → Integrações (só a equipe da Ortus): as credenciais que a
 * plataforma precisa para o Google Agenda. O segredo vai cifrado ao banco e
 * nunca volta para a tela (aparecem só os 4 últimos caracteres).
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound, Loader2 } from 'lucide-react';
import Switch from '@/components/ui/Switch';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { chamarApi } from '@/lib/apiAutenticada';

type Estado = {
  google: {
    ativo: boolean;
    clientId: string;
    segredoDefinido: boolean;
    segredoFinal: string;
    modoTeste: boolean;
    atualizadoEm: string | null;
    urlRetorno: string;
  };
  cifraDisponivel: boolean;
};

const campo = 'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';

export default function PainelIntegracoes() {
  const { showAlert } = useCustomAlert();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(false);
  const [clientId, setClientId] = useState('');
  const [segredo, setSegredo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamarApi<Estado>('/api/super-admin/integracoes');
    if (!r.ok) { setErro(r.dados.error || 'Não foi possível carregar as integrações.'); return; }
    setEstado(r.dados);
    setAtivo(r.dados.google.ativo);
    setClientId(r.dados.google.clientId);
    setSegredo('');
    setErro(null);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar() {
    setSalvando(true);
    const r = await chamarApi('/api/super-admin/integracoes', { metodo: 'POST', corpo: { ativo, clientId, clientSecret: segredo } });
    setSalvando(false);
    if (!r.ok) { void showAlert(r.dados.error || 'Não foi possível salvar.', { type: 'error' }); return; }
    void showAlert('Integração do Google Agenda salva.', { type: 'success' });
    void carregar();
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      void showAlert(`Copie à mão: ${texto}`, { type: 'warning' });
    }
  }

  if (erro) return <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{erro}</p>;
  if (!estado) return <div className="h-40 animate-pulse rounded-xl bg-white" />;
  const g = estado.google;

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Google Agenda</h2>
            <p className="mt-0.5 text-sm text-neutral-500">Cada profissional liga a própria agenda no perfil. Aqui vão as credenciais do app OAuth da Ortus.</p>
          </div>
          <KeyRound size={18} className="mt-1 shrink-0 text-neutral-400" />
        </div>

        {!estado.cifraDisponivel && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            O servidor está sem <code className="font-mono text-xs">ORTUS_CHAVE_CIFRA</code>. Sem ela o segredo não pode ser guardado. Defina a variável (openssl rand -hex 32) e reinicie o site.
          </p>
        )}
        {g.modoTeste && (
          <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Client ID de teste: este ambiente fala com o Google falso da homologação. Cole as credenciais reais para usar o Google de verdade.
          </p>
        )}

        <Switch checked={ativo} onChange={setAtivo}>
          <span className="text-sm text-neutral-700">Integração ligada</span>
        </Switch>
        <label>
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">Client ID {ativo && <span className="text-red-500">*</span>}</span>
          <input value={clientId} onChange={(e) => setClientId(e.target.value.trim())} className={campo} placeholder="123456789-abc.apps.googleusercontent.com" autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">Client Secret</span>
          <input
            type="password"
            value={segredo}
            onChange={(e) => setSegredo(e.target.value)}
            className={campo}
            placeholder={g.segredoDefinido ? `guardado (termina em ${g.segredoFinal}) — deixe vazio para manter` : 'GOCSPX-…'}
            autoComplete="new-password"
          />
          <span className="mt-1 block text-xs text-neutral-400">Vai cifrado para o banco e não aparece de novo.</span>
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">URI de redirecionamento (cadastre no Google Cloud)</span>
          <div className="flex gap-2">
            <code className="flex min-h-10 flex-1 items-center break-all rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-800">{g.urlRetorno}</code>
            <button type="button" onClick={() => void copiar(g.urlRetorno)} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50" aria-label="Copiar URI">
              {copiado ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-neutral-400">{g.atualizadoEm ? `Alterado em ${new Date(g.atualizadoEm).toLocaleString('pt-BR')}` : 'Ainda não configurado'}</span>
          <button type="button" onClick={salvar} disabled={salvando} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
        <h2 className="text-base font-semibold text-neutral-900">Como criar as credenciais</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>No <a className="inline-flex items-center gap-1 font-medium underline underline-offset-2" href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console <ExternalLink size={12} /></a>, crie (ou escolha) um projeto da Ortus.</li>
          <li>Em <strong>APIs e serviços → Biblioteca</strong>, ative a <strong>Google Calendar API</strong>.</li>
          <li>Em <strong>Tela de consentimento OAuth</strong>, escolha o tipo <strong>Externo</strong>, preencha nome e e-mail de suporte e inclua os escopos <code className="font-mono text-xs">calendar.events</code>, <code className="font-mono text-xs">openid</code> e <code className="font-mono text-xs">email</code>.</li>
          <li>Enquanto o app não for verificado pelo Google, só as contas em <strong>Usuários de teste</strong> (até 100) conseguem conectar. Para liberar a todos, peça a verificação do app (o escopo de agenda é “sensível”).</li>
          <li>Em <strong>Credenciais → Criar credenciais → ID do cliente OAuth</strong>, escolha <strong>Aplicativo da Web</strong> e cole a <strong>URI de redirecionamento</strong> ao lado em “URIs de redirecionamento autorizados”.</li>
          <li>Copie o <strong>ID do cliente</strong> e a <strong>Chave secreta do cliente</strong> para os campos ao lado, ligue a integração e salve.</li>
        </ol>
        <p className="text-xs text-neutral-500">O evento no Google leva só o primeiro nome do paciente e o tipo da consulta. Se o Google falhar, a consulta continua salva no Ortus e a agenda avisa.</p>
      </section>
    </div>
  );
}
