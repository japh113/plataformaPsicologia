"""Extract literal test names from a complete, bounded JavaScript AST."""
import json
import os
import subprocess
from functools import lru_cache
from pathlib import Path

MAX_SOURCE_BYTES = 1024 * 1024
PARSER = Path(__file__).with_name('inventory-parser.cjs').resolve()


@lru_cache(maxsize=32)
def _parsed_names(source):
    # Cache only successful complete parses, keyed by content, never by path.
    # No source is executed; Node receives the trusted adapter as its program.
    if len(source) > MAX_SOURCE_BYTES:
        raise ValueError('Test source exceeds parser limit')
    try:
        encoded = source.encode('utf-8')
        if len(encoded) > MAX_SOURCE_BYTES:
            raise ValueError('Test source exceeds parser limit')
        environment = {k: v for k, v in os.environ.items()
                       if k not in {'NODE_OPTIONS', 'NODE_PATH'}}
        result = subprocess.run(
            ['node', '--expose-internals', '--max-old-space-size=64', str(PARSER)],
            input=encoded, capture_output=True, timeout=10, env=environment)
        if result.returncode:
            raise ValueError('JavaScript inventory parser rejected source or runtime')
        names = json.loads(result.stdout)
        if not isinstance(names, list) or any(not isinstance(n, str) for n in names):
            raise ValueError('Invalid JavaScript inventory parser response')
        return tuple(names)
    except (OSError, subprocess.TimeoutExpired, UnicodeError, json.JSONDecodeError):
        raise ValueError('JavaScript inventory parser unavailable or invalid') from None


def test_names(source):
    """Yield legacy-normalized names only after the entire source is accepted.

    Dynamic names stay outside this static contract. Malformed syntax, composed
    literal names, unavailable pinned runtime and resource failures reject the
    whole file. There is deliberately no lexical fallback.
    """
    yield from _parsed_names(source)
