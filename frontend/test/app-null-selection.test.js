import test from 'node:test';
import assert from 'node:assert/strict';
import { mountedApp, patient } from './helpers/mountedApp.js';

test('mounted App: StrictMode concurrent list removes selected P without render error, stale data or logout', async () => {
  const h = await mountedApp();
  try {
    assert.deepEqual(h.version, { react: '19.2.4', reactDom: '19.2.4' });
    await h.concurrentLists();
    await h.settle(h.lists[0], [patient()]);
    await h.click('Abrir p');
    assert.equal(h.children.NotesScreen.patient.id, 'p');
    assert.equal(h.children.NotesScreen.notesTemp, 'PRIVATE_P');
    assert.equal(h.children.NotesScreen.prefilledAppointmentId, null);
    assert.match(h.text(), /PRIVATE_P/);
    await h.settle(h.lists[1], []);
    assert.deepEqual(h.errors, [], 'null selection must not throw during the real App render');
    assert.ok(h.text().trim(), 'no white screen');
    assert.doesNotMatch(h.text(), /PRIVATE_P|PRIVATE_NOTE_P/);
    assert.equal(h.logoutCalls, 0); assert.equal(h.token, 'fixture-session');
    assert.doesNotMatch(h.text(), /No pudimos sincronizar|Ya no tienes acceso/);
    await h.click('Volver al tablero'); assert.match(h.text(), /DashboardScreen/);
    await h.click('Pacientes'); assert.match(h.text(), /PatientsScreen/);
  } finally { await h.close(); }
});

test('mounted App: pending P stays guarded; disappearing P and opening Q never transfers its sync state', async () => {
  const h = await mountedApp();
  try {
    await h.concurrentLists(); await h.settle(h.lists[0], [patient()]);
    await h.click('Abrir p');
    h.api.getPatient = async () => { throw Object.assign(new Error('Fictional detail unavailable'), { status: 500 }); };
    await h.click('Guardar nota fixture');
    assert.equal(h.children.NotesScreen.clinicalRecordSync.patientId, 'p');
    assert.equal(h.children.NotesScreen.clinicalRecordSync.pending, true);
    assert.equal(h.writes, 1);
    await h.click('Guardar nota fixture'); assert.equal(h.writes, 1, 'definitive guard remains active');
    await h.settle(h.lists[1], [patient('q')]);
    assert.deepEqual(h.errors, []); assert.doesNotMatch(h.text(), /PRIVATE_P/);
    await h.click('Volver al tablero'); await h.click('Abrir q');
    assert.equal(h.children.NotesScreen.patient.id, 'q');
    assert.equal(h.children.NotesScreen.notesTemp, 'PRIVATE_Q');
    assert.equal(h.children.NotesScreen.prefilledAppointmentId, null);
    assert.equal(h.children.NotesScreen.clinicalRecordSync, null);
    assert.doesNotMatch(h.text(), /Pendiente p|PRIVATE_P/);
    h.api.getPatient = async id => patient(id);
    await h.click('Guardar nota fixture'); assert.equal(h.writes, 2);
    assert.equal(h.children.NotesScreen.clinicalRecordSync.patientId, 'q');
    assert.equal(h.children.NotesScreen.clinicalRecordSync.pending, false);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('mounted App: initially empty concurrent patient lists remain safe and navigable', async () => {
  const h = await mountedApp();
  try {
    await h.concurrentLists(); await h.settle(h.lists[0], []); await h.settle(h.lists[1], []);
    assert.deepEqual(h.errors, []); assert.equal(h.logoutCalls, 0);
    assert.match(h.text(), /DashboardScreen/);
    await h.click('Pacientes'); assert.match(h.text(), /PatientsScreen/);
    await h.click('Tablero'); assert.match(h.text(), /DashboardScreen/);
    assert.doesNotMatch(h.text(), /PRIVATE_/);
  } finally { await h.close(); }
});

test('mounted App: concurrent list retaining P preserves the working selected record and its normal props', async () => {
  const h = await mountedApp();
  try {
    await h.concurrentLists(); await h.settle(h.lists[0], [patient()]);
    await h.click('Abrir p');
    await h.settle(h.lists[1], [{ ...patient(), notes: 'OBSOLETE_LIST_MUST_NOT_WIN' }]);
    assert.equal(h.children.NotesScreen.patient.id, 'p');
    assert.equal(h.children.NotesScreen.patient.notas, 'PRIVATE_P');
    assert.equal(h.children.NotesScreen.clinicalRecordSync, null);
    assert.match(h.text(), /Expediente p/); assert.equal(h.button('Volver al tablero'), undefined);
    await h.click('Guardar nota fixture');
    assert.equal(h.writes, 1); assert.equal(h.children.NotesScreen.clinicalRecordSync.pending, false);
    assert.deepEqual(h.errors, []); assert.equal(h.logoutCalls, 0);
  } finally { await h.close(); }
});

test('mounted App: explicit 403/404 still clear protected data and retain the authorized recheck behavior', async () => {
  for (const status of [403, 404]) {
    const h = await mountedApp();
    try {
      await h.concurrentLists(); await h.settle(h.lists[0], [patient()]); await h.click('Abrir p');
      await h.settle(h.lists[1], Object.assign(new Error('Fictional denial'), { status }), true);
      assert.deepEqual(h.errors, []); assert.doesNotMatch(h.text(), /PRIVATE_P/);
      assert.match(h.text(), /Ya no tienes acceso a este expediente/);
      assert.equal(h.button('Volver al tablero'), undefined, 'explicit denial uses the existing error view');
      assert.equal(h.logoutCalls, 0); assert.equal(h.token, 'fixture-session');
      await h.click('Reintentar'); assert.equal(h.lists.length, 3);
      await h.settle(h.lists[2], [patient('q')]); await h.click('Abrir q');
      assert.equal(h.children.NotesScreen.patient.id, 'q');
      assert.equal(h.children.NotesScreen.clinicalRecordSync, null); assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  }
});

test('mounted App: logout and a later session ignore an old list and never restore its selected clinical record', async () => {
  for (const actor of [{ id: 'b', role: 'psychologist' }, { id: 'p', role: 'patient', patientId: 'p' }]) {
    const h = await mountedApp();
    try {
      await h.concurrentLists(); await h.settle(h.lists[0], [patient()]); await h.click('Abrir p');
      await h.click('Cerrar sesión'); assert.match(h.text(), /Iniciar fixture/); assert.doesNotMatch(h.text(), /PRIVATE_P/);
      h.actor = actor;
      h.api.getPatientFollowUp = async () => ({ consultations: [], unassignedTasks: [] });
      await h.click('Iniciar fixture'); assert.equal(h.lists.length, 3);
      const current = actor.role === 'patient' ? { id: 'p', fullName: 'Current patient', tasks: [], clinicalNotes: [] } : patient('q');
      await h.settle(h.lists[2], [current]);
      await h.settle(h.lists[1], [patient()]);
      assert.match(h.text(), /DashboardScreen/); assert.doesNotMatch(h.text(), /Expediente p|PRIVATE_P/);
      assert.equal(h.logoutCalls, 1); assert.equal(h.children.Sidebar.currentUser.id, actor.id);
      await h.click('Abrir ' + current.id);
      assert.equal(h.children.NotesScreen.patient.id, current.id);
      assert.equal(h.children.NotesScreen.clinicalRecordSync, null);
      assert.doesNotMatch(h.text(), /PRIVATE_P/); assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  }
});
