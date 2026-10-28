import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import { updatePatientObjective } from '../src/modules/patients/patients.service.js';
import { updatePatientObjectiveHandler } from '../src/modules/patients/patients.controller.js';

test('objective service rejects non-psychologists before any database access, including no-op updates', async (t) => {
  const query = t.mock.method(db, 'query', () => { throw new Error('Unexpected database access'); });
  for (const actor of [{ id: 'p', patientId: 'p', role: 'patient' },
    ...['admin', 'superadmin', 'support', 'unknown'].map(role => ({ id: role, role })), undefined]) {
    for (const payload of [{ completed: true }, { completed: false }, {}, { text: 'Unpermitted' }]) {
      await assert.rejects(updatePatientObjective('p', '1', payload, actor), {
        status: actor ? 403 : 401, message: actor ? 'Forbidden' : 'Unauthorized',
      });
    }
  }
  assert.equal(query.mock.callCount(), 0);
});

test('objective controller rejects non-psychologists before validating payload or calling the service', async (t) => {
  const query = t.mock.method(db, 'query', () => { throw new Error('Unexpected database access'); });
  for (const role of ['patient', 'admin', 'superadmin', 'support', 'unknown']) {
    for (const body of [{ completed: true }, { completed: false }, { completed: 'invalid' }, {}]) {
      let failure;
      await updatePatientObjectiveHandler({ user: { id: role, role }, params: { id: 'p', objectiveId: '1' }, body },
        {}, error => { failure = error; });
      assert.equal(failure?.status, 403);
      assert.equal(failure?.message, 'Forbidden');
    }
  }
  assert.equal(query.mock.callCount(), 0);
});
