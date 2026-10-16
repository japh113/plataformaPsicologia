import { errorResponse } from '../utils/response.js';
import { getUserById, verifyAuthToken } from '../modules/auth/auth.service.js';
import { ensureAccountCanAuthenticate, ensureSessionIsCurrent } from '../modules/auth/auth.account-status.js';
import env from '../config/env.js';

const getBearerToken = (authorizationHeader = '') => {
  const [scheme, token, extra] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token || extra) {
    return null;
  }

  return token;
};

export const authenticate = async (req, res, next) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) return errorResponse(res, 'Authorization token is required', 401);

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    return errorResponse(res, 'Invalid or expired token', 401);
  }
  try {
    const user = await getUserById(payload.sub);
    ensureAccountCanAuthenticate(user, env);
    ensureSessionIsCurrent(user, payload);
    req.user = user;
    return next();
  } catch (error) {
    if (error.status === 401 || error.status === 403) return errorResponse(res, error.message, error.status);
    return next(error);
  }
};
