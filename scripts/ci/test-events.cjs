// Unit checks of the few remaining expressions, NOT an Actions scheduler.
// Publication, suite selection and branch protection need the remote procedure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const expected = ['ci/docs', 'ci/backend-unit', 'ci/frontend', 'ci/postgres', 'ci/browser', 'ci/evidence', 'ci/required'];
const jobs = [...source.matchAll(/^  (checks|evidence|required):\n([\s\S]*?)(?=^  \w+:|$(?![\s\S]))/gm)];
assert.equal(jobs.length, 3);
const group = source.match(/^  group: (.*)$/m)[1];
const evaluate = (value, context) => value.replace(/\$\{\{(.*?)\}\}/g, (_, expression) => String(vm.runInNewContext(expression, context, {timeout: 1000})));
for (const namespace of ['ci', 'metadata', '']) {
  const names = [];
  for (const [, job, body] of jobs) {
    for (const component of job === 'checks' ? ['docs', 'backend-unit', 'frontend', 'postgres', 'browser'] : [job]) {
      names.push(evaluate(body.match(/^    name: (.*)$/m)[1], {needs: {route: {outputs: {namespace}}}, matrix: {component}}));
    }
  }
  assert.deepEqual(names, expected.map(name => namespace === 'metadata' ? name.replace('ci/', 'metadata/') : name));
}
function concurrency(eventName, action, runId, number = 123) {
  return evaluate(group, {github: {workflow: 'PsicoPanel CI', event_name: eventName, event: {action, pull_request: {number: eventName === 'pull_request' ? number : undefined}}, ref: 'refs/heads/main', run_id: runId}});
}
assert.equal(concurrency('pull_request', 'opened', 1), concurrency('pull_request', 'synchronize', 2));
assert.equal(concurrency('pull_request', 'reopened', 3), concurrency('pull_request', 'synchronize', 2));
assert.notEqual(concurrency('pull_request', 'edited', 4), concurrency('pull_request', 'synchronize', 2));
assert.notEqual(concurrency('pull_request', 'edited', 4), concurrency('pull_request', 'edited', 5));
assert.notEqual(concurrency('pull_request', 'opened', 1, 124), concurrency('pull_request', 'opened', 1));
assert.notEqual(concurrency('push', undefined, 1, undefined), concurrency('pull_request', 'opened', 1));
console.log('Expression units PASS; GitHub check publication and mergeability are NOT simulated.');
