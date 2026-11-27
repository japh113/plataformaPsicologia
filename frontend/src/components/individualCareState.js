export const unifiedCareEnabled = import.meta.env?.VITE_UNIFIED_CARE_ENABLED === 'true';
export const firstConsultationEnabled = import.meta.env?.VITE_FIRST_CONSULTATION_ENABLED === 'true';

export function careActionLabel(progress, professional) {
  if (!professional) return 'Pendiente de tu respuesta';
  if (progress.steps?.at(-1)?.current) return 'Primera cita por agendar';
  if (progress.steps?.[2]?.current || progress.stage === 'Corrección pendiente') return 'Pendiente de revisión';
  return 'Siguiente paso';
}

export function episodeTitle(item) {
  const date = new Date(item.preparedAt);
  const timestamp = item.preparedAt && Number.isFinite(date.getTime()) && date.toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
  });
  return timestamp ? 'Atención individual · ' + timestamp : 'Atención individual';
}

export function careProgress(item, consultation, professional, consultationRead) {
  const result = (stage, next) => ({ stage, next });
  if (consultation?.status === 'withdrawn' || item.episodeStatus === 'withdrawn' || consultation?.consentWithdrawn
    || (consultation?.consentId && !consultation.consentAccepted)) {
    return result('Consentimiento retirado', 'Consulta la información propia disponible.');
  }
  if (item.state === 'revoked') return result('Entrevista cerrada', 'Puedes consultar los documentos propios disponibles.');
  if (!item.id) return result('Entrevista por enviar', professional
    ? 'Envía la entrevista inicial para continuar la atención.'
    : 'Tu profesional te enviará la entrevista inicial desde esta ficha.');
  if (item.reviewState === 'correction_requested') return result('Corrección pendiente', item.mode === 'directed'
    ? 'El psicólogo debe resolver la solicitud.' : 'El paciente debe corregir y enviar una nueva versión.');
  if (consultation?.hasAppointment && !consultation.appointmentSlot) return result('Primera cita registrada', 'Consulta la cita desde la ficha.');
  const slot = consultation?.appointment ?? consultation?.appointmentSlot;
  if (slot) {
    return slot.status === 'completed'
      ? result('Primera consulta completada', professional ? 'El psicólogo puede consultar o registrar su nota privada.' : 'Puedes consultar tu cita.')
      : result('Primera consulta reservada', 'Consulta la fecha y la hora de la cita.');
  }
  if (consultation?.status === 'active') return result('Tratamiento iniciado', professional ? 'Reserva la primera cita.' : 'Tu profesional reservará la primera cita.');
  if (!consultation && item.episodeStatus === 'active') return result('Tratamiento iniciado', 'Consultando el estado de la primera cita.');
  if (consultation?.consentAccepted) return result('Tratamiento aceptado', professional ? 'Ya puedes decidir si inicia la atención.' : 'Tu profesional decidirá cuándo iniciar la atención.');
  if (consultation?.sufficiencyId || consultation?.sufficiencyConfirmed) return result('Entrevista confirmada', professional ? 'El paciente revisará las condiciones de tratamiento.' : 'Revisa las condiciones de tratamiento y decide si quieres aceptar.');
  if (consultation?.documentVersion) return result('Entrevista lista para confirmar', professional ? 'Revisa el documento y confirma si está completo para iniciar.' : 'Tu profesional está revisando la entrevista.');
  if (item.state === 'proposed') return result(professional ? 'Entrevista enviada al paciente' : 'Entrevista por aceptar', professional ? 'El paciente revisará las condiciones de entrevista.' : 'Revisa las condiciones para comenzar tu entrevista.');
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

export function careChecklist(item, consultation, professional, consultationRead) {
  const { stage, next } = careProgress(item, consultation, professional, consultationRead);
  const closed = item.state === 'revoked' || item.episodeStatus === 'withdrawn' || consultation?.status === 'withdrawn' || consultation?.consentWithdrawn
    || Boolean(consultation?.consentId && !consultation.consentAccepted);
  const correcting = item.reviewState === 'correction_requested';
  const active = !correcting && consultation?.status === 'active';
  const interview = !correcting && (active || ['submitted', 'documented', 'validated'].includes(item.reviewState));
  const sufficient = interview && Boolean(active || consultation?.sufficiencyId || consultation?.sufficiencyConfirmed);
  const consent = sufficient && Boolean(active || consultation?.consentAccepted);
  const appointment = active && Boolean(consultation.appointment || consultation.hasAppointment);
  const confirmations = [true, interview, sufficient, consent, active, appointment];
  const labels = ['Vinculación', 'Entrevista inicial', 'Revisión profesional',
    'Consentimiento de tratamiento', 'Inicio del tratamiento', 'Primera cita'];

  let index = confirmations.indexOf(false);
  let owner = ['professional', 'patient', 'professional', 'patient', 'professional', 'professional'][index];
  if (index === 1 && (!item.id || (item.state === 'accepted' && item.mode === 'directed'))) owner = 'professional';
  const needsConsultation = item.id && (index >= 2 || item.episodeStatus === 'active');
  const unavailable = item.state !== 'revoked' && (consultationRead === 'error'
    || (needsConsultation && consultationRead !== 'disabled' && !consultation));
  if (closed || unavailable || (consultationRead === 'disabled' && index >= 2)) {
    index = -1;
    owner = null;
  }
  const steps = labels.map((label, i) => ({
    label, complete: confirmations[i], current: i === index, owner: i === index ? owner : null,
  }));
  const phase = unavailable ? 'unknown' : closed ? 'history' : active ? 'active' : 'pre-care';
  return { stage, next, phase, steps, completed: steps.filter(step => step.complete).length, closed, unavailable: Boolean(unavailable), owner: owner ?? null };
}

export function agreementCare(agreementId, assignments, consultations, professional) {
  if (!Array.isArray(assignments) || (firstConsultationEnabled && !Array.isArray(consultations))) return null;
  const relevant = assignments.filter(item => item.agreementId === agreementId);
  const episodes = relevant.length ? relevant : [{}];
  return episodes.map(item => {
    const detail = consultations?.find(entry => entry.id === item.id && entry.episodeId === item.episodeId);
    const mismatched = detail && ((detail.admissionVersion != null && detail.admissionVersion !== item.version)
      || (item.episodeStatus !== detail.status && detail.status !== 'withdrawn'));
    if (mismatched || (firstConsultationEnabled && item.id && !detail && item.state !== 'revoked')) return { unavailable: true };
    return careChecklist(item, detail, professional, firstConsultationEnabled ? 'loaded' : 'disabled');
  });
}
