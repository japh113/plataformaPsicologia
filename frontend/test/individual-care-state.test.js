import test from 'node:test';
import assert from 'node:assert/strict';
import { careProgress, episodeTitle } from '../src/components/individualCareState.js';

test('care progress requires confirmed consultation data before reporting an appointment or activation', () => {
  const assignment = { id: 'private-assignment', state: 'accepted', reviewState: 'validated' };
  assert.deepEqual(careProgress(assignment, null, false, 'error'), {
    stage: 'Entrevista validada', next: 'El estado de tratamiento requiere actualización.',
  });
  assert.equal(careProgress(assignment, { status: 'prepared', sufficiencyConfirmed: true }, false).stage, 'Suficiencia confirmada');
  assert.equal(careProgress(assignment, { status: 'active' }, false).stage, 'Episodio activo');
  assert.equal(careProgress(assignment, { status: 'active', appointment: { status: 'completed' } }, false).stage, 'Primera consulta completada');
});

test('revocation takes precedence over prior progress and episode labels use authorized dates', () => {
  const assignment = { id: 'private-assignment', episodeId: '123', state: 'revoked', preparedAt: '2026-11-24T19:00:00.123Z' };
  assert.equal(careProgress(assignment, { status: 'active' }, false).stage, 'Admisión revocada');
  assert.match(episodeTitle(assignment), /2026/);
  assert.doesNotMatch(episodeTitle(assignment), /private-assignment/);
  assert.equal(episodeTitle({ ...assignment, preparedAt: undefined }), 'Atención individual');
  assert.equal(careProgress({ id: assignment.id, state: 'accepted' }, { status: 'withdrawn' }, true).stage, 'Acceso de tratamiento retirado');
});
