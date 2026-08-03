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
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
          <div><h1 className="text-2xl sm:text-3xl font-black text-slate-800">Pacientes</h1><p className="text-sm text-slate-500">Gerencie seus clientes.</p></div>
          <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={exportarCSV} className="flex-1 sm:flex-none bg-white text-slate-700 border border-slate-200 px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl font-bold hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 shadow-sm flex items-center justify-center gap-2 transition-all text-sm" title="Exportar lista filtrada para CSV"><Download size={16}/> <span className="hidden sm:inline">Exportar</span> ({filtrados.length})</button>
              <button onClick={novoPaciente} className="flex-1 sm:flex-none bg-blue-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2 text-sm"><Plus size={18}/> Novo Paciente</button>
          </div>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
          <div className="flex flex-col md:flex-row gap-2">
              <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
                  <input type="text" placeholder="Buscar por nome, telefone ou CPF..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              
              <CustomSelect value={filtroClinica} onChange={setFiltroClinica} options={[{value:'todas',label:'Todas as Clínicas'}, ...clinicas.map((c:any) => ({value:String(c.id),label:c.nome}))]} size="sm" className="min-w-[180px]"/>

              <button onClick={() => setShowFiltros(!showFiltros)} className={`px-3 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${showFiltros || filtrosAtivos ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:border-blue-200'}`}>
                  <Filter size={16}/> Filtros
                  {filtrosAtivos && <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>}
              </button>

              <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setVisualizacao('lista')} className={`p-2 rounded-lg ${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><ListIcon size={20}/></button>
                  <button onClick={() => setVisualizacao('cards')} className={`p-2 rounded-lg ${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><LayoutGrid size={20}/></button>
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
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[480px]">
                <thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-3 sm:p-4 pl-4 sm:pl-6 text-xs font-bold text-slate-400 uppercase">Nome</th><th className="p-3 sm:p-4 text-xs font-bold text-slate-400 uppercase hidden sm:table-cell">Clínica</th><th className="p-3 sm:p-4 text-xs font-bold text-slate-400 uppercase">Plano</th><th className="p-3 sm:p-4 text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Responsável</th><th className="p-3 sm:p-4 text-xs font-bold text-slate-400 uppercase">Telefone</th><th className="p-3 sm:p-4 text-xs font-bold text-slate-400 uppercase hidden sm:table-cell">Status</th><th className="p-3 sm:p-4 text-right"></th></tr></thead>
                <tbody className="divide-y divide-slate-50">{filtrados.map((p: any) => (
                    <tr key={p.id} onClick={() => router.push(`/pacientes/${p.id}`)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
                        <td className="p-3 sm:p-4 pl-4 sm:pl-6 font-bold text-slate-700 text-sm">{p.nome}</td>
                        <td className="p-3 sm:p-4 text-sm text-slate-500 hidden sm:table-cell">{p.nome_clinica ? <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold text-slate-600">{p.nome_clinica}</span> : <span className="text-slate-300 italic">--</span>}</td>
                        <td className="p-3 sm:p-4 text-sm text-slate-500">{p.planos ? <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${p.planos.tipo === 'particular' ? 'bg-slate-100 text-slate-600' : 'bg-ortus-accent-soft text-ortus-accent-muted'}`}>{p.planos.tipo === 'particular' ? 'Particular' : p.planos.nome}</span> : <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded">Particular</span>}</td>
                        <td className="p-3 sm:p-4 text-sm text-slate-500 hidden md:table-cell">{p.responsavel_nome ? <span className="text-xs font-medium text-slate-600">{p.responsavel_nome} <span className="text-slate-400">({p.responsavel_parentesco || '—'})</span></span> : <span className="text-slate-300 italic">--</span>}</td>
                        <td className="p-3 sm:p-4 text-sm text-slate-500">{p.telefone}</td>
                        <td className="p-3 sm:p-4 hidden sm:table-cell"><span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded">{p.status}</span></td>
                        <td className="p-3 sm:p-4 text-right pr-4 sm:pr-6">
                            <div className="flex items-center justify-end gap-1.5" onClick={stopRowClick}>
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
                                <button type="button" onClick={() => router.push(`/agenda?paciente=${p.id}`)} className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100" title="Agendar consulta"><Calendar size={16}/></button>
                                <button type="button" onClick={() => router.push(`/proteses?paciente=${p.id}`)} className="p-2 rounded-xl bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-100" title="Nova prótese"><Smile size={16}/></button>
                                <span className="text-slate-300 group-hover:text-blue-500"><ChevronRight size={20}/></span>
                            </div>
                        </td>
                    </tr>
                ))}</tbody>
            </table>
          </div>
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