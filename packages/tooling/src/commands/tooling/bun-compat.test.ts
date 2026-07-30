// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { buildSelectedClosure, createLiveProjectGraph, type SelectedClosureManifest } from '../../setup/closure.js';
import { expandPreset, presets } from '../../setup/presets.js';
import { defaultOperationalFields } from '../../setup/test-fixtures.js';
import {
  assertProviderIsolation,
  assertRuntimeIdentity,
  childHasExited,
  createBunCompatibilityInvocation,
  createBunCompatibilityProbeEnvironment,
  createBunCompatibilityProbes,
  createBunRuntimeExecutionProbes,
  createCanonicalNodeInvocation,
  createHeadlessRuntimeEnvironment,
  createLocalMongoUri,
  createNodeBackedPnpmInvocation,
  isNodeOnlyTestProject,
  readPinnedBunVersion,
  resolveBunRuntimeSelection,
  resolveCanonicalNodeExecutable,
  runBoundedCommand,
  runWithCleanup,
  waitForUrls,
} from './bun-compat.js';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function closure(options: {
  provider: 'postgres' | 'mongodb' | null;
  roots: string[];
  projects?: string[];
  externalPackages?: Record<string, string>;
  targets?: Partial<SelectedClosureManifest['targets']>;
}): SelectedClosureManifest {
  return {
    schemaVersion: 1,
    configHash: 'a'.repeat(64),
    graphDigest: 'b'.repeat(64),
    provider: options.provider,
    roots: options.roots,
    projects: options.projects ?? options.roots,
    targets: { build: options.roots, test: options.roots, e2e: options.roots, ...options.targets },
    externalPackages: options.externalPackages ?? {},
    services: options.roots,
    releaseImages: options.roots,
    ...defaultOperationalFields(),
  };
}

function createShimPath(): { bunNode: string; canonicalNode: string; path: string; pnpm: string } {
  const bunShimRoot = mkdtempSync(join(tmpdir(), 'nrb-bun-node-path-'));
  const pnpmRoot = mkdtempSync(join(tmpdir(), 'nrb-pnpm-path-'));
  const nodeRoot = mkdtempSync(join(tmpdir(), 'nrb-node-path-'));
  temporaryRoots.push(bunShimRoot, pnpmRoot, nodeRoot);
  const bunNode = join(bunShimRoot, 'node');
  const canonicalNode = join(nodeRoot, 'node');
  const pnpm = join(pnpmRoot, 'pnpm');
  writeFileSync(bunNode, '#!/bin/sh\n');
  symlinkSync(process.execPath, canonicalNode);
  writeFileSync(pnpm, '#!/bin/sh\nexec node --version\n');
  chmodSync(bunNode, 0o755);
  chmodSync(pnpm, 0o755);
  return { bunNode, canonicalNode, path: [bunShimRoot, pnpmRoot, nodeRoot].join(delimiter), pnpm };
}

describe('Bun compatibility contract', () => {
  it('derives provider-free, minimal, bots, worker, and arbitrary custom runtime selections', () => {
    assert.deepEqual(resolveBunRuntimeSelection(closure({ provider: null, roots: ['landing-app'] })), {
      provider: null,
      projects: [],
      http: [],
      headless: [],
    });
    assert.deepEqual(resolveBunRuntimeSelection(closure({ provider: 'postgres', roots: ['auth-app-api', 'user-app-api'] })), {
      provider: 'postgres',
      projects: ['auth-app-api', 'user-app-api'],
      http: ['auth-app-api', 'user-app-api'],
      headless: [],
    });
    assert.deepEqual(
      resolveBunRuntimeSelection(
        closure({ provider: 'mongodb', roots: ['notification-consumer', 'notification-scheduler'] }),
      ),
      {
        provider: 'mongodb',
        projects: ['notification-consumer', 'notification-scheduler'],
        http: [],
        headless: ['notification-consumer', 'notification-scheduler'],
      },
    );
  });

  it('assigns real HTTP probes to standalone user, admin, Discord, and Telegram roots', () => {
    for (const project of ['user-app-api', 'admin-app-api', 'discord-app-api', 'telegram-bot-api']) {
      const selection = resolveBunRuntimeSelection(closure({ provider: 'postgres', roots: [project] }));
      assert.deepEqual(selection.http, [project]);
      assert.deepEqual(createBunRuntimeExecutionProbes(selection), [{ project, kind: 'http' }]);
    }
  });

  it('fails closed when a selected backend runtime has no durable provider', () => {
    assert.throws(
      () => resolveBunRuntimeSelection(closure({ provider: null, roots: ['user-app-api'] })),
      /require an explicit PostgreSQL or MongoDB provider/u,
    );
  });

  it('keeps Node-only tools on Node while Bun owns the remaining closure probes', () => {
    const probes = createBunCompatibilityProbes(
      closure({
        provider: null,
        roots: ['mobile-app', 'acceptance-e2e', 'orders-acceptance-e2e', 'fullstack-e2e'],
        targets: {
          export: ['mobile-app'],
          test: ['mobile-app', 'acceptance-e2e', 'orders-acceptance-e2e', 'fullstack-e2e'],
        },
      }),
    );
    const expo = probes.find((probe) => probe.name === 'Selected closure exports');
    assert.equal(expo?.runtime, 'node');
    assert.ok(expo);
    const acceptance = probes.find((probe) => probe.name === 'Node-only closure tests');
    assert.equal(acceptance?.runtime, 'node');
    assert.equal(acceptance?.environmentScope, 'test');
    assert.ok(acceptance?.nxArgs.includes('--projects=acceptance-e2e,orders-acceptance-e2e,fullstack-e2e'));
    assert.ok(
      !probes.find((probe) => probe.name === 'Selected closure unit tests')?.nxArgs.includes('acceptance-e2e'),
    );
    assert.equal(isNodeOnlyTestProject('acceptance-e2e'), true);
    assert.equal(isNodeOnlyTestProject('orders-acceptance-e2e'), true);
    assert.equal(isNodeOnlyTestProject('fullstack-e2e'), true);
    assert.equal(isNodeOnlyTestProject('orders-e2e'), false);

    const unitTests = probes.find((probe) => probe.name === 'Selected closure unit tests');
    assert.equal(unitTests?.environmentScope, 'test');

    const bunProbe = probes.find((probe) => probe.runtime === undefined);
    assert.ok(bunProbe);
    const bunInvocation = createBunCompatibilityInvocation(
      bunProbe,
      { BUN_BE_BUN: '1', CI: 'true' },
      '/runtime/bun',
    );
    assert.equal(bunInvocation.program, '/runtime/bun');
    assert.deepEqual(bunInvocation.args.slice(0, 3), ['run', '--bun', 'nx']);
    assert.equal(bunInvocation.environment.BUN_BE_BUN, '1');
  });

  it("bypasses Bun's PATH node shim for Expo and Cucumber probes", () => {
    const { bunNode, canonicalNode, path } = createShimPath();
    const probes = createBunCompatibilityProbes(
      closure({
        provider: null,
        roots: ['mobile-app', 'orders-acceptance-e2e'],
        targets: { export: ['mobile-app'], test: ['orders-acceptance-e2e'] },
      }),
    );

    for (const probeName of ['Selected closure exports', 'Node-only closure tests']) {
      const probe = probes.find(({ name }) => name === probeName);
      assert.ok(probe);
      const invocation = createBunCompatibilityInvocation(
        probe,
        { PATH: path, BUN_BE_BUN: '1', CI: 'true' },
        bunNode,
      );
      assert.equal(invocation.program, canonicalNode);
      assert.notEqual(invocation.program, bunNode);
      assert.notEqual(invocation.program, 'node');
      assert.equal(isAbsolute(invocation.program), true);
      assert.equal(invocation.environment.BUN_BE_BUN, undefined);
      assert.equal(invocation.environment.PATH?.split(delimiter)[0], dirname(canonicalNode));
      assert.equal(invocation.environment.npm_node_execpath, canonicalNode);
    }
  });

  it('gives nested Node-only child tools canonical Node identity', () => {
    const { bunNode, canonicalNode, path } = createShimPath();
    writeFileSync(bunNode, '#!/bin/sh\nprintf "bun-node-shim\\n"\n');
    chmodSync(bunNode, 0o755);
    const invocation = createBunCompatibilityInvocation(
      { name: 'Node-only probe', nxArgs: [], runtime: 'node' },
      { PATH: path, BUN_BE_BUN: '1' },
      bunNode,
    );
    const nested = spawnSync(
      invocation.program,
      [
        '--input-type=module',
        '--eval',
        "import { spawnSync } from 'node:child_process'; const result = spawnSync('node', ['--version'], { encoding: 'utf8' }); process.stdout.write(result.stdout); process.exit(result.status ?? 1);",
      ],
      { encoding: 'utf8', env: invocation.environment },
    );

    assert.equal(nested.status, 0, nested.stderr);
    assert.equal(nested.stdout.trim(), process.version);
  });

  it('derives Nx probes only from the selected closure targets', () => {
    const selected = closure({ provider: 'postgres', roots: ['auth-app-api', 'notification-consumer'] });
    const probes = createBunCompatibilityProbes(selected);
    const contract = probes
      .map((probe) => `${probe.name}: ${probe.nxArgs.join(' ')}`)
      .join('\n');
    for (const expected of [
      'show projects',
      '--projects=auth-app-api,notification-consumer',
      '--projects=auth-app-api,notification-consumer',
      'auth-app-api:e2e',
      '--coverage.enabled=false',
    ]) {
      assert.match(contract, new RegExp(expected));
    }
    assert.doesNotMatch(contract, /admin-app|mobile-app|user-app/u);
    assert.ok(probes.find((probe) => probe.name === 'Selected closure unit tests')?.nxArgs.includes('--parallel=1'));
  });

  it('keeps provider runtime configuration out of closure unit tests', () => {
    const testProbe = createBunCompatibilityProbes(
      closure({ provider: 'postgres', roots: ['auth-app-api'], targets: { test: ['auth-app-api'] } }),
    ).find((probe) => probe.name === 'Selected closure unit tests');
    assert.ok(testProbe);
    const providerEnvironment = {
      AUTH_PERSISTENCE: 'postgres',
      COMPOSE_PROFILES: 'postgres,auth-app-api',
      CONTAINER_DATABASE_URL: 'postgres://container',
      DATABASE_ENGINE: 'postgres',
      DATABASE_URL: 'postgres://host',
      MONGODB_DATABASE: 'stale',
      MONGODB_PORT: '27017',
      MONGODB_REPLICA_SET: 'rs0',
      MONGODB_URI: 'mongodb://stale',
      DOCKER_DATABASE_URL: 'postgres://docker',
      DOCKER_MONGODB_URI: 'mongodb://docker',
      PGHOST: 'database.internal',
      POSTGRES_DB: 'ambient',
      POSTGRES_PASSWORD: 'ambient-secret',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'ambient',
      Postgres_SslMode: 'require',
      UNRELATED_VALUE: 'preserved',
    };

    const testEnvironment = createBunCompatibilityProbeEnvironment(testProbe, providerEnvironment);
    assert.deepEqual(testEnvironment, { UNRELATED_VALUE: 'preserved' });
    assert.deepEqual(
      createBunCompatibilityProbeEnvironment({ name: 'build', nxArgs: [] }, providerEnvironment),
      providerEnvironment,
    );
  });

  it('fails closed on opposite-provider selections', () => {
    const leaked = closure({
      provider: 'postgres',
      roots: ['auth-app-api', 'notification-consumer'],
      projects: ['auth-app-api', 'notification-consumer', '@app/backend-mongodb-main'],
      externalPackages: { mongodb: '7.0.0' },
    });
    assert.throws(() => assertProviderIsolation(leaked), /opposite-provider ownership/u);
  });

  it('creates valid probes and runtime selections for every preset closure', async () => {
    const graph = await createLiveProjectGraph();
    for (const preset of presets) {
      const expanded = expandPreset(preset.id);
      const selected = buildSelectedClosure(graph, {
        ...expanded,
        configHash: 'c'.repeat(64),
      });
      const selection = resolveBunRuntimeSelection(selected);
      assert.ok(selection.projects.every((project) => selected.roots.includes(project)), preset.id);
      assert.deepEqual(
        createBunRuntimeExecutionProbes(selection).map(({ project }) => project),
        selection.projects,
        `${preset.id}: every selected runtime must execute a startup/readiness/lifecycle probe`,
      );
      for (const probe of createBunCompatibilityProbes(selected)) {
        const projectArgument = probe.nxArgs.find((argument) => argument.startsWith('--projects='));
        if (!projectArgument) continue;
        const projects = projectArgument.slice('--projects='.length).split(',');
        const allowed = probe.name === 'Selected Nx project graph' ? selected.projects : Object.values(selected.targets).flat();
        assert.ok(projects.every((project) => allowed.includes(project)), `${preset.id}: ${probe.name}`);
      }
    }
  });

  it('creates exhaustive runtime probes for custom MongoDB core and bot selections', () => {
    for (const presetId of ['minimal', 'bots'] as const) {
      const expanded = expandPreset(presetId);
      const selected = closure({ provider: 'mongodb', roots: [...expanded.apps].sort() });
      const selection = resolveBunRuntimeSelection(selected);
      assert.equal(selection.provider, 'mongodb');
      assert.deepEqual(
        createBunRuntimeExecutionProbes(selection).map(({ project }) => project),
        selection.projects,
        `${presetId}: every custom MongoDB runtime must execute`,
      );
      assert.ok(selection.http.includes('auth-app-api'), presetId);
      assert.ok(selection.http.includes('user-app-api'), presetId);
      if (presetId === 'bots') {
        assert.ok(selection.http.includes('discord-app-api'));
        assert.ok(selection.http.includes('telegram-bot-api'));
      }
    }
  });

  it('requires an exact pinned Bun version', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-bun-version-'));
    temporaryRoots.push(root);
    writeFileSync(join(root, '.bun-version'), '1.3.14\n');
    assert.equal(readPinnedBunVersion(root), '1.3.14');

    writeFileSync(join(root, '.bun-version'), 'latest\n');
    assert.throws(() => readPinnedBunVersion(root), /exact semantic version/u);
  });

  it('runs the Linux pnpm shell launcher with canonical Node first on PATH', () => {
    const { bunNode, canonicalNode, path, pnpm } = createShimPath();
    const unusableBunNode = join(dirname(pnpm), 'bun-node-temporary-wrapper');
    writeFileSync(unusableBunNode, '#!/bin/sh\n');

    const invocation = createNodeBackedPnpmInvocation(
      ['install'],
      { PATH: path, BUN_BE_BUN: '1', npm_node_execpath: unusableBunNode },
      bunNode,
    );
    assert.equal(invocation.command, pnpm);
    assert.deepEqual(invocation.args, ['install']);
    assert.equal(invocation.environment.BUN_BE_BUN, undefined);
    assert.equal(invocation.environment.PATH?.split(delimiter)[0], dirname(canonicalNode));
    assert.equal(invocation.environment.npm_node_execpath, canonicalNode);
    const result = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      env: invocation.environment,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), process.version);
    assert.equal(resolveCanonicalNodeExecutable({ PATH: path }, pnpm, bunNode), canonicalNode);
    assert.throws(() => createNodeBackedPnpmInvocation([], { PATH: '' }, bunNode), /pnpm is required on PATH/u);
  });

  it('runs the active pnpm module through canonical Node on Windows', () => {
    const { bunNode, canonicalNode, path } = createShimPath();
    const pnpmModuleRoot = mkdtempSync(join(tmpdir(), 'nrb-pnpm-module-'));
    temporaryRoots.push(pnpmModuleRoot);
    const pnpmModule = join(pnpmModuleRoot, 'pnpm.cjs');
    writeFileSync(pnpmModule, 'process.stdout.write(process.version);\n');

    const invocation = createNodeBackedPnpmInvocation(
      ['install'],
      {
        PATH: path.split(delimiter).join(';'),
        PATHEXT: '.EXE;.CMD',
        BUN_BE_BUN: '1',
        npm_execpath: pnpmModule,
        npm_node_execpath: canonicalNode,
      },
      bunNode,
      'win32',
    );
    assert.equal(invocation.command, canonicalNode);
    assert.deepEqual(invocation.args, [pnpmModule, 'install']);
    assert.equal(invocation.environment.BUN_BE_BUN, undefined);
    assert.equal(invocation.environment.PATH?.split(';')[0], dirname(canonicalNode));

    const result = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      env: invocation.environment,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, process.version);
  });

  it('discovers canonical Node through Windows PATHEXT', () => {
    const { bunNode, canonicalNode, pnpm } = createShimPath();
    const windowsNode = `${canonicalNode}.EXE`;
    symlinkSync(process.execPath, windowsNode);

    assert.equal(
      resolveCanonicalNodeExecutable(
        { PATH: [dirname(bunNode), dirname(canonicalNode)].join(';'), PATHEXT: '.EXE;.CMD' },
        `${pnpm}.CMD`,
        bunNode,
        'win32',
      ),
      windowsNode,
    );
  });

  it('gives canonical deployment-build descendants canonical Node identity', () => {
    const { bunNode, canonicalNode, path } = createShimPath();
    writeFileSync(bunNode, '#!/bin/sh\nprintf "bun-node-shim\\n"\n');
    chmodSync(bunNode, 0o755);
    const invocation = createCanonicalNodeInvocation(
      [
        '--input-type=module',
        '--eval',
        "import { spawnSync } from 'node:child_process'; const result = spawnSync('node', ['--version'], { encoding: 'utf8' }); process.stdout.write(result.stdout); process.exit(result.status ?? 1);",
      ],
      { PATH: path, BUN_BE_BUN: '1' },
      bunNode,
    );
    const nested = spawnSync(invocation.program, invocation.args, {
      encoding: 'utf8',
      env: invocation.environment,
    });

    assert.equal(invocation.program, canonicalNode);
    assert.equal(nested.status, 0, nested.stderr);
    assert.equal(nested.stdout.trim(), process.version);
  });

  it('uses the selected MongoDB port in compatibility connection strings', () => {
    assert.equal(
      createLocalMongoUri(47123, 'compat'),
      'mongodb://mongodb.localhost:47123/compat?replicaSet=rs0&retryWrites=true',
    );
  });

  it('enforces command deadlines and terminates descendant process trees', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-bounded-command-'));
    temporaryRoots.push(root);
    const heartbeatPath = join(root, 'heartbeat');
    const childPidPath = join(root, 'child.pid');
    const childScript = join(root, 'child.mjs');
    const parentScript = join(root, 'parent.mjs');
    writeFileSync(
      childScript,
      "import { appendFileSync } from 'node:fs'; process.on('SIGTERM', () => undefined); setInterval(() => appendFileSync(process.argv[2], 'x'), 20);",
    );
    writeFileSync(
      parentScript,
      `import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs'; const child = spawn(process.execPath, [${JSON.stringify(childScript)}, ${JSON.stringify(heartbeatPath)}], { stdio: 'ignore' }); writeFileSync(${JSON.stringify(childPidPath)}, String(child.pid)); setInterval(() => undefined, 1000);`,
    );

    const started = Date.now();
    try {
      await assert.rejects(
        runBoundedCommand(process.execPath, [parentScript], 'Hanging process tree', {
          cwd: root,
          stdio: 'ignore',
          timeoutMs: 500,
          terminationGraceMs: 50,
          forceKillWaitMs: 250,
        }),
        /timed out after 500ms/u,
      );
      assert.ok(Date.now() - started < 1_500, 'command timeout exceeded its termination bound');
      assert.equal(existsSync(heartbeatPath), true, 'descendant never started');
      const heartbeatSize = statSync(heartbeatPath).size;
      await delay(150);
      assert.equal(statSync(heartbeatPath).size, heartbeatSize, 'descendant survived process-tree cleanup');
    } finally {
      if (existsSync(childPidPath)) {
        try {
          process.kill(Number.parseInt(readFileSync(childPidPath, 'utf8'), 10), 'SIGKILL');
        } catch {
          // The expected process-tree cleanup already removed the descendant.
        }
      }
    }
  });

  it('aborts stalled readiness requests within the runtime deadline', async () => {
    const server = createHttpServer(() => undefined);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const started = Date.now();
    try {
      await assert.rejects(
        waitForUrls(
          { exitCode: null, signalCode: null },
          [`http://127.0.0.1:${address.port}/ready`],
          { readyTimeoutMs: 150, requestTimeoutMs: 50 },
        ),
        /Runtime smoke timed out/u,
      );
      assert.ok(Date.now() - started < 1_000, 'readiness request exceeded its deadline');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('preserves primary failures while reporting cleanup failures', async () => {
    const primaryError = new Error('probe failed');
    const cleanupError = new Error('cleanup failed');
    let reportedCleanupError: unknown;
    await assert.rejects(
      runWithCleanup(
        async () => {
          throw primaryError;
        },
        async () => {
          throw cleanupError;
        },
        (error) => {
          reportedCleanupError = error;
        },
      ),
      (error: unknown) => error === primaryError,
    );
    assert.equal(reportedCleanupError, cleanupError);
  });

  it('fails when cleanup is the only failure', async () => {
    const cleanupError = new Error('cleanup failed');
    await assert.rejects(
      runWithCleanup(
        async () => undefined,
        async () => {
          throw cleanupError;
        },
      ),
      (error: unknown) => error === cleanupError,
    );
  });

  it('recognizes both normal and signal-based child exits', () => {
    assert.equal(childHasExited({ exitCode: null, signalCode: null }), false);
    assert.equal(childHasExited({ exitCode: 0, signalCode: null }), true);
    assert.equal(childHasExited({ exitCode: null, signalCode: 'SIGTERM' }), true);
  });

  it('rejects missing or mismatched child runtime identity', () => {
    assert.doesNotThrow(() => assertRuntimeIdentity('bun', 'bun', 'site-app'));
    assert.throws(
      () => assertRuntimeIdentity('node', 'bun', 'site-app'),
      /site-app did not report runtime=bun; received node/u,
    );
    assert.throws(
      () => assertRuntimeIdentity(undefined, 'node', 'notification-consumer'),
      /received no runtime identity/u,
    );
  });

  it('provides isolated notification configuration to headless runtime probes', () => {
    const environment = createHeadlessRuntimeEnvironment({ NODE_PATH: '/workspace/node_modules' });
    assert.equal(environment.NODE_PATH, undefined);
    assert.match(environment.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY ?? '', /^[0-9a-f]{64}$/u);
    assert.equal(Buffer.from(environment.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY ?? '', 'hex').byteLength, 32);
    assert.equal(environment.RESEND_API_KEY, 'bun-test-key');
    assert.equal(environment.NOTIFICATION_EMAIL_FROM, 'Bun Compatibility <bun-compat@example.test>');
  });
});
