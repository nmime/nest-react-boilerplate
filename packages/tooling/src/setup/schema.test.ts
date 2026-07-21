/**
 * Tests for setup schema, catalog, and presets.
 *
 * Three layers: UNIT (isolated functions), COMPONENT (multi-unit integration),
 * E2E (full flow from raw JSON to validated expanded configuration).
 *
 * Runs with `node --test --import jiti/register`.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  parseNrbConfig,
  safeParseNrbConfig,
  schemaVersion,
  appIds,
  capabilityIds,
  presetIds,
  frontendAppIds,
  backendAppIds,
} from './schema.js';
import {
  appCatalog,
  backendCapabilityModuleCatalog,
  capabilityCatalog,
  validateSelection,
  expandDependencies,
} from './catalog.js';
import { presets, findPreset, listPresetIds, listPresets, expandPreset } from './presets.js';

/* ==================================================================
 * UNIT: Schema validation
 * ================================================================== */
describe('schema — parseNrbConfig', () => {
  it('accepts minimal valid config with just schemaVersion', () => {
    const c = parseNrbConfig({ schemaVersion });
    assert.equal(c.schemaVersion, '1.0.0');
    assert.deepEqual(c.apps, []);
    assert.deepEqual(c.capabilities, []);
    assert.deepEqual(c.options, { prune: false, force: false, dryRun: false, nonInteractive: false });
  });

  it('accepts config with a preset plus explicit extensions', () => {
    const c = parseNrbConfig({
      schemaVersion,
      preset: 'web',
      apps: ['user-app'],
      capabilities: ['i18n'],
      options: { dryRun: true },
    });
    assert.equal(c.preset, 'web');
    assert.deepEqual(c.apps, ['user-app']);
    assert.deepEqual(c.capabilities, ['i18n']);
    assert.equal(c.options.dryRun, true);
  });

  it('accepts fully-specified config', () => {
    const c = parseNrbConfig({
      schemaVersion,
      preset: 'enterprise',
      apps: ['admin-app', 'user-app-api'],
      capabilities: ['postgres', 'redis'],
      options: { prune: true, force: true, dryRun: true, nonInteractive: true },
    });
    assert.equal(c.preset, 'enterprise');
    assert.deepEqual(c.apps, ['admin-app', 'user-app-api']);
    assert.deepEqual(c.capabilities, ['postgres', 'redis']);
    assert.equal(c.options.prune, true);
    assert.equal(c.options.force, true);
  });

  it('rejects unknown top-level keys', () => {
    assert.equal(safeParseNrbConfig({ schemaVersion, unknownKey: 'nope' }).success, false);
  });

  it('rejects wrong schema version', () => {
    assert.equal(safeParseNrbConfig({ schemaVersion: '0.9.9' }).success, false);
  });

  it('rejects missing schemaVersion', () => {
    assert.equal(safeParseNrbConfig({ apps: [] }).success, false);
  });

  it('rejects unknown preset', () => {
    assert.equal(safeParseNrbConfig({ schemaVersion, preset: 'nonexistent' }).success, false);
  });

  it('rejects unknown app ID in apps array', () => {
    assert.equal(safeParseNrbConfig({ schemaVersion, apps: ['fake-app'] }).success, false);
  });

  it('rejects unknown capability ID in capabilities array', () => {
    assert.equal(safeParseNrbConfig({ schemaVersion, capabilities: ['fake-capability'] }).success, false);
  });

  it('rejects non-string values in apps array', () => {
    assert.equal(safeParseNrbConfig({ schemaVersion, apps: [123] }).success, false);
  });

  it('rejects non-boolean option values', () => {
    assert.equal(safeParseNrbConfig({ schemaVersion, options: { dryRun: 'yes' } }).success, false);
  });

  it('rejects unknown option keys', () => {
    assert.equal(safeParseNrbConfig({ schemaVersion, options: { unknownOption: true } }).success, false);
  });

  it('rejects non-object input', () => {
    assert.equal(safeParseNrbConfig(null).success, false);
    assert.equal(safeParseNrbConfig(undefined).success, false);
    assert.equal(safeParseNrbConfig('string').success, false);
    assert.equal(safeParseNrbConfig(42).success, false);
    assert.equal(safeParseNrbConfig([]).success, false);
  });
});

/* ==================================================================
 * UNIT: Schema constants
 * ================================================================== */
describe('schema — constants', () => {
  it('exports all known app IDs', () => {
    const expected = [
      'admin-app',
      'user-app',
      'landing-app',
      'site-app',
      'mobile-app',
      'admin-app-api',
      'user-app-api',
      'auth-app-api',
      'discord-app-api',
      'telegram-bot-api',
      'notification-consumer',
      'notification-scheduler',
      'fullstack-e2e',
    ] as const;
    assert.deepEqual([...appIds].sort(), [...expected].sort());
  });

  it('exports all known capability IDs', () => {
    const expected = [
      'i18n',
      'analytics',
      'websockets',
      'feature-flags',
      'notifications',
      'design-tokens',
      'authz',
      'postgres',
      'redis',
      's3',
      'static-data',
      'nats',
      'otel',
      'swagger',
      'telegram-bot',
      'discord-bot',
    ] as const;
    assert.deepEqual([...capabilityIds].sort(), [...expected].sort());
  });

  it('exports exactly five preset IDs', () => {
    assert.deepEqual(presetIds, ['minimal', 'web', 'fullstack', 'enterprise', 'bots']);
  });

  it('frontend and backend app IDs are disjoint', () => {
    assert.deepEqual(
      frontendAppIds.filter((id) => (backendAppIds as readonly string[]).includes(id)),
      [],
    );
  });
});

/* ==================================================================
 * UNIT: Catalog
 * ================================================================== */
describe('catalog — appCatalog', () => {
  it('has an entry for every app ID', () => {
    for (const id of appIds) {
      assert.ok(appCatalog[id], `Missing: ${id}`);
      assert.equal(appCatalog[id].id, id);
      assert.ok(appCatalog[id].runtime.trim().length > 0, `Missing runtime: ${id}`);
    }
  });

  it('admin-app requires both APIs used by its authenticated runtime', () => {
    assert.deepEqual(appCatalog['admin-app'].requiresApps, ['admin-app-api', 'auth-app-api']);
  });

  it('admin-app-api requires notifications for its broadcast surface', () => {
    assert.ok(appCatalog['admin-app-api'].requiresCapabilities.includes('notifications'));
  });

  it('mobile-app requires both APIs used by its authenticated runtime', () => {
    assert.deepEqual(appCatalog['mobile-app'].requiresApps, ['auth-app-api', 'user-app-api']);
  });

  it('user-app requires user-app-api', () => {
    assert.ok(appCatalog['user-app'].requiresApps.includes('user-app-api'));
  });

  it('telegram-bot-api requires telegram-bot capability', () => {
    const e = appCatalog['telegram-bot-api'];
    assert.ok(e.requiresCapabilities.includes('telegram-bot'));
    assert.ok(e.requiresCapabilities.includes('postgres'));
  });

  it('classifies integrations and the notification scheduler as optional applications', () => {
    const reference = Object.values(appCatalog)
      .filter((entry) => entry.classification === 'reference')
      .map((entry) => entry.id)
      .sort();
    const optional = Object.values(appCatalog)
      .filter((entry) => entry.classification === 'optional')
      .map((entry) => entry.id)
      .sort();

    assert.deepEqual(reference, [
      'admin-app',
      'admin-app-api',
      'auth-app-api',
      'fullstack-e2e',
      'landing-app',
      'mobile-app',
      'site-app',
      'user-app',
      'user-app-api',
    ]);
    assert.deepEqual(optional, [
      'discord-app-api',
      'notification-consumer',
      'notification-scheduler',
      'telegram-bot-api',
    ]);
  });

  it('uses landing-app as the apex and app IDs for every other deployable hostname', () => {
    const hostnames = new Set<string>();
    for (const entry of Object.values(appCatalog)) {
      if (entry.publicHostname === null) {
        assert.equal(entry.publicHostname, null);
        continue;
      }
      const expectedHostname = entry.id === 'landing-app' ? 'example.com' : `${entry.id}.example.com`;
      assert.equal(entry.publicHostname, expectedHostname);
      assert.equal(hostnames.has(entry.publicHostname), false, entry.publicHostname);
      hostnames.add(entry.publicHostname);
    }
    assert.equal(hostnames.size, 10);
  });

  it('fullstack-e2e requires the complete stack it starts', () => {
    assert.deepEqual(appCatalog['fullstack-e2e'].requiresApps, [
      'admin-app',
      'admin-app-api',
      'auth-app-api',
      'landing-app',
      'user-app',
      'user-app-api',
    ]);
  });

  it('every app references valid capability IDs', () => {
    for (const entry of Object.values(appCatalog)) {
      for (const cap of [...entry.requiresCapabilities, ...entry.conflictsWithCapabilities]) {
        assert.ok(capabilityIds.includes(cap), `${entry.id} -> ${cap}`);
      }
    }
  });

  it('every app references valid app IDs in requiresApps', () => {
    for (const entry of Object.values(appCatalog)) {
      for (const app of entry.requiresApps) {
        assert.ok(appIds.includes(app), `${entry.id} -> ${app}`);
      }
    }
  });
});

describe('catalog — capabilityCatalog', () => {
  it('has an entry for every capability ID', () => {
    for (const id of capabilityIds) {
      assert.ok(capabilityCatalog[id], `Missing: ${id}`);
      assert.equal(capabilityCatalog[id].id, id);
    }
  });

  it('notifications requires its persistence, object storage, consumer, and scheduler', () => {
    assert.deepEqual(capabilityCatalog['notifications'].requiresCapabilities, ['postgres', 's3']);
    assert.deepEqual(capabilityCatalog['notifications'].requiresApps, [
      'notification-consumer',
      'notification-scheduler',
    ]);
  });

  it('every capability references valid IDs', () => {
    for (const entry of Object.values(capabilityCatalog)) {
      for (const cap of [...entry.requiresCapabilities, ...entry.conflictsWith]) {
        assert.ok(capabilityIds.includes(cap), `${entry.id} -> ${cap}`);
      }
    }
  });

  it('keeps enterprise backend wiring compatible with Nx scope boundaries', () => {
    const workspaceRoot = process.cwd();
    interface ScopeConstraint {
      sourceTag: string;
      onlyDependOnLibsWithTags: string[];
    }

    const constraintsPath = resolve(workspaceRoot, 'packages/tooling/config/nx-scope-constraints.json');
    const constraints = JSON.parse(readFileSync(constraintsPath, 'utf8')) as ScopeConstraint[];
    const scopeConstraints = new Map(
      constraints
        .filter((constraint) => constraint.sourceTag.startsWith('scope:'))
        .map((constraint) => [constraint.sourceTag, constraint.onlyDependOnLibsWithTags]),
    );
    const tsconfig = JSON.parse(readFileSync(resolve(workspaceRoot, 'tsconfig.base.json'), 'utf8')) as {
      compilerOptions: { paths: Record<string, string[]> };
    };

    const readScope = (workspacePath: string): string => {
      let directory = dirname(resolve(workspaceRoot, workspacePath));
      while (directory.startsWith(workspaceRoot)) {
        const projectPath = resolve(directory, 'project.json');
        if (existsSync(projectPath)) {
          const project = JSON.parse(readFileSync(projectPath, 'utf8')) as { tags: string[] };
          const scope = project.tags.find((tag) => tag.startsWith('scope:'));
          assert.ok(scope, `${projectPath} must declare a scope tag`);
          return scope;
        }
        if (directory === workspaceRoot) {
          break;
        }
        directory = dirname(directory);
      }
      throw new Error(`No project.json owns ${workspacePath}`);
    };

    const selection = expandPreset('enterprise');
    const selectedApps = new Set(selection.apps);
    for (const capabilityId of selection.capabilities) {
      for (const wiring of capabilityCatalog[capabilityId].backendWiring) {
        const hosts =
          wiring.hosts === 'selected-backend'
            ? selection.apps.filter((appId) => appCatalog[appId].platform === 'backend')
            : wiring.hosts.filter((appId) => selectedApps.has(appId));
        const moduleImports = [wiring, ...(wiring.additionalImports ?? [])];
        for (const appId of hosts) {
          const appModule = backendCapabilityModuleCatalog[appId];
          assert.ok(appModule, `${appId} must declare a generated capability module`);
          const sourceScope = readScope(appModule.path);
          const allowedScopes = scopeConstraints.get(sourceScope);
          assert.ok(allowedScopes, `${sourceScope} must declare an Nx scope constraint`);
          for (const moduleImport of moduleImports) {
            const aliasTarget = tsconfig.compilerOptions.paths[moduleImport.importPath]?.[0];
            assert.ok(aliasTarget, `${moduleImport.importPath} must be a public path alias`);
            const targetScope = readScope(aliasTarget);
            assert.ok(
              allowedScopes.includes(targetScope),
              `${appId} (${sourceScope}) cannot wire ${moduleImport.importPath} (${targetScope})`,
            );
          }
        }
      }
    }
  });
});

describe('catalog — validateSelection', () => {
  it('returns no issues for empty selection', () => {
    assert.deepEqual(validateSelection([], []), []);
  });

  it('returns no issues for valid minimal selection', () => {
    assert.deepEqual(validateSelection(['auth-app-api', 'user-app-api'], ['postgres']), []);
  });

  it('reports missing capability dependency', () => {
    const issues = validateSelection(['admin-app'], []);
    assert.ok(
      issues.some((i) => i.message.includes('authz')),
      `Got: ${issues.map((i) => i.message).join('; ')}`,
    );
  });

  it('reports missing app dependency', () => {
    const issues = validateSelection(['admin-app'], ['authz', 'postgres']);
    assert.ok(
      issues.some((i) => i.message.includes('admin-app-api')),
      `Got: ${issues.map((i) => i.message).join('; ')}`,
    );
  });

  it('reports capability dependencies for notifications without its queue and scheduler', () => {
    const issues = validateSelection([], ['notifications']);
    assert.ok(
      issues.some((i) => i.message.includes('postgres')) &&
        issues.some((i) => i.message.includes('notification-scheduler')),
      `Got: ${issues.map((i) => i.message).join('; ')}`,
    );
  });

  it('no issues when all deps satisfied', () => {
    assert.deepEqual(
      validateSelection(
        ['admin-app', 'admin-app-api', 'auth-app-api', 'notification-consumer', 'notification-scheduler'],
        ['authz', 'design-tokens', 'notifications', 'postgres', 's3'],
      ),
      [],
    );
  });

  it('has no issues when the complete Telegram auth and bot surface is selected', () => {
    assert.deepEqual(
      validateSelection(
        ['auth-app-api', 'telegram-bot-api', 'user-app', 'user-app-api'],
        ['i18n', 'postgres', 'telegram-bot'],
      ),
      [],
    );
  });
});

describe('catalog — expandDependencies', () => {
  it('returns sorted arrays', () => {
    const r = expandDependencies(['user-app-api', 'auth-app-api'], ['postgres']);
    assert.deepEqual(r.apps, [...r.apps].sort());
    assert.deepEqual(r.capabilities, [...r.capabilities].sort());
  });

  it('adds transitive app dependencies', () => {
    const { apps, capabilities } = expandDependencies(['admin-app'], []);
    assert.ok(apps.includes('admin-app'));
    assert.ok(apps.includes('admin-app-api'));
    assert.ok(apps.includes('notification-consumer'));
    assert.ok(apps.includes('notification-scheduler'));
    assert.ok(capabilities.includes('notifications'));
  });

  it('adds transitive capability dependencies', () => {
    const { capabilities } = expandDependencies([], ['notifications']);
    assert.ok(capabilities.includes('notifications'));
    assert.ok(capabilities.includes('postgres'));
    assert.ok(!capabilities.includes('telegram-bot'));
  });

  it('handles deep transitive chains', () => {
    const { capabilities } = expandDependencies(['admin-app'], []);
    assert.ok(capabilities.includes('authz'));
    assert.ok(!capabilities.includes('design-tokens'));
    assert.ok(capabilities.includes('postgres'));
  });

  it('is idempotent', () => {
    const first = expandDependencies(['admin-app'], []);
    const second = expandDependencies(first.apps, first.capabilities);
    assert.deepEqual(first, second);
  });

  it('returns empty for empty input', () => {
    const r = expandDependencies([], []);
    assert.deepEqual(r.apps, []);
    assert.deepEqual(r.capabilities, []);
  });
});

/* ==================================================================
 * UNIT: Presets
 * ================================================================== */
describe('presets — presets', () => {
  it('has exactly five presets', () => {
    assert.equal(presets.length, 5);
  });

  it('each preset has unique ID matching presetIds', () => {
    assert.deepEqual(
      presets.map((p) => p.id),
      presetIds,
    );
  });

  it('each preset has a non-empty description', () => {
    for (const p of presets) {
      assert.ok(p.description.length > 0, `${p.id}`);
    }
  });

  it('each preset lists only valid app IDs', () => {
    for (const p of presets) {
      for (const a of p.apps) {
        assert.ok(appIds.includes(a), `${p.id} -> ${a}`);
      }
    }
  });

  it('each preset lists only valid capability IDs', () => {
    for (const p of presets) {
      for (const c of p.capabilities) {
        assert.ok(capabilityIds.includes(c), `${p.id} -> ${c}`);
      }
    }
  });
});

describe('presets — lookup helpers', () => {
  it('findPreset returns correct preset', () => {
    for (const id of presetIds) {
      const f = findPreset(id);
      assert.ok(f, id);
      assert.equal(f.id, id);
    }
  });

  it('findPreset returns undefined for unknown', () => {
    assert.equal(findPreset('nonexistent'), undefined);
  });

  it('listPresetIds returns all IDs', () => {
    assert.deepEqual(listPresetIds(), presetIds);
  });

  it('listPresets returns all definitions', () => {
    assert.equal(listPresets().length, presetIds.length);
  });
});

describe('presets — expandPreset', () => {
  it('minimal: auth-app-api + user-app-api + postgres', () => {
    const e = expandPreset('minimal');
    assert.ok(e.apps.includes('auth-app-api'));
    assert.ok(e.apps.includes('user-app-api'));
    assert.ok(e.capabilities.includes('postgres'));
    assert.equal(e.apps.length, 2);
  });

  it('web: every core web app, API, and E2E project', () => {
    const e = expandPreset('web');
    for (const app of [
      'admin-app',
      'admin-app-api',
      'auth-app-api',
      'fullstack-e2e',
      'landing-app',
      'site-app',
      'user-app',
      'user-app-api',
    ] as const) {
      assert.ok(e.apps.includes(app), `web missing ${app}`);
    }
    assert.equal(e.apps.includes('mobile-app'), false);
  });

  it('fullstack: all core apps + capabilities', () => {
    const e = expandPreset('fullstack');
    for (const a of [
      'admin-app',
      'admin-app-api',
      'user-app',
      'user-app-api',
      'auth-app-api',
      'landing-app',
      'mobile-app',
      'site-app',
      'fullstack-e2e',
    ] as const) {
      assert.ok(e.apps.includes(a), `fullstack missing ${a}`);
    }
    for (const c of ['postgres', 'redis', 'authz', 'otel'] as const) {
      assert.ok(e.capabilities.includes(c), `fullstack missing ${c}`);
    }
  });

  it('enterprise: every supported app and capability', () => {
    const e = expandPreset('enterprise');
    for (const a of appIds) {
      assert.ok(e.apps.includes(a), `enterprise missing app: ${a}`);
    }
    for (const c of capabilityIds) {
      assert.ok(e.capabilities.includes(c), `enterprise missing cap: ${c}`);
    }
  });

  it('bots: telegram + discord apps and capabilities', () => {
    const e = expandPreset('bots');
    assert.ok(e.apps.includes('telegram-bot-api'));
    assert.ok(e.apps.includes('discord-app-api'));
    assert.ok(e.capabilities.includes('telegram-bot'));
    assert.ok(e.capabilities.includes('discord-bot'));
    assert.ok(e.capabilities.includes('redis'));
  });

  it('every preset expansion is deterministic (sorted)', () => {
    for (const id of presetIds) {
      const e = expandPreset(id);
      assert.deepEqual(e.apps, [...e.apps].sort());
      assert.deepEqual(e.capabilities, [...e.capabilities].sort());
    }
  });

  it('every preset expansion passes validateSelection', () => {
    for (const id of presetIds) {
      const e = expandPreset(id);
      const issues = validateSelection(e.apps, e.capabilities);
      assert.deepEqual(issues, [], `${id}: ${issues.map((i) => i.message).join('; ')}`);
    }
  });

  it('throws for unknown preset ID', () => {
    assert.throws(() => expandPreset('nonexistent' as any), /Unknown preset: nonexistent/);
  });
});

/* ==================================================================
 * COMPONENT: Schema → Catalog → Presets chain
 * ================================================================== */
describe('component — schema → preset → catalog', () => {
  it('parse config with preset → expand → validate', () => {
    const c = parseNrbConfig({ schemaVersion, preset: 'fullstack' });
    assert.ok(c.preset);
    const e = expandPreset(c.preset);
    assert.deepEqual(validateSelection(e.apps, e.capabilities), []);
  });

  it('parse config with explicit apps overriding preset → expand → validate', () => {
    const c = parseNrbConfig({
      schemaVersion,
      preset: 'minimal',
      apps: ['admin-app'],
      capabilities: ['postgres', 'authz', 'design-tokens'],
    });
    const e = expandDependencies(c.apps, c.capabilities);
    assert.deepEqual(validateSelection(e.apps, e.capabilities), []);
    assert.ok(e.apps.includes('admin-app'));
    assert.ok(e.apps.includes('admin-app-api'));
  });

  it('config with telegram-bot-api expansion', () => {
    const c = parseNrbConfig({
      schemaVersion,
      apps: ['telegram-bot-api'],
      capabilities: ['telegram-bot'],
    });
    const e = expandDependencies(c.apps, c.capabilities);
    assert.ok(e.apps.includes('telegram-bot-api'));
    assert.deepEqual(validateSelection(e.apps, e.capabilities), []);
  });

  it('round-trip: parse → preset expand → re-parse expanded config', () => {
    const c = parseNrbConfig({ schemaVersion, preset: 'bots' });
    const e = expandPreset(c.preset!);
    const c2 = parseNrbConfig({ schemaVersion, apps: e.apps, capabilities: e.capabilities });
    assert.deepEqual(c2.apps, e.apps);
    assert.deepEqual(c2.capabilities, e.capabilities);
  });
});

describe('component — preset monotonicity', () => {
  it('minimal < web < fullstack <= enterprise (app count)', () => {
    assert.ok(expandPreset('minimal').apps.length < expandPreset('web').apps.length);
    assert.ok(expandPreset('web').apps.length < expandPreset('fullstack').apps.length);
    assert.ok(expandPreset('fullstack').apps.length <= expandPreset('enterprise').apps.length);
  });

  it('enterprise has the most capabilities', () => {
    const ent = expandPreset('enterprise');
    for (const id of presetIds) {
      if (id === 'enterprise') {
        continue;
      }
      const o = expandPreset(id);
      assert.ok(o.capabilities.length <= ent.capabilities.length, `${id} >= enterprise`);
    }
  });
});

/* ==================================================================
 * E2E: Full flow — parse example JSON → expand → validate
 * ================================================================== */
describe('e2e — example config flow', () => {
  it('parses an explicit app selection and validates dependency expansion', () => {
    const raw = {
      schemaVersion: '1.0.0',
      apps: ['landing-app', 'user-app'],
      capabilities: ['otel', 'swagger'],
      options: { prune: false, force: false, dryRun: false, nonInteractive: false },
    };
    const c = parseNrbConfig(raw);
    assert.equal(c.schemaVersion, schemaVersion);
    assert.equal(c.preset, undefined);
    const e = expandDependencies(c.apps, c.capabilities);
    assert.deepEqual(validateSelection(e.apps, e.capabilities), []);
    const expectedApps = ['auth-app-api', 'landing-app', 'user-app', 'user-app-api'];
    assert.deepEqual(e.apps.sort(), expectedApps.sort());
    const expectedCaps = ['i18n', 'otel', 'postgres', 'swagger'];
    assert.deepEqual(e.capabilities.sort(), expectedCaps.sort());
  });

  it('full pipeline: raw string → JSON.parse → parse → expand → validate', () => {
    const raw = JSON.stringify({
      schemaVersion: '1.0.0',
      preset: 'bots',
      options: { nonInteractive: true, dryRun: true },
    });
    const c = parseNrbConfig(JSON.parse(raw));
    assert.equal(c.preset, 'bots');
    assert.equal(c.options.nonInteractive, true);
    const e = expandPreset(c.preset);
    assert.deepEqual(validateSelection(e.apps, e.capabilities), []);
    assert.ok(e.apps.includes('telegram-bot-api'));
    assert.ok(e.apps.includes('discord-app-api'));
  });

  it('error pipeline: malformed config → safeParse reports errors', () => {
    const r = safeParseNrbConfig({
      schemaVersion: '2.0.0',
      preset: 'invalid',
      apps: ['nonexistent'],
      capabilities: ['nonexistent'],
      options: { unknown: true },
    });
    assert.equal(r.success, false);
    assert.ok(r.error.issues.length >= 3);
  });

  it('all five presets independently valid end-to-end', () => {
    for (const pid of presetIds) {
      const c = parseNrbConfig({ schemaVersion, preset: pid });
      const e = expandPreset(c.preset!);
      assert.deepEqual(validateSelection(e.apps, e.capabilities), [], `${pid}`);
      const c2 = parseNrbConfig({ schemaVersion, apps: e.apps, capabilities: e.capabilities });
      assert.deepEqual(c2.apps, e.apps);
      assert.deepEqual(c2.capabilities, e.capabilities);
    }
  });
});

/* ==================================================================
 * E2E: Edge cases
 * ================================================================== */
describe('e2e — edge cases', () => {
  it('empty apps array is valid', () => {
    const c = parseNrbConfig({ schemaVersion, apps: [], capabilities: [] });
    assert.deepEqual(c.apps, []);
    assert.deepEqual(c.capabilities, []);
  });

  it('expandDependencies deduplicates via Set', () => {
    const r = expandDependencies(['user-app-api', 'user-app-api'], ['postgres', 'postgres']);
    assert.ok(!r.apps.includes('user-app-api') || r.apps.filter((a) => a === 'user-app-api').length === 1);
    assert.deepEqual(r.apps, [...new Set(r.apps)]);
    assert.deepEqual(r.capabilities, [...new Set(r.capabilities)]);
  });

  it('schema version constant matches expected', () => {
    assert.equal(schemaVersion, '1.0.0');
  });
});
