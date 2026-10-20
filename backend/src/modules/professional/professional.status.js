import {Router} from 'express';
import env from '../../config/env.js';
import {getUserById} from '../auth/auth.service.js';
import {verifyRestrictedToken,validateRestrictedSession} from '../auth/restricted-session.js';
import {transaction,safeHandler,fail} from './professional.core.js';
const router=Router();
export const authenticateRestricted=async(req,res,next)=>{
  try{
    if(!env.d2Enabled)throw fail('Not found',404);
    const match=/^Bearer ([^ ]+)$/.exec(req.headers.authorization||'');if(!match)throw fail('Sesión restringida requerida.',401);
    let payload;try{payload=verifyRestrictedToken(match[1]);}catch{throw fail('Sesión restringida no válida.',401);}
    const user=await getUserById(payload.sub);validateRestrictedSession(user,payload);
    req.restrictedSession={id:user.id,payload};next();
  }catch(error){res.status(error.status||503).json({success:false,message:error.status?error.message:'Estado temporalmente no disponible.'});}
};
router.get('/me',authenticateRestricted,safeHandler(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  return transaction(async client=>{
    const {id,payload}=req.restrictedSession;
    const row=(await client.query('SELECT id,role,is_active,session_version FROM users WHERE id=$1 FOR NO KEY UPDATE',[id])).rows[0];
    const profile=(await client.query('SELECT approval_status FROM psychologist_profiles WHERE user_id=$1 FOR UPDATE',[id])).rows[0];
    validateRestrictedSession(row?{id:row.id,role:row.role,isActive:row.is_active,sessionVersion:row.session_version,psychologistStatus:profile?.approval_status}:null,payload);
    return {status:profile.approval_status,messages:(await client.query(`SELECT id,account_status AS "accountStatus",owner_message AS message,created_at AS "createdAt"
      FROM professional_account_messages WHERE owner_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50`,[id])).rows};
  });
}));
export default router;
