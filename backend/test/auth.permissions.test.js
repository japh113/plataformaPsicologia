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

test('buildPatientAccessScope only grants full clinical access to superadmin', () => {
  assert.deepEqual(buildPatientAccessScope({ role: 'superadmin' }, 'p.id'), {
    clause: 'TRUE',
    params: [],
  });

  assert.throws(() => buildPatientAccessScope({ role: 'admin' }, 'p.id'), { status: 403 });
  assert.throws(() => buildPatientAccessScope({ role: 'support' }, 'p.id'), { status: 403 });
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
