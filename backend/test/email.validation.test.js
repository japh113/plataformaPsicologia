import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, MAX_EMAIL_LENGTH } from '../src/modules/auth/email.validation.js';
import { normalizeEmail, registrationErrors } from '../src/modules/auth/identity.validation.js';
import { validateLoginPayload, validatePasswordResetRequestPayload, validatePsychologistRegistrationPayload, validateInviteCareRelationshipPayload } from '../src/modules/auth/auth.validators.js';

const patient = { firstName: 'Ficticia', password: 'Fictional-123!', birthDate: '1990-01-01', phone: '+525512345678' };

test('bounded email format preserves the simple accepted grammar and normalization', () => {
  for (const email of ['a@b.c', 'A+tag@EXAMPLE.invalid', ' ü@例.测试 ', 'a@.b.c', 'a@b..', 'a..b@c.d', 'a@b.c.d']) {
    assert.equal(isValidEmail(email), true, email);
    assert.deepEqual(validatePasswordResetRequestPayload({ email }), []);
    assert.deepEqual(validatePsychologistRegistrationPayload({ ...patient, email, professionalTitle: 'Psicóloga' }), []);
    assert.deepEqual(registrationErrors({ ...patient, email }), []);
    assert.deepEqual(validateInviteCareRelationshipPayload({ patientEmail: email }), []);
  }
  assert.equal(normalizeEmail(' TEST@Example.invalid '), 'test@example.invalid');
});

test('rejects missing, non-string, whitespace, multiple-at and incomplete domains', () => {
  for (const email of [undefined, null, 12, {}, [], '', 'a', '@b.c', 'a@b', 'a@b.', 'a@.b', 'a@@b.c', 'a b@c.d', 'a@b.c\nx', 'a@b.\tc', 'a@b.\u00a0c']) {
    assert.equal(isValidEmail(email), false);
    assert.ok(validatePasswordResetRequestPayload({ email }).length);
    assert.ok(validatePsychologistRegistrationPayload({ ...patient, email, professionalTitle: 'Psicóloga' }).includes(email && typeof email === 'string' ? 'email must be valid' : 'email is required'));
    assert.ok(registrationErrors({ ...patient, email }).includes('email must be valid'));
  }
});

test('raw length is bounded before normalization and adversarial inputs remain finite', () => {
  const boundary = 'a'.repeat(MAX_EMAIL_LENGTH - 4) + '@b.c';
  assert.equal(boundary.length, MAX_EMAIL_LENGTH);
  assert.equal(isValidEmail(boundary), true);
  for (const email of ['a' + boundary, ' ' + boundary, '!@!.' + '!.'.repeat(126), '!.'.repeat(126) + '@x. ', '!@!.' + '!.'.repeat(20_000), 'x'.repeat(100_000)]) {
    assert.equal(isValidEmail(email), false);
    assert.deepEqual(validatePasswordResetRequestPayload({ email }), ['email must be valid']);
    assert.ok(registrationErrors({ ...patient, email }).includes('email must be valid'));
  }
  // CodeQL's shape is accepted by the old grammar unless it ends in whitespace.
  assert.equal(isValidEmail('!@!.' + '!.'.repeat(100)), true);
  assert.equal(isValidEmail('!@!.' + '!.'.repeat(100) + ' x'), false);
});

test('login continues to require presence only, without imposing an email grammar', () => {
  for (const email of ['legacy-login', 'x'.repeat(1000)]) {
    assert.deepEqual(validateLoginPayload({ email, password: 'present' }), []);
  }
  assert.deepEqual(validateLoginPayload({}), ['email is required', 'password is required']);
});
