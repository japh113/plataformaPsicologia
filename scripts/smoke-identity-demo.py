#!/usr/bin/env python3
# Local HTTP smoke test: only a verified identity-demo UUID, never habitual services.
import json, os, re, subprocess, sys, urllib.request, urllib.error, uuid

run_id = sys.argv[1] if len(sys.argv) == 2 else ''
if not re.fullmatch(r'[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}', run_id):
    raise SystemExit('Usage: python3 scripts/smoke-identity-demo.py DEMO_UUID')
project = 'psicopanel-episodes-' + run_id
subprocess.run(['python3','scripts/episode_images.py','validate-state',project], check=True)
demo_env = dict(os.environ, EPISODE_TEST_RUN_ID=run_id)
compose = ['docker','compose','-p',project,'-f','compose.episodes-test.yaml']
def command(*args):
    return subprocess.check_output(compose + list(args), env=demo_env, text=True).strip()
api_id = command('ps','-q','api')
info = json.loads(subprocess.check_output(['docker','inspect',api_id], text=True))[0]
assert info['Config']['Labels']['com.docker.compose.project'] == project
assert 'NODE_ENV=development' in info['Config']['Env']
assert 'PGDATABASE=psicopanel_episode_demo' in info['Config']['Env']
base = 'http://' + command('port','api','5000') + '/api'
email = 'smoke-' + uuid.uuid4().hex + '@identity.invalid'
password = 'Disposable-Smoke-Only-472!'
def request(path, token=None, method='GET', body=None, expected=200):
    headers = {'Content-Type':'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base+path, headers=headers, method=method,
        data=None if body is None else json.dumps(body).encode())
    try: response = urllib.request.urlopen(req)
    except urllib.error.HTTPError as error: response = error
    assert response.status == expected, (path,response.status,response.read().decode())
    return json.load(response)
def mailbox(channel):
    # Intended recipient's simulated message, decrypted by private local CLI, never logged.
    messages = [json.loads(line) for line in command('exec','-T','api','node','scripts/read-verification-mailbox.js',email).splitlines()]
    return [message for message in messages if message['channel']==channel][-1]['secret']
payload = dict(firstName='Visual',lastName='Demo',email=email,password=password,birthDate='1990-01-01',phone='+525500000008')
request('/auth/register/patient', method='POST', body=payload, expected=202)
session = request('/auth/login', method='POST',body=dict(email=email,password=password))['data']
second = request('/auth/login', method='POST',body=dict(email=email,password=password))['data']
token = session['token']
request('/auth/psychologists/available',token,expected=403)
assert request('/auth/care-relationships',token)['data'] == []
request('/auth/users',token,expected=403)
request('/auth/verification/sms/request',token,'POST',{},409)
request('/auth/verification/email/request',token,'POST',{})
request('/auth/verification/email/request',token,'POST',{},429)
request('/auth/verification/email/confirm',second['token'],'POST',dict(secret=mailbox('email')))
request('/auth/verification/sms/request',token,'POST',{})
request('/auth/verification/sms/confirm',second['token'],'POST',dict(secret=mailbox('sms')))
identity = request('/auth/identity',token)['data']
assert identity['emailVerifiedAt'] and identity['phoneVerifiedAt']
request('/auth/identity',token,'PATCH',dict(firstName='Identidad propia'))
request('/auth/care-relationships/request',token,'POST',dict(psychologistUserId='a'),403)
professional = request('/auth/login',method='POST',body=dict(email='a@episodes.invalid',password='Episode-Demo-Only-284!'))['data']
request('/patients/'+session['user']['patientId'],professional['token'],expected=404)
request('/patients/p',professional['token'])
historical = request('/auth/login',method='POST',body=dict(email='p@episodes.invalid',password='Episode-Demo-Only-284!'))['data']
relationships = request('/auth/care-relationships',historical['token'])['data']
assert len(relationships) == 1 and relationships[0]['status'] == 'active'
assert relationships[0]['psychologist']['fullName']
assert 'email' not in relationships[0]['psychologist']

print('PASS: registration, two sessions, email+SMS, resend limit, own name, disabled selector/no professional email, legacy denial and existing clinical care.')
print('Fictional smoke account:',email)
