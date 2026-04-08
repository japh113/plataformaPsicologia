const hasOwnProperty = (payload, key) => Object.prototype.hasOwnProperty.call(payload, key);

const validateAge = (value) => {
  if (value === '' || value === null || typeof value === 'undefined') {
    return true;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue >= 0;
};

export const validatePatientPayload = (payload, { requireFirstName = false } = {}) => {
  const errors = [];

  if (requireFirstName && !payload.firstName?.trim()) {
    errors.push('firstName is required');
  }

  if (hasOwnProperty(payload, 'firstName') && payload.firstName !== null && typeof payload.firstName !== 'string') {
    errors.push('firstName must be a string');
  }

  if (hasOwnProperty(payload, 'lastName') && payload.lastName !== null && typeof payload.lastName !== 'string') {
    errors.push('lastName must be a string');
  }

  if (hasOwnProperty(payload, 'reasonForConsultation') && payload.reasonForConsultation !== null && typeof payload.reasonForConsultation !== 'string') {
    errors.push('reasonForConsultation must be a string');
  }

  if (payload.riskLevel && !['low', 'medium', 'high'].includes(payload.riskLevel)) {
    errors.push('riskLevel must be low, medium, or high');
  }

  if (payload.status && !['active', 'inactive'].includes(payload.status)) {
    errors.push('status must be active or inactive');
  }

  if (hasOwnProperty(payload, 'age') && !validateAge(payload.age)) {
    errors.push('age must be a positive number or null');
  }

  return errors;
};

export const validateCreatePatient = (payload) => validatePatientPayload(payload, { requireFirstName: true });
