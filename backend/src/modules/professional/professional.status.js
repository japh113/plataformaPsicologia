import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import env from '../../config/env.js';
import {getUserById} from '../auth/auth.service.js';
import {verifyRestrictedToken,validateRestrictedSession} from '../auth/restricted-session.js';
import {transaction,safeHandler,fail} from './professional.core.js';
import {createPublicAuthLimiter,publicAuthClientKey} from '../auth/public-auth-limiter.js';
import {getManualAccreditation,submitManualAccreditation} from './manual-accreditation.service.js';
const router=Router();
export const authenticateRestricted=async(req,res,next)=>{
  try{
    if(!env.d2Enabled)throw fail('Not found',404);
    const match=/^Bearer ([^ ]+)$/.exec(req.headers.authorization||'');if(!match)throw fail('Sesión restringida requerida.',401);
    let payload;try{payload=verifyRestrictedToken(match[1]);}catch{throw fail('Sesión restringida no válida.',401);}
    const user=await getUserById(payload.sub);validateRestrictedSession(user,payload);
    req.restrictedSession={id:user.id,payload,role:user.role,sessionVersion:payload.sv,fullName:user.fullName};next();
  }catch(error){res.status(error.status||503).json({success:false,message:error.status?error.message:'Estado temporalmente no disponible.'});}
};
// The bounded socket-peer guard runs before the Express limiter and token verification.
router.use(createPublicAuthLimiter({limit:120,windowMs:60_000}));
const expressBudget=rateLimit({
  windowMs:60_000, limit:120, keyGenerator:publicAuthClientKey,
  validate:{keyGeneratorIpFallback:false}, legacyHeaders:false, standardHeaders:'draft-7',
  handler:(_req,res)=>res.set('Cache-Control','no-store').status(429)
    .json({success:false,message:'Demasiadas solicitudes. Intenta más tarde.'}),
});
router.use(expressBudget,authenticateRestricted,(_req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  next();
});
router.get('/me',safeHandler(async(req)=>{
  return transaction(async client=>{
    const {id,payload}=req.restrictedSession;
    const row=(await client.query('SELECT id,role,is_active,session_version FROM users WHERE id=$1 FOR NO KEY UPDATE',[id])).rows[0];
    const profile=(await client.query(`SELECT approval_status
      ${env.manualAccreditationEnabled ? ', manual_accreditation_required, manual_onboarded_at' : ''}
      FROM psychologist_profiles WHERE user_id=$1 FOR UPDATE`,[id])).rows[0];
    validateRestrictedSession(row?{id:row.id,role:row.role,isActive:row.is_active,sessionVersion:row.session_version,psychologistStatus:profile?.approval_status}:null,payload);
    return {status:profile.approval_status,
      manualOnboarding:Boolean(profile.manual_accreditation_required && !profile.manual_onboarded_at && profile.approval_status==='pending_review'),
      messages:(await client.query(`SELECT id,account_status AS "accountStatus",owner_message AS message,created_at AS "createdAt"
      FROM professional_account_messages WHERE owner_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50`,[id])).rows};
  });
}));
router.get('/me/accreditation',safeHandler(req=>getManualAccreditation(req.restrictedSession,{onboarding:true})));
router.post('/me/accreditation',safeHandler(req=>submitManualAccreditation(req.restrictedSession,req.body,{onboarding:true})));
export default router;
