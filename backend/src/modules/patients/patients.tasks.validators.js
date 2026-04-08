export const validateCreateTaskPayload = (payload) => {
  const errors = [];

  if (!payload.text?.trim()) {
    errors.push('text is required');
  }

  return errors;
};

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
