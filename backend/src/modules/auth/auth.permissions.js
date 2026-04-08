export const isPsychologist = (actor) => actor?.role === 'psychologist';
export const isPatient = (actor) => actor?.role === 'patient';

export const createForbiddenError = (message = 'Forbidden') => {
  const error = new Error(message);
  error.status = 403;
  return error;
};

export const createUnauthorizedError = (message = 'Unauthorized') => {
  const error = new Error(message);
  error.status = 401;
  return error;
};

export const ensureAuthenticated = (actor) => {
  if (!actor) {
    throw createUnauthorizedError();
  }
};

export const ensurePsychologist = (actor) => {
  ensureAuthenticated(actor);

  if (!isPsychologist(actor)) {
    throw createForbiddenError();
  }
};

export const buildPatientAccessScope = (actor, patientColumnReference, paramIndex = 1) => {
  ensureAuthenticated(actor);

  if (isPsychologist(actor)) {
    return {
      clause: `EXISTS (
        SELECT 1
        FROM psychologist_patient_access spa
        WHERE spa.psychologist_user_id = $${paramIndex}
          AND spa.patient_id = ${patientColumnReference}
      )`,
      params: [actor.id],
    };
  }

  if (isPatient(actor)) {
    return {
      clause: `${patientColumnReference} = $${paramIndex}`,
      params: [actor.patientId],
    };
  }

  throw createForbiddenError();
};
