// @requirements REQ-SCAFFOLD-INIT-004 REQ-SCAFFOLD-GENERATORS-003
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FilesystemAdapter } from '../setup/adapters/filesystem.js';
import { parseNrbConfig, type NrbConfig } from '../setup/schema.js';
import { emptyState } from '../setup/state.js';
import { createIdentityManifestConfig, identityManifestPath, isIdentityManifest, setupStatePath } from './engine.js';
import { runReconfigure } from './run.js';

function config(patch: Partial<NrbConfig['identity']> = {}): NrbConfig {
  return parseNrbConfig({
    schemaVersion: '2.0.0',
    apps: [],
    capabilities: [],
    identity: { ...patch },
    deployment: { publicDomain: patch.domain ?? 'example.com' },
    options: {},
  });
}

function memoryFilesystem(initial: Record<string, string>): FilesystemAdapter & { snapshot(): Record<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, content) {
      files.set(path, content);
    },
    async delete(path) {
      files.delete(path);
    },
    async exists(path) {
      return files.has(path);
    },
    async list() {
      return [...files.keys()].sort();
    },
    snapshot() {
      return Object.fromEntries([...files.entries()].sort(([left], [right]) => left.localeCompare(right)));
    },
  };
}

describe('reconfigure engine state and rollback', () => {
  it('applies once and immediately reports already up to date', async () => {
    const previous = config();
    const desired = config({ name: 'Acme App', slug: 'acme-app', packageName: 'acme-app', domain: 'acme.example' });
    const fs = memoryFilesystem({ 'fixture.txt': 'Nest React Boilerplate nest-react-boilerplate example.com\n' });
    const first = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      force: true,
      targetPaths: ['fixture.txt'],
    });
    assert.equal(first.status, 'updated');
    const rawManifest = JSON.parse((await fs.read(identityManifestPath)) ?? 'null') as unknown;
    assert.ok(isIdentityManifest(rawManifest));
    const rawState = JSON.parse((await fs.read(setupStatePath)) ?? 'null') as { files: Record<string, string> };
    assert.ok(rawState.files['fixture.txt']);

    const second = await runReconfigure({
      fs,
      desired,
      previous: createIdentityManifestConfig(desired, rawManifest),
      manifest: rawManifest,
      state: first.plan.state,
      templateBase: 'abc123',
      targetPaths: ['fixture.txt'],
    });
    assert.equal(second.status, 'already-up-to-date');
    assert.equal(second.plan.rewriteOperations.length, 0);
  });

  it('refuses a corrupted tracked file and names it', async () => {
    const previous = config();
    const desired = config({ slug: 'acme-app', packageName: 'acme-app' });
    const fs = memoryFilesystem({ 'fixture.txt': 'nest-react-boilerplate\n' });
    const first = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      force: true,
      targetPaths: ['fixture.txt'],
    });
    await fs.write('fixture.txt', 'corrupted\n');
    const refused = await runReconfigure({
      fs,
      desired: config({ slug: 'renamed-app', packageName: 'renamed-app' }),
      previous: createIdentityManifestConfig(desired, first.plan.manifest),
      manifest: first.plan.manifest,
      state: first.plan.state,
      templateBase: 'abc123',
      targetPaths: ['fixture.txt'],
    });
    assert.equal(refused.status, 'conflict');
    assert.deepEqual(
      refused.conflicts.map((conflict) => conflict.path),
      ['fixture.txt'],
    );
  });

  it('restores the complete tree after a forced mid-apply failure', async () => {
    const previous = config();
    const desired = config({ slug: 'acme-app', packageName: 'acme-app', domain: 'acme.example' });
    const fs = memoryFilesystem({
      'a.txt': 'nest-react-boilerplate\n',
      'b.txt': 'example.com\n',
      'nrb.config.json': `${JSON.stringify(previous, null, 2)}\n`,
    });
    const before = fs.snapshot();
    const result = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      force: true,
      failOnPaths: ['b.txt'],
      targetPaths: ['a.txt', 'b.txt'],
    });
    assert.equal(result.status, 'rolled-back');
    assert.deepEqual(fs.snapshot(), before);
  });
});
