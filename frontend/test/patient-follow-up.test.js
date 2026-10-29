import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapBackendPatientToUiPatient } from '../src/mappers/patients.js';
import { getPatientFollowUpGroups, formatFollowUpDate } from '../src/utils/patientFollowUp.js';

test('patient groups use verified consultation IDs, preserve dates and track current task completion', () => {
  const patient = mapBackendPatientToUiPatient({ id: 'p', clinicalNotes: [], tasks: [
    { id: 1, text: 'linked', completed: false, clinicalNoteId: 20, clinicalNoteDate: '2000-01-01' },
    { id: 2, text: 'historical', completed: true, clinicalNoteId: 99, clinicalNoteDate: '2026-04-08' },
  ], followUp: { consultations: [
    { id: 10, scheduledDate: '2026-04-08', scheduledTime: '15:00:00', tasks: [] },
    { id: 11, scheduledDate: '2026-04-08', scheduledTime: '09:00:00', tasks: [{ id: 1 }] },
    { id: 12, scheduledDate: '2026-04-05', scheduledTime: null, tasks: [] },
  ], unassignedTasks: [{ id: 2 }] } });
  let groups = getPatientFollowUpGroups(patient);
  assert.deepEqual(groups.consultations.map(c => [c.id,c.fecha,c.tasks.map(t => t.id)]),
    [['10','2026-04-08',[]],['11','2026-04-08',['1']],['12','2026-04-05',[]]]);
  assert.deepEqual(groups.unassignedTasks.map(t => t.id), ['2']);
  patient.tareas = patient.tareas.map(t => t.id === '1' ? { ...t, completada: true } : t);
  groups = getPatientFollowUpGroups(patient);
  assert.equal(groups.consultations[1].tasks[0].completada, true);
  assert.deepEqual(getPatientFollowUpGroups(null), { consultations: [], unassignedTasks: [] });
});

test('civil date formatting never shifts the day across time zones', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['America/Chihuahua','America/Los_Angeles','Pacific/Kiritimati','UTC']) {
      process.env.TZ = zone;
      assert.equal(formatFollowUpDate('2026-04-01'), '1 de abril de 2026');
      assert.equal(formatFollowUpDate('2026-04-08'), '8 de abril de 2026');
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test('real task callback preserves follow-up associations while updating shared completion state', async () => {
  const { readFile } = await import('node:fs/promises');
  const vm = await import('node:vm');
  const app = await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
  const start = app.indexOf('  const toggleTask = async ');
  const end = app.indexOf('  const removeTask = async ',start);
  assert.ok(start >= 0 && end > start);
  for (const completed of [false,true]) {
    const patient = mapBackendPatientToUiPatient({ id: 'p',tasks: [{ id: 't',text: 'task',completed }],
      followUp: { consultations: [{ id: 'c',scheduledDate: '2026-04-01',tasks: [{ id: 't' }] }],unassignedTasks: [] } });
    let next;
    const toggle = vm.runInNewContext(app.slice(start,end) + '\ntoggleTask;', {
      beginClinicalOperation: () => () => true,advancePatientRevision: () => {},
      pacienteSeleccionado: patient,procesandoTareaId: null,setProcesandoTareaId: () => {},
      updatePatientTask: async (patientId,taskId,payload) => {
        assert.equal(patientId,'p'); assert.equal(taskId,'t');
        return { id: taskId,text: 'task',completed: payload.completed };
      },
      mapBackendTaskToUiTask: task => ({ id: task.id,texto: task.text,completada: task.completed }),
      syncPatientState: (id, transform) => { next = transform(patient); },refreshReminders: async () => {},
      showErrorFeedback: () => assert.fail('Unexpected error'),
    });
    await toggle('t');
    assert.equal(next.seguimiento,patient.seguimiento);
    assert.equal(getPatientFollowUpGroups(next).consultations[0].tasks[0].completada,!completed);
  }
});
