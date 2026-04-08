import React from 'react';
import { Activity, AlertCircle, Calendar, Plus, User, Bot, DollarSign } from 'lucide-react';
import { getRiskColor, sortPatientsByRisk } from '../utils/risk';
import FutureFeatureCard from '../components/shared/FutureFeatureCard';

export default function DashboardScreen({ patients, appointments, onOpenPatient, onNewPatient }) {
  const nextAppointment = appointments[0];
  const nextPatient = patients.find((p) => p.id === nextAppointment?.pacienteId);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">Hola, Dr. Admin</h2>
          <p className="text-sm md:text-base text-gray-500">Aquí tienes el resumen de tu consulta hoy.</p>
        </div>
        <button onClick={onNewPatient} className="hidden md:flex bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium items-center transition shadow-sm">
          <Plus size={18} className="mr-2" /> Nuevo Paciente
        </button>
      </div>

      {nextPatient && (
        <div className="bg-white p-5 md:p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-indigo-500 font-bold mb-2">Próxima sesión</p>
              <h3 className="text-xl font-bold text-gray-900">{nextPatient.nombre}</h3>
              <p className="text-sm text-gray-500 mt-1">{nextAppointment.hora} · {nextPatient.motivo}</p>
            </div>
            <button onClick={() => onOpenPatient(nextPatient)} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium w-full md:w-auto">
              Iniciar consulta
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 transition hover:shadow-md">
          <div className="flex items-center justify-between"><h3 className="text-gray-500 font-medium text-sm md:text-base">Pacientes</h3><User className="text-blue-500" size={24} /></div>
          <p className="text-2xl md:text-3xl font-bold mt-2">{patients.length}</p>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 transition hover:shadow-md">
          <div className="flex items-center justify-between"><h3 className="text-gray-500 font-medium text-sm md:text-base">Citas Hoy</h3><Calendar className="text-purple-500" size={24} /></div>
          <p className="text-2xl md:text-3xl font-bold mt-2">{appointments.length}</p>
        </div>
        <div className="bg-red-50 p-4 md:p-5 rounded-xl shadow-sm border border-red-100 transition hover:shadow-md">
          <div className="flex items-center justify-between"><h3 className="text-red-700 font-medium text-sm md:text-base">Atención Prioritaria</h3><AlertCircle className="text-red-500" size={24} /></div>
          <p className="text-2xl md:text-3xl font-bold text-red-700 mt-2">{patients.filter((p) => p.riesgo === 'alto').length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg md:text-xl font-bold mb-4 flex items-center"><Activity className="mr-2 text-indigo-500" /> Semáforo de Riesgo</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {sortPatientsByRisk(patients).map((patient) => (
              <div key={patient.id} onClick={() => onOpenPatient(patient)} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition">
                <div className="truncate pr-2">
                  <p className="font-semibold text-gray-800 text-sm md:text-base truncate">{patient.nombre}</p>
                  <p className="text-xs text-gray-500 truncate">{patient.motivo} • {patient.edad} años</p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border ${getRiskColor(patient.riesgo)} uppercase`}>
                  Riesgo {patient.riesgo}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg md:text-xl font-bold mb-4 flex items-center"><Calendar className="mr-2 text-indigo-500" /> Agenda de Hoy</h2>
            <div className="space-y-4">
              {appointments.map((appointment) => {
                const patient = patients.find((p) => p.id === appointment.pacienteId);
                return (
                  <div key={appointment.id} className="flex items-center p-3 md:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                    <div className="flex flex-col items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-white rounded-lg shadow-sm border border-gray-200 mr-3 md:mr-4 shrink-0">
                      <span className="text-xs md:text-sm font-bold text-indigo-600">{appointment.hora.split(' ')[0]}</span>
                    </div>
                    <div className="flex-1 truncate">
                      <p className="font-bold text-gray-800 text-sm md:text-base truncate">{patient?.nombre || 'Paciente Eliminado'}</p>
                      <p className="text-xs md:text-sm text-gray-500">Estado: {appointment.estado === 'completada' ? 'Completada' : 'Pendiente'}</p>
                    </div>
                    {patient && <button onClick={() => onOpenPatient(patient)} className="px-3 py-1.5 md:px-4 md:py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-xs md:text-sm font-medium">Ver Expediente</button>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FutureFeatureCard title="Finanzas y cobros" description="Módulo visual reservado para pagos, facturas y control financiero." className="min-h-[128px]" />
            <FutureFeatureCard title="Asistente Clínico IA" description="Se mantiene visible en la experiencia, pero bloqueado hasta una siguiente fase." className="min-h-[128px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
