"""Independent required browser inventory; missing, duplicate and stale evidence fails."""
import json
from pathlib import Path
KINDS=['B','C','D2']
def validate_cases(kind,cases):
    expected=set(json.loads(Path('scripts/ci/browser-cases.json').read_text())[kind])
    ids=[case['id'] for case in cases]
    if set(ids)!=expected or len(ids)!=len(expected) or any(case['status']!='PASS' for case in cases):
        raise ValueError('Missing, duplicate or failed browser case: '+kind)
def validate_suites(suites,revision):
    if [suite['kind'] for suite in suites]!=KINDS:raise ValueError('Missing browser suite')
    for suite in suites:
        validate_cases(suite['kind'],suite['cases'])
        if suite['runtime']['revision']!=revision:raise ValueError('Stale browser revision')
