export const isPsychologist = (actor) => actor?.role === 'psychologist';
export const isPatient = (actor) => actor?.role === 'patient';
export const isAdmin = (actor) => actor?.role === 'admin';
export const isSupport = (actor) => actor?.role === 'support';
export const isSuperadmin = (actor) => actor?.role === 'superadmin';
export const canViewBackoffice = (actor) => isAdmin(actor) || isSupport(actor) || isSuperadmin(actor);
export const canManageBackoffice = (actor) => isAdmin(actor) || isSuperadmin(actor);
export const canAccessAllClinicalData = (actor) => isSuperadmin(actor);

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

export const ensureAdmin = (actor) => {
  ensureAuthenticated(actor);

  if (!isAdmin(actor)) {
    throw createForbiddenError();
  }
};

export const ensureBackofficeViewer = (actor) => {
  ensureAuthenticated(actor);

  if (!canViewBackoffice(actor)) {
    throw createForbiddenError();
  }
};

export const ensureBackofficeManager = (actor) => {
  ensureAuthenticated(actor);

  if (!canManageBackoffice(actor)) {
    throw createForbiddenError();
  }
};

export const buildPatientAccessScope = (actor, patientColumnReference, paramIndex = 1) => {
  ensureAuthenticated(actor);

  if (canAccessAllClinicalData(actor)) {
    return {
      clause: 'TRUE',
      params: [],
    };
  }

  if (isPsychologist(actor)) {
    return {
      clause: `(
        EXISTS (
          SELECT 1
          FROM care_relationships cr
          WHERE cr.psychologist_user_id = $${paramIndex}
            AND cr.patient_id = ${patientColumnReference}
            AND cr.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM psychologist_patient_access spa
          WHERE spa.psychologist_user_id = $${paramIndex}
            AND spa.patient_id = ${patientColumnReference}
        )
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
