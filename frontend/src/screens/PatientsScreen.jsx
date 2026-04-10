import React, { useMemo, useState } from 'react';
import { Search, CalendarDays, FileText, CheckSquare } from 'lucide-react';
import { getRiskColor } from '../utils/risk';

const getPatientStatusClasses = (status) => (
  status === 'activo'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'en pausa'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : status === 'de alta'
        ? 'border-sky-200 bg-sky-50 text-sky-700'
        : 'border-slate-200 bg-slate-100 text-slate-600'
);

const getPatientSubtitle = (patient) => {
  const reason = patient.motivo || 'Motivo no registrado';
  const age = patient.edad === null || typeof patient.edad === 'undefined' ? 'Edad no registrada' : `${patient.edad} anos`;
  return `${reason} - ${age}`;
};

export default function PatientsScreen({ currentUser, patients, onOpenPatient }) {
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [summaryFilter, setSummaryFilter] = useState('todos');
  const isPsychologist = currentUser?.role === 'psychologist';
  const patientSummary = useMemo(() => {
    const highRisk = patients.filter((patient) => patient.riesgo === 'alto').length;
    const pendingTasks = patients.filter((patient) => (patient.tareas || []).some((task) => !task.completada)).length;
    const withoutSessions = patients.filter((patient) => !patient.ultimaSesion || !(patient.sesiones || []).length).length;
    const pendingInterview = patients.filter((patient) => !patient.entrevistaCompleta).length;

    return {
      highRisk,
      pendingTasks,
      withoutSessions,
      pendingInterview,
    };
  }, [patients]);
  const hasActiveFilters = query.trim() || riskFilter !== 'todos' || statusFilter !== 'todos' || summaryFilter !== 'todos';

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const patientName = patient.nombre || '';
      const patientReason = patient.motivo || '';
      const matchesQuery =
        patientName.toLowerCase().includes(query.toLowerCase()) || patientReason.toLowerCase().includes(query.toLowerCase());
      const matchesRisk = riskFilter === 'todos' ? true : patient.riesgo === riskFilter;
      const matchesStatus = statusFilter === 'todos' ? true : (patient.estado || 'activo') === statusFilter;
      const matchesSummary =
        summaryFilter === 'todos'
          ? true
          : summaryFilter === 'high_risk'
            ? patient.riesgo === 'alto'
            : summaryFilter === 'pending_tasks'
              ? (patient.tareas || []).some((task) => !task.completada)
              : summaryFilter === 'pending_interview'
                ? !patient.entrevistaCompleta
                : !patient.ultimaSesion || !(patient.sesiones || []).length;
      return matchesQuery && matchesRisk && matchesStatus && matchesSummary;
    });
  }, [patients, query, riskFilter, statusFilter, summaryFilter]);

  const handleSummaryFilter = (nextFilter) => {
    setSummaryFilter((currentFilter) => (currentFilter === nextFilter ? 'todos' : nextFilter));
  };

  const clearFilters = () => {
    setQuery('');
    setRiskFilter('todos');
    setStatusFilter('todos');
    setSummaryFilter('todos');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">{isPsychologist ? 'Mis Pacientes' : 'Mi Seguimiento'}</h2>
        <p className="text-sm md:text-base text-gray-500">
          {isPsychologist ? 'Busca expedientes, prioriza riesgo y abre acciones rapidas.' : 'Consulta tu perfil, tu motivo de atencion y tu progreso actual.'}
        </p>
      </div>

      {isPsychologist && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <button type="button" onClick={() => handleSummaryFilter('high_risk')} className={`rounded-2xl border p-4 text-left transition ${summaryFilter === 'high_risk' ? 'border-rose-400 bg-rose-100 ring-2 ring-rose-200' : 'border-rose-200 bg-rose-50 hover:bg-rose-100/70'}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700">Prioridad alta</p>
            <p className="mt-2 text-3xl font-black text-rose-900">{patientSummary.highRisk}</p>
            <p className="mt-1 text-sm text-rose-800">Pacientes con nivel de riesgo alto.</p>
          </button>
          <button type="button" onClick={() => handleSummaryFilter('pending_tasks')} className={`rounded-2xl border p-4 text-left transition ${summaryFilter === 'pending_tasks' ? 'border-indigo-400 bg-indigo-100 ring-2 ring-indigo-200' : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100/70'}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Seguimiento activo</p>
            <p className="mt-2 text-3xl font-black text-indigo-900">{patientSummary.pendingTasks}</p>
            <p className="mt-1 text-sm text-indigo-800">Pacientes con tareas pendientes.</p>
          </button>
          <button type="button" onClick={() => handleSummaryFilter('without_sessions')} className={`rounded-2xl border p-4 text-left transition ${summaryFilter === 'without_sessions' ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-200' : 'border-amber-200 bg-amber-50 hover:bg-amber-100/70'}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Por documentar</p>
            <p className="mt-2 text-3xl font-black text-amber-900">{patientSummary.withoutSessions}</p>
            <p className="mt-1 text-sm text-amber-800">Pacientes sin notas clinicas registradas.</p>
          </button>
          <button type="button" onClick={() => handleSummaryFilter('pending_interview')} className={`rounded-2xl border p-4 text-left transition ${summaryFilter === 'pending_interview' ? 'border-violet-400 bg-violet-100 ring-2 ring-violet-200' : 'border-violet-200 bg-violet-50 hover:bg-violet-100/70'}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Entrevista pendiente</p>
            <p className="mt-2 text-3xl font-black text-violet-900">{patientSummary.pendingInterview}</p>
            <p className="mt-1 text-sm text-violet-800">Pacientes sin entrevista inicial completa.</p>
          </button>
        </section>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5 space-y-4">
        {isPsychologist && (
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o motivo de consulta"
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="todos">Todos los riesgos</option>
              <option value="sin riesgo">Sin riesgo</option>
              <option value="alto">Riesgo alto</option>
              <option value="medio">Riesgo medio</option>
              <option value="bajo">Riesgo bajo</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="todos">Todos los estados</option>
              <option value="activo">Activo</option>
              <option value="en pausa">En pausa</option>
              <option value="de baja">De baja</option>
              <option value="de alta">De alta</option>
            </select>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {filteredPatients.map((patient) => (
            <div key={patient.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-bold text-gray-900">{patient.nombre}</h3>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border uppercase ${getRiskColor(patient.riesgo)}`}>
                      Riesgo {patient.riesgo}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border uppercase ${getPatientStatusClasses(patient.estado || 'activo')}`}>
                      {patient.estado || 'activo'}
                    </span>
                    {!!(patient.tareas || []).some((task) => !task.completada) && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border border-indigo-200 bg-indigo-50 text-indigo-700">
                        {(patient.tareas || []).filter((task) => !task.completada).length} tarea(s) pendiente(s)
                      </span>
                    )}
                    {!patient.ultimaSesion && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border border-amber-200 bg-amber-50 text-amber-700">
                        Sin notas clinicas
                      </span>
                    )}
                    {!patient.entrevistaCompleta && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border border-violet-200 bg-violet-50 text-violet-700">
                        Entrevista pendiente
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{getPatientSubtitle(patient)}</p>
                  <p className="text-xs text-gray-400 mt-2">Ultima nota clinica: {patient.ultimaSesion || 'Sin notas clinicas registradas'}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full md:w-auto">
                  <button
                    onClick={() => onOpenPatient(patient)}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-sm font-medium inline-flex items-center justify-center"
                  >
                    <FileText size={16} className="mr-2" /> {isPsychologist ? 'Expediente' : 'Ver Detalle'}
                  </button>
                  <button
                    onClick={() => onOpenPatient(patient)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium inline-flex items-center justify-center"
                  >
                    <CalendarDays size={16} className="mr-2" /> Nota clinica
                  </button>
                  <button
                    onClick={() => onOpenPatient(patient)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium inline-flex items-center justify-center"
                  >
                    <CheckSquare size={16} className="mr-2" /> Tareas
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredPatients.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
              No hay pacientes que coincidan con la busqueda actual.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
