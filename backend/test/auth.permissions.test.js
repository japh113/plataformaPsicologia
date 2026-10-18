import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPatientAccessScope,
  ensureBackofficeManager,
  ensureBackofficeViewer,
} from '../src/modules/auth/auth.permissions.js';
import {
  validateCreateCareRelationshipPayload,
  validateInviteCareRelationshipPayload,
  validateRequestCareRelationshipPayload,
  validateRespondCareRelationshipPayload,
  validateUpdateCareRelationshipPayload,
} from '../src/modules/auth/auth.validators.js';

test('ensureBackofficeViewer allows support, admin and superadmin roles', () => {
  assert.doesNotThrow(() => ensureBackofficeViewer({ role: 'support' }));
  assert.doesNotThrow(() => ensureBackofficeViewer({ role: 'admin' }));
  assert.doesNotThrow(() => ensureBackofficeViewer({ role: 'superadmin' }));
});

test('ensureBackofficeManager only allows admin and superadmin roles', () => {
  assert.doesNotThrow(() => ensureBackofficeManager({ role: 'admin' }));
  assert.doesNotThrow(() => ensureBackofficeManager({ role: 'superadmin' }));
  assert.throws(() => ensureBackofficeManager({ role: 'support' }), { status: 403 });
});

test('administrative roles never gain clinical scope, even with inherited identifiers', () => {
  for (const role of ['superadmin', 'admin', 'support']) {
    assert.throws(() => buildPatientAccessScope({ id: 'psy', patientId: 'patient', role }, 'p.id'), { status: 403 });
  }
});

test('clinical scopes retain patient ownership and psychologist access parameters', () => {
  assert.deepEqual(buildPatientAccessScope({ role: 'patient', patientId: 'own' }, 'p.id', 2),
    { clause: 'p.id = $2', params: ['own'] });
  const scope = buildPatientAccessScope({ role: 'psychologist', id: 'psy' }, 'p.id', 3);
  assert.deepEqual(scope.params, ['psy']);
  assert.match(scope.clause, /cr.psychologist_user_id = \$3/);
  assert.match(scope.clause, /spa.psychologist_user_id = \$3/);
  assert.throws(() => buildPatientAccessScope(null, 'p.id'), { status: 401 });
});

test('validateCreateCareRelationshipPayload enforces patient and psychologist ids', () => {
  assert.deepEqual(validateCreateCareRelationshipPayload({}), [
    'patientId is required',
    'psychologistUserId is required',
  ]);
});

test('validateUpdateCareRelationshipPayload enforces supported statuses', () => {
  assert.deepEqual(validateUpdateCareRelationshipPayload({ status: 'archived' }), [
    'status must be pending, active, ended or rejected',
  ]);
});

test('validateRequestCareRelationshipPayload requires psychologist id', () => {
  assert.deepEqual(validateRequestCareRelationshipPayload({}), [
    'psychologistUserId is required',
  ]);
});

test('validateInviteCareRelationshipPayload requires a valid patient email', () => {
  assert.deepEqual(validateInviteCareRelationshipPayload({ patientEmail: 'invalid' }), [
    'patientEmail must be valid',
  ]);
});

test('validateRespondCareRelationshipPayload only allows active or rejected', () => {
  assert.deepEqual(validateRespondCareRelationshipPayload({ status: 'ended' }), [
    'status must be active or rejected',
  ]);
});
