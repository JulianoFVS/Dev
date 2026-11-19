'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
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
import { tipoVerificavel } from '@/lib/assinaturaArquivo';
import BuscaPaciente from './BuscaPaciente';
import {
  ErroWhatsapp,
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

const MENSAGENS_RAPIDAS: TemplateComunicacao[] = [
  { id: 'rapida_ola', canal: 'whatsapp', nome: 'Olá', corpo: 'Olá {{paciente_nome}}! Aqui é da {{clinica_nome}}. Como posso ajudar?', ativo: true },
  { id: 'rapida_confirmar', canal: 'whatsapp', nome: 'Confirmar', corpo: 'Olá {{paciente_nome}}! Podemos confirmar sua consulta na {{clinica_nome}}?', ativo: true },
  { id: 'rapida_lembrete', canal: 'whatsapp', nome: 'Lembrete', corpo: 'Oi {{paciente_nome}}, passando para lembrar da sua consulta na {{clinica_nome}}. Se precisar remarcar, é só responder por aqui.', ativo: true },
  { id: 'rapida_chegou', canal: 'whatsapp', nome: 'Chegou a vez', corpo: '{{paciente_nome}}, sua vez chegou. Estamos te aguardando na recepção da {{clinica_nome}}.', ativo: true },
  { id: 'rapida_obrigado', canal: 'whatsapp', nome: 'Obrigado', corpo: 'Obrigado, {{paciente_nome}}! Qualquer dúvida, a {{clinica_nome}} está à disposição.', ativo: true },
];

type Props = {
  clinicaId: string;
  clinicaNome: string;
  rascunho: { telefone: string; texto: string; nome?: string; pacienteId?: string } | null;
  onRascunhoUsado: () => void;
  /** Avisa a página quando há conversa aberta: no celular ela ocupa a tela toda. */
  onConversaAberta?: (aberta: boolean) => void;
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
    leitor.onerror = () => reject(new ErroWhatsapp('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}

function Confirmacao({ ack }: { ack: number | null }) {
  if (ack == null || ack < 1) return <Clock size={12} className="text-white/45" />;
  if (ack === 1) return <Check size={14} className="text-white/55" />;
  return <CheckCheck size={15} className={ack >= 3 ? 'text-[#c8f053]' : 'text-white/55'} />;
}

export default function Conversas({ clinicaId, clinicaNome, rascunho, onRascunhoUsado, onConversaAberta }: Props) {
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
  const versaoMensagens = useRef(0);
  chatAberto.current = chatId;

  const aplicarMensagens = useCallback((id: string, lista: Mensagem[], versao: number) => {
    if (versao !== versaoMensagens.current || chatAberto.current !== id) return;
    setMensagens((atual) => {
      const locais = atual.filter((item) => item.id.startsWith('local-') && !lista.some((outra) => outra.deMim && outra.texto === item.texto && Math.abs(outra.em - item.em) < 60000));
      const ids = new Set(lista.map((item) => item.id));
      return [...lista, ...locais.filter((item) => !ids.has(item.id))].sort((a, b) => a.em - b.em);
    });
  }, []);

  const carregarConversas = useCallback(async () => {
    const lista = await chamarWhatsapp<Conversa[]>(urlWhatsapp(clinicaId, { acao: 'conversas' }));
    if (Array.isArray(lista)) setConversas(lista);
    setCarregando(false);
  }, [clinicaId]);

  const carregarMensagens = useCallback(async (id: string) => {
    const versao = ++versaoMensagens.current;
    const lida = typeof document !== 'undefined' && document.visibilityState === 'visible' ? '1' : '0';
    const lista = await chamarWhatsapp<Mensagem[]>(urlWhatsapp(clinicaId, { acao: 'mensagens', chat: id, lida }));
    if (Array.isArray(lista)) aplicarMensagens(id, lista, versao);
  }, [aplicarMensagens, clinicaId]);

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
    const id = window.setInterval(ciclo, 2000);
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

  useEffect(() => {
    onConversaAberta?.(chatId !== null);
  }, [chatId, onConversaAberta]);

  // Ao sair da aba, a página volta a mostrar título e abas no celular.
  useEffect(() => () => onConversaAberta?.(false), [onConversaAberta]);

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
      paciente: paciente?.id ? { id: paciente.id, nome: paciente.nome } : null,
    });
  }, [abrirConversa, clinicaId]);

  useEffect(() => {
    if (!rascunho) return;
    onRascunhoUsado();
    abrirPorTelefone(
      rascunho.telefone,
      rascunho.nome
        ? { id: rascunho.pacienteId || '', nome: rascunho.nome, telefone: rascunho.telefone }
        : null,
    )
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
    const otimista: Mensagem = {
      id: `local-${Date.now()}`,
      chatId,
      deMim: true,
      texto: corpo,
      tipo: arquivo ? 'image' : 'chat',
      temMidia: !!arquivo,
      arquivo: arquivo?.name || null,
      em: Date.now(),
      ack: 0,
    };
    setMensagens((atual) => [...atual, otimista]);
    try {
      const anexo = arquivo
        ? { mimetype: arquivo.type || 'application/octet-stream', data: await lerBase64(arquivo), nome: arquivo.name }
        : null;
      const aberta = conversas.find((item) => item.id === chatId) || avulso;
      const resposta = await chamarWhatsapp<{ ok?: boolean; chatId?: string }>('/api/whatsapp', {
        clinicaId,
        acao: 'enviar',
        chatId,
        telefone: aberta?.telefone || null,
        texto: corpo,
        arquivo: anexo,
      });
      const aberto = resposta.chatId || chatId;
      if (aberto !== chatId) {
        chatAberto.current = aberto;
        setChatId(aberto);
        setAvulso((item) => (item ? { ...item, id: aberto } : item));
      }
      setTexto('');
      setArquivo(null);
      await carregarMensagens(aberto);
      void carregarConversas();
    } catch (err) {
      const mensagem = mensagemDeErro(err, 'Não foi possível enviar.');
      let apareceu = false;
      try {
        const lida = document.visibilityState === 'visible' ? '1' : '0';
        const lista = await chamarWhatsapp<Mensagem[]>(urlWhatsapp(clinicaId, { acao: 'mensagens', chat: chatId, lida }));
        if (Array.isArray(lista)) {
          aplicarMensagens(chatId, lista, versaoMensagens.current);
          apareceu = lista.some((item) => item.deMim && item.texto === corpo && Date.now() - item.em < 20000);
        }
      } catch {
        // Mantém a conversa que já estava na tela.
      }
      if (apareceu) {
        setTexto('');
        setArquivo(null);
        setErro('');
      } else {
        setMensagens((atual) => atual.filter((item) => item.id !== otimista.id));
        setErro(mensagem);
      }
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
    if (!tipoVerificavel(escolhido.type)) {
      setErro('Envie imagem, PDF, Word, Excel, áudio ou vídeo.');
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
    }).replace(/\{\{[^}]+\}\}/g, '').replace(/[ ]{2,}/g, ' ').replace(/\s+([,!.?])/g, '$1').trim();
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

  // Celular: a lista e a conversa são duas telas. Com a conversa aberta o quadro
  // perde a moldura e encosta nas bordas; no computador os dois painéis ficam lado a lado.
  const moldura = chatId
    ? 'lg:rounded-[1.5rem] lg:border lg:border-black/[0.06] lg:shadow-[0_8px_30px_rgba(17,27,33,0.06)]'
    : 'rounded-[1.5rem] border border-black/[0.06] shadow-[0_8px_30px_rgba(17,27,33,0.06)]';
  const filtroLista = 'inline-flex h-10 items-center rounded-full px-4 lg:h-auto lg:px-3 lg:py-1';

  return (
    <div className={`grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white lg:grid-cols-[22rem_1fr] ${moldura}`}>
      <aside className={`min-h-0 flex-col border-black/[0.06] lg:flex lg:border-r ${chatId ? 'hidden' : 'flex'}`}>
        <div className="shrink-0 space-y-2 p-3">
          <div className="flex gap-2">
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg bg-[#f3f4f1] px-3">
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-800"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex gap-1.5 text-[13px] lg:text-xs">
            <button
              type="button"
              onClick={() => setSoNaoLidas(false)}
              aria-pressed={!soNaoLidas}
              className={`${filtroLista} ${!soNaoLidas ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-[#f3f4f1]'}`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setSoNaoLidas(true)}
              aria-pressed={soNaoLidas}
              className={`${filtroLista} ${soNaoLidas ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-[#f3f4f1]'}`}
            >
              Não lidas{totalNaoLidas ? ` · ${totalNaoLidas}` : ''}
            </button>
          </div>
          {/* Conversa pedida pela URL (ficha do paciente, Ajuda) que não abriu: o aviso aparece aqui, não só dentro do chat. */}
          {erro && !chatId && <p role="alert" className="px-1 text-xs text-rose-600">{erro}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          {carregando && <div className="flex justify-center py-8 text-neutral-400"><Loader2 size={18} className="animate-spin" /></div>}
          {!carregando && visiveis.length === 0 && (
            <p className="px-4 py-6 text-sm text-neutral-400">{filtro || soNaoLidas ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}</p>
          )}
          {visiveis.map((item) => {
            const nome = item.paciente?.nome || item.nome;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => abrirConversa(item.id)}
                className={`flex w-full items-center gap-3 border-l-[3px] px-3 py-3 text-left ${item.id === chatId ? 'border-neutral-900 bg-[#f3f4f1]' : 'border-transparent hover:bg-neutral-50'}`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[13px] font-semibold text-white">
                  {iniciais(nome)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2 lg:items-center">
                    {/* No celular o nome quebra em vez de cortar; a lista do computador tem largura fixa. */}
                    <span className="min-w-0 break-words text-[15px] font-medium text-neutral-900 lg:truncate">{nome}</span>
                    <span className={`shrink-0 pt-0.5 text-[11px] lg:pt-0 ${item.naoLidas ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>{quando(item.em)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-neutral-500">
                      {item.ultimaDeMim ? 'Você: ' : ''}{item.ultima || (item.grupo ? 'Grupo' : 'Conversa')}
                    </span>
                    {item.naoLidas > 0 && (
                      <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#c8f053] px-1 text-[10px] font-bold text-neutral-900">
                        {item.naoLidas}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={`min-h-0 min-w-0 flex-col bg-[#f3f4f1] ${chatId ? 'flex' : 'hidden lg:flex'}`}>
        {chatId ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white px-2 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
              <button
                type="button"
                onClick={() => { setChatId(null); setErro(''); }}
                aria-label="Voltar para a lista de conversas"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-black/[0.05] active:bg-black/[0.08] lg:hidden"
              >
                <ArrowLeft size={20} />
              </button>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                {iniciais(nomeAtual)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[15px] font-medium leading-5 text-neutral-900 lg:truncate">{nomeAtual}</p>
                <p className="truncate text-xs text-neutral-500">
                  {conversa?.grupo ? 'Grupo' : atual?.telefone ? formatarTelefone(atual.telefone) : 'WhatsApp'}
                </p>
              </div>
              {atual?.paciente && (
                <Link
                  href={`/pacientes/${atual.paciente.id}`}
                  aria-label="Ficha do paciente"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50 sm:h-8 sm:w-auto sm:px-2.5"
                >
                  <UserRound size={16} className="sm:h-3.5 sm:w-3.5" />
                  <span className="max-sm:hidden">Ficha do paciente</span>
                </Link>
              )}
            </div>

            <div
              ref={listaRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
              style={{
                backgroundColor: '#f3f4f1',
                backgroundImage: 'radial-gradient(rgba(23,23,23,0.14) 0.7px, transparent 0.7px)',
                backgroundSize: '16px 16px',
              }}
            >
              {carregandoChat && mensagens.length === 0 && (
                <div className="flex justify-center py-8 text-neutral-500"><Loader2 size={18} className="animate-spin" /></div>
              )}
              {!carregandoChat && mensagens.length === 0 && (
                <p className="mx-auto mt-8 max-w-xs rounded-lg bg-white/80 px-4 py-3 text-center text-sm text-neutral-500 shadow-sm">Nenhuma mensagem ainda. Escreva a primeira abaixo.</p>
              )}
              <div className="mx-auto flex max-w-3xl flex-col gap-1">
                {mensagens.map((msg, i) => {
                  const novoDia = i === 0 || new Date(mensagens[i - 1].em).toDateString() !== new Date(msg.em).toDateString();
                  const midia = midias[msg.id];
                  const autor = !msg.deMim && conversa?.grupo ? msg.autor : '';
                  return (
                    <div key={msg.id}>
                      {novoDia && (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-lg bg-white/90 px-3 py-1 text-[12px] font-medium text-neutral-500 shadow-sm">{rotuloDia(msg.em)}</span>
                        </div>
                      )}
                      <div className={`flex ${msg.deMim ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[min(82%,32rem)] px-2.5 py-1.5 text-[14.5px] leading-5 shadow-[0_1px_0.5px_rgba(0,0,0,0.08)] ${msg.deMim ? 'rounded-lg rounded-br-none bg-neutral-900 text-white' : 'rounded-lg rounded-bl-none bg-white text-neutral-900'}`}>
                          {autor && <p className="mb-0.5 text-[12.5px] font-semibold text-neutral-900">{autor}</p>}
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
                                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium sm:min-h-0 sm:px-2.5 ${msg.deMim ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-black/[0.05] text-neutral-900 hover:bg-black/[0.08]'}`}
                                >
                                  {midia === 'carregando' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                                  {midia === 'erro' ? 'Mídia indisponível' : msg.arquivo || rotuloMidia(msg.tipo)}
                                </button>
                              )}
                            </div>
                          )}
                          {msg.texto && <p className="whitespace-pre-wrap break-words">{msg.texto}</p>}
                          <p className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${msg.deMim ? 'text-white/55' : 'text-neutral-400'}`}>
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

            {/* O campo de escrever encosta no fim da área: a casca do celular já reserva o espaço da barra flutuante. */}
            <form onSubmit={enviar} className="relative shrink-0 bg-[#f3f4f1] px-2 pb-2 pt-2 sm:px-3 lg:pb-3">
              <div className="mb-2 hidden gap-1.5 overflow-x-auto pb-0.5 lg:flex">
                {MENSAGENS_RAPIDAS.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => usarTemplate(template)}
                    className="shrink-0 rounded-full border border-black/[0.06] bg-white px-3 py-1 text-xs font-medium text-neutral-900 shadow-sm hover:bg-neutral-100"
                  >
                    {template.nome}
                  </button>
                ))}
              </div>
              {respostasAbertas && (
                <div className="absolute bottom-full left-2 right-2 mb-2 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:left-3 sm:right-auto sm:w-96">
                  {/* Celular: as respostas rápidas ficam aqui dentro, para a faixa de botões não tirar altura da conversa. */}
                  <div className="lg:hidden">
                    {MENSAGENS_RAPIDAS.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => usarTemplate(template)}
                        className="block w-full rounded-lg px-3 py-2 text-left active:bg-neutral-50"
                      >
                        <span className="block text-sm font-medium text-neutral-900">{template.nome}</span>
                        <span className="line-clamp-2 text-xs text-neutral-500">{template.corpo}</span>
                      </button>
                    ))}
                  </div>
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
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-neutral-50 py-0.5 pl-2.5 pr-0.5 text-xs text-neutral-700 sm:px-2.5 sm:py-1.5">
                  <Paperclip size={13} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
                  <button type="button" onClick={() => setArquivo(null)} aria-label="Remover arquivo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 sm:h-auto sm:w-auto">
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setRespostasAbertas((v) => !v)}
                  aria-label="Respostas prontas"
                  aria-expanded={respostasAbertas}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${respostasAbertas ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-white'}`}
                >
                  <Zap size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => arquivoRef.current?.click()}
                  aria-label="Anexar arquivo"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-white"
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
                  className="min-h-10 min-w-0 flex-1 resize-none rounded-lg border-0 bg-white px-3 py-2.5 text-sm leading-5 text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400"
                />
                <button
                  type="submit"
                  disabled={enviando || (!texto.trim() && !arquivo)}
                  aria-label="Enviar"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
              {erro && <p className="mt-1.5 text-xs text-rose-600">{erro}</p>}
            </form>
          </>
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-2 px-6 text-center lg:flex">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#c8f053] text-neutral-900 shadow-sm">
              <MessageCircle size={28} />
            </span>
            <p className="text-lg font-medium text-neutral-900">Suas conversas</p>
            <p className="max-w-sm text-sm text-neutral-500">Escolha um contato na lista ou comece uma conversa nova pelo botão +.</p>
          </div>
        )}
      </section>

      <Modal open={novaAberta} onClose={() => setNovaAberta(false)} maxWidth="md" panelClassName="rounded-2xl bg-white">
        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          <div className="pr-8">
            <h2 className="text-base font-semibold text-neutral-900">Nova conversa</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Escolha um paciente ou digite um número.</p>
          </div>
          <BuscaPaciente clinicaId={clinicaId} onEscolher={(p) => escolherNovo(p)} autoFocus />
          <div className="flex gap-2">
            <input
              value={telefoneNovo}
              onChange={(e) => setTelefoneNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (!abrindoNova) void escolherNovo(null);
              }}
              inputMode="tel"
              aria-label="Número com DDD"
              placeholder="(11) 99999-0000"
              className="h-10 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-400"
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
