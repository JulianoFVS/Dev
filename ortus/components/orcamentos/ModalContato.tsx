'use client';

/** Registro do que o comercial conversou com o paciente e de quando ligar de novo. */
import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import CampoData from '@/components/ui/CampoData';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { registrarContato } from '@/lib/db/orcamentos';
import { ROTULO_CANAL, ROTULO_MOTIVO, somarDias, type CanalContato, type MotivoContato } from '@/lib/orcamentos';
import { hojeNoFuso } from '@/lib/fuso';

type Props = {
  open: boolean;
  onClose: () => void;
  clinicaId: number;
  pacienteId: string;
  pacienteNome: string | null;
  orcamentoId: string | null;
  motivo: MotivoContato;
  canalInicial?: CanalContato;
  feitoPor: number | null;
  onSalvo: () => void;
};

const CANAIS: CanalContato[] = ['ligacao', 'whatsapp', 'presencial', 'outro'];

export default function ModalContato({
  open, onClose, clinicaId, pacienteId, pacienteNome, orcamentoId, motivo, canalInicial = 'ligacao', feitoPor, onSalvo,
}: Props) {
  const { showAlert } = useCustomAlert();
  const [canal, setCanal] = useState<CanalContato>(canalInicial);
  const [resumo, setResumo] = useState('');
  const [proximo, setProximo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCanal(canalInicial);
    setResumo('');
    setProximo(somarDias(hojeNoFuso(), 3));
    setErro(null);
  }, [open, canalInicial]);

  async function salvar() {
    if (!resumo.trim()) {
      setErro('Conte em uma linha o que foi conversado.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await registrarContato({
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        orcamento_id: orcamentoId,
        motivo,
        canal,
        resumo,
        proximo_contato: proximo || null,
        feito_por: feitoPor,
      });
      void showAlert('Contato registrado.', { type: 'success' });
      onSalvo();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o contato.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="md" zIndex={110} hideCloseButton panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">Registrar contato</h2>
          <p className="mt-0.5 truncate text-sm text-neutral-500">{pacienteNome || 'Paciente'} · {ROTULO_MOTIVO[motivo]}</p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar">
          <X size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">Como foi o contato <span className="text-red-500">*</span></span>
          <SegmentedControl
            value={canal}
            onChange={setCanal}
            options={CANAIS.map((c) => ({ value: c, label: ROTULO_CANAL[c] }))}
            size="md"
          />
        </div>
        <label>
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">O que foi conversado <span className="text-red-500">*</span></span>
          <textarea
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
            placeholder="Ex.: vai conversar com a família e retorna na sexta."
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">Ligar de novo em</span>
          <CampoData value={proximo} onChange={setProximo} />
          <span className="mt-1 block text-xs text-neutral-400">Até essa data o paciente sai do funil de oportunidades.</span>
        </label>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-black/5 px-5 py-4 sm:px-6">
        <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">
          {salvando && <Loader2 size={14} className="animate-spin" />} Registrar
        </button>
      </div>
    </Modal>
  );
}
