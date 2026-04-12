const validStatuses = ['pending', 'completed', 'cancelled', 'no_show'];
const validRecurrenceEditScopes = ['single', 'future'];

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTimeValue = (value) => /^\d{2}:\d{2}(:\d{2})?$/.test(value);
const isHourSlotValue = (value) => /^\d{2}:00(:00)?$/.test(value);

const validateRecurrencePayload = (recurrence, errors) => {
  if (!recurrence || typeof recurrence !== 'object' || Array.isArray(recurrence)) {
    errors.push('recurrence must be an object');
    return;
  }

  if (!recurrence.endDate || !isIsoDate(recurrence.endDate)) {
    errors.push('recurrence.endDate must be in YYYY-MM-DD format');
  }
};

export const validateCreateAppointmentPayload = (payload) => {
  const errors = [];

  if (!payload.patientId?.trim()) {
    errors.push('patientId is required');
  }

  if (!payload.scheduledDate || !isIsoDate(payload.scheduledDate)) {
    errors.push('scheduledDate must be in YYYY-MM-DD format');
  }

  if (!payload.scheduledTime || !isHourSlotValue(payload.scheduledTime)) {
    errors.push('scheduledTime must be in HH:00 or HH:00:00 format');
  }

  if (payload.status && !validStatuses.includes(payload.status)) {
    errors.push('status must be pending, completed, cancelled, or no_show');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'recurrence')) {
    validateRecurrencePayload(payload.recurrence, errors);
  }

  return errors;
};

export const validateUpdateAppointmentPayload = (payload) => {
  const errors = [];

  if (Object.prototype.hasOwnProperty.call(payload || {}, 'recurrenceEditScope') && !validRecurrenceEditScopes.includes(payload.recurrenceEditScope)) {
    errors.push('recurrenceEditScope must be single or future');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'patientId') && !payload.patientId?.trim()) {
    errors.push('patientId must be a non-empty string');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'scheduledDate') && !isIsoDate(payload.scheduledDate)) {
    errors.push('scheduledDate must be in YYYY-MM-DD format');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'scheduledTime') && !isTimeValue(payload.scheduledTime)) {
    errors.push('scheduledTime must be in HH:MM or HH:MM:SS format');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'status') && !validStatuses.includes(payload.status)) {
    errors.push('status must be pending, completed, cancelled, or no_show');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'notes') && typeof payload.notes !== 'string') {
    errors.push('notes must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'recurrence')) {
    validateRecurrencePayload(payload.recurrence, errors);
  }

  return errors;
};

export const validateCreateWaitlistEntryPayload = (payload) => {
  const errors = [];

  if (!payload.patientId?.trim()) {
    errors.push('patientId is required');
  }

  if (!payload.scheduledDate || !isIsoDate(payload.scheduledDate)) {
    errors.push('scheduledDate must be in YYYY-MM-DD format');
  }

  if (!payload.scheduledTime || !isHourSlotValue(payload.scheduledTime)) {
    errors.push('scheduledTime must be in HH:00 or HH:00:00 format');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'notes') && typeof payload.notes !== 'string') {
    errors.push('notes must be a string');
  }

  return errors;
};

export const validateReorderWaitlistEntriesPayload = (payload) => {
  const errors = [];

  if (!payload.scheduledDate || !isIsoDate(payload.scheduledDate)) {
    errors.push('scheduledDate must be in YYYY-MM-DD format');
  }

  if (!payload.scheduledTime || !isHourSlotValue(payload.scheduledTime)) {
    errors.push('scheduledTime must be in HH:00 or HH:00:00 format');
  }

  if (!Array.isArray(payload.entryIds) || payload.entryIds.length === 0) {
    errors.push('entryIds must be a non-empty array');
  }

  if (Array.isArray(payload.entryIds) && payload.entryIds.some((entryId) => !String(entryId).trim())) {
    errors.push('entryIds must contain valid ids');
  }

  return errors;
};
