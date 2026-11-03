import { episodeKey, textKey } from './episode.identifiers.js';

export const noteAudiences = Object.freeze([
  'professional_private', 'patient_document', 'shared_document', 'unverified',
]);

// Necessary conditions only, including synthetic future active-state tests.
// This result is NEVER an operational authorization or a reusable grant.
export function assessPrivateNoteRead(context) {
  const actor = context?.actor, episode = context?.episode, note = context?.resource;
  const audience = note?.audienceVerified === true && noteAudiences.includes(note.audience)
    ? note.audience : 'unverified';
  const structurallyEligible = Boolean(
    context?.sessionCurrent === true && context.operation === 'read' &&
    textKey(actor?.id) && actor.role === 'psychologist' && actor.isActive === true &&
    actor.psychologistStatus === 'active' && episodeKey(context.requestedEpisodeId) &&
    episode?.id === context.requestedEpisodeId && episode.modality === 'individual' &&
    ['prepared', 'active'].includes(episode.status) &&
    actor.id === episode.responsibleUserId && episode.participants?.length === 1 &&
    textKey(episode.participants[0].patientId) && episode.participants[0].slot === 1 &&
    note?.type === 'note' && episodeKey(note.id) && note.verified === true &&
    note.matchesEpisode === true && note.episodeId === episode.id &&
    note.subjectPatientId === episode.participants[0].patientId &&
    note.authorUserId === actor.id && episodeKey(note.appointmentId)
  );
  return Object.freeze({
    structurallyEligible, audience,
    eligible: structurallyEligible && episode.status === 'active' && audience === 'professional_private',
    allowed: false,
  });
}
