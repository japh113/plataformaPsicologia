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

  const futureSessionsResult = await client.query(
    `
      SELECT
        ps.id,
        ps.patient_id,
        ps.appointment_id,
        a.scheduled_date
      FROM patient_sessions ps
      INNER JOIN appointments a
        ON a.id = ps.appointment_id
      WHERE a.scheduled_date > $1::date
      ORDER BY a.scheduled_date ASC, a.scheduled_time ASC, ps.id ASC
    `,
    [todayDate],
  );

  const deletedSessionIds = futureSessionsResult.rows.map((row) => row.id);
  const affectedPatientIds = new Set(futureSessionsResult.rows.map((row) => row.patient_id));

  if (deletedSessionIds.length > 0) {
    await client.query(
      `
        DELETE FROM patient_sessions
        WHERE id = ANY($1::bigint[])
      `,
      [deletedSessionIds],
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
          FROM patient_sessions ps
          WHERE ps.appointment_id = a.id
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
          last_session_date = (
            SELECT MAX(ps.session_date)
            FROM patient_sessions ps
            WHERE ps.patient_id = p.id
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
        deletedFutureSessionCount: deletedSessionIds.length,
        revertedFutureCompletedAppointmentCount: futureCompletedAppointmentsResult.rowCount,
        deletedFutureSessionIds: deletedSessionIds,
        revertedFutureAppointmentIds: futureCompletedAppointmentsResult.rows.map((row) => row.id),
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Failed to normalize future sessions');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await db.close();
}
