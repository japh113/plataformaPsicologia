export const validateCreatePatient = (payload) => {
  const errors = [];

  if (!payload.firstName?.trim()) {
    errors.push('firstName is required');
  }

  if (!payload.lastName?.trim()) {
    errors.push('lastName is required');
  }

  if (payload.riskLevel && !['low', 'medium', 'high'].includes(payload.riskLevel)) {
    errors.push('riskLevel must be low, medium, or high');
  }

  if (payload.status && !['active', 'inactive'].includes(payload.status)) {
    errors.push('status must be active or inactive');
  }

  return errors;
};