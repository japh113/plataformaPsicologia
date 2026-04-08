import { errorResponse } from '../utils/response.js';
import { getUserById, verifyAuthToken } from '../modules/auth/auth.service.js';

const getBearerToken = (authorizationHeader = '') => {
  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
};

export const authenticate = async (req, res, next) => {
  try {
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
      return errorResponse(res, 'Authorization token is required', 401);
    }

    const payload = verifyAuthToken(token);
    const user = await getUserById(payload.sub);

    if (!user) {
      return errorResponse(res, 'User not found or inactive', 401);
    }

    req.user = user;
    return next();
  } catch (error) {
    return errorResponse(res, 'Invalid or expired token', 401);
  }
};
