'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { dados as tabelas, usuarioDaSessao } from '@/lib/local/consulta';
import { fetchUserClinicas, fetchUserEquipe, type ProfissionalEquipe } from '@/lib/clinicScoped';
import { inserir, lerSessaoCacheUI, listar, modoDados } from '@/lib/local/cliente';
import { useClinica } from '@/app/context/ClinicaContext';
import { fraseDeErro } from '@/lib/fraseDeErro';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarAgendamentoCompleto } from '@/lib/horarioProfissional';
import CustomSelect from '@/components/ui/CustomSelect';
import CampoData from '@/components/ui/CampoData';
import CampoHora from '@/components/ui/CampoHora';
import Modal from '@/components/ui/Modal';
import ProcedureCombobox from '@/components/forms/ProcedureCombobox';
import { tratamentosVisiveis, valorNaAgenda, type LinhaPreco, type PlanoTipo } from '@/lib/precoTratamento';

type PacienteOpcao = { id: string | number; nome: string; clinica_id?: string | number | null; telefone?: string | null; email?: string | null; plano_id?: string | null };

type PerfilSessaoLocal = {
  id?: string | number | null;
  nivel_acesso?: string | null;
  is_super_admin?: boolean | null;
};

/**
 * Administrador nesta clínica: dono da plataforma, ou perfil admin que não entrou por convite.
 * Quem é convidado é membro comum na clínica que convidou (mesma regra da Agenda e do banco).
 */
function nivelEfetivo(nivel: unknown, superAdmin: unknown, convidado: boolean): string {
  if (superAdmin === true) return 'admin';
  if (nivel === 'admin' && !convidado) return 'admin';
  return typeof nivel === 'string' && nivel && nivel !== 'admin' ? nivel : 'comum';
}


type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  pacienteId?: string;
  pacienteNome?: string;
  clinicaId?: string;
  procedimento?: string;
  observacoes?: string;
  data?: string;
};

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${mes}-${dia}`;
}

const inputClass = 'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';

export default function ModalNovoAgendamento({
  open,
  onClose,
  onSaved,
  pacienteId = '',
  pacienteNome = '',
  clinicaId,
  procedimento = '',
  observacoes = '',
  data,
}: Props) {
  const { activeClinicId, clinics: clinicasContexto, convidadoAqui } = useClinica();
  const { showAlert } = useCustomAlert();
  const clinicaTravada = !!activeClinicId && activeClinicId !== 'all';
  const [clinicas, setClinicas] = useState<{ id: string | number; nome: string; telefone?: string | null }[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalEquipe[]>([]);
  const [pacientes, setPacientes] = useState<PacienteOpcao[]>([]);
  const [tratamentos, setTratamentos] = useState<{ id: string | number; nome: string; valor_sugerido?: number | string | null; especialidade_id?: string | null }[]>([]);
  const [planosPreco, setPlanosPreco] = useState<PlanoTipo[]>([]);
  const [linhasPreco, setLinhasPreco] = useState<LinhaPreco[]>([]);
  const [especialidades, setEspecialidades] = useState<{ id: string; nome: string }[]>([]);
  const [nivel, setNivel] = useState<string>('admin');
  const [meuProfissionalId, setMeuProfissionalId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const [modoLocal, setModoLocal] = useState(false);
  const [form, setForm] = useState({
    clinica_id: '',
    profissional_id: '',
    paciente_id: '',
    date: '',
    time: '08:00',
    title: '',
    /** Procedimento escolhido no catálogo (o funil de oportunidades reconhece avaliações por ele). */
    tratamento_base_id: '',
    valor: '0',
    desconto: '0',
    observacoes: '',
  });
  const [pacienteVisto, setPacienteVisto] = useState(pacienteId);
  if (open && pacienteId !== pacienteVisto) {
    setPacienteVisto(pacienteId);
    setForm((atual) => ({ ...atual, paciente_id: pacienteId }));
    setPacientes((lista) => {
      if (lista.some((p) => String(p.id) === String(pacienteId))) {
        return lista.map((p) => String(p.id) === String(pacienteId) ? { ...p, nome: pacienteNome || p.nome } : p);
      }
      return [{ id: pacienteId, nome: pacienteNome || 'Paciente', clinica_id: clinicaId || '' }, ...lista];
    });
  }

  useEffect(() => {
    let ativo = true;
    modoDados().then((modo) => { if (ativo) setModoLocal(modo === 'local'); }).catch(() => undefined);
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    const hoje = isoLocal(new Date());
    const dataSugerida = data && data >= hoje ? data : hoje;
    const clinicaInicial = clinicaTravada ? String(activeClinicId) : (clinicaId || '');
    setForm((atual) => ({
      ...atual,
      clinica_id: clinicaInicial || atual.clinica_id,
      paciente_id: pacienteId,
      date: dataSugerida,
      title: procedimento,
      observacoes,
    }));
    if (pacienteId) {
      setPacientes((lista) => {
        const jaExiste = lista.some((p) => String(p.id) === String(pacienteId));
        if (jaExiste) return lista.map((p) => String(p.id) === String(pacienteId) ? { ...p, nome: pacienteNome || p.nome } : p);
        return [{ id: pacienteId, nome: pacienteNome || 'Paciente', clinica_id: clinicaInicial }, ...lista];
      });
    }

    async function carregar() {
      const modo = await modoDados();
      let listaClinicas: { id: string | number; nome: string }[] = [];
      let equipe: ProfissionalEquipe[] = [];
      let nivelAtual = 'admin';
      let profAtual = '';

      if (modo === 'local') {
        try {
          const cache = await lerSessaoCacheUI();
          const perfil = cache?.perfil as PerfilSessaoLocal | null | undefined;
          nivelAtual = nivelEfetivo(typeof perfil?.nivel_acesso === 'string' ? perfil.nivel_acesso : 'admin', perfil?.is_super_admin, convidadoAqui);
          profAtual = nivelAtual !== 'admin' && perfil?.id != null ? String(perfil.id) : '';
          listaClinicas = clinicasContexto.length > 0
            ? clinicasContexto.map((c) => ({ id: c.id, nome: c.nome }))
            : (cache?.clinicas || []);
          equipe = await fetchUserEquipe();
        } catch (erro) {
          if (!cancelado) {
            await showAlert(fraseDeErro(erro, 'Não foi possível carregar os dados da agenda.'), { type: 'error' });
          }
          return;
        }
      } else {
        const [user, clinicasNuvem, equipeNuvem] = await Promise.all([
          usuarioDaSessao(),
          fetchUserClinicas(),
          fetchUserEquipe(),
        ]);
        listaClinicas = clinicasNuvem;
        equipe = equipeNuvem;
        if (user) {
          const { data: prof } = await tabelas.from('profissionais').select('id, nivel_acesso, is_super_admin').eq('user_id', user.id).maybeSingle();
          if (prof) {
            nivelAtual = nivelEfetivo(prof.nivel_acesso || 'admin', prof.is_super_admin, convidadoAqui);
            profAtual = nivelAtual !== 'admin' ? String(prof.id) : '';
          }
        }
      }

      if (cancelado) return;
      setNivel(nivelAtual);
      setMeuProfissionalId(profAtual);
      setClinicas(listaClinicas);
      setProfissionais(equipe);
      setForm({
        clinica_id: clinicaInicial || (listaClinicas[0] ? String(listaClinicas[0].id) : ''),
        profissional_id: profAtual,
        paciente_id: pacienteId,
        date: dataSugerida,
        time: '08:00',
        title: procedimento,
        tratamento_base_id: '',
        valor: '0',
        desconto: '0',
        observacoes,
      });
    }

    carregar();
    return () => { cancelado = true; };
  }, [open, pacienteId, pacienteNome, clinicaId, procedimento, observacoes, data, clinicaTravada, activeClinicId, clinicasContexto, convidadoAqui]);

  useEffect(() => {
    if (!open || !form.clinica_id) return;
    let cancelado = false;
    async function carregarClinica() {
      const modo = await modoDados();
      if (modo === 'local') {
        // Pacientes primeiro: é o que a recepção precisa offline.
        let lista: PacienteOpcao[];
        try {
          lista = await listar<PacienteOpcao>('pacientes', {
            filtros: [{ col: 'clinica_id', op: 'eq', valor: form.clinica_id }],
            ordem: [{ col: 'nome', asc: true }],
          });
        } catch (erro) {
          if (!cancelado) {
            setPacientes([]);
            await showAlert(fraseDeErro(erro, 'Não foi possível carregar os pacientes.'), { type: 'error' });
          }
          return;
        }
        if (cancelado) return;
        if (pacienteId && !lista.some((p) => String(p.id) === String(pacienteId))) {
          lista.unshift({ id: pacienteId, nome: pacienteNome || 'Paciente', clinica_id: form.clinica_id });
        }
        setPacientes(lista);

        // O catálogo de tratamentos/planos não está no SQLite local: tenta a
        // nuvem quando há conexão; offline o procedimento vira texto livre.
        try {
          const [tr, esp, planos, linhas] = await Promise.all([
            tabelas.from('tratamentos_base').select('id, nome, valor_sugerido, especialidade_id').eq('clinica_id', form.clinica_id).eq('ativo', true).order('nome'),
            tabelas.from('especialidades').select('id, nome').eq('clinica_id', Number(form.clinica_id)).eq('ativo', true).order('nome'),
            tabelas.from('planos').select('id, tipo').eq('clinica_id', Number(form.clinica_id)),
            tabelas.from('planos_tratamentos').select('plano_id, tratamento_id, valor, ativo').eq('clinica_id', Number(form.clinica_id)),
          ]);
          if (cancelado) return;
          setTratamentos(tr.data || []);
          setPlanosPreco((planos.data || []) as PlanoTipo[]);
          setLinhasPreco((linhas.data || []) as LinhaPreco[]);
          setEspecialidades((esp.data || []) as { id: string; nome: string }[]);
        } catch {
          /* catálogo complementar indisponível: o procedimento livre resolve */
        }
        return;
      }

      const [tr, esp, pac, planos, linhas] = await Promise.all([
        tabelas.from('tratamentos_base').select('id, nome, valor_sugerido, especialidade_id').eq('clinica_id', form.clinica_id).eq('ativo', true).order('nome'),
        tabelas.from('especialidades').select('id, nome').eq('clinica_id', Number(form.clinica_id)).eq('ativo', true).order('nome'),
        tabelas.from('pacientes').select('id, nome, clinica_id, telefone, plano_id').eq('clinica_id', form.clinica_id).order('nome'),
        tabelas.from('planos').select('id, tipo').eq('clinica_id', Number(form.clinica_id)),
        tabelas.from('planos_tratamentos').select('plano_id, tratamento_id, valor, ativo').eq('clinica_id', Number(form.clinica_id)),
      ]);
      if (cancelado) return;
      setTratamentos(tr.data || []);
      setPlanosPreco((planos.data || []) as PlanoTipo[]);
      setLinhasPreco((linhas.data || []) as LinhaPreco[]);
      setEspecialidades((esp.data || []) as { id: string; nome: string }[]);
      const lista = (pac.data || []) as PacienteOpcao[];
      if (pacienteId && !lista.some((p) => String(p.id) === String(pacienteId))) {
        lista.unshift({ id: pacienteId, nome: pacienteNome || 'Paciente', clinica_id: form.clinica_id });
      }
      setPacientes(lista);
    }
    carregarClinica();
    return () => { cancelado = true; };
  }, [open, form.clinica_id, pacienteId, pacienteNome]);

  const profissionaisDaClinica = profissionais.filter((p) => p.clinicas?.some((c) => String(c.id) === String(form.clinica_id)));
  const planoDoPaciente = (() => {
    const pac = pacientes.find((p) => String(p.id) === String(form.paciente_id));
    if (!pac?.plano_id) return null;
    return planosPreco.find((p) => p.id === pac.plano_id) ?? null;
  })();
  const tratamentosAgenda = tratamentosVisiveis(tratamentos, planoDoPaciente, linhasPreco);

  // A checagem de horário vai ao servidor antes de o botão travar: um segundo
  // toque nesse intervalo gravaria o agendamento duas vezes.
  async function salvar() {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    try {
      await gravar();
    } finally {
      salvandoRef.current = false;
    }
  }

  async function gravar() {
    if (!form.title || !form.paciente_id || !form.clinica_id || !form.date || !form.time) {
      await showAlert('Preencha clínica, paciente, data, hora e procedimento.', { type: 'warning' });
      return;
    }
    if (form.profissional_id) {
      const erroHorario = await validarAgendamentoCompleto({
        clinicaId: form.clinica_id,
        profissionalId: form.profissional_id,
        date: form.date,
        time: form.time,
      });
      if (erroHorario) {
        await showAlert(erroHorario, { type: 'warning' });
        return;
      }
    }
    setSalvando(true);
    const modo = await modoDados();
    const valor = parseFloat(form.valor) || 0;
    const desconto = parseFloat(form.desconto) || 0;
    const dados = {
      paciente_id: form.paciente_id,
      clinica_id: form.clinica_id,
      profissional_id: form.profissional_id || null,
      data_hora: new Date(`${form.date}T${form.time}:00`).toISOString(),
      procedimento: form.title,
      tratamento_base_id: form.tratamento_base_id ? Number(form.tratamento_base_id) : null,
      cor: 'blue',
      valor,
      desconto,
      valor_final: valor - desconto,
      observacoes: form.observacoes,
      status: 'agendado',
    };
    try {
      if (modo === 'local') {
        await inserir('agendamentos', { ...dados, duracao_minutos: 60 });
      } else {
        const { error } = await tabelas.from('agendamentos').insert([dados]);
        if (error) {
          const texto = String(error.message || '');
          await showAlert(
            /Assinatura suspensa/.test(texto)
              ? texto
              : /paciente não pertence/i.test(texto)
                ? 'Este paciente não é desta clínica. Escolha um paciente da clínica selecionada.'
                : 'Não foi possível agendar agora. Confira os dados e tente de novo.',
            { type: 'error' },
          );
          return;
        }
      }
    } catch (erro) {
      await showAlert(fraseDeErro(erro, 'Não foi possível agendar agora. Tente de novo.'), { type: 'error' });
      return;
    } finally {
      setSalvando(false);
    }
    window.dispatchEvent(new CustomEvent('ortus:agenda-changed'));
    onClose();
    onSaved?.();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="lg"
      hideCloseButton
      zIndex={80}
      /* Celular: folha de largura inteira presa embaixo, com a altura da área visível (dvh) para o rodapé
         com o Salvar não ficar atrás da barra do navegador. No computador vale o máximo padrão do Modal. */
      className="max-sm:p-0"
      panelClassName="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh] max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Novo agendamento</h2>
          <p className="mt-0.5 text-xs font-medium text-neutral-400">Paciente, horário e procedimento.</p>
        </div>
        <button type="button" onClick={onClose} className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 sm:m-0 md:h-auto md:w-auto md:p-2" aria-label="Fechar"><X size={18} /></button>
      </div>
      {/* Só o miolo rola; cabeçalho e rodapé ficam fixos. No celular cada campo ocupa a linha inteira. */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Clínica <span className="text-red-500">*</span></label>
            <CustomSelect
              value={form.clinica_id}
              onChange={(v) => setForm((p) => ({ ...p, clinica_id: v, profissional_id: nivel !== 'admin' ? meuProfissionalId : '' }))}
              disabled={clinicaTravada}
              options={clinicas.map((c) => ({ value: String(c.id), label: c.nome }))}
              placeholder="Selecione..."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Profissional</label>
            <CustomSelect
              value={form.profissional_id}
              onChange={(v) => setForm((p) => ({ ...p, profissional_id: v }))}
              disabled={nivel !== 'admin'}
              options={profissionaisDaClinica.map((p) => ({ value: String(p.id), label: p.nome }))}
              placeholder="Qualquer um..."
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Paciente <span className="text-red-500">*</span></label>
          <CustomSelect
            value={form.paciente_id}
            onChange={(v) => {
              const pac = pacientes.find((p) => String(p.id) === String(v));
              const plano = pac?.plano_id ? planosPreco.find((item) => item.id === pac.plano_id) ?? null : null;
              const tratamento = tratamentos.find((item) => item.nome === form.title);
              const preco = valorNaAgenda(tratamento, plano, linhasPreco);
              setForm((p) => ({ ...p, paciente_id: v, valor: preco ?? p.valor }));
            }}
            options={pacientes.map((p) => ({ value: String(p.id), label: p.nome }))}
            placeholder={pacienteNome || 'Selecione...'}
            searchable
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Data <span className="text-red-500">*</span></label>
            <CampoData value={form.date} onChange={(v) => setForm((p) => ({ ...p, date: v }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Hora <span className="text-red-500">*</span></label>
            <CampoHora value={form.time} onChange={(v) => setForm((p) => ({ ...p, time: v }))} passo={30} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Procedimento <span className="text-red-500">*</span></label>
          {modoLocal && form.clinica_id && tratamentosAgenda.length === 0 ? (
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value, tratamento_base_id: '' }))}
              className={`${inputClass} placeholder:text-neutral-400`}
              placeholder="Digite o procedimento"
            />
          ) : (
            <ProcedureCombobox
              clinicaId={form.clinica_id}
              especialidades={especialidades}
              tratamentos={tratamentosAgenda}
              value={form.title}
              onChange={(nome, t) => {
                const preco = valorNaAgenda(t, planoDoPaciente, linhasPreco);
                setForm((p) => ({ ...p, title: nome, tratamento_base_id: t ? String(t.id) : '', valor: preco ?? p.valor }));
              }}
              disabled={!form.clinica_id}
            />
          )}
        </div>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Valor (R$)</label>
            <input type="number" step="1" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} className={`${inputClass} placeholder:text-neutral-400`} placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Desconto (R$)</label>
            <input type="number" step="1" value={form.desconto} onChange={(e) => setForm((p) => ({ ...p, desconto: e.target.value }))} className={`${inputClass} placeholder:text-neutral-400`} placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Total</label>
            <p className="flex h-10 items-center text-sm font-medium text-neutral-900">R$ {(parseFloat(form.valor || '0') - parseFloat(form.desconto || '0')).toFixed(2)}</p>
          </div>
        </div>
      </div>
      {/* Celular: os dois botões dividem a largura inteira, com 44px de altura. */}
      <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-black/5 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:items-center sm:justify-end sm:px-6 sm:py-4">
        <button type="button" onClick={onClose} className="h-11 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:text-neutral-900 sm:h-10 sm:border-0 sm:text-neutral-500">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 sm:h-10">
          {salvando && <Loader2 className="animate-spin" size={16} />} Salvar
        </button>
      </div>
    </Modal>
  );
}
