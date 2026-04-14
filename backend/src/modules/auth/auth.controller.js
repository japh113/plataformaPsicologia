import { errorResponse, successResponse } from '../../utils/response.js';
import { ensureBackofficeManager, ensureBackofficeViewer } from './auth.permissions.js';
import {
  acceptCareRelationshipInvite,
  confirmPasswordReset,
  createCareRelationship,
  inviteCareRelationship,
  listAuditLogs,
  listAvailablePsychologists,
  listCareRelationships,
  listBackofficeUsers,
  listPendingPsychologistUsers,
  loginUser,
  requestCareRelationship,
  requestPasswordReset,
  registerPatientUser,
  registerPsychologistUser,
  respondToCareRelationship,
  reviewPsychologistUser,
  updateCareRelationship,
} from './auth.service.js';
import {
  validateAcceptCareRelationshipInvitePayload,
  validateCreateCareRelationshipPayload,
  validateInviteCareRelationshipPayload,
  validateLoginPayload,
  validatePasswordResetConfirmPayload,
  validatePasswordResetRequestPayload,
  validatePatientRegistrationPayload,
  validatePsychologistRegistrationPayload,
  validatePsychologistReviewPayload,
  validateRequestCareRelationshipPayload,
  validateRespondCareRelationshipPayload,
  validateUpdateCareRelationshipPayload,
} from './auth.validators.js';

export const loginHandler = async (req, res, next) => {
  try {
    const errors = validateLoginPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const session = await loginUser(req.body);

    if (!session) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    return successResponse(res, session, 'Login successful');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const requestPasswordResetHandler = async (req, res, next) => {
  try {
    const errors = validatePasswordResetRequestPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const result = await requestPasswordReset(req.body);
    return successResponse(res, result, 'Password reset instructions generated successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const confirmPasswordResetHandler = async (req, res, next) => {
  try {
    const errors = validatePasswordResetConfirmPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const result = await confirmPasswordReset(req.body);
    return successResponse(res, result, 'Password updated successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const registerPatientHandler = async (req, res, next) => {
  try {
    const errors = validatePatientRegistrationPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const session = await registerPatientUser(req.body);
    return successResponse(res, session, 'Patient account created successfully', 201);
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const registerPsychologistHandler = async (req, res, next) => {
  try {
    const errors = validatePsychologistRegistrationPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const psychologistUser = await registerPsychologistUser(req.body);
    return successResponse(
      res,
      psychologistUser,
      'Psychologist account created and pending review',
      201,
    );
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const listPendingPsychologistsHandler = async (req, res, next) => {
  try {
    ensureBackofficeViewer(req.user);
    const pendingPsychologists = await listPendingPsychologistUsers();
    return successResponse(res, pendingPsychologists, 'Pending psychologists fetched successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const reviewPsychologistHandler = async (req, res, next) => {
  try {
    ensureBackofficeManager(req.user);

    const errors = validatePsychologistReviewPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const reviewedUser = await reviewPsychologistUser({
      reviewerUserId: req.user.id,
      reviewerRole: req.user.role,
      psychologistUserId: req.params.userId,
      approvalStatus: req.body.approvalStatus,
      reviewNotes: req.body.reviewNotes || '',
    });

    return successResponse(res, reviewedUser, 'Psychologist review updated successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const listBackofficeUsersHandler = async (req, res, next) => {
  try {
    ensureBackofficeViewer(req.user);
    const users = await listBackofficeUsers();
    return successResponse(res, users, 'Backoffice users fetched successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const listCareRelationshipsHandler = async (req, res, next) => {
  try {
    const relationships = await listCareRelationships(req.user);
    return successResponse(res, relationships, 'Care relationships fetched successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const createCareRelationshipHandler = async (req, res, next) => {
  try {
    ensureBackofficeManager(req.user);

    const errors = validateCreateCareRelationshipPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const relationship = await createCareRelationship({
      actor: req.user,
      patientId: req.body.patientId,
      psychologistUserId: req.body.psychologistUserId,
      status: req.body.status || 'active',
      notes: req.body.notes || '',
    });

    return successResponse(res, relationship, 'Care relationship created successfully', 201);
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const updateCareRelationshipHandler = async (req, res, next) => {
  try {
    ensureBackofficeManager(req.user);

    const errors = validateUpdateCareRelationshipPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const relationship = await updateCareRelationship({
      actor: req.user,
      relationshipId: req.params.relationshipId,
      status: req.body.status,
      notes: req.body.notes || '',
    });

    return successResponse(res, relationship, 'Care relationship updated successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const listAvailablePsychologistsHandler = async (req, res, next) => {
  try {
    const psychologists = await listAvailablePsychologists();
    return successResponse(res, psychologists, 'Available psychologists fetched successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const requestCareRelationshipHandler = async (req, res, next) => {
  try {
    const errors = validateRequestCareRelationshipPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const relationship = await requestCareRelationship({
      actor: req.user,
      psychologistUserId: req.body.psychologistUserId,
      notes: req.body.notes || '',
    });

    return successResponse(res, relationship, 'Care relationship request created successfully', 201);
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const inviteCareRelationshipHandler = async (req, res, next) => {
  try {
    const errors = validateInviteCareRelationshipPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const relationship = await inviteCareRelationship({
      actor: req.user,
      patientEmail: req.body.patientEmail,
      notes: req.body.notes || '',
    });

    return successResponse(res, relationship, 'Patient invitation created successfully', 201);
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const respondToCareRelationshipHandler = async (req, res, next) => {
  try {
    const errors = validateRespondCareRelationshipPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const relationship = await respondToCareRelationship({
      actor: req.user,
      relationshipId: req.params.relationshipId,
      status: req.body.status,
      notes: req.body.notes || '',
    });

    return successResponse(res, relationship, 'Care relationship response saved successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const listAuditLogsHandler = async (req, res, next) => {
  try {
    ensureBackofficeViewer(req.user);
    const auditLogs = await listAuditLogs({
      action: req.query.action || '',
      actorRole: req.query.actorRole || '',
      search: req.query.search || '',
    });
    return successResponse(res, auditLogs, 'Audit logs fetched successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const acceptCareRelationshipInviteHandler = async (req, res, next) => {
  try {
    const errors = validateAcceptCareRelationshipInvitePayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const relationship = await acceptCareRelationshipInvite({
      actor: req.user,
      inviteCode: req.body.inviteCode,
    });

    return successResponse(res, relationship, 'Invitation accepted successfully');
  } catch (error) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }

    return next(error);
  }
};

export const meHandler = async (req, res) => {
  return successResponse(res, req.user, 'Current user fetched successfully');
};
