"""Validate artifacts from this run/attempt/checkout, then build the index."""
import json,sys
from pathlib import Path
from common import JOBS,OUT,identity,verify,write,seal,accept

def collect(root):
    reports={};hashes={}
    for job in JOBS:
        directory=root/job
        hashes[job]=verify(directory)
        report=json.loads((directory/'report.json').read_text())
        assert report['job']==job and report['identity']==identity()
        assert report['status'] in ['success','failure'] and report['suites']
        if job in ['postgres','browser'] and report['status']=='success':
            assert len(report['isolation'])==(2 if job=='browser' else 1)
            assert all(x.get('cleanupConfirmed') and x['fresh'] and x['tmpfs'] and x['internal'] and not x['dbPorts'] and not x['persistentVolumes'] for x in report['isolation'])
        reports[job]=report
    return reports,hashes

if __name__=='__main__':
    mode=sys.argv[1];root=Path('tmp/ci-download')
    reports,hashes=collect(root)
    if mode=='evidence':
        write(OUT/'evidence/index.json',{'identity':identity(),'complete':True,'reports':reports,'hashes':hashes,'retentionDays':14})
        seal(OUT/'evidence')
    elif mode=='required':
        verify(root/'evidence')
        index=json.loads((root/'evidence/index.json').read_text())
        needs=json.loads(__import__('os').environ['CI_NEEDS'])
        assert set(needs)=={'checks','evidence'} and all(n['result']=='success' for n in needs.values())
        assert index['identity']==identity() and index['complete'] and index['reports']==reports and index['hashes']==hashes
        accept({j:{'result':'success'} for j in JOBS},reports)
        print('All required components succeeded with complete evidence for this run/attempt/commit.')
    else:raise ValueError('Unknown mode')
