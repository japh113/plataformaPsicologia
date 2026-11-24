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
  if (item.state === 'revoked') return result('Entrevista cerrada', 'Puedes consultar los documentos propios disponibles.');
  if (!item.id) return result('Entrevista por enviar', 'Puedes retomar esta atención y enviar la entrevista inicial.');
  if (consultation?.status === 'withdrawn' || consultation?.consentWithdrawn
    || (consultation?.consentId && !consultation.consentAccepted)) {
    return result('Consentimiento retirado', 'Consulta la información propia disponible.');
  }
  if (consultation?.appointment) {
    return consultation.appointment.status === 'completed'
      ? result('Primera consulta completada', professional ? 'El psicólogo puede consultar o registrar su nota privada.' : 'Puedes consultar tu cita.')
      : result('Primera consulta reservada', 'Consulta la fecha y la hora de la cita.');
  }
  if (consultation?.status === 'active') return result('Tratamiento iniciado', professional ? 'Reserva la primera cita.' : 'Tu profesional reservará la primera cita.');
  if (!consultation && item.episodeStatus === 'active') return result('Tratamiento iniciado', 'Consultando el estado de la primera cita.');
  if (consultation?.consentAccepted) return result('Tratamiento aceptado', professional ? 'Ya puedes decidir si inicia la atención.' : 'Tu profesional decidirá cuándo iniciar la atención.');
  if (consultation?.sufficiencyId || consultation?.sufficiencyConfirmed) return result('Entrevista confirmada', professional ? 'El paciente revisará las condiciones de tratamiento.' : 'Revisa las condiciones de tratamiento y decide si quieres aceptar.');
  if (consultation?.documentVersion) return result('Entrevista lista para confirmar', professional ? 'Revisa el documento y confirma si está completo para iniciar.' : 'Tu profesional está revisando la entrevista.');
  if (item.state === 'proposed') return result('Entrevista enviada al paciente', professional ? 'El paciente revisará las condiciones de entrevista.' : 'Revisa las condiciones para comenzar tu entrevista.');
  if (item.reviewState === 'correction_requested') return result('Corrección pendiente', item.mode === 'directed'
    ? 'El psicólogo debe resolver la solicitud.' : 'El paciente debe corregir y enviar una nueva versión.');
  if (['documented', 'submitted'].includes(item.reviewState)) return result(
    professional ? 'Entrevista lista para revisar' : 'Entrevista en revisión',
    professional ? 'Lee las respuestas antes de confirmar.' : 'Tu profesional está revisando la entrevista.'
  );
  if (item.reviewState === 'validated') return result('Entrevista validada', consultationRead === 'error'
    ? 'El estado de tratamiento requiere actualización.' : 'Consulta el estado confirmado del tratamiento.');
  return item.mode === 'directed'
    ? result('Entrevista aceptada', professional ? 'Después de conversar, registra lo que te contó el paciente.' : 'Tu profesional registrará la entrevista después de conversar contigo.')
    : result('Entrevista por responder', professional ? 'El paciente puede redactar y enviarte sus respuestas.' : 'Completa la entrevista y decide cuándo enviar tus respuestas.');
}

export function patientHasNextTask(assignment, consultation) {
  if (assignment.state === 'revoked') return false;
  if (consultation?.status === 'prepared' && consultation.sufficiencyConfirmed
    && !consultation.consentAccepted && !consultation.consentWithdrawn) return true;
  return assignment.state === 'proposed' || (assignment.state === 'accepted' && assignment.mode !== 'directed'
    && assignment.episodeStatus === 'prepared' && ['awaiting_submission', 'correction_requested'].includes(assignment.reviewState));
}
