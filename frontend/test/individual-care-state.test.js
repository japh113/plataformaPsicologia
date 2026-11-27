import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementCare, careChecklist, careProgress, episodeTitle } from '../src/components/individualCareState.js';

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
  const pending = { id: 'a', state: 'accepted', mode: 'self', episodeStatus: 'prepared', reviewState: 'correction_requested' };
  assert.equal((careChecklist(pending, null, false).owner === 'patient'), true);
  assert.equal((careChecklist({ ...pending, mode: 'directed' }, null, false).owner === 'patient'), false);
  assert.equal((careChecklist({ state: 'revoked' }, { status: 'prepared', sufficiencyConfirmed: true }, false).owner === 'patient'), false);
  assert.equal((careChecklist({ id: 'a', state: 'accepted', reviewState: 'validated' }, { status: 'prepared', sufficiencyConfirmed: true }, false).owner === 'patient'), true);
  assert.equal((careChecklist({ state: 'accepted' }, {
    status: 'prepared', sufficiencyConfirmed: true, consentWithdrawn: true,
  }, false).owner === 'patient'), false);
});

test('care checklist shows the responsible person at the current confirmed stage', () => {
  const assignment = { id: 'a', state: 'accepted', reviewState: 'submitted' };
  const progress = careChecklist(assignment, { status: 'prepared', documentVersion: 1 }, true);
  assert.equal(progress.completed, 2);
  assert.equal(progress.steps[2].current, true);
  assert.equal(progress.steps[2].owner, 'professional');
  assert.equal(progress.steps[3].complete, false);
});

test('the checklist starts at the completed link before any assignment', () => {
  const before = careChecklist({}, null, false);
  assert.equal(before.completed, 1);
  assert.equal(before.steps[0].complete, true);
  assert.equal(before.steps[1].owner, 'professional');
  assert.equal(before.unavailable, false);
  assert.match(before.next, /Tu profesional/);
});

test('directed assignment awaits patient consent, then the professional records and reviews', () => {
  const directed = { id: 'a', state: 'proposed', mode: 'directed', reviewState: 'awaiting_document' };
  assert.equal(careChecklist(directed, null, false).owner, 'patient');
  const accepted = { ...directed, state: 'accepted' };
  assert.equal(careChecklist(accepted, null, false).owner, 'professional');
  const validated = { ...accepted, reviewState: 'validated' };
  const next = careChecklist(validated, { status: 'prepared', sufficiencyConfirmed: true }, false);
  assert.equal(next.completed, 3);
  assert.equal(next.owner, 'patient');
});

test('a correction reopens the interview despite a previous document or proof', () => {
  const assignment = { id: 'a', state: 'accepted', reviewState: 'correction_requested' };
  const stale = { status: 'prepared', documentVersion: 2, sufficiencyConfirmed: true };
  for (const [mode, owner] of [['self', 'patient'], ['directed', 'professional']]) {
    const progress = careChecklist({ ...assignment, mode }, stale, false);
    assert.equal(progress.stage, 'Corrección pendiente');
    assert.equal(progress.completed, 1);
    assert.equal(progress.steps[1].complete, false);
    assert.equal(progress.steps[1].owner, owner);
    assert.equal(progress.steps[2].complete, false);
  }
});

test('closure removes pending work and keeps the completion count consistent', () => {
  const assignment = { id: 'a', state: 'accepted', reviewState: 'validated' };
  for (const closed of [
    careChecklist({ ...assignment, state: 'revoked' }, null, false),
    careChecklist(assignment, { status: 'withdrawn', consentWithdrawn: true }, true),
  ]) {
    assert.equal(closed.closed, true);
    assert.equal(closed.owner, null);
    assert.equal(closed.steps.some(step => step.current), false);
    assert.equal(closed.completed, closed.steps.filter(step => step.complete).length);
  }
});

test('missing or mismatched reads cannot produce a consultation task or absence of tasks', () => {
  const item = { id: 'a', episodeId: '1', agreementId: 'g', episodeStatus: 'prepared', reviewState: 'validated', state: 'accepted' };
  assert.equal(agreementCare('g', null, [], true), null);
  const review = careChecklist(item, null, true, 'error');
  assert.equal(review.unavailable, true);
  assert.equal(review.owner, null);
  assert.equal(agreementCare('g', [item], [{ id: 'a', episodeId: '1', status: 'active' }], true)[0].unavailable, true);
  const active = { ...item, episodeStatus: 'active' };
  assert.equal(careChecklist(active, { status: 'active', hasAppointment: false }, true).owner, 'professional');
  assert.equal(careChecklist(active, { status: 'active', hasAppointment: true }, true).owner, null);
});
