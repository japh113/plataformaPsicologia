import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { installReactDomHost } from './helpers/reactDomHost.js';
import { isActionableInvitation, useReceivedInvitations } from '../src/utils/receivedInvitations.js';

const document = installReactDomHost();
const { createRoot } = await import('react-dom/client');

test('only a pending invitation with server availability and a future expiration counts', () => {
  const expiry = '2030-01-01T00:00:00Z';
  const pending = { status: 'pending', acceptanceAvailable: true, expiresAt: expiry };
  const now = Date.parse('2029-12-31T23:59:59Z');
  assert.ok(isActionableInvitation(pending, now));
  assert.equal(isActionableInvitation(pending, Date.parse(expiry)), false);
  for (const status of ['accepted', 'declined', 'withdrawn', 'expired', 'invalidated']) {
    assert.equal(isActionableInvitation({ ...pending, status }, now), false);
  }
  for (const acceptanceAvailable of [false, null, undefined]) {
    assert.equal(isActionableInvitation({ ...pending, acceptanceAvailable }, now), false);
  }
});

test('shared inbox deduplicates reads, applies decisions immediately and fences a replaced or ended session', async () => {
  const calls = [];
  const request = (path, { signal }) => new Promise((resolve, reject) => calls.push({ path, signal, resolve, reject }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let current;
  function Fixture({ scope }) {
    current = useReceivedInvitations(scope, request);
    return React.createElement('output', null, current.actionable.map(item => item.id).join(','));
  }
  const render = scope => act(async () => root.render(React.createElement(Fixture, { scope })));
  const resolve = (index, items) => act(async () => calls[index].resolve({ data: items }));
  const respond = id => ({ id, status: 'pending', acceptanceAvailable: true, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const a = respond('patient-a-invitation-1');
  const b = respond('patient-a-invitation-2');
  try {
    await render('patient-a:session-1');
    assert.equal(calls[0].path, '/bilateral-invitations/received');
    await act(async () => window.dispatchEvent(new Event('focus')));
    assert.equal(calls.length, 1);
    await resolve(0, [a, b]);
    assert.equal(current.actionable.length, 2);

    await act(async () => current.afterAction(a.id, 'declined'));
    assert.equal(container.textContent, b.id);
    const olderRead = calls[1];
    await act(async () => current.afterAction(b.id, 'accepted'));
    assert.equal(olderRead.signal.aborted, true);
    assert.equal(container.textContent, '');
    await resolve(1, [a, b]);
    assert.equal(container.textContent, '');

    await render('patient-b:session-2');
    assert.equal(calls[2].signal.aborted, true);
    await resolve(2, [a]);
    assert.equal(container.textContent, '');
    await resolve(3, [respond('patient-b-invitation')]);
    assert.equal(container.textContent, 'patient-b-invitation');
    await act(async () => current.refresh());
    await act(async () => calls[4].reject(new Error('Consulta no disponible')));
    assert.equal(current.error, 'Consulta no disponible');
    assert.equal(container.textContent, '');

    await act(async () => current.refresh());
    await act(async () => current.clear());
    assert.equal(calls[5].signal.aborted, true);
    await render(null);
    await resolve(5, [a]);
    assert.equal(container.textContent, '');
    assert.equal(current.items, null);
  } finally {
    await act(async () => root.unmount());
    document.body.removeChild(container);
  }
});

test('manual refresh and a conflict supersede older reads within the same session', async () => {
  const calls = [];
  const request = (path, { signal }) => new Promise(resolve => calls.push({ signal, resolve }));
  const root = createRoot(document.createElement('div'));
  let current;
  function Fixture() {
    current = useReceivedInvitations('patient-a:session-1', request);
    return null;
  }
  const pending = { id: 'invitation', status: 'pending', acceptanceAvailable: true, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const withdrawn = { ...pending, status: 'withdrawn', acceptanceAvailable: false };
  const resolve = (index, item) => act(async () => calls[index].resolve({ data: [item] }));
  try {
    await act(async () => root.render(React.createElement(Fixture)));
    await act(async () => current.refresh());
    assert.equal(calls.length, 2);
    assert.ok(calls[0].signal.aborted);
    await resolve(1, withdrawn);
    await resolve(0, pending);
    assert.deepEqual(current.items, [withdrawn]);
    assert.equal(current.actionable.length, 0);

    await act(async () => current.refresh());
    await resolve(2, pending);
    assert.deepEqual(current.actionable, [pending]);
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => current.afterAction(pending.id));
    assert.equal(calls.length, 5);
    assert.ok(calls[3].signal.aborted);
    assert.equal(current.items[0].status, 'pending');
    assert.equal(current.actionable.length, 0);
    await resolve(4, withdrawn);
    await resolve(3, pending);
    assert.deepEqual(current.items, [withdrawn]);
    assert.equal(current.actionable.length, 0);
  } finally {
    await act(async () => root.unmount());
  }
});
