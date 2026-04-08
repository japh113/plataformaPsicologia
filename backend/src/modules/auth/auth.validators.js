export const validateLoginPayload = (payload) => {
  const errors = [];

  if (!payload.email?.trim()) {
    errors.push('email is required');
  }

  if (!payload.password?.trim()) {
    errors.push('password is required');
  }

  return errors;
};
