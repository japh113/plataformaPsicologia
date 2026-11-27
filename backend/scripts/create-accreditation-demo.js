import bcrypt from 'bcryptjs';
import pg from 'pg';
import env from '../src/config/env.js';
import db from '../src/config/db.js';
import {getProfile} from '../src/modules/professional/professional.service.js';
import {submitManualAccreditation} from '../src/modules/professional/manual-accreditation.service.js';
import {changeFixtureAccount, directoryCredentials, fixtureAccreditationExpiry, seedDirectoryProfessional} from './directory-fixtures.js';
import {sandboxControl, createSandboxDatabase, installBaseline} from './episode-sandbox.js';
import {installConsultationSandbox} from './admission-directed-sandbox.js';
import {migrate} from './episode-migration.js';

let control, client, pool;
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
  if (env.directoryEnabled) {
    pool = new pg.Pool({host:'db',database,user:options.consultationLegacyRole,password:'disposable_consultation_legacy'});
    db.query=(...args)=>pool.query(...args);
    db.getClient=()=>pool.connect();
    const seed=options=>seedDirectoryProfessional(client,{...options,passwordHash:password});
    await seed({slug:'elena',name:'Elena Robles',license:'910001',publishes:true,accepts:true,approaches:['candidate_cbt']});
    await seed({slug:'bruno',name:'Bruno Salgado',license:'910002',publishes:true,modality:'online',city:'Guadalajara',state:'Jalisco'});
    await seed({slug:'clara',name:'Clara Montes',license:'910003',approaches:['candidate_humanist']});
    const suspended=await seed({slug:'diana',name:'Diana Álamo',license:'910004',publishes:true,accepts:true});
    await changeFixtureAccount(suspended.actor.id,'suspended');
    const expired=await seed({slug:'emilio',name:'Emilio Valle',license:'910005',publishes:true,accepts:true});
    await fixtureAccreditationExpiry(client,expired,{keepPreferences:true});
    const pending=await seed({slug:'nadia',name:'Nadia Ríos',license:'910006',publishes:true,
      city:'Mérida',state:'Yucatán',modality:'in_person',approaches:['candidate_systemic']});
    await submitManualAccreditation(pending.actor,{rowVersion:(await getProfile(pending.actor)).profile.rowVersion,
      ...directoryCredentials('Nadia Propuesta',pending.credentials.licenseNumber),
      educationalInstitution:'Institución candidata reservada'});
    console.log('Fresh fictional directory demo with six professional profiles.');
  } else {
    console.log('Fresh fictional accreditation demo. Register a new professional to begin.');
  }
} catch (error) {
  console.error('Fictional accreditation fixture failed:', error.code ?? error.message);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
  if (client) await client.end();
  if (control) await control.end();
}
