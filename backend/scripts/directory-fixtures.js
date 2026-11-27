import {getUserById, reviewPsychologistUser} from '../src/modules/auth/auth.service.js';
import {decideManualAccreditation, submitManualAccreditation} from '../src/modules/professional/manual-accreditation.service.js';
import {getProfile, updateProfile} from '../src/modules/professional/professional.service.js';
import {setPublicationPreferences} from '../src/modules/professional/directory.service.js';

export const directoryReviewer = {id:'accreditation-reviewer', role:'admin', sessionVersion:0};
export const directoryEvidence = () => ({
  checkedOn:new Date().toISOString().slice(0,10), reference:'SIM-DIRECTORY-01', identityMethod:'simulated_official_id',
  license:'matches', holder:'matches', title:'matches', institution:'matches', identity:'matches',
});
export const directoryCredentials = (professionalName, licenseNumber) => ({
  professionalName, licenseNumber, professionalTitle:'Licenciatura en Psicología',
  educationalInstitution:'Instituto Ficticio de Psicología',
});
export const directoryReview = (rowVersion, outcome = 'approved', evidence = directoryEvidence()) => ({
  rowVersion, outcome, evidence,
  message:'Comprobación ficticia del directorio.',
  internalNote:'Observación interna ficticia reservada.',
});

export const changeFixtureAccount = (id, approvalStatus) => reviewPsychologistUser({
  reviewerUserId:directoryReviewer.id, reviewerRole:directoryReviewer.role,
  reviewerSessionVersion:directoryReviewer.sessionVersion,
  psychologistUserId:id, approvalStatus, ownerMessage:'Resolución ficticia de la cuenta.',
});

export async function seedDirectoryProfessional(client, {slug, name, license, passwordHash, modality='both',
  city='Chihuahua', state='Chihuahua', approaches=[], publishes=false, accepts=false}) {
  const id = 'directory-' + slug;
  const email = slug + '@directory.invalid';
  const [firstName,...lastName] = name.split(' ');
  await client.query(`
    INSERT INTO users(id,role,first_name,last_name,email,password_hash) VALUES ($1,'psychologist',$2,$3,$4,$5)
  `, [id,firstName,lastName.join(' '),email,passwordHash]);
  await client.query(`
    INSERT INTO psychologist_profiles(user_id,approval_status,manual_accreditation_required) VALUES($1,'pending_review',true)
  `, [id]);
  const restricted = {...await getUserById(id),payload:{exp:Math.floor(Date.now()/1000)+600}};
  const credentials = directoryCredentials(name,license);
  const {version} = await submitManualAccreditation(restricted,{rowVersion:'0',...credentials},{onboarding:true});
  await decideManualAccreditation(directoryReviewer,id,version,directoryReview('1'),'proposal');
  await changeFixtureAccount(id,'active');
  const actor = await getUserById(id);
  const {profile} = await getProfile(actor);
  const updated = await updateProfile(actor,{
    rowVersion:profile.rowVersion, description:'Descripción privada del ensayo. Contacto privado ficticio.',
    modality, city, state, approachCodes:approaches,
  });
  if (publishes || accepts) await setPublicationPreferences(actor,{
    rowVersion:updated.profile.rowVersion,isPublic:publishes,acceptsNewPatients:accepts,
  });
  return {actor,email,publicId:profile.publicId,version,credentials};
}

export async function fixtureAccreditationExpiry(client, owner, {keepPreferences = false} = {}) {
  await client.query(`
    WITH expired AS (
      INSERT INTO professional_manual_reviews(owner_user_id,credential_version,reviewer_user_id,reviewer_role,
        outcome,owner_message,source_code,checked_on,source_reference,license_result,holder_result,
        title_result,institution_result,identity_method,identity_result)
      VALUES($1,$2,$3,'admin','revalidated','Ensayo de vencimiento','simulated_registry',
        (clock_timestamp() AT TIME ZONE 'UTC')::date - interval '12 months','SIM-EXPIRY',
        'matches','matches','matches','matches','simulated_official_id','matches')
      RETURNING id,checked_on
    )
    UPDATE professional_credential_validity AS v
    SET evidence_reference=expired.id::text,valid_from=expired.checked_on,
      valid_until=(expired.checked_on + interval '12 months')::date,
      row_version=v.row_version+1
    FROM expired WHERE v.owner_user_id=$1 AND v.credential_version=$2
  `,[owner.actor.id,owner.version,directoryReviewer.id]);
  if (keepPreferences) {
    // Model the flags surviving passage of time, which doesn't execute SQL triggers.
    await client.query(`
      UPDATE professional_publication_profiles SET is_public=true,accepts_new_patients=true,row_version=row_version+1
      WHERE owner_user_id=$1
    `,[owner.actor.id]);
  }
}
