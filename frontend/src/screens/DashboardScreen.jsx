import React from 'react';
import { Activity, AlertCircle, Bell, Calendar, CheckSquare, Clock3, Plus, User } from 'lucide-react';
import { getRiskColor, sortPatientsByRisk } from '../utils/risk';
import FutureFeatureCard from '../components/shared/FutureFeatureCard';

const getPatientSummary = (patient) => {
  const reason = patient.motivo || 'Motivo no registrado';
  const age = patient.edad === null || typeof patient.edad === 'undefined' ? 'Edad no registrada' : `${patient.edad} anos`;
  return `${reason} - ${age}`;
};

const getReminderAccent = (priority) => (
  priority === 'high'
    ? 'border-red-200 bg-red-50'
    : priority === 'medium'
      ? 'border-amber-200 bg-amber-50'
      : 'border-indigo-200 bg-indigo-50'
);

const getReminderBadge = (priority) => (
  priority === 'high'
    ? 'bg-red-100 text-red-700 border-red-200'
    : priority === 'medium'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-indigo-100 text-indigo-700 border-indigo-200'
);

const getReminderLabel = (priority) => {
  if (priority === 'high') return 'Alta';
  if (priority === 'medium') return 'Media';
  return 'Suave';
};

function RemindersPanel({ reminders, patients, isPsychologist, onOpenPatient, onViewAppointments }) {
  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg md:text-xl font-bold flex items-center text-gray-800">
          <Bell className="mr-2 text-indigo-500" /> Recordatorios
        </h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {reminders.length}
        </span>
      </div>

      <div className="space-y-3">
        {reminders.length > 0 ? reminders.map((reminder) => {
          const patient = reminder.patientId ? patients.find((currentPatient) => currentPatient.id === reminder.patientId) : null;
          const canOpenPatient = reminder.action === 'open-patient' && patient;

          return (
            <div key={reminder.id} className={`rounded-xl border p-4 ${getReminderAccent(reminder.priority)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{reminder.title}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getReminderBadge(reminder.priority)}`}>
                      {getReminderLabel(reminder.priority)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{reminder.description}</p>
                  {(reminder.date || reminder.time) && (
                    <p className="mt-2 text-xs font-medium text-gray-500">
                      {[reminder.date, reminder.time?.slice(0, 5)].filter(Boolean).join(' - ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {canOpenPatient && (
                  <button onClick={() => onOpenPatient(patient)} className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition">
                    {isPsychologist ? 'Abrir expediente' : 'Ver seguimiento'}
                  </button>
                )}
                {reminder.action === 'open-appointments' && (
                  <button onClick={onViewAppointments} className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition">
                    Ver agenda
                  </button>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
            No hay recordatorios activos por ahora.
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardScreen({ currentUser, patients, appointments, reminders, onOpenPatient, onNewPatient, onViewAppointments }) {
  const isPsychologist = currentUser?.role === 'psychologist';
  const nextAppointment = appointments[0];
  const patientProfile = patients[0] || null;
  const nextPatient = isPsychologist
    ? patients.find((patient) => patient.id === nextAppointment?.pacienteId)
    : patientProfile;

  const pendingTasks = patientProfile?.tareas?.filter((task) => !task.completada).length || 0;
  const completedTasks = patientProfile?.tareas?.filter((task) => task.completada).length || 0;

  const getAppointmentStatusLabel = (status) => {
    if (status === 'completada') return 'Completada';
    if (status === 'cancelada') return 'Cancelada';
    return 'Pendiente';
  };

  if (!isPsychologist) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-800">Hola, {currentUser?.firstName}</h2>
            <p className="text-sm md:text-base text-gray-500">Aqui tienes tu resumen de seguimiento de hoy.</p>
          </div>
        </div>

        {nextAppointment && (
          <div className="bg-white p-5 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-indigo-500 font-bold mb-2">Tu proxima cita</p>
                <h3 className="text-xl font-bold text-gray-900">{nextAppointment.hora}</h3>
                <p className="text-sm text-gray-500 mt-1">Estado: {getAppointmentStatusLabel(nextAppointment.estado)}</p>
              </div>
              {patientProfile && (
                <button onClick={() => onOpenPatient(patientProfile)} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium w-full md:w-auto">
                  Ver mi seguimiento
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-500 font-medium text-sm md:text-base">Tareas Pendientes</h3>
              <CheckSquare className="text-blue-500" size={24} />
            </div>
            <p className="text-2xl md:text-3xl font-bold mt-2">{pendingTasks}</p>
          </div>
          <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-500 font-medium text-sm md:text-base">Citas Hoy</h3>
              <Calendar className="text-purple-500" size={24} />
            </div>
            <p className="text-2xl md:text-3xl font-bold mt-2">{appointments.length}</p>
          </div>
          <div className="bg-green-50 p-4 md:p-5 rounded-xl shadow-sm border border-green-100 transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h3 className="text-green-700 font-medium text-sm md:text-base">Tareas Completadas</h3>
              <Clock3 className="text-green-500" size={24} />
            </div>
            <p className="text-2xl md:text-3xl font-bold text-green-700 mt-2">{completedTasks}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg md:text-xl font-bold mb-4 flex items-center">
              <CheckSquare className="mr-2 text-indigo-500" /> Mis Tareas
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {patientProfile?.tareas?.length ? (
                patientProfile.tareas.map((task) => (
                  <div key={task.id} onClick={() => onOpenPatient(patientProfile)} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition">
                    <div className="truncate pr-2">
                      <p className={`font-semibold text-sm md:text-base truncate ${task.completada ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.texto}</p>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border ${task.completada ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>
                      {task.completada ? 'Hecha' : 'Pendiente'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  No tienes tareas registradas por ahora.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg md:text-xl font-bold mb-4 flex items-center">
                <Calendar className="mr-2 text-indigo-500" /> Mis Citas
              </h2>
              <div className="space-y-4">
                {appointments.map((appointment) => (
                  <div key={appointment.id} className="flex items-center p-3 md:p-4 bg-gray-50 rounded-lg">
                    <div className="flex flex-col items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-white rounded-lg shadow-sm border border-gray-200 mr-3 md:mr-4 shrink-0">
                      <span className="text-xs md:text-sm font-bold text-indigo-600">{appointment.hora.split(' ')[0]}</span>
                    </div>
                    <div className="flex-1 truncate">
                      <p className="font-bold text-gray-800 text-sm md:text-base truncate">{appointment.hora}</p>
                      <p className="text-xs md:text-sm text-gray-500">Estado: {getAppointmentStatusLabel(appointment.estado)}</p>
                    </div>
                  </div>
                ))}
                {appointments.length === 0 && (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    No tienes citas registradas para hoy.
                  </div>
                )}
              </div>
            </div>

            <RemindersPanel reminders={reminders} patients={patients} isPsychologist={isPsychologist} onOpenPatient={onOpenPatient} onViewAppointments={onViewAppointments} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">Hola, {currentUser?.firstName}</h2>
          <p className="text-sm md:text-base text-gray-500">Aqui tienes el resumen de tu consulta hoy.</p>
        </div>
        <button onClick={onNewPatient} className="flex bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium items-center transition shadow-sm">
          <Plus size={18} className="mr-2" /> Nuevo Paciente
        </button>
      </div>

      {nextPatient && (
        <div className="bg-white p-5 md:p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-indigo-500 font-bold mb-2">Proxima sesion</p>
              <h3 className="text-xl font-bold text-gray-900">{nextPatient.nombre}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {nextAppointment.hora} - {nextPatient.motivo || 'Motivo no registrado'}
              </p>
            </div>
            <button onClick={() => onOpenPatient(nextPatient)} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium w-full md:w-auto">
              Iniciar consulta
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-500 font-medium text-sm md:text-base">Pacientes</h3>
            <User className="text-blue-500" size={24} />
          </div>
          <p className="text-2xl md:text-3xl font-bold mt-2">{patients.length}</p>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-500 font-medium text-sm md:text-base">Citas Hoy</h3>
            <Calendar className="text-purple-500" size={24} />
          </div>
          <p className="text-2xl md:text-3xl font-bold mt-2">{appointments.length}</p>
        </div>
        <div className="bg-red-50 p-4 md:p-5 rounded-xl shadow-sm border border-red-100 transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-red-700 font-medium text-sm md:text-base">Atencion Prioritaria</h3>
            <AlertCircle className="text-red-500" size={24} />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-red-700 mt-2">{patients.filter((patient) => patient.riesgo === 'alto').length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg md:text-xl font-bold mb-4 flex items-center">
            <Activity className="mr-2 text-indigo-500" /> Semaforo de Riesgo
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {sortPatientsByRisk(patients).map((patient) => (
              <div key={patient.id} onClick={() => onOpenPatient(patient)} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition">
                <div className="truncate pr-2">
                  <p className="font-semibold text-gray-800 text-sm md:text-base truncate">{patient.nombre}</p>
                  <p className="text-xs text-gray-500 truncate">{getPatientSummary(patient)}</p>
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
            <h2 className="text-lg md:text-xl font-bold mb-4 flex items-center">
              <Calendar className="mr-2 text-indigo-500" /> Agenda de Hoy
            </h2>
            <div className="space-y-4">
              {appointments.map((appointment) => {
                const patient = patients.find((currentPatient) => currentPatient.id === appointment.pacienteId);

                return (
                  <div key={appointment.id} className="flex items-center p-3 md:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                    <div className="flex flex-col items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-white rounded-lg shadow-sm border border-gray-200 mr-3 md:mr-4 shrink-0">
                      <span className="text-xs md:text-sm font-bold text-indigo-600">{appointment.hora.split(' ')[0]}</span>
                    </div>
                    <div className="flex-1 truncate">
                      <p className="font-bold text-gray-800 text-sm md:text-base truncate">{patient?.nombre || 'Paciente no disponible'}</p>
                      <p className="text-xs md:text-sm text-gray-500">Estado: {getAppointmentStatusLabel(appointment.estado)}</p>
                    </div>
                    {patient && (
                      <button
                        onClick={() => onOpenPatient(patient)}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-xs md:text-sm font-medium"
                      >
                        Ver Expediente
                      </button>
                    )}
                  </div>
                );
              })}
              {appointments.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  No hay citas registradas para hoy.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RemindersPanel reminders={reminders} patients={patients} isPsychologist={isPsychologist} onOpenPatient={onOpenPatient} onViewAppointments={onViewAppointments} />
            <FutureFeatureCard title="Asistente Clinico IA" description="Se mantiene visible en la experiencia, pero bloqueado hasta una siguiente fase." className="min-h-[128px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
