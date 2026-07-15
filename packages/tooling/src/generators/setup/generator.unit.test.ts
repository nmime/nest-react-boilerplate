/**
 * Tests for the setup generator.
 *
 * UNIT: schema validation, option translation
 * COMPONENT: generator + planner integration
 * E2E: full generator run on in-memory tree, dry-run, file output
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

async function createTree() {
  const { createTreeWithEmptyWorkspace } = await import('nx/src/devkit-testing-exports');
  return createTreeWithEmptyWorkspace();
}

describe('setup generator', () => {
  // -----------------------------------------------------------------------
  // UNIT: schema validation
  // -----------------------------------------------------------------------

  describe('schema validation', () => {
    it('parses minimal config', () => {
      const { parseNrbConfig, schemaVersion } = require('../../setup/schema.js');
      const config = parseNrbConfig({ schemaVersion });
      assert.deepEqual(config.apps, []);
      assert.deepEqual(config.capabilities, []);
    });

    it('rejects unknown top-level keys', () => {
      const { parseNrbConfig, schemaVersion } = require('../../setup/schema.js');
      assert.throws(() => {
        parseNrbConfig({ schemaVersion, unknownKey: true });
      });
    });

    it('rejects invalid preset', () => {
      const { parseNrbConfig, schemaVersion } = require('../../setup/schema.js');
      assert.throws(() => {
        parseNrbConfig({ schemaVersion, preset: 'invalid' });
      });
    });

    it('rejects unknown app IDs', () => {
      const { parseNrbConfig, schemaVersion } = require('../../setup/schema.js');
      assert.throws(() => {
        parseNrbConfig({ schemaVersion, apps: ['nonexistent'] });
      });
    });

    it('rejects unknown capability IDs', () => {
      const { parseNrbConfig, schemaVersion } = require('../../setup/schema.js');
      assert.throws(() => {
        parseNrbConfig({ schemaVersion, capabilities: ['nonexistent'] });
      });
    });

    it('accepts valid preset', () => {
      const { parseNrbConfig, schemaVersion } = require('../../setup/schema.js');
      const config = parseNrbConfig({ schemaVersion, preset: 'minimal' });
      assert.equal(config.preset, 'minimal');
    });

    it('accepts valid apps and capabilities', () => {
      const { parseNrbConfig, schemaVersion } = require('../../setup/schema.js');
      const config = parseNrbConfig({
        schemaVersion,
        apps: ['user-app-api'],
        capabilities: ['postgres'],
      });
      assert.deepEqual(config.apps, ['user-app-api']);
      assert.deepEqual(config.capabilities, ['postgres']);
    });
  });

  // -----------------------------------------------------------------------
  // COMPONENT: generator + planner
  // -----------------------------------------------------------------------

  describe('planner integration', () => {
    it('plans nrb.config.json and summary.md for minimal preset', async () => {
      const { plan } = await import('../../setup/planner.js');
      const { parseNrbConfig, schemaVersion } = await import('../../setup/schema.js');

      const config = parseNrbConfig({ schemaVersion, preset: 'minimal' });
      const result = plan(config);

      assert.ok(result.operations.length > 0);
      assert.ok(result.configHash.length > 0);
      assert.ok(result.summary.apps.length > 0);
      assert.ok(result.summary.capabilities.includes('postgres'));
    });

    it('empty config produces expected files', async () => {
      const { plan } = await import('../../setup/planner.js');
      const { parseNrbConfig, schemaVersion } = await import('../../setup/schema.js');

      const config = parseNrbConfig({ schemaVersion });
      const result = plan(config);

      const opPaths = result.operations.map((op) => op.path);
      assert.ok(opPaths.includes('nrb.config.json'));
      assert.ok(opPaths.includes('.nrb/summary.md'));
    });
  });

  // -----------------------------------------------------------------------
  // E2E: full generator run on in-memory tree
  // -----------------------------------------------------------------------

  describe('generator on tree', () => {
    it('generates nrb.config.json and .nrb/summary.md on tree', async () => {
      const tree = await createTree();
      const { setupGenerator } = await import('./generator.js');

      await setupGenerator(tree, {
        preset: 'minimal',
        dryRun: false,
      });

      assert.ok(tree.exists('nrb.config.json'));
      assert.ok(tree.exists('.nrb/summary.md'));

      const config = JSON.parse(tree.read('nrb.config.json', 'utf8')!);
      assert.equal(config.schemaVersion, '1.0.0');
      // With preset, the original config.apps is [] but the resolved apps include expanded ones
      assert.equal(config.preset, 'minimal');
    });

    it('dry-run does not write files', async () => {
      const tree = await createTree();
      const { setupGenerator } = await import('./generator.js');

      // Capture console.log
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      try {
        await setupGenerator(tree, {
          preset: 'minimal',
          dryRun: true,
        });

        // Dry run should not create files
        assert.ok(!tree.exists('nrb.config.json'));
        assert.ok(logs.some((l) => l.includes('DRY-RUN')));
      } finally {
        console.log = origLog;
      }
    });

    it('applies custom apps and capabilities', async () => {
      const tree = await createTree();
      const { setupGenerator } = await import('./generator.js');

      await setupGenerator(tree, {
        apps: ['user-app-api'],
        capabilities: ['postgres'],
      });

      const config = JSON.parse(tree.read('nrb.config.json', 'utf8')!);
      assert.ok(config.apps.includes('user-app-api'));
      assert.ok(config.capabilities.includes('postgres'));
    });

    it('adds to an existing selection when rerun', async () => {
      const tree = await createTree();
      const { setupGenerator } = await import('./generator.js');

      await setupGenerator(tree, { apps: ['landing-app'] });
      await setupGenerator(tree, { apps: ['user-app'] });

      const config = JSON.parse(tree.read('nrb.config.json', 'utf8')!);
      assert.deepEqual(config.apps, ['auth-app-api', 'landing-app', 'user-app', 'user-app-api']);
    });

    it('requires an explicit first selection', async () => {
      const tree = await createTree();
      const { setupGenerator } = await import('./generator.js');
      await assert.rejects(() => setupGenerator(tree, {}), /explicit preset or application selection/);
    });

    it('refuses a removal before the first selection exists', async () => {
      const tree = await createTree();
      const { setupGenerator } = await import('./generator.js');
      await assert.rejects(() => setupGenerator(tree, { removeApps: ['landing-app'] }), /Cannot remove selections/);
    });
  });
});
