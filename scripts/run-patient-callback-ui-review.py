"""Issue 21 final callback audit Chromium checks on a newly created patient-follow-up-demo UUID.

Run after the isolated demo wrapper succeeds; never targets the habitual stack.
Only creates/removes its own labeled browser image/container. Evidence goes to
ignored tmp/issue21-null-selection. The demo lifecycle remains owned by clinical-episodes.sh.
"""
import json, os, re, subprocess, sys, uuid
from pathlib import Path
import episode_images

if len(sys.argv) != 2 or not re.fullmatch(r'[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}', sys.argv[1]):
    raise SystemExit('Usage: python3 scripts/run-patient-callback-ui-review.py NEW_DEMO_UUID')
run = sys.argv[1]
project = 'psicopanel-episodes-' + run
episode_images.read_state(project)
env = dict(os.environ, EPISODE_TEST_RUN_ID=run)
compose = ['docker', 'compose', '-p', project, '-f', 'compose.episodes-test.yaml']
work = Path('tmp/issue21-null-selection').resolve()
work.mkdir(parents=True, exist_ok=True)
assert work.is_relative_to(Path.cwd().resolve() / 'tmp')
for service in ['api', 'frontend']:
    cid = subprocess.check_output(compose + ['ps', '-q', service], env=env, text=True).strip()
    info = json.loads(subprocess.check_output(['docker', 'inspect', cid]))[0]
    assert info['Config']['Labels']['com.docker.compose.project'] == project
    if service == 'api':
        assert 'EPISODE_TEST_RUN_ID=' + run in info['Config']['Env']
        assert 'PGDATABASE=psicopanel_episode_demo' in info['Config']['Env']
        assert 'NODE_ENV=development' in info['Config']['Env']
    else:
        address = info['NetworkSettings']['Networks'][project + '_app']['IPAddress']
def invoke(args):
    subprocess.run(args, check=True, env=env)
# Unit tests run in the own new demo image, never in the habitual frontend.
for task in ['test', 'lint', 'build']:
    invoke(compose + ['--profile', 'demo', 'run', '--rm', '--no-deps', '-v', str(Path('frontend/test').resolve()) + ':/app/test:ro', 'frontend', 'npm', 'run', task])
versions = json.loads(Path('scripts/ci/versions.json').read_text())
review = str(uuid.uuid4())
label = 'io.psicopanel.issue21.null-selection.review'
tag = 'psicopanel-issue21-null-selection-browser-' + review + ':isolated'
dockerfile = work / 'browser.Dockerfile'
dockerfile.write_text('FROM ' + versions['browserImage'] + '\nWORKDIR /review\nCOPY package*.json ./\nRUN npm ci --ignore-scripts\nLABEL ' + label + '=' + review + '\n')
assert subprocess.run(['docker', 'image', 'inspect', tag], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0
try:
    invoke(['docker', 'build', '-t', tag, '-f', str(dockerfile), 'scripts/ci/browser'])
    info = json.loads(subprocess.check_output(['docker', 'image', 'inspect', tag]))[0]
    assert info['Config']['Labels'][label] == review
    for driver in ['scripts/app-null-selection-ui-review.cjs', 'scripts/follow-up-ui-review.cjs', 'scripts/follow-up-recovery-ui-review.cjs', 'scripts/patient-callback-ui-review.cjs']:
        invoke(['docker', 'run', '--rm', '--init', '--label', label + '=' + review,
                '--network', project + '_app', '--user', str(os.getuid()) + ':' + str(os.getgid()),
                '--read-only', '--tmpfs', '/tmp:size=1g,mode=1777', '--shm-size=1g',
                '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '-e', 'HOME=/tmp',
                '-e', 'FRONTEND_IP=' + address, '-v', str(work) + ':/work',
                '-v', str(Path(driver).resolve()) + ':/review/driver.cjs:ro',
                tag, 'node', '/review/driver.cjs'])
finally:
    inspected = subprocess.run(['docker', 'image', 'inspect', tag], capture_output=True, text=True)
    if inspected.returncode == 0:
        assert json.loads(inspected.stdout)[0]['Config']['Labels'][label] == review
        invoke(['docker', 'image', 'rm', tag])
