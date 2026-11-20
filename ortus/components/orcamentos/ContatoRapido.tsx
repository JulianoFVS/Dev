'use client';

/**
 * Ligar e mandar WhatsApp para o paciente a partir do funil.
 * O WhatsApp segue o mesmo caminho dos outros botões do app: a aba
 * WhatsApp do Ortus quando ela está ligada; senão, o WhatsApp do aparelho
 * com a mensagem pronta.
 */
import { useRouter } from 'next/navigation';
import { MessageCircle, Phone } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { WHATSAPP_ATIVO } from '@/lib/whatsappCliente';
import { linkWhatsappDoAparelho } from '@/lib/whatsappTelefone';

type Props = {
  telefone: string | null;
  nome?: string | null;
  pacienteId: string;
  clinicaId: number;
  mensagem: string;
  /** Chamado depois de abrir a ligação ou a conversa (ex.: abrir o registro do contato). */
  onContato?: (canal: 'ligacao' | 'whatsapp') => void;
  compacto?: boolean;
};

export default function ContatoRapido({ telefone, nome, pacienteId, clinicaId, mensagem, onContato, compacto }: Props) {
  const router = useRouter();
  const { showAlert } = useCustomAlert();
  const digitos = (telefone || '').replace(/\D/g, '');

  function ligar(e: React.MouseEvent) {
    e.stopPropagation();
    if (!digitos) {
      void showAlert('Paciente sem telefone cadastrado.', { type: 'warning' });
      return;
    }
    window.location.href = `tel:${digitos}`;
    onContato?.('ligacao');
  }

  function whatsapp(e: React.MouseEvent) {
    e.stopPropagation();
    if (!digitos) {
      void showAlert('Paciente sem telefone cadastrado.', { type: 'warning' });
      return;
    }
    if (!WHATSAPP_ATIVO) {
      const link = linkWhatsappDoAparelho(telefone, mensagem);
      if (!link) {
        void showAlert('O telefone do paciente não parece um número de WhatsApp.', { type: 'warning' });
        return;
      }
      const janela = window.open(link, '_blank');
      if (janela) janela.opener = null;
      else window.location.assign(link);
      onContato?.('whatsapp');
      return;
    }
    const params = new URLSearchParams({ telefone: telefone || '', clinica: String(clinicaId), texto: mensagem });
    if (nome?.trim()) params.set('nome', nome.trim());
    params.set('paciente', pacienteId);
    onContato?.('whatsapp');
    router.push(`/whatsapp?${params.toString()}`);
  }

  const classe = compacto
    ? 'inline-flex h-11 w-11 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 sm:h-8 sm:w-8'
    : 'inline-flex h-11 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:h-9';

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={ligar} className={classe} title="Ligar" aria-label="Ligar">
        <Phone size={14} />
        {!compacto && 'Ligar'}
      </button>
      <button type="button" onClick={whatsapp} className={classe} title="WhatsApp" aria-label="WhatsApp">
        <MessageCircle size={14} />
        {!compacto && 'WhatsApp'}
      </button>
    </div>
  );
}
