import test from 'node:test';
import assert from 'node:assert/strict';
import { getFirstCalendarAppointments, mapBackendAppointmentToUiAppointment } from '../src/mappers/appointments.js';
import { getDayAvailability, getOpenHourOptions } from '../src/screens/appointmentsScreen.helpers.js';

test('Agenda and first booking use complete hours, exact date exceptions and occupied slots', () => {
  const date = '2026-11-26';
  const weekly = new Map([[4, [{ startTime: '08:00', endTime: '10:00' }, { startTime: '13:00', endTime: '15:00' }]]]);
  const occupied = new Set(['09:00']);
  const values = day => getOpenHourOptions(day, occupied).map(option => option.value);
  assert.deepEqual(values(getDayAvailability(date, weekly, new Map())), ['08:00', '13:00', '14:00']);
  const exceptions = new Map([[date, { isUnavailable: false, blocks: [{ startTime: '09:00', endTime: '11:00' }] }]]);
  assert.deepEqual(values(getDayAvailability(date, weekly, exceptions)), ['10:00']);
  exceptions.set(date, { isUnavailable: true, blocks: [] });
  assert.deepEqual(values(getDayAvailability(date, weekly, exceptions)), []);
});

test('calendar composes episode slots with identity by source and exact assignment, never by display name', () => {
  const slot = { date: '2026-11-26', time: '09:00', status: 'completed' };
  const assigned = [
    { id: 'same', episodeId: 'another', version: 1, agreementId: 'wrong' },
    { id: 'same', episodeId: 'e1', version: 1, agreementId: 'g1' },
  ];
  const read = { id: 'same', episodeId: 'e1', admissionVersion: 1, professionalName: 'Mismo nombre', appointmentSlot: slot, note: 'Privada' };
  const first = getFirstCalendarAppointments([read], assigned)[0];
  const legacy = mapBackendAppointmentToUiAppointment({ id: read.id, patientId: 'p1', scheduledDate: slot.date, scheduledTime: slot.time, status: slot.status });
  assert.notEqual(first.id, legacy.id);
  assert.equal(first.source, 'episode');
  assert.equal(first.agreementId, 'g1');
  assert.equal(first.hora24, legacy.hora24);
  assert.equal(first.estado, legacy.estado);
  assert.equal(first.statusLabel, 'Completada');
  assert.doesNotMatch(JSON.stringify(first), /Privada/);
  assert.equal(getFirstCalendarAppointments([read], assigned.slice(0, 1))[0].agreementId, undefined);
  assert.deepEqual(getFirstCalendarAppointments(null, assigned), []);
  assert.deepEqual(getFirstCalendarAppointments([{ ...read, appointmentSlot: { ...slot, time: '09:30' } }], assigned), []);
});
