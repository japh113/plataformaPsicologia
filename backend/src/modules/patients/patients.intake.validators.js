const hasOwnProperty = (payload, key) => Object.prototype.hasOwnProperty.call(payload, key);

const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
};

const textFields = [
  'birthPlace',
  'occupation',
  'hobbies',
  'maritalStatus',
  'familyMembers',
  'livesWith',
  'physicalIllnesses',
];

const requiredTextFields = [
  'birthPlace',
  'occupation',
  'maritalStatus',
  'familyMembers',
  'livesWith',
];

const booleanFields = [
  'insomnia',
  'nightmares',
  'fearsOrPhobias',
  'accidents',
  'alcoholUse',
  'tobaccoUse',
  'drugUse',
  'psychologicalAbuse',
  'physicalAbuse',
  'deathWish',
  'suicideAttempts',
];

export const validatePatientInterviewPayload = (payload) => {
  const errors = [];

  if (!isValidDate(payload.birthDate)) {
    errors.push('birthDate must be a valid YYYY-MM-DD date');
  }

  textFields.forEach((field) => {
    if (hasOwnProperty(payload, field) && typeof payload[field] !== 'string') {
      errors.push(`${field} must be a string`);
    }
  });

  requiredTextFields.forEach((field) => {
    if (!payload[field]?.trim()) {
      errors.push(`${field} is required`);
    }
  });

  booleanFields.forEach((field) => {
    if (hasOwnProperty(payload, field) && typeof payload[field] !== 'boolean') {
      errors.push(`${field} must be a boolean`);
    }
  });

  return errors;
};
