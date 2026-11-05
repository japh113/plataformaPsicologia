import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, deflateSync } from 'node:zlib';
import app from '../src/app.js';
import db from '../src/config/db.js';
import bcrypt from 'bcryptjs';

// Production CORS -> JSON parser -> public router -> error handler, without DB.
test('production JSON parser preserves compression, size limits and HTTP errors', async t => {
  const unexpected = () => { throw new Error('Request must stop before DB/bcrypt'); };
  const guards = [
    t.mock.method(db, 'query', unexpected), t.mock.method(db, 'getClient', unexpected),
    t.mock.method(bcrypt, 'hash', unexpected), t.mock.method(bcrypt, 'compare', unexpected),
  ];
  t.mock.method(console, 'error', () => {});
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = async (body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST', body,
      headers: { 'Content-Type': 'application/json', Origin: 'https://client.invalid', ...headers },
    });
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.match(response.headers.get('Access-Control-Expose-Headers'), /Retry-After/i);
    return { status: response.status, body: await response.json() };
  };
  const validationError = { success: false, message: 'Validation error', details: ['email is required', 'password is required'] };
  try {
    for (const [encoding, compress] of [['gzip', gzipSync], ['deflate', deflateSync]]) {
      const parsed = await request(compress(Buffer.from('{}')), { 'Content-Encoding': encoding });
      assert.equal(parsed.status, 400);
      assert.deepEqual(parsed.body, validationError);
    }
    const ordinary = await request('{}');
    assert.equal(ordinary.status, 400);
    assert.deepEqual(ordinary.body, validationError);
    const malformed = await request('{');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.success, false);
    assert.equal(malformed.body.details, undefined);
    assert.equal((await request('42')).status, 400); // Default strict JSON mode.
    assert.equal((await request(Buffer.from('invalid gzip'), { 'Content-Encoding': 'gzip' })).status, 400);

    // Bounded 100 KiB + 1 byte regression: wire and inflated size limits.
    const oversized = Buffer.from(JSON.stringify({ value: 'x'.repeat(100 * 1024 - 11) }));
    assert.equal(oversized.length, 100 * 1024 + 1);
    for (const headers of [{}, { 'Content-Encoding': 'gzip' }]) {
      const result = await request(headers['Content-Encoding'] ? gzipSync(oversized) : oversized, headers);
      assert.equal(result.status, 413);
      assert.deepEqual(result.body, { success: false, message: 'request entity too large' });
    }
    for (const headers of [{ 'Content-Encoding': 'br' }, { 'Content-Type': 'application/json; charset=iso-8859-1' }]) {
      const unsupported = await request('{}', headers);
      assert.equal(unsupported.status, 415);
      assert.equal(unsupported.body.success, false);
    }
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
