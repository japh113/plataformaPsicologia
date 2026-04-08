import React, { useMemo, useState } from 'react';
import { Search, CalendarDays, FileText, CheckSquare } from 'lucide-react';
import { getRiskColor } from '../utils/risk';

export default function PatientsScreen({ patients, onOpenPatient }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('todos');

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const matchesQuery = patient.nombre.toLowerCase().includes(query.toLowerCase()) || patient.motivo.toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === 'todos' ? true : patient.riesgo === filter;
      return matchesQuery && matchesFilter;
    });
  }, [patients, query, filter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">Mis Pacientes</h2>
        <p className="text-sm md:text-base text-gray-500">Busca expedientes, prioriza riesgo y abre acciones rápidas.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o motivo de consulta" className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option value="todos">Todos los riesgos</option>
            <option value="alto">Riesgo alto</option>
            <option value="medio">Riesgo medio</option>
            <option value="bajo">Riesgo bajo</option>
          </select>
        </div>

        <div className="space-y-3">
          {filteredPatients.map((patient) => (
            <div key={patient.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-bold text-gray-900">{patient.nombre}</h3>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border uppercase ${getRiskColor(patient.riesgo)}`}>Riesgo {patient.riesgo}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{patient.motivo} · {patient.edad} años</p>
                  <p className="text-xs text-gray-400 mt-2">Última sesión: {patient.ultimaSesion}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full md:w-auto">
                  <button onClick={() => onOpenPatient(patient)} className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-sm font-medium inline-flex items-center justify-center">
                    <FileText size={16} className="mr-2" /> Expediente
                  </button>
                  <button onClick={() => onOpenPatient(patient)} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium inline-flex items-center justify-center">
                    <CalendarDays size={16} className="mr-2" /> Sesión
                  </button>
                  <button onClick={() => onOpenPatient(patient)} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium inline-flex items-center justify-center">
                    <CheckSquare size={16} className="mr-2" /> Tareas
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
