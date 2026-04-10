import db from '../src/config/db.js';

const getTodayDateString = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
};

const todayDate = getTodayDateString();
const client = await db.getClient();

try {
  await client.query('BEGIN');

  const futureClinicalNotesResult = await client.query(
    `
      SELECT
        pcn.id,
        pcn.patient_id,
        pcn.appointment_id,
        a.scheduled_date
      FROM patient_clinical_notes pcn
      INNER JOIN appointments a
        ON a.id = pcn.appointment_id
      WHERE a.scheduled_date > $1::date
      ORDER BY a.scheduled_date ASC, a.scheduled_time ASC, pcn.id ASC
    `,
    [todayDate],
  );

  const deletedClinicalNoteIds = futureClinicalNotesResult.rows.map((row) => row.id);
  const affectedPatientIds = new Set(futureClinicalNotesResult.rows.map((row) => row.patient_id));

  if (deletedClinicalNoteIds.length > 0) {
    await client.query(
      `
        DELETE FROM patient_clinical_notes
        WHERE id = ANY($1::bigint[])
      `,
      [deletedClinicalNoteIds],
    );
  }

  const futureCompletedAppointmentsResult = await client.query(
    `
      UPDATE appointments a
      SET
        status = 'pending',
        updated_at = NOW()
      WHERE a.scheduled_date > $1::date
        AND a.status = 'completed'
        AND NOT EXISTS (
          SELECT 1
          FROM patient_clinical_notes pcn
          WHERE pcn.appointment_id = a.id
        )
      RETURNING a.id, a.patient_id, a.scheduled_date, a.scheduled_time
    `,
    [todayDate],
  );

  futureCompletedAppointmentsResult.rows.forEach((row) => {
    affectedPatientIds.add(row.patient_id);
  });

  if (affectedPatientIds.size > 0) {
    await client.query(
      `
        UPDATE patients p
        SET
          last_clinical_note_date = (
            SELECT MAX(pcn.clinical_note_date)
            FROM patient_clinical_notes pcn
            WHERE pcn.patient_id = p.id
          ),
          updated_at = NOW()
        WHERE p.id = ANY($1::text[])
      `,
      [[...affectedPatientIds]],
    );
  }

  await client.query('COMMIT');

  console.log(
    JSON.stringify(
      {
        todayDate,
        deletedFutureClinicalNoteCount: deletedClinicalNoteIds.length,
        revertedFutureCompletedAppointmentCount: futureCompletedAppointmentsResult.rowCount,
        deletedFutureClinicalNoteIds: deletedClinicalNoteIds,
        revertedFutureAppointmentIds: futureCompletedAppointmentsResult.rows.map((row) => row.id),
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Failed to normalize future clinical notes');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await db.close();
}
