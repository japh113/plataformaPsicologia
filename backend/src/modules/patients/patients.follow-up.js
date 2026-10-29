import db from '../../config/db.js';
import { buildPatientAccessScope } from '../auth/auth.permissions.js';

// This DTO is independent of the professional note/task projections.
export const buildPatientFollowUp = ({ consultations = [], tasks = [] }) => {
  const entries = consultations.map((consultation) => ({
    id: String(consultation.id),
    scheduledDate: consultation.scheduledDate,
    scheduledTime: consultation.scheduledTime || null,
    status: 'completed',
    tasks: [],
  })).sort((a, b) =>
    b.scheduledDate.localeCompare(a.scheduledDate) ||
    String(b.scheduledTime || '').localeCompare(String(a.scheduledTime || '')) ||
    b.id.localeCompare(a.id, 'en', { numeric: true }));
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const unassignedTasks = [];
  for (const task of tasks) {
    const projected = { id: String(task.id), text: task.text, completed: Boolean(task.completed) };
    const entry = task.appointmentId == null ? null : byId.get(String(task.appointmentId));
    (entry ? entry.tasks : unassignedTasks).push(projected);
  }
  return { consultations: entries, unassignedTasks };
};

export const getPatientFollowUp = async (patientId, actor) => {
  const scope = buildPatientAccessScope(actor, 'p.id', 2);
  // DATE is cast to text in PostgreSQL: no JS Date/UTC reinterpretation.
  // Both joins verify patient ownership; a date match never creates a link.
  const result = await db.query(`
    SELECT
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', a.id, 'scheduledDate', a.scheduled_date::text,
          'scheduledTime', a.scheduled_time::text
        ) ORDER BY a.scheduled_date DESC, a.scheduled_time DESC, a.id DESC)
        FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed'
      ), '[]'::json) AS consultations,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', pt.id, 'text', pt.text, 'completed', pt.completed,
          'appointmentId', a.id
        ) ORDER BY pt.created_at ASC, pt.id ASC)
        FROM patient_tasks pt
        LEFT JOIN patient_clinical_notes n
          ON n.id = pt.clinical_note_id AND n.patient_id = pt.patient_id
        LEFT JOIN appointments a
          ON a.id = n.appointment_id AND a.patient_id = pt.patient_id AND a.status = 'completed'
        WHERE pt.patient_id = p.id AND pt.kind = 'task' AND pt.retired_at IS NULL
      ), '[]'::json) AS tasks
    FROM patients p WHERE p.id = $1 AND ${scope.clause}
    LIMIT 1
  `, [patientId, ...scope.params]);
  return result.rows[0] ? buildPatientFollowUp(result.rows[0]) : null;
};
