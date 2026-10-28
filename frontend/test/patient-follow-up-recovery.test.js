import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { mapBackendPatientToUiPatient, mapBackendFollowUpToUiFollowUp, mapBackendTaskToUiTask } from '../src/mappers/patients.js';
import { preservePatientFollowUp } from '../src/utils/patientFollowUp.js';

const app = await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
const api = await readFile(new URL('../src/api/patients.js',import.meta.url),'utf8');
const client = await readFile(new URL('../src/api/client.js',import.meta.url),'utf8');
const follow = { consultations: [{ id: 'c',scheduledDate: '2026-04-08',scheduledTime: '11:00:00',tasks: [] }],unassignedTasks: [] };
const primary = { id: 'p',fullName: 'Fictional P',tasks: [{ id: 't',text: 'task',completed: false }] };
const empty = { consultations: [],unassignedTasks: [] };
const failure = status => Object.assign(new Error(status ? 'HTTP ' + status : 'Network failure'),status ? { status } : {});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise,resolve }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness({ previous = null, followRequest = async () => follow, put = async () => ({ ...primary,interviewCompleted: true,
  interview: { birthDate: '1990-01-01',birthPlace: 'Fictional place',completedAt: '2026-10-28T12:00:00Z' } }) } = {}) {
  const state = { patients: previous ? [previous] : [],selected: previous,appointments: [],reminders: [],relationships: [],
    error: '',loading: false,success: [],errors: [],modal: true,form: null,puts: 0,mainReads: 0,followReads: 0,token: 'session-p' };
  const assign = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  const sessionEpoch = { current: 0 };
  const context = {
    currentUser: { id: 'p',role: 'patient',patientId: 'p' },useCallback: fn => fn,
    getAuthToken: () => state.token,sessionEpoch,followUpRequests: { current: new Map() },
    getPatientFollowUp: async id => { state.followReads++; assert.equal(id,'p'); return followRequest(); },
    getPatients: async () => { state.mainReads++; return [primary]; },getPatient: async () => primary,
    getAppointments: async () => [{ id: 'a',patientId: 'p' }],getMyReminders: async () => ['reminder'],
    getCareRelationships: async () => ['relationship'],refreshBackofficeData: async () => {},
    mapBackendPatientToUiPatient,mapBackendFollowUpToUiFollowUp,mapBackendTaskToUiTask,preservePatientFollowUp,
    sortAppointments: value => value,mapBackendAppointmentToUiAppointment: value => value,
    setPacientes: assign('patients'),setPacienteSeleccionado: assign('selected'),setAppointments: assign('appointments'),
    setReminders: assign('reminders'),setCareRelationships: assign('relationships'),setErrorCarga: assign('error'),
    setCargandoDatos: assign('loading'),setAppointmentWaitlist: () => {},setAvailability: () => {},
    setAvailabilityDraft: () => {},setAvailabilityExceptions: () => {},
    guardandoEntrevista: false,setGuardandoEntrevista: assign('saving'),
    upsertPatientInterview: async (...args) => { state.puts++; return put(...args); },
    mapUiInterviewToBackendInterview: value => value,buildInterviewDraftForm: patient => patient.entrevista,
    setPatientInterviewForm: assign('form'),todayDate: '2026-10-28',
    showSuccessFeedback: message => state.success.push(message),showErrorFeedback: message => state.errors.push(message),
    patientProfile: { id: 'p' },patientInterviewForm: {},setShowPatientInterview: assign('modal'),
  };
  vm.createContext(context);
  function run(start,end,returned) {
    const a = app.indexOf(start),b = app.indexOf(end,a);
    assert.ok(a >= 0 && b > a,start);
    return vm.runInContext(app.slice(a,b) + '\n' + returned + ';',context);
  }
  const refresh = run('  const refreshPatientFollowUp = useCallback','  const cargarDatos = useCallback','refreshPatientFollowUp');
  context.refreshPatientFollowUp = refresh;
  const load = run('  const cargarDatos = useCallback','  useEffect(() => {','cargarDatos');
  const sync = run('  const syncPatientState =','  const syncAppointmentsState =','syncPatientState');
  context.syncPatientState = sync;
  const selected = run('  const refreshSelectedPatient =','  const refreshAppointmentsAndWaitlist =','refreshSelectedPatient');
  const save = run('  const saveInterview =','  const toggleTask =','({ saveInterview,handleSaveRequiredInterview })');
  return { state,context,refresh,load,selected,...save,sessionEpoch };
}

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
  assert.equal((await h.selected('p')).nombre,'Fictional P');
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
