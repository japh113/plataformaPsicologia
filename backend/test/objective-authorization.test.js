import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../src/modules/patients/patients.service.js';
import * as controller from '../src/modules/patients/patients.controller.js';
import * as validators from '../src/modules/patients/patients.tasks.validators.js';

test('retired global objective operations are absent from the public service and controller surface', () => {
  for (const verb of ['create', 'update', 'delete']) {
    assert.equal(service[verb + 'PatientObjective'], undefined);
    assert.equal(controller[verb + 'PatientObjectiveHandler'], undefined);
    assert.equal(typeof service[verb + 'PatientTask'], 'function');
  }
});

test('retirement removes the objective validator while preserving required task note references', () => {
  assert.equal(validators.validateCreateObjectivePayload, undefined);
  assert.deepEqual(validators.validateCreateTaskPayload({ text: 'Fictional task' }), ['clinicalNoteId is required']);
  assert.deepEqual(validators.validateCreateTaskPayload({ text: 'Fictional task', clinicalNoteId: '1' }), []);
});
