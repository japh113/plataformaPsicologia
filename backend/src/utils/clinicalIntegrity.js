export const clinicalDeletionError = (message) => {
  const error = new Error(message);
  error.status = 409;
  error.code = 'CLINICAL_RECORD_PRESERVED';
  return error;
};
