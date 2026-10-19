import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import docs
from common import JOBS,accept,identity,inventory,parse_tap,scan,seal,verify
from sandbox import destination,validate,episode_images

class Contracts(unittest.TestCase):
    def test_aggregator_rejects_every_non_success_and_missing_or_stale_evidence(self):
        reports={j:{'job':j,'identity':identity(),'status':'success','suites':[{}]} for j in JOBS}
        needs={j:{'result':'success'} for j in JOBS};self.assertTrue(accept(needs,reports))
        for job in JOBS:
            for status in ['failure','cancelled','skipped','neutral','unknown','']:
                bad=copy.deepcopy(needs);bad[job]['result']=status
                with self.subTest(job=job,status=status),self.assertRaises(ValueError):accept(bad,reports)
            bad=copy.deepcopy(reports);del bad[job]
            with self.assertRaises(ValueError):accept(needs,bad)
            bad=copy.deepcopy(reports);bad[job]['identity']['attempt']='obsolete'
            with self.assertRaises(ValueError):accept(needs,bad)
    def test_tap_rejectable_fail_skip_cancel_and_empty(self):
        for body,key in [('not ok 1 - injected failure','failed'),('ok 1 - opt-in disabled # SKIP','skipped'),('# cancelled 1','cancelled')]:
            self.assertGreater(parse_tap(body)[key],0)
        self.assertFalse(parse_tap('npm exited zero without tests')['tests'])
    def test_broken_document_and_fragment(self):
        with self.assertRaises(ValueError):docs.check_link(Path('README.md'),'ci-nonexistent.md')
        with self.assertRaises(ValueError):docs.check_link(Path('README.md'),'README.md#ci-missing-fragment')
    def test_sanitization_sensitive_fixtures(self):
        for fixture in ['{"otp":"123456"}','{"candidate":"fictitious@ci.invalid"}','Bearer dummy-fixture','CI_SENSITIVE_FIXTURE','ghp_abcdefghijklmnopqrstuvwxyz']:
            with self.assertRaises(ValueError):scan(fixture.encode())
    def test_artifact_missing_tamper_and_allowlist(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp);(path/'report.json').write_text('{"safe":true}')
            seal(path);verify(path);original=(path/'SHA256SUMS').read_bytes();(path/'report.json').write_text('{}')
            with self.assertRaises(ValueError):verify(path)
            self.assertEqual(original,(path/'SHA256SUMS').read_bytes())
            (path/'.env').write_text('fixture')
            with self.assertRaises(ValueError):seal(path)
    def test_external_existing_and_optin_destination(self):
        env={'PGHOST':'db','PGDATABASE':'psicopanel_integrity_test','NODE_ENV':'test','RUN_EPISODE_INTEGRATION':'true','RUN_AUTH_INTEGRATION':'true','RUN_CLINICAL_INTEGRATION':'true','VERIFICATION_DELIVERY':'simulated','EPISODE_TEST_RUN_ID':'12345678-1234-1234-1234-123456789abc'}
        destination(env)
        for key,value in [('PGHOST','production.invalid'),('PGDATABASE','psicopanel'),('DATABASE_URL','postgres://external.invalid/db'),('RUN_AUTH_INTEGRATION','false'),('NODE_ENV','production')]:
            with self.subTest(key=key),self.assertRaises(AssertionError):destination(dict(env,**{key:value}))
        info={'Config':{'Labels':{'com.docker.compose.project':'own'}},'HostConfig':{'Tmpfs':{'/var/lib/postgresql/data':''},'PortBindings':{}},'Mounts':[]}
        network={'Internal':True,'Labels':{'com.docker.compose.project':'own'}}
        validate(info,network,'own')
        with self.assertRaises(AssertionError):validate(info,network,'existing-other-project')
        with self.assertRaises(AssertionError):validate(info,dict(network,Internal=False),'own')

    def test_protected_decision_blocks_and_rule_rows(self):
        for doc,identifiers in [('docs/product/decisions.md',['ADR-029','AB-25']),('docs/product/business-rules.md',['RN-59','RN-60','RN-61'])]:
            original=Path(doc).read_text()
            for identifier in identifiers:
                docs.protect(original,original,identifier)
                changed=original.replace('| '+identifier+' |','| '+identifier+'-injected |') if identifier.startswith('RN') else original.replace('## '+identifier,'## CI-INJECTED-'+identifier)
                if identifier=='AB-25':changed=original.replace('### Resoluci'+chr(243)+'n AB-25','### CI-INJECTED')
                with self.subTest(identifier=identifier),self.assertRaises(ValueError):docs.protect(original,changed,identifier)

    def test_partial_tap_or_declared_case_omission_is_rejected(self):
        self.assertFalse(parse_tap('ok 1 - first')['complete'])
        self.assertFalse(parse_tap('ok 1 - first\n# tests 2\n# duration_ms 1')['complete'])
        self.assertTrue(parse_tap('ok 1 - first\n# tests 1\n# duration_ms 1')['complete'])
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'declared.test.js';source.write_text("test('first',()=>{});test('second',()=>{});")
            with self.assertRaises(ValueError):inventory({'tests':[{'name':'first','status':'passed'}]},[source])

    def test_ci_names_are_bound_to_run_attempt_and_uuid(self):
        run='12345678-1234-1234-1234-123456789abc'
        with patch.dict('os.environ',{'GITHUB_RUN_ID':'12345','GITHUB_RUN_ATTEMPT':'2'}):
            suffix=episode_images.execution_suffix(run)
            self.assertEqual(suffix,'ci-12345-2-'+run)
            self.assertEqual(len(episode_images.expected_images('psicopanel-episodes-'+suffix)),2)
        with patch.dict('os.environ',{'GITHUB_RUN_ID':'external','GITHUB_RUN_ATTEMPT':'2'}):
            with self.assertRaises(ValueError):episode_images.execution_suffix(run)
