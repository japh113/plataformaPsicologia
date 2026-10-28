import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Execute the real App callback without loading JSX or introducing a test runtime.
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const start = app.indexOf('  const toggleObjective = async ');
const end = app.indexOf('  const removeObjective = async ', start);
assert.ok(start >= 0 && end > start);
const source = app.slice(start, end) + '\ntoggleObjective;';

function harness(isPsychologist, completed = false) {
  const calls = [], states = [];
  const patient = { id: 'p', objetivos: [{ id: 'o', completada: completed }], tareas: [{ id: 't', completada: false }] };
  const toggle = vm.runInNewContext(source, {
    isPsychologist, pacienteSeleccionado: patient, procesandoObjetivoId: null,
    setProcesandoObjetivoId: value => calls.push(['processing', value]),
    updatePatientObjective: async (patientId, objectiveId, payload) => {
      calls.push(['api', patientId, objectiveId, payload.completed]);
      return { id: objectiveId, completed: payload.completed };
    },
    mapBackendTaskToUiTask: value => ({ id: value.id, completada: value.completed }),
    syncPatientState: value => states.push(value),
    showErrorFeedback: () => assert.fail('Unexpected feedback'),
  });
  return { toggle, calls, states, patient };
}

test('patient callback invocation cannot send an objective PATCH or mutate local state', async () => {
  for (const completed of [false, true]) {
    const h = harness(false, completed);
    await h.toggle('o');
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.states, []);
    assert.equal(h.patient.objetivos[0].completada, completed);
  }
});

test('psychologist callback completes and unmarks objectives while preserving tasks', async () => {
  for (const completed of [false, true]) {
    const h = harness(true, completed);
    await h.toggle('o');
    assert.deepEqual(h.calls, [['processing', 'o'], ['api', 'p', 'o', !completed], ['processing', null]]);
    assert.equal(h.states[0].objetivos[0].completada, !completed);
    assert.equal(h.states[0].tareas, h.patient.tareas);
  }
});
