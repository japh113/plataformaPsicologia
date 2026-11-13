"""Route event payloads, not PR text or previous check conclusions.

This does not model the Actions scheduler or attest that older checks survive.
Only a well-formed, exclusively textual edited payload gets metadata names.
"""
import json
import os
from pathlib import Path


def namespace(event_name, event):
    if event_name != 'pull_request' or not isinstance(event, dict):
        return 'ci'
    changes = event.get('changes')
    if (event.get('action') != 'edited' or not isinstance(changes, dict)
            or not changes or not set(changes) <= {'title', 'body'}):
        return 'ci'
    for field, change in changes.items():
        if (not isinstance(change, dict) or set(change) != {'from'}
                or not (isinstance(change['from'], str)
                        or field == 'body' and change['from'] is None)):
            return 'ci'
    return 'metadata'


if __name__ == '__main__':
    try:
        event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    except (OSError, ValueError, KeyError):
        event = None
    value = namespace(os.environ.get('GITHUB_EVENT_NAME'), event)
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write('namespace=' + value + '\n')
