'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Lock } from 'lucide-react';
import { useClinica } from '@/app/context/ClinicaContext';
import { avisoDaAssinatura, type SituacaoAssinatura } from '@/lib/assinaturas';
import { EVENTO_ASSINATURA, buscarSituacao, clinicaPorRede, piorSituacao as pior, situacaoGuardada } from '@/lib/assinaturaCliente';

const INTERVALO_MS = 5 * 60_000;

/**
 * Faixa de aviso da assinatura, no topo da casca.
 *
 * Aparece em dois casos: fatura vencida (só para o administrador, com o dia
 * em que o sistema entra em modo de consulta) e modo de consulta (para todos).
 * Pinta do que ficou guardado na sessão e confirma no servidor em seguida.
 */
export default function FaixaAssinatura() {
  const { clinics, activeClinicId } = useClinica();
  const pathname = usePathname();

  // Em "todas as clínicas", uma consulta por rede (no máximo 5), a mesma regra da tela Assinatura.
  const alvos = useMemo(() => {
    if (!activeClinicId) return [] as string[];
    if (activeClinicId !== 'all') return [String(activeClinicId)];
    return clinicaPorRede(clinics).map((c) => c.id);
  }, [activeClinicId, clinics]);
  const assinaturaDosAlvos = alvos.join(',');

  const [situacao, setSituacao] = useState<SituacaoAssinatura | null>(null);
  const ultimaConsulta = useRef(0);

  useEffect(() => {
    let cancelado = false;
    const ids = assinaturaDosAlvos ? assinaturaDosAlvos.split(',') : [];
    if (!ids.length) {
      setSituacao(null);
      return;
    }
    setSituacao(pior(ids.map(situacaoGuardada)));

    const conferir = async () => {
      ultimaConsulta.current = Date.now();
      const respostas = await Promise.all(ids.map((id) => buscarSituacao(id)));
      if (cancelado) return;
      // Sem resposta (sem internet): fica o que estava guardado.
      if (respostas.some(Boolean)) setSituacao(pior(respostas.map((r, i) => r ?? situacaoGuardada(ids[i]))));
    };
    void conferir();

    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaConsulta.current > INTERVALO_MS) void conferir();
    };
    const aoAvisar = () => void conferir();
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener(EVENTO_ASSINATURA, aoAvisar);
    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener(EVENTO_ASSINATURA, aoAvisar);
    };
  }, [assinaturaDosAlvos]);

  const aviso = avisoDaAssinatura(situacao);
  if (!aviso) return null;
  const bloqueio = aviso.tom === 'bloqueio';

  return (
    <div
      role="status"
      className={`flex shrink-0 items-center gap-2.5 px-3 py-2 text-[13px] leading-snug md:px-4 ${
        bloqueio ? 'bg-neutral-900 text-white' : 'border-b border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      {bloqueio ? <Lock size={15} className="shrink-0" aria-hidden /> : <AlertTriangle size={15} className="shrink-0" aria-hidden />}
      <p className="min-w-0 flex-1">{aviso.texto}</p>
      {aviso.acao && pathname !== '/assinatura' && (
        <Link
          href="/assinatura"
          // 40 px no celular (alvo de toque); no computador volta ao tamanho compacto.
          className={`inline-flex h-10 shrink-0 items-center rounded-md px-3 text-xs font-semibold lg:h-8 ${
            bloqueio ? 'bg-white text-neutral-900 hover:bg-neutral-100' : 'bg-neutral-900 text-white hover:bg-neutral-800'
          }`}
        >
          Ver fatura
        </Link>
      )}
    </div>
  );
}
