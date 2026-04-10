const validateCreateChecklistPayload = (payload, { requireClinicalNoteId = false } = {}) => {
  const errors = [];

  if (!payload.text?.trim()) {
    errors.push('text is required');
  }

  if (
    requireClinicalNoteId &&
    (
      (typeof payload?.clinicalNoteId === 'undefined' || payload?.clinicalNoteId === null || !String(payload.clinicalNoteId).trim())
      && (typeof payload?.sessionId === 'undefined' || payload?.sessionId === null || !String(payload.sessionId).trim())
    )
  ) {
    errors.push('clinicalNoteId is required');
  }

  return errors;
};

export const validateCreateTaskPayload = (payload) => validateCreateChecklistPayload(payload, { requireClinicalNoteId: true });

export const validateCreateObjectivePayload = (payload) => validateCreateChecklistPayload(payload);

export const validateUpdateTaskPayload = (payload) => {
  const errors = [];

  if (Object.prototype.hasOwnProperty.call(payload, 'text') && typeof payload.text !== 'string') {
    errors.push('text must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'completed') && typeof payload.completed !== 'boolean') {
    errors.push('completed must be a boolean');
  }

  return errors;
};
