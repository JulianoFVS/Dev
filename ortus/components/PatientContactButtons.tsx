'use client';

import { useState } from 'react';
import { Loader2, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { abrirComunicacaoCliente, type EventoComunicacao } from '@/lib/comunicacao';
import type { DocumentoContexto } from '@/lib/documentVariables';

type Variant = 'icons' | 'buttons' | 'row';

type Props = {
  variant?: Variant;
  telefone?: string | null;
  email?: string | null;
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
  clinicaId,
  evento = 'pos_consulta',
  contexto = {},
  className = '',
  onEnviado,
  channels = ['whatsapp', 'email', 'sms'],
}: Props) {
  const [loading, setLoading] = useState<'whatsapp' | 'email' | 'sms' | null>(null);

  async function enviar(canal: 'whatsapp' | 'email' | 'sms') {
    if (!clinicaId) {
      alert('Selecione uma clínica para usar os templates de comunicação.');
      return;
    }
    if (canal === 'email' && !email?.trim()) {
      alert('Paciente sem e-mail cadastrado.');
      return;
    }
    if ((canal === 'whatsapp' || canal === 'sms') && !telefone?.replace(/\D/g, '')) {
      alert('Paciente sem telefone cadastrado.');
      return;
    }

    setLoading(canal);
    try {
      const ok = await abrirComunicacaoCliente(canal, { telefone, email }, clinicaId, evento, contexto);
      if (!ok) {
        alert(canal === 'email' ? 'Não foi possível abrir o e-mail.' : 'Não foi possível abrir a mensagem.');
        return;
      }
      onEnviado?.(canal);
    } finally {
      setLoading(null);
    }
  }

  const iconBtn = (canal: 'whatsapp' | 'email' | 'sms', Icon: typeof MessageCircle, color: string, title: string) => (
    <button
      key={canal}
      type="button"
      onClick={() => enviar(canal)}
      disabled={!!loading}
      className={`p-2.5 rounded-xl text-white transition-colors shadow-sm disabled:opacity-50 ${color}`}
      title={title}
      aria-label={title}
    >
      {loading === canal ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
    </button>
  );

  if (variant === 'icons') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {channels.includes('whatsapp') && iconBtn('whatsapp', MessageCircle, 'bg-green-500 hover:bg-green-600', 'WhatsApp')}
        {channels.includes('email') && iconBtn('email', Mail, 'bg-blue-600 hover:bg-blue-700', 'E-mail')}
        {channels.includes('sms') && iconBtn('sms', Smartphone, 'bg-slate-600 hover:bg-slate-700', 'SMS')}
      </div>
    );
  }

  const rowBtn = (canal: 'whatsapp' | 'email' | 'sms', label: string, Icon: typeof MessageCircle, styles: string) => (
    <button
      key={canal}
      type="button"
      onClick={() => enviar(canal)}
      disabled={!!loading}
      className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${styles}`}
    >
      {loading === canal ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  );

  if (variant === 'row') {
    return (
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {rowBtn('whatsapp', 'WhatsApp', MessageCircle, 'bg-emerald-600 text-white hover:bg-emerald-700')}
        {rowBtn('email', 'E-mail', Mail, 'bg-blue-600 text-white hover:bg-blue-700')}
        {rowBtn('sms', 'SMS', Smartphone, 'bg-slate-600 text-white hover:bg-slate-700')}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button type="button" onClick={() => enviar('whatsapp')} disabled={!!loading} className="px-4 py-2 bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 transition-colors flex items-center gap-2 shadow-lg shadow-green-200 disabled:opacity-50">
        {loading === 'whatsapp' ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
        WhatsApp
      </button>
      <button type="button" onClick={() => enviar('email')} disabled={!!loading} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg shadow-blue-200 disabled:opacity-50">
        {loading === 'email' ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
        E-mail
      </button>
      <button type="button" onClick={() => enviar('sms')} disabled={!!loading} className="px-4 py-2 bg-slate-600 text-white rounded-xl font-bold text-sm hover:bg-slate-700 transition-colors flex items-center gap-2 shadow-lg shadow-slate-200 disabled:opacity-50">
        {loading === 'sms' ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
        SMS
      </button>
    </div>
  );
}
