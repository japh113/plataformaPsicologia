import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEpisodeContext } from '../src/modules/episodes/episode.context.js';
import { authorizeEpisodeOperation, episodeOperations } from '../src/modules/episodes/episode.policy.js';
import { projectEpisodeResource } from '../src/modules/episodes/episode.projections.js';

const actor = { id: 'a', role: 'psychologist', psychologistStatus: 'active', isActive: true };
const composition = [{
  episode_id: '1', modality: 'couple', status: 'prepared',
  psychologist_user_id: 'a', created_by_user_id: 'account-p',
  participant_one_id: 'p', participant_two_id: 'q',
  patient_id: 'p', slot: 1, participant_psychologist_id: 'a',
}, {
  episode_id: '1', modality: 'couple', status: 'prepared',
  psychologist_user_id: 'a', created_by_user_id: 'account-p',
  participant_one_id: 'p', participant_two_id: 'q',
  patient_id: 'q', slot: 2, participant_psychologist_id: 'a',
}];
const record = {
  resource_id: '11', episode_id: '1', patient_id: 'p', author_user_id: 'a',
  state: 'completed', appointment_id: '10', clinical_note_id: null, kind: 'task',
};
const context = async ({ type = 'note', id = '11', rows = [record], resource, calls = [], ...input } = {}) =>
  resolveEpisodeContext({
    async query(sql, params) {
      calls.push({ sql, params });
      assert.doesNotMatch(sql, /SELECT\s+\*|care_relationships|psychologist_patient_access|\br\.text\b|\b(content|notes|clinical_observations|clinical_note_objective|priority|scheduled_date|scheduled_time|previous_record)\b/i);
      if (sql.includes('FROM public.clinical_episodes e')) return { rows: composition };
      assert.deepEqual(params, ['11', '1', ...(['task', 'objective'].includes(type) ? [type] : [])]);
      return { rows };
    },
  }, { actor, episodeId: '1', operation: 'read', resource: resource ?? { type, id }, ...input });
const denied = value => assert.deepEqual(authorizeEpisodeOperation(value), { allowed: false });

test('episode resources: five allowlisted types resolve immutable structural facts without audience or grant', async () => {
  for (const type of ['appointment', 'note', 'task', 'objective', 'waitlist']) {
    const calls = [];
    const result = await context({ type, calls, rows: [{ ...record, kind: type }] });
    assert.equal(calls.length, 2);
    assert.equal(result.resource.verified, true);
    assert.equal(result.resource.subjectPatientId, 'p');
    assert.equal(result.resource.authorUserId, 'a');
    assert.equal(result.resource.state, type === 'appointment' ? 'completed' : null);
    assert.equal(result.resource.kind, ['task', 'objective'].includes(type) ? type : null);
    assert.equal(result.resource.appointmentId, type === 'note' ? '10' : null);
    assert.equal(result.resource.audience, null);
    assert.equal(result.resource.audienceVerified, false);
    assert.ok(Object.isFrozen(result.resource));
    assert.throws(() => { result.resource.authorUserId = 'other'; }, TypeError);
    for (const operation of [...episodeOperations, 'unknown']) denied({ ...result, operation });
  }
});

test('episode resources: caller assertions and private SQL extras are never read or copied', async () => {
  const resource = { type: 'note', id: '11' }, row = { ...record };
  for (const field of ['episodeId', 'subjectPatientId', 'authorUserId', 'state', 'audience', 'content', 'grants']) {
    Object.defineProperty(resource, field, { get() { assert.fail('Caller claim read: ' + field); } });
  }
  for (const field of ['content', 'notes', 'text', 'clinical_note_objective', 'count', 'toJSON']) {
    Object.defineProperty(row, field, { get() { assert.fail('Private field read: ' + field); } });
  }
  const result = await context({ resource, rows: [row] });
  assert.equal(result.resource.episodeId, '1');
  assert.equal(result.resource.subjectPatientId, 'p');
  assert.equal(result.resource.authorUserId, 'a');
  assert.doesNotMatch(JSON.stringify(result), /content|clinical_note_objective|grants|toJSON/);
  denied(result);
});

test('episode resources: verified authorship is independent of actor and subject membership is not audience', async () => {
  for (const currentActor of [
    { id: 'account-q', role: 'patient', patientId: 'q', isActive: true },
    { ...actor, id: 'b' }, { ...actor, id: 'account-p' },
  ]) {
    const result = await context({ actor: currentActor });
    assert.equal(result.resource.authorUserId, 'a');
    assert.equal(result.resource.subjectPatientId, 'p');
    assert.equal(result.membership.subjectIsParticipant, true);
    assert.equal(result.membership.actorIsResponsible, false);
    denied(result);
  }
});

test('episode resources: malformed keys and unknown types never reach a resource query', async () => {
  for (const id of [null, undefined, '', '0', '-1', '01', '1.0', '1 OR TRUE', '9223372036854775808',
    9007199254740992, {}, [], true]) {
    const calls = [];
    const result = await context({ resource: { type: 'note', id }, calls });
    assert.equal(calls.length, 1); assert.equal(result.resource, null); denied(result);
  }
  for (const type of ['__proto__', 'constructor', 'toString', 'notes', 'note; DROP TABLE users', 'intake', 'document', 'episode', null, {}]) {
    const calls = [];
    const result = await context({ resource: { type, id: '11' }, calls });
    assert.equal(calls.length, 1); assert.equal(result.resource, null); denied(result);
  }
  for (const id of [11, 11n]) assert.equal((await context({ id })).resource.id, '11');
});

test('episode resources: missing, duplicate and structurally inconsistent query responses fail closed', async () => {
  for (const rows of [[], [record, record], null, [null],
    ...[{ resource_id: '12' }, { episode_id: null }, { episode_id: '2' },
      { patient_id: 'outsider' }, { patient_id: null }, { author_user_id: 'b' },
      { author_user_id: null }, { appointment_id: null }, { appointment_id: '01' }, { appointment_id: 10 }]
      .map(change => [{ ...record, ...change }])]) {
    const result = await context({ rows });
    assert.equal(result.resource, null); denied(result);
  }
  for (const [type, change] of [['task', { kind: 'objective' }], ['objective', { kind: 'task' }],
    ['task', { clinical_note_id: 10 }], ['task', { clinical_note_id: undefined }], ['task', { clinical_note_id: '9223372036854775808' }],
    ['appointment', { state: 'unknown' }]]) {
    const result = await context({ type, rows: [{ ...record, ...change }] });
    assert.equal(result.resource, null); denied(result);
  }
});

test('episode resources: incomplete or contradictory CEP headers cannot start resource resolution', async () => {
  for (const change of [{ psychologist_user_id: 'b' }, { created_by_user_id: null },
    { status: 'active' }, { participant_one_id: 'q' }, { modality: 'individual' }]) {
    let queries = 0;
    const result = await resolveEpisodeContext({ async query() {
      queries++; return { rows: [composition[0], { ...composition[1], ...change }] };
    } }, { actor, episodeId: '1', resource: { type: 'note', id: '11' } });
    assert.equal(queries, 1); assert.equal(result.episode, null);
    assert.equal(result.resource, null); denied(result);
  }
});

test('episode resources: database outage and denied SQL privileges produce no fallback context', async () => {
  for (const code of ['08006', '42501']) {
    let queries = 0;
    await assert.rejects(resolveEpisodeContext({ async query() {
      if (++queries === 1) return { rows: composition };
      throw Object.assign(new Error('Synthetic SQL failure'), { code });
    } }, { actor, episodeId: '1', resource: { type: 'note', id: '11' } }), error => error.code === code);
    denied(undefined);
  }
});

test('episode resources: projection denies before any clinical, metadata, aggregate or serialization access', async () => {
  const value = await context();
  for (const sentinel of ['noteText', 'intakeDraft', 'partnerIndividualContent',
    'professionalObjective', 'privateMessage', 'derived', 'count', 'id', 'toJSON']) {
    const row = new Proxy({ [sentinel]: 'PRIVATE_SENTINEL' }, {
      get() { assert.fail('Projection read private property'); },
      ownKeys() { assert.fail('Projection enumerated private properties'); },
      getOwnPropertyDescriptor() { assert.fail('Projection inspected private descriptor'); },
    });
    assert.throws(() => projectEpisodeResource(value, row), error => {
      assert.equal(error.status, 403);
      assert.equal(error.message, 'Forbidden');
      assert.deepEqual(Object.keys(error), ['status']);
      assert.equal(JSON.stringify(error), '{"status":403}');
      return true;
    });
  }
});
