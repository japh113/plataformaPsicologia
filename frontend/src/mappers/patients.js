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

export const mapBackendObjectiveToUiObjective = (objective) => ({
  id: String(objective.id),
  texto: objective.text || '',
  completada: Boolean(objective.completed),
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

export const mapBackendInterviewToUiInterview = (interview) => {
  if (!interview) {
    return null;
  }

  return {
    fechaNacimiento: interview.birthDate || '',
    lugarNacimiento: interview.birthPlace || '',
    ocupacion: interview.occupation || '',
    hobbies: interview.hobbies || '',
    estadoCivil: interview.maritalStatus || '',
    familia: interview.familyMembers || '',
    viveCon: interview.livesWith || '',
    enfermedadesFisicas: interview.physicalIllnesses || '',
    fechaEntrevista: interview.completedAt ? String(interview.completedAt).slice(0, 10) : '',
    indicadores: {
      insomnio: Boolean(interview.insomnia),
      pesadillas: Boolean(interview.nightmares),
      miedosOFobias: Boolean(interview.fearsOrPhobias),
      accidentes: Boolean(interview.accidents),
      consumoAlcohol: Boolean(interview.alcoholUse),
      consumoTabaco: Boolean(interview.tobaccoUse),
      consumoDrogas: Boolean(interview.drugUse),
      maltratoPsicologico: Boolean(interview.psychologicalAbuse),
      maltratoFisico: Boolean(interview.physicalAbuse),
      deseoDeMorir: Boolean(interview.deathWish),
      intentosSuicidas: Boolean(interview.suicideAttempts),
    },
    completadaEn: interview.completedAt || null,
    creadaEn: interview.createdAt || null,
    actualizadaEn: interview.updatedAt || null,
  };
};

export const mapBackendPatientToUiPatient = (patient) => {
  const fullName = patient.fullName?.trim() || `${patient.firstName || ''} ${patient.lastName || ''}`.trim();

  return {
    id: String(patient.id),
    nombre: fullName,
    edad: patient.age ?? null,
    riesgo: backendToUiRiskMap[patient.riskLevel] || 'sin riesgo',
    ultimaSesion: patient.lastSessionDate || null,
    motivo: patient.reasonForConsultation || '',
    notas: patient.notes || '',
    tareas: Array.isArray(patient.tasks) ? patient.tasks.map(mapBackendTaskToUiTask) : [],
    objetivos: Array.isArray(patient.objectives) ? patient.objectives.map(mapBackendObjectiveToUiObjective) : [],
    sesiones: Array.isArray(patient.clinicalNotes || patient.sessions)
      ? (patient.clinicalNotes || patient.sessions).map(mapBackendSessionToUiSession)
      : [],
    entrevistaCompleta: Boolean(patient.interviewCompleted),
    entrevista: mapBackendInterviewToUiInterview(patient.interview),
    email: patient.email || '',
    telefono: patient.phone || '',
    estado: backendToUiStatusMap[patient.status] || 'activo',
  };
};

export const mapUiInterviewToBackendInterview = (interview) => ({
  birthDate: interview.fechaNacimiento || '',
  birthPlace: interview.lugarNacimiento || '',
  occupation: interview.ocupacion || '',
  hobbies: interview.hobbies || '',
  maritalStatus: interview.estadoCivil || '',
  familyMembers: interview.familia || '',
  livesWith: interview.viveCon || '',
  physicalIllnesses: interview.enfermedadesFisicas || '',
  insomnia: Boolean(interview.indicadores?.insomnio),
  nightmares: Boolean(interview.indicadores?.pesadillas),
  fearsOrPhobias: Boolean(interview.indicadores?.miedosOFobias),
  accidents: Boolean(interview.indicadores?.accidentes),
  alcoholUse: Boolean(interview.indicadores?.consumoAlcohol),
  tobaccoUse: Boolean(interview.indicadores?.consumoTabaco),
  drugUse: Boolean(interview.indicadores?.consumoDrogas),
  psychologicalAbuse: Boolean(interview.indicadores?.maltratoPsicologico),
  physicalAbuse: Boolean(interview.indicadores?.maltratoFisico),
  deathWish: Boolean(interview.indicadores?.deseoDeMorir),
  suicideAttempts: Boolean(interview.indicadores?.intentosSuicidas),
});

export const mapUiPatientToBackendPatient = (patient) => {
  const { firstName, lastName } = splitFullName(patient.nombre);

  return {
    firstName,
    lastName,
    email: patient.email || '',
    phone: patient.telefono || '',
    riskLevel: uiToBackendRiskMap[patient.riesgo] || 'none',
    status: uiToBackendStatusMap[patient.estado] || 'active',
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
