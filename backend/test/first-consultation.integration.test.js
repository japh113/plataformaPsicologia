import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { createSandboxDatabase, installBaseline } from '../scripts/episode-sandbox.js';
import { installConsultationSandbox } from '../scripts/admission-directed-sandbox.js';
import { bilateralFixture } from '../scripts/bilateral-sandbox.js';
import { command as bilateral, processQueue, closeBilateral } from '../src/modules/bilateral/bilateral.service.js';
import { command as admission, closeAdmission } from '../src/modules/admission/admission.service.js';
import { conditionsVersion, conditionsText, sha256, declarationVersion } from '../src/modules/bilateral/bilateral.policy.js';
import { migrate } from '../scripts/episode-migration.js';

const actor = id => ({ id, sessionVersion: 0, sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600 });
const action = () => ({ operationId: randomUUID(), confirmed: true });
const answers = { reason: 'Ensayo ficticio', context: 'Contexto de la prueba' };
const neutral = { success: false, message: 'El turno solicitado no está disponible.' };

test('018: first consultation over real HTTP and PostgreSQL', {
  skip: process.env.RUN_EPISODE_INTEGRATION !== 'true',
}, async t => {
  assert.equal(env.nodeEnv, 'test');
  assert.equal(env.localDevelopment, true);
  assert.equal(env.dbHost, 'db');
  assert.equal(env.databaseUrl, '');
  assert.match(process.env.EPISODE_TEST_RUN_ID || '', /^[a-f0-9-]{36}$/);
  const control = new pg.Client({ host: 'db', database: 'psicopanel_integrity_test', user: env.dbUser, password: env.dbPassword });
  await control.connect();
  const database = 'psicopanel_episode_first_' + randomUUID().replaceAll('-', '');
  let client, server, pool, restricted;
  const original = { query: db.query, getClient: db.getClient };
  try {
    client = await createSandboxDatabase(control, database);
    await installBaseline(client);
    const options = await installConsultationSandbox(client, database);
    const ledger = (await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
    assert.equal(ledger.length, 18);
    assert.equal((await migrate(client, options)).status, 'already-applied');
    assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows, ledger);
    await bilateralFixture(client);
    await client.query(`INSERT INTO psychologist_availability_blocks(psychologist_user_id,weekday,start_time,end_time)
      SELECT id,weekday,'08:00','18:00' FROM users CROSS JOIN generate_series(0,6) AS weekday
      WHERE users.id IN ('bp1','bp2','bp3','bp4')`);
    pool = new pg.Pool({ host: 'db', database, user: options.consultationLegacyRole, password: 'disposable_consultation_legacy' });
    db.query = (statement, params) => pool.query(statement, params);
    db.getClient = () => pool.connect();
    Object.assign(process.env, {
      BILATERAL_ENABLED: 'true',
      BILATERAL_SECRET: 'isolated-consultation-bilateral-key-at-least-32-bytes',
      BILATERAL_DATABASE_URL: `postgres://${options.bilateralClientRole}:disposable_bilateral_roles@db:5432/${database}`,
      ADMISSION_ENABLED: 'true',
      ADMISSION_SECRET: 'isolated-consultation-admission-key-at-least-32-bytes',
      ADMISSION_DATABASE_URL: `postgres://${options.admissionClientRole}:disposable_admission_roles@db:5432/${database}`,
      FIRST_CONSULTATION_ENABLED: 'true',
    });
    restricted = new pg.Client({ connectionString: process.env.ADMISSION_DATABASE_URL });
    await restricted.connect();
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));

    async function http(userId, path, payload, method = payload ? 'POST' : 'GET') {
      const token = jwt.sign({ sub: userId, sv: 0 }, env.jwtSecret, { expiresIn: '1h' });
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      return { status: response.status, body: await response.json() };
    }
    function consult(id, assignment, operation, payload) {
      const path = '/admissions/consultations/' + assignment.id;
      return operation ? http(id, path + '/' + operation, { ...payload, confirmed: true }) : http(id, path);
    }
    async function ownStatus(id, assignment) {
      const result = await consult(id, assignment);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body.data;
    }
    async function expectOk(id, assignment, operation, payload) {
      const result = await consult(id, assignment, operation, payload);
      assert.deepEqual(result, { status: 200, body: { success: true, data: { saved: true } } }, operation);
    }
    async function prepare(psy, pac, directed = false) {
      const reference = (await bilateral(actor(psy), 'professional-reference', { operationId: randomUUID() })).reference;
      const recipient = (await bilateral(actor(pac), 'recipient-reference', { ...action(), professionalReference: reference })).reference;
      const receipt = await bilateral(actor(psy), 'issue', {
        operationId: randomUUID(), declared: true, proposed: true, recipientReference: recipient, email: pac + '@bilateral.invalid',
        conditionsVersion, conditionsHash: sha256(conditionsText('Profesional ficticio ' + psy)), declarationVersion,
      });
      await processQueue();
      const invitation = (await bilateral(actor(pac), 'received')).find(item => item.id === receipt.receiptId);
      const { agreementId } = await bilateral(actor(pac), 'accept', {
        ...action(), expectedVersion: invitation.version, conditionsVersion, conditionsHash: invitation.conditionsHash,
      }, invitation.id);
      const { episodeId } = await admission(actor(psy), 'prepare', { ...action(), agreementId });
      const { id } = await admission(actor(psy), directed ? 'assign-directed' : 'assign', {
        ...action(), agreementId, episodeId, templateId: 'fictional-adult-v1',
      });
      const detail = () => admission(actor(pac), 'detail', {}, id);
      const perform = async (who, operation, input) => admission(actor(who), operation, {
        ...action(), expectedVersion: (await detail()).version, ...input,
      }, id);
      const terms = await detail();
      await perform(pac, 'accept', { consentVersion: terms.consentVersion, consentHash: terms.consentHash });
      if (directed) {
        await perform(psy, 'directed-attest');
        await perform(psy, 'directed-document', { expectedDocumentRevision: 0, declarations: answers });
        await perform(psy, 'directed-validate', { episodeId, documentRevision: 1 });
      } else {
        await perform(pac, 'save', { expectedRevision: 0, answers });
        await perform(pac, 'submit', { expectedRevision: 1 });
        await perform(psy, 'validate', { episodeId, submission: 1 });
      }
      return { id, episodeId, agreementId, psy, pac, perform };
    }
    async function declare(assignment) {
      const status = await ownStatus(assignment.psy, assignment);
      await expectOk(assignment.psy, assignment, 'sufficiency', {
        assignmentVersion: status.admissionVersion, documentVersion: status.documentVersion, criteriaVersion: status.criteriaVersion,
      });
      return ownStatus(assignment.pac, assignment);
    }
    async function accept(assignment, status) {
      await expectOk(assignment.pac, assignment, 'consent', {
        sufficiencyId: status.sufficiencyId, consentVersion: status.consentVersion, consentHash: status.consentHash,
      });
      return ownStatus(assignment.psy, assignment);
    }
    const dates = (await client.query(`SELECT ((clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date-1)::text AS past,
      ((clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date+1)::text AS future`)).rows[0];
    const e1 = await prepare('bp1', 'bq1');
    const e2 = await prepare('bp2', 'bq1', true);
    const e3 = await prepare('bp3', 'bq2');
    const e4 = await prepare('bp4', 'bq3');
    let ownAppointment;

    await t.test('requires explicit sufficiency, exact document and separate consent; activation is unique under concurrency', async () => {
      const status = await ownStatus(e1.psy, e1);
      assert.equal(status.status, 'prepared');
      assert.equal(status.documentVersion, 1);
      assert.equal(status.sufficiencyId, null);
      assert.equal((await consult(e1.psy, e1, 'activate', { consentId: randomUUID() })).status, 409);
      assert.equal((await consult(e1.psy, e1, 'sufficiency', {
        assignmentVersion: status.admissionVersion, documentVersion: 2, criteriaVersion: status.criteriaVersion,
      })).status, 409);
      const pending = await declare(e1);
      assert.equal((await consult(e1.pac, e2, 'consent', {
        sufficiencyId: pending.sufficiencyId, consentVersion: pending.consentVersion, consentHash: pending.consentHash,
      })).status, 409);
      const consent = await accept(e1, pending);
      const attempts = await Promise.all([1, 2].map(() =>
        consult(e1.psy, e1, 'activate', { consentId: consent.consentId })));
      assert.deepEqual(attempts.map(result => result.status).sort(), [200, 409]);
      assert.equal((await ownStatus(e1.psy, e1)).status, 'active');
      assert.equal((await client.query('SELECT count(*)::int AS n FROM consultation_activations WHERE episode_id=$1', [e1.episodeId])).rows[0].n, 1);
      const other = await accept(e2, await declare(e2));
      assert.equal((await consult(e2.psy, e2, 'activate', { consentId: consent.consentId })).status, 409);
      await expectOk(e2.psy, e2, 'activate', { consentId: other.consentId });
      for (const episode of [e3, e4]) {
        const accepted = await accept(episode, await declare(episode));
        await expectOk(episode.psy, episode, 'activate', { consentId: accepted.consentId });
      }
    });
    await t.test('different professionals may book the same day; simultaneous overlapping requests return one neutral conflict', async () => {
      for (const time of ['09:15', '09:30', '09:45']) assert.equal((await consult(e1.psy, e1, 'book', { date: dates.past, time })).status, 400);
      const requests = await Promise.all([e1, e2].map(e => consult(e.psy, e, 'book', { date: dates.past, time: '09:00' })));
      assert.deepEqual(requests.map(result => result.status).sort(), [200, 409]);
      assert.deepEqual(requests.find(result => result.status === 409).body, neutral);
      const lost = requests[0].status === 409 ? e1 : e2;
      await expectOk(lost.psy, lost, 'book', { date: dates.past, time: '10:00' });
      ownAppointment = (await ownStatus(e1.psy, e1)).appointment;
      assert.equal(ownAppointment.durationMinutes, 60);
      assert.equal((await consult(e2.psy, e2, 'complete', { appointmentId: ownAppointment.id })).status, 404);
      assert.equal((await consult(e1.psy, e1, 'note', { appointmentId: ownAppointment.id, content: 'Too early' })).status, 409);
      await expectOk(e1.psy, e1, 'complete', { appointmentId: ownAppointment.id });
    });
    await t.test('legacy booking crosses only the neutral collision guard; coverage and future completion are enforced', async () => {
      await client.query("INSERT INTO psychologist_patient_access(psychologist_user_id,patient_id) VALUES ('bp3','bq1'),('bp3','bq4')");
      const legacyPayload = { patientId: 'bq1', scheduledDate: dates.past, scheduledTime: ownAppointment.time, status: 'pending' };
      assert.deepEqual(await http('bp3', '/appointments', legacyPayload), { status: 409, body: neutral });
      const legacy = await http('bp3', '/appointments', { ...legacyPayload, scheduledTime: '15:00' });
      assert.equal(legacy.status, 201, JSON.stringify(legacy.body));
      assert.equal((await http('bp3', '/appointments/' + legacy.body.data.id, { scheduledTime: '15:30' }, 'PATCH')).status, 400);
      assert.equal((await consult(e3.psy, e3, 'book', { date: dates.past, time: '15:00' })).status, 409);
      await expectOk(e3.psy, e3, 'book', { date: dates.future, time: '15:00' });
      const future = (await ownStatus(e3.psy, e3)).appointment;
      assert.equal((await consult(e3.psy, e3, 'complete', { appointmentId: future.id })).status, 409);
      await assert.rejects(client.query("DELETE FROM psychologist_availability_blocks WHERE psychologist_user_id='bp3'"), /consultation_slot_unavailable/);
      await assert.rejects(client.query("UPDATE consultation_appointments SET duration_minutes=45 WHERE episode_id=$1", [e3.episodeId]), /admission_immutable/);
    });
    await t.test('private note and its existence are invisible to patient, other professional, legacy DTOs and backoffice', async () => {
      const secret = 'CONFIDENTIAL_FICTIONAL_CONSULTATION';
      await expectOk(e1.psy, e1, 'note', { appointmentId: ownAppointment.id, content: secret });
      assert.equal((await ownStatus(e1.psy, e1)).note.content, secret);
      const pac = await ownStatus(e1.pac, e1);
      assert.equal(pac.appointment.id, ownAppointment.id);
      assert.equal(Object.hasOwn(pac, 'note'), false);
      for (const outsider of ['bp2', 'bq2', 'bil-support', 'bil-admin', 'bil-superadmin']) {
        const response = await consult(outsider, e1);
        assert.ok([403, 404].includes(response.status), outsider);
        assert.doesNotMatch(JSON.stringify(response.body), /CONFIDENTIAL|appointment/);
      }
      assert.equal((await consult(e1.psy, e1, 'note', { appointmentId: ownAppointment.id, authorId: 'bp2', content: secret })).status, 400);
      for (const [actorId, path] of [['bq1', '/appointments'], ['bp3', '/patients/bq1'], ['bq1', '/reminders/me'], ['bq1', '/patients/bq1/follow-up']]) {
        const projection = await http(actorId, path);
        assert.equal(projection.status, 200);
        assert.doesNotMatch(JSON.stringify(projection.body), new RegExp(secret + '|' + ownAppointment.id));
      }
      await assert.rejects(pool.query('SELECT * FROM consultation_notes'), error => error.code === '42501');
      await assert.rejects(pool.query('SELECT * FROM consultation_appointments'), error => error.code === '42501');
      await assert.rejects(restricted.query('SELECT * FROM consultation_notes'), error => error.code === '42501');
      await assert.rejects(client.query('DELETE FROM consultation_notes WHERE appointment_id=$1', [ownAppointment.id]), /admission_immutable/);
      const persisted = (await client.query('SELECT author_id,audience,provenance_version FROM consultation_notes WHERE appointment_id=$1', [ownAppointment.id])).rows[0];
      assert.deepEqual(persisted, { author_id: e1.psy, audience: 'professional_private', provenance_version: 'fictional-professional-original-v1' });
    });
    await t.test('treatment withdrawal, admission revocation, unlink and suspension block new operations without deleting history', async () => {
      const patient = await ownStatus(e1.pac, e1);
      await expectOk(e1.pac, e1, 'withdraw', { consentId: patient.consentId });
      const withdrawn = await ownStatus(e1.psy, e1);
      assert.equal(withdrawn.status, 'withdrawn');
      assert.equal(withdrawn.appointment, null);
      assert.equal(withdrawn.note, null);
      assert.equal((await consult(e1.psy, e1, 'complete', { appointmentId: ownAppointment.id })).status, 404);
      const e2Status = await ownStatus(e2.pac, e2);
      await expectOk(e2.pac, e2, 'revoke-admission', { assignmentVersion: e2Status.admissionVersion });
      assert.equal((await ownStatus(e2.pac, e2)).status, 'withdrawn');
      await client.query("UPDATE bilateral_agreements SET state='unlinked',unlinked_at=clock_timestamp(),version=version+1 WHERE id=$1", [e3.agreementId]);
      assert.equal((await consult(e3.psy, e3)).status, 404);
      await client.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id='bp4'");
      assert.ok([401, 403, 404].includes((await consult(e4.psy, e4)).status));
      assert.equal((await consult(e4.pac, e4)).status, 404);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM consultation_notes')).rows[0].n, 1);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM psychologist_patient_access')).rows[0].n, 2);
    });
  } finally {
    Object.assign(db, original);
    if (server) await new Promise(resolve => server.close(resolve));
    if (restricted) await restricted.end();
    await closeAdmission();
    await closeBilateral();
    if (pool) await pool.end();
    if (client) await client.end();
    await control.end();
  }
});
