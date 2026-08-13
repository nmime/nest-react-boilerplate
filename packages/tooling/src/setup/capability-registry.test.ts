// @requirements REQ-SCAFFOLD-SELECTION-002
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  baseCapabilityCatalog,
  capabilityCatalog,
  expandDependencies,
  validateSelection,
  type CapabilityEntry,
} from './catalog.js';
import {
  baseCapabilityIds,
  capabilityIds,
  composeCapabilityCatalog,
  composeCapabilityIds,
} from './capability-registry.js';
import { productCapabilities } from './product-capabilities.js';
import { appIds, createNrbConfigSchema, schemaVersion, type AppId } from './schema.js';

function demoCapability(overrides: Partial<CapabilityEntry> = {}): CapabilityEntry {
  return {
    id: 'demo-capability',
    label: 'Demo Capability',
    activation: 'nest-module',
    requiresCapabilities: ['authz'],
    requiresApps: [],
    conflictsWith: [],
    ownedProjects: ['@product/demo-capability'],
    dockerServices: [],
    environmentVariables: ['DEMO_CAPABILITY_URL'],
    backendWiring: [
      {
        hosts: 'selected-backend',
        importName: 'DemoCapabilityModule',
        importPath: '@product/demo-capability',
        moduleExpression: 'DemoCapabilityModule.forRoot()',
      },
    ],
    ...overrides,
  };
}

describe('product capability seam', () => {
  it('ships no product capabilities, so the composed catalog is the base catalog', () => {
    // The seam is the file, not its contents. A boilerplate release that started shipping its own
    // entry here would silently claim an id a product may already have taken.
    assert.deepEqual(productCapabilities, []);
    assert.deepEqual(capabilityIds, [...baseCapabilityIds]);
    assert.deepEqual(capabilityCatalog, baseCapabilityCatalog);
  });

  it('admits a registered capability into the id set without touching the base tuple', () => {
    const composed = composeCapabilityIds(baseCapabilityIds, [demoCapability()]);

    assert.ok(composed.includes('demo-capability'));
    assert.deepEqual(
      composed.filter((id) => id !== 'demo-capability'),
      [...baseCapabilityIds],
    );
    assert.ok(!(baseCapabilityIds as readonly string[]).includes('demo-capability'));
  });

  it('parses a configuration that selects a registered capability and rejects an unregistered one', () => {
    const schema = createNrbConfigSchema(composeCapabilityIds(baseCapabilityIds, [demoCapability()]));

    assert.equal(schema.safeParse({ schemaVersion, capabilities: ['demo-capability'] }).success, true);
    assert.equal(schema.safeParse({ schemaVersion, capabilities: ['not-registered'] }).success, false);
  });

  it('resolves a registered capability through dependency expansion and validation', () => {
    const catalog = composeCapabilityCatalog(baseCapabilityCatalog, [demoCapability()], appIds);
    const expanded = expandDependencies([], ['demo-capability'], catalog);

    assert.ok(expanded.capabilities.includes('authz'), 'requiresCapabilities must expand transitively');
    assert.deepEqual(validateSelection(expanded.apps, expanded.capabilities, catalog), []);
  });

  it('carries a registered capability into the wiring the generators read', () => {
    const catalog = composeCapabilityCatalog(baseCapabilityCatalog, [demoCapability()], appIds);
    const entry = catalog['demo-capability'];

    assert.ok(entry);
    assert.deepEqual(entry.ownedProjects, ['@product/demo-capability']);
    assert.deepEqual(entry.environmentVariables, ['DEMO_CAPABILITY_URL']);
    assert.equal(entry.backendWiring[0]?.importPath, '@product/demo-capability');
  });

  it('rejects a capability that redefines one the boilerplate ships', () => {
    assert.throws(
      () => composeCapabilityCatalog(baseCapabilityCatalog, [demoCapability({ id: 'authz' })], appIds),
      /redefines capability "authz"/u,
    );
  });

  it('rejects an id that could not address a docker profile or an environment prefix', () => {
    assert.throws(
      () => composeCapabilityIds(baseCapabilityIds, [demoCapability({ id: 'Demo Capability' })]),
      /"Demo Capability"/u,
    );
  });

  it('rejects references to capabilities and apps that do not exist', () => {
    assert.throws(
      () =>
        composeCapabilityCatalog(baseCapabilityCatalog, [demoCapability({ requiresCapabilities: ['ledger'] })], appIds),
      /unknown capability "ledger"/u,
    );
    assert.throws(
      () => composeCapabilityCatalog(baseCapabilityCatalog, [demoCapability({ conflictsWith: ['ledger'] })], appIds),
      /unknown capability "ledger"/u,
    );
    assert.throws(
      () =>
        composeCapabilityCatalog(
          baseCapabilityCatalog,
          // The app axis stays closed, so TypeScript already rejects this in the seam file. The
          // runtime guard is what catches an entry that reached the registry from JSON or from a
          // product file compiled with a stale `AppId`.
          [demoCapability({ requiresApps: ['ledger-api' as AppId] })],
          appIds,
        ),
      /unknown app "ledger-api"/u,
    );
  });

  it('leaves the base catalog untouched when a registration fails', () => {
    // A half-applied registration would leave some capabilities resolvable and others not, which is
    // the failure mode the authz seam already refuses.
    const before = JSON.stringify(baseCapabilityCatalog);

    assert.throws(() =>
      composeCapabilityCatalog(
        baseCapabilityCatalog,
        [demoCapability(), demoCapability({ id: 'demo-other', requiresCapabilities: ['ledger'] })],
        appIds,
      ),
    );

    assert.equal(JSON.stringify(baseCapabilityCatalog), before);
    assert.equal(baseCapabilityCatalog['demo-capability' as keyof typeof baseCapabilityCatalog], undefined);
  });
});
