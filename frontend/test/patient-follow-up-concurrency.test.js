import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { harness } from './helpers/followUpAppHarness.js';
import { mapBackendPatientToUiPatient } from '../src/mappers/patients.js';

const deferred = () => { let resolve,reject; const promise = new Promise((a,b) => { resolve=a;reject=b; }); return { promise,resolve,reject }; };
const error = status => Object.assign(new Error('Fictional failure'),{ status });
const task = (id = 't',completed = false) => ({ id,text: 'Fictional task ' + id,completed });
const projection = (tasks = [task()]) => ({ consultations: [{
  id: 'c',scheduledDate: '2026-04-08',scheduledTime: '11:00:00',tasks,
}],unassignedTasks: [] });
const raw = { id: 'p',fullName: 'Fictional P',tasks: [task()] };
const patient = () => mapBackendPatientToUiPatient({ ...raw,followUp: projection() });
const start = () => harness({ previous: patient() });
const tick = () => nextTurn(); // Drain settled promise continuations; no elapsed-time threshold.
function assertCleared(h) {
  for (const key of ['patients','appointments','reminders','relationships']) assert.equal(h.state[key].length,0,key);
  assert.equal(h.state.selected,null);
  assert.equal(h.context.clinicalAccess.current.denied,true);
}
function assertSynced(h) {
  assert.deepEqual(h.state.patients[0],h.state.selected);
}

test('P2-A1: retained GET before PATCH 200 cannot revert completion or apply its stale association', async () => {
  const h=start(),read=deferred();
  h.context.getPatientFollowUp=()=>read.promise;
  const pending=h.refresh('p');
  await h.task('t');
  assert.equal(h.state.selected.tareas[0].completada,true);
  read.resolve(projection());await pending;
  assert.equal(h.state.selected.tareas[0].completada,true);
  assert.equal(h.state.selected.seguimiento.consultas[0].id,'c');
  assertSynced(h);
});

test('P2-A2: retained PATCH merges only its task into GET with a new task and ready state', async () => {
  const h=start(),write=deferred();
  h.context.updatePatientTask=()=>write.promise;
  const pending=h.task('t');
  h.context.getPatientFollowUp=async()=>projection([task(),task('new')]);
  await h.refresh('p');
  const association=h.state.selected.seguimiento;
  write.resolve(task('t',true));await pending;
  assert.deepEqual(Array.from(h.state.selected.tareas,t=>t.id),['t','new']);
  assert.equal(h.state.selected.tareas[0].completada,true);
  assert.equal(h.state.selected.seguimiento,association);
  assert.equal(h.state.selected.seguimientoEstado,'ready');
  assertSynced(h);
});

test('P2-A: GET started during PATCH but delivered after confirmation is discarded; two GET respect order', async () => {
  const h=start(),write=deferred(),read=deferred();
  h.context.updatePatientTask=()=>write.promise;
  const patch=h.task('t');
  h.context.getPatientFollowUp=()=>read.promise;
  const get=h.refresh('p');
  write.resolve(task('t',true));await patch;
  read.resolve(projection());await get;
  assert.equal(h.state.selected.tareas[0].completada,true);
  const first=deferred();
  h.context.getPatientFollowUp=()=>first.promise;
  const older=h.refresh('p');
  h.context.getPatientFollowUp=async()=>projection([task('t',true),task('new')]);
  await h.refresh('p');
  first.resolve(projection());await older;
  assert.deepEqual(Array.from(h.state.selected.tareas,t=>t.id),['t','new']);
  assert.equal(h.state.selected.seguimientoEstado,'ready');
  assertSynced(h);
});

test('P2-A: failed PATCH after GET adds a task retains all read data, no false confirmation', async () => {
  const h=start(),write=deferred();
  h.context.updatePatientTask=()=>write.promise;
  const pending=h.task('t');
  h.context.getPatientFollowUp=async()=>projection([task(),task('new')]);
  await h.refresh('p');
  write.reject(error(500));await pending;
  assert.deepEqual(Array.from(h.state.selected.tareas,t=>t.id),['t','new']);
  assert.equal(h.state.selected.tareas[0].completada,false);
  assert.equal(h.state.selected.seguimientoEstado,'ready');
  assert.equal(h.state.success.length,0);assert.equal(h.state.errors.length,1);
  assertSynced(h);
});

test('P2-A: old detail and main DTOs cannot remove newer tasks or revert confirmed PATCH', async () => {
  for (const kind of ['detail','main']) {
    const h=start(),read=deferred();
    h.context[kind==='detail'?'getPatient':'getPatients']=()=>read.promise;
    const pending=kind==='detail'?h.selected('p'):h.load();
    h.context.getPatientFollowUp=async()=>projection([task(),task('new')]);
    await h.refresh('p');await h.task('t');
    // The next automatic follow-up is a fresh permitted read, held separately.
    const following=deferred();h.context.getPatientFollowUp=()=>following.promise;
    read.resolve(kind==='detail'?raw:[raw]);await pending;
    assert.deepEqual(Array.from(h.state.patients[0].tareas,t=>t.id),['t','new']);
    assert.equal(h.state.patients[0].tareas[0].completada,true);
    following.resolve(projection([task('t',true),task('new')]));await tick();
  }
});

test('P2-B: pending main load cannot repopulate after 403/404, including its finally and a later 500', async () => {
  for (const status of [403,404]) {
    const h=start(),main=deferred(),late=deferred();
    h.context.getPatients=()=>main.promise;
    const loading=h.load();
    h.context.getPatientFollowUp=()=>late.promise;
    const old=h.refresh('p');
    h.context.getPatientFollowUp=async()=>{throw error(status);};
    await h.refresh('p');
    const denied=h.state.error;
    assertCleared(h);
    main.resolve([raw]);await loading;
    late.reject(error(500));await old;
    assertCleared(h);assert.equal(h.state.error,denied);assert.equal(h.state.loading,false);
    assert.equal(h.state.token,'session-p','403/404 must not log out globally');
  }
});

test('P2-B: retained detail, agenda, reminders and write cannot restore revoked state', async () => {
  for (const status of [403,404]) {
    for (const kind of ['detail','agenda','reminders','write']) {
      const h=start(),held=deferred();
      let pending,payload;
      if (kind==='detail') {h.context.getPatient=()=>held.promise;pending=h.selected('p');payload=raw;}
      if (kind==='agenda') {h.context.getAppointments=()=>held.promise;pending=h.appointments();payload=[{ id:'a',patientId:'p' }];}
      if (kind==='reminders') {h.context.getMyReminders=()=>held.promise;pending=h.reminders();payload=['protected reminder'];}
      if (kind==='write') {h.context.updatePatientTask=()=>held.promise;pending=h.task('t');payload=task('t',true);}
      h.context.getPatientFollowUp=async()=>{throw error(status);};
      await h.refresh('p');held.resolve(payload);await pending;
      assertCleared(h);assert.equal(h.state.success.length,0);
    }
  }
});

test('P2-B: denial persists until explicit successful access recheck; primary 200 + follow-up 500 stays denied', async () => {
  const h=start();
  h.context.getPatientFollowUp=async()=>{throw error(403);};await h.refresh('p');
  let requests=0;
  h.context.getPatients=async()=>{requests++;return [raw];};
  h.context.getPatientFollowUp=async()=>projection();
  await h.load();await h.refresh('p');assert.equal(requests,0);assertCleared(h);
  h.context.getPatientFollowUp=async()=>{throw error(500);};
  await h.load({ recheckAccess:true });assertCleared(h);
  h.context.getPatientFollowUp=async()=>projection([task(),task('new')]);
  await h.load({ recheckAccess:true });
  assert.equal(h.context.clinicalAccess.current.denied,false);
  assert.equal(h.state.patients.length,1);
  assert.deepEqual(Array.from(h.state.patients[0].tareas,t=>t.id),['t','new']);
  assert.equal(h.state.patients[0].seguimientoEstado,'ready');
});

test('P2-B: stale finally cannot stop an explicit new access probe', async () => {
  const h=start(),older=deferred(),probe=deferred();
  h.context.getPatients=()=>older.promise;const first=h.load();
  h.context.getPatientFollowUp=async()=>{throw error(404);};await h.refresh('p');
  h.context.getPatients=()=>probe.promise;const recheck=h.load({ recheckAccess:true });
  assert.equal(h.state.loading,true);
  older.resolve([raw]);await first;
  assert.equal(h.state.loading,true);
  probe.reject(error(500));await recheck;assertCleared(h);
});

test('P2-A/B: GET/PATCH from a previous session have no effects, even same patient and identical token', async () => {
  for (const kind of ['get','patch']) {
    for (const samePatient of [false,true]) {
      const h=start(),held=deferred();
      if (kind==='get') h.context.getPatientFollowUp=()=>held.promise;
      else h.context.updatePatientTask=()=>held.promise;
      const pending=kind==='get'?h.refresh('p'):h.task('t');
      h.reset();
      const id=samePatient?'p':'q';
      h.context.currentUser={id,role:'patient',patientId:id};
      h.state.token='session-p'; // Same token string still cannot bypass the generation.
      const next=mapBackendPatientToUiPatient({ ...raw,id,fullName:'New session',followUp:projection() });
      h.state.patients=[next];h.state.selected=next;h.state.processingTask='new-write';
      held.resolve(kind==='get'?projection([task('stale')]):task('t',true));await pending;
      assert.equal(h.state.selected,next);
      assert.equal(h.state.processingTask,'new-write');
      assert.equal(h.state.errors.length,0);assert.equal(h.state.success.length,0);
    }
  }
});

test('P2-C: confirmed interview P cannot close Q modal or touch Q form/feedback/saving, including same patient in new session', async () => {
  for (const samePatient of [false,true]) {
    const h=start(),put=deferred();
    h.context.upsertPatientInterview=()=>{h.state.puts++;return put.promise;};
    const pending=h.handleSaveRequiredInterview();
    h.reset();
    const id=samePatient?'p':'q';
    h.context.currentUser={id,role:'patient',patientId:id};
    h.state.token='session-p';
    const next=mapBackendPatientToUiPatient({ ...raw,id,fullName:'Q current session' });
    h.state.patients=[next];h.state.selected=next;h.state.form={ value:'Q answer' };
    h.state.modal=true;h.state.saving=true;h.state.success=[];h.state.errors=[];
    put.resolve({ ...raw,interviewCompleted:true });await pending;
    assert.equal(h.state.modal,true);assert.equal(h.state.saving,true);
    assert.equal(h.state.form.value,'Q answer');assert.equal(h.state.selected,next);
    assert.equal(h.state.puts,1);assert.equal(h.state.success.length,0);assert.equal(h.state.errors.length,0);
  }
});

test('P2-C: current confirmed interview closes only its modal despite optional 500; rejected PUT leaves it open', async () => {
  const h=start();
  h.context.getPatientFollowUp=async()=>{throw error(500);};
  await h.handleSaveRequiredInterview();await tick();
  assert.equal(h.state.modal,false);assert.equal(h.state.puts,1);
  assert.equal(h.state.selected.entrevistaCompleta,true);assert.equal(h.state.success.length,1);
  assert.equal(h.state.selected.seguimientoEstado,'error');
  const bad=start();bad.context.upsertPatientInterview=async()=>{throw error(500);};
  await bad.handleSaveRequiredInterview();
  assert.equal(bad.state.modal,true);assert.equal(bad.state.success.length,0);assert.equal(bad.state.errors.length,1);
});

test('P2-B: a definitive denial from an older GET still invalidates a newer pending GET', async () => {
  const h=start(),first=deferred(),second=deferred();
  h.context.getPatientFollowUp=()=>first.promise;const old=h.refresh('p');
  h.context.getPatientFollowUp=()=>second.promise;const newer=h.refresh('p');
  first.reject(error(403));await old;assertCleared(h);
  second.reject(error(500));await newer;assertCleared(h);
});
