import env from '../../config/env.js';
import {fail, lockProfessionalContext, transaction} from './professional.core.js';
import {decimal, exact, text} from './professional.validators.js';
import {logAuditEvent} from '../../utils/audit.js';

const fieldNames = ['professionalName', 'licenseNumber', 'professionalTitle', 'educationalInstitution'];
const resultFields = ['license', 'holder', 'title', 'institution', 'identity'];
const outcomes = ['approved', 'inconclusive', 'returned', 'rejected', 'revalidation_requested', 'revalidated'];
const results = ['matches', 'discrepancy', 'unavailable', 'pending'];
const lock = async (client, actor, owner, options) => {
  if (!env.manualAccreditationEnabled) throw fail('Acreditación manual no disponible.', 404);
  const context = await lockProfessionalContext(client, actor, owner, options);
  if (options?.onboarding && actor.payload.exp <= Date.now() / 1000) throw fail('La sesión terminó. Vuelve a iniciar sesión.', 401);
  if (!context.legacy?.manual_accreditation_required) throw fail('Acreditación manual no disponible.', 404);
  return context;
};

const credentials = (client, owner, version) => client.query(`
  SELECT version::text, professional_name AS "professionalName", license_number AS "licenseNumber",
    professional_title AS "professionalTitle", educational_institution AS "educationalInstitution"
  FROM professional_credential_versions WHERE owner_user_id=$1 AND version=$2
`, [owner, version]).then(result => result.rows[0] || null);

export const getManualAccreditation = (actor, {onboarding = false} = {}) => transaction(async client => {
  const {profile, legacy} = await lock(client, actor, actor.id, {onboarding});
  const owner = actor.id;
  const approvedVersion = profile?.approved_credential_version;
  const validity = !approvedVersion ? null : (await client.query(`
    SELECT valid_until::text AS "validUntil", status='requires_review' AS "requiresReview",
      has_current_manual_accreditation($1) AS current
    FROM professional_credential_validity WHERE owner_user_id=$1 AND credential_version=$2
  `, [owner, approvedVersion])).rows[0];
  const events = (await client.query(`
    SELECT id, credential_version::text AS version, outcome, owner_message AS message, created_at AS "createdAt"
    FROM professional_manual_reviews WHERE owner_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30
  `, [owner])).rows;
  const lastResolved = events.find(event => ['returned', 'rejected'].includes(event.outcome));
  const pending = profile?.pending_credential_version;
  return {
    rowVersion: String(profile?.row_version ?? 0),
    accountStatus: legacy.approval_status,
    approved: approvedVersion ? await credentials(client, owner, approvedVersion) : null,
    pending: pending ? await credentials(client, owner, pending) : null,
    suggested: lastResolved
      ? await credentials(client, owner, lastResolved.version)
      : {professionalName: actor.fullName ?? '', professionalTitle: legacy.professional_title, licenseNumber: legacy.license_number, educationalInstitution: ''},
    validity: validity ?? null,
    events,
  };
});

export const submitManualAccreditation = (actor, body, {onboarding = false} = {}) => {
  exact(body, ['rowVersion', ...fieldNames]);
  const rowVersion = decimal(body.rowVersion);
  const [name, license, title, institution] = fieldNames.map(key => text(body[key], 200, true));
  if (!/^[0-9]{1,20}$/.test(license)) throw fail('Escribe el número de cédula con dígitos, sin espacios.');
  return transaction(async client => {
    const {profile} = await lock(client, actor, actor.id, {onboarding});
    const owner = actor.id;
    if (profile?.pending_credential_version != null) throw fail('Ya hay una propuesta en revisión.', 409);
    if (String(profile?.row_version ?? 0) !== rowVersion) throw fail('La solicitud cambió. Actualiza antes de continuar.', 409);
    if (!profile) await client.query('INSERT INTO professional_publication_profiles(owner_user_id) VALUES($1)', [owner]);
    const {version} = (await client.query(`
      INSERT INTO professional_credential_versions
        (owner_user_id,version,professional_name,license_number,professional_title,educational_institution)
      SELECT $1,COALESCE(max(version),0)+1,$2,$3,$4,$5
      FROM professional_credential_versions WHERE owner_user_id=$1 RETURNING version::text
    `, [owner, name, license, title, institution])).rows[0];
    await client.query(`
      UPDATE professional_publication_profiles
      SET pending_credential_version=$2,row_version=row_version+1 WHERE owner_user_id=$1
    `, [owner, version]);
    await audit(client, actor, owner, version, 'professional_proposal_submitted');
    return {version};
  });
};

export const manualReviewDetails = async (client, owner, version, profile, legacy, mode) => {
  if (!legacy.manual_accreditation_required) return null;
  const proposal = await credentials(client, owner, version);
  if (!proposal?.educationalInstitution) throw fail('La versión requiere una nueva presentación.', 409);
  const validity = mode === 'revalidation' ? (await client.query(`
    SELECT status,valid_until::text AS "validUntil" FROM professional_credential_validity
    WHERE owner_user_id=$1 AND credential_version=$2
  `, [owner, version])).rows[0] : null;
  const nationalName = (await client.query(`
    SELECT concat_ws(' ', first_name, nullif(last_name,'')) AS "registeredName" FROM users WHERE id=$1
  `, [owner])).rows[0].registeredName;
  return {
    ownerId: owner,
    rowVersion: String(profile.row_version),
    manual: true,
    mode,
    accountStatus: legacy.approval_status,
    registeredName: nationalName,
    pending: proposal,
    ...(mode === 'proposal' && profile.approved_credential_version ? {
      approved: await credentials(client, owner, profile.approved_credential_version),
    } : {}),
    validity,
  };
};

const audit = (client, actor, owner, version, action, metadata) => logAuditEvent(client, {
  actorUserId: actor.id, actorRole: actor.role, action,
  entityType: 'professional_credential', entityId: version, targetUserId: owner, metadata,
});

const validateReview = (body, mode) => {
  exact(body, ['rowVersion', 'outcome', 'message', 'internalNote', 'evidence', 'priorImpact']);
  const rowVersion = decimal(body.rowVersion);
  const {outcome} = body;
  const validOutcomes = mode === 'revalidation' ? outcomes.slice(4) : outcomes.slice(0, 4);
  if (!validOutcomes.includes(outcome)) throw fail('Selecciona una resolución disponible.');
  const message = text(body.message, 2000, true);
  const note = text(body.internalNote ?? '', 4000);
  const evidence = body.evidence;
  exact(evidence, ['checkedOn', 'reference', 'identityMethod', ...resultFields]);
  const checkedOn = evidence.checkedOn;
  if (typeof checkedOn !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(checkedOn) ||
      !Number.isFinite(Date.parse(checkedOn)) || new Date(checkedOn).toISOString().slice(0, 10) !== checkedOn) {
    throw fail('Indica una fecha de comprobación válida.');
  }
  const reference = text(evidence.reference ?? '', 160);
  const method = evidence.identityMethod;
  const scores = resultFields.map(key => evidence[key]);
  if (!['simulated_official_id', 'pending'].includes(method) || scores.some(score => !results.includes(score))) {
    throw fail('Registra el resultado de cada comprobación.');
  }
  const grantsValidity = ['approved', 'revalidated'].includes(outcome);
  if (grantsValidity && (method !== 'simulated_official_id' || scores.some(score => score !== 'matches'))) {
    throw fail('La aprobación exige coincidencia en todas las comprobaciones, incluido el cotejo de identidad.');
  }
  if (outcome === 'rejected' && !scores.includes('discrepancy')) {
    throw fail('Para rechazar, documenta una discrepancia comprobada. Si falta evidencia, deja la revisión inconclusa.');
  }
  return {rowVersion, outcome, message, note, checkedOn, reference, method, scores, grantsValidity};
};

function validatePriorImpact(impact, review, mode) {
  if (impact === undefined) return null;
  if (mode !== 'proposal' || review.outcome !== 'rejected') {
    throw fail('La revisión de la acreditación anterior requiere rechazar la propuesta.');
  }
  exact(impact, ['version', 'message', 'evidence']);
  const version = decimal(impact.version);
  const prior = validateReview({
    rowVersion:review.rowVersion, outcome:'revalidation_requested', message:impact.message, evidence:impact.evidence,
  }, 'revalidation');
  if (!prior.reference || !prior.scores.includes('discrepancy') ||
      (prior.scores.at(-1) === 'discrepancy' && prior.method !== 'simulated_official_id')) {
    throw fail('Documenta una discrepancia comprobada de la versión aprobada y su referencia.');
  }
  return {version, review:prior};
}

async function recordReview(client, actor, owner, version, review, validUntil) {
  const {id} = (await client.query(`
    INSERT INTO professional_manual_reviews (
      owner_user_id,credential_version,reviewer_user_id,reviewer_role,outcome,owner_message,source_code,checked_on,
      source_reference,identity_method,license_result,holder_result,title_result,institution_result,identity_result
    ) VALUES ($1,$2,$3,$4,$5,$6,'simulated_registry',$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING id
  `, [owner, version, actor.id, actor.role, review.outcome, review.message, review.checkedOn,
    review.reference, review.method, ...review.scores])).rows[0];

  if (review.note) await client.query(`
    INSERT INTO professional_review_internal_notes
      (owner_user_id,credential_version,reviewer_user_id,reviewer_role,body) VALUES($1,$2,$3,$4,$5)
  `, [owner, version, actor.id, actor.role, review.note]);

  if (review.grantsValidity || review.outcome === 'revalidation_requested') {
    await client.query(`
      INSERT INTO professional_credential_validity (
        owner_user_id,credential_version,status,evidence_reference,assessed_by_user_id,assessed_by_role,
        assessed_at,valid_from,valid_until
      ) VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp(),$7,$8)
      ON CONFLICT (owner_user_id,credential_version) DO UPDATE SET status=excluded.status,
        evidence_reference=excluded.evidence_reference,assessed_by_user_id=excluded.assessed_by_user_id,
        assessed_by_role=excluded.assessed_by_role,assessed_at=excluded.assessed_at,
        valid_from=excluded.valid_from,valid_until=excluded.valid_until,
        row_version=professional_credential_validity.row_version+1
    `, [owner, version, review.grantsValidity ? 'supported' : 'requires_review', id,
      actor.id, actor.role, review.grantsValidity ? review.checkedOn : null, review.grantsValidity ? validUntil : null]);
  }

  return id;
}

export const decideManualAccreditation = (actor, owner, version, body, mode) => {
  decimal(version);
  const review = validateReview(body, mode);
  const impact = validatePriorImpact(body.priorImpact, review, mode);
  return transaction(async client => {
    const {profile, legacy} = await lock(client, actor, owner, {review: true});
    const storedVersion = mode === 'revalidation' ? profile?.approved_credential_version : profile?.pending_credential_version;
    if (storedVersion !== version || String(profile.row_version) !== review.rowVersion) {
      throw fail('La solicitud cambió. Vuelve a abrirla antes de resolver.', 409);
    }
    if (impact && profile.approved_credential_version !== impact.version) {
      throw fail('La versión aprobada cambió. Vuelve a abrir la revisión.',409);
    }
    if (mode === 'revalidation' && legacy.approval_status !== 'active' && legacy.manual_onboarded_at) {
      throw fail('La cuenta no está disponible para revalidación.', 409);
    }
    const {today, validUntil} = (await client.query(`
      SELECT ((clock_timestamp() AT TIME ZONE 'UTC')::date)::text AS today,
        ($1::date + interval '12 months')::date::text AS "validUntil"
    `, [review.checkedOn])).rows[0];
    if (review.checkedOn > today || impact?.review.checkedOn > today || (review.grantsValidity && validUntil <= today)) {
      throw fail('La fecha de comprobación debe ser actual y permitir una acreditación vigente.');
    }
    if (review.grantsValidity && mode === 'proposal') await claimLicense(client, owner, version);
    const id = await recordReview(client, actor, owner, version, review, validUntil);
    if (impact) {
      await recordReview(client, actor, owner, impact.version, impact.review, null);
      await audit(client, actor, owner, impact.version, 'professional_credential_decided', {outcome:'revalidation_requested'});
    }

    const terminal = mode === 'proposal' && review.outcome !== 'inconclusive';
    if (terminal) await client.query(`
      INSERT INTO professional_credential_decisions (
        owner_user_id,credential_version,outcome,reviewer_user_id,reviewer_role,owner_message,evidence_reference,valid_from,valid_until
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [owner, version, review.grantsValidity ? 'approved' : 'rejected', actor.id, actor.role,
      review.message, review.grantsValidity ? id : null, review.grantsValidity ? review.checkedOn : null,
      review.grantsValidity ? validUntil : null]);

    await client.query(`
      UPDATE professional_publication_profiles SET
        pending_credential_version=CASE WHEN $2 THEN NULL ELSE pending_credential_version END,
        approved_credential_version=CASE WHEN $3 THEN $4::bigint ELSE approved_credential_version END,
        row_version=row_version+1
      WHERE owner_user_id=$1
    `, [owner, terminal, review.outcome === 'approved', version]);
    await audit(client, actor, owner, version, 'professional_credential_decided', {outcome: review.outcome});
    return {outcome: review.outcome, accountApprovalNeeded: review.grantsValidity && legacy.approval_status === 'pending_review'};
  });
};

async function claimLicense(client, owner, version) {
  try {
    await client.query(`
      INSERT INTO professional_manual_license_claims(owner_user_id,credential_version,license_key)
      SELECT owner_user_id,version,COALESCE(NULLIF(ltrim(license_number,'0'),''),'0')
      FROM professional_credential_versions WHERE owner_user_id=$1 AND version=$2
      ON CONFLICT (owner_user_id) DO UPDATE SET credential_version=excluded.credential_version,license_key=excluded.license_key
    `, [owner, version]);
  } catch (error) {
    if (error.code === '23505') throw fail('No se puede aprobar esta cédula con la evidencia disponible. Conserva la solicitud pendiente y revisa la discrepancia.', 409);
    throw error;
  }
}
