INSERT INTO patients (
  id,
  first_name,
  last_name,
  full_name,
  email,
  phone,
  risk_level,
  status,
  last_clinical_note_date,
  notes,
  age,
  reason_for_consultation
)
VALUES
  (
    '1',
    'Juan',
    'Perez',
    'Juan Perez',
    'juan@example.com',
    '555-111-2222',
    'high',
    'active',
    '2026-04-05',
    'Paciente con seguimiento constante por ansiedad.',
    29,
    'Ansiedad'
  ),
  (
    '2',
    'Maria',
    'Lopez',
    'Maria Lopez',
    'maria@example.com',
    '555-333-4444',
    'medium',
    'active',
    '2026-04-04',
    'Trabajando habitos de sueno y regulacion emocional.',
    34,
    'Habitos de sueno'
  ),
  (
    '3',
    'Sofia',
    'Ramirez',
    'Sofia Ramirez',
    'sofia@example.com',
    '555-777-8888',
    'medium',
    'active',
    NULL,
    'Seguimiento por manejo de estres laboral.',
    27,
    'Estres laboral'
  ),
  (
    '4',
    'Carlos',
    'Mendez',
    'Carlos Mendez',
    'carlos@example.com',
    '555-999-0000',
    'low',
    'active',
    NULL,
    'Primer contacto para trabajar organizacion y procrastinacion.',
    31,
    'Organizacion personal'
  ),
  (
    '5',
    'Valeria',
    'Torres',
    'Valeria Torres',
    'valeria@example.com',
    '555-222-6666',
    'high',
    'active',
    NULL,
    'Caso nuevo con antecedente de crisis recientes.',
    24,
    'Crisis de ansiedad'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (
  id,
  first_name,
  last_name,
  email,
  password_hash,
  role,
  patient_id
)
VALUES
  (
    'u_admin_1',
    'Admin',
    'PsicoPanel',
    'admin@psicopanel.com',
    '$2b$10$vquYfF/cmj1ZWF9Lo7muB.RwNgmXuauLcQoZB53oPlACki6C8kkX.',
    'admin',
    NULL
  ),
  (
    'u_support_1',
    'Soporte',
    'PsicoPanel',
    'support@psicopanel.com',
    '$2b$10$vquYfF/cmj1ZWF9Lo7muB.RwNgmXuauLcQoZB53oPlACki6C8kkX.',
    'support',
    NULL
  ),
  (
    'u_superadmin_1',
    'Superadmin',
    'PsicoPanel',
    'root@psicopanel.com',
    '$2b$10$vquYfF/cmj1ZWF9Lo7muB.RwNgmXuauLcQoZB53oPlACki6C8kkX.',
    'superadmin',
    NULL
  ),
  (
    'u_psy_1',
    'Lucia',
    'Morales',
    'doctor@psicopanel.com',
    '$2b$10$vquYfF/cmj1ZWF9Lo7muB.RwNgmXuauLcQoZB53oPlACki6C8kkX.',
    'psychologist',
    NULL
  ),
  (
    'u_psy_pending_1',
    'Ana',
    'Herrera',
    'ana.herrera@psicopanel.com',
    '$2b$10$vquYfF/cmj1ZWF9Lo7muB.RwNgmXuauLcQoZB53oPlACki6C8kkX.',
    'psychologist',
    NULL
  ),
  (
    'u_pat_1',
    'Juan',
    'Perez',
    'juan@example.com',
    '$2b$10$vquYfF/cmj1ZWF9Lo7muB.RwNgmXuauLcQoZB53oPlACki6C8kkX.',
    'patient',
    '1'
  ),
  (
    'u_pat_2',
    'Maria',
    'Lopez',
    'maria@example.com',
    '$2b$10$vquYfF/cmj1ZWF9Lo7muB.RwNgmXuauLcQoZB53oPlACki6C8kkX.',
    'patient',
    '2'
  )
ON CONFLICT (email) DO NOTHING;

INSERT INTO psychologist_profiles (
  user_id,
  professional_title,
  license_number,
  approval_status,
  review_notes,
  approved_at,
  reviewed_at,
  reviewed_by_user_id
)
VALUES
  (
    'u_psy_1',
    'Psicologa clinica',
    'LIC-PSI-001',
    'active',
    'Cuenta demo aprobada para desarrollo.',
    NOW(),
    NOW(),
    'u_admin_1'
  ),
  (
    'u_psy_pending_1',
    'Psicologa clinica infantil',
    'LIC-PSI-019',
    'pending_review',
    'Solicitud demo pendiente para probar backoffice.',
    NULL,
    NULL,
    NULL
  )
ON CONFLICT (user_id) DO UPDATE
SET
  professional_title = EXCLUDED.professional_title,
  license_number = EXCLUDED.license_number,
  approval_status = EXCLUDED.approval_status,
  review_notes = EXCLUDED.review_notes,
  approved_at = EXCLUDED.approved_at,
  reviewed_at = EXCLUDED.reviewed_at,
  reviewed_by_user_id = EXCLUDED.reviewed_by_user_id;

INSERT INTO care_relationships (
  patient_id,
  psychologist_user_id,
  status,
  requested_by_role,
  created_by_user_id,
  approved_by_user_id,
  approved_at,
  notes
)
VALUES
  ('1', 'u_psy_1', 'active', 'psychologist', 'u_psy_1', 'u_admin_1', NOW(), 'Relacion activa demo'),
  ('2', 'u_psy_1', 'active', 'psychologist', 'u_psy_1', 'u_admin_1', NOW(), 'Relacion activa demo'),
  ('3', 'u_psy_1', 'active', 'psychologist', 'u_psy_1', 'u_admin_1', NOW(), 'Relacion activa demo'),
  ('4', 'u_psy_1', 'active', 'psychologist', 'u_psy_1', 'u_admin_1', NOW(), 'Relacion activa demo'),
  ('5', 'u_psy_1', 'active', 'psychologist', 'u_psy_1', 'u_admin_1', NOW(), 'Relacion activa demo')
ON CONFLICT DO NOTHING;

INSERT INTO psychologist_patient_access (
  psychologist_user_id,
  patient_id
)
VALUES
  ('u_psy_1', '1'),
  ('u_psy_1', '2'),
  ('u_psy_1', '3'),
  ('u_psy_1', '4'),
  ('u_psy_1', '5')
ON CONFLICT (psychologist_user_id, patient_id) DO NOTHING;

INSERT INTO patient_intakes (
  patient_id,
  birth_date,
  birth_place,
  occupation,
  hobbies,
  marital_status,
  family_members,
  lives_with,
  physical_illnesses,
  insomnia,
  nightmares,
  fears_or_phobias,
  accidents,
  alcohol_use,
  tobacco_use,
  drug_use,
  psychological_abuse,
  physical_abuse,
  death_wish,
  suicide_attempts,
  completed_at,
  completed_by_user_id,
  updated_by_user_id
)
VALUES
  (
    '2',
    '1991-09-15',
    'Monterrey, Nuevo Leon',
    'Disenadora grafica',
    'Leer y caminar',
    'Soltera',
    'Mama, papa y una hermana',
    'Con una roomie',
    'Ninguna reportada',
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    '2026-04-06T17:30:00Z',
    'u_pat_2',
    'u_pat_2'
  )
ON CONFLICT (patient_id) DO NOTHING;

INSERT INTO psychologist_availability (
  psychologist_user_id,
  weekday,
  is_enabled,
  start_time,
  end_time
)
VALUES
  ('u_psy_1', 0, FALSE, '09:00:00', '17:00:00'),
  ('u_psy_1', 1, TRUE, '09:00:00', '17:00:00'),
  ('u_psy_1', 2, TRUE, '09:00:00', '17:00:00'),
  ('u_psy_1', 3, TRUE, '09:00:00', '17:00:00'),
  ('u_psy_1', 4, TRUE, '09:00:00', '17:00:00'),
  ('u_psy_1', 5, TRUE, '09:00:00', '17:00:00'),
  ('u_psy_1', 6, FALSE, '09:00:00', '17:00:00')
ON CONFLICT (psychologist_user_id, weekday) DO NOTHING;

INSERT INTO psychologist_availability_blocks (
  psychologist_user_id,
  weekday,
  start_time,
  end_time
)
SELECT seed.psychologist_user_id, seed.weekday, seed.start_time, seed.end_time
FROM (
  VALUES
    ('u_psy_1', 1, '09:00:00'::time, '17:00:00'::time),
    ('u_psy_1', 2, '09:00:00'::time, '17:00:00'::time),
    ('u_psy_1', 3, '09:00:00'::time, '17:00:00'::time),
    ('u_psy_1', 4, '09:00:00'::time, '17:00:00'::time),
    ('u_psy_1', 5, '09:00:00'::time, '17:00:00'::time)
) AS seed(psychologist_user_id, weekday, start_time, end_time)
WHERE NOT EXISTS (
  SELECT 1
  FROM psychologist_availability_blocks pab
  WHERE pab.psychologist_user_id = seed.psychologist_user_id
    AND pab.weekday = seed.weekday
    AND pab.start_time = seed.start_time
    AND pab.end_time = seed.end_time
);

INSERT INTO patient_tasks (
  patient_id,
  kind,
  text,
  completed
)
SELECT seed.patient_id, seed.kind, seed.text, seed.completed
FROM (
  VALUES
    ('1', 'task', 'Llamar al psiquiatra para ajustar dosis', FALSE),
    ('1', 'task', 'Registro de pensamientos automaticos', TRUE),
    ('2', 'task', 'Practicar respiracion diafragmatica (10 min/dia)', FALSE),
    ('1', 'objective', 'Mejorar higiene del sueno', FALSE),
    ('1', 'objective', 'Reducir rumiacion nocturna', TRUE),
    ('2', 'objective', 'Tolerar mejor reuniones sociales cortas', FALSE)
 ) AS seed(patient_id, kind, text, completed)
WHERE NOT EXISTS (
  SELECT 1
  FROM patient_tasks pt
  WHERE pt.patient_id = seed.patient_id
    AND pt.kind = seed.kind
    AND pt.text = seed.text
);

INSERT INTO appointments (
  patient_id,
  scheduled_date,
  scheduled_time,
  status,
  notes
)
SELECT seed.patient_id, seed.scheduled_date, seed.scheduled_time, seed.status, seed.notes
FROM (
  VALUES
    ('1', '2026-04-01'::date, '10:00:00'::time, 'completed', 'Sesion historica'),
    ('2', '2026-04-04'::date, '11:00:00'::time, 'completed', 'Sesion historica'),
    ('1', '2026-04-05'::date, '12:00:00'::time, 'completed', 'Sesion historica'),
    ('1', '2026-04-08'::date, '10:00:00'::time, 'pending', ''),
    ('2', '2026-04-08'::date, '11:00:00'::time, 'completed', '')
) AS seed(patient_id, scheduled_date, scheduled_time, status, notes)
WHERE NOT EXISTS (
  SELECT 1
  FROM appointments a
  WHERE a.patient_id = seed.patient_id
    AND a.scheduled_date = seed.scheduled_date
    AND a.scheduled_time = seed.scheduled_time
);

UPDATE patient_clinical_notes pcn
SET appointment_id = a.id
FROM appointments a
WHERE pcn.appointment_id IS NULL
  AND pcn.patient_id = a.patient_id
  AND pcn.clinical_note_date = a.scheduled_date;

UPDATE appointments a
SET
  status = 'completed',
  updated_at = NOW()
FROM patient_clinical_notes pcn
WHERE pcn.appointment_id = a.id
  AND a.status <> 'completed';

DELETE FROM patient_clinical_notes pcn
USING patient_clinical_notes duplicated
WHERE pcn.appointment_id IS NOT NULL
  AND duplicated.appointment_id = pcn.appointment_id
  AND duplicated.id < pcn.id;

INSERT INTO patient_clinical_notes (
  patient_id,
  appointment_id,
  created_by_user_id,
  clinical_note_date,
  note_format,
  clinical_note_objective,
  clinical_observations,
  next_steps,
  content
)
SELECT
  seed.patient_id,
  a.id,
  seed.created_by_user_id,
  seed.clinical_note_date,
  seed.note_format,
  seed.clinical_note_objective,
  seed.clinical_observations,
  seed.next_steps,
  seed.content
FROM (
  VALUES
    ('1', 'u_psy_1', '2026-04-05'::date, 'simple', 'Identificar detonantes recientes de ansiedad.', 'Reconoce mejor los picos de activacion y responde a la respiracion guiada.', 'Mantener registro de pensamientos y revisar disparadores la proxima semana.', 'Sesion enfocada en identificar detonantes de ansiedad y revisar estrategias de regulacion.'),
    ('2', 'u_psy_1', '2026-04-04'::date, 'simple', 'Reordenar rutina de sueno.', 'Mejoro ligeramente la higiene nocturna, pero sigue costando desconectarse del trabajo.', 'Sostener horario fijo de descanso y reducir pantallas antes de dormir.', 'Seguimiento de rutina de sueno y ajuste de habitos nocturnos.'),
    ('1', 'u_psy_1', '2026-04-01'::date, 'simple', 'Fortalecer adherencia a tareas entre sesiones.', 'Completo parcialmente el registro y pudo detectar dos pensamientos automaticos frecuentes.', 'Retomar registro diario y revisar avances en la proxima sesion.', 'Se trabajo registro de pensamientos automaticos y adherencia a tareas.')
) AS seed(patient_id, created_by_user_id, clinical_note_date, note_format, clinical_note_objective, clinical_observations, next_steps, content)
INNER JOIN appointments a
  ON a.patient_id = seed.patient_id
 AND a.scheduled_date = seed.clinical_note_date
WHERE NOT EXISTS (
  SELECT 1
  FROM patient_clinical_notes pcn
  WHERE pcn.appointment_id = a.id
);

UPDATE patient_clinical_notes pcn
SET
  clinical_note_objective = seed.clinical_note_objective,
  clinical_observations = seed.clinical_observations,
  next_steps = seed.next_steps
FROM (
  VALUES
    ('1', '2026-04-05'::date, 'Identificar detonantes recientes de ansiedad.', 'Reconoce mejor los picos de activacion y responde a la respiracion guiada.', 'Mantener registro de pensamientos y revisar disparadores la proxima semana.'),
    ('2', '2026-04-04'::date, 'Reordenar rutina de sueno.', 'Mejoro ligeramente la higiene nocturna, pero sigue costando desconectarse del trabajo.', 'Sostener horario fijo de descanso y reducir pantallas antes de dormir.'),
    ('1', '2026-04-01'::date, 'Fortalecer adherencia a tareas entre sesiones.', 'Completo parcialmente el registro y pudo detectar dos pensamientos automaticos frecuentes.', 'Retomar registro diario y revisar avances en la proxima sesion.')
) AS seed(patient_id, clinical_note_date, clinical_note_objective, clinical_observations, next_steps)
WHERE pcn.patient_id = seed.patient_id
  AND pcn.clinical_note_date = seed.clinical_note_date
  AND COALESCE(pcn.clinical_note_objective, '') = ''
  AND COALESCE(pcn.clinical_observations, '') = ''
  AND COALESCE(pcn.next_steps, '') = '';

WITH latest_patient_clinical_notes AS (
  SELECT DISTINCT ON (pcn.patient_id)
    pcn.patient_id,
    pcn.id AS clinical_note_id
  FROM patient_clinical_notes pcn
  ORDER BY pcn.patient_id, pcn.clinical_note_date DESC, pcn.created_at DESC, pcn.id DESC
)
UPDATE patient_tasks pt
SET
  clinical_note_id = latest_patient_clinical_notes.clinical_note_id,
  updated_at = NOW()
FROM latest_patient_clinical_notes
WHERE pt.patient_id = latest_patient_clinical_notes.patient_id
  AND pt.kind = 'task'
  AND pt.clinical_note_id IS NULL;
