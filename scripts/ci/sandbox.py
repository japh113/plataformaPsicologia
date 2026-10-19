"""Provision ONLY fresh, owned CI resources. Never invoke normal Compose."""
import json,os,re,subprocess,uuid
from pathlib import Path
from common import command,PRIVATE,inventory
import sys
sys.path.insert(0,str(Path('scripts').resolve()))
import episode_images
VERSIONS=json.loads(Path('scripts/ci/versions.json').read_text())

def docker(*args):return json.loads(subprocess.check_output(['docker',*args],text=True))

def validate(info,network,project):
    assert info['Config']['Labels']['com.docker.compose.project']==project
    assert '/var/lib/postgresql/data' in info['HostConfig']['Tmpfs']
    assert not info['HostConfig']['PortBindings']
    assert not any(m['Type']=='volume' for m in info.get('Mounts',[]))
    assert network['Internal'] and network['Labels']['com.docker.compose.project']==project

def destination(env):
    required={'PGHOST':'db','PGDATABASE':'psicopanel_integrity_test','NODE_ENV':'test','RUN_EPISODE_INTEGRATION':'true','RUN_AUTH_INTEGRATION':'true','RUN_CLINICAL_INTEGRATION':'true','VERIFICATION_DELIVERY':'simulated'}
    assert all(env.get(k)==v for k,v in required.items())
    assert not env.get('DATABASE_URL') and not env.get('PGSERVICE')
    assert re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',env.get('EPISODE_TEST_RUN_ID',''))

class Sandbox:
    def __init__(self):
        self.run=str(uuid.uuid4());self.project='psicopanel-episodes-'+episode_images.execution_suffix(self.run)
        self.path=PRIVATE/self.run;self.path.mkdir(parents=True)
        self.env=dict(os.environ,EPISODE_TEST_RUN_ID=self.run,IDENTITY_DEMO_MODE='true',EPISODE_DEMO_API_URL='http://api:5000/api')
        self.args=['docker','compose','-p',self.project,'-f','compose.episodes-test.yaml','-f',str(self.path/'compose.json')]
        self.prepared=False;self.isolation={};self.browser_tags=[]
        self.container_baseline=subprocess.check_output(['docker','ps','-aq','--no-trunc'],text=True).split()
        self.save()
    def save(self):
        (self.path/'state.json').write_text(json.dumps({'run':self.run,'project':self.project,'path':str(self.path),'args':self.args,'env':{k:self.env[k] for k in ['EPISODE_TEST_RUN_ID','IDENTITY_DEMO_MODE','EPISODE_DEMO_API_URL']},'browser_tags':self.browser_tags,'container_baseline':self.container_baseline}))
    def cmd(self,*args,**kwargs):
        saved=dict(os.environ);os.environ.update(self.env)
        try:return command(self.args+list(args),**kwargs)
        finally:os.environ.clear();os.environ.update(saved)
    def start(self):
        assert not subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+self.project],text=True).strip()
        assert not subprocess.check_output(['docker','network','ls','-q','--filter','label=com.docker.compose.project='+self.project],text=True).strip()
        os.environ['EPISODE_TEST_RUN_ID']=self.run
        episode_images.preflight(self.project);self.prepared=True
        services={'db':{'image':VERSIONS['postgresImage']}}
        for app in ['backend','frontend']:
            file=(self.path/(app+'.Dockerfile')).resolve()
            file.write_text(Path(app+'/Dockerfile').read_text().replace('FROM node:24-bookworm-slim','FROM '+VERSIONS['nodeImage']))
            services[app]={'build':{'dockerfile':str(file),'pull':False,'no_cache':True}}
        services['api']={'build':services['backend']['build']}
        (self.path/'compose.json').write_text(json.dumps({'services':services,'networks':{'app':{'internal':True}}}))
        config=json.loads(subprocess.check_output(self.args+['--profile','demo','config','--format','json'],env=self.env,text=True))
        destination(config['services']['backend']['environment'])
        self.cmd('build','backend','frontend',timeout=900)
        episode_images.verify(self.project)
        self.cmd('up','-d','--wait','db',timeout=90)
        cid=subprocess.check_output(self.args+['ps','-q','db'],env=self.env,text=True).strip()
        info=docker('inspect',cid)[0];network=docker('network','inspect',self.project+'_database')[0]
        validate(info,network,self.project)
        version=subprocess.check_output(self.args+['exec','-T','db','postgres','--version'],env=self.env,text=True).strip()
        self.isolation={'uuid':self.run,'project':self.project,'run':os.environ.get('GITHUB_RUN_ID','local'),'attempt':os.environ.get('GITHUB_RUN_ATTEMPT','1'),'fresh':True,'tmpfs':True,'internal':True,'dbPorts':False,'persistentVolumes':False,'images':VERSIONS,'applicationImageIDs':{app:docker('image','inspect',self.project+'-'+app+':isolated')[0]['Id'] for app in ['backend','frontend']},'postgresVersion':version}
        return self
    def postgres(self):
        reports=[]
        scripts=json.loads(Path('backend/package.json').read_text())['scripts']
        for suite in ['test:episodes','test:integration']:
            files=[Path('backend')/name for name in scripts[suite].split() if name.endswith('.test.js')]
            reports.append(inventory(self.cmd('run','--rm','-T','backend','npm','run',suite,tap=True,timeout=900),files))
        return reports
    def review(self,kind):
        self.cmd('run','--rm','-T','-e','NODE_ENV=development','backend','node','scripts/create-identity-demo.js')
        self.cmd('--profile','demo','up','-d','api','frontend')
        review=str(uuid.uuid4());stem='contact' if kind=='C' else 'ui'
        label='io.psicopanel.'+stem+'-review.run'
        tag='psicopanel-'+stem+'-review-'+episode_images.execution_suffix(review)+'-chromium:isolated'
        assert not subprocess.check_output(['docker','ps','-aq','--filter','label='+label+'='+review],text=True).strip()
        assert subprocess.run(['docker','image','inspect',tag],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0
        directory=self.path/'browser';directory.mkdir();work=directory/'work';out=directory/'out'
        work.mkdir();out.mkdir();(out/'screenshots').mkdir()
        (work/'baseline.json').write_text(json.dumps({'containers':[{'id':cid} for cid in self.container_baseline]}))
        dockerfile=self.path/'browser.Dockerfile'
        dockerfile.write_text('FROM '+VERSIONS['browserImage']+'\nWORKDIR /review\nCOPY scripts/ci/browser/package*.json ./\nRUN npm ci --ignore-scripts\nLABEL '+label+'='+review+'\n')
        self.browser_tags.append((tag,label,review));self.save()
        command(['docker','build','--no-cache','-t',tag,'-f',str(dockerfile),'.'],timeout=900)
        config={'work':str(work.resolve()),'out':str(out.resolve()),'baseline':str((work/'baseline.json').resolve()),'run':review,'demo':self.run,'project':self.project,'network':self.project+'_app','image':tag,'base':'http://frontend.localhost:5173'}
        file=self.path/'review.json';file.write_text(json.dumps(config))
        command(['python3','scripts/run-'+('contact' if kind=='C' else 'identity')+'-ui-review.py',str(file)],timeout=600)
        data=json.loads((work/('results.json' if kind=='C' else 'review-data.json')).read_text())
        source=Path('scripts/'+('contact' if kind=='C' else 'identity')+'-ui-review.cjs').read_text()
        expected=set(re.findall(r"await (?:test|scenario)\('([^']+)'",source))
        cases=data['results'];assert set(r['id'] for r in cases)==expected and len(cases)==len(expected)
        assert all(r['status']=='PASS' for r in cases)
        assert not [e for e in data['events'] if not e.get('expected')]
        shots=data.get('screenshots',data.get('shots',[]));assert shots and all(s['secretsMasked'] for s in shots)
        # Export case IDs and outcomes only: no candidate, destination, response or diagnostics.
        return {'kind':kind,'cases':[{'id':r['id'],'status':r['status']} for r in cases],'runtime':json.loads((work/'runtime.json').read_text()),'imageID':docker('image','inspect',tag)[0]['Id'],'screenshots':shots},out
    def cleanup(self):
        if not self.prepared:return
        episode_images.read_state(self.project)
        for tag,label,owner in self.browser_tags:
            ids=subprocess.check_output(['docker','ps','-aq','--filter','label='+label+'='+owner],text=True).split()
            for cid in ids:
                assert docker('inspect',cid)[0]['Config']['Labels'][label]==owner
                command(['docker','rm','-f',cid])
        # Check ownership of every resource BEFORE removal, including partial setup.
        for resource,ls in [('container',['ps','-aq']),('network',['network','ls','-q'])]:
            ids=subprocess.check_output(['docker',*ls,'--filter','label=com.docker.compose.project='+self.project],text=True).split()
            for rid in ids:
                item=docker(*(['inspect',rid] if resource=='container' else ['network','inspect',rid]))[0]
                labels=item['Config']['Labels'] if resource=='container' else item['Labels']
                assert labels['com.docker.compose.project']==self.project
        self.cmd('--profile','demo','down','--remove-orphans',timeout=90)
        for tag,label,owner in self.browser_tags:
            found=subprocess.run(['docker','image','inspect',tag],text=True,capture_output=True)
            if found.returncode:continue
            assert json.loads(found.stdout)[0]['Config']['Labels'][label]==owner
            command(['docker','image','rm','--no-prune',tag])
        episode_images.cleanup(self.project)
        assert not subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+self.project],text=True).strip()
        assert not subprocess.check_output(['docker','network','ls','-q','--filter','label=com.docker.compose.project='+self.project],text=True).strip()
        current=subprocess.check_output(['docker','ps','-aq','--no-trunc'],text=True).split()
        assert set(self.container_baseline).issubset(current)
        self.isolation['preexistingContainersPreserved']=True
        self.isolation['cleanupConfirmed']=True
