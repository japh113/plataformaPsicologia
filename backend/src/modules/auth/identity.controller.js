import { successResponse, errorResponse } from '../../utils/response.js';
import { ensurePatientIdentityOwner, getOwnIdentity, updateOwnIdentity, requestVerification, confirmVerification } from './identity.service.js';
const handler = action => async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  try { ensurePatientIdentityOwner(req.user); return successResponse(res, await action(req)); }
  catch (error) {
    if (error.status) {
      if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
      return errorResponse(res, error.message, error.status);
    }
    // No request body/secret in error reporting.
    return next(new Error('Identity operation failed'));
  }
};
export const getOwnIdentityHandler = handler(req => getOwnIdentity(req.user));
export const updateOwnIdentityHandler = handler(req => updateOwnIdentity(req.user, req.body));
export const requestVerificationHandler = handler(req => {
  if (Object.keys(req.body || {}).length) throw Object.assign(new Error('La solicitud no admite contactos ni identificadores.'), { status: 400 });
  return requestVerification(req.user, req.params.channel);
});
export const confirmVerificationHandler = handler(req => confirmVerification(req.user, req.params.channel, req.body));
