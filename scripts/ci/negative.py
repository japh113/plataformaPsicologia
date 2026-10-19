"""Explicit qualification fixtures, never application or clinical data."""
import json,os,subprocess,sys,tempfile,time
from pathlib import Path
from common import JOBS,OUT,PRIVATE,SuiteFailure,accept,command,identity,seal,verify,write
from sandbox import Sandbox,destination,episode_images
import docs
SCENARIOS=['test','lint','build','optin','artifact','docs','sensitive']

def fixture(case):
    report={'scenario':case,'identity':identity(),'rejected':False};start=time.monotonic()
    try:
        if case=='test':
            file=PRIVATE/'injected.test.cjs';file.parent.mkdir(parents=True,exist_ok=True)
            file.write_text("require('node:test')('CI injected failure',()=>{throw Error('controlled fixture')})")
            command(['node','--test','--test-reporter=tap',str(file)],tap=True)
        elif case in ['lint','build']:
            command(['npm','ci','--ignore-scripts'],cwd='frontend')
            if case=='lint':Path('frontend/ci-injected.js').write_text('const unusedCiFixture = ;\n')
            else:
                p=Path('frontend/src/main.jsx');p.write_text("import './ci-intentionally-missing-module.js';\n"+p.read_text())
            command(['npm','run',case],cwd='frontend')
        elif case=='optin':
            # Same destination preflight as the real sandbox; no DB write allowed.
            destination({'NODE_ENV':'test','PGHOST':'db','PGDATABASE':'psicopanel_integrity_test','RUN_EPISODE_INTEGRATION':'true','RUN_AUTH_INTEGRATION':'false','RUN_CLINICAL_INTEGRATION':'true','VERIFICATION_DELIVERY':'simulated','EPISODE_TEST_RUN_ID':'12345678-1234-1234-1234-123456789abc'})
        elif case=='artifact':
            file=PRIVATE/'missing-artifact';file.mkdir(parents=True,exist_ok=True);verify(file)
        elif case=='docs':
            p=Path('README.md');p.write_text(p.read_text()+'\n[CI injected broken link](ci-deliberately-absent.md)\n')
            docs.run(identity()['base'])
        elif case=='sensitive':scan_sensitive()
        else:raise RuntimeError('Unknown qualification scenario')
    except (SuiteFailure,AssertionError,ValueError,FileNotFoundError) as error:
        report['rejected']=True;report['reason']=type(error).__name__
        if isinstance(error,SuiteFailure):report['suite']=error.report
    report['seconds']=round(time.monotonic()-start,3)
    directory=OUT/('negative-'+case);write(directory/'report.json',report);seal(directory)
    # Genuine failed job when the injected fault was rejected. Unexpected acceptance
    # is exit zero, then the observer fails on rejected=false.
    return 1 if report['rejected'] else 0

def scan_sensitive():
    from common import scan
    scan(b'{"otp":"CI_SENSITIVE_FIXTURE"}')

def gate():
    needs=json.loads(os.environ['CI_NEEDS'])
    reports={j:{'job':j,'identity':identity(),'status':'success','suites':[{'qualification':True}]} for j in JOBS}
    conclusions={j:{'result':needs['fixtures']['result']} for j in JOBS}
    conclusions['docs']={'result':needs['omitted']['result']}
    accept(conclusions,reports)
    return 0

def isolation():
    box=Sandbox();report={'identity':identity(),'checks':{}}
    try:
        box.start()
        try:episode_images.preflight(box.project)
        except ValueError:report['checks']['existingRejected']=True
        else:raise AssertionError('Existing destination accepted')
        try:destination({'PGHOST':'external.invalid'})
        except AssertionError:report['checks']['externalRejected']=True
        else:raise AssertionError('External destination accepted')
        try:command(['python3','-c','import time;time.sleep(5)'],timeout=.1)
        except subprocess.TimeoutExpired:report['checks']['timeoutTerminated']=True
        else:raise AssertionError('Timeout was ignored')
        try:command(['python3','-c','import os,signal;os.kill(os.getpid(),signal.SIGTERM)'])
        except SuiteFailure:report['checks']['signalRejected']=True
        else:raise AssertionError('Signal was ignored')
    finally:
        box.cleanup();report['isolation']=box.isolation
        target=OUT/('isolation-'+os.environ['CI_SLOT']);write(target/'report.json',report);seal(target)
    assert all(report['checks'].get(k) for k in ['existingRejected','externalRejected','timeoutTerminated','signalRejected'])
    return 0

def observe():
    needs=json.loads(os.environ['CI_NEEDS']);assert needs['fixtures']['result']=='failure' and needs['gate']['result']=='failure' and needs['omitted']['result']=='skipped' and needs['isolation']['result']=='success'
    root=Path('tmp/negative-download');reports={};boxes=[]
    run=identity();suffix='-'+run['run']+'-'+run['attempt']+'-'+run['sha']
    for case in SCENARIOS:
        directory=root/('negative-'+case+suffix);verify(directory)
        r=json.loads((directory/'report.json').read_text());assert r['identity']==identity() and r['rejected'];reports[case]=r
    for slot in ['one','two']:
        directory=root/('isolation-'+slot+suffix);verify(directory)
        r=json.loads((directory/'report.json').read_text());assert r['identity']==identity() and r['isolation']['cleanupConfirmed'];boxes.append(r)
    assert boxes[0]['isolation']['uuid']!=boxes[1]['isolation']['uuid']
    write(OUT/'qualification/report.json',{'identity':identity(),'negativeCases':reports,'actualNeeds':needs,'isolation':boxes,'rejectionObserved':True})
    seal(OUT/'qualification')
    return 0

if __name__=='__main__':
    mode=sys.argv[1]
    sys.exit(fixture(sys.argv[2]) if mode=='fixture' else {'gate':gate,'isolation':isolation,'observe':observe}[mode]())
