import { errorResponse, successResponse } from '../../utils/response.js';
import { ensureBackofficeManager, ensureBackofficeViewer } from './auth.permissions.js';
import {
  createCareRelationship,
  listCareRelationships,
  listBackofficeUsers,
  listPendingPsychologistUsers,
  loginUser,
  registerPatientUser,
  registerPsychologistUser,
  reviewPsychologistUser,
  updateCareRelationship,
} from './auth.service.js';
import {
  validateCreateCareRelationshipPayload,
  validateLoginPayload,
  validatePatientRegistrationPayload,
  validatePsychologistRegistrationPayload,
  validatePsychologistReviewPayload,
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
    ensureBackofficeViewer(req.user);
    const relationships = await listCareRelationships();
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

export const meHandler = async (req, res) => {
  return successResponse(res, req.user, 'Current user fetched successfully');
};
