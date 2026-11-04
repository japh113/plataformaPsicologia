import { episodeKey, textKey } from './episode.identifiers.js';

// Internal evidence only. The connection and full tuple must come from the
// server's structural reader, never request assertions. No operational caller
// is connected in this increment; this result is not a permission/context.
const recognized = Object.freeze({
  origin: 'professional_private', contractVersion: 1,
  registrationKind: 'professional_original', originVerified: true,
  audienceVerified: false, allowed: false,
});
const unknown = Object.freeze({
  origin: null, contractVersion: null, registrationKind: null,
  originVerified: false, audienceVerified: false, allowed: false,
});
export async function resolvePrivateNoteOrigin(client, { noteId, episodeId, subjectPatientId, authorUserId } = {}) {
  const note = episodeKey(noteId), episode = episodeKey(episodeId);
  if (!note || !episode || !textKey(subjectPatientId) || !textKey(authorUserId)) return unknown;
  const { rows } = await client.query(`
    SELECT public.recognize_private_note_origin_v1($1::bigint,$2::bigint,$3::text,$4::text) AS recognized
  `, [note, episode, subjectPatientId, authorUserId]);
  // SQL/ACL errors propagate; malformed, duplicate or absent results deny.
  return Array.isArray(rows) && rows.length === 1 && rows[0]?.recognized === true ? recognized : unknown;
}
