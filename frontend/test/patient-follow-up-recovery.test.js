import { harness } from './helpers/followUpAppHarness.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { mapBackendPatientToUiPatient } from '../src/mappers/patients.js';

const api = await readFile(new URL('../src/api/patients.js',import.meta.url),'utf8');
const client = await readFile(new URL('../src/api/client.js',import.meta.url),'utf8');
const follow = { consultations: [{ id: 'c',scheduledDate: '2026-04-08',scheduledTime: '11:00:00',tasks: [] }],unassignedTasks: [] };
const primary = { id: 'p',fullName: 'Fictional P',tasks: [{ id: 't',text: 'task',completed: false }] };
const empty = { consultations: [],unassignedTasks: [] };
const failure = status => Object.assign(new Error(status ? 'HTTP ' + status : 'Network failure'),status ? { status } : {});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise,resolve }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };


test('P2-01: real load keeps primary sections while follow-up is pending, network-failed or HTTP 500; retry only reads follow-up', async () => {
  for (const status of [undefined,500]) {
    const pending = deferred();
    const h = harness({ followRequest: () => pending.promise });
    await h.load();
    assert.equal(h.state.loading,false);
    assert.equal(h.state.patients[0].id,'p');
    assert.equal(h.state.appointments.length,1);
    assert.equal(h.state.reminders[0],'reminder');
    assert.equal(h.state.relationships[0],'relationship');
    assert.equal(h.state.patients[0].seguimientoEstado,'loading');
    pending.resolve(Promise.reject(failure(status)));
    await flush();
    assert.equal(h.state.error,'');
    assert.equal(h.state.patients[0].seguimientoEstado,'error');
    assert.equal(h.state.patients[0].seguimiento,null);
    const references = [h.state.appointments,h.state.reminders,h.state.relationships];
    h.context.getPatientFollowUp = async () => empty;
    assert.equal(await h.refresh('p'),true);
    assert.equal(h.state.mainReads,1);
    assert.equal(h.state.patients[0].seguimientoEstado,'ready');
    assert.equal(h.state.patients[0].seguimiento.consultas.length,0);
    assert.deepEqual([h.state.appointments,h.state.reminders,h.state.relationships],references);
    h.context.getPatientFollowUp = async () => ({ consultations: [{ ...follow.consultations[0], tasks: [
      { id: 't',text: 'updated task',completed: true }, { id: 'new',text: 'new task',completed: false },
    ] }],unassignedTasks: [] });
    await h.refresh('p');
    assert.equal(h.state.patients[0].tareas[0].completada,true);
    assert.equal(h.state.patients[0].tareas[1].id,'new');
    assert.equal(h.state.mainReads,1);
    assert.equal(h.state.patients[0].nombre,'Fictional P');
  }
});

test('P2-01: real detail refresh preserves primary file and last valid follow-up; recovery replaces only follow-up', async () => {
  const previous = mapBackendPatientToUiPatient({ ...primary,followUp: follow });
  const h = harness({ previous,followRequest: async () => { throw failure(500); } });
  assert.equal((await h.selected('p')).patient.nombre,'Fictional P');
  await flush();
  assert.equal(h.state.selected.seguimiento,previous.seguimiento);
  assert.equal(h.state.selected.seguimientoEstado,'error');
  h.context.getPatientFollowUp = async () => empty;
  await h.refresh('p');
  assert.equal(h.state.selected.seguimiento.consultas.length,0);
  assert.equal(h.state.selected.nombre,'Fictional P');
});

test('P2-01: 403/404 discard protected data rather than retain a stale projection', async () => {
  for (const status of [403,404]) {
    const h = harness({ previous: mapBackendPatientToUiPatient({ ...primary,followUp: follow }),
      followRequest: async () => { throw failure(status); } });
    h.state.appointments = ['protected'];h.state.reminders = ['protected'];h.state.relationships = ['protected'];
    await h.refresh('p');
    assert.equal(h.state.patients.length,0);assert.equal(h.state.selected,null);
    for (const key of ['appointments','reminders','relationships']) assert.equal(h.state[key].length,0);
    assert.match(h.state.error,/no tienes acceso/);
    assert.equal(h.state.success.length,0);
  }
});

test('P2-01: late follow-up responses cannot restore data after logout, session replacement, or a newer retry', async () => {
  for (const change of ['logout','replacement']) {
    const pending = deferred();
    const h = harness({ previous: mapBackendPatientToUiPatient({ ...primary,followUp: follow }),followRequest: () => pending.promise });
    const request = h.refresh('p');
    h.sessionEpoch.current++;
    h.state.token = change === 'logout' ? null : 'other-session';
    h.state.patients = [];h.state.selected = null;
    pending.resolve(follow);assert.equal(await request,false);
    assert.equal(h.state.patients.length,0);assert.equal(h.state.selected,null);
  }
  const pending = deferred();
  const h = harness({ previous: mapBackendPatientToUiPatient({ ...primary,followUp: follow }),followRequest: () => pending.promise });
  const earlier = h.refresh('p');h.context.getPatientFollowUp = async () => empty;
  await h.refresh('p');pending.resolve(follow);await earlier;
  assert.equal(h.state.patients[0].seguimiento.consultas.length,0);
});

test('P2-02: confirmed PUT updates file/form, closes real modal, returns true despite network/500 refresh failure, then recovers', async () => {
  for (const status of [undefined,500]) {
    const previous = mapBackendPatientToUiPatient({ ...primary,followUp: follow });
    const pending = deferred();
    const h = harness({ previous,followRequest: () => pending.promise });
    await h.handleSaveRequiredInterview();
    assert.equal(h.state.puts,1);
    assert.equal(h.state.modal,false);
    assert.equal(h.state.selected.entrevistaCompleta,true);
    assert.equal(h.state.form.lugarNacimiento,'Fictional place');
    assert.equal(h.state.selected.seguimiento,previous.seguimiento);
    assert.deepEqual(h.state.success,['Entrevista guardada correctamente.']);
    pending.resolve(Promise.reject(failure(status)));
    await flush();
    assert.equal(h.state.errors.length,0);
    assert.equal(h.state.selected.seguimientoEstado,'error');
    assert.equal(h.state.selected.seguimiento,previous.seguimiento);
    h.context.getPatientFollowUp = async () => empty;
    await h.refresh('p');
    assert.equal(h.state.selected.seguimientoEstado,'ready');
    assert.equal(h.state.selected.entrevistaCompleta,true);
    assert.equal(h.state.puts,1);
    const direct = harness({ previous,followRequest: async () => { throw failure(status); } });
    assert.equal(await direct.saveInterview('p',{}),true);
    await flush();assert.equal(direct.state.puts,1);
  }
});

test('P2-02: real PUT success + refresh success; real PUT failure keeps modal and returns false without false success', async () => {
  const good = harness({ previous: mapBackendPatientToUiPatient(primary) });
  assert.equal(await good.saveInterview('p',{}),true);await flush();
  assert.equal(good.state.selected.seguimientoEstado,'ready');
  assert.equal(good.state.selected.entrevistaCompleta,true);
  const bad = harness({ put: async () => { throw failure(500); } });
  assert.equal(await bad.saveInterview('p',{}),false);
  assert.equal(bad.state.success.length,0);assert.equal(bad.state.errors.length,1);
  assert.equal(bad.state.followReads,0);assert.equal(bad.state.modal,true);
});

test('P2-02: secondary 401 preserves confirmed persistence outcome, invalidates current session, and cannot restore protected state', async () => {
  const pending = deferred();
  const h = harness({ previous: mapBackendPatientToUiPatient({ ...primary,followUp: follow }),followRequest: () => pending.promise });
  assert.equal(await h.saveInterview('p',{}),true);
  h.state.token = null;h.sessionEpoch.current++;h.state.patients = [];h.state.selected = null;
  pending.resolve(Promise.reject(failure(401)));await flush();
  assert.equal(h.state.puts,1);assert.equal(h.state.selected,null);assert.equal(h.state.patients.length,0);
});

test('real API composition retains primary data on network/500, while 401/403/404 propagate', async () => {
  for (const status of [undefined,500,401,403,404]) {
    const scope = { apiRequest: async path => {
      if (path.endsWith('/follow-up')) throw failure(status);
      return { data: path === '/patients' ? [primary] : primary };
    } };
    const source = api.replace(/^import .*;\n/,'').replaceAll('export const ','const ');
    const real = vm.runInNewContext(source + '\n({ getPatients,getPatient });',scope);
    for (const read of [() => real.getPatients({ includeFollowUp: true }),() => real.getPatient('p',{ includeFollowUp: true })]) {
      if ([401,403,404].includes(status)) await assert.rejects(read(),{ status });
      else {
        const result = await read();const patient = Array.isArray(result) ? result[0] : result;
        assert.equal(patient.id,'p');assert.equal(patient.followUpUnavailable,true);
        assert.equal(Object.hasOwn(patient,'followUp'),false);
      }
    }
  }
});

test('real API client retains 401 token invalidation and session-ended event; 403/404 do not invent access', async () => {
  for (const status of [401,403,404]) {
    let token = 'jwt';const events = [];
    const scope = { Event: class { constructor(type) { this.type = type; } },
      window: { localStorage: { getItem: () => token,removeItem: () => { token = null; } },
        dispatchEvent: event => events.push(event.type) },
      fetch: async () => ({ ok: false,status,headers: { get: name => name === 'content-type' ? 'application/json' : null },
        json: async () => ({ message: 'Denied' }) }) };
    const source = client.replace('import.meta.env.VITE_API_URL',"'http://api.invalid/api'")
      .replaceAll('export const ','const ').replace('export { API_BASE_URL };','');
    const request = vm.runInNewContext(source + '\napiRequest;',scope);
    await assert.rejects(request('/patients/p/follow-up'),{ status });
    assert.equal(token,status === 401 ? null : 'jwt');
    assert.deepEqual(events,status === 401 ? ['psicopanel-session-ended'] : []);
  }
});
