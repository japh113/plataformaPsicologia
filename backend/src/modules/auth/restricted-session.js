import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import env from '../../config/env.js';
import { ensureAccountCanAuthenticate, ensureSessionIsCurrent } from './auth.account-status.js';

export const restrictedStates = Object.freeze(['pending_review','rejected','suspended']);
const context = Object.freeze({ issuer:'psicopanel', audience:'professional-status', purpose:'professional-status' });
export const assertRestrictedAccount = user => {
  // Reuse the global/demo checks without relaxing the ordinary guard.
  ensureAccountCanAuthenticate(user && {...user,psychologistStatus:'active'},env);
  if(user?.role!=='psychologist' || !restrictedStates.includes(user.psychologistStatus))
    throw Object.assign(new Error('Restricted session is no longer valid; sign in again'),{status:401});
};
export const signRestrictedToken = user => {
  assertRestrictedAccount(user);
  return jwt.sign({sub:user.id,sv:user.sessionVersion,jti:randomUUID(),purpose:context.purpose},env.restrictedJwtSecret,
    {algorithm:'HS256',issuer:context.issuer,audience:context.audience,expiresIn:600,header:{typ:'professional-status+jwt'}});
};
export const verifyRestrictedToken = token => {
  if(!env.d2Enabled) throw new Error('Restricted access disabled');
  const {payload,header}=jwt.verify(token,env.restrictedJwtSecret,{algorithms:['HS256'],issuer:context.issuer,audience:context.audience,complete:true,maxAge:'10m'});
  if(header.typ!=='professional-status+jwt' || payload.purpose!==context.purpose || typeof payload.sub!=='string' || !payload.sub.trim() ||
    !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat) || payload.exp-payload.iat>600 || typeof payload.jti!=='string') throw new Error('Invalid restricted context');
  return payload;
};
export const validateRestrictedSession = (user,payload) => {assertRestrictedAccount(user);ensureSessionIsCurrent(user,payload);};
