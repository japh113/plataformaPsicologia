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
import PatientInterviewModal from '../modals/PatientInterviewModal';
import {
  buildInterviewForm,
  formatInterviewDate,
  interviewIndicatorGroups,
} from '../utils/patientInterview';
import {
  agendaFilterOptions,
  buildProfileForm,
  emptySessionForm,
  formatAppointmentDateTime,
  formatSessionDate,
  getAppointmentDisplayStatus,
  getAppointmentStatusClasses,
  getOptionLabel,
  getPatientAgeLabel,
  getRelativeLastSessionLabel,
  getSessionCoverageClasses,
  getStatusBadgeClasses,
  isAppointmentOverdue,
  riskOptions,
  sortAppointmentsAsc,
  sortAppointmentsDesc,
  sortSessionsDesc,
  statusOptions,
} from './notesScreen.helpers';

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
  onToggleObjective,
  onDeleteObjective,
  onAddObjective,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onSaveInterview,
  isSavingNotes = false,
  isSavingPatientProfile = false,
  isSavingSession = false,
  isSavingInterview = false,
  processingTaskId = null,
  isCreatingObjective = false,
  processingObjectiveId = null,
  processingSessionId = null,
}) {
  const initialMatchedSession = patient?.sesiones?.find((session) => session.citaId === (prefilledAppointmentId || null)) || null;
  const [sessionTaskText, setSessionTaskText] = useState('');
  const [showObjectiveInput, setShowObjectiveInput] = useState(false);
  const [objectiveText, setObjectiveText] = useState('');
  const [activeSection, setActiveSection] = useState(initialMatchedSession || prefilledAppointmentId ? 'sesiones' : 'resumen');
  const [selectedSessionId, setSelectedSessionId] = useState(initialMatchedSession?.id || null);
  const [showSessionModal, setShowSessionModal] = useState(Boolean(initialMatchedSession || prefilledAppointmentId));
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [agendaFilter, setAgendaFilter] = useState('proximas');
  const [profileForm, setProfileForm] = useState(buildProfileForm(patient));
  const [interviewForm, setInterviewForm] = useState(buildInterviewForm(patient, todayDate));
  const [sessionForm, setSessionForm] = useState(
    initialMatchedSession
      ? {
        citaId: initialMatchedSession.citaId || '',
        objetivo: initialMatchedSession.objetivo || '',
        observaciones: initialMatchedSession.observaciones || '',
        proximoPaso: initialMatchedSession.proximoPaso || '',
        contenido: initialMatchedSession.contenido || '',
        tareas: (patient?.tareas || [])
          .filter((task) => task.sesionId === initialMatchedSession.id)
          .map((task) => ({
            id: task.id,
            texto: task.texto,
            completada: task.completada,
          })),
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
  const sortedObjectives = useMemo(
    () => [...pendingObjectives, ...completedObjectives],
    [pendingObjectives, completedObjectives],
  );
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

  const orphanTasks = useMemo(
    () =>
      (patient?.tareas || []).filter(
        (task) => !task.sesionId || !sessions.some((session) => session.id === task.sesionId),
      ),
    [patient?.tareas, sessions],
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
  const patientRiskLabel = getOptionLabel(riskOptions, patientRisk, patientRisk);
  const patientStatusLabel = getOptionLabel(statusOptions, patientStatus, patientStatus);
  const patientReason = patient.motivo?.trim() || '';
  const patientInterview = patient.entrevista || null;
  const hasCompletedInterview = Boolean(patient.entrevistaCompleta && patientInterview);
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
      { id: 'entrevista', label: 'Entrevista' },
      { id: 'agenda', label: 'Agenda' },
      { id: 'sesiones', label: 'Notas clinicas' },
      { id: 'objetivos', label: 'Objetivos' },
      { id: 'nota-general', label: 'Nota general' },
    ]
    : [
      { id: 'resumen', label: 'Resumen' },
      { id: 'entrevista', label: 'Entrevista' },
      { id: 'agenda', label: 'Agenda' },
      { id: 'sesiones', label: 'Notas clinicas' },
      { id: 'objetivos', label: 'Objetivos' },
    ];

  const resetSessionForm = () => {
    setSelectedSessionId(null);
    setSessionTaskText('');
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

  const openInterviewModal = () => {
    setInterviewForm(buildInterviewForm(patient, todayDate));
    setShowInterviewModal(true);
  };

  const closeInterviewModal = () => {
    setInterviewForm(buildInterviewForm(patient, todayDate));
    setShowInterviewModal(false);
  };

  const openNewSessionModal = (appointmentId = prefilledAppointmentId || '') => {
    setSelectedSessionId(null);
    setSessionTaskText('');
    setSessionForm({
      ...emptySessionForm,
      citaId: appointmentId,
    });
    setShowSessionModal(true);
  };

  const handleSessionTaskDraftChange = (taskId, field, value) => {
    setSessionForm((currentForm) => ({
      ...currentForm,
      tareas: (currentForm.tareas || []).map((task) => (
        task.id === taskId
          ? {
            ...task,
            [field]: value,
          }
          : task
      )),
    }));
  };

  const handleAddSessionTaskDraft = () => {
    if (!sessionTaskText.trim()) {
      return;
    }

    setSessionForm((currentForm) => ({
      ...currentForm,
      tareas: [
        ...(currentForm.tareas || []),
        {
          id: `draft-${Date.now()}`,
          texto: sessionTaskText.trim(),
          completada: false,
          isDraft: true,
        },
      ],
    }));
    setSessionTaskText('');
  };

  const handleRemoveSessionTaskDraft = (taskId) => {
    setSessionForm((currentForm) => ({
      ...currentForm,
      tareas: (currentForm.tareas || []).filter((task) => task.id !== taskId),
    }));
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
    setSessionTaskText('');
    setSessionForm({
      citaId: session.citaId || '',
      objetivo: session.objetivo || '',
      observaciones: session.observaciones || '',
      proximoPaso: session.proximoPaso || '',
      contenido: session.contenido || '',
      tareas: (patient?.tareas || [])
        .filter((task) => task.sesionId === session.id)
        .map((task) => ({
          id: task.id,
          texto: task.texto,
          completada: task.completada,
        })),
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

    const sessionTasksPayload = (sessionForm.tareas || [])
      .filter((task) => task.texto?.trim())
      .map((task) => {
        const baseTask = {
          text: task.texto.trim(),
          completed: Boolean(task.completada),
        };

        return String(task.id).startsWith('draft-')
          ? baseTask
          : {
            id: task.id,
            ...baseTask,
          };
      });

    const payload = {
      appointmentId: sessionForm.citaId,
      noteFormat: 'simple',
      clinicalNoteObjective: sessionForm.objetivo,
      clinicalObservations: sessionForm.observaciones,
      nextSteps: sessionForm.proximoPaso,
      content: sessionForm.contenido,
      tasks: sessionTasksPayload,
    };

    const wasSaved = selectedSession
      ? await onUpdateSession(selectedSession.id, payload)
      : await onCreateSession(payload);

    if (wasSaved) {
      closeSessionModal();
    }
  };

  const handleDeleteCurrentSession = async (sessionId) => {
    if (!window.confirm('Se eliminara esta nota clinica. Deseas continuar?')) {
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
            Ver nota clinica
          </button>
        ) : appointment.estado !== 'cancelada' ? (
          <button
            type="button"
            onClick={() => handleOpenSessionFromRecord(appointment)}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            {appointment.estado === 'completada' ? 'Registrar nota clinica' : 'Completar y registrar'}
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
                {linkedSession ? 'Nota clinica registrada' : 'Falta nota clinica'}
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              title="Ir al historial de agenda del paciente"
              aria-label="Ir al historial de agenda del paciente"
              onClick={() => {
                setAgendaFilter('historial');
                setActiveSection('agenda');
              }}
              className="inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                {patientAppointments.length} cita(s)
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                {sessions.length} nota(s) clinica(s)
              </span>
            </button>
            <button
              type="button"
              title="Ir a notas clinicas del paciente"
              aria-label="Ir a notas clinicas del paciente"
              onClick={() => setActiveSection('sesiones')}
              className="inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                {patient.tareas?.length || 0} tarea(s) asignada(s)
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                {pendingTasks.length} por completar
              </span>
            </button>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getRiskColor(patientRisk)}`}>
              Riesgo {patientRiskLabel}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClasses(patientStatus)}`}>
              {patientStatusLabel}
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
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Ultima nota clinica</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {latestSession ? formatSessionDate(latestSession.fecha) : 'Sin notas clinicas registradas'}
              </p>
              {latestSession && (
                <p className="mt-1 text-xs text-slate-500">{getRelativeLastSessionLabel(latestSession.fecha, todayDate)}</p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Citas por documentar</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {completedAppointmentsWithoutSession.length
                  ? `${completedAppointmentsWithoutSession.length} cita(s) completada(s) sin nota clinica`
                  : 'Sin citas pendientes de documentacion'}
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

  const handleInterviewFieldChange = (field, value) => {
    setInterviewForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleInterviewIndicatorToggle = (indicatorKey) => {
    setInterviewForm((currentForm) => ({
      ...currentForm,
      indicadores: {
        ...currentForm.indicadores,
        [indicatorKey]: !currentForm.indicadores?.[indicatorKey],
      },
    }));
  };

  const handleSaveInterview = async () => {
    if (!onSaveInterview || isSavingInterview) {
      return;
    }

    const wasSaved = await onSaveInterview(patient.id, interviewForm);

    if (wasSaved) {
      setShowInterviewModal(false);
    }
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
      title="Notas clinicas"
      description={isPsychologist ? 'Historial clinico y tareas asignadas por nota clinica.' : 'Seguimiento de tus notas clinicas y tareas entre consultas.'}
      action={isPsychologist ? (
        <button
          type="button"
          onClick={() => openNewSessionModal()}
          className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Nueva nota clinica
        </button>
      ) : null}
    >
      <div className="space-y-3">
        {sessions.length > 0 ? sessions.map((session) => {
          const linkedAppointment = patientAppointments.find((appointment) => appointment.id === session.citaId);
          const tasksForSession = (patient.tareas || []).filter((task) => task.sesionId === session.id);
          const pendingTasksForSession = tasksForSession.filter((task) => !task.completada);

          return (
            <div key={session.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900 capitalize">{formatSessionDate(session.fecha)}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {linkedAppointment ? `Cita vinculada: ${formatAppointmentDateTime(linkedAppointment)}` : 'Sin cita visible en agenda.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {tasksForSession.length} tarea(s)
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {pendingTasksForSession.length} pendiente(s)
                    </span>
                  </div>
                  {isPsychologist && (session.objetivo || session.proximoPaso) && (
                    <p className="mt-2 text-sm text-slate-700">
                      {session.objetivo || 'Sin objetivo documentado'}
                      {session.proximoPaso ? ` - ${session.proximoPaso}` : ''}
                    </p>
                  )}

                  <div className="mt-4 space-y-2">
                    {tasksForSession.length > 0 ? tasksForSession.map((task) => (
                      <div key={task.id} className="group flex items-start rounded-2xl border border-slate-200 bg-white px-4 py-3">
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
                    )) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500">
                        {isPsychologist ? 'Esta nota clinica no tiene tareas asignadas todavia.' : 'No se asignaron tareas en esta nota clinica.'}
                      </div>
                    )}
                  </div>
                </div>
                {isPsychologist && (
                  <button
                    type="button"
                    onClick={() => handleEditSession(session)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Abrir nota clinica
                  </button>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-500">
            Todavia no hay notas clinicas registradas para este paciente.
          </div>
        )}

        {orphanTasks.length > 0 && (
          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <div className="border-b border-slate-200 pb-3">
              <p className="text-sm font-semibold text-slate-900">Tareas sin nota clinica visible</p>
              <p className="mt-1 text-xs text-slate-500">Se conservan aqui para no perder seguimiento de datos anteriores.</p>
            </div>
            <div className="mt-4 space-y-3">
              {orphanTasks.map((task) => (
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
              ))}
            </div>
          </div>
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
          sortedObjectives.map((objective) => (
            <div key={objective.id} className="group flex items-start rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <input
                type="checkbox"
                checked={objective.completada}
                disabled={processingObjectiveId === objective.id}
                onChange={() => onToggleObjective(objective.id)}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
              />
              <span className={`ml-3 flex-1 text-sm ${objective.completada ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{objective.texto}</span>
              <span
                className={`ml-3 shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                  objective.completada
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700'
                }`}
              >
                {objective.completada ? 'Completado' : 'En proceso'}
              </span>
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

  const renderInterviewTab = () => (
    <SectionCard
      title="Entrevista inicial"
      description="Registro base del paciente al inicio del proceso clinico."
      action={
        isPsychologist ? (
          <button
            type="button"
            onClick={openInterviewModal}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {hasCompletedInterview ? 'Editar entrevista' : 'Registrar entrevista'}
          </button>
        ) : null
      }
    >
      {hasCompletedInterview ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_180px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Nombre</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{patient.nombre}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Edad</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{getPatientAgeLabel(patient)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Fecha</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{formatInterviewDate(patientInterview.fechaEntrevista)}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Fecha de nacimiento</p>
              <p className="mt-2 text-sm text-slate-700">{formatInterviewDate(patientInterview.fechaNacimiento)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Lugar de nacimiento</p>
              <p className="mt-2 text-sm text-slate-700">{patientInterview.lugarNacimiento || 'No registrado'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Ocupacion</p>
              <p className="mt-2 text-sm text-slate-700">{patientInterview.ocupacion || 'No registrado'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Hobbies</p>
              <p className="mt-2 text-sm text-slate-700">{patientInterview.hobbies || 'No registrado'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Estado civil</p>
              <p className="mt-2 text-sm text-slate-700">{patientInterview.estadoCivil || 'No registrado'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Quienes conforman su familia</p>
              <p className="mt-2 text-sm text-slate-700">{patientInterview.familia || 'No registrado'}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Con quienes vive</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{patientInterview.viveCon || 'No registrado'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Enfermedades fisicas</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{patientInterview.enfermedadesFisicas || 'No registrado'}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-lg font-black text-slate-900">Indicadores relevantes</h4>
            <div className="mt-4 grid gap-3">
              {interviewIndicatorGroups.map((group, index) => (
                <div key={`interview-readonly-${index}`} className="grid gap-3 md:grid-cols-2">
                  {group.map((indicator) => (
                    indicator ? (
                      <div
                        key={indicator.key}
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                          patientInterview.indicadores?.[indicator.key]
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        <span>{indicator.label}</span>
                        <span className="text-xs font-bold uppercase tracking-[0.16em]">
                          {patientInterview.indicadores?.[indicator.key] ? 'Si' : 'No'}
                        </span>
                      </div>
                    ) : (
                      <div key={`interview-readonly-empty-${index}`} className="hidden md:block" />
                    )
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-8 text-sm text-amber-700">
          {isPsychologist
            ? 'Este paciente aun no ha completado la entrevista inicial. Puedes registrarla desde aqui si hace falta.'
            : 'Tu entrevista inicial sigue pendiente. Debes completarla para continuar usando la plataforma.'}
        </div>
      )}
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
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Tareas pendientes</p>
            <p className="mt-2 text-sm font-semibold text-amber-900">{pendingTasks.length} de {patient.tareas?.length || 0}</p>
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
      if (activeSection === 'entrevista') return renderInterviewTab();
      if (activeSection === 'agenda') return renderAgendaTab();
      if (activeSection === 'objetivos') return renderObjectivesTab();
      if (activeSection === 'sesiones') return renderSessionsTab();
      return renderPatientSummaryTab();
    }

    if (activeSection === 'entrevista') return renderInterviewTab();
    if (activeSection === 'agenda') return renderAgendaTab();
    if (activeSection === 'sesiones') return renderSessionsTab();
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
                    Nueva nota clinica
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
                {sortedObjectives.length > 0 ? (
                  sortedObjectives.slice(0, 5).map((objective) => (
                    <div key={objective.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-sm ${objective.completada ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{objective.texto}</p>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${objective.completada ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                          {objective.completada ? 'Completado' : 'En proceso'}
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
                  <p className="mt-2 text-slate-700">{completedObjectives.length} completado(s) Â· {pendingObjectives.length} en proceso</p>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>

      {showSessionModal && isPsychologist && (
        <ModalShell
          title={selectedSession ? 'Editar nota clinica' : 'Registrar nota clinica'}
          description="La nota clinica queda ligada a una cita completada para mantener trazabilidad clinica."
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
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Objetivo de la nota clinica</label>
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

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Tareas entre sesiones</h4>
                  <p className="mt-1 text-xs text-slate-500">Asigna aqui las tareas que el paciente debe trabajar antes de la siguiente cita.</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {(sessionForm.tareas || []).length} tarea(s)
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {(sessionForm.tareas || []).length > 0 ? (
                  (sessionForm.tareas || []).map((task) => (
                    <div key={task.id} className="group flex items-start rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <input
                        type="checkbox"
                        checked={task.completada}
                        onChange={() => handleSessionTaskDraftChange(task.id, 'completada', !task.completada)}
                        disabled={isSavingSession}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
                      />
                      <input
                        type="text"
                        value={task.texto}
                        onChange={(event) => handleSessionTaskDraftChange(task.id, 'texto', event.target.value)}
                        disabled={isSavingSession}
                        className={`ml-3 flex-1 border-none bg-transparent px-0 py-0 text-sm focus:outline-none focus:ring-0 ${task.completada ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                        placeholder="Describe la tarea asignada..."
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSessionTaskDraft(task.id)}
                        disabled={isSavingSession}
                        className="ml-3 text-slate-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500">
                    Todavia no hay tareas en esta nota clinica.
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <textarea
                    value={sessionTaskText}
                    onChange={(event) => setSessionTaskText(event.target.value)}
                    disabled={isSavingSession}
                    rows="3"
                    placeholder="Ej. Registro diario de emociones, practica de respiracion o ejercicio de exposicion gradual..."
                    className="w-full rounded-2xl border border-indigo-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleAddSessionTaskDraft();
                      }
                    }}
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddSessionTaskDraft}
                      disabled={isSavingSession}
                      className="inline-flex items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Plus size={16} className="mr-2" /> Agregar tarea
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {selectedAppointment && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Cita elegida: {formatAppointmentDateTime(selectedAppointment)}
              </div>
            )}

            {eligibleSessionAppointments.length === 0 && !selectedSession && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Primero debes completar una cita de hoy o anterior para poder registrar una nota clinica.
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
                  {processingSessionId === selectedSession.id ? 'Eliminando...' : 'Eliminar nota clinica'}
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveSession}
                disabled={isSavingSession || sessionAppointmentOptions.length === 0 || !sessionForm.citaId}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={16} className="mr-2" />
                {isSavingSession ? 'Guardando...' : selectedSession ? 'Guardar cambios' : 'Guardar nota clinica'}
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

      {showInterviewModal && isPsychologist && (
        <PatientInterviewModal
          patient={patient}
          form={interviewForm}
          onChange={handleInterviewFieldChange}
          onToggleIndicator={handleInterviewIndicatorToggle}
          onSubmit={handleSaveInterview}
          isSubmitting={isSavingInterview}
          title={hasCompletedInterview ? 'Editar entrevista inicial' : 'Registrar entrevista inicial'}
          description="La entrevista queda visible para el paciente, pero solo el psicologo puede editarla despues de completada."
          allowClose
          onClose={closeInterviewModal}
        />
      )}
    </>
  );
}
