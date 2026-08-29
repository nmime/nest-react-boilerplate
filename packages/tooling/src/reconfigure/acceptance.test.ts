// @requirements REQ-SCAFFOLD-INIT-004 REQ-SCAFFOLD-GENERATORS-003
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FilesystemAdapter } from '../setup/adapters/filesystem.js';
import { parseNrbConfig, type NrbConfig } from '../setup/schema.js';
import { emptyState } from '../setup/state.js';
import {
  createIdentityManifestConfig,
  defaultConfigPath,
  identityManifestPath,
  serializeJson,
  setupStatePath,
} from './engine.js';
import { runReconfigure } from './run.js';

function config(
  patch: {
    identity?: Partial<NrbConfig['identity']>;
    appRenames?: NrbConfig['appRenames'];
    ports?: Record<string, number>;
    tenantUsers?: Array<{ name: string; email: string; password: string }>;
  } = {},
): NrbConfig {
  const domain = patch.identity?.domain ?? 'example.com';
  return parseNrbConfig({
    schemaVersion: '2.0.0',
    apps: [],
    capabilities: [],
    identity: {
      ...patch.identity,
      brand: patch.identity?.brand,
    },
    appRenames: patch.appRenames ?? {},
    deployment: { publicDomain: domain },
    runtime: patch.ports ? { ports: patch.ports } : {},
    tenant: patch.tenantUsers ? { seed: { users: patch.tenantUsers } } : {},
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

function sensitiveValues(configValue: NrbConfig): string[] {
  return [
    configValue.runtime.postgres.password,
    configValue.runtime.minio.accessKey,
    configValue.runtime.minio.secretKey,
    configValue.runtime.localSecrets.session,
    configValue.runtime.localSecrets.betterAuth,
    configValue.runtime.localSecrets.discordCustomId,
    configValue.tenant.seed.admin.password,
    ...configValue.tenant.seed.users.map((user) => user.password),
  ];
}

describe('reconfigure acceptance', () => {
  it('is byte-stable on no-op and dry-run emits the exact apply plan without writing', async () => {
    const previous = config();
    const desired = config({
      identity: {
        name: 'Acme App',
        slug: 'acme-app',
        packageName: 'acme-app',
        domain: 'acme.example',
      },
      ports: { 'admin-app-api': 3101 },
    });
    const initial = {
      'fixture.txt': 'Nest React Boilerplate nest-react-boilerplate example.com\nADMIN_APP_API_PORT=3001\n',
    };

    const dryFs = memoryFilesystem(initial);
    const dryBefore = dryFs.snapshot();
    const dry = await runReconfigure({
      fs: dryFs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      dryRun: true,
      force: true,
      targetPaths: ['fixture.txt'],
    });
    assert.equal(dry.status, 'dry-run');
    assert.deepEqual(dryFs.snapshot(), dryBefore);

    const applyFs = memoryFilesystem(initial);
    const applied = await runReconfigure({
      fs: applyFs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      force: true,
      targetPaths: ['fixture.txt'],
    });
    assert.equal(applied.status, 'updated');
    assert.deepEqual(dry.plan.operations, applied.plan.operations);

    const afterApply = applyFs.snapshot();
    const noOp = await runReconfigure({
      fs: applyFs,
      desired,
      previous: createIdentityManifestConfig(desired, applied.plan.manifest),
      manifest: applied.plan.manifest,
      state: applied.plan.state,
      templateBase: 'abc123',
      targetPaths: ['fixture.txt'],
    });
    assert.equal(noOp.status, 'already-up-to-date');
    assert.deepEqual(noOp.plan.operations, []);
    assert.deepEqual(applyFs.snapshot(), afterApply);
  });

  it('round-trips A to B to A and restores generated artifacts, config, manifest, and state bytes', async () => {
    const a = config();
    const b = config({
      identity: {
        name: 'Acme App',
        slug: 'acme-app',
        packageName: 'acme-app',
        domain: 'acme.example',
      },
      ports: { 'admin-app-api': 3101 },
    });
    const fs = memoryFilesystem({
      'fixture.txt': 'Nest React Boilerplate nest-react-boilerplate example.com\nADMIN_APP_API_PORT=3001\n',
    });

    const establishedA = await runReconfigure({
      fs,
      desired: a,
      previous: a,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      force: true,
      targetPaths: ['fixture.txt'],
    });
    assert.equal(establishedA.status, 'already-up-to-date');
    const aBytes = fs.snapshot();

    const toB = await runReconfigure({
      fs,
      desired: b,
      previous: createIdentityManifestConfig(a, establishedA.plan.manifest),
      manifest: establishedA.plan.manifest,
      state: establishedA.plan.state,
      templateBase: 'abc123',
      targetPaths: ['fixture.txt'],
    });
    assert.equal(toB.status, 'updated');

    const backToA = await runReconfigure({
      fs,
      desired: a,
      previous: createIdentityManifestConfig(b, toB.plan.manifest),
      manifest: toB.plan.manifest,
      state: toB.plan.state,
      templateBase: 'abc123',
      targetPaths: ['fixture.txt'],
    });
    assert.equal(backToA.status, 'updated');
    assert.deepEqual(fs.snapshot(), aBytes);
    assert.equal(await fs.read(defaultConfigPath), serializeJson(a));
    assert.equal(await fs.read(identityManifestPath), serializeJson(establishedA.plan.manifest));
    assert.equal(await fs.read(setupStatePath), serializeJson(establishedA.plan.state));
  });

  it('restores all bytes after a failed apply, including config, manifest, and state', async () => {
    const previous = config();
    const desired = config({
      identity: { slug: 'acme-app', packageName: 'acme-app', domain: 'acme.example' },
    });
    const fs = memoryFilesystem({
      'a.txt': 'nest-react-boilerplate\n',
      'b.txt': 'example.com\n',
      [defaultConfigPath]: serializeJson(previous),
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

  it('applies app rename removal and tenant user removal without leaking removed values into output metadata', async () => {
    const previous = config({
      appRenames: { 'admin-app': 'control-panel' },
      tenantUsers: [
        { name: 'Retired User', email: 'retired@example.com', password: 'removed-user-password' },
        { name: 'Current User', email: 'current@example.com', password: 'current-user-password' },
      ],
    });
    const desired = config({
      appRenames: {},
      tenantUsers: [{ name: 'Current User', email: 'current@example.com', password: 'current-user-password' }],
    });
    const fs = memoryFilesystem({ 'fixture.txt': 'control-panel retired@example.com removed-user-password\n' });

    const result = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      force: true,
      targetPaths: ['fixture.txt'],
    });
    assert.equal(result.status, 'updated');
    assert.equal(await fs.read('fixture.txt'), 'admin-app\n');
    const metadata = `${await fs.read(identityManifestPath)}${await fs.read(setupStatePath)}`;
    assert.equal(metadata.includes('retired@example.com'), false);
    assert.equal(metadata.includes('removed-user-password'), false);
  });

  it('keeps operation descriptions and state free of secret values', async () => {
    // Distinct previous credentials: the assertion must target real secret
    // markers, and a value that equals its own field path (the committed
    // `postgres` dev default) is a naming coincidence, not an echo.
    const base = config();
    const previous = parseNrbConfig({
      ...base,
      runtime: {
        ...base.runtime,
        postgres: { user: 'postgres', password: 'prev-postgres-password' },
        minio: { accessKey: 'prev-minio-access', secretKey: 'prev-minio-secret' },
      },
    });
    const desired = parseNrbConfig({
      ...config(),
      runtime: {
        ...config().runtime,
        postgres: { user: 'postgres', password: 'next-postgres-password' },
        minio: { accessKey: 'next-minio-access', secretKey: 'next-minio-secret' },
        localSecrets: {
          session: 'next-session-secret',
          betterAuth: 'next-better-auth-secret',
          discordCustomId: 'next-discord-secret',
        },
      },
      tenant: {
        ...config().tenant,
        seed: {
          admin: { ...config().tenant.seed.admin, password: 'next-admin-password' },
          users: config().tenant.seed.users.map((user, index) => ({
            ...user,
            password: `next-user-password-${index}`,
          })),
        },
      },
    });
    const fs = memoryFilesystem({
      'fixture.txt': `${sensitiveValues(previous).join('\n')}\n`,
    });

    const result = await runReconfigure({
      fs,
      desired,
      previous,
      manifest: null,
      state: emptyState,
      templateBase: 'abc123',
      force: true,
      targetPaths: ['fixture.txt'],
    });
    assert.equal(result.status, 'updated');

    const operationalEvidence = JSON.stringify({
      operations: result.plan.operations.map((operation) => ({
        path: operation.path,
        description: operation.description,
      })),
      files: result.plan.files,
      rulesByFile: result.plan.rulesByFile,
      state: result.plan.state,
    });
    for (const secret of [...sensitiveValues(previous), ...sensitiveValues(desired)]) {
      assert.equal(operationalEvidence.includes(secret), false, 'secret leaked into operational evidence');
    }
  });
});
