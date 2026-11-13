"""Disposable experiment A for PR #68; never merge this fixture.

The real ci/docs component discovers this test. Its ordinary failure must stay
blocking after metadata edits and Draft/Ready transitions. No reports are forged.
"""
import unittest


class RemoteRegressionProbe(unittest.TestCase):
    def test_expected_failure_remains_required(self):
        self.fail('Authorized disposable CI regression experiment A')


if __name__ == '__main__':
    unittest.main()
