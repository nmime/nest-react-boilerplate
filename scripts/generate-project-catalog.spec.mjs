import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  collectApplicationRoots,
  collectLibraryRoots,
  findCopiedCatalogRows,
  renderProjectCatalog,
  validateLibraryRoots,
} from './generate-project-catalog.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

test('joins setup metadata with Nx project roots', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'nrb-project-catalog-'));
  temporaryRoots.push(root);
  const projectRoot = resolve(root, 'apps/frontend/demo');
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(resolve(projectRoot, 'project.json'), JSON.stringify({ name: 'demo-app', projectType: 'application' }));

  const catalog = {
    'demo-app': {
      id: 'demo-app',
      platform: 'frontend',
      classification: 'reference',
      runtime: 'React + Vite SPA',
      publicHostname: 'demo-app.example.com',
      requiresApps: [],
      requiresCapabilities: [],
    },
  };
  const rendered = renderProjectCatalog(catalog, collectApplicationRoots(root));

  assert.match(rendered, /`demo-app` \| `apps\/frontend\/demo`/);
  assert.match(rendered, /`demo-app\.example\.com`/);
  assert.match(rendered, /Do not maintain an exhaustive library table/);
});

test('rejects catalog and Nx application drift in either direction', () => {
  const entry = {
    id: 'demo-app',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'React + Vite SPA',
    publicHostname: 'demo-app.example.com',
    requiresApps: [],
    requiresCapabilities: [],
  };

  assert.throws(() => renderProjectCatalog({ 'demo-app': entry }, new Map()), /missing an Nx application/);
  assert.throws(
    () => renderProjectCatalog({}, new Map([['orphan-app', 'apps/frontend/orphan']])),
    /missing from the setup catalog/,
  );
});

test('rejects copied application path or hostname rows outside the catalog', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'nrb-project-catalog-copy-'));
  temporaryRoots.push(root);
  const guide = resolve(root, 'guide.md');
  const changelog = resolve(root, 'CHANGELOG.md');
  writeFileSync(
    guide,
    [
      '| `demo-app` | `apps/frontend/demo` |',
      '`demo-app` is published at `demo-app.example.com`.',
      '| demo-app | apps/frontend/demo |',
      '| **demo-app** | [demo-app.example.com](https://demo-app.example.com) |',
      '| <strong>demo-app</strong> | <code>apps/frontend/demo</code> |',
      '`demo-app` owns routing behavior without repeating identity metadata.',
    ].join('\n'),
  );
  writeFileSync(changelog, '- Added `demo-app` at `apps/frontend/demo`.\n');
  const entry = {
    id: 'demo-app',
    platform: 'frontend',
    classification: 'reference',
    runtime: 'React + Vite SPA',
    publicHostname: 'demo-app.example.com',
    requiresApps: [],
    requiresCapabilities: [],
  };

  const failures = findCopiedCatalogRows(root, { 'demo-app': entry }, new Map([['demo-app', 'apps/frontend/demo']]), [
    guide,
    changelog,
  ]);

  assert.equal(failures.length, 5);
  assert.match(failures.join('\n'), /guide\.md:1/);
  assert.match(failures.join('\n'), /guide\.md:2/);
  assert.match(failures.join('\n'), /guide\.md:3/);
  assert.match(failures.join('\n'), /guide\.md:4/);
  assert.match(failures.join('\n'), /guide\.md:5/);
});

test('accepts every live library root and rejects layouts outside the repository contract', () => {
  const workspaceRoot = resolve(import.meta.dirname, '..');
  const libraryRoots = collectLibraryRoots(workspaceRoot);
  assert.deepEqual(validateLibraryRoots(libraryRoots), []);
  for (const root of libraryRoots.values()) {
    assert.equal(existsSync(resolve(workspaceRoot, root, 'README.md')), true, `${root} is missing README.md`);
    assert.equal(existsSync(resolve(workspaceRoot, root, 'AGENTS.md')), true, `${root} is missing AGENTS.md`);
  }
  assert.deepEqual(
    validateLibraryRoots(
      new Map([
        ['@app/backend-invalid', 'libs/backend/invalid/lib'],
        ['@app/frontend-too-deep', 'libs/frontend/feature/demo/shared/extra/lib'],
        ['@app/common-too-deep', 'libs/common/i18n/runtime/extra/lib'],
      ]),
    ),
    [
      '@app/backend-invalid: libs/backend/invalid/lib',
      '@app/frontend-too-deep: libs/frontend/feature/demo/shared/extra/lib',
      '@app/common-too-deep: libs/common/i18n/runtime/extra/lib',
    ],
  );
});
