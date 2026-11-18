"""Static event wiring and real evidence guards, not a GitHub scheduler emulator."""
import re
import subprocess
import unittest
from pathlib import Path

from evidence import require_dependencies

SOURCE = Path('.github/workflows/ci.yml').read_text()
JOBS = dict(re.findall(r'^  (\w+):\n(.*?)(?=^  \w+:|\Z)', SOURCE.split('jobs:\n', 1)[1], re.M | re.S))


class Events(unittest.TestCase):
    def test_all_pr_events_and_main_push_remain_enabled(self):
        self.assertIn('types: [opened, synchronize, reopened, edited]', SOURCE)
        self.assertIn('  pull_request:\n    branches: [main]', SOURCE)
        self.assertIn('  push:\n    branches: [main]', SOURCE)
        self.assertIn('  workflow_dispatch:', SOURCE)
        for prohibited in ['ready_for_review', 'converted_to_draft', 'paths:', 'paths-ignore:']:
            self.assertNotIn(prohibited, SOURCE)

    def test_payload_and_concurrency_expression_units(self):
        # Exercises textual, base and ambiguous edits, open/reopen/sync/main,
        # names and conditions using the expressions actually in the workflow.
        subprocess.run(['node', 'scripts/ci/test-events.cjs'], check=True)

    def test_seven_names_and_real_execution_without_metadata_bypass(self):
        self.assertEqual(set(JOBS), {'checks', 'evidence', 'required'})
        self.assertIn('    name: ci/${{ matrix.component }}', JOBS['checks'])
        self.assertIn('component: [docs, backend-unit, frontend, postgres, browser]', JOBS['checks'])
        self.assertIn('    name: ci/evidence', JOBS['evidence'])
        self.assertIn('    name: ci/required', JOBS['required'])
        for prohibited in ['metadata', 'namespace', 'events.py', 'github.event', 'echo ']:
            # No event-dependent names, conditions, acknowledgments or router.
            self.assertNotIn(prohibited, SOURCE.split('jobs:\n', 1)[1].replace('github.event.before', 'CI_BASE'))
        for job, body in JOBS.items():
            self.assertEqual(re.findall(r'^    if: (.*)$', body, re.M),
                             ['${{ !cancelled() }}' if job == 'checks' else 'always()'])
            steps = re.split(r'^      - ', body, flags=re.M)[1:]
            # Only cleanup/uploads are conditional, always attempting evidence.
            for step in steps:
                if step.startswith('if:'):
                    self.assertTrue(step.startswith('if: always()\n'))
                    self.assertTrue('cleanup.py' in step or 'actions/upload-artifact@' in step)
            self.assertIn('fetch-depth: 0', body)
        self.assertIn('run: python3 scripts/ci/run.py "$CI_COMPONENT"', JOBS['checks'])
        self.assertIn('python3 scripts/ci/evidence.py evidence', JOBS['evidence'])
        self.assertIn('python3 scripts/ci/evidence.py required', JOBS['required'])
        self.assertIn('needs: [checks]', JOBS['evidence'])
        self.assertIn('needs: [checks, evidence]', JOBS['required'])
        self.assertIn('CI_NEEDS: ${{ toJSON(needs) }}', JOBS['required'])

    def test_evidence_retention_permissions_and_no_automatic_cancellation(self):
        self.assertEqual(SOURCE.count('fetch-depth: 0'), 3)
        self.assertEqual(SOURCE.count('retention-days: 14'), 2)
        self.assertIn('contents: read', SOURCE)
        for prohibited in ['write', 'pull_request_target', 'continue-on-error:', 'secrets:']:
            self.assertNotIn(prohibited, SOURCE)
        self.assertIn('cancel-in-progress: false', SOURCE)
        self.assertIn('fail-fast: false', SOURCE)

    def test_required_gate_rejects_every_incomplete_or_unexpected_dependency(self):
        good = {job: {'result': 'success'} for job in ['checks', 'evidence']}
        require_dependencies(good)
        with self.assertRaises(AssertionError):
            require_dependencies(dict(good, unexpected={'result': 'success'}))
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
