import {transaction,lockProfessional,expectVersion,fail} from './professional.core.js';
import {directPayload,proposalPayload,decisionPayload,decimal} from './professional.validators.js';
import {logAuditEvent} from '../../utils/audit.js';
import env from '../../config/env.js';
const projection=row=>row?{publicId:row.public_id,rowVersion:String(row.row_version),description:row.description,modality:row.modality,
  city:row.city,state:row.state,isPublic:row.is_public,acceptsNewPatients:row.accepts_new_patients,
  approvedCredentialVersion:row.approved_credential_version,pendingCredentialVersion:row.pending_credential_version,currentPhotoId:row.current_photo_id}:null;
const catalog=async client=>(await client.query('SELECT code,label FROM professional_general_approaches ORDER BY code')).rows;
const profileDTO=async(client,row)=>({profile:projection(row),approaches:row?(await client.query('SELECT approach_code FROM professional_profile_approaches WHERE owner_user_id=$1 ORDER BY approach_code',[row.owner_user_id])).rows.map(r=>r.approach_code):[],catalog:await catalog(client),capabilities:{publish:false,approveCredentials:false,descriptionPubliclyCleared:false,photographsConfigured:Boolean(env.professionalMediaRoot)}});
export const getProfile=actor=>transaction(async client=>profileDTO(client,await lockProfessional(client,actor)));
export const createProfile=actor=>transaction(async client=>{
  let profile=await lockProfessional(client,actor);
  if(!profile)profile=(await client.query('INSERT INTO professional_publication_profiles(owner_user_id) VALUES($1) RETURNING *',[actor.id])).rows[0];
  return profileDTO(client,profile);
});
export const updateProfile=(actor,body)=>{
  const changes=directPayload(body);
  return transaction(async client=>{
    const profile=await lockProfessional(client,actor);expectVersion(profile,body.rowVersion);
    if(changes.approachCodes){const allowed=await catalog(client);if(changes.approachCodes.some(code=>!allowed.some(row=>row.code===code)))throw fail('Enfoque no autorizado.');
      await client.query('DELETE FROM professional_profile_approaches WHERE owner_user_id=$1',[actor.id]);
      for(const code of changes.approachCodes)await client.query('INSERT INTO professional_profile_approaches(owner_user_id,approach_code) VALUES($1,$2)',[actor.id,code]);}
    const next=(await client.query(`UPDATE professional_publication_profiles SET description=$3,modality=$4,city=$5,state=$6,row_version=row_version+1
      WHERE owner_user_id=$1 AND row_version=$2 RETURNING *`,[actor.id,body.rowVersion,changes.description??profile.description,
      Object.hasOwn(changes,'modality')?changes.modality:profile.modality,changes.city??profile.city,changes.state??profile.state])).rows[0];
    return profileDTO(client,next);
  });
};
const versionDTO=row=>row?{version:String(row.version),professionalName:row.professional_name,professionalTitle:row.professional_title,licenseNumber:row.license_number,
  academicTraining:row.academic_training,formalSpecialties:row.formal_specialties,certifications:row.certifications,credentialedApproaches:row.credentialed_approaches}:null;
const snapshot=async(client,owner,version)=>version==null?null:versionDTO((await client.query('SELECT * FROM professional_credential_versions WHERE owner_user_id=$1 AND version=$2',[owner,version])).rows[0]);
export const getCredentials=actor=>transaction(async client=>{
  const profile=await lockProfessional(client,actor);if(!profile)throw fail('Crea primero tu perfil privado.',404);
  const decisions=(await client.query(`SELECT credential_version::text AS version,outcome,owner_message AS "ownerMessage",decided_at AS "decidedAt"
    FROM professional_credential_decisions WHERE owner_user_id=$1 ORDER BY credential_version DESC LIMIT 50`,[actor.id])).rows;
  return {rowVersion:String(profile.row_version),approved:await snapshot(client,actor.id,profile.approved_credential_version),pending:await snapshot(client,actor.id,profile.pending_credential_version),decisions};
});
export const submitProposal=(actor,body)=>{
  const value=proposalPayload(body);
  return transaction(async client=>{
    const profile=await lockProfessional(client,actor);expectVersion(profile,body.rowVersion);
    if(profile.pending_credential_version!==null)throw fail('Ya existe una propuesta pendiente.',409);
    const version=(await client.query('SELECT (COALESCE(max(version),0)+1)::text AS version FROM professional_credential_versions WHERE owner_user_id=$1',[actor.id])).rows[0].version;
    await client.query(`INSERT INTO professional_credential_versions(owner_user_id,version,professional_name,professional_title,license_number,academic_training,formal_specialties,certifications,credentialed_approaches)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[actor.id,version,...Object.values(value)]);
    await client.query('UPDATE professional_publication_profiles SET pending_credential_version=$2,row_version=row_version+1 WHERE owner_user_id=$1',[actor.id,version]);
    await logAuditEvent(client,{actorUserId:actor.id,actorRole:actor.role,action:'professional_proposal_submitted',entityType:'professional_credential',entityId:version,targetUserId:actor.id});
    return {version,rowVersion:String(BigInt(profile.row_version)+1n)};
  });
};
const ensureReviewer=actor=>{if(!['admin','superadmin'].includes(actor?.role))throw fail('Operación no autorizada.',403);};
export const listReviews=actor=>{
  ensureReviewer(actor);return transaction(async client=>{
    const reviewer=(await client.query('SELECT role,is_active,session_version FROM users WHERE id=$1 FOR NO KEY UPDATE',[actor.id])).rows[0];
    if(!reviewer?.is_active || reviewer.role!==actor.role || reviewer.session_version!==actor.sessionVersion)throw fail('Sesión no válida.',401);
    return (await client.query(`SELECT p.owner_user_id AS "ownerId",p.pending_credential_version::text AS version,v.professional_name AS "professionalName"
      FROM professional_publication_profiles p JOIN professional_credential_versions v ON (v.owner_user_id,v.version)=(p.owner_user_id,p.pending_credential_version)
      JOIN users u ON u.id=p.owner_user_id JOIN psychologist_profiles pp ON pp.user_id=u.id
      WHERE u.is_active AND pp.approval_status='active' ORDER BY v.created_at,p.owner_user_id LIMIT 100`)).rows;
  });
};
export const getReview=(actor,owner,version)=>{
  ensureReviewer(actor);decimal(version);return transaction(async client=>{
    const profile=await lockProfessional(client,actor,owner,{review:true});if(!profile || profile.pending_credential_version!==version)throw fail('Propuesta no vigente.',409);
    return {ownerId:owner,rowVersion:String(profile.row_version),approved:await snapshot(client,owner,profile.approved_credential_version),pending:await snapshot(client,owner,version),approvalEnabled:false,
      internalNotes:(await client.query('SELECT body,created_at AS "createdAt" FROM professional_review_internal_notes WHERE owner_user_id=$1 AND credential_version=$2 ORDER BY created_at',[owner,version])).rows};
  });
};
// There is no runtime flag that authorizes real approvals. The HTTP caller uses
// this closed policy. Tests can inject a policy for their isolated synthetic data.
const noApprovedCriteria=()=>false;
export const decideCredential=(actor,owner,version,body,{approvalPolicy=noApprovedCriteria}={})=>{
  ensureReviewer(actor);decimal(version);decisionPayload(body);
  return transaction(async client=>{
    const profile=await lockProfessional(client,actor,owner,{review:true});expectVersion(profile,body.rowVersion);
    if(profile.pending_credential_version!==version)throw fail('Propuesta no vigente.',409);
    const proposed=await snapshot(client,owner,version);
    if(body.outcome==='approved' && !await approvalPolicy({owner,proposed,evidenceReference:body.evidenceReference}))throw fail('Aprobación deshabilitada: faltan criterios de evidencia autorizados.',503);
    await client.query(`INSERT INTO professional_credential_decisions(owner_user_id,credential_version,outcome,reviewer_user_id,reviewer_role,owner_message,evidence_reference,valid_from,valid_until)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[owner,version,body.outcome,actor.id,actor.role,body.ownerMessage.trim(),body.outcome==='approved'?body.evidenceReference:null,body.validFrom||null,body.validUntil||null]);
    if(body.internalNote?.trim())await client.query(`INSERT INTO professional_review_internal_notes(owner_user_id,credential_version,reviewer_user_id,reviewer_role,body) VALUES($1,$2,$3,$4,$5)`,[owner,version,actor.id,actor.role,body.internalNote.trim()]);
    if(body.outcome==='approved')await client.query(`INSERT INTO professional_credential_validity(owner_user_id,credential_version,status,evidence_reference,assessed_by_user_id,assessed_by_role,assessed_at,valid_from,valid_until)
      VALUES($1,$2,'supported',$3,$4,$5,clock_timestamp(),$6,$7)`,[owner,version,body.evidenceReference,actor.id,actor.role,body.validFrom||null,body.validUntil||null]);
    await client.query(`UPDATE professional_publication_profiles SET approved_credential_version=$3,pending_credential_version=NULL,row_version=row_version+1 WHERE owner_user_id=$1 AND row_version=$2`,
      [owner,body.rowVersion,body.outcome==='approved'?version:profile.approved_credential_version]);
    await logAuditEvent(client,{actorUserId:actor.id,actorRole:actor.role,action:'professional_credential_decided',entityType:'professional_credential',entityId:version,targetUserId:owner,metadata:{outcome:body.outcome}});
    return {version,outcome:body.outcome,rowVersion:String(BigInt(profile.row_version)+1n)};
  });
};
