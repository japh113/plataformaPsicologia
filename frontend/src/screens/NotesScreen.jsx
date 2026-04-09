import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Clock3,
  FileText,
  Plus,
  Save,
  Shield,
  Sparkles,
  Stethoscope,
  Target,
  Trash2,
} from 'lucide-react';
import { getRiskColor } from '../utils/risk';
import FutureFeatureCard from '../components/shared/FutureFeatureCard';
import { getAppointmentDisplayStatus, isAppointmentOverdue } from '../mappers/appointments';

const emptySessionForm = {
  citaId: '',
  formato: 'simple',
  objetivo: '',
  observaciones: '',
  proximoPaso: '',
  contenido: '',
};

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
  status === 'por cerrar'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : status === 'completada'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'cancelada'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-indigo-200 bg-indigo-50 text-indigo-700'
);

const getSessionCoverageClasses = (hasSession) => (
  hasSession
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-sky-200 bg-sky-50 text-sky-700'
);

const getTabButtonClasses = (isActive) => (
  isActive
    ? 'bg-slate-900 text-white shadow-sm'
    : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
);

const getMetricCardClasses = (tone) => {
  if (tone === 'emerald') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }

  if (tone === 'sky') {
    return 'border-sky-200 bg-sky-50 text-sky-900';
  }

  if (tone === 'amber') {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }

  return 'border-slate-200 bg-slate-100 text-slate-900';
};

const sortAppointmentsAsc = (entries) => (
  [...entries].sort((left, right) => `${left.fecha}T${left.hora24}`.localeCompare(`${right.fecha}T${right.hora24}`))
);

const sortAppointmentsDesc = (entries) => (
  [...entries].sort((left, right) => `${right.fecha}T${right.hora24}`.localeCompare(`${left.fecha}T${left.hora24}`))
);

const sortSessionsDesc = (entries) => (
  [...entries].sort((left, right) => {
    const leftKey = `${left.fecha || '0000-00-00'}T${left.actualizadaEn || left.creadaEn || '00:00:00'}`;
    const rightKey = `${right.fecha || '0000-00-00'}T${right.actualizadaEn || right.creadaEn || '00:00:00'}`;
    return rightKey.localeCompare(leftKey);
  })
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
  onUpdateAppointmentStatus,
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
        objetivo: initialMatchedSession.objetivo || '',
        observaciones: initialMatchedSession.observaciones || '',
        proximoPaso: initialMatchedSession.proximoPaso || '',
        contenido: initialMatchedSession.contenido || '',
      }
      : {
        ...emptySessionForm,
        citaId: prefilledAppointmentId || '',
      },
  );

  const isPsychologist = currentUser?.role === 'psychologist';
  const sessions = useMemo(() => sortSessionsDesc(patient?.sesiones || []), [patient?.sesiones]);
  const pendingTasks = useMemo(() => (patient?.tareas || []).filter((task) => !task.completada), [patient?.tareas]);
  const completedTasks = useMemo(() => (patient?.tareas || []).filter((task) => task.completada), [patient?.tareas]);
  const adherence = patient?.tareas?.length
    ? Math.round((completedTasks.length / patient.tareas.length) * 100)
    : 0;

  const patientAppointments = useMemo(
    () =>
      sortAppointmentsDesc(
        (appointments || []).filter((appointment) => appointment.pacienteId === patient?.id),
      ),
    [appointments, patient?.id],
  );

  const appointmentSessionsMap = useMemo(
    () => new Map(sessions.filter((session) => session.citaId).map((session) => [session.citaId, session])),
    [sessions],
  );

  const appointmentSummary = useMemo(() => ({
    total: patientAppointments.length,
    completed: patientAppointments.filter((appointment) => appointment.estado === 'completada').length,
    upcoming: patientAppointments.filter((appointment) => appointment.estado !== 'cancelada' && !isAppointmentOverdue(appointment)).length,
  }), [patientAppointments]);

  const eligibleSessionAppointments = useMemo(
    () =>
      sortAppointmentsAsc(
        patientAppointments.filter(
          (appointment) =>
            appointment.estado === 'completada' &&
            appointment.fecha <= todayDate &&
            !sessions.some((session) => session.citaId === appointment.id),
        ),
      ),
    [patientAppointments, sessions, todayDate],
  );

  const upcomingAppointments = useMemo(
    () =>
      sortAppointmentsAsc(
        patientAppointments.filter((appointment) => appointment.fecha >= todayDate && appointment.estado !== 'cancelada'),
      ),
    [patientAppointments, todayDate],
  );

  const overduePendingAppointments = useMemo(
    () =>
      sortAppointmentsAsc(
        patientAppointments.filter((appointment) => appointment.estado === 'pendiente' && isAppointmentOverdue(appointment)),
      ),
    [patientAppointments],
  );

  const recentAppointments = useMemo(
    () =>
      patientAppointments.filter((appointment) => appointment.fecha < todayDate || appointment.estado === 'cancelada'),
    [patientAppointments, todayDate],
  );

  const nextAppointment = upcomingAppointments[0] || null;
  const latestSession = sessions[0] || null;
  const completedAppointmentsWithSession = patientAppointments.filter((appointment) => appointment.estado === 'completada' && appointmentSessionsMap.has(appointment.id));
  const completedAppointmentsWithoutSession = patientAppointments.filter((appointment) => appointment.estado === 'completada' && !appointmentSessionsMap.has(appointment.id));

  if (!patient) {
    return null;
  }

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null;
  const selectedAppointment = patientAppointments.find((appointment) => appointment.id === sessionForm.citaId) || null;
  const currentSessionAppointment = sessionForm.citaId
    ? patientAppointments.find((appointment) => appointment.id === sessionForm.citaId) || null
    : null;
  const sessionAppointmentOptions = currentSessionAppointment && !eligibleSessionAppointments.some((appointment) => appointment.id === currentSessionAppointment.id)
    ? [currentSessionAppointment, ...eligibleSessionAppointments]
    : eligibleSessionAppointments;

  const psychologistSections = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'agenda', label: 'Agenda' },
    { id: 'sesiones', label: 'Sesiones' },
    { id: 'tareas', label: 'Tareas' },
    { id: 'nota-general', label: 'Nota general' },
  ];

  const patientSections = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'agenda', label: 'Agenda' },
    { id: 'tareas', label: 'Tareas' },
  ];

  const visibleSections = isPsychologist ? psychologistSections : patientSections;

  const resetSessionForm = () => {
    setSelectedSessionId(null);
    setSessionForm({
      ...emptySessionForm,
      citaId: prefilledAppointmentId || '',
    });
  };

  const handleAddTask = async () => {
    if (!taskText.trim() || isCreatingTask) {
      return;
    }

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

  const handleEditSession = (session) => {
    setActiveSection('sesiones');
    setSelectedSessionId(session.id);
    setSessionForm({
      citaId: session.citaId || '',
      formato: session.formato || 'simple',
      objetivo: session.objetivo || '',
      observaciones: session.observaciones || '',
      proximoPaso: session.proximoPaso || '',
      contenido: session.contenido || '',
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

  const handleCancelAppointmentFromRecord = async (appointment) => {
    if (!appointment) {
      return;
    }

    if (!window.confirm('La cita se marcara como cancelada. Deseas continuar?')) {
      return;
    }

    await onUpdateAppointmentStatus?.(appointment, 'cancelada');
  };

  const handleSaveSession = async () => {
    if (!sessionForm.citaId || !sessionForm.contenido.trim() || isSavingSession) {
      return;
    }

    const payload = {
      appointmentId: sessionForm.citaId,
      noteFormat: sessionForm.formato,
      sessionObjective: sessionForm.objetivo,
      clinicalObservations: sessionForm.observaciones,
      nextSteps: sessionForm.proximoPaso,
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

  const renderAppointmentActions = (appointment) => {
    if (!appointment) {
      return null;
    }

    const linkedSession = appointmentSessionsMap.get(appointment.id);
    const canOpenFromExpedient = isPsychologist && appointment.estado !== 'cancelada';
    const canCancelFromExpedient = isPsychologist && appointment.estado === 'pendiente' && isAppointmentOverdue(appointment);

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onViewAppointments?.(appointment.fecha)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Abrir en agenda
        </button>
        {linkedSession && (
          <button
            type="button"
            onClick={() => handleEditSession(linkedSession)}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            Ver sesion
          </button>
        )}
        {!linkedSession && canOpenFromExpedient && (
          <button
            type="button"
            onClick={() => handleOpenSessionFromRecord(appointment)}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            {appointment.estado === 'completada' ? 'Registrar sesion' : 'Completar y registrar'}
          </button>
        )}
        {canCancelFromExpedient && (
          <button
            type="button"
            onClick={() => handleCancelAppointmentFromRecord(appointment)}
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
          >
            Cancelar
          </button>
        )}
      </div>
    );
  };

  const renderAppointmentRow = (appointment, variant = 'default') => {
    const linkedSession = appointmentSessionsMap.get(appointment.id);
    const displayStatus = getAppointmentDisplayStatus(appointment);
    const isOverduePendingAppointment = isAppointmentOverdue(appointment);
    const isCompact = variant === 'compact';

    return (
      <div
        key={appointment.id}
        className={`rounded-2xl border p-4 ${isOverduePendingAppointment ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-white'}`}
      >
        <div className={`flex ${isCompact ? 'flex-col gap-3 xl:flex-row xl:items-start xl:justify-between' : 'flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{formatAppointmentDateTime(appointment)}</p>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getAppointmentStatusClasses(displayStatus)}`}>
                {displayStatus}
              </span>
              {appointment.estado === 'completada' && (
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getSessionCoverageClasses(Boolean(linkedSession))}`}>
                  {linkedSession ? 'Sesion registrada' : 'Falta sesion'}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-500">{appointment.notas || 'Sin notas logisticas registradas.'}</p>
            {isOverduePendingAppointment && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Esta cita ya paso y sigue abierta. Conviene cerrarla como completada o cancelada.
              </p>
            )}
          </div>
          {isPsychologist && renderAppointmentActions(appointment)}
        </div>
      </div>
    );
  };

  const renderSummaryTab = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-2xl border p-5 ${getMetricCardClasses('slate')}`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Agenda activa</p>
          <p className="mt-3 text-3xl font-black">{appointmentSummary.upcoming}</p>
          <p className="mt-1 text-sm text-slate-600">Citas de hoy en adelante.</p>
        </div>
        <div className={`rounded-2xl border p-5 ${getMetricCardClasses('amber')}`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Por cerrar</p>
          <p className="mt-3 text-3xl font-black">{overduePendingAppointments.length}</p>
          <p className="mt-1 text-sm text-amber-800">Citas vencidas pendientes de cierre.</p>
        </div>
        <div className={`rounded-2xl border p-5 ${getMetricCardClasses('emerald')}`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Sesiones</p>
          <p className="mt-3 text-3xl font-black">{sessions.length}</p>
          <p className="mt-1 text-sm text-emerald-800">Notas clinicas registradas.</p>
        </div>
        <div className={`rounded-2xl border p-5 ${getMetricCardClasses('sky')}`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">Adherencia</p>
          <p className="mt-3 text-3xl font-black">{adherence}%</p>
          <p className="mt-1 text-sm text-sky-800">{pendingTasks.length} tarea(s) pendiente(s).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                <Stethoscope size={14} className="mr-2" /> Lectura clinica actual
              </p>
              <h3 className="mt-4 text-2xl font-black text-slate-900">Resumen del caso</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {patient.motivo || 'Todavia no hay un motivo de consulta registrado. Usa la ficha lateral para completar el contexto principal del caso.'}
              </p>
            </div>
            {nextAppointment && (
              <button
                type="button"
                onClick={() => onViewAppointments?.(nextAppointment.fecha)}
                className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Ver agenda
              </button>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Ultima sesion</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {latestSession ? formatSessionDate(latestSession.fecha) : 'Sin sesiones registradas'}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {latestSession?.objetivo || latestSession?.contenido || 'Cuando registres sesiones aqui veras el ultimo cierre clinico del paciente.'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Proxima cita</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {nextAppointment ? formatAppointmentDateTime(nextAppointment) : 'Sin citas activas'}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {nextAppointment?.notas || 'No hay notas logisticas registradas para la siguiente cita.'}
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Pendiente clinico</p>
              <p className="mt-3 text-lg font-semibold text-sky-900">
                {completedAppointmentsWithoutSession.length} cita(s) completada(s) sin sesion
              </p>
              <p className="mt-2 text-sm text-sky-800">
                {completedAppointmentsWithoutSession.length > 0
                  ? 'Conviene cerrar estas citas con una sesion clinica para que el expediente quede completo.'
                  : 'No hay cierres clinicos pendientes en este expediente.'}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Plan siguiente</p>
              <p className="mt-3 text-lg font-semibold text-emerald-900">
                {latestSession?.proximoPaso || 'Sin plan siguiente documentado'}
              </p>
              <p className="mt-2 text-sm text-emerald-800">
                Usa sesiones para dejar clara la siguiente accion terapeutica o la tarea sugerida.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <CalendarDays size={18} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Movimiento inmediato</h3>
                <p className="text-sm text-slate-500">Lo mas urgente o proximo del expediente.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {overduePendingAppointments.slice(0, 2).map((appointment) => renderAppointmentRow(appointment, 'compact'))}
              {!overduePendingAppointments.length && nextAppointment && renderAppointmentRow(nextAppointment, 'compact')}
              {!overduePendingAppointments.length && !nextAppointment && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No hay citas activas por revisar en este momento.
                </div>
              )}
            </div>
          </div>

          <FutureFeatureCard
            title="Asistente clinico IA"
            description="Se mantiene visible como siguiente capa del producto: resumenes de sesion, transcripcion y apoyo documental sin perder el foco del MVP."
          />
        </div>
      </div>
    </div>
  );

  const renderAgendaTab = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Por cerrar</p>
          <p className="mt-3 text-3xl font-black text-amber-900">{overduePendingAppointments.length}</p>
          <p className="mt-1 text-sm text-amber-800">Citas vencidas que aun requieren cierre.</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Con sesion</p>
          <p className="mt-3 text-3xl font-black text-emerald-900">{completedAppointmentsWithSession.length}</p>
          <p className="mt-1 text-sm text-emerald-800">Citas completadas ya documentadas.</p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">Sin sesion</p>
          <p className="mt-3 text-3xl font-black text-sky-900">{completedAppointmentsWithoutSession.length}</p>
          <p className="mt-1 text-sm text-sky-800">Citas completadas que aun no se documentan.</p>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-900">Agenda del paciente</h3>
            <p className="mt-1 text-sm text-slate-500">
              Revisa rapido lo vencido, lo proximo y el historial reciente sin salir del expediente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onViewAppointments?.(nextAppointment?.fecha || todayDate)}
            className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Ver agenda completa
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="space-y-4">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Clock3 size={16} className="text-amber-600" />
                <h4 className="font-semibold text-slate-900">Por cerrar clinicamente</h4>
              </div>
              <div className="space-y-3">
                {overduePendingAppointments.length > 0 ? overduePendingAppointments.map((appointment) => renderAppointmentRow(appointment)) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No hay citas vencidas pendientes de cierre.
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays size={16} className="text-indigo-600" />
                <h4 className="font-semibold text-slate-900">Proximas citas</h4>
              </div>
              <div className="space-y-3">
                {upcomingAppointments.length > 0 ? upcomingAppointments.slice(0, 6).map((appointment) => renderAppointmentRow(appointment)) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No hay citas activas programadas en este momento.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <ClipboardList size={16} className="text-slate-600" />
              <h4 className="font-semibold text-slate-900">Historial reciente</h4>
            </div>
            <div className="space-y-3">
              {recentAppointments.length > 0 ? recentAppointments.slice(0, 8).map((appointment) => renderAppointmentRow(appointment)) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Todavia no hay movimiento historico en la agenda de este paciente.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSessionsTab = () => (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-900">Historial de sesiones</h3>
            <p className="mt-1 text-sm text-slate-500">Cada registro queda anclado a una cita para mantener la trazabilidad clinica.</p>
          </div>
          <button
            type="button"
            onClick={resetSessionForm}
            className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Nueva sesion
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {sessions.length > 0 ? sessions.map((session) => {
            const linkedAppointment = patientAppointments.find((appointment) => appointment.id === session.citaId);

            return (
              <div
                key={session.id}
                className={`rounded-3xl border p-5 transition ${selectedSessionId === session.id ? 'border-indigo-200 bg-indigo-50/70 shadow-sm' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900 capitalize">{formatSessionDate(session.fecha)}</p>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {session.formato}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {linkedAppointment ? `Cita vinculada: ${formatAppointmentDateTime(linkedAppointment)}` : 'Sin cita visible en agenda.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditSession(session)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCurrentSession(session.id)}
                      disabled={processingSessionId === session.id}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {processingSessionId === session.id ? 'Eliminando...' : 'Eliminar'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Objetivo</p>
                    <p className="mt-2 text-sm text-slate-700">{session.objetivo || 'Sin objetivo documentado'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Plan siguiente</p>
                    <p className="mt-2 text-sm text-slate-700">{session.proximoPaso || 'Sin plan siguiente documentado'}</p>
                  </div>
                </div>

                {session.observaciones && (
                  <div className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Observaciones</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{session.observaciones}</p>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Contenido</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {session.contenido || 'Sin contenido registrado.'}
                  </p>
                </div>
              </div>
            );
          }) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Todavia no hay sesiones registradas para este paciente.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
            <FileText size={18} />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900">
              {selectedSession ? 'Editar sesion' : 'Registrar sesion'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              El registro queda ligado a una cita completada de hoy o anterior.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Cita vinculada</label>
            <select
              value={sessionForm.citaId}
              onChange={(event) => setSessionForm((current) => ({ ...current, citaId: event.target.value }))}
              disabled={isSavingSession}
              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">Selecciona una cita</option>
              {sessionAppointmentOptions.map((appointment) => (
                <option key={appointment.id} value={appointment.id}>
                  {formatAppointmentDateTime(appointment)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Formato</label>
            <select
              value={sessionForm.formato}
              onChange={(event) => setSessionForm((current) => ({ ...current, formato: event.target.value }))}
              disabled={isSavingSession}
              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="simple">Simple</option>
              <option value="soap">SOAP</option>
              <option value="libre">Libre</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Objetivo de la sesion</label>
            <textarea
              value={sessionForm.objetivo}
              onChange={(event) => setSessionForm((current) => ({ ...current, objetivo: event.target.value }))}
              disabled={isSavingSession}
              rows="3"
              placeholder="Que se buscaba trabajar en esta sesion..."
              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Observaciones y evolucion</label>
            <textarea
              value={sessionForm.observaciones}
              onChange={(event) => setSessionForm((current) => ({ ...current, observaciones: event.target.value }))}
              disabled={isSavingSession}
              rows="4"
              placeholder="Cambios observados, tono emocional, avances o resistencias..."
              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Plan siguiente</label>
            <textarea
              value={sessionForm.proximoPaso}
              onChange={(event) => setSessionForm((current) => ({ ...current, proximoPaso: event.target.value }))}
              disabled={isSavingSession}
              rows="3"
              placeholder="Siguiente foco terapeutico, tarea o seguimiento recomendado..."
              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Nota clinica</label>
            <textarea
              value={sessionForm.contenido}
              onChange={(event) => setSessionForm((current) => ({ ...current, contenido: event.target.value }))}
              disabled={isSavingSession}
              rows="8"
              placeholder="Registra el desarrollo clinico de la sesion..."
              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {selectedAppointment && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Cita elegida</p>
              <p className="mt-2 text-sm text-slate-700">{formatAppointmentDateTime(selectedAppointment)}</p>
            </div>
          )}

          {eligibleSessionAppointments.length === 0 && !selectedSession && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Primero debes completar una cita de hoy o anterior para poder registrar una sesion clinica.
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {selectedSession && (
              <button
                type="button"
                onClick={() => handleDeleteCurrentSession(selectedSession.id)}
                disabled={processingSessionId === selectedSession.id}
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingSessionId === selectedSession.id ? 'Eliminando...' : 'Eliminar sesion'}
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveSession}
              disabled={isSavingSession || sessionAppointmentOptions.length === 0 || !sessionForm.citaId}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} className="mr-2" />
              {isSavingSession ? 'Guardando...' : selectedSession ? 'Guardar cambios' : 'Guardar sesion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTasksTab = () => (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-900">{isPsychologist ? 'Plan de tareas' : 'Mis tareas'}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {isPsychologist
                ? 'Da seguimiento a la adherencia del paciente y asigna nuevas practicas desde el expediente.'
                : 'Marca cada tarea cuando la completes para mantener actualizado tu seguimiento.'}
            </p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">Adherencia</p>
            <p className="mt-1 text-2xl font-black text-sky-900">{adherence}%</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {!patient.tareas || patient.tareas.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No hay tareas registradas para este paciente.
            </div>
          ) : (
            patient.tareas.map((task) => (
              <div key={task.id} className="group flex items-start rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <input
                  type="checkbox"
                  checked={task.completada}
                  disabled={processingTaskId === task.id}
                  onChange={() => onToggleTask(task.id)}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
                />
                <div className="ml-3 flex-1">
                  <p className={`text-sm ${task.completada ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{task.texto}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {task.completada ? 'Completada por el paciente.' : 'Sigue pendiente de seguimiento.'}
                  </p>
                </div>
                {isPsychologist && (
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    disabled={processingTaskId === task.id}
                    className="ml-3 text-slate-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
              <CheckSquare size={18} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Estado del trabajo entre sesiones</h3>
              <p className="text-sm text-slate-500">Lectura rapida del avance del paciente fuera del consultorio.</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Completadas</p>
              <p className="mt-2 text-3xl font-black text-emerald-900">{completedTasks.length}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Pendientes</p>
              <p className="mt-2 text-3xl font-black text-amber-900">{pendingTasks.length}</p>
            </div>
          </div>
        </div>

        {isPsychologist && (
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Nueva tarea</h3>
            <p className="mt-1 text-sm text-slate-500">Deja una instruccion concreta que el paciente pueda completar antes de la siguiente cita.</p>

            {showTaskInput ? (
              <div className="mt-5 animate-in fade-in zoom-in-95 duration-200">
                <textarea
                  autoFocus
                  value={taskText}
                  onChange={(event) => setTaskText(event.target.value)}
                  placeholder="Ej. Registro diario de emociones o practica breve de respiracion..."
                  rows="3"
                  className="w-full rounded-2xl border border-indigo-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleAddTask();
                    }
                  }}
                />
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowTaskInput(false)}
                    disabled={isCreatingTask}
                    className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAddTask}
                    disabled={isCreatingTask}
                    className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingTask ? 'Guardando...' : 'Guardar tarea'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowTaskInput(true)}
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 px-4 py-4 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
              >
                <Plus size={16} className="mr-2" /> Asignar nueva tarea
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderGeneralNoteTab = () => (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <FileText size={18} />
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-900">Nota general del expediente</h3>
          <p className="mt-1 text-sm text-slate-500">
            Usa este espacio para contexto transversal del caso, antecedentes, hallazgos o recordatorios clinicos que no pertenecen a una sesion puntual.
          </p>
        </div>
      </div>

      <textarea
        value={notesTemp}
        onChange={(event) => setNotesTemp(event.target.value)}
        placeholder="Escribe aqui la nota general del expediente..."
        className="mt-6 h-[320px] w-full rounded-3xl border border-slate-300 bg-slate-50 px-5 py-4 text-sm leading-6 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onSaveNotes}
          disabled={isSavingNotes}
          className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={16} className="mr-2" />
          {isSavingNotes ? 'Guardando...' : 'Guardar nota general'}
        </button>
      </div>
    </div>
  );

  const renderPatientSummaryTab = () => (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          <Shield size={14} className="mr-2" /> Privacidad clinica
        </div>
        <h3 className="mt-4 text-2xl font-black text-slate-900">Seguimiento visible para el paciente</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Las notas clinicas del terapeuta y el historial de sesiones profesionales no se muestran aqui. Esta vista prioriza tu agenda, tareas y continuidad del proceso.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Citas activas</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{appointmentSummary.upcoming}</p>
            <p className="mt-1 text-sm text-slate-600">De hoy en adelante.</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Adherencia</p>
            <p className="mt-3 text-3xl font-black text-emerald-900">{adherence}%</p>
            <p className="mt-1 text-sm text-emerald-800">Progreso actual en tareas.</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Pendientes</p>
            <p className="mt-3 text-3xl font-black text-amber-900">{pendingTasks.length}</p>
            <p className="mt-1 text-sm text-amber-800">Tareas por completar.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-900">Tu agenda</h3>
              <p className="mt-1 text-sm text-slate-500">Consulta tus siguientes sesiones y abre la agenda completa cuando necesites revisar fechas.</p>
            </div>
            <button
              type="button"
              onClick={() => onViewAppointments?.(nextAppointment?.fecha || todayDate)}
              className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Ver agenda
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {upcomingAppointments.length > 0 ? upcomingAppointments.slice(0, 4).map((appointment) => renderAppointmentRow(appointment)) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                No hay citas activas programadas en este momento.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Enfoque actual</h3>
              <p className="text-sm text-slate-500">Resumen operativo de tu proceso.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Proxima cita</p>
              <p className="mt-2 text-sm text-slate-700">{nextAppointment ? formatAppointmentDateTime(nextAppointment) : 'Sin citas programadas'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Motivo de trabajo</p>
              <p className="mt-2 text-sm text-slate-700">{patient.motivo || 'Sin resumen disponible por ahora.'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Tareas pendientes</p>
              <p className="mt-2 text-sm text-slate-700">{pendingTasks.length} pendiente(s)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderActiveSection = () => {
    if (!isPsychologist) {
      if (activeSection === 'agenda') return renderAgendaTab();
      if (activeSection === 'tareas') return renderTasksTab();
      return renderPatientSummaryTab();
    }

    if (activeSection === 'agenda') return renderAgendaTab();
    if (activeSection === 'sesiones') return renderSessionsTab();
    if (activeSection === 'tareas') return renderTasksTab();
    if (activeSection === 'nota-general') return renderGeneralNoteTab();
    return renderSummaryTab();
  };

  return (
    <div className="rounded-[32px] border border-slate-200 bg-slate-50 p-4 shadow-sm animate-in slide-in-from-right-4 duration-300 md:p-6">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-white to-slate-100 p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setVistaActiva('dashboard')}
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft size={14} className="mr-2" /> Volver
            </button>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">{patient.nombre}</h2>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${getRiskColor(profileForm.riesgo)}`}>
                Riesgo {profileForm.riesgo}
              </span>
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{getPatientSummary(patient)}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                {appointmentSummary.total} cita(s)
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                {sessions.length} sesion(es)
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                {pendingTasks.length} tarea(s) pendiente(s)
              </span>
              {nextAppointment && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  Proxima: {formatAppointmentDateTime(nextAppointment)}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-[320px]">
            <button
              type="button"
              onClick={() => onViewAppointments?.(nextAppointment?.fecha || todayDate)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Ver agenda
            </button>
            {isPsychologist && (
              <button
                type="button"
                onClick={() => setActiveSection('sesiones')}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Nueva sesion
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm">
        {visibleSections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${getTabButtonClasses(activeSection === section.id)}`}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          {renderActiveSection()}
        </div>

        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          {isPsychologist && patient.riesgo === 'alto' && (
            <div className="rounded-[28px] border border-red-200 bg-red-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-red-100 p-3 text-red-700">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-900">Protocolo de crisis</h3>
                  <p className="mt-1 text-sm text-red-700">
                    Riesgo alto detectado. Conviene revisar red de apoyo, recursos inmediatos y plan de contencion.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <ClipboardList size={18} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Panel del caso</h3>
                <p className="text-sm text-slate-500">Contexto rapido mientras navegas el expediente.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Motivo de consulta</p>
                <p className="mt-2 text-sm text-slate-700">{patient.motivo || 'Motivo no registrado'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Ultima sesion</p>
                <p className="mt-2 text-sm text-slate-700">{patient.ultimaSesion ? formatSessionDate(patient.ultimaSesion) : 'Sin sesiones registradas'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Proxima cita</p>
                <p className="mt-2 text-sm text-slate-700">{nextAppointment ? formatAppointmentDateTime(nextAppointment) : 'Sin citas activas'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Sesiones</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">{sessions.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Pendientes</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">{pendingTasks.length}</p>
                </div>
              </div>
            </div>
          </div>

          {isPsychologist && (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <Target size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Ficha editable</h3>
                  <p className="text-sm text-slate-500">Actualiza riesgo y encuadre sin salir del expediente.</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Nivel de riesgo</label>
                  <select
                    value={profileForm.riesgo}
                    onChange={(event) => setProfileForm((current) => ({ ...current, riesgo: event.target.value }))}
                    disabled={isSavingPatientProfile}
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {riskOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Motivo de consulta</label>
                  <textarea
                    value={profileForm.motivo}
                    onChange={(event) => setProfileForm((current) => ({ ...current, motivo: event.target.value }))}
                    disabled={isSavingPatientProfile}
                    rows="5"
                    placeholder="Resume el motivo principal de consulta o el encuadre actual del caso..."
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={isSavingPatientProfile}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} className="mr-2" />
                  {isSavingPatientProfile ? 'Guardando...' : 'Guardar ficha'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
