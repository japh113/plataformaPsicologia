import { errorResponse, successResponse } from '../../utils/response.js';
import { loginUser } from './auth.service.js';
import { validateLoginPayload } from './auth.validators.js';

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
    return next(error);
  }
};

export const meHandler = async (req, res) => {
  return successResponse(res, req.user, 'Current user fetched successfully');
};
