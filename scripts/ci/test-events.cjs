// Exercise the actual workflow expressions against representative event payloads.
// GitHub expressions used here are also valid JS; no PR text is evaluated as code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const expected = ['ci/docs', 'ci/backend-unit', 'ci/frontend', 'ci/postgres', 'ci/browser', 'ci/evidence', 'ci/required'];
const jobs = [...source.matchAll(/^  (checks|evidence|required):\n([\s\S]*?)(?=^  \w+:|$(?![\s\S]))/gm)];
assert.equal(jobs.length, 3);
const group = source.match(/^  group: (.*)$/m)[1];
assert.match(source, /types: \[opened, synchronize, reopened, edited\]/);
assert.doesNotMatch(source, /paths-ignore:|pull_request_target|ready_for_review/);
const evaluate = (value, context) => value.replace(/\$\{\{(.*?)\}\}/g, (_, expression) => String(vm.runInNewContext(expression, context, {timeout: 1000})));
function run(eventName, action, changes = {}, runId = 7) {
  const context = {
    github: {event_name: eventName, event: {action, changes, pull_request: {number: 123}}, workflow: 'PsicoPanel CI', ref: 'refs/pull/123/merge', run_id: runId},
    matrix: {}, always: () => true,
    format: (template, ...args) => template.replace(/\{(\d+)\}/g, (_, index) => args[index]),
  };
  const results = [];
  for (const [, job, body] of jobs) {
    for (const component of job === 'checks' ? ['docs', 'backend-unit', 'frontend', 'postgres', 'browser'] : [job]) {
      context.matrix = {component};
      results.push({name: evaluate(body.match(/^    name: (.*)$/m)[1], context),
        executes: evaluate(body.match(/^    if: (.*)$/m)[1], context) === 'true'});
    }
  }
  return {results, group: evaluate(group, context)};
}
for (const action of ['opened', 'synchronize', 'reopened', 'edited']) {
  const {results} = run('pull_request', action);
  assert.deepEqual(results.map(x => x.name), expected);
  assert.ok(results.every(x => x.executes));
}
const active = run('pull_request', 'synchronize');
for (const changes of [{title: {from: 'old'}}, {body: {from: ''}}, {title: {from: 'old'}, body: {from: ''}}]) {
  const metadata = run('pull_request', 'edited', changes);
  assert.ok(metadata.results.every(x => !x.executes && !expected.includes(x.name)));
  assert.notEqual(metadata.group, active.group); // Cannot cancel a failing/in-progress validation.
}
for (const changes of [{base: {ref: {from: 'old'}}}, {base: {sha: {from: 'old'}}, title: {from: 'old'}}]) {
  const current = run('pull_request', 'edited', changes);
  assert.deepEqual(current.results.map(x => x.name), expected);
  assert.ok(current.results.every(x => x.executes));
  assert.equal(current.group, active.group);
}
for (const event of ['push', 'workflow_dispatch']) {
  const {results} = run(event, undefined);
  assert.deepEqual(results.map(x => x.name), expected);
  assert.ok(results.every(x => x.executes));
}
console.log('Workflow event expressions: seven required contexts, metadata isolation, base changes, push and manual execution PASS');
