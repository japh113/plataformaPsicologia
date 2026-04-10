INSERT INTO patients (
  id,
  first_name,
  last_name,
  full_name,
  email,
  phone,
  risk_level,
  status,
  last_session_date,
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
    'u_psy_1',
    'Lucia',
    'Morales',
    'doctor@psicopanel.com',
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

UPDATE patient_sessions ps
SET appointment_id = a.id
FROM appointments a
WHERE ps.appointment_id IS NULL
  AND ps.patient_id = a.patient_id
  AND ps.session_date = a.scheduled_date;

UPDATE appointments a
SET
  status = 'completed',
  updated_at = NOW()
FROM patient_sessions ps
WHERE ps.appointment_id = a.id
  AND a.status <> 'completed';

DELETE FROM patient_sessions ps
USING patient_sessions duplicated
WHERE ps.appointment_id IS NOT NULL
  AND duplicated.appointment_id = ps.appointment_id
  AND duplicated.id < ps.id;

INSERT INTO patient_sessions (
  patient_id,
  appointment_id,
  created_by_user_id,
  session_date,
  note_format,
  session_objective,
  clinical_observations,
  next_steps,
  content
)
SELECT
  seed.patient_id,
  a.id,
  seed.created_by_user_id,
  seed.session_date,
  seed.note_format,
  seed.session_objective,
  seed.clinical_observations,
  seed.next_steps,
  seed.content
FROM (
  VALUES
    ('1', 'u_psy_1', '2026-04-05'::date, 'simple', 'Identificar detonantes recientes de ansiedad.', 'Reconoce mejor los picos de activacion y responde a la respiracion guiada.', 'Mantener registro de pensamientos y revisar disparadores la proxima semana.', 'Sesion enfocada en identificar detonantes de ansiedad y revisar estrategias de regulacion.'),
    ('2', 'u_psy_1', '2026-04-04'::date, 'simple', 'Reordenar rutina de sueno.', 'Mejoro ligeramente la higiene nocturna, pero sigue costando desconectarse del trabajo.', 'Sostener horario fijo de descanso y reducir pantallas antes de dormir.', 'Seguimiento de rutina de sueno y ajuste de habitos nocturnos.'),
    ('1', 'u_psy_1', '2026-04-01'::date, 'simple', 'Fortalecer adherencia a tareas entre sesiones.', 'Completo parcialmente el registro y pudo detectar dos pensamientos automaticos frecuentes.', 'Retomar registro diario y revisar avances en la proxima sesion.', 'Se trabajo registro de pensamientos automaticos y adherencia a tareas.')
) AS seed(patient_id, created_by_user_id, session_date, note_format, session_objective, clinical_observations, next_steps, content)
INNER JOIN appointments a
  ON a.patient_id = seed.patient_id
 AND a.scheduled_date = seed.session_date
WHERE NOT EXISTS (
  SELECT 1
  FROM patient_sessions ps
  WHERE ps.appointment_id = a.id
);

UPDATE patient_sessions ps
SET
  session_objective = seed.session_objective,
  clinical_observations = seed.clinical_observations,
  next_steps = seed.next_steps
FROM (
  VALUES
    ('1', '2026-04-05'::date, 'Identificar detonantes recientes de ansiedad.', 'Reconoce mejor los picos de activacion y responde a la respiracion guiada.', 'Mantener registro de pensamientos y revisar disparadores la proxima semana.'),
    ('2', '2026-04-04'::date, 'Reordenar rutina de sueno.', 'Mejoro ligeramente la higiene nocturna, pero sigue costando desconectarse del trabajo.', 'Sostener horario fijo de descanso y reducir pantallas antes de dormir.'),
    ('1', '2026-04-01'::date, 'Fortalecer adherencia a tareas entre sesiones.', 'Completo parcialmente el registro y pudo detectar dos pensamientos automaticos frecuentes.', 'Retomar registro diario y revisar avances en la proxima sesion.')
) AS seed(patient_id, session_date, session_objective, clinical_observations, next_steps)
WHERE ps.patient_id = seed.patient_id
  AND ps.session_date = seed.session_date
  AND COALESCE(ps.session_objective, '') = ''
  AND COALESCE(ps.clinical_observations, '') = ''
  AND COALESCE(ps.next_steps, '') = '';
