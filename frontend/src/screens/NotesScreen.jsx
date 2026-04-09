import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckSquare, FileText, Plus, Save, Shield, Trash2 } from 'lucide-react';
import { getRiskColor } from '../utils/risk';
import FutureFeatureCard from '../components/shared/FutureFeatureCard';

const emptySessionForm = { citaId: '', formato: 'simple', contenido: '' };
const riskOptions = [
  { value: 'bajo', label: 'Bajo' },
  { value: 'medio', label: 'Medio' },
  { value: 'alto', label: 'Alto' },
];

const getPatientSummary = (patient) => {
  const reason = patient.motivo || 'Motivo no registrado';
  const age = patient.edad === null || typeof patient.edad === 'undefined' ? 'Edad no registrada' : `${patient.edad} anos`;
  return `${reason} - ${age}`;
};

const formatSessionDate = (value) => {
  if (!value) {
    return 'Fecha no registrada';
  }

  const [year = '0', month = '1', day = '1'] = String(value).split('-');
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
};

const formatAppointmentDateTime = (appointment) => {
  if (!appointment?.fecha) {
    return 'Fecha no registrada';
  }

  const [year = '0', month = '1', day = '1'] = String(appointment.fecha).split('-');
  const dateLabel = new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));

  return `${dateLabel} - ${appointment.hora}`;
};

const getAppointmentStatusClasses = (status) => (
  status === 'completada'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'cancelada'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-indigo-200 bg-indigo-50 text-indigo-700'
);

export default function NotesScreen({
  currentUser,
  patient,
  appointments,
  todayDate,
  prefilledAppointmentId,
  setVistaActiva,
  onViewAppointments,
  onUpdatePatientProfile,
  onOpenAppointmentSession,
  notesTemp,
  setNotesTemp,
  onSaveNotes,
  onToggleTask,
  onDeleteTask,
  onAddTask,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  isSavingNotes = false,
  isSavingPatientProfile = false,
  isSavingSession = false,
  isCreatingTask = false,
  processingTaskId = null,
  processingSessionId = null,
}) {
  const initialMatchedSession = patient?.sesiones?.find((session) => session.citaId === (prefilledAppointmentId || null)) || null;
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [activeSection, setActiveSection] = useState(initialMatchedSession || prefilledAppointmentId ? 'sesiones' : 'resumen');
  const [selectedSessionId, setSelectedSessionId] = useState(initialMatchedSession?.id || null);
  const [profileForm, setProfileForm] = useState({
    riesgo: patient?.riesgo || 'bajo',
    motivo: patient?.motivo || '',
  });
  const [sessionForm, setSessionForm] = useState(
    initialMatchedSession
      ? {
        citaId: initialMatchedSession.citaId || '',
        formato: initialMatchedSession.formato || 'simple',
        contenido: initialMatchedSession.contenido || '',
      }
      : {
        ...emptySessionForm,
        citaId: prefilledAppointmentId || '',
      },
  );
  const isPsychologist = currentUser?.role === 'psychologist';
  const adherence = useMemo(() => {
    if (!patient?.tareas?.length) return 0;
    const completed = patient.tareas.filter((task) => task.completada).length;
    return Math.round((completed / patient.tareas.length) * 100);
  }, [patient]);
  const sessions = useMemo(() => patient?.sesiones || [], [patient?.sesiones]);
  const pendingTasks = useMemo(() => (patient?.tareas || []).filter((task) => !task.completada), [patient?.tareas]);
  const patientAppointments = useMemo(
    () =>
      (appointments || [])
        .filter((appointment) => appointment.pacienteId === patient?.id)
        .sort((left, right) => {
          const leftKey = `${left.fecha}T${left.hora24}`;
          const rightKey = `${right.fecha}T${right.hora24}`;
          return rightKey.localeCompare(leftKey);
        }),
    [appointments, patient?.id],
  );
  const eligibleSessionAppointments = useMemo(
    () =>
      patientAppointments.filter(
        (appointment) =>
          appointment.estado === 'completada' &&
          appointment.fecha <= todayDate &&
          !sessions.some((session) => session.citaId === appointment.id),
      ),
    [patientAppointments, sessions, todayDate],
  );
  const appointmentSummary = useMemo(() => ({
    total: patientAppointments.length,
    completed: patientAppointments.filter((appointment) => appointment.estado === 'completada').length,
    upcoming: patientAppointments.filter((appointment) => appointment.fecha >= todayDate && appointment.estado !== 'cancelada').length,
  }), [patientAppointments, todayDate]);
  const appointmentSessionsMap = useMemo(() => new Map(sessions.filter((session) => session.citaId).map((session) => [session.citaId, session])), [sessions]);
  const upcomingAppointments = useMemo(
    () =>
      patientAppointments.filter(
        (appointment) => appointment.fecha >= todayDate && appointment.estado !== 'cancelada',
      ),
    [patientAppointments, todayDate],
  );

  if (!patient) return null;

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null;
  const selectedAppointment = patientAppointments.find((appointment) => appointment.id === sessionForm.citaId) || null;
  const sessionAppointmentOptions = (() => {
    if (!sessionForm.citaId) {
      return eligibleSessionAppointments;
    }

    const currentAppointment = patientAppointments.find((appointment) => appointment.id === sessionForm.citaId);

    if (!currentAppointment || eligibleSessionAppointments.some((appointment) => appointment.id === currentAppointment.id)) {
      return eligibleSessionAppointments;
    }

    return [currentAppointment, ...eligibleSessionAppointments];
  })();

  const resetSessionForm = () => {
    setSelectedSessionId(null);
    setSessionForm({
      citaId: prefilledAppointmentId || '',
      formato: 'simple',
      contenido: '',
    });
  };

  const handleAddTask = async () => {
    if (!taskText.trim() || isCreatingTask) return;
    const wasCreated = await onAddTask(taskText);

    if (wasCreated) {
      setTaskText('');
      setShowTaskInput(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!isPsychologist || isSavingPatientProfile) {
      return;
    }

    await onUpdatePatientProfile?.({
      riesgo: profileForm.riesgo,
      motivo: profileForm.motivo.trim(),
    });
  };

  const handleOpenSessionFromRecord = async (appointment) => {
    if (!appointment) {
      return;
    }

    const linkedSession = appointmentSessionsMap.get(appointment.id);

    if (linkedSession) {
      handleEditSession(linkedSession);
      return;
    }

    if (appointment.estado === 'completada') {
      setActiveSection('sesiones');
      setSelectedSessionId(null);
      setSessionForm({
        ...emptySessionForm,
        citaId: appointment.id,
      });
      return;
    }

    const wasOpened = await onOpenAppointmentSession?.(appointment, patient);

    if (wasOpened) {
      setActiveSection('sesiones');
      setSelectedSessionId(null);
      setSessionForm({
        ...emptySessionForm,
        citaId: appointment.id,
      });
    }
  };

  const handleEditSession = (session) => {
    setActiveSection('sesiones');
    setSelectedSessionId(session.id);
    setSessionForm({
      citaId: session.citaId || '',
      formato: session.formato || 'simple',
      contenido: session.contenido || '',
    });
  };

  const handleSaveSession = async () => {
    if (!sessionForm.citaId || !sessionForm.contenido.trim() || isSavingSession) {
      return;
    }

    const payload = {
      appointmentId: sessionForm.citaId,
      noteFormat: sessionForm.formato,
      content: sessionForm.contenido,
    };

    const wasSaved = selectedSession
      ? await onUpdateSession(selectedSession.id, payload)
      : await onCreateSession(payload);

    if (wasSaved) {
      resetSessionForm();
    }
  };

  const handleDeleteCurrentSession = async (sessionId) => {
    if (!window.confirm('Se eliminara esta nota de sesion. Deseas continuar?')) {
      return;
    }

    const wasDeleted = await onDeleteSession(sessionId);

    if (wasDeleted && selectedSessionId === sessionId) {
      resetSessionForm();
    }
  };

  const psychologistSections = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'sesiones', label: 'Sesiones' },
    { id: 'tareas', label: 'Tareas' },
    { id: 'nota-general', label: 'Nota general' },
  ];
  const patientSections = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'tareas', label: 'Tareas' },
  ];
  const visibleSections = isPsychologist ? psychologistSections : patientSections;

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 h-full animate-in slide-in-from-right-4 duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-3">
        <div className="order-2 md:order-1 text-center md:text-left">
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">{patient.nombre}</h2>
          <p className="text-gray-500 flex items-center justify-center md:justify-start mt-1 text-sm">
            <span className={`px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold border mr-2 md:mr-3 ${getRiskColor(patient.riesgo)} uppercase`}>
              Riesgo {patient.riesgo}
            </span>
            {getPatientSummary(patient)}
          </p>
        </div>
        <button onClick={() => setVistaActiva('dashboard')} className="order-1 md:order-2 self-start md:self-auto text-gray-500 hover:text-gray-800 transition font-medium bg-gray-100 md:bg-transparent px-3 py-1.5 md:p-0 rounded-lg text-sm md:text-base">
          Volver
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
        {visibleSections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activeSection === section.id ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {isPsychologist ? (
            <>
              {activeSection === 'resumen' && <FutureFeatureCard title="Asistente Clinico IA" description="Mantuvimos el modulo visible, bloqueado y marcado como proxima fase para no perder el concepto del producto." />}

              {activeSection === 'resumen' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Agenda</p>
                      <p className="mt-2 text-3xl font-black text-indigo-900">{appointmentSummary.upcoming}</p>
                      <p className="mt-1 text-sm text-indigo-800">Citas activas de hoy en adelante.</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Sesiones</p>
                      <p className="mt-2 text-3xl font-black text-emerald-900">{sessions.length}</p>
                      <p className="mt-1 text-sm text-emerald-800">Notas clinicas registradas.</p>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Adherencia</p>
                      <p className="mt-2 text-3xl font-black text-amber-900">{adherence}%</p>
                      <p className="mt-1 text-sm text-amber-800">{pendingTasks.length} tarea(s) pendiente(s).</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Ficha del expediente</h3>
                          <p className="mt-1 text-sm text-slate-500">Actualiza el riesgo y el motivo de consulta sin salir del contexto clinico.</p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${getRiskColor(profileForm.riesgo)}`}>
                          {profileForm.riesgo}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4">
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-slate-700">Nivel de riesgo</label>
                          <select
                            value={profileForm.riesgo}
                            onChange={(event) => setProfileForm((current) => ({ ...current, riesgo: event.target.value }))}
                            disabled={isSavingPatientProfile}
                            className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {riskOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-semibold text-slate-700">Motivo de consulta</label>
                          <textarea
                            value={profileForm.motivo}
                            onChange={(event) => setProfileForm((current) => ({ ...current, motivo: event.target.value }))}
                            disabled={isSavingPatientProfile}
                            rows="4"
                            className="w-full rounded-lg border border-gray-300 bg-white p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Resume el motivo principal de consulta o el encuadre actual del caso..."
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Ultima sesion</p>
                            <p className="mt-2 text-sm text-slate-700">{patient.ultimaSesion ? formatSessionDate(patient.ultimaSesion) : 'Sin sesiones registradas'}</p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Citas elegibles</p>
                            <p className="mt-2 text-sm text-slate-700">{eligibleSessionAppointments.length} cita(s) completada(s) listas para registrar sesion.</p>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleSaveProfile}
                            disabled={isSavingPatientProfile}
                            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <Save size={16} className="mr-2" /> {isSavingPatientProfile ? 'Guardando...' : 'Guardar ficha'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Proximas citas</h3>
                          <p className="mt-1 text-sm text-slate-500">Salta desde el expediente hacia la agenda o al registro de sesion cuando toque cerrar clinicamente.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onViewAppointments?.(upcomingAppointments[0]?.fecha || '')}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Ver agenda
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {upcomingAppointments.length > 0 ? upcomingAppointments.slice(0, 5).map((appointment) => {
                          const linkedSession = appointmentSessionsMap.get(appointment.id);
                          const canRegisterFromRecord = appointment.fecha <= todayDate && appointment.estado !== 'cancelada';

                          return (
                            <div key={appointment.id} className="rounded-xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-slate-800">{formatAppointmentDateTime(appointment)}</p>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getAppointmentStatusClasses(appointment.estado)}`}>
                                      {appointment.estado}
                                    </span>
                                    {linkedSession && (
                                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                        Sesion registrada
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-2 text-sm text-slate-600">
                                    {appointment.notas?.trim() ? appointment.notas : 'Sin notas logisticas registradas.'}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onViewAppointments?.(appointment.fecha)}
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                  >
                                    Abrir en agenda
                                  </button>
                                  {canRegisterFromRecord && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSessionFromRecord(appointment)}
                                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                                        linkedSession
                                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                          : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                      }`}
                                    >
                                      {linkedSession ? 'Ver sesion' : appointment.estado === 'completada' ? 'Registrar sesion' : 'Completar y registrar'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                            No hay citas activas de hoy en adelante para este paciente.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'sesiones' && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center">
                      <FileText className="mr-2 text-indigo-500" size={20} /> Historial de sesiones
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">Registra cada sesion por separado para construir un seguimiento clinico cronologico.</p>
                  </div>
                  <button onClick={resetSessionForm} className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    <Plus size={16} className="mr-2" /> Nueva sesion
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-slate-800">{selectedSession ? 'Editar sesion' : 'Registrar sesion'}</h4>
                        <p className="mt-1 text-xs text-slate-500">Puedes dejar nota simple hoy y migrar a SOAP mas adelante sin perder historial.</p>
                      </div>
                      {selectedSession && (
                        <button onClick={resetSessionForm} className="text-sm font-medium text-slate-500 transition hover:text-slate-800">
                          Limpiar
                        </button>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Cita vinculada</label>
                        <select value={sessionForm.citaId} onChange={(event) => setSessionForm((current) => ({ ...current, citaId: event.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">{sessionAppointmentOptions.length > 0 ? 'Selecciona una cita completada' : 'No hay citas elegibles'}</option>
                          {sessionAppointmentOptions.map((appointment) => (
                            <option key={appointment.id} value={appointment.id}>
                              {appointment.fecha} - {appointment.hora} - {appointment.estado}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          Solo se muestran citas completadas de hoy o anteriores.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Formato</label>
                        <select value={sessionForm.formato} onChange={(event) => setSessionForm((current) => ({ ...current, formato: event.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="simple">Simple</option>
                          <option value="soap">SOAP</option>
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          {selectedAppointment ? `Fecha derivada de la cita: ${selectedAppointment.fecha} a las ${selectedAppointment.hora}.` : 'Selecciona una cita para completar el registro.'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <div className="px-4 pt-4 flex gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${sessionForm.formato === 'simple' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>Simple</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${sessionForm.formato === 'soap' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>SOAP</span>
                      </div>
                      <textarea
                        value={sessionForm.contenido}
                        onChange={(event) => setSessionForm((current) => ({ ...current, contenido: event.target.value }))}
                        placeholder="Escribe el resumen clinico, observaciones, avances y recomendaciones de esta sesion..."
                        className="h-[260px] w-full resize-none bg-transparent p-4 leading-relaxed focus:outline-none"
                      />
                    </div>

                    <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      {selectedSession && (
                        <button onClick={() => handleDeleteCurrentSession(selectedSession.id)} disabled={processingSessionId === selectedSession.id} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed">
                          {processingSessionId === selectedSession.id ? 'Eliminando...' : 'Eliminar sesion'}
                        </button>
                      )}
                      <button onClick={handleSaveSession} disabled={isSavingSession || sessionAppointmentOptions.length === 0 || !sessionForm.citaId} className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed">
                        <Save size={16} className="mr-2" /> {isSavingSession ? 'Guardando...' : selectedSession ? 'Guardar cambios' : 'Guardar sesion'}
                      </button>
                    </div>
                    {eligibleSessionAppointments.length === 0 && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Primero debes completar una cita de hoy o anterior para poder registrar una sesion clinica.
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h4 className="font-semibold text-slate-800">Sesiones anteriores</h4>
                    <p className="mt-1 text-xs text-slate-500">Cada registro queda ordenado por fecha para consultar la evolucion del caso.</p>

                    <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1">
                      {sessions.length > 0 ? sessions.map((session) => (
                        <div key={session.id} className={`rounded-xl border p-4 transition ${selectedSessionId === session.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-800 capitalize">{formatSessionDate(session.fecha)}</p>
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                  {session.formato}
                                </span>
                              </div>
                              {session.citaId && (
                                <p className="mt-1 text-xs font-medium text-slate-500">
                                  Cita vinculada: {(patientAppointments.find((appointment) => appointment.id === session.citaId)?.fecha) || session.fecha}
                                </p>
                              )}
                              <p className="mt-2 text-sm text-slate-600 line-clamp-4 whitespace-pre-wrap">{session.contenido || 'Sin contenido registrado.'}</p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button onClick={() => handleEditSession(session)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                              Editar
                            </button>
                            <button onClick={() => handleDeleteCurrentSession(session.id)} disabled={processingSessionId === session.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed">
                              Eliminar
                            </button>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          Todavia no hay sesiones registradas para este paciente.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>}

              {activeSection === 'nota-general' && <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-4 border-b border-gray-200 bg-white">
                  <h3 className="font-semibold text-gray-800">Nota general del expediente</h3>
                  <p className="mt-1 text-xs text-gray-500">Este espacio queda para contexto transversal del caso, antecedentes o recordatorios clinicos no ligados a una sola sesion.</p>
                </div>
                <textarea
                  value={notesTemp}
                  onChange={(e) => setNotesTemp(e.target.value)}
                  placeholder="Escribe aqui la nota general del expediente..."
                  className="w-full h-[240px] p-4 bg-transparent focus:outline-none resize-none leading-relaxed"
                />
              </div>}

              {activeSection === 'nota-general' && <button
                onClick={onSaveNotes}
                disabled={isSavingNotes}
                className="flex items-center justify-center w-full px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Save size={18} className="mr-2" /> {isSavingNotes ? 'Guardando...' : 'Guardar nota general'}
              </button>}

              {activeSection === 'tareas' && (
                <div className="bg-gray-50 p-4 md:p-5 rounded-xl border border-gray-200">
                  <h3 className="font-bold text-gray-800 mb-2 flex items-center text-sm md:text-base">
                    <CheckSquare className="mr-2 text-indigo-500" size={20} /> Tareas Asignadas
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Adherencia actual: <span className="font-bold text-gray-700">{adherence}%</span>
                  </p>

                  <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
                    {!patient.tareas || patient.tareas.length === 0 ? (
                      <p className="text-sm text-gray-500 italic text-center py-4 bg-white rounded border border-dashed border-gray-300">No hay tareas pendientes</p>
                    ) : (
                      patient.tareas.map((task) => (
                        <div key={task.id} className="flex items-start bg-white p-3 rounded-lg border border-gray-200 group shadow-sm">
                          <input
                            type="checkbox"
                            checked={task.completada}
                            disabled={processingTaskId === task.id}
                            onChange={() => onToggleTask(task.id)}
                            className="mt-1 h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer shrink-0 disabled:cursor-not-allowed"
                          />
                          <span className={`ml-3 text-xs md:text-sm flex-1 ${task.completada ? 'line-through text-gray-400' : 'text-gray-700'}`}>{task.texto}</span>
                          <button
                            onClick={() => onDeleteTask(task.id)}
                            disabled={processingTaskId === task.id}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition ml-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {showTaskInput ? (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                      <textarea
                        autoFocus
                        value={taskText}
                        onChange={(e) => setTaskText(e.target.value)}
                        placeholder="Ej. Registro diario de emociones..."
                        className="w-full p-3 border border-indigo-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none mb-2 shadow-sm"
                        rows="2"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddTask();
                          }
                        }}
                      />
                      <div className="flex space-x-2">
                        <button onClick={() => setShowTaskInput(false)} disabled={isCreatingTask} className="flex-1 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:bg-gray-50 disabled:text-gray-400">
                          Cancelar
                        </button>
                        <button onClick={handleAddTask} disabled={isCreatingTask} className="flex-1 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed">
                          {isCreatingTask ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowTaskInput(true)} className="flex items-center justify-center w-full p-2.5 text-sm text-indigo-700 bg-indigo-100/50 border border-indigo-200 border-dashed rounded-lg hover:bg-indigo-100 transition font-medium">
                      <Plus size={16} className="mr-2" /> Asignar nueva tarea
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {activeSection === 'resumen' && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <div className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 border border-slate-200">
                    <Shield size={14} className="mr-2" /> Privacidad clinica
                  </div>
                  <h3 className="mt-4 text-xl font-black text-slate-900">Notas del terapeuta protegidas</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Las notas clinicas y el historial de sesiones del profesional no se muestran desde la cuenta del paciente. Aqui solo veras tu seguimiento, tareas y agenda.
                  </p>
                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Citas</p>
                      <p className="mt-2 text-3xl font-black text-indigo-900">{appointmentSummary.upcoming}</p>
                      <p className="mt-1 text-sm text-indigo-800">Sesiones activas de hoy en adelante.</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Adherencia</p>
                      <p className="mt-2 text-3xl font-black text-emerald-900">{adherence}%</p>
                      <p className="mt-1 text-sm text-emerald-800">Progreso actual en tareas.</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Pendientes</p>
                      <p className="mt-2 text-3xl font-black text-amber-900">{pendingTasks.length}</p>
                      <p className="mt-1 text-sm text-amber-800">Tareas por completar.</p>
                    </div>
                  </div>
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Proximas citas</h3>
                        <p className="mt-1 text-sm text-slate-500">Consulta tus siguientes sesiones y abre la agenda cuando necesites revisar fechas.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onViewAppointments?.(upcomingAppointments[0]?.fecha || '')}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Ver agenda
                      </button>
                    </div>
                    <div className="mt-4 space-y-3">
                      {upcomingAppointments.length > 0 ? upcomingAppointments.slice(0, 3).map((appointment) => (
                        <div key={appointment.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-800">{formatAppointmentDateTime(appointment)}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getAppointmentStatusClasses(appointment.estado)}`}>
                              {appointment.estado}
                            </span>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                          No hay citas activas programadas en este momento.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'tareas' && (
                <div className="bg-gray-50 p-4 md:p-5 rounded-xl border border-gray-200">
                  <h3 className="font-bold text-gray-800 mb-2 flex items-center text-sm md:text-base">
                    <CheckSquare className="mr-2 text-indigo-500" size={20} /> Mis tareas
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Adherencia actual: <span className="font-bold text-gray-700">{adherence}%</span>
                  </p>

                  <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
                    {!patient.tareas || patient.tareas.length === 0 ? (
                      <p className="text-sm text-gray-500 italic text-center py-4 bg-white rounded border border-dashed border-gray-300">No hay tareas pendientes</p>
                    ) : (
                      patient.tareas.map((task) => (
                        <div key={task.id} className="flex items-start bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                          <input
                            type="checkbox"
                            checked={task.completada}
                            disabled={processingTaskId === task.id}
                            onChange={() => onToggleTask(task.id)}
                            className="mt-1 h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer shrink-0 disabled:cursor-not-allowed"
                          />
                          <span className={`ml-3 text-xs md:text-sm flex-1 ${task.completada ? 'line-through text-gray-400' : 'text-gray-700'}`}>{task.texto}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-4">
          {isPsychologist && patient.riesgo === 'alto' && (
            <div className="bg-red-50 p-4 md:p-5 rounded-xl border border-red-200 shadow-sm animate-in zoom-in duration-300">
              <h3 className="font-bold text-red-800 mb-2 flex items-center text-sm md:text-base">
                <AlertCircle size={18} className="mr-2" />
                Protocolo de Crisis
              </h3>
              <p className="text-xs md:text-sm text-red-600 mb-4">Verificar red de apoyo y recursos disponibles.</p>
              <button className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-red-700 transition">Ver Contactos</button>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-bold text-slate-900">Ficha rapida</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Motivo</p>
                <p className="mt-2 text-slate-700">{patient.motivo || 'Motivo no registrado'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Ultima sesion</p>
                <p className="mt-2 text-slate-700">{patient.ultimaSesion ? formatSessionDate(patient.ultimaSesion) : 'Sin sesiones registradas'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Tareas pendientes</p>
                <p className="mt-2 text-slate-700">{pendingTasks.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Citas registradas</p>
                <p className="mt-2 text-slate-700">{appointmentSummary.total}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
