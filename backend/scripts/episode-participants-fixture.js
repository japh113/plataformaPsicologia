// Structural synthetic fixture only. Never import from HTTP services or seed production.
export async function participantIdentities(client) {
  await client.query("INSERT INTO patients(id,first_name,full_name) VALUES ('p','Fixture P','Fixture P'),('q','Fixture Q','Fixture Q'),('r','Fixture R','Fixture R')");
  for (const [id,role,patient] of [['a','psychologist',null],['b','psychologist',null],['p','patient','p'],['q','patient','q'],['admin','admin',null]]) {
    await client.query(`INSERT INTO users(id,first_name,email,password_hash,role,patient_id) VALUES($1,$1,$2,'not-a-login-credential',$3,$4)`,[id,id+'@participants.invalid',role,patient]);
  }
}
export async function preparedEpisode(client,{one='p',two=null,professional='a',creator='p',modality=two?'couple':'individual'}={}) {
  return (await client.query(`INSERT INTO public.clinical_episodes(modality,participant_one_id,participant_two_id,psychologist_user_id,created_by_user_id)
    VALUES($1,$2,$3,$4,$5) RETURNING id`,[modality,one,two,professional,creator])).rows[0].id;
}
export async function participantGraph(client,episodeId,{patient='p',author='a'}={}) {
  const appointment=(await client.query(`INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status,episode_id,created_by_user_id)
    VALUES($1,CURRENT_DATE-3,'09:00','completed',$2,$3) RETURNING id`,[patient,episodeId,author])).rows[0].id;
  const note=(await client.query(`INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,episode_id,created_by_user_id,content)
    VALUES($1,$2,CURRENT_DATE-3,$3,$4,'Synthetic structural note') RETURNING id`,[patient,appointment,episodeId,author])).rows[0].id;
  const task=(await client.query(`INSERT INTO patient_tasks(patient_id,clinical_note_id,episode_id,created_by_user_id,text)
    VALUES($1,$2,$3,$4,'Synthetic structural task') RETURNING id`,[patient,note,episodeId,author])).rows[0].id;
  const waitlist=(await client.query(`INSERT INTO appointment_waitlist_entries(patient_id,scheduled_date,scheduled_time,episode_id,created_by_user_id)
    VALUES($1,CURRENT_DATE+3,'10:00',$2,$3) RETURNING id`,[patient,episodeId,author])).rows[0].id;
  return {appointment,note,task,waitlist};
}
