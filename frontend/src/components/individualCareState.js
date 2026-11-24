export const unifiedCareEnabled = import.meta.env?.VITE_UNIFIED_CARE_ENABLED === 'true';
export const firstConsultationEnabled = import.meta.env?.VITE_FIRST_CONSULTATION_ENABLED === 'true';

export function episodeTitle(item) {
  const date = new Date(item.preparedAt);
  const timestamp = item.preparedAt && Number.isFinite(date.getTime()) && date.toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
  });
  return timestamp ? 'Atención individual · ' + timestamp : 'Atención individual';
}

export function careProgress(item, consultation, professional, consultationRead) {
  const result = (stage, next) => ({ stage, next });
  if (item.state === 'revoked') return result('Admisión revocada', 'Puedes consultar los documentos propios disponibles.');
  if (!item.id) return result('Episodio preparado', 'El psicólogo debe elegir y asignar la entrevista.');
  if (consultation?.status === 'withdrawn' || consultation?.consentWithdrawn
    || (consultation?.consentId && !consultation.consentAccepted)) {
    return result('Acceso de tratamiento retirado', 'Consulta la información propia disponible.');
  }
  if (consultation?.appointment) {
    return consultation.appointment.status === 'completed'
      ? result('Primera consulta completada', professional ? 'El psicólogo puede consultar o registrar su nota privada.' : 'Puedes consultar tu cita.')
      : result('Primera consulta reservada', 'Consulta la fecha y la hora de la cita.');
  }
  if (consultation?.status === 'active') return result('Episodio activo', 'El psicólogo debe agendar la primera consulta.');
  if (!consultation && item.episodeStatus === 'active') return result('Episodio activo', 'Consulta el estado confirmado de la primera cita.');
  if (consultation?.consentAccepted) return result('Consentimiento de tratamiento vigente', 'El psicólogo debe activar el episodio.');
  if (consultation?.sufficiencyId || consultation?.sufficiencyConfirmed) return result('Suficiencia confirmada', 'El paciente debe revisar el consentimiento de tratamiento.');
  if (consultation?.documentVersion) return result('Entrevista validada', 'El psicólogo debe confirmar la suficiencia de la versión.');
  if (item.state === 'proposed') return result('Entrevista asignada', 'El paciente debe revisar el consentimiento de admisión.');
  if (item.reviewState === 'correction_requested') return result('Corrección pendiente', item.mode === 'directed'
    ? 'El psicólogo debe resolver la solicitud.' : 'El paciente debe corregir y enviar una nueva versión.');
  if (['documented', 'submitted'].includes(item.reviewState)) return result(
    item.mode === 'directed' ? 'Entrevista documentada' : 'Entrevista enviada', 'El psicólogo debe revisar la versión vigente.'
  );
  if (item.reviewState === 'validated') return result('Entrevista validada', consultationRead === 'error'
    ? 'El estado de tratamiento requiere actualización.' : 'Consulta el estado confirmado del tratamiento.');
  return result('Consentimiento de admisión aceptado', item.mode === 'directed'
    ? 'El psicólogo debe declarar y documentar la entrevista.' : 'El paciente debe completar y enviar su entrevista.');
}
