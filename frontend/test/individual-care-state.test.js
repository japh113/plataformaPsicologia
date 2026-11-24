import test from 'node:test';
import assert from 'node:assert/strict';
import { careProgress, episodeTitle, patientHasNextTask } from '../src/components/individualCareState.js';

test('care progress requires confirmed consultation data before reporting an appointment or activation', () => {
  const assignment = { id: 'private-assignment', state: 'accepted', reviewState: 'validated' };
  assert.deepEqual(careProgress(assignment, null, false, 'error'), {
    stage: 'Entrevista validada', next: 'El estado de tratamiento requiere actualización.',
  });
  assert.equal(careProgress(assignment, { status: 'prepared', sufficiencyConfirmed: true }, false).stage, 'Entrevista confirmada');
  assert.equal(careProgress(assignment, { status: 'active' }, false).stage, 'Tratamiento iniciado');
  assert.equal(careProgress(assignment, { status: 'active', appointment: { status: 'completed' } }, false).stage, 'Primera consulta completada');
});

test('revocation takes precedence over prior progress and episode labels use authorized dates', () => {
  const assignment = { id: 'private-assignment', episodeId: '123', state: 'revoked', preparedAt: '2026-11-24T19:00:00.123Z' };
  assert.equal(careProgress(assignment, { status: 'active' }, false).stage, 'Entrevista cerrada');
  assert.match(episodeTitle(assignment), /2026/);
  assert.doesNotMatch(episodeTitle(assignment), /private-assignment/);
  assert.equal(episodeTitle({ ...assignment, preparedAt: undefined }), 'Atención individual');
  assert.equal(careProgress({ id: assignment.id, state: 'accepted' }, { status: 'withdrawn' }, true).stage, 'Consentimiento retirado');
});

test('patient tasks are prioritized using the authorized current interview or treatment state', () => {
  const pending = { state: 'accepted', mode: 'self', episodeStatus: 'prepared', reviewState: 'correction_requested' };
  assert.equal(patientHasNextTask(pending), true);
  assert.equal(patientHasNextTask({ ...pending, mode: 'directed' }), false);
  assert.equal(patientHasNextTask({ state: 'revoked' }, { status: 'prepared', sufficiencyConfirmed: true }), false);
  assert.equal(patientHasNextTask({ state: 'accepted' }, { status: 'prepared', sufficiencyConfirmed: true }), true);
  assert.equal(patientHasNextTask({ state: 'accepted' }, {
    status: 'prepared', sufficiencyConfirmed: true, consentWithdrawn: true,
  }), false);
});
