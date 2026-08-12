// @requirements REQ-SCAFFOLD-AGENTS-007
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { collectTrackedMarkdown, validateWorkspace } from './validate-doc-links.mjs';

let workspaceRoot;

beforeEach(() => {
  workspaceRoot = mkdtempSync(resolve(tmpdir(), 'nrb-doc-validation-'));
  write('package.json', JSON.stringify({ scripts: { check: 'true', 'deploy:validate': 'true' } }));
});

afterEach(() => {
  rmSync(workspaceRoot, { force: true, recursive: true });
});

test('accepts valid local files, heading anchors, and both root-script spellings', () => {
  write('README.md', '[Guide](docs/guide.md#repeatable-setup)\n\n`pnpm run check`\n\n`pnpm deploy:validate`\n');
  write('docs/guide.md', '# Repeatable <span>setup</span> <script\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [resolve(workspaceRoot, 'README.md'), resolve(workspaceRoot, 'docs/guide.md')],
  });

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.counts, { anchors: 1, files: 2, links: 1, scripts: 2 });
});

test('reports missing files, anchors, and both root-script spellings with source locations', () => {
  write(
    'README.md',
    [
      '[Missing](docs/missing.md)',
      '[Bad anchor](docs/guide.md#missing)',
      'pnpm run absent',
      'pnpm deploy:missing',
    ].join('\n'),
  );
  write('docs/guide.md', '# Existing\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [resolve(workspaceRoot, 'README.md'), resolve(workspaceRoot, 'docs/guide.md')],
  });

  assert.equal(result.failures.length, 4);
  assert.match(result.failures.join('\n'), /README\.md:1: missing local target/);
  assert.match(result.failures.join('\n'), /README\.md:2: missing anchor/);
  assert.match(result.failures.join('\n'), /README\.md:3: unknown root script/);
  assert.match(result.failures.join('\n'), /README\.md:4: unknown root script/);
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

test('requires every documentation file to be reachable from the documentation index', () => {
  write('docs/README.md', '# Documentation\n\n[Guide](guide.md)\n');
  write('docs/guide.md', '# Guide\n\n[Deep dive](nested/deep-dive.md)\n');
  write('docs/nested/deep-dive.md', '# Deep dive\n');
  write('docs/orphan.md', '# Orphan\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [
      resolve(workspaceRoot, 'docs/README.md'),
      resolve(workspaceRoot, 'docs/guide.md'),
      resolve(workspaceRoot, 'docs/nested/deep-dive.md'),
      resolve(workspaceRoot, 'docs/orphan.md'),
    ],
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /docs\/orphan\.md:1: documentation is not reachable/);
});

test('exempts the superpowers working-spec area from documentation validation', () => {
  write('docs/README.md', '# Documentation\n\n[Guide](guide.md)\n');
  write('docs/guide.md', '# Guide\n');
  write('docs/superpowers/specs/2026-01-01-example-design.md', '# Example spec\n\n[dangling](../../nowhere.md)\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [
      resolve(workspaceRoot, 'docs/README.md'),
      resolve(workspaceRoot, 'docs/guide.md'),
      resolve(workspaceRoot, 'docs/superpowers/specs/2026-01-01-example-design.md'),
    ],
  });

  assert.deepEqual(result.failures, []);
});

test('exempts the working-spec areas a product declares in docs/.docsrc.json', () => {
  write('docs/.docsrc.json', JSON.stringify({ workingSpecPrefixes: ['docs/archive/working-specs'] }));
  write('docs/README.md', '# Documentation\n\n[Guide](guide.md)\n');
  write('docs/guide.md', '# Guide\n');
  write('docs/archive/working-specs/2026-01-01-example.md', '# Example spec\n\n[dangling](../../nowhere.md)\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [
      resolve(workspaceRoot, 'docs/README.md'),
      resolve(workspaceRoot, 'docs/guide.md'),
      resolve(workspaceRoot, 'docs/archive/working-specs/2026-01-01-example.md'),
    ],
  });

  assert.deepEqual(result.failures, []);
});

test('keeps validating documentation outside every declared working-spec prefix', () => {
  write('docs/.docsrc.json', JSON.stringify({ workingSpecPrefixes: ['docs/archive/working-specs'] }));
  write('docs/README.md', '# Documentation\n');
  write('docs/superpowers/specs/2026-01-01-example-design.md', '# Example spec\n\n[dangling](../../nowhere.md)\n');

  const result = validateWorkspace({
    workspaceRoot,
    markdownFiles: [
      resolve(workspaceRoot, 'docs/README.md'),
      resolve(workspaceRoot, 'docs/superpowers/specs/2026-01-01-example-design.md'),
    ],
  });

  assert.equal(result.failures.length, 2);
  assert.match(result.failures.join('\n'), /2026-01-01-example-design\.md:3: missing local target/);
  assert.match(result.failures.join('\n'), /2026-01-01-example-design\.md:1: documentation is not reachable/);
});

test('rejects working-spec prefixes that escape the workspace instead of ignoring them', () => {
  write('docs/.docsrc.json', JSON.stringify({ workingSpecPrefixes: ['/etc/docs', '../outside/', 7] }));
  write('docs/README.md', '# Documentation\n');

  const result = validateWorkspace({ workspaceRoot, markdownFiles: [resolve(workspaceRoot, 'docs/README.md')] });

  assert.equal(result.failures.length, 3);
  assert.match(result.failures.join('\n'), /docs\/\.docsrc\.json:1: invalid workingSpecPrefixes entry "\/etc\/docs"/);
  assert.match(
    result.failures.join('\n'),
    /docs\/\.docsrc\.json:1: invalid workingSpecPrefixes entry "\.\.\/outside\/"/,
  );
  assert.match(result.failures.join('\n'), /docs\/\.docsrc\.json:1: invalid workingSpecPrefixes entry 7/);
});

test('reports an unparseable documentation configuration instead of exempting nothing', () => {
  write('docs/.docsrc.json', '{ "workingSpecPrefixes": [ ');
  write('docs/README.md', '# Documentation\n');

  const result = validateWorkspace({ workspaceRoot, markdownFiles: [resolve(workspaceRoot, 'docs/README.md')] });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /docs\/\.docsrc\.json:1: invalid documentation configuration/);
});

test('collects untracked documentation and repo-local skill files', () => {
  write('README.md', '# Root\n');
  execFileSync('git', ['init', '--quiet'], { cwd: workspaceRoot });
  execFileSync('git', ['add', 'README.md'], { cwd: workspaceRoot });
  write('docs/README.md', '# Documentation\n\n[Guide](guide.md)\n');
  write('docs/guide.md', '# Guide\n');
  write('.agents/skills/example/SKILL.md', '# Example\n');

  const files = collectTrackedMarkdown(workspaceRoot).map((file) =>
    relative(workspaceRoot, file).replaceAll('\\', '/'),
  );

  assert.ok(files.includes('README.md'));
  assert.ok(files.includes('docs/README.md'));
  assert.ok(files.includes('docs/guide.md'));
  assert.ok(files.includes('.agents/skills/example/SKILL.md'));
});

function write(path, content) {
  const file = resolve(workspaceRoot, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
