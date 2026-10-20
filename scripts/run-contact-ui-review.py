"""Real Chromium C review. Only a new own contact-review sandbox and ignored tmp/ paths.
Build docker/contact-review.Dockerfile with a unique REVIEW_RUN and image label first.
No traces, HAR, video, storage-state export, or external mail/SMS. CLI bridge stays private.
"""
import json,os,re,subprocess,sys
from pathlib import Path
from episode_images import execution_suffix
root=Path.cwd().resolve();config_path=Path(sys.argv[1]).resolve()
assert config_path.is_relative_to(root/'tmp')
c=json.loads(config_path.read_text());work=Path(c['work']).resolve();out=Path(c['out']).resolve()
assert work.is_relative_to(root/'tmp') and out.is_relative_to(root/'tmp')
assert re.fullmatch(r'[a-f0-9-]{36}',c['run']) and re.fullmatch(r'[a-f0-9-]{36}',c['demo'])
assert c['project'] in ['psicopanel-episodes-'+c['demo'],'psicopanel-episodes-'+execution_suffix(c['demo'])] and c['network']==c['project']+'_app'
assert c['image'] in ['psicopanel-contact-review-'+c['run']+'-chromium:isolated','psicopanel-contact-review-'+execution_suffix(c['run'])+'-chromium:isolated']
baseline=json.loads(Path(c['baseline']).read_text())
network=json.loads(subprocess.check_output(['docker','network','inspect',c['network']],text=True))[0];assert network['Internal'] is True
image=json.loads(subprocess.check_output(['docker','image','inspect',c['image']],text=True))[0]
assert image['Config']['Labels']['io.psicopanel.contact-review.run']==c['run']
env=dict(os.environ,EPISODE_TEST_RUN_ID=c['demo']);compose=['docker','compose','-p',c['project'],'-f','compose.episodes-test.yaml','-f','compose.contact-review.yaml']
api=subprocess.check_output(compose+['ps','-q','api'],env=env,text=True).strip();info=json.loads(subprocess.check_output(['docker','inspect',api],text=True))[0]
assert info['Id'] not in [x['id']for x in baseline['containers']]
assert info['Config']['Labels']['com.docker.compose.project']==c['project']
assert 'PGDATABASE=psicopanel_episode_demo' in info['Config']['Env'] and 'EPISODE_TEST_RUN_ID='+c['demo'] in info['Config']['Env']
secrets={'Episode-Demo-Only-284!','Incorrect-Password-Only!'}
def control(req):
 if req['action']=='mailbox':
  assert req['email'] in ['r@episodes.invalid','renata.changed@contact-review.invalid']
  assert req['channel'] in ['email','sms']
  r=subprocess.run(compose+['exec','-T','api','node','scripts/read-verification-mailbox.js',req['email']],env=env,text=True,capture_output=True,check=True)
  messages=[json.loads(line)for line in r.stdout.splitlines()]
  messages=[m for m in messages if m.get('purpose')=='contact_change' and m['channel']==req['channel']]
  secret=messages[-1]['secret'];secrets.add(secret);return {'secret':secret}
 if req['action']=='expire_reauthentication':
  assert re.fullmatch(r'[a-f0-9-]{36}',req['requestId'])
  source="""import db from './src/config/db.js';
if(process.env.EPISODE_TEST_RUN_ID!==process.argv[2]||process.env.PGDATABASE!=='psicopanel_episode_demo')throw Error('Wrong isolated fixture');
try{const r=await db.query("UPDATE contact_change_requests SET reauthenticated_at=clock_timestamp()-INTERVAL '11 minutes' WHERE id=$1 AND user_id='r' AND status='pending'",[process.argv[3]]);if(r.rowCount!==1)throw Error('Unexpected fixture');}finally{await db.close();}"""
  subprocess.run(compose+['exec','-T','api','node','--input-type=module','-',c['demo'],req['requestId']],input=source,env=env,text=True,capture_output=True,check=True)
  return {'fixture':'own-reauthentication-aged-only'}
 raise RuntimeError('Unknown private fixture action')
frontend=subprocess.check_output(compose+['ps','-q','frontend'],env=env,text=True).strip()
front=json.loads(subprocess.check_output(['docker','inspect',frontend],text=True))[0]
assert front['Config']['Labels']['com.docker.compose.project']==c['project']
address=front['NetworkSettings']['Networks'][c['network']]['IPAddress']
assert address
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
cmd=['docker','run','--rm','--init','-i','--name','psicopanel-contact-browser-'+execution_suffix(c['run']),'--label','io.psicopanel.contact-review.run='+c['run'],'--user',str(os.getuid())+':'+str(os.getgid()),'--network',c['network'],'--add-host','frontend.localhost:'+address,'--read-only','--tmpfs','/tmp:size=1g,mode=1777','--shm-size=1g','--cap-drop=ALL','--security-opt','no-new-privileges','-e','HOME=/tmp','-e','REVIEW_FRONTEND_IP='+address,'-e','REVIEW_BASE='+c['base'],'-e','REVIEW_REVISION='+revision,'-v',str(work)+':/control','-v',str(out)+':/evidence','-v',str(root/'scripts/contact-ui-review.cjs')+':/review/driver.cjs:ro',c['image'],'node','/review/driver.cjs']
p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
for line in p.stdout:
 if line.startswith('CONTROL '):
  try:reply=control(json.loads(line[8:]))
  except Exception:reply={'error':'Private fixture bridge failed'}
  p.stdin.write(json.dumps(reply)+'\n');p.stdin.flush()
 else:print(line.strip(),flush=True)
stderr=p.stderr.read()
for value in secrets:stderr=stderr.replace(value,'[OCULTO]')
if stderr:(work/'sanitized-stderr.txt').write_text(stderr)
code=p.wait()
if (work/'results.json').exists():
 data=(work/'results.json').read_text()
 assert not any(value in data for value in secrets),'Secret in evidence JSON'
 (out/'results.json').write_text(data)
 (out/'runtime.json').write_text((work/'runtime.json').read_text())
(out/'sanitization.json').write_text(json.dumps({'knownSecretsChecked':len(secrets),'screenshotsInputsMasked':True,'traces':False,'har':False,'video':False,'storageState':False},indent=2))
raise SystemExit(code)
