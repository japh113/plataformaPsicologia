import test from 'node:test';
import assert from 'node:assert/strict';
import * as mappers from '../src/mappers/patients.js';

test('patient mapper discards global objectives and derivatives even from an obsolete DTO', () => {
  const patient = mappers.mapBackendPatientToUiPatient({ id: 'p',
    objectives: [{ id: 'SECRET_GOAL_ID', text: 'SECRET_GOAL_TEXT', completed: true }],
    objetivos: [{ id: 'SECRET_ALIAS' }], objectivesProgress: 100, completedObjectives: 1 });
  for (const field of ['objectives', 'objetivos', 'objectivesProgress', 'completedObjectives']) {
    assert.equal(Object.hasOwn(patient, field), false);
  }
  assert.doesNotMatch(JSON.stringify(patient), /SECRET_/);
  assert.equal(mappers.mapBackendObjectiveToUiObjective, undefined);
});

test('retirement preserves task mapping and the clinical note narrative objective', () => {
  const patient = mappers.mapBackendPatientToUiPatient({ id: 'p',
    tasks: [{ id: 't', text: 'Fictional task', completed: true, clinicalNoteId: 'n' }],
    clinicalNotes: [{ id: 'n', clinicalNoteObjective: 'Fictional narrative goal' }] });
  assert.equal(patient.tareas[0].completada, true);
  assert.equal(patient.tareas[0].sesionId, 'n');
  assert.equal(patient.sesiones[0].objetivo, 'Fictional narrative goal');
});
