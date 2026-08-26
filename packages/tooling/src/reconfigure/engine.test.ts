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

  it('rolls back the complete tree when the verification gate fails and records green/skipped outcomes', async () => {
    const previous = config();
    const desired = config({ domain: 'broken.example' });
    const fs = memoryFilesystem({ 'spec.md': 'example.com\n' });
    const before = fs.snapshot();
    const failed = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      workspaceRoot: '.',
      gate: 'auto',
      force: true,
      targetPaths: ['spec.md'],
      verify: async () => ({
        outcome: 'skipped',
        commands: ['static-check'],
        failedGate: 'spec-validate',
        exitCode: 1,
        error: 'spec literal failed',
      }),
    });
    assert.equal(failed.status, 'rolled-back');
    assert.equal(failed.failedGate, 'spec-validate');
    assert.deepEqual(fs.snapshot(), before);

    const green = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      workspaceRoot: '.',
      gate: 'auto',
      force: true,
      targetPaths: ['spec.md'],
      verify: async () => ({ outcome: 'green', commands: [], exitCode: 0 }),
    });
    assert.equal(green.gate, 'green');
    const manifest = JSON.parse((await fs.read(identityManifestPath)) ?? '{}') as { gate?: string };
    assert.equal(manifest.gate, 'green');
  });

  it('rewrites container and staging ports only in anchored deployment contexts', async () => {
    const previous = config();
    const desired = parseNrbConfig({
      ...previous,
      runtime: { ...previous.runtime, containerPort: 8088, stagingOffset: 200 },
    });
    const fs = memoryFilesystem({
      Dockerfile: 'ENV PORT=80\n',
      'docker/docker-compose.yml': 'environment:\n  PORT: 80\nports:\n  - target: 80\n',
      'docker/caddy/routes/core/auth.caddy': 'reverse_proxy auth-app-api:80\n',
      '.helm/values.yaml': 'app:\n  port: 80\n  servicePort: 80\n',
      'notes.md': 'staging offset +100; CPU usage 80%\n',
    });
    const result = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      force: true,
      includeMetadata: false,
      targetPaths: [
        'Dockerfile',
        'docker/docker-compose.yml',
        'docker/caddy/routes/core/auth.caddy',
        '.helm/values.yaml',
        'notes.md',
      ],
    });
    assert.equal(result.status, 'updated');
    assert.equal(await fs.read('Dockerfile'), 'ENV PORT=8088\n');
    assert.equal(await fs.read('docker/docker-compose.yml'), 'environment:\n  PORT: 8088\nports:\n  - target: 8088\n');
    assert.equal(await fs.read('docker/caddy/routes/core/auth.caddy'), 'reverse_proxy auth-app-api:8088\n');
    assert.equal(await fs.read('.helm/values.yaml'), 'app:\n  port: 8088\n  servicePort: 8088\n');
    assert.equal(await fs.read('notes.md'), 'staging offset +200; CPU usage 80%\n');
  });
});
