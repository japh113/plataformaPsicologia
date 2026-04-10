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

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 10);
};

const normalizeBoolean = (value) => Boolean(value);

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

export const buildPatientInterviewEntity = (payload = {}) => ({
  birthDate: normalizeDate(payload.birthDate),
  birthPlace: payload.birthPlace?.trim() || '',
  occupation: payload.occupation?.trim() || '',
  hobbies: payload.hobbies?.trim() || '',
  maritalStatus: payload.maritalStatus?.trim() || '',
  familyMembers: payload.familyMembers?.trim() || '',
  livesWith: payload.livesWith?.trim() || '',
  physicalIllnesses: payload.physicalIllnesses?.trim() || '',
  insomnia: normalizeBoolean(payload.insomnia),
  nightmares: normalizeBoolean(payload.nightmares),
  fearsOrPhobias: normalizeBoolean(payload.fearsOrPhobias),
  accidents: normalizeBoolean(payload.accidents),
  alcoholUse: normalizeBoolean(payload.alcoholUse),
  tobaccoUse: normalizeBoolean(payload.tobaccoUse),
  drugUse: normalizeBoolean(payload.drugUse),
  psychologicalAbuse: normalizeBoolean(payload.psychologicalAbuse),
  physicalAbuse: normalizeBoolean(payload.physicalAbuse),
  deathWish: normalizeBoolean(payload.deathWish),
  suicideAttempts: normalizeBoolean(payload.suicideAttempts),
});
