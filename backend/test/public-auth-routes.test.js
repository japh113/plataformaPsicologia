import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import authRoutes, { createPublicAuthRouter } from '../src/modules/auth/auth.routes.js';
import { createPublicAuthLimiters, PUBLIC_AUTH_POLICIES } from '../src/modules/auth/public-auth-limiter.js';
import { validatePatientRegistrationPayload, validatePsychologistRegistrationPayload } from '../src/modules/auth/auth.validators.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';

const registrationCases = [
  {
    path: '/register/patient',
    payload: { firstName: 'Ficticia', email: 'fictional@test.invalid', password: 'Private-123!', birthDate: '1990-01-01', phone: '+525512345678' },
    validate: validatePatientRegistrationPayload,
  },
  {
    path: '/register/psychologist',
    payload: { firstName: 'Ficticia', email: 'fictional@test.invalid', password: 'Private-123!', professionalTitle: 'Psicóloga' },
    validate: validatePsychologistRegistrationPayload,
  },
];

// Real Express routing and controllers, no PostgreSQL, clocks or crypto workloads.
test('public HTTP limits precede database/bcrypt and preserve CORS and ordinary errors', async t => {
  let current = 0;
  const options = Object.fromEntries(['login', 'registration', 'passwordReset'].map(name => [name, { limit: 2, windowMs: 2500, now: () => current }]));
  const router = createPublicAuthRouter(createPublicAuthLimiters(options));
  const app = express();
  app.use(cors({ exposedHeaders: ['Retry-After'] }));
  app.use(express.json());
  app.use('/api/auth', router);
  app.use('/api/auth', authRoutes);
  const original = { query: db.query, getClient: db.getClient, hash: bcrypt.hash, compare: bcrypt.compare, localDevelopment: env.localDevelopment };
  let queries = 0, clients = 0, hashes = 0, comparisons = 0;
  db.query = async () => { queries++; return { rows: [] }; };
  db.getClient = async () => { clients++; throw new Error('Database must not run'); };
  bcrypt.hash = async () => { hashes++; throw new Error('Hash must not run'); };
  bcrypt.compare = async () => { comparisons++; throw new Error('Compare must not run'); };
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = async (path, body = {}, method = 'POST', headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`, {
      method, headers: { 'Content-Type': 'application/json', Origin: 'https://client.invalid', ...headers },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, body: method === 'OPTIONS' ? null : await response.json() };
  };
  try {
    await t.test('preflight does not consume quota and ordinary 400/401 remain unchanged', async () => {
      for (let i = 0; i < 3; i++) assert.equal((await request('/login', {}, 'OPTIONS')).status, 204);
      const invalid = await request('/login');
      assert.equal(invalid.status, 400);
      assert.deepEqual(invalid.body.details, ['email is required', 'password is required']);
      assert.equal((await request('/login', { email: 'legacy-identifier', password: 'private' })).status, 401);
      assert.equal(queries, 1);
      const blocked = await request('/login', { email: 'other@test.invalid', password: 'private' }, 'POST', { 'X-Forwarded-For': '192.0.2.1', 'X-Real-IP': '192.0.2.2' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.headers.get('Retry-After'), '3');
      assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), '*');
      assert.match(blocked.headers.get('Access-Control-Expose-Headers'), /Retry-After/i);
      assert.equal(queries, 1);
      current = 2500;
      assert.equal((await request('/login')).status, 400);
    });
    await t.test('both registrations share one quota; rejected valid bodies never reach crypto/DB', async () => {
      assert.equal((await request('/register/patient')).status, 400);
      assert.equal((await request('/register/psychologist')).status, 400);
      const callsBefore = { queries, clients, hashes, comparisons };
      for (const { path, payload, validate } of registrationCases) {
        assert.deepEqual(validate(payload), [], path + ' fixture must satisfy its production validator');
        const response = await request(path, payload);
        assert.equal(response.status, 429);
        assert.deepEqual({ queries, clients, hashes, comparisons }, callsBefore, path + ' must stop before DB/bcrypt');
      }
      assert.equal(clients, 0); assert.equal(hashes, 0);
      current = 5000;
      assert.equal((await request('/register/patient')).status, 400);
    });
    await t.test('disabled recovery remains 503 below quota with no preview or database access', async () => {
      env.localDevelopment = false;
      assert.equal((await request('/password-reset/request', { email: 'missing@test.invalid' })).status, 503);
      const confirm = await request('/password-reset/confirm', { token: 'PRIVATE_TOKEN', password: 'Private-123!' });
      assert.equal(confirm.status, 503);
      assert.equal(confirm.body.message, 'Password recovery is not configured');
      assert.equal(confirm.body.data, undefined);
      for (const path of ['/password-reset/request', '/password-reset/confirm']) {
        const response = await request(path, { email: 'missing@test.invalid', token: 'PRIVATE_TOKEN', password: 'Private-123!' });
        assert.equal(response.status, 429);
        assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_TOKEN|Private-123|missing@/);
      }
      assert.equal(queries, 1); assert.equal(clients, 0); assert.equal(comparisons, 0); assert.equal(hashes, 0);
    });
    await t.test('exhausted public quotas do not intercept authenticated contact/verification routes', async () => {
      for (const path of ['/verification/email/request', '/verification/sms/confirm', '/contact-changes', '/contact-changes/fictional/confirm']) {
        assert.equal((await request(path)).status, 401, path);
      }
      assert.equal(queries, 1); assert.equal(clients, 0);
      // Existing B/C PostgreSQL tests verify the persistent counters themselves.
    });
  } finally {
    Object.assign(db, { query: original.query, getClient: original.getClient });
    Object.assign(bcrypt, { hash: original.hash, compare: original.compare });
    env.localDevelopment = original.localDevelopment;
    await new Promise(resolve => server.close(resolve));
  }
});

// Mount only the production export: a separately mounted public factory would
// conceal an accidental removal of router.use(createPublicAuthRouter()).
test('default auth router connects public routes and enforces the shared registration budget', async t => {
  t.mock.method(performance, 'now', () => 0);
  const unexpected = () => { throw new Error('Production router must stop before DB/bcrypt'); };
  const guarded = [
    t.mock.method(db, 'query', unexpected),
    t.mock.method(db, 'getClient', unexpected),
    t.mock.method(bcrypt, 'hash', unexpected),
    t.mock.method(bcrypt, 'compare', unexpected),
  ];
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = async (path, body = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  try {
    for (const path of ['/login', '/password-reset/request', '/password-reset/confirm']) {
      assert.equal((await request(path)).status, 400, path + ' must reach its public validator');
    }
    // Use the unchanged production quota: only 30 invalid, cheap requests and two
    // blocked valid fixtures. A frozen monotonic clock prevents window rollover.
    const { limit, windowMs } = PUBLIC_AUTH_POLICIES.registration;
    for (let i = 0; i < limit; i++) {
      const { path } = registrationCases[i % registrationCases.length];
      assert.equal((await request(path)).status, 400, path + ' must reach its public validator');
    }
    for (const { path, payload, validate } of registrationCases) {
      assert.deepEqual(validate(payload), [], path + ' fixture must be valid');
      const blocked = await request(path, payload);
      assert.equal(blocked.status, 429, path + ' must use the production limiter');
      assert.equal(blocked.headers.get('Retry-After'), String(windowMs / 1000));
      assert.deepEqual(blocked.body, { success: false, message: 'Too many requests. Please try again later.', details: null });
    }
    for (const operation of guarded) assert.equal(operation.mock.callCount(), 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
