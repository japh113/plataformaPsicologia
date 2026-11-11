"""Exercise the workflow's real expressions; do not duplicate event predicates."""
import subprocess
import unittest
from pathlib import Path


class Events(unittest.TestCase):
    def test_workflow_event_expressions(self):
        subprocess.run(['node', 'scripts/ci/test-events.cjs'], check=True)

    def test_every_evidence_consumer_has_complete_checkout_and_retention(self):
        source = Path('.github/workflows/ci.yml').read_text()
        self.assertEqual(source.count('fetch-depth: 0'), 3)
        self.assertEqual(source.count('retention-days: 14'), 2)
        self.assertIn('needs: [checks, evidence]', source)
        self.assertIn('contents: read', source)
        self.assertNotIn('write', source)


if __name__ == '__main__':
    unittest.main()
