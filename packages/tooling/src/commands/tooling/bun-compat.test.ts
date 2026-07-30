// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { buildSelectedClosure, createLiveProjectGraph, type SelectedClosureManifest } from '../../setup/closure.js';
import { expandPreset, presets } from '../../setup/presets.js';
import { defaultOperationalFields } from '../../setup/test-fixtures.js';
import {
  assertProviderIsolation,
  childHasExited,
  createBunCompatibilityInvocation,
  createNodeBackedPnpmInvocation,
  createBunCompatibilityProbes,
  createBunRuntimeExecutionProbes,
  createHeadlessRuntimeEnvironment,
  readPinnedBunVersion,
  resolveBunRuntimeSelection,
  resolveCanonicalNodeExecutable,
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

  it('keeps selected Expo exports on Node while Bun owns the remaining closure probes', () => {
    const probes = createBunCompatibilityProbes(
      closure({ provider: null, roots: ['mobile-app'], targets: { export: ['mobile-app'] } }),
    );
    const expo = probes.find((probe) => probe.name === 'Selected closure exports');
    assert.equal(expo?.runtime, 'node');
    assert.ok(expo);

    const expoInvocation = createBunCompatibilityInvocation(
      expo,
      { BUN_BE_BUN: '1', CI: 'true' },
      '/runtime/bun',
    );
    assert.equal(expoInvocation.program, 'node');
    assert.deepEqual(expoInvocation.args.slice(0, 3), [
      'node_modules/nx/dist/bin/nx.js',
      'run-many',
      '-t',
    ]);
    assert.equal(expoInvocation.environment.BUN_BE_BUN, undefined);

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

  it('runs pnpm through canonical Node instead of Bun shebang handling', () => {
    const bunShimRoot = mkdtempSync(join(tmpdir(), 'nrb-bun-node-path-'));
    const nodeRoot = mkdtempSync(join(tmpdir(), 'nrb-pnpm-path-'));
    temporaryRoots.push(bunShimRoot, nodeRoot);
    const node = join(nodeRoot, 'node');
    const pnpm = join(nodeRoot, 'pnpm');
    writeFileSync(join(bunShimRoot, 'node'), '#!/bin/sh\n');
    writeFileSync(node, '#!/bin/sh\n');
    writeFileSync(pnpm, '#!/usr/bin/env node\n');

    assert.deepEqual(createNodeBackedPnpmInvocation(['install'], { PATH: `${bunShimRoot}${delimiter}${nodeRoot}` }), {
      command: node,
      args: [pnpm, 'install'],
    });
    assert.equal(resolveCanonicalNodeExecutable({ PATH: `${bunShimRoot}${delimiter}${nodeRoot}` }), node);
    assert.throws(() => createNodeBackedPnpmInvocation([], { PATH: '' }), /pnpm is required on PATH/u);
  });

  it('recognizes both normal and signal-based child exits', () => {
    assert.equal(childHasExited({ exitCode: null, signalCode: null }), false);
    assert.equal(childHasExited({ exitCode: 0, signalCode: null }), true);
    assert.equal(childHasExited({ exitCode: null, signalCode: 'SIGTERM' }), true);
  });

  it('provides a valid isolated notification key to headless runtime probes', () => {
    const environment = createHeadlessRuntimeEnvironment({ NODE_PATH: '/workspace/node_modules' });
    assert.equal(environment.NODE_PATH, undefined);
    assert.match(environment.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY ?? '', /^[0-9a-f]{64}$/u);
    assert.equal(Buffer.from(environment.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY ?? '', 'hex').byteLength, 32);
  });
});
