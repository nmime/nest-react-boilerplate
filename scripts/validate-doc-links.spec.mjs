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
  write(
    'apps/frontend/demo/README.md',
    '# demo\n\n- Path: `apps/frontend/demo`\n> **Runtime:** Vite\nLocal URL: `http://localhost:4200`\nDefault local port: `4200`\n',
  );
  write('docs/guide.md', '# Guide\n\n## Project Names and Paths\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [resolve(workspaceRoot, 'apps/frontend/demo/README.md'), resolve(workspaceRoot, 'docs/guide.md')],
  });

  assert.equal(result.failures.length, 5);
  assert.match(result.failures.join('\n'), /duplicated project metadata/);
  assert.match(result.failures.join('\n'), /duplicated project map/);
});

test('ignores metadata examples in code fences and historical changelog headings', () => {
  write('apps/frontend/demo/README.md', '# demo\n\n```text\nRuntime: Vite\nPort: 4200\n```\n');
  write('CHANGELOG.md', '## Project Names and Paths\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [resolve(workspaceRoot, 'apps/frontend/demo/README.md'), resolve(workspaceRoot, 'CHANGELOG.md')],
  });

  assert.deepEqual(result.failures, []);
});

test('requires library purposes to explain concrete responsibilities', () => {
  write(
    'libs/common/demo/lib/README.md',
    '# Demo\n\n## Purpose\n\nCross-runtime framework-neutral library for the shared scope.\n',
  );
  write(
    'libs/common/useful/lib/README.md',
    '# Useful\n\n## Purpose\n\nNormalizes currency amounts and exposes rounding helpers to API and browser consumers.\n',
  );
  write('libs/common/missing/lib/README.md', '# Missing\n\nConcrete text without the required purpose boundary.\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [
      resolve(workspaceRoot, 'libs/common/demo/lib/README.md'),
      resolve(workspaceRoot, 'libs/common/useful/lib/README.md'),
      resolve(workspaceRoot, 'libs/common/missing/lib/README.md'),
    ],
  });

  assert.equal(result.failures.length, 2);
  assert.match(result.failures.join('\n'), /demo\/lib\/README\.md:5: library purpose/);
  assert.match(result.failures.join('\n'), /missing\/lib\/README\.md:1: library README/);
});

test('rejects copied scope values in leaf agent instructions', () => {
  write('libs/common/demo/lib/AGENTS.md', '# Rules\n\n- Respect the declared scope tag: `shared`.\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [resolve(workspaceRoot, 'libs/common/demo/lib/AGENTS.md')],
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /duplicated scope value/);
});

function write(path, content) {
  const file = resolve(workspaceRoot, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
