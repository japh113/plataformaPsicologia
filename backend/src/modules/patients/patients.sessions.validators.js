const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const allowedFormats = new Set(['simple', 'soap']);

export const validateCreateSessionPayload = (payload) => {
  const errors = [];

  if (!payload?.sessionDate || !isIsoDate(payload.sessionDate)) {
    errors.push('sessionDate must be in YYYY-MM-DD format');
  }

  if (!payload?.noteFormat || !allowedFormats.has(payload.noteFormat)) {
    errors.push('noteFormat must be one of: simple, soap');
  }

  if (typeof payload?.content !== 'string' || payload.content.trim().length === 0) {
    errors.push('content is required');
  }

  if (payload?.appointmentId !== null && typeof payload?.appointmentId !== 'undefined' && !String(payload.appointmentId).trim()) {
    errors.push('appointmentId must be a valid value when provided');
  }

  return errors;
};

export const validateUpdateSessionPayload = (payload) => {
  const errors = [];
  const hasAnyField = ['sessionDate', 'noteFormat', 'content', 'appointmentId'].some((key) => Object.prototype.hasOwnProperty.call(payload || {}, key));

  if (!hasAnyField) {
    return ['At least one field must be provided'];
  }

  if (Object.prototype.hasOwnProperty.call(payload || {}, 'sessionDate') && !isIsoDate(payload.sessionDate)) {
    errors.push('sessionDate must be in YYYY-MM-DD format');
  }

  if (Object.prototype.hasOwnProperty.call(payload || {}, 'noteFormat') && !allowedFormats.has(payload.noteFormat)) {
    errors.push('noteFormat must be one of: simple, soap');
  }

  if (Object.prototype.hasOwnProperty.call(payload || {}, 'content') && (typeof payload.content !== 'string' || payload.content.trim().length === 0)) {
    errors.push('content must be a non-empty string');
  }

  if (
    Object.prototype.hasOwnProperty.call(payload || {}, 'appointmentId') &&
    payload.appointmentId !== null &&
    typeof payload.appointmentId !== 'undefined' &&
    !String(payload.appointmentId).trim()
  ) {
    errors.push('appointmentId must be a valid value when provided');
  }

  return errors;
};
