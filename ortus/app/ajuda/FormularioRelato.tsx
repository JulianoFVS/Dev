'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Bug, Lightbulb, Loader2, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useClinica } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
// Limites e rótulos são os mesmos que a rota confere.
import { RELATO_ASSUNTO_MAX, RELATO_DESCRICAO_MAX, ROTULO_TIPO_RELATO, type TipoRelato } from '@/lib/relatos';
import { enviarRelato } from './enviarRelato';

type Erros = { tipo?: string; assunto?: string; descricao?: string };

const TIPOS: { valor: TipoRelato; Icone: typeof Bug }[] = [
  { valor: 'bug', Icone: Bug },
  { valor: 'sugestao', Icone: Lightbulb },
];

const rotulo = 'mb-1.5 block text-xs font-medium text-neutral-500';
const campo = 'w-full rounded-md border bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400';
const bordaNormal = 'border-neutral-200 focus:border-neutral-900';
const bordaErro = 'border-red-500 focus:border-red-500';

type Props = {
  aberto: boolean;
  onFechar: () => void;
};

export default function FormularioRelato({ aberto, onFechar }: Props) {
  const { activeClinicId } = useClinica();
  const { showAlert } = useCustomAlert();
  // O relato leva a clínica em uso. Em "todas as clínicas" não há uma só: vai null.
  const clinicaId = activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : null;

  const [tipo, setTipo] = useState<TipoRelato | null>(null);
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const [falha, setFalha] = useState('');
  const [enviando, setEnviando] = useState(false);

  const ids = useId();
  const idTipo = `${ids}-tipo`;
  const idAssunto = `${ids}-assunto`;
  const idDescricao = `${ids}-descricao`;
  const grupoTipo = useRef<HTMLDivElement>(null);
  const campoAssunto = useRef<HTMLInputElement>(null);
  const campoDescricao = useRef<HTMLTextAreaElement>(null);
  const avisoFalha = useRef<HTMLParagraphElement>(null);
  // O estado só muda no próximo desenho; a trava segura o segundo toque que chega antes disso.
  const envioEmCurso = useRef(false);

  // Em tela baixa, ou com o teclado aberto, o erro pode nascer fora da área visível do popup.
  useEffect(() => {
    if (falha) avisoFalha.current?.scrollIntoView({ block: 'nearest' });
  }, [falha]);

  // Fechar não apaga o que foi digitado: um toque fora do popup não pode custar um texto longo.
  function fechar() {
    if (enviando) return;
    setErros({});
    setFalha('');
    onFechar();
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (envioEmCurso.current) return;

    const assuntoLimpo = assunto.trim();
    const descricaoLimpa = descricao.trim();
    const novos: Erros = {};
    if (!tipo) novos.tipo = 'Escolha se é um bug ou uma sugestão.';
    if (!assuntoLimpo) novos.assunto = 'Informe o assunto.';
    if (!descricaoLimpa) novos.descricao = tipo === 'sugestao' ? 'Descreva a sua sugestão.' : 'Descreva o que aconteceu.';
    setErros(novos);
    setFalha('');
    if (!tipo || novos.assunto || novos.descricao) {
      if (novos.tipo) grupoTipo.current?.querySelector('button')?.focus();
      else if (novos.assunto) campoAssunto.current?.focus();
      else campoDescricao.current?.focus();
      return;
    }

    envioEmCurso.current = true;
    setEnviando(true);
    const resultado = await enviarRelato({ tipo, assunto: assuntoLimpo, descricao: descricaoLimpa, clinicaId });
    envioEmCurso.current = false;
    setEnviando(false);
    if (!resultado.ok) {
      // Falhou: o popup fica aberto com o aviso, e o texto digitado continua lá.
      setFalha(resultado.erro);
      return;
    }
    setTipo(null);
    setAssunto('');
    setDescricao('');
    onFechar();
    void showAlert('Relato enviado. Ele já está na fila do suporte.', { type: 'success' });
  }

  return (
    <Modal
      open={aberto}
      onClose={fechar}
      maxWidth="lg"
      hideCloseButton
      panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]"
    >
      <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-900">Novo relato</h2>
            <p className="mt-0.5 text-sm text-neutral-500">Vai para a fila do suporte, com o seu usuário e a clínica em uso.</p>
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <span id={idTipo} className={rotulo}>
              Tipo <span className="text-red-500">*</span>
            </span>
            <div ref={grupoTipo} role="group" aria-labelledby={idTipo} className="grid grid-cols-2 gap-2">
              {TIPOS.map(({ valor, Icone }) => {
                const escolhido = tipo === valor;
                return (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={escolhido}
                    disabled={enviando}
                    onClick={() => {
                      setTipo(valor);
                      setErros((atual) => ({ ...atual, tipo: undefined }));
                    }}
                    className={`flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium sm:h-10 ${
                      escolhido
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : erros.tipo
                          ? 'border-red-500 bg-white text-neutral-700'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <Icone size={15} />
                    {ROTULO_TIPO_RELATO[valor]}
                  </button>
                );
              })}
            </div>
            {erros.tipo && <p className="mt-1 text-xs text-red-500">{erros.tipo}</p>}
          </div>

          <div>
            <label htmlFor={idAssunto} className={rotulo}>
              Assunto <span className="text-red-500">*</span>
            </label>
            <input
              id={idAssunto}
              ref={campoAssunto}
              value={assunto}
              maxLength={RELATO_ASSUNTO_MAX}
              disabled={enviando}
              onChange={(evento) => {
                setAssunto(evento.target.value);
                setErros((atual) => ({ ...atual, assunto: undefined }));
              }}
              placeholder="Resuma em uma linha"
              aria-invalid={erros.assunto ? true : undefined}
              className={`h-10 ${campo} ${erros.assunto ? bordaErro : bordaNormal}`}
            />
            {erros.assunto && <p className="mt-1 text-xs text-red-500">{erros.assunto}</p>}
          </div>

          <div>
            <label htmlFor={idDescricao} className={rotulo}>
              Descrição <span className="text-red-500">*</span>
            </label>
            <textarea
              id={idDescricao}
              ref={campoDescricao}
              value={descricao}
              maxLength={RELATO_DESCRICAO_MAX}
              disabled={enviando}
              rows={5}
              onChange={(evento) => {
                setDescricao(evento.target.value);
                setErros((atual) => ({ ...atual, descricao: undefined }));
              }}
              placeholder={tipo === 'sugestao'
                ? 'O que você gostaria que o Ortus fizesse e em que isso ajuda.'
                : 'O que você fez, o que esperava e o que aconteceu.'}
              aria-invalid={erros.descricao ? true : undefined}
              className={`resize-none py-2 ${campo} ${erros.descricao ? bordaErro : bordaNormal}`}
            />
            <div className="mt-1 flex items-start justify-between gap-3 text-xs">
              {erros.descricao
                ? <p className="text-red-500">{erros.descricao}</p>
                : <p className="text-neutral-400">Não inclua dados de pacientes.</p>}
              <span className="shrink-0 tabular-nums text-neutral-400">{descricao.length}/{RELATO_DESCRICAO_MAX}</span>
            </div>
          </div>

          {falha && (
            <p ref={avisoFalha} role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{falha}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-black/5 px-4 py-3 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={fechar}
            disabled={enviando}
            className="h-10 rounded-md px-3 text-sm font-medium text-neutral-500 hover:text-neutral-900 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {enviando && <Loader2 size={16} className="animate-spin" />}
            Enviar
          </button>
        </div>
      </form>
    </Modal>
  );
}
