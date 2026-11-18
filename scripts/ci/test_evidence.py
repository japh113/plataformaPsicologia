"""Exercise both final consumers with real sealed artifacts and their validators."""
import copy,json,os,shutil,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from common import JOBS,identity,seal,verify,write
from classification import classify
from evidence import main

class EvidenceConsumer(unittest.TestCase):
    def fixtures(self,root):
        catalog=json.loads(Path('scripts/ci/browser-cases.json').read_text())
        tap={'tests':[{'name':'fixture','status':'passed'}],'complete':True,'sourceFiles':['fixture.test.js'],
             'declaredCases':['fixture'],'passed':1,'failed':0,'cancelled':0,'skipped':0,'exit':0}
        suites={
            'docs':[{'markdownFiles':1,'localLinks':1,'changedFiles':[],'protectedDecisions':'unchanged','migrations':'unchanged'},
                    {'command':['python3','-B','-m','unittest','discover','-s','scripts/ci','-p','test_*.py'],'exit':0,'seconds':1}],
            'backend-unit':[{'exit':0},tap],
            'frontend':[{'command':cmd,**(tap if cmd==['npm','test'] else {})} for cmd in
                        [['npm','ci','--ignore-scripts'],['npm','test'],['npm','run','lint'],['npm','run','build']]],
            'postgres':[{'exit':0},tap,tap],
            'browser':[{'kind':kind,'cases':[{'id':case,'status':'PASS'} for case in catalog[kind]],
                        'runtime':{'revision':identity()['sha']}} for kind in ['B','C','D2','VIN']]}
        isolation={'cleanupConfirmed':True,'fresh':True,'tmpfs':True,'internal':True,'dbPorts':False,'persistentVolumes':False}
        reports={job:{'job':job,'identity':identity(),'classification':classify(),'status':'success',
                      'suites':copy.deepcopy(suites[job]),'isolation':[isolation]*(4 if job=='browser' else 1 if job=='postgres' else 0)} for job in JOBS}
        self.save(root,reports)
        return reports

    def save(self,root,reports):
        for job,report in reports.items():
            write(root/job/'report.json',report);seal(root/job)

    def test_four_browser_suites_reach_index_and_required_with_negative_controls(self):
        # No mocks of collect, identity, classification, hashes or browser validators.
        with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{'GITHUB_EVENT_NAME':'local',
              'CI_NEEDS':json.dumps({job:{'result':'success'} for job in ['route','checks','evidence']})}):
            root=Path(tmp)/'download';out=Path(tmp)/'export'
            reports=self.fixtures(root)
            main('evidence',root,out);verify(out/'evidence')
            shutil.copytree(out/'evidence',root/'evidence')
            main('required',root,out)
            self.assertEqual(len(json.loads((out/'evidence/index.json').read_text())['reports']['browser']['suites']),4)
            for mutate in [lambda r:r['browser']['suites'].pop(),
                           lambda r:r['browser']['suites'].append(copy.deepcopy(r['browser']['suites'][0])),
                           lambda r:r['browser']['suites'][3]['cases'].pop(),
                           lambda r:r['browser']['suites'][3]['cases'].append(copy.deepcopy(r['browser']['suites'][3]['cases'][0])),
                           lambda r:r['browser']['suites'][3]['cases'][0].update(status='FAIL'),
                           lambda r:r['browser']['suites'][3]['runtime'].update(revision='stale'),
                           lambda r:r['browser']['identity'].update(attempt='stale'),
                           lambda r:r['browser']['isolation'].pop(),
                           lambda r:r['browser']['isolation'][3].update(cleanupConfirmed=False),
                           lambda r:r['browser'].update(status='not_applicable')]:
                altered=copy.deepcopy(reports);mutate(altered);self.save(root,altered)
                for mode in ['evidence','required']:
                    with self.subTest(mode=mode,mutation=mutate),self.assertRaises((AssertionError,ValueError)):main(mode,root,out)
            self.save(root,reports)
            (root/'browser/report.json').write_text('{}')
            with self.assertRaises(ValueError):main('evidence',root,out)
            self.save(root,reports)
            index=json.loads((root/'evidence/index.json').read_text());index['identity']['head']='stale'
            write(root/'evidence/index.json',index);seal(root/'evidence')
            with self.assertRaises(AssertionError):main('required',root,out)

if __name__=='__main__':unittest.main()
