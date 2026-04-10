const validStatuses = ['pending', 'completed', 'cancelled'];

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTimeValue = (value) => /^\d{2}:\d{2}(:\d{2})?$/.test(value);
const isHourSlotValue = (value) => /^\d{2}:00(:00)?$/.test(value);

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
    errors.push('status must be pending, completed, or cancelled');
  }

  return errors;
};

export const validateUpdateAppointmentPayload = (payload) => {
  const errors = [];

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
    errors.push('status must be pending, completed, or cancelled');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'notes') && typeof payload.notes !== 'string') {
    errors.push('notes must be a string');
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
