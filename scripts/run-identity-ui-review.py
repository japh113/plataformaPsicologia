"""Private bridge for the real Chromium regression; never prints verification deliveries.

CONFIG_JSON must describe a newly created own Docker sandbox, with work/out under
the repo's ignored tmp/. Capture work/baseline.json BEFORE creating any resources
(containers: [{id: ...}]); the API container must not occur in that baseline.
Required config: run (browser owner UUID), demo (new episode sandbox UUID),
project=psicopanel-episodes-demo, image=psicopanel-ui-review-run-chromium:isolated,
network=project_app (internal), base (private frontend URL), work and out.
The browser image must contain pinned playwright 1.64.0 at /review/node_modules
and label io.psicopanel.ui-review.run=run. Use a fresh identity-demo with the
frontend API URL http://api:5000/api. This runner does not provision or reuse DBs;
the caller owns setup/cleanup through scripts/clinical-episodes.sh guards.
No traces, HAR, video or storage state. All credentials are fictional test values.
"""
import json,os,re,subprocess,sys
from pathlib import Path
from episode_images import execution_suffix
if len(sys.argv)!=2: raise SystemExit('Usage: python3 scripts/run-identity-ui-review.py CONFIG_JSON')
config_path=Path(sys.argv[1]).resolve()
root=Path.cwd().resolve()
if not config_path.is_relative_to(root/'tmp'): raise SystemExit('Use a new own sandbox config under ignored tmp/')
c=json.loads(config_path.read_text())
for key in ['work','out']:
 if not Path(c[key]).resolve().is_relative_to(root/'tmp'): raise SystemExit('Review paths must stay in tmp/')
baseline=json.loads(Path(c['work']+'/baseline.json').read_text())
assert c['project'] in ['psicopanel-episodes-'+c['demo'],'psicopanel-episodes-'+execution_suffix(c['demo'])]
assert c['network']==c['project']+'_app'
assert c['image'] in ['psicopanel-ui-review-'+c['run']+'-chromium:isolated','psicopanel-ui-review-'+execution_suffix(c['run'])+'-chromium:isolated']
owned=json.loads(subprocess.check_output(['docker','image','inspect',c['image']],text=True))[0]
assert owned['Config']['Labels']['io.psicopanel.ui-review.run']==c['run']
network=json.loads(subprocess.check_output(['docker','network','inspect',c['network']],text=True))[0]
assert network['Internal'] is True

env=dict(os.environ,EPISODE_TEST_RUN_ID=c['demo'])
compose=['docker','compose','-p',c['project'],'-f','compose.episodes-test.yaml']
api=subprocess.check_output(compose+['ps','-q','api'],env=env,text=True).strip()
info=json.loads(subprocess.check_output(['docker','inspect',api],text=True))[0]
assert api not in [x['id'] for x in baseline['containers']]
assert info['Config']['Labels']['com.docker.compose.project']==c['project']
assert 'EPISODE_TEST_RUN_ID='+c['demo'] in info['Config']['Env']
assert 'PGDATABASE=psicopanel_episode_demo' in info['Config']['Env']
assert 'NODE_ENV=development' in info['Config']['Env']
def node(source,*args):
 r=subprocess.run(compose+['exec','-T','api','node','--input-type=module','-',*args],env=env,input=source,text=True,capture_output=True)
 if r.returncode:
  Path(c['work']+'/private-cli-error.log').write_text(r.stderr)
  raise RuntimeError('Private sandbox CLI failed; debug kept outside evidence.')
 return r.stdout
node("""import db from './src/config/db.js';import bcrypt from 'bcryptjs';
const expected=process.argv[2];
if(process.env.EPISODE_TEST_RUN_ID!==expected||process.env.PGDATABASE!=='psicopanel_episode_demo')throw Error('Wrong fresh fixture');
const client=await db.getClient();
try{await client.query('BEGIN');
await client.query("UPDATE patients SET phone='+525500001114' WHERE id='p' AND (phone IS NULL OR phone='')");
const existing=(await client.query("SELECT id FROM users WHERE email='historical@ui-review.invalid'")).rows[0];\nif(existing){if(existing.id!=='ui_historical')throw Error('Unexpected fixture');await client.query('ROLLBACK');}else{
await client.query("INSERT INTO patients(id,first_name,last_name,full_name,email) VALUES ('ui_historical','Elena','Historica Ficticia','Elena Historica Ficticia','historical@ui-review.invalid')");
await client.query("INSERT INTO users(id,first_name,last_name,email,password_hash,role,patient_id) VALUES ('ui_historical','Elena','Historica Ficticia','historical@ui-review.invalid',$1,'patient','ui_historical')",[await bcrypt.hash('Ui-Review-Only-867!',10)]);
await client.query('COMMIT');}}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await db.close();}""",c['demo'])
secret_values={'Ui-Review-Only-867!','Episode-Demo-Only-284!','Demo12345!','000000','000001'}
def control(req):
 email=req.get('email','')
 assert email=='p@episodes.invalid' or re.fullmatch(r'(adult|mobile|limits)-\d+@ui-review\.invalid',email)
 if req['action']=='mailbox':
  r=subprocess.run(compose+['exec','-T','api','node','scripts/read-verification-mailbox.js',email],env=env,capture_output=True,text=True,check=True)
  rows=[json.loads(line) for line in r.stdout.splitlines()]
  messages=[x for x in rows if x['channel']==req['channel']]
  assert messages,'No simulated delivery'
  value=messages[-1]['secret'];secret_values.add(value)
  return {'secret':value}
 if req['action']=='quota_fixture':
  assert email.startswith('limits-')
  node("""import db from './src/config/db.js';import{randomUUID,randomBytes}from'node:crypto';
const [run,email]=process.argv.slice(2);
if(process.env.EPISODE_TEST_RUN_ID!==run||process.env.PGDATABASE!=='psicopanel_episode_demo'||!/^limits-\\d+@ui-review\\.invalid$/.test(email))throw Error('Wrong own fixture');
const client=await db.getClient();
try{await client.query('BEGIN');
const user=(await client.query('SELECT id FROM users WHERE email=$1 FOR UPDATE',[email])).rows[0];if(!user)throw Error('Missing own fixture');
const rows=(await client.query("SELECT * FROM contact_verification_challenges WHERE user_id=$1 AND channel='sms'",[user.id])).rows;
if(rows.length!==1)throw Error('Refuse unexpected existing issuance history');
const challenge=rows[0];
await client.query("UPDATE contact_verification_challenges SET created_at=clock_timestamp()-INTERVAL '65 seconds' WHERE id=$1",[challenge.id]);
for(let i=0;i<4;i++)await client.query("INSERT INTO contact_verification_challenges(id,user_id,channel,contact_digest,secret_digest,created_at,expires_at,invalidated_at) VALUES($1,$2,'sms',$3,$4,clock_timestamp()-($5*INTERVAL '1 minute'),clock_timestamp()+INTERVAL '5 minutes',clock_timestamp())",[randomUUID(),user.id,challenge.contact_digest,randomBytes(32).toString('hex'),i+2]);
await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await db.close();}""",c['demo'],email)
  return {'fixture':'own-new-quota-history-only'}
 raise RuntimeError('Unknown private operation')
frontend=subprocess.check_output(compose+['ps','-q','frontend'],env=env,text=True).strip()
front=json.loads(subprocess.check_output(['docker','inspect',frontend],text=True))[0]
assert front['Config']['Labels']['com.docker.compose.project']==c['project']
address=front['NetworkSettings']['Networks'][c['network']]['IPAddress']
source=root/'scripts/identity-ui-review.cjs'
assert source.is_file()
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
cmd=['docker','run','--rm','--init','-i','--name','psicopanel-ui-browser-'+execution_suffix(c['run']),'--label','io.psicopanel.ui-review.run='+c['run'],'--user',str(os.getuid())+':'+str(os.getgid()),'--network',c['network'],'--add-host','frontend.localhost:'+address,'-e','REVIEW_FRONTEND_IP='+address,'--read-only','--tmpfs','/tmp:size=1g,mode=1777','--shm-size=1g','--cap-drop=ALL','--security-opt','no-new-privileges','-e','HOME=/tmp','-e','REVIEW_BASE='+c['base'],'-e','REVIEW_REVISION='+revision,'-v',c['work']+':/control','-v',c['out']+':/evidence','-v',str(source)+':/review/driver.cjs:ro',c['image'],'node','/review/driver.cjs']
p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
with open(c['work']+'/browser-progress.log','w')as log:
 for line in p.stdout:
  if line.startswith('CONTROL '):
   try:reply=control(json.loads(line[8:]))
   except Exception as error:reply={'error':str(error)}
   p.stdin.write(json.dumps(reply)+'\n');p.stdin.flush()
  else:
   log.write(line);log.flush();print(line.strip(),flush=True)
stderr=p.stderr.read()
if stderr:Path(c['work']+'/browser-private-stderr.log').write_text(stderr)
code=p.wait()
data=Path(c['work']+'/review-data.json').read_text()
assert not any(value and value in data for value in secret_values),'Secret in sanitized review data'
Path(c['work']+'/secret-check.json').write_text(json.dumps({'sanitizedDataChecked':True,'knownSecretCountChecked':len(secret_values),'traces':False,'har':False,'video':False}))
raise SystemExit(code)
