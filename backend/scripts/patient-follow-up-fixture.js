import bcrypt from 'bcryptjs';

// Only called by guarded new-destination demo/integration entrypoints.
export async function patientFollowUpFixture(client) {
  const password = await bcrypt.hash('Episode-Demo-Only-284!', 4);
  for (const id of ['p', 'q', 'r', 's']) {
    await client.query(`INSERT INTO patients(id,first_name,full_name,notes,risk_level)
      VALUES ($1,$1,$1,'FICTIONAL_PRIVATE_CONTEXT','high')`, [id]);
    await client.query(`INSERT INTO users(id,first_name,email,password_hash,role,patient_id)
      VALUES ($1,$1,$2,$3,'patient',$1)`, [id, id + '@episodes.invalid', password]);
  }
  for (const [id, role] of [['a','psychologist'], ['b','psychologist'],
    ['admin','admin'], ['superadmin','superadmin'], ['support','support']]) {
    await client.query(`INSERT INTO users(id,first_name,email,password_hash,role)
      VALUES ($1,$1,$2,$3,$4)`, [id, id + '@episodes.invalid', password, role]);
  }
  await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES ('a','active'),('b','active')");
  await client.query("INSERT INTO psychologist_patient_access(psychologist_user_id,patient_id) VALUES ('a','p'),('b','q')");
  await client.query("INSERT INTO care_relationships(patient_id,psychologist_user_id,status) VALUES ('p','a','active'),('q','b','active')");
  const appointment = async (patient, date, time, status = 'completed') => (await client.query(
    `INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status,notes)
      VALUES ($1,$2,$3,$4,'FICTIONAL_PRIVATE_APPOINTMENT') RETURNING id`, [patient,date,time,status])).rows[0].id;
  const note = async (patient, appointmentId, date) => (await client.query(
    `INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,
       clinical_note_objective,clinical_observations,next_steps,content)
      VALUES ($1,$2,$3,'FICTIONAL_PRIVATE_OBJECTIVE','FICTIONAL_PRIVATE_OBSERVATIONS',
        'FICTIONAL_PRIVATE_NEXT','FICTIONAL_PRIVATE_CONTENT') RETURNING id`, [patient,appointmentId,date])).rows[0].id;
  const task = async (patient, text, noteId = null, completed = false, kind = 'task') => (await client.query(
    `INSERT INTO patient_tasks(patient_id,text,clinical_note_id,completed,kind,created_at)
      VALUES ($1,$2,$3,$4,$5,'2026-04-09 12:00:00+00') RETURNING id`, [patient,text,noteId,completed,kind])).rows[0].id;
  const first = await appointment('p','2026-04-01','09:00');
  const fifth = await appointment('p','2026-04-05','10:00'); // No note.
  const eighth = await appointment('p','2026-04-08','11:00');
  const firstNote = await note('p',first,'2026-04-01');
  const eighthNote = await note('p',eighth,'2026-04-08');
  const tasks = [
    await task('p','Fictional April 1 task A',firstNote),
    await task('p','Fictional April 1 task B',firstNote,true),
    await task('p','Fictional April 8 task',eighthNote),
  ];
  const historical = await task('p','Fictional historical task');
  const objective = await task('p','Fictional shared objective',null,false,'objective');
  const retired = await task('p','Fictional retired task',firstNote);
  await client.query('UPDATE patient_tasks SET retired_at=NOW() WHERE id=$1',[retired]);
  const qEarly = await appointment('q','2026-04-08','08:00');
  const qLate = await appointment('q','2026-04-08','15:00');
  const qNote = await note('q',qEarly,'2026-04-08'); // Note with no tasks.
  for (const [status,date] of [['pending','2026-04-10'],['cancelled','2026-04-11'],['no_show','2026-04-12']]) {
    await appointment('p',date,'12:00',status);
  }
  await task('s','Fictional history only task');
  return { first, fifth, eighth, firstNote, eighthNote, tasks, historical, objective, qEarly, qLate, qNote };
}
