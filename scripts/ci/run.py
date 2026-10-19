"""Run one required component; retain only sanitized, integrity-bound evidence."""
import json,os,shutil,signal,subprocess,sys,time,traceback
from pathlib import Path
from common import OUT,PRIVATE,command,identity,write,seal,export_tap,inventory,SuiteFailure
import docs
from sandbox import Sandbox

def main(job):
    started=time.monotonic();report={'job':job,'identity':identity(),'status':'failure','suites':[],
      'runner':{key:os.environ.get(key) for key in ['RUNNER_OS','RUNNER_ARCH','ImageOS','ImageVersion']},'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'isolation':[]}
    target=OUT/job;target.mkdir(parents=True,exist_ok=True)
    boxes=[];result=1
    def stop(*_):raise RuntimeError('Execution interrupted')
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    try:
        if job=='docs':
            report['suites'].append(docs.run(report['identity']['base']))
            report['suites'].append(command(['python3','-B','-m','unittest','discover','-s','scripts/ci','-p','test_*.py']))
        elif job in ['backend-unit','frontend']:
            app='backend' if job=='backend-unit' else 'frontend'
            report['runtime']={key:subprocess.check_output([key,'--version'],text=True).strip() for key in ['node','npm']}
            assert report['runtime']['node']=='v24.22.0'
            report['suites'].append(command(['npm','ci','--ignore-scripts'],cwd=app))
            files=sorted(p for p in Path(app+'/test').glob('*.test.js') if not p.name.endswith('.integration.test.js'))
            report['suites'].append(inventory(command(['npm','test'],cwd=app,tap=True),files))
            if app=='frontend':
                for task in ['lint','build']:report['suites'].append(command(['npm','run',task],cwd=app))
        elif job=='postgres':
            report['suites'].append(command(['python3','-B','scripts/test_episode_images.py']))
            box=Sandbox();boxes.append(box);box.start()
            report['suites'].extend(box.postgres())
        elif job=='browser':
            for kind in ['B','C']:
                box=Sandbox();boxes.append(box);box.start()
                review,source=box.review(kind);report['suites'].append(review)
                shots=target/kind/'screenshots';shots.mkdir(parents=True)
                for shot in review['screenshots']:
                    name=Path(shot['file']).name
                    assert name.endswith('.png') and (source/'screenshots'/name).is_file()
                    shutil.copyfile(source/'screenshots'/name,shots/name)
                box.cleanup();boxes.remove(box);report['isolation'].append(box.isolation)
        else:raise ValueError('Unknown component')
        report['status']='success';result=0
    except SuiteFailure as error:
        report['suites'].append(error.report);report['error']='Command or test contract failed; raw diagnostics retained privately on runner only'
    except Exception as error:
        PRIVATE.mkdir(parents=True,exist_ok=True);(PRIVATE/'exception.log').write_text(traceback.format_exc())
        report['error']='Component failed: '+type(error).__name__
        report['location']=[{'file':Path(frame.filename).name,'line':frame.lineno,'function':frame.name} for frame in traceback.extract_tb(error.__traceback__)]
    finally:
        for box in boxes:
            for file in (box.path/'browser'/'work').glob('*.json'):
                if file.name not in ['results.json','review-data.json']:continue
                data=json.loads(file.read_text())
                report.setdefault('browserCases',[]).extend({'id':r['id'],'status':r['status']} for r in data.get('results',[]))
                report.setdefault('browserEvents',[]).extend({'scenario':e.get('scenario'),'kind':e.get('kind',e.get('type')),'expected':bool(e.get('expected')),'status':e.get('status')} for e in data.get('events',[]))
        for box in boxes:
            try:box.cleanup()
            except Exception:report['status']='failure';report['cleanupError']=True;result=1
            report['isolation'].append(box.isolation)
        report['seconds']=round(time.monotonic()-started,3)
        write(target/'report.json',report);export_tap(target,report['suites']);seal(target)
        print(json.dumps({'component':job,'status':report['status'],'seconds':report['seconds']}))
    return result

if __name__=='__main__':sys.exit(main(sys.argv[1]))
