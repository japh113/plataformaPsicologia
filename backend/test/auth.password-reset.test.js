import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePasswordResetConfirmPayload, validatePasswordResetRequestPayload } from '../src/modules/auth/auth.validators.js';
import { __authTestables } from '../src/modules/auth/auth.service.js';

test('validatePasswordResetRequestPayload requires a valid email', () => {
  assert.deepEqual(validatePasswordResetRequestPayload({}), ['email is required']);
  assert.deepEqual(validatePasswordResetRequestPayload({ email: 'demo' }), ['email must be valid']);
});

test('validatePasswordResetConfirmPayload requires token and minimum password length', () => {
  assert.deepEqual(validatePasswordResetConfirmPayload({}), ['token is required', 'password is required']);
  assert.deepEqual(validatePasswordResetConfirmPayload({ token: 'abc', password: '123' }), ['password must be at least 8 characters']);
});

test('hashPasswordResetToken is deterministic for the same token', () => {
  const firstHash = __authTestables.hashPasswordResetToken('token-demo');
  const secondHash = __authTestables.hashPasswordResetToken('token-demo');

  assert.equal(firstHash, secondHash);
});

test('buildPasswordResetPreview returns a reset token and URL', () => {
  const preview = __authTestables.buildPasswordResetPreview({
    token: 'abc123',
    expiresAt: new Date('2026-04-13T12:30:00.000Z'),
    appBaseUrl: 'http://localhost:5173',
  });

  assert.equal(preview.resetToken, 'abc123');
  assert.match(preview.resetUrl, /\?resetToken=abc123$/);
  assert.equal(preview.expiresAt, '2026-04-13T12:30:00.000Z');
});

test('ensurePasswordResetRecordUsable rejects missing, used or expired tokens', () => {
  assert.throws(() => __authTestables.ensurePasswordResetRecordUsable(null), { message: 'Password reset token is invalid or expired' });
  assert.throws(
    () =>
      __authTestables.ensurePasswordResetRecordUsable({
        expires_at: '2026-04-13T10:00:00.000Z',
        used_at: '2026-04-13T09:00:00.000Z',
      }, new Date('2026-04-13T09:30:00.000Z')),
    { message: 'Password reset token is invalid or expired' },
  );
  assert.throws(
    () =>
      __authTestables.ensurePasswordResetRecordUsable({
        expires_at: '2026-04-13T09:00:00.000Z',
        used_at: null,
      }, new Date('2026-04-13T09:30:00.000Z')),
    { message: 'Password reset token is invalid or expired' },
  );
});

test('ensurePasswordResetRecordUsable accepts a valid unused token', () => {
  assert.doesNotThrow(() =>
    __authTestables.ensurePasswordResetRecordUsable({
      expires_at: '2026-04-13T10:00:00.000Z',
      used_at: null,
    }, new Date('2026-04-13T09:30:00.000Z')),
  );
});
