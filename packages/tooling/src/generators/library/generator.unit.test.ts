// @requirements REQ-SCAFFOLD-GENERATORS-003
/**
 * Tests for the library generator.
 *
 * UNIT: name validation, kind validation, duplicate detection
 * COMPONENT: generator + tree integration (skeleton files per kind)
 * E2E: full backend/frontend/common library generation on in-memory tree
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

async function createTree() {
  const { createTreeWithEmptyWorkspace } = await import('nx/src/devkit-testing-exports');
  return createTreeWithEmptyWorkspace();
}

describe('library generator', () => {
  // -----------------------------------------------------------------------
  // UNIT: validation
  // -----------------------------------------------------------------------

  describe('name validation', () => {
    it('rejects empty name', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');
      await assert.rejects(() => libraryGenerator(tree, { name: '', kind: 'backend' }), /Name must not be empty/);
    });

    it('rejects invalid kind', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');
      await assert.rejects(
        // @ts-expect-error testing invalid kind
        () => libraryGenerator(tree, { name: 'my-lib', kind: 'mobile' }),
        /Unsupported library kind/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // COMPONENT: duplicate detection
  // -----------------------------------------------------------------------

  describe('duplicate detection', () => {
    it('rejects duplicate library name', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true });

      await assert.rejects(
        () => libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true }),
        /already exists/,
      );
    });

    it('rejects clone-style variants beside an existing library owner', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'money-utils', kind: 'common', skipFormat: true });

      for (const name of ['money-utils-new', 'money-utils-v2', 'money-utils-clone']) {
        await assert.rejects(
          () => libraryGenerator(tree, { name, kind: 'common', skipFormat: true }),
          /Modify the existing owner in place/,
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // E2E: backend library generation
  // -----------------------------------------------------------------------

  describe('backend library', () => {
    it('creates project.json with correct structure', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true });

      const projectJson = JSON.parse(tree.read('libs/backend/common/shared-utils/lib/project.json', 'utf8')!);
      assert.equal(projectJson.name, '@app/backend-shared-utils');
      assert.equal(projectJson.projectType, 'library');
      assert.ok(projectJson.tags.includes('platform:backend'));
      assert.ok(projectJson.tags.includes('type:common'));
      assert.ok(projectJson.targets.build);
      assert.equal(projectJson.targets.build.executor, '@nx/js:tsc');
    });

    it('creates tsconfig files', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('libs/backend/common/shared-utils/lib/tsconfig.json'));
      assert.ok(tree.exists('libs/backend/common/shared-utils/lib/tsconfig.lib.json'));
      assert.ok(tree.exists('libs/backend/common/shared-utils/lib/tsconfig.spec.json'));
    });

    it('creates source files', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('libs/backend/common/shared-utils/lib/src/index.ts'));
      assert.ok(tree.exists('libs/backend/common/shared-utils/lib/src/index.spec.ts'));

      const index = tree.read('libs/backend/common/shared-utils/lib/src/index.ts', 'utf8')!;
      assert.ok(index.includes('sharedUtilsVersion'));
    });

    it('creates vitest config', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('libs/backend/common/shared-utils/lib/vitest.config.mts'));
      const config = tree.read('libs/backend/common/shared-utils/lib/vitest.config.mts', 'utf8')!;
      assert.ok(config.includes('"coverage/libs/backend/common/shared-utils/lib"'));
      assert.equal(config.includes('../coverage/'), false);
    });

    it('keeps local docs focused on purpose, policy, and commands', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true });

      const root = 'libs/backend/common/shared-utils/lib';
      const readme = tree.read(`${root}/README.md`, 'utf8')!;
      const agentPolicy = tree.read(`${root}/AGENTS.md`, 'utf8')!;
      assert.doesNotMatch(readme, /^(?:Path|Nx project|Project type|Tags):/m);
      assert.doesNotMatch(readme, /^## Ownership$/m);
      assert.match(readme, /^## Purpose$/m);
      assert.match(readme, /owns the public common boundary/);
      assert.match(agentPolicy, /^## Local Rules$/m);
      assert.doesNotMatch(agentPolicy, /This is the local policy adapter|^Project type:|^Tags:/m);
      assert.doesNotMatch(agentPolicy, /Respect the declared scope tag:/);
    });

    it('rejects custom roots and tags that bypass ownership boundaries', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await assert.rejects(
        () =>
          libraryGenerator(tree, {
            name: 'shared-utils',
            kind: 'backend',
            directory: 'libs/custom/shared-utils',
            skipFormat: true,
          }),
        /Custom library directories are disabled/,
      );
      await assert.rejects(
        () =>
          libraryGenerator(tree, {
            name: 'shared-utils',
            kind: 'backend',
            tags: 'custom:lib,type:utility',
            skipFormat: true,
          }),
        /Custom library tags are disabled/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // E2E: frontend library generation
  // -----------------------------------------------------------------------

  describe('frontend library', () => {
    it('creates project.json with correct structure', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'ui-components', kind: 'frontend', type: 'ui', skipFormat: true });

      const projectJson = JSON.parse(tree.read('libs/frontend/ui-components/lib/project.json', 'utf8')!);
      assert.equal(projectJson.name, '@app/frontend-ui-components');
      assert.equal(projectJson.projectType, 'library');
      assert.ok(projectJson.tags.includes('platform:frontend'));

      // Frontend lib build must use nx:run-commands (tsc --noEmit), not @nx/vite:build
      assert.equal(projectJson.targets.build.executor, 'nx:run-commands');
      assert.ok(projectJson.targets.build.options.command.includes('tsc --noEmit'));
    });

    it('creates React component', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'ui-components', kind: 'frontend', type: 'ui', skipFormat: true });

      assert.ok(tree.exists('libs/frontend/ui-components/lib/src/ui-components.component.tsx'));
      const component = tree.read('libs/frontend/ui-components/lib/src/ui-components.component.tsx', 'utf8')!;
      assert.ok(component.includes('UiComponentsComponent'));
    });

    it('creates source files with index barrel', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'ui-components', kind: 'frontend', type: 'ui', skipFormat: true });

      const index = tree.read('libs/frontend/ui-components/lib/src/index.ts', 'utf8')!;
      // Template uses `export * from "./..."` barrel — verify it re-exports the component file.
      assert.ok(index.includes('ui-components.component'), `Expected barrel re-export; got: ${index}`);
    });
  });

  // -----------------------------------------------------------------------
  // E2E: common library generation
  // -----------------------------------------------------------------------

  describe('common library', () => {
    it('creates project.json with correct structure', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'config', kind: 'common', skipFormat: true });

      const projectJson = JSON.parse(tree.read('libs/common/config/lib/project.json', 'utf8')!);
      assert.equal(projectJson.name, '@app/common-config');
      assert.equal(projectJson.projectType, 'library');
      assert.ok(projectJson.tags.includes('platform:shared'));
    });

    it('creates source files', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'config', kind: 'common', skipFormat: true });

      assert.ok(tree.exists('libs/common/config/lib/src/index.ts'));
      assert.ok(tree.exists('libs/common/config/lib/src/index.spec.ts'));
    });
  });

  describe('semantic layouts and aliases', () => {
    it('uses a concrete public description and rejects vague provided descriptions', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, {
        name: 'money-format',
        kind: 'common',
        type: 'util',
        description: 'Normalizes monetary values and exposes formatting helpers to API and browser consumers.',
        skipFormat: true,
      });
      assert.match(
        tree.read('libs/common/money-format/lib/README.md', 'utf8')!,
        /Normalizes monetary values and exposes formatting helpers/,
      );
      await assert.rejects(
        () =>
          libraryGenerator(tree, {
            name: 'vague',
            kind: 'common',
            type: 'util',
            description: 'Utility library.',
            skipFormat: true,
          }),
        /single concrete sentence/,
      );
    });

    it('creates backend feature and data-access libraries in canonical roots', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, {
        name: 'billing-main',
        kind: 'backend',
        type: 'feature-main',
        scope: 'billing',
        skipFormat: true,
      });
      await libraryGenerator(tree, {
        name: 'billing-admin',
        kind: 'backend',
        type: 'feature-admin',
        scope: 'billing',
        description: 'Owns billing administration endpoints and privileged application orchestration.',
        skipFormat: true,
      });
      await libraryGenerator(tree, {
        name: 'billing-store',
        kind: 'backend',
        type: 'data-access',
        scope: 'billing',
        skipFormat: true,
      });
      await libraryGenerator(tree, {
        name: 'billing-shared',
        kind: 'frontend',
        type: 'feature-shared',
        scope: 'billing',
        description: 'Provides frontend-safe billing contracts to pages, features, and application shells.',
        skipFormat: true,
      });

      assert.ok(tree.exists('libs/backend/feature/billing/main/lib/project.json'));
      assert.ok(tree.exists('libs/backend/feature/billing/admin/lib/project.json'));
      assert.ok(tree.exists('libs/backend/postgres/main/billing/lib/project.json'));
      assert.ok(tree.exists('libs/frontend/feature/billing/shared/lib/project.json'));
      const tsconfig = JSON.parse(tree.read('tsconfig.base.json', 'utf8')!);
      assert.deepEqual(tsconfig.compilerOptions.paths['@app/backend-feature-billing-main'], [
        'libs/backend/feature/billing/main/lib/src/index.ts',
      ]);
      assert.deepEqual(tsconfig.compilerOptions.paths['@app/backend-feature-billing-admin'], [
        'libs/backend/feature/billing/admin/lib/src/index.ts',
      ]);
      assert.deepEqual(tsconfig.compilerOptions.paths['@app/backend-postgres-main-billing'], [
        'libs/backend/postgres/main/billing/lib/src/index.ts',
      ]);
      assert.deepEqual(tsconfig.compilerOptions.paths['@app/frontend-feature-billing-shared'], [
        'libs/frontend/feature/billing/shared/lib/src/index.ts',
      ]);
    });

    it('rejects platform-incompatible library roles', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');
      await assert.rejects(
        () => libraryGenerator(tree, { name: 'bad', kind: 'frontend', type: 'data-access' }),
        /backend-only/,
      );
      await assert.rejects(
        () => libraryGenerator(tree, { name: 'bad-admin', kind: 'frontend', type: 'feature-admin' }),
        /backend-only/,
      );
      await assert.rejects(
        () => libraryGenerator(tree, { name: 'bad-ui', kind: 'common', type: 'ui' }),
        /frontend or backend/,
      );
    });
  });
});
