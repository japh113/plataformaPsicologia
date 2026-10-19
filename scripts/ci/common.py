"""Fail-closed evidence contracts. Export structured allowlisted fields only."""
import hashlib,json,os,re,signal,subprocess,time
from pathlib import Path
JOBS=['docs','backend-unit','frontend','postgres','browser']
OUT=Path('tmp/ci-export')
PRIVATE=Path('tmp/ci-private')

def write(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')

def identity():
    event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text()) if os.environ.get('GITHUB_EVENT_PATH') else {}
    pr=event.get('pull_request',{})
    return {'run':os.environ.get('GITHUB_RUN_ID','local'),'attempt':os.environ.get('GITHUB_RUN_ATTEMPT','1'),
      'sha':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
      'head':pr.get('head',{}).get('sha',os.environ.get('GITHUB_SHA','local')),
      'base':pr.get('base',{}).get('sha',os.environ.get('CI_BASE','58c7b095be237b526d489152a0eab387da3d8d5d')),
      'url':os.environ.get('GITHUB_SERVER_URL','https://github.com')+'/'+os.environ.get('GITHUB_REPOSITORY','japh113/plataformaPsicologia')+'/actions/runs/'+os.environ.get('GITHUB_RUN_ID','local')}

def command(args,cwd=None,timeout=600,tap=False):
    PRIVATE.mkdir(parents=True,exist_ok=True);start=time.monotonic()
    process=subprocess.Popen(args,cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
    try:
        output,_=process.communicate(timeout=timeout)
    except BaseException:
        os.killpg(process.pid,signal.SIGTERM)
        try:output,_=process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid,signal.SIGKILL);output,_=process.communicate()
        (PRIVATE/(str(time.time_ns())+'.log')).write_text(output)
        raise
    p=type('Result',(),{'stdout':output,'returncode':process.returncode})()
    # Raw output stays private, including diagnostics, tokens and mailbox data.
    (PRIVATE/(str(time.time_ns())+'.log')).write_text(p.stdout)
    report={'command':args,'cwd':cwd or '.','exit':p.returncode,'seconds':round(time.monotonic()-start,3)}
    if tap:
        report.update(parse_tap(p.stdout))
    if p.returncode or (tap and (not report['tests'] or report['failed'] or report['skipped'] or report['cancelled'])):
        raise SuiteFailure(report)
    return report

class SuiteFailure(Exception):
    def __init__(self,report):self.report=report;super().__init__('Suite failed: '+report['command'][0])

def parse_tap(text):
    cases=[]
    for line in text.splitlines():
        m=re.match(r'\s*(not ok|ok) \d+ - (.*)',line)
        if m:
            name=m[2].split(' #')[0]
            # Case names are source-controlled test labels, never diagnostic bodies.
            cases.append({'name':name,'status':'skipped' if re.search(r'# (SKIP|TODO)',line,re.I) else ('passed' if m[1]=='ok' else 'failed')})
    counts={k:sum(x['status']==k for x in cases) for k in ['passed','failed','skipped']}
    cancelled=sum(int(x) for x in re.findall(r'^# cancelled (\d+)',text,re.M))
    return {'tests':cases,**counts,'cancelled':cancelled}

def scan(data):
    text=data.decode('utf-8')
    patterns=[r'eyJ[\w-]+\.[\w-]+\.[\w-]+',r'(?i)bearer\s+\S+',r'(?i)"(?:secret|password|candidate|destination|authorization|otp|token)"\s*:',r'gh[pousr]_[A-Za-z0-9_]{15,}',r'PRIVATE KEY',r'CI_SENSITIVE_FIXTURE']
    if any(re.search(p,text) for p in patterns):raise ValueError('Sensitive evidence rejected')

def seal(directory):
    directory=Path(directory);files={}
    for p in sorted(directory.rglob('*')):
        if p.is_file() and p.name!='SHA256SUMS':
            if p.is_symlink() or p.suffix not in ['.json','.png']:raise ValueError('Artifact allowlist violation')
            if p.suffix=='.json':scan(p.read_bytes())
            elif not p.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Invalid PNG')
            files[str(p.relative_to(directory))]=hashlib.sha256(p.read_bytes()).hexdigest()
    (directory/'SHA256SUMS').write_text(''.join(v+'  '+k+'\n' for k,v in files.items()))
    return files

def verify(directory):
    directory=Path(directory);expected={}
    for line in (directory/'SHA256SUMS').read_text().splitlines():
        digest,name=line.split('  ',1)
        if Path(name).is_absolute() or '..' in Path(name).parts:raise ValueError('Unsafe hash path')
        expected[name]=digest
    actual=seal(directory)
    if not expected or expected!=actual:raise ValueError('Artifact integrity mismatch')
    return actual

def accept(needs,reports):
    expected=set(JOBS)
    if set(reports)!=expected:raise ValueError('Missing job evidence')
    if set(needs)!=expected or any(v.get('result')!='success' for v in needs.values()):raise ValueError('Dependency did not succeed')
    current=identity()
    for job,r in reports.items():
        if r['job']!=job or r['identity']!=current or r['status']!='success' or not r['suites']:raise ValueError('Incomplete or stale evidence: '+job)
    return True
