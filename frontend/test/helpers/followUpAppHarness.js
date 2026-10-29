import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { mapBackendPatientToUiPatient, mapBackendFollowUpToUiFollowUp, mapBackendTaskToUiTask, mapUiPatientToBackendPatient } from '../../src/mappers/patients.js';
import { mapBackendWaitlistToUiWaitlistEntry } from '../../src/mappers/appointments.js';
import { preservePatientFollowUp } from '../../src/utils/patientFollowUp.js';

const app = await readFile(new URL('../../src/App.jsx',import.meta.url),'utf8');
const follow = { consultations: [{ id: 'c',scheduledDate: '2026-04-08',scheduledTime: '11:00:00',tasks: [] }],unassignedTasks: [] };
const primary = { id: 'p',fullName: 'Fictional P',tasks: [{ id: 't',text: 'task',completed: false }] };

export function harness({ previous = null, followRequest = async () => follow, put = async () => ({ ...primary,interviewCompleted: true,
  interview: { birthDate: '1990-01-01',birthPlace: 'Fictional place',completedAt: '2026-10-28T12:00:00Z' } }) } = {}) {
  const state = { patients: previous ? [previous] : [],selected: previous,appointments: [],reminders: [],relationships: [],
    error: '',loading: false,success: [],warnings: [],errors: [],modal: true,form: null,puts: 0,mainReads: 0,followReads: 0,token: 'session-p' };
  const assign = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  const sessionEpoch = { current: 0 };
  const context = {
    currentUser: { id: 'p',role: 'patient',patientId: 'p' },useCallback: fn => fn,
    getAuthToken: () => state.token,sessionEpoch,followUpRequests: { current: new Map() },
    clinicalAccess: { current: { generation: 0, denied: false } },patientRevisions: { current: new Map() },
    getPatientFollowUp: async id => { state.followReads++; assert.equal(id,context.currentUser.patientId); return followRequest(); },
    getPatients: async () => { state.mainReads++; return [primary]; },getPatient: async () => primary,
    updatePatientTask: async (patientId,taskId,payload) => ({ id: taskId,text: 'task',completed: payload.completed }),
    getAppointmentWaitlist: async () => [],getMyAvailability: async () => [],getMyAvailabilityExceptions: async () => [],
    getAppointments: async () => [{ id: 'a',patientId: 'p' }],getMyReminders: async () => ['reminder'],
    getCareRelationships: async () => ['relationship'],refreshBackofficeData: async () => {},
    mapBackendPatientToUiPatient,mapBackendFollowUpToUiFollowUp,mapBackendTaskToUiTask,mapUiPatientToBackendPatient,mapBackendWaitlistToUiWaitlistEntry,preservePatientFollowUp,
    sortAppointments: value => value,mapBackendAppointmentToUiAppointment: value => value,
    setPacientes: assign('patients'),setPacienteSeleccionado: assign('selected'),setAppointments: assign('appointments'),
    setReminders: assign('reminders'),setCareRelationships: assign('relationships'),setErrorCarga: assign('error'),
    setCargandoDatos: assign('loading'),setAppointmentWaitlist: () => {},setAvailability: () => {},
    setAvailabilityDraft: () => {},setAvailabilityExceptions: () => {},
    guardandoEntrevista: false,setGuardandoEntrevista: assign('saving'),
    upsertPatientInterview: async (...args) => { state.puts++; return put(...args); },
    mapUiInterviewToBackendInterview: value => value,buildInterviewDraftForm: patient => patient?.entrevista || {},
    setPatientInterviewForm: assign('form'),todayDate: '2026-10-28',
    showSuccessFeedback: message => state.success.push(message),showErrorFeedback: message => state.errors.push(message),showWarningFeedback: message => state.warnings.push(message),
    patientProfile: { id: 'p' },patientInterviewForm: {},setShowPatientInterview: assign('modal'),
  };
  for (const setter of new Set(app.match(/\bset[A-Z]\w+/g))) {
    if (!context[setter]) context[setter] = assign(setter.slice(3));
  }
  context.setProcesandoTareaId = assign('processingTask');
  context.setNotasTemp = assign('draft');
  context.setGuardandoPerfilPaciente = assign('savingProfile');
  vm.createContext(context);
  function run(start,end,returned) {
    const a = app.indexOf(start),b = app.indexOf(end,a);
    assert.ok(a >= 0 && b > a,start);
    return vm.runInContext(app.slice(a,b) + '\n' + returned + ';',context);
  }
  const guards = run('  const beginClinicalOperation =','  const refreshBackofficeData =',
    '({ beginClinicalOperation,advancePatientRevision,invalidateClinicalAccess,commitPatientRows })');
  Object.assign(context,guards);
  const reset = run('  const resetSessionState =','  const beginClinicalOperation =','resetSessionState');
  const refresh = run('  const refreshPatientFollowUp = useCallback','  const cargarDatos = useCallback','refreshPatientFollowUp');
  context.refreshPatientFollowUp = refresh;
  const load = run('  const cargarDatos = useCallback','  useEffect(() => {','cargarDatos');
  const sync = run('  const syncPatientState =','  const syncAppointmentsState =','syncPatientState');
  context.syncPatientState = sync;
  const selected = run('  const refreshSelectedPatient =','  const refreshAppointmentsAndWaitlist =','refreshSelectedPatient');
  context.refreshSelectedPatient = selected;
  const appointments = run('  const refreshAppointmentsAndWaitlist =','  const refreshReminders =','refreshAppointmentsAndWaitlist');
  const reminders = run('  const refreshReminders =','  const abrirNotas =','refreshReminders');
  context.refreshReminders = reminders;
  const capture = name => {
    const invocation = {
      ...context, pacientes: state.patients, pacienteSeleccionado: state.selected,
      isPsychologist: context.currentUser.role === 'psychologist',
      procesandoTareaId: state.processingTask, procesandoObjetivoId: null,
      creandoObjetivo: false, guardandoPerfilPaciente: false, guardandoNotas: false, guardandoSesion: false,
      notasTemp: state.draft || '',
    };
    const a = app.indexOf('  const ' + name + ' =');
    const end = /^ {2}(?:};|}, \[[^\n]*\]\);)/m.exec(app.slice(a));
    assert.ok(a >= 0 && end,name);
    const declarations = name === 'handleIdentityUpdated'
      ? app.slice(app.indexOf('  const isIdentitySessionCurrent ='), a) : '';
    return vm.runInNewContext(declarations + app.slice(a,a + end.index + end[0].length) + '\n' + name + ';',invocation);
  };
  const invoke = (name, ...args) => capture(name)(...args);
  const task = taskId => invoke('toggleTask',taskId);
  const save = run('  const saveInterview =','  const toggleTask =','({ saveInterview,handleSaveRequiredInterview })');
  return { state,context,refresh,load,selected,appointments,reminders,task,invoke,capture,reset,...guards,...save,sessionEpoch };
}
