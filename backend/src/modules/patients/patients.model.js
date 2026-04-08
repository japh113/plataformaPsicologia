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
    riskLevel: payload.riskLevel || 'low',
    status: payload.status || 'active',
    lastSessionDate: payload.lastSessionDate || null,
    notes: payload.notes || '',
  };
};