import { errorResponse, successResponse } from '../../utils/response.js';
import { ensureAdmin } from './auth.permissions.js';
import {
  listPendingPsychologistUsers,
  loginUser,
  registerPatientUser,
  registerPsychologistUser,
  reviewPsychologistUser,
} from './auth.service.js';
import {
  validateLoginPayload,
  validatePatientRegistrationPayload,
  validatePsychologistRegistrationPayload,
  validatePsychologistReviewPayload,
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
    ensureAdmin(req.user);
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
    ensureAdmin(req.user);

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

export const meHandler = async (req, res) => {
  return successResponse(res, req.user, 'Current user fetched successfully');
};
