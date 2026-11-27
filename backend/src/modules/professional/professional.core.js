import db from '../../config/db.js';
import env from '../../config/env.js';
import { ensureAccountCanAuthenticate,ensureSessionIsCurrent } from '../auth/auth.account-status.js';
export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const requireD2=async client=>{
  if(!env.d2Enabled) throw fail('Gestión profesional privada deshabilitada.',404);
  const installed=await client.query("SELECT 1 FROM psicopanel_schema_migrations WHERE version='007'");
  if(!installed.rowCount) throw fail('Gestión profesional privada no disponible.',503);
};
export const transaction=async operation=>{
  const client=await db.getClient();
  try {await client.query('BEGIN');await requireD2(client);const result=await operation(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
};
export const lockProfessionalContext=async(client,actor,owner=actor.id,{review=false,onboarding=false}={})=>{
  const accounts=(await client.query(`SELECT id,role,is_active,session_version FROM users
    WHERE id=ANY($1::text[]) ORDER BY id FOR NO KEY UPDATE`,[[...new Set([actor.id,owner])].sort()])).rows;
  const current=accounts.find(row=>row.id===actor.id),target=accounts.find(row=>row.id===owner);
  if(!current || !current.is_active || current.role!==actor.role) throw fail('Sesión no válida.',401);
  ensureSessionIsCurrent({sessionVersion:current.session_version},{sv:actor.sessionVersion});
  if(review ? !['admin','superadmin'].includes(current.role) || owner===actor.id : current.role!=='psychologist' || owner!==actor.id)
    throw fail('Operación no autorizada.',403);
  if(!target || target.role!=='psychologist' || !target.is_active) throw fail('Profesional no disponible.',409);
  const legacy=(await client.query(`
    SELECT approval_status, professional_title, license_number
      ${env.manualAccreditationEnabled ? ', manual_accreditation_required, manual_onboarded_at' : ''}
    FROM psychologist_profiles WHERE user_id=$1 FOR UPDATE
  `,[owner])).rows[0];
  const pendingOnboarding = legacy?.manual_accreditation_required &&
    !legacy.manual_onboarded_at && legacy.approval_status === 'pending_review';
  if (onboarding && !pendingOnboarding) throw fail('La incorporación ya no está disponible. Vuelve a iniciar sesión.', 401);
  ensureAccountCanAuthenticate({id:owner,isActive:target.is_active,role:target.role,
    psychologistStatus:(review || onboarding) && pendingOnboarding ? 'active' : legacy?.approval_status},env);
  const profile = (await client.query('SELECT * FROM professional_publication_profiles WHERE owner_user_id=$1 FOR UPDATE',[owner])).rows[0] || null;
  return { profile, legacy, pendingOnboarding };
};
export const lockProfessional=async(...args)=>(await lockProfessionalContext(...args)).profile;
export const expectVersion=(profile,expected)=>{
  if(!profile) throw fail('Perfil no encontrado.',404);
  if(String(profile.row_version)!==expected) throw fail('El perfil cambió. Recarga antes de guardar.',409);
};
export const safeHandler=operation=>async(req,res)=>{
  try {const data=await operation(req,res);if(!res.headersSent) res.json({success:true,message:'OK',data});}
  catch(error){
    // Never pass SQL details, filesystem paths or decoder diagnostics to the
    // generic legacy error logger. These modules emit only stable safe errors.
    const conflict=['23505','23503','23514','P0001','40P01','40001','55P03'].includes(error.code);
    const status=error.status || (conflict?409:503);
    if(!res.headersSent) res.status(status).json({success:false,message:error.status?error.message:(conflict?'La operación entró en conflicto. Recarga antes de reintentar.':'Servicio privado temporalmente no disponible.')});
  }
};
