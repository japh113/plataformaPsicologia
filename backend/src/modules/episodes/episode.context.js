// Internal structural reader only. Never return this context from an endpoint.
const scalar = value => typeof value === 'string' && value.length > 0 ? value : null;
const episodeKey = value => {
  const key = typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value))
    ? String(value) : value;
  return typeof key === 'string' && /^[1-9][0-9]{0,18}$/.test(key) && BigInt(key) <= 9223372036854775807n ? key : null;
};
const freeze = object => Object.freeze(object);

// actor must come from current authenticated server session/DB, never req.body.
// client must be explicitly selected internally; no implicit env/pool.
export async function resolveEpisodeContext(client, { actor, episodeId, operation, resource } = {}) {
  const id = episodeKey(episodeId);
  const effectiveActor = actor ? freeze({
    id: scalar(actor.id), role: scalar(actor.role), patientId: scalar(actor.patientId),
    isActive: actor.isActive === true, psychologistStatus: scalar(actor.psychologistStatus),
  }) : null;
  let episode = null;
  if (id && effectiveActor?.id && effectiveActor.isActive &&
      ['patient', 'psychologist'].includes(effectiveActor.role)) {
    // One statement gives a coherent composition snapshot; no clinical content,
    // contacts, global relationships, aggregates or history are selected.
    const { rows } = await client.query(`
      SELECT e.id::text AS episode_id, e.modality, e.status,
        e.psychologist_user_id, e.created_by_user_id,
        e.participant_one_id, e.participant_two_id,
        cep.patient_id, cep.slot, cep.psychologist_user_id AS participant_psychologist_id
      FROM public.clinical_episodes e
      LEFT JOIN public.clinical_episode_participants cep ON cep.episode_id=e.id
      WHERE e.id=$1::bigint ORDER BY cep.slot
    `, [id]);
    const head = rows[0];
    const count = head?.modality === 'individual' ? 1 : head?.modality === 'couple' ? 2 : 0;
    const expected = head ? [head.participant_one_id, head.participant_two_id] : [];
    if (count && rows.length === count && (count === 2 || head.participant_two_id === null) &&
        new Set(expected.slice(0, count)).size === count &&
        rows.every((row, i) => row.episode_id === id && row.slot === i + 1 &&
          scalar(row.patient_id) && row.patient_id === expected[i] &&
          row.participant_psychologist_id === head.psychologist_user_id)) {
      episode = freeze({
        id, modality: head.modality, status: scalar(head.status),
        responsibleUserId: scalar(head.psychologist_user_id),
        headerCreatorUserId: scalar(head.created_by_user_id),
        participants: freeze(rows.map(row => freeze({ patientId: row.patient_id, slot: row.slot }))),
      });
    }
  }
  // Descriptor only, not a fetched clinical record or trusted audience/grant.
  const descriptor = resource ? freeze({
    type: scalar(resource.type), id: scalar(resource.id),
    episodeId: episodeKey(resource.episodeId), subjectPatientId: scalar(resource.subjectPatientId),
    authorUserId: scalar(resource.authorUserId), state: scalar(resource.state),
    audience: scalar(resource.audience),
    matchesEpisode: Boolean(episode && episodeKey(resource.episodeId) === episode.id),
  }) : null;
  const member = patientId => Boolean(patientId && episode?.participants.some(p => p.patientId === patientId));
  return freeze({
    actor: effectiveActor, requestedEpisodeId: id, episode,
    operation: scalar(operation), resource: descriptor,
    membership: freeze({
      actorIsParticipant: effectiveActor?.role === 'patient' && member(effectiveActor.patientId),
      actorIsResponsible: Boolean(episode && effectiveActor?.role === 'psychologist' &&
        effectiveActor.id === episode.responsibleUserId),
      subjectIsParticipant: member(descriptor?.subjectPatientId),
    }),
  });
}
