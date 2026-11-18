// Expression units, NOT an Actions scheduler or branch-protection emulator.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const expected = ['ci/docs', 'ci/backend-unit', 'ci/frontend', 'ci/postgres', 'ci/browser', 'ci/evidence', 'ci/required'];
const jobs = [...source.matchAll(/^  (checks|evidence|required):\n([\s\S]*?)(?=^  \w+:|$(?![\s\S]))/gm)];
assert.equal(jobs.length, 3);
const group = source.match(/^  group: (.*)$/m)[1];
const evaluate = (value, context) => value.replace(/\$\{\{(.*?)\}\}/g, (_, expression) => String(vm.runInNewContext(expression, context, {timeout: 1000})));
const edits = [
  {title: {from: 'old'}}, {body: {from: ''}}, {body: {from: null}},
  {title: {from: 'old'}, body: {from: 'old'}},
  {base: {ref: {from: 'other'}}}, {base: {sha: {from: 'old'}}, title: {from: 'old'}},
  undefined, null, {}, [], 'title', {title: {}}, {title: null},
  {title: {from: null}}, {body: {from: []}},
  {title: {from: 'old', unknown: true}}, {unknown: {}}
];
const events = edits.map(changes => ['pull_request', {action: 'edited', changes}]);
events.push(...['opened', 'reopened', 'synchronize'].map(action => ['pull_request', {action}]),
  ['push', {ref: 'refs/heads/main'}], ['workflow_dispatch', {}]);
const groups = new Set();
let runId = 0;
for (const [eventName, event] of events) {
  for (const draft of [false, true]) {
    for (const previous of ['success', 'failure', 'cancelled', 'in_progress', 'skipped']) {
      const github = {workflow: 'PsicoPanel CI', event_name: eventName,
        event: {...event, pull_request: {number: 123, draft}, previous_result: previous},
        ref: 'refs/heads/main', run_id: ++runId, run_attempt: 1};
      const names = [];
      for (const [, job, body] of jobs) {
        for (const component of job === 'checks' ? ['docs', 'backend-unit', 'frontend', 'postgres', 'browser'] : [job]) {
          names.push(evaluate(body.match(/^    name: (.*)$/m)[1], {github, matrix: {component}}));
        }
        const condition = body.match(/^    if: (.*)$/m)[1];
        for (const isCancelled of [false, true]) {
          const expression = condition.startsWith('${{') ? condition : '${{ ' + condition + ' }}';
          assert.equal(evaluate(expression, {github, cancelled: () => isCancelled, always: () => true}),
            String(job === 'checks' ? !isCancelled : true));
        }
      }
      assert.deepEqual(names, expected);
      const current = evaluate(group, {github});
      assert(!groups.has(current));
      groups.add(current);
      // Same run, new attempt also cannot replace a pending current attempt.
      assert.notEqual(current, evaluate(group, {github: {...github, run_attempt: 2}}));
      assert.notEqual(current, evaluate(group, {github: {...github, workflow: 'Other CI'}}));
    }
  }
}
// Reversing arrival order cannot change the isolation of stale/current runs.
const snapshot = (run, head, base) => evaluate(group, {github: {
  workflow: 'PsicoPanel CI', run_id: run, run_attempt: 1,
  event: {pull_request: {number: 123, head: {sha: head}, base: {sha: base}}}
}});
assert.notEqual(snapshot(200, 'new', 'new'), snapshot(199, 'old', 'old'));
assert.match(source, /^  cancel-in-progress: false$/m);
console.log('Event/name/condition/concurrency units PASS; remote check publication and mergeability still require GitHub evidence.');
