import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicAuthLimiter, createPublicAuthLimiters, publicAuthClientKey, PUBLIC_AUTH_POLICIES } from '../src/modules/auth/public-auth-limiter.js';

function attempt(limiter, address = '192.0.2.1', extra = {}) {
  const result = { passed: false, headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name] = value; },
    status(status) { result.status = status; return this; },
    json(body) { result.body = body; return this; },
  };
  limiter({ socket: { remoteAddress: address }, ...extra }, res, () => { result.passed = true; });
  return result;
}

test('legitimate requests, exact boundary, rounded Retry-After and reset with a controlled clock', () => {
  let current = 0;
  const limiter = createPublicAuthLimiter({ limit: 2, windowMs: 2500, now: () => current });
  assert.equal(attempt(limiter).passed, true);
  assert.equal(attempt(limiter).passed, true);
  const blocked = attempt(limiter);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['Retry-After'], '3');
  assert.deepEqual(blocked.body, { success: false, message: 'Too many requests. Please try again later.', details: null });
  current = 1501;
  assert.equal(attempt(limiter).headers['Retry-After'], '1');
  current = 2500;
  assert.equal(attempt(limiter).passed, true);
  assert.equal(attempt(limiter).passed, true);
  assert.equal(attempt(limiter).status, 429);
});

test('uses independent peers; account/body/header changes cannot bypass or target a different peer', () => {
  const limiter = createPublicAuthLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
  assert.equal(attempt(limiter, '192.0.2.1', { body: { email: 'same@test.invalid' } }).passed, true);
  for (const headers of [{ 'x-forwarded-for': '192.0.2.2' }, { 'x-real-ip': '192.0.2.3' }, { forwarded: 'for=192.0.2.4' }]) {
    assert.equal(attempt(limiter, '192.0.2.1', { headers, ip: '192.0.2.5', body: { email: 'different@test.invalid' } }).status, 429);
  }
  assert.equal(attempt(limiter, '192.0.2.2', { body: { email: 'same@test.invalid' } }).passed, true);
});

test('canonical IPv4-mapped addresses and IPv6 /64 rotation share budgets', () => {
  const key = address => publicAuthClientKey({ socket: { remoteAddress: address } });
  assert.equal(key('::ffff:192.0.2.1'), key('192.0.2.1'));
  assert.equal(key('0:0:0:0:0:FFFF:c000:201'), key('192.0.2.1'));
  assert.equal(key('2001:db8:abcd:1234::1'), key('2001:0DB8:ABCD:1234:ffff:ffff:ffff:ffff'));
  assert.notEqual(key('2001:db8:abcd:1234::1'), key('2001:db8:abcd:1235::1'));
  assert.equal(key('fe80::1%eth0'), key('fe80::1%eth1'));
  const limiter = createPublicAuthLimiter({ limit: 1, windowMs: 1000 });
  assert.equal(attempt(limiter, '2001:db8:1:2::1').passed, true);
  assert.equal(attempt(limiter, '2001:db8:1:2::ffff').status, 429);
  assert.equal(attempt(limiter, '2001:db8:1:3::1').passed, true);
});

test('capacity is bounded without evicting live counters and recovers at window reset', () => {
  let current = 0;
  const limiter = createPublicAuthLimiter({ limit: 2, windowMs: 1000, maxClients: 2, now: () => current });
  assert.equal(attempt(limiter, '192.0.2.1').passed, true);
  assert.equal(attempt(limiter, '192.0.2.2').passed, true);
  const full = attempt(limiter, '192.0.2.3');
  assert.equal(full.status, 503);
  assert.equal(full.headers['Retry-After'], '1');
  assert.equal(attempt(limiter, '192.0.2.1').passed, true);
  assert.equal(attempt(limiter, '192.0.2.1').status, 429);
  current = 1000;
  assert.equal(attempt(limiter, '192.0.2.3').passed, true);
});

test('malformed/missing addresses and internal failures fail closed without sensitive output', () => {
  const limiter = createPublicAuthLimiter({ limit: 1, windowMs: 1000 });
  for (const address of [undefined, null, {}, '', 'bad-address', '192.0.2.1:1234', 'x'.repeat(1000)]) {
    const result = attempt(limiter, address, { socket: { remoteAddress: address }, body: { password: 'PRIVATE_PASSWORD', token: 'PRIVATE_TOKEN' } });
    assert.equal(result.status, 503);
    assert.equal(result.passed, false);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  }
  const broken = createPublicAuthLimiter({ limit: 1, windowMs: 1000, now: () => { throw new Error('PRIVATE_TOKEN'); } });
  assert.equal(attempt(broken).status, 503);
  assert.doesNotMatch(JSON.stringify(attempt(broken)), /PRIVATE_TOKEN/);
  let current = 10;
  const clock = createPublicAuthLimiter({ limit: 1, windowMs: 1000, now: () => current });
  assert.equal(attempt(clock).passed, true);
  current = 9;
  assert.equal(attempt(clock).status, 503);
  current = NaN;
  assert.equal(attempt(clock).status, 503);
});

test('invalid configuration fails on construction; downstream errors are not hidden', () => {
  for (const value of [0, -1, NaN, Infinity, 1.5]) {
    for (const field of ['limit', 'windowMs', 'maxClients']) {
      assert.throws(() => createPublicAuthLimiter({ limit: 2, windowMs: 1000, [field]: value }), TypeError);
    }
  }
  const limiter = createPublicAuthLimiter({ limit: 1, windowMs: 1000 });
  assert.throws(() => limiter({ socket: { remoteAddress: '192.0.2.1' } }, {}, () => { throw new Error('downstream'); }), /downstream/);
});

test('policy families are independent and every default budget is enforced', () => {
  const limits = createPublicAuthLimiters();
  for (const [name, policy] of Object.entries(PUBLIC_AUTH_POLICIES)) {
    for (let i = 0; i < policy.limit; i++) assert.equal(attempt(limits[name]).passed, true);
    assert.equal(attempt(limits[name]).status, 429, name);
  }
});
