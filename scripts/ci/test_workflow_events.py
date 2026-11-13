"""Payload units and static wiring checks, not a GitHub scheduler emulator."""
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from events import namespace
from evidence import require_dependencies

SOURCE = Path('.github/workflows/ci.yml').read_text()
JOBS = dict(re.findall(r'^  (route|checks|evidence|required):\n(.*?)(?=^  \w+:|\Z)', SOURCE, re.M | re.S))


class Events(unittest.TestCase):
    def test_text_only_payloads(self):
        for changes in [{'title': {'from': 'old'}}, {'body': {'from': ''}},
                        {'body': {'from': None}},
                        {'title': {'from': 'old'}, 'body': {'from': 'old'}}]:
            with self.subTest(changes=changes):
                self.assertEqual(namespace('pull_request', {'action': 'edited', 'changes': changes}), 'metadata')

    def test_real_and_ambiguous_changes_validate(self):
        for changes in [None, {}, [], 'title', {'title': {}}, {'title': None},
                        {'title': {'from': None}}, {'body': {'from': []}},
                        {'title': {'from': 'old', 'unknown': True}},
                        {'base': {'ref': {'from': 'other'}}},
                        {'base': {'sha': {'from': 'old'}}, 'title': {'from': 'old'}},
                        {'base': {}, 'body': {'from': ''}},
                        {'unknown': {}, 'title': {'from': 'old'}}]:
            with self.subTest(changes=changes):
                self.assertEqual(namespace('pull_request', {'action': 'edited', 'changes': changes}), 'ci')

    def test_documentary_and_technical_open_commit_reopen_push_and_manual(self):
        # File classification is independently tested against real Git histories.
        # Event routing must never select docs or infer it from a PR title.
        for event_name, action in [('pull_request', 'opened'), ('pull_request', 'synchronize'),
                                   ('pull_request', 'reopened'), ('push', None),
                                   ('workflow_dispatch', None), ('unknown', None)]:
            for title in ['docs: allowed markdown', 'technical change']:
                with self.subTest(event=event_name, action=action, title=title):
                    self.assertEqual(namespace(event_name, {'action': action, 'title': title}), 'ci')

    def test_metadata_policy_never_uses_previous_pass_failure_or_draft_state(self):
        for status in ['success', 'failure', 'cancelled', 'in_progress', 'skipped']:
            for draft in [True, False]:
                event = {'action': 'edited', 'changes': {'title': {'from': 'old'}},
                         'pull_request': {'draft': draft}, 'previous_result': status}
                self.assertEqual(namespace('pull_request', event), 'metadata')
        self.assertIn('types: [opened, synchronize, reopened, edited]', SOURCE)
        self.assertNotIn('ready_for_review', SOURCE)
        self.assertNotIn('converted_to_draft', SOURCE)

    def test_router_entrypoint_and_unreadable_or_malformed_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            event = Path(directory)/'event.json'
            output = Path(directory)/'output'
            for content, expected in [('bad json', 'ci'), ('null', 'ci'),
                                      (json.dumps({'action': 'edited', 'changes': {'body': {'from': ''}}}), 'metadata')]:
                event.write_text(content)
                output.write_text('')
                with patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'pull_request',
                                             'GITHUB_EVENT_PATH': str(event), 'GITHUB_OUTPUT': str(output)}):
                    subprocess.run([sys.executable, '-B', 'scripts/ci/events.py'], check=True)
                self.assertEqual(output.read_text(), 'namespace='+expected+'\n')
            event.unlink()
            output.write_text('')
            with patch.dict(os.environ, {'GITHUB_EVENT_PATH': str(event), 'GITHUB_OUTPUT': str(output)}):
                subprocess.run([sys.executable, '-B', 'scripts/ci/events.py'], check=True)
            self.assertEqual(output.read_text(), 'namespace=ci\n')

    def test_workflow_expression_units(self):
        subprocess.run(['node', 'scripts/ci/test-events.cjs'], check=True)

    def test_metadata_does_not_gate_jobs_and_collectors_remain_unconditional(self):
        self.assertEqual(set(JOBS), {'route', 'checks', 'evidence', 'required'})
        self.assertEqual(re.findall(r'^    if:', JOBS['route'], re.M), [])
        # Matrix work is cancelable; collectors still attempt to record rejection.
        conditions = {'checks': '${{ !cancelled() }}',
                      'evidence': 'always()', 'required': 'always()'}
        for job in ['checks', 'evidence', 'required']:
            body = JOBS[job]
            with self.subTest(job=job):
                actual = re.findall(r'^    if: (.*)$', body, re.M)
                self.assertEqual(actual, [conditions[job]])
                self.assertIn('route', body.split('needs: [')[1].split(']')[0])
                self.assertIn("needs.route.outputs.namespace || 'ci'", body)
                self.assertIn("ROUTE_RESULT: ${{ needs.route.result }}", body)
                steps = re.split(r'^      - ', body, flags=re.M)[1:]
                self.assertEqual(len([s for s in steps if s.startswith('name: Require successful event routing')]), 1)
                self.assertEqual(len([s for s in steps if s.startswith('name: Acknowledge metadata')]), 1)
                for step in steps[2:]:
                    self.assertIn("needs.route.outputs.namespace != 'metadata'", step)
                # Metadata must not make the job condition false before matrix
                # expansion. Cancellation semantics are unit-checked in JS.
                self.assertNotIn('github.event', actual[0])

    def test_actual_routing_guards_reject_failed_router_or_missing_output(self):
        # Execute the trusted guard from each job, not a copy of its predicate.
        # This tests explicit rejection after scheduling, not GitHub scheduling.
        for job, body in JOBS.items():
            if job == 'route':
                continue
            command = re.search(r'^        run: (python3 -c .*)$', body, re.M)[1]
            for result, value, accepted in [('success', 'ci', True),
                                            ('success', 'metadata', True),
                                            ('success', '', False),
                                            ('success', 'unknown', False),
                                            ('', 'ci', False),
                                            ('failure', '', False),
                                            ('failure', 'ci', False),
                                            ('failure', 'metadata', False),
                                            ('cancelled', 'ci', False),
                                            ('skipped', 'metadata', False)]:
                with self.subTest(job=job, result=result, namespace=value), patch.dict(
                        os.environ, {'ROUTE_RESULT': result, 'CI_NAMESPACE': value}):
                    outcome = subprocess.run(shlex.split(command), capture_output=True)
                    self.assertEqual(outcome.returncode == 0, accepted)

    def test_evidence_checkout_retention_and_permissions(self):
        self.assertEqual(SOURCE.count('fetch-depth: 0'), 3)
        self.assertEqual(SOURCE.count('retention-days: 14'), 2)
        self.assertIn('needs: [route, checks, evidence]', SOURCE)
        self.assertIn('contents: read', SOURCE)
        for prohibited in ['write', 'pull_request_target', 'paths-ignore:', 'continue-on-error:', 'secrets:']:
            self.assertNotIn(prohibited, SOURCE)
        self.assertIn('cancel-in-progress: true', SOURCE)
        self.assertIn('fail-fast: false', SOURCE)

    def test_required_gate_rejects_routing_failure_and_every_incomplete_dependency(self):
        good = {job: {'result': 'success'} for job in ['route', 'checks', 'evidence']}
        require_dependencies(good)
        for job in good:
            missing = dict(good)
            del missing[job]
            with self.assertRaises(AssertionError):
                require_dependencies(missing)
            for status in ['failure', 'cancelled', 'skipped', 'neutral', 'unknown', '']:
                with self.subTest(job=job, status=status), self.assertRaises(AssertionError):
                    require_dependencies(dict(good, **{job: {'result': status}}))


if __name__ == '__main__':
    unittest.main()
