import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPatientAccessScope,
  ensureBackofficeManager,
  ensureBackofficeViewer,
} from '../src/modules/auth/auth.permissions.js';

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

