'use client';

/**
 * Configurações → Chamada na TV (administrador da clínica): o que a TV
 * mostra (nome curto ou senha), voz, locais de atendimento e os links das
 * TVs (criar, copiar uma vez, revogar).
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Plus, Tv } from 'lucide-react';
import { useClinica } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Switch from '@/components/ui/Switch';
import TagInput from '@/components/ui/TagInput';
import {
  CONFIG_CHAMADA_PADRAO,
  carregarConfigChamada,
  criarLinkTv,
  listarLinksTv,
  revogarLinkTv,
  salvarConfigChamada,
  type ConfigChamada,
  type LinkTv,
} from '@/lib/chamadas';
import { useAdminDaClinica } from '@/lib/meuProfissional';
import { formatarDia } from '@/lib/orcamentos';

const campo = 'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';

export default function PainelChamadaTv() {
  const { activeClinicId } = useClinica();
  const { showAlert, showConfirm } = useCustomAlert();
  const clinicaId = activeClinicId && activeClinicId !== 'all' ? Number(activeClinicId) : null;
  const admin = useAdminDaClinica(clinicaId);
  const [config, setConfig] = useState<ConfigChamada>(CONFIG_CHAMADA_PADRAO);
  const [links, setLinks] = useState<LinkTv[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nomeTv, setNomeTv] = useState('');
  const [criando, setCriando] = useState(false);
  const [novoLink, setNovoLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const [c, l] = await Promise.all([carregarConfigChamada(clinicaId), admin ? listarLinksTv(clinicaId) : Promise.resolve([] as LinkTv[])]);
      setConfig(c);
      setLinks(l);
    } catch (e) {
      setLinks([]);
      void showAlert(e instanceof Error ? e.message : 'Não foi possível carregar a chamada na TV.', { type: 'error' });
    }
  }, [clinicaId, admin, showAlert]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (!clinicaId) {
    return <p className="text-sm text-neutral-500">Escolha uma clínica no menu para configurar a chamada na TV dela.</p>;
  }

  async function salvar() {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      await salvarConfigChamada(clinicaId, { ...config, locais: config.locais.map((l) => l.trim()).filter(Boolean).slice(0, 30) });
      void showAlert('Chamada na TV salva.', { type: 'success' });
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível salvar.', { type: 'error' });
    } finally {
      setSalvando(false);
    }
  }

  async function criar() {
    if (!clinicaId) return;
    setCriando(true);
    try {
      const { link } = await criarLinkTv(clinicaId, nomeTv || 'TV da recepção');
      setNovoLink(link);
      setCopiado(false);
      setNomeTv('');
      void carregar();
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível criar o link.', { type: 'error' });
    } finally {
      setCriando(false);
    }
  }

  async function revogar(l: LinkTv) {
    if (!(await showConfirm(`A TV "${l.nome}" para de mostrar as chamadas na hora. Para voltar, crie um link novo.`, { title: 'Revogar link?', confirmLabel: 'Revogar', type: 'warning' }))) return;
    try {
      await revogarLinkTv(l.id);
      void showAlert('Link revogado.', { type: 'success' });
      void carregar();
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível revogar.', { type: 'error' });
    }
  }

  async function copiar() {
    if (!novoLink) return;
    try {
      await navigator.clipboard.writeText(novoLink);
      setCopiado(true);
    } catch {
      void showAlert(`Não foi possível copiar. O link é: ${novoLink}`, { type: 'warning' });
    }
  }

  return (
    <div className="flex flex-col gap-5 lg:min-h-0 lg:overflow-y-auto">
      <div>
        <h3 className="text-base font-semibold text-neutral-900">Chamada na TV</h3>
        <p className="mt-0.5 text-sm text-neutral-500">Abra o link da TV no navegador da televisão da sala de espera. A recepção chama pela agenda (botão Chamar) ou gera uma senha.</p>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-3 sm:p-4">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">O que a TV mostra</span>
          <SegmentedControl
            value={config.mostrar}
            onChange={(mostrar) => setConfig((c) => ({ ...c, mostrar }))}
            options={[{ value: 'nome', label: 'Nome curto (Maria S.)' }, { value: 'senha', label: 'Só a senha' }]}
            size="md"
          />
          <p className="mt-1 text-xs text-neutral-400">O nome completo do paciente nunca aparece na TV.</p>
        </div>
        <Switch checked={config.voz} onChange={(voz) => setConfig((c) => ({ ...c, voz }))}>
          <span className="text-sm text-neutral-700">Falar a chamada em voz alta (nas TVs que têm voz)</span>
        </Switch>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">Locais de atendimento</span>
          <TagInput value={config.locais} onChange={(locais: string[]) => setConfig((c) => ({ ...c, locais }))} placeholder="Ex.: Consultório 3 (Enter para incluir)" />
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={salvar} disabled={salvando || !admin} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
        {!admin && <p className="text-xs text-neutral-500">Só o administrador da clínica altera estas opções.</p>}
      </section>

      {admin && (
        <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3 sm:p-4">
          <p className="text-base font-semibold text-neutral-900">TVs</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={nomeTv} onChange={(e) => setNomeTv(e.target.value.slice(0, 60))} className={campo} placeholder="Nome da TV (ex.: TV da recepção)" />
            <button type="button" onClick={criar} disabled={criando} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
              {criando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar link
            </button>
          </div>

          {novoLink && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-medium text-emerald-900">Link criado. Guarde agora: ele só aparece esta vez.</p>
              <p className="mt-1 break-all font-mono text-xs text-emerald-900">{novoLink}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={copiar} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-100 sm:h-8">
                  {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}
                </button>
                <a href={novoLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-100 sm:h-8">
                  <ExternalLink size={14} /> Abrir
                </a>
              </div>
            </div>
          )}

          {links === null ? (
            <div className="h-10 animate-pulse rounded-md bg-neutral-100" />
          ) : links.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhuma TV ainda.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {links.map((l) => (
                <li key={l.id} className="flex min-h-[48px] items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Tv size={15} className={l.ativo ? 'text-neutral-600' : 'text-neutral-300'} />
                    <span className="min-w-0">
                      <span className={`block truncate text-sm ${l.ativo ? 'text-neutral-900' : 'text-neutral-400 line-through'}`}>{l.nome}</span>
                      <span className="text-xs text-neutral-500">criado em {formatarDia(l.created_at)}{l.revogado_em ? ` · revogado em ${formatarDia(l.revogado_em)}` : ''}</span>
                    </span>
                  </span>
                  {l.ativo && (
                    <button type="button" onClick={() => revogar(l)} className="inline-flex h-10 shrink-0 items-center rounded-md px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 sm:h-8">Revogar</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
