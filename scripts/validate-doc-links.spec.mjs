import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { validateWorkspace } from './validate-doc-links.mjs';

let workspaceRoot;

beforeEach(() => {
  workspaceRoot = mkdtempSync(resolve(tmpdir(), 'nrb-doc-validation-'));
  write('package.json', JSON.stringify({ scripts: { check: 'true' } }));
});

afterEach(() => {
  rmSync(workspaceRoot, { force: true, recursive: true });
});

test('accepts valid local files, heading anchors, and root scripts', () => {
  write('README.md', '[Guide](docs/guide.md#repeatable-setup)\n\n`pnpm run check`\n');
  write('docs/guide.md', '# Repeatable <span>setup</span> <script\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [resolve(workspaceRoot, 'README.md'), resolve(workspaceRoot, 'docs/guide.md')],
  });

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.counts, { anchors: 1, files: 2, links: 1, scripts: 1 });
});

test('reports missing files, anchors, and root scripts with source locations', () => {
  write(
    'README.md',
    ['[Missing](docs/missing.md)', '[Bad anchor](docs/guide.md#missing)', 'pnpm run absent'].join('\n'),
  );
  write('docs/guide.md', '# Existing\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [resolve(workspaceRoot, 'README.md'), resolve(workspaceRoot, 'docs/guide.md')],
  });

  assert.equal(result.failures.length, 3);
  assert.match(result.failures.join('\n'), /README\.md:1: missing local target/);
  assert.match(result.failures.join('\n'), /README\.md:2: missing anchor/);
  assert.match(result.failures.join('\n'), /README\.md:3: unknown root script/);
});

test('rejects copied project metadata and duplicate project-map headings', () => {
  write('apps/frontend/demo/README.md', '# demo\n\nPath: `apps/frontend/demo`\nNx project: `demo`\n');
  write('docs/guide.md', '# Guide\n\n## Project names and paths\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [resolve(workspaceRoot, 'apps/frontend/demo/README.md'), resolve(workspaceRoot, 'docs/guide.md')],
  });

  assert.equal(result.failures.length, 3);
  assert.match(result.failures.join('\n'), /duplicated project metadata/);
  assert.match(result.failures.join('\n'), /duplicated project map/);
});

function write(path, content) {
  const file = resolve(workspaceRoot, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
