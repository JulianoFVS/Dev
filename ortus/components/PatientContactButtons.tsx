'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { abrirComunicacaoCliente, montarMensagemEvento, type EventoComunicacao } from '@/lib/comunicacao';
import type { DocumentoContexto } from '@/lib/documentVariables';
import { WHATSAPP_ATIVO } from '@/lib/whatsappCliente';
import { linkWhatsappDoAparelho } from '@/lib/whatsappTelefone';

type Variant = 'icons' | 'buttons' | 'row';

// Paleta da variante de pílulas: WhatsApp escuro; e-mail e SMS claros com contorno.
// O contorno é ring inset, e não border, para não somar 2px à altura automática da variante row.
const CANAL_ESCURO = 'bg-neutral-900 text-white hover:bg-neutral-800';
const CANAL_CLARO = 'bg-white text-neutral-800 ring-1 ring-inset ring-black/10 hover:bg-neutral-50';

type Props = {
  variant?: Variant;
  telefone?: string | null;
  email?: string | null;
  nome?: string | null;
  pacienteId?: string | number | null;
  clinicaId?: string | number | null;
  evento?: EventoComunicacao;
  contexto?: Partial<DocumentoContexto>;
  className?: string;
  onEnviado?: (canal: 'whatsapp' | 'email' | 'sms') => void;
  /** Canais exibidos — padrão todos */
  channels?: Array<'whatsapp' | 'email' | 'sms'>;
};

export default function PatientContactButtons({
  variant = 'icons',
  telefone,
  email,
  nome,
  pacienteId,
  clinicaId,
  evento = 'pos_consulta',
  contexto = {},
  className = '',
  onEnviado,
  channels = ['whatsapp', 'email', 'sms'],
}: Props) {
  const [loading, setLoading] = useState<'whatsapp' | 'email' | 'sms' | null>(null);
  const [legenda, setLegenda] = useState<'whatsapp' | 'email' | 'sms' | null>(null);
  const router = useRouter();
  const { showAlert } = useCustomAlert();

  async function enviar(canal: 'whatsapp' | 'email' | 'sms') {
    if (!clinicaId) {
      void showAlert('Selecione uma clínica para usar os templates de comunicação.', { type: 'warning' });
      return;
    }
    if (canal === 'email' && !email?.trim()) {
      void showAlert('Paciente sem e-mail cadastrado.', { type: 'warning' });
      return;
    }
    if ((canal === 'whatsapp' || canal === 'sms') && !telefone?.replace(/\D/g, '')) {
      void showAlert('Paciente sem telefone cadastrado.', { type: 'warning' });
      return;
    }

    setLoading(canal);
    try {
      if (canal === 'whatsapp') {
        let mensagem = '';
        try {
          mensagem = (await montarMensagemEvento(clinicaId, evento, 'whatsapp', contexto)).mensagem || '';
        } catch {
          mensagem = '';
        }
        if (!WHATSAPP_ATIVO) {
          // A aba do WhatsApp está desligada neste endereço (NEXT_PUBLIC_WHATSAPP_ATIVO=0):
          // a conversa abre no WhatsApp do próprio aparelho, com a mensagem pronta.
          const link = linkWhatsappDoAparelho(telefone, mensagem);
          if (!link) {
            void showAlert('O telefone do paciente não parece um número de WhatsApp.', { type: 'warning' });
            return;
          }
          const janela = window.open(link, '_blank');
          if (janela) janela.opener = null;
          // Bloqueio de pop-up (comum no iPhone): abre na mesma aba em vez de não fazer nada.
          else window.location.assign(link);
          onEnviado?.(canal);
          return;
        }
        const params = new URLSearchParams({ telefone: telefone || '', clinica: String(clinicaId) });
        if (mensagem) params.set('texto', mensagem);
        if (nome?.trim()) params.set('nome', nome.trim());
        if (pacienteId) params.set('paciente', String(pacienteId));
        router.push(`/whatsapp?${params.toString()}`);
        onEnviado?.(canal);
        return;
      }
      const ok = await abrirComunicacaoCliente(canal, { telefone, email }, clinicaId, evento, contexto);
      if (!ok) {
        void showAlert(canal === 'email' ? 'Não foi possível abrir o e-mail.' : 'Não foi possível abrir a mensagem.', { type: 'error' });
        return;
      }
      onEnviado?.(canal);
    } finally {
      setLoading(null);
    }
  }

  // 40px até o md; do md em diante, 38px. No toque o navegador simula o mouseenter e a legenda
  // ficaria presa na tela: ela só abre quando o aparelho tem mouse de verdade.
  const iconBtn = (canal: 'whatsapp' | 'email' | 'sms', Icon: typeof MessageCircle, color: string, title: string) => (
    <span
      key={canal}
      className="relative inline-flex"
      onMouseEnter={() => { if (window.matchMedia('(hover: hover)').matches) setLegenda(canal); }}
      onMouseLeave={() => setLegenda(null)}
    >
      <button
        type="button"
        onClick={() => enviar(canal)}
        onPointerDown={() => setLegenda(null)}
        disabled={!!loading}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-sm transition-colors disabled:opacity-50 md:h-[38px] md:w-[38px] ${color}`}
        aria-label={title}
      >
        {loading === canal ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
      </button>
      {legenda === canal && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white">
          {title}
        </span>
      )}
    </span>
  );

  if (variant === 'icons') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {channels.includes('whatsapp') && iconBtn('whatsapp', MessageCircle, CANAL_ESCURO, 'WhatsApp')}
        {channels.includes('email') && iconBtn('email', Mail, CANAL_CLARO, 'E-mail')}
        {channels.includes('sms') && iconBtn('sms', Smartphone, CANAL_CLARO, 'SMS')}
      </div>
    );
  }

  // 40px até o md (celular e tablet em pé); do md em diante volta à altura do texto (28px).
  const rowBtn = (canal: 'whatsapp' | 'email' | 'sms', label: string, Icon: typeof MessageCircle, styles: string) => (
    <button
      key={canal}
      type="button"
      onClick={() => enviar(canal)}
      disabled={!!loading}
      className={`flex h-10 items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 md:h-auto ${styles}`}
    >
      {loading === canal ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  );

  if (variant === 'row') {
    return (
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {rowBtn('whatsapp', 'WhatsApp', MessageCircle, CANAL_ESCURO)}
        {rowBtn('email', 'E-mail', Mail, CANAL_CLARO)}
        {rowBtn('sms', 'SMS', Smartphone, CANAL_CLARO)}
      </div>
    );
  }

  // No celular os botões são só o ícone, com 40px de toque; do sm em diante voltam a ter texto e 32px.
  const pill = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 max-sm:w-10 sm:h-8 sm:px-3';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <button type="button" onClick={() => enviar('whatsapp')} disabled={!!loading} aria-label="WhatsApp" className={`${pill} bg-neutral-900 text-white hover:bg-neutral-800`}>
        {loading === 'whatsapp' ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
        <span className="max-sm:hidden">WhatsApp</span>
      </button>
      <button type="button" onClick={() => enviar('email')} disabled={!!loading} aria-label="E-mail" className={`${pill} border border-black/10 bg-white text-neutral-800 hover:bg-neutral-50`}>
        {loading === 'email' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
        <span className="max-sm:hidden">E-mail</span>
      </button>
      <button type="button" onClick={() => enviar('sms')} disabled={!!loading} aria-label="SMS" className={`${pill} border border-black/10 bg-white text-neutral-800 hover:bg-neutral-50`}>
        {loading === 'sms' ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
        <span className="max-sm:hidden">SMS</span>
      </button>
    </div>
  );
}
