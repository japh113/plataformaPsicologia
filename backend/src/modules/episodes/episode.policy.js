// Private foundation: no HTTP caller and no grant source exists in 008.
const denied = Object.freeze({ allowed: false });
export const episodeOperations = Object.freeze([
  'read', 'list', 'create', 'update', 'delete', 'complete', 'activate',
]);
const resourceTypes = Object.freeze([
  'episode', 'appointment', 'note', 'task', 'objective', 'intake', 'document', 'waitlist',
]);
const audiences = Object.freeze(['professional', 'participant', 'joint', 'private-draft']);

export function authorizeEpisodeOperation(context) {
  if (!context?.actor?.id || !context.actor.isActive ||
      !['patient', 'psychologist'].includes(context.actor.role)) return denied;
  if (context.actor.role === 'psychologist' && context.actor.psychologistStatus !== 'approved') return denied;
  if (!context.episode || !episodeOperations.includes(context.operation)) return denied;
  if (context.episode.status !== 'prepared') return denied; // Other states have no implemented policy.
  if (context.actor.role === 'patient' && !context.membership?.actorIsParticipant) return denied;
  if (context.actor.role === 'psychologist' && !context.membership?.actorIsResponsible) return denied;
  if (!context.membership?.subjectIsParticipant || !context.resource?.matchesEpisode) return denied;
  if (!resourceTypes.includes(context.resource.type) || !audiences.includes(context.resource.audience)) return denied;
  // These labels describe a request, never verified publication/recipients.
  // Membership, responsibility and authorship are facts, never grants.
  // All prepared operations are denied, including admission and activation.
  // Future capabilities need persisted, verified grants for the operation,
  // subject, state, resource/version and audience. No ACL/flag argument exists.
  return denied;
}

export function ensureEpisodeOperation(context) {
  if (!authorizeEpisodeOperation(context).allowed) {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
}
