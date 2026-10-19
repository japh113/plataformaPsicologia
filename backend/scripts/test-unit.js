import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tests = readdirSync(new URL('../test/', import.meta.url))
  .filter(name => name.endsWith('.test.js') && !name.endsWith('.integration.test.js'))
  .map(name => `test/${name}`);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test', LOCAL_DEVELOPMENT: 'true', JWT_SECRET: 'disposable_unit_test_secret' },
});
process.exit(result.status ?? 1);
