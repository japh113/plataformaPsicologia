import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { resolveJwtSecret, isLocalDevelopment, assertLocalInitialization } from '../src/config/security.js';
import { ensureAccountCanAuthenticate } from '../src/modules/auth/auth.account-status.js';
import { verifyAuthToken } from '../src/modules/auth/auth.service.js';
import { authenticate } from '../src/middlewares/authMiddleware.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';

test('nonlocal environments reject absent, known, short, repeated and example secrets', () => {
  for (const NODE_ENV of [undefined, 'development', 'test', 'staging', 'production', 'prod']) {
    for (const JWT_SECRET of [undefined, '', 'secret', 'psicopanel-dev-secret', 'change-this-secret',
      'a'.repeat(64), 'AbCdEfGh12345678'.repeat(4), 'abcdefghijklmnopqrstuvwxyz0123456789',
      'change-this-secret-' + randomBytes(32).toString('hex')]) {
      assert.throws(() => resolveJwtSecret({ NODE_ENV, JWT_SECRET }), /JWT_SECRET/);
    }
    const JWT_SECRET = randomBytes(32).toString('hex');
    assert.equal(resolveJwtSecret({ NODE_ENV, JWT_SECRET }), JWT_SECRET);
  }
});

test('local exceptions require explicit opt-in and never work in production/staging', () => {
  for (const NODE_ENV of ['development', 'test']) {
    assert.equal(resolveJwtSecret({ NODE_ENV, LOCAL_DEVELOPMENT: 'true' }), 'psicopanel-dev-secret');
  }
  for (const NODE_ENV of ['production', 'staging', 'prod']) {
    assert.equal(isLocalDevelopment({ NODE_ENV, LOCAL_DEVELOPMENT: 'true' }), false);
    assert.throws(() => resolveJwtSecret({ NODE_ENV, LOCAL_DEVELOPMENT: 'true' }));
  }
  assert.throws(() => assertLocalInitialization({ localDevelopment: false }));
});

test('the actual env module fails startup without leaking a supplied weak secret', () => {
  const candidate = 'psicopanel-dev-secret';
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config/env.js')"], {
    encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production', LOCAL_DEVELOPMENT: 'true', JWT_SECRET: candidate },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET must/);
  assert.ok(!result.stderr.includes(candidate));
});

test('only explicitly active psychologists pass; other roles keep their permissions', () => {
  for (const psychologistStatus of ['pending_review', 'rejected', 'suspended', null, undefined, '', 'unknown']) {
    assert.throws(() => ensureAccountCanAuthenticate({ role: 'psychologist', psychologistStatus }), { status: 403 });
  }
  assert.doesNotThrow(() => ensureAccountCanAuthenticate({ role: 'psychologist', psychologistStatus: 'active' }));
  for (const role of ['patient', 'admin', 'support', 'superadmin']) {
    assert.doesNotThrow(() => ensureAccountCanAuthenticate({ role }));
    assert.throws(() => ensureAccountCanAuthenticate({ role, isActive: false }), { status: 401 });
  }
  assert.throws(() => ensureAccountCanAuthenticate(null), { status: 401 });
  assert.throws(() => ensureAccountCanAuthenticate({ id: 'u_admin_1', role: 'admin' }), { status: 403 });
  assert.doesNotThrow(() => ensureAccountCanAuthenticate({ id: 'u_admin_1', role: 'admin' }, { localDevelopment: true }));
});

test('JWT rejects expiry, signature, unsupported algorithm and malformed subject', () => {
  for (const token of [
    jwt.sign({ sub: 'x' }, 'wrong-key'), jwt.sign({ sub: 'x' }, env.jwtSecret, { expiresIn: -1 }),
    jwt.sign({ sub: 'x' }, env.jwtSecret, { algorithm: 'HS384' }),
    jwt.sign({}, env.jwtSecret), jwt.sign({ sub: 123 }, env.jwtSecret), jwt.sign({ sub: '' }, env.jwtSecret), 'bad.token',
  ]) assert.throws(() => verifyAuthToken(token));
});

test('middleware denies before handlers and passes database outages to error handling', async () => {
  const original = db.query;
  const token = jwt.sign({ sub: 'current-user', role: 'superadmin' }, env.jwtSecret);
  const invoke = async authorization => {
    const req = { headers: { authorization } };
    const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let called = false;
    let forwarded;
    await authenticate(req, res, error => { called = true; forwarded = error; });
    return { req, res, called, forwarded };
  };
  try {
    db.query = async () => { throw new Error('database unavailable'); };
    const failed = await invoke(`Bearer ${token}`);
    assert.equal(failed.forwarded.message, 'database unavailable');
    assert.equal(failed.res.statusCode, undefined);
    for (const authorization of [undefined, 'Basic abc', `Bearer ${token} trailing`, 'Bearer invalid']) {
      const response = await invoke(authorization);
      assert.equal(response.res.statusCode, 401);
      assert.equal(response.called, false);
    }
    db.query = async () => ({ rows: [] });
    assert.equal((await invoke(`Bearer ${token}`)).res.statusCode, 401);
    db.query = async () => ({ rows: [{ id: 'current-user', role: 'psychologist', psychologist_approval_status: 'suspended' }] });
    const blocked = await invoke(`Bearer ${token}`);
    assert.equal(blocked.res.statusCode, 403);
    assert.equal(blocked.called, false);
    db.query = async () => ({ rows: [{ id: 'current-user', role: 'patient' }] });
    const allowed = await invoke(`Bearer ${token}`);
    assert.equal(allowed.called, true);
    assert.equal(allowed.req.user.role, 'patient');
  } finally { db.query = original; }
});
