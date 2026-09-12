'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, LayoutGrid, List as ListIcon, User, Phone, Edit, Trash2, Activity, Loader2, ChevronRight, Building2, Download, Filter, AlertCircle, Calendar, Clock, X, Smile } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePatientActionModal } from '@/components/PatientActionModal';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import CustomSelect from '@/components/ui/CustomSelect';
import PatientContactButtons from '@/components/PatientContactButtons';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { buildDocumentoContexto } from '@/lib/documentVariables';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { showAlert } = useCustomAlert();
  const [visualizacao, setVisualizacao] = useState('lista');
  const [busca, setBusca] = useState('');
  
  // Filtros
  const [filtroClinica, setFiltroClinica] = useState('todas');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroDebito, setFiltroDebito] = useState(false);
  const [filtroSemConsulta, setFiltroSemConsulta] = useState<number | null>(null);
  const [filtroProcedimento, setFiltroProcedimento] = useState('');
  const [showFiltros, setShowFiltros] = useState(false);

  const router = useRouter();
  const { openQuickCapture } = usePatientActionModal();
  const { activeClinicId, loading: clinicLoading } = useClinica();

  // Sincroniza filtro de clínica com contexto global
  useEffect(() => {
      if (activeClinicId) setFiltroClinica(activeClinicId === 'all' ? 'todas' : activeClinicId);
  }, [activeClinicId]);

  const lastClinicRef = useRef<string | null>(null);

  useEffect(() => { 
      if (!clinicLoading && activeClinicId) {
          // Só recarrega se a clínica realmente mudou
          if (lastClinicRef.current === activeClinicId) return;
          lastClinicRef.current = activeClinicId;
          carregarDados();
      }
  }, [clinicLoading, activeClinicId]);

  // Atualiza a lista quando um paciente é criado/alterado em outro lugar (ex.: Quick Capture)
  useEffect(() => {
      function handle() { carregarDados(); }
      window.addEventListener('ortus:paciente-changed', handle);
      return () => window.removeEventListener('ortus:paciente-changed', handle);
  }, []);

  async function carregarDados() {
    setLoading(true);
    
    // 1. Carregar Clínicas (apenas as do usuário logado — multi-tenant)
    const listaClinicas = await fetchUserClinicas();
    setClinicas(listaClinicas);
    const idsPermitidos = listaClinicas.map((c) => c.id);

    // 2. Carregar Pacientes restritos às clínicas do usuário
    let pacientesQuery = supabase
        .from('pacientes')
        .select('*, agendamentos(data_hora, status), clinicas(nome), planos(nome, tipo), paciente_tratamentos(procedimento, status), paciente_anamneses(id), paciente_documentos(id)')
        .order('created_at', { ascending: false });
    if (idsPermitidos.length > 0) {
        // Inclui pacientes da clinica OU sem clinica vinculada (null)
        const idsStr = idsPermitidos.join(',');
        pacientesQuery = pacientesQuery.or(`clinica_id.in.(${idsStr}),clinica_id.is.null`);
    } else {
        // Sessão pode não estar pronta ainda; aguarda próximo ciclo
        setLoading(false); return;
    }
    const { data } = await pacientesQuery;
    
    if (data) {
        const formatados = data.map((p: any) => {
            const agendamentos = p.agendamentos || [];
            agendamentos.sort((a: any, b: any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
            const ultimo = agendamentos[0];
            const status = ultimo ? (new Date(ultimo.data_hora) > new Date() ? 'agendado' : 'ativo') : 'novo';
            return { ...p, status, nome_clinica: p.clinicas?.nome };
        });
        setPacientes(formatados);
    }
    setLoading(false);
  }

  function novoPaciente() {
      // Quick Capture: abre o modal de cadastro rápido. Se houver filtro de clínica ativo,
      // pré-seleciona-o para o INSERT. Após cadastrar, a UI desliza para o Hub de Ações.
      openQuickCapture(filtroClinica !== 'todas' ? filtroClinica : null);
  }

  function exportarCSV() {
      if (filtrados.length === 0) { showAlert('Nenhum paciente para exportar com os filtros atuais.', { type: 'warning' }); return; }

      const headers = [
          'ID', 'Nome', 'CPF', 'RG', 'Telefone', 'Email', 'Data Nascimento',
          'Sexo', 'Endereço', 'Clínica', 'Status', 'Cadastrado em',
          'Anamnese (resumo)', 'Medicamentos', 'Observações Clínicas',
          'Total Anamneses', 'Total Tratamentos', 'Total Documentos', 'Total Débitos'
      ];

      const escapeCSV = (val: any) => {
          if (val === null || val === undefined) return '';
          const s = String(val).replace(/"/g, '""').replace(/\r?\n/g, ' ');
          return `"${s}"`;
      };

      const rows = filtrados.map((p: any) => {
          const fm = p.ficha_medica || {};
          const condicoes = Array.isArray(fm.condicoes)
              ? fm.condicoes.join('; ')
              : ['Diabetes','Hipertensão','Cardiopatia','Asma/Bronquite','Alergia Antibiótico','Alergia Anestésico','Gestante','Fumante','Uso de Anticoagulante']
                  .filter(k => fm[k]).join('; ');
          const medicamentosStr = Array.isArray(fm.medicamentos)
              ? fm.medicamentos.join('; ')
              : (fm.medicamentos || '');
          const totalAnamneses = (p.paciente_anamneses || []).length || (fm.anamneses || []).length;
          const totalTratamentos = (p.paciente_tratamentos || []).length || (fm.tratamentos || []).length;
          const totalDocumentos = (p.paciente_documentos || []).length || (fm.documentos || []).length;
          return [
              p.id, p.nome, p.cpf, p.rg, p.telefone, p.email, p.data_nascimento,
              p.sexo, p.endereco, p.nome_clinica, p.status,
              p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '',
              condicoes,
              medicamentosStr,
              p.anamnese || '',
              totalAnamneses,
              totalTratamentos,
              totalDocumentos,
              (p.agendamentos || []).filter((a: any) => a.status === 'fiado').length,
          ].map(escapeCSV).join(',');
      });

      const bom = '\uFEFF'; // UTF-8 BOM para Excel reconhecer acentos
      const csv = bom + headers.map(escapeCSV).join(',') + '\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dataStr = new Date().toISOString().split('T')[0];
      a.download = `pacientes_${dataStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
  }

  const filtrosAtivos = filtroStatus !== 'todos' || filtroDebito || filtroSemConsulta !== null || filtroProcedimento;

  const filtrados = pacientes.filter((p: any) => {
      const bateBusca = !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.telefone || '').includes(busca) || (p.cpf || '').replace(/\D/g, '').includes(busca.replace(/\D/g, ''));
      const bateClinica = filtroClinica === 'todas' ? true : p.clinica_id == filtroClinica;
      if (!bateBusca || !bateClinica) return false;

      // Status
      if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;

      // Débito
      const temDebito = (p.agendamentos || []).some((a: any) => a.status === 'fiado');
      if (filtroDebito && !temDebito) return false;

      // Sem consulta há X dias
      if (filtroSemConsulta !== null) {
          const ags = (p.agendamentos || []).filter((a: any) => a.status === 'concluido');
          if (ags.length === 0) {
              // Nunca teve consulta — inclui
          } else {
              ags.sort((a: any, b: any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
              const dias = Math.floor((Date.now() - new Date(ags[0].data_hora).getTime()) / 86400000);
              if (dias < filtroSemConsulta) return false;
          }
      }

      // Procedimento pendente
      if (filtroProcedimento) {
          const trts = p.paciente_tratamentos || p.ficha_medica?.tratamentos || [];
          const match = trts.some((t: any) => t.procedimento?.toLowerCase().includes(filtroProcedimento.toLowerCase()) && t.status !== 'concluido');
          if (!match) return false;
      }

      return true;
  });

  function limparFiltros() {
      setFiltroStatus('todos'); setFiltroDebito(false); setFiltroSemConsulta(null); setFiltroProcedimento('');
  }

  function stopRowClick(e: React.MouseEvent) {
      e.stopPropagation();
  }

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-5 pb-16 font-poppins">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#1d1d1f] md:text-[32px]">Pacientes</h1>
            <p className="mt-1 text-[14px] text-[#6e6e73]">{filtrados.length} {filtrados.length === 1 ? 'paciente' : 'pacientes'}</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
              <button onClick={exportarCSV} className="flex-1 sm:flex-none inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-black/[0.11] bg-white px-3 text-[13px] font-medium text-[#1d1d1f] hover:bg-[#f5f5f7]" title="Exportar lista filtrada para CSV"><Download size={14}/> <span className="hidden sm:inline">Exportar</span></button>
              <button onClick={novoPaciente} className="flex-1 sm:flex-none inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ortus-blue px-4 text-[13px] font-medium text-white hover:bg-ortus-blueDark"><Plus size={16}/> Novo paciente</button>
          </div>
      </div>

      <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 md:flex-row">
              <div className="relative flex-1">
                  <Search className="absolute left-0 top-2.5 text-[#aeaeb2]" size={18}/>
                  <input type="text" placeholder="Buscar nome, CPF ou telefone…" className="w-full border-b border-black/[0.08] bg-transparent py-2 pl-7 pr-3 text-[14px] outline-none placeholder:text-[#aeaeb2] focus:border-ortus-blue" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              
              <CustomSelect value={filtroClinica} onChange={setFiltroClinica} options={[{value:'todas',label:'Todas as Clínicas'}, ...clinicas.map((c:any) => ({value:String(c.id),label:c.nome}))]} size="sm" className="min-w-[180px]"/>

              <button onClick={() => setShowFiltros(!showFiltros)} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors ${showFiltros || filtrosAtivos ? 'bg-[#eaf2fd] text-ortus-blue' : 'text-[#6e6e73] hover:bg-[#f5f5f7]'}`}>
                  <Filter size={15}/> Filtros
                  {filtrosAtivos && <span className="h-1.5 w-1.5 rounded-full bg-ortus-blue"></span>}
              </button>

              <div className="flex rounded-lg bg-[#f5f5f7] p-0.5">
                  <button onClick={() => setVisualizacao('lista')} className={`rounded-md p-2 ${visualizacao === 'lista' ? 'bg-white text-ortus-blue shadow-sm' : 'text-[#aeaeb2]'}`}><ListIcon size={18}/></button>
                  <button onClick={() => setVisualizacao('cards')} className={`rounded-md p-2 ${visualizacao === 'cards' ? 'bg-white text-ortus-blue shadow-sm' : 'text-[#aeaeb2]'}`}><LayoutGrid size={18}/></button>
              </div>
          </div>

          {showFiltros && (
              <div className="px-3 pb-3 pt-1 border-t border-slate-100 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Status</label>
                      <CustomSelect value={filtroStatus} onChange={setFiltroStatus} options={[{value:'todos',label:'Todos'},{value:'ativo',label:'Ativo'},{value:'agendado',label:'Agendado'},{value:'novo',label:'Novo'}]} size="sm"/>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 hover:border-rose-300 transition-colors">
                      <input type="checkbox" checked={filtroDebito} onChange={e => setFiltroDebito(e.target.checked)} className="rounded"/>
                      <AlertCircle size={13} className="text-rose-500"/> Com débito
                  </label>
                  <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Sem consulta há</label>
                      <CustomSelect value={String(filtroSemConsulta ?? '')} onChange={v => setFiltroSemConsulta(v ? Number(v) : null)} options={[{value:'',label:'—'},{value:'30',label:'30 dias'},{value:'60',label:'60 dias'},{value:'90',label:'90 dias'},{value:'180',label:'6 meses'},{value:'365',label:'1 ano'}]} size="sm"/>
                  </div>
                  <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Procedimento pendente</label>
                      <input placeholder="Ex: canal" value={filtroProcedimento} onChange={e => setFiltroProcedimento(e.target.value)} className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 w-36 outline-none focus:ring-2 focus:ring-blue-200"/>
                  </div>
                  {filtrosAtivos && (
                      <button onClick={limparFiltros} className="ml-auto text-xs font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-colors"><X size={13}/> Limpar filtros</button>
                  )}
              </div>
          )}
      </div>

      {loading ? <div className="py-20 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2"/> Carregando...</div> : 
       visualizacao === 'lista' ? (
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(0,0,0,.04)]">
          <div className="flex items-center justify-between px-5 py-4 md:px-6">
            <h2 className="flex items-center gap-1.5 text-[16px] font-semibold text-[#1d1d1f]">
              Pacientes
              <AlertCircle size={14} className="text-[#c7c7cc]" />
            </h2>
          </div>
          <div className="hidden grid-cols-[minmax(0,1.5fr)_0.8fr_0.8fr_auto] gap-3 px-6 pb-2 text-[12px] text-[#aeaeb2] md:grid">
            <span>Nome</span>
            <span>Plano</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>
          <ul>
            {filtrados.map((p: any) => {
              const partes = String(p.nome || '').trim().split(/\s+/);
              const iniciais = ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
              const tel = (p.telefone || '').replace(/\D/g, '');
              const telFmt = tel.length >= 11 ? `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7, 11)}` : (p.telefone || 'Sem telefone');
              const plano = p.planos ? (p.planos.tipo === 'particular' ? 'Particular' : p.planos.nome) : 'Particular';
              return (
                <li key={p.id}>
                  <div
                    onClick={() => router.push(`/pacientes/${p.id}`)}
                    className="grid cursor-pointer grid-cols-1 items-center gap-2 border-t border-black/[0.05] px-5 py-3.5 transition-colors hover:bg-[#fafafa] md:grid-cols-[minmax(0,1.5fr)_0.8fr_0.8fr_auto] md:px-6"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-[11px] font-semibold text-[#6e6e73]">{iniciais}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-[#1d1d1f]">{p.nome}</p>
                        <p className="truncate text-[12px] text-[#aeaeb2]">Paciente · {telFmt}</p>
                      </div>
                    </div>
                    <span className="pl-12 text-[14px] font-medium text-ortus-blue md:pl-0">{plano}</span>
                    <span className="hidden capitalize text-[14px] text-[#1d1d1f] md:block">{p.status}</span>
                    <div className="hidden items-center justify-end gap-1 md:flex" onClick={stopRowClick}>
                      <PatientContactButtons
                        variant="icons"
                        channels={['whatsapp']}
                        telefone={p.telefone}
                        email={p.email}
                        clinicaId={p.clinica_id}
                        evento="pos_consulta"
                        contexto={buildDocumentoContexto({
                          paciente_nome: p.nome?.split(' ')[0],
                          clinica_nome: p.nome_clinica,
                        })}
                      />
                      <button type="button" onClick={() => router.push(`/agenda?paciente=${p.id}`)} className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-[#eaf2fd] hover:text-ortus-blue" title="Agendar consulta"><Calendar size={15}/></button>
                      <button type="button" onClick={() => router.push(`/proteses?paciente=${p.id}`)} className="p-1.5 rounded-lg text-[#6e6e73] hover:bg-[#eaf2fd] hover:text-ortus-blue" title="Nova prótese"><Smile size={15}/></button>
                      <ChevronRight size={16} className="text-[#c7c7cc]" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
       ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">{filtrados.map((p: any) => (
            <div key={p.id} onClick={() => router.push(`/pacientes/${p.id}`)} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-blue-200 group">
                <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">{p.nome.charAt(0)}</div><div className="flex-1 min-w-0"><h3 className="font-bold text-slate-800 truncate">{p.nome}</h3><p className="text-xs text-slate-400 uppercase font-bold">{p.nome_clinica || 'Sem Clínica'}</p></div>
                    <div className="flex items-center gap-1.5" onClick={stopRowClick}>
                        <PatientContactButtons variant="icons" channels={['whatsapp']} telefone={p.telefone} email={p.email} clinicaId={p.clinica_id} evento="pos_consulta" contexto={buildDocumentoContexto({ paciente_nome: p.nome?.split(' ')[0], clinica_nome: p.nome_clinica })} />
                        <button type="button" onClick={() => router.push(`/agenda?paciente=${p.id}`)} className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100" title="Agendar"><Calendar size={16}/></button>
                        <button type="button" onClick={() => router.push(`/proteses?paciente=${p.id}`)} className="p-2 rounded-xl bg-violet-50 text-violet-600 hover:bg-violet-100" title="Nova prótese"><Smile size={16}/></button>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="text-sm text-slate-500 flex items-center gap-2"><Phone size={14}/> {p.telefone || 'Sem telefone'}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {p.planos ? <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${p.planos.tipo === 'particular' ? 'bg-slate-100 text-slate-600' : 'bg-ortus-accent-soft text-ortus-accent-muted'}`}>{p.planos.tipo === 'particular' ? 'Particular' : p.planos.nome}</span> : <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded">Particular</span>}
                    </div>
                    {p.responsavel_nome && (
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                            <span className="font-medium">{p.responsavel_nome}</span>
                            <span className="text-slate-400">({p.responsavel_parentesco || '—'})</span>
                        </div>
                    )}
                </div>
            </div>
        ))}</div>
       )}
    </div>
  );
}