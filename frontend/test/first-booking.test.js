import test from 'node:test';
import assert from 'node:assert/strict';
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
