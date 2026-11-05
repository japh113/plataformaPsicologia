import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const match = require('nodemon/lib/monitor/match');
// Resolve from the consumer so a future nested copy is also exercised.
const { minimatch } = createRequire(require.resolve('nodemon'))('minimatch');

const select = (files, watch, ignore = [], ext = 'js,json') => {
  const monitor = match.rulesToMonitor(watch, ignore, { dirs: [] });
  return match(files, monitor, ext).result;
};
const absolute = file => path.resolve(file);

test('nodemon: recursive source watching retains JS/JSON and rejects other extensions and ignored paths', () => {
  const files = ['src/server.js', 'src/config/env.js', 'src/config/local.json',
    'src/.hidden.js', 'src/file with spaces.js', 'src/readme.md',
    'src/ignored/secret.js', 'test/unwatched.js'];
  assert.deepEqual(select(files, ['src'], ['src/ignored/**']).sort(),
    files.slice(0, 5).map(absolute).sort());
});

test('nodemon: default dependency/VCS ignores and negated rules take precedence over recursive watch', () => {
  const files = ['src/main.js', 'node_modules/pkg/index.js', '.git/hooks/run.js'];
  assert.deepEqual(select(files, ['**/*'], ['**/node_modules/**', '**/.git/**']),
    [absolute('src/main.js')]);
  assert.deepEqual(select(['src/config/env.js', 'src/server.js'],
    ['src/**/*.js'], ['src/config/**']), [absolute('src/server.js')]);
});

test('nodemon minimatch API: braces, extglobs, dotfiles, negation and Windows path options', () => {
  const options = { dot: true };
  assert.equal(minimatch('config/.local.json', '**/*.{js,json}', options), true);
  assert.equal(minimatch('src/env.js', '**/*.+(js|json)', options), true);
  assert.equal(minimatch('src/env.md', '**/*.{js,json}', options), false);
  assert.equal(minimatch('src/ignored/a.js', '!**/ignored/**', options), false);
  const windows = { dot: true, nocase: true, windowsPathsNoEscape: true, platform: 'win32' };
  assert.equal(minimatch('C:\\Work\\Src\\APP.JS', 'c:/work/src/**/*.js', windows), true);
  assert.equal(minimatch('C:\\Work\\Src\\APP.TXT', 'c:/work/src/**/*.js', windows), false);
});
