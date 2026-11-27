import env from '../../config/env.js';
import {logAuditEvent} from '../../utils/audit.js';
import {expectVersion, fail, lockProfessional, transaction} from './professional.core.js';
import {decimal, exact, text} from './professional.validators.js';
import {readProcessedPhoto} from './professional.photos.js';
import {approvedApproachCodes, directoryLocations, directoryModalities, isDirectoryLocation} from './directory.catalog.js';

const pageSize = 12;
const lastPage = 100;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const notAvailable = () => fail('Perfil o fotografía no disponible.', 404);
export function requireDirectory() {
  if (!env.directoryEnabled) throw notAvailable();
}

const places = JSON.stringify(Object.entries(directoryLocations)
  .flatMap(([state, cities]) => cities.map(city => ({state, city}))));
const cityNames = new Set(Object.values(directoryLocations).flat());
const fold = value => value.toLowerCase().replace(/[áéíóúüñ]/gu, letter => 'aeiouun'['áéíóúüñ'.indexOf(letter)]);

function parseFilters(query) {
  exact(query, ['name', 'city', 'state', 'modality', 'accepting', 'page']);
  const name = query.name === undefined ? '' : text(query.name, 100).normalize('NFC');
  const {city = '', state = '', modality = '', accepting = '', page = '1'} = query;
  if (!/^[\p{L}\p{M} .’'-]*$/u.test(name) ||
      (city !== '' && !cityNames.has(city)) ||
      (state !== '' && (typeof state !== 'string' || !Object.hasOwn(directoryLocations, state))) ||
      (city && state && !isDirectoryLocation(city, state)) ||
      (modality !== '' && (typeof modality !== 'string' || !Object.hasOwn(directoryModalities, modality))) ||
      !['', 'true', 'false'].includes(accepting) ||
      typeof page !== 'string' || !/^[1-9][0-9]{0,2}$/.test(page) || Number(page) > lastPage) {
    throw fail('Filtros del directorio no válidos.');
  }
  return {name: fold(name), city, state, modality, accepting: accepting ? accepting === 'true' : null, page: Number(page)};
}

function validateId(id) {
  if (typeof id !== 'string' || !uuid.test(id)) throw notAvailable();
}

const credentialSource = `
  JOIN professional_credential_versions v ON (v.owner_user_id,v.version)=(p.owner_user_id,p.approved_credential_version)
`;
const eligiblePublic = `
  FROM professional_publication_profiles p
  JOIN users u ON u.id=p.owner_user_id AND u.is_active AND u.role='psychologist'
  JOIN psychologist_profiles pp ON pp.user_id=p.owner_user_id AND pp.approval_status='active'
  ${credentialSource}
  JOIN jsonb_to_recordset($1::jsonb) AS place(city text,state text) ON (place.city,place.state)=(p.city,p.state)
  WHERE p.is_public AND p.modality IS NOT NULL AND has_current_manual_accreditation(p.owner_user_id)
`;
const search = `
  AND ($3='' OR strpos(translate(lower(normalize(v.professional_name,NFC)),'áéíóúüñ','aeiouun'),$3)>0)
  AND ($4='' OR p.city=$4)
  AND ($5='' OR p.state=$5)
  AND ($6='' OR p.modality=$6 OR (p.modality='both' AND $6 IN ('in_person','online')))
  AND ($7::boolean IS NULL OR p.accepts_new_patients=$7)
`;
const order = 'ORDER BY lower(v.professional_name),p.public_id';

const projection = `
  SELECT p.owner_user_id,p.public_id,p.city,p.state,p.modality,p.accepts_new_patients,
    v.professional_name,v.professional_title,v.license_number,v.educational_institution,
    (SELECT f.id FROM professional_photographs f
      WHERE f.id=p.current_photo_id AND f.owner_user_id=p.owner_user_id AND f.status='ready') AS photo_id,
    ARRAY(SELECT a.label FROM professional_profile_approaches pa
      JOIN professional_general_approaches a ON a.code=pa.approach_code
      WHERE pa.owner_user_id=p.owner_user_id AND a.code=ANY($2::text[]) ORDER BY a.code) AS approaches
`;
function publicDTO(row) {
  const {public_id, professional_name, professional_title, license_number, educational_institution,
    modality, city, state, photo_id, approaches, accepts_new_patients} = row;
  const phrases = [];
  if (modality) phrases.push('Atención ' + directoryModalities[modality]);
  if (isDirectoryLocation(city, state)) phrases.push(city === state ? city : city + ', ' + state);
  return {
    publicId: public_id,
    professionalName: professional_name,
    photoUrl: photo_id && env.professionalMediaRoot ? `/directory/${public_id}/photo/${photo_id}` : null,
    professionalTitle: professional_title,
    educationalInstitution: educational_institution,
    licenseNumber: license_number,
    modality,
    city: isDirectoryLocation(city, state) ? city : null,
    state: isDirectoryLocation(city, state) ? state : null,
    description: phrases.length ? phrases.join(' · ') : '',
    approaches,
    acceptsNewPatients: accepts_new_patients,
  };
}

async function lockPublicAccounts(client, owners) {
  // Same lock order as the professional mutations, including account/validity changes.
  await client.query('SELECT id FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE', [owners]);
  await client.query('SELECT user_id FROM psychologist_profiles WHERE user_id=ANY($1::text[]) ORDER BY user_id FOR SHARE', [owners]);
  await client.query('SELECT owner_user_id FROM professional_publication_profiles WHERE owner_user_id=ANY($1::text[]) ORDER BY owner_user_id FOR SHARE', [owners]);
}

async function publicRead(operation, hideOnContention = false) {
  try {
    return await transaction(async client => {
      await client.query("SET LOCAL lock_timeout='750ms'; SET LOCAL statement_timeout='2500ms'");
      return operation(client);
    });
  } catch (error) {
    if (error.code === '55P03' && hideOnContention) throw notAvailable();
    if (['55P03','57014'].includes(error.code)) throw fail('Directorio temporalmente no disponible.', 503);
    throw error;
  }
}

export function listDirectory(query) {
  const {name, city, state, modality, accepting, page} = parseFilters(query);
  const filters = [places, approvedApproachCodes, name, city, state, modality, accepting];
  return publicRead(async client => {
    const candidates = (await client.query(`
      ${projection} ${eligiblePublic} ${search} ${order} LIMIT $8 OFFSET $9
    `, [...filters, pageSize + 1, (page - 1) * pageSize])).rows;
    if (!candidates.length) return {profiles: [], page, hasMore: false};
    const owners = candidates.map(row => row.owner_user_id);
    await lockPublicAccounts(client, owners);
    const {rows} = await client.query(`
      ${projection} ${eligiblePublic} ${search} AND p.owner_user_id=ANY($8::text[]) ${order}
    `, [...filters, owners]);
    return {profiles: rows.slice(0, pageSize).map(publicDTO), page, hasMore: rows.length > pageSize && page < lastPage};
  });
}

async function findPublic(client, id) {
  return (await client.query(`
    ${projection} ${eligiblePublic} AND p.public_id=$3
  `, [places, approvedApproachCodes, id])).rows[0];
}

async function lockPublicProfile(client, id) {
  const candidate = await findPublic(client, id);
  if (!candidate) throw notAvailable();
  await lockPublicAccounts(client, [candidate.owner_user_id]);
  const current = await findPublic(client, id);
  if (!current) throw notAvailable();
  return current;
}

export function getPublicProfile(id) {
  validateId(id);
  return publicRead(async client => publicDTO(await lockPublicProfile(client, id)), true);
}

export function getPublicPhoto(id, photoId) {
  validateId(id);
  validateId(photoId);
  if (!env.professionalMediaRoot) throw notAvailable();
  return publicRead(async client => {
    const current = await lockPublicProfile(client, id);
    if (current.photo_id !== photoId) throw notAvailable();
    const photo = (await client.query(`
      SELECT storage_key,byte_size FROM professional_photographs
      WHERE owner_user_id=$1 AND id=$2 AND status='ready'
    `, [current.owner_user_id, photoId])).rows[0];
    if (!photo) throw notAvailable();
    let buffer;
    try {
      buffer = await readProcessedPhoto(photo);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code) || error.status === 404) throw notAvailable();
      throw error;
    }
    // The locks serialize changes to the photo and approval. Time can still cross validity.
    if ((await findPublic(client, id))?.photo_id !== photoId) throw notAvailable();
    return buffer;
  }, true);
}

export function getPublicationPreview(actor) {
  return transaction(async client => {
    const profile = await lockProfessional(client, actor);
    if (!profile) throw fail('Crea primero tu perfil privado.', 404);
    const row = (await client.query(`
      ${projection},has_current_manual_accreditation(p.owner_user_id) AS current_accreditation
      FROM professional_publication_profiles p ${credentialSource}
      WHERE p.owner_user_id=$1
    `, [actor.id, approvedApproachCodes])).rows[0];
    return {
      rowVersion: String(profile.row_version),
      approvedName: row?.professional_name ?? null,
      profile: row?.current_accreditation ? publicDTO(row) : null,
      ready: Boolean(row?.current_accreditation && row.modality && isDirectoryLocation(row.city, row.state)),
      locations: directoryLocations,
    };
  });
}

export function setPublicationPreferences(actor, body) {
  exact(body, ['rowVersion', 'isPublic', 'acceptsNewPatients']);
  const version = decimal(body.rowVersion);
  const {isPublic, acceptsNewPatients} = body;
  if (![isPublic, acceptsNewPatients].every(value => value === undefined || typeof value === 'boolean') ||
      (isPublic === undefined && acceptsNewPatients === undefined)) throw fail('Preferencias no válidas.');
  return transaction(async client => {
    const profile = await lockProfessional(client, actor);
    expectVersion(profile, version);
    if (isPublic === true && (!profile.modality || !isDirectoryLocation(profile.city, profile.state))) {
      throw fail('Elige una modalidad, ciudad y estado del catálogo antes de publicar.', 409);
    }
    const {rows} = await client.query(`
      UPDATE professional_publication_profiles SET is_public=COALESCE($2,is_public),
        accepts_new_patients=COALESCE($3,accepts_new_patients),row_version=row_version+1
      WHERE owner_user_id=$1 AND
        (NOT (COALESCE($2,false) OR COALESCE($3,false)) OR has_current_manual_accreditation($1))
      RETURNING is_public,accepts_new_patients,row_version::text
    `, [actor.id, isPublic ?? null, acceptsNewPatients ?? null]);
    if (!rows.length) throw fail('Necesitas una acreditación manual vigente para activar esta preferencia.', 409);
    const row = rows[0];
    await logAuditEvent(client, {actorUserId: actor.id, actorRole: actor.role, action: 'professional_publication_preferences_changed',
      entityType: 'professional_profile', targetUserId: actor.id,
      metadata: {isPublic: row.is_public, acceptsNewPatients: row.accepts_new_patients}});
    return {isPublic: row.is_public, acceptsNewPatients: row.accepts_new_patients, rowVersion: row.row_version};
  });
}
