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
  });

  // -----------------------------------------------------------------------
  // E2E: backend library generation
  // -----------------------------------------------------------------------

  describe('backend library', () => {
    it('creates project.json with correct structure', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true });

      const projectJson = JSON.parse(tree.read('libs/backend/shared-utils/lib/project.json', 'utf8')!);
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

      assert.ok(tree.exists('libs/backend/shared-utils/lib/tsconfig.json'));
      assert.ok(tree.exists('libs/backend/shared-utils/lib/tsconfig.lib.json'));
      assert.ok(tree.exists('libs/backend/shared-utils/lib/tsconfig.spec.json'));
    });

    it('creates source files', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('libs/backend/shared-utils/lib/src/index.ts'));
      assert.ok(tree.exists('libs/backend/shared-utils/lib/src/index.spec.ts'));

      const index = tree.read('libs/backend/shared-utils/lib/src/index.ts', 'utf8')!;
      assert.ok(index.includes('sharedUtilsVersion'));
    });

    it('creates vitest config', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'shared-utils', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('libs/backend/shared-utils/lib/vitest.config.mts'));
    });

    it('accepts custom tags', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, {
        name: 'shared-utils',
        kind: 'backend',
        tags: 'custom:lib,type:utility',
        skipFormat: true,
      });

      const projectJson = JSON.parse(tree.read('libs/backend/shared-utils/lib/project.json', 'utf8')!);
      assert.ok(projectJson.tags.includes('custom:lib'));
      assert.ok(projectJson.tags.includes('type:utility'));
    });
  });

  // -----------------------------------------------------------------------
  // E2E: frontend library generation
  // -----------------------------------------------------------------------

  describe('frontend library', () => {
    it('creates project.json with correct structure', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'ui-components', kind: 'frontend', skipFormat: true });

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

      await libraryGenerator(tree, { name: 'ui-components', kind: 'frontend', skipFormat: true });

      assert.ok(tree.exists('libs/frontend/ui-components/lib/src/ui-components.component.tsx'));
      const component = tree.read('libs/frontend/ui-components/lib/src/ui-components.component.tsx', 'utf8')!;
      assert.ok(component.includes('UiComponentsComponent'));
    });

    it('creates source files with index barrel', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'ui-components', kind: 'frontend', skipFormat: true });

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
      assert.ok(projectJson.tags.includes('platform:common'));
    });

    it('creates source files', async () => {
      const tree = await createTree();
      const { libraryGenerator } = await import('./generator.js');

      await libraryGenerator(tree, { name: 'config', kind: 'common', skipFormat: true });

      assert.ok(tree.exists('libs/common/config/lib/src/index.ts'));
      assert.ok(tree.exists('libs/common/config/lib/src/index.spec.ts'));
    });
  });
});
