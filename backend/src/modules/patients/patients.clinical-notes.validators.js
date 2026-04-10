const allowedFormats = new Set(['simple', 'soap']);
const structuredFieldKeys = ['sessionObjective', 'clinicalObservations', 'nextSteps'];

const validateTasksField = (payload, errors) => {
  if (!Object.prototype.hasOwnProperty.call(payload || {}, 'tasks')) {
    return;
  }

  if (!Array.isArray(payload.tasks)) {
    errors.push('tasks must be an array when provided');
    return;
  }

  payload.tasks.forEach((task, index) => {
    if (typeof task !== 'object' || task === null) {
      errors.push(`tasks[${index}] must be an object`);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(task, 'id') && (task.id === null || typeof task.id === 'undefined' || !String(task.id).trim())) {
      errors.push(`tasks[${index}].id must be a valid value when provided`);
    }

    if (typeof task.text !== 'string' || task.text.trim().length === 0) {
      errors.push(`tasks[${index}].text is required`);
    }

    if (Object.prototype.hasOwnProperty.call(task, 'completed') && typeof task.completed !== 'boolean') {
      errors.push(`tasks[${index}].completed must be a boolean when provided`);
    }
  });
};

const validateOptionalTextField = (payload, key, errors) => {
  if (
    Object.prototype.hasOwnProperty.call(payload || {}, key) &&
    typeof payload[key] !== 'string'
  ) {
    errors.push(`${key} must be a string when provided`);
  }
};

export const validateCreateClinicalNotePayload = (payload) => {
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
  validateTasksField(payload, errors);

  return errors;
};

export const validateUpdateClinicalNotePayload = (payload) => {
  const errors = [];
  const hasAnyField = ['noteFormat', 'content', 'appointmentId', 'tasks', ...structuredFieldKeys].some((key) => Object.prototype.hasOwnProperty.call(payload || {}, key));

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
  validateTasksField(payload, errors);

  if (
    Object.prototype.hasOwnProperty.call(payload || {}, 'appointmentId') &&
    (payload.appointmentId === null || typeof payload.appointmentId === 'undefined' || !String(payload.appointmentId).trim())
  ) {
    errors.push('appointmentId must be a valid value when provided');
  }

  return errors;
};
