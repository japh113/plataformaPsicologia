import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckSquare,
  Clock3,
  FileText,
  Plus,
  Save,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { getRiskColor } from '../utils/risk';
import FutureFeatureCard from '../components/shared/FutureFeatureCard';
import { getAppointmentDisplayStatus, isAppointmentOverdue } from '../mappers/appointments';

const emptySessionForm = {
  citaId: '',
  objetivo: '',
  observaciones: '',
  proximoPaso: '',
  contenido: '',
};

const riskOptions = [
  { value: 'sin riesgo', label: 'Sin riesgo' },
  { value: 'bajo', label: 'Bajo' },
  { value: 'medio', label: 'Medio' },
  { value: 'alto', label: 'Alto' },
];

const statusOptions = [
  { value: 'activo', label: 'Activo' },
  { value: 'en pausa', label: 'En pausa' },
  { value: 'de baja', label: 'De baja' },
  { value: 'de alta', label: 'De alta' },
];

const agendaFilterOptions = [
  { id: 'proximas', label: 'Proximas' },
  { id: 'por-cerrar', label: 'Por cerrar' },
  { id: 'historial', label: 'Historial' },
];

const getPatientAgeLabel = (patient) => (
  patient.edad === null || typeof patient.edad === 'undefined' ? 'Edad no registrada' : `${patient.edad} anos`
);

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

const getRelativeLastSessionLabel = (value, todayDate) => {
  if (!value || !todayDate) {
    return '';
  }

  const [fromYear = '0', fromMonth = '1', fromDay = '1'] = String(value).split('-');
  const [toYear = '0', toMonth = '1', toDay = '1'] = String(todayDate).split('-');
  const fromDate = new Date(Number(fromYear), Number(fromMonth) - 1, Number(fromDay));
  const toDate = new Date(Number(toYear), Number(toMonth) - 1, Number(toDay));
  const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000);

  if (!Number.isFinite(diffDays) || diffDays < 0) {
    return '';
  }

  if (diffDays === 0) {
    return 'Hoy';
  }

  if (diffDays === 1) {
    return 'Hace 1 dia';
  }

  if (diffDays < 7) {
    return `Hace ${diffDays} dias`;
  }

  const diffWeeks = Math.floor(diffDays / 7);

  if (diffWeeks === 1) {
    return 'Hace 1 semana';
  }

  if (diffDays < 30) {
    return `Hace ${diffWeeks} semanas`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths <= 1 ? 'Hace 1 mes' : `Hace ${diffMonths} meses`;
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

const getStatusBadgeClasses = (status) => (
  status === 'en pausa'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : status === 'de alta'
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : status === 'de baja'
        ? 'border-slate-200 bg-slate-100 text-slate-600'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
);

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

const buildProfileForm = (patient) => ({
  riesgo: patient?.riesgo || 'sin riesgo',
  estado: patient?.estado || 'activo',
  motivo: patient?.motivo || '',
});

function ModalShell({ title, description, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h3 className="text-xl font-black text-slate-900">{title}</h3>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function SectionCard({ title, description, action, children }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      {(title || description || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-xl font-black text-slate-900">{title}</h3>}
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={title || description || action ? 'mt-5' : ''}>{children}</div>
    </div>
  );
}

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
  onToggleObjective,
  onDeleteObjective,
  onAddObjective,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  isSavingNotes = false,
  isSavingPatientProfile = false,
  isSavingSession = false,
  isCreatingTask = false,
  processingTaskId = null,
  isCreatingObjective = false,
  processingObjectiveId = null,
  processingSessionId = null,
}) {
  const initialMatchedSession = patient?.sesiones?.find((session) => session.citaId === (prefilledAppointmentId || null)) || null;
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [showObjectiveInput, setShowObjectiveInput] = useState(false);
  const [objectiveText, setObjectiveText] = useState('');
  const [activeSection, setActiveSection] = useState(initialMatchedSession || prefilledAppointmentId ? 'sesiones' : 'resumen');
  const [selectedSessionId, setSelectedSessionId] = useState(initialMatchedSession?.id || null);
  const [showSessionModal, setShowSessionModal] = useState(Boolean(initialMatchedSession || prefilledAppointmentId));
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [agendaFilter, setAgendaFilter] = useState('proximas');
  const [profileForm, setProfileForm] = useState(buildProfileForm(patient));
  const [sessionForm, setSessionForm] = useState(
    initialMatchedSession
      ? {
        citaId: initialMatchedSession.citaId || '',
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
  const pendingObjectives = useMemo(() => (patient?.objetivos || []).filter((objective) => !objective.completada), [patient?.objetivos]);
  const completedObjectives = useMemo(() => (patient?.objetivos || []).filter((objective) => objective.completada), [patient?.objetivos]);
  const adherence = patient?.tareas?.length
    ? Math.round((completedTasks.length / patient.tareas.length) * 100)
    : 0;
  const objectivesProgress = patient?.objetivos?.length
    ? Math.round((completedObjectives.length / patient.objetivos.length) * 100)
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
      sortAppointmentsDesc(
        patientAppointments.filter((appointment) => appointment.fecha < todayDate || appointment.estado === 'cancelada'),
      ),
    [patientAppointments, todayDate],
  );

  if (!patient) {
    return null;
  }

  const patientRisk = patient.riesgo || 'sin riesgo';
  const patientStatus = patient.estado || 'activo';
  const patientReason = patient.motivo?.trim() || '';
  const nextAppointment = upcomingAppointments[0] || null;
  const latestSession = sessions[0] || null;
  const completedAppointmentsWithoutSession = patientAppointments.filter((appointment) => appointment.estado === 'completada' && !appointmentSessionsMap.has(appointment.id));
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null;
  const selectedAppointment = patientAppointments.find((appointment) => appointment.id === sessionForm.citaId) || null;
  const currentSessionAppointment = sessionForm.citaId
    ? patientAppointments.find((appointment) => appointment.id === sessionForm.citaId) || null
    : null;
  const sessionAppointmentOptions = currentSessionAppointment && !eligibleSessionAppointments.some((appointment) => appointment.id === currentSessionAppointment.id)
    ? [currentSessionAppointment, ...eligibleSessionAppointments]
    : eligibleSessionAppointments;

  const visibleSections = isPsychologist
    ? [
      { id: 'resumen', label: 'Resumen' },
      { id: 'agenda', label: 'Agenda' },
      { id: 'sesiones', label: 'Sesiones' },
      { id: 'tareas', label: 'Tareas' },
      { id: 'objetivos', label: 'Objetivos' },
      { id: 'nota-general', label: 'Nota general' },
    ]
    : [
      { id: 'resumen', label: 'Resumen' },
      { id: 'agenda', label: 'Agenda' },
      { id: 'tareas', label: 'Tareas' },
      { id: 'objetivos', label: 'Objetivos' },
    ];

  const resetSessionForm = () => {
    setSelectedSessionId(null);
    setSessionForm({
      ...emptySessionForm,
      citaId: prefilledAppointmentId || '',
    });
  };

  const closeSessionModal = () => {
    setShowSessionModal(false);
    resetSessionForm();
  };

  const openProfileModal = () => {
    setProfileForm(buildProfileForm(patient));
    setShowProfileModal(true);
  };

  const closeProfileModal = () => {
    setProfileForm(buildProfileForm(patient));
    setShowProfileModal(false);
  };

  const openNewSessionModal = (appointmentId = prefilledAppointmentId || '') => {
    setSelectedSessionId(null);
    setSessionForm({
      ...emptySessionForm,
      citaId: appointmentId,
    });
    setShowSessionModal(true);
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

    const wasUpdated = await onUpdatePatientProfile?.({
      riesgo: profileForm.riesgo,
      estado: profileForm.estado,
      motivo: profileForm.motivo.trim(),
    });
    if (wasUpdated) {
      setShowProfileModal(false);
    }
    return wasUpdated;
  };

  const handleEditSession = (session) => {
    setSelectedSessionId(session.id);
    setSessionForm({
      citaId: session.citaId || '',
      objetivo: session.objetivo || '',
      observaciones: session.observaciones || '',
      proximoPaso: session.proximoPaso || '',
      contenido: session.contenido || '',
    });
    setShowSessionModal(true);
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
      openNewSessionModal(appointment.id);
      return;
    }

    const wasOpened = await onOpenAppointmentSession?.(appointment, patient);

    if (wasOpened) {
      openNewSessionModal(appointment.id);
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
      noteFormat: 'simple',
      sessionObjective: sessionForm.objetivo,
      clinicalObservations: sessionForm.observaciones,
      nextSteps: sessionForm.proximoPaso,
      content: sessionForm.contenido,
    };

    const wasSaved = selectedSession
      ? await onUpdateSession(selectedSession.id, payload)
      : await onCreateSession(payload);

    if (wasSaved) {
      closeSessionModal();
    }
  };

  const handleDeleteCurrentSession = async (sessionId) => {
    if (!window.confirm('Se eliminara esta nota de sesion. Deseas continuar?')) {
      return;
    }

    const wasDeleted = await onDeleteSession(sessionId);

    if (wasDeleted) {
      closeSessionModal();
    }
  };

  const getAgendaEntries = () => {
    if (agendaFilter === 'por-cerrar') {
      return overduePendingAppointments;
    }

    if (agendaFilter === 'historial') {
      return recentAppointments;
    }

    return upcomingAppointments;
  };

  const renderAppointmentActions = (appointment) => {
    if (!appointment || !isPsychologist) {
      return null;
    }

    const linkedSession = appointmentSessionsMap.get(appointment.id);
    const canCancel = appointment.estado === 'pendiente' && isAppointmentOverdue(appointment);

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onViewAppointments?.(appointment.fecha)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Abrir agenda
        </button>
        {linkedSession ? (
          <button
            type="button"
            onClick={() => handleEditSession(linkedSession)}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            Ver sesion
          </button>
        ) : appointment.estado !== 'cancelada' ? (
          <button
            type="button"
            onClick={() => handleOpenSessionFromRecord(appointment)}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            {appointment.estado === 'completada' ? 'Registrar sesion' : 'Completar y registrar'}
          </button>
        ) : null}
        {canCancel && (
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

  const renderAppointmentRow = (appointment) => {
    const linkedSession = appointmentSessionsMap.get(appointment.id);
    const displayStatus = getAppointmentDisplayStatus(appointment);
    const isOverduePendingAppointment = isAppointmentOverdue(appointment);

    return (
      <div
        key={appointment.id}
        className={`rounded-2xl border px-4 py-4 ${isOverduePendingAppointment ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-white'}`}
      >
        <div className="flex flex-col gap-3">
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
          <p className="text-sm text-slate-500">{appointment.notas || 'Sin notas logisticas registradas.'}</p>
          {isOverduePendingAppointment && (
            <p className="text-xs font-medium text-amber-700">
              Esta cita ya paso y sigue abierta. Conviene cerrarla como completada o cancelada.
            </p>
          )}
          {renderAppointmentActions(appointment)}
        </div>
      </div>
    );
  };

  const renderSummaryOverview = () => (
    <div className="space-y-5">
      <SectionCard
        title="Resumen del caso"
        description="Lectura clinica breve del expediente, con edicion separada del resumen."
        action={isPsychologist ? (
          <button
            type="button"
            onClick={openProfileModal}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Editar ficha
          </button>
        ) : null}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {patientAppointments.length} cita(s)
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {sessions.length} sesion(es)
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {pendingTasks.length} tarea(s) pendiente(s)
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getRiskColor(patientRisk)}`}>
              Riesgo {patientRisk}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClasses(patientStatus)}`}>
              {patientStatus}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Proxima cita</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {nextAppointment ? formatAppointmentDateTime(nextAppointment) : 'Sin citas activas'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Ultima sesion</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {latestSession ? formatSessionDate(latestSession.fecha) : 'Sin sesiones registradas'}
              </p>
              {latestSession && (
                <p className="mt-1 text-xs text-slate-500">{getRelativeLastSessionLabel(latestSession.fecha, todayDate)}</p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Pendiente clinico</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {completedAppointmentsWithoutSession.length ? `${completedAppointmentsWithoutSession.length} cita(s) sin sesion` : 'Sin pendientes de documentacion'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Motivo de consulta</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {patientReason || 'Todavia no hay un motivo de consulta registrado.'}
            </p>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-[#fcfcfb] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Nota general del expediente</p>
                <p className="mt-1 text-sm text-slate-500">Vista previa del contexto transversal del caso.</p>
              </div>
              {isPsychologist && (
                <button
                  type="button"
                  onClick={() => setActiveSection('nota-general')}
                  className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Abrir completa
                </button>
              )}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {notesTemp?.trim() || 'Todavia no hay una nota general registrada para este expediente.'}
            </p>
          </div>
        </div>
      </SectionCard>

      {isPsychologist && (
        <FutureFeatureCard
          title="Asistente clinico IA"
          description="Se mantiene visible como siguiente fase, pero fuera del flujo principal para no contaminar la lectura del expediente."
        />
      )}
    </div>
  );

  const renderAgendaTab = () => {
    const entries = getAgendaEntries();

    return (
      <SectionCard
        title="Agenda del paciente"
        description="Una sola lista visible por vez para evitar saturar la pantalla."
        action={(
          <button
            type="button"
            onClick={() => onViewAppointments?.(nextAppointment?.fecha || todayDate)}
            className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Ver agenda completa
          </button>
        )}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {agendaFilterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setAgendaFilter(option.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  agendaFilter === option.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {entries.length > 0 ? entries.slice(0, 8).map((appointment) => renderAppointmentRow(appointment)) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-500">
                No hay elementos para esta vista de agenda.
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    );
  };

  const handleAddObjective = async () => {
    if (!objectiveText.trim() || isCreatingObjective) {
      return;
    }

    const wasCreated = await onAddObjective(objectiveText);

    if (wasCreated) {
      setObjectiveText('');
      setShowObjectiveInput(false);
    }
  };

  const renderSessionsTab = () => (
    <SectionCard
      title="Sesiones"
      description="El historial queda visible, pero el formulario vive en una modal para no cargar la pantalla."
      action={isPsychologist ? (
        <button
          type="button"
          onClick={() => openNewSessionModal()}
          className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Nueva sesion
        </button>
      ) : null}
    >
      <div className="space-y-3">
        {sessions.length > 0 ? sessions.map((session) => {
          const linkedAppointment = patientAppointments.find((appointment) => appointment.id === session.citaId);

          return (
            <div key={session.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900 capitalize">{formatSessionDate(session.fecha)}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {linkedAppointment ? `Cita vinculada: ${formatAppointmentDateTime(linkedAppointment)}` : 'Sin cita visible en agenda.'}
                  </p>
                  {(session.objetivo || session.proximoPaso) && (
                    <p className="mt-2 text-sm text-slate-700">
                      {session.objetivo || 'Sin objetivo documentado'}
                      {session.proximoPaso ? ` - ${session.proximoPaso}` : ''}
                    </p>
                  )}
                </div>
                {isPsychologist && (
                  <button
                    type="button"
                    onClick={() => handleEditSession(session)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Abrir sesion
                  </button>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-500">
            Todavia no hay sesiones registradas para este paciente.
          </div>
        )}
      </div>
    </SectionCard>
  );

  const renderTasksTab = () => (
    <SectionCard
      title={isPsychologist ? 'Plan de tareas' : 'Mis tareas'}
      description={isPsychologist ? 'Adherencia y tareas activas del paciente.' : 'Marca las tareas conforme las vayas completando.'}
      action={(
        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700">
          Adherencia {adherence}%
        </span>
      )}
    >
      <div className="space-y-3">
        {!patient.tareas || patient.tareas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-500">
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
              <span className={`ml-3 flex-1 text-sm ${task.completada ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{task.texto}</span>
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

        {isPsychologist && (
          showTaskInput ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
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
              className="inline-flex w-full items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 px-4 py-4 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
            >
              <Plus size={16} className="mr-2" /> Asignar nueva tarea
            </button>
          )
        )}
      </div>
    </SectionCard>
  );

  const renderObjectivesTab = () => (
    <SectionCard
      title={isPsychologist ? 'Objetivos del proceso' : 'Mis objetivos'}
      description={isPsychologist ? 'Seguimiento de objetivos clinicos y de proceso del paciente.' : 'Marca los objetivos conforme se vayan cumpliendo.'}
      action={(
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
          Avance {objectivesProgress}%
        </span>
      )}
    >
      <div className="space-y-3">
        {!patient.objetivos || patient.objetivos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-500">
            No hay objetivos registrados para este paciente.
          </div>
        ) : (
          patient.objetivos.map((objective) => (
            <div key={objective.id} className="group flex items-start rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <input
                type="checkbox"
                checked={objective.completada}
                disabled={processingObjectiveId === objective.id}
                onChange={() => onToggleObjective(objective.id)}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
              />
              <span className={`ml-3 flex-1 text-sm ${objective.completada ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{objective.texto}</span>
              {isPsychologist && (
                <button
                  type="button"
                  onClick={() => onDeleteObjective(objective.id)}
                  disabled={processingObjectiveId === objective.id}
                  className="ml-3 text-slate-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))
        )}

        {isPsychologist && (
          showObjectiveInput ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <textarea
                autoFocus
                value={objectiveText}
                onChange={(event) => setObjectiveText(event.target.value)}
                placeholder="Ej. Reducir evitacion social o establecer una rutina de sueno mas estable..."
                rows="3"
                className="w-full rounded-2xl border border-emerald-300 bg-slate-50 px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleAddObjective();
                  }
                }}
              />
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowObjectiveInput(false)}
                  disabled={isCreatingObjective}
                  className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAddObjective}
                  disabled={isCreatingObjective}
                  className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreatingObjective ? 'Guardando...' : 'Guardar objetivo'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowObjectiveInput(true)}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
            >
              <Plus size={16} className="mr-2" /> Agregar objetivo
            </button>
          )
        )}
      </div>
    </SectionCard>
  );

  const renderGeneralNoteTab = () => (
    <SectionCard
      title="Nota general del expediente"
      description="Contexto transversal del caso que no depende de una sola sesion."
    >
      <textarea
        value={notesTemp}
        onChange={(event) => setNotesTemp(event.target.value)}
        placeholder="Escribe aqui la nota general del expediente..."
        className="h-[320px] w-full rounded-3xl border border-slate-300 bg-slate-50 px-5 py-4 text-sm leading-6 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
    </SectionCard>
  );

  const renderPatientSummaryTab = () => (
    <div className="space-y-5">
      <SectionCard title="Resumen" description="Una vista simple de tu seguimiento actual.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Proxima cita</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {nextAppointment ? formatAppointmentDateTime(nextAppointment) : 'Sin citas programadas'}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Adherencia</p>
            <p className="mt-2 text-sm font-semibold text-emerald-900">{adherence}%</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Pendientes</p>
            <p className="mt-2 text-sm font-semibold text-amber-900">{pendingTasks.length} tarea(s)</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
            <Shield size={14} className="mr-2" /> Privacidad clinica
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Las notas clinicas y el historial profesional del terapeuta no se muestran aqui. Esta vista se concentra en tu agenda y tareas.
          </p>
        </div>
      </SectionCard>
    </div>
  );

  const renderActiveSection = () => {
    if (!isPsychologist) {
      if (activeSection === 'agenda') return renderAgendaTab();
      if (activeSection === 'tareas') return renderTasksTab();
      if (activeSection === 'objetivos') return renderObjectivesTab();
      return renderPatientSummaryTab();
    }

    if (activeSection === 'agenda') return renderAgendaTab();
    if (activeSection === 'sesiones') return renderSessionsTab();
    if (activeSection === 'tareas') return renderTasksTab();
    if (activeSection === 'objetivos') return renderObjectivesTab();
    if (activeSection === 'nota-general') return renderGeneralNoteTab();
    return renderSummaryOverview();
  };

  return (
    <>
      <div className="rounded-[30px] border border-slate-200 bg-slate-50 p-4 shadow-sm animate-in slide-in-from-right-4 duration-300 md:p-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setVistaActiva('dashboard')}
                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
              >
                <ArrowLeft size={14} className="mr-2" /> Volver
              </button>

              <div className="mt-5">
                <h2 className="text-3xl font-black tracking-tight text-slate-900">{patient.nombre}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">{getPatientAgeLabel(patient)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 lg:self-end">
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
                  onClick={() => openNewSessionModal()}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                    Nueva sesion
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {visibleSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeSection === section.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {renderActiveSection()}
          </div>

          <div className="hidden space-y-4 xl:sticky xl:top-6 xl:self-start xl:block">
            {isPsychologist && patient.riesgo === 'alto' && (
              <div className="rounded-[28px] border border-red-200 bg-red-50 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-red-100 p-3 text-red-700">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-900">Protocolo de crisis</h3>
                    <p className="mt-1 text-sm text-red-700">
                      Riesgo alto detectado. Conviene revisar red de apoyo y recursos inmediatos.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <SectionCard title="Objetivos">
              <div className="space-y-3 text-sm">
                {(patient.objetivos || []).length > 0 ? (
                  (patient.objetivos || []).slice(0, 5).map((objective) => (
                    <div key={objective.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-sm ${objective.completada ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{objective.texto}</p>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${objective.completada ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                          {objective.completada ? 'Completado' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    No hay objetivos registrados.
                  </div>
                )}
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Estado general</p>
                  <p className="mt-2 text-slate-700">{completedObjectives.length} completado(s) · {pendingObjectives.length} pendiente(s)</p>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>

      {showSessionModal && isPsychologist && (
        <ModalShell
          title={selectedSession ? 'Editar sesion' : 'Registrar sesion'}
          description="La nota queda ligada a una cita completada para mantener trazabilidad clinica."
          onClose={closeSessionModal}
        >
          <div className="space-y-4">
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
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Objetivo de la sesion</label>
              <textarea
                value={sessionForm.objetivo}
                onChange={(event) => setSessionForm((current) => ({ ...current, objetivo: event.target.value }))}
                disabled={isSavingSession}
                rows="3"
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
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {selectedAppointment && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Cita elegida: {formatAppointmentDateTime(selectedAppointment)}
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
        </ModalShell>
      )}

      {showProfileModal && isPsychologist && (
        <ModalShell
          title="Editar ficha del caso"
          description="Actualiza nivel de riesgo, estado del paciente y motivo de consulta sin convertir el resumen en un formulario."
          onClose={closeProfileModal}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Estado del paciente</label>
                <select
                  value={profileForm.estado}
                  onChange={(event) => setProfileForm((current) => ({ ...current, estado: event.target.value }))}
                  disabled={isSavingPatientProfile}
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
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

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeProfileModal}
                disabled={isSavingPatientProfile}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSavingPatientProfile}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={16} className="mr-2" />
                {isSavingPatientProfile ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}
