import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { mapBackendPatientToUiPatient, mapBackendFollowUpToUiFollowUp, mapBackendTaskToUiTask } from '../../src/mappers/patients.js';
import { preservePatientActivity } from '../../src/utils/patientFollowUp.js';

const app = await readFile(new URL('../../src/App.jsx',import.meta.url),'utf8');
const follow = { consultations: [{ id: 'c',scheduledDate: '2026-04-08',scheduledTime: '11:00:00',tasks: [] }],unassignedTasks: [] };
const primary = { id: 'p',fullName: 'Fictional P',tasks: [{ id: 't',text: 'task',completed: false }] };

export function harness({ previous = null, followRequest = async () => follow, put = async () => ({ ...primary,interviewCompleted: true,
  interview: { birthDate: '1990-01-01',birthPlace: 'Fictional place',completedAt: '2026-10-28T12:00:00Z' } }) } = {}) {
  const state = { patients: previous ? [previous] : [],selected: previous,appointments: [],reminders: [],relationships: [],
    error: '',loading: false,success: [],errors: [],modal: true,form: null,puts: 0,mainReads: 0,followReads: 0,token: 'session-p' };
  const assign = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  const sessionEpoch = { current: 0 };
  const context = {
    currentUser: { id: 'p',role: 'patient',patientId: 'p' },useCallback: fn => fn,
    getAuthToken: () => state.token,sessionEpoch,followUpRequests: { current: new Map() },
    clinicalAccess: { current: { generation: 0, denied: false } },patientRevisions: { current: new Map() },
    getPatientFollowUp: async id => { state.followReads++; assert.equal(id,context.currentUser.patientId); return followRequest(); },
    getPatients: async () => { state.mainReads++; return [primary]; },getPatient: async () => primary,
    updatePatientTask: async (patientId,taskId,payload) => ({ id: taskId,text: 'task',completed: payload.completed }),
    getAppointments: async () => [{ id: 'a',patientId: 'p' }],getMyReminders: async () => ['reminder'],
    getCareRelationships: async () => ['relationship'],refreshBackofficeData: async () => {},
    mapBackendPatientToUiPatient,mapBackendFollowUpToUiFollowUp,mapBackendTaskToUiTask,preservePatientActivity,
    sortAppointments: value => value,mapBackendAppointmentToUiAppointment: value => value,
    setPacientes: assign('patients'),setPacienteSeleccionado: assign('selected'),setAppointments: assign('appointments'),
    setReminders: assign('reminders'),setCareRelationships: assign('relationships'),setErrorCarga: assign('error'),
    setCargandoDatos: assign('loading'),setAppointmentWaitlist: () => {},setAvailability: () => {},
    setAvailabilityDraft: () => {},setAvailabilityExceptions: () => {},
    guardandoEntrevista: false,setGuardandoEntrevista: assign('saving'),
    upsertPatientInterview: async (...args) => { state.puts++; return put(...args); },
    mapUiInterviewToBackendInterview: value => value,buildInterviewDraftForm: patient => patient?.entrevista || {},
    setPatientInterviewForm: assign('form'),todayDate: '2026-10-28',
    showSuccessFeedback: message => state.success.push(message),showErrorFeedback: message => state.errors.push(message),
    patientProfile: { id: 'p' },patientInterviewForm: {},setShowPatientInterview: assign('modal'),
  };
  for (const setter of new Set(app.match(/\bset[A-Z]\w+/g))) {
    if (!context[setter]) context[setter] = assign(setter.slice(3));
  }
  context.setProcesandoTareaId = assign('processingTask');
  vm.createContext(context);
  function run(start,end,returned) {
    const a = app.indexOf(start),b = app.indexOf(end,a);
    assert.ok(a >= 0 && b > a,start);
    return vm.runInContext(app.slice(a,b) + '\n' + returned + ';',context);
  }
  const guards = run('  const beginClinicalOperation =','  const refreshBackofficeData =',
    '({ beginClinicalOperation,advancePatientRevision,invalidateClinicalAccess })');
  Object.assign(context,guards);
  const reset = run('  const resetSessionState =','  const beginClinicalOperation =','resetSessionState');
  const refresh = run('  const refreshPatientFollowUp = useCallback','  const cargarDatos = useCallback','refreshPatientFollowUp');
  context.refreshPatientFollowUp = refresh;
  const load = run('  const cargarDatos = useCallback','  useEffect(() => {','cargarDatos');
  const sync = run('  const syncPatientState =','  const syncAppointmentsState =','syncPatientState');
  context.syncPatientState = sync;
  const selected = run('  const refreshSelectedPatient =','  const refreshAppointmentsAndWaitlist =','refreshSelectedPatient');
  const appointments = run('  const refreshAppointmentsAndWaitlist =','  const refreshReminders =','refreshAppointmentsAndWaitlist');
  const reminders = run('  const refreshReminders =','  const abrirNotas =','refreshReminders');
  context.refreshReminders = reminders;
  const task = taskId => {
    // A new render captures a selected patient; retain that snapshot across await.
    const invocation = { ...context,pacienteSeleccionado: state.selected,procesandoTareaId: state.processingTask };
    const a = app.indexOf('  const toggleTask ='),b = app.indexOf('  const removeTask =',a);
    return vm.runInNewContext(app.slice(a,b) + '\ntoggleTask;',invocation)(taskId);
  };
  const save = run('  const saveInterview =','  const toggleTask =','({ saveInterview,handleSaveRequiredInterview })');
  return { state,context,refresh,load,selected,appointments,reminders,task,reset,...guards,...save,sessionEpoch };
}
