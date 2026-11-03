import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPrivateNoteRead, noteAudiences } from '../src/modules/episodes/episode.note-read-policy.js';
import { authorizeEpisodeOperation } from '../src/modules/episodes/episode.policy.js';
import { projectEpisodeResource } from '../src/modules/episodes/episode.projections.js';

// Explicitly synthetic: active episodes and verified audiences do not exist in 008.
const facts = () => ({
  sessionCurrent: true, operation: 'read', requestedEpisodeId: '1',
  actor: { id: 'a', role: 'psychologist', isActive: true, psychologistStatus: 'active' },
  episode: { id: '1', modality: 'individual', status: 'active', responsibleUserId: 'a',
    participants: [{ patientId: 'p', slot: 1 }] },
  resource: { id: '11', type: 'note', episodeId: '1', subjectPatientId: 'p',
    authorUserId: 'a', appointmentId: '10', verified: true, matchesEpisode: true,
    audience: 'professional_private', audienceVerified: true },
});
const denyProjection = value => {
  assert.deepEqual(authorizeEpisodeOperation(value), { allowed: false });
  const sentinel = new Proxy({}, {
    get() { assert.fail('Read private content, observations, objectives, IDs, history or derivatives'); },
    ownKeys() { assert.fail('Enumerated private row'); },
    getOwnPropertyDescriptor() { assert.fail('Inspected private row'); },
  });
  assert.throws(() => projectEpisodeResource(value, sentinel), { message: 'Forbidden', status: 403 });
};

test('note policy synthetic: own private individual note satisfies necessary conditions but never authorizes', () => {
  const context = facts(), result = assessPrivateNoteRead(context);
  assert.deepEqual(result, { structurallyEligible: true, audience: 'professional_private', eligible: true, allowed: false });
  assert.ok(Object.isFrozen(result));
  denyProjection(context); denyProjection(result);
});
test('note policy synthetic: prepared and historical states cannot become operational reads', () => {
  for (const status of ['prepared', 'paused', 'finalized', 'unknown', null]) {
    const context = facts(); context.episode.status = status;
    const result = assessPrivateNoteRead(context);
    assert.equal(result.structurallyEligible, status === 'prepared');
    assert.equal(result.eligible, false); assert.equal(result.allowed, false);
    denyProjection(context);
  }
});
test('note policy synthetic: audiences are distinct, unknown and unverified privacy are rejected', () => {
  assert.equal(noteAudiences.length, 4);
  for (const audience of [...noteAudiences, null, 'professional', 'anything']) {
    for (const audienceVerified of [false, true]) {
      const context = facts(); Object.assign(context.resource, { audience, audienceVerified });
      const result = assessPrivateNoteRead(context);
      assert.equal(result.structurallyEligible, true);
      assert.equal(result.eligible, audience === 'professional_private' && audienceVerified);
      assert.equal(result.allowed, false); denyProjection(context);
    }
  }
});
test('note policy synthetic: parallel episodes, foreign author and subject never inherit eligibility', () => {
  const mutations = [
    c => { c.requestedEpisodeId = '2'; }, // same professional, different episode
    c => { c.episode.responsibleUserId = 'b'; }, // same patient, other professional
    c => { c.resource.authorUserId = 'b'; },
    c => { c.resource.subjectPatientId = 'q'; },
    c => { c.episode = null; },
    c => { c.resource.episodeId = '2'; },
    c => { c.resource.episodeId = null; c.resource.authorUserId = null; },
    c => { c.resource.appointmentId = null; },
    c => { c.resource.verified = false; },
    c => { c.resource.type = 'document'; },
    c => { c.episode.modality = 'couple'; c.episode.participants.push({ patientId: 'q', slot: 2 }); },
    c => { c.operation = 'list'; },
  ];
  for (const mutate of mutations) {
    const context = facts(); mutate(context);
    assert.equal(assessPrivateNoteRead(context).structurallyEligible, false);
    assert.equal(assessPrivateNoteRead(context).eligible, false); denyProjection(context);
  }
});
test('note policy synthetic: inactive, revoked, unauthenticated, rejected and backoffice actors fail closed', () => {
  for (const mutate of [
    c => { c.actor = null; }, c => { c.sessionCurrent = false; },
    c => { c.actor.isActive = false; },
    ...['suspended', 'rejected', 'pending_review', 'approved', null].map(status => c => { c.actor.psychologistStatus = status; }),
    ...['patient', 'admin', 'support', 'superadmin'].map(role => c => { c.actor.role = role; }),
  ]) {
    const context = facts(); mutate(context);
    assert.equal(assessPrivateNoteRead(context).eligible, false);
    assert.equal(assessPrivateNoteRead(context).structurallyEligible, false);
    denyProjection(context);
  }
  for (const context of [null, undefined, {}]) assert.equal(assessPrivateNoteRead(context).eligible, false);
});
