const backendToUiRiskMap = {
  low: 'bajo',
  medium: 'medio',
  high: 'alto',
};

const uiToBackendRiskMap = {
  bajo: 'low',
  medio: 'medium',
  alto: 'high',
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
});

export const mapBackendSessionToUiSession = (session) => ({
  id: String(session.id),
  citaId: session.appointmentId ? String(session.appointmentId) : null,
  fecha: session.sessionDate || null,
  formato: session.noteFormat || 'simple',
  objetivo: session.sessionObjective || '',
  observaciones: session.clinicalObservations || '',
  proximoPaso: session.nextSteps || '',
  contenido: session.content || '',
  creadaEn: session.createdAt || null,
  actualizadaEn: session.updatedAt || null,
});

export const mapBackendPatientToUiPatient = (patient) => {
  const fullName = patient.fullName?.trim() || `${patient.firstName || ''} ${patient.lastName || ''}`.trim();

  return {
    id: String(patient.id),
    nombre: fullName,
    edad: patient.age ?? null,
    riesgo: backendToUiRiskMap[patient.riskLevel] || 'bajo',
    ultimaSesion: patient.lastSessionDate || null,
    motivo: patient.reasonForConsultation || '',
    notas: patient.notes || '',
    tareas: Array.isArray(patient.tasks) ? patient.tasks.map(mapBackendTaskToUiTask) : [],
    sesiones: Array.isArray(patient.sessions) ? patient.sessions.map(mapBackendSessionToUiSession) : [],
    email: patient.email || '',
    telefono: patient.phone || '',
    estado: patient.status || 'active',
  };
};

export const mapUiPatientToBackendPatient = (patient) => {
  const { firstName, lastName } = splitFullName(patient.nombre);

  return {
    firstName,
    lastName,
    email: patient.email || '',
    phone: patient.telefono || '',
    riskLevel: uiToBackendRiskMap[patient.riesgo] || 'low',
    status: patient.estado || 'active',
    lastSessionDate: patient.ultimaSesion || null,
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
