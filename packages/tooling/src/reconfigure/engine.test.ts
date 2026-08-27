// @requirements REQ-SCAFFOLD-INIT-004 REQ-SCAFFOLD-GENERATORS-003
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FilesystemAdapter } from '../setup/adapters/filesystem.js';
import { parseNrbConfig, type NrbConfig } from '../setup/schema.js';
import { emptyState } from '../setup/state.js';
import { createIdentityManifestConfig, identityManifestPath, isIdentityManifest, setupStatePath } from './engine.js';
import { buildOrderedReplacements } from './rules.js';
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
      deriveOperations: async () => [],
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
      deriveOperations: async () => [],
      verify: async () => ({ outcome: 'green', commands: [], exitCode: 0 }),
    });
    assert.equal(green.gate, 'green');
    const manifest = JSON.parse((await fs.read(identityManifestPath)) ?? '{}') as { gate?: string };
    assert.equal(manifest.gate, 'green');
  });

  it('uses the complete last-applied manifest instead of caller-supplied desired values', () => {
    const applied = config();
    const desired = parseNrbConfig({
      ...applied,
      apps: ['admin-app'],
      capabilities: ['swagger'],
      product: { ...applied.product, ciMode: 'maintainer' },
      deployment: {
        ...applied.deployment,
        imageRegistry: 'registry.example/acme-platform',
      },
    });
    const manifest = {
      version: 1 as const,
      templateBase: 'abc123',
      apps: applied.apps,
      capabilities: applied.capabilities,
      identity: applied.identity,
      product: applied.product,
      deployment: applied.deployment,
      runtime: applied.runtime,
      session: applied.session,
      tenant: applied.tenant,
      appRenames: applied.appRenames,
      configHash: '0'.repeat(64),
      gate: 'green' as const,
      appliedFiles: {},
    };

    const previous = createIdentityManifestConfig(desired, manifest);
    assert.deepEqual(previous.apps, applied.apps);
    assert.deepEqual(previous.capabilities, applied.capabilities);
    assert.deepEqual(previous.product, applied.product);
    assert.equal(previous.deployment.imageRegistry, applied.deployment.imageRegistry);
    assert.equal(previous.deployment.publicDomain, applied.deployment.publicDomain);
    assert.deepEqual(
      buildOrderedReplacements(previous, desired).filter(({ label }) => label === 'deployment:imageRegistry'),
      [
        {
          from: applied.deployment.imageRegistry,
          to: desired.deployment.imageRegistry,
          label: 'deployment:imageRegistry',
        },
      ],
    );
  });

  it('restores the canonical app name when an app rename is removed', () => {
    const canonical = config();
    const renamed = parseNrbConfig({ ...canonical, appRenames: { 'admin-app': 'console-app' } });
    assert.deepEqual(
      buildOrderedReplacements(renamed, canonical).filter(({ label }) => label.startsWith('appRename:')),
      [{ from: 'console-app', to: 'admin-app', label: 'appRename:admin-app' }],
    );
  });

  it('refuses tenant-id changes unless the fresh-database guard passes', async () => {
    const previous = config();
    const desired = parseNrbConfig({
      ...previous,
      tenant: { ...previous.tenant, defaultTenantId: '11111111-1111-1111-1111-111111111111' },
    });
    const fs = memoryFilesystem({ 'migration.ts': previous.tenant.defaultTenantId });
    const refused = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      targetPaths: ['migration.ts'],
    });
    assert.equal(refused.status, 'conflict');
    assert.match(refused.error ?? '', /fresh-database guard/u);
    assert.equal(await fs.read('migration.ts'), previous.tenant.defaultTenantId);

    const allowed = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      targetPaths: ['migration.ts'],
      assertTenantChangeAllowed: async () => undefined,
    });
    assert.equal(allowed.status, 'updated');
    assert.equal(await fs.read('migration.ts'), desired.tenant.defaultTenantId);
  });

  it('persists the desired config before verification and restores it on gate failure', async () => {
    const previous = config();
    const desired = config({ slug: 'acme-platform', packageName: 'acme-platform' });
    const initialConfig = `${JSON.stringify(previous, null, 2)}\n`;
    const fs = memoryFilesystem({ 'fixture.txt': 'nest-react-boilerplate\n', 'nrb.config.json': initialConfig });
    const failed = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      workspaceRoot: '.',
      gate: 'auto',
      targetPaths: ['fixture.txt'],
      deriveOperations: async () => [],
      verify: async () => {
        assert.deepEqual(JSON.parse((await fs.read('nrb.config.json')) ?? '{}'), desired);
        return { outcome: 'skipped', commands: [], failedGate: 'static-check', exitCode: 1 };
      },
    });
    assert.equal(failed.status, 'rolled-back');
    assert.equal(await fs.read('nrb.config.json'), initialConfig);
    assert.equal(await fs.read('fixture.txt'), 'nest-react-boilerplate\n');
  });

  it('regenerates setup-owned artifacts before verification and rolls them back with the rewrite', async () => {
    const previous = config();
    const desired = config({ slug: 'acme-platform', packageName: 'acme-platform' });
    const fs = memoryFilesystem({
      'fixture.txt': 'nest-react-boilerplate\n',
      'nrb.config.json': `${JSON.stringify(previous, null, 2)}\n`,
      '.nrb/workspace.json': '{"configHash":"old"}\n',
    });
    const before = fs.snapshot();
    const failed = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      workspaceRoot: '/fixture',
      gate: 'auto',
      targetPaths: ['fixture.txt'],
      deriveOperations: async () => [
        {
          kind: 'update_file',
          path: '.nrb/workspace.json',
          content: '{"configHash":"desired"}\n',
          description: 'regenerate workspace manifest',
        },
      ],
      verify: async () => {
        assert.equal(await fs.read('.nrb/workspace.json'), '{"configHash":"desired"}\n');
        return { outcome: 'skipped', commands: [], failedGate: 'static-check', exitCode: 1 };
      },
    });
    assert.equal(failed.status, 'rolled-back');
    assert.deepEqual(fs.snapshot(), before);

    const green = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      workspaceRoot: '/fixture',
      gate: 'auto',
      targetPaths: ['fixture.txt'],
      deriveOperations: async () => [
        {
          kind: 'update_file',
          path: '.nrb/workspace.json',
          content: '{"configHash":"desired"}\n',
          description: 'regenerate workspace manifest',
        },
      ],
      verify: async () => ({ outcome: 'green', commands: [], exitCode: 0 }),
    });
    assert.equal(green.status, 'updated');
    assert.equal(await fs.read('.nrb/workspace.json'), '{"configHash":"desired"}\n');
    assert.equal(green.plan.manifest.appliedFiles['.nrb/workspace.json'], undefined);
  });

  it('round-trips identity, port, metadata, and derived artifacts byte-for-byte', async () => {
    const defaults = config();
    const acme = parseNrbConfig({
      ...defaults,
      identity: {
        ...defaults.identity,
        name: 'Acme Platform',
        slug: 'acme-platform',
        packageName: 'acme-platform',
        dbName: 'acme_platform',
        className: 'AcmePlatform',
        domain: 'acme.example',
      },
      deployment: {
        ...defaults.deployment,
        publicDomain: 'acme.example',
        imageRegistry: 'ghcr.io/your-github-org/acme-platform',
      },
      runtime: { ...defaults.runtime, ports: { ...defaults.runtime.ports, 'admin-app-api': 3101 } },
    });
    const fs = memoryFilesystem({
      'fixture.txt': "nest-react-boilerplate example.com '${ADMIN_APP_API_PORT:-3001}'\n",
      'nrb.config.json': `${JSON.stringify(defaults, null, 2)}\n`,
      '.nrb/workspace.json': '{"identity":"nest-react-boilerplate","port":3001}\n',
    });
    const original = fs.snapshot();
    const deriveOperations = async (desired: NrbConfig) => [
      {
        kind: 'update_file' as const,
        path: '.nrb/workspace.json',
        content: `${JSON.stringify({ identity: desired.identity.slug, port: desired.runtime.ports['admin-app-api'] })}\n`,
        description: 'regenerate workspace manifest',
      },
    ];
    const forward = await runReconfigure({
      fs,
      desired: acme,
      previous: defaults,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      workspaceRoot: '/fixture',
      gate: 'off',
      targetPaths: ['fixture.txt'],
      deriveOperations,
    });
    assert.equal(forward.status, 'updated');
    assert.equal(await fs.read('fixture.txt'), "acme-platform acme.example '${ADMIN_APP_API_PORT:-3101}'\n");
    const manifest = JSON.parse((await fs.read(identityManifestPath)) ?? '{}');
    const state = JSON.parse((await fs.read(setupStatePath)) ?? '{}');
    assert.equal(manifest.appliedFiles['.nrb/workspace.json'], undefined);
    assert.equal(state.reconfiguredFiles['.nrb/workspace.json'], undefined);
    assert.ok(state.files['.nrb/workspace.json']);

    const reverse = await runReconfigure({
      fs,
      desired: defaults,
      previous: createIdentityManifestConfig(defaults, manifest),
      manifest,
      state,
      templateBase: 'abc123',
      workspaceRoot: '/fixture',
      gate: 'off',
      targetPaths: ['fixture.txt'],
      deriveOperations,
    });
    assert.equal(reverse.status, 'updated');
    const final = fs.snapshot();
    assert.equal(final['fixture.txt'], original['fixture.txt']);
    assert.equal(final['.nrb/workspace.json'], original['.nrb/workspace.json']);
    assert.equal(final['nrb.config.json'], original['nrb.config.json']);
  });

  it('rewrites the edge port in Helm listenPort values', async () => {
    const previous = config();
    const desired = parseNrbConfig({
      ...previous,
      runtime: { ...previous.runtime, ports: { ...previous.runtime.ports, edge: 8180 } },
    });
    const fs = memoryFilesystem({ '.helm/values.yaml': 'frontendNginx:\n  listenPort: 8080\n' });

    const result = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      force: true,
      includeMetadata: false,
      targetPaths: ['.helm/values.yaml'],
    });

    assert.equal(result.status, 'updated');
    assert.equal(await fs.read('.helm/values.yaml'), 'frontendNginx:\n  listenPort: 8180\n');
  });

  it('rewrites container and staging ports only in anchored deployment contexts', async () => {
    const previous = config();
    const desired = parseNrbConfig({
      ...previous,
      runtime: {
        ...previous.runtime,
        ports: { ...previous.runtime.ports, 'admin-app-api': 3101 },
        containerPort: 8088,
        stagingOffset: 200,
      },
    });
    const fs = memoryFilesystem({
      Dockerfile: 'ENV NODE_ENV=production \\\n  PORT=80\n',
      'docker/docker-compose.yml':
        "environment:\n  PORT: 80\nports:\n  - target: 80\n  - published: '${ADMIN_APP_API_PORT:-3001}'\n",
      'ecosystem.config.cjs': "api('admin-app-api', 'dist/admin', 'ADMIN_APP_API_PORT', 3001)\n",
      'docker/caddy/routes/core/auth.caddy': 'reverse_proxy auth-app-api:80\n',
      'docker/caddy/Caddyfile.per-app-domains': 'import api_service auth-app-api:80\n',
      '.nrb/Caddyfile.single-domain': 'reverse_proxy auth-app-api:80\n',
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
        'ecosystem.config.cjs',
        'docker/caddy/routes/core/auth.caddy',
        'docker/caddy/Caddyfile.per-app-domains',
        '.nrb/Caddyfile.single-domain',
        '.helm/values.yaml',
        'notes.md',
      ],
    });
    assert.equal(result.status, 'updated');
    assert.equal(await fs.read('Dockerfile'), 'ENV NODE_ENV=production \\\n  PORT=8088\n');
    assert.equal(
      await fs.read('docker/docker-compose.yml'),
      "environment:\n  PORT: 8088\nports:\n  - target: 8088\n  - published: '${ADMIN_APP_API_PORT:-3101}'\n",
    );
    assert.equal(
      await fs.read('ecosystem.config.cjs'),
      "api('admin-app-api', 'dist/admin', 'ADMIN_APP_API_PORT', 3101)\n",
    );
    assert.equal(await fs.read('docker/caddy/routes/core/auth.caddy'), 'reverse_proxy auth-app-api:8088\n');
    assert.equal(await fs.read('docker/caddy/Caddyfile.per-app-domains'), 'import api_service auth-app-api:8088\n');
    assert.equal(await fs.read('.nrb/Caddyfile.single-domain'), 'reverse_proxy auth-app-api:8088\n');
    assert.equal(await fs.read('.helm/values.yaml'), 'app:\n  port: 8088\n  servicePort: 8088\n');
    assert.equal(await fs.read('notes.md'), 'staging offset +200; CPU usage 80%\n');
  });
});
