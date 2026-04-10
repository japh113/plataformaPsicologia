const normalizeAge = (value) => {
  if (value === '' || value === null || typeof value === 'undefined') {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null;
  }

  return parsedValue;
};

export const buildPatientEntity = (payload, id) => {
  const firstName = payload.firstName?.trim() || '';
  const lastName = payload.lastName?.trim() || '';

  return {
    id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    email: payload.email?.trim() || '',
    phone: payload.phone?.trim() || '',
    riskLevel: payload.riskLevel || 'none',
    status: payload.status || 'active',
    lastSessionDate: payload.lastSessionDate || null,
    notes: payload.notes || '',
    age: normalizeAge(payload.age),
    reasonForConsultation: payload.reasonForConsultation?.trim() || '',
  };
};
