const backendToUiRiskMap = {
  none: 'sin riesgo',
  low: 'bajo',
  medium: 'medio',
  high: 'alto',
};

const uiToBackendRiskMap = {
  'sin riesgo': 'none',
  bajo: 'low',
  medio: 'medium',
  alto: 'high',
};

const backendToUiStatusMap = {
  active: 'activo',
  paused: 'en pausa',
  inactive: 'de baja',
  discharged: 'de alta',
};

const uiToBackendStatusMap = {
  activo: 'active',
  'en pausa': 'paused',
  'de baja': 'inactive',
  'de alta': 'discharged',
};

const splitFullName = (fullName = '') => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || '';
  const lastName = parts.join(' ');

  return { firstName, lastName };
};

const normalizeNullableAge = (value) => {
  if (value === '' || value === null || typeof value === 'undefined') {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

export const mapBackendTaskToUiTask = (task) => ({
  id: String(task.id),
  texto: task.text || '',
  completada: Boolean(task.completed),
  sesionId: task.clinicalNoteId ? String(task.clinicalNoteId) : task.sessionId ? String(task.sessionId) : null,
  fechaSesion: task.clinicalNoteDate || task.sessionDate || null,
  objetivoSesion: task.clinicalNoteObjective || task.sessionObjective || '',
});

export const mapBackendSessionToUiSession = (session) => ({
  id: String(session.id),
  citaId: session.appointmentId ? String(session.appointmentId) : null,
  fecha: session.clinicalNoteDate || session.sessionDate || null,
  formato: session.noteFormat || 'simple',
  objetivo: session.clinicalNoteObjective || session.sessionObjective || '',
  observaciones: session.clinicalObservations || '',
  proximoPaso: session.nextSteps || '',
  contenido: session.content || '',
  creadaEn: session.createdAt || null,
  actualizadaEn: session.updatedAt || null,
});

export const mapBackendFollowUpToUiFollowUp = (followUp) => ({
  consultas: followUp.consultations.map(entry => ({
    id: String(entry.id), fecha: entry.scheduledDate, hora: entry.scheduledTime,
    tareaIds: entry.tasks.map(task => String(task.id)),
  })),
  tareaIdsSinConsulta: followUp.unassignedTasks.map(task => String(task.id)),
});

export const mapBackendPatientToUiPatient = (patient) => {
  const fullName = patient.fullName?.trim() || `${patient.firstName || ''} ${patient.lastName || ''}`.trim();

  return {
    id: String(patient.id),
    nombre: fullName,
    edad: patient.age ?? null,
    riesgo: backendToUiRiskMap[patient.riskLevel] || 'sin riesgo',
    ultimaSesion: patient.lastClinicalNoteDate || patient.lastSessionDate || null,
    motivo: patient.reasonForConsultation || '',
    notas: patient.notes || '',
    seguimiento: patient.followUp ? mapBackendFollowUpToUiFollowUp(patient.followUp) : null,
    seguimientoEstado: patient.followUp ? 'ready' : patient.followUpUnavailable ? 'error' : 'idle',
    tareas: Array.isArray(patient.tasks) ? patient.tasks.map(mapBackendTaskToUiTask) : [],
    sesiones: Array.isArray(patient.clinicalNotes || patient.sessions)
      ? (patient.clinicalNotes || patient.sessions).map(mapBackendSessionToUiSession)
      : [],
    email: patient.email || '',
    telefono: patient.phone || '',
    estado: backendToUiStatusMap[patient.status] || 'activo',
  };
};

export const mapUiPatientToBackendPatient = (patient) => {
  const { firstName, lastName } = splitFullName(patient.nombre);

  return {
    firstName,
    lastName,
    email: patient.email || '',
    phone: patient.telefono || '',
    riskLevel: uiToBackendRiskMap[patient.riesgo] || 'none',
    status: uiToBackendStatusMap[patient.estado] || 'active',
    lastClinicalNoteDate: patient.ultimaSesion || null,
    notes: patient.notas || '',
    age: normalizeNullableAge(patient.edad),
    reasonForConsultation: patient.motivo || '',
  };
};

export const normalizeAppointments = (appointments) => {
  return appointments.map((appointment) => ({
    ...appointment,
    pacienteId: String(appointment.pacienteId),
  }));
};

export const normalizeTransactions = (transactions) => {
  return transactions.map((transaction) => ({
    ...transaction,
    pacienteId: String(transaction.pacienteId),
  }));
};
