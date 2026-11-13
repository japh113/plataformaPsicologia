"""Real Git histories and real evidence consumers, without DBs or browsers."""
import copy
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import classification
from common import JOBS, accept, identity, seal, write
from evidence import collect

ROOT = Path(__file__).resolve().parents[2]


@contextmanager
def repository(complete=False):
    previous = Path.cwd()
    with tempfile.TemporaryDirectory(prefix='ci-classification-') as tmp:
        root = Path(tmp)
        if complete:
            names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).split(b'\0')
            for name in names:
                if not name:
                    continue
                path = Path(os.fsdecode(name))
                (root/path).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT/path, root/path)
            shutil.copytree(ROOT/'scripts/ci', root/'scripts/ci', dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns('__pycache__', 'test_classification.py'))
            # Do not recursively invoke this end-to-end fixture from its own
            # documentation run. All other existing CI tests execute unmodified.
            (root/'scripts/ci/test_classification.py').unlink(missing_ok=True)
        else:
            for name in ['README.md', 'NOTES.md', 'docs/product/vision.md', 'backend/src/example.js']:
                path = root/name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(name+' initial\n')
        os.chdir(root)
        env = {'GITHUB_EVENT_NAME': 'pull_request', 'GITHUB_RUN_ID': '12345',
               'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_EVENT_PATH': str(root/'event.json')}
        with patch.dict(os.environ, env):
            git('init', '-q')
            git('config', 'user.name', 'CI fixture')
            git('config', 'user.email', 'fixture@ci.invalid')
            git('add', '.')
            git('commit', '-qm', 'fixture baseline')
            base = git('rev-parse', 'HEAD')
            try:
                yield root, base
            finally:
                os.chdir(previous)


def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.PIPE, text=True).strip()


def commit():
    # Explicit paths avoid committing the event payload or evidence fixtures.
    git('add', '-u')
    git('add', 'docs', 'backend')
    git('commit', '--allow-empty', '-qm', 'fixture head')
    return git('rev-parse', 'HEAD')


def merge_event(base, head=None):
    head = head or commit()
    merge = git('commit-tree', git('rev-parse', head+'^{tree}'), '-p', base, '-p', head, '-m', 'test merge')
    git('checkout', '-q', '--detach', merge)
    event = {'pull_request': {'head': {'sha': head}, 'base': {'sha': base}}}
    Path(os.environ['GITHUB_EVENT_PATH']).write_text(json.dumps(event))
    os.environ['GITHUB_SHA'] = merge
    return merge


class Classification(unittest.TestCase):
    def test_allowed_markdown_across_all_commits(self):
        with repository() as (_, base):
            Path('README.md').write_text('first\n'); commit()
            Path('docs/product/vision.md').write_text('second\n'); merge_event(base)
            result = classification.classify()
            self.assertEqual(result['mode'], 'docs')
            self.assertEqual({r['path'] for r in result['prChanges']}, {'README.md', 'docs/product/vision.md'})

    def test_mixed_technical_operational_security_and_unlisted_paths(self):
        for path in ['backend/src/example.js', 'frontend/src/App.jsx', '.github/workflows/ci.yml',
                     'scripts/ci/run.py', 'backend/sql/migrations/013.sql', 'backend/package.json',
                     'frontend/package-lock.json', 'compose.yaml', 'AGENTS.md',
                     'docs/ci-implementation.md', 'docs/security-codeql-triage.md', 'docs/new.md']:
            with self.subTest(path=path), repository() as (_, base):
                Path('README.md').write_text('documentation\n')
                target = Path(path); target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('technical\n'); git('add', path)
                merge_event(base)
                self.assertEqual(classification.classify()['mode'], 'full')

    def test_deleted_and_added_allowed_files(self):
        with repository() as (_, base):
            Path('NOTES.md').unlink()
            Path('docs/README.md').write_text('added\n')
            merge_event(base)
            result = classification.classify()
            self.assertEqual(result['mode'], 'docs')
            self.assertEqual({r['status'] for r in result['prChanges']}, {'A', 'D'})

    def test_renames_check_both_endpoints(self):
        for source, target, expected in [
            ('README.md', 'NOTES.md', 'docs'),
            ('backend/src/example.js', 'docs/product/vision.md', 'full'),
            ('README.md', 'backend/new.md', 'full')]:
            with self.subTest(source=source, target=target), repository() as (_, base):
                Path(target).parent.mkdir(parents=True, exist_ok=True)
                Path(source).replace(target); git('add', target)
                merge_event(base)
                result = classification.classify()
                self.assertEqual(result['mode'], expected)
                self.assertIn(source, [r['path'] for r in result['prChanges']])
                self.assertIn(target, [r['path'] for r in result['prChanges']])

    def test_symlinks_and_executable_markdown_are_full(self):
        for symbolic in [True, False]:
            with self.subTest(symbolic=symbolic), repository() as (_, base):
                if symbolic:
                    Path('README.md').unlink(); Path('README.md').symlink_to('backend/src/example.js')
                else:
                    Path('README.md').chmod(0o755)
                merge_event(base)
                self.assertEqual(classification.classify()['mode'], 'full')

    def test_empty_diff_invalid_payload_missing_objects_and_git_error_are_full(self):
        with repository() as (_, base):
            merge_event(base)
            self.assertEqual(classification.classify()['mode'], 'full')
            Path('event.json').write_text('{')
            self.assertEqual(classification.classify()['mode'], 'full')
            with patch('classification.git', side_effect=subprocess.CalledProcessError(1, 'git')):
                self.assertEqual(classification.classify()['mode'], 'full')
            Path('event.json').write_text(json.dumps({'pull_request': {'base': {'sha': 'a'*40}, 'head': {'sha': 'b'*40}}}))
            self.assertEqual(classification.classify()['mode'], 'full')

    def test_push_manual_unknown_events_are_full(self):
        for event in ['push', 'workflow_dispatch', '', 'pull_request_target']:
            with self.subTest(event=event), patch.dict(os.environ, {'GITHUB_EVENT_NAME': event}):
                self.assertEqual(classification.classify()['mode'], 'full')

    def test_stale_checkout_and_changed_base_are_full(self):
        with repository() as (_, base):
            Path('README.md').write_text('docs\n'); merge_event(base)
            event = json.loads(Path('event.json').read_text())
            event['pull_request']['base']['sha'] = event['pull_request']['head']['sha']
            Path('event.json').write_text(json.dumps(event))
            self.assertEqual(classification.classify()['mode'], 'full')
            os.environ['GITHUB_SHA'] = base
            self.assertEqual(classification.classify()['mode'], 'full')

    def test_effective_merge_changes_are_also_checked(self):
        with repository() as (_, base):
            Path('README.md').write_text('docs\n'); head = commit()
            Path('backend/src/example.js').write_text('injected merge resolution\n')
            git('add', '-u'); tree = git('write-tree')
            merge = git('commit-tree', tree, '-p', base, '-p', head, '-m', 'resolution')
            git('checkout', '-q', '--detach', merge)
            os.environ['GITHUB_SHA'] = merge
            Path('event.json').write_text(json.dumps({'pull_request': {'head': {'sha': head}, 'base': {'sha': base}}}))
            self.assertEqual(classification.classify()['mode'], 'full')

    def test_new_base_commits_do_not_change_pr_ancestry_or_hide_technical_head(self):
        with repository() as (_, original):
            Path('backend/src/example.js').write_text('head technical\n'); head = commit()
            git('checkout', '-q', '--detach', original)
            Path('NOTES.md').write_text('base documentation\n'); base = commit()
            git('merge', '--no-ff', '-qm', 'test merge', head)
            os.environ['GITHUB_SHA'] = git('rev-parse', 'HEAD')
            Path('event.json').write_text(json.dumps({'pull_request': {'head': {'sha': head}, 'base': {'sha': base}}}))
            self.assertEqual(classification.classify()['mode'], 'full')

    def test_false_docs_classification_and_bad_not_applicable_reports_rejected(self):
        with repository() as (_, base):
            Path('backend/src/example.js').write_text('code\n'); merge_event(base)
            false = dict(classification.classify(), mode='docs')
            reports = {j: {'job': j, 'identity': identity(), 'status': 'not_applicable',
                          'suites': [], 'isolation': [], 'classification': false,
                          'reason': 'verified-documentation-only'} for j in JOBS}
            needs = {j: {'result': 'success'} for j in JOBS}
            with self.assertRaises(ValueError):
                accept(needs, reports)
            for job in JOBS:
                target = Path('artifacts')/job
                write(target/'report.json', reports[job]); seal(target)
            with self.assertRaises(AssertionError):
                collect(Path('artifacts'))

    def test_documentary_pipeline_real_reports_and_negative_gate(self):
        with repository(complete=True) as (_, base):
            Path('README.md').write_text(Path('README.md').read_text()+'\nCI documentation fixture.\n')
            merge_event(base)
            for job in JOBS:
                executed = subprocess.run(['python3', '-B', 'scripts/ci/run.py', job], capture_output=True)
                self.assertEqual(executed.returncode, 0, executed.stdout.decode() + executed.stderr.decode() + str(list(Path('tmp/ci-private').glob('*.log'))))
            shutil.copytree('tmp/ci-export', 'tmp/ci-download')
            needs = {'route': {'result': 'success'}, 'checks': {'result': 'success'}, 'evidence': {'result': 'success'}}
            with patch.dict(os.environ, {'CI_NEEDS': json.dumps(needs)}):
                subprocess.run(['python3', '-B', 'scripts/ci/evidence.py', 'evidence'], check=True, capture_output=True)
                shutil.copytree('tmp/ci-export/evidence', 'tmp/ci-download/evidence')
                required = ['python3', '-B', 'scripts/ci/evidence.py', 'required']
                subprocess.run(required, check=True, capture_output=True)
                docs = Path('tmp/ci-download/docs/report.json')
                original = docs.read_bytes()
                report = json.loads(original)
                self.assertEqual(len(report['suites']), 2)
                for mutation in [lambda r: r.update(status='failure'), lambda r: r.update(suites=[]),
                                 lambda r: r['identity'].update(head='obsolete'),
                                 lambda r: r['identity'].update(base='obsolete'),
                                 lambda r: r['identity'].update(sha='obsolete'),
                                 lambda r: r['identity'].update(run='obsolete'),
                                 lambda r: r['identity'].update(attempt='obsolete'),
                                 lambda r: r['classification'].update(mode='full'),
                                 lambda r: r['suites'][1].update(exit=1),
                                 lambda r: r['suites'][0].update(protectedDecisions='changed')]:
                    bad = copy.deepcopy(report); mutation(bad)
                    write(docs, bad); seal(docs.parent)
                    self.assertNotEqual(subprocess.run(required, capture_output=True).returncode, 0)
                docs.write_bytes(original); seal(docs.parent)
                for job in JOBS[1:]:
                    path = Path('tmp/ci-download')/job/'report.json'
                    good = json.loads(path.read_text())
                    self.assertEqual(good['status'], 'not_applicable')
                    self.assertEqual(good['suites'], [])
                    self.assertEqual({p.name for p in path.parent.iterdir()}, {'report.json', 'SHA256SUMS'})
                    for status in ['success', 'failure', 'cancelled', 'skipped', '']:
                        write(path, dict(good, status=status)); seal(path.parent)
                        self.assertNotEqual(subprocess.run(required, capture_output=True).returncode, 0)
                    for alteration in [{'suites': [{}]}, {'isolation': [{}]}, {'reason': 'unverified'}]:
                        write(path, dict(good, **alteration)); seal(path.parent)
                        self.assertNotEqual(subprocess.run(required, capture_output=True).returncode, 0)
                    write(path, good); seal(path.parent)
                index = Path('tmp/ci-download/evidence/index.json')
                original_index = index.read_bytes()
                write(index, dict(json.loads(original_index), retentionDays=13)); seal(index.parent)
                self.assertNotEqual(subprocess.run(required, capture_output=True).returncode, 0)
                index.write_bytes(original_index); seal(index.parent)
                for dependency in needs:
                    for status in ['failure', 'cancelled', 'skipped']:
                        bad = copy.deepcopy(needs); bad[dependency]['result'] = status
                        with patch.dict(os.environ, {'CI_NEEDS': json.dumps(bad)}):
                            self.assertNotEqual(subprocess.run(required, capture_output=True).returncode, 0)
                docs.unlink()
                self.assertNotEqual(subprocess.run(required, capture_output=True).returncode, 0)


if __name__ == '__main__':
    unittest.main()
