"""Authorized disposable experiment B fixture for PR #69; never merge.

This replaces experiment A only in the authorized experimental branch.
The real main checkout waits at most 120 seconds; nested local fixtures do not.
"""
import os
import time
import unittest
from pathlib import Path


class RemoteRegressionProbe(unittest.TestCase):
    def test_bounded_window_for_synchronize_cancellation(self):
        workspace = os.environ.get('GITHUB_WORKSPACE')
        if (os.environ.get('GITHUB_ACTIONS') == 'true' and workspace
                and Path.cwd().resolve() == Path(workspace).resolve()):
            time.sleep(120)


if __name__ == '__main__':
    unittest.main()
