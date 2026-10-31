'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Send,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { carregarTemplatesComunicacao, montarMensagemTemplate } from '@/lib/comunicacao';
import type { TemplateComunicacao } from '@/lib/configDefaults';
import { formatarTelefone } from '@/lib/whatsappTelefone';
import BuscaPaciente from './BuscaPaciente';
import {
  chamarWhatsapp,
  iniciais,
  mensagemDeErro,
  primeiroNome,
  urlWhatsapp,
  type Conversa,
  type Mensagem,
  type Midia,
  type PacienteBusca,
} from './api';

const ARQUIVO_MAXIMO = 3 * 1024 * 1024;

type Props = {
  clinicaId: string;
  clinicaNome: string;
  rascunho: { telefone: string; texto: string } | null;
  onRascunhoUsado: () => void;
};

type ChatAvulso = { id: string; nome: string; telefone: string | null; paciente: { id: string; nome: string } | null };

function hora(ms: number) {
  return ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}

function quando(ms: number) {
  if (!ms) return '';
  const data = new Date(ms);
  const hoje = new Date();
  if (data.toDateString() === hoje.toDateString()) return hora(ms);
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (data.toDateString() === ontem.toDateString()) return 'Ontem';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function rotuloDia(ms: number) {
  const data = new Date(ms);
  const hoje = new Date();
  if (data.toDateString() === hoje.toDateString()) return 'Hoje';
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (data.toDateString() === ontem.toDateString()) return 'Ontem';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function rotuloMidia(tipo: string) {
  if (tipo === 'image' || tipo === 'sticker') return 'Ver imagem';
  if (tipo === 'audio' || tipo === 'ptt') return 'Ouvir áudio';
  if (tipo === 'video') return 'Ver vídeo';
  return 'Abrir arquivo';
}

function lerBase64(arquivo: File) {
  return new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}

function Confirmacao({ ack }: { ack: number | null }) {
  if (ack == null || ack < 1) return null;
  if (ack === 1) return <Check size={12} className="text-white/50" />;
  return <CheckCheck size={12} className={ack >= 3 ? 'text-sky-300' : 'text-white/50'} />;
}

export default function Conversas({ clinicaId, clinicaNome, rascunho, onRascunhoUsado }: Props) {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [avulso, setAvulso] = useState<ChatAvulso | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregandoChat, setCarregandoChat] = useState(false);
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [midias, setMidias] = useState<Record<string, Midia | 'carregando' | 'erro'>>({});
  const [novaAberta, setNovaAberta] = useState(false);
  const [telefoneNovo, setTelefoneNovo] = useState('');
  const [abrindoNova, setAbrindoNova] = useState(false);
  const [erroNova, setErroNova] = useState('');
  const [respostasAbertas, setRespostasAbertas] = useState(false);
  const [templates, setTemplates] = useState<TemplateComunicacao[]>([]);
  const listaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const chatAberto = useRef<string | null>(null);
  const ultimoTotal = useRef(0);
  chatAberto.current = chatId;

  const carregarConversas = useCallback(async () => {
    const lista = await chamarWhatsapp<Conversa[]>(urlWhatsapp(clinicaId, { acao: 'conversas' }));
    if (Array.isArray(lista)) setConversas(lista);
    setCarregando(false);
  }, [clinicaId]);

  const carregarMensagens = useCallback(async (id: string) => {
    const lida = typeof document !== 'undefined' && document.visibilityState === 'visible' ? '1' : '0';
    const lista = await chamarWhatsapp<Mensagem[]>(urlWhatsapp(clinicaId, { acao: 'mensagens', chat: id, lida }));
    if (chatAberto.current === id && Array.isArray(lista)) setMensagens(lista);
  }, [clinicaId]);

  useEffect(() => {
    let ativo = true;
    const ciclo = async () => {
      try {
        await carregarConversas();
        const aberto = chatAberto.current;
        if (aberto) await carregarMensagens(aberto);
      } catch {
        if (ativo) setCarregando(false);
      }
    };
    void ciclo();
    const id = window.setInterval(ciclo, 4000);
    return () => {
      ativo = false;
      window.clearInterval(id);
    };
  }, [carregarConversas, carregarMensagens]);

  useEffect(() => {
    carregarTemplatesComunicacao(clinicaId)
      .then((lista) => setTemplates(lista.filter((t) => t.canal === 'whatsapp')))
      .catch(() => setTemplates([]));
  }, [clinicaId]);

  const abrirConversa = useCallback(async (id: string, extra?: ChatAvulso | null) => {
    setChatId(id);
    setAvulso(extra || null);
    setMensagens([]);
    setErro('');
    setArquivo(null);
    setRespostasAbertas(false);
    ultimoTotal.current = 0;
    setCarregandoChat(true);
    try {
      await carregarMensagens(id);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível abrir a conversa.'));
    } finally {
      setCarregandoChat(false);
    }
  }, [carregarMensagens]);

  const abrirPorTelefone = useCallback(async (telefone: string, paciente: PacienteBusca | null) => {
    const { chatId: id } = await chamarWhatsapp<{ chatId: string }>(urlWhatsapp(clinicaId, { acao: 'resolver', telefone }));
    await abrirConversa(id, {
      id,
      nome: paciente?.nome || formatarTelefone(telefone),
      telefone,
      paciente: paciente ? { id: paciente.id, nome: paciente.nome } : null,
    });
  }, [abrirConversa, clinicaId]);

  useEffect(() => {
    if (!rascunho) return;
    onRascunhoUsado();
    abrirPorTelefone(rascunho.telefone, null)
      .then(() => {
        setTexto(rascunho.texto);
        window.setTimeout(() => campoRef.current?.focus(), 50);
      })
      .catch((err) => setErro(mensagemDeErro(err, 'Não foi possível abrir a conversa.')));
  }, [rascunho, onRascunhoUsado, abrirPorTelefone]);

  useEffect(() => {
    const el = listaRef.current;
    if (!el || mensagens.length === ultimoTotal.current) return;
    const pertoDoFim = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (ultimoTotal.current === 0 || pertoDoFim) el.scrollTop = el.scrollHeight;
    ultimoTotal.current = mensagens.length;
  }, [mensagens]);

  async function escolherNovo(paciente: PacienteBusca | null) {
    const telefone = paciente?.telefone || telefoneNovo;
    if (!telefone.replace(/\D/g, '')) return;
    setAbrindoNova(true);
    setErroNova('');
    try {
      await abrirPorTelefone(telefone, paciente);
      setNovaAberta(false);
      setTelefoneNovo('');
    } catch (err) {
      setErroNova(mensagemDeErro(err, 'Não foi possível abrir a conversa.'));
    } finally {
      setAbrindoNova(false);
    }
  }

  async function carregarMidia(msg: Mensagem) {
    setMidias((atual) => ({ ...atual, [msg.id]: 'carregando' }));
    try {
      const midia = await chamarWhatsapp<Midia>(urlWhatsapp(clinicaId, { acao: 'midia', msg: msg.id }));
      setMidias((atual) => ({ ...atual, [msg.id]: midia }));
      if (!/^(image|audio|video)\//.test(midia.mimetype)) {
        const bytes = Uint8Array.from(atob(midia.data), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: midia.mimetype }));
        const link = document.createElement('a');
        link.href = url;
        link.download = midia.nome || msg.arquivo || 'arquivo';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch {
      setMidias((atual) => ({ ...atual, [msg.id]: 'erro' }));
    }
  }

  async function enviar(evento?: React.FormEvent) {
    evento?.preventDefault();
    const corpo = texto.trim();
    if ((!corpo && !arquivo) || !chatId || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      const anexo = arquivo
        ? { mimetype: arquivo.type || 'application/octet-stream', data: await lerBase64(arquivo), nome: arquivo.name }
        : null;
      await chamarWhatsapp('/api/whatsapp', { clinicaId, acao: 'enviar', chatId, texto: corpo, arquivo: anexo });
      setTexto('');
      setArquivo(null);
      await carregarMensagens(chatId);
      void carregarConversas();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível enviar.'));
    } finally {
      setEnviando(false);
    }
  }

  function escolherArquivo(lista: FileList | null) {
    const escolhido = lista?.[0];
    if (!escolhido) return;
    if (escolhido.size > ARQUIVO_MAXIMO) {
      setErro('Arquivo grande demais (máximo 3 MB).');
      return;
    }
    setErro('');
    setArquivo(escolhido);
  }

  const conversa = conversas.find((item) => item.id === chatId) || null;
  const atual = conversa || avulso;
  const nomeAtual = atual?.paciente?.nome || atual?.nome || 'Conversa';

  function usarTemplate(template: TemplateComunicacao) {
    const textoPronto = montarMensagemTemplate(template, {
      paciente_nome: primeiroNome(atual?.paciente?.nome || atual?.nome),
      clinica_nome: clinicaNome,
    });
    setTexto((anterior) => (anterior.trim() ? `${anterior}\n${textoPronto}` : textoPronto));
    setRespostasAbertas(false);
    window.setTimeout(() => campoRef.current?.focus(), 30);
  }

  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    return conversas.filter((item) => {
      if (soNaoLidas && item.naoLidas === 0) return false;
      if (!termo) return true;
      return [item.nome, item.paciente?.nome, item.telefone].some((v) => v && v.toLowerCase().includes(termo));
    });
  }, [conversas, filtro, soNaoLidas]);

  const totalNaoLidas = conversas.reduce((soma, item) => soma + (item.naoLidas > 0 ? 1 : 0), 0);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-white lg:grid-cols-[20rem_1fr]">
      <aside className={`min-h-0 flex-col border-black/[0.06] lg:flex lg:border-r ${chatId ? 'hidden' : 'flex'}`}>
        <div className="shrink-0 space-y-2 p-3">
          <div className="flex gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-neutral-200 px-2.5">
              <Search size={14} className="shrink-0 text-neutral-400" />
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Buscar conversa"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
              />
            </div>
            <button
              type="button"
              onClick={() => { setNovaAberta(true); setErroNova(''); }}
              aria-label="Nova conversa"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white hover:bg-neutral-800"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSoNaoLidas(false)}
              className={`rounded-full px-2.5 py-1 ${!soNaoLidas ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setSoNaoLidas(true)}
              className={`rounded-full px-2.5 py-1 ${soNaoLidas ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
            >
              Não lidas{totalNaoLidas ? ` · ${totalNaoLidas}` : ''}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-2">
          {carregando && <div className="flex justify-center py-8 text-neutral-400"><Loader2 size={18} className="animate-spin" /></div>}
          {!carregando && visiveis.length === 0 && (
            <p className="px-4 py-6 text-sm text-neutral-400">{filtro || soNaoLidas ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}</p>
          )}
          {visiveis.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => abrirConversa(item.id)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-neutral-50 ${item.id === chatId ? 'bg-neutral-50' : ''}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
                {iniciais(item.paciente?.nome || item.nome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-neutral-900">{item.paciente?.nome || item.nome}</span>
                  <span className={`shrink-0 text-[11px] ${item.naoLidas ? 'font-medium text-emerald-600' : 'text-neutral-400'}`}>{quando(item.em)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-neutral-500">
                    {item.ultimaDeMim ? 'Você: ' : ''}{item.ultima || ' '}
                  </span>
                  {item.naoLidas > 0 && (
                    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                      {item.naoLidas}
                    </span>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className={`min-h-0 flex-col ${chatId ? 'flex' : 'hidden lg:flex'}`}>
        {chatId ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-black/[0.06] px-2 py-2.5 sm:px-3">
              <button type="button" onClick={() => setChatId(null)} aria-label="Voltar" className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 lg:hidden">
                <ArrowLeft size={18} />
              </button>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
                {iniciais(nomeAtual)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">{nomeAtual}</p>
                {atual?.telefone && <p className="truncate text-xs text-neutral-400">{formatarTelefone(atual.telefone)}</p>}
              </div>
              {atual?.paciente && (
                <Link
                  href={`/pacientes/${atual.paciente.id}`}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <UserRound size={14} />
                  <span className="max-sm:hidden">Ficha do paciente</span>
                </Link>
              )}
            </div>

            <div ref={listaRef} className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f5] px-3 py-3">
              {carregandoChat && mensagens.length === 0 && (
                <div className="flex justify-center py-8 text-neutral-400"><Loader2 size={18} className="animate-spin" /></div>
              )}
              {!carregandoChat && mensagens.length === 0 && (
                <p className="py-8 text-center text-sm text-neutral-400">Nenhuma mensagem. Escreva a primeira abaixo.</p>
              )}
              <div className="space-y-1.5">
                {mensagens.map((msg, i) => {
                  const novoDia = i === 0 || new Date(mensagens[i - 1].em).toDateString() !== new Date(msg.em).toDateString();
                  const midia = midias[msg.id];
                  return (
                    <div key={msg.id}>
                      {novoDia && (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-neutral-500 shadow-sm">{rotuloDia(msg.em)}</span>
                        </div>
                      )}
                      <div className={`flex ${msg.deMim ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[70%] ${msg.deMim ? 'rounded-br-md bg-neutral-900 text-white' : 'rounded-bl-md bg-white text-neutral-900 shadow-sm'}`}>
                          {msg.temMidia && (
                            <div className="mb-1">
                              {midia && midia !== 'carregando' && midia !== 'erro' && /^image\//.test(midia.mimetype) ? (
                                <img src={`data:${midia.mimetype};base64,${midia.data}`} alt="" className="max-h-72 rounded-lg" />
                              ) : midia && midia !== 'carregando' && midia !== 'erro' && /^audio\//.test(midia.mimetype) ? (
                                <audio controls src={`data:${midia.mimetype};base64,${midia.data}`} className="max-w-full" />
                              ) : midia && midia !== 'carregando' && midia !== 'erro' && /^video\//.test(midia.mimetype) ? (
                                <video controls src={`data:${midia.mimetype};base64,${midia.data}`} className="max-h-72 rounded-lg" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => carregarMidia(msg)}
                                  disabled={midia === 'carregando'}
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${msg.deMim ? 'bg-white/10 hover:bg-white/15' : 'bg-neutral-100 hover:bg-neutral-200'}`}
                                >
                                  {midia === 'carregando' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                                  {midia === 'erro' ? 'Mídia indisponível' : msg.arquivo || rotuloMidia(msg.tipo)}
                                </button>
                              )}
                            </div>
                          )}
                          {msg.texto && <p className="whitespace-pre-wrap break-words">{msg.texto}</p>}
                          <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${msg.deMim ? 'text-white/50' : 'text-neutral-400'}`}>
                            {hora(msg.em)}
                            {msg.deMim && <Confirmacao ack={msg.ack} />}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <form onSubmit={enviar} className="relative shrink-0 border-t border-black/[0.06] px-2 pb-24 pt-2 sm:px-3 lg:pb-3">
              {respostasAbertas && (
                <div className="absolute bottom-full left-2 right-2 mb-2 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:left-3 sm:right-auto sm:w-96">
                  {templates.length === 0 && <p className="px-3 py-2.5 text-sm text-neutral-400">Cadastre modelos de WhatsApp em Configurações, Comunicação.</p>}
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => usarTemplate(template)}
                      className="block w-full rounded-lg px-3 py-2 text-left hover:bg-neutral-50"
                    >
                      <span className="block text-sm font-medium text-neutral-900">{template.nome}</span>
                      <span className="line-clamp-2 text-xs text-neutral-500">{template.corpo}</span>
                    </button>
                  ))}
                </div>
              )}
              {arquivo && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">
                  <Paperclip size={13} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
                  <button type="button" onClick={() => setArquivo(null)} aria-label="Remover arquivo" className="text-neutral-400 hover:text-neutral-700">
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setRespostasAbertas((v) => !v)}
                  aria-label="Respostas prontas"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${respostasAbertas ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
                >
                  <Zap size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => arquivoRef.current?.click()}
                  aria-label="Anexar arquivo"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
                >
                  <Paperclip size={17} />
                </button>
                <input
                  ref={arquivoRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,audio/*,video/*"
                  onChange={(e) => {
                    escolherArquivo(e.target.files);
                    e.target.value = '';
                  }}
                />
                <textarea
                  ref={campoRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                  rows={Math.min(5, Math.max(1, texto.split('\n').length))}
                  placeholder={arquivo ? 'Legenda (opcional)' : 'Escreva uma mensagem'}
                  className="min-h-10 min-w-0 flex-1 resize-none rounded-md border border-neutral-200 px-3 py-2 text-sm leading-5 outline-none focus:border-neutral-400"
                />
                <button
                  type="submit"
                  disabled={enviando || (!texto.trim() && !arquivo)}
                  aria-label="Enviar"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white disabled:opacity-40"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
              {erro && <p className="mt-1.5 text-xs text-rose-600">{erro}</p>}
            </form>
          </>
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-1 text-center lg:flex">
            <p className="text-sm font-medium text-neutral-700">Escolha uma conversa</p>
            <p className="text-xs text-neutral-400">ou comece uma nova pelo botão +</p>
          </div>
        )}
      </section>

      <Modal open={novaAberta} onClose={() => setNovaAberta(false)} maxWidth="md" panelClassName="rounded-2xl bg-white">
        <div className="space-y-4 p-5">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Nova conversa</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Escolha um paciente ou digite um número.</p>
          </div>
          <BuscaPaciente clinicaId={clinicaId} onEscolher={(p) => escolherNovo(p)} autoFocus />
          <div className="flex gap-2">
            <input
              value={telefoneNovo}
              onChange={(e) => setTelefoneNovo(e.target.value)}
              inputMode="tel"
              placeholder="(11) 99999-0000"
              className="h-10 min-w-0 flex-1 rounded-md border border-neutral-200 px-3 text-sm outline-none focus:border-neutral-400"
            />
            <button
              type="button"
              onClick={() => escolherNovo(null)}
              disabled={abrindoNova || !telefoneNovo.replace(/\D/g, '')}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              {abrindoNova && <Loader2 size={14} className="animate-spin" />}
              Abrir
            </button>
          </div>
          {erroNova && <p className="text-xs text-rose-600">{erroNova}</p>}
        </div>
      </Modal>
    </div>
  );
}
