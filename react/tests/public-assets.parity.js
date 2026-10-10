import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const reactRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(reactRoot, '..');

function filesUnder(root, folder) {
  const base = join(root, folder);
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
    .map(entry => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

test('React public assets mirror the shared project assets', () => {
  for (const folder of ['assets', 'event-demo/assets']) {
    const source = filesUnder(projectRoot, folder);
    const publicFiles = filesUnder(join(reactRoot, 'public'), folder);
    assert.deepEqual(publicFiles, source, `${folder} file lists differ`);
    for (const file of source) {
      assert.ok(
        readFileSync(join(projectRoot, file)).equals(readFileSync(join(reactRoot, 'public', file))),
        `${file} differs from its source copy`,
      );
    }
  }
});

test('React public styles mirror the shared app and dashboard styles', () => {
  const styles = [
    ...filesUnder(projectRoot, 'app').filter(file => file.endsWith('.css')),
    'event-demo/dashboard.css',
  ];
  for (const file of styles) {
    assert.ok(
      readFileSync(join(projectRoot, file)).equals(readFileSync(join(reactRoot, 'public', file))),
      `${file} differs from its source copy`,
    );
  }
});
