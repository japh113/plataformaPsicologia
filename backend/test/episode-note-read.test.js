import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import { evaluatePrivateNoteRead } from '../src/modules/episodes/episode.note-read.js';

const token = (claims = {}, options = {}) => jwt.sign({ sub: 'a', sv: 0, role: 'patient', ...claims }, env.jwtSecret, options);
const input = () => ({ token: token(), episodeId: '1', noteId: '11', operation: 'read' });
const denied = { structurallyEligible: false, audience: 'unverified', eligible: false, allowed: false };
const structural = { ...denied, structurallyEligible: true };
const fake = ({ account = {}, profile = {}, failAt = null, afterRead = null } = {}) => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (failAt && sql.includes(failAt)) throw Object.assign(new Error('Synthetic SQL failure'), { code: '42501' });
      assert.doesNotMatch(sql, /SELECT\s+\*|\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|public\.)|care_relationships|psychologist_patient_access|\b(?:content|clinical_observations|clinical_note_objective|previous_record)\b/i);
      if (sql.includes('FROM public.users')) return { rows: account === null ? [] : [{ id: 'a', role: 'psychologist', is_active: true, session_version: 0, ...account }] };
      if (sql.includes('FROM public.psychologist_profiles')) return { rows: profile === null ? [] : [{ user_id: 'a', approval_status: 'active', ...profile }] };
      if (sql.includes('FROM public.clinical_episodes')) return { rows: [{
        episode_id: '1', modality: 'individual', status: 'prepared', psychologist_user_id: 'a',
        created_by_user_id: 'p', participant_one_id: 'p', participant_two_id: null,
        patient_id: 'p', slot: 1, participant_psychologist_id: 'a',
      }] };
      if (sql.includes('FROM public.patient_clinical_notes')) {
        afterRead?.();
        return { rows: [{ resource_id: '11', episode_id: '1', patient_id: 'p', author_user_id: 'a', appointment_id: '10' }] };
      }
      return { rows: [] };
    },
    release() { calls.push({ sql: 'release' }); },
  };
  return { calls, database: { async getClient() { return client; } } };
};

test('note transaction: real JWT verifier, persisted role, explicit transaction and no caller facts', async () => {
  const { database, calls } = fake(), request = input();
  for (const key of ['actor', 'context', 'audience', 'grants', 'sessionVersion']) {
    Object.defineProperty(request, key, { get() { assert.fail('Read caller assertion: ' + key); } });
  }
  assert.deepEqual(await evaluatePrivateNoteRead(database, request), structural);
  assert.equal(calls[0].sql, 'BEGIN ISOLATION LEVEL READ COMMITTED');
  assert.match(calls[1].sql, /FOR SHARE/);
  assert.doesNotMatch(calls[2].sql, /FOR (?:SHARE|UPDATE)/);
  assert.deepEqual(calls.slice(-2).map(c => c.sql), ['COMMIT', 'release']);
});
test('note transaction: invalid ordinary/restricted tokens, operations and keys never acquire DB', async () => {
  const database = { getClient() { assert.fail('Invalid request reached DB'); } };
  for (const bad of [
    null, 'bad.token', jwt.sign({ sub: 'a', sv: 0 }, 'wrong-key'),
    token({}, { expiresIn: -1 }), token({}, { algorithm: 'HS384' }),
    token({ sv: undefined }), token({ sv: -1 }), token({ purpose: 'restricted' }),
    token({}, { header: { typ: 'restricted+jwt' } }),
  ]) assert.deepEqual(await evaluatePrivateNoteRead(database, { ...input(), token: bad }), denied);
  for (const change of [{ episodeId: '01' }, { noteId: '9223372036854775808' }, { operation: 'update' }]) {
    assert.deepEqual(await evaluatePrivateNoteRead(database, { ...input(), ...change }), denied);
  }
});
test('note transaction: current DB session, account and approval override signed claims', async () => {
  for (const options of [
    { account: null }, { account: { is_active: false } }, { account: { session_version: 1 } },
    ...['patient', 'admin', 'support', 'superadmin'].map(role => ({ account: { role } })),
    { profile: null }, ...['suspended', 'rejected', 'pending_review'].map(approval_status => ({ profile: { approval_status } })),
  ]) {
    const { database, calls } = fake(options);
    assert.deepEqual(await evaluatePrivateNoteRead(database, input()), denied);
    assert.ok(!calls.some(c => c.sql.includes('FROM public.clinical_episodes')));
    assert.deepEqual(calls.slice(-2).map(c => c.sql), ['COMMIT', 'release']);
  }
});
test('note transaction: expired while awaiting SQL does not preserve earlier authentication', async () => {
  const original = Date.now, request = { ...input(), token: token({}, { expiresIn: 30 }) };
  const { database } = fake({ afterRead() { Date.now = () => original() + 60000; } });
  try { assert.deepEqual(await evaluatePrivateNoteRead(database, request), denied); }
  finally { Date.now = original; }
});
test('note transaction: SQL and privilege errors rollback, release and produce no fallback', async () => {
  for (const failAt of ['FROM public.users', 'FROM public.psychologist_profiles', 'FROM public.clinical_episodes', 'FROM public.patient_clinical_notes']) {
    const { database, calls } = fake({ failAt });
    await assert.rejects(evaluatePrivateNoteRead(database, input()), { code: '42501' });
    assert.deepEqual(calls.slice(-2).map(c => c.sql), ['ROLLBACK', 'release']);
    assert.ok(!calls.some(c => c.sql === 'COMMIT'));
  }
});
