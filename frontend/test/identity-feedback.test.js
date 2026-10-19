import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRetryAfter, patientRegistrationError } from '../src/utils/identityFeedback.js';

test('wait display rounds up without suggesting an earlier retry', () => {
  for (const [seconds, expected] of [[45,'45 segundos'],[1,'1 segundo'],[60,'1 minuto'],[61,'2 minutos'],[180,'3 minutos'],[3599,'1 hora'],[3601,'1 hora y 1 minuto'],[86100,'23 horas y 55 minutos']]) {
    assert.equal(formatRetryAfter(seconds), expected);
  }
});
test('adult/date rejections are explained in Spanish', () => {
  assert.match(patientRegistrationError({status:400,details:['Independent registration requires age 18 or older']}), /18 años/);
  assert.match(patientRegistrationError({status:400,details:['birthDate cannot be in the future']}), /no puede ser futura/);
  assert.match(patientRegistrationError({status:400,details:['birthDate must be a real date']}), /debe existir/);
});
test('unknown details and non-validation failures cannot disclose an account or reflect server text', () => {
  for (const error of [{status:400,details:['account exists private@example.invalid']},{status:409,message:'account exists private@example.invalid'},{status:500,details:['secret diagnostics']}]) {
    const message=patientRegistrationError(error);
    assert.doesNotMatch(message,/account|private@|secret/);
  }
});
