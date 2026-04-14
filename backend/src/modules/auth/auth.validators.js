const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const validateLoginPayload = (payload = {}) => {
  const errors = [];

  if (!normalizeString(payload.email)) {
    errors.push('email is required');
  }

  if (!normalizeString(payload.password)) {
    errors.push('password is required');
  }

  return errors;
};

export const validatePasswordResetRequestPayload = (payload = {}) => {
  const errors = [];
  const email = normalizeString(payload.email);

  if (!email) {
    errors.push('email is required');
  } else if (!isValidEmail(email)) {
    errors.push('email must be valid');
  }

  return errors;
};

export const validatePasswordResetConfirmPayload = (payload = {}) => {
  const errors = [];
  const token = normalizeString(payload.token);
  const password = normalizeString(payload.password);

  if (!token) {
    errors.push('token is required');
  }

  if (!password) {
    errors.push('password is required');
  } else if (password.length < 8) {
    errors.push('password must be at least 8 characters');
  }

  return errors;
};

export const validatePatientRegistrationPayload = (payload = {}) => {
  const errors = [];
  const firstName = normalizeString(payload.firstName);
  const email = normalizeString(payload.email);
  const password = normalizeString(payload.password);

  if (!firstName) {
    errors.push('firstName is required');
  }

  if (!email) {
    errors.push('email is required');
  } else if (!isValidEmail(email)) {
    errors.push('email must be valid');
  }

  if (!password) {
    errors.push('password is required');
  } else if (password.length < 8) {
    errors.push('password must be at least 8 characters');
  }

  if (payload.age !== undefined && payload.age !== null && payload.age !== '') {
    const numericAge = Number(payload.age);

    if (!Number.isInteger(numericAge) || numericAge < 0) {
      errors.push('age must be a non-negative integer');
    }
  }

  return errors;
};

export const validatePsychologistRegistrationPayload = (payload = {}) => {
  const errors = [];
  const firstName = normalizeString(payload.firstName);
  const email = normalizeString(payload.email);
  const password = normalizeString(payload.password);
  const professionalTitle = normalizeString(payload.professionalTitle);

  if (!firstName) {
    errors.push('firstName is required');
  }

  if (!email) {
    errors.push('email is required');
  } else if (!isValidEmail(email)) {
    errors.push('email must be valid');
  }

  if (!password) {
    errors.push('password is required');
  } else if (password.length < 8) {
    errors.push('password must be at least 8 characters');
  }

  if (!professionalTitle) {
    errors.push('professionalTitle is required');
  }

  return errors;
};

export const validatePsychologistReviewPayload = (payload = {}) => {
  const errors = [];
  const allowedStatuses = ['active', 'rejected', 'suspended'];
  const nextStatus = normalizeString(payload.approvalStatus);

  if (!nextStatus) {
    errors.push('approvalStatus is required');
  } else if (!allowedStatuses.includes(nextStatus)) {
    errors.push('approvalStatus must be one of active, rejected or suspended');
  }

  return errors;
};

export const validateCreateCareRelationshipPayload = (payload = {}) => {
  const errors = [];
  const patientId = normalizeString(payload.patientId);
  const psychologistUserId = normalizeString(payload.psychologistUserId);
  const status = normalizeString(payload.status || 'active');
  const allowedStatuses = ['pending', 'active'];

  if (!patientId) {
    errors.push('patientId is required');
  }

  if (!psychologistUserId) {
    errors.push('psychologistUserId is required');
  }

  if (!allowedStatuses.includes(status)) {
    errors.push('status must be pending or active');
  }

  return errors;
};

export const validateUpdateCareRelationshipPayload = (payload = {}) => {
  const errors = [];
  const status = normalizeString(payload.status);
  const allowedStatuses = ['pending', 'active', 'ended', 'rejected'];

  if (!status) {
    errors.push('status is required');
  } else if (!allowedStatuses.includes(status)) {
    errors.push('status must be pending, active, ended or rejected');
  }

  return errors;
};
