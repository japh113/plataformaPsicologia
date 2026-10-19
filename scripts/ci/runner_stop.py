"""Explicit destructive-to-this-job-only probe on a fresh GitHub-hosted VM."""
import json,os,signal,sys,time
from pathlib import Path
from common import JOBS,OUT,PRIVATE,identity,accept,seal,verify,write
from sandbox import Sandbox

def worker():
    assert os.environ.get('GITHUB_ACTIONS')=='true'
    assert os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted'
    assert os.environ.get('GITHUB_REPOSITORY')=='japh113/plataformaPsicologia'
    found=[]
    for p in Path('/proc').iterdir():
        if not p.name.isdigit():continue
        try:
            if (p/'exe').resolve().name=='Runner.Worker' and p.stat().st_uid==os.getuid():found.append(int(p.name))
        except (FileNotFoundError,PermissionError):continue
    assert len(found)==1,'Expected exactly one own hosted job worker'
    return found[0]

def prepare():
    pid=worker();box=Sandbox()
    try:
        box.start()
        write(PRIVATE/'runner-worker.json',{'pid':pid,'identity':identity()})
        write(OUT/'pre-stop/report.json',{'identity':identity(),'phase':'before-abrupt-worker-stop','isolation':box.isolation,'workerVerified':True,'cleanupConfirmed':False})
        seal(OUT/'pre-stop')
    except BaseException:
        box.cleanup();raise

def stop():
    data=json.loads((PRIVATE/'runner-worker.json').read_text())
    assert data['identity']==identity() and worker()==data['pid']
    print('Abrupt stop of this fresh hosted job worker; no post-stop evidence is claimed.',flush=True)
    os.kill(data['pid'],signal.SIGKILL)
    time.sleep(30)
    raise RuntimeError('Worker did not terminate this job')

def audit():
    needs=json.loads(os.environ['CI_NEEDS']);result=needs['hard_stop']['result']
    assert result in ['failure','cancelled']
    path=Path('tmp/pre-stop');verify(path)
    before=json.loads((path/'report.json').read_text());assert before['identity']==identity() and before['workerVerified']
    reports={j:{'job':j,'identity':identity(),'status':'success','suites':[{'qualification':True}]} for j in JOBS}
    try:accept({j:{'result':result} for j in JOBS},reports)
    except ValueError:rejected=True
    else:raise AssertionError('Abrupt runner stop was accepted')
    write(OUT/'runner-stop/report.json',{'identity':identity(),'preStop':before,'actualDependency':result,'approvalRejected':rejected,'postStopEvidenceAvailable':False,'cleanupConfirmed':False,'limit':'The hosted VM lifecycle disposes the runner; post-stop resources cannot be inspected from this job.'})
    seal(OUT/'runner-stop')

if __name__=='__main__':{'prepare':prepare,'stop':stop,'audit':audit}[sys.argv[1]]()
