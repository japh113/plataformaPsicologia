import { episodeKey, textKey } from './episode.identifiers.js';

// Private structural reads only. These literal queries form the entire allowlist.
// Parent patient/episode/author integrity is enforced by 003/008 composite FKs;
// do not read note text, history, availability, ranks or publication guesses.
const appointmentQuery = `
  SELECT r.id::text AS resource_id, r.episode_id::text AS episode_id,
    r.patient_id, r.created_by_user_id AS author_user_id, r.status AS state
  FROM public.appointments r
  INNER JOIN public.clinical_episode_participants cep
    ON (cep.episode_id,cep.patient_id,cep.psychologist_user_id)=
       (r.episode_id,r.patient_id,r.created_by_user_id)
  WHERE r.id=$1::bigint AND r.episode_id=$2::bigint
`;
const noteQuery = `
  SELECT r.id::text AS resource_id, r.episode_id::text AS episode_id,
    r.patient_id, r.created_by_user_id AS author_user_id,
    r.appointment_id::text AS appointment_id
  FROM public.patient_clinical_notes r
  INNER JOIN public.clinical_episode_participants cep
    ON (cep.episode_id,cep.patient_id,cep.psychologist_user_id)=
       (r.episode_id,r.patient_id,r.created_by_user_id)
  WHERE r.id=$1::bigint AND r.episode_id=$2::bigint
`;
const checklistQuery = `
  SELECT r.id::text AS resource_id, r.episode_id::text AS episode_id,
    r.patient_id, r.created_by_user_id AS author_user_id,
    r.kind, r.clinical_note_id::text AS clinical_note_id
  FROM public.patient_tasks r
  INNER JOIN public.clinical_episode_participants cep
    ON (cep.episode_id,cep.patient_id,cep.psychologist_user_id)=
       (r.episode_id,r.patient_id,r.created_by_user_id)
  WHERE r.id=$1::bigint AND r.episode_id=$2::bigint AND r.kind=$3::text
`;
const waitlistQuery = `
  SELECT r.id::text AS resource_id, r.episode_id::text AS episode_id,
    r.patient_id, r.created_by_user_id AS author_user_id
  FROM public.appointment_waitlist_entries r
  INNER JOIN public.clinical_episode_participants cep
    ON (cep.episode_id,cep.patient_id,cep.psychologist_user_id)=
       (r.episode_id,r.patient_id,r.created_by_user_id)
  WHERE r.id=$1::bigint AND r.episode_id=$2::bigint
`;
const queries = Object.freeze({
  appointment: appointmentQuery, note: noteQuery,
  task: checklistQuery, objective: checklistQuery, waitlist: waitlistQuery,
});

// Called only by the private context reader with a verified composition.
// Only type/id select a row. Other caller descriptor fields are never read.
// SQL/ACL failures propagate: no context or fallback is produced on failure.
export async function resolveEpisodeResource(client, episode, resource) {
  if (!episode || !resource || typeof resource.type !== 'string' ||
      !Object.hasOwn(queries, resource.type)) return null;
  const type = resource.type, id = episodeKey(resource.id);
  if (!id) return null;
  const checklist = type === 'task' || type === 'objective';
  const params = checklist ? [id, episode.id, type] : [id, episode.id];
  const { rows } = await client.query(queries[type], params);
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  if (!row || row.resource_id !== id || row.episode_id !== episode.id ||
      !textKey(row.patient_id) || !episode.participants.some(p => p.patientId === row.patient_id) ||
      !textKey(row.author_user_id) || row.author_user_id !== episode.responsibleUserId) return null;
  if (type === 'appointment' && !['pending', 'completed', 'cancelled', 'no_show'].includes(row.state)) return null;
  if (type === 'note' && (!episodeKey(row.appointment_id) || row.appointment_id !== episodeKey(row.appointment_id))) return null;
  if (checklist && (row.kind !== type ||
      (row.clinical_note_id !== null && (!episodeKey(row.clinical_note_id) || row.clinical_note_id !== episodeKey(row.clinical_note_id))))) return null;
  return Object.freeze({
    type, id, episodeId: row.episode_id, subjectPatientId: row.patient_id,
    authorUserId: row.author_user_id,
    state: type === 'appointment' ? row.state : null,
    kind: checklist ? row.kind : null,
    appointmentId: type === 'note' ? row.appointment_id : null,
    clinicalNoteId: checklist ? row.clinical_note_id : null,
    verified: true, matchesEpisode: true,
    // 008 persists no recipients, versions, publication or consent contract.
    audience: null, audienceVerified: false,
  });
}
