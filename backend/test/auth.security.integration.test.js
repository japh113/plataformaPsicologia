import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { initializeProduction } from '../scripts/initialize-production.js';

test('authentication security with disposable PostgreSQL and real HTTP', {
  skip: process.env.RUN_AUTH_INTEGRATION !== 'true',
}, async t => {
  assert.equal(env.databaseUrl, '', 'External databases are forbidden');
  assert.equal(env.dbName, 'psicopanel_integrity_test', 'Use the isolated Compose test database');
  assert.equal(env.dbHost, 'db');
  assert.equal(env.nodeEnv, 'test');
  assert.equal(env.localDevelopment, true);
  // A separate database keeps the clinical integration suite untouched.
  assert.equal((await db.query("SELECT 1 FROM pg_database WHERE datname='psicopanel_auth_test'")).rowCount, 0,
    'Auth tests require a fresh disposable cluster; never reuse an existing database');
  await db.query('CREATE DATABASE psicopanel_auth_test');
  const pool = new pg.Pool({ host: env.dbHost, port: env.dbPort, user: env.dbUser,
    password: env.dbPassword, database: 'psicopanel_auth_test' });
  const originalQuery = db.query;
  const originalGetClient = db.getClient;
  const savedEnv = { ...env };
  let server;
  db.query = (sql, params) => pool.query(sql, params);
  db.getClient = () => pool.connect();
  try {
    await t.test('production fresh installation has no users or clinical rows and refuses replay', async () => {
      const config = { nodeEnv: 'production', localDevelopment: false };
      await initializeProduction(db, config);
      for (const table of ['users', 'patients', 'psychologist_profiles', 'care_relationships']) {
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
      }
      await db.query("INSERT INTO users(id,first_name,last_name,email,password_hash,role) VALUES ('sentinel','Keep','Me','keep@test.invalid','unused','admin')");
      const before = (await db.query('SELECT * FROM users')).rows;
      await assert.rejects(initializeProduction(db, config), /database is not empty/);
      assert.deepEqual((await db.query('SELECT * FROM users')).rows, before);
      await assert.rejects(initializeProduction(db, { nodeEnv: 'development', localDevelopment: true }), /requires NODE_ENV/);
    });

    await t.test('raw demo SQL and production CLI schema/seed commands fail before changing rows', async () => {
      const seed = await fs.readFile(new URL('../sql/seed.sql', import.meta.url), 'utf8');
      await assert.rejects(db.query(seed), /Demo seed disabled/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM patients')).rows[0].n, 0);
      for (const file of ['schema.sql', 'seed.sql']) {
        const result = spawnSync(process.execPath, ['scripts/run-sql-file.js', `sql/${file}`], {
          encoding: 'utf8', env: { ...process.env, PGDATABASE: 'psicopanel_auth_test',
            NODE_ENV: 'production', LOCAL_DEVELOPMENT: 'true', JWT_SECRET: randomBytes(32).toString('hex') },
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /restricted to explicit local development/);
      }
      assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 1);
    });

    const password = 'AuthTest-Only-493!';
    const hash = await bcrypt.hash(password, 4);
    const roles = ['psychologist', 'patient', 'admin', 'support', 'superadmin'];
    for (const role of roles) {
      await db.query(`INSERT INTO users(id,first_name,last_name,email,password_hash,role)
        VALUES ($1,'Auth','Fixture',$2,$3,$4)`, [`auth_${role}`, `${role}@auth.invalid`, hash, role]);
    }
    await db.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES ('auth_psychologist','active')");
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const request = async (path, token, method = 'GET', body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    };
    const login = role => request('/auth/login', null, 'POST', { email: `${role}@auth.invalid`, password });
    const tokens = {};
    for (const role of roles) {
      const response = await login(role);
      assert.equal(response.status, 200);
      tokens[role] = response.body.data.token;
    }

    await t.test('a previously issued JWT loses access immediately for every unapproved state', async () => {
      const paths = ['/auth/me', '/auth/care-relationships', '/patients', '/appointments', '/availability', '/reminders'];
      assert.equal((await request('/patients', tokens.psychologist)).status, 200);
      for (const state of ['suspended', 'rejected', 'pending_review']) {
        if (state === 'pending_review') {
          await db.query("UPDATE psychologist_profiles SET approval_status=$1 WHERE user_id='auth_psychologist'", [state]);
        } else {
          assert.equal((await request('/auth/psychologists/auth_psychologist/review', tokens.admin, 'PATCH',
            { approvalStatus: state })).status, 200);
        }
        for (const path of paths) assert.equal((await request(path, tokens.psychologist)).status, 403, `${state} ${path}`);
        assert.equal((await login('psychologist')).status, 403);
      }
      await db.query("DELETE FROM psychologist_profiles WHERE user_id='auth_psychologist'");
      assert.equal((await request('/auth/me', tokens.psychologist)).status, 403);
      assert.equal((await login('psychologist')).status, 403);
      await db.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES ('auth_psychologist','active')");
      // Current-state revocation ends when an operator explicitly reactivates the account.
      assert.equal((await request('/auth/me', tokens.psychologist)).status, 200);
    });

    await t.test('is_active=false rejects old tokens and login for all roles with 401', async () => {
      for (const role of roles) {
        await db.query('UPDATE users SET is_active=false WHERE id=$1', [`auth_${role}`]);
        for (const path of ['/auth/me', '/patients', '/appointments', '/auth/users']) {
          assert.equal((await request(path, tokens[role])).status, 401, `${role} ${path}`);
        }
        assert.equal((await login(role)).status, 401);
        await db.query('UPDATE users SET is_active=true WHERE id=$1', [`auth_${role}`]);
      }
    });

    await t.test('fresh DB roles override stale JWT claims and preserve backoffice boundaries', async () => {
      for (const role of roles) assert.equal((await request('/auth/me', tokens[role])).status, 200);
      for (const role of ['admin', 'support', 'superadmin']) assert.equal((await request('/auth/users', tokens[role])).status, 200);
      for (const role of ['psychologist', 'patient']) assert.equal((await request('/auth/users', tokens[role])).status, 403);
      for (const role of ['admin', 'support']) assert.equal((await request('/patients', tokens[role])).status, 403);
      assert.equal((await request('/patients', tokens.superadmin)).status, 200);
      assert.equal((await request('/auth/psychologists/auth_psychologist/review', tokens.support, 'PATCH',
        { approvalStatus: 'suspended' })).status, 403);
      await db.query("UPDATE users SET role='support' WHERE id='auth_admin'");
      assert.equal((await request('/auth/psychologists/auth_psychologist/review', tokens.admin, 'PATCH',
        { approvalStatus: 'suspended' })).status, 403);
      await db.query("UPDATE users SET role='admin' WHERE id='auth_admin'");
    });

    await t.test('invalid identity and tokens use 401 without granting endpoint access', async () => {
      for (const token of [null, 'broken', jwt.sign({ sub: 'missing' }, env.jwtSecret),
        jwt.sign({ sub: 'auth_admin' }, env.jwtSecret, { expiresIn: -1 }),
        jwt.sign({ sub: 'auth_admin' }, 'wrong-key'), jwt.sign({}, env.jwtSecret)]) {
        assert.equal((await request('/auth/me', token)).status, 401);
      }
      assert.equal((await request('/auth/login', null, 'POST', { email: 'admin@auth.invalid', password: 'wrong' })).status, 401);
    });

    await t.test('nonlocal mode blocks copied demo accounts and recovery previews without mutating data', async () => {
      await db.query(`INSERT INTO users(id,first_name,last_name,email,password_hash,role)
        VALUES ('u_admin_1','Demo','Admin','demo@auth.invalid',$1,'admin')`, [hash]);
      const demoToken = jwt.sign({ sub: 'u_admin_1' }, env.jwtSecret);
      env.localDevelopment = false;
      env.nodeEnv = 'production';
      assert.equal((await request('/auth/me', demoToken)).status, 403);
      assert.equal((await request('/auth/login', null, 'POST', { email: 'demo@auth.invalid', password })).status, 403);
      for (const email of ['admin@auth.invalid', 'missing@auth.invalid']) {
        const response = await request('/auth/password-reset/request', null, 'POST', { email });
        assert.equal(response.status, 503);
        assert.equal(response.body.data, undefined);
      }
      assert.equal((await request('/auth/password-reset/confirm', null, 'POST',
        { token: 'previously-exposed-token', password })).status, 503);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM password_reset_tokens')).rows[0].n, 0);
      assert.equal((await request('/auth/me', tokens.admin)).status, 200);
      Object.assign(env, savedEnv);
      const localReset = await request('/auth/password-reset/request', null, 'POST', { email: 'admin@auth.invalid' });
      assert.equal(localReset.status, 200);
      assert.ok(localReset.body.data.preview.resetToken);
    });
  } finally {
    Object.assign(env, savedEnv);
    if (server) await new Promise(resolve => server.close(resolve));
    db.query = originalQuery;
    db.getClient = originalGetClient;
    await pool.end();
    await db.close();
  }
});
