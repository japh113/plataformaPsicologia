"""D2 Chromium only in the fresh owned sandbox registered by Sandbox.review."""
import json,os,re,subprocess,sys
from pathlib import Path
root=Path.cwd().resolve();file=Path(sys.argv[1]).resolve();assert file.is_relative_to(root/'tmp')
c=json.loads(file.read_text());work=Path(c['work']).resolve();out=Path(c['out']).resolve()
assert work.is_relative_to(root/'tmp') and out.is_relative_to(root/'tmp')
assert re.fullmatch(r'[a-f0-9-]{36}',c['run']) and re.fullmatch(r'[a-f0-9-]{36}',c['demo'])
assert c['network']==c['project']+'_app'
compose=c['composeArgs'];assert compose[:4]==['docker','compose','-p',c['project']]
assert compose[4:7]==['-f','compose.episodes-test.yaml','-f'] and len(compose)==8
assert Path(compose[7]).resolve().is_relative_to(root/'tmp')
network=json.loads(subprocess.check_output(['docker','network','inspect',c['network']],text=True))[0]
assert network['Internal'] and network['Labels']['com.docker.compose.project']==c['project']
image=json.loads(subprocess.check_output(['docker','image','inspect',c['image']],text=True))[0]
assert image['Config']['Labels']['io.psicopanel.professional-review.run']==c['run']
env=dict(os.environ,EPISODE_TEST_RUN_ID=c['demo'])
front_id=subprocess.check_output(compose+['ps','-q','frontend'],env=env,text=True).strip()
front=json.loads(subprocess.check_output(['docker','inspect',front_id],text=True))[0]
assert front['Config']['Labels']['com.docker.compose.project']==c['project']
baseline=json.loads(Path(c['baseline']).read_text());assert front['Id'] not in [item['id'] for item in baseline['containers']]
address=front['NetworkSettings']['Networks'][c['network']]['IPAddress'];assert address
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
cmd=['docker','run','--rm','--init','--name','psicopanel-d2-browser-'+c['run'],'--label','io.psicopanel.professional-review.run='+c['run'],
 '--user',str(os.getuid())+':'+str(os.getgid()),'--network',c['network'],'--add-host','frontend.localhost:'+address,'--read-only','--tmpfs','/tmp:size=1g,mode=1777','--shm-size=1g',
 '--cap-drop=ALL','--security-opt','no-new-privileges','-e','HOME=/tmp','-e','REVIEW_FRONTEND_IP='+address,'-e','REVIEW_BASE='+c['base'],'-e','REVIEW_REVISION='+revision,
 '-v',str(work)+':/control','-v',str(out)+':/evidence','-v',str(root/'scripts/professional-ui-review.cjs')+':/review/driver.cjs:ro',c['image'],'node','/review/driver.cjs']
result=subprocess.run(cmd,text=True,capture_output=True)
print(result.stdout,flush=True)
# Export only IDs/outcomes/events and masked screenshots, never tokens or raw errors.
if (work/'results.json').exists():
 data=(work/'results.json').read_text();assert 'Episode-Demo-Only' not in data and not re.search(r'eyJ[\w-]+\.[\w-]+\.[\w-]+',data)
 (out/'results.json').write_text(data)
raise SystemExit(result.returncode)
