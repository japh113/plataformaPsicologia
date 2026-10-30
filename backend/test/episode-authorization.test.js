import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolveEpisodeContext } from '../src/modules/episodes/episode.context.js';
import { authorizeEpisodeOperation, episodeOperations } from '../src/modules/episodes/episode.policy.js';
import { projectEpisodeResource } from '../src/modules/episodes/episode.projections.js';

const patient = id => ({ id: 'account-' + id, role: 'patient', patientId: id, isActive: true });
const professional = id => ({ id, role: 'psychologist', isActive: true, psychologistStatus: 'approved' });
const composition = (id, patients = ['p'], responsible = 'a', creator = 'account-p') =>
  patients.map((p, i) => ({
    episode_id: id, modality: patients.length === 2 ? 'couple' : 'individual', status: 'prepared',
    psychologist_user_id: responsible, created_by_user_id: creator,
    participant_one_id: patients[0], participant_two_id: patients[1] ?? null,
    patient_id: p, slot: i + 1, participant_psychologist_id: responsible,
    content: 'PRIVATE_SQL_SENTINEL', nested: { secret: 'PRIVATE_SQL_SENTINEL' },
  }));
const episodes = [...composition('1'), ...composition('2', ['p'], 'b', 'b'),
  ...composition('3', ['p', 'q']), ...composition('4', ['r'])];
const descriptor = (episodeId = '1', subjectPatientId = 'p') => ({
  id: 'private-record-id', episodeId, subjectPatientId, type: 'note',
  authorUserId: 'a', state: 'draft', audience: 'professional',
});
const resolve = (input = {}, rows = episodes) => resolveEpisodeContext({
  query: async (sql, params) => {
    assert.deepEqual(params, [String(input.episodeId ?? '1')]);
    assert.match(sql, /WHERE e.id=\$1::bigint/);
    assert.doesNotMatch(sql, /SELECT\s+\*|care_relationships|psychologist_patient_access/);
    return { rows: rows.filter(r => r.episode_id === params[0]) };
  },
}, { actor: patient('p'), episodeId: '1', operation: 'read', resource: descriptor(), ...input });
const deny = context => {
  assert.deepEqual(authorizeEpisodeOperation(context), { allowed: false });
  // Getters would expose even reading the row before authorization.
  const row = new Proxy({}, { get() { assert.fail('Denied projection touched private row'); }, ownKeys() { assert.fail('Denied projection enumerated private row'); } });
  assert.throws(() => projectEpisodeResource(context, row), error => {
    assert.equal(error.message, 'Forbidden'); assert.equal(error.status, 403);
    assert.deepEqual(Object.keys(error), ['status']);
    assert.doesNotMatch(JSON.stringify(error), /record|episode|participant|sentinel/i);
    return true;
  });
};

test('episode context: parallel individuals preserve distinct professionals and header creators', async () => {
  const first = await resolve();
  const second = await resolve({ episodeId: '2', resource: descriptor('2') });
  assert.equal(first.episode.id, '1'); assert.equal(second.episode.id, '2');
  assert.equal(first.episode.responsibleUserId, 'a'); assert.equal(first.episode.headerCreatorUserId, 'account-p');
  assert.equal(second.episode.responsibleUserId, 'b'); assert.equal(second.episode.headerCreatorUserId, 'b');
  assert.equal(first.membership.actorIsParticipant, true); assert.equal(second.membership.actorIsParticipant, true);
  deny(first); deny(second);
});
test('episode context: couple has two explicit participants without granting reciprocal visibility', async () => {
  for (const id of ['p', 'q']) {
    const context = await resolve({ actor: patient(id), episodeId: '3', resource: descriptor('3', 'p') });
    assert.deepEqual(context.episode.participants, [{ patientId: 'p', slot: 1 }, { patientId: 'q', slot: 2 }]);
    assert.equal(context.membership.actorIsParticipant, true);
    deny(context);
  }
});
test('episode context: same professional in several episodes cannot combine their scopes', async () => {
  for (const episodeId of ['1', '3', '4']) {
    const context = await resolve({ actor: professional('a'), episodeId, resource: descriptor(episodeId, episodeId === '4' ? 'r' : 'p') });
    assert.equal(context.episode.id, episodeId); assert.equal(context.membership.actorIsResponsible, true); deny(context);
  }
});
test('episode policy: absent, inactive, restricted and administrative actors never gain clinical access', async () => {
  for (const actor of [null, {}, { ...patient('p'), isActive: false },
    { ...professional('a'), psychologistStatus: 'suspended' },
    ...['support', 'admin', 'superadmin', 'unknown'].map(role => ({ id: 'a', role, isActive: true }))]) deny(await resolve({ actor }));
  deny(undefined); deny({});
});
test('episode policy: foreign or nonexistent IDs and membership in another episode grant nothing', async () => {
  const foreign = await resolve({ actor: patient('p'), episodeId: '4', resource: descriptor('4', 'r') });
  assert.equal(foreign.membership.actorIsParticipant, false); deny(foreign);
  const stranger = await resolve({ actor: patient('r') });
  assert.equal(stranger.membership.actorIsParticipant, false); deny(stranger);
  const missing = await resolve({ episodeId: '999' });
  assert.equal(missing.episode, null); deny(missing);
  assert.deepEqual(authorizeEpisodeOperation(foreign), authorizeEpisodeOperation(missing));
});
test('episode policy: responsible of E1, creator and author do not authorize E2', async () => {
  const context = await resolve({ actor: professional('a'), episodeId: '2', resource: { ...descriptor('2'), authorUserId: 'a' } });
  assert.equal(context.membership.actorIsResponsible, false); deny(context);
  deny(await resolve({ actor: { ...professional('a'), id: 'account-p' } }));
});
test('episode policy: prepared rejects every ordinary operation and activation without flags or injected grants', async () => {
  for (const operation of [...episodeOperations, 'admit', 'resume', 'close', 'unknown']) {
    for (const type of ['episode', 'appointment', 'note', 'task', 'objective', 'intake', 'document', 'waitlist']) {
      deny(await resolve({ actor: professional('a'), operation, resource: { ...descriptor(), type },
        grants: [{ allowed: true }], careRelationships: ['active'], psychologistPatientAccess: true, enabled: true }));
    }
  }
});
test('episode policy: mismatched episode, subject, unknown states and audiences stay denied', async () => {
  for (const resource of [null, { ...descriptor(), episodeId: '2' }, { ...descriptor(), subjectPatientId: 'r' },
    { ...descriptor(), state: 'unknown' }, { ...descriptor(), audience: 'unknown' },
    { ...descriptor(), audience: null }, { ...descriptor(), type: 'unknown' }]) deny(await resolve({ resource }));
  for (const status of ['active', 'paused', 'finalized', 'unknown', null]) {
    deny(await resolve({}, composition('1').map(row => ({ ...row, status }))));
  }
});
test('episode projection: synthetic private drafts, individual partner data and derivatives disclose nothing', async () => {
  // No persistence for these contracts exists yet: synthetic policy tests only.
  for (const actor of [professional('a'), patient('p'), patient('q')]) {
    for (const type of ['intake', 'note', 'task', 'document', 'appointment']) {
      for (const audience of ['private-draft', 'participant', 'joint', 'professional']) {
        const context = await resolve({ actor, episodeId: '3', resource: {
          ...descriptor('3', 'q'), type, audience, authorUserId: actor.id,
          content: 'PRIVATE_DESCRIPTOR_SENTINEL', count: 12, sessionDate: 'private-date',
        } });
        assert.doesNotMatch(JSON.stringify(context), /SENTINEL|"sessionDate"|"count"|"content"|"nested"/);
        deny(context);
      }
    }
  }
});
test('episode context: allowlisted immutable facts cannot be changed into a grant', async () => {
  const context = await resolve();
  assert.deepEqual(Object.keys(context.episode), ['id', 'modality', 'status', 'responsibleUserId', 'headerCreatorUserId', 'participants']);
  for (const mutate of [() => { context.episode.status = 'active'; },
    () => { context.membership.actorIsResponsible = true; },
    () => { context.episode.participants.push({ patientId: 'r' }); },
    () => { context.episode.participants[0].patientId = 'r'; }]) assert.throws(mutate, TypeError);
  deny({ ...context, allowed: true, grants: [{ operation: 'read', verified: true }] });
});
test('episode context: missing, duplicate or inconsistent CEP and unsafe IDs fail closed', async () => {
  for (const rows of [[], composition('3', ['p', 'q']).slice(0, 1),
    [...composition('1'), ...composition('1')], composition('1').map(r => ({ ...r, patient_id: 'r' })),
    composition('1').map(r => ({ ...r, participant_psychologist_id: 'b' }))]) {
    const context = await resolve({}, rows); assert.equal(context.episode, null); deny(context);
  }
  for (const episodeId of ['1 OR TRUE', '0', '-1', '01', '9223372036854775808', 9007199254740992, null]) {
    const context = await resolveEpisodeContext({ query() { assert.fail('Unsafe ID reached SQL'); } }, { actor: patient('p'), episodeId });
    assert.equal(context.episode, null); deny(context);
  }
});
test('episode boundary: no production module outside episodes imports the private foundation', async () => {
  const root = new URL('../src/', import.meta.url);
  const walk = async url => {
    for (const entry of await fs.readdir(url, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
      if (entry.isDirectory()) { if (entry.name !== 'episodes') await walk(child); }
      else if (entry.name.endsWith('.js')) {
        const source = await fs.readFile(child, 'utf8');
        assert.doesNotMatch(source, /(?:from\s*|import\s*\()\s*['"][^'"]*(?:episodes\/|episode\.(?:context|policy|projections))/);
      }
    }
  };
  await walk(root);
});
