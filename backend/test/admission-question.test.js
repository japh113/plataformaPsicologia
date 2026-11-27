import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeQuestionMessage, readQuestionMessage, validate } from '../src/modules/admission/admission.policy.js';

const template = { questions: [{ id: 'context', label: 'Contexto ficticio' }] };
const note = 'Explica el ejemplo\ncon más detalle.';

test('question metadata preserves the message and the exact existing document reference', () => {
  const entry = { submission: 2, message: encodeQuestionMessage('context', note, template) };
  assert.deepEqual(readQuestionMessage(entry, 'message', template), { submission: 2, message: note, questionId: 'context' });
  const directed = { documentRevision: 3, reason: encodeQuestionMessage('context', note, template) };
  assert.deepEqual(readQuestionMessage(directed, 'reason', template), { documentRevision: 3, reason: note, questionId: 'context' });
});

test('historical general messages still read as general messages and unknown questions are rejected', () => {
  const legacy = { message: 'Pregunta general\nContexto ficticio' };
  assert.equal(readQuestionMessage(legacy, 'message', template), legacy);
  assert.throws(() => encodeQuestionMessage('other', note, template), /Pregunta no disponible/);
  const input = { expectedVersion: 1, submission: 1, episodeId: '1', confirmed: true,
    operationId: 'c489409f-61e0-4e32-ab5e-8cea6243fa4b', message: note };
  validate('correct', input);
  validate('correct', { ...input, questionId: 'context' });
  assert.throws(() => validate('correct', { ...input, message: encodeQuestionMessage('context', note, template) }), /Mensaje no válido/);
});
