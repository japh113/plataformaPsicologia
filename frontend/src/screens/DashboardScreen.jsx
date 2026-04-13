import React from 'react';
import { Activity, AlertCircle, ArrowRight, Bell, Calendar, CheckSquare, ClipboardList, FileText, Plus, User } from 'lucide-react';
import { getRiskColor, sortPatientsByRisk } from '../utils/risk';
import FutureFeatureCard from '../components/shared/FutureFeatureCard';
import { getAppointmentDisplayStatus } from '../mappers/appointments';

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

const groupTasksByClinicalNote = (tasks = []) => {
  const groups = new Map();

  tasks.forEach((task) => {
    const key = task.sesionId || `no-note-${task.id}`;
    const currentGroup = groups.get(key) || {
      id: key,
      fechaSesion: task.fechaSesion || null,
      objetivoSesion: task.objetivoSesion || 'Seguimiento general',
      tasks: [],
    };

    currentGroup.tasks.push(task);
    groups.set(key, currentGroup);
  });

  return [...groups.values()].sort((left, right) => String(right.fechaSesion || '').localeCompare(String(left.fechaSesion || '')));
};

const formatClinicalNoteDate = (value) => {
  if (!value) {
    return 'Sin fecha clinica';
  }

  const [year = '0', month = '1', day = '1'] = String(value).split('-');
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
};

const getAppointmentDateTime = (appointment) => {
  if (!appointment?.fecha) {
    return new Date(0);
  }

  const [year = '0', month = '1', day = '1'] = String(appointment.fecha).split('-');
  const [hours = '0', minutes = '0'] = String(appointment.hora24 || '00:00').split(':');

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    0,
    0,
  );
};

const sortAppointmentsAsc = (entries = []) => (
  [...entries].sort((left, right) => getAppointmentDateTime(left) - getAppointmentDateTime(right))
);

const sortAppointmentsDesc = (entries = []) => (
  [...entries].sort((left, right) => getAppointmentDateTime(right) - getAppointmentDateTime(left))
);

const formatAppointmentDay = (value) => {
  if (!value) {
    return 'Fecha no registrada';
  }

  const [year = '0', month = '1', day = '1'] = String(value).split('-');
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
};

const getAppointmentStatusLabel = (appointment) => {
  const status = typeof appointment === 'string' ? appointment : getAppointmentDisplayStatus(appointment);

  if (status === 'completada') return 'Completada';
  if (status === 'cancelada') return 'Cancelada';
  if (status === 'no asistio') return 'No asistio';
  if (status === 'por cerrar') return 'Por cerrar';
  return 'Pendiente';
};

const getAppointmentStatusBadge = (appointment) => {
  const status = typeof appointment === 'string' ? appointment : getAppointmentDisplayStatus(appointment);

  if (status === 'completada') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'cancelada') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'no asistio') return 'border-slate-200 bg-slate-100 text-slate-700';
  if (status === 'por cerrar') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-indigo-200 bg-indigo-50 text-indigo-700';
};

const getRemindersEmptyCopy = (isPsychologist) => (
  isPsychologist
    ? {
      title: 'Sin alertas operativas por ahora',
      description: 'Cuando haya citas proximas, tareas pendientes o cierres clinicos, apareceran aqui para ayudarte a priorizar.',
    }
    : {
      title: 'Tu panel esta tranquilo por ahora',
      description: 'Cuando haya algo que atender en tu agenda o en tu seguimiento, lo veras aqui primero.',
    }
);

function RemindersPanel({ reminders, patients, isPsychologist, onOpenPatient, onViewAppointments }) {
  const emptyCopy = getRemindersEmptyCopy(isPsychologist);

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
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="text-sm font-semibold text-slate-700">{emptyCopy.title}</p>
            <p className="mt-2 text-sm text-gray-500">{emptyCopy.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardScreen({
  currentUser,
  patients,
  appointments,
  reminders,
  onOpenPatient,
  onNewPatient,
  onViewAppointments,
  onToggleTask,
  processingTaskId = null,
}) {
  const isPsychologist = currentUser?.role === 'psychologist';
  const now = new Date();
  const patientProfile = patients[0] || null;
  const sortedAppointments = sortAppointmentsAsc(appointments);
  const nextAppointment = sortedAppointments.find(
    (appointment) => getAppointmentDateTime(appointment) >= now && !['cancelada', 'no asistio'].includes(appointment.estado),
  ) || null;
  const patientUpcomingAppointments = sortedAppointments.filter(
    (appointment) => getAppointmentDateTime(appointment) >= now && !['cancelada', 'no asistio'].includes(appointment.estado),
  );
  const patientRecentAppointments = sortAppointmentsDesc(
    sortedAppointments.filter((appointment) => getAppointmentDateTime(appointment) < now),
  );
  const nextPatient = isPsychologist
    ? patients.find((patient) => patient.id === nextAppointment?.pacienteId)
    : patientProfile;

  const pendingTasks = patientProfile?.tareas?.filter((task) => !task.completada).length || 0;
  const completedTasks = patientProfile?.tareas?.filter((task) => task.completada).length || 0;
  const totalTasks = patientProfile?.tareas?.length || 0;
  const totalClinicalNotes = patientProfile?.sesiones?.length || 0;
  const interviewCompleted = Boolean(patientProfile?.entrevistaCompleta);
  const patientTaskGroups = groupTasksByClinicalNote(patientProfile?.tareas || []);

  if (!isPsychologist) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-800">Hola, {currentUser?.firstName}</h2>
            <p className="text-sm md:text-base text-gray-500">Aqui tienes tu seguimiento clinico, tu agenda y lo que conviene atender ahora.</p>
          </div>
        </div>

        {patientProfile && !interviewCompleted && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Entrevista inicial pendiente</p>
                <p className="mt-2 text-sm text-amber-900">Necesitas completar tu entrevista para dejar tu expediente inicial al dia.</p>
              </div>
              <button onClick={() => onOpenPatient(patientProfile)} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700">
                Completar entrevista
              </button>
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-600 font-black">Tu siguiente paso</p>
              {!interviewCompleted ? (
                <>
                  <h3 className="mt-2 text-xl font-black text-slate-900">Completar tu entrevista inicial</h3>
                  <p className="mt-2 text-sm text-slate-500">Es el requisito para dejar tu expediente clinico listo y compartir mejor contexto con tu psicologo.</p>
                </>
              ) : nextAppointment ? (
                <>
                  <h3 className="mt-2 text-xl font-black text-slate-900">{formatAppointmentDay(nextAppointment.fecha)} - {nextAppointment.hora}</h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${getAppointmentStatusBadge(nextAppointment)}`}>
                      {getAppointmentStatusLabel(nextAppointment)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Proxima cita
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">Tu siguiente espacio ya esta agendado. Desde aqui puedes revisar tus tareas pendientes y abrir tu expediente cuando lo necesites.</p>
                </>
              ) : pendingTasks > 0 ? (
                <>
                  <h3 className="mt-2 text-xl font-black text-slate-900">Retomar tus tareas entre notas clinicas</h3>
                  <p className="mt-2 text-sm text-slate-500">Tienes {pendingTasks} tarea(s) en proceso antes de tu siguiente seguimiento.</p>
                </>
              ) : (
                <>
                  <h3 className="mt-2 text-xl font-black text-slate-900">Tu seguimiento esta al dia</h3>
                  <p className="mt-2 text-sm text-slate-500">No tienes tareas urgentes ni citas proximas registradas. Puedes revisar tu expediente clinico cuando quieras.</p>
                </>
              )}
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <button
                onClick={onViewAppointments}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Ver mi agenda
              </button>
              {patientProfile && (
                <button onClick={() => onOpenPatient(patientProfile)} className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700">
                  Abrir mi expediente
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`p-4 md:p-5 rounded-xl shadow-sm border transition hover:shadow-md ${interviewCompleted ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-medium text-sm md:text-base ${interviewCompleted ? 'text-emerald-700' : 'text-amber-700'}`}>Entrevista</h3>
              <AlertCircle className={interviewCompleted ? 'text-emerald-500' : 'text-amber-500'} size={24} />
            </div>
            <p className={`text-2xl md:text-3xl font-bold mt-2 ${interviewCompleted ? 'text-emerald-700' : 'text-amber-700'}`}>{interviewCompleted ? 'Lista' : 'Pendiente'}</p>
          </div>
          <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-500 font-medium text-sm md:text-base">Proxima cita</h3>
              <Calendar className="text-violet-500" size={24} />
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">{nextAppointment ? nextAppointment.hora : 'Sin cita'}</p>
            <p className="mt-1 text-xs text-slate-500">{nextAppointment ? formatAppointmentDay(nextAppointment.fecha) : 'Aun no tienes una nueva fecha registrada'}</p>
          </div>
          <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-500 font-medium text-sm md:text-base">Tareas en proceso</h3>
              <CheckSquare className="text-blue-500" size={24} />
            </div>
            <p className="text-2xl md:text-3xl font-bold mt-2">{pendingTasks}</p>
            <p className="mt-1 text-xs text-slate-500">{totalTasks} tarea(s) registradas en total</p>
          </div>
          <div className="bg-slate-50 p-4 md:p-5 rounded-xl shadow-sm border border-slate-200 transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-600 font-medium text-sm md:text-base">Notas clinicas</h3>
              <FileText className="text-slate-500" size={24} />
            </div>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-2">{totalClinicalNotes}</p>
            <p className="mt-1 text-xs text-slate-500">{completedTasks} tarea(s) completadas en tu proceso</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg md:text-xl font-bold flex items-center text-slate-900">
                  <ClipboardList className="mr-2 text-indigo-500" /> Tareas entre notas clinicas
                </h2>
                <p className="mt-1 text-sm text-slate-500">Tus tareas se organizan por nota clinica para que sea mas claro que corresponde a cada seguimiento.</p>
              </div>
              {patientProfile && (
                <button
                  onClick={() => onOpenPatient(patientProfile)}
                  className="hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 md:inline-flex md:items-center"
                >
                  Ver detalle
                </button>
              )}
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {patientTaskGroups.length ? (
                patientTaskGroups.map((group) => {
                  const groupPending = group.tasks.filter((task) => !task.completada).length;

                  return (
                    <div key={group.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-300">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{formatClinicalNoteDate(group.fechaSesion)}</p>
                          <h3 className="mt-1 text-sm md:text-base font-bold text-slate-900">{group.objetivoSesion || 'Seguimiento general'}</h3>
                          <p className="mt-1 text-xs text-slate-500">{group.tasks.length} tarea(s) vinculadas a esta nota clinica</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] md:text-xs font-bold ${groupPending > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          {groupPending > 0 ? `${groupPending} pendiente(s)` : 'Completadas'}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {group.tasks.map((task) => (
                          <label key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <input
                                type="checkbox"
                                checked={task.completada}
                                disabled={processingTaskId === task.id}
                                onChange={() => onToggleTask?.(task.id)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <p className={`text-sm truncate ${task.completada ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{task.texto}</p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${task.completada ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                              {processingTaskId === task.id ? 'Guardando' : task.completada ? 'Hecha' : 'En proceso'}
                            </span>
                          </label>
                        ))}
                      </div>
                      <button
                        onClick={() => onOpenPatient(patientProfile)}
                        className="mt-3 inline-flex items-center text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
                      >
                        Abrir nota clinica <ArrowRight size={16} className="ml-1" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                  <p className="text-sm font-semibold text-slate-700">No tienes tareas activas entre seguimientos</p>
                  <p className="mt-2 text-sm text-gray-500">Cuando tu psicologo te deje ejercicios o practicas para trabajar antes de la siguiente cita, apareceran agrupados aqui.</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg md:text-xl font-bold flex items-center text-slate-900">
                    <Calendar className="mr-2 text-indigo-500" /> Mi agenda
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">Revisa tus proximas citas y el historial reciente de tu seguimiento.</p>
                </div>
                <button
                  onClick={onViewAppointments}
                  className="hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 md:inline-flex md:items-center"
                >
                  Ver agenda
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Proximas citas</p>
                  <div className="mt-3 space-y-3">
                    {patientUpcomingAppointments.slice(0, 3).map((appointment) => (
                      <div key={appointment.id} className="flex items-center rounded-xl border border-slate-100 bg-slate-50 p-3 md:p-4">
                        <div className="mr-3 flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm md:mr-4 md:h-16 md:w-16">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{formatAppointmentDay(appointment.fecha).split(' ')[0]}</span>
                          <span className="text-xs md:text-sm font-bold text-indigo-600">{appointment.hora.split(' ')[0]}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-800 text-sm md:text-base truncate">{formatAppointmentDay(appointment.fecha)} - {appointment.hora}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getAppointmentStatusBadge(appointment)}`}>
                              {getAppointmentStatusLabel(appointment)}
                            </span>
                            {appointment.sesionRegistrada && (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                Nota clinica registrada
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {patientUpcomingAppointments.length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
                        <p className="text-sm font-semibold text-slate-700">Todavia no tienes una proxima cita registrada</p>
                        <p className="mt-2 text-sm text-gray-500">Cuando se agende un nuevo espacio, lo veras aqui junto con su estado y seguimiento asociado.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Historial reciente</p>
                  <div className="mt-3 space-y-3">
                    {patientRecentAppointments.slice(0, 3).map((appointment) => (
                      <div key={appointment.id} className="flex items-center rounded-xl border border-slate-100 bg-white p-3 md:p-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 text-sm md:text-base">{formatAppointmentDay(appointment.fecha)} - {appointment.hora}</p>
                          <p className="mt-1 text-xs text-slate-500">Estado del seguimiento: {getAppointmentStatusLabel(appointment)}</p>
                        </div>
                        <span className={`ml-3 shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getAppointmentStatusBadge(appointment)}`}>
                          {getAppointmentStatusLabel(appointment)}
                        </span>
                      </div>
                    ))}
                    {patientRecentAppointments.length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
                        <p className="text-sm font-semibold text-slate-700">Aun no hay historial reciente para mostrar</p>
                        <p className="mt-2 text-sm text-gray-500">Tus citas anteriores iran apareciendo aqui conforme avance tu proceso.</p>
                      </div>
                    )}
                  </div>
                </div>
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
              <p className="text-xs uppercase tracking-wider text-indigo-500 font-bold mb-2">Proxima cita</p>
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
            {patients.length > 0 ? sortPatientsByRisk(patients).map((patient) => (
              <div key={patient.id} onClick={() => onOpenPatient(patient)} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition">
                <div className="truncate pr-2">
                  <p className="font-semibold text-gray-800 text-sm md:text-base truncate">{patient.nombre}</p>
                  <p className="text-xs text-gray-500 truncate">{getPatientSummary(patient)}</p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border ${getRiskColor(patient.riesgo)} uppercase`}>
                  Riesgo {patient.riesgo}
                </span>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                <p className="text-sm font-semibold text-slate-700">Aun no hay pacientes para priorizar</p>
                <p className="mt-2 text-sm text-gray-500">Cuando registres pacientes, este semaforo te ayudara a detectar rapido los casos con mayor atencion clinica.</p>
              </div>
            )}
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
                      <p className="text-xs md:text-sm text-gray-500">Estado: {getAppointmentStatusLabel(appointment)}</p>
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
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                  <p className="text-sm font-semibold text-slate-700">Hoy no tienes citas registradas</p>
                  <p className="mt-2 text-sm text-gray-500">Puedes aprovechar para revisar la agenda completa, ajustar disponibilidad o ponerte al dia con expedientes pendientes.</p>
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
