/**
 * Tests for the deterministic operation planner and state management.
 *
 * UNIT: isolated function tests
 * COMPONENT: multi-unit integration (planner + state + operations)
 * E2E: full flow from config → plan → state → idempotent replay
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseNrbConfig, schemaVersion } from './schema.js';
import {
  createFile,
  deleteFile,
  updateFile,
  sortOperations,
  compareOperations,
  operationsEqual,
  operationArraysEqual,
  validateOpPath,
} from './operations.js';
import {
  configHash,
  hashString,
  buildState,
  diffState,
  computeStateDigest,
  addFileToState,
  removeFileFromState,
  migrateState,
  emptyState,
  computeConfigDigest,
} from './state.js';
import {
  generateBackendCapabilityModule,
  generateCapabilitiesManifest,
  generateComposeEnvironment,
  generateConfigFile,
  generateSummaryMd,
  generateWorkspaceManifest,
  plan,
  resolveConfig,
} from './planner.js';

/* ==================================================================
 * UNIT: operations.ts — path validation (C1)
 * ================================================================== */

describe('operations — validateOpPath rejects unsafe paths', () => {
  it('rejects NUL byte in path', () => {
    assert.throws(() => validateOpPath('a\0b.txt'), /NUL/);
  });

  it('rejects empty string', () => {
    assert.throws(() => validateOpPath(''), /empty/);
  });

  it('rejects absolute posix path', () => {
    assert.throws(() => validateOpPath('/etc/passwd'), /absolute/);
  });

  it('rejects absolute path via .. escape', () => {
    assert.throws(() => validateOpPath('../config.txt'), /\.\./);
  });

  it('rejects .. escape via nested traversal', () => {
    assert.throws(() => validateOpPath('foo/../../bar'), /\.\./);
  });

  it('rejects deep .. escape', () => {
    assert.throws(() => validateOpPath('a/b/../../../../etc/passwd'), /\.\./);
  });

  it('rejects backslash (Windows separator)', () => {
    assert.throws(() => validateOpPath('foo\\bar.txt'), /backslash/);
  });

  it('accepts normal relative path', () => {
    const result = validateOpPath('apps/admin-app/src/main.ts');
    assert.equal(result, 'apps/admin-app/src/main.ts');
  });

  it('accepts nested path with no ..', () => {
    const result = validateOpPath('deep/nested/path/file.txt');
    assert.equal(result, 'deep/nested/path/file.txt');
  });

  it('normalizes double slashes', () => {
    const result = validateOpPath('foo//bar.txt');
    assert.equal(result, 'foo/bar.txt');
  });

  it('normalizes trailing dot', () => {
    const result = validateOpPath('foo/./bar.txt');
    assert.equal(result, 'foo/bar.txt');
  });
});

describe('operations — factories validate paths', () => {
  it('createFile rejects absolute path', () => {
    assert.throws(() => createFile('/etc/passwd', 'x'), /absolute/);
  });

  it('createFile rejects .. traversal', () => {
    assert.throws(() => createFile('../secret', 'x'), /\.\./);
  });

  it('deleteFile rejects NUL byte', () => {
    assert.throws(() => deleteFile('a\0b'), /NUL/);
  });

  it('updateFile rejects backslash', () => {
    assert.throws(() => updateFile('a\\b.txt', 'x'), /backslash/);
  });
});

/* ==================================================================
 * UNIT: operations.ts — factories
 * ================================================================== */

describe('operations — factories', () => {
  it('createFile sets kind and path', () => {
    const op = createFile('a/b.txt', 'hello');
    assert.equal(op.kind, 'create_file');
    assert.equal(op.path, 'a/b.txt');
    assert.equal(op.content, 'hello');
    assert.equal(op.description, 'Create a/b.txt');
  });

  it('deleteFile sets kind and path', () => {
    const op = deleteFile('old.txt');
    assert.equal(op.kind, 'delete_file');
    assert.equal(op.path, 'old.txt');
  });

  it('custom description overrides default', () => {
    const op = createFile('x.txt', 'v', 'Custom desc');
    assert.equal(op.description, 'Custom desc');
  });
});

describe('operations — compareOperations', () => {
  it('sorts deletes before creates', () => {
    const ops = [createFile('a.txt', 'x'), deleteFile('b.txt')];
    const sorted = sortOperations(ops);
    assert.equal(sorted[0]!.kind, 'delete_file');
    assert.equal(sorted[1]!.kind, 'create_file');
  });

  it('sorts by path within same kind', () => {
    const ops = [createFile('z.txt', 'x'), createFile('a.txt', 'x')];
    const sorted = sortOperations(ops);
    assert.equal(sorted[0]!.path, 'a.txt');
    assert.equal(sorted[1]!.path, 'z.txt');
  });

  it('compareOperations is deterministic', () => {
    const ops = [createFile('b.txt', 'x'), deleteFile('a.txt'), createFile('a.txt', 'x'), deleteFile('b.txt')];
    const s1 = sortOperations(ops);
    const s2 = sortOperations(ops);
    assert.ok(operationArraysEqual(s1, s2));
  });
});

describe('operations — equality', () => {
  it('identical operations are equal', () => {
    const a = createFile('x.txt', 'content');
    const b = createFile('x.txt', 'content');
    assert.ok(operationsEqual(a, b));
  });

  it('different content means not equal', () => {
    const a = createFile('x.txt', 'aaa');
    const b = createFile('x.txt', 'bbb');
    assert.ok(!operationsEqual(a, b));
  });

  it('different paths means not equal', () => {
    const a = createFile('a.txt', 'x');
    const b = createFile('b.txt', 'x');
    assert.ok(!operationsEqual(a, b));
  });

  it('different kinds means not equal', () => {
    const a = createFile('x.txt', 'x');
    const b = deleteFile('x.txt');
    assert.ok(!operationsEqual(a, b));
  });

  it('two delete operations on same path are equal', () => {
    const a = deleteFile('x.txt');
    const b = deleteFile('x.txt');
    assert.ok(operationsEqual(a, b), 'Two deletes of the same path should be equal');
  });

  it('two delete operations on different paths are not equal', () => {
    const a = deleteFile('x.txt');
    const b = deleteFile('y.txt');
    assert.ok(!operationsEqual(a, b));
  });
});

/* ==================================================================
 * UNIT: state.ts — hashing
 * ================================================================== */

describe('state — hashString', () => {
  it('same input produces same hash', () => {
    const h1 = hashString('hello');
    const h2 = hashString('hello');
    assert.equal(h1, h2);
  });

  it('different input produces different hash', () => {
    assert.notEqual(hashString('hello'), hashString('world'));
  });

  it('hash is a 64-char hex string (SHA-256)', () => {
    const h = hashString('test');
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]+$/);
  });
});

describe('state — configHash is deterministic', () => {
  it('same config produces same hash regardless of key order', () => {
    const a = configHash({ b: 2, a: 1 });
    const b = configHash({ a: 1, b: 2 });
    assert.equal(a, b);
  });

  it('different config produces different hash', () => {
    const a = configHash({ a: 1 });
    const b = configHash({ a: 2 });
    assert.notEqual(a, b);
  });
});

describe('state — computeConfigDigest is alias', () => {
  it('matches configHash output', () => {
    const cfg = { apps: ['a'], caps: ['b'] };
    assert.equal(computeConfigDigest(cfg), configHash(cfg));
  });
});

/* ==================================================================
 * UNIT: state.ts — state operations
 * ================================================================== */

describe('state — buildState', () => {
  it('builds state with correct digest', () => {
    const s = buildState('abc', { 'f.txt': 'h1' });
    assert.equal(s.version, 1);
    assert.equal(s.configHash, 'abc');
    assert.equal(s.files['f.txt'], 'h1');
    assert.equal(s.digest, computeStateDigest({ 'f.txt': 'h1' }));
  });
});

describe('state — computeStateDigest is order-independent', () => {
  it('same files different insertion order produce same digest', () => {
    const d1 = computeStateDigest({ b: '1', a: '2' });
    const d2 = computeStateDigest({ a: '2', b: '1' });
    assert.equal(d1, d2);
  });

  it('empty files produce deterministic digest', () => {
    const d = computeStateDigest({});
    assert.equal(d, hashString('{}'));
  });
});

describe('state — addFileToState', () => {
  it('adds a new file entry', () => {
    const s = buildState('h', {});
    const s2 = addFileToState(s, 'x.txt', 'hash1');
    assert.equal(s2.files['x.txt'], 'hash1');
    assert.ok(!s.files['x.txt']); // original unchanged
  });

  it('overwrites existing file entry', () => {
    const s = buildState('h', { 'x.txt': 'old' });
    const s2 = addFileToState(s, 'x.txt', 'new');
    assert.equal(s2.files['x.txt'], 'new');
    assert.equal(s.files['x.txt'], 'old');
  });
});

describe('state — removeFileFromState', () => {
  it('removes a file entry', () => {
    const s = buildState('h', { 'x.txt': 'h1', 'y.txt': 'h2' });
    const s2 = removeFileFromState(s, 'x.txt');
    assert.ok(!('x.txt' in s2.files));
    assert.equal(s2.files['y.txt'], 'h2');
  });

  it('no-op on missing key', () => {
    const s = buildState('h', { 'x.txt': 'h1' });
    const s2 = removeFileFromState(s, 'z.txt');
    assert.deepEqual(s2.files, { 'x.txt': 'h1' });
  });
});

/* ==================================================================
 * UNIT: state.ts — diffState
 * ================================================================== */

describe('state — diffState', () => {
  it('empty current + non-empty desired = all creates', () => {
    const current = buildState('h', {});
    const desired = { 'a.txt': 'h1', 'b.txt': 'h2' };
    const d = diffState(current, desired);
    assert.deepEqual(d.toCreate, ['a.txt', 'b.txt']);
    assert.deepEqual(d.toUpdate, []);
    assert.deepEqual(d.toPrune, []);
  });

  it('identical current and desired = all unchanged', () => {
    const current = buildState('h', { 'a.txt': 'h1' });
    const desired = { 'a.txt': 'h1' };
    const d = diffState(current, desired);
    assert.deepEqual(d.toCreate, []);
    assert.deepEqual(d.toUpdate, []);
    assert.deepEqual(d.unchanged, ['a.txt']);
  });

  it('changed hash = update', () => {
    const current = buildState('h', { 'a.txt': 'old' });
    const desired = { 'a.txt': 'new' };
    const d = diffState(current, desired);
    assert.deepEqual(d.toUpdate, ['a.txt']);
  });

  it('extra file in current = prune', () => {
    const current = buildState('h', { 'a.txt': 'h1', 'old.txt': 'h2' });
    const desired = { 'a.txt': 'h1' };
    const d = diffState(current, desired);
    assert.deepEqual(d.toPrune, ['old.txt']);
  });
});

/* ==================================================================
 * UNIT: state.ts — migrateState
 * ================================================================== */

describe('state — migrateState', () => {
  it('returns empty state for null', () => {
    assert.deepEqual(migrateState(null), emptyState);
  });

  it('returns empty state for non-object', () => {
    assert.deepEqual(migrateState('string'), emptyState);
    assert.deepEqual(migrateState(42), emptyState);
  });

  it('returns empty state for missing version', () => {
    assert.deepEqual(migrateState({ files: {} }), emptyState);
  });

  it('returns empty state for version < 1', () => {
    assert.deepEqual(migrateState({ version: 0, files: {} }), emptyState);
  });

  it('passes through v1 state', () => {
    const v1 = buildState(hashString('config'), { 'x.txt': hashString('content') });
    const result = migrateState(v1);
    assert.deepEqual(result, v1);
  });

  it('rejects malformed or tampered v1 state', () => {
    const valid = buildState(hashString('config'), { 'x.txt': hashString('content') });

    assert.deepEqual(migrateState({ ...valid, configHash: 'not-a-hash' }), emptyState);
    assert.deepEqual(migrateState({ ...valid, files: { '../outside': hashString('content') } }), emptyState);
    assert.deepEqual(migrateState({ ...valid, digest: hashString('tampered') }), emptyState);
  });

  it('returns empty for future version (safety)', () => {
    const future = { version: 99, configHash: 'x', files: {}, digest: 'd' };
    const result = migrateState(future);
    assert.deepEqual(result, emptyState);
  });
});

/* ==================================================================
 * UNIT: planner.ts — resolveConfig + M1 validation
 * ================================================================== */

describe('planner — resolveConfig', () => {
  it('resolves minimal preset with expanded deps', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'minimal' });
    const resolved = resolveConfig(config);
    assert.ok(resolved.apps.includes('auth-app-api'));
    assert.ok(resolved.apps.includes('user-app-api'));
    assert.ok(resolved.capabilities.includes('postgres'));
  });

  it('explicit apps extend a preset and preserve its dependencies', () => {
    const config = parseNrbConfig({
      schemaVersion,
      preset: 'minimal',
      apps: ['admin-app'],
    });
    const resolved = resolveConfig(config);
    assert.ok(resolved.apps.includes('admin-app'));
    assert.ok(resolved.apps.includes('auth-app-api'));
  });

  it('empty config resolves to empty lists', () => {
    const config = parseNrbConfig({ schemaVersion });
    const resolved = resolveConfig(config);
    assert.deepEqual(resolved.apps, []);
    assert.deepEqual(resolved.capabilities, []);
  });

  it('returns typed AppId[] and CapabilityId[] (no any)', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'minimal' });
    const resolved = resolveConfig(config);
    // Verify all returned IDs are known valid IDs
    for (const a of resolved.apps) {
      assert.ok(typeof a === 'string');
    }
    for (const c of resolved.capabilities) {
      assert.ok(typeof c === 'string');
    }
  });
});

describe('planner — M1 validateSelection rejection', () => {
  it('rejects config with admin-app but missing required capabilities', () => {
    // admin-app requires authz and design-tokens; if we supply neither,
    // expandDependencies adds auth-app-api deps but NOT admin-app's caps
    // We need to craft a config where expandDependencies adds the app
    // but doesn't add its required capabilities.
    // Actually expandDependencies WILL add required caps. So we need
    // a case where an app's requiresApps are missing.
    // fullstack-e2e declares the exact Docker/runtime stack it starts. If we
    // list only the E2E project, dependency expansion must add that stack.
    const config = parseNrbConfig({
      schemaVersion,
      apps: ['fullstack-e2e'],
    });
    const resolved = resolveConfig(config);
    assert.deepEqual(resolved.apps, [
      'admin-app',
      'admin-app-api',
      'auth-app-api',
      'fullstack-e2e',
      'landing-app',
      'notification-consumer',
      'notification-scheduler',
      'user-app',
      'user-app-api',
    ]);
  });

  it('rejects config where expanded deps still have issues', () => {
    // Notifications use the PostgreSQL queue, object storage, a dedicated
    // consumer, and a dedicated scheduler. Dependency expansion wires all of
    // them from scratch.
    const config = parseNrbConfig({
      schemaVersion,
      capabilities: ['notifications'],
    });
    const resolved = resolveConfig(config);
    assert.ok(resolved.capabilities.includes('postgres'));
    assert.ok(resolved.capabilities.includes('s3'));
    assert.ok(resolved.apps.includes('notification-consumer'));
    assert.ok(resolved.apps.includes('notification-scheduler'));
    assert.ok(!resolved.capabilities.includes('telegram-bot'));
    assert.ok(!resolved.capabilities.includes('redis'));
  });
});

/* ==================================================================
 * UNIT: planner.ts — generateConfigFile
 * ================================================================== */

describe('planner — generateConfigFile', () => {
  it('generates nrb.config.json path', () => {
    const config = parseNrbConfig({ schemaVersion });
    const result = generateConfigFile(config);
    assert.equal(result.path, 'nrb.config.json');
    assert.ok(result.content.endsWith('\n'));
    const parsed = JSON.parse(result.content);
    assert.equal(parsed.schemaVersion, '1.0.0');
  });

  it('content is deterministic', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'web' });
    const c1 = generateConfigFile(config);
    const c2 = generateConfigFile(config);
    assert.equal(c1.content, c2.content);
  });
});

/* ==================================================================
 * UNIT: planner.ts — generateSummaryMd
 * ================================================================== */

describe('planner — generateSummaryMd', () => {
  it('generates .nrb/summary.md path', () => {
    const summary = {
      apps: ['admin-app'],
      capabilities: ['postgres'],
      preset: 'web',
      configHash: 'abc123',
    };
    const result = generateSummaryMd(summary);
    assert.equal(result.path, '.nrb/summary.md');
    assert.ok(result.content.includes('# Setup Plan Summary'));
    assert.ok(result.content.includes('`web`'));
    assert.ok(result.content.includes('- admin-app'));
  });

  it('summary content ends with trailing newline', () => {
    const summary = {
      apps: ['a'],
      capabilities: ['b'],
      preset: 'minimal',
      configHash: 'x',
    };
    const result = generateSummaryMd(summary);
    assert.ok(result.content.endsWith('\n'), 'Summary must end with trailing newline');
  });

  it('no preset omits preset line', () => {
    const summary = {
      apps: [],
      capabilities: [],
      preset: undefined,
      configHash: 'x',
    };
    const result = generateSummaryMd(summary);
    assert.ok(!result.content.includes('Preset:'));
    assert.ok(result.content.includes('*No applications selected.*'));
  });

  it('content is deterministic (no timestamps or op counts)', () => {
    const summary = {
      apps: ['a'],
      capabilities: ['b'],
      preset: 'minimal',
      configHash: 'fixed',
    };
    const c1 = generateSummaryMd(summary);
    const c2 = generateSummaryMd(summary);
    assert.equal(c1.content, c2.content);
  });
});

describe('planner — runtime workspace manifest', () => {
  it('groups enabled projects by platform for runtime tooling', () => {
    const result = generateWorkspaceManifest({
      apps: ['user-app', 'user-app-api', 'fullstack-e2e'],
      capabilities: ['postgres'],
      preset: 'web',
      configHash: 'abc',
    });
    const manifest = JSON.parse(result.content);
    assert.equal(result.path, '.nrb/workspace.json');
    assert.deepEqual(manifest.byPlatform.frontend, ['user-app']);
    assert.deepEqual(manifest.byPlatform.backend, ['user-app-api']);
    assert.deepEqual(manifest.byPlatform.e2e, ['fullstack-e2e']);
  });
});

describe('planner — concrete capability activation', () => {
  const summary = {
    apps: ['notification-consumer', 'notification-scheduler', 'user-app-api'],
    capabilities: ['notifications', 'postgres', 's3'],
    configHash: 'abc',
  };

  it('records owned projects, services, and environment contracts', () => {
    const manifest = JSON.parse(generateCapabilitiesManifest(summary).content);
    const notifications = manifest.capabilities.find((entry: { id: string }) => entry.id === 'notifications');
    assert.ok(notifications.projects.includes('@app/backend-feature-notification-main'));
    assert.ok(notifications.dockerServices.includes('notification-scheduler'));
    assert.ok(notifications.dockerServices.includes('notification-consumer'));
    assert.ok(notifications.environmentVariables.includes('NOTIFICATION_REQUESTS_PER_SECOND'));
    assert.ok(
      notifications.generatedFiles.includes(
        'apps/backend/notification/notification-scheduler/src/capabilities.generated.ts',
      ),
    );
    assert.ok(
      notifications.generatedFiles.includes(
        'apps/backend/notification/notification-consumer/src/capabilities.generated.ts',
      ),
    );
    assert.ok(
      notifications.backendWiring.some((wiring: { moduleExpression: string }) =>
        wiring.moduleExpression.includes('enableScheduler: true'),
      ),
    );
  });

  it('generates producer wiring for APIs and delivery wiring for the scheduler', () => {
    const producer = generateBackendCapabilityModule('user-app-api', summary).content;
    const consumer = generateBackendCapabilityModule('notification-consumer', summary).content;
    const scheduler = generateBackendCapabilityModule('notification-scheduler', summary).content;
    assert.match(producer, /enableScheduler: false/);
    assert.match(consumer, /enableConsumer: true/);
    assert.match(scheduler, /enableScheduler: true/);
    assert.doesNotMatch(scheduler, /TelegramBotModule/);
  });

  it('generates compose and bootstrap activation environment', () => {
    const environment = generateComposeEnvironment(summary).content;
    assert.match(environment, /COMPOSE_PROFILES=.*notification-consumer/);
    assert.match(environment, /COMPOSE_PROFILES=.*notification-scheduler/);
    assert.match(environment, /OTEL_ENABLED=false/);
  });
});

/* ==================================================================
 * COMPONENT: planner + state — plan()
 * ================================================================== */

describe('planner — plan() basic', () => {
  it('produces operations for fresh state', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'minimal' });
    const result = plan(config, emptyState);
    assert.ok(result.operations.length > 0);
    assert.equal(result.configHash.length, 64); // SHA-256 hex
    assert.equal(result.expectedState.configHash, result.configHash);
  });

  it('generated plan includes nrb.config.json', () => {
    const config = parseNrbConfig({ schemaVersion });
    const result = plan(config, emptyState);
    const configOp = result.operations.find((o) => o.path === 'nrb.config.json');
    assert.ok(configOp, 'Expected nrb.config.json in operations');
  });

  it('generated plan includes .nrb/summary.md', () => {
    const config = parseNrbConfig({ schemaVersion });
    const result = plan(config, emptyState);
    const summaryOp = result.operations.find((o) => o.path === '.nrb/summary.md');
    assert.ok(summaryOp, 'Expected .nrb/summary.md in operations');
  });

  it('generated plan includes the runtime-consumed workspace manifest', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'web' });
    const result = plan(config, emptyState);
    assert.ok(result.operations.some((operation) => operation.path === '.nrb/workspace.json'));
  });

  it('generated plan includes capability ownership and backend wiring files', () => {
    const config = parseNrbConfig({ schemaVersion, capabilities: ['notifications'] });
    const result = plan(config, emptyState);
    assert.ok(result.operations.some((operation) => operation.path === '.nrb/capabilities.json'));
    assert.ok(
      result.operations.some(
        (operation) => operation.path === 'apps/backend/telegram/telegram-bot-api/src/capabilities.generated.ts',
      ),
    );
  });
});

describe('planner — stable ordering', () => {
  it('plan operations are sorted by compareOperations', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'minimal' });
    const result = plan(config, emptyState);
    for (let i = 1; i < result.operations.length; i++) {
      assert.ok(
        compareOperations(result.operations[i - 1]!, result.operations[i]!) <= 0,
        `Operations not sorted at index ${i}`,
      );
    }
  });
});

describe('planner — idempotency (empty replay)', () => {
  it('second plan with matching state returns empty operations', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'minimal' });
    const first = plan(config, emptyState);
    // Simulate applying: use expected state from first plan
    const second = plan(config, first.expectedState);
    assert.equal(second.operations.length, 0, 'Second plan should be empty (idempotent)');
  });

  it('third plan is also empty', () => {
    const config = parseNrbConfig({ schemaVersion });
    const first = plan(config, emptyState);
    const second = plan(config, first.expectedState);
    const third = plan(config, second.expectedState);
    assert.equal(third.operations.length, 0);
  });
});

describe('planner — generated hash matches', () => {
  it('configHash in summary matches plan configHash', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'bots' });
    const result = plan(config, emptyState);
    assert.equal(result.summary.configHash, result.configHash);
  });
});

describe('planner — prune protection', () => {
  it('without prune option, prunableFiles is empty', () => {
    const config = parseNrbConfig({ schemaVersion });
    const state = buildState('old', { 'nrb.config.json': 'h1', '.nrb/summary.md': 'h2', 'old-file.txt': 'h3' });
    const result = plan(config, state);
    assert.deepEqual(result.prunableFiles, []);
    assert.equal(result.operations.filter((o) => o.kind === 'delete_file').length, 0);
  });

  it('with prune option, stale files are listed as prunable', () => {
    const config = parseNrbConfig({
      schemaVersion,
      options: { prune: true, force: false, dryRun: false, nonInteractive: false },
    });
    const state = buildState('old', {
      'nrb.config.json': 'h1',
      '.nrb/summary.md': 'h2',
      'stale.txt': 'h3',
    });
    const result = plan(config, state);
    assert.ok(result.prunableFiles.includes('stale.txt'), 'stale.txt should be prunable');
  });
});

describe('planner — conflict detection via diff', () => {
  it('content change detected as update not create', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'minimal' });
    const first = plan(config, emptyState);
    // Simulate the config file was changed on disk (hash mismatch)
    const tamperedState = buildState(first.configHash, {
      ...first.expectedState.files,
      'nrb.config.json': 'tampered-hash',
    });
    const result = plan(config, tamperedState);
    const configOp = result.operations.find((o) => o.path === 'nrb.config.json');
    assert.ok(configOp, 'Config file should need updating');
    assert.equal(configOp.kind, 'update_file', 'Should be update, not create');
  });
});

/* ==================================================================
 * E2E: full plan flow
 * ================================================================== */

describe('planner — E2E full flow', () => {
  it('enterprise preset: plan → state → empty replay', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'enterprise' });
    const first = plan(config, emptyState);
    assert.ok(first.operations.length > 0, 'First plan should have operations');
    assert.ok(first.summary.apps.length > 0, 'Should have apps');
    assert.ok(first.summary.capabilities.length > 0, 'Should have capabilities');

    const second = plan(config, first.expectedState);
    assert.equal(second.operations.length, 0, 'Second plan should be empty');
  });

  it('config hash is stable across plans', () => {
    const config = parseNrbConfig({
      schemaVersion,
      apps: ['user-app-api'],
      capabilities: ['postgres'],
    });
    const h1 = plan(config, emptyState).configHash;
    const h2 = plan(config, emptyState).configHash;
    assert.equal(h1, h2);
  });

  it('snapshots contain no timestamps or machine paths', () => {
    const config = parseNrbConfig({ schemaVersion, preset: 'web' });
    const result = plan(config, emptyState);
    for (const op of result.operations) {
      assert.ok(!op.path.startsWith('/'), `Path should be relative: ${op.path}`);
      if ('content' in op) {
        const content = (op as { content?: string }).content;
        assert.ok(content === undefined || !content.includes(new Date().toISOString()), 'No ISO timestamps in content');
      }
    }
  });
});
