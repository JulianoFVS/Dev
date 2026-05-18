'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, LayoutGrid, List as ListIcon, User, Phone, Edit, Trash2, Activity, Loader2, ChevronRight, Building2, Download, Filter, AlertCircle, Calendar, Clock, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import { usePatientActionModal } from '@/components/PatientActionModal';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas } from '@/lib/clinicScoped';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
  const { openPatient } = usePatientSlideOver();
  const { openPatientActions, openQuickCapture } = usePatientActionModal();
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
        .select('*, agendamentos(data_hora, status), clinicas(nome)')
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
      if (filtrados.length === 0) return alert('Nenhum paciente para exportar com os filtros atuais.');

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
          const condicoes = ['Diabetes','Hipertensão','Cardiopatia','Asma/Bronquite','Alergia Antibiótico','Alergia Anestésico','Gestante','Fumante','Uso de Anticoagulante']
              .filter(k => fm[k]).join('; ');
          return [
              p.id, p.nome, p.cpf, p.rg, p.telefone, p.email, p.data_nascimento,
              p.sexo, p.endereco, p.nome_clinica, p.status,
              p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '',
              condicoes,
              fm.medicamentos || '',
              p.anamnese || '',
              (fm.anamneses || []).length,
              (fm.tratamentos || []).length,
              (fm.documentos || []).length,
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
          const trts = (p.ficha_medica?.tratamentos || []);
          const match = trts.some((t: any) => t.procedimento?.toLowerCase().includes(filtroProcedimento.toLowerCase()) && t.status !== 'concluido');
          if (!match) return false;
      }

      return true;
  });

  function limparFiltros() {
      setFiltroStatus('todos'); setFiltroDebito(false); setFiltroSemConsulta(null); setFiltroProcedimento('');
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex flex-wrap justify-between items-end gap-3">
          <div><h1 className="text-3xl font-black text-slate-800">Pacientes</h1><p className="text-slate-500">Gerencie seus clientes.</p></div>
          <div className="flex gap-2">
              <button onClick={exportarCSV} className="bg-white text-slate-700 border border-slate-200 px-5 py-3 rounded-xl font-bold hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 shadow-sm flex items-center gap-2 transition-all" title="Exportar lista filtrada para CSV"><Download size={18}/> Exportar ({filtrados.length})</button>
              <button onClick={novoPaciente} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center gap-2"><Plus size={20}/> Novo Paciente</button>
          </div>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
          <div className="flex flex-col md:flex-row gap-2">
              <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
                  <input type="text" placeholder="Buscar por nome, telefone ou CPF..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              
              <div className="flex items-center gap-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Building2 size={16} className="text-slate-400"/>
                  <select value={filtroClinica} onChange={(e) => setFiltroClinica(e.target.value)} className="bg-transparent py-2.5 outline-none text-sm font-bold text-slate-600 cursor-pointer min-w-[150px]">
                      <option value="todas">Todas as Clínicas</option>
                      {clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
              </div>

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
                      <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200">
                          <option value="todos">Todos</option>
                          <option value="ativo">Ativo</option>
                          <option value="agendado">Agendado</option>
                          <option value="novo">Novo</option>
                      </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 hover:border-rose-300 transition-colors">
                      <input type="checkbox" checked={filtroDebito} onChange={e => setFiltroDebito(e.target.checked)} className="rounded"/>
                      <AlertCircle size={13} className="text-rose-500"/> Com débito
                  </label>
                  <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Sem consulta há</label>
                      <select value={filtroSemConsulta ?? ''} onChange={e => setFiltroSemConsulta(e.target.value ? Number(e.target.value) : null)} className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200">
                          <option value="">—</option>
                          <option value="30">30 dias</option>
                          <option value="60">60 dias</option>
                          <option value="90">90 dias</option>
                          <option value="180">6 meses</option>
                          <option value="365">1 ano</option>
                      </select>
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
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 pl-6 text-xs font-bold text-slate-400 uppercase">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Clínica</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Telefone</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-right"></th></tr></thead>
                <tbody className="divide-y divide-slate-50">{filtrados.map((p: any) => (
                    <tr key={p.id} onClick={() => openPatientActions(p.id)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
                        <td className="p-4 pl-6 font-bold text-slate-700">{p.nome}</td>
                        <td className="p-4 text-sm text-slate-500 flex items-center gap-2">{p.nome_clinica ? <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold text-slate-600">{p.nome_clinica}</span> : <span className="text-slate-300 italic">--</span>}</td>
                        <td className="p-4 text-sm text-slate-500">{p.telefone}</td>
                        <td className="p-4"><span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded">{p.status}</span></td>
                        <td className="p-4 text-right pr-6 text-slate-300 group-hover:text-blue-500"><ChevronRight size={20}/></td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
       ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{filtrados.map((p: any) => (
            <div key={p.id} onClick={() => openPatientActions(p.id)} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-blue-200 group">
                <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">{p.nome.charAt(0)}</div><div><h3 className="font-bold text-slate-800 truncate w-40">{p.nome}</h3><p className="text-xs text-slate-400 uppercase font-bold">{p.nome_clinica || 'Sem Clínica'}</p></div></div>
                <div className="text-sm text-slate-500 flex items-center gap-2"><Phone size={14}/> {p.telefone || 'Sem telefone'}</div>
            </div>
        ))}</div>
       )
      }
    </div>
  );
}