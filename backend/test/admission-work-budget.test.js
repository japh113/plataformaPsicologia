import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

test('admission and consultation share account budgets, list capacity and a clinical work ceiling', { timeout: 20_000 }, async () => {
  Object.assign(process.env, {
    VERIFICATION_DELIVERY: 'simulated', ADMISSION_ENABLED: 'true', FIRST_CONSULTATION_ENABLED: 'true',
    ADMISSION_SECRET: 'independent-admission-work-budget-fixture',
    EPISODE_TEST_RUN_ID: randomUUID(),
    ADMISSION_DATABASE_URL: 'postgres://unused:unused@127.0.0.1/psicopanel_episode_limiter',
  });
  const { default: app } = await import('../src/app.js');
  const { default: db } = await import('../src/config/db.js');
  const { default: env } = await import('../src/config/env.js');
  const { closeAdmission } = await import('../src/modules/admission/admission.service.js');
  const originalQuery = db.query;
  const originalConnect = pg.Pool.prototype.connect;
  let connections = 0;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const arrivals = [];
  let hold = false;
  db.query = async (sql, [id] = []) => ({
    rows: sql.includes('current_database()')
      ? [{ name: 'psicopanel_episode_limiter', isolated: true }]
      : [{ id, role: 'patient', session_version: 0, is_active: true, patient_id: id }],
  });
  pg.Pool.prototype.connect = async () => {
    connections++;
    if (hold) {
      arrivals.shift()?.();
      await held;
    }
    throw new Error('Synthetic pool boundary');
  };

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/admissions';
  const id = randomUUID();
  async function request(account, path) {
    const token = jwt.sign({ sub: account, sv: 0 }, env.jwtSecret, { expiresIn: '1h', jwtid: randomUUID() });
    const response = await fetch(base + path, { headers: { Authorization: 'Bearer ' + token } });
    await response.arrayBuffer();
    return response;
  }
  async function rejected(account, path) {
    const before = connections;
    const response = await request(account, path);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('Retry-After')) >= 1);
    assert.equal(connections, before, '429 must occur before the clinical pool is touched');
  }
  const detailPaths = ['/' + id, '/consultations/' + id];
  const listPaths = ['', '/consultations', '/consultations/withdrawals'];
  const pending = [];
  try {
    for (let n = 0; n < 40; n++) assert.equal((await request('list-account', listPaths[n % 3])).status, 503);
    assert.equal(connections, 40, 'each permitted request reached the synthetic pool boundary');
    await rejected('list-account', '/consultations/withdrawals');
    assert.equal((await request('list-account', detailPaths[0])).status, 503, 'list exhaustion leaves detail budget');

    for (let n = 0; n < 180; n++) assert.equal((await request('detail-account', detailPaths[n % 2])).status, 503);
    await rejected('detail-account', detailPaths[0]);
    await rejected('detail-account', detailPaths[1]);

    hold = true;
    async function start(account, path) {
      const entered = new Promise(resolve => arrivals.push(resolve));
      pending.push(request(account, path));
      await entered;
    }
    await start('list-one', '');
    await start('list-two', '/consultations');
    await rejected('list-three', '/consultations/withdrawals');
    await start('detail-one', detailPaths[0]);
    await start('detail-two', detailPaths[1]);
    await rejected('detail-three', detailPaths[0]);
    await rejected('detail-four', detailPaths[1]);

    hold = false;
    release();
    assert.deepEqual((await Promise.all(pending)).map(response => response.status), [503, 503, 503, 503]);
    const before = connections;
    assert.equal((await request('detail-four', detailPaths[1])).status, 503);
    assert.equal(connections, before + 1, 'finished work releases capacity even when the operation fails');
  } finally {
    release();
    await Promise.allSettled(pending);
    await new Promise(resolve => server.close(resolve));
    await closeAdmission();
    db.query = originalQuery;
    pg.Pool.prototype.connect = originalConnect;
  }
});
