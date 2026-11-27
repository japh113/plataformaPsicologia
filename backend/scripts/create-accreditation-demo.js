import bcrypt from 'bcryptjs';
import {sandboxControl, createSandboxDatabase, installBaseline} from './episode-sandbox.js';
import {installConsultationSandbox} from './admission-directed-sandbox.js';
import {migrate} from './episode-migration.js';

let control, client;
try {
  control = await sandboxControl({demo:true});
  const database = 'psicopanel_episode_demo';
  client = await createSandboxDatabase(control,database);
  await installBaseline(client);
  const options = await installConsultationSandbox(client,database,{
    runtimeRole:'bilateral_runtime_demo',admissionRole:'admission_runtime_demo',
    legacyRole:'consultation_legacy_demo',unifiedCare:true,
  });
  await migrate(client,{...options,target:'023'});
  const password = await bcrypt.hash('Episode-Demo-Only-284!',4);
  await client.query(`
    INSERT INTO users (id,first_name,last_name,email,password_hash,role)
    VALUES ('accreditation-reviewer','Revisión','Ficticia','reviewer@accreditation.invalid',$1,'admin')
  `,[password]);
  await client.query(`
    INSERT INTO professional_general_approaches(code,label) VALUES
      ('candidate_cbt','Cognitivo-conductual'),('candidate_systemic','Sistémico'),('candidate_humanist','Humanista')
  `);
  console.log('Fresh fictional accreditation demo. Register a new professional to begin.');
} catch (error) {
  console.error('Fictional accreditation fixture failed:', error.code ?? error.message);
  process.exitCode = 1;
} finally {
  if (client) await client.end();
  if (control) await control.end();
}
