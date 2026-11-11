"""Conservative PR classification, recomputed from Git by every consumer.

No API file-list pagination, labels, titles, caller-supplied mode or cached output.
Renames are deliberately represented as deletion + addition, checking both paths.
"""
import json
import os
import re
import subprocess
from pathlib import Path

# Human-readable product/history/index files, with no executable consumers in
# the repository. Technical/security/operational Markdown (including AGENTS)
# stays full. New documents require an explicit reviewed allowlist change.
DOCUMENTS = frozenset({
    'README.md', 'NOTES.md', 'docs/README.md',
    'docs/archive/notes-2026-04-13.md', 'docs/couple-clinical-evidence.md',
    'docs/documentation-audit.md', 'docs/documentation-inventory.md',
    'docs/operational-status.md', 'docs/project-checkpoint.md',
    'docs/product/vision.md', 'docs/product/roadmap.md',
    'docs/product/decisions.md', 'docs/product/business-rules.md',
    'docs/parallel-couple-episodes.md',
    'docs/identity-directory-delivery-plan.md',
    'docs/stage2a-identity-directory-intake.md',
})


def git(*args):
    return subprocess.check_output(
        ['git', *args], stderr=subprocess.PIPE, timeout=30)


def changes(start, end):
    raw = git('diff', '--raw', '--no-abbrev', '-z', '--no-renames',
              '--no-ext-diff', '--no-textconv', start, end, '--')
    if not raw or not raw.endswith(b'\0'):
        raise ValueError('Empty or incomplete diff')
    fields = raw[:-1].split(b'\0')
    if len(fields) % 2:
        raise ValueError('Malformed raw diff')
    result = []
    for i in range(0, len(fields), 2):
        old, new, old_sha, new_sha, status = fields[i].decode('ascii').split()
        old = old.removeprefix(':')
        path = fields[i+1].decode('utf-8', errors='strict')
        if status not in {'A', 'M', 'D', 'T'} or not path:
            raise ValueError('Ambiguous file status')
        result.append({'path': path, 'status': status,
                       'oldMode': old, 'newMode': new})
    return result


def documentation_only(records):
    return bool(records) and all(
        r['path'] in DOCUMENTS and r['status'] in {'A', 'M', 'D'}
        and r['oldMode'] in {'000000', '100644'}
        and r['newMode'] in {'000000', '100644'} for r in records)


def classify():
    result = {'version': 1, 'mode': 'full', 'reason': 'non-pr',
              'prChanges': [], 'mergeChanges': []}
    if os.environ.get('GITHUB_EVENT_NAME') != 'pull_request':
        return result
    try:
        event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
        pr = event['pull_request']
        base, head = pr['base']['sha'], pr['head']['sha']
        merge = os.environ['GITHUB_SHA']
        if not all(re.fullmatch(r'[0-9a-f]{40}', x) for x in (base, head, merge)):
            raise ValueError('Invalid revision')
        if git('rev-parse', 'HEAD').decode().strip() != merge:
            raise ValueError('Checkout is not the event merge')
        if git('show', '-s', '--format=%P', merge).decode().split() != [base, head]:
            raise ValueError('Merge parents do not match event base and head')
        ancestor = git('merge-base', '--all', base, head).decode().split()
        if len(ancestor) != 1:
            raise ValueError('Ambiguous ancestry')
        result['prChanges'] = changes(ancestor[0], head)
        result['mergeChanges'] = changes(base, merge)
        result['reason'] = 'technical-or-unapproved-path'
        if all(documentation_only(result[key]) for key in ['prChanges', 'mergeChanges']):
            result.update(mode='docs', reason='verified-documentation-only')
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        result.update(mode='full', reason='classification-unavailable')
    return result


if __name__ == '__main__':
    print(json.dumps(classify(), indent=2))
