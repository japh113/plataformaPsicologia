import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { resolveJwtSecret, isLocalDevelopment, assertLocalInitialization } from '../src/config/security.js';
import { ensureAccountCanAuthenticate, ensureSessionIsCurrent } from '../src/modules/auth/auth.account-status.js';
import { getUserById, verifyAuthToken } from '../src/modules/auth/auth.service.js';
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
  const token = jwt.sign({ sub: 'current-user', role: 'superadmin', sv: 0 }, env.jwtSecret);
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
    db.query = async () => ({ rows: [{ id: 'current-user', role: 'patient', session_version: 0 }] });
    const allowed = await invoke(`Bearer ${token}`);
    assert.equal(allowed.called, true);
    assert.equal(allowed.req.user.role, 'patient');
    db.query = async () => ({ rows: [{ id: 'current-user', role: 'patient', session_version: 1 }] });
    const revoked = await invoke(`Bearer ${token}`);
    assert.equal(revoked.res.statusCode, 401);
    assert.equal(revoked.called, false);
    const freshToken = jwt.sign({ sub: 'current-user', sv: 1 }, env.jwtSecret);
    assert.equal((await invoke(`Bearer ${freshToken}`)).called, true);
  } finally { db.query = original; }
});

test('session versions reject legacy, malformed and stale claims without coercion', () => {
  for (const sv of [undefined, null, '0', -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, true, 1]) {
    assert.throws(() => ensureSessionIsCurrent({ sessionVersion: 0 }, { sv }), { status: 401 });
  }
  for (const sessionVersion of [undefined, null, '0', -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => ensureSessionIsCurrent({ sessionVersion }, { sv: 0 }), { status: 401 });
  }
  for (const sessionVersion of [0, 1, 2147483647]) {
    assert.doesNotThrow(() => ensureSessionIsCurrent({ sessionVersion }, { sv: sessionVersion }));
  }
  assert.throws(() => ensureSessionIsCurrent({ sessionVersion: 4 }, { sv: 3 }), { status: 401 });
});

test('episode P3: real user mapping and ordinary middleware agree on active without a clinical grant', async () => {
  const { resolveEpisodeContext } = await import('../src/modules/episodes/episode.context.js');
  const { authorizeEpisodeOperation } = await import('../src/modules/episodes/episode.policy.js');
  const original = db.query;
  const token = jwt.sign({ sub: 'current-professional', role: 'superadmin', sv: 4 }, env.jwtSecret);
  try {
    for (const status of ['active', 'pending_review', 'rejected', 'suspended', 'approved', null]) {
      db.query = async (sql, params) => {
        assert.match(sql, /u.is_active = TRUE/);
        assert.deepEqual(params, ['current-professional']);
        return { rows: [{
          id: 'current-professional', role: 'psychologist', is_active: true,
          first_name: 'Fixture', last_name: 'Professional', session_version: 4,
          psychologist_approval_status: status,
        }] };
      };
      const user = await getUserById('current-professional');
      assert.equal(user.isActive, true);
      assert.equal(user.psychologistStatus, status);
      assert.equal(user.psychologistProfile.approvalStatus, status ?? 'pending_review');
      const context = await resolveEpisodeContext({ async query() { return { rows: [{
        episode_id: '1', modality: 'individual', status: 'prepared',
        psychologist_user_id: user.id, created_by_user_id: 'account-p',
        participant_one_id: 'p', participant_two_id: null,
        patient_id: 'p', slot: 1, participant_psychologist_id: user.id,
      }] }; } }, { actor: user, episodeId: '1', operation: 'read' });
      assert.equal(context.membership.actorIsResponsible, true);
      // Prove active reaches the structural policy gate; approval labels do not.
      // The final decision is identical (denied) in every case.
      let structuralChecks = 0;
      const probe = { ...context, get episode() { structuralChecks++; return context.episode; } };
      assert.deepEqual(authorizeEpisodeOperation(probe), { allowed: false });
      assert.equal(structuralChecks > 0, status === 'active');
      const req = { headers: { authorization: 'Bearer ' + token } };
      const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      let passed = false;
      await authenticate(req, res, error => { assert.equal(error, undefined); passed = true; });
      assert.equal(passed, status === 'active');
      if (passed) {
        assert.equal(req.user.role, 'psychologist');
        assert.equal(req.user.psychologistStatus, 'active');
        assert.deepEqual(authorizeEpisodeOperation({ ...context, actor: req.user }), { allowed: false });
      } else assert.equal(res.statusCode, 403);
    }
    // getUserById filters inactive users; middleware receives no actor.
    db.query = async () => ({ rows: [] });
    assert.equal(await getUserById('current-professional'), null);
    for (const currentActor of [null, { id: 'current-professional', role: 'psychologist', isActive: false, psychologistStatus: 'active' }]) {
      const context = await resolveEpisodeContext({ query() { assert.fail('Inactive actor queried DB'); } },
        { actor: currentActor, episodeId: '1', operation: 'read' });
      assert.equal(context.episode, null);
      assert.deepEqual(authorizeEpisodeOperation(context), { allowed: false });
    }
  } finally { db.query = original; }
});
