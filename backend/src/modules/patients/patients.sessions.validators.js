const allowedFormats = new Set(['simple', 'soap']);
const structuredFieldKeys = ['sessionObjective', 'clinicalObservations', 'nextSteps'];

const validateOptionalTextField = (payload, key, errors) => {
  if (
    Object.prototype.hasOwnProperty.call(payload || {}, key) &&
    typeof payload[key] !== 'string'
  ) {
    errors.push(`${key} must be a string when provided`);
  }
};

export const validateCreateSessionPayload = (payload) => {
  const errors = [];

  if (typeof payload?.appointmentId === 'undefined' || payload?.appointmentId === null || !String(payload.appointmentId).trim()) {
    errors.push('appointmentId is required');
  }

  if (!payload?.noteFormat || !allowedFormats.has(payload.noteFormat)) {
    errors.push('noteFormat must be one of: simple, soap');
  }

  if (typeof payload?.content !== 'string' || payload.content.trim().length === 0) {
    errors.push('content is required');
  }

  structuredFieldKeys.forEach((key) => validateOptionalTextField(payload, key, errors));

  return errors;
};

export const validateUpdateSessionPayload = (payload) => {
  const errors = [];
  const hasAnyField = ['noteFormat', 'content', 'appointmentId', ...structuredFieldKeys].some((key) => Object.prototype.hasOwnProperty.call(payload || {}, key));

  if (!hasAnyField) {
    return ['At least one field must be provided'];
  }

  if (Object.prototype.hasOwnProperty.call(payload || {}, 'noteFormat') && !allowedFormats.has(payload.noteFormat)) {
    errors.push('noteFormat must be one of: simple, soap');
  }

  if (Object.prototype.hasOwnProperty.call(payload || {}, 'content') && (typeof payload.content !== 'string' || payload.content.trim().length === 0)) {
    errors.push('content must be a non-empty string');
  }

  structuredFieldKeys.forEach((key) => validateOptionalTextField(payload, key, errors));

  if (
    Object.prototype.hasOwnProperty.call(payload || {}, 'appointmentId') &&
    (payload.appointmentId === null || typeof payload.appointmentId === 'undefined' || !String(payload.appointmentId).trim())
  ) {
    errors.push('appointmentId must be a valid value when provided');
  }

  return errors;
};
